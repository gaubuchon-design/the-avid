/**
 * RenderWorker — main FFmpeg encoding worker for the render farm.
 *
 * Supports all major codecs (H.264, H.265, ProRes, DNxHD/DNxHR, AV1, VP9),
 * segment-based encoding with frame-accurate in/out points,
 * hardware acceleration detection (NVENC, VideoToolbox, VAAPI),
 * and real-time progress parsing from FFmpeg stderr.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import type { WorkerJob } from '../index.js';

/** FFmpeg progress data parsed from stderr output. */
export interface RenderProgress {
  frame: number;
  fps: number;
  time: string;
  bitrate: string;
  percent: number;
  speed: string;
  estimatedRemainingSec: number;
}

/** Codec configuration presets. */
interface CodecConfig {
  encoder: string;
  pixFmt: string;
  container: string;
  args: string[];
}

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

/** Progress regex matching FFmpeg stderr output. */
const PROGRESS_REGEX = /frame=\s*(\d+).*fps=\s*([\d.]+).*time=(\S+).*bitrate=\s*(\S+)/;
const SPEED_REGEX = /speed=\s*([\d.]+x)/;

export class RenderWorker {
  private process: ChildProcess | null = null;
  private cancelled = false;
  private startTime = 0;

  /**
   * Process a render/encode job.
   *
   * @param job - The worker job describing input, output, codec, and frame range.
   * @param onProgress - Callback fired as FFmpeg reports encoding progress.
   * @returns Path to the rendered output file.
   */
  async process(
    job: WorkerJob,
    onProgress?: (progress: RenderProgress) => void,
  ): Promise<string> {
    this.cancelled = false;
    this.startTime = Date.now();

    const codecKey = job.codec ?? job.params.codec ?? 'h264';
    const config = CODEC_CONFIGS[codecKey];
    if (!config) {
      throw new Error(`Unsupported codec: ${codecKey}. Available: ${Object.keys(CODEC_CONFIGS).join(', ')}`);
    }

    // Determine encoder — use HW acceleration if requested and available
    let encoder = config.encoder;
    const hwAccel = job.params.hwAccel as string | undefined;
    if (hwAccel && HW_ENCODERS[hwAccel]) {
      const baseCodec = codecKey.split('-')[0]; // e.g. "prores-422" -> "prores"
      const hwEncoder = HW_ENCODERS[hwAccel][baseCodec];
      if (hwEncoder) {
        encoder = hwEncoder;
      }
    }

    // Build output path
    const outputPath =
      job.outputPath ??
      path.join(
        path.dirname(job.inputUrl),
        `${path.basename(job.inputUrl, path.extname(job.inputUrl))}_render.${config.container}`,
      );

    // Calculate total frames for progress
    const totalFrames = (job.endFrame && job.startFrame != null)
      ? job.endFrame - job.startFrame
      : (job.params.totalFrames ?? 0);

    const fps = job.params.fps ?? 24;

    // Build FFmpeg arguments
    const args = this.buildFFmpegArgs(job, encoder, config, outputPath, fps);

    return new Promise<string>((resolve, reject) => {
      const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      this.process = proc;

      let stderrBuf = '';

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
        this.process = null;
        if (this.cancelled) {
          reject(new Error('Render job cancelled'));
        } else if (code !== 0) {
          reject(new Error(`FFmpeg render exited with code ${code}`));
        } else {
          resolve(outputPath);
        }
      });

      proc.on('error', (err) => {
        this.process = null;
        reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
      });
    });
  }

  /** Cancel the currently running render process. */
  cancel(): void {
    this.cancelled = true;
    if (this.process) {
      this.process.kill('SIGTERM');
      const pid = this.process.pid;
      setTimeout(() => {
        try {
          if (pid) process.kill(pid, 0);
          this.process?.kill('SIGKILL');
        } catch {
          // Already dead
        }
      }, 5000);
    }
  }

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
    const hwAccel = job.params.hwAccel as string | undefined;
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
    if (job.params.videoBitrate) {
      args.push('-b:v', String(job.params.videoBitrate));
    }
    if (job.params.maxRate) {
      args.push('-maxrate', String(job.params.maxRate));
      args.push('-bufsize', String(job.params.bufSize ?? job.params.maxRate));
    }
    if (job.params.resolution) {
      args.push('-s', String(job.params.resolution));
    }

    // Audio encoding
    const audioCodec = job.params.audioCodec ?? 'aac';
    if (audioCodec === 'copy') {
      args.push('-c:a', 'copy');
    } else if (audioCodec === 'none') {
      args.push('-an');
    } else {
      args.push('-c:a', audioCodec);
      if (job.params.audioBitrate) {
        args.push('-b:a', String(job.params.audioBitrate));
      }
    }

    // Thread control
    const threads = job.params.threads ?? 0; // 0 = auto
    if (threads > 0) {
      args.push('-threads', String(threads));
    }

    // LUT / color space transform
    if (job.params.lut) {
      args.push('-vf', `lut3d=${job.params.lut}`);
    }

    args.push('-progress', 'pipe:2');
    args.push(outputPath);

    return args;
  }

  /**
   * Parse a single FFmpeg stderr line for progress information.
   */
  private parseProgress(line: string, totalFrames: number): RenderProgress | null {
    const match = line.match(PROGRESS_REGEX);
    if (!match) return null;

    const frame = parseInt(match[1], 10);
    const fps = parseFloat(match[2]);
    const time = match[3];
    const bitrate = match[4];

    const speedMatch = line.match(SPEED_REGEX);
    const speed = speedMatch ? speedMatch[1] : '0x';

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
}
