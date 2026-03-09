/**
 * IngestWorker -- transcodes incoming media to editing-friendly formats via FFmpeg.
 *
 * Supports ProRes proxy, DNxHD LB, and H.264 proxy presets.
 * Parses FFmpeg stderr for progress reporting.
 */

import { spawn, type ChildProcess } from 'node:child_process';
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

  /**
   * Process an ingest job -- transcode source media to an editing proxy format.
   *
   * @param job - The worker job describing input, output, and desired preset.
   * @param onProgress - Optional callback fired as FFmpeg reports progress.
   * @returns The path to the transcoded output file.
   */
  async process(
    job: WorkerJob,
    onProgress?: (progress: IngestProgress) => void,
  ): Promise<string> {
    this.cancelled = false;

    const presetName = (job.params['preset'] as string | undefined) ?? 'h264-proxy';
    const preset = INGEST_PRESETS[presetName];
    if (!preset) {
      throw new Error(`Unknown ingest preset: ${presetName}`);
    }

    const outputPath =
      job.outputPath ??
      path.join(
        path.dirname(job.inputUrl),
        `${path.basename(job.inputUrl, path.extname(job.inputUrl))}_proxy${preset.extension}`,
      );

    const totalDuration = (job.params['durationSec'] as number | undefined) ?? 0;

    const args = [
      '-y',
      '-i', job.inputUrl,
      '-c:v', preset.codec,
      '-pix_fmt', preset.pixFmt,
      ...(preset.profile ? ['-profile:v', preset.profile] : []),
      ...preset.extraArgs,
      '-c:a', 'pcm_s16le',
      '-progress', 'pipe:2',
      outputPath,
    ];

    return new Promise<string>((resolve, reject) => {
      const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
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
          reject(new Error('Ingest job cancelled'));
        } else if (code !== 0) {
          reject(new Error(`FFmpeg ingest exited with code ${code}`));
        } else {
          resolve(outputPath);
        }
      });

      proc.on('error', (err) => {
        this.childProcess = null;
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
      setTimeout(() => {
        try {
          if (pid) process.kill(pid, 0); // Check alive
          this.childProcess?.kill('SIGKILL');
        } catch {
          // Already dead -- ignore
        }
      }, 5000);
    }
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
