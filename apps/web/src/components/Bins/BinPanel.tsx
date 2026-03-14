import React, { useState, memo, useCallback, useEffect, useRef, useMemo } from 'react';
import { useEditorStore } from '../../store/editor.store';
import type { Bin, MediaAsset, SmartBin, BinSortField, Sequence } from '../../store/editor.store';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDuration(sec?: number): string {
  if (!sec) return '--:--';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(d?: Date | string): string {
  const date = d ? new Date(d) : new Date();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

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

/** Recursively count assets in a bin tree. */
function countAssets(bin: Bin): number {
  return bin.assets.length + bin.children.reduce((n, c) => n + countAssets(c), 0);
}

/** Compute total duration across assets. */
function totalDuration(assets: MediaAsset[]): number {
  return assets.reduce((sum, a) => sum + (a.duration ?? 0), 0);
}

/** Build breadcrumb path for a bin. */
function getBinPath(bins: Bin[], targetId: string): string[] {
  const path: string[] = [];
  const find = (list: Bin[], trail: string[]): boolean => {
    for (const bin of list) {
      const newTrail = [...trail, bin.name];
      if (bin.id === targetId) {
        path.push(...newTrail);
        return true;
      }
      if (find(bin.children, newTrail)) return true;
    }
    return false;
  };
  find(bins, []);
  return path;
}

/** Collect all bin IDs in a flat list (for "Move to" menu). */
function collectBinIds(bins: Bin[], exclude?: string): { id: string; name: string; depth: number }[] {
  const result: { id: string; name: string; depth: number }[] = [];
  const walk = (list: Bin[], depth: number) => {
    for (const bin of list) {
      if (bin.id !== exclude) {
        result.push({ id: bin.id, name: bin.name, depth });
        walk(bin.children, depth + 1);
      }
    }
  };
  walk(bins, 0);
  return result;
}

// ─── Bin color presets (Avid-style) ─────────────────────────────────────────

const BIN_COLOR_PRESETS = [
  { name: 'Red', color: '#e05b5b' },
  { name: 'Blue', color: '#5b6af5' },
  { name: 'Green', color: '#2bb672' },
  { name: 'Yellow', color: '#e8c43a' },
  { name: 'Purple', color: '#9b59b6' },
  { name: 'Orange', color: '#e8943a' },
];

// ─── Bin Context Menu ───────────────────────────────────────────────────────

interface BinContextMenuProps {
  x: number;
  y: number;
  binId: string;
  onClose: () => void;
}

function BinContextMenu({ x, y, binId, onClose }: BinContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const bins = useEditorStore((s) => s.bins);
  const [showMoveTo, setShowMoveTo] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSortBy, setShowSortBy] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const allBins = collectBinIds(bins, binId);

  const menuStyle: React.CSSProperties = {
    position: 'fixed', left: x, top: y, zIndex: 9999,
    background: 'var(--bg-elevated, #1e1e36)', border: '1px solid var(--border-default, #2a2a40)',
    borderRadius: 6, padding: '4px 0', minWidth: 180, fontSize: 11,
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)', color: 'var(--text-primary, #e0e0e0)',
  };

  const itemStyle: React.CSSProperties = {
    padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
  };

  const separatorStyle: React.CSSProperties = {
    height: 1, background: 'var(--border-subtle, #222238)', margin: '4px 0',
  };

  return (
    <div ref={menuRef} style={menuStyle} role="menu" aria-label="Bin context menu">
      {/* New Bin */}
      <div style={itemStyle} role="menuitem" onClick={() => {
        useEditorStore.getState().addBin('New Bin', binId);
        onClose();
      }} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-muted, rgba(91,110,244,0.12))')}
         onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
        New Sub-Bin
      </div>

      {/* Rename */}
      {isRenaming ? (
        <div style={{ padding: '4px 12px' }}>
          <input
            type="text" value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameValue.trim()) {
                useEditorStore.getState().renameBin(binId, renameValue.trim());
                onClose();
              }
              if (e.key === 'Escape') setIsRenaming(false);
            }}
            autoFocus
            style={{
              width: '100%', background: 'var(--bg-void)', border: '1px solid var(--border)',
              borderRadius: 3, color: 'var(--text-primary)', fontSize: 11, padding: '3px 6px', outline: 'none',
            }}
          />
        </div>
      ) : (
        <div style={itemStyle} role="menuitem" onClick={() => {
          // Find bin name
          const findName = (list: Bin[]): string => {
            for (const b of list) {
              if (b.id === binId) return b.name;
              const c = findName(b.children);
              if (c) return c;
            }
            return '';
          };
          setRenameValue(findName(bins));
          setIsRenaming(true);
        }} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-muted)')}
           onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
          Rename Bin
        </div>
      )}

      {/* Delete */}
      <div style={{ ...itemStyle, color: 'var(--error, #e05b5b)' }} role="menuitem" onClick={() => {
        useEditorStore.getState().deleteBin(binId);
        onClose();
      }} onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(224,91,91,0.12)')}
         onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
        Delete Bin
      </div>

      <div style={separatorStyle} />

      {/* Move to... */}
      <div style={{ position: 'relative' }}>
        <div style={itemStyle} role="menuitem"
          onClick={() => setShowMoveTo(!showMoveTo)}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-muted)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
          Move to...
          <span style={{ marginLeft: 'auto', fontSize: 9 }}>{showMoveTo ? '▼' : '▶'}</span>
        </div>
        {showMoveTo && (
          <div style={{
            ...menuStyle, position: 'absolute', left: '100%', top: 0, minWidth: 160,
          }}>
            <div style={itemStyle} role="menuitem" onClick={() => {
              useEditorStore.getState().moveBinTo(binId, null);
              onClose();
            }} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-muted)')}
               onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
              <em style={{ opacity: 0.6 }}>Root Level</em>
            </div>
            {allBins.map((b) => (
              <div key={b.id} style={{ ...itemStyle, paddingLeft: 12 + b.depth * 12 }} role="menuitem" onClick={() => {
                useEditorStore.getState().moveBinTo(binId, b.id);
                onClose();
              }} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-muted)')}
                 onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                {b.name}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Set Color */}
      <div style={{ position: 'relative' }}>
        <div style={itemStyle} role="menuitem"
          onClick={() => setShowColorPicker(!showColorPicker)}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-muted)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
          Set Color
          <span style={{ marginLeft: 'auto', fontSize: 9 }}>{showColorPicker ? '▼' : '▶'}</span>
        </div>
        {showColorPicker && (
          <div style={{
            ...menuStyle, position: 'absolute', left: '100%', top: 0, minWidth: 120,
            display: 'flex', flexWrap: 'wrap', gap: 4, padding: 8,
          }}>
            {BIN_COLOR_PRESETS.map((preset) => (
              <button
                key={preset.color}
                title={preset.name}
                aria-label={`Set bin color to ${preset.name}`}
                onClick={() => {
                  useEditorStore.getState().setBinColor(binId, preset.color);
                  onClose();
                }}
                style={{
                  width: 24, height: 24, borderRadius: 4, border: '2px solid transparent',
                  background: preset.color, cursor: 'pointer',
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div style={separatorStyle} />

      {/* Sort by */}
      <div style={{ position: 'relative' }}>
        <div style={itemStyle} role="menuitem"
          onClick={() => setShowSortBy(!showSortBy)}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-muted)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
          Sort by
          <span style={{ marginLeft: 'auto', fontSize: 9 }}>{showSortBy ? '▼' : '▶'}</span>
        </div>
        {showSortBy && (
          <div style={{ ...menuStyle, position: 'absolute', left: '100%', top: 0, minWidth: 140 }}>
            {([
              ['name', 'Name'],
              ['date-modified', 'Date Modified'],
              ['date-created', 'Date Created'],
              ['size', 'Size'],
              ['type', 'Type'],
              ['duration', 'Duration'],
            ] as [BinSortField, string][]).map(([field, label]) => (
              <div key={field} style={itemStyle} role="menuitem" onClick={() => {
                useEditorStore.getState().setBinSortField(field);
                onClose();
              }} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-muted)')}
                 onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                {label}
                {useEditorStore.getState().binSortField === field && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--brand)' }}>
                    {useEditorStore.getState().binSortDirection === 'asc' ? '▲' : '▼'}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Bin Item with drag-and-drop + context menu ─────────────────────────────

interface BinItemProps {
  bin: Bin;
  depth?: number;
}

const BinItem = memo(function BinItem({ bin, depth = 0 }: BinItemProps) {
  const { selectedBinId, selectBin, toggleBin, binDragOverId, setBinDragOverId, setBinContextMenu } = useEditorStore();
  const isSelected = selectedBinId === bin.id;
  const hasChildren = bin.children.length > 0;
  const assetCount = countAssets(bin);
  const isDragOver = binDragOverId === bin.id;

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBinContextMenu({ x: e.clientX, y: e.clientY, binId: bin.id });
  }, [bin.id, setBinContextMenu]);

  // Drag-and-drop for bin nesting
  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-bin-id', bin.id);
    e.dataTransfer.effectAllowed = 'move';
  }, [bin.id]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-bin-id')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setBinDragOverId(bin.id);
    }
  }, [bin.id, setBinDragOverId]);

  const handleDragLeave = useCallback(() => {
    setBinDragOverId(null);
  }, [setBinDragOverId]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const draggedBinId = e.dataTransfer.getData('application/x-bin-id');
    if (draggedBinId && draggedBinId !== bin.id) {
      useEditorStore.getState().moveBinTo(draggedBinId, bin.id);
    }
    setBinDragOverId(null);
  }, [bin.id, setBinDragOverId]);

  return (
    <>
      <div
        className={`bin-item${isSelected ? ' selected' : ''}${isDragOver ? ' drag-over' : ''}`}
        style={{
          paddingLeft: 8 + depth * 14,
          ...(isDragOver ? { background: 'var(--accent-muted, rgba(91,110,244,0.12))', outline: '1px solid var(--brand)' } : {}),
        }}
        onClick={() => selectBin(bin.id)}
        onDoubleClick={() => hasChildren && toggleBin(bin.id)}
        onContextMenu={handleContextMenu}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        role="treeitem"
        aria-label={`${bin.name} (${assetCount} items)`}
        aria-selected={isSelected}
        aria-expanded={hasChildren ? bin.isOpen : undefined}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') selectBin(bin.id);
          if (e.key === 'ArrowRight' && hasChildren && !bin.isOpen) toggleBin(bin.id);
          if (e.key === 'ArrowLeft' && hasChildren && bin.isOpen) toggleBin(bin.id);
          if (e.key === 'F2') {
            e.preventDefault();
            setBinContextMenu({ x: 100, y: 100, binId: bin.id });
          }
        }}
      >
        <div className="bin-indent">
          {hasChildren ? (
            <div className={`bin-chevron${bin.isOpen ? ' open' : ''}`}
              onClick={e => { e.stopPropagation(); toggleBin(bin.id); }}>&#9654;</div>
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

// ─── Asset Card with multi-select ───────────────────────────────────────────

interface AssetCardProps {
  asset: MediaAsset;
}

const AssetCard = memo(function AssetCard({ asset }: AssetCardProps) {
  const { setSourceAsset, sourceAsset, selectAsset, selectedAssetIds } = useEditorStore();
  const isSelected = selectedAssetIds.includes(asset.id) || sourceAsset?.id === asset.id;

  const typeIcon: Record<string, string> = { VIDEO: '▶', AUDIO: '♪', IMAGE: '⬛', DOCUMENT: '📄' };

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (e.shiftKey) {
      selectAsset(asset.id, false, true);
    } else if (e.metaKey || e.ctrlKey) {
      selectAsset(asset.id, true);
    } else {
      selectAsset(asset.id);
      setSourceAsset(asset);
    }
  }, [asset, selectAsset, setSourceAsset]);

  return (
    <div
      className={`asset-card${isSelected ? ' selected' : ''}`}
      onClick={handleClick}
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
          <div className="asset-status-processing">Processing...</div>
        ) : (
          <div className="asset-thumb-placeholder">{typeIcon[asset.type] ?? '📄'}</div>
        )}
        {asset.duration && <div className="asset-duration">{formatDuration(asset.duration)}</div>}
        <div className={`asset-type-badge ${asset.type.toLowerCase()}`}>{asset.type}</div>
        {asset.isFavorite && <div className="asset-fav">&#9733;</div>}
      </div>
      <div className="asset-name truncate" title={asset.name}>{asset.name}</div>
    </div>
  );
});

// ─── Asset List View with sortable columns ──────────────────────────────────

type ListSortField = 'name' | 'duration' | 'fps' | 'resolution' | 'codec' | 'colorSpace' | 'size';

function AssetListView({ assets }: { assets: MediaAsset[] }) {
  const { setSourceAsset, sourceAsset, ingestProgress, selectAsset, selectedAssetIds } = useEditorStore();
  const [sortField, setSortField] = useState<ListSortField>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleColumnSort = useCallback((field: ListSortField) => {
    if (sortField === field) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }, [sortField]);

  const sorted = useMemo(() => {
    const compare = (a: MediaAsset, b: MediaAsset): number => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'duration': cmp = (a.duration ?? 0) - (b.duration ?? 0); break;
        case 'fps': cmp = (a.fps ?? 0) - (b.fps ?? 0); break;
        case 'resolution': cmp = ((a.width ?? 0) * (a.height ?? 0)) - ((b.width ?? 0) * (b.height ?? 0)); break;
        case 'codec': cmp = (a.codec ?? '').localeCompare(b.codec ?? ''); break;
        case 'colorSpace': cmp = (a.colorSpace ?? '').localeCompare(b.colorSpace ?? ''); break;
        case 'size': cmp = (a.fileSize ?? 0) - (b.fileSize ?? 0); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    };
    return [...assets].sort(compare);
  }, [assets, sortField, sortDir]);

  const SortIndicator = ({ field }: { field: ListSortField }) => (
    sortField === field ? (
      <span style={{ fontSize: 8, marginLeft: 2 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
    ) : null
  );

  const handleRowClick = useCallback((e: React.MouseEvent, asset: MediaAsset) => {
    if (e.shiftKey) {
      selectAsset(asset.id, false, true);
    } else if (e.metaKey || e.ctrlKey) {
      selectAsset(asset.id, true);
    } else {
      selectAsset(asset.id);
      setSourceAsset(asset);
    }
  }, [selectAsset, setSourceAsset]);

  return (
    <div className="bin-list-view">
      {/* Column headers — sortable */}
      <div className="bin-list-header">
        <span className="bin-col-color"></span>
        <span className="bin-col-name" onClick={() => handleColumnSort('name')} style={{ cursor: 'pointer' }}>
          Name<SortIndicator field="name" />
        </span>
        <span className="bin-col-duration" onClick={() => handleColumnSort('duration')} style={{ cursor: 'pointer' }}>
          Duration<SortIndicator field="duration" />
        </span>
        <span className="bin-col-fps" onClick={() => handleColumnSort('fps')} style={{ cursor: 'pointer' }}>
          FPS<SortIndicator field="fps" />
        </span>
        <span className="bin-col-res" onClick={() => handleColumnSort('resolution')} style={{ cursor: 'pointer' }}>
          Resolution<SortIndicator field="resolution" />
        </span>
        <span className="bin-col-codec" onClick={() => handleColumnSort('codec')} style={{ cursor: 'pointer' }}>
          Codec<SortIndicator field="codec" />
        </span>
        <span className="bin-col-cs" onClick={() => handleColumnSort('colorSpace')} style={{ cursor: 'pointer' }}>
          Color<SortIndicator field="colorSpace" />
        </span>
        <span className="bin-col-size" onClick={() => handleColumnSort('size')} style={{ cursor: 'pointer' }}>
          Size<SortIndicator field="size" />
        </span>
      </div>
      {/* Rows */}
      {sorted.map(asset => {
        const progress = ingestProgress[asset.id];
        const isIngesting = progress !== undefined;
        const isSelected = selectedAssetIds.includes(asset.id) || sourceAsset?.id === asset.id;
        return (
          <div
            key={asset.id}
            className={`bin-list-row${isSelected ? ' selected' : ''}${isIngesting ? ' ingesting' : ''}`}
            onClick={(e) => handleRowClick(e, asset)}
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

// ─── Effects library data ───────────────────────────────────────────────────

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
                {appliedFx === fx.id && <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--success)' }}>Applied</span>}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── Smart Bin item ─────────────────────────────────────────────────────────

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
        <span style={{ fontSize: 10, opacity: 0.6 }}>&#10022;</span>
      </div>
      <div className="bin-dot" style={{ background: smartBin.color }} />
      <span className="bin-name">{smartBin.name}</span>
      <span className="bin-count">{assetCount}</span>
      <button
        className="smart-bin-remove"
        onClick={e => { e.stopPropagation(); removeSmartBin(smartBin.id); }}
        title="Remove Smart Bin"
      >&#10005;</button>
    </div>
  );
}

// ─── Sequence Item ──────────────────────────────────────────────────────────

interface SequenceItemProps {
  sequence: Sequence;
}

const SequenceItem = memo(function SequenceItem({ sequence }: SequenceItemProps) {
  const activeSequenceId = useEditorStore((s) => s.activeSequenceId);
  const isActive = activeSequenceId === sequence.id;
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(sequence.name);
  const [showContextMenu, setShowContextMenu] = useState<{ x: number; y: number } | null>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showContextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) setShowContextMenu(null);
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [showContextMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setShowContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const menuItemStyle: React.CSSProperties = {
    padding: '6px 12px', cursor: 'pointer', fontSize: 11,
  };

  return (
    <>
      <div
        className={`bin-item${isActive ? ' selected' : ''}`}
        style={{ paddingLeft: 8 }}
        onClick={() => useEditorStore.getState().switchSequence(sequence.id)}
        onDoubleClick={() => useEditorStore.getState().switchSequence(sequence.id)}
        onContextMenu={handleContextMenu}
        role="option"
        aria-selected={isActive}
        aria-label={`Sequence: ${sequence.name}`}
        tabIndex={0}
      >
        <div className="bin-indent">
          {/* Filmstrip icon */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
            <line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" />
            <line x1="17" y1="7" x2="22" y2="7" /><line x1="17" y1="17" x2="22" y2="17" />
          </svg>
        </div>
        {isRenaming ? (
          <input
            type="text" value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameValue.trim()) {
                useEditorStore.getState().renameSequence(sequence.id, renameValue.trim());
                setIsRenaming(false);
              }
              if (e.key === 'Escape') { setIsRenaming(false); setRenameValue(sequence.name); }
            }}
            onBlur={() => { setIsRenaming(false); setRenameValue(sequence.name); }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1, background: 'var(--bg-void)', border: '1px solid var(--border)',
              borderRadius: 3, color: 'var(--text-primary)', fontSize: 11, padding: '1px 4px', outline: 'none',
            }}
          />
        ) : (
          <span className="bin-name">{sequence.name}</span>
        )}
        <span className="bin-count" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          {formatDuration(sequence.duration)} | {sequence.tracks.length}T
        </span>
      </div>

      {/* Context menu */}
      {showContextMenu && (
        <div ref={contextRef} style={{
          position: 'fixed', left: showContextMenu.x, top: showContextMenu.y, zIndex: 9999,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: 6, padding: '4px 0', minWidth: 140, fontSize: 11,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', color: 'var(--text-primary)',
        }} role="menu" aria-label="Sequence context menu">
          <div style={menuItemStyle} role="menuitem" onClick={() => {
            setIsRenaming(true); setShowContextMenu(null);
          }} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-muted)')}
             onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
            Rename
          </div>
          <div style={menuItemStyle} role="menuitem" onClick={() => {
            useEditorStore.getState().duplicateSequence(sequence.id); setShowContextMenu(null);
          }} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-muted)')}
             onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
            Duplicate
          </div>
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
          <div style={{ ...menuItemStyle, color: 'var(--error)' }} role="menuitem" onClick={() => {
            useEditorStore.getState().deleteSequence(sequence.id); setShowContextMenu(null);
          }} onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(224,91,91,0.12)')}
             onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
            Delete
          </div>
        </div>
      )}
    </>
  );
});

// ─── Main BinPanel ──────────────────────────────────────────────────────────

export function BinPanel() {
  const {
    bins, activeBinAssets, toolbarTab, addBin, selectedBinId, smartBins,
    importMediaFiles, ingestProgress, binContextMenu, setBinContextMenu,
    sequences, toggleSequenceDialog, selectedAssetIds, searchScope,
    setSearchScope, searchFilterChips, toggleSearchFilterChip, addRecentSearch,
    recentSearches, sourceAsset,
  } = useEditorStore();

  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [tab, setTab] = useState<'bins' | 'smart' | 'search' | 'sequences'>('bins');
  const [showNewBinInput, setShowNewBinInput] = useState(false);
  const [newBinName, setNewBinName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const isEffectsMode = toolbarTab === 'effects';
  const ingestCount = Object.keys(ingestProgress).length;

  // Breadcrumb path
  const binPath = useMemo(() => {
    if (!selectedBinId) return [];
    return getBinPath(bins, selectedBinId);
  }, [bins, selectedBinId]);

  // Apply search filter chips
  const activeFilterTypes = searchFilterChips.filter((c) => c.active && c.type === 'type').map((c) => c.value);
  const favFilter = searchFilterChips.find((c) => c.type === 'favorite' && c.active);

  const filtered = useMemo(() => {
    let result = activeBinAssets;

    // Text search
    if (search) {
      const lc = search.toLowerCase();
      result = result.filter(a =>
        a.name.toLowerCase().includes(lc) || a.tags.some(t => t.includes(lc))
      );
    }

    // Type filter chips
    if (activeFilterTypes.length > 0) {
      result = result.filter(a => activeFilterTypes.includes(a.type));
    }

    // Favorite filter
    if (favFilter) {
      result = result.filter(a => a.isFavorite);
    }

    return result;
  }, [activeBinAssets, search, activeFilterTypes, favFilter]);

  // Handle search submission
  const handleSearchSubmit = useCallback(() => {
    if (search.trim()) {
      addRecentSearch(search.trim());
    }
  }, [search, addRecentSearch]);

  // Keyboard shortcut: Ctrl/Cmd+Shift+N for new sequence
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        toggleSequenceDialog();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSequenceDialog]);

  // Drop zone on bin tree root (for un-nesting bins)
  const handleRootDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const draggedBinId = e.dataTransfer.getData('application/x-bin-id');
    if (draggedBinId) {
      useEditorStore.getState().moveBinTo(draggedBinId, null);
      useEditorStore.getState().setBinDragOverId(null);
    }
  }, []);

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
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files?.length) {
      importMediaFiles(e.dataTransfer.files, selectedBinId ?? undefined);
    }
  };

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
            Drop media files to import<br />
            <span style={{ fontSize: 11, opacity: 0.7 }}>Video, Audio, Images, Graphics</span>
          </div>
        </div>
      )}

      {/* Bin context menu */}
      {binContextMenu && (
        <BinContextMenu
          x={binContextMenu.x}
          y={binContextMenu.y}
          binId={binContextMenu.binId}
          onClose={() => setBinContextMenu(null)}
        />
      )}

      {/* Header */}
      <div className="panel-header">
        <span className="panel-title">{isEffectsMode ? 'Effects' : 'Media'}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          {!isEffectsMode && (
            <>
              {/* New Sequence button */}
              <button
                className="tl-btn"
                title="New Sequence (Ctrl+Shift+N)"
                aria-label="New Sequence"
                onClick={() => toggleSequenceDialog()}
                style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
                  <line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                </svg>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              {/* Import media button */}
              <button className="tl-btn" title="Import Media" style={{ fontSize: 12 }}
                aria-label="Import media files"
                onClick={() => {
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
                }}>+</button>
              {/* New Bin button */}
              <button className="tl-btn" title="New Bin" aria-label="Create new bin"
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
          <input type="text" placeholder="Bin name..." value={newBinName}
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
            onClick={() => { setShowNewBinInput(false); setNewBinName(''); }}>&#10005;</button>
        </div>
      )}

      {/* Tabs */}
      {!isEffectsMode && (
        <div className="panel-tabs">
          {(['bins', 'sequences', 'smart', 'search'] as const).map(t => {
            const label = t === 'bins' ? 'Bins' : t === 'sequences' ? 'Seqs' : t === 'smart' ? 'Smart' : 'Search';
            return (
              <button key={t} className={`panel-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                {t === 'smart' ? `${String.fromCharCode(10022)} ${label}` : label}
                {t === 'sequences' && sequences.length > 0 && (
                  <span style={{ marginLeft: 3, fontSize: 9, color: 'var(--text-muted)' }}>({sequences.length})</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Search bar */}
      <div className="bin-search">
        <input
          type="text"
          placeholder={isEffectsMode ? 'Search effects...' : tab === 'search' ? 'Search all media...' : 'Filter...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSearchSubmit(); }}
        />
        {!isEffectsMode && (
          <div className="bin-view-toggle" style={{ display: 'flex', gap: 2, padding: 0 }}>
            <button className={`view-btn${viewMode === 'grid' ? ' active' : ''}`}
              onClick={() => setViewMode('grid')} title="Grid view" aria-label="Grid view">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>
            <button className={`view-btn${viewMode === 'list' ? ' active' : ''}`}
              onClick={() => setViewMode('list')} title="List view" aria-label="List view">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Search filter chips */}
      {!isEffectsMode && tab === 'search' && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 8px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          {/* Scope toggle */}
          <button
            className={`tl-btn${searchScope === 'all' ? ' active' : ''}`}
            style={{ fontSize: 9, padding: '2px 6px', borderRadius: 10 }}
            onClick={() => setSearchScope(searchScope === 'current' ? 'all' : 'current')}
            aria-label={searchScope === 'all' ? 'Search all bins' : 'Search current bin'}
          >
            {searchScope === 'all' ? 'All Bins' : 'Current Bin'}
          </button>
          {/* Filter chips */}
          {searchFilterChips.map((chip) => (
            <button
              key={`${chip.type}-${chip.value}`}
              className={`tl-btn${chip.active ? ' active' : ''}`}
              style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 10,
                ...(chip.active ? { background: 'var(--accent-muted)', borderColor: 'var(--brand)' } : {}),
              }}
              onClick={() => toggleSearchFilterChip(chip.type, chip.value)}
              aria-label={`Filter by ${chip.type}: ${chip.value}`}
              aria-pressed={chip.active}
            >
              {chip.type === 'favorite' ? 'Favorites' : chip.value}
            </button>
          ))}
          {/* Recent searches */}
          {recentSearches.length > 0 && (
            <div style={{ width: '100%', display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: '18px' }}>Recent:</span>
              {recentSearches.slice(0, 5).map((rs) => (
                <button key={rs} className="tl-btn" style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8 }}
                  onClick={() => setSearch(rs)}>{rs}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {isEffectsMode ? (
        <EffectsBrowser search={search} />
      ) : (
        <>
          {/* Breadcrumb navigation */}
          {tab === 'bins' && binPath.length > 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 2, padding: '3px 8px',
              fontSize: 10, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)',
              overflow: 'hidden', whiteSpace: 'nowrap',
            }}>
              {binPath.map((name, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span style={{ opacity: 0.4 }}>&#9656;</span>}
                  <span style={i === binPath.length - 1 ? { color: 'var(--text-primary)', fontWeight: 600 } : {}}>
                    {name}
                  </span>
                </React.Fragment>
              ))}
              <span style={{ marginLeft: 'auto', fontSize: 9 }}>
                {activeBinAssets.length} items | {formatDuration(totalDuration(activeBinAssets))}
              </span>
            </div>
          )}

          {/* Bin / sequence / smart tree */}
          <div
            className="bin-tree"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
            role="tree"
            aria-label={tab === 'sequences' ? 'Sequences' : 'Media bins'}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('application/x-bin-id')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }
            }}
            onDrop={handleRootDrop}
          >
            {tab === 'sequences' ? (
              sequences.length > 0 ? (
                sequences.map((seq) => <SequenceItem key={seq.id} sequence={seq} />)
              ) : (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                  No sequences yet.<br />
                  <button
                    className="tl-btn"
                    style={{ marginTop: 8, fontSize: 11 }}
                    onClick={() => toggleSequenceDialog()}
                    aria-label="Create new sequence"
                  >
                    Create New Sequence
                  </button>
                </div>
              )
            ) : tab === 'smart' ? (
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
          {tab !== 'sequences' && (
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
          )}
        </>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px',
        background: 'var(--bg-void)', borderTop: '1px solid var(--border-subtle)',
        fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        {isEffectsMode ? (
          <span>{EFFECTS_LIBRARY.reduce((n, c) => n + c.effects.length, 0)} effects available</span>
        ) : tab === 'sequences' ? (
          <span>{sequences.length} sequence{sequences.length !== 1 ? 's' : ''}</span>
        ) : (
          <>
            <span>{filtered.length} items</span>
            {selectedAssetIds.length > 1 && (
              <span style={{ color: 'var(--brand-bright)' }}>
                {selectedAssetIds.length} selected
              </span>
            )}
            <span style={{ marginLeft: 'auto' }}>
              {ingestCount > 0
                ? `Ingesting ${ingestCount} file${ingestCount > 1 ? 's' : ''}...`
                : activeBinAssets.filter(a => a.status === 'PROCESSING').length > 0
                  ? 'Processing...'
                  : 'Ready'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
