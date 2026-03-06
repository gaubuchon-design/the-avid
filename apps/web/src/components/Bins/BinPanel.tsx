import React, { useState } from 'react';
import { useEditorStore } from '../../store/editor.store';
import type { Bin, MediaAsset } from '../../store/editor.store';

function formatDuration(sec?: number): string {
  if (!sec) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function AssetTypeIcon({ type }: { type: MediaAsset['type'] }) {
  const icons = { VIDEO: '▶', AUDIO: '♪', IMAGE: '⬛', DOCUMENT: '📄' };
  return <span>{icons[type] ?? '📄'}</span>;
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
        style={{ paddingLeft: 10 + depth * 16 }}
        onClick={() => { selectBin(bin.id); }}
        onDoubleClick={() => { if (hasChildren) toggleBin(bin.id); }}
      >
        <div className="bin-indent">
          {hasChildren ? (
            <div
              className={`bin-chevron${bin.isOpen ? ' open' : ''}`}
              onClick={(e) => { e.stopPropagation(); toggleBin(bin.id); }}
            >
              ▶
            </div>
          ) : (
            <div style={{ width: 14 }} />
          )}
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
  const { setSourceAsset, sourceAsset } = useEditorStore();
  const isSelected = sourceAsset?.id === asset.id;
  const typeClass = asset.type.toLowerCase();

  return (
    <div
      className={`asset-card${isSelected ? ' selected' : ''}`}
      onDoubleClick={() => setSourceAsset(asset)}
      onClick={() => setSourceAsset(asset)}
    >
      <div className="asset-thumb">
        <div className="asset-thumb-placeholder">
          <AssetTypeIcon type={asset.type} />
        </div>
        {asset.duration && (
          <div className="asset-duration">{formatDuration(asset.duration)}</div>
        )}
        <div className={`asset-type-badge ${typeClass}`}>{asset.type}</div>
        {asset.isFavorite && (
          <div style={{
            position: 'absolute', top: 3, right: 4,
            fontSize: 9, color: '#fbbf24'
          }}>★</div>
        )}
      </div>
      <div className="asset-meta">
        <div className="asset-name">{asset.name}</div>
        <div className="asset-info">
          {asset.duration ? formatDuration(asset.duration) : asset.type}
          {asset.tags[0] ? ` · ${asset.tags[0]}` : ''}
        </div>
      </div>
    </div>
  );
}

function AssetList({ assets }: { assets: MediaAsset[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '4px 0' }}>
      {assets.map(a => (
        <div
          key={a.id}
          className="bin-item"
          style={{ paddingLeft: 10 }}
        >
          <AssetTypeIcon type={a.type} />
          <span className="bin-name" style={{ color: 'var(--text-primary)', fontSize: 11 }}>
            {a.name}
          </span>
          <span className="bin-count">{formatDuration(a.duration)}</span>
        </div>
      ))}
    </div>
  );
}

export function BinPanel() {
  const { bins, activeBinAssets } = useEditorStore();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const filteredAssets = search
    ? activeBinAssets.filter(a =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
      )
    : activeBinAssets;

  return (
    <div className="bin-panel">
      {/* Header */}
      <div className="panel-header">
        <span className="panel-title">Media Bins</span>
        <div className="panel-actions">
          <button
            className="panel-action-btn"
            title="Grid view"
            onClick={() => setViewMode('grid')}
            style={{ color: viewMode === 'grid' ? 'var(--accent)' : undefined }}
          >
            ⊞
          </button>
          <button
            className="panel-action-btn"
            title="List view"
            onClick={() => setViewMode('list')}
            style={{ color: viewMode === 'list' ? 'var(--accent)' : undefined }}
          >
            ☰
          </button>
          <button className="panel-action-btn" title="New bin">+</button>
          <button className="panel-action-btn" title="Import media">⬆</button>
        </div>
      </div>

      {/* Search */}
      <div className="bin-search">
        <input
          type="text"
          placeholder="🔍  Search media, transcripts…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Bin tree */}
      <div className="bin-tree" style={{ maxHeight: 200, borderBottom: '1px solid var(--border)' }}>
        {bins.map(bin => <BinItem key={bin.id} bin={bin} />)}
      </div>

      {/* Assets */}
      <div className="bin-assets">
        {filteredAssets.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
            {search ? 'No results' : 'Select a bin to browse media'}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="asset-grid">
            {filteredAssets.map(a => <AssetCard key={a.id} asset={a} />)}
          </div>
        ) : (
          <AssetList assets={filteredAssets} />
        )}
      </div>

      {/* Footer stats */}
      <div style={{
        padding: '5px 10px', borderTop: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between',
        fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
      }}>
        <span>{filteredAssets.length} items</span>
        <span style={{ color: 'var(--success)' }}>●  NEXIS</span>
      </div>
    </div>
  );
}
