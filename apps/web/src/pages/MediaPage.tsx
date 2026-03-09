// =============================================================================
//  THE AVID -- Media Page (Resolve-Style)
//  Full-width bin browser with metadata columns, source preview, and inspector.
// =============================================================================

import React, { useState, useMemo } from 'react';
import { useEditorStore, type MediaAsset, type Bin } from '../store/editor.store';
import { usePlayerStore } from '../store/player.store';

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '--:--:--:--';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const f = Math.floor((sec % 1) * 24);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(f).padStart(2,'0')}`;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type SortKey = 'name' | 'duration' | 'fps' | 'width' | 'codec' | 'fileSize' | 'type';

function collectAllMediaAssets(bins: Bin[]): MediaAsset[] {
  const result: MediaAsset[] = [];
  const walk = (b: Bin) => {
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

  const allAssets = useMemo(() => collectAllMediaAssets(bins), [bins]);

  const filteredAssets = useMemo(() => {
    let list = activeBin ? activeBinAssets : allAssets;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
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
  }, [allAssets, activeBinAssets, activeBin, sortKey, sortAsc, searchQuery]);

  const selectedAsset = allAssets.find((a: MediaAsset) => a.id === selectedAssetId);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortAsc ? ' \u25B2' : ' \u25BC') : '';

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Bin sidebar */}
      <div style={{
        width: 200, flexShrink: 0, borderRight: '1px solid var(--border-default)',
        background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '8px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-default)' }}>
          Bins
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div
            style={{
              padding: '6px 10px', fontSize: 11, cursor: 'pointer',
              color: !activeBin ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: !activeBin ? 'var(--bg-active)' : 'transparent',
            }}
            onClick={() => selectBin(null)}
          >
            All Media
          </div>
          {bins.map((bin) => (
            <div
              key={bin.id}
              style={{
                padding: '6px 10px', fontSize: 11, cursor: 'pointer',
                color: activeBin === bin.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: activeBin === bin.id ? 'var(--bg-active)' : 'transparent',
              }}
              onClick={() => selectBin(bin.id)}
            >
              {bin.name}
            </div>
          ))}
        </div>
      </div>

      {/* Main media table */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Search bar */}
        <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="text"
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
        <div role="row" style={{
          display: 'grid',
          gridTemplateColumns: '2fr 100px 60px 120px 100px 80px 90px',
          padding: '4px 10px', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
          textTransform: 'uppercase', color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border-default)', cursor: 'pointer',
          background: 'var(--bg-raised)',
        }}>
          <div role="columnheader" tabIndex={0} onClick={() => handleSort('name')} onKeyDown={(e) => { if (e.key === 'Enter') handleSort('name'); }} aria-sort={sortKey === 'name' ? (sortAsc ? 'ascending' : 'descending') : undefined}>Name{sortIndicator('name')}</div>
          <div role="columnheader" tabIndex={0} onClick={() => handleSort('duration')} onKeyDown={(e) => { if (e.key === 'Enter') handleSort('duration'); }} aria-sort={sortKey === 'duration' ? (sortAsc ? 'ascending' : 'descending') : undefined}>Duration{sortIndicator('duration')}</div>
          <div role="columnheader" tabIndex={0} onClick={() => handleSort('fps')} onKeyDown={(e) => { if (e.key === 'Enter') handleSort('fps'); }} aria-sort={sortKey === 'fps' ? (sortAsc ? 'ascending' : 'descending') : undefined}>FPS{sortIndicator('fps')}</div>
          <div role="columnheader" tabIndex={0} onClick={() => handleSort('width')} onKeyDown={(e) => { if (e.key === 'Enter') handleSort('width'); }} aria-sort={sortKey === 'width' ? (sortAsc ? 'ascending' : 'descending') : undefined}>Resolution{sortIndicator('width')}</div>
          <div role="columnheader" tabIndex={0} onClick={() => handleSort('codec')} onKeyDown={(e) => { if (e.key === 'Enter') handleSort('codec'); }} aria-sort={sortKey === 'codec' ? (sortAsc ? 'ascending' : 'descending') : undefined}>Codec{sortIndicator('codec')}</div>
          <div role="columnheader" tabIndex={0} onClick={() => handleSort('type')} onKeyDown={(e) => { if (e.key === 'Enter') handleSort('type'); }} aria-sort={sortKey === 'type' ? (sortAsc ? 'ascending' : 'descending') : undefined}>Type{sortIndicator('type')}</div>
          <div role="columnheader" tabIndex={0} onClick={() => handleSort('fileSize')} onKeyDown={(e) => { if (e.key === 'Enter') handleSort('fileSize'); }} aria-sort={sortKey === 'fileSize' ? (sortAsc ? 'ascending' : 'descending') : undefined}>Size{sortIndicator('fileSize')}</div>
        </div>

        {/* Table body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredAssets.map((asset) => (
            <div
              key={asset.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 100px 60px 120px 100px 80px 90px',
                padding: '5px 10px', fontSize: 11, cursor: 'pointer',
                color: 'var(--text-secondary)',
                background: selectedAssetId === asset.id ? 'var(--bg-active)' : 'transparent',
                borderBottom: '1px solid var(--border-subtle)',
              }}
              onClick={() => { setSelectedAssetId(asset.id); setSourceClip(asset.id); }}
              onDoubleClick={() => setSourceClip(asset.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                {asset.thumbnailUrl && (
                  <img src={asset.thumbnailUrl} alt="" style={{ width: 32, height: 18, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                  {asset.name}
                </span>
                {asset.hasAlpha && <span style={{ fontSize: 8, color: 'var(--success)', fontWeight: 700, flexShrink: 0 }}>A</span>}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{formatDuration(asset.duration ?? 0)}</div>
              <div>{asset.fps?.toFixed(2) ?? '--'}</div>
              <div>{asset.width && asset.height ? `${asset.width}x${asset.height}` : '--'}</div>
              <div>{asset.codec ?? '--'}</div>
              <div style={{ fontSize: 10, fontWeight: 500 }}>{asset.type}</div>
              <div>{formatFileSize(asset.fileSize)}</div>
            </div>
          ))}
          {filteredAssets.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No media found. Import files to get started.
            </div>
          )}
        </div>
      </div>

      {/* Metadata inspector sidebar */}
      <div style={{
        width: 260, flexShrink: 0, borderLeft: '1px solid var(--border-default)',
        background: 'var(--bg-surface)', overflowY: 'auto',
      }}>
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
      </div>
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
