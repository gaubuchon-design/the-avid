import React, { useState } from 'react';
import { useEditorStore } from '../../store/editor.store';
import type { Bin, MediaAsset, SmartBin } from '../../store/editor.store';

function formatDuration(sec?: number): string {
  if (!sec) return '--:--';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(d?: Date | string): string {
  const date = d ? new Date(d) : new Date();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
  const { setSourceAsset, sourceAsset } = useEditorStore();
  const isSelected = sourceAsset?.id === asset.id;

  const typeIcon: Record<string, string> = { VIDEO: '▶', AUDIO: '♪', IMAGE: '⬛', DOCUMENT: '📄' };

  return (
    <div
      className={`asset-card${isSelected ? ' selected' : ''}`}
      onClick={() => setSourceAsset(asset)}
      onDoubleClick={() => setSourceAsset(asset)}
    >
      <div className="asset-thumb">
        {asset.status === 'PROCESSING' ? (
          <div className="asset-status-processing">Processing…</div>
        ) : (
          <div className="asset-thumb-placeholder">{typeIcon[asset.type] ?? '📄'}</div>
        )}
        {asset.duration && <div className="asset-duration">{formatDuration(asset.duration)}</div>}
        <div className={`asset-type-badge ${asset.type.toLowerCase()}`}>{asset.type}</div>
        {asset.isFavorite && <div className="asset-fav">★</div>}
      </div>
      <div className="asset-name truncate" title={asset.name}>{asset.name}</div>
    </div>
  );
}

/** Figma-style column list view with Color | Name | Date | Duration */
function AssetListView({ assets }: { assets: MediaAsset[] }) {
  const { setSourceAsset, sourceAsset } = useEditorStore();

  return (
    <div className="bin-list-view">
      {/* Column headers */}
      <div className="bin-list-header">
        <span className="bin-col-color"></span>
        <span className="bin-col-name">Name</span>
        <span className="bin-col-date">Creation Date</span>
        <span className="bin-col-duration">Duration</span>
      </div>
      {/* Rows */}
      {assets.map(asset => (
        <div
          key={asset.id}
          className={`bin-list-row${sourceAsset?.id === asset.id ? ' selected' : ''}`}
          onClick={() => setSourceAsset(asset)}
          onDoubleClick={() => setSourceAsset(asset)}
        >
          <span className="bin-col-color">
            <span className="bin-list-color-dot" style={{
              background: asset.type === 'VIDEO' ? 'var(--track-video)' :
                asset.type === 'AUDIO' ? 'var(--track-audio)' : 'var(--track-effect)',
            }} />
          </span>
          <span className="bin-col-name truncate" title={asset.name}>{asset.name}</span>
          <span className="bin-col-date">{formatDate()}</span>
          <span className="bin-col-duration">{formatDuration(asset.duration)}</span>
        </div>
      ))}
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
  const { bins, activeBinAssets, toolbarTab, addBin, selectedBinId, smartBins, importMediaFiles } = useEditorStore();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [tab, setTab] = useState<'bins' | 'smart' | 'search'>('bins');
  const [showNewBinInput, setShowNewBinInput] = useState(false);
  const [newBinName, setNewBinName] = useState('');

  const isEffectsMode = toolbarTab === 'effects';

  const filtered = activeBinAssets.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.tags.some(t => t.includes(search.toLowerCase()))
  );

  return (
    <div className="bin-panel">
      {/* Header */}
      <div className="panel-header">
        <span className="panel-title">{isEffectsMode ? 'Effects' : 'Media'}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          {!isEffectsMode && (
            <>
              <button className="tl-btn" title="Import Media" style={{ fontSize: 12 }}
                onClick={() => {
                  // Trigger native file picker (mock — in production connects to media ingest pipeline)
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.multiple = true;
                  input.accept = 'video/*,audio/*,image/*';
                  input.onchange = () => {
                    if (input.files?.length) {
                      importMediaFiles(input.files, selectedBinId ?? undefined);
                    }
                  };
                  input.click();
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
          <div className="bin-tree" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
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
            <span style={{ marginLeft: 'auto' }}>{activeBinAssets.filter(a => a.status === 'PROCESSING').length > 0 ? '⟳ Processing…' : '✓ Ready'}</span>
          </>
        )}
      </div>
    </div>
  );
}
