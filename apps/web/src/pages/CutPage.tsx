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
      const activeEl = scrollRef.current.children[activeIndex + 1] as HTMLElement | undefined;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeIndex]);

  return (
    <div
      ref={scrollRef}
      className="cut-page__source-tape"
      role="listbox"
      aria-label="Source tape - all media clips"
    >
      <span className="cut-page__source-tape-label">TAPE</span>
      {items.map((item, i) => (
        <div
          key={item.id}
          className={`cut-page__tape-thumb${i === activeIndex ? ' is-active' : ''}`}
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
            <span className="cut-page__tape-thumb-label">{item.name}</span>
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
    <div className="cut-page" aria-hidden="true">
      <div className="cut-page__top">
        <div className="cut-page__bin-strip" style={{ background: 'var(--bg-surface)' }}>
          <div style={{ padding: 12 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 12, marginBottom: 8, width: `${60 + Math.random() * 40}%` }} />
            ))}
          </div>
        </div>
        <div style={{ flex: 1, background: 'var(--bg-void)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="loading-spinner-ring" />
        </div>
      </div>
      <div className="cut-page__timeline" style={{ background: 'var(--bg-surface)' }} />
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
    console.log('[CutPage] Smart Insert at', playheadTime);
  }, [playheadTime]);

  if (!isReady) {
    return <CutPageSkeleton />;
  }

  const safeDuration = Number.isFinite(duration) ? duration : 0;

  return (
    <div
      className="cut-page"
      role="region"
      aria-label="Cut Page - Speed-focused editing"
    >
      {/* Top: Source Tape + Monitors */}
      <div className="cut-page__top">
        {/* Compact bin strip */}
        <div className="cut-page__bin-strip">
          <BinPanel />
        </div>

        {/* Monitor + Controls area */}
        <div className="cut-page__monitor-area">
          {/* Source Tape filmstrip */}
          {sourceTapeMode && (
            <SourceTape
              items={tapeItems}
              activeIndex={activeTapeIndex}
              onSelect={setActiveTapeIndex}
            />
          )}

          {/* Quick Actions Bar */}
          <div className="cut-page__quick-bar">
            <div
              className={`cut-page__mode-badge${sourceTapeMode ? ' is-active' : ''}`}
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
              className={`cut-page__quick-btn ${fastReviewActive ? 'cut-page__quick-btn--accent' : 'cut-page__quick-btn--secondary'}`}
              onClick={handleFastReview}
              title="Fast Review (2x playback)"
              aria-label="Fast Review"
              aria-pressed={fastReviewActive}
            >
              {fastReviewActive ? 'Reviewing 2x' : 'Fast Review'}
            </button>

            <button
              className="cut-page__quick-btn cut-page__quick-btn--primary"
              onClick={handleSmartInsert}
              title="Smart Insert at optimal cut point"
              aria-label="Smart Insert"
            >
              Smart Insert
            </button>

            <div className="cut-page__quick-spacer" />

            {/* Duration Readout (compact) */}
            <div className="cut-page__dur-readout">
              <span className="cut-page__dur-label">DUR</span>
              <span className="cut-page__dur-value">{formatDuration(safeDuration)}</span>
            </div>
          </div>

          {/* Dual Monitors */}
          <div className="cut-page__monitors">
            {/* Source Monitor */}
            <div className="cut-page__monitor-slot" role="region" aria-label="Source monitor">
              <SourceMonitor />
            </div>

            {/* Record Monitor */}
            <div className="cut-page__monitor-slot" role="region" aria-label="Record monitor">
              <RecordMonitor />
              {/* Duration Overlay on Record Monitor */}
              <div className="cut-page__duration-overlay">
                <span className="cut-page__duration-overlay-label">Sequence</span>
                <span className="cut-page__duration-overlay-value">{formatDuration(safeDuration)}</span>
                <span className="cut-page__duration-overlay-frames">
                  {Math.ceil(safeDuration * 24)} frames
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Transition Buttons */}
      <div className="cut-page__transition-bar" role="radiogroup" aria-label="Quick transition type">
        {[
          { id: 'cut' as const, label: 'Straight Cut', icon: '|' },
          { id: 'dissolve' as const, label: 'Dissolve', icon: 'X' },
          { id: 'wipe' as const, label: 'Wipe', icon: '>' },
        ].map((t) => (
          <button
            key={t.id}
            className={`cut-page__transition-btn${activeTransition === t.id ? ' is-active' : ''}`}
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
        <div className="cut-page__transition-dur">
          <span className="cut-page__transition-dur-label">Dur:</span>
          <select aria-label="Transition duration" defaultValue="15">
            <option value="6">6f</option>
            <option value="10">10f</option>
            <option value="15">15f</option>
            <option value="24">1s</option>
            <option value="48">2s</option>
          </select>
        </div>
      </div>

      {/* Compact Timeline (no view mode toggles, no zoom slider) */}
      <div className="cut-page__timeline" role="region" aria-label="Cut page compact timeline">
        <TimelinePanel />
      </div>
    </div>
  );
}
