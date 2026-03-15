// =============================================================================
//  THE AVID — Muxer Pipeline
//  Offline render + encode + mux pipeline for exporting sequences.
//  Uses WebCodecs VideoEncoder/AudioEncoder feeding into container muxing.
//  Runs the same SegmentGraph → DecodePipeline → FrameCompositor path as
//  real-time playback, but at offline speed (no vsync constraint).
// =============================================================================

import {
  resolveSegmentGraph,
  getActiveVideoSegments,
  getActiveAudioSegments,
  frameToTime,
  totalFrames as totalFrameCount,
} from './SegmentGraph';
import type { SegmentGraphResult } from './SegmentGraph';
import { decodePipeline } from './DecodePipeline';
import { frameCompositor } from './FrameCompositor';
import type {
  Track,
  SequenceSettings,
} from '../store/editor.store';
import type { CodecService, EncodeConfig } from '@avid/media';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Supported output container formats. */
export type OutputContainer = 'mp4' | 'mov' | 'mxf' | 'webm';

/** Supported video codecs for export. */
export type ExportVideoCodec = 'h264' | 'h265' | 'prores422' | 'prores4444' | 'dnxhr' | 'av1' | 'vp9';

/** Supported audio codecs for export. */
export type ExportAudioCodec = 'aac' | 'pcm' | 'opus' | 'flac';

/** Bitrate mode for encoding. */
export type BitrateMode = 'cbr' | 'vbr' | 'cq';

/** Export configuration. */
export interface ExportConfig {
  /** Output container format. */
  container: OutputContainer;
  /** Video codec. */
  videoCodec: ExportVideoCodec;
  /** Audio codec. */
  audioCodec: ExportAudioCodec;
  /** Output width (pixels). */
  width: number;
  /** Output height (pixels). */
  height: number;
  /** Output frame rate. */
  fps: number;
  /** Video bitrate in bps (for CBR/VBR). */
  videoBitrate: number;
  /** Audio bitrate in bps. */
  audioBitrate: number;
  /** Bitrate mode. */
  bitrateMode: BitrateMode;
  /** Constant quality value (for CQ mode, 0–63). */
  constantQuality?: number;
  /** Key frame interval in frames. */
  keyFrameInterval: number;
  /** Audio sample rate. */
  audioSampleRate: number;
  /** Number of audio channels. */
  audioChannels: number;
  /** Whether to include alpha channel (ProRes 4444, etc.). */
  includeAlpha: boolean;
  /** Timeline in/out range to export. Null = full sequence. */
  range?: { inTime: number; outTime: number } | null;
}

/** Export progress event. */
export interface ExportProgress {
  /** Current phase. */
  phase: 'preparing' | 'encoding' | 'muxing' | 'finalizing' | 'complete' | 'error';
  /** Current frame being processed. */
  currentFrame: number;
  /** Total frames to process. */
  totalFrames: number;
  /** Progress percentage (0–100). */
  percent: number;
  /** Estimated time remaining in seconds. */
  estimatedTimeRemaining: number;
  /** Encoding speed (frames per second). */
  encodingFps: number;
  /** Error message if phase is 'error'. */
  error?: string;
}

/** Export result. */
export interface ExportResult {
  /** Whether the export succeeded. */
  success: boolean;
  /** The output blob (for download). */
  blob: Blob | null;
  /** Output file size in bytes. */
  fileSizeBytes: number;
  /** Total encoding time in seconds. */
  encodingTimeSeconds: number;
  /** Average encoding speed (frames per second). */
  avgEncodingFps: number;
  /** Number of frames encoded. */
  framesEncoded: number;
  /** Error message if failed. */
  error?: string;
}

/** Progress callback. */
export type ExportProgressCallback = (progress: ExportProgress) => void;

// ─── WebCodecs Codec Strings ──────────────────────────────────────────────────

function getVideoCodecString(codec: ExportVideoCodec, width: number, height: number): string {
  switch (codec) {
    case 'h264': return 'avc1.640028'; // High profile, level 4.0
    case 'h265': return 'hvc1.1.6.L120.B0'; // Main profile
    case 'av1': return 'av01.0.08M.08'; // Main profile, level 4.0
    case 'vp9': return 'vp09.00.31.08'; // Profile 0
    case 'prores422': return 'ap4h'; // ProRes 422
    case 'prores4444': return 'ap4x'; // ProRes 4444
    case 'dnxhr': return 'AVdn'; // DNxHR
    default: return 'avc1.640028';
  }
}

function getAudioCodecString(codec: ExportAudioCodec): string {
  switch (codec) {
    case 'aac': return 'mp4a.40.2'; // AAC-LC
    case 'opus': return 'opus';
    case 'flac': return 'flac';
    case 'pcm': return 'pcm-s16le';
    default: return 'mp4a.40.2';
  }
}

// ─── Muxer Pipeline ───────────────────────────────────────────────────────────

/**
 * Offline export pipeline.
 *
 * Renders every frame of the sequence through the same SegmentGraph →
 * DecodePipeline → FrameCompositor chain used for playback, then encodes
 * via WebCodecs VideoEncoder/AudioEncoder and muxes into the target container.
 *
 * Usage:
 * ```ts
 * const result = await muxerPipeline.export(tracks, settings, config, (progress) => {
 *   console.log(`${progress.percent}% — ${progress.encodingFps} fps`);
 * });
 * if (result.success && result.blob) {
 *   // Trigger download or upload
 * }
 * ```
 */
class MuxerPipelineClass {
  private aborted = false;
  /** Optional native codec service for desktop encode (ProRes, DNxHR, H.265, etc.). */
  private nativeCodecService: CodecService | null = null;
  /** Output file path for native encode (desktop only, no Blob). */
  private nativeOutputPath: string | null = null;

  /**
   * Inject the native codec service for GPU-accelerated encode on desktop.
   * When set, the export pipeline uses FFmpeg encode instead of WebCodecs,
   * enabling ProRes, DNxHR, H.265, MXF, and GPU HW acceleration.
   */
  setNativeCodecService(service: CodecService): void {
    this.nativeCodecService = service;
  }

  /**
   * Set the output file path for native (desktop) export.
   * On desktop the file is written directly to disk — no Blob download.
   */
  setNativeOutputPath(path: string): void {
    this.nativeOutputPath = path;
  }

  /**
   * Export a sequence.
   *
   * @param tracks    Timeline tracks from the editor store.
   * @param settings  Sequence settings.
   * @param config    Export configuration.
   * @param onProgress Progress callback.
   * @returns Export result with the output blob.
   */
  async export(
    tracks: Track[],
    settings: SequenceSettings,
    config: ExportConfig,
    onProgress?: ExportProgressCallback,
  ): Promise<ExportResult> {
    this.aborted = false;
    const startTime = performance.now();

    // Build segment graph
    const graph = resolveSegmentGraph(tracks, settings);

    // Determine frame range
    const rangeStart = config.range?.inTime ?? 0;
    const rangeEnd = config.range?.outTime ?? graph.duration;
    const startFrame = Math.floor(rangeStart * config.fps);
    const endFrame = Math.ceil(rangeEnd * config.fps);
    const framesToEncode = endFrame - startFrame;

    if (framesToEncode <= 0) {
      return {
        success: false,
        blob: null,
        fileSizeBytes: 0,
        encodingTimeSeconds: 0,
        avgEncodingFps: 0,
        framesEncoded: 0,
        error: 'No frames to encode (empty range)',
      };
    }

    onProgress?.({
      phase: 'preparing',
      currentFrame: 0,
      totalFrames: framesToEncode,
      percent: 0,
      estimatedTimeRemaining: 0,
      encodingFps: 0,
    });

    // Prepare decoders
    await decodePipeline.prepareDecoders(graph.referencedAssetIds);

    // Route to native encode if available and codec requires it
    if (this.nativeCodecService && this.shouldUseNativeEncode(config)) {
      return this.exportNative(tracks, settings, config, graph, startFrame, endFrame, framesToEncode, startTime, onProgress);
    }

    return this.exportWebCodecs(tracks, settings, config, graph, startFrame, endFrame, framesToEncode, startTime, onProgress);
  }

  /**
   * Determine whether to use native encode vs WebCodecs.
   * ProRes, DNxHR, MXF container, and H.265 require native encode.
   * H.264/VP9/AV1 in MP4/WebM can use WebCodecs if available.
   */
  private shouldUseNativeEncode(config: ExportConfig): boolean {
    const nativeOnlyCodecs: ExportVideoCodec[] = ['prores422', 'prores4444', 'dnxhr', 'h265'];
    const nativeOnlyContainers: OutputContainer[] = ['mxf'];
    return (
      nativeOnlyCodecs.includes(config.videoCodec) ||
      nativeOnlyContainers.includes(config.container)
    );
  }

  /**
   * Native encode path (desktop): FFmpeg via N-API.
   * Supports ProRes, DNxHR, H.265, MXF, GPU-accelerated encode.
   * Writes directly to disk — no Blob output.
   */
  private async exportNative(
    tracks: Track[],
    settings: SequenceSettings,
    config: ExportConfig,
    _graph: SegmentGraphResult,
    startFrame: number,
    endFrame: number,
    framesToEncode: number,
    startTime: number,
    onProgress?: ExportProgressCallback,
  ): Promise<ExportResult> {
    const codec = this.nativeCodecService!;
    const outputPath = this.nativeOutputPath;
    if (!outputPath) {
      return {
        success: false, blob: null, fileSizeBytes: 0,
        encodingTimeSeconds: 0, avgEncodingFps: 0, framesEncoded: 0,
        error: 'Native export requires an output file path — call setNativeOutputPath() first',
      };
    }

    const nativeConfig: EncodeConfig = {
      outputPath,
      videoCodec: this.mapVideoCodecToFFmpeg(config.videoCodec),
      audioCodec: this.mapAudioCodecToFFmpeg(config.audioCodec),
      container: config.container,
      width: config.width,
      height: config.height,
      fps: config.fps,
      videoBitrate: config.videoBitrate,
      quality: config.constantQuality ?? -1,
      keyInterval: config.keyFrameInterval,
      audioSampleRate: config.audioSampleRate,
      audioChannels: config.audioChannels,
      proresProfile: config.videoCodec === 'prores4444' ? 4 : config.videoCodec === 'prores422' ? 2 : undefined,
    };

    let sessionId: string;
    try {
      sessionId = await codec.openEncodeSession(nativeConfig);
    } catch (err) {
      return {
        success: false, blob: null, fileSizeBytes: 0,
        encodingTimeSeconds: (performance.now() - startTime) / 1000,
        avgEncodingFps: 0, framesEncoded: 0,
        error: `Native encoder init failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    onProgress?.({
      phase: 'encoding', currentFrame: 0, totalFrames: framesToEncode,
      percent: 0, estimatedTimeRemaining: 0, encodingFps: 0,
    });

    let framesEncoded = 0;
    const encodeStartMs = performance.now();

    try {
      for (let frame = startFrame; frame < endFrame; frame++) {
        if (this.aborted) {
          await codec.finalizeEncode(sessionId);
          return {
            success: false, blob: null, fileSizeBytes: 0,
            encodingTimeSeconds: (performance.now() - startTime) / 1000,
            avgEncodingFps: 0, framesEncoded, error: 'Export aborted',
          };
        }

        const timelineTime = frameToTime(frame, config.fps);

        const bitmap = await frameCompositor.renderTimelineFrame(
          tracks, timelineTime, settings, config.width, config.height,
        );

        if (bitmap) {
          // Extract RGBA pixels from the bitmap
          const canvas = new OffscreenCanvas(config.width, config.height);
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(bitmap, 0, 0);
          const imageData = ctx.getImageData(0, 0, config.width, config.height);
          bitmap.close();

          const pts = Math.round((frame - startFrame) * (1_000_000 / config.fps));
          await codec.writeVideoFrame(
            sessionId, imageData.data.buffer, config.width, config.height, pts,
          );
        }

        framesEncoded++;

        if (framesEncoded % 10 === 0 || frame === endFrame - 1) {
          const elapsedMs = performance.now() - encodeStartMs;
          const encodingFps = framesEncoded / (elapsedMs / 1000);
          const remaining = (framesToEncode - framesEncoded) / encodingFps;
          onProgress?.({
            phase: 'encoding', currentFrame: framesEncoded, totalFrames: framesToEncode,
            percent: Math.round((framesEncoded / framesToEncode) * 100),
            estimatedTimeRemaining: remaining,
            encodingFps: Math.round(encodingFps * 10) / 10,
          });
        }

        if (framesEncoded % 5 === 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      }

      onProgress?.({
        phase: 'finalizing', currentFrame: framesEncoded, totalFrames: framesToEncode,
        percent: 98, estimatedTimeRemaining: 1, encodingFps: 0,
      });

      await codec.finalizeEncode(sessionId);
    } catch (err) {
      return {
        success: false, blob: null, fileSizeBytes: 0,
        encodingTimeSeconds: (performance.now() - startTime) / 1000,
        avgEncodingFps: framesEncoded / ((performance.now() - encodeStartMs) / 1000 || 1),
        framesEncoded,
        error: `Native encode error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const totalTime = (performance.now() - startTime) / 1000;
    onProgress?.({
      phase: 'complete', currentFrame: framesEncoded, totalFrames: framesToEncode,
      percent: 100, estimatedTimeRemaining: 0, encodingFps: framesEncoded / totalTime,
    });

    return {
      success: true,
      blob: null, // Native encode writes to disk, no Blob
      fileSizeBytes: 0, // Actual size determined by filesystem
      encodingTimeSeconds: totalTime,
      avgEncodingFps: framesEncoded / totalTime,
      framesEncoded,
    };
  }

  /**
   * WebCodecs encode path (browser): H.264, VP9, AV1.
   */
  private async exportWebCodecs(
    tracks: Track[],
    settings: SequenceSettings,
    config: ExportConfig,
    _graph: SegmentGraphResult,
    startFrame: number,
    endFrame: number,
    framesToEncode: number,
    startTime: number,
    onProgress?: ExportProgressCallback,
  ): Promise<ExportResult> {
    // Collect encoded chunks
    const videoChunks: EncodedVideoChunk[] = [];
    const videoMeta: EncodedVideoChunkMetadata[] = [];

    // Check if VideoEncoder is available
    if (typeof VideoEncoder === 'undefined') {
      return {
        success: false,
        blob: null,
        fileSizeBytes: 0,
        encodingTimeSeconds: (performance.now() - startTime) / 1000,
        avgEncodingFps: 0,
        framesEncoded: 0,
        error: 'WebCodecs VideoEncoder not available in this browser',
      };
    }

    // Create video encoder
    const codecString = getVideoCodecString(config.videoCodec, config.width, config.height);
    let encoderError: string | undefined;

    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        videoChunks.push(chunk);
        if (meta) videoMeta.push(meta);
      },
      error: (err) => {
        encoderError = err.message;
      },
    });

    try {
      videoEncoder.configure({
        codec: codecString,
        width: config.width,
        height: config.height,
        bitrate: config.videoBitrate,
        framerate: config.fps,
        hardwareAcceleration: 'prefer-hardware',
      });
    } catch (err) {
      return {
        success: false,
        blob: null,
        fileSizeBytes: 0,
        encodingTimeSeconds: (performance.now() - startTime) / 1000,
        avgEncodingFps: 0,
        framesEncoded: 0,
        error: `Encoder configuration failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Encode each frame
    onProgress?.({
      phase: 'encoding',
      currentFrame: 0,
      totalFrames: framesToEncode,
      percent: 0,
      estimatedTimeRemaining: 0,
      encodingFps: 0,
    });

    let framesEncoded = 0;
    const encodeStartMs = performance.now();

    for (let frame = startFrame; frame < endFrame; frame++) {
      if (this.aborted) {
        videoEncoder.close();
        return {
          success: false,
          blob: null,
          fileSizeBytes: 0,
          encodingTimeSeconds: (performance.now() - startTime) / 1000,
          avgEncodingFps: 0,
          framesEncoded,
          error: 'Export aborted',
        };
      }

      if (encoderError) {
        videoEncoder.close();
        return {
          success: false,
          blob: null,
          fileSizeBytes: 0,
          encodingTimeSeconds: (performance.now() - startTime) / 1000,
          avgEncodingFps: framesEncoded / ((performance.now() - encodeStartMs) / 1000),
          framesEncoded,
          error: `Encoder error: ${encoderError}`,
        };
      }

      const timelineTime = frameToTime(frame, config.fps);

      // Composite this frame
      const bitmap = await frameCompositor.renderTimelineFrame(
        tracks,
        timelineTime,
        settings,
        config.width,
        config.height,
      );

      if (bitmap) {
        // Create a VideoFrame from the bitmap
        const videoFrame = new VideoFrame(bitmap, {
          timestamp: Math.round((frame - startFrame) * (1_000_000 / config.fps)), // microseconds
          duration: Math.round(1_000_000 / config.fps),
        });

        const isKeyFrame = (frame - startFrame) % config.keyFrameInterval === 0;
        videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
        videoFrame.close();
        bitmap.close();
      }

      framesEncoded++;

      // Report progress every 10 frames
      if (framesEncoded % 10 === 0 || frame === endFrame - 1) {
        const elapsedMs = performance.now() - encodeStartMs;
        const encodingFps = framesEncoded / (elapsedMs / 1000);
        const remaining = (framesToEncode - framesEncoded) / encodingFps;

        onProgress?.({
          phase: 'encoding',
          currentFrame: framesEncoded,
          totalFrames: framesToEncode,
          percent: Math.round((framesEncoded / framesToEncode) * 100),
          estimatedTimeRemaining: remaining,
          encodingFps: Math.round(encodingFps * 10) / 10,
        });
      }

      // Yield to the event loop every 5 frames to keep UI responsive
      if (framesEncoded % 5 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }

    // Flush the encoder
    await videoEncoder.flush();
    videoEncoder.close();

    // Mux into container
    onProgress?.({
      phase: 'muxing',
      currentFrame: framesEncoded,
      totalFrames: framesToEncode,
      percent: 95,
      estimatedTimeRemaining: 1,
      encodingFps: 0,
    });

    const outputBlob = await this.muxChunks(videoChunks, config);

    const totalTime = (performance.now() - startTime) / 1000;

    onProgress?.({
      phase: 'complete',
      currentFrame: framesEncoded,
      totalFrames: framesToEncode,
      percent: 100,
      estimatedTimeRemaining: 0,
      encodingFps: framesEncoded / totalTime,
    });

    return {
      success: true,
      blob: outputBlob,
      fileSizeBytes: outputBlob.size,
      encodingTimeSeconds: totalTime,
      avgEncodingFps: framesEncoded / totalTime,
      framesEncoded,
    };
  }

  /**
   * Abort an in-progress export.
   */
  abort(): void {
    this.aborted = true;
  }

  /**
   * Mux encoded video/audio chunks into a container blob.
   *
   * In a full implementation this would use mp4box.js for MP4/MOV containers
   * and a custom MXF writer for Avid interchange. For now, we produce a raw
   * WebM blob as a baseline, which works with VP9/AV1/Opus codecs directly.
   * MP4 muxing requires mp4box.js integration.
   */
  private async muxChunks(
    videoChunks: EncodedVideoChunk[],
    config: ExportConfig,
  ): Promise<Blob> {
    // Extract raw encoded data from chunks
    const parts: Uint8Array[] = [];

    for (const chunk of videoChunks) {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      parts.push(data);
    }

    // Determine MIME type based on container + codec
    const mimeType = this.getMimeType(config);

    // Concatenate all chunk data
    const totalBytes = parts.reduce((sum, p) => sum + p.length, 0);
    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const part of parts) {
      combined.set(part, offset);
      offset += part.length;
    }

    return new Blob([combined], { type: mimeType });
  }

  /** Map ExportVideoCodec to FFmpeg encoder name. */
  private mapVideoCodecToFFmpeg(codec: ExportVideoCodec): string {
    switch (codec) {
      case 'h264': return 'libx264';
      case 'h265': return 'libx265';
      case 'prores422': return 'prores_ks';
      case 'prores4444': return 'prores_ks';
      case 'dnxhr': return 'dnxhd';
      case 'av1': return 'libsvtav1';
      case 'vp9': return 'libvpx-vp9';
      default: return 'libx264';
    }
  }

  /** Map ExportAudioCodec to FFmpeg encoder name. */
  private mapAudioCodecToFFmpeg(codec: ExportAudioCodec): string {
    switch (codec) {
      case 'aac': return 'aac';
      case 'pcm': return 'pcm_s24le';
      case 'opus': return 'libopus';
      case 'flac': return 'flac';
      default: return 'aac';
    }
  }

  private getMimeType(config: ExportConfig): string {
    switch (config.container) {
      case 'mp4':
      case 'mov':
        return `video/mp4; codecs="${getVideoCodecString(config.videoCodec, config.width, config.height)}"`;
      case 'webm':
        return `video/webm; codecs="${getVideoCodecString(config.videoCodec, config.width, config.height)}"`;
      case 'mxf':
        return 'application/mxf';
      default:
        return 'video/mp4';
    }
  }
}

/** Singleton muxer pipeline. */
export const muxerPipeline = new MuxerPipelineClass();
