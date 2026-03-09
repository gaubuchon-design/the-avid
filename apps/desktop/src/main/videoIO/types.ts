// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Professional Video I/O Types
// ═══════════════════════════════════════════════════════════════════════════

/** Pixel format identifiers matching Blackmagic/AJA SDK constants */
export type PixelFormat =
  | '8BitYUV'    // UYVY 4:2:2
  | '10BitYUV'   // v210 4:2:2
  | '8BitBGRA'   // BGRA 4:4:4:4
  | '10BitRGB'   // r210
  | '12BitRGB';  // R12B

/** Display mode for a video device */
export interface DisplayMode {
  id: string;
  name: string;
  width: number;
  height: number;
  frameRateNum: number;
  frameRateDen: number;
  interlaced: boolean;
  pixelFormats: PixelFormat[];
}

/** Information about a detected video I/O device */
export interface VideoDevice {
  id: string;
  name: string;
  vendor: 'blackmagic' | 'aja' | 'unknown';
  model: string;
  index: number;
  supportsCapture: boolean;
  supportsPlayback: boolean;
  displayModes: DisplayMode[];
  isActive: boolean;
}

/** Configuration for starting a capture session */
export interface CaptureConfig {
  deviceId: string;
  displayModeId: string;
  pixelFormat: PixelFormat;
  audioChannels: number;     // 2, 8, or 16
  audioBitDepth: 16 | 24 | 32;
  enableTimecodeCapture: boolean;
}

/** Configuration for starting a playback session */
export interface PlaybackConfig {
  deviceId: string;
  displayModeId: string;
  pixelFormat: PixelFormat;
  audioChannels: number;
  audioBitDepth: 16 | 24 | 32;
}

/** A captured video frame from a device */
export interface CapturedFrame {
  width: number;
  height: number;
  pixelFormat: PixelFormat;
  bytesPerRow: number;
  timecode: string;           // HH:MM:SS:FF
  frameNumber: number;
  timestamp: number;          // high-resolution timestamp (ms)
  videoData: SharedArrayBuffer | ArrayBuffer;
  audioData?: ArrayBuffer;
  audioChannels?: number;
  audioSampleRate?: number;
  dropFrame: boolean;
}

/** Status of a video I/O device */
export interface DeviceStatus {
  deviceId: string;
  state: 'idle' | 'capturing' | 'playing' | 'error';
  signalDetected: boolean;
  detectedMode?: string;
  framesProcessed: number;
  droppedFrames: number;
  errorMessage?: string;
}

/** Result wrapper for IPC responses */
export interface IOResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

/** Bytes per pixel for each pixel format */
export const BYTES_PER_PIXEL: Record<PixelFormat, number> = {
  '8BitYUV': 2,      // UYVY packed
  '10BitYUV': 2.667,  // v210 is 128 bits per 6 pixels, ~2.667 avg
  '8BitBGRA': 4,
  '10BitRGB': 4,
  '12BitRGB': 4.5,
};

/** Calculate frame buffer size in bytes */
export function calculateFrameSize(
  width: number,
  height: number,
  pixelFormat: PixelFormat,
): number {
  if (pixelFormat === '10BitYUV') {
    // v210: 128 bits per 6 pixels, rows aligned to 128 bytes
    const pixelGroups = Math.ceil(width / 6);
    const bytesPerRow = pixelGroups * 16;
    const alignedBytesPerRow = Math.ceil(bytesPerRow / 128) * 128;
    return alignedBytesPerRow * height;
  }
  return Math.ceil(width * BYTES_PER_PIXEL[pixelFormat]) * height;
}
