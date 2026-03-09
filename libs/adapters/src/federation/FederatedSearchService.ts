/**
 * @fileoverview Service that merges results from the local mesh vector
 * search with remote Avid Content Core queries into a single ranked list.
 *
 * {@link FederatedSearchService} executes both search backends in parallel
 * via `Promise.allSettled`, normalizes and merges the results through
 * {@link ResultMerger}, and caches remote results through
 * {@link CacheManager}.
 */

import type { IContentCoreAdapter } from '../IContentCoreAdapter';
import type { ArchiveResult } from '../contracts-types';
import { CacheManager } from './CacheManager';
import {
  ResultMerger,
  type FederatedResult,
  type LocalSearchResult,
} from './ResultMerger';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the {@link FederatedSearchService}.
 *
 * All fields are optional -- the service degrades gracefully when a backend
 * is unavailable.
 */
export interface FederatedSearchConfig {
  /**
   * Function that queries the local mesh / vector DB.
   *
   * Receives the raw query string and a `topK` parameter and should
   * return ranked local results.
   */
  readonly localSearchFn?: (
    query: string,
    topK: number,
  ) => Promise<LocalSearchResult[]>;

  /** Adapter for the remote Content Core asset management system. */
  readonly contentCoreAdapter?: IContentCoreAdapter;

  /**
   * Cache manager for remote results.  If omitted a private instance
   * with default TTL is created.
   */
  readonly cacheManager?: CacheManager;

  /** Default number of results to return.  Defaults to 20. */
  readonly defaultTopK?: number;

  /**
   * Timeout in milliseconds for individual search backends.
   * Defaults to 5 000 ms.
   */
  readonly searchTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Result envelope
// ---------------------------------------------------------------------------

/** Aggregated search response from the federated service. */
export interface FederatedSearchResults {
  /** Merged, ranked results. */
  readonly results: readonly FederatedResult[];
  /** Count of results contributed by the local backend. */
  readonly totalLocal: number;
  /** Count of results contributed by the remote backend. */
  readonly totalRemote: number;
  /** Wall-clock time for the entire federated query in milliseconds. */
  readonly queryTimeMs: number;
}

/** Options passed to {@link FederatedSearchService.search}. */
export interface FederatedSearchOptions {
  /** Maximum results to return. */
  readonly topK?: number;
  /** Whether to include remote Content Core results.  Defaults to `true`. */
  readonly includeRemote?: boolean;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_TOP_K = 20;
const DEFAULT_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Federated search across the local knowledge mesh and remote
 * Content Core.
 *
 * @example
 * ```ts
 * const service = new FederatedSearchService({
 *   localSearchFn: meshIndex.search.bind(meshIndex),
 *   contentCoreAdapter: new ContentCoreClient(mockAdapter),
 * });
 * const { results } = await service.search('interview skyline');
 * ```
 */
export class FederatedSearchService {
  private readonly localSearchFn?: FederatedSearchConfig['localSearchFn'];
  private readonly contentCoreAdapter?: IContentCoreAdapter;
  private readonly cache: CacheManager;
  private readonly merger: ResultMerger;
  private readonly defaultTopK: number;
  private readonly searchTimeoutMs: number;

  constructor(config: FederatedSearchConfig) {
    this.localSearchFn = config.localSearchFn;
    this.contentCoreAdapter = config.contentCoreAdapter;
    this.cache = config.cacheManager ?? new CacheManager();
    this.merger = new ResultMerger();
    this.defaultTopK = config.defaultTopK ?? DEFAULT_TOP_K;
    this.searchTimeoutMs = config.searchTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Execute a federated search across all configured backends.
   *
   * Local and remote searches run in parallel.  If either backend fails
   * or times out, results from the other backend are still returned.
   *
   * @param query   - Natural-language query string.
   * @param options - Optional overrides for top-K and remote inclusion.
   */
  async search(
    query: string,
    options?: FederatedSearchOptions,
  ): Promise<FederatedSearchResults> {
    const topK = options?.topK ?? this.defaultTopK;
    const includeRemote = options?.includeRemote ?? true;
    const start = Date.now();

    // Build the set of parallel promises.
    const localPromise = this.localSearchFn
      ? this.withTimeout(this.localSearchFn(query, topK), 'local')
      : Promise.resolve([]);

    const remotePromise =
      includeRemote && this.contentCoreAdapter
        ? this.withTimeout(this.fetchRemote(query), 'remote')
        : Promise.resolve([]);

    const [localSettled, remoteSettled] = await Promise.allSettled([
      localPromise,
      remotePromise,
    ]);

    const localResults: LocalSearchResult[] =
      localSettled.status === 'fulfilled' ? localSettled.value : [];
    const remoteResults: FederatedResult[] =
      remoteSettled.status === 'fulfilled' ? remoteSettled.value : [];

    // Cache remote results under the query key.
    if (remoteResults.length > 0) {
      this.cache.set(`query:${query}`, remoteResults, 'content-core');
    }

    const merged = this.merger.merge(localResults, remoteResults, topK);

    return {
      results: merged,
      totalLocal: localResults.length,
      totalRemote: remoteResults.length,
      queryTimeMs: Date.now() - start,
    };
  }

  /**
   * Lazy-hydrate a previously returned stub or summary result to full
   * detail by fetching from the Content Core adapter.
   *
   * @param resultId - The `id` of a result previously returned by
   *                   {@link search}.
   * @returns A {@link FederatedResult} at `full` hydration, or `null` if
   *          the Content Core adapter is not configured.
   * @throws If the asset cannot be found in the remote system.
   */
  async hydrate(resultId: string): Promise<FederatedResult> {
    if (!this.contentCoreAdapter) {
      throw new Error(
        'Cannot hydrate: no Content Core adapter is configured.',
      );
    }

    const detail = await this.contentCoreAdapter.getAssetDetail(
      resultId,
      'full',
    );
    const rights = await this.contentCoreAdapter.getRightsStatus(resultId);

    const hydrated: FederatedResult = {
      id: detail.id,
      source: 'content-core',
      score: 1, // fully hydrated, relevance already established
      title: detail.name,
      description: detail.description,
      sourceType: detail.mediaRef.mimeType,
      rights: {
        status: rights,
        license: detail.rights.licenseType,
        restrictions: [...detail.rights.restrictions],
      },
      hydrationLevel: 'full',
      cachedAt: new Date().toISOString(),
    };

    // Update cache.
    this.cache.set(`asset:${resultId}`, hydrated, 'content-core');

    return hydrated;
  }

  /**
   * Return previously cached results for a query, or `null` if the cache
   * has expired or the query has not been seen.
   */
  getCached(query: string): FederatedResult[] | null {
    const entry = this.cache.get<FederatedResult[]>(`query:${query}`);
    return entry?.data ?? null;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Convert remote {@link ArchiveResult} entries into
   * {@link FederatedResult} stubs.
   */
  private async fetchRemote(query: string): Promise<FederatedResult[]> {
    const results = await this.contentCoreAdapter!.searchMetadata(query);
    return results.map((r, idx) => this.archiveToFederated(r, idx, results.length));
  }

  /** Map a single {@link ArchiveResult} to a {@link FederatedResult}. */
  private archiveToFederated(
    result: ArchiveResult,
    index: number,
    total: number,
  ): FederatedResult {
    // Synthesize a score from ordinal position (the adapter already sorted).
    const score = total > 1 ? 1 - index / (total - 1) : 1;
    return {
      id: result.id,
      source: 'content-core',
      score,
      title: result.name,
      description: result.description,
      sourceType: result.mediaRef.mimeType,
      rights: {
        status: result.rightsStatus,
        license: result.rights.licenseType,
        restrictions: [...result.rights.restrictions],
      },
      hydrationLevel: 'summary',
      cachedAt: new Date().toISOString(),
    };
  }

  /**
   * Wrap a promise with a timeout.  If the promise does not resolve
   * within {@link searchTimeoutMs} the timeout wins and an empty array
   * is returned.
   */
  private withTimeout<T>(promise: Promise<T[]>, label: string): Promise<T[]> {
    return new Promise<T[]>((resolve) => {
      const timer = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.warn(
          `[FederatedSearchService] ${label} search timed out after ${this.searchTimeoutMs} ms`,
        );
        resolve([]);
      }, this.searchTimeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          // eslint-disable-next-line no-console
          console.warn(
            `[FederatedSearchService] ${label} search failed:`,
            err,
          );
          resolve([]);
        });
    });
  }
}
