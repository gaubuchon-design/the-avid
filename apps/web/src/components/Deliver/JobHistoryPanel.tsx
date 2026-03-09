// =============================================================================
//  THE AVID — Job History Panel (Deliver Page Right Panel — History Tab)
//  Completed and failed job history with retry and clear actions.
// =============================================================================

import React, { useMemo, useState } from 'react';
import { useDeliverStore } from '../../store/deliver.store';
import type { RenderJob } from '../../types/deliver.types';

// ─── Component ──────────────────────────────────────────────────────────────

export function JobHistoryPanel() {
  const completedJobs = useDeliverStore((s) => s.completedJobs);
  const clearHistory = useDeliverStore((s) => s.clearHistory);
  const retryJob = useDeliverStore((s) => s.retryJob);

  const [filter, setFilter] = useState<'all' | 'completed' | 'failed'>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return completedJobs;
    return completedJobs.filter((j) =>
      filter === 'completed' ? j.status === 'completed' : j.status === 'failed',
    );
  }, [completedJobs, filter]);

  const completedCount = completedJobs.filter((j) => j.status === 'completed').length;
  const failedCount = completedJobs.filter((j) => j.status === 'failed').length;

  return (
    <div style={panelStyle}>
      {/* Filter bar */}
      <div style={filterBarStyle}>
        <button onClick={() => setFilter('all')} style={{ ...filterBtn, ...(filter === 'all' ? activeFilter : {}) }}>
          All ({completedJobs.length})
        </button>
        <button onClick={() => setFilter('completed')} style={{ ...filterBtn, ...(filter === 'completed' ? activeFilter : {}) }}>
          Completed ({completedCount})
        </button>
        <button onClick={() => setFilter('failed')} style={{ ...filterBtn, ...(filter === 'failed' ? activeFilter : {}) }}>
          Failed ({failedCount})
        </button>
        <div style={{ flex: 1 }} />
        {completedJobs.length > 0 && (
          <button onClick={clearHistory} style={clearBtn}>Clear</button>
        )}
      </div>

      {/* Job list */}
      <div style={listStyle}>
        {filtered.length === 0 && (
          <div style={emptyStyle}>
            {completedJobs.length === 0
              ? 'No render history yet.'
              : `No ${filter} jobs.`}
          </div>
        )}
        {filtered.map((job) => (
          <HistoryRow key={job.id} job={job} onRetry={job.status === 'failed' ? () => retryJob(job.id) : undefined} />
        ))}
      </div>
    </div>
  );
}

// ─── History Row ────────────────────────────────────────────────────────────

function HistoryRow({ job, onRetry }: { job: RenderJob; onRetry?: () => void }) {
  const completedDate = job.completedAt ? new Date(job.completedAt) : null;
  const startDate = job.startedAt ? new Date(job.startedAt) : null;
  const duration = job.startedAt && job.completedAt
    ? Math.round((job.completedAt - job.startedAt) / 1000)
    : null;

  const formatDuration = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div style={rowStyle}>
      <div style={rowHeaderStyle}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: job.status === 'completed' ? 'var(--success)' :
                      job.status === 'failed' ? 'var(--error)' : 'var(--text-tertiary)',
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={nameStyle}>{job.name}</div>
          <div style={metaStyle}>
            <span>{job.exportSettings.videoCodec.toUpperCase()}</span>
            <span style={dotSep}>·</span>
            <span>{job.exportSettings.resolution.width}x{job.exportSettings.resolution.height}</span>
            {duration !== null && (
              <>
                <span style={dotSep}>·</span>
                <span>{formatDuration(duration)}</span>
              </>
            )}
            {job.outputSize && (
              <>
                <span style={dotSep}>·</span>
                <span>{formatSize(job.outputSize)}</span>
              </>
            )}
          </div>
        </div>
        {onRetry && (
          <button onClick={onRetry} style={retryBtn} title="Retry">↻</button>
        )}
      </div>

      {job.error && (
        <div style={errorStyle}>{job.error}</div>
      )}

      {job.outputPath && (
        <div style={outputStyle}>{job.outputPath}</div>
      )}

      <div style={timestampStyle}>
        {completedDate && completedDate.toLocaleString()}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  overflow: 'hidden',
};

const filterBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  padding: '4px 8px',
  borderBottom: '1px solid var(--border-default)',
  alignItems: 'center',
};

const filterBtn: React.CSSProperties = {
  fontSize: 9,
  padding: '2px 6px',
  borderRadius: 3,
  border: 'none',
  cursor: 'pointer',
  fontWeight: 600,
  background: 'transparent',
  color: 'var(--text-muted)',
};

const activeFilter: React.CSSProperties = {
  background: 'var(--brand-dim)',
  color: 'var(--text-accent)',
};

const clearBtn: React.CSSProperties = {
  fontSize: 9,
  padding: '2px 6px',
  borderRadius: 3,
  border: '1px solid var(--border-subtle)',
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
};

const emptyStyle: React.CSSProperties = {
  padding: 20,
  textAlign: 'center',
  color: 'var(--text-muted)',
  fontSize: 11,
};

const rowStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderBottom: '1px solid var(--border-subtle)',
};

const rowHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
};

const nameStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const metaStyle: React.CSSProperties = {
  fontSize: 9,
  color: 'var(--text-tertiary)',
  display: 'flex',
  gap: 4,
  marginTop: 1,
};

const dotSep: React.CSSProperties = {
  color: 'var(--text-tertiary)',
};

const retryBtn: React.CSSProperties = {
  width: 20,
  height: 20,
  border: '1px solid var(--border-subtle)',
  borderRadius: 3,
  background: 'transparent',
  color: 'var(--warning)',
  cursor: 'pointer',
  fontSize: 12,
  padding: 0,
  lineHeight: '18px',
  textAlign: 'center',
  flexShrink: 0,
};

const errorStyle: React.CSSProperties = {
  fontSize: 9,
  color: 'var(--error)',
  marginTop: 3,
  padding: '2px 6px',
  background: 'var(--error-dim)',
  borderRadius: 2,
};

const outputStyle: React.CSSProperties = {
  fontSize: 9,
  color: 'var(--text-tertiary)',
  fontFamily: 'var(--font-mono)',
  marginTop: 3,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const timestampStyle: React.CSSProperties = {
  fontSize: 8,
  color: 'var(--text-tertiary)',
  marginTop: 3,
};
