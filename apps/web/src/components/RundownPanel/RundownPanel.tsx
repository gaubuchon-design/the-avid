// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Rundown Panel (N-08)
//  Vertical news rundown panel showing active rundown stories with sortOrder,
//  slug, status badges, segment durations, total runtime, action buttons,
//  breaking news alert banner, and live mode toggle.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNewsStore } from '../../store/news.store';
import type { RundownEvent, StoryStatus } from '@mcua/core';

// ─── Constants ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<StoryStatus, { bg: string; text: string; label: string }> = {
  UNASSIGNED: { bg: 'rgba(156,163,175,0.15)', text: '#9ca3af', label: 'Unassigned' },
  IN_EDIT:    { bg: 'rgba(59,130,246,0.15)',   text: '#3b82f6', label: 'In Edit' },
  READY:      { bg: 'rgba(34,197,94,0.15)',    text: '#22c55e', label: 'Ready' },
  AIRED:      { bg: 'rgba(168,85,247,0.15)',   text: '#a855f7', label: 'Aired' },
  KILLED:     { bg: 'rgba(239,68,68,0.15)',    text: '#ef4444', label: 'Killed' },
};

const ROW_COLORS: Record<StoryStatus, string> = {
  UNASSIGNED: 'rgba(156,163,175,0.04)',
  IN_EDIT:    'rgba(59,130,246,0.06)',
  READY:      'rgba(34,197,94,0.06)',
  AIRED:      'rgba(168,85,247,0.04)',
  KILLED:     'rgba(239,68,68,0.04)',
};

// ─── Duration Helpers ──────────────────────────────────────────────────────

function formatRunsDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Status Badge ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: StoryStatus }) {
  const config = STATUS_COLORS[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--radius-sm, 4px)',
        background: config.bg,
        color: config.text,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      {config.label}
    </span>
  );
}

// ─── Breaking Alert Banner ─────────────────────────────────────────────────

function BreakingBanner() {
  const { breakingAlerts, acknowledgeAlert, showBreakingBanner, setShowBreakingBanner } = useNewsStore();
  const unacknowledged = breakingAlerts.filter((a) => !a.acknowledged);

  if (!showBreakingBanner || unacknowledged.length === 0) return null;

  const latest = unacknowledged[0];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 12px',
        background: 'rgba(239,68,68,0.12)',
        borderBottom: '1px solid rgba(239,68,68,0.3)',
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      <span
        style={{
          padding: '2px 8px',
          borderRadius: 'var(--radius-sm, 4px)',
          background: '#ef4444',
          color: '#fff',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.06em',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      >
        {latest!.priority!}
      </span>
      <span style={{ color: '#ef4444', flex: 1 }}>{latest!.message!}</span>
      {unacknowledged.length > 1 && (
        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
          +{unacknowledged.length - 1} more
        </span>
      )}
      <button
        className="tl-btn"
        onClick={() => acknowledgeAlert(latest!.id!)}
        style={{
          padding: '3px 10px',
          border: '1px solid rgba(239,68,68,0.4)',
          background: 'transparent',
          color: '#ef4444',
          fontSize: 10,
          fontWeight: 600,
        }}
      >
        ACK
      </button>
      <button
        className="tl-btn"
        onClick={() => setShowBreakingBanner(false)}
        style={{
          padding: '3px 6px',
          background: 'transparent',
          color: 'var(--text-muted)',
          fontSize: 12,
        }}
      >
        x
      </button>
    </div>
  );
}

// ─── Connection Status Dot ─────────────────────────────────────────────────

function ConnectionDot() {
  const { nrcsConnection } = useNewsStore();
  const status = nrcsConnection?.status ?? 'DISCONNECTED';

  const color =
    status === 'CONNECTED' ? '#22c55e' :
    status === 'CONNECTING' || status === 'RECONNECTING' ? '#f59e0b' :
    '#ef4444';

  return (
    <span
      title={`NRCS: ${status}`}
      style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        flexShrink: 0,
        boxShadow: status === 'CONNECTED' ? `0 0 4px ${color}` : 'none',
      }}
    />
  );
}

// ─── Segment Duration Summary ──────────────────────────────────────────────

function SegmentSummary({ stories }: { stories: RundownEvent[] }) {
  const segments = useMemo(() => {
    const map = new Map<string, { target: number; actual: number; count: number }>();
    for (const story of stories) {
      const seg = story.segment ?? 'Unsegmented';
      const entry = map.get(seg) ?? { target: 0, actual: 0, count: 0 };
      entry.target += story.targetDuration;
      entry.actual += story.actualDuration ?? 0;
      entry.count += 1;
      map.set(seg, entry);
    }
    return Array.from(map.entries());
  }, [stories]);

  if (segments.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '4px 12px',
        borderBottom: '1px solid var(--border-subtle)',
        fontSize: 9,
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
        flexWrap: 'wrap',
      }}
    >
      {segments.map(([seg, data]) => (
        <span key={seg}>
          <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>{seg}</span>
          {' '}
          {formatRunsDuration(data.target)}
          {data.actual > 0 && (
            <span style={{ color: 'var(--text-muted)' }}> / {formatRunsDuration(data.actual)}</span>
          )}
        </span>
      ))}
    </div>
  );
}

// ─── Story Row Actions ─────────────────────────────────────────────────────

function StoryRowActions({ story }: { story: RundownEvent }) {
  const { setStoryStatus } = useNewsStore();

  const handleAssign = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setStoryStatus(story.storyId, 'IN_EDIT');
  }, [story.storyId, setStoryStatus]);

  const handleMarkReady = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setStoryStatus(story.storyId, 'READY');
  }, [story.storyId, setStoryStatus]);

  const handleSendToAir = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setStoryStatus(story.storyId, 'AIRED');
  }, [story.storyId, setStoryStatus]);

  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {story.status === 'UNASSIGNED' && (
        <button
          className="tl-btn"
          onClick={handleAssign}
          title="Assign to me"
          style={{
            padding: '2px 6px',
            fontSize: 9,
            fontWeight: 600,
            color: '#9ca3af',
            background: 'rgba(156,163,175,0.1)',
            border: '1px solid rgba(156,163,175,0.2)',
            borderRadius: 'var(--radius-sm, 4px)',
          }}
        >
          Assign
        </button>
      )}
      {story.status === 'IN_EDIT' && (
        <button
          className="tl-btn"
          onClick={handleMarkReady}
          title="Mark Ready"
          style={{
            padding: '2px 6px',
            fontSize: 9,
            fontWeight: 600,
            color: '#22c55e',
            background: 'rgba(34,197,94,0.1)',
            border: '1px solid rgba(34,197,94,0.2)',
            borderRadius: 'var(--radius-sm, 4px)',
          }}
        >
          Ready
        </button>
      )}
      {story.status === 'READY' && (
        <button
          className="tl-btn"
          onClick={handleSendToAir}
          title="Send to Air"
          style={{
            padding: '2px 6px',
            fontSize: 9,
            fontWeight: 700,
            color: '#a855f7',
            background: 'rgba(168,85,247,0.1)',
            border: '1px solid rgba(168,85,247,0.2)',
            borderRadius: 'var(--radius-sm, 4px)',
          }}
        >
          Air
        </button>
      )}
    </div>
  );
}

// ─── MOS Connection Status ─────────────────────────────────────────────────

function MOSStatusBar() {
  const { nrcsConnection } = useNewsStore();
  if (!nrcsConnection) return null;

  const { status, serverName, mosId, lastHeartbeat } = nrcsConnection;
  const isConnected = status === 'CONNECTED';

  return (
    <div
      role="status"
      aria-label="MOS connection status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '3px 12px',
        borderBottom: '1px solid var(--border-subtle)',
        fontSize: 9,
        color: 'var(--text-muted)',
        background: isConnected ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)',
      }}
    >
      <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>MOS</span>
      {serverName && <span>{serverName}</span>}
      {mosId && <span style={{ fontFamily: 'var(--font-mono)' }}>{mosId}</span>}
      {lastHeartbeat && (
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>
          Last sync: {new Date(lastHeartbeat).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}

// ─── Playout Export Button ────────────────────────────────────────────────

function PlayoutExportButton() {
  const { playoutDestinations, activeRundownId, rundowns, exportToPlayout } = useNewsStore();
  const [isExporting, setIsExporting] = useState(false);

  const activeRundown = rundowns.find((r) => r.id === activeRundownId);
  const readyStories = activeRundown?.stories.filter((s) => s.status === 'READY') ?? [];

  const handleExport = useCallback(async () => {
    if (!activeRundownId || readyStories.length === 0) return;
    setIsExporting(true);
    try {
      for (const dest of playoutDestinations) {
        if (dest.isOnline) {
          exportToPlayout(activeRundownId, dest.id);
        }
      }
    } finally {
      setTimeout(() => setIsExporting(false), 1000);
    }
  }, [activeRundownId, readyStories.length, playoutDestinations, exportToPlayout]);

  const onlineDestinations = playoutDestinations.filter((d) => d.isOnline);

  return (
    <button
      className="tl-btn"
      onClick={handleExport}
      disabled={readyStories.length === 0 || isExporting || onlineDestinations.length === 0}
      aria-label={`Export ${readyStories.length} ready stories to playout`}
      title={
        onlineDestinations.length === 0
          ? 'No playout destinations online'
          : `Export ${readyStories.length} ready stories to ${onlineDestinations.length} destination(s)`
      }
      style={{
        padding: '2px 8px',
        fontSize: 10,
        fontWeight: 600,
        color: readyStories.length > 0 && onlineDestinations.length > 0 ? '#06b6d4' : 'var(--text-muted)',
        background: readyStories.length > 0 && onlineDestinations.length > 0 ? 'rgba(6,182,212,0.12)' : 'transparent',
        border: `1px solid ${readyStories.length > 0 && onlineDestinations.length > 0 ? 'rgba(6,182,212,0.3)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-sm, 4px)',
        opacity: readyStories.length === 0 || isExporting ? 0.5 : 1,
        cursor: readyStories.length === 0 || isExporting ? 'default' : 'pointer',
      }}
    >
      {isExporting ? 'Exporting...' : 'Export'}
    </button>
  );
}

// ─── RundownPanel Component ────────────────────────────────────────────────

export function RundownPanel() {
  const {
    rundowns,
    activeRundownId,
    activeStoryId,
    storyTimers,
    rundownFilter,
    isPolling,
    setActiveStory,
    setRundownFilter,
    setPolling,
    reorderStory,
  } = useNewsStore();

  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const activeRundown = useMemo(
    () => rundowns.find((r) => r.id === activeRundownId) ?? null,
    [rundowns, activeRundownId],
  );

  const filteredStories = useMemo(() => {
    if (!activeRundown) return [];
    if (rundownFilter === 'all') return activeRundown.stories;
    return activeRundown.stories.filter((s) => s.status === rundownFilter);
  }, [activeRundown, rundownFilter]);

  const handleStoryClick = useCallback(
    (storyId: string) => {
      setActiveStory(storyId);
    },
    [setActiveStory],
  );

  const totalTarget = useMemo(
    () => filteredStories.reduce((sum, s) => sum + s.targetDuration, 0),
    [filteredStories],
  );

  const totalActual = useMemo(
    () =>
      filteredStories.reduce((sum, s) => {
        const actual = storyTimers[s.storyId] ?? s.actualDuration;
        return sum + (actual ?? 0);
      }, 0),
    [filteredStories, storyTimers],
  );

  // Keyboard shortcuts for rundown navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      // Only handle when panel is focused or contains focus
      if (panelRef.current && !panelRef.current.contains(document.activeElement) && document.activeElement !== document.body) return;

      const currentIdx = filteredStories.findIndex((s) => s.storyId === activeStoryId);

      switch (e.key) {
        case 'ArrowDown':
        case 'j': {
          e.preventDefault();
          const nextIdx = Math.min(currentIdx + 1, filteredStories.length - 1);
          if (nextIdx >= 0 && filteredStories[nextIdx]) {
            setActiveStory(filteredStories[nextIdx].storyId);
          }
          break;
        }
        case 'ArrowUp':
        case 'k': {
          e.preventDefault();
          const prevIdx = Math.max(currentIdx - 1, 0);
          if (prevIdx >= 0 && filteredStories[prevIdx]) {
            setActiveStory(filteredStories[prevIdx].storyId);
          }
          break;
        }
        case 'Home': {
          e.preventDefault();
          if (filteredStories.length > 0) {
            setActiveStory(filteredStories[0]!.storyId);
          }
          break;
        }
        case 'End': {
          e.preventDefault();
          if (filteredStories.length > 0) {
            setActiveStory(filteredStories[filteredStories.length - 1]!.storyId);
          }
          break;
        }
        // L key to toggle live mode
        case 'l':
        case 'L': {
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setPolling(!isPolling);
          }
          break;
        }
      }

      // Alt+Arrow for reorder
      if (e.altKey && activeStoryId && currentIdx >= 0) {
        if (e.key === 'ArrowUp' && currentIdx > 0) {
          e.preventDefault();
          reorderStory(activeStoryId, currentIdx - 1);
        } else if (e.key === 'ArrowDown' && currentIdx < filteredStories.length - 1) {
          e.preventDefault();
          reorderStory(activeStoryId, currentIdx + 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredStories, activeStoryId, isPolling, setActiveStory, setPolling, reorderStory]);

  return (
    <div
      ref={panelRef}
      className="bin-panel"
      style={{ display: 'flex', flexDirection: 'column' }}
      role="region"
      aria-label="News rundown"
      tabIndex={0}
    >
      {/* Breaking News Banner */}
      <BreakingBanner />

      {/* MOS Connection Status */}
      <MOSStatusBar />

      {/* Header */}
      <div className="panel-header" role="toolbar" aria-label="Rundown controls">
        <span className="panel-title" id="rundown-panel-title">Rundown</span>
        <ConnectionDot />
        <span style={{ color: 'var(--text-muted)', fontSize: 11, marginRight: 'auto' }}>
          {activeRundown?.name ?? 'No rundown'}
        </span>

        {/* Playout Export */}
        <PlayoutExportButton />

        {/* Live Mode Toggle */}
        <button
          className="tl-btn"
          onClick={() => setPolling(!isPolling)}
          aria-pressed={isPolling}
          aria-label={isPolling ? 'Live mode enabled, press L to toggle' : 'Live mode disabled, press L to toggle'}
          title={isPolling ? 'Live mode ON - click to pause (L)' : 'Live mode OFF - click to resume (L)'}
          style={{
            padding: '2px 8px',
            fontSize: 10,
            fontWeight: 600,
            color: isPolling ? '#22c55e' : 'var(--text-muted)',
            background: isPolling ? 'rgba(34,197,94,0.12)' : 'transparent',
            border: `1px solid ${isPolling ? 'rgba(34,197,94,0.3)' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--radius-sm, 4px)',
          }}
        >
          {isPolling ? 'LIVE' : 'PAUSED'}
        </button>
      </div>

      {/* Filter Tabs */}
      <div
        className="panel-tabs"
        role="tablist"
        aria-label="Story status filter"
        style={{ display: 'flex', gap: 2, padding: '4px 8px', borderBottom: '1px solid var(--border-subtle)' }}
      >
        {(['all', 'UNASSIGNED', 'IN_EDIT', 'READY', 'AIRED', 'KILLED'] as const).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={rundownFilter === f}
            className={`panel-tab${rundownFilter === f ? ' active' : ''}`}
            onClick={() => setRundownFilter(f)}
            style={{ fontSize: 10, padding: '2px 7px' }}
          >
            {f === 'all' ? 'All' : STATUS_COLORS[f as StoryStatus]?.label ?? f}
          </button>
        ))}
      </div>

      {/* Total Runtime Bar */}
      <div
        role="status"
        aria-label={`Total runtime: target ${formatRunsDuration(totalTarget)}, actual ${formatRunsDuration(totalActual)}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '4px 12px',
          borderBottom: '1px solid var(--border-subtle)',
          fontSize: 10,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          background: 'var(--bg-void)',
        }}
      >
        <span>TOTAL</span>
        <span style={{ color: 'var(--text-secondary)' }}>TARGET {formatRunsDuration(totalTarget)}</span>
        <span style={{ color: 'var(--text-primary)' }}>ACTUAL {formatRunsDuration(totalActual)}</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-ui)' }}>
          {filteredStories.length} stories
        </span>
      </div>

      {/* Segment Durations */}
      <SegmentSummary stories={filteredStories} />

      {/* Column Headers */}
      <div
        role="row"
        aria-hidden="true"
        style={{
          display: 'grid',
          gridTemplateColumns: '28px 22px 1fr 60px 60px 70px 60px',
          gap: 4,
          padding: '4px 12px',
          borderBottom: '1px solid var(--border-subtle)',
          fontSize: 9,
          fontWeight: 600,
          color: 'var(--text-muted)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        <span>#</span>
        <span>PG</span>
        <span>SLUG</span>
        <span style={{ textAlign: 'right' }}>RUNS</span>
        <span style={{ textAlign: 'right' }}>ACTUAL</span>
        <span>STATUS</span>
        <span></span>
      </div>

      {/* Story Rows */}
      <div
        className="panel-body"
        role="listbox"
        aria-label="Rundown stories"
        aria-activedescendant={activeStoryId ?? undefined}
        style={{ flex: 1, overflow: 'auto' }}
      >
        {filteredStories.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
            {activeRundown ? 'No stories match the current filter.' : 'No rundown loaded. Connect to NRCS to load rundown.'}
          </div>
        )}

        {filteredStories.map((story) => {
          const isActive = story.storyId === activeStoryId;
          const isHovered = story.storyId === hoveredRow;
          const actualDuration = storyTimers[story.storyId] ?? story.actualDuration;
          const isKilled = story.status === 'KILLED';

          return (
            <div
              key={story.storyId}
              id={story.storyId}
              role="option"
              aria-selected={isActive}
              aria-label={`Story ${story.sortOrder + 1}: ${story.slugline}, status ${STATUS_COLORS[story.status].label}, duration ${formatRunsDuration(story.targetDuration)}`}
              onClick={() => handleStoryClick(story.storyId)}
              onMouseEnter={() => setHoveredRow(story.storyId)}
              onMouseLeave={() => setHoveredRow(null)}
              tabIndex={isActive ? 0 : -1}
              style={{
                display: 'grid',
                gridTemplateColumns: '28px 22px 1fr 60px 60px 70px 60px',
                gap: 4,
                padding: '5px 12px',
                cursor: 'pointer',
                background: isActive
                  ? 'var(--bg-active, rgba(124,92,252,0.08))'
                  : isHovered
                  ? 'var(--bg-hover, rgba(255,255,255,0.03))'
                  : ROW_COLORS[story.status],
                borderLeft: isActive ? '2px solid var(--accent, #7c5cfc)' : '2px solid transparent',
                opacity: isKilled ? 0.45 : 1,
                textDecoration: isKilled ? 'line-through' : 'none',
                transition: 'background 60ms',
                alignItems: 'center',
              }}
            >
              {/* Sort Order */}
              <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                {story.sortOrder + 1}
              </span>

              {/* Page Number */}
              <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                {story.pageNumber ?? ''}
              </span>

              {/* Slugline */}
              <span
                style={{
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {story.slugline}
                {story.segment && (
                  <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: 10 }}>
                    [{story.segment}]
                  </span>
                )}
              </span>

              {/* Target Duration */}
              <span
                style={{
                  textAlign: 'right',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--text-secondary)',
                }}
              >
                {formatRunsDuration(story.targetDuration)}
              </span>

              {/* Actual Duration */}
              <span
                style={{
                  textAlign: 'right',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: actualDuration !== undefined ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {actualDuration !== undefined ? formatRunsDuration(actualDuration) : '--:--'}
              </span>

              {/* Status Badge */}
              <StatusBadge status={story.status} />

              {/* Action Buttons */}
              <StoryRowActions story={story} />
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div
        role="status"
        aria-live="polite"
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
        <span>{filteredStories.length} stories</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          J/K: navigate | Alt+Arrow: reorder | L: live toggle
        </span>
        <span style={{ marginLeft: 'auto' }}>
          {isPolling ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
        </span>
      </div>
    </div>
  );
}
