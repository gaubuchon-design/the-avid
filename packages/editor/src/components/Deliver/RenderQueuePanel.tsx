// =============================================================================
//  THE AVID — Render Queue Panel (Deliver Page Right Panel — Queue Tab)
//  Job list with progress, priority badges, drag-to-reorder, and queue controls.
// =============================================================================

import React from 'react';
import { useDeliverStore } from '../../store/deliver.store';
import type { RenderJob, RenderJobStatus, JobPriority } from '../../types/deliver.types';

// ─── Status & Priority Display ──────────────────────────────────────────────

const STATUS_COLORS: Record<RenderJobStatus, string> = {
  pending: 'var(--text-muted)',
  queued: 'var(--warning)',
  splitting: 'var(--info)',
  encoding: 'var(--brand)',
  uploading: 'var(--info)',
  concatenating: 'var(--info)',
  completed: 'var(--success)',
  failed: 'var(--error)',
  cancelled: 'var(--text-tertiary)',
  paused: 'var(--warning)',
};

const STATUS_LABELS: Record<RenderJobStatus, string> = {
  pending: 'Pending',
  queued: 'Queued',
  splitting: 'Splitting',
  encoding: 'Encoding',
  uploading: 'Uploading',
  concatenating: 'Concatenating',
  completed: 'Complete',
  failed: 'Failed',
  cancelled: 'Cancelled',
  paused: 'Paused',
};

const PRIORITY_COLORS: Record<JobPriority, string> = {
  critical: 'var(--error)',
  high: 'var(--warning)',
  normal: 'var(--text-muted)',
  low: 'var(--text-tertiary)',
  background: 'var(--text-tertiary)',
};

// ─── Component ──────────────────────────────────────────────────────────────

export function RenderQueuePanel() {
  const renderQueue = useDeliverStore((s) => s.renderQueue);
  const isQueueRunning = useDeliverStore((s) => s.isQueueRunning);

  const startRender = useDeliverStore((s) => s.startRender);
  const pauseAllJobs = useDeliverStore((s) => s.pauseAllJobs);
  const cancelAllJobs = useDeliverStore((s) => s.cancelAllJobs);
  const clearQueue = useDeliverStore((s) => s.clearQueue);
  const pauseJob = useDeliverStore((s) => s.pauseJob);
  const resumeJob = useDeliverStore((s) => s.resumeJob);
  const cancelJob = useDeliverStore((s) => s.cancelJob);
  const removeFromQueue = useDeliverStore((s) => s.removeFromQueue);
  const setJobPriority = useDeliverStore((s) => s.setJobPriority);
  const reorderQueue = useDeliverStore((s) => s.reorderQueue);

  // Compute aggregate stats
  const activeJobs = renderQueue.filter((j) => j.status === 'encoding' || j.status === 'splitting' || j.status === 'uploading');
  const overallProgress = renderQueue.length > 0
    ? Math.round(renderQueue.reduce((sum, j) => sum + j.progress, 0) / renderQueue.length)
    : 0;

  return (
    <div style={panelStyle}>
      {/* Queue header with overall progress */}
      {renderQueue.length > 0 && (
        <div style={overallBarStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
              {activeJobs.length} active / {renderQueue.length} total
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-accent)', fontWeight: 600 }}>{overallProgress}%</span>
          </div>
          <div style={progressTrackStyle}>
            <div style={{ ...progressFillStyle, width: `${overallProgress}%`, background: 'var(--brand)' }} />
          </div>
        </div>
      )}

      {/* Job list */}
      <div style={listStyle}>
        {renderQueue.length === 0 && (
          <div style={emptyStyle}>
            <div style={{ fontSize: 18, marginBottom: 6 }}>📭</div>
            <div>No jobs in queue</div>
            <div style={{ fontSize: 9, marginTop: 4, color: 'var(--text-tertiary)' }}>
              Select a template and click "Add to Render Queue"
            </div>
          </div>
        )}

        {renderQueue.map((job, idx) => (
          <JobRow
            key={job.id}
            job={job}
            index={idx}
            total={renderQueue.length}
            onPause={() => pauseJob(job.id)}
            onResume={() => resumeJob(job.id)}
            onCancel={() => cancelJob(job.id)}
            onRemove={() => removeFromQueue(job.id)}
            onMoveUp={() => idx > 0 && reorderQueue(job.id, idx - 1)}
            onMoveDown={() => idx < renderQueue.length - 1 && reorderQueue(job.id, idx + 1)}
            onSetPriority={(p) => setJobPriority(job.id, p)}
          />
        ))}
      </div>

      {/* Queue controls */}
      {renderQueue.length > 0 && (
        <div style={controlsStyle}>
          <div style={{ display: 'flex', gap: 4 }}>
            {!isQueueRunning ? (
              <button onClick={startRender} style={{ ...controlBtnStyle, background: 'var(--success)', color: '#fff', flex: 1 }}>
                ▶ Start Render
              </button>
            ) : (
              <button onClick={pauseAllJobs} style={{ ...controlBtnStyle, background: 'var(--warning)', color: '#000', flex: 1 }}>
                ⏸ Pause All
              </button>
            )}
            <button onClick={cancelAllJobs} style={{ ...controlBtnStyle, background: 'var(--error-dim)', color: 'var(--error)' }}>
              ✕
            </button>
            <button onClick={clearQueue} style={{ ...controlBtnStyle, background: 'var(--bg-overlay)', color: 'var(--text-muted)' }}>
              ⌫
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Job Row ────────────────────────────────────────────────────────────────

function JobRow({
  job,
  index,
  total,
  onPause,
  onResume,
  onCancel,
  onRemove,
  onMoveUp,
  onMoveDown,
  onSetPriority,
}: {
  job: RenderJob;
  index: number;
  total: number;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSetPriority: (p: JobPriority) => void;
}) {
  const isActive = job.status === 'encoding' || job.status === 'splitting' || job.status === 'uploading' || job.status === 'concatenating';
  const isPaused = job.status === 'paused';

  const formatEta = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
  };

  return (
    <div style={rowStyle}>
      <div style={rowHeaderStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={jobNameStyle}>{job.name}</div>
          <div style={jobMetaStyle}>
            <span style={{ ...statusBadge, color: STATUS_COLORS[job.status] }}>
              {STATUS_LABELS[job.status]}
            </span>
            <span style={{ ...priorityBadge, color: PRIORITY_COLORS[job.priority] }}>
              {job.priority}
            </span>
            <span style={codecBadge}>
              {job.exportSettings.videoCodec.toUpperCase()}
            </span>
            {job.segments.length > 1 && (
              <span style={segmentBadge}>
                {job.segments.filter((s) => s.status === 'completed').length}/{job.segments.length} segs
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={jobActionsStyle}>
          {index > 0 && <button onClick={onMoveUp} style={smallBtn} title="Move up">↑</button>}
          {index < total - 1 && <button onClick={onMoveDown} style={smallBtn} title="Move down">↓</button>}
          {isActive && <button onClick={onPause} style={smallBtn} title="Pause">⏸</button>}
          {isPaused && <button onClick={onResume} style={{ ...smallBtn, color: 'var(--success)' }} title="Resume">▶</button>}
          {(isActive || isPaused || job.status === 'queued' || job.status === 'pending') && (
            <button onClick={onCancel} style={{ ...smallBtn, color: 'var(--error)' }} title="Cancel">✕</button>
          )}
          {(job.status === 'cancelled' || job.status === 'failed') && (
            <button onClick={onRemove} style={{ ...smallBtn, color: 'var(--error)' }} title="Remove">⌫</button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={progressTrackStyle}>
        <div
          style={{
            ...progressFillStyle,
            width: `${job.progress}%`,
            background: job.status === 'failed' ? 'var(--error)' :
                        job.status === 'completed' ? 'var(--success)' :
                        job.status === 'paused' ? 'var(--warning)' : 'var(--brand)',
          }}
        />
      </div>

      {/* Progress text */}
      <div style={progressTextStyle}>
        <span>{job.progress}%</span>
        {job.estimatedTimeRemaining && job.estimatedTimeRemaining > 0 && (
          <span>ETA: {formatEta(job.estimatedTimeRemaining)}</span>
        )}
        {job.error && (
          <span style={{ color: 'var(--error)' }}>{job.error}</span>
        )}
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

const overallBarStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderBottom: '1px solid var(--border-default)',
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
};

const emptyStyle: React.CSSProperties = {
  padding: 24,
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
  gap: 4,
};

const jobNameStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const jobMetaStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  marginTop: 2,
  flexWrap: 'wrap',
};

const statusBadge: React.CSSProperties = {
  fontSize: 8,
  fontWeight: 700,
  textTransform: 'uppercase',
};

const priorityBadge: React.CSSProperties = {
  fontSize: 8,
  fontWeight: 600,
  textTransform: 'uppercase',
};

const codecBadge: React.CSSProperties = {
  fontSize: 8,
  padding: '0px 4px',
  borderRadius: 2,
  background: 'var(--bg-overlay)',
  color: 'var(--text-tertiary)',
  fontFamily: 'var(--font-mono)',
};

const segmentBadge: React.CSSProperties = {
  ...codecBadge,
  background: 'var(--info-dim)',
  color: 'var(--info)',
};

const jobActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 2,
  flexShrink: 0,
};

const smallBtn: React.CSSProperties = {
  width: 16,
  height: 16,
  border: 'none',
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 9,
  padding: 0,
  lineHeight: '16px',
  textAlign: 'center',
  borderRadius: 2,
};

const progressTrackStyle: React.CSSProperties = {
  height: 3,
  background: 'var(--bg-overlay)',
  borderRadius: 2,
  marginTop: 4,
  overflow: 'hidden',
};

const progressFillStyle: React.CSSProperties = {
  height: '100%',
  borderRadius: 2,
  transition: 'width 0.3s ease',
};

const progressTextStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 9,
  color: 'var(--text-tertiary)',
  marginTop: 2,
};

const controlsStyle: React.CSSProperties = {
  padding: 6,
  borderTop: '1px solid var(--border-default)',
};

const controlBtnStyle: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 10,
  fontWeight: 600,
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
};
