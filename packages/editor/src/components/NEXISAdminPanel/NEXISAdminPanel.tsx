// =============================================================================
//  THE AVID -- NEXIS Admin Panel (NX-03)
//  Administrative dashboard for NEXIS shared storage: storage allocation view,
//  media ownership table, active bin lock monitor, MediaServices job queue,
//  and system health indicators.
// =============================================================================

import React, { useMemo, useState } from 'react';
import { useNexisStore } from '../../store/nexis.store';
import type { NEXISMediaServicesJob, NEXISBinLock, NEXISCoPresenceUser } from '@mcua/core';

// --- Helpers ----------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const exp = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / 1024 ** exp;
  return `${val.toFixed(exp > 2 ? 1 : 0)} ${units[exp]}`;
}

function usagePercent(used: number, total: number): number {
  return total > 0 ? Math.round((used / total) * 1000) / 10 : 0;
}

function durationStr(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

type AdminTab = 'storage' | 'ownership' | 'locks' | 'jobs' | 'health';

// --- Styles -----------------------------------------------------------------

const S = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: 'var(--bg-surface)',
    overflow: 'hidden',
    minHeight: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  },
  title: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-primary)',
  },
  tabBar: {
    display: 'flex',
    flexShrink: 0,
    borderBottom: '1px solid var(--border-default)',
    overflowX: 'auto' as const,
  },
  tab: (active: boolean) => ({
    padding: '7px 8px',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    color: active ? 'var(--brand-bright)' : 'var(--text-muted)',
    border: 'none',
    background: active ? 'var(--bg-hover)' : 'transparent',
    borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'all 150ms',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  }),
  body: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
    minHeight: 0,
  },
  section: {
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
    marginBottom: '8px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 0',
    fontSize: '11px',
    color: 'var(--text-secondary)',
    borderBottom: '1px solid var(--border-subtle)',
  },
  label: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  value: {
    fontSize: '11px',
    color: 'var(--text-primary)',
    fontWeight: 500,
  },
  barBg: {
    height: '6px',
    borderRadius: '3px',
    background: 'var(--bg-hover)',
    overflow: 'hidden',
    marginTop: '4px',
  },
  barFill: (percent: number) => ({
    height: '100%',
    borderRadius: '3px',
    width: `${Math.min(100, percent)}%`,
    background: percent > 90 ? '#ef4444' : percent > 75 ? '#f59e0b' : 'var(--brand)',
    transition: 'width 300ms',
  }),
  statusBadge: (ok: boolean) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '10px',
    fontWeight: 600,
    background: ok ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
    color: ok ? '#22c55e' : '#ef4444',
  }),
  healthBadge: (status: string) => {
    const colors: Record<string, { bg: string; fg: string }> = {
      healthy: { bg: 'rgba(34, 197, 94, 0.15)', fg: '#22c55e' },
      warning: { bg: 'rgba(245, 158, 11, 0.15)', fg: '#f59e0b' },
      critical: { bg: 'rgba(239, 68, 68, 0.15)', fg: '#ef4444' },
      unknown: { bg: 'rgba(148, 163, 184, 0.15)', fg: '#94a3b8' },
    };
    const c = colors[status] ?? colors['unknown'];
    return {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '2px 8px',
      borderRadius: '10px',
      fontSize: '10px',
      fontWeight: 600,
      background: c!.bg!,
      color: c!.fg!,
    };
  },
  dot: (color: string) => ({
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  }),
  alertItem: (severity: string) => ({
    padding: '6px 8px',
    borderRadius: '4px',
    marginBottom: '4px',
    fontSize: '10px',
    background: severity === 'critical' ? 'rgba(239, 68, 68, 0.08)'
      : severity === 'warning' ? 'rgba(245, 158, 11, 0.08)'
        : 'rgba(91, 106, 245, 0.08)',
    borderLeft: `3px solid ${
      severity === 'critical' ? '#ef4444'
        : severity === 'warning' ? '#f59e0b'
          : '#5b6af5'
    }`,
    color: 'var(--text-secondary)',
  }),
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '10px',
  },
  th: {
    textAlign: 'left' as const,
    padding: '4px 6px',
    borderBottom: '1px solid var(--border-default)',
    color: 'var(--text-muted)',
    fontWeight: 700,
    fontSize: '9px',
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  },
  td: {
    padding: '4px 6px',
    borderBottom: '1px solid var(--border-subtle)',
    color: 'var(--text-secondary)',
    fontSize: '10px',
  },
  empty: {
    textAlign: 'center' as const,
    padding: '24px 12px',
    color: 'var(--text-muted)',
    fontSize: '11px',
  },
};

// --- Storage Allocation Tab -------------------------------------------------

function StorageAllocationTab() {
  const { workspaces, storageGroups, storageUsed, storageTotal } = useNexisStore();

  const allocations = useMemo(() => {
    const result: Array<{
      id: string;
      name: string;
      group: string;
      used: number;
      total: number;
      free: number;
      percent: number;
      health: string;
    }> = [];
    for (const ws of workspaces) {
      const pct = usagePercent(ws.usedCapacityBytes, ws.totalCapacityBytes);
      result.push({
        id: ws.id,
        name: ws.name,
        group: ws.storageGroupName,
        used: ws.usedCapacityBytes,
        total: ws.totalCapacityBytes,
        free: ws.freeCapacityBytes,
        percent: pct,
        health: pct > 95 ? 'critical' : pct > 85 ? 'warning' : 'healthy',
      });
    }
    return result;
  }, [workspaces]);

  const totalPct = usagePercent(storageUsed, storageTotal);

  return (
    <div>
      <div style={S.section}>
        <div style={S.sectionTitle}>Aggregate</div>
        <div style={S.row}>
          <span style={S.label}>Total Used / Capacity</span>
          <span style={S.value}>{formatBytes(storageUsed)} / {formatBytes(storageTotal)}</span>
        </div>
        <div style={S.barBg}>
          <div style={S.barFill(totalPct)} />
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Per-Workspace Allocation</div>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Workspace</th>
              <th style={S.th}>Group</th>
              <th style={S.th}>Used</th>
              <th style={S.th}>Free</th>
              <th style={S.th}>%</th>
              <th style={S.th}>Health</th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((a) => (
              <tr key={a.id}>
                <td style={{ ...S.td, fontWeight: 600, color: 'var(--text-primary)' }}>{a.name}</td>
                <td style={S.td}>{a.group}</td>
                <td style={S.td}>{formatBytes(a.used)}</td>
                <td style={S.td}>{formatBytes(a.free)}</td>
                <td style={S.td}>{a.percent}%</td>
                <td style={S.td}>
                  <span style={S.healthBadge(a.health)}>
                    <span style={S.dot(
                      a.health === 'healthy' ? '#22c55e' : a.health === 'warning' ? '#f59e0b' : '#ef4444'
                    )} />
                    {a.health}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {allocations.length === 0 && (
          <div style={S.empty}>No workspace data</div>
        )}
      </div>

      {/* Storage Groups */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Storage Groups ({storageGroups.length})</div>
        {storageGroups.map((sg) => {
          const pct = usagePercent(sg.usedCapacityBytes, sg.totalCapacityBytes);
          return (
            <div key={sg.id} style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={S.value}>{sg.name}</span>
                <span style={S.healthBadge(sg.healthStatus)}>
                  <span style={S.dot(sg.healthStatus === 'healthy' ? '#22c55e' : sg.healthStatus === 'degraded' ? '#f59e0b' : '#ef4444')} />
                  {sg.healthStatus}
                </span>
              </div>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'flex', gap: '8px', marginTop: '2px' }}>
                <span>{sg.type}</span>
                <span>{sg.workspaces.length} workspace(s)</span>
                <span>{formatBytes(sg.usedCapacityBytes)} / {formatBytes(sg.totalCapacityBytes)}</span>
              </div>
              <div style={S.barBg}>
                <div style={S.barFill(pct)} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Media Ownership Tab ----------------------------------------------------

function MediaOwnershipTab() {
  const { mediaPaths } = useNexisStore();

  return (
    <div>
      <div style={S.section}>
        <div style={S.sectionTitle}>Media Ownership ({mediaPaths.length})</div>
        {mediaPaths.length > 0 ? (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>File</th>
                <th style={S.th}>Workspace</th>
                <th style={S.th}>Owner</th>
                <th style={S.th}>Type</th>
                <th style={S.th}>Size</th>
                <th style={S.th}>Ownership</th>
              </tr>
            </thead>
            <tbody>
              {mediaPaths.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ ...S.td, fontWeight: 500, color: 'var(--text-primary)' }}>{entry.fileName}</td>
                  <td style={S.td}>{entry.workspace}</td>
                  <td style={S.td}>{entry.ownerDisplayName}</td>
                  <td style={S.td}>{entry.mediaType}</td>
                  <td style={S.td}>{formatBytes(entry.sizeBytes)}</td>
                  <td style={S.td}>
                    <span style={S.healthBadge(
                      entry.ownership === 'orphaned' ? 'warning'
                        : entry.ownership === 'foreign' ? 'unknown'
                          : 'healthy'
                    )}>
                      {entry.ownership}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={S.empty}>Browse a workspace to see media ownership data</div>
        )}
      </div>
    </div>
  );
}

// --- Active Bin Locks Tab ---------------------------------------------------

function BinLocksTab() {
  const { binLocks } = useNexisStore();

  const activeLocks = useMemo(() => {
    const now = Date.now();
    return binLocks
      .filter((l) => l.lockStatus === 'locked-self' || l.lockStatus === 'locked-other')
      .map((lock) => {
        const lockedAtMs = lock.lockedAt ? new Date(lock.lockedAt).getTime() : now;
        const durationMs = now - lockedAtMs;
        const isStale = durationMs > 3600000; // > 1 hour
        return { ...lock, durationMs, isStale };
      });
  }, [binLocks]);

  const staleLocks = activeLocks.filter((l) => l.isStale);

  return (
    <div>
      {staleLocks.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Stale Locks ({staleLocks.length})</div>
          {staleLocks.map((lock) => (
            <div key={lock.binId} style={S.alertItem('warning')}>
              <strong>{lock.binName}</strong> locked by {lock.lockedByDisplayName ?? 'unknown'} for {durationStr(lock.durationMs)}
              <span style={{ marginLeft: '6px', fontSize: '9px', color: '#f59e0b' }}>STALE</span>
            </div>
          ))}
        </div>
      )}

      <div style={S.section}>
        <div style={S.sectionTitle}>Active Locks ({activeLocks.length})</div>
        {activeLocks.length > 0 ? (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Bin</th>
                <th style={S.th}>Locked By</th>
                <th style={S.th}>Workspace</th>
                <th style={S.th}>Duration</th>
                <th style={S.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {activeLocks.map((lock) => (
                <tr key={lock.binId}>
                  <td style={{ ...S.td, fontWeight: 500, color: 'var(--text-primary)' }}>{lock.binName}</td>
                  <td style={S.td}>{lock.lockedByDisplayName ?? 'Unknown'}</td>
                  <td style={S.td}>{lock.workspace}</td>
                  <td style={S.td}>{durationStr(lock.durationMs)}</td>
                  <td style={S.td}>
                    <span style={S.healthBadge(lock.isStale ? 'warning' : 'healthy')}>
                      {lock.isStale ? 'stale' : 'active'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={S.empty}>No active bin locks</div>
        )}
      </div>
    </div>
  );
}

// --- Job Queue Tab ----------------------------------------------------------

function JobQueueTab() {
  const { mediaServicesJobs } = useNexisStore();

  const summary = useMemo(() => {
    let queued = 0, running = 0, completed = 0, failed = 0;
    for (const j of mediaServicesJobs) {
      if (j.status === 'queued') queued++;
      else if (j.status === 'running') running++;
      else if (j.status === 'complete') completed++;
      else if (j.status === 'failed') failed++;
    }
    return { queued, running, completed, failed, total: mediaServicesJobs.length };
  }, [mediaServicesJobs]);

  return (
    <div>
      <div style={S.section}>
        <div style={S.sectionTitle}>Queue Summary</div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' as const }}>
          {([
            ['Total', summary.total, '#5b6af5'],
            ['Queued', summary.queued, '#f59e0b'],
            ['Running', summary.running, '#06b6d4'],
            ['Complete', summary.completed, '#22c55e'],
            ['Failed', summary.failed, '#ef4444'],
          ] as const).map(([label, count, color]) => (
            <div key={label} style={{ textAlign: 'center' as const }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color }}>{count}</div>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>All Jobs</div>
        {mediaServicesJobs.length > 0 ? (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Type</th>
                <th style={S.th}>Source</th>
                <th style={S.th}>Destination</th>
                <th style={S.th}>Priority</th>
                <th style={S.th}>Progress</th>
                <th style={S.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {mediaServicesJobs.map((job) => {
                const statusColor =
                  job.status === 'running' ? '#06b6d4'
                    : job.status === 'complete' ? '#22c55e'
                      : job.status === 'failed' ? '#ef4444'
                        : '#f59e0b';
                return (
                  <tr key={job.id}>
                    <td style={{ ...S.td, textTransform: 'capitalize' as const }}>{job.type}</td>
                    <td style={S.td}>{job.sourceFilePath.split('/').pop()}</td>
                    <td style={S.td}>{job.destinationWorkspace}</td>
                    <td style={S.td}>
                      <span style={{
                        fontSize: '9px',
                        fontWeight: 600,
                        color: job.priority === 'urgent' ? '#ef4444' : job.priority === 'high' ? '#f59e0b' : 'var(--text-muted)',
                      }}>
                        {job.priority}
                      </span>
                    </td>
                    <td style={S.td}>
                      <div style={{ width: '40px', ...S.barBg, marginTop: 0 }}>
                        <div style={S.barFill(job.progress)} />
                      </div>
                    </td>
                    <td style={S.td}>
                      <span style={S.healthBadge(
                        job.status === 'complete' ? 'healthy'
                          : job.status === 'failed' ? 'critical'
                            : job.status === 'running' ? 'healthy'
                              : 'unknown'
                      )}>
                        <span style={S.dot(statusColor)} />
                        {job.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={S.empty}>No jobs in queue</div>
        )}
      </div>
    </div>
  );
}

// --- Health Tab --------------------------------------------------------------

function HealthTab() {
  const { workspaces, storageGroups, coPresenceUsers, mediaServicesJobs, binLocks } = useNexisStore();

  const health = useMemo(() => {
    // Compute storage health
    let storageHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
    for (const ws of workspaces) {
      const pct = usagePercent(ws.usedCapacityBytes, ws.totalCapacityBytes);
      if (pct > 95) storageHealth = 'critical';
      else if (pct > 85 && storageHealth !== 'critical') storageHealth = 'warning';
    }

    // Compute services health
    const failedJobs = mediaServicesJobs.filter((j) => j.status === 'failed').length;
    const servicesHealth = failedJobs > 3 ? 'warning' : 'healthy';

    // Stale locks
    const now = Date.now();
    const staleLockCount = binLocks.filter((l) => {
      if (l.lockStatus !== 'locked-self' && l.lockStatus !== 'locked-other') return false;
      const lockedAt = l.lockedAt ? new Date(l.lockedAt).getTime() : now;
      return (now - lockedAt) > 3600000;
    }).length;

    const overallStatus = storageHealth === 'critical' ? 'critical'
      : storageHealth === 'warning' || servicesHealth === 'warning' ? 'warning'
        : 'healthy';

    const activeConnections = coPresenceUsers.filter((u) => u.isOnline).length;

    return {
      overallStatus,
      storageHealth,
      networkHealth: 'healthy' as const,
      servicesHealth,
      activeConnections,
      staleLockCount,
      failedJobs,
    };
  }, [workspaces, mediaServicesJobs, coPresenceUsers, binLocks]);

  const alerts: Array<{ severity: string; message: string }> = [];
  if (health.storageHealth === 'critical') {
    alerts.push({ severity: 'critical', message: 'Storage capacity critically low on one or more workspaces' });
  }
  if (health.storageHealth === 'warning') {
    alerts.push({ severity: 'warning', message: 'Storage usage above 85% on one or more workspaces' });
  }
  if (health.staleLockCount > 0) {
    alerts.push({ severity: 'warning', message: `${health.staleLockCount} stale bin lock(s) detected (>1 hour)` });
  }
  if (health.failedJobs > 0) {
    alerts.push({ severity: 'warning', message: `${health.failedJobs} failed MediaServices job(s)` });
  }

  return (
    <div>
      {/* Overall status */}
      <div style={S.section}>
        <div style={S.sectionTitle}>System Health</div>
        <div style={{
          padding: '12px',
          borderRadius: '6px',
          background: health.overallStatus === 'critical' ? 'rgba(239, 68, 68, 0.08)'
            : health.overallStatus === 'warning' ? 'rgba(245, 158, 11, 0.08)'
              : 'rgba(34, 197, 94, 0.08)',
          textAlign: 'center' as const,
          marginBottom: '12px',
        }}>
          <div style={{
            fontSize: '14px',
            fontWeight: 700,
            textTransform: 'uppercase' as const,
            color: health.overallStatus === 'critical' ? '#ef4444'
              : health.overallStatus === 'warning' ? '#f59e0b'
                : '#22c55e',
          }}>
            {health.overallStatus}
          </div>
        </div>

        <div style={S.row}>
          <span style={S.label}>Storage</span>
          <span style={S.healthBadge(health.storageHealth)}>
            <span style={S.dot(health.storageHealth === 'healthy' ? '#22c55e' : health.storageHealth === 'warning' ? '#f59e0b' : '#ef4444')} />
            {health.storageHealth}
          </span>
        </div>
        <div style={S.row}>
          <span style={S.label}>Network</span>
          <span style={S.healthBadge(health.networkHealth)}>
            <span style={S.dot('#22c55e')} />
            {health.networkHealth}
          </span>
        </div>
        <div style={S.row}>
          <span style={S.label}>Services</span>
          <span style={S.healthBadge(health.servicesHealth)}>
            <span style={S.dot(health.servicesHealth === 'healthy' ? '#22c55e' : '#f59e0b')} />
            {health.servicesHealth}
          </span>
        </div>
        <div style={S.row}>
          <span style={S.label}>Active Connections</span>
          <span style={S.value}>{health.activeConnections}</span>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Alerts ({alerts.length})</div>
          {alerts.map((alert, idx) => (
            <div key={idx} style={S.alertItem(alert.severity)}>
              <span style={{
                fontWeight: 700,
                textTransform: 'uppercase' as const,
                fontSize: '9px',
                marginRight: '6px',
                color: alert.severity === 'critical' ? '#ef4444' : '#f59e0b',
              }}>
                {alert.severity}
              </span>
              {alert.message}
            </div>
          ))}
        </div>
      )}

      {alerts.length === 0 && (
        <div style={S.section}>
          <div style={S.empty}>All systems operational. No alerts.</div>
        </div>
      )}
    </div>
  );
}

// --- Main Component ---------------------------------------------------------

export function NEXISAdminPanel() {
  const [activeTab, setActiveTab] = useState<AdminTab>('storage');
  const { isConnected } = useNexisStore();

  const tabs: Array<{ id: AdminTab; label: string }> = [
    { id: 'storage', label: 'Storage' },
    { id: 'ownership', label: 'Ownership' },
    { id: 'locks', label: 'Locks' },
    { id: 'jobs', label: 'Jobs' },
    { id: 'health', label: 'Health' },
  ];

  return (
    <div style={S.root}>
      <div style={S.header}>
        <span style={S.title}>NEXIS Admin</span>
        <span style={S.statusBadge(isConnected)}>
          <span style={S.dot(isConnected ? '#22c55e' : '#ef4444')} />
          {isConnected ? 'Connected' : 'Offline'}
        </span>
      </div>

      <div style={S.tabBar}>
        {tabs.map((t) => (
          <button
            key={t.id}
            style={S.tab(activeTab === t.id)}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={S.body}>
        {activeTab === 'storage' && <StorageAllocationTab />}
        {activeTab === 'ownership' && <MediaOwnershipTab />}
        {activeTab === 'locks' && <BinLocksTab />}
        {activeTab === 'jobs' && <JobQueueTab />}
        {activeTab === 'health' && <HealthTab />}
      </div>
    </div>
  );
}
