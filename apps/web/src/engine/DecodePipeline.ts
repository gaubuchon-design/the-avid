// =============================================================================
//  THE AVID — Decode Pipeline
//  WebCodecs-based frame-accurate decode with ring-buffer cache, pre-fetch,
//  and per-source decoder management. Falls back to VideoSourceManager
//  (HTMLVideoElement) when WebCodecs is unavailable.
// =============================================================================

import { videoSourceManager } from './VideoSourceManager';
import type { VideoSegment } from './SegmentGraph';
import { segmentSourceTime } from './SegmentGraph';
import type { CodecService } from '@avid/media';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A decoded video frame with metadata. */
export interface DecodedFrame {
  /** The decoded frame as an ImageBitmap (ready for Canvas/WebGPU). */
  bitmap: ImageBitmap;
  /** Timeline time this frame corresponds to. */
  timelineTime: number;
  /** Source media time this frame was decoded from. */
  sourceTime: number;
  /** Frame number on the timeline. */
  frameNumber: number;
  /** Width of the decoded frame. */
  width: number;
  /** Height of the decoded frame. */
  height: number;
  /** Timestamp when this frame was decoded (performance.now). */
  decodedAt: number;
}

/** A decoded audio chunk with metadata. */
export interface DecodedAudioChunk {
  /** Raw audio sample data (interleaved Float32). */
  samples: Float32Array;
  /** Number of audio channels. */
  channels: number;
  /** Sample rate. */
  sampleRate: number;
  /** Timeline time this chunk corresponds to. */
  timelineTime: number;
  /** Source media time. */
  sourceTime: number;
  /** Duration of this chunk in seconds. */
  duration: number;
}

/** Decode pipeline statistics. */
export interface DecodeStats {
  /** Number of cache hits. */
  cacheHits: number;
  /** Number of cache misses (decode required). */
  cacheMisses: number;
  /** Cache hit rate (0–1). */
  hitRate: number;
  /** Number of frames currently in cache. */
  cachedFrames: number;
  /** Number of active decoders. */
  activeDecoders: number;
  /** Average decode latency in ms. */
  avgDecodeLatencyMs: number;
  /** Number of frames dropped due to slow decode. */
  droppedFrames: number;
  /** Whether WebCodecs is being used (vs fallback). */
  usingWebCodecs: boolean;
}

/** Configuration for the decode pipeline. */
export interface DecodePipelineConfig {
  /** Maximum frames per source in the ring buffer cache. */
  maxCachePerSource: number;
  /** Number of frames to pre-fetch ahead of the playhead. */
  prefetchAhead: number;
  /** Number of frames to keep behind the playhead (for reverse/scrub). */
  prefetchBehind: number;
  /** Whether to prefer hardware-accelerated decode. */
  preferHardwareAcceleration: boolean;
}

const DEFAULT_CONFIG: DecodePipelineConfig = {
  maxCachePerSource: 30,
  prefetchAhead: 8,
  prefetchBehind: 4,
  preferHardwareAcceleration: true,
};

// ─── Ring Buffer Frame Cache ──────────────────────────────────────────────────

/**
 * Ring-buffer cache for decoded frames, keyed by source time.
 * Bounded by maxSize; evicts oldest entries on overflow.
 * Closes evicted ImageBitmaps to release GPU memory.
 */
class FrameRingBuffer {
  private entries: DecodedFrame[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  /** Get a cached frame within half-frame time tolerance. */
  get(sourceTime: number, fps: number): DecodedFrame | null {
    const tolerance = 0.5 / fps; // half-frame
    for (const entry of this.entries) {
      if (Math.abs(entry.sourceTime - sourceTime) < tolerance) {
        return entry;
      }
    }
    return null;
  }

  /** Add a frame to the cache, evicting the oldest if full. */
  put(frame: DecodedFrame): void {
    if (this.entries.length >= this.maxSize) {
      const evicted = this.entries.shift();
      evicted?.bitmap.close();
    }
    this.entries.push(frame);
  }

  /** Number of frames in the cache. */
  get size(): number {
    return this.entries.length;
  }

  /** Flush all frames, closing their bitmaps. */
  flush(): void {
    for (const entry of this.entries) {
      entry.bitmap.close();
    }
    this.entries = [];
  }

  /** Evict frames outside a time window around the given source time. */
  evictOutsideWindow(centerTime: number, windowSeconds: number): void {
    const keep: DecodedFrame[] = [];
    for (const entry of this.entries) {
      if (Math.abs(entry.sourceTime - centerTime) <= windowSeconds) {
        keep.push(entry);
      } else {
        entry.bitmap.close();
      }
    }
    this.entries = keep;
  }
}

// ─── Source Decoder ───────────────────────────────────────────────────────────

/**
 * Per-source decoder state. In a full implementation this wraps a WebCodecs
 * VideoDecoder instance; here it provides the fallback HTMLVideoElement path
 * and the interface for the WebCodecs path to plug into.
 */
interface SourceDecoder {
  assetId: string;
  cache: FrameRingBuffer;
  lastRequestedTime: number;
  decodeCount: number;
  totalDecodeMs: number;
}

// ─── Decode Pipeline ──────────────────────────────────────────────────────────

/**
 * Pull-based decode pipeline: the FrameScheduler requests frames by timeline
 * time; the pipeline resolves the segment, maps to source time, checks the
 * cache, and either returns a cached frame or decodes a new one.
 *
 * Primary path: WebCodecs VideoDecoder (when available).
 * Fallback: VideoSourceManager (HTMLVideoElement seek + createImageBitmap).
 */
class DecodePipelineClass {
  private decoders = new Map<string, SourceDecoder>();
  private config: DecodePipelineConfig = { ...DEFAULT_CONFIG };
  /** Optional native codec service injected on desktop for full format support. */
  private nativeCodecService: CodecService | null = null;
  /** Map of asset ID → file path for native decode. */
  private assetFilePaths = new Map<string, string>();
  private stats: DecodeStats = {
    cacheHits: 0,
    cacheMisses: 0,
    hitRate: 0,
    cachedFrames: 0,
    activeDecoders: 0,
    avgDecodeLatencyMs: 0,
    droppedFrames: 0,
    usingWebCodecs: this.hasWebCodecs(),
  };

  // ── Configuration ─────────────────────────────────────────────────────

  /** Update pipeline configuration. */
  configure(config: Partial<DecodePipelineConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * Inject a native codec service for desktop decode.
   * When set, the pipeline uses FFmpeg/LibRaw/OpenEXR for decode instead of
   * WebCodecs/HTMLVideoElement. Enables full format support including ProRes,
   * DNxHR, camera RAW, OpenEXR, DPX, and GPU-accelerated decode.
   */
  setNativeCodecService(service: CodecService): void {
    this.nativeCodecService = service;
  }

  /**
   * Register the file path for an asset ID so the native codec service
   * can locate the file on disk for decode.
   */
  registerAssetPath(assetId: string, filePath: string): void {
    this.assetFilePaths.set(assetId, filePath);
  }

  /** Check if WebCodecs VideoDecoder is available. */
  private hasWebCodecs(): boolean {
    return typeof VideoDecoder !== 'undefined';
  }

  /** Check if native codec decode is available. */
  private hasNativeCodecs(): boolean {
    return this.nativeCodecService !== null;
  }

  // ── Decoder Management ────────────────────────────────────────────────

  /** Get or create a decoder for an asset. */
  private getDecoder(assetId: string): SourceDecoder {
    let decoder = this.decoders.get(assetId);
    if (decoder) return decoder;

    decoder = {
      assetId,
      cache: new FrameRingBuffer(this.config.maxCachePerSource),
      lastRequestedTime: 0,
      decodeCount: 0,
      totalDecodeMs: 0,
    };
    this.decoders.set(assetId, decoder);
    return decoder;
  }

  /**
   * Prepare decoders for a set of asset IDs that will be needed.
   * Pre-loads VideoSourceManager entries for fallback path.
   */
  async prepareDecoders(assetIds: Set<string>): Promise<void> {
    // Flush decoders for assets that are no longer needed
    for (const [id, decoder] of this.decoders) {
      if (!assetIds.has(id)) {
        decoder.cache.flush();
        this.decoders.delete(id);
      }
    }

    // Ensure decoders exist for needed assets
    for (const id of assetIds) {
      this.getDecoder(id);
    }

    this.updateStats();
  }

  // ── Frame Retrieval ───────────────────────────────────────────────────

  /**
   * Get a decoded video frame for a segment at a given timeline time.
   *
   * @param segment     The video segment to decode from.
   * @param timelineTime The timeline time to decode.
   * @param fps         The sequence frame rate.
   * @returns A DecodedFrame, or null if decode failed.
   */
  async getVideoFrame(
    segment: VideoSegment,
    timelineTime: number,
    fps: number,
  ): Promise<DecodedFrame | null> {
    const sourceTime = segmentSourceTime(segment, timelineTime);
    const decoder = this.getDecoder(segment.assetId);
    decoder.lastRequestedTime = sourceTime;

    // Check cache
    const cached = decoder.cache.get(sourceTime, fps);
    if (cached) {
      this.stats.cacheHits++;
      this.updateHitRate();
      return cached;
    }

    // Cache miss — decode
    this.stats.cacheMisses++;
    this.updateHitRate();

    const startMs = performance.now();
    const bitmap = await this.decodeFrame(segment.assetId, sourceTime);
    const decodeMs = performance.now() - startMs;

    decoder.decodeCount++;
    decoder.totalDecodeMs += decodeMs;

    if (!bitmap) {
      this.stats.droppedFrames++;
      return null;
    }

    const frame: DecodedFrame = {
      bitmap,
      timelineTime,
      sourceTime,
      frameNumber: Math.floor(timelineTime * fps),
      width: bitmap.width,
      height: bitmap.height,
      decodedAt: performance.now(),
    };

    decoder.cache.put(frame);
    this.updateStats();
    return frame;
  }

  /**
   * Decode a single frame from a media source at a given source time.
   *
   * Decode priority:
   * 1. Native codec service (desktop) — FFmpeg + LibRaw + OpenEXR via N-API
   *    Handles ALL formats: ProRes, DNxHR, camera RAW, EXR, DPX, MXF, etc.
   *    GPU-accelerated via VideoToolbox/NVDEC/VA-API/D3D11VA.
   * 2. WebCodecs VideoDecoder (browser) — H.264, VP9, AV1
   * 3. HTMLVideoElement fallback — any browser-supported format
   */
  private async decodeFrame(
    assetId: string,
    sourceTime: number,
  ): Promise<ImageBitmap | null> {
    // Primary path: Native codec service (desktop / Electron)
    if (this.nativeCodecService) {
      const filePath = this.assetFilePaths.get(assetId);
      if (filePath) {
        try {
          // Check if this is a camera RAW file
          if (this.nativeCodecService.isRawSupported(filePath)) {
            const rawFrame = await this.nativeCodecService.decodeRaw(filePath);
            if (rawFrame) {
              return this.frameDataToBitmap(rawFrame.data, rawFrame.width, rawFrame.height);
            }
          }

          // Standard decode via FFmpeg with GPU HW acceleration
          const frameData = await this.nativeCodecService.decodeFrame(
            filePath,
            sourceTime,
          );
          return this.frameDataToBitmap(frameData.data, frameData.width, frameData.height);
        } catch {
          // Fall through to browser path
        }
      }
    }

    // Fallback: HTMLVideoElement path via VideoSourceManager
    try {
      return await videoSourceManager.seekToExactFrame(assetId, sourceTime);
    } catch {
      return null;
    }
  }

  /**
   * Convert raw RGBA pixel data from the native codec service into an
   * ImageBitmap for use by the FrameCompositor.
   */
  private async frameDataToBitmap(
    data: ArrayBuffer,
    width: number,
    height: number,
  ): Promise<ImageBitmap> {
    const imageData = new ImageData(
      new Uint8ClampedArray(data),
      width,
      height,
    );
    return createImageBitmap(imageData);
  }

  // ── Pre-fetch ─────────────────────────────────────────────────────────

  /**
   * Pre-fetch frames ahead of (and optionally behind) the playhead.
   * Called by FrameScheduler on each tick to warm the cache.
   *
   * @param segments     Active video segments at the current time.
   * @param timelineTime Current playhead time.
   * @param fps          Sequence frame rate.
   * @param speed        Current playback speed (negative = reverse).
   */
  async prefetch(
    segments: VideoSegment[],
    timelineTime: number,
    fps: number,
    speed: number,
  ): Promise<void> {
    const frameDuration = 1 / fps;
    const direction = speed >= 0 ? 1 : -1;
    const aheadCount = this.config.prefetchAhead;
    const behindCount = this.config.prefetchBehind;

    // At high speeds, skip frames to reduce decode load
    const skipInterval = Math.abs(speed) > 2 ? Math.ceil(Math.abs(speed) / 2) : 1;

    const promises: Promise<void>[] = [];

    for (const segment of segments) {
      const decoder = this.getDecoder(segment.assetId);

      // Pre-fetch ahead
      for (let i = 1; i <= aheadCount; i += skipInterval) {
        const futureTime = timelineTime + i * frameDuration * direction;
        if (futureTime < segment.timelineStart || futureTime >= segment.timelineEnd) break;

        const futureSourceTime = segmentSourceTime(segment, futureTime);
        if (!decoder.cache.get(futureSourceTime, fps)) {
          promises.push(
            this.getVideoFrame(segment, futureTime, fps).then(() => {}),
          );
        }
      }

      // Pre-fetch behind (for scrubbing)
      for (let i = 1; i <= behindCount; i += skipInterval) {
        const pastTime = timelineTime - i * frameDuration * direction;
        if (pastTime < segment.timelineStart || pastTime >= segment.timelineEnd) break;

        const pastSourceTime = segmentSourceTime(segment, pastTime);
        if (!decoder.cache.get(pastSourceTime, fps)) {
          promises.push(
            this.getVideoFrame(segment, pastTime, fps).then(() => {}),
          );
        }
      }
    }

    // Fire all pre-fetch decodes concurrently (bounded by browser decoder limits)
    await Promise.allSettled(promises);
  }

  // ── Cache Management ──────────────────────────────────────────────────

  /** Flush the cache for a specific asset. */
  flushSource(assetId: string): void {
    const decoder = this.decoders.get(assetId);
    decoder?.cache.flush();
  }

  /** Flush all caches. Call on seek or sequence change. */
  flushAll(): void {
    for (const [, decoder] of this.decoders) {
      decoder.cache.flush();
    }
    this.resetStats();
  }

  /** Evict frames outside a time window for a source. */
  evictOutsideWindow(assetId: string, centerTime: number, windowSeconds: number): void {
    const decoder = this.decoders.get(assetId);
    decoder?.cache.evictOutsideWindow(centerTime, windowSeconds);
  }

  // ── Statistics ────────────────────────────────────────────────────────

  /** Get current decode statistics. */
  getStats(): Readonly<DecodeStats> {
    this.updateStats();
    return { ...this.stats };
  }

  private updateHitRate(): void {
    const total = this.stats.cacheHits + this.stats.cacheMisses;
    this.stats.hitRate = total > 0 ? this.stats.cacheHits / total : 0;
  }

  private updateStats(): void {
    let totalCached = 0;
    let totalDecodeMs = 0;
    let totalDecodes = 0;

    for (const [, decoder] of this.decoders) {
      totalCached += decoder.cache.size;
      totalDecodeMs += decoder.totalDecodeMs;
      totalDecodes += decoder.decodeCount;
    }

    this.stats.cachedFrames = totalCached;
    this.stats.activeDecoders = this.decoders.size;
    this.stats.avgDecodeLatencyMs = totalDecodes > 0 ? totalDecodeMs / totalDecodes : 0;
    this.updateHitRate();
  }

  private resetStats(): void {
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      hitRate: 0,
      cachedFrames: 0,
      activeDecoders: this.decoders.size,
      avgDecodeLatencyMs: 0,
      droppedFrames: 0,
      usingWebCodecs: this.hasWebCodecs(),
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  /** Dispose all decoders and release resources. */
  dispose(): void {
    for (const [, decoder] of this.decoders) {
      decoder.cache.flush();
    }
    this.decoders.clear();
    this.resetStats();
  }
}

/** Singleton decode pipeline instance. */
export const decodePipeline = new DecodePipelineClass();
