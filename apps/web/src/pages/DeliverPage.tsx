// =============================================================================
//  THE AVID -- Deliver Page (Resolve-Style)
//  Export presets, format/codec settings, render queue, and progress.
// =============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RecordMonitor } from '../components/RecordMonitor/RecordMonitor';
import { useEditorStore } from '../store/editor.store';

interface ExportPreset {
  id: string;
  name: string;
  category: string;
  format: string;
  codec: string;
  resolution: string;
  bitrate: string;
}

const PRESETS: ExportPreset[] = [
  { id: 'yt-4k', name: 'YouTube 4K', category: 'Streaming', format: 'MP4', codec: 'H.264', resolution: '3840x2160', bitrate: '40 Mbps' },
  { id: 'yt-1080', name: 'YouTube 1080p', category: 'Streaming', format: 'MP4', codec: 'H.264', resolution: '1920x1080', bitrate: '16 Mbps' },
  { id: 'prores-hq', name: 'ProRes 422 HQ', category: 'Broadcast', format: 'MOV', codec: 'ProRes 422 HQ', resolution: '1920x1080', bitrate: '220 Mbps' },
  { id: 'prores-4444', name: 'ProRes 4444', category: 'Broadcast', format: 'MOV', codec: 'ProRes 4444', resolution: '1920x1080', bitrate: '330 Mbps' },
  { id: 'dnxhd-36', name: 'DNxHD 36', category: 'Broadcast', format: 'MXF', codec: 'DNxHD 36', resolution: '1920x1080', bitrate: '36 Mbps' },
  { id: 'h265-hdr', name: 'H.265 HDR', category: 'Archive', format: 'MP4', codec: 'HEVC', resolution: '3840x2160', bitrate: '20 Mbps' },
  { id: 'webm-vp9', name: 'WebM VP9', category: 'Web', format: 'WebM', codec: 'VP9', resolution: '1920x1080', bitrate: '8 Mbps' },
  { id: 'gif', name: 'Animated GIF', category: 'Social', format: 'GIF', codec: 'GIF', resolution: '480x270', bitrate: 'N/A' },
];

interface RenderJob {
  id: string;
  preset: ExportPreset;
  progress: number;
  status: 'queued' | 'rendering' | 'complete' | 'error';
  errorMessage?: string;
}

function DeliverSkeleton() {
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }} aria-hidden="true">
      <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border-default)', background: 'var(--bg-surface)', padding: 10 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ height: 12, background: 'var(--bg-elevated)', borderRadius: 3, width: '80%', marginBottom: 4 }} />
            <div style={{ height: 10, background: 'var(--bg-elevated)', borderRadius: 3, width: '60%' }} />
          </div>
        ))}
      </div>
      <div style={{ flex: 1, background: 'var(--bg-void)' }} />
      <div style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--border-default)', background: 'var(--bg-surface)' }} />
    </div>
  );
}

export function DeliverPage() {
  const duration = useEditorStore((s) => s.duration);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('yt-1080');
  const [renderQueue, setRenderQueue] = useState<RenderJob[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isReady, setIsReady] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const renderIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 200);
    return () => clearTimeout(timer);
  }, []);

  // Cleanup render interval on unmount
  useEffect(() => {
    return () => {
      if (renderIntervalRef.current !== null) {
        clearInterval(renderIntervalRef.current);
      }
    };
  }, []);

  const categories = ['all', ...new Set(PRESETS.map((p) => p.category))];
  const filteredPresets = categoryFilter === 'all'
    ? PRESETS
    : PRESETS.filter((p) => p.category === categoryFilter);

  const selectedPreset = PRESETS.find((p) => p.id === selectedPresetId);

  const handleAddToQueue = useCallback(() => {
    if (!selectedPreset) return;
    setRenderQueue((q) => [...q, {
      id: `job_${Date.now()}`,
      preset: selectedPreset,
      progress: 0,
      status: 'queued',
    }]);
  }, [selectedPreset]);

  const handleRemoveJob = useCallback((jobId: string) => {
    setRenderQueue((q) => q.filter((j) => j.id !== jobId));
  }, []);

  const handleClearCompleted = useCallback(() => {
    setRenderQueue((q) => q.filter((j) => j.status !== 'complete'));
  }, []);

  const handleStartRender = useCallback(() => {
    if (isRendering) return;
    setIsRendering(true);

    renderIntervalRef.current = setInterval(() => {
      setRenderQueue((q) => {
        const updated = [...q];
        const activeJob = updated.find((j) => j.status === 'rendering');
        const nextQueued = updated.find((j) => j.status === 'queued');

        if (activeJob) {
          const idx = updated.indexOf(activeJob);
          const newProgress = Math.min(100, activeJob.progress + Math.random() * 8 + 2);
          updated[idx] = {
            ...activeJob,
            progress: newProgress,
            status: newProgress >= 100 ? 'complete' : 'rendering',
          };
        } else if (nextQueued) {
          const idx = updated.indexOf(nextQueued);
          updated[idx] = { ...nextQueued, status: 'rendering', progress: 0 };
        } else {
          // All done
          if (renderIntervalRef.current !== null) {
            clearInterval(renderIntervalRef.current);
            renderIntervalRef.current = null;
          }
          setIsRendering(false);
        }

        return updated;
      });
    }, 250);
  }, [isRendering]);

  if (!isReady) {
    return <DeliverSkeleton />;
  }

  const hasQueuedJobs = renderQueue.some((j) => j.status === 'queued' || j.status === 'rendering');
  const completedCount = renderQueue.filter((j) => j.status === 'complete').length;

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }} role="region" aria-label="Deliver Page - Export and Render">
      {/* Presets panel */}
      <nav style={{
        width: 280, flexShrink: 0, borderRight: '1px solid var(--border-default)',
        background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column',
      }} aria-label="Export presets">
        <div style={{ padding: '8px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-default)' }}>
          Export Presets
        </div>

        {/* Category filter */}
        <div style={{ display: 'flex', gap: 4, padding: '6px 8px', borderBottom: '1px solid var(--border-default)', flexWrap: 'wrap' }} role="tablist" aria-label="Preset categories">
          {categories.map((cat) => (
            <button
              key={cat}
              role="tab"
              aria-selected={categoryFilter === cat}
              onClick={() => setCategoryFilter(cat)}
              style={{
                padding: '2px 8px', fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
                borderRadius: 3, border: 'none', cursor: 'pointer',
                background: categoryFilter === cat ? 'var(--brand-dim)' : 'transparent',
                color: categoryFilter === cat ? 'var(--text-accent)' : 'var(--text-muted)',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Preset list */}
        <div style={{ flex: 1, overflowY: 'auto' }} role="listbox" aria-label="Available presets">
          {filteredPresets.map((preset) => (
            <div
              key={preset.id}
              role="option"
              aria-selected={selectedPresetId === preset.id}
              tabIndex={0}
              onClick={() => setSelectedPresetId(preset.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedPresetId(preset.id); } }}
              style={{
                padding: '8px 10px', cursor: 'pointer',
                borderBottom: '1px solid var(--border-subtle)',
                background: selectedPresetId === preset.id ? 'var(--bg-active)' : 'transparent',
                outline: 'none',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>{preset.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                {preset.format} / {preset.codec} / {preset.resolution}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Center: Preview + Settings */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Preview monitor */}
        <div style={{ flex: 1, minHeight: 0 }} role="region" aria-label="Export preview">
          <RecordMonitor />
        </div>

        {/* Export settings */}
        {selectedPreset && (
          <div style={{
            padding: 12, borderTop: '1px solid var(--border-default)',
            background: 'var(--bg-raised)', display: 'flex', flexDirection: 'column', gap: 10,
          }} role="region" aria-label="Export settings">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <SettingField label="Format" value={selectedPreset.format} />
              <SettingField label="Codec" value={selectedPreset.codec} />
              <SettingField label="Resolution" value={selectedPreset.resolution} />
              <SettingField label="Bitrate" value={selectedPreset.bitrate} />
              <SettingField label="Duration" value={`${Math.floor(duration)}s`} />
              <SettingField label="Output" value="~/Desktop/export" />
            </div>
            <button
              onClick={handleAddToQueue}
              aria-label={`Add ${selectedPreset.name} to render queue`}
              style={{
                padding: '8px 20px', fontSize: 12, fontWeight: 600,
                background: 'var(--brand)', color: '#fff',
                border: 'none', borderRadius: 'var(--radius-md)',
                cursor: 'pointer', alignSelf: 'flex-end',
              }}
            >
              Add to Render Queue
            </button>
          </div>
        )}
      </div>

      {/* Render Queue */}
      <aside style={{
        width: 280, flexShrink: 0, borderLeft: '1px solid var(--border-default)',
        background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column',
      }} aria-label="Render queue">
        <div style={{ padding: '8px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Render Queue ({renderQueue.length})</span>
          {completedCount > 0 && (
            <button
              onClick={handleClearCompleted}
              aria-label="Clear completed jobs"
              style={{
                padding: '1px 6px', fontSize: 8,
                background: 'var(--bg-raised)', border: '1px solid var(--border-default)',
                borderRadius: 2, color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              Clear Done
            </button>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }} role="list" aria-label="Render jobs">
          {renderQueue.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center' }} role="status">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)', marginBottom: 8 }} aria-hidden="true">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <polyline points="16 21 12 17 8 21" />
              </svg>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 4 }}>No jobs in queue</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Select a preset and add to queue</div>
            </div>
          )}
          {renderQueue.map((job) => (
            <div
              key={job.id}
              role="listitem"
              aria-label={`${job.preset.name} - ${job.status === 'rendering' ? `${Math.round(job.progress)}%` : job.status}`}
              style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', position: 'relative' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>{job.preset.name}</div>
                {job.status === 'queued' && (
                  <button
                    onClick={() => handleRemoveJob(job.id)}
                    aria-label={`Remove ${job.preset.name} from queue`}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10, padding: '0 2px' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
              <div style={{ fontSize: 10, color: job.status === 'error' ? 'var(--error)' : 'var(--text-tertiary)', marginTop: 2 }}>
                {job.status === 'queued' && 'Queued'}
                {job.status === 'rendering' && `Rendering ${Math.round(job.progress)}%`}
                {job.status === 'complete' && 'Complete'}
                {job.status === 'error' && (job.errorMessage ?? 'Error')}
              </div>
              <div
                style={{ height: 3, background: 'var(--bg-overlay)', borderRadius: 2, marginTop: 4 }}
                role="progressbar"
                aria-valuenow={Math.round(job.progress)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${job.preset.name} render progress`}
              >
                <div style={{
                  height: '100%',
                  width: `${job.progress}%`,
                  background: job.status === 'complete' ? 'var(--success)' : job.status === 'error' ? 'var(--error)' : 'var(--brand)',
                  borderRadius: 2,
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
          ))}
        </div>
        {renderQueue.length > 0 && (
          <div style={{ padding: 8, borderTop: '1px solid var(--border-default)' }}>
            <button
              onClick={handleStartRender}
              disabled={!hasQueuedJobs || isRendering}
              aria-label={isRendering ? 'Rendering in progress' : 'Start render queue'}
              aria-busy={isRendering}
              style={{
                width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 600,
                background: isRendering ? 'var(--warning)' : 'var(--success)',
                color: '#fff', border: 'none',
                borderRadius: 'var(--radius-md)', cursor: hasQueuedJobs && !isRendering ? 'pointer' : 'not-allowed',
                opacity: hasQueuedJobs || isRendering ? 1 : 0.5,
              }}
            >
              {isRendering ? 'Rendering...' : 'Start Render'}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

function SettingField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  );
}
