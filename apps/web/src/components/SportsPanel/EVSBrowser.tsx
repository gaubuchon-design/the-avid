// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — EVS Browser (SP-12)
//  EVS clip browser panel with thumbnail grid, timecodes, camera angles,
//  filtering by angle/event type, drag-to-timeline, quick recall buttons.
//  Follows BinPanel patterns: functional components, hooks, CSS classes.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useMemo, useCallback } from 'react';
import { useSportsStore } from '../../store/sports.store';
import type { EVSClip, CameraAngle } from '@mcua/core';

// ─── Constants ─────────────────────────────────────────────────────────────

const CAMERA_ANGLE_LABELS: Partial<Record<CameraAngle, string>> = {
  MAIN_WIDE:    'Wide',
  TIGHT:        'Tight',
  ISO_1:        'ISO 1',
  ISO_2:        'ISO 2',
  ISO_3:        'ISO 3',
  ISO_4:        'ISO 4',
  HIGH_WIDE:    'High Wide',
  REVERSE:      'Reverse',
  BEAUTY:       'Beauty',
  HANDHELD:     'Handheld',
  STEADICAM:    'Steadicam',
  SKYCAM:       'SkyCam',
  ENDZONE:      'Endzone',
  GOAL_CAM:     'Goal',
  NET_CAM:      'Net',
  RAIL_CAM:     'Rail',
  SUPER_SLO_MO: 'SSM',
  CUSTOM:       'Custom',
};

const ALL_FILTERABLE_ANGLES: CameraAngle[] = [
  'MAIN_WIDE', 'TIGHT', 'ISO_1', 'ISO_2', 'ISO_3', 'ISO_4',
  'HIGH_WIDE', 'REVERSE', 'BEAUTY', 'HANDHELD', 'STEADICAM',
  'SKYCAM', 'ENDZONE', 'GOAL_CAM', 'NET_CAM', 'RAIL_CAM',
  'SUPER_SLO_MO', 'CUSTOM',
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDurationShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── EVS Clip Card (Grid View) ─────────────────────────────────────────────

function EVSClipCard({ clip, isSelected, onSelect }: {
  clip: EVSClip;
  isSelected: boolean;
  onSelect: (clipId: string) => void;
}) {
  const angleLabel = CAMERA_ANGLE_LABELS[clip.cameraAngle] ?? clip.cameraAngle;

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-evs-clip', JSON.stringify({
      clipId: clip.clipId,
      cameraAngle: clip.cameraAngle,
      inPoint: clip.inPoint,
      outPoint: clip.outPoint,
      duration: clip.duration,
      serverPath: clip.serverPath,
      operatorLabel: clip.operatorLabel,
    }));
    e.dataTransfer.effectAllowed = 'copy';
  }, [clip]);

  return (
    <div
      className={`asset-card${isSelected ? ' selected' : ''}`}
      onClick={() => onSelect(clip.clipId)}
      draggable
      onDragStart={handleDragStart}
      title={`${clip.operatorLabel}\n${clip.timecodeIn} - ${clip.timecodeOut}\nDrag to timeline`}
      style={{ cursor: 'grab' }}
    >
      {/* Thumbnail Area */}
      <div className="asset-thumb">
        {clip.thumbnailUrl ? (
          <img
            src={clip.thumbnailUrl}
            alt={clip.operatorLabel}
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-sm, 4px)' }}
          />
        ) : (
          <div className="asset-thumb-placeholder" style={{ fontSize: 16 }}>
            &#127909;
          </div>
        )}
        {/* Duration Badge */}
        <div className="asset-duration">{formatDurationShort(clip.duration)}</div>
        {/* Camera Angle Badge */}
        <div
          className="asset-type-badge"
          style={{
            position: 'absolute',
            top: 3,
            left: 3,
            padding: '1px 5px',
            borderRadius: 'var(--radius-xs, 3px)',
            background: 'rgba(0,0,0,0.7)',
            color: '#fff',
            fontSize: 9,
            fontWeight: 600,
          }}
        >
          {angleLabel}
        </div>
      </div>

      {/* Label */}
      <div className="asset-name truncate" style={{ fontSize: 10 }}>
        {clip.operatorLabel}
      </div>

      {/* Timecodes */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 8,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          padding: '0 4px 2px',
        }}
      >
        <span>{clip.timecodeIn}</span>
        <span>{clip.timecodeOut}</span>
      </div>
    </div>
  );
}

// ─── Quick Recall Buttons ──────────────────────────────────────────────────

function QuickRecallButtons() {
  const { highlights, selectHighlight, evsClips, selectEVSClip } = useSportsStore();

  // Show the most recent key moments for quick recall
  const keyMoments = useMemo(() => {
    const scoring = highlights
      .filter((h) => ['GOAL', 'TOUCHDOWN', 'HOME_RUN', 'THREE_POINTER', 'DUNK', 'FIELD_GOAL'].includes(h.type))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 4);
    return scoring;
  }, [highlights]);

  const handleRecall = useCallback((highlightId: string, clipIds: string[]) => {
    selectHighlight(highlightId);
    if (clipIds.length > 0) {
      selectEVSClip(clipIds[0]!);
    }
  }, [selectHighlight, selectEVSClip]);

  if (keyMoments.length === 0) {
    return null;
  }

  return (
    <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', padding: '2px 4px', marginBottom: 2 }}>
        QUICK RECALL
      </div>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {keyMoments.map((hl) => (
          <button
            key={hl.id}
            className="tl-btn"
            onClick={() => handleRecall(hl.id, hl.clipIds)}
            style={{
              padding: '3px 8px',
              fontSize: 9,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm, 4px)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            title={hl.description}
          >
            {hl.type.replace(/_/g, ' ')} - {new Date(hl.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── EVSBrowser Component ──────────────────────────────────────────────────

export function EVSBrowser() {
  const {
    evsClips,
    evsFilterAngle,
    evsFilterSearch,
    evsSelectedClipId,
    evsConnectionStatus,
    setEVSFilterAngle,
    setEVSFilterSearch,
    selectEVSClip,
  } = useSportsStore();

  const [eventTypeFilter, setEventTypeFilter] = useState<string | null>(null);

  // Filtered clips
  const filteredClips = useMemo(() => {
    let clips = [...evsClips];

    // Filter by camera angle
    if (evsFilterAngle) {
      clips = clips.filter((c) => c.cameraAngle === evsFilterAngle);
    }

    // Filter by search text
    if (evsFilterSearch) {
      const lower = evsFilterSearch.toLowerCase();
      clips = clips.filter(
        (c) =>
          c.operatorLabel.toLowerCase().includes(lower) ||
          c.tags.some((t) => t.toLowerCase().includes(lower)),
      );
    }

    // Filter by event type tag
    if (eventTypeFilter) {
      clips = clips.filter((c) => c.tags.includes(eventTypeFilter));
    }

    // Sort newest first
    clips.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return clips;
  }, [evsClips, evsFilterAngle, evsFilterSearch, eventTypeFilter]);

  // Available angles from current clips
  const availableAngles = useMemo(() => {
    const angles = new Set(evsClips.map((c) => c.cameraAngle));
    return ALL_FILTERABLE_ANGLES.filter((a) => angles.has(a));
  }, [evsClips]);

  // Available event type tags from current clips
  const availableEventTags = useMemo(() => {
    const tags = new Set<string>();
    for (const clip of evsClips) {
      for (const tag of clip.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags).sort();
  }, [evsClips]);

  const handleSelectClip = useCallback((clipId: string) => {
    selectEVSClip(clipId);
  }, [selectEVSClip]);

  return (
    <div className="bin-panel" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="panel-header">
        <span className="panel-title">EVS Browser</span>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background:
              evsConnectionStatus === 'CONNECTED' ? '#22c55e' :
              evsConnectionStatus === 'CONNECTING' ? '#f59e0b' :
              '#ef4444',
            display: 'inline-block',
            flexShrink: 0,
            boxShadow: evsConnectionStatus === 'CONNECTED' ? '0 0 4px #22c55e' : 'none',
          }}
          title={`EVS: ${evsConnectionStatus}`}
        />
        <span style={{ color: 'var(--text-muted)', fontSize: 10, marginRight: 'auto' }}>
          {evsConnectionStatus}
        </span>
      </div>

      {/* Search */}
      <div className="bin-search">
        <input
          type="text"
          placeholder="Search clips..."
          value={evsFilterSearch}
          onChange={(e) => setEVSFilterSearch(e.target.value)}
        />
      </div>

      {/* Camera Angle Filter */}
      <div
        style={{
          display: 'flex',
          gap: 3,
          padding: '4px 8px',
          borderBottom: '1px solid var(--border-subtle)',
          flexWrap: 'wrap',
        }}
      >
        <button
          className={`panel-tab${evsFilterAngle === null ? ' active' : ''}`}
          onClick={() => setEVSFilterAngle(null)}
          style={{ fontSize: 9, padding: '2px 6px' }}
        >
          All
        </button>
        {availableAngles.map((angle) => (
          <button
            key={angle}
            className={`panel-tab${evsFilterAngle === angle ? ' active' : ''}`}
            onClick={() => setEVSFilterAngle(evsFilterAngle === angle ? null : angle)}
            style={{ fontSize: 9, padding: '2px 6px' }}
          >
            {CAMERA_ANGLE_LABELS[angle] ?? angle}
          </button>
        ))}
      </div>

      {/* Event Type Filter */}
      {availableEventTags.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 3,
            padding: '4px 8px',
            borderBottom: '1px solid var(--border-subtle)',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, padding: '2px 0', letterSpacing: '0.04em' }}>
            TYPE:
          </span>
          <button
            className={`panel-tab${eventTypeFilter === null ? ' active' : ''}`}
            onClick={() => setEventTypeFilter(null)}
            style={{ fontSize: 9, padding: '2px 6px' }}
          >
            All
          </button>
          {availableEventTags.slice(0, 8).map((tag) => (
            <button
              key={tag}
              className={`panel-tab${eventTypeFilter === tag ? ' active' : ''}`}
              onClick={() => setEventTypeFilter(eventTypeFilter === tag ? null : tag)}
              style={{ fontSize: 9, padding: '2px 6px' }}
            >
              {tag.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}

      {/* Quick Recall */}
      <QuickRecallButtons />

      {/* Clip Grid */}
      <div className="panel-body" style={{ flex: 1, overflow: 'auto' }}>
        {filteredClips.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
            {evsClips.length === 0
              ? 'No EVS clips available. Connect to EVS server to browse clips.'
              : 'No clips match the current filters.'}
          </div>
        ) : (
          <div className="asset-grid" style={{ padding: 4 }}>
            {filteredClips.map((clip) => (
              <EVSClipCard
                key={clip.clipId}
                clip={clip}
                isSelected={evsSelectedClipId === clip.clipId}
                onSelect={handleSelectClip}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 10px',
          background: 'var(--bg-void)',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: 10,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span>{filteredClips.length} clips</span>
        {evsFilterAngle && (
          <span style={{ color: 'var(--text-secondary)' }}>
            {CAMERA_ANGLE_LABELS[evsFilterAngle] ?? evsFilterAngle}
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          {evsConnectionStatus === 'CONNECTED' ? 'Live' : evsConnectionStatus}
        </span>
      </div>
    </div>
  );
}
