// =============================================================================
//  THE AVID -- Export Engine (Encoding, Delivery & Caption Export)
// =============================================================================

import type { PlaybackSnapshot } from './PlaybackSnapshot';
import { buildPlaybackFrameSignature } from './PlaybackSnapshot';

/** Supported video codec formats. */
export type ExportFormat = 'h264' | 'h265' | 'prores' | 'dnxhd' | 'av1' | 'webm';
/** Export preset category. */
export type ExportCategory = 'broadcast' | 'streaming' | 'archive' | 'social' | 'custom';
/** Supported caption/subtitle formats. */
export type CaptionFormat = 'srt' | 'vtt' | 'scc' | 'ttml';
/** Export delivery destination. */
export type ExportDestination = 'local' | 'cloud' | 'youtube' | 'vimeo' | 'instagram' | 'tiktok';

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
  previewFrameNumber?: number;
  previewPlayheadTime?: number;
  previewClipName?: string;
  previewImageDataUrl?: string;
  completedAt?: number;
  outputPath?: string;
  error?: string;
  estimatedTimeRemaining?: number;
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
    options?: {
      inFrame?: number;
      outFrame?: number;
      selectionLabel?: string;
      snapshot?: PlaybackSnapshot;
      renderFrameRevision?: string;
      renderProcessing?: 'pre' | 'post';
      previewImageDataUrl?: string;
      captionFormat?: CaptionFormat;
      canvas?: HTMLCanvasElement;
      duration?: number;
    },
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
      previewFrameNumber: options?.snapshot?.frameNumber,
      previewPlayheadTime: options?.snapshot?.playheadTime,
      previewClipName: options?.snapshot?.primaryVideoLayer?.clip.name,
      previewImageDataUrl: options?.previewImageDataUrl,
      estimatedTimeRemaining: options?.duration ?? 5,
    };
    this.jobs.set(jobId, job);
    this.notify();

    // ── Real MediaRecorder-based export (canvas provided) ──────────────
    if (options?.canvas) {
      const canvas = options.canvas;
      const duration = options.duration ?? 5;

      this.startRealExport(canvas, duration, fps, (progress) => {
        const currentJob = this.jobs.get(jobId);
        if (!currentJob || currentJob.status === 'failed') return;

        currentJob.progress = Math.round(progress * 100);
        const elapsed = (Date.now() - currentJob.startedAt) / 1000;
        const rate = progress > 0 ? elapsed / progress : 0;
        currentJob.estimatedTimeRemaining =
          Math.round(Math.max(0, rate * (1 - progress)) * 10) / 10;

        if (progress >= 0.8 && currentJob.status === 'encoding') {
          currentJob.status = destination === 'local' ? 'encoding' : 'uploading';
        }
        this.notify();
      })
        .then((blob) => {
          const currentJob = this.jobs.get(jobId);
          if (!currentJob || currentJob.status === 'failed') return;

          currentJob.status = 'completed';
          currentJob.progress = 100;
          currentJob.completedAt = Date.now();
          currentJob.estimatedTimeRemaining = 0;

          // Generate a download URL and trigger browser download
          const url = URL.createObjectURL(blob);
          const fileName = preset
            ? `${preset.name.replace(/\s+/g, '_').toLowerCase()}_${jobId}.webm`
            : `output_${jobId}.webm`;
          currentJob.outputPath = fileName;

          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = fileName;
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);

          // Revoke the object URL after a short delay to ensure download starts
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          this.notify();
        })
        .catch((err) => {
          const currentJob = this.jobs.get(jobId);
          if (currentJob) {
            currentJob.status = 'failed';
            currentJob.error = err instanceof Error ? err.message : String(err);
          }
          this.notify();
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
   * const blob = await exportEngine.startRealExport(canvas, 10, 30, (p) => console.log(p));
   */
  async startRealExport(
    canvas: HTMLCanvasElement,
    duration: number,
    fps: number = 30,
    onProgress?: (progress: number) => void,
  ): Promise<Blob> {
    const stream = canvas.captureStream(fps);

    // Choose the best supported MIME type
    const preferredMime = 'video/webm;codecs=vp9';
    const fallbackMime = 'video/webm';
    const mimeType =
      typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(preferredMime)
        ? preferredMime
        : fallbackMime;

    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];

    // Track the recorder for potential cancellation
    const recorderId = `rec_${Date.now()}`;
    this.activeRecorders.set(recorderId, recorder);

    return new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = (event: Event) => {
        this.activeRecorders.delete(recorderId);
        reject(new Error(`MediaRecorder error: ${(event as ErrorEvent).message ?? 'unknown'}`));
      };

      recorder.onstop = () => {
        this.activeRecorders.delete(recorderId);
        const blob = new Blob(chunks, { type: mimeType });
        resolve(blob);
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
          // Stop all tracks on the captured stream
          stream.getTracks().forEach((track) => track.stop());
        }
      }, 100);

      // Safety: also stop when recorder is externally stopped (e.g. cancellation)
      recorder.addEventListener(
        'stop',
        () => {
          clearInterval(progressInterval);
          stream.getTracks().forEach((track) => track.stop());
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
    const timer = this.timers.get(jobId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(jobId);
    }
    // Stop any active MediaRecorder associated with this job
    // Collect IDs first to avoid modifying the map during iteration
    const recorderIds = Array.from(this.activeRecorders.keys());
    for (const recId of recorderIds) {
      const recorder = this.activeRecorders.get(recId);
      if (recorder && recorder.state === 'recording') {
        recorder.stop();
      }
      this.activeRecorders.delete(recId);
    }
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
