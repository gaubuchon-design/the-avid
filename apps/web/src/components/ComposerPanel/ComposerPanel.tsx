import React, { useCallback, useState } from 'react';
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

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Map the store's composerLayout value to our internal mode. */
function storeToMode(storeLayout: 'source-record' | 'full-frame'): ComposerLayoutMode {
  return storeLayout === 'source-record' ? 'source-record' : 'full-record';
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ComposerPanel() {
  const composerLayout = useEditorStore((s) => s.composerLayout);
  const setComposerLayout = useEditorStore((s) => s.setComposerLayout);

  // Local state for 'full-source' since the store only has 'source-record' | 'full-frame'
  const [sourceOnly, setSourceOnly] = useState(false);

  // Derive the effective layout mode
  const mode: ComposerLayoutMode = sourceOnly ? 'full-source' : storeToMode(composerLayout);

  const isDual = mode === 'source-record';
  const isSingleSource = mode === 'full-source';
  const isSingleRecord = mode === 'full-record';

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
        </div>

        <span className="composer-panel-active-label">{activeLabel}</span>
      </div>

      {/* Monitor area */}
      <div
        className={`composer-panel-monitors ${isDual ? 'composer-panel-dual' : 'composer-panel-single'}`}
      >
        {isDual && (
          <>
            <div className="composer-panel-monitor-slot">
              <SourceMonitor />
            </div>
            <div className="composer-panel-monitor-slot">
              <RecordMonitor />
            </div>
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
