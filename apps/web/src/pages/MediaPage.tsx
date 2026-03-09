// =============================================================================
//  THE AVID -- Media Page (Resolve-Style)
//  Full-width bin browser with metadata columns, source preview, and inspector.
// =============================================================================

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useEditorStore, type MediaAsset } from '../store/editor.store';
import { usePlayerStore } from '../store/player.store';
import { useDebounce } from '../hooks/useDebounce';

function formatDuration(sec: number): string {
  // Defensive: handle NaN, Infinity, negative, or zero
  if (!Number.isFinite(sec) || sec <= 0) return '--:--:--:--';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const f = Math.floor((sec % 1) * 24);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(f).padStart(2,'0')}`;
}

function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes) || bytes <= 0) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type SortKey = 'name' | 'duration' | 'fps' | 'width' | 'codec' | 'fileSize' | 'type';

function collectAllMediaAssets(bins: { assets: MediaAsset[]; children: any[] }[]): MediaAsset[] {
  const result: MediaAsset[] = [];
  const walk = (b: { assets: MediaAsset[]; children: any[] }) => {
    result.push(...b.assets);
    b.children.forEach(walk);
  };
  bins.forEach(walk);
  return result;
}

export function MediaPage() {
  const bins = useEditorStore((s) => s.bins);
  const activeBin = useEditorStore((s) => s.selectedBinId);
  const selectBin = useEditorStore((s) => s.selectBin);
  const activeBinAssets = useEditorStore((s) => s.activeBinAssets);
  const { setSourceClip } = usePlayerStore();
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 250);
  const [isLoading, setIsLoading] = useState(true);

  // Simulate initial data load
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  const allAssets = useMemo(() => collectAllMediaAssets(bins), [bins]);

  const filteredAssets = useMemo(() => {
    let list = activeBin ? activeBinAssets : allAssets;

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((a: MediaAsset) => a.name.toLowerCase().includes(q));
    }

    return [...list].sort((a: MediaAsset, b: MediaAsset) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'duration': cmp = (a.duration ?? 0) - (b.duration ?? 0); break;
        case 'fps': cmp = (a.fps ?? 0) - (b.fps ?? 0); break;
        case 'width': cmp = (a.width ?? 0) - (b.width ?? 0); break;
        case 'codec': cmp = (a.codec ?? '').localeCompare(b.codec ?? ''); break;
        case 'fileSize': cmp = (a.fileSize ?? 0) - (b.fileSize ?? 0); break;
        case 'type': cmp = a.type.localeCompare(b.type); break;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [allAssets, activeBinAssets, activeBin, sortKey, sortAsc, debouncedSearch]);

  const selectedAsset = allAssets.find((a: MediaAsset) => a.id === selectedAssetId);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortAsc ? ' \u25B2' : ' \u25BC') : '';

  // Keyboard navigation for asset list
  const handleAssetKeyDown = useCallback((e: React.KeyboardEvent, assetId: string, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = filteredAssets[index + 1];
      if (next) { setSelectedAssetId(next.id); setSourceClip(next.id); }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = filteredAssets[index - 1];
      if (prev) { setSelectedAssetId(prev.id); setSourceClip(prev.id); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setSourceClip(assetId);
    }
  }, [filteredAssets, setSourceClip]);

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }} role="region" aria-label="Media Browser">
      {/* Bin sidebar */}
      <nav style={{
        width: 200, flexShrink: 0, borderRight: '1px solid var(--border-default)',
        background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column',
      }} aria-label="Media bins">
        <div style={{ padding: '8px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-default)' }}>
          Bins
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }} role="listbox" aria-label="Bin list">
          <div
            role="option"
            aria-selected={!activeBin}
            tabIndex={0}
            style={{
              padding: '6px 10px', fontSize: 11, cursor: 'pointer',
              color: !activeBin ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: !activeBin ? 'var(--bg-active)' : 'transparent',
            }}
            onClick={() => selectBin(null as any)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectBin(null as any); } }}
          >
            All Media
          </div>
          {bins.map((bin) => (
            <div
              key={bin.id}
              role="option"
              aria-selected={activeBin === bin.id}
              tabIndex={0}
              style={{
                padding: '6px 10px', fontSize: 11, cursor: 'pointer',
                color: activeBin === bin.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: activeBin === bin.id ? 'var(--bg-active)' : 'transparent',
              }}
              onClick={() => selectBin(bin.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectBin(bin.id); } }}
            >
              {bin.name}
            </div>
          ))}
        </div>
      </nav>

      {/* Main media table */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Search bar */}
        <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search media..."
            aria-label="Search media assets"
            style={{
              flex: 1, padding: '4px 8px', fontSize: 11,
              background: 'var(--bg-void)', border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            {filteredAssets.length} items
          </span>
        </div>

        {/* Table header */}
        <div
          role="row"
          aria-label="Column headers"
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 100px 60px 120px 100px 80px 90px',
            padding: '4px 10px', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
            textTransform: 'uppercase', color: 'var(--text-muted)',
            borderBottom: '1px solid var(--border-default)', cursor: 'pointer',
            background: 'var(--bg-raised)',
          }}
        >
          <div role="columnheader" tabIndex={0} onClick={() => handleSort('name')} onKeyDown={(e) => { if (e.key === 'Enter') handleSort('name'); }} aria-sort={sortKey === 'name' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>Name{sortIndicator('name')}</div>
          <div role="columnheader" tabIndex={0} onClick={() => handleSort('duration')} onKeyDown={(e) => { if (e.key === 'Enter') handleSort('duration'); }} aria-sort={sortKey === 'duration' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>Duration{sortIndicator('duration')}</div>
          <div role="columnheader" tabIndex={0} onClick={() => handleSort('fps')} onKeyDown={(e) => { if (e.key === 'Enter') handleSort('fps'); }} aria-sort={sortKey === 'fps' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>FPS{sortIndicator('fps')}</div>
          <div role="columnheader" tabIndex={0} onClick={() => handleSort('width')} onKeyDown={(e) => { if (e.key === 'Enter') handleSort('width'); }} aria-sort={sortKey === 'width' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>Resolution{sortIndicator('width')}</div>
          <div role="columnheader" tabIndex={0} onClick={() => handleSort('codec')} onKeyDown={(e) => { if (e.key === 'Enter') handleSort('codec'); }} aria-sort={sortKey === 'codec' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>Codec{sortIndicator('codec')}</div>
          <div role="columnheader" tabIndex={0} onClick={() => handleSort('type')} onKeyDown={(e) => { if (e.key === 'Enter') handleSort('type'); }} aria-sort={sortKey === 'type' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>Type{sortIndicator('type')}</div>
          <div role="columnheader" tabIndex={0} onClick={() => handleSort('fileSize')} onKeyDown={(e) => { if (e.key === 'Enter') handleSort('fileSize'); }} aria-sort={sortKey === 'fileSize' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>Size{sortIndicator('fileSize')}</div>
        </div>

        {/* Table body */}
        <div style={{ flex: 1, overflowY: 'auto' }} role="rowgroup" aria-label="Media assets">
          {/* Loading skeleton */}
          {isLoading && filteredAssets.length === 0 && (
            <>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={`skeleton-${i}`} aria-hidden="true" style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 100px 60px 120px 100px 80px 90px',
                  padding: '5px 10px', borderBottom: '1px solid var(--border-subtle)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 32, height: 18, borderRadius: 2, background: 'var(--bg-elevated)', animation: 'shimmer 1.5s ease-in-out infinite' }} />
                    <div style={{ width: '60%', height: 10, borderRadius: 3, background: 'var(--bg-elevated)' }} />
                  </div>
                  <div style={{ height: 10, width: '70%', borderRadius: 3, background: 'var(--bg-elevated)', alignSelf: 'center' }} />
                  <div style={{ height: 10, width: '50%', borderRadius: 3, background: 'var(--bg-elevated)', alignSelf: 'center' }} />
                  <div style={{ height: 10, width: '80%', borderRadius: 3, background: 'var(--bg-elevated)', alignSelf: 'center' }} />
                  <div style={{ height: 10, width: '60%', borderRadius: 3, background: 'var(--bg-elevated)', alignSelf: 'center' }} />
                  <div style={{ height: 10, width: '50%', borderRadius: 3, background: 'var(--bg-elevated)', alignSelf: 'center' }} />
                  <div style={{ height: 10, width: '60%', borderRadius: 3, background: 'var(--bg-elevated)', alignSelf: 'center' }} />
                </div>
              ))}
            </>
          )}

          {filteredAssets.map((asset, index) => (
            <div
              key={asset.id}
              role="row"
              aria-selected={selectedAssetId === asset.id}
              aria-label={`${asset.name}, ${asset.type}, ${formatDuration(asset.duration ?? 0)}`}
              tabIndex={selectedAssetId === asset.id ? 0 : -1}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 100px 60px 120px 100px 80px 90px',
                padding: '5px 10px', fontSize: 11, cursor: 'pointer',
                color: 'var(--text-secondary)',
                background: selectedAssetId === asset.id ? 'var(--bg-active)' : 'transparent',
                borderBottom: '1px solid var(--border-subtle)',
                outline: 'none',
              }}
              onClick={() => { setSelectedAssetId(asset.id); setSourceClip(asset.id); }}
              onDoubleClick={() => setSourceClip(asset.id)}
              onKeyDown={(e) => handleAssetKeyDown(e, asset.id, index)}
            >
              <div role="gridcell" style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                {asset.thumbnailUrl && (
                  <img src={asset.thumbnailUrl} alt="" style={{ width: 32, height: 18, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                  {asset.name}
                </span>
                {asset.hasAlpha && <span style={{ fontSize: 8, color: 'var(--success)', fontWeight: 700, flexShrink: 0 }} aria-label="Has alpha channel">A</span>}
              </div>
              <div role="gridcell" style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{formatDuration(asset.duration ?? 0)}</div>
              <div role="gridcell">{asset.fps?.toFixed(2) ?? '--'}</div>
              <div role="gridcell">{asset.width && asset.height ? `${asset.width}x${asset.height}` : '--'}</div>
              <div role="gridcell">{asset.codec ?? '--'}</div>
              <div role="gridcell" style={{ fontSize: 10, fontWeight: 500 }}>{asset.type}</div>
              <div role="gridcell">{formatFileSize(asset.fileSize)}</div>
            </div>
          ))}

          {/* Empty state */}
          {!isLoading && filteredAssets.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center' }} role="status">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)', marginBottom: 12 }} aria-hidden="true">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <polyline points="13 2 13 9 20 9" />
              </svg>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
                {debouncedSearch ? 'No matching media found' : 'No media imported yet'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {debouncedSearch ? 'Try adjusting your search query' : 'Import files to get started with your project'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Metadata inspector sidebar */}
      <aside style={{
        width: 260, flexShrink: 0, borderLeft: '1px solid var(--border-default)',
        background: 'var(--bg-surface)', overflowY: 'auto',
      }} aria-label="Media metadata inspector">
        <div style={{ padding: '8px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-default)' }}>
          Metadata
        </div>
        {selectedAsset ? (
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selectedAsset.thumbnailUrl && (
              <img src={selectedAsset.thumbnailUrl} alt="" style={{ width: '100%', borderRadius: 4, marginBottom: 4 }} />
            )}
            <MetaRow label="Name" value={selectedAsset.name} />
            <MetaRow label="Type" value={selectedAsset.type} />
            <MetaRow label="Duration" value={formatDuration(selectedAsset.duration ?? 0)} mono />
            <MetaRow label="Resolution" value={selectedAsset.width && selectedAsset.height ? `${selectedAsset.width} x ${selectedAsset.height}` : '--'} />
            <MetaRow label="Frame Rate" value={selectedAsset.fps ? `${selectedAsset.fps.toFixed(3)} fps` : '--'} />
            <MetaRow label="Codec" value={selectedAsset.codec ?? '--'} />
            <MetaRow label="Color Space" value={selectedAsset.colorSpace ?? '--'} />
            <MetaRow label="Audio" value={selectedAsset.audioChannels ? `${selectedAsset.audioChannels}ch / ${(selectedAsset.sampleRate ?? 0) / 1000}kHz` : '--'} />
            <MetaRow label="Bit Depth" value={selectedAsset.bitDepth ? `${selectedAsset.bitDepth}-bit` : '--'} />
            <MetaRow label="File Size" value={formatFileSize(selectedAsset.fileSize)} />
            <MetaRow label="Alpha" value={selectedAsset.hasAlpha ? 'Yes' : 'No'} />
            <MetaRow label="Start TC" value={selectedAsset.startTimecode ?? '00:00:00:00'} mono />
          </div>
        ) : (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
            Select a clip to view metadata
          </div>
        )}
      </aside>
    </div>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontFamily: mono ? 'var(--font-mono)' : undefined, fontSize: mono ? 10 : undefined }}>{value}</span>
    </div>
  );
}
