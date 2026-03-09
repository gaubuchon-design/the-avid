/**
 * @fileoverview Extended {@link IContentCoreAdapter} implementation that
 * wraps an inner adapter with lazy hydration and result caching.
 *
 * The {@link ContentCoreClient} decorates any `IContentCoreAdapter` (e.g.
 * the {@link MockContentCoreAdapter}) by:
 *
 * 1. Returning *stubs* from search operations (id + score, no heavy
 *    metadata) to keep initial responses fast and small.
 * 2. Tracking a per-result hydration level (`stub` | `summary` | `full`).
 * 3. Caching fully hydrated results via the {@link CacheManager} so that
 *    repeated detail requests hit memory instead of the inner adapter.
 */

import type { IContentCoreAdapter } from '../IContentCoreAdapter';
import type {
  ArchiveResult,
  HydrationLevel,
  RightsStatus,
  SemanticQuery,
  UsageRecord,
} from '../contracts-types';
import { CacheManager } from './CacheManager';

// ---------------------------------------------------------------------------
// Internal hydration tracking
// ---------------------------------------------------------------------------

/** Hydration depth specific to federated results (differs from contracts). */
export type FederatedHydrationLevel = 'stub' | 'summary' | 'full';

/** Tracked metadata for a single result that has passed through the client. */
interface HydrationRecord {
  /** Current hydration depth. */
  level: FederatedHydrationLevel;
  /** The cached archive result at whatever depth we have fetched so far. */
  result: ArchiveResult;
}

// ---------------------------------------------------------------------------
// ContentCoreClient
// ---------------------------------------------------------------------------

/** Source label used when writing to the {@link CacheManager}. */
const CACHE_SOURCE = 'content-core';

/**
 * Decorating adapter that adds lazy hydration and caching on top of any
 * {@link IContentCoreAdapter} implementation.
 *
 * The typical flow is:
 *
 * 1. `searchMetadata` or `semanticSearch` returns lightweight results
 *    (stubs).
 * 2. The consumer calls `getAssetDetail` with a hydration level to
 *    progressively load more data.
 * 3. Fully hydrated results are cached so subsequent requests are free.
 *
 * @example
 * ```ts
 * const client = new ContentCoreClient(new MockContentCoreAdapter());
 * const stubs = await client.semanticSearch({ text: 'interview' });
 * const full  = await client.getAssetDetail(stubs[0].id, 'full');
 * ```
 */
export class ContentCoreClient implements IContentCoreAdapter {
  private readonly inner: IContentCoreAdapter;
  private readonly cache: CacheManager;
  private readonly hydrationMap = new Map<string, HydrationRecord>();

  /**
   * @param inner - The underlying adapter to delegate real work to.
   * @param cache - An optional {@link CacheManager} instance.  If omitted a
   *                private cache with default TTL is created.
   */
  constructor(inner: IContentCoreAdapter, cache?: CacheManager) {
    this.inner = inner;
    this.cache = cache ?? new CacheManager();
  }

  // -----------------------------------------------------------------------
  // Search operations -- return stubs
  // -----------------------------------------------------------------------

  /**
   * Full-text metadata search, returning stub-level results.
   *
   * The inner adapter is called for the full search, but results are
   * stored at *stub* hydration level to keep the initial payload lean.
   */
  async searchMetadata(
    query: string,
    filters?: Record<string, unknown>,
  ): Promise<ArchiveResult[]> {
    const results = await this.inner.searchMetadata(query, filters);
    return results.map((r) => this.trackResult(r, 'stub'));
  }

  /**
   * Semantic / vector search, returning stub-level results.
   */
  async semanticSearch(query: SemanticQuery): Promise<ArchiveResult[]> {
    const results = await this.inner.semanticSearch(query);
    return results.map((r) => this.trackResult(r, 'stub'));
  }

  // -----------------------------------------------------------------------
  // Detail -- lazy hydration
  // -----------------------------------------------------------------------

  /**
   * Retrieve asset detail, honouring the requested hydration level.
   *
   * If the asset is already cached at or above the requested level the
   * cached copy is returned immediately.  Otherwise the inner adapter is
   * called and the cache is updated.
   *
   * @param assetId        - Asset to fetch.
   * @param hydrationLevel - One of `'summary'`, `'standard'`, or `'full'`.
   *                         Mapped internally to the federated hydration
   *                         levels (`stub` / `summary` / `full`).
   */
  async getAssetDetail(
    assetId: string,
    hydrationLevel?: HydrationLevel,
  ): Promise<ArchiveResult> {
    const targetLevel = this.mapHydrationLevel(hydrationLevel ?? 'standard');

    // Fast path: already hydrated to the desired depth.
    const existing = this.hydrationMap.get(assetId);
    if (existing && this.levelSufficient(existing.level, targetLevel)) {
      return { ...existing.result };
    }

    // Check the TTL cache.
    const cached = this.cache.get<ArchiveResult>(`asset:${assetId}`);
    if (cached) {
      this.hydrationMap.set(assetId, {
        level: 'full',
        result: cached.data,
      });
      return { ...cached.data };
    }

    // Delegate to the inner adapter.
    const result = await this.inner.getAssetDetail(assetId, hydrationLevel);
    this.hydrationMap.set(assetId, { level: targetLevel, result });
    this.cache.set(`asset:${assetId}`, result, CACHE_SOURCE);
    return { ...result };
  }

  // -----------------------------------------------------------------------
  // Pass-through operations
  // -----------------------------------------------------------------------

  /** Look up the rights status for an asset. */
  async getRightsStatus(assetId: string): Promise<RightsStatus> {
    return this.inner.getRightsStatus(assetId);
  }

  /** Retrieve usage history for an asset. */
  async getUsageHistory(assetId: string): Promise<UsageRecord[]> {
    return this.inner.getUsageHistory(assetId);
  }

  /** Batch-check asset availability. */
  async checkAvailability(assetIds: string[]): Promise<Map<string, boolean>> {
    return this.inner.checkAvailability(assetIds);
  }

  // -----------------------------------------------------------------------
  // Hydration inspection (non-interface helpers)
  // -----------------------------------------------------------------------

  /**
   * Return the current hydration level for a previously-seen asset.
   *
   * Returns `undefined` if the asset has never been returned by a search
   * or detail call through this client instance.
   */
  getHydrationLevel(assetId: string): FederatedHydrationLevel | undefined {
    return this.hydrationMap.get(assetId)?.level;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Store an {@link ArchiveResult} in the hydration map at the given depth,
   * but only if it has not already been stored at a *higher* depth.
   */
  private trackResult(
    result: ArchiveResult,
    level: FederatedHydrationLevel,
  ): ArchiveResult {
    const existing = this.hydrationMap.get(result.id);
    if (!existing || !this.levelSufficient(existing.level, level)) {
      this.hydrationMap.set(result.id, { level, result });
    }
    return result;
  }

  /** Map the contracts `HydrationLevel` to the federated three-tier enum. */
  private mapHydrationLevel(level: HydrationLevel): FederatedHydrationLevel {
    switch (level) {
      case 'summary':
        return 'summary';
      case 'standard':
        return 'summary';
      case 'full':
        return 'full';
      default:
        return 'summary';
    }
  }

  /** Returns `true` if `current` is at least as detailed as `required`. */
  private levelSufficient(
    current: FederatedHydrationLevel,
    required: FederatedHydrationLevel,
  ): boolean {
    const order: Record<FederatedHydrationLevel, number> = {
      stub: 0,
      summary: 1,
      full: 2,
    };
    return order[current] >= order[required];
  }
}
