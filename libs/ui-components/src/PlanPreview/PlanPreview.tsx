import React, { forwardRef, useRef, useCallback, useState, type KeyboardEvent } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Subset of AgentStep needed for plan preview rendering. */
export interface PlanStepSummary {
  id: string;
  index: number;
  description: string;
  toolName: string;
  status: string;
}

/** Subset of AgentPlan needed for preview rendering. */
export interface PlanSummary {
  id: string;
  intent: string;
  steps: PlanStepSummary[];
  status: string;
  tokensEstimated: number;
}

export interface PlanPreviewProps {
  /** The plan to display for user review. */
  plan: PlanSummary;
  /** Called when the user approves the entire plan. */
  onApprove: (planId: string) => void;
  /** Called when the user rejects the entire plan. */
  onReject: (planId: string) => void;
  /** Called when the user approves a single step. */
  onApproveStep?: (planId: string, stepId: string) => void;
  /** Called when the user cancels an in-flight plan. */
  onCancel?: (planId: string) => void;
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

/** Maps a status string to a CSS modifier class suffix. */
function statusModifier(status: string): string {
  switch (status) {
    case 'completed':
    case 'approved':
      return 'success';
    case 'failed':
      return 'error';
    case 'executing':
    case 'planning':
      return 'active';
    case 'cancelled':
    case 'compensated':
      return 'muted';
    default:
      return 'pending';
  }
}

/** Human-readable status label. */
function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Calculate completion percentage from steps. */
function getCompletionPercent(steps: PlanStepSummary[]): number {
  if (steps.length === 0) return 0;
  const completed = steps.filter(
    (s) => s.status === 'completed' || s.status === 'approved',
  ).length;
  return Math.round((completed / steps.length) * 100);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Drawer-style panel that displays a plan's intent, ordered steps, and
 * approve/reject controls. Designed for human-in-the-loop confirmation
 * before any agentic action executes.
 *
 * Features:
 * - Visual progress bar showing completion percentage
 * - Keyboard navigation through steps (ArrowUp/ArrowDown)
 * - Step-level approve via keyboard (Enter on focused step)
 * - Screen reader announcements for progress changes
 */
export const PlanPreview = forwardRef<HTMLDivElement, PlanPreviewProps>(
  function PlanPreview(
    {
      plan,
      onApprove,
      onReject,
      onApproveStep,
      onCancel,
      className,
    },
    ref,
  ) {
    const isActionable = plan.status === 'preview';
    const isExecuting = plan.status === 'executing';
    const completionPercent = getCompletionPercent(plan.steps);
    const [focusedStepIndex, setFocusedStepIndex] = useState(-1);
    const stepsListRef = useRef<HTMLOListElement>(null);

    const focusStep = useCallback(
      (index: number) => {
        setFocusedStepIndex(index);
        const list = stepsListRef.current;
        if (list) {
          const items = list.querySelectorAll<HTMLLIElement>('.plan-step');
          const target = items[index];
          if (target) {
            target.focus();
          }
        }
      },
      [],
    );

    const handleStepKeyDown = useCallback(
      (e: KeyboardEvent<HTMLOListElement>) => {
        const stepCount = plan.steps.length;
        if (stepCount === 0) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const next = focusedStepIndex < stepCount - 1 ? focusedStepIndex + 1 : 0;
          focusStep(next);
          return;
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const next = focusedStepIndex > 0 ? focusedStepIndex - 1 : stepCount - 1;
          focusStep(next);
          return;
        }

        // Enter on a focused step approves it if applicable
        if (e.key === 'Enter' && focusedStepIndex >= 0 && onApproveStep) {
          const step = plan.steps[focusedStepIndex];
          if (step && step.status === 'pending') {
            e.preventDefault();
            onApproveStep(plan.id, step.id);
          }
        }
      },
      [plan, focusedStepIndex, focusStep, onApproveStep],
    );

    // Keyboard handler for the approve/reject action area
    const handleActionsKeyDown = useCallback(
      (e: KeyboardEvent<HTMLDivElement>) => {
        if (!isActionable) return;

        // 'a' key to approve, 'r' key to reject (shortcut when focused in actions area)
        if (e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          onApprove(plan.id);
          return;
        }
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          onReject(plan.id);
        }
      },
      [isActionable, plan.id, onApprove, onReject],
    );

    const completedCount = plan.steps.filter(
      (s) => s.status === 'completed' || s.status === 'approved',
    ).length;

    return (
      <div
        ref={ref}
        className={cx('plan-preview', `plan-preview--${statusModifier(plan.status)}`, className)}
        role="region"
        aria-label="Plan preview"
      >
        {/* -- Header --------------------------------------------------- */}
        <div className="plan-preview-header">
          <div className="plan-preview-intent">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <h3 className="plan-preview-intent-text">{plan.intent}</h3>
          </div>

          <div className="plan-preview-meta">
            <span
              className={`plan-preview-status plan-preview-status--${statusModifier(plan.status)}`}
            >
              {statusLabel(plan.status)}
            </span>
            <span className="plan-preview-token-cost" title="Estimated token cost">
              {plan.tokensEstimated.toLocaleString()} tokens
            </span>
            <span className="plan-preview-step-count" aria-label={`${completedCount} of ${plan.steps.length} steps completed`}>
              {completedCount}/{plan.steps.length} steps
            </span>
          </div>

          {/* Progress bar */}
          {plan.steps.length > 0 && (
            <div className="plan-preview-progress" role="progressbar" aria-valuenow={completionPercent} aria-valuemin={0} aria-valuemax={100} aria-label={`Plan progress: ${completionPercent}%`}>
              <div
                className="plan-preview-progress-fill"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
          )}
        </div>

        {/* -- Steps ----------------------------------------------------- */}
        <ol
          ref={stepsListRef}
          className="plan-preview-steps"
          aria-label="Plan steps"
          onKeyDown={handleStepKeyDown}
        >
          {plan.steps.map((step, i) => (
            <li
              key={step.id}
              className={cx(
                'plan-step',
                `plan-step--${statusModifier(step.status)}`,
                i === focusedStepIndex && 'plan-step--focused',
              )}
              aria-label={`Step ${step.index + 1}: ${step.description} - ${statusLabel(step.status)}`}
              tabIndex={0}
              onFocus={() => setFocusedStepIndex(i)}
            >
              <span
                className={`plan-step-status plan-step-status--${statusModifier(step.status)}`}
                aria-label={statusLabel(step.status)}
                title={statusLabel(step.status)}
              />
              <span className="plan-step-index">{step.index + 1}</span>
              <div className="plan-step-body">
                <span className="plan-step-description">{step.description}</span>
                <span className="plan-step-tool">{step.toolName}</span>
              </div>
              {onApproveStep && step.status === 'pending' && (
                <button
                  type="button"
                  className="plan-step-approve"
                  onClick={() => onApproveStep(plan.id, step.id)}
                  aria-label={`Approve step ${step.index + 1}`}
                  title="Approve this step (Enter)"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ol>

        {/* -- Actions --------------------------------------------------- */}
        <div className="plan-preview-actions" onKeyDown={handleActionsKeyDown}>
          {isActionable && (
            <>
              <button
                type="button"
                className="plan-preview-approve"
                onClick={() => onApprove(plan.id)}
                aria-label="Approve all steps (A)"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Approve All
              </button>
              <button
                type="button"
                className="plan-preview-reject"
                onClick={() => onReject(plan.id)}
                aria-label="Reject plan (R)"
              >
                <svg
                  width="14"
                  height="14"
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
                Reject
              </button>
            </>
          )}
          {isExecuting && onCancel && (
            <button
              type="button"
              className="plan-preview-cancel"
              onClick={() => onCancel(plan.id)}
              aria-label="Cancel plan execution"
            >
              Cancel
            </button>
          )}

          {/* Screen-reader progress announcement */}
          <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {completionPercent === 100
              ? 'All steps completed'
              : `${completionPercent}% complete - ${completedCount} of ${plan.steps.length} steps done`}
          </span>
        </div>
      </div>
    );
  },
);
