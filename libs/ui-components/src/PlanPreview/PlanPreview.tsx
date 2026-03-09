import React from 'react';

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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Drawer-style panel that displays a plan's intent, ordered steps, and
 * approve/reject controls. Designed for human-in-the-loop confirmation
 * before any agentic action executes.
 */
export function PlanPreview({
  plan,
  onApprove,
  onReject,
  onApproveStep,
  onCancel,
}: PlanPreviewProps) {
  const isActionable = plan.status === 'preview';
  const isExecuting = plan.status === 'executing';

  return (
    <div className="plan-preview" role="region" aria-label="Plan preview">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="plan-preview-header">
        <div className="plan-preview-intent">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span className="plan-preview-intent-text">{plan.intent}</span>
        </div>

        <div className="plan-preview-meta">
          <span className={`plan-preview-status plan-preview-status--${statusModifier(plan.status)}`}>
            {statusLabel(plan.status)}
          </span>
          <span className="plan-preview-token-cost" title="Estimated token cost">
            {plan.tokensEstimated.toLocaleString()} tokens
          </span>
        </div>
      </div>

      {/* ── Steps ───────────────────────────────────────────────────── */}
      <ol className="plan-preview-steps" aria-label="Plan steps">
        {plan.steps.map((step) => (
          <li key={step.id} className="plan-step" aria-label={`Step ${step.index + 1}: ${step.description}`}>
            <span className={`plan-step-status plan-step-status--${statusModifier(step.status)}`} aria-label={statusLabel(step.status)} title={statusLabel(step.status)} />
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
                title="Approve this step"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            )}
          </li>
        ))}
      </ol>

      {/* ── Actions ─────────────────────────────────────────────────── */}
      <div className="plan-preview-actions">
        {isActionable && (
          <>
            <button
              type="button"
              className="plan-preview-approve"
              onClick={() => onApprove(plan.id)}
              aria-label="Approve all steps"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Approve All
            </button>
            <button
              type="button"
              className="plan-preview-reject"
              onClick={() => onReject(plan.id)}
              aria-label="Reject plan"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
      </div>
    </div>
  );
}
