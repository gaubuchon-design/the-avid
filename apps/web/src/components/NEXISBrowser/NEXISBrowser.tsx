// =============================================================================
//  THE AVID -- NEXIS Browser Panel
//  UI for Avid NEXIS shared storage: workspace browsing, bin locks,
//  write targets, co-presence, MediaServices jobs, and cache status.
//  Tabs: Workspaces, Cache, Media Services, Co-Presence
// =============================================================================

import React, { useCallback, useMemo } from 'react';
import { useNexisStore } from '../../store/nexis.store';

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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

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
  dot: (color: string) => ({
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  }),
  tabBar: {
    display: 'flex',
    flexShrink: 0,
    borderBottom: '1px solid var(--border-default)',
  },
  tab: (active: boolean) => ({
    flex: 1,
    padding: '7px 6px',
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
  btn: (variant: 'primary' | 'secondary' | 'danger') => ({
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 150ms',
    background: variant === 'primary' ? 'var(--brand)' : variant === 'danger' ? '#ef4444' : 'var(--bg-hover)',
    color: variant === 'primary' || variant === 'danger' ? '#fff' : 'var(--text-primary)',
  }),
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
  wsCard: (isActive: boolean) => ({
    padding: '8px 10px',
    borderRadius: '6px',
    border: isActive ? '1px solid var(--brand)' : '1px solid var(--border-subtle)',
    background: isActive ? 'rgba(91, 106, 245, 0.08)' : 'transparent',
    marginBottom: '6px',
    cursor: 'pointer',
    transition: 'all 150ms',
  }),
  wsName: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  wsMeta: {
    fontSize: '9px',
    color: 'var(--text-muted)',
    marginTop: '2px',
    display: 'flex',
    gap: '8px',
  },
  lockBadge: (self: boolean) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '9px',
    fontWeight: 600,
    background: self ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
    color: self ? '#22c55e' : '#ef4444',
  }),
  userRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 0',
    borderBottom: '1px solid var(--border-subtle)',
  },
  avatar: (color: string) => ({
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '9px',
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
  }),
  jobRow: {
    padding: '6px 0',
    borderBottom: '1px solid var(--border-subtle)',
  },
  jobHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '11px',
  },
  empty: {
    textAlign: 'center' as const,
    padding: '24px 12px',
    color: 'var(--text-muted)',
    fontSize: '11px',
  },
};

// --- User Color Map ---------------------------------------------------------

const USER_COLORS = ['#5b6af5', '#7c5cfc', '#e05dbb', '#f59e0b', '#22c55e', '#06b6d4', '#ef4444', '#8b5cf6'];
function userColor(idx: number): string {
  return USER_COLORS[idx % USER_COLORS.length];
}

// --- Workspaces Tab ---------------------------------------------------------

function WorkspacesTab() {
  const {
    workspaces,
    activeWorkspaceId,
    selectWorkspace,
    binLocks,
    lockPath,
    unlockPath,
    mediaPaths,
    storageUsed,
    storageTotal,
  } = useNexisStore();

  const percent = usagePercent(storageUsed, storageTotal);

  return (
    <div>
      {/* Aggregate storage */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Total Storage</div>
        <div style={S.row}>
          <span style={S.label}>Used / Total</span>
          <span style={S.value}>{formatBytes(storageUsed)} / {formatBytes(storageTotal)}</span>
        </div>
        <div style={S.barBg}>
          <div style={S.barFill(percent)} />
        </div>
        <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px', textAlign: 'right' as const }}>
          {percent}% used
        </div>
      </div>

      {/* Workspace list */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Workspaces ({workspaces.length})</div>
        {workspaces.map((ws) => {
          const pct = usagePercent(ws.usedCapacityBytes, ws.totalCapacityBytes);
          const isActive = ws.id === activeWorkspaceId;
          return (
            <div
              key={ws.id}
              style={S.wsCard(isActive)}
              onClick={() => selectWorkspace(ws.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={S.wsName}>{ws.name}</span>
                <span style={S.statusBadge(ws.mountStatus === 'mounted')}>
                  <span style={S.dot(ws.mountStatus === 'mounted' ? '#22c55e' : '#ef4444')} />
                  {ws.mountStatus}
                </span>
              </div>
              <div style={S.wsMeta}>
                <span>{formatBytes(ws.usedCapacityBytes)} / {formatBytes(ws.totalCapacityBytes)}</span>
                <span>{pct}%</span>
                <span>{ws.storageGroupName}</span>
                {ws.isProtected && <span style={{ color: '#f59e0b' }}>protected</span>}
              </div>
              <div style={S.barBg}>
                <div style={S.barFill(pct)} />
              </div>
            </div>
          );
        })}
        {workspaces.length === 0 && (
          <div style={S.empty}>No workspaces. Connect to a NEXIS engine to browse.</div>
        )}
      </div>

      {/* Bin Locks */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Bin Locks ({binLocks.length})</div>
        {binLocks.map((lock) => (
          <div key={lock.binId} style={S.row}>
            <div>
              <div style={S.value}>{lock.binName}</div>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{lock.workspace}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={S.lockBadge(lock.lockStatus === 'locked-self')}>
                {lock.lockStatus === 'locked-self' ? 'You' : lock.lockedByDisplayName ?? 'Unlocked'}
              </span>
              {lock.lockStatus === 'locked-self' && (
                <button style={{ ...S.btn('secondary'), padding: '2px 6px' }} onClick={() => unlockPath(lock.binId)}>
                  Unlock
                </button>
              )}
            </div>
          </div>
        ))}
        {binLocks.length === 0 && (
          <div style={S.empty}>No active bin locks</div>
        )}
      </div>

      {/* Media entries */}
      {mediaPaths.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Media ({mediaPaths.length})</div>
          {mediaPaths.map((entry) => (
            <div key={entry.id} style={S.row}>
              <div>
                <div style={S.value}>{entry.fileName}</div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{entry.workspace} - {entry.mediaType}</div>
              </div>
              <span style={S.label}>{formatBytes(entry.sizeBytes)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Cache Tab --------------------------------------------------------------

function CacheTab() {
  const { cacheStats, cacheEntries, refreshCache } = useNexisStore();
  const percent = usagePercent(cacheStats.usedBytes, cacheStats.totalCapacityBytes);

  return (
    <div>
      <div style={S.section}>
        <div style={S.sectionTitle}>Cache Overview</div>
        <div style={S.row}>
          <span style={S.label}>Used / Capacity</span>
          <span style={S.value}>{formatBytes(cacheStats.usedBytes)} / {formatBytes(cacheStats.totalCapacityBytes)}</span>
        </div>
        <div style={S.barBg}>
          <div style={S.barFill(percent)} />
        </div>
        <div style={S.row}>
          <span style={S.label}>Entries</span>
          <span style={S.value}>{cacheStats.entryCount}</span>
        </div>
        <div style={S.row}>
          <span style={S.label}>Pinned</span>
          <span style={S.value}>{cacheStats.pinnedCount}</span>
        </div>
        <div style={S.row}>
          <span style={S.label}>Hit Rate</span>
          <span style={S.value}>{(cacheStats.hitRate * 100).toFixed(1)}%</span>
        </div>
        <div style={S.row}>
          <span style={S.label}>Avg Fetch Time</span>
          <span style={S.value}>{cacheStats.averageFetchTimeMs.toFixed(0)} ms</span>
        </div>
        <div style={S.row}>
          <span style={S.label}>Bandwidth</span>
          <span style={S.value}>{cacheStats.bandwidthUsageMbps.toFixed(1)} Mbps</span>
        </div>
        <div style={{ marginTop: '8px' }}>
          <button style={S.btn('secondary')} onClick={refreshCache}>Refresh Cache</button>
        </div>
      </div>

      {/* Cache Entries */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Cached Assets ({cacheEntries.length})</div>
        {cacheEntries.map((entry) => (
          <div key={entry.id} style={S.row}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={S.dot(
                  entry.healthIndicator === 'green' ? '#22c55e'
                    : entry.healthIndicator === 'yellow' ? '#f59e0b'
                      : '#94a3b8'
                )} />
                <span style={S.value}>{entry.fileName}</span>
                {entry.isPinned && <span style={{ fontSize: '8px', color: '#f59e0b' }}>PINNED</span>}
              </div>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                {formatBytes(entry.cachedBytes)} / {formatBytes(entry.sizeBytes)} - {entry.status}
              </div>
            </div>
          </div>
        ))}
        {cacheEntries.length === 0 && (
          <div style={S.empty}>Cache is empty</div>
        )}
      </div>
    </div>
  );
}

// --- Media Services Tab -----------------------------------------------------

function MediaServicesTab() {
  const { mediaServicesJobs, removeMediaServicesJob } = useNexisStore();

  const { queued, running, completed, failed } = useMemo(() => {
    let q = 0, r = 0, c = 0, f = 0;
    for (const j of mediaServicesJobs) {
      if (j.status === 'queued') q++;
      else if (j.status === 'running') r++;
      else if (j.status === 'complete') c++;
      else if (j.status === 'failed') f++;
    }
    return { queued: q, running: r, completed: c, failed: f };
  }, [mediaServicesJobs]);

  return (
    <div>
      <div style={S.section}>
        <div style={S.sectionTitle}>Queue Summary</div>
        <div style={S.row}>
          <span style={S.label}>Queued</span>
          <span style={S.value}>{queued}</span>
        </div>
        <div style={S.row}>
          <span style={S.label}>Running</span>
          <span style={{ ...S.value, color: running > 0 ? '#5b6af5' : 'var(--text-primary)' }}>{running}</span>
        </div>
        <div style={S.row}>
          <span style={S.label}>Completed</span>
          <span style={{ ...S.value, color: '#22c55e' }}>{completed}</span>
        </div>
        <div style={S.row}>
          <span style={S.label}>Failed</span>
          <span style={{ ...S.value, color: failed > 0 ? '#ef4444' : 'var(--text-primary)' }}>{failed}</span>
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Jobs ({mediaServicesJobs.length})</div>
        {mediaServicesJobs.map((job) => {
          const statusColor =
            job.status === 'running' ? '#5b6af5'
              : job.status === 'complete' ? '#22c55e'
                : job.status === 'failed' ? '#ef4444'
                  : job.status === 'cancelled' ? '#94a3b8'
                    : '#f59e0b';
          return (
            <div key={job.id} style={S.jobRow}>
              <div style={S.jobHeader}>
                <div>
                  <span style={{ ...S.value, textTransform: 'capitalize' as const }}>{job.type}</span>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                    {job.priority}
                  </span>
                </div>
                <span style={{ ...S.statusBadge(job.status === 'complete'), background: `${statusColor}20`, color: statusColor }}>
                  <span style={S.dot(statusColor)} />
                  {job.status}
                </span>
              </div>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {job.sourceFilePath.split('/').pop()} &rarr; {job.destinationWorkspace}
              </div>
              {(job.status === 'running' || job.status === 'queued') && (
                <div style={S.barBg}>
                  <div style={S.barFill(job.progress)} />
                </div>
              )}
              {job.status === 'running' && job.estimatedRemainingSeconds != null && (
                <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  ~{Math.ceil(job.estimatedRemainingSeconds / 60)}m remaining
                </div>
              )}
              {job.status === 'failed' && job.errorMessage && (
                <div style={{ fontSize: '9px', color: '#ef4444', marginTop: '2px' }}>{job.errorMessage}</div>
              )}
              {(job.status === 'complete' || job.status === 'failed' || job.status === 'cancelled') && (
                <button
                  style={{ ...S.btn('secondary'), padding: '1px 6px', fontSize: '9px', marginTop: '4px' }}
                  onClick={() => removeMediaServicesJob(job.id)}
                >
                  Dismiss
                </button>
              )}
            </div>
          );
        })}
        {mediaServicesJobs.length === 0 && (
          <div style={S.empty}>No MediaServices jobs</div>
        )}
      </div>
    </div>
  );
}

// --- Co-Presence Tab --------------------------------------------------------

function CoPresenceTab() {
  const { coPresenceUsers } = useNexisStore();

  const online = useMemo(() => coPresenceUsers.filter((u) => u.isOnline), [coPresenceUsers]);
  const offline = useMemo(() => coPresenceUsers.filter((u) => !u.isOnline), [coPresenceUsers]);

  return (
    <div>
      <div style={S.section}>
        <div style={S.sectionTitle}>Online ({online.length})</div>
        {online.map((u, i) => (
          <div key={u.userId} style={S.userRow}>
            <div style={S.avatar(userColor(i))}>{u.displayName[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={S.value}>{u.displayName}</div>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'flex', gap: '6px' }}>
                <span>{u.application}</span>
                <span>{u.workspace}</span>
                <span>{u.connectionType}</span>
              </div>
            </div>
            <span style={S.dot('#22c55e')} />
          </div>
        ))}
        {online.length === 0 && (
          <div style={S.empty}>No users online</div>
        )}
      </div>

      {offline.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Offline ({offline.length})</div>
          {offline.map((u, i) => (
            <div key={u.userId} style={S.userRow}>
              <div style={S.avatar('#64748b')}>{u.displayName[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ ...S.value, color: 'var(--text-muted)' }}>{u.displayName}</div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                  Last seen {relativeTime(u.lastActiveAt)}
                </div>
              </div>
              <span style={S.dot('#94a3b8')} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Write Targets Section --------------------------------------------------

function WriteTargetsSection() {
  const { writeTargets } = useNexisStore();

  if (writeTargets.length === 0) return null;

  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Write Targets</div>
      {writeTargets.filter((t) => t.isDefault).map((target) => (
        <div key={`${target.workspaceId}-${target.purpose}`} style={S.row}>
          <span style={S.label}>{target.purpose}</span>
          <span style={S.value}>{target.workspaceName}</span>
        </div>
      ))}
    </div>
  );
}

// --- Main Component ---------------------------------------------------------

export function NEXISBrowser() {
  const {
    isConnected,
    connectionStatus,
    hostname,
    activeNexisTab,
    setActiveNexisTab,
    connectWorkspace,
    disconnectWorkspace,
  } = useNexisStore();

  const handleConnect = useCallback(() => {
    connectWorkspace('nexis-engine.local');
  }, [connectWorkspace]);

  const tabs: Array<{ id: typeof activeNexisTab; label: string }> = [
    { id: 'workspaces', label: 'Workspaces' },
    { id: 'cache', label: 'Cache' },
    { id: 'media-services', label: 'Jobs' },
    { id: 'co-presence', label: 'Users' },
  ];

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.title}>NEXIS Storage</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {hostname && (
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {hostname}
            </span>
          )}
          <span style={S.statusBadge(isConnected)}>
            <span style={S.dot(isConnected ? '#22c55e' : '#ef4444')} />
            {connectionStatus}
          </span>
        </div>
      </div>

      {/* Connection bar */}
      {!isConnected && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
          <button style={S.btn('primary')} onClick={handleConnect}>
            Connect to NEXIS
          </button>
        </div>
      )}
      {isConnected && (
        <div style={{ padding: '4px 12px', borderBottom: '1px solid var(--border-default)', flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <button style={{ ...S.btn('danger'), padding: '3px 8px' }} onClick={disconnectWorkspace}>
            Disconnect
          </button>
        </div>
      )}

      {/* Tab Bar */}
      <div style={S.tabBar}>
        {tabs.map((t) => (
          <button
            key={t.id}
            style={S.tab(activeNexisTab === t.id)}
            onClick={() => setActiveNexisTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={S.body}>
        {activeNexisTab === 'workspaces' && (
          <>
            <WriteTargetsSection />
            <WorkspacesTab />
          </>
        )}
        {activeNexisTab === 'cache' && <CacheTab />}
        {activeNexisTab === 'media-services' && <MediaServicesTab />}
        {activeNexisTab === 'co-presence' && <CoPresenceTab />}
      </div>
    </div>
  );
}
