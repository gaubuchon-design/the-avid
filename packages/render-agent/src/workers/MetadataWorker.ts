/**
 * MetadataWorker — extracts media metadata via FFprobe and detects scene changes.
 *
 * Capabilities:
 * - Full FFprobe metadata extraction (JSON output)
 * - Scene detection via FFmpeg select filter
 * - Technical QC: resolution, codec, fps, color space validation
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type { WorkerJob } from '../index.js';

/** Progress data for metadata extraction jobs. */
export interface MetadataProgress {
  stage: 'probing' | 'scenes' | 'qc' | 'complete';
  percent: number;
  message: string;
}

/** Scene change detection result. */
export interface SceneChange {
  timestamp: number;
  frame: number;
  score: number;
}

/** Technical QC check results. */
export interface TechnicalQC {
  resolution: string;
  codec: string;
  fps: number;
  colorSpace: string;
  colorRange: string;
  bitDepth: number;
  duration: number;
  fileSize: number;
  hasAudio: boolean;
  audioCodec: string | null;
  sampleRate: number | null;
  channels: number | null;
  warnings: string[];
}

/** Combined metadata result. */
export interface MetadataResult {
  probe: Record<string, any>;
  scenes: SceneChange[];
  qc: TechnicalQC;
}

export class MetadataWorker {
  private process: ChildProcess | null = null;
  private cancelled = false;

  /**
   * Process a metadata extraction job.
   *
   * @param job - The worker job describing the input file.
   * @param onProgress - Optional progress callback.
   * @returns Full metadata result including probe data, scene list, and QC.
   */
  async process(
    job: WorkerJob,
    onProgress?: (progress: MetadataProgress) => void,
  ): Promise<MetadataResult> {
    this.cancelled = false;

    // Step 1: FFprobe full metadata
    onProgress?.({ stage: 'probing', percent: 0, message: 'Extracting metadata with FFprobe...' });
    const probe = await this.runFFprobe(job.inputUrl);
    if (this.cancelled) throw new Error('Metadata job cancelled');
    onProgress?.({ stage: 'probing', percent: 30, message: 'Probe complete' });

    // Step 2: Scene detection (optional, controlled by params)
    let scenes: SceneChange[] = [];
    const sceneThreshold = job.params.sceneThreshold ?? 0.3;
    const skipScenes = job.params.skipSceneDetection === true;

    if (!skipScenes) {
      onProgress?.({ stage: 'scenes', percent: 35, message: 'Detecting scene changes...' });
      scenes = await this.detectScenes(job.inputUrl, sceneThreshold);
      if (this.cancelled) throw new Error('Metadata job cancelled');
      onProgress?.({ stage: 'scenes', percent: 70, message: `Found ${scenes.length} scene changes` });
    }

    // Step 3: Technical QC
    onProgress?.({ stage: 'qc', percent: 75, message: 'Running technical QC...' });
    const qc = this.buildTechnicalQC(probe);
    onProgress?.({ stage: 'complete', percent: 100, message: 'Metadata extraction complete' });

    return { probe, scenes, qc };
  }

  /** Cancel the currently running metadata extraction. */
  cancel(): void {
    this.cancelled = true;
    if (this.process) {
      this.process.kill('SIGTERM');
    }
  }

  /**
   * Run FFprobe on the input file and return the full JSON output.
   */
  private runFFprobe(inputPath: string): Promise<Record<string, any>> {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      inputPath,
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      this.process = proc;

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      proc.on('close', (code) => {
        this.process = null;
        if (this.cancelled) {
          reject(new Error('FFprobe cancelled'));
        } else if (code !== 0) {
          reject(new Error(`FFprobe failed (code ${code}): ${stderr.slice(0, 500)}`));
        } else {
          try {
            resolve(JSON.parse(stdout));
          } catch {
            reject(new Error('Failed to parse FFprobe JSON output'));
          }
        }
      });

      proc.on('error', (err) => {
        this.process = null;
        reject(new Error(`Failed to spawn FFprobe: ${err.message}`));
      });
    });
  }

  /**
   * Detect scene changes using FFmpeg select filter.
   *
   * Uses: ffmpeg -i input -vf "select=gt(scene,threshold),showinfo" -f null -
   * Parses showinfo output for pts_time and scene score.
   */
  private detectScenes(inputPath: string, threshold: number): Promise<SceneChange[]> {
    const args = [
      '-i', inputPath,
      '-vf', `select='gt(scene,${threshold})',showinfo`,
      '-f', 'null',
      '-',
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
      this.process = proc;

      let stderr = '';
      proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      proc.on('close', (code) => {
        this.process = null;
        if (this.cancelled) {
          reject(new Error('Scene detection cancelled'));
          return;
        }

        // FFmpeg returns non-zero with -f null sometimes; parse what we have
        const scenes: SceneChange[] = [];
        const lines = stderr.split('\n');
        let frameIndex = 0;

        for (const line of lines) {
          // showinfo output: [Parsed_showinfo_1 ...] n: 42 pts: 123456 pts_time:5.1234 ...
          const ptsMatch = line.match(/pts_time:\s*([\d.]+)/);
          if (ptsMatch) {
            const timestamp = parseFloat(ptsMatch[1]);
            const nMatch = line.match(/n:\s*(\d+)/);
            const frame = nMatch ? parseInt(nMatch[1], 10) : frameIndex;

            // Extract scene score from the select filter metadata if available
            const scoreMatch = line.match(/scene_score=\s*([\d.]+)/);
            const score = scoreMatch ? parseFloat(scoreMatch[1]) : threshold;

            scenes.push({ timestamp, frame, score });
            frameIndex++;
          }
        }

        resolve(scenes);
      });

      proc.on('error', (err) => {
        this.process = null;
        reject(new Error(`Failed to spawn FFmpeg for scene detection: ${err.message}`));
      });
    });
  }

  /**
   * Build a TechnicalQC report from the FFprobe JSON output.
   */
  private buildTechnicalQC(probe: Record<string, any>): TechnicalQC {
    const streams: any[] = probe.streams ?? [];
    const format = probe.format ?? {};

    const videoStream = streams.find((s: any) => s.codec_type === 'video');
    const audioStream = streams.find((s: any) => s.codec_type === 'audio');

    const warnings: string[] = [];

    // Parse FPS from r_frame_rate (e.g. "24000/1001")
    let fps = 0;
    if (videoStream?.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
      fps = den ? num / den : num;
    }

    // Resolution checks
    const width = videoStream?.width ?? 0;
    const height = videoStream?.height ?? 0;
    if (width < 1920 || height < 1080) {
      warnings.push(`Resolution below 1080p: ${width}x${height}`);
    }

    // Codec warnings
    const codec = videoStream?.codec_name ?? 'unknown';
    if (codec === 'mjpeg') {
      warnings.push('MJPEG codec detected — may not be suitable for editing');
    }

    // Color space
    const colorSpace = videoStream?.color_space ?? 'unknown';
    const colorRange = videoStream?.color_range ?? 'unknown';
    if (colorRange === 'pc' || colorRange === 'full') {
      warnings.push('Full-range color detected — ensure correct levels mapping');
    }

    // Bit depth
    const bitDepth = videoStream?.bits_per_raw_sample
      ? parseInt(videoStream.bits_per_raw_sample, 10)
      : 8;

    return {
      resolution: `${width}x${height}`,
      codec,
      fps: Math.round(fps * 100) / 100,
      colorSpace,
      colorRange,
      bitDepth,
      duration: parseFloat(format.duration ?? '0'),
      fileSize: parseInt(format.size ?? '0', 10),
      hasAudio: !!audioStream,
      audioCodec: audioStream?.codec_name ?? null,
      sampleRate: audioStream?.sample_rate ? parseInt(audioStream.sample_rate, 10) : null,
      channels: audioStream?.channels ?? null,
      warnings,
    };
  }
}
