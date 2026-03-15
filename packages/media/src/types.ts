// =============================================================================
//  THE AVID — Media Codec Service Types
//  Shared type definitions for the codec service abstraction layer.
//  Used by both BrowserCodecService (web) and NativeCodecService (desktop).
// =============================================================================

// ─── Pixel Formats ──────────────────────────────────────────────────────────

/** Pixel format for decoded/encoded frame data. */
export enum PixelFormat {
  RGBA8 = 0,          // 8-bit RGBA (default for display)
  BGRA8 = 1,          // 8-bit BGRA (Windows native)
  RGB8 = 2,           // 8-bit RGB (no alpha)
  YUV420P = 3,        // YUV 4:2:0 planar
  YUV422P = 4,        // YUV 4:2:2 planar
  YUV444P = 5,        // YUV 4:4:4 planar
  YUV420P10 = 6,      // YUV 4:2:0 10-bit
  YUV422P10 = 7,      // YUV 4:2:2 10-bit
  RGBA16 = 8,         // 16-bit RGBA (HDR intermediary)
  RGBAF32 = 9,        // 32-bit float RGBA (EXR native)
  RGBAF16 = 10,       // 16-bit half-float RGBA (EXR half)
  NV12 = 11,          // NV12 (HW accel common)
  P010 = 12,          // P010 10-bit (HW accel HDR)
}

// ─── Hardware Acceleration ──────────────────────────────────────────────────

/** Hardware acceleration backend. */
export enum HWAccelType {
  NONE = 0,
  VIDEOTOOLBOX = 1,    // macOS
  NVDEC = 2,           // NVIDIA decode
  NVENC = 3,           // NVIDIA encode
  VAAPI = 4,           // Linux VA-API
  VDPAU = 5,           // Linux VDPAU
  D3D11VA = 6,         // Windows Direct3D 11
  DXVA2 = 7,           // Windows DXVA2
  QSV = 8,             // Intel Quick Sync
  AMF = 9,             // AMD AMF (encode)
  CUDA = 10,           // NVIDIA CUDA
  METAL = 11,          // Apple Metal
  OPENCL = 12,         // OpenCL
  WEBCODECS = 100,     // Browser WebCodecs (web-only)
}

// ─── Probe Result ───────────────────────────────────────────────────────────

/** Complete media file probe result. */
export interface ProbeResult {
  // Video
  videoCodec: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  bitDepth: number;
  hasAlpha: boolean;
  pixelFormat: string;
  colorSpace: string;
  colorTransfer: string;
  colorPrimaries: string;
  videoBitrate: number;

  // Audio
  audioCodec: string;
  audioChannels: number;
  audioSampleRate: number;
  audioBitDepth: number;
  audioBitrate: number;
  channelLayout: string;

  // Container
  containerFormat: string;
  fileSize: number;
  numVideoStreams: number;
  numAudioStreams: number;
  numSubtitleStreams: number;

  // Timecode
  timecodeStart: string;
  reelName: string;

  // HW acceleration
  hwDecodeAvailable: boolean;
  hwDecodeType: HWAccelType;

  // Error
  error: number;
  errorMessage: string;
}

// ─── Decoded Frame ──────────────────────────────────────────────────────────

/** A decoded video frame with raw pixel data. */
export interface DecodedFrameData {
  /** Raw pixel data as ArrayBuffer. */
  data: ArrayBuffer;
  /** Frame width in pixels. */
  width: number;
  /** Frame height in pixels. */
  height: number;
  /** Bytes per row. */
  stride: number;
  /** Pixel format of the data. */
  format: PixelFormat;
  /** Presentation timestamp in seconds. */
  timestamp: number;
  /** Frame number on the timeline. */
  frameNumber: number;
  /** Whether this is a key frame. */
  keyFrame: boolean;
}

// ─── Decode Config ──────────────────────────────────────────────────────────

/** Configuration for opening a decode context. */
export interface DecodeConfig {
  /** Path or URL to the media file. */
  filePath: string;
  /** Desired output pixel format. */
  outputFormat?: PixelFormat;
  /** Hardware acceleration preference. */
  hwAccel?: HWAccelType;
  /** Number of threads (0 = auto). */
  threadCount?: number;
  /** Target width (0 = native). */
  targetWidth?: number;
  /** Target height (0 = native). */
  targetHeight?: number;
}

// ─── Encode Config ──────────────────────────────────────────────────────────

/** Configuration for video encoding. */
export interface EncodeConfig {
  /** Output file path. */
  outputPath: string;
  /** Video codec name (e.g. "libx264", "prores_ks", "dnxhd"). */
  videoCodec: string;
  /** Audio codec name (e.g. "aac", "pcm_s24le"). */
  audioCodec?: string;
  /** Container format (e.g. "mov", "mp4", "mxf"). */
  container: string;
  /** Output width. */
  width: number;
  /** Output height. */
  height: number;
  /** Frame rate. */
  fps: number;
  /** Video bitrate in bps (0 = codec default). */
  videoBitrate?: number;
  /** Quality value (CRF/CQ, -1 = default). */
  quality?: number;
  /** GOP size (0 = codec default). */
  keyInterval?: number;
  /** Hardware acceleration for encoding. */
  hwAccel?: HWAccelType;
  /** Input pixel format. */
  inputFormat?: PixelFormat;
  /** Audio sample rate (default 48000). */
  audioSampleRate?: number;
  /** Audio channels (default 2). */
  audioChannels?: number;
  /** Number of threads (0 = auto). */
  threadCount?: number;
  /** ProRes profile: 0=proxy, 1=LT, 2=422, 3=HQ, 4=4444, 5=XQ. */
  proresProfile?: number;
  /** DNxHR profile: 0=LB, 1=SQ, 2=HQ, 3=HQX, 4=444. */
  dnxhrProfile?: number;
}

// ─── Image Sequence Config ──────────────────────────────────────────────────

/** Configuration for reading an image sequence. */
export interface ImageSeqConfig {
  /** Directory containing the image files. */
  directory: string;
  /** Filename pattern (e.g. "frame_%04d.exr"). */
  pattern: string;
  /** First frame number. */
  startFrame: number;
  /** Last frame number. */
  endFrame: number;
  /** Playback frame rate. */
  fps: number;
  /** Output pixel format. */
  outputFormat?: PixelFormat;
  /** Number of threads (0 = auto). */
  threadCount?: number;
}

// ─── Camera RAW Config ──────────────────────────────────────────────────────

/** Configuration for camera RAW decode. */
export interface RawDecodeConfig {
  /** Use camera-embedded white balance. */
  useCameraWb?: boolean;
  /** Use auto white balance. */
  useAutoWb?: boolean;
  /** Custom WB multipliers [R, G, B, G2]. */
  userMultipliers?: [number, number, number, number];
  /** Decode at half resolution (2x faster). */
  halfSize?: boolean;
  /** Output bits per sample (8 or 16). */
  outputBps?: number;
  /** Use GPU debayering. */
  useGpu?: boolean;
  /** GPU type for debayering. */
  gpuType?: HWAccelType;
  /** Brightness adjustment (1.0 = default). */
  brightness?: number;
  /** Highlight mode: 0=clip, 1=unclip, 2=blend. */
  highlightMode?: number;
  /** Denoise threshold (0 = off). */
  denoiseThreshold?: number;
}

// ─── Mux Config ─────────────────────────────────────────────────────────────

/** Configuration for remuxing. */
export interface MuxConfig {
  /** Output file path. */
  outputPath: string;
  /** Container format ("mov", "mp4", "mxf", "mkv", "webm"). */
  container: string;
  /** Include video stream. */
  videoStream?: boolean;
  /** Include audio stream. */
  audioStream?: boolean;
  /** Starting timecode "HH:MM:SS:FF". */
  timecode?: string;
  /** Reel name. */
  reelName?: string;
  /** Frame rate (for timecode calculation). */
  fps?: number;
}

// ─── Transcode Progress ─────────────────────────────────────────────────────

/** Progress callback for long-running operations. */
export interface TranscodeProgress {
  /** Progress 0.0 to 1.0. */
  progress: number;
  /** Number of frames processed. */
  framesDone: number;
  /** Total estimated frames. */
  framesTotal: number;
  /** Current processing speed in FPS. */
  fps: number;
}

export type ProgressCallback = (progress: TranscodeProgress) => void;

// ─── HW Accel Report ────────────────────────────────────────────────────────

/** Information about a single HW acceleration device. */
export interface HWAccelDeviceInfo {
  /** Acceleration type. */
  type: HWAccelType;
  /** Device name (e.g. "videotoolbox", "cuda"). */
  name: string;
  /** Device description. */
  deviceName: string;
  /** Whether the device is available. */
  supported: boolean;
  /** VRAM in bytes (0 if unknown). */
  vramBytes: number;
}

/** Hardware acceleration availability report. */
export interface HWAccelReport {
  /** Number of available devices. */
  numDevices: number;
  /** Available devices. */
  devices: HWAccelDeviceInfo[];
  /** Preferred decode backend. */
  preferredDecode: HWAccelType;
  /** Preferred encode backend. */
  preferredEncode: HWAccelType;
}

// ─── Version Info ───────────────────────────────────────────────────────────

/** Version information for bundled libraries. */
export interface CodecVersions {
  ffmpeg: string;
  libraw: string;
  openexr: string;
}

// ─── Codec Support Entry ────────────────────────────────────────────────────

/** How a codec is supported on a given platform. */
export type SupportTier = 'native' | 'normalized' | 'adapter' | 'unsupported';

/** Codec support entry in the capability matrix. */
export interface CodecCapability {
  /** Codec identifier (e.g. "h264", "prores422", "arriraw"). */
  codecId: string;
  /** Human-readable name. */
  name: string;
  /** Category: video, audio, image, raw. */
  category: 'video' | 'audio' | 'image' | 'raw' | 'container';
  /** File extensions associated with this codec. */
  extensions: string[];
  /** Decode support tier. */
  decodeTier: SupportTier;
  /** Encode support tier ("unsupported" for decode-only formats). */
  encodeTier: SupportTier;
  /** Whether GPU acceleration is available. */
  hwAccelDecode: boolean;
  /** Whether GPU-accelerated encode is available. */
  hwAccelEncode: boolean;
  /** Supported bit depths. */
  bitDepths: number[];
  /** Whether alpha channel is supported. */
  alpha: boolean;
  /** Maximum supported resolution (0 = unlimited). */
  maxResolution: number;
}
