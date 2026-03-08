import React, { useState } from 'react';
import { getMediaAssetTechnicalSummary } from '@mcua/core';
import { useEditorStore } from '../../store/editor.store';
import type { Bin, MediaAsset } from '../../store/editor.store';

function formatDuration(sec?: number): string {
  if (!sec) return '--:--';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function BinItem({ bin, depth = 0 }: { bin: Bin; depth?: number }) {
  const { selectedBinId, selectBin, toggleBin } = useEditorStore();
  const isSelected = selectedBinId === bin.id;
  const hasChildren = bin.children.length > 0;
  const assetCount = bin.assets.length + bin.children.reduce((n, c) => n + c.assets.length, 0);

  return (
    <>
      <div
        className={`bin-item${isSelected ? ' selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => selectBin(bin.id)}
        onDoubleClick={() => hasChildren && toggleBin(bin.id)}
      >
        <div className="bin-indent">
          {hasChildren ? (
            <div className={`bin-chevron${bin.isOpen ? ' open' : ''}`}
              onClick={e => { e.stopPropagation(); toggleBin(bin.id); }}>▶</div>
          ) : <div style={{ width: 14 }} />}
        </div>
        <div className="bin-dot" style={{ background: bin.color }} />
        <span className="bin-name">{bin.name}</span>
        <span className="bin-count">{assetCount}</span>
      </div>
      {bin.isOpen && bin.children.map(child => (
        <BinItem key={child.id} bin={child} depth={depth + 1} />
      ))}
    </>
  );
}

function AssetCard({ asset }: { asset: MediaAsset }) {
  const { appendAssetToTimeline, setSourceAsset, sourceAsset } = useEditorStore();
  const isSelected = sourceAsset?.id === asset.id;
  const typeClass = asset.type.toLowerCase();
  const technicalSummary = getMediaAssetTechnicalSummary(asset).slice(0, 2);

  const typeIcon: Record<string, string> = { VIDEO: '▶', AUDIO: '♪', IMAGE: '⬛', DOCUMENT: '📄' };

  return (
    <div
      className={`asset-card${isSelected ? ' selected' : ''}`}
      onClick={() => setSourceAsset(asset)}
      onDoubleClick={() => {
        setSourceAsset(asset);
        appendAssetToTimeline(asset.id);
      }}
    >
      <div className="asset-thumb">
        {asset.status === 'PROCESSING' ? (
          <div className="asset-status-processing">Processing…</div>
        ) : (
          <div className="asset-thumb-placeholder">{typeIcon[asset.type] ?? '📄'}</div>
        )}
        {asset.duration && <div className="asset-duration">{formatDuration(asset.duration)}</div>}
        <div className={`asset-type-badge ${typeClass}`}>{asset.type}</div>
        {asset.isFavorite && <div className="asset-fav">★</div>}
      </div>
      <div className="asset-name truncate">{asset.name}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
        {technicalSummary.map((item) => (
          <span key={item} className="badge badge-muted">{item}</span>
        ))}
        {asset.proxyMetadata?.status === 'READY' && <span className="badge badge-accent">Proxy</span>}
        {asset.indexStatus === 'MISSING' && <span className="badge badge-error">Missing</span>}
        {asset.waveformMetadata?.status === 'READY' && asset.type !== 'IMAGE' && asset.type !== 'DOCUMENT' && (
          <span className="badge badge-muted">Waveform</span>
        )}
        {asset.ingestMetadata?.storageMode && <span className="badge badge-muted">{asset.ingestMetadata.storageMode}</span>}
      </div>
    </div>
  );
}

type ViewMode = 'grid' | 'list';

export function BinPanel() {
  const { bins, activeBinAssets, appendAssetToTimeline, selectedBinId, projectId, importAssets, saveProject } = useEditorStore();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [tab, setTab] = useState<'bins' | 'search'>('bins');
  const [isImporting, setIsImporting] = useState(false);
  const selectedBinName = findBinName(bins, selectedBinId) ?? 'Media';
  const isDesktop = Boolean(window.electronAPI);

  const filtered = activeBinAssets.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
  );

  const handleImportMedia = async () => {
    if (!window.electronAPI || !projectId || isImporting) {
      return;
    }

    setIsImporting(true);

    try {
      const result = await window.electronAPI.openFile({
        title: `Import Media into ${selectedBinName}`,
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Media', extensions: ['mov', 'mp4', 'mxf', 'webm', 'avi', 'm4v', 'mkv', 'mpg', 'mpeg', 'mts', 'm2ts', 'r3d', 'braw', 'ari', 'wav', 'mp3', 'aif', 'aiff', 'aac', 'm4a', 'flac', 'ogg', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'tif', 'tiff', 'dng', 'bmp', 'pdf'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return;
      }

      const imported = await window.electronAPI.importMedia(projectId, result.filePaths);
      importAssets(imported, selectedBinId);
      await saveProject();
    } catch (error) {
      console.error('Failed to import media', error);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="bin-panel">
      {/* Header */}
      <div className="panel-header">
        <span className="panel-title">{selectedBinName}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          <button
            className="tl-btn"
            title={isDesktop ? 'Import Media' : 'Desktop import is available in the macOS and Windows apps'}
            style={{ fontSize: 12 }}
            onClick={() => { void handleImportMedia(); }}
            disabled={!isDesktop || !projectId || isImporting}
          >
            {isImporting ? '…' : '+'}
          </button>
          <button className="tl-btn" title="New Bin">📁</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="panel-tabs">
        {(['bins', 'search'] as const).map(t => (
          <button key={t} className={`panel-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="bin-search">
        <input
          type="text" placeholder="Search…" value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="bin-view-toggle" style={{ display: 'flex', gap: 2, padding: 0 }}>
          <button className={`view-btn${viewMode === 'grid' ? ' active' : ''}`}
            onClick={() => setViewMode('grid')} title="Grid view">▦</button>
          <button className={`view-btn${viewMode === 'list' ? ' active' : ''}`}
            onClick={() => setViewMode('list')} title="List view">☰</button>
        </div>
      </div>

      {/* Bin tree */}
      <div className="bin-tree" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {bins.map(bin => <BinItem key={bin.id} bin={bin} />)}
      </div>

      {/* Asset area */}
      <div className="panel-body">
        {filtered.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
            {search ? 'No matches' : 'No assets in this bin'}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="asset-grid">
            {filtered.map(asset => <AssetCard key={asset.id} asset={asset} />)}
          </div>
        ) : (
          <div style={{ padding: '4px 0' }}>
            {filtered.map((asset) => {
              const summary = getMediaAssetTechnicalSummary(asset).slice(0, 2).join(' · ');
              return (
              <div key={asset.id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border-subtle)', fontSize: 11 }}
                onClick={() => useEditorStore.getState().setSourceAsset(asset)}
                onDoubleClick={() => appendAssetToTimeline(asset.id)}
              >
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  {asset.type === 'VIDEO' ? '▶' : asset.type === 'AUDIO' ? '♪' : '⬛'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="truncate" style={{ color: 'var(--text-secondary)' }}>{asset.name}</div>
                  {(summary || asset.ingestMetadata?.storageMode || asset.proxyMetadata?.status === 'READY') && (
                    <div className="truncate" style={{ color: 'var(--text-muted)', fontSize: 9.5 }}>
                      {[summary, asset.ingestMetadata?.storageMode, asset.proxyMetadata?.status === 'READY' ? 'Proxy ready' : '', asset.indexStatus === 'MISSING' ? 'Missing media' : ''].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-muted)' }}>
                  {formatDuration(asset.duration)}
                </span>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px',
        background: 'var(--bg-void)', borderTop: '1px solid var(--border-subtle)',
        fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        <span>{filtered.length} items</span>
        <span>Double-click to add to the timeline</span>
        <span style={{ marginLeft: 'auto' }}>{activeBinAssets.filter(a => a.status === 'PROCESSING').length > 0 ? '⟳ Processing…' : '✓ Ready'}</span>
      </div>
    </div>
  );
}

function findBinName(bins: Bin[], id: string | null): string | null {
  if (!id) {
    return null;
  }

  for (const bin of bins) {
    if (bin.id === id) {
      return bin.name;
    }

    const nested = findBinName(bin.children, id);
    if (nested) {
      return nested;
    }
  }

  return null;
}
