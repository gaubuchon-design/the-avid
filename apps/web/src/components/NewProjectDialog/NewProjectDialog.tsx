import type { ProjectTemplate } from '@mcua/core';
import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '../../store/editor.store';
import { createProjectInRepository } from '../../lib/projectRepository';
import {
  FRAME_RATE_OPTIONS,
  RESOLUTION_PRESETS,
  supportsDropFrame,
} from '../../lib/timecode';
import {
  buildProjectCreationOptions,
  EDITORIAL_TEMPLATE_OPTIONS,
  getProjectCreationTemplateConfig,
} from '../../lib/projectCreation';

interface SequenceState {
  fps: number;
  resolutionIndex: number;
  dropFrame: boolean;
}

const TEMPLATE_COPY: Record<ProjectTemplate, { badge: string; accent: string }> = {
  film: { badge: 'Offline edit', accent: '#5b6af5' },
  documentary: { badge: 'Story cut', accent: '#f59e0b' },
  commercial: { badge: 'Client review', accent: '#22c55e' },
  podcast: { badge: 'Audio-first', accent: '#06b6d4' },
  sports: { badge: 'Legacy', accent: '#fb7185' },
  social: { badge: 'Legacy', accent: '#a855f7' },
  news: { badge: 'Legacy', accent: '#94a3b8' },
};

function getResolutionIndex(template: ProjectTemplate): number {
  const templateConfig = getProjectCreationTemplateConfig(template);
  const index = RESOLUTION_PRESETS.findIndex((preset) => (
    preset.width === templateConfig.sequence.width
    && preset.height === templateConfig.sequence.height
  ));
  return index >= 0 ? index : 0;
}

function getInitialSequence(template: ProjectTemplate): SequenceState {
  const templateConfig = getProjectCreationTemplateConfig(template);
  return {
    fps: templateConfig.sequence.fps,
    resolutionIndex: getResolutionIndex(template),
    dropFrame: templateConfig.sequence.dropFrame,
  };
}

function resetBorder(target: EventTarget | null): void {
  const element = target as HTMLElement | null;
  if (!element) {
    return;
  }
  element.style.borderColor = 'var(--border-default)';
}

const S = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 9000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: 'rgba(6, 10, 18, 0.82)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
  },
  dialog: {
    width: 'min(980px, calc(100vw - 48px))',
    maxHeight: 'calc(100vh - 48px)',
    display: 'grid',
    gridTemplateColumns: 'minmax(280px, 0.95fr) minmax(360px, 1.05fr)',
    background: 'linear-gradient(180deg, rgba(18, 25, 40, 0.98), rgba(10, 14, 22, 0.98))',
    border: '1px solid rgba(138, 156, 181, 0.2)',
    borderRadius: 24,
    boxShadow: '0 28px 80px rgba(0, 0, 0, 0.52)',
    overflow: 'hidden',
  },
  rail: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 18,
    padding: '28px 24px 24px',
    background: 'linear-gradient(180deg, rgba(18, 31, 54, 0.92), rgba(11, 18, 30, 0.98))',
    borderRight: '1px solid rgba(138, 156, 181, 0.14)',
  },
  body: {
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: 0,
  },
  bodyScroll: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '28px 28px 24px',
  },
  sectionLabel: {
    display: 'block',
    marginBottom: 8,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 30,
    fontWeight: 700,
    color: 'var(--text-primary)',
    lineHeight: 1.05,
  },
  subtitle: {
    margin: '10px 0 0',
    fontSize: 14,
    lineHeight: 1.6,
    color: 'var(--text-secondary)',
  },
  templateGrid: {
    display: 'grid',
    gap: 12,
  },
  templateCard: (selected: boolean, accent: string) => ({
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
    padding: '16px 16px 15px',
    borderRadius: 18,
    border: `1px solid ${selected ? accent : 'rgba(138, 156, 181, 0.14)'}`,
    background: selected
      ? `linear-gradient(180deg, ${accent}24, rgba(255, 255, 255, 0.02))`
      : 'rgba(255, 255, 255, 0.02)',
    boxShadow: selected ? `inset 0 0 0 1px ${accent}33` : 'none',
    textAlign: 'left' as const,
    cursor: 'pointer',
  }),
  templateBadge: (accent: string) => ({
    display: 'inline-flex',
    alignItems: 'center',
    width: 'fit-content',
    padding: '4px 8px',
    borderRadius: 999,
    background: `${accent}22`,
    color: accent,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  }),
  templateName: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  templateDesc: {
    fontSize: 13,
    lineHeight: 1.5,
    color: 'var(--text-secondary)',
  },
  summary: {
    padding: '16px 16px 18px',
    borderRadius: 18,
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(138, 156, 181, 0.14)',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    padding: '8px 0',
    fontSize: 12,
    color: 'var(--text-secondary)',
    borderBottom: '1px solid rgba(138, 156, 181, 0.08)',
  },
  summaryRowLast: {
    borderBottom: 'none',
  },
  summaryValue: {
    color: 'var(--text-primary)',
    fontWeight: 600,
    textAlign: 'right' as const,
  },
  topBar: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 24,
  },
  topBarCopy: {
    maxWidth: 420,
  },
  closeButton: {
    width: 34,
    height: 34,
    border: 'none',
    borderRadius: 999,
    background: 'rgba(255, 255, 255, 0.04)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: 1,
  },
  fieldGrid: {
    display: 'grid',
    gap: 18,
  },
  fieldGroup: {
    display: 'grid',
    gap: 8,
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 14,
    border: '1px solid var(--border-default)',
    background: 'rgba(9, 13, 20, 0.9)',
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 120ms ease',
  },
  textarea: {
    width: '100%',
    minHeight: 100,
    padding: '12px 14px',
    borderRadius: 14,
    border: '1px solid var(--border-default)',
    background: 'rgba(9, 13, 20, 0.9)',
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
    resize: 'vertical' as const,
    transition: 'border-color 120ms ease',
  },
  twoUp: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 14,
  },
  select: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 14,
    border: '1px solid var(--border-default)',
    background: 'rgba(9, 13, 20, 0.9)',
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
    appearance: 'none' as const,
  },
  switchRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: '14px 16px',
    borderRadius: 16,
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(138, 156, 181, 0.14)',
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  switchHelp: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 1.5,
    color: 'var(--text-secondary)',
  },
  switchTrack: (enabled: boolean, disabled: boolean) => ({
    width: 42,
    height: 24,
    border: 'none',
    borderRadius: 999,
    background: enabled ? 'var(--brand)' : 'rgba(138, 156, 181, 0.26)',
    opacity: disabled ? 0.45 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    position: 'relative' as const,
    flexShrink: 0,
  }),
  switchThumb: (enabled: boolean) => ({
    position: 'absolute' as const,
    top: 3,
    left: enabled ? 21 : 3,
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: '#fff',
    transition: 'left 120ms ease',
  }),
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: '18px 28px 22px',
    borderTop: '1px solid rgba(138, 156, 181, 0.12)',
    background: 'rgba(8, 12, 19, 0.9)',
  },
  footerNote: {
    fontSize: 12,
    lineHeight: 1.5,
    color: 'var(--text-secondary)',
  },
  actions: {
    display: 'flex',
    gap: 10,
  },
  buttonSecondary: {
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid rgba(138, 156, 181, 0.18)',
    background: 'rgba(255, 255, 255, 0.02)',
    color: 'var(--text-secondary)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  buttonPrimary: {
    padding: '10px 16px',
    borderRadius: 12,
    border: 'none',
    background: 'var(--brand)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
} as const;

export function NewProjectDialog() {
  const navigate = useNavigate();
  const showDialog = useEditorStore((state) => state.showNewProjectDialog);
  const toggleDialog = useEditorStore((state) => state.toggleNewProjectDialog);

  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate>('film');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [sequence, setSequence] = useState<SequenceState>(() => getInitialSequence('film'));
  const [isCreating, setIsCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);

  const templateConfig = useMemo(
    () => getProjectCreationTemplateConfig(selectedTemplate),
    [selectedTemplate],
  );
  const selectedResolution = RESOLUTION_PRESETS[sequence.resolutionIndex] ?? RESOLUTION_PRESETS[0];
  const dropFrameSupported = supportsDropFrame(sequence.fps);
  const canCreate = projectName.trim().length > 0 && !isCreating;

  const resetDialog = useCallback(() => {
    setSelectedTemplate('film');
    setProjectName('');
    setProjectDescription('');
    setSequence(getInitialSequence('film'));
    setIsCreating(false);
    setCreationError(null);
  }, []);

  const handleClose = useCallback(() => {
    resetDialog();
    toggleDialog();
  }, [resetDialog, toggleDialog]);

  const handleSelectTemplate = useCallback((template: ProjectTemplate) => {
    const defaults = getInitialSequence(template);
    setSelectedTemplate(template);
    setSequence(defaults);
    setCreationError(null);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!canCreate) {
      return;
    }

    setIsCreating(true);
    setCreationError(null);

    try {
      const project = await createProjectInRepository(buildProjectCreationOptions({
        workspace: 'filmtv',
        template: selectedTemplate,
        name: projectName.trim(),
        description: projectDescription.trim() || undefined,
        sequence: {
          fps: sequence.fps,
          width: selectedResolution.width,
          height: selectedResolution.height,
          dropFrame: sequence.dropFrame,
        },
      }));

      handleClose();
      navigate(`/editor/${project.id}`);
    } catch (error) {
      setIsCreating(false);
      setCreationError(error instanceof Error ? error.message : 'Failed to create project.');
    }
  }, [
    canCreate,
    handleClose,
    navigate,
    projectDescription,
    projectName,
    selectedResolution.height,
    selectedResolution.width,
    selectedTemplate,
    sequence.dropFrame,
    sequence.fps,
  ]);

  const handleOverlayClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  }, [handleClose]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      handleClose();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void handleCreate();
    }
  }, [handleClose, handleCreate]);

  if (!showDialog) {
    return null;
  }

  return (
    <div
      style={S.overlay}
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Create editorial project"
    >
      <div style={S.dialog}>
        <aside style={S.rail}>
          <div>
            <span style={S.sectionLabel}>Editorial Templates</span>
            <h2 style={S.title}>Start an edit with clean defaults.</h2>
            <p style={S.subtitle}>
              Pick the cut you are building, name it, and set the sequence once.
              The editor always opens in the same editorial workspace.
            </p>
          </div>

          <div style={S.templateGrid}>
            {EDITORIAL_TEMPLATE_OPTIONS.map((template) => {
              const config = getProjectCreationTemplateConfig(template);
              const accent = TEMPLATE_COPY[template].accent;
              const selected = template === selectedTemplate;
              return (
                <button
                  key={template}
                  type="button"
                  style={S.templateCard(selected, accent)}
                  onClick={() => handleSelectTemplate(template)}
                >
                  <span style={S.templateBadge(accent)}>{TEMPLATE_COPY[template].badge}</span>
                  <span style={S.templateName}>{config.name}</span>
                  <span style={S.templateDesc}>{config.description}</span>
                </button>
              );
            })}
          </div>

          <div style={S.summary}>
            <span style={S.sectionLabel}>Template Summary</span>
            <div style={S.summaryRow}>
              <span>Template</span>
              <span style={S.summaryValue}>{templateConfig.name}</span>
            </div>
            <div style={S.summaryRow}>
              <span>Workspace</span>
              <span style={S.summaryValue}>Editorial</span>
            </div>
            <div style={S.summaryRow}>
              <span>Layout</span>
              <span style={S.summaryValue}>{templateConfig.composerLayout === 'source-record' ? 'Source / Record' : 'Record'}</span>
            </div>
            <div style={{ ...S.summaryRow, ...S.summaryRowLast }}>
              <span>Default sequence</span>
              <span style={S.summaryValue}>
                {templateConfig.sequence.width} x {templateConfig.sequence.height}
                {' · '}
                {templateConfig.sequence.fps}
                fps
              </span>
            </div>
          </div>
        </aside>

        <div style={S.body}>
          <div style={S.bodyScroll}>
            <div style={S.topBar}>
              <div style={S.topBarCopy}>
                <span style={S.sectionLabel}>Project Setup</span>
                <h3 style={{ ...S.title, fontSize: 24 }}>Create editorial project</h3>
                <p style={S.subtitle}>
                  Keep this page tight: project identity on top, sequence settings below,
                  and no workflow personas competing for space.
                </p>
              </div>
              <button
                type="button"
                style={S.closeButton}
                onClick={handleClose}
                aria-label="Close project creation dialog"
              >
                X
              </button>
            </div>

            <div style={S.fieldGrid}>
              <div style={S.fieldGroup}>
                <label htmlFor="project-name" style={S.sectionLabel}>Project Name</label>
                <input
                  id="project-name"
                  type="text"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder={`${templateConfig.name} Cut`}
                  style={S.input}
                  autoFocus
                  onFocus={(event) => {
                    event.currentTarget.style.borderColor = 'var(--brand)';
                  }}
                  onBlur={(event) => resetBorder(event.target)}
                  maxLength={120}
                />
              </div>

              <div style={S.fieldGroup}>
                <label htmlFor="project-description" style={S.sectionLabel}>Notes</label>
                <textarea
                  id="project-description"
                  value={projectDescription}
                  onChange={(event) => setProjectDescription(event.target.value)}
                  placeholder="Optional editorial notes, client, or delivery context."
                  style={S.textarea}
                  onFocus={(event) => {
                    event.currentTarget.style.borderColor = 'var(--brand)';
                  }}
                  onBlur={(event) => resetBorder(event.target)}
                  maxLength={500}
                />
              </div>

              <div style={S.twoUp}>
                <div style={S.fieldGroup}>
                  <label htmlFor="project-fps" style={S.sectionLabel}>Frame Rate</label>
                  <select
                    id="project-fps"
                    value={sequence.fps}
                    onChange={(event) => {
                      const fps = Number.parseFloat(event.target.value);
                      setSequence((current) => ({
                        ...current,
                        fps,
                        dropFrame: supportsDropFrame(fps) ? current.dropFrame : false,
                      }));
                    }}
                    style={S.select}
                  >
                    {FRAME_RATE_OPTIONS.map((option) => (
                      <option key={option.label} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={S.fieldGroup}>
                  <label htmlFor="project-resolution" style={S.sectionLabel}>Resolution</label>
                  <select
                    id="project-resolution"
                    value={sequence.resolutionIndex}
                    onChange={(event) => {
                      setSequence((current) => ({
                        ...current,
                        resolutionIndex: Number.parseInt(event.target.value, 10),
                      }));
                    }}
                    style={S.select}
                  >
                    {RESOLUTION_PRESETS.map((preset, index) => (
                      <option key={`${preset.width}x${preset.height}`} value={index}>
                        {preset.label} ({preset.width} x {preset.height})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={S.switchRow}>
                <div>
                  <div style={S.switchLabel}>Drop-frame timecode</div>
                  <div style={S.switchHelp}>
                    {dropFrameSupported
                      ? 'Available for NTSC frame rates. Enable it when the show clock must stay aligned to runtime.'
                      : 'Unavailable for the current frame rate.'}
                  </div>
                </div>
                <button
                  type="button"
                  style={S.switchTrack(sequence.dropFrame, !dropFrameSupported)}
                  onClick={() => {
                    if (!dropFrameSupported) {
                      return;
                    }
                    setSequence((current) => ({
                      ...current,
                      dropFrame: !current.dropFrame,
                    }));
                  }}
                  role="switch"
                  aria-checked={sequence.dropFrame}
                  aria-label="Toggle drop-frame timecode"
                >
                  <span style={S.switchThumb(sequence.dropFrame)} />
                </button>
              </div>

              <div style={S.summary}>
                <span style={S.sectionLabel}>Project Output</span>
                <div style={S.summaryRow}>
                  <span>Sequence</span>
                  <span style={S.summaryValue}>
                    {selectedResolution.width} x {selectedResolution.height}
                  </span>
                </div>
                <div style={S.summaryRow}>
                  <span>Timebase</span>
                  <span style={S.summaryValue}>
                    {sequence.fps}
                    fps
                    {sequence.dropFrame ? ' DF' : ' NDF'}
                  </span>
                </div>
                <div style={S.summaryRow}>
                  <span>Workspace</span>
                  <span style={S.summaryValue}>Editorial</span>
                </div>
                <div style={{ ...S.summaryRow, ...S.summaryRowLast }}>
                  <span>Monitor layout</span>
                  <span style={S.summaryValue}>
                    {templateConfig.composerLayout === 'source-record' ? 'Source / Record' : 'Record only'}
                  </span>
                </div>
              </div>

              {creationError && (
                <div
                  role="alert"
                  style={{
                    padding: '12px 14px',
                    borderRadius: 14,
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.22)',
                    color: '#fca5a5',
                    fontSize: 13,
                  }}
                >
                  {creationError}
                </div>
              )}
            </div>
          </div>

          <footer style={S.footer}>
            <div style={S.footerNote}>
              Opens directly in the editorial page. Use Cmd/Ctrl+Enter to create.
            </div>
            <div style={S.actions}>
              <button type="button" style={S.buttonSecondary} onClick={handleClose}>
                Cancel
              </button>
              <button
                type="button"
                style={{
                  ...S.buttonPrimary,
                  ...(canCreate ? null : { opacity: 0.55, cursor: 'not-allowed' }),
                }}
                onClick={() => { void handleCreate(); }}
                disabled={!canCreate}
              >
                {isCreating ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

export default NewProjectDialog;
