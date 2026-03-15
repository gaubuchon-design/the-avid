/**
 * @module capabilities/metadata-extraction
 *
 * Media metadata extraction pipeline.  When a CodecService is available
 * (desktop / Electron), uses FFprobe via the native N-API addon for accurate
 * metadata.  Falls back to fs.stat + extension-based inference when no
 * CodecService is set.
 */

import { stat } from 'node:fs/promises';
import type { CodecService } from '@avid/media';

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
  /** Bit depth (from native probe). */
  readonly bitDepth?: number;
  /** Color space (e.g. "bt709", "bt2020"). */
  readonly colorSpace?: string;
  /** Color transfer function (e.g. "smpte2084" for HDR PQ). */
  readonly colorTransfer?: string;
  /** Color primaries (e.g. "bt709", "bt2020"). */
  readonly colorPrimaries?: string;
  /** Video bitrate in bps. */
  readonly videoBitrate?: number;
  /** Audio bitrate in bps. */
  readonly audioBitrate?: number;
  /** Starting timecode "HH:MM:SS:FF". */
  readonly timecodeStart?: string;
  /** Reel name from source media. */
  readonly reelName?: string;
  /** Whether the source has an alpha channel. */
  readonly hasAlpha?: boolean;
  /** Audio channel layout (e.g. "5.1", "stereo"). */
  readonly channelLayout?: string;
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
// Codec service injection
// ---------------------------------------------------------------------------

let codecService: CodecService | null = null;

/**
 * Inject a CodecService for native probe (FFprobe via libavformat).
 * When set, extractMetadata returns real codec, resolution, duration,
 * timecode, color space, and bitrate data instead of mock values.
 */
export function setCodecService(service: CodecService): void {
  codecService = service;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Extract metadata from a media file.
 *
 * When a CodecService is available (desktop), probes the file with FFprobe
 * for accurate metadata including codec, color space, timecode, bit depth,
 * and channel layout.  Falls back to fs.stat + extension heuristics when
 * no native probe is available.
 *
 * @param filePath - Absolute path to the media file.
 * @returns Extracted metadata.
 * @throws if the file does not exist.
 */
export async function extractMetadata(filePath: string): Promise<MediaMetadata> {
  // Primary path: native probe via FFprobe (N-API addon)
  if (codecService) {
    try {
      const probe = await codecService.probe(filePath);
      if (probe.error === 0) {
        return {
          duration: probe.duration > 0 ? probe.duration : undefined,
          format: probe.containerFormat || undefined,
          codec: probe.videoCodec || probe.audioCodec || undefined,
          resolution: probe.width > 0 && probe.height > 0
            ? { width: probe.width, height: probe.height }
            : undefined,
          frameRate: probe.fps > 0 ? probe.fps : undefined,
          sampleRate: probe.audioSampleRate > 0 ? probe.audioSampleRate : undefined,
          channels: probe.audioChannels > 0 ? probe.audioChannels : undefined,
          fileSize: probe.fileSize > 0 ? probe.fileSize : (await stat(filePath)).size,
          bitDepth: probe.bitDepth > 0 ? probe.bitDepth : undefined,
          colorSpace: probe.colorSpace || undefined,
          colorTransfer: probe.colorTransfer || undefined,
          colorPrimaries: probe.colorPrimaries || undefined,
          videoBitrate: probe.videoBitrate > 0 ? probe.videoBitrate : undefined,
          audioBitrate: probe.audioBitrate > 0 ? probe.audioBitrate : undefined,
          timecodeStart: probe.timecodeStart || undefined,
          reelName: probe.reelName || undefined,
          hasAlpha: probe.hasAlpha,
          channelLayout: probe.channelLayout || undefined,
        };
      }
    } catch {
      // Fall through to extension-based detection
    }
  }

  // Fallback: fs.stat + extension heuristics
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
