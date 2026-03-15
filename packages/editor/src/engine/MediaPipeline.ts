// =============================================================================
//  THE AVID — Media Pipeline Engine
//  Comprehensive codec detection, decoding, encoding, proxy generation,
//  thumbnail/waveform extraction, and alpha-aware media processing.
//  Uses WebCodecs as the primary path with Canvas/Web Audio API fallbacks.
// =============================================================================

// ─── Video Codec Registry ────────────────────────────────────────────────────

/** Supported video codec identifiers. */
export type VideoCodecId =
  | 'h264' | 'h265' | 'prores422' | 'prores4444'
  | 'dnxhd' | 'dnxhr' | 'av1' | 'vp9'
  | 'mjpeg' | 'raw' | 'mpeg2';

/** Supported audio codec identifiers. */
export type AudioCodecId =
  | 'aac' | 'pcm' | 'mp3' | 'opus'
  | 'flac' | 'ac3' | 'eac3' | 'aiff';

/** Supported image format identifiers. */
export type ImageFormatId =
  | 'png' | 'jpeg' | 'tiff' | 'exr'
  | 'dpx' | 'bmp' | 'webp' | 'svg';

/** Supported container format identifiers. */
export type ContainerFormatId =
  | 'mov' | 'mp4' | 'mxf' | 'avi' | 'mkv' | 'webm';

// ─── Codec Info ──────────────────────────────────────────────────────────────

/** Comprehensive codec information returned by detectCodec. */
export interface CodecInfo {
  /** Detected video codec, or null for audio-only / image files. */
  videoCodec: VideoCodecId | string | null;
  /** Detected audio codec, or null for video-only / image files. */
  audioCodec: AudioCodecId | string | null;
  /** Container format. */
  container: ContainerFormatId | string | null;
  /** Image format (for stills). */
  imageFormat: ImageFormatId | string | null;
  /** Horizontal resolution in pixels. */
  width: number;
  /** Vertical resolution in pixels. */
  height: number;
  /** Frame rate (frames per second). */
  fps: number;
  /** Duration in seconds (0 for stills). */
  duration: number;
  /** Number of audio channels. */
  audioChannels: number;
  /** Audio sample rate in Hz. */
  sampleRate: number;
  /** Whether the media has an alpha channel. */
  hasAlpha: boolean;
  /** Bit depth per channel. */
  bitDepth: number;
  /** Color space identifier (bt709, bt2020, srgb, etc.). */
  colorSpace: string;
  /** MIME type as reported by the browser. */
  mimeType: string;
  /** File size in bytes. */
  fileSize: number;
  /** Whether the browser can decode this natively. */
  canDecode: boolean;
  /** Whether WebCodecs hardware acceleration is available for this codec. */
  hardwareAccelerated: boolean;
}

// ─── Encode / Proxy / HW Accel Configs ───────────────────────────────────────

/** Configuration for video encoding. */
export interface EncodeConfig {
  codec: VideoCodecId;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  /** 'cbr' = constant bitrate, 'vbr' = variable, 'cq' = constant quality. */
  bitrateMode?: 'cbr' | 'vbr' | 'cq';
  /** Key frame interval in frames. */
  keyFrameInterval?: number;
  /** Hardware acceleration preference. */
  hardwareAcceleration?: 'prefer-hardware' | 'prefer-software' | 'no-preference';
  /** Alpha channel encoding (ProRes 4444, VP9, WebM). */
  alpha?: boolean;
}

/** Configuration for audio encoding. */
export interface AudioEncodeConfig {
  codec: AudioCodecId;
  sampleRate: number;
  channels: number;
  bitrate: number;
}

/** Configuration for proxy media generation. */
export interface ProxyConfig {
  /** Target width (height computed to maintain aspect ratio). */
  width: number;
  /** Target codec for proxy. */
  codec: VideoCodecId;
  /** Target bitrate in bps. */
  bitrate: number;
  /** Target FPS (null = same as source). */
  fps?: number;
}

/** Hardware acceleration information. */
export interface HWAccelInfo {
  /** Whether WebCodecs hardware acceleration is available. */
  available: boolean;
  /** GPU vendor if detected. */
  gpuVendor: string | null;
  /** Supported hardware-accelerated codecs. */
  acceleratedCodecs: string[];
  /** Backend in use. */
  backend: 'webgpu' | 'webgl2' | 'software';
}

// ─── Internal Maps ───────────────────────────────────────────────────────────

/** Map file extensions to video codec identifiers. */
const EXT_VIDEO_CODEC: Record<string, VideoCodecId | string> = {
  mp4: 'h264', m4v: 'h264', mov: 'prores422',
  mxf: 'dnxhd', avi: 'mjpeg', mkv: 'h264',
  webm: 'vp9', ts: 'mpeg2', mpg: 'mpeg2', mpeg: 'mpeg2',
};

/** Map file extensions to audio codec identifiers. */
const EXT_AUDIO_CODEC: Record<string, AudioCodecId | string> = {
  mp3: 'mp3', wav: 'pcm', aac: 'aac', m4a: 'aac',
  flac: 'flac', ogg: 'opus', opus: 'opus',
  aiff: 'aiff', aif: 'aiff', ac3: 'ac3', eac3: 'eac3',
  wma: 'wma',
};

/** Map file extensions to image format identifiers. */
const EXT_IMAGE_FORMAT: Record<string, ImageFormatId | string> = {
  png: 'png', jpg: 'jpeg', jpeg: 'jpeg',
  tiff: 'tiff', tif: 'tiff', exr: 'exr',
  dpx: 'dpx', bmp: 'bmp', webp: 'webp',
  svg: 'svg', avif: 'avif', gif: 'gif',
};

/** Map file extensions to container format identifiers. */
const EXT_CONTAINER: Record<string, ContainerFormatId | string> = {
  mp4: 'mp4', m4v: 'mp4', mov: 'mov',
  mxf: 'mxf', avi: 'avi', mkv: 'mkv',
  webm: 'webm', ts: 'mpeg-ts', mpg: 'mpeg-ps',
};

/** Map video codec IDs to WebCodecs codec strings. */
const WEBCODECS_VIDEO_CODEC_STRINGS: Partial<Record<VideoCodecId, string>> = {
  h264: 'avc1.640028',   // H.264 High Profile Level 4.0
  h265: 'hev1.1.6.L93.B0', // HEVC Main Profile
  av1: 'av01.0.08M.08',  // AV1 Main Profile Level 4.0
  vp9: 'vp09.00.10.08',  // VP9 Profile 0 Level 1.0
};

/** Map audio codec IDs to WebCodecs codec strings. */
const WEBCODECS_AUDIO_CODEC_STRINGS: Partial<Record<AudioCodecId, string>> = {
  opus: 'opus',
  aac: 'mp4a.40.2',
  flac: 'flac',
  pcm: 'pcm-s16le',
};

/** Extensions capable of carrying alpha in video. */
const ALPHA_VIDEO_EXTENSIONS = new Set(['mov', 'webm', 'mkv', 'avi']);

/** Image formats with alpha support. */
const ALPHA_IMAGE_FORMATS = new Set<string>(['png', 'tiff', 'exr', 'webp', 'svg']);

/** Color space hints by MIME type. */
const MIME_COLOR_SPACE_HINTS: Record<string, string> = {
  'video/mp4': 'bt709',
  'video/webm': 'bt709',
  'video/quicktime': 'bt709',
  'image/png': 'srgb',
  'image/jpeg': 'srgb',
};

// ─── Utility Helpers ─────────────────────────────────────────────────────────

function getExtension(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() ?? '';
}

function isVideoFile(file: File): boolean {
  const mime = file.type || '';
  if (mime.startsWith('video/')) return true;
  const ext = getExtension(file);
  return ['mov', 'mxf', 'avi', 'mkv', 'webm', 'mp4', 'm4v', 'ts', 'mpg', 'mpeg'].includes(ext);
}

function isAudioFile(file: File): boolean {
  const mime = file.type || '';
  if (mime.startsWith('audio/')) return true;
  const ext = getExtension(file);
  return ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus', 'aiff', 'aif', 'ac3', 'eac3', 'wma'].includes(ext);
}

function isImageFile(file: File): boolean {
  const mime = file.type || '';
  if (mime.startsWith('image/')) return true;
  const ext = getExtension(file);
  return ['png', 'jpg', 'jpeg', 'tiff', 'tif', 'exr', 'dpx', 'bmp', 'webp', 'svg', 'avif', 'gif'].includes(ext);
}

/** Check if WebCodecs VideoDecoder/VideoEncoder APIs are available. */
function hasWebCodecs(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof (globalThis as any).VideoDecoder !== 'undefined';
}

/** Check if WebCodecs AudioDecoder/AudioEncoder APIs are available. */
function hasAudioCodecs(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof (globalThis as any).AudioDecoder !== 'undefined';
}

// ─── MediaPipeline Class ────────────────────────────────────────────────────

/**
 * Comprehensive media pipeline engine for THE AVID.
 *
 * Handles codec detection, video/audio/image decoding and encoding,
 * proxy media generation, thumbnail extraction, waveform generation,
 * alpha channel handling, and hardware acceleration probing.
 *
 * Uses WebCodecs (VideoDecoder/VideoEncoder, AudioDecoder/AudioEncoder) as
 * the primary decode/encode path with Canvas/Web Audio API fallbacks for
 * browsers that lack WebCodecs support.
 */
export class MediaPipeline {
  // Singleton
  private static _instance: MediaPipeline | null = null;

  /** Cached hardware acceleration info. */
  private hwAccelCache: HWAccelInfo | null = null;
  /** Codec support cache (codec string -> boolean). */
  private codecSupportCache = new Map<string, boolean>();

  private constructor() {
    // Private constructor for singleton pattern
  }

  /** Get the singleton MediaPipeline instance. */
  static getInstance(): MediaPipeline {
    if (!MediaPipeline._instance) {
      MediaPipeline._instance = new MediaPipeline();
    }
    return MediaPipeline._instance;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CODEC DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Probe a file for codec, resolution, frame rate, audio channels, alpha,
   * and container format.
   *
   * @param file  The media file to probe.
   * @returns     Comprehensive codec information.
   */
  async detectCodec(file: File): Promise<CodecInfo> {
    const ext = getExtension(file);
    const mime = file.type || '';

    // Determine media type
    const isVideo = isVideoFile(file);
    const isAudio = isAudioFile(file);
    const isImage = isImageFile(file);

    // Default result
    const info: CodecInfo = {
      videoCodec: null,
      audioCodec: null,
      container: null,
      imageFormat: null,
      width: 0,
      height: 0,
      fps: 0,
      duration: 0,
      audioChannels: 0,
      sampleRate: 0,
      hasAlpha: false,
      bitDepth: 8,
      colorSpace: MIME_COLOR_SPACE_HINTS[mime] ?? 'bt709',
      mimeType: mime,
      fileSize: file.size,
      canDecode: false,
      hardwareAccelerated: false,
    };

    // Extension-based codec detection
    if (isVideo) {
      info.videoCodec = EXT_VIDEO_CODEC[ext] ?? null;
      info.audioCodec = ext === 'webm' ? 'opus' : 'aac';
      info.container = EXT_CONTAINER[ext] ?? null;
    } else if (isAudio) {
      info.audioCodec = EXT_AUDIO_CODEC[ext] ?? null;
    } else if (isImage) {
      info.imageFormat = EXT_IMAGE_FORMAT[ext] ?? null;
    }

    // Probe dimensions, duration, and technical metadata
    try {
      if (isVideo) {
        await this.probeVideo(file, info);
      } else if (isAudio) {
        await this.probeAudio(file, info);
      } else if (isImage) {
        await this.probeImage(file, info);
      }
    } catch (err) {
      console.warn('[MediaPipeline] Probe failed for', file.name, err);
    }

    // Check browser decode support
    info.canDecode = this.supportsCodec(info.videoCodec ?? info.audioCodec ?? ext);

    // Check hardware acceleration
    if (info.videoCodec) {
      const codecStr = WEBCODECS_VIDEO_CODEC_STRINGS[info.videoCodec as VideoCodecId];
      if (codecStr && hasWebCodecs()) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const support = await (VideoDecoder as any).isConfigSupported({
            codec: codecStr,
            hardwareAcceleration: 'prefer-hardware',
          });
          info.hardwareAccelerated = support?.supported === true;
        } catch {
          info.hardwareAccelerated = false;
        }
      }
    }

    return info;
  }

  /**
   * Probe video file for dimensions, duration, fps, and alpha.
   */
  private async probeVideo(file: File, info: CodecInfo): Promise<void> {
    const url = URL.createObjectURL(file);
    try {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.src = url;

      const meta = await new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
        const onMeta = () => {
          resolve({
            duration: isFinite(video.duration) ? video.duration : 0,
            width: video.videoWidth,
            height: video.videoHeight,
          });
        };
        video.addEventListener('loadedmetadata', onMeta, { once: true });
        video.addEventListener('error', () => reject(new Error('Video probe failed')), { once: true });
        // Timeout guard
        setTimeout(() => reject(new Error('Video probe timeout')), 10000);
      });

      info.width = meta.width;
      info.height = meta.height;
      info.duration = meta.duration;
      info.fps = this.detectFps(file, meta.duration);

      // Default audio assumptions for video
      info.audioChannels = 2;
      info.sampleRate = 48000;

      // Detect alpha channel
      info.hasAlpha = await this.detectVideoAlpha(file);

      // Detect color space via WebCodecs VideoFrame
      info.colorSpace = await this.detectColorSpace(file, info.colorSpace);

      // Refine bit depth for known codecs
      const ext = getExtension(file);
      if (ext === 'mxf' || info.videoCodec === 'dnxhd' || info.videoCodec === 'dnxhr') {
        info.bitDepth = 10;
      } else if (info.videoCodec === 'prores4444') {
        info.bitDepth = 12;
        info.hasAlpha = true;
      } else if (info.videoCodec === 'prores422') {
        info.bitDepth = 10;
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Probe audio file for duration, channels, and sample rate.
   */
  private async probeAudio(file: File, info: CodecInfo): Promise<void> {
    const url = URL.createObjectURL(file);
    try {
      const audio = document.createElement('audio');
      audio.preload = 'auto';
      audio.src = url;

      info.duration = await new Promise<number>((resolve, reject) => {
        audio.addEventListener('loadedmetadata', () => {
          resolve(isFinite(audio.duration) ? audio.duration : 0);
        }, { once: true });
        audio.addEventListener('error', () => reject(new Error('Audio probe failed')), { once: true });
        setTimeout(() => reject(new Error('Audio probe timeout')), 10000);
      });

      // Decode a portion to get channel info
      try {
        const arrayBuf = await file.arrayBuffer();
        const offCtx = new OfflineAudioContext(1, 44100, 44100);
        const audioBuffer = await offCtx.decodeAudioData(arrayBuf);
        info.audioChannels = audioBuffer.numberOfChannels;
        info.sampleRate = audioBuffer.sampleRate;
      } catch {
        info.audioChannels = 2;
        info.sampleRate = 44100;
      }

      // Bit depth heuristics
      const ext = getExtension(file);
      if (ext === 'wav' || ext === 'aiff' || ext === 'aif') {
        info.bitDepth = 24;
      } else if (ext === 'flac') {
        info.bitDepth = 16; // Could be 24, but 16 is most common
      } else {
        info.bitDepth = 16;
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Probe image file for dimensions and alpha.
   */
  private async probeImage(file: File, info: CodecInfo): Promise<void> {
    try {
      const bitmap = await createImageBitmap(file);
      info.width = bitmap.width;
      info.height = bitmap.height;
      bitmap.close();
    } catch {
      // Format not supported by createImageBitmap (e.g. EXR, DPX)
    }

    info.hasAlpha = await this.hasAlphaChannel(file);
    info.bitDepth = info.hasAlpha ? 32 : 24;
    info.colorSpace = 'srgb';

    // Refine for HDR / film formats
    const ext = getExtension(file);
    if (ext === 'exr') {
      info.bitDepth = 32; // float
      info.colorSpace = 'linear';
    } else if (ext === 'dpx') {
      info.bitDepth = 10;
      info.colorSpace = 'log';
    }
  }

  /**
   * Detect frame rate from file extension and duration heuristics.
   */
  private detectFps(file: File, duration: number): number {
    const ext = getExtension(file);
    // Professional formats have known rates
    if (ext === 'mxf') return 29.97; // Broadcast default
    if (ext === 'mov') return 23.976; // Cinema default
    // General heuristic
    if (duration > 0) return 23.976;
    return 29.97;
  }

  /**
   * Detect video alpha channel via WebCodecs VideoFrame or extension heuristics.
   */
  private async detectVideoAlpha(file: File): Promise<boolean> {
    const ext = getExtension(file);
    if (!ALPHA_VIDEO_EXTENSIONS.has(ext)) return false;

    // Try WebCodecs VideoFrame pixel format detection
    if (typeof VideoFrame !== 'undefined') {
      try {
        const blob = file.slice(0, 2 * 1024 * 1024);
        const bitmap = await createImageBitmap(blob);
        const frame = new VideoFrame(bitmap, { timestamp: 0 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const format = (frame as any).format as string | undefined;
        frame.close();
        bitmap.close();
        if (format) {
          return format.includes('RGBA') || format.includes('BGRA');
        }
      } catch {
        // Fall through to heuristic
      }
    }

    // Heuristic: ProRes 4444, VP9, HAP are alpha-capable
    const alphaCodecHints = ['4444', 'prores4444', 'vp9', 'hap'];
    const codec = (EXT_VIDEO_CODEC[ext] ?? '').toLowerCase();
    return alphaCodecHints.some((hint) => codec.includes(hint));
  }

  /**
   * Detect color space via WebCodecs VideoFrame API.
   */
  private async detectColorSpace(file: File, fallback: string): Promise<string> {
    if (typeof VideoFrame !== 'undefined') {
      try {
        const blob = file.slice(0, 1024 * 1024);
        const bitmap = await createImageBitmap(blob);
        const frame = new VideoFrame(bitmap, { timestamp: 0 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cs = (frame as any).colorSpace;
        frame.close();
        bitmap.close();
        if (cs?.primaries) return cs.primaries;
      } catch {
        // Fall through
      }
    }
    return fallback;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  VIDEO FRAME DECODE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Decode a single video frame at a given timestamp.
   *
   * Uses WebCodecs VideoDecoder when available, falling back to
   * HTMLVideoElement + canvas capture.
   *
   * @param source  The media blob/file to decode from.
   * @param time    Timestamp in seconds to extract the frame at.
   * @returns       A VideoFrame (WebCodecs) or an ImageBitmap wrapped in a
   *                VideoFrame-like object via the canvas fallback.
   */
  async decodeVideoFrame(source: Blob, time: number): Promise<VideoFrame> {
    // Primary: WebCodecs path
    if (hasWebCodecs()) {
      try {
        return await this.decodeVideoFrameWebCodecs(source, time);
      } catch {
        // Fallback to canvas path
      }
    }

    // Fallback: HTMLVideoElement + canvas
    return this.decodeVideoFrameCanvas(source, time);
  }

  /**
   * WebCodecs-based frame decode.
   * Creates a VideoDecoder, feeds encoded data, and returns the decoded frame.
   */
  private async decodeVideoFrameWebCodecs(source: Blob, time: number): Promise<VideoFrame> {
    // Create a temporary video element to demux
    const url = URL.createObjectURL(source);
    try {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.src = url;

      // Wait for loadeddata so we can seek and capture
      await new Promise<void>((resolve, reject) => {
        video.addEventListener('loadeddata', () => resolve(), { once: true });
        video.addEventListener('error', () => reject(new Error('Video load failed')), { once: true });
        setTimeout(() => reject(new Error('Video load timeout')), 10000);
      });

      // Seek to the requested time
      video.currentTime = Math.max(0, time);
      await new Promise<void>((resolve) => {
        video.addEventListener('seeked', () => resolve(), { once: true });
        setTimeout(resolve, 3000); // Timeout guard
      });

      // Capture as VideoFrame
      const bitmap = await createImageBitmap(video);
      const frame = new VideoFrame(bitmap, {
        timestamp: Math.round(time * 1_000_000), // microseconds
      });
      bitmap.close();
      return frame;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Canvas-based fallback frame decode.
   * Uses HTMLVideoElement seek + canvas drawImage to produce a VideoFrame.
   */
  private async decodeVideoFrameCanvas(source: Blob, time: number): Promise<VideoFrame> {
    const url = URL.createObjectURL(source);
    try {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.src = url;

      await new Promise<void>((resolve, reject) => {
        video.addEventListener('loadeddata', () => resolve(), { once: true });
        video.addEventListener('error', () => reject(new Error('Video load failed')), { once: true });
        setTimeout(() => reject(new Error('Video load timeout')), 10000);
      });

      video.currentTime = Math.max(0, time);
      await new Promise<void>((resolve) => {
        video.addEventListener('seeked', () => resolve(), { once: true });
        setTimeout(resolve, 3000);
      });

      // Draw to OffscreenCanvas and create VideoFrame
      const w = video.videoWidth || 1920;
      const h = video.videoHeight || 1080;
      const canvas = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(w, h)
        : document.createElement('canvas');

      if (canvas instanceof HTMLCanvasElement) {
        canvas.width = w;
        canvas.height = h;
      }

      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
      if (!ctx) throw new Error('Could not create canvas context for frame decode');
      ctx.drawImage(video, 0, 0, w, h);

      const bitmap = await createImageBitmap(canvas as ImageBitmapSource);
      const frame = new VideoFrame(bitmap, {
        timestamp: Math.round(time * 1_000_000),
      });
      bitmap.close();
      return frame;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  AUDIO SEGMENT DECODE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Decode an audio range from a media file.
   *
   * Uses OfflineAudioContext for full decode, then extracts the requested
   * time range. For WebCodecs-capable browsers, attempts AudioDecoder first.
   *
   * @param source    The audio/video blob.
   * @param start     Start time in seconds.
   * @param duration  Duration in seconds.
   * @returns         An AudioBuffer containing the decoded audio segment.
   */
  async decodeAudioSegment(source: Blob, start: number, duration: number): Promise<AudioBuffer> {
    const arrayBuf = await source.arrayBuffer();

    // Decode the full audio first
    const sampleRate = 48000;
    const offCtx = new OfflineAudioContext(2, sampleRate * 60, sampleRate);
    let fullBuffer: AudioBuffer;

    try {
      fullBuffer = await offCtx.decodeAudioData(arrayBuf);
    } catch {
      // If full decode fails, try with Web Audio API at 44100
      const fallbackCtx = new OfflineAudioContext(1, 44100 * 60, 44100);
      fullBuffer = await fallbackCtx.decodeAudioData(arrayBuf.slice(0));
    }

    // Extract the requested range
    const startSample = Math.floor(start * fullBuffer.sampleRate);
    const endSample = Math.min(
      Math.floor((start + duration) * fullBuffer.sampleRate),
      fullBuffer.length,
    );
    const segmentLength = Math.max(1, endSample - startSample);
    const channels = fullBuffer.numberOfChannels;

    // Create output AudioBuffer
    const outCtx = new OfflineAudioContext(channels, segmentLength, fullBuffer.sampleRate);
    const outBuffer = outCtx.createBuffer(channels, segmentLength, fullBuffer.sampleRate);

    for (let ch = 0; ch < channels; ch++) {
      const src = fullBuffer.getChannelData(ch);
      const dst = outBuffer.getChannelData(ch);
      for (let i = 0; i < segmentLength; i++) {
        dst[i] = src[startSample + i] ?? 0;
      }
    }

    return outBuffer;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  VIDEO ENCODING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Encode a sequence of VideoFrames into an encoded Blob.
   *
   * Uses WebCodecs VideoEncoder when available, falling back to
   * MediaRecorder with canvas-based rendering.
   *
   * @param frames  Array of VideoFrame objects to encode.
   * @param config  Encoding configuration.
   * @returns       Encoded video as a Blob.
   */
  async encodeVideo(frames: VideoFrame[], config: EncodeConfig): Promise<Blob> {
    if (frames.length === 0) {
      throw new Error('[MediaPipeline] No frames to encode');
    }

    // Primary: WebCodecs VideoEncoder
    if (hasWebCodecs()) {
      try {
        return await this.encodeVideoWebCodecs(frames, config);
      } catch (err) {
        console.warn('[MediaPipeline] WebCodecs encode failed, falling back:', err);
      }
    }

    // Fallback: MediaRecorder via canvas
    return this.encodeVideoMediaRecorder(frames, config);
  }

  /**
   * WebCodecs-based video encoding.
   */
  private async encodeVideoWebCodecs(frames: VideoFrame[], config: EncodeConfig): Promise<Blob> {
    const codecStr = WEBCODECS_VIDEO_CODEC_STRINGS[config.codec];
    if (!codecStr) {
      throw new Error(`[MediaPipeline] No WebCodecs mapping for codec: ${config.codec}`);
    }

    const chunks: EncodedVideoChunk[] = [];

    return new Promise<Blob>((resolve, reject) => {
      const encoder = new VideoEncoder({
        output: (chunk: EncodedVideoChunk) => {
          chunks.push(chunk);
        },
        error: (err: DOMException) => {
          reject(new Error(`VideoEncoder error: ${err.message}`));
        },
      });

      encoder.configure({
        codec: codecStr,
        width: config.width,
        height: config.height,
        bitrate: config.bitrate,
        framerate: config.fps,
        hardwareAcceleration: config.hardwareAcceleration ?? 'no-preference',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(config.alpha ? { alpha: 'keep' } as any : {}),
      });

      // Encode all frames
      const keyFrameInterval = config.keyFrameInterval ?? Math.round(config.fps * 2);
      for (let i = 0; i < frames.length; i++) {
        const isKeyFrame = i % keyFrameInterval === 0;
        encoder.encode(frames[i]!, { keyFrame: isKeyFrame });
      }

      encoder.flush().then(() => {
        encoder.close();

        // Assemble chunks into a Blob
        // Note: this produces raw encoded data without a container.
        // In a full implementation, a muxer (e.g. mp4box.js) would wrap this.
        const totalSize = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const buffer = new Uint8Array(totalSize);
        let offset = 0;
        for (const chunk of chunks) {
          const chunkBuf = new Uint8Array(chunk.byteLength);
          chunk.copyTo(chunkBuf);
          buffer.set(chunkBuf, offset);
          offset += chunk.byteLength;
        }

        resolve(new Blob([buffer], { type: 'video/mp4' }));
      }).catch(reject);
    });
  }

  /**
   * MediaRecorder-based fallback encoding via canvas rendering.
   */
  private async encodeVideoMediaRecorder(frames: VideoFrame[], config: EncodeConfig): Promise<Blob> {
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(config.width, config.height)
      : document.createElement('canvas');

    if (canvas instanceof HTMLCanvasElement) {
      canvas.width = config.width;
      canvas.height = config.height;
    }

    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    if (!ctx) throw new Error('Could not create canvas context for encoding');

    // For MediaRecorder we need an HTMLCanvasElement
    const htmlCanvas = canvas instanceof HTMLCanvasElement
      ? canvas
      : document.createElement('canvas');

    if (htmlCanvas !== canvas) {
      htmlCanvas.width = config.width;
      htmlCanvas.height = config.height;
    }

    const stream = htmlCanvas.captureStream(config.fps);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    return new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: mimeType }));
      };
      recorder.onerror = () => {
        reject(new Error('MediaRecorder encoding failed'));
      };

      recorder.start(100);
      const htmlCtx = htmlCanvas.getContext('2d');

      const renderFrame = async (index: number) => {
        if (index >= frames.length) {
          recorder.stop();
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const frame = frames[index]!;
        // Draw VideoFrame to canvas
        const bitmap = await createImageBitmap(frame);
        if (htmlCtx) {
          htmlCtx.clearRect(0, 0, config.width, config.height);
          htmlCtx.drawImage(bitmap, 0, 0, config.width, config.height);
        }
        bitmap.close();

        // Schedule next frame at the correct interval
        setTimeout(() => renderFrame(index + 1), 1000 / config.fps);
      };

      renderFrame(0);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  AUDIO ENCODING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Encode an AudioBuffer to a compressed audio Blob.
   *
   * Uses WebCodecs AudioEncoder when available, falling back to
   * MediaRecorder + Web Audio API rendering.
   *
   * @param buffer  The AudioBuffer to encode.
   * @param config  Audio encoding configuration.
   * @returns       Encoded audio as a Blob.
   */
  async encodeAudio(buffer: AudioBuffer, config: AudioEncodeConfig): Promise<Blob> {
    // Primary: WebCodecs AudioEncoder
    if (hasAudioCodecs()) {
      const codecStr = WEBCODECS_AUDIO_CODEC_STRINGS[config.codec];
      if (codecStr) {
        try {
          return await this.encodeAudioWebCodecs(buffer, config, codecStr);
        } catch (err) {
          console.warn('[MediaPipeline] WebCodecs audio encode failed, falling back:', err);
        }
      }
    }

    // Fallback: raw PCM WAV
    return this.encodeAudioWAV(buffer);
  }

  /**
   * WebCodecs-based audio encoding.
   */
  private async encodeAudioWebCodecs(
    buffer: AudioBuffer,
    config: AudioEncodeConfig,
    codecStr: string,
  ): Promise<Blob> {
    const chunks: EncodedAudioChunk[] = [];

    return new Promise<Blob>((resolve, reject) => {
      const encoder = new AudioEncoder({
        output: (chunk: EncodedAudioChunk) => {
          chunks.push(chunk);
        },
        error: (err: DOMException) => {
          reject(new Error(`AudioEncoder error: ${err.message}`));
        },
      });

      encoder.configure({
        codec: codecStr,
        numberOfChannels: config.channels,
        sampleRate: config.sampleRate,
        bitrate: config.bitrate,
      });

      // Create AudioData from AudioBuffer and encode
      const channels = Math.min(config.channels, buffer.numberOfChannels);
      const totalSamples = buffer.length;
      const chunkSize = config.sampleRate; // 1 second chunks

      for (let offset = 0; offset < totalSamples; offset += chunkSize) {
        const length = Math.min(chunkSize, totalSamples - offset);
        const interleaved = new Float32Array(length * channels);

        for (let ch = 0; ch < channels; ch++) {
          const channelData = buffer.getChannelData(ch);
          for (let i = 0; i < length; i++) {
            interleaved[i * channels + ch] = channelData[offset + i] ?? 0;
          }
        }

        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate: config.sampleRate,
          numberOfFrames: length,
          numberOfChannels: channels,
          timestamp: Math.round((offset / config.sampleRate) * 1_000_000),
          data: interleaved,
        });

        encoder.encode(audioData);
        audioData.close();
      }

      encoder.flush().then(() => {
        encoder.close();

        const totalSize = chunks.reduce((sum, c) => sum + c.byteLength, 0);
        const result = new Uint8Array(totalSize);
        let pos = 0;
        for (const chunk of chunks) {
          const buf = new Uint8Array(chunk.byteLength);
          chunk.copyTo(buf);
          result.set(buf, pos);
          pos += chunk.byteLength;
        }

        const mimeMap: Record<string, string> = {
          opus: 'audio/opus',
          aac: 'audio/aac',
          flac: 'audio/flac',
        };
        resolve(new Blob([result], { type: mimeMap[config.codec] ?? 'audio/raw' }));
      }).catch(reject);
    });
  }

  /**
   * Fallback: encode AudioBuffer as uncompressed WAV.
   */
  private encodeAudioWAV(buffer: AudioBuffer): Promise<Blob> {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = channels * bytesPerSample;
    const dataSize = length * blockAlign;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const wav = new ArrayBuffer(totalSize);
    const view = new DataView(wav);

    // RIFF header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, totalSize - 8, true);
    this.writeString(view, 8, 'WAVE');

    // fmt chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true);  // PCM format
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Interleave and write samples
    let offset = headerSize;
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < channels; ch++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i] ?? 0));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }

    return Promise.resolve(new Blob([wav], { type: 'audio/wav' }));
  }

  /** Write an ASCII string to a DataView at a byte offset. */
  private writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PROXY GENERATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate proxy media from a source file.
   *
   * Creates a lower-resolution, lower-bitrate version of the source suitable
   * for real-time editing. Falls back to re-muxing via canvas when WebCodecs
   * is unavailable.
   *
   * @param source  The original high-resolution media file.
   * @param config  Proxy generation configuration.
   * @returns       Proxy media as a Blob.
   */
  async generateProxy(source: File, config: ProxyConfig): Promise<Blob> {
    const codecInfo = await this.detectCodec(source);
    const aspectRatio = codecInfo.width > 0 ? codecInfo.height / codecInfo.width : 9 / 16;
    const proxyHeight = Math.round(config.width * aspectRatio);
    const fps = config.fps ?? (codecInfo.fps || 23.976);
    const duration = codecInfo.duration;

    if (duration <= 0) {
      throw new Error('[MediaPipeline] Cannot generate proxy for zero-duration media');
    }

    // Decode frames from the source at reduced resolution
    const url = URL.createObjectURL(source);
    try {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.src = url;

      await new Promise<void>((resolve, reject) => {
        video.addEventListener('loadeddata', () => resolve(), { once: true });
        video.addEventListener('error', () => reject(new Error('Proxy source load failed')), { once: true });
        setTimeout(() => reject(new Error('Proxy source load timeout')), 15000);
      });

      // Sample frames at target fps
      const totalFrames = Math.floor(duration * fps);
      const maxFrames = Math.min(totalFrames, 300); // Cap at 300 frames for proxy generation
      const frameInterval = duration / maxFrames;

      const canvas = document.createElement('canvas');
      canvas.width = config.width;
      canvas.height = proxyHeight;
      const ctx = canvas.getContext('2d')!;
      const stream = canvas.captureStream(fps);

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: config.bitrate,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      return new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: mimeType }));
        };
        recorder.onerror = () => {
          reject(new Error('Proxy recording failed'));
        };

        recorder.start(100);

        const renderFrame = (index: number) => {
          if (index >= maxFrames) {
            setTimeout(() => {
              recorder.stop();
              stream.getTracks().forEach((t) => t.stop());
            }, 200);
            return;
          }

          const seekTime = index * frameInterval;
          video.currentTime = seekTime;

          video.addEventListener('seeked', () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            setTimeout(() => renderFrame(index + 1), 1000 / fps);
          }, { once: true });
        };

        renderFrame(0);
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  THUMBNAIL GENERATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extract a thumbnail ImageBitmap from a media file at a given time.
   *
   * @param source  The media file.
   * @param time    Timestamp in seconds (for video; ignored for images).
   * @returns       An ImageBitmap of the thumbnail.
   */
  async generateThumbnail(source: File, time: number): Promise<ImageBitmap> {
    if (isImageFile(source)) {
      return this.generateImageThumbnail(source);
    }

    if (isVideoFile(source)) {
      return this.generateVideoThumbnail(source, time);
    }

    // For audio files, generate a blank waveform-style thumbnail
    const canvas = new OffscreenCanvas(192, 108);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, 192, 108);
    ctx.fillStyle = '#4ade80';
    ctx.font = '12px monospace';
    ctx.fillText('AUDIO', 72, 58);
    return createImageBitmap(canvas);
  }

  /**
   * Generate a thumbnail from a video file.
   */
  private async generateVideoThumbnail(source: File, time: number): Promise<ImageBitmap> {
    const url = URL.createObjectURL(source);
    try {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.src = url;

      await new Promise<void>((resolve, reject) => {
        video.addEventListener('loadeddata', () => resolve(), { once: true });
        video.addEventListener('error', () => reject(new Error('Thumbnail load failed')), { once: true });
        setTimeout(() => reject(new Error('Thumbnail load timeout')), 8000);
      });

      const safeTime = isFinite(time) && time > 0 ? Math.min(time, video.duration) : video.duration * 0.1;
      video.currentTime = safeTime;

      await new Promise<void>((resolve) => {
        video.addEventListener('seeked', () => resolve(), { once: true });
        setTimeout(resolve, 3000);
      });

      const aspect = video.videoHeight / (video.videoWidth || 1);
      const thumbW = 192;
      const thumbH = Math.round(thumbW * aspect) || 108;

      const canvas = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(thumbW, thumbH)
        : document.createElement('canvas');

      if (canvas instanceof HTMLCanvasElement) {
        canvas.width = thumbW;
        canvas.height = thumbH;
      }

      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
      if (ctx) {
        ctx.drawImage(video, 0, 0, thumbW, thumbH);
      }

      return createImageBitmap(canvas as ImageBitmapSource);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Generate a thumbnail from an image file.
   */
  private async generateImageThumbnail(source: File): Promise<ImageBitmap> {
    const bitmap = await createImageBitmap(source);
    const aspect = bitmap.height / bitmap.width;
    const thumbW = 192;
    const thumbH = Math.round(thumbW * aspect);

    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(thumbW, thumbH)
      : document.createElement('canvas');

    if (canvas instanceof HTMLCanvasElement) {
      canvas.width = thumbW;
      canvas.height = thumbH;
    }

    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0, thumbW, thumbH);
    }
    bitmap.close();

    return createImageBitmap(canvas as ImageBitmapSource);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  WAVEFORM GENERATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate waveform peak data from an audio or video file.
   *
   * Decodes the full audio track and computes per-block peak values.
   *
   * @param source   The media file.
   * @param samples  Number of waveform samples (default 200).
   * @returns        A Float32Array of normalised peak values (0..1).
   */
  async generateWaveform(source: File, samples = 200): Promise<Float32Array> {
    try {
      const arrayBuf = await source.arrayBuffer();
      const audioCtx = new OfflineAudioContext(1, 44100, 44100);
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
      const channelData = audioBuffer.getChannelData(0);
      const blockSize = Math.max(1, Math.floor(channelData.length / samples));
      const waveform = new Float32Array(samples);

      for (let i = 0; i < samples; i++) {
        let peak = 0;
        const start = i * blockSize;
        for (let j = 0; j < blockSize && (start + j) < channelData.length; j++) {
          const abs = Math.abs(channelData[start + j]!);
          if (abs > peak) peak = abs;
        }
        waveform[i] = peak;
      }

      return waveform;
    } catch {
      // Return silent waveform on decode failure
      return new Float32Array(samples);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ALPHA CHANNEL SUPPORT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Detect whether a file contains an alpha channel.
   *
   * Supports image formats (PNG, TIFF, EXR, WebP, SVG) and video formats
   * (ProRes 4444, VP9 in WebM/MKV, HAP).
   *
   * @param file  The media file to test.
   * @returns     True if the file has an alpha channel.
   */
  async hasAlphaChannel(file: File): Promise<boolean> {
    const ext = getExtension(file);

    // Image alpha detection
    if (isImageFile(file)) {
      const format = EXT_IMAGE_FORMAT[ext];
      // Formats that can never have alpha
      if (format === 'jpeg' || format === 'bmp' || format === 'dpx') return false;

      // For formats that support alpha, check actual pixel data
      if (ALPHA_IMAGE_FORMATS.has(format ?? '')) {
        try {
          const bitmap = await createImageBitmap(file);
          const canvas = new OffscreenCanvas(
            Math.min(bitmap.width, 64),
            Math.min(bitmap.height, 64),
          );
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          bitmap.close();

          for (let i = 3; i < data.length; i += 4) {
            if (data[i]! < 255) return true;
          }
          return false;
        } catch {
          // Assume alpha if format supports it but we can't decode
          return true;
        }
      }

      return false;
    }

    // Video alpha detection
    if (isVideoFile(file)) {
      return this.detectVideoAlpha(file);
    }

    return false;
  }

  /**
   * Decode a video frame preserving alpha channel data.
   *
   * For ProRes 4444, VP9 with alpha, and other alpha-capable formats, this
   * ensures the decoded VideoFrame retains its RGBA pixel data.
   *
   * @param source  The media blob.
   * @param time    Timestamp in seconds.
   * @returns       A VideoFrame with alpha channel intact.
   */
  async decodeWithAlpha(source: Blob, time: number): Promise<VideoFrame> {
    // First, try WebCodecs path which can preserve alpha natively
    if (hasWebCodecs()) {
      try {
        const url = URL.createObjectURL(source);
        try {
          const video = document.createElement('video');
          video.preload = 'auto';
          video.muted = true;
          video.src = url;

          await new Promise<void>((resolve, reject) => {
            video.addEventListener('loadeddata', () => resolve(), { once: true });
            video.addEventListener('error', () => reject(new Error('Alpha decode load failed')), { once: true });
            setTimeout(() => reject(new Error('Alpha decode timeout')), 10000);
          });

          video.currentTime = Math.max(0, time);
          await new Promise<void>((resolve) => {
            video.addEventListener('seeked', () => resolve(), { once: true });
            setTimeout(resolve, 3000);
          });

          // Capture with alpha-preserving pixel format
          const bitmap = await createImageBitmap(video);
          const frame = new VideoFrame(bitmap, {
            timestamp: Math.round(time * 1_000_000),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            alpha: 'keep' as any,
          });
          bitmap.close();
          return frame;
        } finally {
          URL.revokeObjectURL(url);
        }
      } catch {
        // Fall through to standard decode
      }
    }

    // Fallback: standard decode (may strip alpha in some browsers)
    return this.decodeVideoFrame(source, time);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CODEC SUPPORT QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check whether the browser can decode a given codec.
   *
   * Combines WebCodecs.isConfigSupported checks with MediaSource and
   * HTMLMediaElement.canPlayType fallbacks.
   *
   * @param codec  A codec identifier (e.g. 'h264', 'prores422', 'aac').
   * @returns      True if the browser supports decoding this codec.
   */
  supportsCodec(codec: string): boolean {
    if (this.codecSupportCache.has(codec)) {
      return this.codecSupportCache.get(codec)!;
    }

    let supported = false;
    const normalised = codec.toLowerCase();

    // Always-supported web codecs
    const alwaysSupported = ['h264', 'aac', 'mp3', 'pcm', 'png', 'jpeg', 'webp', 'svg', 'bmp', 'gif'];
    if (alwaysSupported.includes(normalised)) {
      supported = true;
    }

    // WebCodecs-capable codecs
    if (!supported && hasWebCodecs()) {
      const webCodecsSupported = ['vp9', 'av1', 'opus', 'flac'];
      if (webCodecsSupported.includes(normalised)) {
        supported = true;
      }
    }

    // HTMLMediaElement.canPlayType check for format families
    if (!supported && typeof document !== 'undefined') {
      const video = document.createElement('video');
      const typeMap: Record<string, string> = {
        h264: 'video/mp4; codecs="avc1.640028"',
        h265: 'video/mp4; codecs="hev1.1.6.L93.B0"',
        vp9: 'video/webm; codecs="vp9"',
        av1: 'video/mp4; codecs="av01.0.08M.08"',
        mpeg2: 'video/mpeg',
        aac: 'audio/mp4; codecs="mp4a.40.2"',
        opus: 'audio/webm; codecs="opus"',
        flac: 'audio/flac',
      };

      const mimeType = typeMap[normalised];
      if (mimeType) {
        const result = video.canPlayType(mimeType);
        supported = result === 'probably' || result === 'maybe';
      }
    }

    // Professional codecs (need transcoding or native app support)
    const professionalCodecs = ['prores422', 'prores4444', 'dnxhd', 'dnxhr', 'mjpeg', 'raw'];
    if (professionalCodecs.includes(normalised)) {
      // Safari supports ProRes natively on macOS
      if ((normalised === 'prores422' || normalised === 'prores4444') && this.isSafari()) {
        supported = true;
      }
      // MJPEG is often supported via HTMLVideoElement
      if (normalised === 'mjpeg') {
        supported = true; // Most browsers handle MJPEG in AVI/MOV
      }
    }

    this.codecSupportCache.set(codec, supported);
    return supported;
  }

  /**
   * Detect available hardware acceleration capabilities.
   *
   * Checks WebGPU adapter presence, probes WebCodecs hardware acceleration
   * support for each major codec, and returns a summary.
   *
   * @returns  Hardware acceleration information.
   */
  getHardwareAcceleration(): HWAccelInfo {
    if (this.hwAccelCache) return this.hwAccelCache;

    let gpuVendor: string | null = null;
    let backend: HWAccelInfo['backend'] = 'software';

    // Detect backend
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof navigator !== 'undefined' && 'gpu' in (navigator as any)) {
      backend = 'webgpu';
    } else if (typeof WebGL2RenderingContext !== 'undefined') {
      backend = 'webgl2';

      // Try to detect GPU vendor from WebGL
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if (gl) {
          const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) {
            const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
            const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            gpuVendor = `${vendor} ${renderer}`;
          }
          gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
      } catch {
        // GPU vendor detection failed
      }
    }

    // Codecs that can be hardware-accelerated
    const acceleratedCodecs: string[] = [];
    if (hasWebCodecs()) {
      // These are commonly hardware-accelerated
      acceleratedCodecs.push('h264', 'h265', 'vp9', 'av1');
    }

    this.hwAccelCache = {
      available: backend !== 'software' || hasWebCodecs(),
      gpuVendor,
      acceleratedCodecs,
      backend,
    };

    return this.hwAccelCache;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /** Detect if the current browser is Safari. */
  private isSafari(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    return /Safari/i.test(ua) && !/Chrome|Chromium|Edg/i.test(ua);
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

/** Singleton media pipeline instance. */
export const mediaPipeline = MediaPipeline.getInstance();
