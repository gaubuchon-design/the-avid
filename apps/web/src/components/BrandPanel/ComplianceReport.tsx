// ─── Compliance Report Panel ────────────────────────────────────────────────
// Standalone brand-compliance report view: run scans, view findings with
// severity indicators, frame-time stamps, and export-gating status.

import React from 'react';
import { useBrandStore } from '../../store/brand.store';

// ─── Styles ─────────────────────────────────────────────────────────────────

const BRAND_ACCENT = '#E94560';

const S = {
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-display), system-ui, sans-serif',
    fontSize: 12,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.02em',
  },
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: 12,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-muted)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    marginBottom: 6,
  },
  card: {
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-raised)',
    border: '1px solid var(--border-default)',
  },
  btnPrimary: (disabled: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    background: disabled ? 'var(--bg-elevated)' : BRAND_ACCENT,
    color: disabled ? 'var(--text-muted)' : '#fff',
    fontSize: 11,
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    flexShrink: 0,
  }),
  emptyState: {
    textAlign: 'center' as const,
    padding: 32,
    color: 'var(--text-muted)',
    fontSize: 11,
    lineHeight: 1.6,
  },
};

// ─── Severity colours ───────────────────────────────────────────────────────

function severityColor(severity: string) {
  switch (severity) {
    case 'error': return { bg: 'rgba(239,68,68,0.08)', fg: 'var(--error, #ef4444)' };
    case 'warning': return { bg: 'rgba(245,158,11,0.08)', fg: 'var(--warning, #f59e0b)' };
    default: return { bg: 'rgba(59,130,246,0.08)', fg: 'var(--info, #3b82f6)' };
  }
}

function overallIcon(status: string) {
  switch (status) {
    case 'pass': return '\u2705';
    case 'warning': return '\u26A0\uFE0F';
    default: return '\u274C';
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ComplianceReport() {
  const {
    complianceReports,
    isRunningCompliance,
    runComplianceScan,
    activeBrandKitId,
  } = useBrandStore();

  const handleScan = () => {
    if (!activeBrandKitId) return;
    runComplianceScan('current-project', 40);
  };

  return (
    <div style={S.panel}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.title}>{'\u2713'} Compliance Report</span>
        <button
          onClick={handleScan}
          disabled={isRunningCompliance || !activeBrandKitId}
          style={S.btnPrimary(isRunningCompliance || !activeBrandKitId)}
        >
          {isRunningCompliance ? 'Scanning...' : 'Run Compliance Scan'}
        </button>
      </div>

      {/* Body */}
      <div style={S.body}>
        {complianceReports.length === 0 && !isRunningCompliance && (
          <div style={S.emptyState}>
            No compliance reports yet. Run a scan to validate brand adherence.
          </div>
        )}

        {complianceReports.map((report) => (
          <div key={report.id} style={S.card}>
            {/* Report header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16 }}>{overallIcon(report.overallStatus)}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                    {report.overallStatus}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {new Date(report.checkedAt).toLocaleString()}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  Duration: {report.duration.toFixed(1)}s
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                  {report.findings.length} finding{report.findings.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            {/* Export gate */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 9,
              fontWeight: 600,
              background: report.exportBlocked ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
              color: report.exportBlocked ? 'var(--error, #ef4444)' : 'var(--success, #22c55e)',
              marginBottom: 8,
            }}>
              {report.exportBlocked ? '\u26D4 Export Blocked' : '\u2714 Export Allowed'}
            </div>

            {/* Findings list */}
            {report.findings.length > 0 && (
              <div>
                <div style={S.sectionTitle}>Findings</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {report.findings.map((f) => {
                    const sev = severityColor(f.severity);
                    return (
                      <div key={f.id} style={{
                        padding: '6px 8px',
                        borderRadius: 'var(--radius-sm)',
                        background: sev.bg,
                        borderLeft: `3px solid ${sev.fg}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: sev.fg, textTransform: 'uppercase' }}>
                            {f.severity}
                          </span>
                          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                            [{f.frameTime.toFixed(1)}s]
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-primary)', marginTop: 2 }}>
                          {f.description}
                        </div>
                        {f.autoFixAvailable && (
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                            Auto-fix available
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
