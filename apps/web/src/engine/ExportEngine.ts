// =============================================================================
//  THE AVID -- Export Engine (Encoding, Delivery & Caption Export)
// =============================================================================

import type { PlaybackSnapshot } from './PlaybackSnapshot';
import { buildPlaybackFrameSignature, buildPlaybackSnapshot } from './PlaybackSnapshot';
import { renderPlaybackSnapshotFrame } from './playbackSnapshotFrame';
import type {
  ProjectSettings,
  SequenceSettings,
  SubtitleTrack,
  TitleClipData,
  Track,
} from '../store/editor.store';

/** Supported video codec formats. */
export type ExportFormat = 'h264' | 'h265' | 'prores' | 'dnxhd' | 'av1' | 'webm';
/** Export preset category. */
export type ExportCategory = 'broadcast' | 'streaming' | 'archive' | 'social' | 'custom';
/** Supported caption/subtitle formats. */
export type CaptionFormat = 'srt' | 'vtt' | 'scc' | 'ttml';
/** Export delivery destination. */
export type ExportDestination = 'local' | 'cloud' | 'youtube' | 'vimeo' | 'instagram' | 'tiktok';

/** Audio source used for browser-side export muxing. */
export interface ExportAudioSource {
  stream?: MediaStream;
  element?: HTMLMediaElement;
  gain?: number;
  enabled?: boolean;
  label?: string;
}

/** Metadata describing handoff from browser WebM capture to external encoders. */
export interface ExportEncoderHandoff {
  targetFormat: ExportFormat;
  targetContainer: string;
  targetAudioCodec: string;
  sourceMimeType: string;
  sourceArtifact: string;
  reason: string;
  generatedAt: number;
}

/** An encoding preset defining format, resolution, and codec settings. */
export interface ExportPreset {
  id: string;
  name: string;
  category: ExportCategory;
  format: ExportFormat;
  resolution: { width: number; height: number };
  fps: number;
  bitrate: string;
  audioCodec: string;
  audioBitrate: string;
  container: string;
  description: string;
}

/** A running or completed export job. */
export interface ExportJob {
  id: string;
  presetId: string;
  status: 'pending' | 'encoding' | 'uploading' | 'completed' | 'failed';
  progress: number;
  startedAt: number;
  selectionLabel?: string;
  inFrame?: number;
  outFrame?: number;
  snapshotSequenceRevision?: string;
  snapshotFrameSignature?: string;
  renderFrameRevision?: string;
  renderProcessing?: 'pre' | 'post';
  renderOverlayProcessing?: 'pre' | 'post';
  previewFrameNumber?: number;
  previewPlayheadTime?: number;
  previewClipName?: string;
  previewImageDataUrl?: string;
  renderedFrameCount?: number;
  totalFrameCount?: number;
  completedAt?: number;
  outputPath?: string;
  error?: string;
  estimatedTimeRemaining?: number;
  audio?: {
    requestedSources: number;
    muxedTrackCount: number;
  };
  encoderHandoff?: ExportEncoderHandoff;
}

export interface ExportRenderSource {
  tracks: Track[];
  subtitleTracks: SubtitleTrack[];
  titleClips: TitleClipData[];
  showSafeZones: boolean;
  sequenceSettings: Pick<SequenceSettings, 'fps' | 'width' | 'height'>;
  projectSettings?: Pick<ProjectSettings, 'frameRate' | 'width' | 'height'> | null;
  sequenceDuration: number;
  inPoint: number;
  outPoint: number;
}

export interface ExportFramePlan {
  outputFps: number;
  startTime: number;
  endTime: number;
  duration: number;
  frameCount: number;
}

interface CompletedExportOptions {
  outputPath?: string;
  skipDownload?: boolean;
  sourceMimeType?: string;
  audioTrackCount?: number;
  useSourceExtension?: boolean;
}

interface StartExportOptions {
  inFrame?: number;
  outFrame?: number;
  selectionLabel?: string;
  snapshot?: PlaybackSnapshot;
  renderFrameRevision?: string;
  renderProcessing?: 'pre' | 'post';
  renderOverlayProcessing?: 'pre' | 'post';
  previewImageDataUrl?: string;
  captionFormat?: CaptionFormat;
  canvas?: HTMLCanvasElement;
  duration?: number;
  renderSource?: ExportRenderSource;
  audioSources?: ExportAudioSource[];
}

function clampExportTime(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

export function buildExportFramePlan(
  source: ExportRenderSource,
  outputFps: number,
): ExportFramePlan {
  const startTime = clampExportTime(source.inPoint);
  const rawEndTime = clampExportTime(source.outPoint);
  const safeFps = Number.isFinite(outputFps) && outputFps > 0 ? outputFps : 24;
  const minDuration = 1 / safeFps;
  const endTime = Math.max(startTime + minDuration, rawEndTime);
  const duration = endTime - startTime;

  return {
    outputFps: safeFps,
    startTime,
    endTime,
    duration,
    frameCount: Math.max(1, Math.ceil(duration * safeFps)),
  };
}

export function getExportFrameTime(
  plan: ExportFramePlan,
  frameIndex: number,
): number {
  const safeFrameIndex = Math.max(0, Math.floor(frameIndex));
  return Math.min(plan.endTime, plan.startTime + safeFrameIndex / plan.outputFps);
}

export function buildExportSnapshotForFrame(
  source: ExportRenderSource,
  plan: ExportFramePlan,
  frameIndex: number,
): PlaybackSnapshot {
  return buildPlaybackSnapshot({
    tracks: source.tracks,
    subtitleTracks: source.subtitleTracks,
    titleClips: source.titleClips,
    playheadTime: getExportFrameTime(plan, frameIndex),
    duration: source.sequenceDuration,
    isPlaying: false,
    showSafeZones: source.showSafeZones,
    activeMonitor: 'record',
    activeScope: null,
    sequenceSettings: source.sequenceSettings,
    projectSettings: source.projectSettings,
  }, 'export');
}

// -- Default Presets ----------------------------------------------------------

const DEFAULT_PRESETS: ExportPreset[] = [
  // Broadcast
  {
    id: 'broadcast-dnxhd-1080i',
    name: 'DNxHD MXF 1080i',
    category: 'broadcast',
    format: 'dnxhd',
    resolution: { width: 1920, height: 1080 },
    fps: 29.97,
    bitrate: '145 Mbps',
    audioCodec: 'pcm_s24le',
    audioBitrate: '2304 kbps',
    container: 'mxf',
    description: 'Broadcast-standard interlaced delivery for network television.',
  },
  {
    id: 'broadcast-prores422-1080p',
    name: 'ProRes 422 MOV 1080p',
    category: 'broadcast',
    format: 'prores',
    resolution: { width: 1920, height: 1080 },
    fps: 23.976,
    bitrate: '147 Mbps',
    audioCodec: 'pcm_s24le',
    audioBitrate: '2304 kbps',
    container: 'mov',
    description: 'High-quality intermediate for post-production pipelines.',
  },
  {
    id: 'broadcast-prores4444-4k',
    name: 'ProRes 4444 4K',
    category: 'broadcast',
    format: 'prores',
    resolution: { width: 3840, height: 2160 },
    fps: 23.976,
    bitrate: '330 Mbps',
    audioCodec: 'pcm_s24le',
    audioBitrate: '2304 kbps',
    container: 'mov',
    description: 'Mastering-grade 4K with alpha channel support.',
  },

  // Streaming
  {
    id: 'stream-h264-1080p',
    name: 'H.264 1080p High',
    category: 'streaming',
    format: 'h264',
    resolution: { width: 1920, height: 1080 },
    fps: 23.976,
    bitrate: '15 Mbps',
    audioCodec: 'aac',
    audioBitrate: '320 kbps',
    container: 'mp4',
    description: 'Streaming-optimized 1080p with high-profile H.264.',
  },
  {
    id: 'stream-h264-4k',
    name: 'H.264 4K',
    category: 'streaming',
    format: 'h264',
    resolution: { width: 3840, height: 2160 },
    fps: 23.976,
    bitrate: '45 Mbps',
    audioCodec: 'aac',
    audioBitrate: '320 kbps',
    container: 'mp4',
    description: '4K streaming master with H.264 high profile.',
  },
  {
    id: 'stream-h265-4k-hdr',
    name: 'H.265 4K HDR',
    category: 'streaming',
    format: 'h265',
    resolution: { width: 3840, height: 2160 },
    fps: 23.976,
    bitrate: '30 Mbps',
    audioCodec: 'aac',
    audioBitrate: '320 kbps',
    container: 'mp4',
    description: '4K HDR10 delivery with HEVC for efficient streaming.',
  },
  {
    id: 'stream-av1-1080p',
    name: 'AV1 1080p',
    category: 'streaming',
    format: 'av1',
    resolution: { width: 1920, height: 1080 },
    fps: 23.976,
    bitrate: '8 Mbps',
    audioCodec: 'opus',
    audioBitrate: '128 kbps',
    container: 'mp4',
    description: 'Next-gen AV1 codec with superior compression efficiency.',
  },

  // Archive
  {
    id: 'archive-prores4444xq',
    name: 'ProRes 4444 XQ',
    category: 'archive',
    format: 'prores',
    resolution: { width: 3840, height: 2160 },
    fps: 23.976,
    bitrate: '500 Mbps',
    audioCodec: 'pcm_s24le',
    audioBitrate: '2304 kbps',
    container: 'mov',
    description: 'Highest-fidelity archival format preserving all visual data.',
  },
  {
    id: 'archive-dnxhr-444',
    name: 'DNxHR 444',
    category: 'archive',
    format: 'dnxhd',
    resolution: { width: 3840, height: 2160 },
    fps: 23.976,
    bitrate: '350 Mbps',
    audioCodec: 'pcm_s24le',
    audioBitrate: '2304 kbps',
    container: 'mxf',
    description: 'Avid-native 4:4:4 archive master for long-term storage.',
  },

  // Social
  {
    id: 'social-instagram-reels',
    name: 'Instagram Reels',
    category: 'social',
    format: 'h264',
    resolution: { width: 1080, height: 1920 },
    fps: 30,
    bitrate: '10 Mbps',
    audioCodec: 'aac',
    audioBitrate: '256 kbps',
    container: 'mp4',
    description: 'Vertical 9:16 optimized for Instagram Reels.',
  },
  {
    id: 'social-tiktok',
    name: 'TikTok',
    category: 'social',
    format: 'h264',
    resolution: { width: 1080, height: 1920 },
    fps: 30,
    bitrate: '8 Mbps',
    audioCodec: 'aac',
    audioBitrate: '256 kbps',
    container: 'mp4',
    description: 'Vertical 9:16 delivery for TikTok publishing.',
  },
  {
    id: 'social-youtube-4k',
    name: 'YouTube 4K',
    category: 'social',
    format: 'h264',
    resolution: { width: 3840, height: 2160 },
    fps: 23.976,
    bitrate: '40 Mbps',
    audioCodec: 'aac',
    audioBitrate: '320 kbps',
    container: 'mp4',
    description: 'YouTube 4K upload preset with recommended bitrate.',
  },
  {
    id: 'social-youtube-shorts',
    name: 'YouTube Shorts',
    category: 'social',
    format: 'h264',
    resolution: { width: 1080, height: 1920 },
    fps: 30,
    bitrate: '10 Mbps',
    audioCodec: 'aac',
    audioBitrate: '256 kbps',
    container: 'mp4',
    description: 'Vertical short-form video for YouTube Shorts.',
  },

  // Custom
  {
    id: 'custom-webm-vp9',
    name: 'WebM VP9',
    category: 'custom',
    format: 'webm',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    bitrate: '12 Mbps',
    audioCodec: 'opus',
    audioBitrate: '128 kbps',
    container: 'webm',
    description: 'Open web format for HTML5 video embedding.',
  },
  {
    id: 'custom-gif',
    name: 'Animated GIF',
    category: 'custom',
    format: 'h264',
    resolution: { width: 480, height: 270 },
    fps: 15,
    bitrate: '2 Mbps',
    audioCodec: 'none',
    audioBitrate: '0',
    container: 'gif',
    description: 'Lightweight animated GIF for previews and social sharing.',
  },
];

// -- Demo caption data --------------------------------------------------------

const DEMO_CAPTIONS = [
  { start: 0.0, end: 3.5, text: 'The morning light crept through the blinds.' },
  { start: 3.5, end: 7.0, text: 'She stared at the phone, waiting.' },
  { start: 7.0, end: 10.5, text: '"We need to talk," he said quietly.' },
  { start: 10.5, end: 14.0, text: 'The city below hummed with life.' },
  { start: 14.0, end: 18.0, text: 'Everything was about to change.' },
];

// -- Engine -------------------------------------------------------------------

/**
 * Export engine managing encoding presets, export jobs, and caption generation.
 *
 * Simulates encoding progress over ~5 seconds for demo purposes. In production,
 * this would delegate to WebCodecs or a server-side encoding pipeline.
 */
class ExportEngine {
  private presets: ExportPreset[];
  private jobs: Map<string, ExportJob> = new Map();
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private listeners = new Set<() => void>();
  private activeRecorders: Map<string, MediaRecorder> = new Map();
  private frameSteppers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /** Initialise with built-in export presets. */
  constructor() {
    this.presets = [...DEFAULT_PRESETS];
  }

  // -- Presets ----------------------------------------------------------------

  /**
   * Get export presets, optionally filtered by category.
   * @param category Optional category filter.
   * @returns Array of matching ExportPreset objects.
   * @example
   * const streamingPresets = exportEngine.getPresets('streaming');
   */
  getPresets(category?: ExportCategory): ExportPreset[] {
    if (!category) return [...this.presets];
    return this.presets.filter((p) => p.category === category);
  }

  /**
   * Look up a single preset by ID.
   * @param id Preset identifier.
   * @returns The preset, or `undefined` if not found.
   * @example
   * const preset = exportEngine.getPreset('stream-h264-1080p');
   */
  getPreset(id: string): ExportPreset | undefined {
    return this.presets.find((p) => p.id === id);
  }

  private isBrowserFrameExportSupported(): boolean {
    return (
      typeof document !== 'undefined' &&
      typeof MediaRecorder !== 'undefined' &&
      typeof HTMLCanvasElement !== 'undefined' &&
      typeof HTMLCanvasElement.prototype.captureStream === 'function'
    );
  }

  private updateJobRenderState(
    jobId: string,
    renderedFrameCount: number,
    totalFrameCount: number,
  ): void {
    const currentJob = this.jobs.get(jobId);
    if (!currentJob || currentJob.status === 'failed') {
      return;
    }

    currentJob.renderedFrameCount = renderedFrameCount;
    currentJob.totalFrameCount = totalFrameCount;
    this.notify();
  }

  private updateJobProgress(
    jobId: string,
    destination: ExportDestination,
    normalizedProgress: number,
  ): void {
    const currentJob = this.jobs.get(jobId);
    if (!currentJob || currentJob.status === 'failed') {
      return;
    }

    const progress = Math.max(0, Math.min(1, normalizedProgress));
    currentJob.progress = Math.max(currentJob.progress, Math.round(progress * 100));

    const elapsed = (Date.now() - currentJob.startedAt) / 1000;
    const rate = progress > 0 ? elapsed / progress : 0;
    currentJob.estimatedTimeRemaining =
      Math.round(Math.max(0, rate * (1 - progress)) * 10) / 10;

    if (progress >= 0.8 && currentJob.status === 'encoding') {
      currentJob.status = destination === 'local' ? 'encoding' : 'uploading';
    }

    this.notify();
  }

  private completeExportJob(
    jobId: string,
    preset: ExportPreset | undefined,
    blob: Blob,
    options?: CompletedExportOptions,
  ): void {
    const currentJob = this.jobs.get(jobId);
    if (!currentJob || currentJob.status === 'failed') {
      return;
    }

    currentJob.status = 'completed';
    currentJob.progress = 100;
    currentJob.completedAt = Date.now();
    currentJob.estimatedTimeRemaining = 0;

    if (currentJob.audio || options?.audioTrackCount !== undefined) {
      currentJob.audio = {
        requestedSources: currentJob.audio?.requestedSources ?? 0,
        muxedTrackCount: options?.audioTrackCount ?? currentJob.audio?.muxedTrackCount ?? 0,
      };
    }

    const sourceMimeType = options?.sourceMimeType ?? blob.type;
    const useSourceExtension = options?.useSourceExtension ?? false;
    const extension = useSourceExtension
      ? (blob.type.includes('webm') ? 'webm' : 'mp4')
      : (preset?.container ?? (blob.type.includes('webm') ? 'webm' : 'mp4'));
    const fileName = options?.outputPath ?? (
      preset
        ? `${preset.name.replace(/\s+/g, '_').toLowerCase()}_${jobId}.${extension}`
        : `output_${jobId}.${extension}`
    );
    currentJob.outputPath = fileName;

    if (preset && useSourceExtension) {
      currentJob.encoderHandoff = {
        targetFormat: preset.format,
        targetContainer: preset.container,
        targetAudioCodec: preset.audioCodec,
        sourceMimeType,
        sourceArtifact: fileName,
        reason: 'Browser MediaRecorder emits WebM output; transcode required for requested preset container/codec.',
        generatedAt: Date.now(),
      };
    }

    if (typeof document !== 'undefined' && !options?.skipDownload) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    this.notify();
  }

  private supportsDesktopTranscodeHandoff(): boolean {
    return (
      typeof window !== 'undefined'
      && typeof window.electronAPI?.transcodeExportArtifact === 'function'
    );
  }

  private async transcodeViaDesktopHandoff(
    jobId: string,
    preset: ExportPreset,
    sourceBlob: Blob,
  ): Promise<string> {
    if (!this.supportsDesktopTranscodeHandoff() || !window.electronAPI) {
      throw new Error('Desktop transcode handoff is unavailable.');
    }

    const currentJob = this.jobs.get(jobId);
    if (currentJob && currentJob.status !== 'failed') {
      currentJob.status = 'uploading';
      this.notify();
    }

    const sourceArtifact = new Uint8Array(await sourceBlob.arrayBuffer());
    const result = await window.electronAPI.transcodeExportArtifact({
      jobId,
      sourceArtifact,
      sourceContainer: 'webm',
      targetContainer: preset.container,
      targetVideoCodec: preset.format,
      targetAudioCodec: preset.audioCodec,
      fps: preset.fps,
      width: preset.resolution.width,
      height: preset.resolution.height,
    });

    return result.outputPath;
  }

  private failExportJob(jobId: string, error: unknown): void {
    const currentJob = this.jobs.get(jobId);
    if (!currentJob) {
      return;
    }

    currentJob.status = 'failed';
    currentJob.error = error instanceof Error ? error.message : String(error);
    currentJob.estimatedTimeRemaining = 0;
    this.notify();
  }

  private clearFrameStepper(jobId: string): void {
    const stepper = this.frameSteppers.get(jobId);
    if (stepper) {
      clearTimeout(stepper);
      this.frameSteppers.delete(jobId);
    }
  }

  private async startFrameSteppedExport(
    jobId: string,
    preset: ExportPreset,
    destination: ExportDestination,
    source: ExportRenderSource,
    overlayProcessing: 'pre' | 'post',
  ): Promise<Blob> {
    if (typeof document === 'undefined') {
      throw new Error('Browser export is unavailable in this environment.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = preset.resolution.width;
    canvas.height = preset.resolution.height;

    const plan = buildExportFramePlan(source, preset.fps);
    const recordingDuration = Math.max(plan.duration, plan.frameCount / plan.outputFps);
    const renderFrame = (frameIndex: number) => {
      const snapshot = buildExportSnapshotForFrame(source, plan, frameIndex);
      renderPlaybackSnapshotFrame({
        snapshot,
        width: preset.resolution.width,
        height: preset.resolution.height,
        canvas,
        colorProcessing: 'post',
        overlayProcessing,
        useCache: false,
      });
      this.updateJobRenderState(jobId, frameIndex + 1, plan.frameCount);
    };
    const scheduleFrame = (frameIndex: number) => {
      if (frameIndex >= plan.frameCount) {
        this.clearFrameStepper(jobId);
        return;
      }

      const timeout = setTimeout(() => {
        const currentJob = this.jobs.get(jobId);
        if (!currentJob || currentJob.status === 'failed') {
          this.clearFrameStepper(jobId);
          return;
        }

        renderFrame(frameIndex);
        scheduleFrame(frameIndex + 1);
      }, 1000 / plan.outputFps);

      this.frameSteppers.set(jobId, timeout);
    };

    this.updateJobRenderState(jobId, 0, plan.frameCount);
    const currentJob = this.jobs.get(jobId);
    if (currentJob) {
      currentJob.estimatedTimeRemaining = Math.round(recordingDuration * 10) / 10;
      this.notify();
    }

    renderFrame(0);
    if (plan.frameCount > 1) {
      scheduleFrame(1);
    }

    try {
      const { blob } = await this.startRealExport(
        jobId,
        canvas,
        recordingDuration,
        plan.outputFps,
        (progress) => {
          const frameProgress = plan.frameCount > 0
            ? ((this.jobs.get(jobId)?.renderedFrameCount ?? 0) / plan.frameCount) * 0.9
            : 0;
          this.updateJobProgress(jobId, destination, Math.max(progress, frameProgress));
        },
      );
      return blob;
    } finally {
      this.clearFrameStepper(jobId);
    }
  }

  // -- Jobs -------------------------------------------------------------------

  /**
   * Start a new export job. When a canvas element is provided the engine
   * records the canvas stream with `MediaRecorder` and produces a real
   * WebM blob. Without a canvas it falls back to the simulated 5-second
   * progress timer (useful for presets like ProRes that need desktop FFmpeg).
   *
   * @param presetId    The preset ID to encode with.
   * @param destination The delivery destination.
   * @param options     Optional in/out frame range, caption format, canvas element, and duration.
   * @returns The newly created ExportJob.
   * @example
   * // Simulated export (no canvas)
   * const job = exportEngine.startExport('stream-h264-1080p', 'local');
   * // Real canvas-based export
   * const job = exportEngine.startExport('custom-webm-vp9', 'local', { canvas: myCanvas, duration: 10 });
   */
  startExport(
    presetId: string,
    destination: ExportDestination,
    options?: StartExportOptions,
  ): ExportJob {
    const preset = this.getPreset(presetId);
    const jobId = `export_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fps = preset?.fps ?? 30;
    const job: ExportJob = {
      id: jobId,
      presetId,
      status: 'encoding',
      progress: 0,
      startedAt: Date.now(),
      selectionLabel: options?.selectionLabel,
      inFrame: options?.inFrame,
      outFrame: options?.outFrame,
      snapshotSequenceRevision: options?.snapshot?.sequenceRevision,
      snapshotFrameSignature: options?.snapshot
        ? buildPlaybackFrameSignature(options.snapshot)
        : undefined,
      renderFrameRevision: options?.renderFrameRevision,
      renderProcessing: options?.renderProcessing,
      renderOverlayProcessing: options?.renderOverlayProcessing,
      previewFrameNumber: options?.snapshot?.frameNumber,
      previewPlayheadTime: options?.snapshot?.playheadTime,
      previewClipName: options?.snapshot?.primaryVideoLayer?.clip.name,
      previewImageDataUrl: options?.previewImageDataUrl,
      estimatedTimeRemaining: options?.duration ?? 5,
      audio: {
        requestedSources: options?.audioSources?.filter((source) => source.enabled !== false).length ?? 0,
        muxedTrackCount: 0,
      },
    };
    this.jobs.set(jobId, job);
    this.notify();

    const canUseFrameSteppedExport =
      Boolean(preset) &&
      Boolean(options?.renderSource) &&
      (preset?.container === 'webm' || this.supportsDesktopTranscodeHandoff()) &&
      this.isBrowserFrameExportSupported();

    if (canUseFrameSteppedExport && preset && options?.renderSource) {
      const overlayProcessing = options.renderOverlayProcessing ?? 'post';
      this.startFrameSteppedExport(jobId, preset, destination, options.renderSource, overlayProcessing)
        .then(async (blob) => {
          if (preset.container !== 'webm') {
            const outputPath = await this.transcodeViaDesktopHandoff(jobId, preset, blob);
            this.completeExportJob(jobId, preset, blob, {
              outputPath,
              skipDownload: true,
            });
            return;
          }

          this.completeExportJob(jobId, preset, blob);
        })
        .catch((err) => {
          this.failExportJob(jobId, err);
        });

      return { ...job };
    }

    // ── Real MediaRecorder-based export (canvas provided) ──────────────
    if (options?.canvas) {
      const canvas = options.canvas;
      const duration = options.duration ?? 5;

      this.startRealExport(jobId, canvas, duration, fps, (progress) => {
        this.updateJobProgress(jobId, destination, progress);
      }, options.audioSources)
        .then(({ blob, mimeType, audioTrackCount }) => {
          this.completeExportJob(jobId, preset, blob, {
            audioTrackCount,
            sourceMimeType: mimeType,
            useSourceExtension: Boolean(preset && this.requiresEncoderHandoff(preset)),
          });
        })
        .catch((err) => {
          this.failExportJob(jobId, err);
        });

      return { ...job };
    }

    // ── Simulated fallback (no canvas – for ProRes / desktop FFmpeg) ───
    const totalSteps = 50;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      const currentJob = this.jobs.get(jobId);
      if (!currentJob || currentJob.status === 'failed') {
        clearInterval(interval);
        this.timers.delete(jobId);
        return;
      }
      const progress = Math.min(100, Math.round((step / totalSteps) * 100));
      const remaining = Math.max(0, ((totalSteps - step) / totalSteps) * 5);
      currentJob.progress = progress;
      currentJob.estimatedTimeRemaining = Math.round(remaining * 10) / 10;

      if (step >= totalSteps * 0.8 && currentJob.status === 'encoding') {
        currentJob.status = destination === 'local' ? 'encoding' : 'uploading';
      }

      if (progress >= 100) {
        clearInterval(interval);
        this.timers.delete(jobId);
        currentJob.status = 'completed';
        currentJob.completedAt = Date.now();
        currentJob.estimatedTimeRemaining = 0;
        currentJob.outputPath = preset
          ? `/exports/${preset.name.replace(/\s+/g, '_').toLowerCase()}_${jobId}.${preset.container}`
          : `/exports/output_${jobId}.mp4`;
      }
      this.notify();
    }, 100);

    this.timers.set(jobId, interval);
    return { ...job };
  }

  // -- Real MediaRecorder Export ----------------------------------------------

  /**
   * Record a canvas stream using MediaRecorder and return the resulting Blob.
   *
   * The method captures the canvas at the given FPS, records for `duration`
   * seconds, and resolves with a WebM Blob containing the encoded video.
   *
   * @param canvas     The HTMLCanvasElement to record.
   * @param duration   Recording length in seconds.
   * @param fps        Frames per second for `captureStream`.
   * @param onProgress Optional callback receiving normalised progress (0-1).
   * @returns A Promise that resolves to the recorded video Blob.
   * @example
   * const { blob } = await exportEngine.startRealExport('job-1', canvas, 10, 30, (p) => console.log(p));
   */
  async startRealExport(
    jobId: string,
    canvas: HTMLCanvasElement,
    duration: number,
    fps: number = 30,
    onProgress?: (progress: number) => void,
    audioSources?: ExportAudioSource[],
  ): Promise<{ blob: Blob; mimeType: string; audioTrackCount: number }> {
    const mediaStream = this.createCompositeExportStream(canvas, fps, audioSources);
    const stream = mediaStream.stream;

    // Choose the best supported MIME type
    const preferredMime = 'video/webm;codecs=vp9';
    const fallbackMime = 'video/webm';
    const mimeType =
      typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(preferredMime)
        ? preferredMime
        : fallbackMime;

    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];

    this.activeRecorders.set(jobId, recorder);

    return new Promise<{ blob: Blob; mimeType: string; audioTrackCount: number }>((resolve, reject) => {
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = (event: Event) => {
        this.activeRecorders.delete(jobId);
        mediaStream.cleanup();
        reject(new Error(`MediaRecorder error: ${(event as ErrorEvent).message ?? 'unknown'}`));
      };

      recorder.onstop = () => {
        this.activeRecorders.delete(jobId);
        const blob = new Blob(chunks, { type: mimeType });
        mediaStream.cleanup();
        resolve({
          blob,
          mimeType,
          audioTrackCount: mediaStream.audioTrackCount,
        });
      };

      // Start recording – request data every 100ms for responsive progress
      recorder.start(100);

      // Track progress based on elapsed time vs target duration
      const startTime = Date.now();
      const progressInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const progress = Math.min(1, elapsed / duration);

        if (onProgress) {
          onProgress(progress);
        }

        if (elapsed >= duration) {
          clearInterval(progressInterval);
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        }
      }, 100);

      // Safety: also stop when recorder is externally stopped (e.g. cancellation)
      recorder.addEventListener(
        'stop',
        () => {
          clearInterval(progressInterval);
        },
        { once: true },
      );
    });
  }

  /**
   * Cancel a running export job.
   * @param jobId The job ID to cancel.
   * @example
   * exportEngine.cancelExport(job.id);
   */
  cancelExport(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = 'failed';
    job.error = 'Cancelled by user';
    job.estimatedTimeRemaining = 0;
    const timer = this.timers.get(jobId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(jobId);
    }
    this.clearFrameStepper(jobId);
    const recorder = this.activeRecorders.get(jobId);
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    }
    this.activeRecorders.delete(jobId);
    this.notify();
  }

  /**
   * Get a snapshot of a specific export job.
   * @param jobId The job ID.
   * @returns A copy of the job, or `undefined` if not found.
   */
  getJob(jobId: string): ExportJob | undefined {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : undefined;
  }

  /**
   * Get all export jobs sorted by most recent first.
   * @returns Array of ExportJob snapshots.
   */
  getActiveJobs(): ExportJob[] {
    const active: ExportJob[] = [];
    for (const [, job] of this.jobs) {
      active.push({ ...job });
    }
    return active.sort((a, b) => b.startedAt - a.startedAt);
  }

  // -- Captions ---------------------------------------------------------------

  /**
   * Export demo captions in the specified format.
   * @param format The caption format to generate.
   * @returns Formatted caption string.
   * @example
   * const srt = exportEngine.exportCaptions('srt');
   */
  exportCaptions(format: CaptionFormat): string {
    try {
      switch (format) {
        case 'srt':
          return DEMO_CAPTIONS.map((c, i) => {
            const startTC = this.secondsToSRT(c.start);
            const endTC = this.secondsToSRT(c.end);
            return `${i + 1}\n${startTC} --> ${endTC}\n${c.text}\n`;
          }).join('\n');

        case 'vtt':
          return (
            'WEBVTT\n\n' +
            DEMO_CAPTIONS.map((c) => {
              const startTC = this.secondsToVTT(c.start);
              const endTC = this.secondsToVTT(c.end);
              return `${startTC} --> ${endTC}\n${c.text}\n`;
            }).join('\n')
          );

        case 'scc':
          return (
            'Scenarist_SCC V1.0\n\n' +
            DEMO_CAPTIONS.map((c) => {
              const tc = this.secondsToSCCTimecode(c.start);
              return `${tc}\t9420 9420 ${this.textToSCCHex(c.text)}`;
            }).join('\n\n')
          );

        case 'ttml': {
          const body = DEMO_CAPTIONS.map(
            (c) =>
              `    <p begin="${c.start.toFixed(3)}s" end="${c.end.toFixed(3)}s">${this.escapeXml(c.text)}</p>`,
          ).join('\n');
          return `<?xml version="1.0" encoding="UTF-8"?>\n<tt xmlns="http://www.w3.org/ns/ttml">\n  <body>\n    <div>\n${body}\n    </div>\n  </body>\n</tt>`;
        }

        default:
          return '';
      }
    } catch (err) {
      console.error('[ExportEngine] Caption export error:', err);
      return '';
    }
  }

  // -- Subscribe --------------------------------------------------------------

  /**
   * Subscribe to engine state changes.
   * @param cb Callback invoked on change.
   * @returns An unsubscribe function.
   * @example
   * const unsub = exportEngine.subscribe(() => updateJobProgress());
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Notify all subscribers that state has changed. */
  private notify(): void {
    this.listeners.forEach((fn) => {
      try { fn(); } catch (err) {
        console.error('[ExportEngine] Listener error:', err);
      }
    });
  }

  /**
   * Build a composite MediaStream containing canvas video and optional mixed audio.
   */
  private createCompositeExportStream(
    canvas: HTMLCanvasElement,
    fps: number,
    audioSources?: ExportAudioSource[],
  ): {
    stream: MediaStream;
    audioTrackCount: number;
    cleanup: () => void;
  } {
    const canvasStream = canvas.captureStream(fps);
    const composed = new MediaStream();
    canvasStream.getVideoTracks().forEach((track) => composed.addTrack(track));

    const activeSources = (audioSources ?? []).filter((source) => source.enabled !== false);
    if (activeSources.length === 0) {
      return {
        stream: composed,
        audioTrackCount: 0,
        cleanup: () => {
          canvasStream.getTracks().forEach((track) => track.stop());
        },
      };
    }

    const AudioContextCtor =
      typeof window !== 'undefined'
        ? window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;

    if (!AudioContextCtor) {
      for (const source of activeSources) {
        const sourceStream = this.resolveAudioSourceStream(source);
        if (!sourceStream) continue;
        sourceStream.getAudioTracks().forEach((track) => composed.addTrack(track));
      }

      return {
        stream: composed,
        audioTrackCount: composed.getAudioTracks().length,
        cleanup: () => {
          canvasStream.getTracks().forEach((track) => track.stop());
        },
      };
    }

    const audioContext = new AudioContextCtor();
    const destination = audioContext.createMediaStreamDestination();
    const sourceNodes: MediaStreamAudioSourceNode[] = [];
    const gainNodes: GainNode[] = [];

    for (const source of activeSources) {
      const sourceStream = this.resolveAudioSourceStream(source);
      if (!sourceStream) continue;
      if (sourceStream.getAudioTracks().length === 0) continue;

      const sourceNode = audioContext.createMediaStreamSource(sourceStream);
      sourceNodes.push(sourceNode);

      const gainNode = audioContext.createGain();
      gainNode.gain.value = source.gain ?? 1;
      gainNodes.push(gainNode);

      sourceNode.connect(gainNode);
      gainNode.connect(destination);
    }

    destination.stream.getAudioTracks().forEach((track) => composed.addTrack(track));

    return {
      stream: composed,
      audioTrackCount: destination.stream.getAudioTracks().length,
      cleanup: () => {
        sourceNodes.forEach((node) => node.disconnect());
        gainNodes.forEach((node) => node.disconnect());
        destination.disconnect();
        canvasStream.getTracks().forEach((track) => track.stop());
        void audioContext.close();
      },
    };
  }

  /**
   * Resolve an export audio source into a MediaStream when possible.
   */
  private resolveAudioSourceStream(source: ExportAudioSource): MediaStream | undefined {
    if (source.stream) return source.stream;
    if (!source.element) return undefined;
    const capture = (source.element as HTMLMediaElement & { captureStream?: () => MediaStream }).captureStream;
    if (typeof capture === 'function') {
      return capture.call(source.element);
    }
    return undefined;
  }

  /**
   * Browser recorder currently writes WebM, so non-WebM preset containers/codecs require handoff.
   */
  private requiresEncoderHandoff(preset?: ExportPreset): boolean {
    if (!preset) return false;
    return preset.container.toLowerCase() !== 'webm' || preset.format !== 'webm';
  }

  // -- Helpers ----------------------------------------------------------------

  /**
   * Convert seconds to SRT timecode format (HH:MM:SS,mmm).
   * @param seconds Time in seconds.
   */
  private secondsToSRT(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  /**
   * Convert seconds to WebVTT timecode format (HH:MM:SS.mmm).
   * @param seconds Time in seconds.
   */
  private secondsToVTT(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  /**
   * Convert seconds to SCC timecode format (HH:MM:SS:FF at 30fps).
   * @param seconds Time in seconds.
   */
  private secondsToSCCTimecode(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * 30);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  }

  /**
   * Convert text to SCC hex encoding.
   * @param text Source text (truncated to 32 chars).
   */
  private textToSCCHex(text: string): string {
    return text
      .slice(0, 32)
      .split('')
      .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0'))
      .join(' ');
  }

  /**
   * Escape XML special characters.
   * @param str Source string.
   */
  private escapeXml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

/** Singleton export engine instance. */
export const exportEngine = new ExportEngine();
