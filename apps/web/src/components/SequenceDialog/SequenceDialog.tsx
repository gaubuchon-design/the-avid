import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useEditorStore, type SequenceSettings } from '../../store/editor.store';
import {
  FRAME_RATE_OPTIONS,
  RESOLUTION_PRESETS,
  supportsDropFrame,
  Timecode,
} from '../../lib/timecode';

// =============================================================================
//  Sequence Dialog
// =============================================================================
//
//  Modal dialog for creating or editing a sequence. Exposes frame rate,
//  resolution, drop-frame, starting timecode, and audio sample rate settings.
//  Includes a live preview panel summarizing the final configuration.
// =============================================================================

// ---- Styles ----------------------------------------------------------------

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  backdropFilter: 'blur(4px)',
};

const dialog: React.CSSProperties = {
  width: 580,
  maxHeight: '88vh',
  background: 'var(--bg-surface, #1a1a2e)',
  color: 'var(--text-primary, #e0e0e0)',
  borderRadius: 'var(--radius-lg, 10px)',
  border: '1px solid var(--border-default, #2a2a40)',
  fontFamily: 'var(--font-display, system-ui), system-ui, sans-serif',
  fontSize: 12,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '0 24px 64px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255,255,255,0.04)',
};

const dialogHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
  borderBottom: '1px solid var(--border-default, #2a2a40)',
  background: 'var(--bg-elevated, #1e1e36)',
};

const dialogTitle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 14,
  letterSpacing: 0.2,
};

const closeButton: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 'var(--radius-md, 6px)',
  border: '1px solid var(--border-subtle, #222238)',
  background: 'transparent',
  color: 'var(--text-muted, #666)',
  fontSize: 16,
  lineHeight: 1,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const body: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '20px 20px 16px',
};

const section: React.CSSProperties = {
  marginBottom: 20,
};

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  color: 'var(--text-muted, #666)',
  marginBottom: 8,
};

const fieldRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 8,
};

const fieldLabel: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary, #aaa)',
  minWidth: 110,
  flexShrink: 0,
};

const textInput: React.CSSProperties = {
  flex: 1,
  padding: '7px 10px',
  border: '1px solid var(--border-default, #2a2a40)',
  borderRadius: 'var(--radius-md, 6px)',
  background: 'var(--bg-void, #0e0e1a)',
  color: 'var(--text-primary, #e0e0e0)',
  fontSize: 12,
  fontFamily: 'var(--font-display, system-ui), system-ui, sans-serif',
  outline: 'none',
};

const selectInput: React.CSSProperties = {
  flex: 1,
  padding: '7px 10px',
  border: '1px solid var(--border-default, #2a2a40)',
  borderRadius: 'var(--radius-md, 6px)',
  background: 'var(--bg-void, #0e0e1a)',
  color: 'var(--text-primary, #e0e0e0)',
  fontSize: 12,
  fontFamily: 'var(--font-display, system-ui), system-ui, sans-serif',
  outline: 'none',
  cursor: 'pointer',
};

const tcInput: React.CSSProperties = {
  ...textInput,
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace), monospace',
  letterSpacing: 1.2,
  textAlign: 'center' as const,
  maxWidth: 160,
};

const checkboxRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 8,
};

const checkboxLabel: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary, #aaa)',
  cursor: 'pointer',
  userSelect: 'none',
};

const disabledCheckboxLabel: React.CSSProperties = {
  ...checkboxLabel,
  opacity: 0.4,
  cursor: 'not-allowed',
};

const presetGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 6,
  marginBottom: 8,
};

const presetButton: React.CSSProperties = {
  padding: '8px 6px',
  borderRadius: 'var(--radius-md, 6px)',
  border: '1px solid var(--border-default, #2a2a40)',
  background: 'var(--bg-void, #0e0e1a)',
  color: 'var(--text-secondary, #aaa)',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  textAlign: 'center',
  transition: 'all 0.15s',
  lineHeight: 1.3,
};

const presetButtonActive: React.CSSProperties = {
  ...presetButton,
  border: '1px solid var(--brand, #5b6ef4)',
  background: 'var(--accent-muted, rgba(91,110,244,0.12))',
  color: 'var(--brand-bright, #7b8cff)',
};

const customResRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const resInput: React.CSSProperties = {
  ...textInput,
  width: 80,
  flex: 'none',
  textAlign: 'center' as const,
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace), monospace',
};

const resTimesSign: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-muted, #666)',
  fontWeight: 600,
};

const radioGroup: React.CSSProperties = {
  display: 'flex',
  gap: 16,
};

const radioLabel: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: 'var(--text-secondary, #aaa)',
  cursor: 'pointer',
  userSelect: 'none',
};

const previewPanel: React.CSSProperties = {
  background: 'var(--bg-elevated, #1e1e36)',
  border: '1px solid var(--border-subtle, #222238)',
  borderRadius: 'var(--radius-md, 6px)',
  padding: '14px 16px',
  marginTop: 4,
};

const previewTitle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  color: 'var(--text-muted, #666)',
  marginBottom: 10,
};

const previewRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '3px 0',
};

const previewKey: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted, #666)',
};

const previewValue: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-primary, #e0e0e0)',
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace), monospace',
};

const footer: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  padding: '14px 20px',
  borderTop: '1px solid var(--border-default, #2a2a40)',
  background: 'var(--bg-elevated, #1e1e36)',
};

const btnPrimary: React.CSSProperties = {
  padding: '9px 24px',
  borderRadius: 'var(--radius-md, 6px)',
  border: 'none',
  background: 'var(--brand, #5b6ef4)',
  color: '#fff',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
  letterSpacing: 0.3,
  transition: 'background 0.15s',
};

const btnSecondary: React.CSSProperties = {
  padding: '9px 20px',
  borderRadius: 'var(--radius-md, 6px)',
  border: '1px solid var(--border-default, #2a2a40)',
  background: 'transparent',
  color: 'var(--text-primary, #e0e0e0)',
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer',
  transition: 'border-color 0.15s',
};

const divider: React.CSSProperties = {
  height: 1,
  background: 'var(--border-subtle, #222238)',
  margin: '16px 0',
};

// ---- Helpers ---------------------------------------------------------------

/** Format a sample rate for display, e.g. 48000 -> "48 kHz". */
function formatSampleRate(rate: number): string {
  return `${rate / 1000} kHz`;
}

/** Validate a timecode string loosely (HH:MM:SS:FF or HH:MM:SS;FF). */
function isValidTimecodeFormat(tc: string): boolean {
  return /^\d{2}[:;]\d{2}[:;]\d{2}[:;]\d{2}$/.test(tc);
}

/**
 * Find the matching resolution preset for a given width/height,
 * or return null if it is a custom resolution.
 */
function findMatchingPreset(
  width: number,
  height: number,
): (typeof RESOLUTION_PRESETS)[number] | null {
  return (
    RESOLUTION_PRESETS.find((p) => p.width === width && p.height === height) ??
    null
  );
}

const SAMPLE_RATE_OPTIONS = [44100, 48000, 96000] as const;

// ---- Component -------------------------------------------------------------

export const SequenceDialog: React.FC = () => {
  // -- Store bindings --------------------------------------------------------

  const sequenceSettings = useEditorStore((s) => s.sequenceSettings);
  const updateSequenceSettings = useEditorStore(
    (s) => s.updateSequenceSettings,
  );
  const showSequenceDialog = useEditorStore((s) => s.showSequenceDialog);
  const toggleSequenceDialog = useEditorStore((s) => s.toggleSequenceDialog);

  // -- Local draft state (mirrors store, committed on save) ------------------

  const [name, setName] = useState(sequenceSettings.name);
  const [fps, setFps] = useState(sequenceSettings.fps);
  const [dropFrame, setDropFrame] = useState(sequenceSettings.dropFrame);
  const [width, setWidth] = useState(sequenceSettings.width);
  const [height, setHeight] = useState(sequenceSettings.height);
  const [sampleRate, setSampleRate] = useState(sequenceSettings.sampleRate);
  const [startTCString, setStartTCString] = useState('');

  // Whether we're editing an existing sequence (has a non-default name)
  const isEditing = sequenceSettings.name !== '' && sequenceSettings.name !== 'Untitled Sequence';

  // Sync local state when the dialog opens with fresh store values.
  useEffect(() => {
    if (showSequenceDialog) {
      setName(sequenceSettings.name);
      setFps(sequenceSettings.fps);
      setDropFrame(sequenceSettings.dropFrame);
      setWidth(sequenceSettings.width);
      setHeight(sequenceSettings.height);
      setSampleRate(sequenceSettings.sampleRate);

      // Convert startTC frames to a display string.
      const tc = new Timecode({
        fps: sequenceSettings.fps,
        dropFrame: sequenceSettings.dropFrame,
      });
      setStartTCString(tc.framesToTC(sequenceSettings.startTC));
    }
  }, [showSequenceDialog]); // eslint-disable-line react-hooks/exhaustive-deps

  // -- Derived values --------------------------------------------------------

  const dropFrameAllowed = useMemo(() => supportsDropFrame(fps), [fps]);

  // Disable drop-frame when switching to a non-DF frame rate.
  useEffect(() => {
    if (!dropFrameAllowed && dropFrame) {
      setDropFrame(false);
    }
  }, [dropFrameAllowed, dropFrame]);

  const activePreset = useMemo(
    () => findMatchingPreset(width, height),
    [width, height],
  );

  const tcSeparator = dropFrame ? ';' : ':';

  const fpsLabel = useMemo(() => {
    const opt = FRAME_RATE_OPTIONS.find((o) => o.value === fps);
    return opt ? opt.label : `${fps}`;
  }, [fps]);

  const aspectRatio = useMemo(() => {
    if (height === 0) return '--';
    const ratio = width / height;
    // Common ratios
    if (Math.abs(ratio - 16 / 9) < 0.01) return '16:9';
    if (Math.abs(ratio - 9 / 16) < 0.01) return '9:16';
    if (Math.abs(ratio - 4 / 3) < 0.01) return '4:3';
    if (Math.abs(ratio - 2.39) < 0.02) return '2.39:1';
    if (Math.abs(ratio - 1.85) < 0.02) return '1.85:1';
    if (Math.abs(ratio - 1) < 0.01) return '1:1';
    return ratio.toFixed(2) + ':1';
  }, [width, height]);

  // -- Handlers --------------------------------------------------------------

  const handleFpsChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newFps = Number(e.target.value);
      setFps(newFps);

      // Recalculate the start TC display for the new frame rate.
      const newDf = supportsDropFrame(newFps) ? dropFrame : false;
      const tc = new Timecode({ fps: newFps, dropFrame: newDf });
      // Preserve the current start TC display as-is if it's valid; otherwise reset.
      if (isValidTimecodeFormat(startTCString)) {
        // Re-parse using current string to stay stable on rate switch.
        setStartTCString(startTCString);
      } else {
        setStartTCString(tc.framesToTC(0));
      }
    },
    [dropFrame, startTCString],
  );

  const handlePresetClick = useCallback(
    (preset: (typeof RESOLUTION_PRESETS)[number]) => {
      setWidth(preset.width);
      setHeight(preset.height);
    },
    [],
  );

  const handleWidthChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseInt(e.target.value, 10);
      if (!isNaN(v) && v >= 0) setWidth(v);
      else if (e.target.value === '') setWidth(0);
    },
    [],
  );

  const handleHeightChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseInt(e.target.value, 10);
      if (!isNaN(v) && v >= 0) setHeight(v);
      else if (e.target.value === '') setHeight(0);
    },
    [],
  );

  const handleStartTCChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setStartTCString(e.target.value);
    },
    [],
  );

  const handleSave = useCallback(() => {
    // Convert the timecode string back to a frame offset.
    let startFrames = 0;
    if (isValidTimecodeFormat(startTCString)) {
      const tc = new Timecode({ fps, dropFrame });
      startFrames = tc.tcToFrames(startTCString);
    }

    const patch: Partial<SequenceSettings> = {
      name: name.trim() || 'Untitled Sequence',
      fps,
      dropFrame: dropFrameAllowed ? dropFrame : false,
      startTC: Math.max(0, startFrames),
      width: Math.max(1, width),
      height: Math.max(1, height),
      sampleRate,
    };

    updateSequenceSettings(patch);
    toggleSequenceDialog();
  }, [
    name,
    fps,
    dropFrame,
    dropFrameAllowed,
    startTCString,
    width,
    height,
    sampleRate,
    updateSequenceSettings,
    toggleSequenceDialog,
  ]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) toggleSequenceDialog();
    },
    [toggleSequenceDialog],
  );

  // Keyboard: Escape closes, Enter saves.
  useEffect(() => {
    if (!showSequenceDialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleSequenceDialog();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSequenceDialog, toggleSequenceDialog, handleSave]);

  // -- Render ----------------------------------------------------------------

  if (!showSequenceDialog) return null;

  return (
    <div style={overlay} onClick={handleBackdropClick} role="presentation">
      <div
        style={dialog}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Sequence Settings"
        aria-modal="true"
      >
        {/* ---- Header ---- */}
        <div style={dialogHeader}>
          <span style={dialogTitle}>
            {isEditing ? 'Edit Sequence' : 'New Sequence'}
          </span>
          <button
            type="button"
            style={closeButton}
            onClick={toggleSequenceDialog}
            aria-label="Close"
          >
            &#x2715;
          </button>
        </div>

        {/* ---- Body ---- */}
        <div style={body}>
          {/* Name */}
          <div style={section}>
            <div style={sectionLabel}>Sequence Name</div>
            <div style={fieldRow}>
              <input
                type="text"
                style={{ ...textInput, fontSize: 14, fontWeight: 600 }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Untitled Sequence"
                autoFocus
              />
            </div>
          </div>

          {/* Frame Rate + Drop Frame */}
          <div style={section}>
            <div style={sectionLabel}>Timebase</div>
            <div style={fieldRow}>
              <span style={fieldLabel}>Frame Rate</span>
              <select
                style={selectInput}
                value={fps}
                onChange={handleFpsChange}
              >
                {FRAME_RATE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={checkboxRow}>
              <input
                type="checkbox"
                id="seq-drop-frame"
                checked={dropFrame}
                disabled={!dropFrameAllowed}
                onChange={(e) => setDropFrame(e.target.checked)}
              />
              <label
                htmlFor="seq-drop-frame"
                style={
                  dropFrameAllowed ? checkboxLabel : disabledCheckboxLabel
                }
              >
                Drop Frame Timecode
                {!dropFrameAllowed && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 10,
                      color: 'var(--text-muted, #666)',
                    }}
                  >
                    (only 29.97 / 59.94)
                  </span>
                )}
              </label>
            </div>
          </div>

          {/* Resolution */}
          <div style={section}>
            <div style={sectionLabel}>Resolution</div>

            <div style={presetGrid}>
              {RESOLUTION_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  style={
                    activePreset?.label === preset.label
                      ? presetButtonActive
                      : presetButton
                  }
                  onClick={() => handlePresetClick(preset)}
                >
                  {preset.label}
                  <br />
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 400,
                      color: 'var(--text-muted, #666)',
                      fontFamily:
                        'var(--font-mono, "JetBrains Mono", monospace), monospace',
                    }}
                  >
                    {preset.width} x {preset.height}
                  </span>
                </button>
              ))}
            </div>

            <div style={{ ...fieldRow, marginTop: 8 }}>
              <span style={fieldLabel}>Custom Size</span>
              <div style={customResRow}>
                <input
                  type="number"
                  style={resInput}
                  value={width || ''}
                  onChange={handleWidthChange}
                  placeholder="W"
                  min={1}
                />
                <span style={resTimesSign}>&times;</span>
                <input
                  type="number"
                  style={resInput}
                  value={height || ''}
                  onChange={handleHeightChange}
                  placeholder="H"
                  min={1}
                />
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--text-muted, #666)',
                    marginLeft: 4,
                  }}
                >
                  ({aspectRatio})
                </span>
              </div>
            </div>
          </div>

          {/* Starting Timecode */}
          <div style={section}>
            <div style={sectionLabel}>Starting Timecode</div>
            <div style={fieldRow}>
              <span style={fieldLabel}>Start TC</span>
              <input
                type="text"
                style={tcInput}
                value={startTCString}
                onChange={handleStartTCChange}
                placeholder={`00${tcSeparator}00${tcSeparator}00${tcSeparator}00`}
                spellCheck={false}
              />
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--text-muted, #666)',
                }}
              >
                HH{tcSeparator}MM{tcSeparator}SS{tcSeparator}FF
              </span>
            </div>
          </div>

          {/* Audio Sample Rate */}
          <div style={section}>
            <div style={sectionLabel}>Audio</div>
            <div style={fieldRow}>
              <span style={fieldLabel}>Sample Rate</span>
              <div style={radioGroup}>
                {SAMPLE_RATE_OPTIONS.map((rate) => (
                  <label key={rate} style={radioLabel}>
                    <input
                      type="radio"
                      name="seq-sample-rate"
                      value={rate}
                      checked={sampleRate === rate}
                      onChange={() => setSampleRate(rate)}
                    />
                    {formatSampleRate(rate)}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div style={divider} />

          {/* Preview Panel */}
          <div style={previewPanel}>
            <div style={previewTitle}>Settings Summary</div>

            <div style={previewRow}>
              <span style={previewKey}>Name</span>
              <span style={previewValue}>
                {name.trim() || 'Untitled Sequence'}
              </span>
            </div>
            <div style={previewRow}>
              <span style={previewKey}>Frame Rate</span>
              <span style={previewValue}>
                {fpsLabel}
                {dropFrameAllowed && dropFrame ? ' DF' : ' NDF'}
              </span>
            </div>
            <div style={previewRow}>
              <span style={previewKey}>Resolution</span>
              <span style={previewValue}>
                {width} x {height}
                {activePreset ? ` (${activePreset.label})` : ''}
              </span>
            </div>
            <div style={previewRow}>
              <span style={previewKey}>Aspect Ratio</span>
              <span style={previewValue}>{aspectRatio}</span>
            </div>
            <div style={previewRow}>
              <span style={previewKey}>Starting TC</span>
              <span style={previewValue}>
                {isValidTimecodeFormat(startTCString)
                  ? startTCString
                  : '--:--:--:--'}
              </span>
            </div>
            <div style={previewRow}>
              <span style={previewKey}>Audio</span>
              <span style={previewValue}>
                {formatSampleRate(sampleRate)}
              </span>
            </div>
          </div>
        </div>

        {/* ---- Footer ---- */}
        <div style={footer}>
          <button
            type="button"
            style={btnSecondary}
            onClick={toggleSequenceDialog}
          >
            Cancel
          </button>
          <button type="button" style={btnPrimary} onClick={handleSave}>
            {isEditing ? 'Update Sequence' : 'Create Sequence'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SequenceDialog;
