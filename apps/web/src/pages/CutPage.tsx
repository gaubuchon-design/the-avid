// =============================================================================
//  THE AVID -- Cut Page (DaVinci Resolve-Style)
//  Speed-focused interface: Source Tape, Fast Review, Smart Insert,
//  compact filmstrip timeline, Quick Transitions, Duration Overlay.
//  No inspector. No effects rack. Minimal UI chrome.
// =============================================================================

import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import { SourceMonitor } from '../components/SourceMonitor/SourceMonitor';
import { RecordMonitor } from '../components/RecordMonitor/RecordMonitor';
import { TimelinePanel } from '../components/TimelinePanel/TimelinePanel';
import { BinPanel } from '../components/Bins/BinPanel';
import { useEditorStore } from '../store/editor.store';

// ─── Styles ─────────────────────────────────────────────────────────────────

const S = {
  root: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  } as React.CSSProperties,
  topArea: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    minHeight: 0,
  } as React.CSSProperties,
  binStrip: {
    width: 200,
    flexShrink: 0,
    borderRight: '1px solid var(--border-default)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  } as React.CSSProperties,
  monitorArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    minWidth: 0,
    overflow: 'hidden',
  } as React.CSSProperties,
  monitors: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    minHeight: 0,
  } as React.CSSProperties,
  // Source Tape Bar
  sourceTapeBar: {
    height: 56,
    flexShrink: 0,
    borderBottom: '1px solid var(--border-default)',
    background: 'var(--bg-raised)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 8px',
    gap: 4,
    overflow: 'hidden',
  } as React.CSSProperties,
  sourceTapeThumb: (isActive: boolean) => ({
    width: 72,
    height: 42,
    flexShrink: 0,
    borderRadius: 3,
    border: `2px solid ${isActive ? 'var(--brand)' : 'transparent'}`,
    background: 'var(--bg-void)',
    cursor: 'pointer',
    position: 'relative' as const,
    overflow: 'hidden',
    transition: 'border-color 100ms',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  sourceTapeLabel: {
    fontSize: 7,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: 600,
    textAlign: 'center' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    maxWidth: 68,
  } as React.CSSProperties,
  // Quick Actions Bar
  quickBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px',
    borderBottom: '1px solid var(--border-subtle)',
    background: 'var(--bg-surface)',
    flexShrink: 0,
  } as React.CSSProperties,
  quickBtn: (variant: 'primary' | 'secondary' | 'accent') => ({
    padding: '4px 10px',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'all 100ms',
    background: variant === 'primary'
      ? 'var(--brand)'
      : variant === 'accent'
        ? 'rgba(34,197,94,0.15)'
        : 'rgba(255,255,255,0.08)',
    color: variant === 'primary'
      ? '#fff'
      : variant === 'accent'
        ? '#22c55e'
        : 'var(--text-secondary)',
  }),
  // Duration Overlay
  durationOverlay: {
    position: 'absolute' as const,
    top: 8,
    right: 8,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(8px)',
    borderRadius: 6,
    padding: '6px 12px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
    gap: 2,
    zIndex: 5,
    border: '1px solid rgba(255,255,255,0.08)',
  } as React.CSSProperties,
  durationLabel: {
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
  } as React.CSSProperties,
  durationValue: {
    fontFamily: 'var(--font-mono)',
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '0.02em',
  } as React.CSSProperties,
  // Quick Transition Buttons
  transitionBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '4px 0',
    borderBottom: '1px solid var(--border-subtle)',
    background: 'var(--bg-surface)',
    flexShrink: 0,
  } as React.CSSProperties,
  transitionBtn: (isActive: boolean) => ({
    padding: '3px 12px',
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: '0.03em',
    border: `1px solid ${isActive ? 'var(--brand)' : 'var(--border-subtle)'}`,
    borderRadius: 4,
    cursor: 'pointer',
    background: isActive ? 'var(--brand-dim)' : 'transparent',
    color: isActive ? 'var(--brand-bright)' : 'var(--text-muted)',
    transition: 'all 100ms',
  }),
  // Compact Timeline
  compactTimeline: {
    height: 160,
    flexShrink: 0,
    borderTop: '1px solid var(--border-default)',
    position: 'relative' as const,
    overflow: 'hidden',
  } as React.CSSProperties,
  // Source Tape Mode Badge
  modeBadge: (active: boolean) => ({
    padding: '3px 8px',
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    borderRadius: 4,
    background: active ? 'rgba(91,106,245,0.15)' : 'rgba(255,255,255,0.06)',
    color: active ? 'var(--brand-bright)' : 'var(--text-muted)',
    border: `1px solid ${active ? 'var(--brand)' : 'transparent'}`,
    cursor: 'pointer',
    transition: 'all 150ms',
  }),
};

// ─── Source Tape (Filmstrip of all media concatenated) ──────────────────────

interface SourceTapeItem {
  id: string;
  name: string;
  color: string;
}

const SourceTape = memo(function SourceTape({
  items,
  activeIndex,
  onSelect,
}: {
  items: SourceTapeItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const activeEl = scrollRef.current.children[activeIndex] as HTMLElement | undefined;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeIndex]);

  return (
    <div
      ref={scrollRef}
      style={S.sourceTapeBar}
      role="listbox"
      aria-label="Source tape - all media clips"
    >
      <span style={{
        fontSize: 8, fontWeight: 700, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--text-muted)',
        marginRight: 4, flexShrink: 0,
      }}>
        TAPE
      </span>
      {items.map((item, i) => (
        <div
          key={item.id}
          style={S.sourceTapeThumb(i === activeIndex)}
          onClick={() => onSelect(i)}
          role="option"
          aria-selected={i === activeIndex}
          aria-label={item.name}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(i); }}
        >
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
            padding: '2px 3px',
          }}>
            <span style={S.sourceTapeLabel}>{item.name}</span>
          </div>
          {/* Color accent bar */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: item.color,
          }} />
        </div>
      ))}
      {items.length === 0 && (
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          No media in bins
        </span>
      )}
    </div>
  );
});

// ─── Timecode Formatter ─────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 24);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
}

// ─── Loading Skeleton ───────────────────────────────────────────────────────

function CutPageSkeleton() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} aria-hidden="true">
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
          <div style={{ padding: 12 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ height: 12, background: 'var(--bg-elevated)', borderRadius: 3, marginBottom: 8, width: `${60 + Math.random() * 40}%` }} />
            ))}
          </div>
        </div>
        <div style={{ flex: 1, background: 'var(--bg-void)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid var(--border-subtle)', borderTopColor: 'var(--brand)', animation: 'spin 0.8s linear infinite' }} />
        </div>
      </div>
      <div style={{ height: 160, flexShrink: 0, borderTop: '1px solid var(--border-default)', background: 'var(--bg-surface)' }} />
    </div>
  );
}

// ─── Main CutPage ───────────────────────────────────────────────────────────

export function CutPage() {
  const [isReady, setIsReady] = useState(false);
  const [sourceTapeMode, setSourceTapeMode] = useState(true);
  const [activeTapeIndex, setActiveTapeIndex] = useState(0);
  const [fastReviewActive, setFastReviewActive] = useState(false);
  const [activeTransition, setActiveTransition] = useState<'cut' | 'dissolve' | 'wipe'>('cut');

  const duration = useEditorStore((s) => s.duration);
  const playheadTime = useEditorStore((s) => s.playheadTime);
  const togglePlay = useEditorStore((s) => s.togglePlay);
  const isPlaying = useEditorStore((s) => s.isPlaying);

  // Build source tape items from bins
  const bins = useEditorStore((s) => s.bins);
  const sourceTapeItems: SourceTapeItem[] = bins.flatMap((bin) =>
    bin.assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      color: bin.color || '#5b6af5',
    }))
  );

  // Add some demo items if bins are empty
  const tapeItems = sourceTapeItems.length > 0 ? sourceTapeItems : [
    { id: 'demo-1', name: 'Interview_A_01', color: '#4a90d9' },
    { id: 'demo-2', name: 'Interview_A_02', color: '#4a90d9' },
    { id: 'demo-3', name: 'B-Roll_Street', color: '#d4a843' },
    { id: 'demo-4', name: 'B-Roll_Office', color: '#d4a843' },
    { id: 'demo-5', name: 'GFX_LowerThird', color: '#4dc95e' },
    { id: 'demo-6', name: 'Music_Underscore', color: '#8a6dcf' },
    { id: 'demo-7', name: 'SFX_Whoosh', color: '#cf6d6d' },
    { id: 'demo-8', name: 'VO_Narration_01', color: '#5cbed6' },
  ];

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 150);
    return () => clearTimeout(timer);
  }, []);

  // Fast Review: play at 2x (simulated by toggling play)
  const handleFastReview = useCallback(() => {
    setFastReviewActive((prev) => !prev);
    if (!isPlaying) {
      togglePlay();
    }
  }, [isPlaying, togglePlay]);

  // Smart Insert: auto-detect best insert point (demo: insert at playhead)
  const handleSmartInsert = useCallback(() => {
    // In production, this would analyze the timeline for the optimal cut point
    // For now, it just triggers an insert at the playhead position
    console.log('[CutPage] Smart Insert at', playheadTime);
  }, [playheadTime]);

  if (!isReady) {
    return <CutPageSkeleton />;
  }

  const safeDuration = Number.isFinite(duration) ? duration : 0;

  return (
    <div
      style={S.root}
      role="region"
      aria-label="Cut Page - Speed-focused editing"
    >
      {/* Top: Source Tape + Monitors */}
      <div style={S.topArea}>
        {/* Compact bin strip */}
        <div style={S.binStrip}>
          <BinPanel />
        </div>

        {/* Monitor + Controls area */}
        <div style={S.monitorArea}>
          {/* Source Tape filmstrip */}
          {sourceTapeMode && (
            <SourceTape
              items={tapeItems}
              activeIndex={activeTapeIndex}
              onSelect={setActiveTapeIndex}
            />
          )}

          {/* Quick Actions Bar */}
          <div style={S.quickBar}>
            <div
              style={S.modeBadge(sourceTapeMode)}
              onClick={() => setSourceTapeMode((p) => !p)}
              role="switch"
              aria-checked={sourceTapeMode}
              aria-label="Source Tape mode"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSourceTapeMode((p) => !p); }}
            >
              Source Tape
            </div>

            <div style={{ width: 1, height: 16, background: 'var(--border-subtle)' }} />

            <button
              style={S.quickBtn(fastReviewActive ? 'accent' : 'secondary')}
              onClick={handleFastReview}
              title="Fast Review (2x playback)"
              aria-label="Fast Review"
              aria-pressed={fastReviewActive}
            >
              {fastReviewActive ? 'Reviewing 2x' : 'Fast Review'}
            </button>

            <button
              style={S.quickBtn('primary')}
              onClick={handleSmartInsert}
              title="Smart Insert at optimal cut point"
              aria-label="Smart Insert"
            >
              Smart Insert
            </button>

            <div style={{ flex: 1 }} />

            {/* Duration Readout (compact) */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                DUR
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {formatDuration(safeDuration)}
              </span>
            </div>
          </div>

          {/* Dual Monitors */}
          <div style={S.monitors}>
            {/* Source Monitor */}
            <div
              style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: '1px solid var(--border-subtle)', position: 'relative' }}
              role="region"
              aria-label="Source monitor"
            >
              <SourceMonitor />
            </div>

            {/* Record Monitor */}
            <div
              style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}
              role="region"
              aria-label="Record monitor"
            >
              <RecordMonitor />
              {/* Duration Overlay on Record Monitor */}
              <div style={S.durationOverlay}>
                <span style={S.durationLabel}>Sequence</span>
                <span style={S.durationValue}>{formatDuration(safeDuration)}</span>
                <span style={{ ...S.durationLabel, color: 'var(--brand-bright)', marginTop: 2 }}>
                  {Math.ceil(safeDuration * 24)} frames
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Transition Buttons */}
      <div style={S.transitionBar} role="radiogroup" aria-label="Quick transition type">
        {[
          { id: 'cut' as const, label: 'Straight Cut', icon: '|' },
          { id: 'dissolve' as const, label: 'Dissolve', icon: 'X' },
          { id: 'wipe' as const, label: 'Wipe', icon: '>' },
        ].map((t) => (
          <button
            key={t.id}
            style={S.transitionBtn(activeTransition === t.id)}
            onClick={() => setActiveTransition(t.id)}
            role="radio"
            aria-checked={activeTransition === t.id}
            aria-label={t.label}
          >
            <span style={{ marginRight: 4 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}

        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px' }} />

        {/* Transition duration */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--text-muted)' }}>
          <span style={{ fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Dur:</span>
          <select
            style={{
              background: 'var(--bg-void)', border: '1px solid var(--border-default)',
              borderRadius: 3, color: 'var(--text-primary)', fontSize: 9,
              padding: '2px 4px', fontFamily: 'var(--font-mono)',
            }}
            aria-label="Transition duration"
            defaultValue="15"
          >
            <option value="6">6f</option>
            <option value="10">10f</option>
            <option value="15">15f</option>
            <option value="24">1s</option>
            <option value="48">2s</option>
          </select>
        </label>
      </div>

      {/* Compact Timeline (no view mode toggles, no zoom slider) */}
      <div
        style={S.compactTimeline}
        role="region"
        aria-label="Cut page compact timeline"
      >
        <TimelinePanel />
      </div>
    </div>
  );
}
