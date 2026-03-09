/**
 * @module capabilities/metadata-extraction
 *
 * Media metadata extraction pipeline.  Uses `fs.stat` for file size and
 * returns mock values for media-specific properties (duration, codec,
 * resolution, etc.) since real extraction would require ffprobe or a
 * similar native tool.
 */

import { stat } from 'node:fs/promises';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Media metadata extracted from a file. */
export interface MediaMetadata {
  /** Duration in seconds (for audio / video). */
  readonly duration?: number;
  /** Container format (e.g. "mp4", "mov", "wav"). */
  readonly format?: string;
  /** Primary codec (e.g. "h264", "prores", "aac"). */
  readonly codec?: string;
  /** Video resolution. */
  readonly resolution?: { readonly width: number; readonly height: number };
  /** Video frame rate in fps. */
  readonly frameRate?: number;
  /** Audio sample rate in Hz. */
  readonly sampleRate?: number;
  /** Number of audio channels. */
  readonly channels?: number;
  /** File size in bytes. */
  readonly fileSize: number;
}

// ---------------------------------------------------------------------------
// Format detection (basic, extension-based)
// ---------------------------------------------------------------------------

const VIDEO_EXTENSIONS: Record<string, { codec: string; format: string }> = {
  '.mp4': { codec: 'h264', format: 'mp4' },
  '.mov': { codec: 'prores', format: 'mov' },
  '.mxf': { codec: 'xdcam', format: 'mxf' },
  '.avi': { codec: 'mpeg4', format: 'avi' },
  '.mkv': { codec: 'h265', format: 'mkv' },
  '.webm': { codec: 'vp9', format: 'webm' },
};

const AUDIO_EXTENSIONS: Record<string, { codec: string; format: string }> = {
  '.wav': { codec: 'pcm_s16le', format: 'wav' },
  '.mp3': { codec: 'mp3', format: 'mp3' },
  '.aac': { codec: 'aac', format: 'aac' },
  '.flac': { codec: 'flac', format: 'flac' },
  '.ogg': { codec: 'vorbis', format: 'ogg' },
};

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Extract metadata from a media file.
 *
 * Currently uses `fs.stat` for the real file size and infers format / codec
 * from the file extension.  Duration, resolution, frame rate, sample rate,
 * and channel count are populated with reasonable mock values.  In a future
 * phase these will be replaced with real ffprobe output.
 *
 * @param filePath - Absolute path to the media file.
 * @returns Extracted (and partially mocked) metadata.
 * @throws if the file does not exist.
 */
export async function extractMetadata(filePath: string): Promise<MediaMetadata> {
  const stats = await stat(filePath);
  const ext = extname(filePath).toLowerCase();

  const videoInfo = VIDEO_EXTENSIONS[ext];
  const audioInfo = AUDIO_EXTENSIONS[ext];

  if (videoInfo) {
    return {
      duration: mockDuration(stats.size),
      format: videoInfo.format,
      codec: videoInfo.codec,
      resolution: { width: 1920, height: 1080 },
      frameRate: 23.976,
      sampleRate: 48000,
      channels: 2,
      fileSize: stats.size,
    };
  }

  if (audioInfo) {
    return {
      duration: mockDuration(stats.size),
      format: audioInfo.format,
      codec: audioInfo.codec,
      sampleRate: 48000,
      channels: 2,
      fileSize: stats.size,
    };
  }

  // Unknown type — return bare minimum
  return { fileSize: stats.size };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Guess duration from file size (very rough heuristic). */
function mockDuration(sizeBytes: number): number {
  // Assume ~2 MB/s for a typical 1080p H.264 file
  const bytesPerSecond = 2 * 1024 * 1024;
  return Math.max(1, Math.round((sizeBytes / bytesPerSecond) * 100) / 100);
}

/** Extract file extension (including the dot). */
function extname(filePath: string): string {
  const dot = filePath.lastIndexOf('.');
  return dot === -1 ? '' : filePath.slice(dot);
}
