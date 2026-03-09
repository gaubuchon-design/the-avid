import React, { useState, useCallback, useEffect, useRef, forwardRef, type KeyboardEvent } from 'react';

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
  /** Additional CSS class names for the root element. */
  className?: string;
  /** Unique identifier for the root element. */
  id?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Builder UI for composing automation playbooks from available tools.
 * Allows naming, ordering, adding, removing, and saving step sequences.
 *
 * Keyboard support:
 * - Escape: close the tool dropdown
 * - Arrow keys: navigate dropdown options
 * - Enter/Space: select a dropdown option
 */
export const PlaybookBuilder = forwardRef<HTMLDivElement, PlaybookBuilderProps>(function PlaybookBuilder(
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
    id,
  },
  ref,
) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState('');
  const [focusedOptionIndex, setFocusedOptionIndex] = useState(-1);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isDropdownOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) {
        setIsDropdownOpen(false);
        setFocusedOptionIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  // Close dropdown on Escape key (global handler)
  useEffect(() => {
    if (!isDropdownOpen) return;

    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsDropdownOpen(false);
        setFocusedOptionIndex(-1);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isDropdownOpen]);

  const handleAddStep = useCallback(() => {
    if (!selectedTool) return;
    onAddStep(selectedTool);
    setSelectedTool('');
    setIsDropdownOpen(false);
    setFocusedOptionIndex(-1);
  }, [selectedTool, onAddStep]);

  const selectOption = useCallback((toolName: string) => {
    setSelectedTool(toolName);
    setIsDropdownOpen(false);
    setFocusedOptionIndex(-1);
  }, []);

  const handleTriggerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isDropdownOpen) {
          setIsDropdownOpen(true);
        }
        setFocusedOptionIndex(0);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isDropdownOpen) {
          setIsDropdownOpen(true);
        }
        setFocusedOptionIndex(availableTools.length - 1);
      }
    },
    [isDropdownOpen, availableTools.length],
  );

  const handleOptionKeyDown = useCallback(
    (e: KeyboardEvent<HTMLLIElement>, toolName: string, index: number) => {
      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          selectOption(toolName);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedOptionIndex(Math.min(index + 1, availableTools.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (index === 0) {
            triggerRef.current?.focus();
            setFocusedOptionIndex(-1);
          } else {
            setFocusedOptionIndex(index - 1);
          }
          break;
        case 'Home':
          e.preventDefault();
          setFocusedOptionIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setFocusedOptionIndex(availableTools.length - 1);
          break;
      }
    },
    [availableTools.length, selectOption],
  );

  // Focus the option when focusedOptionIndex changes
  useEffect(() => {
    if (focusedOptionIndex >= 0 && dropdownRef.current) {
      const options = dropdownRef.current.querySelectorAll<HTMLLIElement>('[role="option"]');
      options[focusedOptionIndex]?.focus();
    }
  }, [focusedOptionIndex]);

  const dropdownId = id ? `${id}-dropdown` : 'playbook-tool-dropdown';

  return (
    <div
      ref={ref}
      id={id}
      className={`playbook-builder${className ? ` ${className}` : ''}`}
      role="region"
      aria-label="Playbook builder"
      data-testid="playbook-builder"
    >
      {/* -- Name ---------------------------------------------------------- */}
      <div className="playbook-builder-name">
        <label htmlFor={id ? `${id}-name` : 'playbook-name'} className="playbook-builder-label">
          Playbook Name
        </label>
        <input
          id={id ? `${id}-name` : 'playbook-name'}
          type="text"
          className="playbook-builder-name-input"
          value={name}
          onChange={(e) => onNameChange(e.currentTarget.value)}
          placeholder="My automation playbook"
        />
      </div>

      {/* -- Step list ----------------------------------------------------- */}
      <div
        className="playbook-steps"
        role="list"
        aria-label={`Playbook steps (${steps.length} total)`}
      >
        {steps.length === 0 && (
          <div className="playbook-steps-empty" role="status">
            No steps yet. Add a tool below to get started.
          </div>
        )}

        {steps.map((step, index) => (
          <div
            key={step.id}
            className="playbook-step"
            role="listitem"
            aria-label={`Step ${index + 1}: ${step.toolName} - ${step.description}`}
            data-testid="playbook-step"
          >
            <span className="playbook-step-index" aria-hidden="true">{index + 1}</span>

            <div className="playbook-step-body">
              <span className="playbook-step-tool">{step.toolName}</span>
              <span className="playbook-step-desc">{step.description}</span>
            </div>

            <div className="playbook-step-controls" role="group" aria-label={`Step ${index + 1} controls`}>
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
                aria-label={`Remove step ${index + 1}: ${step.toolName}`}
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

      {/* -- Add step ------------------------------------------------------ */}
      <div className="playbook-add-row">
        <div className="playbook-add-select-wrap">
          <button
            ref={triggerRef}
            type="button"
            className="playbook-add-trigger"
            onClick={() => {
              setIsDropdownOpen(!isDropdownOpen);
              setFocusedOptionIndex(-1);
            }}
            onKeyDown={handleTriggerKeyDown}
            aria-haspopup="listbox"
            aria-expanded={isDropdownOpen}
            aria-controls={dropdownId}
            aria-label="Select tool to add"
          >
            {selectedTool || 'Select a tool\u2026'}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {isDropdownOpen && (
            <ul
              ref={dropdownRef}
              id={dropdownId}
              className="playbook-add-dropdown"
              role="listbox"
              aria-label="Available tools"
            >
              {availableTools.map((tool, index) => (
                <li
                  key={tool.name}
                  className={`playbook-add-option${focusedOptionIndex === index ? ' playbook-add-option--focused' : ''}`}
                  role="option"
                  aria-selected={selectedTool === tool.name}
                  tabIndex={-1}
                  onClick={() => selectOption(tool.name)}
                  onKeyDown={(e) => handleOptionKeyDown(e, tool.name, index)}
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

      {/* -- Actions ------------------------------------------------------- */}
      <div className="playbook-actions" role="group" aria-label="Playbook actions">
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
});
