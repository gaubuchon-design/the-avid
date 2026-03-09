import React, {
  forwardRef,
  useState,
  useCallback,
  useRef,
  useEffect,
  type KeyboardEvent,
} from 'react';

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
function cx(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Builder UI for composing automation playbooks from available tools.
 * Allows naming, ordering, adding, removing, and saving step sequences.
 *
 * Features:
 * - Full keyboard navigation in tool dropdown (ArrowUp/Down, Enter, Escape)
 * - Keyboard reordering of steps (Alt+ArrowUp/Down)
 * - Drag handle visual cue for reorderable steps
 * - Escape to close dropdown
 * - Click-outside to close dropdown
 * - Step count display
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
    const [focusedOptionIndex, setFocusedOptionIndex] = useState(-1);
    const dropdownRef = useRef<HTMLUListElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const liveRegionRef = useRef<HTMLDivElement>(null);

    const announce = useCallback((message: string) => {
      if (liveRegionRef.current) {
        liveRegionRef.current.textContent = message;
      }
    }, []);

    // Close dropdown on outside click
    useEffect(() => {
      if (!isDropdownOpen) return undefined;
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as Node;
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(target) &&
          triggerRef.current &&
          !triggerRef.current.contains(target)
        ) {
          setIsDropdownOpen(false);
          setFocusedOptionIndex(-1);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isDropdownOpen]);

    // Focus first option when dropdown opens
    useEffect(() => {
      if (isDropdownOpen && availableTools.length > 0) {
        setFocusedOptionIndex(0);
      }
    }, [isDropdownOpen, availableTools.length]);

    // Scroll focused option into view
    useEffect(() => {
      if (focusedOptionIndex >= 0 && dropdownRef.current) {
        const options =
          dropdownRef.current.querySelectorAll<HTMLLIElement>('.playbook-add-option');
        const target = options[focusedOptionIndex];
        if (target) {
          target.scrollIntoView({ block: 'nearest' });
        }
      }
    }, [focusedOptionIndex]);

    const handleAddStep = useCallback(() => {
      if (!selectedTool) return;
      onAddStep(selectedTool);
      announce(`Added step: ${selectedTool}`);
      setSelectedTool('');
      setIsDropdownOpen(false);
    }, [selectedTool, onAddStep, announce]);

    const selectToolAndClose = useCallback(
      (toolName: string) => {
        setSelectedTool(toolName);
        setIsDropdownOpen(false);
        setFocusedOptionIndex(-1);
        announce(`Selected tool: ${toolName}`);
        // Return focus to trigger
        triggerRef.current?.focus();
      },
      [announce],
    );

    const handleTriggerKeyDown = useCallback(
      (e: KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (!isDropdownOpen) {
            setIsDropdownOpen(true);
          }
          return;
        }
        if (e.key === 'Escape' && isDropdownOpen) {
          e.preventDefault();
          setIsDropdownOpen(false);
          setFocusedOptionIndex(-1);
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setIsDropdownOpen(!isDropdownOpen);
        }
      },
      [isDropdownOpen],
    );

    const handleDropdownKeyDown = useCallback(
      (e: KeyboardEvent<HTMLUListElement>) => {
        const count = availableTools.length;
        if (count === 0) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusedOptionIndex((prev) =>
            prev < count - 1 ? prev + 1 : 0,
          );
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusedOptionIndex((prev) =>
            prev > 0 ? prev - 1 : count - 1,
          );
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const tool = availableTools[focusedOptionIndex];
          if (tool) {
            selectToolAndClose(tool.name);
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setIsDropdownOpen(false);
          setFocusedOptionIndex(-1);
          triggerRef.current?.focus();
          return;
        }
        if (e.key === 'Home') {
          e.preventDefault();
          setFocusedOptionIndex(0);
          return;
        }
        if (e.key === 'End') {
          e.preventDefault();
          setFocusedOptionIndex(count - 1);
        }
      },
      [availableTools, focusedOptionIndex, selectToolAndClose],
    );

    const handleStepKeyDown = useCallback(
      (e: KeyboardEvent<HTMLDivElement>, step: PlaybookStep, index: number) => {
        // Alt+ArrowUp/Down to reorder
        if (e.altKey && e.key === 'ArrowUp' && index > 0) {
          e.preventDefault();
          onReorderStep(step.id, 'up');
          announce(`Moved step ${index + 1} up to position ${index}`);
          return;
        }
        if (e.altKey && e.key === 'ArrowDown' && index < steps.length - 1) {
          e.preventDefault();
          onReorderStep(step.id, 'down');
          announce(`Moved step ${index + 1} down to position ${index + 2}`);
          return;
        }
        // Delete key to remove
        if (e.key === 'Delete') {
          e.preventDefault();
          onRemoveStep(step.id);
          announce(`Removed step ${index + 1}: ${step.toolName}`);
        }
      },
      [steps.length, onReorderStep, onRemoveStep, announce],
    );

    const dropdownListId = 'playbook-tool-list';
    const focusedOptionId =
      focusedOptionIndex >= 0
        ? `playbook-option-${focusedOptionIndex}`
        : undefined;

    return (
      <div
        ref={ref}
        className={cx('playbook-builder', className)}
        role="region"
        aria-label="Playbook builder"
      >
        {/* Live region for announcements */}
        <div
          ref={liveRegionRef}
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        />

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
        <div className="playbook-steps" role="list" aria-label={`Playbook steps (${steps.length} total)`}>
          {steps.length === 0 && (
            <div className="playbook-steps-empty" role="status">
              <svg
                className="playbook-steps-empty-icon"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>No steps yet. Add a tool below to get started.</span>
            </div>
          )}

          {steps.map((step, index) => (
            <div
              key={step.id}
              className="playbook-step"
              role="listitem"
              aria-label={`Step ${index + 1}: ${step.toolName} - ${step.description}`}
              tabIndex={0}
              onKeyDown={(e) => handleStepKeyDown(e, step, index)}
            >
              {/* Drag handle visual */}
              <span className="playbook-step-handle" aria-hidden="true" title="Drag to reorder (or Alt+Arrow keys)">
                <svg
                  width="8"
                  height="12"
                  viewBox="0 0 8 12"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="2" cy="2" r="1" />
                  <circle cx="6" cy="2" r="1" />
                  <circle cx="2" cy="6" r="1" />
                  <circle cx="6" cy="6" r="1" />
                  <circle cx="2" cy="10" r="1" />
                  <circle cx="6" cy="10" r="1" />
                </svg>
              </span>

              <span className="playbook-step-index">{index + 1}</span>

              <div className="playbook-step-body">
                <span className="playbook-step-tool">{step.toolName}</span>
                <span className="playbook-step-desc" title={step.description}>
                  {step.description}
                </span>
              </div>

              <div className="playbook-step-controls">
                <button
                  type="button"
                  className="playbook-step-btn"
                  onClick={() => onReorderStep(step.id, 'up')}
                  disabled={index === 0}
                  aria-label={`Move step ${index + 1} up`}
                  title="Move up (Alt+\u2191)"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="playbook-step-btn"
                  onClick={() => onReorderStep(step.id, 'down')}
                  disabled={index === steps.length - 1}
                  aria-label={`Move step ${index + 1} down`}
                  title="Move down (Alt+\u2193)"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="playbook-step-btn playbook-step-btn--danger"
                  onClick={() => onRemoveStep(step.id)}
                  aria-label={`Remove step ${index + 1}`}
                  title="Remove step (Delete)"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
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
              ref={triggerRef}
              type="button"
              className={cx(
                'playbook-add-trigger',
                isDropdownOpen && 'playbook-add-trigger--open',
              )}
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              onKeyDown={handleTriggerKeyDown}
              aria-haspopup="listbox"
              aria-expanded={isDropdownOpen}
              aria-controls={isDropdownOpen ? dropdownListId : undefined}
              aria-activedescendant={isDropdownOpen ? focusedOptionId : undefined}
              aria-label="Select tool to add"
            >
              {selectedTool || 'Select a tool\u2026'}
              <svg
                className={cx(
                  'playbook-add-trigger-chevron',
                  isDropdownOpen && 'playbook-add-trigger-chevron--open',
                )}
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {isDropdownOpen && (
              <ul
                ref={dropdownRef}
                id={dropdownListId}
                className="playbook-add-dropdown"
                role="listbox"
                aria-label="Available tools"
                onKeyDown={handleDropdownKeyDown}
                tabIndex={0}
              >
                {availableTools.map((tool, i) => (
                  <li
                    key={tool.name}
                    id={`playbook-option-${i}`}
                    className={cx(
                      'playbook-add-option',
                      i === focusedOptionIndex && 'playbook-add-option--focused',
                      selectedTool === tool.name && 'playbook-add-option--selected',
                    )}
                    role="option"
                    aria-selected={selectedTool === tool.name}
                    onClick={() => selectToolAndClose(tool.name)}
                    onMouseEnter={() => setFocusedOptionIndex(i)}
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
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
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
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
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
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
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
