import React, { useState, useEffect, useCallback, memo } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  exportEngine,
  ExportPreset,
  ExportJob,
  ExportCategory,
  ExportDestination,
  CaptionFormat,
} from '../../engine/ExportEngine';
import { useEditorStore } from '../../store/editor.store';
import { buildExportPlaybackSnapshot, buildExportSelectionSummary } from '../../lib/exportSelection';
import { renderPlaybackSnapshotFrame } from '../../engine/playbackSnapshotFrame';

// =============================================================================
//  Inline Zustand store for export wizard state
// =============================================================================

interface ExportWizardState {
  step: 1 | 2 | 3 | 4;
  selectionMode: 'full' | 'inout' | 'selected';
  selectedPresetId: string | null;
  selectedCategory: ExportCategory;
  destination: ExportDestination;
  captionFormat: CaptionFormat;
  includeCaptions: boolean;
  jobs: ExportJob[];
}

interface ExportWizardActions {
  setStep: (s: ExportWizardState['step']) => void;
  setSelectionMode: (m: ExportWizardState['selectionMode']) => void;
  setPreset: (id: string) => void;
  setCategory: (c: ExportCategory) => void;
  setDestination: (d: ExportDestination) => void;
  setCaptionFormat: (f: CaptionFormat) => void;
  toggleCaptions: () => void;
  syncJobs: (jobs: ExportJob[]) => void;
}

const useExportStore = create<ExportWizardState & ExportWizardActions>()(
  immer((set) => ({
    step: 1,
    selectionMode: 'full',
    selectedPresetId: null,
    selectedCategory: 'streaming',
    destination: 'local',
    captionFormat: 'srt',
    includeCaptions: false,
    jobs: [],

    setStep: (s) => set((st) => { st.step = s; }),
    setSelectionMode: (m) => set((st) => { st.selectionMode = m; }),
    setPreset: (id) => set((st) => { st.selectedPresetId = id; }),
    setCategory: (c) => set((st) => { st.selectedCategory = c; }),
    setDestination: (d) => set((st) => { st.destination = d; }),
    setCaptionFormat: (f) => set((st) => { st.captionFormat = f; }),
    toggleCaptions: () => set((st) => { st.includeCaptions = !st.includeCaptions; }),
    syncJobs: (jobs) => set((st) => { st.jobs = jobs; }),
  })),
);

// =============================================================================
//  Style constants
// =============================================================================

const panel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-display), system-ui, sans-serif',
  fontSize: 12,
  overflow: 'hidden',
};

const header: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--border-default)',
  fontWeight: 700,
  fontSize: 13,
  letterSpacing: '0.02em',
  flexShrink: 0,
};

const body: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: 16,
};

const footerBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 16px',
  borderTop: '1px solid var(--border-default)',
  flexShrink: 0,
};

const btn = (variant: 'primary' | 'ghost' | 'danger' = 'ghost'): React.CSSProperties => ({
  padding: '6px 14px',
  borderRadius: 'var(--radius-sm)',
  border: variant === 'primary' ? 'none' : '1px solid var(--border-default)',
  background:
    variant === 'primary'
      ? 'var(--brand)'
      : variant === 'danger'
        ? 'var(--error)'
        : 'transparent',
  color: variant === 'primary' || variant === 'danger' ? '#fff' : 'var(--text-secondary)',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 80ms',
});

const CATEGORIES: { key: ExportCategory; label: string }[] = [
  { key: 'broadcast', label: 'Broadcast' },
  { key: 'streaming', label: 'Streaming' },
  { key: 'archive', label: 'Archive' },
  { key: 'social', label: 'Social' },
  { key: 'custom', label: 'Custom' },
];

const DESTINATIONS: { key: ExportDestination; icon: string; label: string }[] = [
  { key: 'local', icon: '💾', label: 'Local Download' },
  { key: 'cloud', icon: '☁️', label: 'Cloud Storage' },
  { key: 'youtube', icon: '▶️', label: 'YouTube' },
  { key: 'vimeo', icon: '🎥', label: 'Vimeo' },
  { key: 'instagram', icon: '📷', label: 'Instagram' },
  { key: 'tiktok', icon: '🎵', label: 'TikTok' },
];

const CAPTION_FORMATS: CaptionFormat[] = ['srt', 'vtt', 'scc', 'ttml'];

function formatTimecode(seconds: number, fps = 24): string {
  const totalFrames = Math.max(0, Math.round(seconds * fps));
  const h = Math.floor(totalFrames / (fps * 3600));
  const m = Math.floor((totalFrames % (fps * 3600)) / (fps * 60));
  const s = Math.floor((totalFrames % (fps * 60)) / fps);
  const f = totalFrames % Math.ceil(fps);
  return [
    String(h).padStart(2, '0'),
    String(m).padStart(2, '0'),
    String(s).padStart(2, '0'),
    String(f).padStart(2, '0'),
  ].join(':');
}

// =============================================================================
//  Sub-components
// =============================================================================

const StepIndicator = memo(function StepIndicator({ current }: { current: number }) {
  const steps = ['Select', 'Format', 'Destination', 'Export'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '12px 16px', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }} role="navigation" aria-label="Export wizard steps">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === current;
        const isDone = stepNum < current;
        return (
          <React.Fragment key={label}>
            {i > 0 && (
              <div style={{ flex: 1, height: 2, background: isDone ? 'var(--brand)' : 'var(--border-default)', margin: '0 4px', transition: 'background 200ms' }} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 700,
                  background: isActive ? 'var(--brand)' : isDone ? 'var(--brand-dim)' : 'var(--bg-raised)',
                  color: isActive || isDone ? '#fff' : 'var(--text-muted)',
                  border: isActive ? '2px solid var(--brand-bright)' : '1px solid var(--border-default)',
                  transition: 'all 200ms',
                }}
              >
                {isDone ? '✓' : stepNum}
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
});

function StepSelect() {
  const { selectionMode, setSelectionMode } = useExportStore();
  const tracks = useEditorStore((s) => s.tracks);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const inPoint = useEditorStore((s) => s.inPoint);
  const outPoint = useEditorStore((s) => s.outPoint);
  const playheadTime = useEditorStore((s) => s.playheadTime);
  const duration = useEditorStore((s) => s.duration);
  const sequenceSettings = useEditorStore((s) => s.sequenceSettings);
  const projectSettings = useEditorStore((s) => s.projectSettings);
  const selectionSummary = buildExportSelectionSummary({
    tracks,
    subtitleTracks: [],
    titleClips: [],
    selectedClipIds,
    inPoint,
    outPoint,
    playheadTime,
    duration,
    showSafeZones: false,
    sequenceSettings,
    projectSettings,
  }, selectionMode);
  const modes: { key: typeof selectionMode; label: string; desc: string }[] = [
    { key: 'full', label: 'Full Sequence', desc: 'Export the entire timeline' },
    { key: 'inout', label: 'In/Out Range', desc: 'Export between In and Out points' },
    { key: 'selected', label: 'Selected Clips', desc: 'Export only selected clips' },
  ];

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>What to Export</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {modes.map((m) => (
          <label
            key={m.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${selectionMode === m.key ? 'var(--brand)' : 'var(--border-default)'}`,
              background: selectionMode === m.key ? 'var(--accent-muted)' : 'var(--bg-raised)',
              cursor: 'pointer',
              transition: 'all 100ms',
            }}
          >
            <input
              type="radio"
              name="export-selection"
              checked={selectionMode === m.key}
              onChange={() => setSelectionMode(m.key)}
              style={{ accentColor: 'var(--brand)' }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 12 }}>{m.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{m.desc}</div>
            </div>
          </label>
        ))}
      </div>
      <div
        style={{
          marginTop: 16,
          padding: '10px 12px',
          background: 'var(--bg-raised)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={{ color: 'var(--text-muted)' }}>Duration</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {selectionSummary.valid ? formatTimecode(selectionSummary.duration, sequenceSettings.fps) : '--:--:--:--'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
          <span style={{ color: 'var(--text-muted)' }}>Frames</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {selectionSummary.frameCount || 0}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
          <span style={{ color: 'var(--text-muted)' }}>Range</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {selectionSummary.valid
              ? `${formatTimecode(selectionSummary.inPoint, sequenceSettings.fps)} → ${formatTimecode(selectionSummary.outPoint, sequenceSettings.fps)}`
              : 'Unavailable'}
          </span>
        </div>
        {selectionMode === 'selected' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
            <span style={{ color: 'var(--text-muted)' }}>Selected Clips</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              {selectionSummary.selectedClipCount}
            </span>
          </div>
        )}
        {!selectionSummary.valid && (
          <div style={{ marginTop: 8, fontSize: 10, color: 'var(--warning, #f59e0b)' }}>
            {selectionSummary.issue}
          </div>
        )}
      </div>
    </div>
  );
}

function StepFormat() {
  const { selectedCategory, setCategory, selectedPresetId, setPreset } = useExportStore();
  const presets = exportEngine.getPresets(selectedCategory);

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' }}>Format</div>
      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            style={{
              padding: '5px 10px',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${selectedCategory === cat.key ? 'var(--brand)' : 'var(--border-default)'}`,
              background: selectedCategory === cat.key ? 'var(--accent-muted)' : 'transparent',
              color: selectedCategory === cat.key ? 'var(--brand-bright)' : 'var(--text-muted)',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              transition: 'all 80ms',
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>
      {/* Preset cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {presets.map((p) => (
          <PresetCard key={p.id} preset={p} selected={selectedPresetId === p.id} onSelect={() => setPreset(p.id)} />
        ))}
      </div>
    </div>
  );
}

const PresetCard = memo(function PresetCard({ preset, selected, onSelect }: { preset: ExportPreset; selected: boolean; onSelect: () => void }) {
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      style={{
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        border: `1.5px solid ${selected ? 'var(--brand)' : 'var(--border-default)'}`,
        background: selected ? 'var(--accent-muted)' : 'var(--bg-raised)',
        cursor: 'pointer',
        transition: 'all 100ms',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-primary)' }}>{preset.name}</span>
        <span
          style={{
            fontSize: 9,
            padding: '2px 5px',
            borderRadius: 3,
            background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          {preset.format}
        </span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
        {preset.resolution.width}x{preset.resolution.height} &middot; {preset.fps}fps
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
        {preset.bitrate} &middot; {preset.container.toUpperCase()}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.3 }}>
        {preset.description}
      </div>
    </div>
  );
});

function StepDestination() {
  const { destination, setDestination, includeCaptions, toggleCaptions, captionFormat, setCaptionFormat } =
    useExportStore();

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' }}>Destination</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        {DESTINATIONS.map((d) => (
          <div
            key={d.key}
            role="option"
            aria-selected={destination === d.key}
            tabIndex={0}
            onClick={() => setDestination(d.key)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDestination(d.key); } }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '14px 8px',
              borderRadius: 'var(--radius-md)',
              border: `1.5px solid ${destination === d.key ? 'var(--brand)' : 'var(--border-default)'}`,
              background: destination === d.key ? 'var(--accent-muted)' : 'var(--bg-raised)',
              cursor: 'pointer',
              transition: 'all 100ms',
              gap: 6,
            }}
          >
            <span style={{ fontSize: 20 }}>{d.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: destination === d.key ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {d.label}
            </span>
          </div>
        ))}
      </div>

      {/* Caption export */}
      <div
        style={{
          padding: '10px 12px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-raised)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: includeCaptions ? 10 : 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600 }}>Include Captions</span>
          <button
            onClick={toggleCaptions}
            style={{
              width: 36,
              height: 20,
              borderRadius: 10,
              border: 'none',
              background: includeCaptions ? 'var(--brand)' : 'var(--bg-elevated)',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 150ms',
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#fff',
                position: 'absolute',
                top: 3,
                left: includeCaptions ? 19 : 3,
                transition: 'left 150ms',
              }}
            />
          </button>
        </div>
        {includeCaptions && (
          <div style={{ display: 'flex', gap: 6 }}>
            {CAPTION_FORMATS.map((f) => (
              <button
                key={f}
                onClick={() => setCaptionFormat(f)}
                style={{
                  flex: 1,
                  padding: '5px 0',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${captionFormat === f ? 'var(--brand)' : 'var(--border-default)'}`,
                  background: captionFormat === f ? 'var(--accent-muted)' : 'transparent',
                  color: captionFormat === f ? 'var(--brand-bright)' : 'var(--text-muted)',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                }}
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StepExport() {
  const { selectedPresetId, destination, selectionMode, includeCaptions, captionFormat, jobs, syncJobs } =
    useExportStore();
  const tracks = useEditorStore((s) => s.tracks);
  const subtitleTracks = useEditorStore((s) => s.subtitleTracks);
  const titleClips = useEditorStore((s) => s.titleClips);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const inPoint = useEditorStore((s) => s.inPoint);
  const outPoint = useEditorStore((s) => s.outPoint);
  const playheadTime = useEditorStore((s) => s.playheadTime);
  const duration = useEditorStore((s) => s.duration);
  const showSafeZones = useEditorStore((s) => s.showSafeZones);
  const sequenceSettings = useEditorStore((s) => s.sequenceSettings);
  const projectSettings = useEditorStore((s) => s.projectSettings);
  const preset = selectedPresetId ? exportEngine.getPreset(selectedPresetId) : undefined;
  const [exporting, setExporting] = useState(false);
  const selectionSummary = buildExportSelectionSummary({
    tracks,
    subtitleTracks,
    titleClips,
    selectedClipIds,
    inPoint,
    outPoint,
    playheadTime,
    duration,
    showSafeZones,
    sequenceSettings,
    projectSettings,
  }, selectionMode);
  const exportSnapshot = buildExportPlaybackSnapshot({
    tracks,
    subtitleTracks,
    titleClips,
    selectedClipIds,
    inPoint,
    outPoint,
    playheadTime,
    duration,
    showSafeZones,
    sequenceSettings,
    projectSettings,
  }, selectionMode);

  // Poll jobs from engine
  useEffect(() => {
    const unsub = exportEngine.subscribe(() => {
      syncJobs(exportEngine.getActiveJobs());
    });
    return unsub;
  }, [syncJobs]);

  const handleExport = useCallback(() => {
    if (!selectedPresetId || !selectionSummary.valid) return;
    setExporting(true);

    let renderFrameRevision: string | undefined;
    let previewImageDataUrl: string | undefined;
    if (typeof document !== 'undefined') {
      const previewCanvas = document.createElement('canvas');
      const renderResult = renderPlaybackSnapshotFrame({
        snapshot: exportSnapshot,
        width: preset?.resolution.width ?? sequenceSettings.width,
        height: preset?.resolution.height ?? sequenceSettings.height,
        canvas: previewCanvas,
        colorProcessing: 'post',
        useCache: true,
      });

      renderFrameRevision = renderResult.frameRevision;
      try {
        previewImageDataUrl = renderResult.canvas?.toDataURL('image/jpeg', 0.72);
      } catch {
        previewImageDataUrl = undefined;
      }
    }

    exportEngine.startExport(selectedPresetId, destination, {
      inFrame: Math.round(selectionSummary.inPoint * sequenceSettings.fps),
      outFrame: Math.round(selectionSummary.outPoint * sequenceSettings.fps),
      selectionLabel: selectionSummary.label,
      snapshot: exportSnapshot,
      renderFrameRevision,
      renderProcessing: 'post',
      previewImageDataUrl,
      captionFormat: includeCaptions ? captionFormat : undefined,
      duration: selectionSummary.duration,
    });
  }, [
    captionFormat,
    destination,
    exportSnapshot,
    includeCaptions,
    preset?.resolution.height,
    preset?.resolution.width,
    selectedPresetId,
    selectionSummary.duration,
    selectionSummary.inPoint,
    selectionSummary.outPoint,
    selectionSummary.label,
    selectionSummary.valid,
    sequenceSettings.height,
    sequenceSettings.fps,
    sequenceSettings.width,
  ]);

  const handleCancel = useCallback(
    (jobId: string) => {
      exportEngine.cancelExport(jobId);
    },
    [],
  );

  const destLabel = DESTINATIONS.find((d) => d.key === destination)?.label ?? destination;

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' }}>Export Summary</div>
      {/* Summary */}
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-raised)',
          marginBottom: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          fontSize: 11,
        }}
      >
        <Row label="Selection" value={selectionSummary.label} />
        <Row label="Format" value={preset ? `${preset.name} (${preset.format.toUpperCase()})` : 'None'} />
        <Row label="Resolution" value={preset ? `${preset.resolution.width}x${preset.resolution.height}` : '--'} />
        <Row label="Bitrate" value={preset?.bitrate ?? '--'} />
        <Row label="Destination" value={destLabel} />
        <Row
          label="Range"
          value={selectionSummary.valid
            ? `${formatTimecode(selectionSummary.inPoint, sequenceSettings.fps)} → ${formatTimecode(selectionSummary.outPoint, sequenceSettings.fps)}`
            : 'Unavailable'}
        />
        <Row
          label="Preview"
          value={`${formatTimecode(selectionSummary.previewTime, sequenceSettings.fps)} · ${exportSnapshot.primaryVideoLayer?.clip.name ?? 'No active clip'}`}
        />
        {selectionMode === 'selected' && <Row label="Selected Clips" value={String(selectionSummary.selectedClipCount)} />}
        {includeCaptions && <Row label="Captions" value={captionFormat.toUpperCase()} />}
      </div>
      {!selectionSummary.valid && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-raised)',
            color: 'var(--warning, #f59e0b)',
            fontSize: 10,
          }}
        >
          {selectionSummary.issue}
        </div>
      )}

      {/* Start button */}
      {!exporting && (
        <button
          onClick={handleExport}
          disabled={!selectedPresetId || !selectionSummary.valid}
          style={{
            ...btn('primary'),
            width: '100%',
            padding: '10px 0',
            fontSize: 12,
            opacity: selectedPresetId && selectionSummary.valid ? 1 : 0.4,
          }}
        >
          Start Export
        </button>
      )}

      {/* Active jobs */}
      {jobs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 11, color: 'var(--text-secondary)' }}>Export Jobs</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} onCancel={() => handleCancel(job.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

const JobCard = memo(function JobCard({ job, onCancel }: { job: ExportJob; onCancel: () => void }) {
  const preset = exportEngine.getPreset(job.presetId);
  const statusColor =
    job.status === 'completed'
      ? 'var(--success)'
      : job.status === 'failed'
        ? 'var(--error)'
        : 'var(--brand)';

  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        background: 'var(--bg-raised)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 11 }}>{preset?.name ?? 'Export'}</span>
        <span
          style={{
            fontSize: 9,
            padding: '2px 6px',
            borderRadius: 3,
            background: `${statusColor}22`,
            color: statusColor,
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          {job.status}
        </span>
      </div>
      {/* Progress bar */}
      {(job.status === 'encoding' || job.status === 'uploading') && (
        <>
          {job.previewImageDataUrl && (
            <img
              src={job.previewImageDataUrl}
              alt="Export preview"
              style={{
                width: '100%',
                aspectRatio: '16 / 9',
                objectFit: 'cover',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                marginBottom: 8,
                background: '#000',
              }}
            />
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
            <span>{job.selectionLabel ?? 'Export'}</span>
            {job.inFrame !== undefined && job.outFrame !== undefined && (
              <span>{job.inFrame}f → {job.outFrame}f</span>
            )}
          </div>
          {job.previewClipName && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
              Preview {job.previewClipName}
            </div>
          )}
          {job.renderFrameRevision && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
              Rendered {job.renderProcessing ?? 'pre'} frame locked to shared revision
            </div>
          )}
          <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-elevated)', overflow: 'hidden', marginBottom: 4 }} role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Export progress">
            <div
              style={{
                height: '100%',
                width: `${job.progress}%`,
                background: 'var(--brand)',
                borderRadius: 2,
                transition: 'width 100ms linear',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
            <span>{job.progress}%</span>
            <span>{job.estimatedTimeRemaining != null ? `~${job.estimatedTimeRemaining}s remaining` : ''}</span>
          </div>
          <button
            onClick={onCancel}
            style={{ ...btn('danger'), marginTop: 6, fontSize: 10, padding: '4px 10px' }}
          >
            Cancel
          </button>
        </>
      )}
      {job.status === 'completed' && (
        <div style={{ fontSize: 10, color: 'var(--success)' }}>
          Output: {job.outputPath}
        </div>
      )}
      {job.status === 'failed' && (
        <div style={{ fontSize: 10, color: 'var(--error)' }} role="alert">
          {job.error ?? 'Export failed'}
        </div>
      )}
    </div>
  );
});

// =============================================================================
//  Main ExportPanel component
// =============================================================================

export function ExportPanel() {
  const { step, setStep } = useExportStore();

  const canNext =
    step === 1 ||
    (step === 2 && useExportStore.getState().selectedPresetId !== null) ||
    step === 3;

  return (
    <div style={panel} role="region" aria-label="Export Panel">
      <div style={header}>Export & Deliver</div>
      <StepIndicator current={step} />
      <div style={body}>
        {step === 1 && <StepSelect />}
        {step === 2 && <StepFormat />}
        {step === 3 && <StepDestination />}
        {step === 4 && <StepExport />}
      </div>
      {step < 4 && (
        <div style={footerBar}>
          <button
            onClick={() => step > 1 && setStep((step - 1) as ExportWizardState['step'])}
            disabled={step === 1}
            style={{ ...btn('ghost'), opacity: step === 1 ? 0.3 : 1 }}
          >
            Back
          </button>
          <button
            onClick={() => canNext && setStep((step + 1) as ExportWizardState['step'])}
            disabled={!canNext}
            style={{ ...btn('primary'), opacity: canNext ? 1 : 0.4 }}
          >
            Next
          </button>
        </div>
      )}
      {step === 4 && (
        <div style={footerBar}>
          <button onClick={() => setStep(1)} style={btn('ghost')}>
            Start Over
          </button>
        </div>
      )}
    </div>
  );
}
