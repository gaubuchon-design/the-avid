// =============================================================================
//  THE AVID — Browser Codec Service
//  Web implementation of CodecService using WebCodecs API and HTMLVideoElement.
//  This is the fallback for when native codecs are unavailable (web app).
//  Supports only browser-native codecs (H.264, VP9, AV1, AAC, Opus, etc.).
// =============================================================================

import type { CodecService } from './CodecService';
import type {
  ProbeResult,
  DecodedFrameData,
  DecodeConfig,
  EncodeConfig,
  ImageSeqConfig,
  RawDecodeConfig,
  MuxConfig,
  ProgressCallback,
  HWAccelReport,
  CodecVersions,
  CodecCapability,
} from './types';
import { PixelFormat, HWAccelType } from './types';
import { BROWSER_CODEC_CAPABILITIES } from './codecCapabilities';

// ─── Browser Codec Service ──────────────────────────────────────────────────

export class BrowserCodecService implements CodecService {
  readonly name = 'BrowserCodecService';
  readonly isNative = false;

  private videoPool = new Map<string, HTMLVideoElement>();

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async init(): Promise<void> {
    // Browser codecs are always available — nothing to initialize
    console.log('[BrowserCodecService] Initialized (WebCodecs + HTMLVideoElement)');
  }

  dispose(): void {
    // Release video elements
    for (const [url, video] of this.videoPool) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    }
    this.videoPool.clear();
  }

  // ── Probe ─────────────────────────────────────────────────────────────

  async probe(filePath: string): Promise<ProbeResult> {
    // Browser probe uses HTMLVideoElement metadata loading
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';

      const result: ProbeResult = {
        videoCodec: '',
        width: 0,
        height: 0,
        fps: 0,
        duration: 0,
        bitDepth: 8,
        hasAlpha: false,
        pixelFormat: 'yuv420p',
        colorSpace: 'bt709',
        colorTransfer: '',
        colorPrimaries: '',
        videoBitrate: 0,
        audioCodec: '',
        audioChannels: 0,
        audioSampleRate: 0,
        audioBitDepth: 16,
        audioBitrate: 0,
        channelLayout: '',
        containerFormat: '',
        fileSize: 0,
        numVideoStreams: 0,
        numAudioStreams: 0,
        numSubtitleStreams: 0,
        timecodeStart: '',
        reelName: '',
        hwDecodeAvailable: false,
        hwDecodeType: HWAccelType.NONE,
        error: 0,
        errorMessage: '',
      };

      video.onloadedmetadata = () => {
        result.width = video.videoWidth;
        result.height = video.videoHeight;
        result.duration = video.duration;
        result.numVideoStreams = video.videoWidth > 0 ? 1 : 0;
        result.numAudioStreams = 1; // Assume 1 audio stream

        // Infer codec from extension
        const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
        const codecMap: Record<string, string> = {
          mp4: 'h264', m4v: 'h264', webm: 'vp9', mov: 'h264',
          mkv: 'h264', avi: 'h264', ogv: 'theora',
        };
        result.videoCodec = codecMap[ext] ?? 'unknown';
        result.containerFormat = ext;

        // Check WebCodecs HW accel
        if (typeof VideoDecoder !== 'undefined') {
          result.hwDecodeAvailable = true;
          result.hwDecodeType = HWAccelType.WEBCODECS;
        }

        URL.revokeObjectURL(video.src);
        resolve(result);
      };

      video.onerror = () => {
        result.error = -1;
        result.errorMessage = 'Failed to load media metadata';
        URL.revokeObjectURL(video.src);
        resolve(result);
      };

      video.src = filePath;
    });
  }

  // ── Decode ────────────────────────────────────────────────────────────

  async decodeFrame(
    filePath: string,
    timestamp: number,
    _config?: Partial<DecodeConfig>,
  ): Promise<DecodedFrameData> {
    // Use HTMLVideoElement seek + canvas capture
    const video = await this.getVideo(filePath);
    await this.seekVideo(video, timestamp);

    // Capture frame via canvas
    const canvas = new OffscreenCanvas(video.videoWidth, video.videoHeight);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    return {
      data: imageData.data.buffer,
      width: canvas.width,
      height: canvas.height,
      stride: canvas.width * 4,
      format: PixelFormat.RGBA8,
      timestamp,
      frameNumber: 0,
      keyFrame: true,
    };
  }

  async decodeRaw(
    _filePath: string,
    _config?: RawDecodeConfig,
  ): Promise<DecodedFrameData | null> {
    // Browser cannot decode camera RAW — return null
    return null;
  }

  isRawSupported(_filePath: string): boolean {
    return false; // No RAW support in browser
  }

  async decodeImageSequenceFrame(
    config: ImageSeqConfig,
    frameNumber: number,
  ): Promise<DecodedFrameData> {
    // Browser can decode PNG, JPEG, WebP via <img>
    const filename = config.pattern.replace(
      /%(\d*)d/,
      (_, width) => {
        const w = parseInt(width) || 0;
        return frameNumber.toString().padStart(w, '0');
      },
    );
    const filePath = `${config.directory}/${filename}`;

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = new OffscreenCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        resolve({
          data: imageData.data.buffer,
          width: canvas.width,
          height: canvas.height,
          stride: canvas.width * 4,
          format: PixelFormat.RGBA8,
          timestamp: (frameNumber - config.startFrame) / config.fps,
          frameNumber,
          keyFrame: true,
        });
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${filePath}`));
      img.src = filePath;
    });
  }

  // ── Encode ────────────────────────────────────────────────────────────

  async openEncodeSession(_config: EncodeConfig): Promise<string> {
    // WebCodecs VideoEncoder path — stubbed for now
    return `browser_enc_${Date.now()}`;
  }

  async writeVideoFrame(
    _sessionId: string,
    _data: ArrayBuffer,
    _width: number,
    _height: number,
    _pts: number,
  ): Promise<void> {
    // WebCodecs VideoEncoder.encode()
  }

  async writeAudioSamples(
    _sessionId: string,
    _samples: Float32Array,
    _channels: number,
    _sampleRate: number,
  ): Promise<void> {
    // WebCodecs AudioEncoder.encode()
  }

  async finalizeEncode(_sessionId: string): Promise<void> {
    // Flush encoder, finalize output
  }

  // ── Mux / Transcode ───────────────────────────────────────────────────

  async remux(
    _inputPath: string,
    _config: MuxConfig,
    _onProgress?: ProgressCallback,
  ): Promise<void> {
    throw new Error('Remux not supported in browser — use desktop app');
  }

  async transcode(
    _inputPath: string,
    _encodeConfig: EncodeConfig,
    _onProgress?: ProgressCallback,
  ): Promise<void> {
    throw new Error('Transcode not supported in browser — use desktop app');
  }

  // ── Hardware Acceleration ─────────────────────────────────────────────

  async queryHWAccel(): Promise<HWAccelReport> {
    const hasWebCodecs = typeof VideoDecoder !== 'undefined';
    return {
      numDevices: hasWebCodecs ? 1 : 0,
      devices: hasWebCodecs
        ? [{
            type: HWAccelType.WEBCODECS,
            name: 'WebCodecs',
            deviceName: 'Browser WebCodecs API',
            supported: true,
            vramBytes: 0,
          }]
        : [],
      preferredDecode: hasWebCodecs ? HWAccelType.WEBCODECS : HWAccelType.NONE,
      preferredEncode: hasWebCodecs ? HWAccelType.WEBCODECS : HWAccelType.NONE,
    };
  }

  // ── Capabilities ──────────────────────────────────────────────────────

  getCapabilities(): CodecCapability[] {
    return BROWSER_CODEC_CAPABILITIES;
  }

  canDecode(codecId: string): boolean {
    const cap = BROWSER_CODEC_CAPABILITIES.find((c) => c.codecId === codecId);
    return cap ? cap.decodeTier !== 'unsupported' : false;
  }

  canEncode(codecId: string): boolean {
    const cap = BROWSER_CODEC_CAPABILITIES.find((c) => c.codecId === codecId);
    return cap ? cap.encodeTier !== 'unsupported' : false;
  }

  // ── Diagnostics ───────────────────────────────────────────────────────

  getVersions(): CodecVersions {
    return {
      ffmpeg: 'n/a (browser)',
      libraw: 'n/a (browser)',
      openexr: 'n/a (browser)',
    };
  }

  // ── Private Helpers ───────────────────────────────────────────────────

  private async getVideo(filePath: string): Promise<HTMLVideoElement> {
    let video = this.videoPool.get(filePath);
    if (video) return video;

    video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;

    return new Promise((resolve, reject) => {
      video!.onloadeddata = () => {
        this.videoPool.set(filePath, video!);
        resolve(video!);
      };
      video!.onerror = () => reject(new Error(`Failed to load: ${filePath}`));
      video!.src = filePath;
    });
  }

  private seekVideo(video: HTMLVideoElement, timestamp: number): Promise<void> {
    return new Promise((resolve) => {
      if (Math.abs(video.currentTime - timestamp) < 0.01) {
        resolve();
        return;
      }
      video.onseeked = () => resolve();
      video.currentTime = timestamp;
    });
  }
}
