import React from 'react';
import type { AgentPlan } from '../../ai/AgentEngine';

interface AgentPlanCardProps {
  title: string;
  plan: AgentPlan | null;
  accentColor?: string;
  emptyState?: string;
  onApprove?: (planId: string) => void;
  onReject?: (planId: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  planning: '#38bdf8',
  preview: '#00d4aa',
  executing: '#f59e0b',
  completed: '#22c55e',
  failed: '#ef4444',
  pending: '#94a3b8',
  approved: '#14b8a6',
  cancelled: '#64748b',
};

function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? 'var(--text-muted)';
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function AgentPlanCard({
  title,
  plan,
  accentColor = 'var(--brand, #4f46e5)',
  emptyState = 'No plan prepared yet.',
  onApprove,
  onReject,
}: AgentPlanCardProps) {
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        borderRadius: 16,
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.82), rgba(15, 23, 42, 0.94))',
        border: `1px solid color-mix(in srgb, ${accentColor} 32%, rgba(148, 163, 184, 0.25))`,
        boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: accentColor,
            }}
          >
            {title}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
            {plan ? plan.intent : emptyState}
          </div>
        </div>
        {plan ? (
          <span
            style={{
              alignSelf: 'flex-start',
              borderRadius: 999,
              padding: '5px 10px',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: `color-mix(in srgb, ${statusColor(plan.status)} 18%, transparent)`,
              color: statusColor(plan.status),
              border: `1px solid color-mix(in srgb, ${statusColor(plan.status)} 38%, transparent)`,
            }}
          >
            {statusLabel(plan.status)}
          </span>
        ) : null}
      </div>

      {plan ? (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <StatPill label="Steps" value={String(plan.steps.length)} />
            <StatPill label="Tokens" value={String(plan.tokensUsed)} />
            <StatPill
              label="Complete"
              value={`${plan.steps.filter((step) => step.status === 'completed').length}/${plan.steps.length}`}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {plan.steps.map((step, index) => (
              <div
                key={step.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: 10,
                  padding: 12,
                  borderRadius: 12,
                  background: 'rgba(15, 23, 42, 0.42)',
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    background: `color-mix(in srgb, ${statusColor(step.status)} 22%, transparent)`,
                    color: statusColor(step.status),
                  }}
                >
                  {index + 1}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {step.description}
                    </span>
                    <span
                      style={{
                        borderRadius: 999,
                        padding: '3px 8px',
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        background: `color-mix(in srgb, ${statusColor(step.status)} 18%, transparent)`,
                        color: statusColor(step.status),
                      }}
                    >
                      {statusLabel(step.status)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {step.toolName}
                    </span>
                  </div>
                  {step.result ? (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                      {step.result}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {(plan.status === 'preview' || plan.status === 'executing') && (onApprove || onReject) ? (
            <div style={{ display: 'flex', gap: 10 }}>
              {plan.status === 'preview' && onApprove ? (
                <button
                  type="button"
                  onClick={() => onApprove(plan.id)}
                  style={{
                    flex: 1,
                    border: 'none',
                    borderRadius: 12,
                    padding: '10px 14px',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    color: '#03231c',
                    background: accentColor,
                  }}
                >
                  Execute Plan
                </button>
              ) : null}
              {onReject ? (
                <button
                  type="button"
                  onClick={() => onReject(plan.id)}
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    padding: '10px 14px',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(148, 163, 184, 0.28)',
                  }}
                >
                  {plan.status === 'executing' ? 'Cancel Plan' : 'Reject'}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: 999,
        padding: '6px 10px',
        background: 'rgba(15, 23, 42, 0.48)',
        border: '1px solid rgba(148, 163, 184, 0.16)',
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div style={{ marginTop: 2, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}
