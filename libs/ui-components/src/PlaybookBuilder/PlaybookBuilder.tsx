import React, { forwardRef, useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlaybookStep {
  /** Unique identifier for this step. */
  id: string;
  /** The tool to invoke. */
  toolName: string;
  /** Human-readable description of what this step does. */
  description: string;
  /** Arguments passed to the tool. */
  args: Record<string, unknown>;
}

export interface PlaybookBuilderProps {
  /** Playbook name. */
  name: string;
  /** Ordered list of steps in the playbook. */
  steps: PlaybookStep[];
  /** Tools available for selection when adding a step. */
  availableTools: Array<{ name: string; description: string }>;
  /** Called when the playbook name changes. */
  onNameChange: (name: string) => void;
  /** Called to add a new step using the given tool. */
  onAddStep: (toolName: string) => void;
  /** Called to remove a step by id. */
  onRemoveStep: (stepId: string) => void;
  /** Called to reorder a step by id in the given direction. */
  onReorderStep: (stepId: string, direction: 'up' | 'down') => void;
  /** Called to save the playbook. */
  onSave: () => void;
  /** Called to run/execute the playbook. */
  onRun?: () => void;
  /** Additional CSS class(es) to apply to the root element. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Merge base and optional extra class names. */
function cx(base: string, extra?: string): string {
  return extra ? `${base} ${extra}` : base;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Builder UI for composing automation playbooks from available tools.
 * Allows naming, ordering, adding, removing, and saving step sequences.
 */
export const PlaybookBuilder = forwardRef<HTMLDivElement, PlaybookBuilderProps>(
  function PlaybookBuilder(
    {
      name,
      steps,
      availableTools,
      onNameChange,
      onAddStep,
      onRemoveStep,
      onReorderStep,
      onSave,
      onRun,
      className,
    },
    ref,
  ) {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [selectedTool, setSelectedTool] = useState('');

    const handleAddStep = useCallback(() => {
      if (!selectedTool) return;
      onAddStep(selectedTool);
      setSelectedTool('');
      setIsDropdownOpen(false);
    }, [selectedTool, onAddStep]);

    return (
      <div ref={ref} className={cx('playbook-builder', className)} role="region" aria-label="Playbook builder">
        {/* -- Name ----------------------------------------------------- */}
        <div className="playbook-builder-name">
          <label htmlFor="playbook-name" className="playbook-builder-label">
            Playbook Name
          </label>
          <input
            id="playbook-name"
            type="text"
            className="playbook-builder-name-input"
            value={name}
            onChange={(e) => onNameChange(e.currentTarget.value)}
            placeholder="My automation playbook"
            aria-label="Playbook name"
          />
        </div>

        {/* -- Step list ------------------------------------------------- */}
        <div className="playbook-steps" role="list" aria-label="Playbook steps">
          {steps.length === 0 && (
            <div className="playbook-steps-empty">
              No steps yet. Add a tool below to get started.
            </div>
          )}

          {steps.map((step, index) => (
            <div
              key={step.id}
              className="playbook-step"
              role="listitem"
              aria-label={`Step ${index + 1}: ${step.toolName}`}
            >
              <span className="playbook-step-index">{index + 1}</span>

              <div className="playbook-step-body">
                <span className="playbook-step-tool">{step.toolName}</span>
                <span className="playbook-step-desc">{step.description}</span>
              </div>

              <div className="playbook-step-controls">
                <button
                  type="button"
                  className="playbook-step-btn"
                  onClick={() => onReorderStep(step.id, 'up')}
                  disabled={index === 0}
                  aria-label={`Move step ${index + 1} up`}
                  title="Move up"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="playbook-step-btn"
                  onClick={() => onReorderStep(step.id, 'down')}
                  disabled={index === steps.length - 1}
                  aria-label={`Move step ${index + 1} down`}
                  title="Move down"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="playbook-step-btn playbook-step-btn--danger"
                  onClick={() => onRemoveStep(step.id)}
                  aria-label={`Remove step ${index + 1}`}
                  title="Remove step"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* -- Add step -------------------------------------------------- */}
        <div className="playbook-add-row">
          <div className="playbook-add-select-wrap">
            <button
              type="button"
              className="playbook-add-trigger"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              aria-haspopup="listbox"
              aria-expanded={isDropdownOpen}
              aria-label="Select tool to add"
            >
              {selectedTool || 'Select a tool\u2026'}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {isDropdownOpen && (
              <ul className="playbook-add-dropdown" role="listbox" aria-label="Available tools">
                {availableTools.map((tool) => (
                  <li
                    key={tool.name}
                    className="playbook-add-option"
                    role="option"
                    aria-selected={selectedTool === tool.name}
                    tabIndex={0}
                    onClick={() => {
                      setSelectedTool(tool.name);
                      setIsDropdownOpen(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedTool(tool.name);
                        setIsDropdownOpen(false);
                      }
                    }}
                  >
                    <span className="playbook-add-option-name">{tool.name}</span>
                    <span className="playbook-add-option-desc">{tool.description}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            className="playbook-add-btn"
            onClick={handleAddStep}
            disabled={!selectedTool}
            aria-label="Add step"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Step
          </button>
        </div>

        {/* -- Actions --------------------------------------------------- */}
        <div className="playbook-actions">
          <button
            type="button"
            className="playbook-save-btn"
            onClick={onSave}
            disabled={!name.trim() || steps.length === 0}
            aria-label="Save playbook"
          >
            Save
          </button>
          {onRun && (
            <button
              type="button"
              className="playbook-run-btn"
              onClick={onRun}
              disabled={steps.length === 0}
              aria-label="Run playbook"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Run
            </button>
          )}
        </div>
      </div>
    );
  },
);
