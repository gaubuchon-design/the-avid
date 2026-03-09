// ─── EVS Browser Panel ────────────────────────────────────────────────────────
// SP-11a: Browse EVS clip database, filter by camera angle, search operator
// labels, and import clips to timeline. Shows connection status, server
// health, and real-time clip count.

import React, { useState, useMemo, useCallback } from 'react';
import { useSportsStore } from '../../store/sports.store';
import type { EVSClip, CameraAngle } from '@mcua/core';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 25);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`;
}

function formatTimecodeShort(tc: string): string {
  // Show last HH:MM:SS portion
  return tc.split(':').slice(0, 3).join(':');
}

function getAngleColor(angle: CameraAngle): string {
  const colors: Record<string, string> = {
    MAIN_WIDE: '#5b6af5',
    TIGHT: '#e05b8e',
    ISO_1: '#4ade80',
    ISO_2: '#f59e0b',
    ISO_3: '#818cf8',
    ISO_4: '#ec4899',
    REVERSE: '#25a865',
    BEAUTY: '#7c5cfc',
    SUPER_SLO_MO: '#ef4444',
    SKYCAM: '#0ea5e9',
    GOAL_CAM: '#c94f84',
    HANDHELD: '#e8943a',
    STEADICAM: '#6bc5e3',
    ENDZONE: '#d4873a',
    RAIL_CAM: '#5bbfc7',
    NET_CAM: '#4ecdc4',
    CUSTOM: '#818cf8',
    HIGH_WIDE: '#818cf8',
    SLASH: '#818cf8',
  };
  return colors[angle] ?? '#818cf8';
}

const CAMERA_ANGLES: Array<{ value: CameraAngle | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All Angles' },
  { value: 'MAIN_WIDE', label: 'Main Wide' },
  { value: 'TIGHT', label: 'Tight' },
  { value: 'ISO_1', label: 'ISO 1' },
  { value: 'ISO_2', label: 'ISO 2' },
  { value: 'REVERSE', label: 'Reverse' },
  { value: 'SUPER_SLO_MO', label: 'Super Slo-Mo' },
  { value: 'SKYCAM', label: 'SkyCam' },
  { value: 'BEAUTY', label: 'Beauty' },
  { value: 'GOAL_CAM', label: 'Goal Cam' },
  { value: 'HANDHELD', label: 'Handheld' },
];

// ─── Clip Row ─────────────────────────────────────────────────────────────────

function EVSClipRow({
  clip,
  isSelected,
  onSelect,
  onImport,
}: {
  clip: EVSClip;
  isSelected: boolean;
  onSelect: () => void;
  onImport: () => void;
}) {
  return (
    <div
      className={`evs-clip-row${isSelected ? ' selected' : ''}`}
      onClick={onSelect}
      onDoubleClick={onImport}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        cursor: 'pointer',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: isSelected ? 'rgba(91,106,245,0.18)' : 'transparent',
        fontSize: 12,
        transition: 'background 0.15s',
      }}
    >
      {/* Camera angle badge */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: getAngleColor(clip.cameraAngle),
          flexShrink: 0,
        }}
      />

      {/* Operator label */}
      <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#e0e0e0' }}>
        {clip.operatorLabel}
      </div>

      {/* Camera angle */}
      <div style={{ width: 70, color: '#888', fontSize: 11, textAlign: 'center' }}>
        {clip.cameraAngle.replace(/_/g, ' ')}
      </div>

      {/* Duration */}
      <div style={{ width: 65, color: '#aaa', fontFamily: 'monospace', fontSize: 11, textAlign: 'right' }}>
        {formatDuration(clip.duration)}
      </div>

      {/* Timecode In */}
      <div style={{ width: 70, color: '#666', fontFamily: 'monospace', fontSize: 10, textAlign: 'right' }}>
        {formatTimecodeShort(clip.timecodeIn)}
      </div>

      {/* Tags */}
      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
        {clip.tags.slice(0, 2).map((tag) => (
          <span
            key={tag}
            style={{
              background: 'rgba(255,255,255,0.08)',
              color: '#999',
              padding: '1px 5px',
              borderRadius: 3,
              fontSize: 10,
            }}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Growing File Indicator ───────────────────────────────────────────────────

function GrowingFilesBadge() {
  const growingFiles = useSportsStore((s) => s.growingFiles.filter((f) => f.isGrowing));

  if (growingFiles.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        background: 'rgba(239,68,68,0.15)',
        borderRadius: 4,
        fontSize: 11,
        color: '#ef4444',
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#ef4444',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
      {growingFiles.length} recording
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function EVSBrowser() {
  const {
    evsConnectionStatus,
    evsClips,
    evsFilterAngle,
    evsFilterSearch,
    evsSelectedClipId,
    setEVSFilterAngle,
    setEVSFilterSearch,
    selectEVSClip,
  } = useSportsStore();

  const [sortBy, setSortBy] = useState<'time' | 'duration' | 'angle'>('time');

  const filteredClips = useMemo(() => {
    let result = [...evsClips];

    if (evsFilterAngle) {
      result = result.filter((c) => c.cameraAngle === evsFilterAngle);
    }

    if (evsFilterSearch) {
      const q = evsFilterSearch.toLowerCase();
      result = result.filter(
        (c) =>
          c.operatorLabel.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    switch (sortBy) {
      case 'duration':
        result.sort((a, b) => b.duration - a.duration);
        break;
      case 'angle':
        result.sort((a, b) => a.cameraAngle.localeCompare(b.cameraAngle));
        break;
      case 'time':
      default:
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return result;
  }, [evsClips, evsFilterAngle, evsFilterSearch, sortBy]);

  const handleImport = useCallback((clipId: string) => {
    // In production, this would trigger EVSConnector.importClip()
    // and add the clip to the editor timeline.
    selectEVSClip(clipId);
  }, [selectEVSClip]);

  const connectionColor =
    evsConnectionStatus === 'CONNECTED'
      ? '#4ade80'
      : evsConnectionStatus === 'CONNECTING'
      ? '#f59e0b'
      : evsConnectionStatus === 'ERROR'
      ? '#ef4444'
      : '#666';

  return (
    <div
      className="evs-browser-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#1a1a1a',
        borderRadius: 6,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: '#222',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: connectionColor,
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0' }}>
            EVS Browser
          </span>
          <span style={{ fontSize: 11, color: '#888' }}>
            {filteredClips.length} clips
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GrowingFilesBadge />
        </div>
      </div>

      {/* Filter Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <input
          type="text"
          placeholder="Search clips..."
          value={evsFilterSearch}
          onChange={(e) => setEVSFilterSearch(e.target.value)}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            padding: '4px 8px',
            fontSize: 12,
            color: '#e0e0e0',
            outline: 'none',
          }}
        />

        <select
          value={evsFilterAngle ?? 'ALL'}
          onChange={(e) =>
            setEVSFilterAngle(e.target.value === 'ALL' ? null : (e.target.value as CameraAngle))
          }
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            padding: '4px 6px',
            fontSize: 11,
            color: '#ccc',
            outline: 'none',
          }}
        >
          {CAMERA_ANGLES.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            padding: '4px 6px',
            fontSize: 11,
            color: '#ccc',
            outline: 'none',
          }}
        >
          <option value="time">Newest</option>
          <option value="duration">Duration</option>
          <option value="angle">Angle</option>
        </select>
      </div>

      {/* Column Headers */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 10px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          fontSize: 10,
          color: '#666',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        <div style={{ width: 8 }} />
        <div style={{ flex: 1 }}>Label</div>
        <div style={{ width: 70, textAlign: 'center' }}>Angle</div>
        <div style={{ width: 65, textAlign: 'right' }}>Duration</div>
        <div style={{ width: 70, textAlign: 'right' }}>TC In</div>
        <div style={{ width: 60 }}>Tags</div>
      </div>

      {/* Clip List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredClips.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#555',
              fontSize: 12,
            }}
          >
            {evsConnectionStatus === 'DISCONNECTED'
              ? 'Not connected to EVS server'
              : evsConnectionStatus === 'CONNECTING'
              ? 'Connecting...'
              : 'No clips match filters'}
          </div>
        ) : (
          filteredClips.map((clip) => (
            <EVSClipRow
              key={clip.clipId}
              clip={clip}
              isSelected={evsSelectedClipId === clip.clipId}
              onSelect={() => selectEVSClip(clip.clipId)}
              onImport={() => handleImport(clip.clipId)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 10px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          fontSize: 10,
          color: '#666',
        }}
      >
        <span>{evsConnectionStatus === 'CONNECTED' ? 'EVS XT-VIA #1' : evsConnectionStatus}</span>
        <span>Double-click to import</span>
      </div>
    </div>
  );
}
