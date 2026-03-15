// =============================================================================
//  THE AVID — Multi-Resolution Composited Frame Cache
//  Proximity-aware LRU cache for composited timeline frames.
//  Stores frames as OffscreenCanvas/HTMLCanvasElement for GPU-accelerated
//  canvas-to-canvas blitting (avoids expensive getImageData/putImageData).
// =============================================================================

export type FrameCacheQuality = 'scrub' | 'preview' | 'full';

interface CacheEntry {
  canvas: HTMLCanvasElement;
  quality: FrameCacheQuality;
  frameNumber: number;
  lastAccessed: number;
  sizeBytes: number;
}

interface FrameCacheConfig {
  /** Maximum memory budget in bytes. */
  maxMemoryBytes: number;
  /** Maximum number of entries per quality tier. */
  maxEntriesPerTier: number;
}

const DEFAULT_CONFIG: FrameCacheConfig = {
  // Default 100MB — will be adjusted per platform
  maxMemoryBytes: 100 * 1024 * 1024,
  maxEntriesPerTier: 60,
};

function detectPlatformConfig(): FrameCacheConfig {
  if (typeof navigator === 'undefined') return DEFAULT_CONFIG;

  // Desktop Electron — generous budget
  const isElectron = typeof window !== 'undefined'
    && 'electronAPI' in window;
  if (isElectron) {
    return { maxMemoryBytes: 200 * 1024 * 1024, maxEntriesPerTier: 100 };
  }

  // Mobile — constrained
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);
  if (isMobile) {
    return { maxMemoryBytes: 50 * 1024 * 1024, maxEntriesPerTier: 30 };
  }

  // Browser desktop — use deviceMemory API if available
  const deviceMemory = (navigator as any).deviceMemory;
  if (typeof deviceMemory === 'number' && deviceMemory < 4) {
    return { maxMemoryBytes: 60 * 1024 * 1024, maxEntriesPerTier: 40 };
  }

  return DEFAULT_CONFIG;
}

/**
 * Multi-resolution frame cache with proximity-aware eviction.
 *
 * Design principles:
 * - Stores composited frames as HTMLCanvasElement (GPU-backed)
 * - Drawing canvas-to-canvas via drawImage() is hardware-accelerated
 * - Three quality tiers: scrub (quarter-res), preview (full-res, draft effects), full
 * - Proximity-based eviction: frames near playhead have higher priority
 * - Cut-point pinning: frames at clip boundaries are kept longer
 */
export class CompositeFrameCache {
  private scrubCache = new Map<string, CacheEntry>();
  private previewCache = new Map<string, CacheEntry>();
  private fullCache = new Map<string, CacheEntry>();
  private config: FrameCacheConfig;
  private currentMemoryBytes = 0;
  private playheadFrame = 0;

  constructor(config?: Partial<FrameCacheConfig>) {
    const platform = detectPlatformConfig();
    this.config = { ...platform, ...config };
  }

  /** Update the current playhead position for proximity calculations. */
  setPlayheadFrame(frame: number): void {
    this.playheadFrame = frame;
  }

  /** Get a cached frame if available. */
  get(key: string, quality: FrameCacheQuality): HTMLCanvasElement | null {
    const cache = this.getCacheForQuality(quality);
    const entry = cache.get(key);
    if (!entry) return null;
    entry.lastAccessed = performance.now();
    return entry.canvas;
  }

  /** Try to get the best available quality for a frame key. */
  getBestAvailable(key: string): { canvas: HTMLCanvasElement; quality: FrameCacheQuality } | null {
    // Check in quality order: full > preview > scrub
    for (const quality of ['full', 'preview', 'scrub'] as FrameCacheQuality[]) {
      const canvas = this.get(key, quality);
      if (canvas) return { canvas, quality };
    }
    return null;
  }

  /** Store a composited frame in the cache. */
  put(key: string, sourceCanvas: HTMLCanvasElement, quality: FrameCacheQuality, frameNumber: number): void {
    const cache = this.getCacheForQuality(quality);

    // Don't re-store if already cached at this quality
    if (cache.has(key)) return;

    // Clone the canvas (the source may be reused)
    const clone = document.createElement('canvas');
    clone.width = sourceCanvas.width;
    clone.height = sourceCanvas.height;
    const ctx = clone.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(sourceCanvas, 0, 0);

    const sizeBytes = clone.width * clone.height * 4; // RGBA

    // Evict if needed
    while (
      this.currentMemoryBytes + sizeBytes > this.config.maxMemoryBytes ||
      cache.size >= this.config.maxEntriesPerTier
    ) {
      if (!this.evictOne(cache)) break;
    }

    const entry: CacheEntry = {
      canvas: clone,
      quality,
      frameNumber,
      lastAccessed: performance.now(),
      sizeBytes,
    };

    cache.set(key, entry);
    this.currentMemoryBytes += sizeBytes;
  }

  /** Draw a cached frame to a target canvas. Returns true if cache hit. */
  drawTo(
    key: string,
    quality: FrameCacheQuality,
    targetCtx: CanvasRenderingContext2D,
    targetW: number,
    targetH: number,
  ): boolean {
    const cached = this.get(key, quality);
    if (!cached) return false;
    targetCtx.drawImage(cached, 0, 0, targetW, targetH);
    return true;
  }

  /** Draw best available quality to target. Returns quality used or null. */
  drawBestTo(
    key: string,
    targetCtx: CanvasRenderingContext2D,
    targetW: number,
    targetH: number,
  ): FrameCacheQuality | null {
    const best = this.getBestAvailable(key);
    if (!best) return null;
    targetCtx.drawImage(best.canvas, 0, 0, targetW, targetH);
    return best.quality;
  }

  /** Invalidate all cache entries (e.g., after an edit). */
  invalidateAll(): void {
    this.scrubCache.clear();
    this.previewCache.clear();
    this.fullCache.clear();
    this.currentMemoryBytes = 0;
  }

  /** Invalidate entries matching a predicate. */
  invalidateWhere(predicate: (key: string, entry: CacheEntry) => boolean): void {
    for (const cache of [this.scrubCache, this.previewCache, this.fullCache]) {
      for (const [key, entry] of cache) {
        if (predicate(key, entry)) {
          this.currentMemoryBytes -= entry.sizeBytes;
          cache.delete(key);
        }
      }
    }
  }

  /** Get cache statistics. */
  getStats(): { scrub: number; preview: number; full: number; memoryMB: number } {
    return {
      scrub: this.scrubCache.size,
      preview: this.previewCache.size,
      full: this.fullCache.size,
      memoryMB: Math.round(this.currentMemoryBytes / (1024 * 1024) * 10) / 10,
    };
  }

  private getCacheForQuality(quality: FrameCacheQuality): Map<string, CacheEntry> {
    switch (quality) {
      case 'scrub': return this.scrubCache;
      case 'preview': return this.previewCache;
      case 'full': return this.fullCache;
    }
  }

  /**
   * Evict the least valuable entry from a cache tier.
   * Priority: furthest from playhead + least recently accessed.
   */
  private evictOne(cache: Map<string, CacheEntry>): boolean {
    if (cache.size === 0) return false;

    let worstKey: string | null = null;
    let worstScore = -Infinity;

    for (const [key, entry] of cache) {
      // Score = distance from playhead + time since last access
      const distance = Math.abs(entry.frameNumber - this.playheadFrame);
      const age = performance.now() - entry.lastAccessed;
      const score = distance * 10 + age / 1000;
      if (score > worstScore) {
        worstScore = score;
        worstKey = key;
      }
    }

    if (worstKey) {
      const entry = cache.get(worstKey)!;
      this.currentMemoryBytes -= entry.sizeBytes;
      cache.delete(worstKey);
      return true;
    }
    return false;
  }
}

/** Singleton frame cache instance. */
export const compositeFrameCache = new CompositeFrameCache();
