import React, { useCallback, useEffect, useState } from 'react';
import { useEditorStore } from '../../store/editor.store';
import { SourceMonitor } from '../SourceMonitor/SourceMonitor';
import { RecordMonitor } from '../RecordMonitor/RecordMonitor';
import { MonitorArea } from '../Monitor/MonitorArea';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Internal layout modes for the ComposerPanel.
 *
 * The editor store has two states:
 *   - 'source-record' -> dual side-by-side monitors
 *   - 'full-frame'    -> single record monitor (default current behavior)
 *
 * We add a local 'full-source' mode for source-only viewing since the store
 * does not carry that variant.
 */
type ComposerLayoutMode = 'source-record' | 'full-source' | 'full-record';

// ─── Layout toggle button icons (inline SVG) ───────────────────────────────

function DualIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <line x1="12" y1="3" x2="12" y2="21" />
    </svg>
  );
}

function SourceIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <rect x="3" y="4" width="9" height="16" rx="1" fill="currentColor" opacity="0.25" />
    </svg>
  );
}

function RecordIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <rect x="12" y="4" width="9" height="16" rx="1" fill="currentColor" opacity="0.25" />
    </svg>
  );
}

function FullscreenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Map the store's composerLayout value to our internal mode. */
function storeToMode(storeLayout: 'source-record' | 'full-frame'): ComposerLayoutMode {
  return storeLayout === 'source-record' ? 'source-record' : 'full-record';
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ComposerPanel() {
  const composerLayout = useEditorStore((s) => s.composerLayout);
  const setComposerLayout = useEditorStore((s) => s.setComposerLayout);
  const fullscreenMonitor = useEditorStore((s) => s.fullscreenMonitor);
  const poppedOutMonitor = useEditorStore((s) => s.poppedOutMonitor);
  const toggleFullscreenMonitor = useEditorStore((s) => s.toggleFullscreenMonitor);

  // Local state for 'full-source' since the store only has 'source-record' | 'full-frame'
  const [sourceOnly, setSourceOnly] = useState(false);

  // Derive the effective layout mode
  const mode: ComposerLayoutMode = sourceOnly ? 'full-source' : storeToMode(composerLayout);

  const isDual = mode === 'source-record';
  const isSingleSource = mode === 'full-source';
  const isSingleRecord = mode === 'full-record';

  // ── Keyboard shortcut: Shift+F for fullscreen toggle ──────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'F' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        // Determine which monitor to fullscreen based on current layout
        const activeMonitor = isDual ? 'record' : isSingleSource ? 'source' : 'record';
        toggleFullscreenMonitor(activeMonitor);

        // Use Fullscreen API
        if (!document.fullscreenElement) {
          const monitorSlots = document.querySelectorAll('.composer-panel-monitor-slot');
          const target = isDual ? monitorSlots[1] : monitorSlots[0];
          if (target) {
            (target as HTMLElement).requestFullscreen?.().catch(() => {});
          }
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDual, isSingleSource, toggleFullscreenMonitor]);

  // Listen for fullscreen exit events to sync state
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && fullscreenMonitor) {
        useEditorStore.getState().setFullscreenMonitor(null);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [fullscreenMonitor]);

  // ── Layout switching callbacks ──────────────────────────────────────────

  const handleSetDual = useCallback(() => {
    setSourceOnly(false);
    setComposerLayout('source-record');
  }, [setComposerLayout]);

  const handleSetFullSource = useCallback(() => {
    setSourceOnly(true);
    // Keep the store in a non-source-record state so other consumers
    // know we are not in dual mode.
    setComposerLayout('full-frame');
  }, [setComposerLayout]);

  const handleSetFullRecord = useCallback(() => {
    setSourceOnly(false);
    setComposerLayout('full-frame');
  }, [setComposerLayout]);

  // ── Fullscreen toggle handler ──────────────────────────────────────────

  const handleFullscreenToggle = useCallback(() => {
    const activeMonitor = isDual ? 'record' : isSingleSource ? 'source' : 'record';
    toggleFullscreenMonitor(activeMonitor);

    if (!document.fullscreenElement) {
      const monitorSlots = document.querySelectorAll('.composer-panel-monitor-slot');
      const target = isDual ? monitorSlots[1] : monitorSlots[0];
      if (target) {
        (target as HTMLElement).requestFullscreen?.().catch(() => {});
      }
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, [isDual, isSingleSource, toggleFullscreenMonitor]);

  // ── Active monitor label ────────────────────────────────────────────────

  const activeLabel = isDual
    ? 'Source | Record'
    : isSingleSource
      ? 'Source'
      : 'Record';

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="composer-panel">
      {/* Toolbar strip */}
      <div className="composer-panel-toolbar">
        <div className="composer-panel-toolbar-group">
          <button
            className={`composer-panel-layout-btn${isDual ? ' active' : ''}`}
            onClick={handleSetDual}
            title="Dual: Source | Record"
            aria-pressed={isDual}
          >
            <DualIcon />
          </button>
          <button
            className={`composer-panel-layout-btn${isSingleSource ? ' active' : ''}`}
            onClick={handleSetFullSource}
            title="Source Only"
            aria-pressed={isSingleSource}
          >
            <SourceIcon />
          </button>
          <button
            className={`composer-panel-layout-btn${isSingleRecord ? ' active' : ''}`}
            onClick={handleSetFullRecord}
            title="Record Only"
            aria-pressed={isSingleRecord}
          >
            <RecordIcon />
          </button>

          {/* Separator */}
          <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px' }} />

          {/* Fullscreen toggle */}
          <button
            className={`composer-panel-layout-btn${fullscreenMonitor ? ' active' : ''}`}
            onClick={handleFullscreenToggle}
            title="Fullscreen Playback (Shift+F)"
            aria-pressed={!!fullscreenMonitor}
            aria-label="Toggle fullscreen playback"
          >
            <FullscreenIcon />
          </button>
        </div>

        <span className="composer-panel-active-label">
          {activeLabel}
          {fullscreenMonitor && (
            <span style={{
              marginLeft: 6, fontSize: 9, fontWeight: 700, color: 'var(--brand-bright)',
              background: 'var(--accent-muted)', padding: '1px 5px', borderRadius: 3,
              letterSpacing: 0.5, verticalAlign: 'middle',
            }}>FULLSCREEN</span>
          )}
          {poppedOutMonitor && (
            <span style={{
              marginLeft: 6, fontSize: 9, fontWeight: 600, color: 'var(--text-muted)',
              background: 'var(--bg-void)', padding: '1px 5px', borderRadius: 3,
              border: '1px solid var(--border-subtle)', letterSpacing: 0.3, verticalAlign: 'middle',
            }}>{poppedOutMonitor === 'source' ? 'SRC' : 'REC'} POPPED</span>
          )}
        </span>
      </div>

      {/* Monitor area */}
      <div
        className={`composer-panel-monitors ${isDual ? 'composer-panel-dual' : 'composer-panel-single'}`}
      >
        {isDual && (
          <>
            {poppedOutMonitor !== 'source' && (
              <div className="composer-panel-monitor-slot">
                <SourceMonitor />
              </div>
            )}
            {poppedOutMonitor === 'source' && (
              <div className="composer-panel-monitor-slot" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-void)', borderRadius: 'var(--radius-md)',
                border: '1px dashed var(--border-subtle)',
              }}>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, display: 'block', margin: '0 auto 6px' }}>
                    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                    <path d="M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5" />
                  </svg>
                  Source Monitor popped out
                  <br />
                  <button
                    className="tl-btn"
                    style={{ marginTop: 6, fontSize: 10 }}
                    onClick={() => useEditorStore.getState().setPoppedOutMonitor(null)}
                    aria-label="Restore source monitor"
                  >Restore</button>
                </div>
              </div>
            )}
            {poppedOutMonitor !== 'record' && (
              <div className="composer-panel-monitor-slot">
                <RecordMonitor />
              </div>
            )}
            {poppedOutMonitor === 'record' && (
              <div className="composer-panel-monitor-slot" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-void)', borderRadius: 'var(--radius-md)',
                border: '1px dashed var(--border-subtle)',
              }}>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, display: 'block', margin: '0 auto 6px' }}>
                    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                    <path d="M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5" />
                  </svg>
                  Record Monitor popped out
                  <br />
                  <button
                    className="tl-btn"
                    style={{ marginTop: 6, fontSize: 10 }}
                    onClick={() => useEditorStore.getState().setPoppedOutMonitor(null)}
                    aria-label="Restore record monitor"
                  >Restore</button>
                </div>
              </div>
            )}
          </>
        )}

        {isSingleSource && (
          <div className="composer-panel-monitor-slot">
            <SourceMonitor />
          </div>
        )}

        {isSingleRecord && (
          <div className="composer-panel-monitor-slot">
            <MonitorArea />
          </div>
        )}
      </div>
    </div>
  );
}
