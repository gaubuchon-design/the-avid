import React, { useEffect, useRef } from 'react';
import { useEditorStore } from '../../store/editor.store';

const EXPORT_PRESETS = [
  { label: 'Review Screener', preset: 'H.264 Review', destination: 'Frame.io review room' },
  { label: 'Broadcast Master', preset: 'DNxHR MXF', destination: 'Local mastering volume' },
  { label: 'Social Package', preset: 'Vertical Social Pack', destination: 'Instagram, TikTok, YouTube Shorts' },
] as const;

export function PublishPanel() {
  const timersRef = useRef(new Map<string, number>());
  const { publishJobs, desktopJobs, queuePublishJob, updatePublishJob } = useEditorStore();

  useEffect(() => {
    for (const job of publishJobs) {
      if (job.status !== 'QUEUED' || timersRef.current.has(job.id)) {
        continue;
      }

      updatePublishJob(job.id, { status: 'PROCESSING', progress: 8 });

      const timerId = window.setInterval(() => {
        const currentJob = useEditorStore.getState().publishJobs.find((item) => item.id === job.id);
        if (!currentJob) {
          window.clearInterval(timerId);
          timersRef.current.delete(job.id);
          return;
        }

        const nextProgress = Math.min(100, currentJob.progress + 23);
        if (nextProgress >= 100) {
          updatePublishJob(job.id, {
            status: 'COMPLETED',
            progress: 100,
            outputSummary: `Delivered to ${currentJob.destination}`,
          });
          window.clearInterval(timerId);
          timersRef.current.delete(job.id);
          return;
        }

        updatePublishJob(job.id, {
          status: 'PROCESSING',
          progress: nextProgress,
        });
      }, 420);

      timersRef.current.set(job.id, timerId);
    }
  }, [publishJobs, updatePublishJob]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timerId) => window.clearInterval(timerId));
      timersRef.current.clear();
    };
  }, []);

  return (
    <div className="publish-panel panel">
      <div className="panel-header">
        <span className="panel-title">Export Queue</span>
        <span className="badge badge-accent" style={{ marginLeft: 'auto' }}>{publishJobs.length} jobs</span>
      </div>

      <div className="panel-body">
        <div className="review-section">
          <div className="inspector-section-title">Preset Shortcuts</div>
          <div className="publish-preset-list">
            {EXPORT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="publish-preset-card"
                onClick={() => {
                  queuePublishJob(preset);
                }}
              >
                <div className="publish-preset-title">{preset.label}</div>
                <div className="publish-preset-meta">{preset.preset}</div>
                <div className="publish-preset-meta">{preset.destination}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="review-section">
          <div className="inspector-section-title">Queued Deliverables</div>
          <div className="publish-job-list">
            {publishJobs.map((job) => (
              <div key={job.id} className="publish-job-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ai-job-title">{job.label}</div>
                    <div className="ai-job-desc">{job.preset} · {job.destination}</div>
                  </div>
                  <span className={`badge ${job.status === 'COMPLETED' ? 'badge-success' : job.status === 'FAILED' ? 'badge-error' : job.status === 'PROCESSING' ? 'badge-accent' : 'badge-warning'}`}>
                    {job.status.toLowerCase()}
                  </span>
                </div>
                <div className="ai-progress-bar" style={{ marginTop: 8 }}>
                  <div className="ai-progress-fill" style={{ width: `${job.progress}%` }} />
                </div>
                {job.outputSummary && <div className="publish-job-summary">{job.outputSummary}</div>}
              </div>
            ))}
          </div>
        </div>

        {desktopJobs.length > 0 && (
          <div className="review-section">
            <div className="inspector-section-title">Desktop Background Jobs</div>
            <div className="publish-job-list">
              {desktopJobs.map((job) => (
                <div key={job.id} className="publish-job-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="ai-job-title">{job.label}</div>
                      <div className="ai-job-desc">{job.kind} job</div>
                    </div>
                    <span className={`badge ${job.status === 'COMPLETED' ? 'badge-success' : job.status === 'FAILED' ? 'badge-error' : 'badge-accent'}`}>
                      {job.status.toLowerCase()}
                    </span>
                  </div>
                  <div className="ai-progress-bar" style={{ marginTop: 8 }}>
                    <div className="ai-progress-fill" style={{ width: `${job.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
