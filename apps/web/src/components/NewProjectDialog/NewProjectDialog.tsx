import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '../../store/editor.store';
import { createProjectInRepository } from '../../lib/projectRepository';
import {
  FRAME_RATE_OPTIONS,
  RESOLUTION_PRESETS,
  supportsDropFrame,
} from '../../lib/timecode';
import type { ProjectTemplate } from '@mcua/core';

// ─── Types ──────────────────────────────────────────────────────────────────────

type WorkspacePersona = 'filmtv' | 'news' | 'sports' | 'creator' | 'marketing';

interface PersonaConfig {
  icon: string;
  name: string;
  desc: string;
  fps: number;
  dropFrame?: boolean;
  template: ProjectTemplate;
  resolution: { width: number; height: number };
}

interface SequenceSettings {
  fps: number;
  resolutionIndex: number;
  dropFrame: boolean;
}

type DialogStep = 0 | 1 | 2;

// ─── Persona Definitions ────────────────────────────────────────────────────────

const PERSONA_MAP: Record<WorkspacePersona, PersonaConfig> = {
  filmtv: {
    icon: '\uD83C\uDFAC',
    name: 'Film & TV',
    desc: 'Full timeline, color grading, audio mixing',
    fps: 23.976,
    template: 'film',
    resolution: { width: 1920, height: 1080 },
  },
  news: {
    icon: '\uD83D\uDCE1',
    name: 'News',
    desc: 'Rundown, script panel, fast turnaround',
    fps: 29.97,
    dropFrame: true,
    template: 'news',
    resolution: { width: 1920, height: 1080 },
  },
  sports: {
    icon: '\u26A1',
    name: 'Sports',
    desc: 'Multi-cam, slow-mo, instant replay',
    fps: 59.94,
    dropFrame: true,
    template: 'sports',
    resolution: { width: 3840, height: 2160 },
  },
  creator: {
    icon: '\uD83D\uDCF1',
    name: 'Creator',
    desc: 'Social formats, templates, quick export',
    fps: 30,
    template: 'social',
    resolution: { width: 1080, height: 1920 },
  },
  marketing: {
    icon: '\uD83C\uDFF7',
    name: 'Marketing',
    desc: 'Multi-variant, A/B testing, brand assets',
    fps: 30,
    template: 'commercial',
    resolution: { width: 1920, height: 1080 },
  },
};

const PERSONA_KEYS: WorkspacePersona[] = ['filmtv', 'news', 'sports', 'creator', 'marketing'];

const STEP_LABELS = ['Workspace', 'Details', 'Sequence'] as const;

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
    width: 560,
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

  stepBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '12px 20px',
    borderBottom: '1px solid var(--border-subtle)',
  },

  stepDot: (active: boolean, completed: boolean) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: active
      ? 'var(--brand)'
      : completed
        ? 'var(--brand-bright)'
        : 'var(--bg-overlay)',
    transition: 'background 200ms, transform 200ms',
    transform: active ? 'scale(1.25)' : 'scale(1)',
  }),

  stepLabel: (active: boolean) => ({
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    transition: 'color 200ms',
  }),

  stepConnector: {
    width: 24,
    height: 1,
    background: 'var(--border-default)',
    flexShrink: 0,
  },

  body: {
    flex: 1,
    overflow: 'auto',
    padding: '20px',
    minHeight: 280,
  },

  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px 16px',
    borderTop: '1px solid var(--border-subtle)',
  },

  // Step 1 — Persona cards
  personaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10,
  },

  personaCard: (selected: boolean) => ({
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 6,
    padding: '16px 10px 14px',
    borderRadius: 'var(--radius-md)',
    border: `1.5px solid ${selected ? 'var(--brand)' : 'var(--border-default)'}`,
    background: selected ? 'var(--accent-muted)' : 'var(--bg-raised)',
    cursor: 'pointer',
    transition: 'all 150ms',
    textAlign: 'center' as const,
  }),

  personaIcon: {
    fontSize: 28,
    lineHeight: 1,
  },

  personaName: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-primary)',
    lineHeight: 1.2,
  },

  personaDesc: {
    fontSize: 10,
    color: 'var(--text-secondary)',
    lineHeight: 1.3,
  },

  // Step 2 — Project details
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

  textarea: {
    width: '100%',
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-primary)',
    fontSize: 13,
    padding: '8px 10px',
    outline: 'none',
    fontFamily: 'inherit',
    resize: 'vertical' as const,
    minHeight: 64,
    transition: 'border-color 100ms',
  },

  tagContainer: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
    marginTop: 6,
  },

  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--accent-muted)',
    color: 'var(--brand-bright)',
    fontSize: 11,
    fontWeight: 500,
  },

  tagRemove: {
    background: 'none',
    border: 'none',
    color: 'var(--brand-bright)',
    cursor: 'pointer',
    fontSize: 12,
    lineHeight: 1,
    padding: 0,
    opacity: 0.7,
  },

  // Step 3 — Sequence settings
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

  previewBox: {
    marginTop: 16,
    padding: '12px 14px',
    background: 'var(--bg-raised)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-subtle)',
  },

  previewTitle: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
    marginBottom: 8,
  },

  previewValue: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--text-secondary)',
    lineHeight: 1.7,
  },

  // Buttons
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

  btnSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    borderRadius: 'var(--radius-md)',
    fontSize: 12,
    fontWeight: 500,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'background 150ms, color 150ms',
    whiteSpace: 'nowrap' as const,
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

// ─── Component ──────────────────────────────────────────────────────────────────

export function NewProjectDialog() {
  const navigate = useNavigate();
  const showDialog = useEditorStore((s) => s.showNewProjectDialog);
  const toggleDialog = useEditorStore((s) => s.toggleNewProjectDialog);

  // ── Local State ─────────────────────────────────────────────────────────────

  const [step, setStep] = useState<DialogStep>(0);
  const [persona, setPersona] = useState<WorkspacePersona | null>(null);

  // Step 2 fields
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Step 3 fields
  const [sequence, setSequence] = useState<SequenceSettings>({
    fps: 23.976,
    resolutionIndex: 0,
    dropFrame: false,
  });

  const [isCreating, setIsCreating] = useState(false);

  // ── Derived Values ──────────────────────────────────────────────────────────

  const selectedResolution = RESOLUTION_PRESETS[sequence.resolutionIndex];
  const dropFrameAvailable = supportsDropFrame(sequence.fps);

  const canProceed = useMemo(() => {
    switch (step) {
      case 0:
        return persona !== null;
      case 1:
        return projectName.trim().length > 0;
      case 2:
        return true;
      default:
        return false;
    }
  }, [step, persona, projectName]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSelectPersona = useCallback((key: WorkspacePersona) => {
    setPersona(key);
    const config = PERSONA_MAP[key];
    const resIdx = RESOLUTION_PRESETS.findIndex(
      (r) => r.width === config.resolution.width && r.height === config.resolution.height
    );
    setSequence({
      fps: config.fps,
      resolutionIndex: resIdx >= 0 ? resIdx : 0,
      dropFrame: config.dropFrame ?? false,
    });
  }, []);

  const handleNext = useCallback(() => {
    if (step < 2) {
      setStep((step + 1) as DialogStep);
    }
  }, [step]);

  const handleBack = useCallback(() => {
    if (step > 0) {
      setStep((step - 1) as DialogStep);
    }
  }, [step]);

  const handleAddTag = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const value = tagInput.trim().replace(/,/g, '');
        if (value && !tags.includes(value) && tags.length < 10) {
          setTags((prev) => [...prev, value]);
        }
        setTagInput('');
      }
    },
    [tagInput, tags]
  );

  const handleRemoveTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

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

  const handleClose = useCallback(() => {
    toggleDialog();
    // Reset on close
    setStep(0);
    setPersona(null);
    setProjectName('');
    setProjectDescription('');
    setTags([]);
    setTagInput('');
    setSequence({ fps: 23.976, resolutionIndex: 0, dropFrame: false });
    setIsCreating(false);
  }, [toggleDialog]);

  const handleCreate = useCallback(async () => {
    if (!persona || !projectName.trim() || isCreating) return;

    setIsCreating(true);
    try {
      const config = PERSONA_MAP[persona];
      const project = await createProjectInRepository({
        name: projectName.trim(),
        description: projectDescription.trim() || undefined,
        template: config.template,
        tags: tags.length > 0 ? tags : undefined,
      });

      handleClose();
      navigate(`/editor/${project.id}?workspace=${persona}`);
    } catch (err) {
      console.error('[NewProjectDialog] Failed to create project:', err);
      setIsCreating(false);
    }
  }, [persona, projectName, projectDescription, tags, isCreating, handleClose, navigate]);

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

  // ── Sub-Renders ─────────────────────────────────────────────────────────────

  const renderStepIndicator = () => (
    <div style={S.stepBar}>
      {STEP_LABELS.map((label, i) => (
        <React.Fragment key={label}>
          {i > 0 && <div style={S.stepConnector} />}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <div style={S.stepDot(i === step, i < step)} />
            <span style={S.stepLabel(i === step)}>{label}</span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );

  const renderPersonaStep = () => (
    <div>
      <p
        style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          marginBottom: 16,
          lineHeight: 1.5,
        }}
      >
        Choose a workspace that matches your production workflow.
        Each persona pre-configures panels, tools, and sequence defaults.
      </p>
      <div style={S.personaGrid}>
        {PERSONA_KEYS.map((key) => {
          const cfg = PERSONA_MAP[key];
          const selected = persona === key;
          return (
            <button
              key={key}
              type="button"
              style={S.personaCard(selected)}
              onClick={() => handleSelectPersona(key)}
              onMouseEnter={(e) => {
                if (!selected) {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)';
                  (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)';
                }
              }}
              onMouseLeave={(e) => {
                if (!selected) {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-default)';
                  (e.currentTarget as HTMLElement).style.background = 'var(--bg-raised)';
                }
              }}
            >
              <span style={S.personaIcon}>{cfg.icon}</span>
              <span style={S.personaName}>{cfg.name}</span>
              <span style={S.personaDesc}>{cfg.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderDetailsStep = () => (
    <div>
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

      <div style={S.fieldGroup}>
        <label style={S.label} htmlFor="npd-desc">
          Description
        </label>
        <textarea
          id="npd-desc"
          style={S.textarea}
          placeholder="Optional project description..."
          value={projectDescription}
          onChange={(e) => setProjectDescription(e.target.value)}
          onFocus={(e) => {
            (e.target as HTMLTextAreaElement).style.borderColor = 'var(--brand)';
          }}
          onBlur={(e) => {
            (e.target as HTMLTextAreaElement).style.borderColor = 'var(--border-default)';
          }}
          rows={3}
          maxLength={500}
        />
      </div>

      <div style={S.fieldGroup}>
        <label style={S.label} htmlFor="npd-tags">
          Tags
        </label>
        <input
          id="npd-tags"
          type="text"
          style={S.input}
          placeholder="Type a tag and press Enter..."
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleAddTag}
          onFocus={(e) => {
            (e.target as HTMLInputElement).style.borderColor = 'var(--brand)';
          }}
          onBlur={(e) => {
            (e.target as HTMLInputElement).style.borderColor = 'var(--border-default)';
          }}
          maxLength={40}
        />
        {tags.length > 0 && (
          <div style={S.tagContainer}>
            {tags.map((tag) => (
              <span key={tag} style={S.tag}>
                {tag}
                <button
                  type="button"
                  style={S.tagRemove}
                  onClick={() => handleRemoveTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                >
                  \u00D7
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderSequenceStep = () => (
    <div>
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
                {preset.label} ({preset.width}\u00D7{preset.height})
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

      <div style={S.previewBox}>
        <div style={S.previewTitle}>Sequence Summary</div>
        <div style={S.previewValue}>
          {selectedResolution
            ? `${selectedResolution.width} \u00D7 ${selectedResolution.height}`
            : 'Custom'}{' '}
          &middot;{' '}
          {FRAME_RATE_OPTIONS.find((o) => o.value === sequence.fps)?.label ?? `${sequence.fps}`}
          {sequence.dropFrame ? ' DF' : ' NDF'}
          <br />
          Workspace: {persona ? PERSONA_MAP[persona].name : '\u2014'}
          {projectName.trim() ? (
            <>
              <br />
              Project: {projectName.trim()}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );

  const renderStepContent = () => {
    switch (step) {
      case 0:
        return renderPersonaStep();
      case 1:
        return renderDetailsStep();
      case 2:
        return renderSequenceStep();
      default:
        return null;
    }
  };

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
            \u2715
          </button>
        </div>

        {/* Step Indicator */}
        {renderStepIndicator()}

        {/* Body */}
        <div style={S.body}>{renderStepContent()}</div>

        {/* Footer */}
        <div style={S.footer}>
          <div>
            {step > 0 ? (
              <button
                type="button"
                style={S.btnGhost}
                onClick={handleBack}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                }}
              >
                Back
              </button>
            ) : (
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
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {step < 2 ? (
              <button
                type="button"
                style={{
                  ...S.btnPrimary,
                  ...(canProceed ? {} : S.btnPrimaryDisabled),
                }}
                disabled={!canProceed}
                onClick={handleNext}
                onMouseEnter={(e) => {
                  if (canProceed) {
                    (e.currentTarget as HTMLElement).style.background = 'var(--brand-bright)';
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 0 16px rgba(0,200,150,0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'var(--brand)';
                  (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                }}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                style={{
                  ...S.btnPrimary,
                  ...(isCreating ? S.btnPrimaryDisabled : {}),
                }}
                disabled={isCreating}
                onClick={handleCreate}
                onMouseEnter={(e) => {
                  if (!isCreating) {
                    (e.currentTarget as HTMLElement).style.background = 'var(--brand-bright)';
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 0 16px rgba(0,200,150,0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'var(--brand)';
                  (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                }}
              >
                {isCreating ? 'Creating...' : 'Create Project'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default NewProjectDialog;
