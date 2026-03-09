// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — NEXIS Cache Manager (NX-02)
//  Local SSD caching layer for NEXIS shared storage.
//  Features: configurable cache size, bin-open prefetch, bandwidth throttle,
//  cache status indicators, LRU eviction with project-pinning.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Types ─────────────────────────────────────────────────────────────────

export type CacheEntryStatus = 'cached' | 'fetching' | 'partial' | 'evicted' | 'missing';
export type CacheHealthIndicator = 'green' | 'yellow' | 'gray';

export interface CacheEntry {
  id: string;
  assetId: string;
  fileName: string;
  sourceWorkspace: string;
  sourcePath: string;
  localCachePath: string;
  sizeBytes: number;
  cachedBytes: number;
  status: CacheEntryStatus;
  healthIndicator: CacheHealthIndicator;
  prefetchedSeconds: number;
  totalDurationSeconds: number;
  lastAccessedAt: number; // epoch ms
  createdAt: number;
  isPinned: boolean;
  pinnedByProjectId: string | null;
}

export interface CacheStats {
  totalCapacityBytes: number;
  usedBytes: number;
  freeBytes: number;
  entryCount: number;
  pinnedCount: number;
  hitRate: number; // 0-1
  missRate: number;
  totalHits: number;
  totalMisses: number;
  averageFetchTimeMs: number;
  bandwidthUsageMbps: number;
}

export interface CachePrefetchRequest {
  assetId: string;
  fileName: string;
  sourceWorkspace: string;
  sourcePath: string;
  totalDurationSeconds: number;
  sizeBytes: number;
  prefetchDurationSeconds: number;
  priority: 'low' | 'normal' | 'high';
}

export interface CacheManagerConfig {
  maxCacheBytes: number; // default 100 GB
  prefetchOnBinOpen: boolean;
  prefetchDurationSeconds: number; // default 30s per clip
  bandwidthThrottleMbps: number; // 0 = unlimited
  evictionPolicy: 'lru' | 'lru-pinned'; // lru-pinned respects project pins
  minFreeSpaceBytes: number;
  cacheRootPath: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_CACHE_SIZE = 100 * 1024 * 1024 * 1024; // 100 GB
const DEFAULT_PREFETCH_DURATION = 30; // 30 seconds
const DEFAULT_MIN_FREE_SPACE = 5 * 1024 * 1024 * 1024; // 5 GB

// ─── Cache Manager ─────────────────────────────────────────────────────────

export class NEXISCacheManager {
  private config: CacheManagerConfig;
  private entries: Map<string, CacheEntry> = new Map();
  private stats: CacheStats;
  private fetchQueue: CachePrefetchRequest[] = [];
  private activeFetches = 0;
  private maxConcurrentFetches = 3;
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor(config?: Partial<CacheManagerConfig>) {
    this.config = {
      maxCacheBytes: config?.maxCacheBytes ?? DEFAULT_CACHE_SIZE,
      prefetchOnBinOpen: config?.prefetchOnBinOpen ?? true,
      prefetchDurationSeconds: config?.prefetchDurationSeconds ?? DEFAULT_PREFETCH_DURATION,
      bandwidthThrottleMbps: config?.bandwidthThrottleMbps ?? 0,
      evictionPolicy: config?.evictionPolicy ?? 'lru-pinned',
      minFreeSpaceBytes: config?.minFreeSpaceBytes ?? DEFAULT_MIN_FREE_SPACE,
      cacheRootPath: config?.cacheRootPath ?? '/tmp/avid-nexis-cache',
    };

    this.stats = {
      totalCapacityBytes: this.config.maxCacheBytes,
      usedBytes: 0,
      freeBytes: this.config.maxCacheBytes,
      entryCount: 0,
      pinnedCount: 0,
      hitRate: 0,
      missRate: 0,
      totalHits: 0,
      totalMisses: 0,
      averageFetchTimeMs: 0,
      bandwidthUsageMbps: 0,
    };
  }

  // ─── Cache Operations ──────────────────────────────────────────────

  /**
   * Gets a cached asset. Returns the entry if cached, triggers fetch if not.
   */
  get(assetId: string): CacheEntry | null {
    const entry = this.entries.get(assetId);
    if (entry && entry.status === 'cached') {
      entry.lastAccessedAt = Date.now();
      this.stats.totalHits++;
      this.updateHitRate();
      return entry;
    }

    this.stats.totalMisses++;
    this.updateHitRate();
    return entry ?? null;
  }

  /**
   * Gets the cache health indicator for an asset.
   * green = fully cached, yellow = partially cached/fetching, gray = not cached
   */
  getHealthIndicator(assetId: string): CacheHealthIndicator {
    const entry = this.entries.get(assetId);
    if (!entry) return 'gray';
    if (entry.status === 'cached') return 'green';
    if (entry.status === 'fetching' || entry.status === 'partial') return 'yellow';
    return 'gray';
  }

  /**
   * Prefetches assets when a bin is opened.
   * Fetches the first N seconds of each clip (configurable, default 30s).
   */
  prefetchBinAssets(
    assets: Array<{
      assetId: string;
      fileName: string;
      sourceWorkspace: string;
      sourcePath: string;
      durationSeconds: number;
      sizeBytes: number;
    }>,
  ): void {
    if (!this.config.prefetchOnBinOpen) return;

    for (const asset of assets) {
      if (this.entries.has(asset.assetId)) continue;

      const prefetchSize = this.estimatePrefetchSize(
        asset.sizeBytes,
        asset.durationSeconds,
        this.config.prefetchDurationSeconds,
      );

      if (!this.hasSpaceFor(prefetchSize)) {
        this.evict(prefetchSize);
      }

      if (!this.hasSpaceFor(prefetchSize)) {
        this.emit('cache:prefetchSkipped', {
          assetId: asset.assetId,
          reason: 'insufficient-space',
        });
        continue;
      }

      this.enqueueFetch({
        assetId: asset.assetId,
        fileName: asset.fileName,
        sourceWorkspace: asset.sourceWorkspace,
        sourcePath: asset.sourcePath,
        totalDurationSeconds: asset.durationSeconds,
        sizeBytes: asset.sizeBytes,
        prefetchDurationSeconds: this.config.prefetchDurationSeconds,
        priority: 'normal',
      });
    }
  }

  /**
   * Pins an asset to prevent eviction (used for active project media).
   */
  pinAsset(assetId: string, projectId: string): void {
    const entry = this.entries.get(assetId);
    if (entry) {
      entry.isPinned = true;
      entry.pinnedByProjectId = projectId;
      this.stats.pinnedCount = Array.from(this.entries.values()).filter((e) => e.isPinned).length;
      this.emit('cache:pinned', { assetId, projectId });
    }
  }

  /**
   * Unpins an asset, making it eligible for eviction.
   */
  unpinAsset(assetId: string): void {
    const entry = this.entries.get(assetId);
    if (entry) {
      entry.isPinned = false;
      entry.pinnedByProjectId = null;
      this.stats.pinnedCount = Array.from(this.entries.values()).filter((e) => e.isPinned).length;
      this.emit('cache:unpinned', { assetId });
    }
  }

  /**
   * Pins all assets referenced in a project.
   */
  pinProjectAssets(projectId: string, assetIds: string[]): void {
    for (const assetId of assetIds) {
      this.pinAsset(assetId, projectId);
    }
  }

  /**
   * Unpins all assets for a project.
   */
  unpinProjectAssets(projectId: string): void {
    for (const [, entry] of this.entries) {
      if (entry.pinnedByProjectId === projectId) {
        entry.isPinned = false;
        entry.pinnedByProjectId = null;
      }
    }
    this.stats.pinnedCount = Array.from(this.entries.values()).filter((e) => e.isPinned).length;
  }

  /**
   * Manually evicts a specific asset from cache.
   */
  evictAsset(assetId: string): boolean {
    const entry = this.entries.get(assetId);
    if (!entry) return false;

    if (entry.isPinned) {
      this.emit('cache:evictionBlocked', { assetId, reason: 'pinned' });
      return false;
    }

    this.entries.delete(assetId);
    this.stats.usedBytes -= entry.cachedBytes;
    this.stats.freeBytes = this.config.maxCacheBytes - this.stats.usedBytes;
    this.stats.entryCount = this.entries.size;
    this.emit('cache:evicted', { assetId });
    return true;
  }

  /**
   * Clears the entire cache (respects pins if policy is lru-pinned).
   */
  clear(includePinned = false): void {
    if (includePinned) {
      this.entries.clear();
      this.stats.usedBytes = 0;
      this.stats.pinnedCount = 0;
    } else {
      for (const [key, entry] of this.entries) {
        if (!entry.isPinned) {
          this.entries.delete(key);
          this.stats.usedBytes -= entry.cachedBytes;
        }
      }
    }

    this.stats.freeBytes = this.config.maxCacheBytes - this.stats.usedBytes;
    this.stats.entryCount = this.entries.size;
    this.emit('cache:cleared', { includePinned });
  }

  // ─── Stats & Config ────────────────────────────────────────────────

  getStats(): CacheStats {
    return { ...this.stats };
  }

  getEntries(): CacheEntry[] {
    return Array.from(this.entries.values());
  }

  getConfig(): CacheManagerConfig {
    return { ...this.config };
  }

  updateConfig(update: Partial<CacheManagerConfig>): void {
    Object.assign(this.config, update);
    if (update.maxCacheBytes !== undefined) {
      this.stats.totalCapacityBytes = update.maxCacheBytes;
      this.stats.freeBytes = update.maxCacheBytes - this.stats.usedBytes;
    }
    this.emit('config:updated', this.config);
  }

  // ─── Bandwidth Throttle ────────────────────────────────────────────

  setBandwidthThrottle(mbps: number): void {
    this.config.bandwidthThrottleMbps = Math.max(0, mbps);
    this.emit('bandwidth:throttle', { mbps: this.config.bandwidthThrottleMbps });
  }

  getBandwidthThrottle(): number {
    return this.config.bandwidthThrottleMbps;
  }

  // ─── Events ────────────────────────────────────────────────────────

  on(event: string, callback: (...args: unknown[]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private emit(event: string, data: unknown): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try { handler(data); } catch { /* swallow */ }
      }
    }
  }

  private hasSpaceFor(sizeBytes: number): boolean {
    return this.stats.freeBytes - sizeBytes >= this.config.minFreeSpaceBytes;
  }

  private estimatePrefetchSize(
    totalSizeBytes: number,
    totalDurationSeconds: number,
    prefetchDurationSeconds: number,
  ): number {
    if (totalDurationSeconds <= 0) return totalSizeBytes;
    const ratio = Math.min(1, prefetchDurationSeconds / totalDurationSeconds);
    return Math.ceil(totalSizeBytes * ratio);
  }

  private evict(requiredBytes: number): void {
    const sortedEntries = Array.from(this.entries.entries())
      .filter(([, entry]) =>
        this.config.evictionPolicy === 'lru-pinned' ? !entry.isPinned : true
      )
      .sort(([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt);

    let freedBytes = 0;
    for (const [key, entry] of sortedEntries) {
      if (freedBytes >= requiredBytes) break;
      this.entries.delete(key);
      freedBytes += entry.cachedBytes;
      this.stats.usedBytes -= entry.cachedBytes;
      this.emit('cache:evicted', { assetId: entry.assetId });
    }

    this.stats.freeBytes = this.config.maxCacheBytes - this.stats.usedBytes;
    this.stats.entryCount = this.entries.size;
  }

  private enqueueFetch(request: CachePrefetchRequest): void {
    this.fetchQueue.push(request);
    this.processFetchQueue();
  }

  private async processFetchQueue(): Promise<void> {
    while (this.fetchQueue.length > 0 && this.activeFetches < this.maxConcurrentFetches) {
      const request = this.fetchQueue.shift();
      if (!request) break;

      this.activeFetches++;
      await this.executeFetch(request);
      this.activeFetches--;
    }
  }

  private async executeFetch(request: CachePrefetchRequest): Promise<void> {
    const prefetchSize = this.estimatePrefetchSize(
      request.sizeBytes,
      request.totalDurationSeconds,
      request.prefetchDurationSeconds,
    );

    const entry: CacheEntry = {
      id: `cache-${request.assetId}`,
      assetId: request.assetId,
      fileName: request.fileName,
      sourceWorkspace: request.sourceWorkspace,
      sourcePath: request.sourcePath,
      localCachePath: `${this.config.cacheRootPath}/${request.assetId}/${request.fileName}`,
      sizeBytes: request.sizeBytes,
      cachedBytes: 0,
      status: 'fetching',
      healthIndicator: 'yellow',
      prefetchedSeconds: 0,
      totalDurationSeconds: request.totalDurationSeconds,
      lastAccessedAt: Date.now(),
      createdAt: Date.now(),
      isPinned: false,
      pinnedByProjectId: null,
    };

    this.entries.set(request.assetId, entry);
    this.emit('cache:fetchStarted', { assetId: request.assetId });

    // Simulate progressive fetch
    entry.cachedBytes = prefetchSize;
    entry.prefetchedSeconds = Math.min(
      request.prefetchDurationSeconds,
      request.totalDurationSeconds,
    );
    entry.status = 'cached';
    entry.healthIndicator = 'green';

    this.stats.usedBytes += prefetchSize;
    this.stats.freeBytes = this.config.maxCacheBytes - this.stats.usedBytes;
    this.stats.entryCount = this.entries.size;

    this.emit('cache:fetchComplete', { assetId: request.assetId, cachedBytes: prefetchSize });
  }

  private updateHitRate(): void {
    const total = this.stats.totalHits + this.stats.totalMisses;
    this.stats.hitRate = total > 0 ? this.stats.totalHits / total : 0;
    this.stats.missRate = total > 0 ? this.stats.totalMisses / total : 0;
  }

  dispose(): void {
    this.fetchQueue = [];
    this.entries.clear();
    this.listeners.clear();
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────

export function createNEXISCacheManager(
  config?: Partial<CacheManagerConfig>,
): NEXISCacheManager {
  return new NEXISCacheManager(config);
}
