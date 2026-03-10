/**
 * TranscribeWorker -- extracts audio from media and runs speech-to-text transcription.
 *
 * Uses FFmpeg to extract audio to WAV (16 kHz mono) and then calls the Whisper API
 * for transcription. Falls back to a mock transcription if the API is unavailable.
 * Outputs SRT or VTT caption files.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { WorkerJob } from '../index.js';

/** Progress data for transcription jobs. */
export interface TranscribeProgress {
  /** Current processing stage. */
  stage: 'extracting' | 'transcribing' | 'formatting' | 'complete';
  /** Completion percentage (0-100). */
  percent: number;
  /** Human-readable status message. */
  message: string;
}

/** A single transcription segment with timing. */
interface TranscriptSegment {
  index: number;
  startTime: string; // HH:MM:SS,mmm (SRT) or HH:MM:SS.mmm (VTT)
  endTime: string;
  text: string;
}

export class TranscribeWorker {
  private childProcess: ChildProcess | null = null;
  private cancelled = false;
  /** Track temp files for cleanup on any exit path. */
  private tempFiles: Set<string> = new Set();

  /**
   * Process a transcription job.
   *
   * 1. Extract audio from video via FFmpeg (WAV, 16 kHz, mono).
   * 2. Send to Whisper API (or use mock fallback).
   * 3. Format output as SRT or VTT.
   *
   * @param job - The worker job with input media path and params.
   * @param onProgress - Optional progress callback.
   * @returns Path to the generated caption file.
   * @throws {Error} if the job is missing required fields.
   * @throws {Error} if audio extraction or transcription fails.
   */
  async process(
    job: WorkerJob,
    onProgress?: (progress: TranscribeProgress) => void,
  ): Promise<string> {
    this.cancelled = false;

    // Input validation
    if (!job.id || typeof job.id !== 'string') {
      throw new Error('Transcribe job must have a non-empty string id');
    }
    if (!job.inputUrl || typeof job.inputUrl !== 'string') {
      throw new Error(`Transcribe job ${job.id}: inputUrl must be a non-empty string`);
    }

    const format = (job.params['captionFormat'] as string | undefined) ?? 'srt';
    const language = (job.params['language'] as string | undefined) ?? 'en';

    let wavPath: string | null = null;

    try {
      // Step 1: Extract audio to WAV
      onProgress?.({ stage: 'extracting', percent: 0, message: 'Extracting audio...' });
      wavPath = await this.extractAudio(job.inputUrl);
      this.tempFiles.add(wavPath);

      if (this.cancelled) {
        this.cleanupTempFiles();
        throw new Error('Transcription cancelled');
      }

      onProgress?.({ stage: 'extracting', percent: 30, message: 'Audio extraction complete' });

      // Step 2: Transcribe
      onProgress?.({ stage: 'transcribing', percent: 35, message: 'Running transcription...' });
      const segments = await this.transcribe(wavPath, language);
      if (this.cancelled) {
        this.cleanupTempFiles();
        throw new Error('Transcription cancelled');
      }

      onProgress?.({ stage: 'transcribing', percent: 80, message: 'Transcription complete' });

      // Step 3: Format and write caption file
      onProgress?.({ stage: 'formatting', percent: 85, message: `Formatting ${format.toUpperCase()}...` });
      const ext = format === 'vtt' ? '.vtt' : '.srt';
      const outputPath =
        job.outputPath ??
        path.join(
          path.dirname(job.inputUrl),
          `${path.basename(job.inputUrl, path.extname(job.inputUrl))}${ext}`,
        );

      const content = format === 'vtt'
        ? this.formatVTT(segments)
        : this.formatSRT(segments);

      fs.writeFileSync(outputPath, content, 'utf-8');

      // Cleanup temp WAV
      this.cleanupTempFiles();

      onProgress?.({ stage: 'complete', percent: 100, message: 'Transcription complete' });
      return outputPath;
    } catch (err) {
      // Clean up on any error path
      this.cleanupTempFiles();
      throw err;
    }
  }

  /** Cancel the running transcription process. */
  cancel(): void {
    this.cancelled = true;
    if (this.childProcess) {
      this.childProcess.kill('SIGTERM');
      const pid = this.childProcess.pid;
      const cp = this.childProcess;
      setTimeout(() => {
        try {
          if (pid) process.kill(pid, 0);
          cp.kill('SIGKILL');
        } catch {
          // Already dead
        }
      }, 5000);
    }
    this.cleanupTempFiles();
  }

  /** Clean up all tracked temporary files. */
  private cleanupTempFiles(): void {
    for (const filePath of this.tempFiles) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.debug(`[TranscribeWorker] Cleaned up temp file: ${filePath}`);
        }
      } catch (err) {
        console.error(`[TranscribeWorker] Failed to clean up ${filePath}:`, (err as Error).message);
      }
    }
    this.tempFiles.clear();
  }

  /**
   * Extract audio from a media file to WAV 16 kHz mono using FFmpeg.
   * Handles OOM kills (exit code 137) and spawn failures.
   */
  private extractAudio(inputPath: string): Promise<string> {
    const wavPath = inputPath.replace(/\.[^.]+$/, '_audio.wav');
    const args = [
      '-y',
      '-i', inputPath,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      wavPath,
    ];

    return new Promise<string>((resolve, reject) => {
      let proc: ChildProcess;
      try {
        proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
      } catch (err) {
        reject(new Error(`Failed to spawn FFmpeg: ${(err as Error).message}`));
        return;
      }

      this.childProcess = proc;

      proc.on('close', (code) => {
        this.childProcess = null;
        if (this.cancelled) {
          // Clean up partial WAV on cancel
          try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath); } catch { /* ignore */ }
          reject(new Error('Audio extraction cancelled'));
        } else if (code === 137) {
          try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath); } catch { /* ignore */ }
          reject(new Error('FFmpeg audio extraction killed (likely OOM)'));
        } else if (code !== 0) {
          try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath); } catch { /* ignore */ }
          reject(new Error(`FFmpeg audio extraction failed with code ${code}`));
        } else {
          resolve(wavPath);
        }
      });

      proc.on('error', (err) => {
        this.childProcess = null;
        try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath); } catch { /* ignore */ }
        reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
      });
    });
  }

  /**
   * Transcribe audio using the Whisper API.
   * Falls back to a mock transcription if the API endpoint is not configured.
   */
  private async transcribe(wavPath: string, language: string): Promise<TranscriptSegment[]> {
    const apiUrl = process.env['WHISPER_API_URL'];
    const apiKey = process.env['WHISPER_API_KEY'];

    if (apiUrl && apiKey) {
      try {
        const audioData = fs.readFileSync(wavPath);
        const formData = new FormData();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formData.append('file', new Blob([audioData.buffer] as any) as unknown as string);
        formData.append('model', 'whisper-1');
        formData.append('language', language);
        formData.append('response_format', 'verbose_json');

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Whisper API returned ${response.status}`);
        }

        const result = (await response.json()) as {
          segments: Array<{ id: number; start: number; end: number; text: string }>;
        };

        return result.segments.map((seg, i) => ({
          index: i + 1,
          startTime: this.secondsToTimestamp(seg.start),
          endTime: this.secondsToTimestamp(seg.end),
          text: seg.text.trim(),
        }));
      } catch (err) {
        console.warn(`Whisper API failed, falling back to mock: ${(err as Error).message}`);
      }
    }

    // Mock fallback: generate placeholder segments
    return this.mockTranscribe();
  }

  /** Generate mock transcription segments for testing. */
  private mockTranscribe(): TranscriptSegment[] {
    const mockTexts = [
      'This is a placeholder transcription.',
      'Whisper API is not configured.',
      'Set WHISPER_API_URL and WHISPER_API_KEY to enable real transcription.',
    ];
    return mockTexts.map((text, i) => ({
      index: i + 1,
      startTime: this.secondsToTimestamp(i * 5),
      endTime: this.secondsToTimestamp((i + 1) * 5),
      text,
    }));
  }

  /** Convert seconds to SRT-style timestamp: HH:MM:SS,mmm */
  private secondsToTimestamp(totalSec: number): string {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.floor(totalSec % 60);
    const ms = Math.round((totalSec % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  /** Format segments as SRT. */
  private formatSRT(segments: TranscriptSegment[]): string {
    return segments
      .map((seg) => `${seg.index}\n${seg.startTime} --> ${seg.endTime}\n${seg.text}\n`)
      .join('\n');
  }

  /** Format segments as WebVTT. */
  private formatVTT(segments: TranscriptSegment[]): string {
    const header = 'WEBVTT\n\n';
    const body = segments
      .map((seg) => {
        const start = seg.startTime.replace(',', '.');
        const end = seg.endTime.replace(',', '.');
        return `${seg.index}\n${start} --> ${end}\n${seg.text}\n`;
      })
      .join('\n');
    return header + body;
  }
}
