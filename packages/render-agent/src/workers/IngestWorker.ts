/**
 * IngestWorker -- transcodes incoming media to editing-friendly formats via FFmpeg.
 *
 * Supports ProRes proxy, DNxHD LB, and H.264 proxy presets.
 * Parses FFmpeg stderr for progress reporting.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { WorkerJob } from '../index.js';

/** Preset configuration for ingest transcode targets. */
interface IngestPreset {
  codec: string;
  pixFmt: string;
  profile?: string;
  extraArgs: string[];
  extension: string;
}

const INGEST_PRESETS: Record<string, IngestPreset> = {
  'prores-proxy': {
    codec: 'prores_ks',
    pixFmt: 'yuv422p10le',
    profile: '0', // Proxy
    extraArgs: ['-vendor', 'apl0'],
    extension: '.mov',
  },
  'dnxhd-lb': {
    codec: 'dnxhd',
    pixFmt: 'yuv422p',
    extraArgs: ['-b:v', '36M'],
    extension: '.mxf',
  },
  'h264-proxy': {
    codec: 'libx264',
    pixFmt: 'yuv420p',
    extraArgs: ['-preset', 'fast', '-crf', '28', '-tune', 'fastdecode'],
    extension: '.mp4',
  },
};

/** Hardware-accelerated codec overrides keyed by hwAccel API name.
 *  Used for proxy transcode when hardware encoding is available. */
const HW_INGEST_OVERRIDES: Record<string, Partial<Record<string, { codec: string; extraArgs: string[] }>>> = {
  nvenc: {
    'h264-proxy': { codec: 'h264_nvenc', extraArgs: ['-preset', 'p1', '-tune', 'll', '-rc', 'vbr', '-cq', '28'] },
  },
  videotoolbox: {
    'h264-proxy': { codec: 'h264_videotoolbox', extraArgs: ['-realtime', '1', '-q:v', '65'] },
    'prores-proxy': { codec: 'prores_videotoolbox', extraArgs: ['-profile:v', '0'] },
  },
  amf: {
    'h264-proxy': { codec: 'h264_amf', extraArgs: ['-quality', 'speed', '-rc', 'cqp', '-qp_i', '28', '-qp_p', '28'] },
  },
  qsv: {
    'h264-proxy': { codec: 'h264_qsv', extraArgs: ['-preset', 'fast', '-global_quality', '28'] },
  },
  vaapi: {
    'h264-proxy': { codec: 'h264_vaapi', extraArgs: ['-qp', '28'] },
  },
};

/** Valid hardware acceleration names for ingest. */
const VALID_INGEST_HW_ACCEL = new Set(['nvenc', 'videotoolbox', 'amf', 'qsv', 'vaapi']);

/** Build FFmpeg decode flags for hardware-accelerated ingest. */
function buildIngestHWDecodeArgs(hwAccel: string): string[] {
  switch (hwAccel) {
    case 'nvenc':
      return ['-hwaccel', 'cuda'];
    case 'videotoolbox':
      return ['-hwaccel', 'videotoolbox'];
    case 'vaapi':
      return ['-hwaccel', 'vaapi', '-hwaccel_device', '/dev/dri/renderD128'];
    case 'amf':
      return ['-hwaccel', 'd3d11va'];
    case 'qsv':
      return ['-hwaccel', 'qsv'];
    default:
      return [];
  }
}

/** FFmpeg progress data parsed from stderr. */
export interface IngestProgress {
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
}

export class IngestWorker {
  private childProcess: ChildProcess | null = null;
  private cancelled = false;
  private currentOutputPath: string | null = null;

  /**
   * Process an ingest job -- transcode source media to an editing proxy format.
   *
   * @param job - The worker job describing input, output, and desired preset.
   * @param onProgress - Optional callback fired as FFmpeg reports progress.
   * @returns The path to the transcoded output file.
   * @throws {Error} if the job is missing required fields.
   * @throws {Error} if the preset is unknown.
   * @throws {Error} if the FFmpeg process fails.
   */
  async process(
    job: WorkerJob,
    onProgress?: (progress: IngestProgress) => void,
  ): Promise<string> {
    this.cancelled = false;

    // Input validation
    if (!job.id || typeof job.id !== 'string') {
      throw new Error('Ingest job must have a non-empty string id');
    }
    if (!job.inputUrl || typeof job.inputUrl !== 'string') {
      throw new Error(`Ingest job ${job.id}: inputUrl must be a non-empty string`);
    }

    const presetName = (job.params['preset'] as string | undefined) ?? 'h264-proxy';
    const preset = INGEST_PRESETS[presetName];
    if (!preset) {
      throw new Error(`Unknown ingest preset: ${presetName}. Available: ${Object.keys(INGEST_PRESETS).join(', ')}`);
    }

    const outputPath =
      job.outputPath ??
      path.join(
        path.dirname(job.inputUrl),
        `${path.basename(job.inputUrl, path.extname(job.inputUrl))}_proxy${preset.extension}`,
      );

    this.currentOutputPath = outputPath;

    const totalDuration = (job.params['durationSec'] as number | undefined) ?? 0;

    // Apply hardware acceleration if requested and supported
    const hwAccel = (job.params['hwAccel'] as string | undefined);
    let effectiveCodec = preset.codec;
    let effectiveExtraArgs = [...preset.extraArgs];

    if (hwAccel && VALID_INGEST_HW_ACCEL.has(hwAccel)) {
      const override = HW_INGEST_OVERRIDES[hwAccel]?.[presetName];
      if (override) {
        effectiveCodec = override.codec;
        effectiveExtraArgs = override.extraArgs;
      }
    }

    const args = [
      '-y',
      // Hardware decode acceleration (before -i)
      ...(hwAccel ? buildIngestHWDecodeArgs(hwAccel) : []),
      '-i', job.inputUrl,
      '-c:v', effectiveCodec,
      '-pix_fmt', preset.pixFmt,
      ...(preset.profile && effectiveCodec === preset.codec ? ['-profile:v', preset.profile] : []),
      ...effectiveExtraArgs,
      '-c:a', 'pcm_s16le',
      '-progress', 'pipe:2',
      outputPath,
    ];

    return new Promise<string>((resolve, reject) => {
      let proc: ChildProcess;
      try {
        proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (err) {
        this.currentOutputPath = null;
        reject(new Error(`Failed to spawn FFmpeg: ${(err as Error).message}`));
        return;
      }

      this.childProcess = proc;

      let stderrBuf = '';

      proc.stderr?.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString();
        const lines = stderrBuf.split('\n');
        stderrBuf = lines.pop() ?? '';

        for (const line of lines) {
          const progress = this.parseProgress(line, totalDuration);
          if (progress && onProgress) {
            onProgress(progress);
          }
        }
      });

      proc.on('close', (code) => {
        this.childProcess = null;
        if (this.cancelled) {
          this.cleanupPartialOutput(outputPath);
          reject(new Error('Ingest job cancelled'));
        } else if (code === 137) {
          // OOM kill
          this.cleanupPartialOutput(outputPath);
          reject(new Error(`FFmpeg ingest process killed (likely OOM) for job ${job.id}`));
        } else if (code !== 0) {
          this.cleanupPartialOutput(outputPath);
          reject(new Error(`FFmpeg ingest exited with code ${code}`));
        } else {
          // Validate output file
          try {
            const stats = fs.statSync(outputPath);
            if (stats.size === 0) {
              this.cleanupPartialOutput(outputPath);
              reject(new Error(`Ingest produced empty output file: ${outputPath}`));
              return;
            }
          } catch {
            reject(new Error(`Ingest output file not found: ${outputPath}`));
            return;
          }
          this.currentOutputPath = null;
          resolve(outputPath);
        }
      });

      proc.on('error', (err) => {
        this.childProcess = null;
        this.cleanupPartialOutput(outputPath);
        reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
      });
    });
  }

  /** Cancel the currently running ingest process. */
  cancel(): void {
    this.cancelled = true;
    if (this.childProcess) {
      this.childProcess.kill('SIGTERM');
      const pid = this.childProcess.pid;
      const cp = this.childProcess;
      setTimeout(() => {
        try {
          if (pid) process.kill(pid, 0); // Check alive
          cp.kill('SIGKILL');
        } catch {
          // Already dead -- ignore
        }
      }, 5000);
    }
    // Clean up partial output on cancel
    if (this.currentOutputPath) {
      this.cleanupPartialOutput(this.currentOutputPath);
    }
  }

  /**
   * Remove a partially written output file on error or cancellation.
   */
  private cleanupPartialOutput(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.debug(`[IngestWorker] Cleaned up partial output: ${filePath}`);
      }
    } catch (err) {
      console.error(`[IngestWorker] Failed to clean up ${filePath}:`, (err as Error).message);
    }
    this.currentOutputPath = null;
  }

  /**
   * Parse a single FFmpeg stderr line for progress information.
   *
   * Matches lines like: frame= 1234 fps= 60.0 ... time=00:01:23.45 bitrate= 5000kbits/s
   */
  private parseProgress(line: string, totalDuration: number): IngestProgress | null {
    const match = line.match(
      /frame=\s*(\d+).*fps=\s*([\d.]+).*time=(\S+).*bitrate=\s*(\S+)/,
    );
    if (!match) return null;

    const frame = parseInt(match[1]!, 10);
    const fps = parseFloat(match[2]!);
    const time = match[3]!;
    const bitrate = match[4]!;

    let percent = 0;
    if (totalDuration > 0) {
      const parts = time.split(':').map(Number);
      const currentSec = (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
      percent = Math.min(100, (currentSec / totalDuration) * 100);
    }

    return { frame, fps, time, bitrate, percent };
  }
}
