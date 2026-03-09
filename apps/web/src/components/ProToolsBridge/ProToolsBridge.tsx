// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Pro Tools Bridge Panel
//  UI for the unified live session bridge between Avid and Pro Tools.
//  Tabs: Session, Markers, AAF, Comments
// ═══════════════════════════════════════════════════════════════════════════

import React, { useCallback } from 'react';
import { useProToolsStore } from '../../store/protools.store';

// ─── Styles ─────────────────────────────────────────────────────────────────

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
  statusBadge: (connected: boolean) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '10px',
    fontWeight: 600,
    background: connected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
    color: connected ? '#22c55e' : '#ef4444',
  }),
  dot: (color: string) => ({
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: color,
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
  participantRow: {
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
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 0',
  },
  toggle: (on: boolean) => ({
    width: '28px',
    height: '16px',
    borderRadius: '8px',
    background: on ? 'var(--brand)' : 'var(--bg-hover)',
    position: 'relative' as const,
    cursor: 'pointer',
    transition: 'background 150ms',
    border: 'none',
    padding: 0,
  }),
  toggleKnob: (on: boolean) => ({
    position: 'absolute' as const,
    top: '2px',
    left: on ? '14px' : '2px',
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    background: '#fff',
    transition: 'left 150ms',
  }),
  commentItem: {
    padding: '8px 0',
    borderBottom: '1px solid var(--border-subtle)',
  },
  commentAuthor: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  commentBody: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    marginTop: '2px',
    lineHeight: 1.4,
  },
  commentMeta: {
    fontSize: '9px',
    color: 'var(--text-muted)',
    marginTop: '4px',
    display: 'flex',
    gap: '8px',
  },
  empty: {
    textAlign: 'center' as const,
    padding: '24px 12px',
    color: 'var(--text-muted)',
    fontSize: '11px',
  },
};

// ─── Sub-Components ─────────────────────────────────────────────────────────

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button style={S.toggle(on)} onClick={onToggle} type="button" aria-pressed={on}>
      <div style={S.toggleKnob(on)} />
    </button>
  );
}

function SessionTab() {
  const {
    bridgeStatus, isConnected, sessionId, participants,
    playheadSyncEnabled, ripplePropagationEnabled,
    togglePlayheadSync, toggleRipplePropagation,
    connectSession, disconnectSession,
  } = useProToolsStore();

  const handleConnect = useCallback(() => {
    connectSession(`session-${Date.now()}`, [
      { userId: 'local', displayName: 'Editor', application: 'avid', color: '#5b6af5', playheadTimeSeconds: 0, selectedTrackIds: [], isOnline: true, lastActiveAt: new Date().toISOString() },
      { userId: 'pt-mixer', displayName: 'PT Mixer', application: 'protools', color: '#7c5cfc', playheadTimeSeconds: 0, selectedTrackIds: [], isOnline: true, lastActiveAt: new Date().toISOString() },
    ]);
  }, [connectSession]);

  return (
    <div>
      <div style={S.section}>
        <div style={S.sectionTitle}>Connection</div>
        <div style={S.row}>
          <span style={S.label}>Status</span>
          <span style={S.statusBadge(isConnected)}>
            <span style={S.dot(isConnected ? '#22c55e' : '#ef4444')} />
            {bridgeStatus}
          </span>
        </div>
        {sessionId && (
          <div style={S.row}>
            <span style={S.label}>Session</span>
            <span style={{ ...S.value, fontSize: '9px', fontFamily: 'monospace' }}>{sessionId.slice(0, 20)}...</span>
          </div>
        )}
        <div style={{ marginTop: '8px' }}>
          {!isConnected ? (
            <button style={S.btn('primary')} onClick={handleConnect}>Connect to Pro Tools</button>
          ) : (
            <button style={S.btn('danger')} onClick={disconnectSession}>Disconnect</button>
          )}
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Sync Options</div>
        <div style={S.toggleRow}>
          <span style={S.label}>Shared Playhead</span>
          <Toggle on={playheadSyncEnabled} onToggle={togglePlayheadSync} />
        </div>
        <div style={S.toggleRow}>
          <span style={S.label}>Ripple Propagation</span>
          <Toggle on={ripplePropagationEnabled} onToggle={toggleRipplePropagation} />
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Participants ({participants.length})</div>
        {participants.map((p) => (
          <div key={p.userId} style={S.participantRow}>
            <div style={S.avatar(p.color)}>{p.displayName[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={S.value}>{p.displayName}</div>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{p.application}</div>
            </div>
            <span style={S.dot(p.isOnline ? '#22c55e' : '#94a3b8')} />
          </div>
        ))}
        {participants.length === 0 && (
          <div style={S.empty}>No participants connected</div>
        )}
      </div>
    </div>
  );
}

function MarkerSyncTab() {
  const {
    markerSyncStatus, markerSyncDirection, markerMappings, markerConflicts,
    lastMarkerSyncAt, markerSyncMode,
    setMarkerSyncDirection, setMarkerSyncMode, syncMarkers,
  } = useProToolsStore();

  return (
    <div>
      <div style={S.section}>
        <div style={S.sectionTitle}>Marker Sync</div>
        <div style={S.row}>
          <span style={S.label}>Status</span>
          <span style={S.statusBadge(markerSyncStatus === 'synced')}>
            <span style={S.dot(markerSyncStatus === 'synced' ? '#22c55e' : markerSyncStatus === 'conflict' ? '#f59e0b' : '#94a3b8')} />
            {markerSyncStatus}
          </span>
        </div>
        <div style={S.row}>
          <span style={S.label}>Mappings</span>
          <span style={S.value}>{markerMappings.length}</span>
        </div>
        <div style={S.row}>
          <span style={S.label}>Conflicts</span>
          <span style={{ ...S.value, color: markerConflicts.length > 0 ? '#f59e0b' : 'var(--text-primary)' }}>
            {markerConflicts.length}
          </span>
        </div>
        {lastMarkerSyncAt && (
          <div style={S.row}>
            <span style={S.label}>Last Sync</span>
            <span style={S.value}>{new Date(lastMarkerSyncAt).toLocaleTimeString()}</span>
          </div>
        )}
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Direction</div>
        {(['bidirectional', 'avid-to-pt', 'pt-to-avid'] as const).map((dir) => (
          <div key={dir} style={S.row}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="sync-direction"
                checked={markerSyncDirection === dir}
                onChange={() => setMarkerSyncDirection(dir)}
              />
              <span style={S.label}>{dir === 'bidirectional' ? 'Bidirectional' : dir === 'avid-to-pt' ? 'Avid to PT' : 'PT to Avid'}</span>
            </label>
          </div>
        ))}
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Mode</div>
        {(['realtime', 'aaf-delta', 'manual'] as const).map((mode) => (
          <div key={mode} style={S.row}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="sync-mode"
                checked={markerSyncMode === mode}
                onChange={() => setMarkerSyncMode(mode)}
              />
              <span style={S.label}>{mode === 'realtime' ? 'Real-time' : mode === 'aaf-delta' ? 'AAF Delta' : 'Manual'}</span>
            </label>
          </div>
        ))}
      </div>

      <button style={S.btn('primary')} onClick={syncMarkers}>Sync Now</button>
    </div>
  );
}

function AAFTab() {
  const { aafExportJobs, aafImportJobs, exportAAF, importAAF } = useProToolsStore();

  const handleExport = useCallback(() => {
    exportAAF({
      id: `export-${Date.now()}`,
      fileName: `project_export_${Date.now()}.aaf`,
      status: 'exporting',
      progress: 0,
      error: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
    });
  }, [exportAAF]);

  const handleImport = useCallback(() => {
    importAAF({
      id: `import-${Date.now()}`,
      fileName: `revised_mix_${Date.now()}.aaf`,
      status: 'parsing',
      progress: 0,
      diff: [],
      error: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
    });
  }, [importAAF]);

  return (
    <div>
      <div style={S.section}>
        <div style={S.sectionTitle}>AAF Export</div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <button style={S.btn('primary')} onClick={handleExport}>Export to Pro Tools</button>
        </div>
        {aafExportJobs.map((job) => (
          <div key={job.id} style={S.row}>
            <span style={S.label}>{job.fileName}</span>
            <span style={S.statusBadge(job.status === 'complete')}>
              {job.status}
            </span>
          </div>
        ))}
        {aafExportJobs.length === 0 && (
          <div style={S.empty}>No exports yet</div>
        )}
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>AAF Import</div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <button style={S.btn('secondary')} onClick={handleImport}>Import from Pro Tools</button>
        </div>
        {aafImportJobs.map((job) => (
          <div key={job.id} style={S.row}>
            <span style={S.label}>{job.fileName}</span>
            <span style={S.statusBadge(job.status === 'complete')}>
              {job.status} {job.diff.length > 0 && `(${job.diff.length} changes)`}
            </span>
          </div>
        ))}
        {aafImportJobs.length === 0 && (
          <div style={S.empty}>No imports yet</div>
        )}
      </div>
    </div>
  );
}

function CommentsTab() {
  const { comments, resolveComment } = useProToolsStore();

  return (
    <div>
      <div style={S.sectionTitle}>Inline Comments ({comments.length})</div>
      {comments.map((c) => (
        <div key={c.id} style={S.commentItem}>
          <div style={S.commentAuthor}>
            {c.authorName}
            <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '6px' }}>
              ({c.sourceApp})
            </span>
          </div>
          <div style={S.commentBody}>{c.body}</div>
          <div style={S.commentMeta}>
            <span>{c.timeSeconds.toFixed(1)}s</span>
            <span>{c.resolved ? 'Resolved' : 'Open'}</span>
            {!c.resolved && (
              <button
                style={{ ...S.btn('secondary'), padding: '1px 6px', fontSize: '9px' }}
                onClick={() => resolveComment(c.id)}
              >
                Resolve
              </button>
            )}
          </div>
        </div>
      ))}
      {comments.length === 0 && (
        <div style={S.empty}>No comments yet. Comments from both Avid and Pro Tools appear here.</div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ProToolsBridge() {
  const { isConnected, activeProToolsTab, setActiveProToolsTab } = useProToolsStore();

  const tabs: Array<{ id: typeof activeProToolsTab; label: string }> = [
    { id: 'session', label: 'Session' },
    { id: 'markers', label: 'Markers' },
    { id: 'aaf', label: 'AAF' },
    { id: 'comments', label: 'Comments' },
  ];

  return (
    <div style={S.root}>
      <div style={S.header}>
        <span style={S.title}>Pro Tools Bridge</span>
        <span style={S.statusBadge(isConnected)}>
          <span style={S.dot(isConnected ? '#22c55e' : '#ef4444')} />
          {isConnected ? 'Connected' : 'Offline'}
        </span>
      </div>

      <div style={S.tabBar}>
        {tabs.map((t) => (
          <button
            key={t.id}
            style={S.tab(activeProToolsTab === t.id)}
            onClick={() => setActiveProToolsTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={S.body}>
        {activeProToolsTab === 'session' && <SessionTab />}
        {activeProToolsTab === 'markers' && <MarkerSyncTab />}
        {activeProToolsTab === 'aaf' && <AAFTab />}
        {activeProToolsTab === 'comments' && <CommentsTab />}
      </div>
    </div>
  );
}
