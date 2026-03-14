import React, { useState, memo, useCallback } from 'react';
import { useEditorStore } from '../../store/editor.store';
import type { Bin, MediaAsset, SmartBin } from '../../store/editor.store';
import { extractDesktopDroppedPaths } from '../../lib/desktopDropPaths';

function formatDuration(sec?: number): string {
  if (!sec) return '--:--';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(d?: Date | string): string {
  const date = d ? new Date(d) : new Date();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getAssetPreviewUrl(asset: MediaAsset): string | undefined {
  return asset.thumbnailUrl ?? asset.thumbnailFrames?.[0]?.imageUrl;
}

function AssetPreview({ asset, className }: { asset: MediaAsset; className?: string }) {
  const previewUrl = getAssetPreviewUrl(asset);
  const typeIcon: Record<string, string> = {
    VIDEO: '▶',
    AUDIO: '♪',
    IMAGE: '⬛',
    GRAPHIC: '◫',
    DOCUMENT: '📄',
  };

  return previewUrl ? (
    <img className={className} src={previewUrl} alt="" loading="lazy" />
  ) : (
    <div className={`asset-thumb-placeholder${className ? ` ${className}` : ''}`}>{typeIcon[asset.type] ?? '📄'}</div>
  );
}

interface BinItemProps {
  bin: Bin;
  depth?: number;
}

const BinItem = memo(function BinItem({ bin, depth = 0 }: BinItemProps) {
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
        role="treeitem"
        aria-label={`${bin.name} (${assetCount} items)`}
        aria-selected={isSelected}
        aria-expanded={hasChildren ? bin.isOpen : undefined}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') selectBin(bin.id);
          if (e.key === 'ArrowRight' && hasChildren && !bin.isOpen) toggleBin(bin.id);
          if (e.key === 'ArrowLeft' && hasChildren && bin.isOpen) toggleBin(bin.id);
        }}
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
});

interface AssetCardProps {
  asset: MediaAsset;
}

const AssetCard = memo(function AssetCard({ asset }: AssetCardProps) {
  const { setSourceAsset, sourceAsset } = useEditorStore();
  const isSelected = sourceAsset?.id === asset.id;

  return (
    <div
      className={`asset-card${isSelected ? ' selected' : ''}`}
      onClick={() => setSourceAsset(asset)}
      onDoubleClick={() => setSourceAsset(asset)}
      role="option"
      aria-selected={isSelected}
      aria-label={`${asset.name} (${asset.type}${asset.duration ? `, ${formatDuration(asset.duration)}` : ''})`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') setSourceAsset(asset);
      }}
    >
      <div className="asset-thumb">
        {asset.status === 'PROCESSING' ? (
          <div className="asset-status-processing">Processing…</div>
        ) : (
          <AssetPreview asset={asset} className="asset-thumb-media" />
        )}
        {asset.duration && <div className="asset-duration">{formatDuration(asset.duration)}</div>}
        <div className={`asset-type-badge ${asset.type.toLowerCase()}`}>{asset.type}</div>
        {asset.isFavorite && <div className="asset-fav">★</div>}
      </div>
      <div className="asset-name truncate" title={asset.name}>{asset.name}</div>
    </div>
  );
});

function formatResolution(w?: number, h?: number): string {
  if (!w || !h) return '--';
  if (w === 3840 && h === 2160) return '4K UHD';
  if (w === 1920 && h === 1080) return 'HD 1080';
  if (w === 1280 && h === 720) return 'HD 720';
  if (w === 4096 && h === 2160) return '4K DCI';
  return `${w}x${h}`;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '--';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/** Resolve-style column list view with metadata columns */
function AssetListView({ assets }: { assets: MediaAsset[] }) {
  const { setSourceAsset, sourceAsset, ingestProgress } = useEditorStore();

  return (
    <div className="bin-list-view">
      {/* Column headers */}
      <div className="bin-list-header">
        <span className="bin-col-color"></span>
        <span className="bin-col-preview">Preview</span>
        <span className="bin-col-name">Name</span>
        <span className="bin-col-duration">Duration</span>
        <span className="bin-col-fps">FPS</span>
        <span className="bin-col-res">Resolution</span>
        <span className="bin-col-codec">Codec</span>
        <span className="bin-col-cs">Color</span>
        <span className="bin-col-size">Size</span>
      </div>
      {/* Rows */}
      {assets.map(asset => {
        const progress = ingestProgress[asset.id];
        const isIngesting = progress !== undefined;
        return (
          <div
            key={asset.id}
            className={`bin-list-row${sourceAsset?.id === asset.id ? ' selected' : ''}${isIngesting ? ' ingesting' : ''}`}
            onClick={() => setSourceAsset(asset)}
            onDoubleClick={() => setSourceAsset(asset)}
            style={{ position: 'relative' }}
          >
            {isIngesting && (
              <div style={{
                position: 'absolute', left: 0, bottom: 0, height: 2,
                width: `${(progress * 100).toFixed(0)}%`,
                background: 'var(--brand)', borderRadius: 1, transition: 'width 0.2s',
              }} />
            )}
            <span className="bin-col-color">
              <span className="bin-list-color-dot" style={{
                background: asset.type === 'VIDEO' ? 'var(--track-video)' :
                  asset.type === 'AUDIO' ? 'var(--track-audio)' :
                  asset.type === 'IMAGE' ? 'var(--track-effect)' :
                  asset.type === 'GRAPHIC' ? 'var(--track-gfx)' : 'var(--text-muted)',
              }} />
            </span>
            <span className="bin-col-preview">
              <span className="bin-preview">
                <AssetPreview asset={asset} className="bin-preview-image" />
              </span>
            </span>
            <span className="bin-col-name truncate" title={asset.name}>
              {asset.hasAlpha && <span title="Has alpha channel" style={{ color: 'var(--warning)', marginRight: 3 }}>A</span>}
              {asset.name}
            </span>
            <span className="bin-col-duration">{formatDuration(asset.duration)}</span>
            <span className="bin-col-fps">{asset.fps ? asset.fps.toFixed(asset.fps % 1 ? 3 : 0) : '--'}</span>
            <span className="bin-col-res">{formatResolution(asset.width, asset.height)}</span>
            <span className="bin-col-codec" title={asset.codec}>{asset.codec ?? '--'}</span>
            <span className="bin-col-cs" title={asset.colorSpace}>{asset.colorSpace ?? '--'}</span>
            <span className="bin-col-size">{formatFileSize(asset.fileSize)}</span>
          </div>
        );
      })}
    </div>
  );
}

type ViewMode = 'grid' | 'list';

/* ─── Effects library data ─────────────────────────────────────────────── */
interface EffectEntry { id: string; name: string; category: string; }

const EFFECTS_LIBRARY: { category: string; effects: EffectEntry[] }[] = [
  {
    category: 'Video Effects',
    effects: [
      { id: 'fx-cc', name: 'Color Correction', category: 'Video Effects' },
      { id: 'fx-lut', name: 'LUT Loader', category: 'Video Effects' },
      { id: 'fx-stab', name: 'Stabilizer', category: 'Video Effects' },
      { id: 'fx-blur', name: 'Gaussian Blur', category: 'Video Effects' },
      { id: 'fx-sharp', name: 'Unsharp Mask', category: 'Video Effects' },
      { id: 'fx-chroma', name: 'Chroma Key', category: 'Video Effects' },
      { id: 'fx-luma', name: 'Luma Key', category: 'Video Effects' },
      { id: 'fx-resize', name: 'Resize', category: 'Video Effects' },
      { id: 'fx-denoise', name: 'Noise Reduction', category: 'Video Effects' },
    ],
  },
  {
    category: 'Audio Effects',
    effects: [
      { id: 'fx-eq', name: 'Parametric EQ', category: 'Audio Effects' },
      { id: 'fx-comp', name: 'Compressor', category: 'Audio Effects' },
      { id: 'fx-limiter', name: 'Limiter', category: 'Audio Effects' },
      { id: 'fx-reverb', name: 'Reverb', category: 'Audio Effects' },
      { id: 'fx-denoise-a', name: 'Noise Reduction', category: 'Audio Effects' },
      { id: 'fx-304c', name: '304C', category: 'Audio Effects' },
      { id: 'fx-sp76', name: 'SP 76', category: 'Audio Effects' },
      { id: 'fx-dyns', name: 'DynS Compressor/Limiter', category: 'Audio Effects' },
    ],
  },
  {
    category: 'Transitions',
    effects: [
      { id: 'fx-dissolve', name: 'Dissolve', category: 'Transitions' },
      { id: 'fx-dip-black', name: 'Dip to Black', category: 'Transitions' },
      { id: 'fx-dip-white', name: 'Dip to White', category: 'Transitions' },
      { id: 'fx-wipe', name: 'Wipe', category: 'Transitions' },
      { id: 'fx-push', name: 'Push', category: 'Transitions' },
      { id: 'fx-slide', name: 'Slide', category: 'Transitions' },
    ],
  },
];

function EffectsBrowser({ search }: { search: string }) {
  const lowerSearch = search.toLowerCase();
  const [appliedFx, setAppliedFx] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, fx: EffectEntry) => {
    e.dataTransfer.setData('application/x-effect', JSON.stringify(fx));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleApplyEffect = (fx: EffectEntry) => {
    setAppliedFx(fx.id);
    setTimeout(() => setAppliedFx(null), 1200);
  };

  return (
    <div className="panel-body">
      {EFFECTS_LIBRARY.map(cat => {
        const filtered = cat.effects.filter(fx =>
          !lowerSearch || fx.name.toLowerCase().includes(lowerSearch) || fx.category.toLowerCase().includes(lowerSearch)
        );
        if (filtered.length === 0) return null;

        return (
          <div key={cat.category} className="fx-browser-category">
            <div className="fx-browser-category-title">{cat.category}</div>
            {filtered.map(fx => (
              <div
                key={fx.id}
                className={`fx-browser-item${appliedFx === fx.id ? ' applied' : ''}`}
                draggable
                title={`Drag to timeline or double-click to apply\n${fx.name}`}
                onDragStart={e => handleDragStart(e, fx)}
                onDoubleClick={() => handleApplyEffect(fx)}
              >
                <span className="fx-browser-icon">
                  {cat.category === 'Video Effects' ? '◈' : cat.category === 'Audio Effects' ? '♪' : '⇄'}
                </span>
                <span className="fx-browser-name">{fx.name}</span>
                {appliedFx === fx.id && <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--success)' }}>✓ Applied</span>}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Smart Bin item ──────────────────────────────────────────────────── */

function SmartBinItem({ smartBin }: { smartBin: SmartBin }) {
  const { selectedSmartBinId, selectSmartBin, removeSmartBin } = useEditorStore();
  const isSelected = selectedSmartBinId === smartBin.id;
  const assetCount = useEditorStore.getState().getSmartBinAssets(smartBin.id).length;

  return (
    <div
      className={`bin-item smart-bin-item${isSelected ? ' selected' : ''}`}
      style={{ paddingLeft: 8 }}
      onClick={() => selectSmartBin(smartBin.id)}
    >
      <div className="bin-indent">
        <span style={{ fontSize: 10, opacity: 0.6 }}>✦</span>
      </div>
      <div className="bin-dot" style={{ background: smartBin.color }} />
      <span className="bin-name">{smartBin.name}</span>
      <span className="bin-count">{assetCount}</span>
      <button
        className="smart-bin-remove"
        onClick={e => { e.stopPropagation(); removeSmartBin(smartBin.id); }}
        title="Remove Smart Bin"
      >✕</button>
    </div>
  );
}

/* ─── Main BinPanel ───────────────────────────────────────────────────── */

export function BinPanel() {
  const {
    bins,
    activeBinAssets,
    toolbarTab,
    addBin,
    selectedBinId,
    smartBins,
    importMediaFiles,
    ingestProgress,
    projectId,
    loadProject,
  } = useEditorStore();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [tab, setTab] = useState<'bins' | 'smart' | 'search'>('bins');
  const [showNewBinInput, setShowNewBinInput] = useState(false);
  const [newBinName, setNewBinName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const isEffectsMode = toolbarTab === 'effects';
  const ingestCount = Object.keys(ingestProgress).length;

  const filtered = activeBinAssets.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.tags.some(t => t.includes(search.toLowerCase()))
  );

  // Drag-drop handlers for native file import
  const handleDragOver = (e: React.DragEvent) => {
    if (isEffectsMode) return;
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  };
  const handleDragLeave = (e: React.DragEvent) => {
    // Only if leaving the panel entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!e.dataTransfer.files?.length) {
      return;
    }

    const droppedFiles = e.dataTransfer.files;
    const desktopPaths = extractDesktopDroppedPaths(Array.from(droppedFiles));

    if (window.electronAPI && projectId && desktopPaths.length > 0) {
      try {
        await window.electronAPI.importMedia(projectId, desktopPaths, selectedBinId ?? undefined);
        await loadProject(projectId);
        return;
      } catch (error) {
        console.error('Desktop drag-and-drop ingest failed', error);
      }
    }

    importMediaFiles(droppedFiles, selectedBinId ?? undefined);
  };

  const openBrowserFilePicker = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'video/*,audio/*,image/*,.svg,.exr,.dpx,.tga,.psd,.mxf,.avi,.mkv';
    input.onchange = () => {
      if (input.files?.length) {
        importMediaFiles(input.files, selectedBinId ?? undefined);
      }
    };
    input.click();
  }, [importMediaFiles, selectedBinId]);

  const handleImportMediaClick = useCallback(async () => {
    if (!window.electronAPI || !projectId) {
      openBrowserFilePicker();
      return;
    }

    try {
      const result = await window.electronAPI.openFile({
        title: 'Import Media',
        buttonLabel: 'Import',
        properties: ['openFile', 'openDirectory', 'multiSelections'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return;
      }

      await window.electronAPI.importMedia(projectId, result.filePaths, selectedBinId ?? undefined);
      await loadProject(projectId);
    } catch (error) {
      console.error('Desktop file-picker ingest failed', error);
      openBrowserFilePicker();
    }
  }, [loadProject, openBrowserFilePicker, projectId, selectedBinId]);

  return (
    <div
      className="bin-panel"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="region"
      aria-label={isEffectsMode ? 'Effects Browser' : 'Media Browser'}
    >
      {/* Drop zone overlay */}
      {isDragOver && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'rgba(109,76,250,0.15)', border: '2px dashed var(--brand)',
          borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{ color: 'var(--brand-bright)', fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
            Drop media files{window.electronAPI ? ' or folders' : ''} to import<br />
            <span style={{ fontSize: 11, opacity: 0.7 }}>Video, Audio, Images, Graphics</span>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="panel-header">
        <span className="panel-title">{isEffectsMode ? 'Effects' : 'Media'}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          {!isEffectsMode && (
            <>
              <button className="tl-btn" title="Import Media" style={{ fontSize: 12 }}
                onClick={() => {
                  void handleImportMediaClick();
                }}>+</button>
              <button className="tl-btn" title="New Bin"
                onClick={() => setShowNewBinInput(true)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* New bin input */}
      {showNewBinInput && (
        <div style={{ display: 'flex', gap: 4, padding: '4px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
          <input type="text" placeholder="Bin name…" value={newBinName}
            onChange={e => setNewBinName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newBinName.trim()) {
                addBin(newBinName.trim(), selectedBinId ?? undefined);
                setNewBinName('');
                setShowNewBinInput(false);
              }
              if (e.key === 'Escape') { setShowNewBinInput(false); setNewBinName(''); }
            }}
            autoFocus
            style={{ flex: 1, background: 'var(--bg-void)', border: '1px solid var(--border)', borderRadius: 4,
              color: 'var(--text-primary)', fontSize: 11, padding: '3px 6px', outline: 'none' }} />
          <button className="tl-btn" style={{ fontSize: 10 }}
            onClick={() => {
              if (newBinName.trim()) {
                addBin(newBinName.trim(), selectedBinId ?? undefined);
                setNewBinName('');
                setShowNewBinInput(false);
              }
            }}>Create</button>
          <button className="tl-btn" style={{ fontSize: 10 }}
            onClick={() => { setShowNewBinInput(false); setNewBinName(''); }}>✕</button>
        </div>
      )}

      {/* Tabs — only show for Media mode */}
      {!isEffectsMode && (
        <div className="panel-tabs">
          {(['bins', 'smart', 'search'] as const).map(t => {
            const label = t === 'bins' ? 'Bins' : t === 'smart' ? 'Smart' : 'Search';
            return (
              <button key={t} className={`panel-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                {t === 'smart' ? `✦ ${label}` : label}
              </button>
            );
          })}
        </div>
      )}

      {/* Search */}
      <div className="bin-search">
        <input
          type="text" placeholder={isEffectsMode ? 'Search effects…' : 'Search…'} value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {!isEffectsMode && (
          <div className="bin-view-toggle" style={{ display: 'flex', gap: 2, padding: 0 }}>
            <button className={`view-btn${viewMode === 'grid' ? ' active' : ''}`}
              onClick={() => setViewMode('grid')} title="Grid view">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>
            <button className={`view-btn${viewMode === 'list' ? ' active' : ''}`}
              onClick={() => setViewMode('list')} title="List view">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {isEffectsMode ? (
        /* ── Effects browser mode ── */
        <EffectsBrowser search={search} />
      ) : (
        /* ── Media browser mode ── */
        <>
          {/* Bin tree — normal or smart bins */}
          <div className="bin-tree" style={{ borderBottom: '1px solid var(--border-subtle)' }} role="tree" aria-label="Media bins">
            {tab === 'smart' ? (
              smartBins.length > 0 ? (
                smartBins.map(sb => <SmartBinItem key={sb.id} smartBin={sb} />)
              ) : (
                <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                  No smart bins. Smart bins auto-populate based on rules.
                </div>
              )
            ) : (
              bins.map(bin => <BinItem key={bin.id} bin={bin} />)
            )}
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
              <AssetListView assets={filtered} />
            )}
          </div>
        </>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px',
        background: 'var(--bg-void)', borderTop: '1px solid var(--border-subtle)',
        fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        {isEffectsMode ? (
          <span>{EFFECTS_LIBRARY.reduce((n, c) => n + c.effects.length, 0)} effects available</span>
        ) : (
          <>
            <span>{filtered.length} items</span>
            <span style={{ marginLeft: 'auto' }}>
              {ingestCount > 0
                ? `⟳ Ingesting ${ingestCount} file${ingestCount > 1 ? 's' : ''}…`
                : activeBinAssets.filter(a => a.status === 'PROCESSING').length > 0
                  ? '⟳ Processing…'
                  : '✓ Ready'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
