import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '../../store/editor.store';
import { createProjectInRepository } from '../../lib/projectRepository';
import {
  FRAME_RATE_OPTIONS,
  RESOLUTION_PRESETS,
  supportsDropFrame,
} from '../../lib/timecode';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface SequenceSettings {
  fps: number;
  resolutionIndex: number;
  dropFrame: boolean;
  sampleRate: number;
  bitDepth: number;
}

// ─── Inline Styles ──────────────────────────────────────────────────────────────

const S = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 9000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
  },

  dialog: {
    width: 520,
    maxHeight: 'calc(100vh - 80px)',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px 12px',
    borderBottom: '1px solid var(--border-subtle)',
  },

  headerTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '0.01em',
  },

  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: 18,
    cursor: 'pointer',
    padding: 4,
    lineHeight: 1,
    borderRadius: 'var(--radius-md)',
    transition: 'color 150ms, background 150ms',
  },

  body: {
    flex: 1,
    overflow: 'auto',
    padding: '20px',
  },

  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    padding: '12px 20px 16px',
    borderTop: '1px solid var(--border-subtle)',
  },

  fieldGroup: {
    marginBottom: 16,
  },

  label: {
    display: 'block',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-secondary)',
    marginBottom: 6,
  },

  input: {
    width: '100%',
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-primary)',
    fontSize: 13,
    padding: '8px 10px',
    outline: 'none',
    fontFamily: 'inherit',
    transition: 'border-color 100ms',
  },

  settingsRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 16,
  },

  settingsField: {
    flex: 1,
  },

  select: {
    width: '100%',
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-primary)',
    fontSize: 13,
    padding: '8px 10px',
    outline: 'none',
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'border-color 100ms',
    appearance: 'none' as const,
    backgroundImage:
      'url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\' fill=\'%238a9cb5\'%3e%3cpath d=\'M4.5 6l3.5 4 3.5-4z\'/%3e%3c/svg%3e")',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
    backgroundSize: 12,
    paddingRight: 28,
  },

  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    background: 'var(--bg-raised)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-subtle)',
    marginBottom: 16,
  },

  toggleLabel: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text-primary)',
  },

  toggleDesc: {
    fontSize: 10,
    color: 'var(--text-secondary)',
    marginTop: 2,
  },

  toggleTrack: (on: boolean, disabled: boolean) => ({
    width: 36,
    height: 20,
    borderRadius: 10,
    background: on ? 'var(--brand)' : 'var(--bg-overlay)',
    position: 'relative' as const,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.35 : 1,
    transition: 'background 200ms',
    flexShrink: 0,
    border: 'none',
    padding: 0,
  }),

  toggleThumb: (on: boolean) => ({
    position: 'absolute' as const,
    top: 2,
    left: on ? 18 : 2,
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#fff',
    transition: 'left 200ms',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  }),

  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
    marginBottom: 12,
    marginTop: 8,
  },

  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 18px',
    borderRadius: 'var(--radius-md)',
    fontSize: 12,
    fontWeight: 600,
    border: 'none',
    background: 'var(--brand)',
    color: '#fff',
    cursor: 'pointer',
    transition: 'background 150ms, box-shadow 150ms',
    whiteSpace: 'nowrap' as const,
  },

  btnPrimaryDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },

  btnGhost: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    borderRadius: 'var(--radius-md)',
    fontSize: 12,
    fontWeight: 500,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'color 150ms',
    whiteSpace: 'nowrap' as const,
  },
} as const;

// ─── Audio Options ──────────────────────────────────────────────────────────────

const SAMPLE_RATE_OPTIONS = [
  { value: 48000, label: '48,000 Hz' },
  { value: 96000, label: '96,000 Hz' },
];

const BIT_DEPTH_OPTIONS = [
  { value: 16, label: '16-bit' },
  { value: 24, label: '24-bit' },
];

// ─── Component ──────────────────────────────────────────────────────────────────

export function NewProjectDialog() {
  const navigate = useNavigate();
  const showDialog = useEditorStore((s) => s.showNewProjectDialog);
  const toggleDialog = useEditorStore((s) => s.toggleNewProjectDialog);

  // ── Local State ─────────────────────────────────────────────────────────────

  const [projectName, setProjectName] = useState('');
  const [sequence, setSequence] = useState<SequenceSettings>({
    fps: 23.976,
    resolutionIndex: 0,
    dropFrame: false,
    sampleRate: 48000,
    bitDepth: 24,
  });
  const [isCreating, setIsCreating] = useState(false);

  // ── Derived Values ──────────────────────────────────────────────────────────

  const dropFrameAvailable = supportsDropFrame(sequence.fps);
  const canCreate = projectName.trim().length > 0;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleFpsChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const fps = parseFloat(e.target.value);
    setSequence((prev) => ({
      ...prev,
      fps,
      dropFrame: supportsDropFrame(fps) ? prev.dropFrame : false,
    }));
  }, []);

  const handleResolutionChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSequence((prev) => ({
      ...prev,
      resolutionIndex: parseInt(e.target.value, 10),
    }));
  }, []);

  const handleToggleDropFrame = useCallback(() => {
    if (!dropFrameAvailable) return;
    setSequence((prev) => ({ ...prev, dropFrame: !prev.dropFrame }));
  }, [dropFrameAvailable]);

  const handleSampleRateChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSequence((prev) => ({ ...prev, sampleRate: parseInt(e.target.value, 10) }));
  }, []);

  const handleBitDepthChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSequence((prev) => ({ ...prev, bitDepth: parseInt(e.target.value, 10) }));
  }, []);

  const handleClose = useCallback(() => {
    toggleDialog();
    setProjectName('');
    setSequence({ fps: 23.976, resolutionIndex: 0, dropFrame: false, sampleRate: 48000, bitDepth: 24 });
    setIsCreating(false);
  }, [toggleDialog]);

  const handleCreate = useCallback(async () => {
    if (!projectName.trim() || isCreating) return;

    setIsCreating(true);
    try {
      const project = await createProjectInRepository({
        name: projectName.trim(),
      });

      handleClose();
      navigate(`/editor/${project.id}`);
    } catch (err) {
      console.error('[NewProjectDialog] Failed to create project:', err);
      setIsCreating(false);
    }
  }, [projectName, isCreating, handleClose, navigate]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        handleClose();
      }
    },
    [handleClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    },
    [handleClose]
  );

  // ── Render Guards ───────────────────────────────────────────────────────────

  if (!showDialog) return null;

  // ── Main Render ─────────────────────────────────────────────────────────────

  return (
    <div
      style={S.overlay}
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="New Project"
    >
      <div style={S.dialog}>
        {/* Header */}
        <div style={S.header}>
          <span style={S.headerTitle}>New Project</span>
          <button
            type="button"
            style={S.closeBtn}
            onClick={handleClose}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
              (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
              (e.currentTarget as HTMLElement).style.background = 'none';
            }}
            aria-label="Close dialog"
          >
            {'\u2715'}
          </button>
        </div>

        {/* Body */}
        <div style={S.body}>
          {/* Project Name */}
          <div style={S.fieldGroup}>
            <label style={S.label} htmlFor="npd-name">
              Project Name
            </label>
            <input
              id="npd-name"
              type="text"
              style={S.input}
              placeholder="Untitled Project"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onFocus={(e) => {
                (e.target as HTMLInputElement).style.borderColor = 'var(--brand)';
              }}
              onBlur={(e) => {
                (e.target as HTMLInputElement).style.borderColor = 'var(--border-default)';
              }}
              autoFocus
              maxLength={120}
            />
          </div>

          {/* Video Settings */}
          <div style={S.sectionLabel}>Video</div>

          <div style={S.settingsRow}>
            <div style={S.settingsField}>
              <label style={S.label} htmlFor="npd-fps">
                Frame Rate
              </label>
              <select
                id="npd-fps"
                style={S.select}
                value={sequence.fps}
                onChange={handleFpsChange}
              >
                {FRAME_RATE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={S.settingsField}>
              <label style={S.label} htmlFor="npd-res">
                Resolution
              </label>
              <select
                id="npd-res"
                style={S.select}
                value={sequence.resolutionIndex}
                onChange={handleResolutionChange}
              >
                {RESOLUTION_PRESETS.map((preset, i) => (
                  <option key={`${preset.width}x${preset.height}`} value={i}>
                    {preset.label} ({preset.width}{'\u00D7'}{preset.height})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={S.toggleRow}>
            <div>
              <div style={S.toggleLabel}>Drop-Frame Timecode</div>
              <div style={S.toggleDesc}>
                {dropFrameAvailable
                  ? 'Available for NTSC frame rates (29.97, 59.94)'
                  : 'Not available for the selected frame rate'}
              </div>
            </div>
            <button
              type="button"
              style={S.toggleTrack(sequence.dropFrame, !dropFrameAvailable)}
              onClick={handleToggleDropFrame}
              role="switch"
              aria-checked={sequence.dropFrame}
              aria-label="Toggle drop-frame timecode"
            >
              <div style={S.toggleThumb(sequence.dropFrame)} />
            </button>
          </div>

          {/* Audio Settings */}
          <div style={S.sectionLabel}>Audio</div>

          <div style={S.settingsRow}>
            <div style={S.settingsField}>
              <label style={S.label} htmlFor="npd-sr">
                Sample Rate
              </label>
              <select
                id="npd-sr"
                style={S.select}
                value={sequence.sampleRate}
                onChange={handleSampleRateChange}
              >
                {SAMPLE_RATE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={S.settingsField}>
              <label style={S.label} htmlFor="npd-bd">
                Bit Depth
              </label>
              <select
                id="npd-bd"
                style={S.select}
                value={sequence.bitDepth}
                onChange={handleBitDepthChange}
              >
                {BIT_DEPTH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <button
            type="button"
            style={S.btnGhost}
            onClick={handleClose}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            style={{
              ...S.btnPrimary,
              ...(!canCreate || isCreating ? S.btnPrimaryDisabled : {}),
            }}
            disabled={!canCreate || isCreating}
            onClick={handleCreate}
            onMouseEnter={(e) => {
              if (canCreate && !isCreating) {
                (e.currentTarget as HTMLElement).style.background = 'var(--brand-bright)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 0 16px rgba(109,76,250,0.3)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'var(--brand)';
              (e.currentTarget as HTMLElement).style.boxShadow = 'none';
            }}
          >
            {isCreating ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NewProjectDialog;
