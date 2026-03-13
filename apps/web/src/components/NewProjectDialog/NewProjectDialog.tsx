import type { ProjectTemplate } from '@mcua/core';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '../../store/editor.store';
import {
  createProjectInRepository,
  listProjectSummariesFromRepository,
} from '../../lib/projectRepository';
import {
  FRAME_RATE_OPTIONS,
  RESOLUTION_PRESETS,
  supportsDropFrame,
} from '../../lib/timecode';
import {
  buildProjectCreationOptions,
  buildSuggestedProjectName,
  EDITORIAL_TEMPLATE_OPTIONS,
  getProjectCreationTemplateConfig,
  getProjectCreationTemplateVisual,
} from '../../lib/projectCreation';
import { ProjectGlyph } from '../Projects/ProjectGlyph';

interface SequenceState {
  fps: number;
  resolutionIndex: number;
  dropFrame: boolean;
}

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
    background: 'rgba(4, 8, 14, 0.78)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
  },
  dialog: {
    width: 'min(720px, calc(100vw - 40px))',
    maxHeight: 'calc(100vh - 40px)',
    display: 'flex',
    flexDirection: 'column' as const,
    background: 'linear-gradient(180deg, rgba(12, 17, 25, 0.98), rgba(8, 12, 19, 0.98))',
    border: '1px solid rgba(138, 156, 181, 0.16)',
    borderRadius: 24,
    boxShadow: '0 28px 80px rgba(0, 0, 0, 0.52)',
    overflow: 'hidden',
    outline: 'none',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    padding: '24px 24px 18px',
    borderBottom: '1px solid rgba(138, 156, 181, 0.12)',
  },
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '20px 24px 24px',
    display: 'grid',
    gap: 18,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: '16px 24px 20px',
    borderTop: '1px solid rgba(138, 156, 181, 0.12)',
    background: 'rgba(8, 12, 19, 0.9)',
  },
  eyebrow: {
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
    fontSize: 28,
    lineHeight: 1.05,
    color: 'var(--text-primary)',
  },
  subtitle: {
    margin: '10px 0 0',
    fontSize: 13,
    lineHeight: 1.6,
    color: 'var(--text-secondary)',
    maxWidth: 480,
  },
  closeButton: {
    width: 34,
    height: 34,
    border: 'none',
    borderRadius: 999,
    background: 'rgba(255, 255, 255, 0.04)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    flexShrink: 0,
  },
  fieldGroup: {
    display: 'grid',
    gap: 8,
  },
  fieldLabel: {
    display: 'block',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
  },
  input: {
    width: '100%',
    padding: '13px 14px',
    borderRadius: 14,
    border: '1px solid var(--border-default)',
    background: 'rgba(9, 13, 20, 0.9)',
    color: 'var(--text-primary)',
    fontSize: 15,
    outline: 'none',
    transition: 'border-color 120ms ease',
  },
  helper: {
    fontSize: 11,
    lineHeight: 1.5,
    color: 'var(--text-muted)',
  },
  templateGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 10,
  },
  templateButton: (selected: boolean, accent: string) => ({
    display: 'grid',
    gridTemplateColumns: '40px minmax(0, 1fr)',
    gap: 12,
    alignItems: 'center',
    width: '100%',
    padding: '14px 14px',
    borderRadius: 18,
    border: `1px solid ${selected ? `${accent}66` : 'rgba(138, 156, 181, 0.14)'}`,
    background: selected
      ? `linear-gradient(180deg, ${accent}18, rgba(255, 255, 255, 0.03))`
      : 'rgba(255, 255, 255, 0.02)',
    boxShadow: selected ? `inset 0 0 0 1px ${accent}22` : 'none',
    textAlign: 'left' as const,
    cursor: 'pointer',
  }),
  templateIcon: (selected: boolean, accent: string) => ({
    width: 40,
    height: 40,
    borderRadius: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: accent,
    background: selected ? `${accent}22` : 'rgba(255, 255, 255, 0.04)',
    border: `1px solid ${selected ? `${accent}44` : 'rgba(138, 156, 181, 0.12)'}`,
  }),
  templateMeta: {
    display: 'grid',
    gap: 4,
    minWidth: 0,
  },
  templateName: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  templateDesc: {
    fontSize: 11,
    lineHeight: 1.5,
    color: 'var(--text-secondary)',
  },
  selectedTemplateCopy: {
    padding: '12px 14px',
    borderRadius: 16,
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(138, 156, 181, 0.12)',
    fontSize: 12,
    lineHeight: 1.6,
    color: 'var(--text-secondary)',
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 10px',
    borderRadius: 999,
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(138, 156, 181, 0.12)',
    fontSize: 11,
    color: 'var(--text-secondary)',
  },
  chipStrong: {
    color: 'var(--text-primary)',
    fontWeight: 600,
  },
  advancedToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    width: 'fit-content',
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid rgba(138, 156, 181, 0.16)',
    background: 'rgba(255, 255, 255, 0.02)',
    color: 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  advancedPanel: {
    display: 'grid',
    gap: 16,
    padding: '16px',
    borderRadius: 18,
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(138, 156, 181, 0.12)',
  },
  twoUp: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
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
    padding: '12px 14px',
    borderRadius: 14,
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(138, 156, 181, 0.12)',
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  switchHelp: {
    marginTop: 4,
    fontSize: 11,
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
  textarea: {
    width: '100%',
    minHeight: 88,
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
  error: {
    padding: '12px 14px',
    borderRadius: 14,
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.22)',
    color: '#fca5a5',
    fontSize: 13,
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
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const showDialog = useEditorStore((state) => state.showNewProjectDialog);
  const initialTemplate = useEditorStore((state) => state.newProjectDialogTemplate);
  const closeDialog = useEditorStore((state) => state.closeNewProjectDialog);

  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate>('film');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [existingProjectNames, setExistingProjectNames] = useState<string[]>([]);
  const [isUsingSuggestedName, setIsUsingSuggestedName] = useState(true);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [sequence, setSequence] = useState<SequenceState>(() => getInitialSequence('film'));
  const [isCreating, setIsCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);

  const templateConfig = useMemo(
    () => getProjectCreationTemplateConfig(selectedTemplate),
    [selectedTemplate],
  );
  const templateVisual = useMemo(
    () => getProjectCreationTemplateVisual(selectedTemplate),
    [selectedTemplate],
  );
  const suggestedProjectName = useMemo(
    () => buildSuggestedProjectName(selectedTemplate, existingProjectNames),
    [existingProjectNames, selectedTemplate],
  );
  const selectedResolution = RESOLUTION_PRESETS[sequence.resolutionIndex] ?? RESOLUTION_PRESETS[0];
  const dropFrameSupported = supportsDropFrame(sequence.fps);
  const finalProjectName = projectName.trim() || suggestedProjectName;
  const canCreate = finalProjectName.length > 0 && !isCreating;

  const handleClose = useCallback(() => {
    setCreationError(null);
    setIsCreating(false);
    closeDialog();
  }, [closeDialog]);

  useEffect(() => {
    if (!showDialog) {
      return;
    }

    const template = initialTemplate ?? 'film';
    setSelectedTemplate(template);
    setSequence(getInitialSequence(template));
    setProjectName(buildSuggestedProjectName(template));
    setProjectDescription('');
    setExistingProjectNames([]);
    setIsUsingSuggestedName(true);
    setShowAdvancedSettings(false);
    setIsCreating(false);
    setCreationError(null);

    requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    void listProjectSummariesFromRepository()
      .then((summaries) => {
        setExistingProjectNames(summaries.map((project) => project.name));
      })
      .catch(() => {
        setExistingProjectNames([]);
      });
  }, [initialTemplate, showDialog]);

  useEffect(() => {
    if (!showDialog || !isUsingSuggestedName) {
      return;
    }

    setProjectName(suggestedProjectName);
  }, [isUsingSuggestedName, showDialog, suggestedProjectName]);

  const handleSelectTemplate = useCallback((template: ProjectTemplate) => {
    setSelectedTemplate(template);
    setSequence(getInitialSequence(template));
    setCreationError(null);

    if (isUsingSuggestedName || !projectName.trim()) {
      setProjectName(buildSuggestedProjectName(template, existingProjectNames));
      setIsUsingSuggestedName(true);
    }
  }, [existingProjectNames, isUsingSuggestedName, projectName]);

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
        name: finalProjectName,
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
    finalProjectName,
    handleClose,
    navigate,
    projectDescription,
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
      <div style={S.dialog} ref={dialogRef} tabIndex={-1}>
        <div style={S.header}>
          <div>
            <span style={S.eyebrow}>New project</span>
            <h2 style={S.title}>Create an editorial project</h2>
            <p style={S.subtitle}>
              Choose a template, name the project, and start editing. Sequence settings stay out of the way until you need them.
            </p>
          </div>

          <button
            type="button"
            style={S.closeButton}
            onClick={handleClose}
            aria-label="Close project creation dialog"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={S.body}>
          <div style={S.fieldGroup}>
            <label htmlFor="project-name" style={S.fieldLabel}>Project name</label>
            <input
              id="project-name"
              type="text"
              value={projectName}
              onChange={(event) => {
                const nextValue = event.target.value;
                setProjectName(nextValue);
                setIsUsingSuggestedName(nextValue.trim().length === 0 || nextValue === suggestedProjectName);
              }}
              placeholder={suggestedProjectName}
              style={S.input}
              autoFocus
              onFocus={(event) => {
                event.currentTarget.style.borderColor = 'var(--brand)';
              }}
              onBlur={(event) => resetBorder(event.target)}
              maxLength={120}
            />
            <div style={S.helper}>
              Suggested name: <strong style={{ color: 'var(--text-secondary)' }}>{suggestedProjectName}</strong>
            </div>
          </div>

          <div style={S.fieldGroup}>
            <span style={S.fieldLabel}>Template</span>
            <div style={S.templateGrid}>
              {EDITORIAL_TEMPLATE_OPTIONS.map((template) => {
                const config = getProjectCreationTemplateConfig(template);
                const visual = getProjectCreationTemplateVisual(template);
                const selected = template === selectedTemplate;

                return (
                  <button
                    key={template}
                    type="button"
                    style={S.templateButton(selected, visual.accent)}
                    onClick={() => handleSelectTemplate(template)}
                  >
                    <span style={S.templateIcon(selected, visual.accent)}>
                      <ProjectGlyph template={template} size={18} stroke={visual.accent} />
                    </span>
                    <span style={S.templateMeta}>
                      <span style={S.templateName}>{config.name}</span>
                      <span style={S.templateDesc}>{visual.quickStartDescription}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={S.selectedTemplateCopy}>
              <strong style={{ color: templateVisual.accent }}>{templateConfig.name}</strong>
              {' '}
              {templateConfig.description}
            </div>
          </div>

          <div style={S.chipRow} aria-label="Project defaults summary">
            <span style={S.chip}>
              Template
              <strong style={S.chipStrong}>{templateConfig.name}</strong>
            </span>
            <span style={S.chip}>
              Sequence
              <strong style={S.chipStrong}>{selectedResolution.width} x {selectedResolution.height}</strong>
            </span>
            <span style={S.chip}>
              Timebase
              <strong style={S.chipStrong}>{sequence.fps}{sequence.dropFrame ? ' DF' : ' NDF'}</strong>
            </span>
            <span style={S.chip}>
              Layout
              <strong style={S.chipStrong}>
                {templateConfig.composerLayout === 'source-record' ? 'Source / Record' : 'Record only'}
              </strong>
            </span>
          </div>

          <button
            type="button"
            style={S.advancedToggle}
            aria-expanded={showAdvancedSettings}
            onClick={() => setShowAdvancedSettings((current) => !current)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {showAdvancedSettings ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
            </svg>
            {showAdvancedSettings ? 'Hide sequence settings' : 'Edit sequence settings'}
          </button>

          {showAdvancedSettings && (
            <div style={S.advancedPanel}>
              <div style={S.twoUp}>
                <div style={S.fieldGroup}>
                  <label htmlFor="project-fps" style={S.fieldLabel}>Frame rate</label>
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
                  <label htmlFor="project-resolution" style={S.fieldLabel}>Resolution</label>
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
                      ? 'Use it when runtime needs to stay aligned with the clock.'
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

              <div style={S.fieldGroup}>
                <label htmlFor="project-description" style={S.fieldLabel}>Notes</label>
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
            </div>
          )}

          {creationError && (
            <div role="alert" style={S.error}>
              {creationError}
            </div>
          )}
        </div>

        <footer style={S.footer}>
          <div style={S.footerNote}>
            Opens directly in the editorial workspace. Use Cmd/Ctrl+Enter to create.
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
              onClick={() => {
                void handleCreate();
              }}
              disabled={!canCreate}
            >
              {isCreating ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default NewProjectDialog;
