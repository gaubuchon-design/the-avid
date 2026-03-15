// =============================================================================
//  THE AVID -- Render Panel
//  Format/resolution/frame-rate/audio-codec selector, render queue, and
//  simulated render workflow.
// =============================================================================

import React, { useState, useCallback, useMemo } from 'react';
import { useEditorStore, type RenderJob, type RenderJobStatus } from '../../store/editor.store';

// ─── Constants ───────────────────────────────────────────────────────────────

const VIDEO_FORMATS = [
  { id: 'h264', label: 'H.264' },
  { id: 'h265', label: 'H.265' },
  { id: 'prores422', label: 'ProRes 422' },
  { id: 'prores4444', label: 'ProRes 4444' },
  { id: 'dnxhd', label: 'DNxHD' },
  { id: 'dnxhr', label: 'DNxHR' },
];

const RESOLUTIONS = [
  { id: 'source', label: 'Match Source' },
  { id: '1920x1080', label: '1920x1080 (Full HD)' },
  { id: '3840x2160', label: '3840x2160 (4K UHD)' },
  { id: '4096x2160', label: '4096x2160 (DCI 4K)' },
  { id: '1280x720', label: '1280x720 (HD)' },
  { id: 'custom', label: 'Custom' },
];

const FRAME_RATES = [
  { id: 'source', label: 'Match Source' },
  { id: '23.976', label: '23.976 fps' },
  { id: '24', label: '24 fps' },
  { id: '25', label: '25 fps' },
  { id: '29.97', label: '29.97 fps' },
  { id: '30', label: '30 fps' },
  { id: '50', label: '50 fps' },
  { id: '59.94', label: '59.94 fps' },
  { id: '60', label: '60 fps' },
];

const AUDIO_CODECS = [
  { id: 'aac', label: 'AAC' },
  { id: 'pcm', label: 'PCM (WAV)' },
  { id: 'mp3', label: 'MP3' },
];

// ─── Styles ──────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', height: '100%',
  background: 'var(--bg-surface)', color: 'var(--text-primary)',
  fontFamily: 'var(--font-display), system-ui, sans-serif', fontSize: 12,
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  padding: '12px 16px', borderBottom: '1px solid var(--border-default)',
  fontWeight: 700, fontSize: 13, letterSpacing: '0.02em', flexShrink: 0,
};

const bodyStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: 16,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8,
};

const fieldGroup: React.CSSProperties = { marginBottom: 16 };

const selectStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-void)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
  fontSize: 12, padding: '6px 8px', outline: 'none',
  fontFamily: 'inherit', cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-void)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
  fontSize: 12, padding: '6px 8px', outline: 'none', fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 'var(--radius-sm)',
  border: 'none', background: 'var(--brand)', color: '#fff',
  fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'opacity 80ms',
};

const btnGhost: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-default)', background: 'transparent',
  color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600,
  cursor: 'pointer', transition: 'all 80ms',
};

// ─── Status helpers ──────────────────────────────────────────────────────────

function statusColor(status: RenderJobStatus): string {
  switch (status) {
    case 'queued': return 'var(--text-muted)';
    case 'rendering': return 'var(--brand)';
    case 'complete': return 'var(--success)';
    case 'error': return 'var(--error)';
  }
}

function statusLabel(status: RenderJobStatus): string {
  switch (status) {
    case 'queued': return 'Queued';
    case 'rendering': return 'Rendering';
    case 'complete': return 'Complete';
    case 'error': return 'Error';
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RenderPanel() {
  const projectName = useEditorStore((s) => s.projectName);
  const renderQueue = useEditorStore((s) => s.renderQueue);
  const addToRenderQueue = useEditorStore((s) => s.addToRenderQueue);
  const removeFromRenderQueue = useEditorStore((s) => s.removeFromRenderQueue);
  const startRenderJob = useEditorStore((s) => s.startRenderJob);
  const clearCompletedRenderJobs = useEditorStore((s) => s.clearCompletedRenderJobs);

  const [format, setFormat] = useState('h264');
  const [resolution, setResolution] = useState('1920x1080');
  const [customWidth, setCustomWidth] = useState('1920');
  const [customHeight, setCustomHeight] = useState('1080');
  const [frameRate, setFrameRate] = useState('source');
  const [audioCodec, setAudioCodec] = useState('aac');
  const [outputName, setOutputName] = useState(projectName || 'output');

  const resolvedResolution = useMemo(() => {
    if (resolution === 'custom') return `${customWidth}x${customHeight}`;
    if (resolution === 'source') return 'Match Source';
    return resolution;
  }, [resolution, customWidth, customHeight]);

  const handleAddToQueue = useCallback(() => {
    const formatLabel = VIDEO_FORMATS.find((f) => f.id === format)?.label ?? format;
    const frLabel = FRAME_RATES.find((f) => f.id === frameRate)?.label ?? frameRate;
    const audioLabel = AUDIO_CODECS.find((c) => c.id === audioCodec)?.label ?? audioCodec;

    addToRenderQueue({
      name: outputName || 'Untitled Export',
      format: formatLabel,
      resolution: resolvedResolution,
      frameRate: frLabel,
      audioCodec: audioLabel,
      outputPath: `${outputName || 'output'}.${format === 'prores422' || format === 'prores4444' ? 'mov' : format === 'dnxhd' || format === 'dnxhr' ? 'mxf' : 'mp4'}`,
    });
  }, [format, resolvedResolution, frameRate, audioCodec, outputName, addToRenderQueue]);

  const handleRenderAll = useCallback(() => {
    const queuedJobs = renderQueue.filter((j) => j.status === 'queued');
    for (const job of queuedJobs) {
      startRenderJob(job.id);
    }
  }, [renderQueue, startRenderJob]);

  const hasQueuedJobs = renderQueue.some((j) => j.status === 'queued');
  const hasCompletedJobs = renderQueue.some((j) => j.status === 'complete');

  return (
    <div style={panelStyle} role="region" aria-label="Render Panel">
      <div style={headerStyle}>Render & Export</div>
      <div style={bodyStyle}>
        {/* Format Settings */}
        <div style={fieldGroup}>
          <div style={sectionTitle}>Video Format</div>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            style={selectStyle}
            aria-label="Video format"
          >
            {VIDEO_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </div>

        <div style={fieldGroup}>
          <div style={sectionTitle}>Resolution</div>
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            style={selectStyle}
            aria-label="Resolution"
          >
            {RESOLUTIONS.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
          {resolution === 'custom' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input
                type="number"
                value={customWidth}
                onChange={(e) => setCustomWidth(e.target.value)}
                style={{ ...inputStyle, width: '50%' }}
                placeholder="Width"
                aria-label="Custom width"
              />
              <input
                type="number"
                value={customHeight}
                onChange={(e) => setCustomHeight(e.target.value)}
                style={{ ...inputStyle, width: '50%' }}
                placeholder="Height"
                aria-label="Custom height"
              />
            </div>
          )}
        </div>

        <div style={fieldGroup}>
          <div style={sectionTitle}>Frame Rate</div>
          <select
            value={frameRate}
            onChange={(e) => setFrameRate(e.target.value)}
            style={selectStyle}
            aria-label="Frame rate"
          >
            {FRAME_RATES.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </div>

        <div style={fieldGroup}>
          <div style={sectionTitle}>Audio Codec</div>
          <select
            value={audioCodec}
            onChange={(e) => setAudioCodec(e.target.value)}
            style={selectStyle}
            aria-label="Audio codec"
          >
            {AUDIO_CODECS.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>

        <div style={fieldGroup}>
          <div style={sectionTitle}>Output Name</div>
          <input
            type="text"
            value={outputName}
            onChange={(e) => setOutputName(e.target.value)}
            style={inputStyle}
            placeholder="output filename"
            aria-label="Output file name"
          />
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button onClick={handleAddToQueue} style={btnGhost}>
            Add to Queue
          </button>
          <button
            onClick={handleRenderAll}
            disabled={!hasQueuedJobs}
            style={{
              ...btnPrimary,
              opacity: hasQueuedJobs ? 1 : 0.4,
              cursor: hasQueuedJobs ? 'pointer' : 'not-allowed',
            }}
          >
            Render All
          </button>
        </div>

        {/* Render Queue */}
        {renderQueue.length > 0 && (
          <>
            <div style={{ ...sectionTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Render Queue ({renderQueue.length})</span>
              {hasCompletedJobs && (
                <button
                  onClick={clearCompletedRenderJobs}
                  style={{
                    background: 'none', border: 'none', color: 'var(--text-muted)',
                    fontSize: 9, cursor: 'pointer', textTransform: 'uppercase',
                    fontWeight: 600, letterSpacing: '0.04em',
                  }}
                >
                  Clear Done
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {renderQueue.map((job) => (
                <RenderJobCard
                  key={job.id}
                  job={job}
                  onStart={() => startRenderJob(job.id)}
                  onRemove={() => removeFromRenderQueue(job.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── RenderJobCard ───────────────────────────────────────────────────────────

function RenderJobCard({
  job,
  onStart,
  onRemove,
}: {
  job: RenderJob;
  onStart: () => void;
  onRemove: () => void;
}) {
  const color = statusColor(job.status);

  return (
    <div style={{
      padding: '10px 12px', borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-subtle)', background: 'var(--bg-raised)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>
          {job.name}
        </span>
        <span style={{
          fontSize: 8, padding: '2px 6px', borderRadius: 3,
          background: `color-mix(in srgb, ${color} 15%, transparent)`,
          color, fontWeight: 700, textTransform: 'uppercase', flexShrink: 0,
        }}>
          {statusLabel(job.status)}
        </span>
      </div>

      {/* Metadata line */}
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
        {job.format} {job.resolution !== 'Match Source' ? `\u00B7 ${job.resolution}` : ''} {job.frameRate !== 'Match Source' ? `\u00B7 ${job.frameRate}` : ''} \u00B7 {job.audioCodec}
      </div>

      {/* Progress bar */}
      {(job.status === 'rendering' || job.status === 'complete') && (
        <div style={{ marginBottom: 4 }}>
          <div style={{
            height: 4, borderRadius: 2, background: 'var(--bg-elevated)',
            overflow: 'hidden',
          }}
            role="progressbar"
            aria-valuenow={job.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Render progress: ${job.progress}%`}
          >
            <div style={{
              height: '100%', width: `${job.progress}%`,
              background: job.status === 'complete' ? 'var(--success)' : 'var(--brand)',
              borderRadius: 2, transition: 'width 100ms linear',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
            <span>{job.progress}%</span>
            {job.status === 'complete' && <span style={{ color: 'var(--success)' }}>Done</span>}
          </div>
        </div>
      )}

      {/* Error message */}
      {job.status === 'error' && job.error && (
        <div style={{ fontSize: 10, color: 'var(--error)', marginBottom: 4 }} role="alert">
          {job.error}
        </div>
      )}

      {/* Output path for completed jobs */}
      {job.status === 'complete' && (
        <div style={{ fontSize: 10, color: 'var(--success)' }}>
          Output: {job.outputPath}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        {job.status === 'queued' && (
          <button onClick={onStart} style={{ ...btnGhost, padding: '3px 8px', fontSize: 10 }}>
            Start
          </button>
        )}
        {(job.status === 'queued' || job.status === 'complete' || job.status === 'error') && (
          <button onClick={onRemove} style={{
            ...btnGhost, padding: '3px 8px', fontSize: 10,
            borderColor: 'var(--error-dim)', color: 'var(--error)',
          }}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

export default RenderPanel;
