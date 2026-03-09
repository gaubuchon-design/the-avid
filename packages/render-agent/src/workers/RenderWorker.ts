/**
 * RenderWorker -- main FFmpeg encoding worker for the render farm.
 *
 * Supports all major codecs (H.264, H.265, ProRes, DNxHD/DNxHR, AV1, VP9),
 * segment-based encoding with frame-accurate in/out points,
 * hardware acceleration detection (NVENC, VideoToolbox, VAAPI),
 * and real-time progress parsing from FFmpeg stderr.
 *
 * Features:
 * - Input validation for all job parameters
 * - AbortController-based cancellation
 * - Configurable retry logic with exponential backoff
 * - Temp file cleanup on error
 * - Timeout handling
 */

import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { WorkerJob } from '../index.js';

/** FFmpeg progress data parsed from stderr output. */
export interface RenderProgress {
  /** Current frame number. */
  frame: number;
  /** Encoding speed in frames per second. */
  fps: number;
  /** Current position timestamp (HH:MM:SS.ms). */
  time: string;
  /** Current encoding bitrate. */
  bitrate: string;
  /** Completion percentage (0-100). */
  percent: number;
  /** Encoding speed multiplier (e.g. "2.5x"). */
  speed: string;
  /** Estimated remaining time in seconds. */
  estimatedRemainingSec: number;
}

/** Codec configuration presets. */
interface CodecConfig {
  encoder: string;
  pixFmt: string;
  container: string;
  args: string[];
}

/** Configuration for render worker retry behavior. */
export interface RenderWorkerConfig {
  /** Maximum retries per process invocation. Default: 2 */
  readonly maxRetries: number;
  /** Base delay in ms for exponential backoff between retries. Default: 1000 */
  readonly retryBaseDelayMs: number;
  /** Maximum backoff delay in ms. Default: 10000 */
  readonly retryMaxDelayMs: number;
  /** Timeout in ms for the entire render process. 0 = no limit. Default: 0 */
  readonly timeoutMs: number;
}

const DEFAULT_RENDER_CONFIG: RenderWorkerConfig = {
  maxRetries: 2,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 10_000,
  timeoutMs: 0,
};

/** Map of codec names to their FFmpeg configuration. */
const CODEC_CONFIGS: Record<string, CodecConfig> = {
  'h264': {
    encoder: 'libx264',
    pixFmt: 'yuv420p',
    container: 'mp4',
    args: ['-preset', 'medium', '-crf', '18', '-movflags', '+faststart'],
  },
  'h265': {
    encoder: 'libx265',
    pixFmt: 'yuv420p10le',
    container: 'mp4',
    args: ['-preset', 'medium', '-crf', '20', '-tag:v', 'hvc1', '-movflags', '+faststart'],
  },
  'prores-422': {
    encoder: 'prores_ks',
    pixFmt: 'yuv422p10le',
    container: 'mov',
    args: ['-profile:v', '2', '-vendor', 'apl0'],
  },
  'prores-422hq': {
    encoder: 'prores_ks',
    pixFmt: 'yuv422p10le',
    container: 'mov',
    args: ['-profile:v', '3', '-vendor', 'apl0'],
  },
  'prores-4444': {
    encoder: 'prores_ks',
    pixFmt: 'yuva444p10le',
    container: 'mov',
    args: ['-profile:v', '4', '-vendor', 'apl0'],
  },
  'dnxhd': {
    encoder: 'dnxhd',
    pixFmt: 'yuv422p',
    container: 'mxf',
    args: ['-b:v', '185M'],
  },
  'dnxhr-hq': {
    encoder: 'dnxhd',
    pixFmt: 'yuv422p',
    container: 'mxf',
    args: ['-profile:v', 'dnxhr_hq'],
  },
  'dnxhr-hqx': {
    encoder: 'dnxhd',
    pixFmt: 'yuv422p10le',
    container: 'mxf',
    args: ['-profile:v', 'dnxhr_hqx'],
  },
  'av1': {
    encoder: 'libsvtav1',
    pixFmt: 'yuv420p10le',
    container: 'mp4',
    args: ['-preset', '6', '-crf', '28', '-svtav1-params', 'tune=0', '-movflags', '+faststart'],
  },
  'vp9': {
    encoder: 'libvpx-vp9',
    pixFmt: 'yuv420p',
    container: 'webm',
    args: ['-b:v', '0', '-crf', '30', '-row-mt', '1'],
  },
};

/** Hardware-accelerated encoder variants. */
const HW_ENCODERS: Record<string, Record<string, string>> = {
  nvenc: {
    h264: 'h264_nvenc',
    h265: 'hevc_nvenc',
  },
  videotoolbox: {
    h264: 'h264_videotoolbox',
    h265: 'hevc_videotoolbox',
    prores: 'prores_videotoolbox',
  },
  vaapi: {
    h264: 'h264_vaapi',
    h265: 'hevc_vaapi',
    vp9: 'vp9_vaapi',
    av1: 'av1_vaapi',
  },
};

/** Valid hardware acceleration names. */
const VALID_HW_ACCEL = new Set(['nvenc', 'videotoolbox', 'vaapi']);

/** Progress regex matching FFmpeg stderr output. */
const PROGRESS_REGEX = /frame=\s*(\d+).*fps=\s*([\d.]+).*time=(\S+).*bitrate=\s*(\S+)/;
const SPEED_REGEX = /speed=\s*([\d.]+x)/;

export class RenderWorker {
  private childProcess: ChildProcess | null = null;
  private cancelled = false;
  private startTime = 0;
  private currentOutputPath: string | null = null;
  private config: RenderWorkerConfig;

  constructor(config: Partial<RenderWorkerConfig> = {}) {
    this.config = { ...DEFAULT_RENDER_CONFIG, ...config };
  }

  /**
   * Process a render/encode job with input validation, retry logic,
   * and temp file cleanup.
   *
   * @param job - The worker job describing input, output, codec, and frame range.
   * @param onProgress - Callback fired as FFmpeg reports encoding progress.
   * @param signal - Optional AbortSignal for cancellation.
   * @returns Path to the rendered output file.
   */
  async process(
    job: WorkerJob,
    onProgress?: (progress: RenderProgress) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    // ── Input validation ──────────────────────────────────────────
    this.validateJob(job);

    this.cancelled = false;
    this.startTime = Date.now();

    // Wire up AbortSignal
    if (signal) {
      if (signal.aborted) {
        throw new Error('Render job cancelled before start');
      }
      signal.addEventListener('abort', () => {
        this.cancel();
      }, { once: true });
    }

    const codecKey = (job.codec ?? job.params['codec'] ?? 'h264') as string;
    const config = CODEC_CONFIGS[codecKey];
    if (!config) {
      throw new Error(`Unsupported codec: ${codecKey}. Available: ${Object.keys(CODEC_CONFIGS).join(', ')}`);
    }

    // Determine encoder -- use HW acceleration if requested and available
    let encoder = config.encoder;
    const hwAccel = job.params['hwAccel'] as string | undefined;
    if (hwAccel) {
      if (!VALID_HW_ACCEL.has(hwAccel)) {
        throw new Error(`Invalid hardware acceleration: ${hwAccel}. Valid: ${[...VALID_HW_ACCEL].join(', ')}`);
      }
      const hwMap = HW_ENCODERS[hwAccel];
      if (hwMap) {
        const baseCodec = codecKey.split('-')[0]!; // e.g. "prores-422" -> "prores"
        const hwEncoder = hwMap[baseCodec];
        if (hwEncoder) {
          encoder = hwEncoder;
        }
      }
    }

    // Build output path
    const outputPath =
      job.outputPath ??
      path.join(
        path.dirname(job.inputUrl),
        `${path.basename(job.inputUrl, path.extname(job.inputUrl))}_render.${config.container}`,
      );

    this.currentOutputPath = outputPath;

    // Calculate total frames for progress
    const totalFrames = (job.endFrame != null && job.startFrame != null)
      ? job.endFrame - job.startFrame
      : ((job.params['totalFrames'] as number | undefined) ?? 0);

    const fps = (job.params['fps'] as number | undefined) ?? 24;

    // Build FFmpeg arguments
    const args = this.buildFFmpegArgs(job, encoder, config, outputPath, fps);

    // ── Retry loop with exponential backoff ───────────────────────
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      if (this.cancelled) {
        this.cleanupTempFile(outputPath);
        throw new Error('Render job cancelled');
      }

      if (attempt > 0) {
        // Exponential backoff
        const delay = Math.min(
          this.config.retryBaseDelayMs * Math.pow(2, attempt - 1),
          this.config.retryMaxDelayMs,
        );
        const jitter = delay * 0.2 * Math.random();
        await this.sleep(Math.round(delay + jitter));
        console.log(`[RenderWorker] Retry ${attempt}/${this.config.maxRetries} for job ${job.id}`);
      }

      try {
        const result = await this.executeFFmpeg(args, totalFrames, onProgress);
        this.currentOutputPath = null;
        return result ?? outputPath;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Don't retry on cancellation or abort
        if (this.cancelled || lastError.message.includes('cancelled')) {
          this.cleanupTempFile(outputPath);
          throw lastError;
        }

        // Don't retry on validation errors
        if (lastError.message.includes('Failed to spawn')) {
          this.cleanupTempFile(outputPath);
          throw lastError;
        }

        console.error(`[RenderWorker] Attempt ${attempt + 1} failed: ${lastError.message}`);
      }
    }

    // All retries exhausted
    this.cleanupTempFile(outputPath);
    throw lastError ?? new Error('Render failed after all retries');
  }

  /** Cancel the currently running render process. */
  cancel(): void {
    this.cancelled = true;
    if (this.childProcess) {
      this.childProcess.kill('SIGTERM');
      const pid = this.childProcess.pid;
      setTimeout(() => {
        try {
          if (pid) process.kill(pid, 0);
          this.childProcess?.kill('SIGKILL');
        } catch {
          // Already dead
        }
      }, 5000);
    }
  }

  // ── Validation ──────────────────────────────────────────────────────

  /** Validate job parameters before processing. */
  private validateJob(job: WorkerJob): void {
    if (!job.id || typeof job.id !== 'string') {
      throw new Error('Job must have a non-empty string id');
    }

    if (!job.inputUrl || typeof job.inputUrl !== 'string') {
      throw new Error(`Job ${job.id}: inputUrl must be a non-empty string`);
    }

    if (job.startFrame != null && job.endFrame != null) {
      if (job.startFrame < 0) {
        throw new Error(`Job ${job.id}: startFrame must be >= 0, got ${job.startFrame}`);
      }
      if (job.endFrame <= job.startFrame) {
        throw new Error(`Job ${job.id}: endFrame (${job.endFrame}) must be > startFrame (${job.startFrame})`);
      }
    }

    if (job.outputPath != null && typeof job.outputPath !== 'string') {
      throw new Error(`Job ${job.id}: outputPath must be a string`);
    }

    const fps = job.params['fps'];
    if (fps != null && (typeof fps !== 'number' || fps <= 0 || fps > 240)) {
      throw new Error(`Job ${job.id}: fps must be a positive number <= 240, got ${String(fps)}`);
    }

    const threads = job.params['threads'];
    if (threads != null && (typeof threads !== 'number' || threads < 0)) {
      throw new Error(`Job ${job.id}: threads must be a non-negative number, got ${String(threads)}`);
    }
  }

  // ── FFmpeg Execution ────────────────────────────────────────────────

  /**
   * Execute FFmpeg with the given arguments, handling progress parsing
   * and timeout.
   */
  private executeFFmpeg(
    args: string[],
    totalFrames: number,
    onProgress?: (progress: RenderProgress) => void,
  ): Promise<string | null> {
    return new Promise<string | null>((resolve, reject) => {
      let proc: ChildProcess;
      try {
        proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (err) {
        reject(new Error(`Failed to spawn FFmpeg: ${(err as Error).message}`));
        return;
      }

      this.childProcess = proc;
      let stderrBuf = '';

      // Timeout handling
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
      if (this.config.timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
          this.cancel();
          reject(new Error(`Render timed out after ${this.config.timeoutMs}ms`));
        }, this.config.timeoutMs);
      }

      proc.stderr?.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString();
        const lines = stderrBuf.split('\n');
        stderrBuf = lines.pop() ?? '';

        for (const line of lines) {
          const progress = this.parseProgress(line, totalFrames);
          if (progress && onProgress) {
            onProgress(progress);
          }
        }
      });

      proc.on('close', (code) => {
        this.childProcess = null;
        if (timeoutTimer) clearTimeout(timeoutTimer);

        if (this.cancelled) {
          reject(new Error('Render job cancelled'));
        } else if (code !== 0) {
          reject(new Error(`FFmpeg render exited with code ${code}`));
        } else {
          resolve(null);
        }
      });

      proc.on('error', (err) => {
        this.childProcess = null;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
      });
    });
  }

  // ── Temp File Cleanup ───────────────────────────────────────────────

  /** Remove a partially-written output file on error. */
  private cleanupTempFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[RenderWorker] Cleaned up temp file: ${filePath}`);
      }
    } catch (err) {
      console.error(`[RenderWorker] Failed to clean up temp file ${filePath}:`, (err as Error).message);
    }
    this.currentOutputPath = null;
  }

  // ── FFmpeg Argument Builder ─────────────────────────────────────────

  /**
   * Build the complete FFmpeg argument list for a render job.
   */
  private buildFFmpegArgs(
    job: WorkerJob,
    encoder: string,
    config: CodecConfig,
    outputPath: string,
    fps: number,
  ): string[] {
    const args: string[] = ['-y'];

    // Hardware decode acceleration input flags
    const hwAccel = job.params['hwAccel'] as string | undefined;
    if (hwAccel === 'nvenc') {
      args.push('-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda');
    } else if (hwAccel === 'videotoolbox') {
      args.push('-hwaccel', 'videotoolbox');
    } else if (hwAccel === 'vaapi') {
      args.push('-hwaccel', 'vaapi', '-hwaccel_device', '/dev/dri/renderD128');
    }

    // Frame-accurate seeking with segment in/out points
    if (job.startFrame != null && job.startFrame > 0) {
      const startSec = job.startFrame / fps;
      args.push('-ss', startSec.toFixed(6));
    }

    args.push('-i', job.inputUrl);

    // Duration limit from frame range
    if (job.startFrame != null && job.endFrame != null && job.endFrame > job.startFrame) {
      const durationSec = (job.endFrame - job.startFrame) / fps;
      args.push('-t', durationSec.toFixed(6));
    }

    // Video encoding options
    args.push('-c:v', encoder);
    args.push('-pix_fmt', config.pixFmt);
    args.push(...config.args);

    // Apply custom params if provided
    if (job.params['videoBitrate']) {
      args.push('-b:v', String(job.params['videoBitrate']));
    }
    if (job.params['maxRate']) {
      args.push('-maxrate', String(job.params['maxRate']));
      args.push('-bufsize', String(job.params['bufSize'] ?? job.params['maxRate']));
    }
    if (job.params['resolution']) {
      args.push('-s', String(job.params['resolution']));
    }

    // Audio encoding
    const audioCodec = (job.params['audioCodec'] as string | undefined) ?? 'aac';
    if (audioCodec === 'copy') {
      args.push('-c:a', 'copy');
    } else if (audioCodec === 'none') {
      args.push('-an');
    } else {
      args.push('-c:a', audioCodec);
      if (job.params['audioBitrate']) {
        args.push('-b:a', String(job.params['audioBitrate']));
      }
    }

    // Thread control
    const threads = (job.params['threads'] as number | undefined) ?? 0; // 0 = auto
    if (threads > 0) {
      args.push('-threads', String(threads));
    }

    // LUT / color space transform
    if (job.params['lut']) {
      args.push('-vf', `lut3d=${job.params['lut']}`);
    }

    args.push('-progress', 'pipe:2');
    args.push(outputPath);

    return args;
  }

  // ── Progress Parsing ────────────────────────────────────────────────

  /**
   * Parse a single FFmpeg stderr line for progress information.
   */
  private parseProgress(line: string, totalFrames: number): RenderProgress | null {
    const match = line.match(PROGRESS_REGEX);
    if (!match) return null;

    const frame = parseInt(match[1]!, 10);
    const fps = parseFloat(match[2]!);
    const time = match[3]!;
    const bitrate = match[4]!;

    const speedMatch = line.match(SPEED_REGEX);
    const speed = speedMatch?.[1] ?? '0x';

    let percent = 0;
    if (totalFrames > 0) {
      percent = Math.min(100, (frame / totalFrames) * 100);
    }

    // Estimate remaining time
    const elapsedMs = Date.now() - this.startTime;
    let estimatedRemainingSec = 0;
    if (percent > 0 && elapsedMs > 0) {
      const totalEstimatedMs = (elapsedMs / percent) * 100;
      estimatedRemainingSec = Math.max(0, (totalEstimatedMs - elapsedMs) / 1000);
    }

    return {
      frame,
      fps,
      time,
      bitrate,
      percent: Math.round(percent * 100) / 100,
      speed,
      estimatedRemainingSec: Math.round(estimatedRemainingSec),
    };
  }

  // ── Utility ─────────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
