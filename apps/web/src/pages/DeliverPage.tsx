// =============================================================================
//  THE AVID -- Deliver Page (Resolve-Style)
//  Export presets, format/codec settings, render queue, and progress.
// =============================================================================

import React, { useState } from 'react';
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
}

export function DeliverPage() {
  const duration = useEditorStore((s) => s.duration);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('yt-1080');
  const [renderQueue, setRenderQueue] = useState<RenderJob[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const categories = ['all', ...new Set(PRESETS.map((p) => p.category))];
  const filteredPresets = categoryFilter === 'all'
    ? PRESETS
    : PRESETS.filter((p) => p.category === categoryFilter);

  const selectedPreset = PRESETS.find((p) => p.id === selectedPresetId);

  const handleAddToQueue = () => {
    if (!selectedPreset) return;
    setRenderQueue((q) => [...q, {
      id: `job_${Date.now()}`,
      preset: selectedPreset,
      progress: 0,
      status: 'queued',
    }]);
  };

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Presets panel */}
      <div style={{
        width: 280, flexShrink: 0, borderRight: '1px solid var(--border-default)',
        background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '8px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-default)' }}>
          Export Presets
        </div>

        {/* Category filter */}
        <div style={{ display: 'flex', gap: 4, padding: '6px 8px', borderBottom: '1px solid var(--border-default)', flexWrap: 'wrap' }}>
          {categories.map((cat) => (
            <button
              key={cat}
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
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredPresets.map((preset) => (
            <div
              key={preset.id}
              onClick={() => setSelectedPresetId(preset.id)}
              style={{
                padding: '8px 10px', cursor: 'pointer',
                borderBottom: '1px solid var(--border-subtle)',
                background: selectedPresetId === preset.id ? 'var(--bg-active)' : 'transparent',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>{preset.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                {preset.format} / {preset.codec} / {preset.resolution}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Center: Preview + Settings */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Preview monitor */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <RecordMonitor />
        </div>

        {/* Export settings */}
        {selectedPreset && (
          <div style={{
            padding: 12, borderTop: '1px solid var(--border-default)',
            background: 'var(--bg-raised)', display: 'flex', flexDirection: 'column', gap: 10,
          }}>
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
      <div style={{
        width: 280, flexShrink: 0, borderLeft: '1px solid var(--border-default)',
        background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '8px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-default)' }}>
          Render Queue ({renderQueue.length})
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {renderQueue.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
              No jobs in queue
            </div>
          )}
          {renderQueue.map((job) => (
            <div key={job.id} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>{job.preset.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                {job.status === 'queued' && 'Queued'}
                {job.status === 'rendering' && `Rendering ${job.progress}%`}
                {job.status === 'complete' && 'Complete'}
                {job.status === 'error' && 'Error'}
              </div>
              <div style={{ height: 3, background: 'var(--bg-overlay)', borderRadius: 2, marginTop: 4 }}>
                <div style={{ height: '100%', width: `${job.progress}%`, background: job.status === 'complete' ? 'var(--success)' : 'var(--brand)', borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
            </div>
          ))}
        </div>
        {renderQueue.length > 0 && (
          <div style={{ padding: 8, borderTop: '1px solid var(--border-default)' }}>
            <button style={{
              width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 600,
              background: 'var(--success)', color: '#fff', border: 'none',
              borderRadius: 'var(--radius-md)', cursor: 'pointer',
            }}>
              Start Render
            </button>
          </div>
        )}
      </div>
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
