/**
 * @fileoverview Tests for Phase 7 -- Content Core Federation.
 *
 * Covers:
 * - {@link FederatedSearchService}: parallel search, merge, caching
 * - {@link ContentCoreClient}: lazy hydration, stub/summary/full levels
 * - {@link ResultMerger}: score normalization, deduplication, topK
 * - {@link CacheManager}: set/get, TTL expiry, pruning, stats
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheManager } from '../CacheManager';
import {
  ResultMerger,
  type FederatedResult,
  type LocalSearchResult,
} from '../ResultMerger';
import { ContentCoreClient } from '../ContentCoreClient';
import {
  FederatedSearchService,
  type FederatedSearchConfig,
} from '../FederatedSearchService';
import { MockContentCoreAdapter } from '../../MockContentCoreAdapter';

// ---------------------------------------------------------------------------
// CacheManager
// ---------------------------------------------------------------------------

describe('CacheManager', () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager(1_000); // 1 second TTL for fast tests
  });

  it('stores and retrieves a value', () => {
    cache.set('key1', { foo: 'bar' }, 'test-source');
    const entry = cache.get<{ foo: string }>('key1');
    expect(entry).not.toBeNull();
    expect(entry!.data.foo).toBe('bar');
    expect(entry!.source).toBe('test-source');
  });

  it('returns null for a missing key', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('tracks hits and misses', () => {
    cache.set('k', 1, 's');
    cache.get('k'); // hit
    cache.get('k'); // hit
    cache.get('missing'); // miss
    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
  });

  it('evicts entries after TTL expires', async () => {
    cache = new CacheManager(50); // 50 ms TTL
    cache.set('short-lived', 42, 'src');
    expect(cache.get('short-lived')).not.toBeNull();

    // Wait for expiry
    await new Promise((r) => setTimeout(r, 80));
    expect(cache.get('short-lived')).toBeNull();
  });

  it('has() returns false for expired entries', async () => {
    cache = new CacheManager(50);
    cache.set('item', 'val', 'src');
    expect(cache.has('item')).toBe(true);
    await new Promise((r) => setTimeout(r, 80));
    expect(cache.has('item')).toBe(false);
  });

  it('invalidates a single entry', () => {
    cache.set('a', 1, 'src');
    cache.set('b', 2, 'src');
    cache.invalidate('a');
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).not.toBeNull();
  });

  it('invalidates all entries from a given source', () => {
    cache.set('x', 1, 'alpha');
    cache.set('y', 2, 'alpha');
    cache.set('z', 3, 'beta');
    cache.invalidateBySource('alpha');
    expect(cache.get('x')).toBeNull();
    expect(cache.get('y')).toBeNull();
    expect(cache.get('z')).not.toBeNull();
  });

  it('prune() removes expired entries and returns count', async () => {
    cache = new CacheManager(50);
    cache.set('a', 1, 's');
    cache.set('b', 2, 's');
    cache.set('c', 3, 's', 10_000); // long TTL

    await new Promise((r) => setTimeout(r, 80));
    const pruned = cache.prune();
    expect(pruned).toBe(2);
    expect(cache.getStats().size).toBe(1);
  });

  it('clear() resets everything', () => {
    cache.set('a', 1, 's');
    cache.get('a');
    cache.clear();
    const stats = cache.getStats();
    expect(stats.size).toBe(0);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.evictions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ResultMerger
// ---------------------------------------------------------------------------

describe('ResultMerger', () => {
  let merger: ResultMerger;

  beforeEach(() => {
    merger = new ResultMerger(1.1); // default boost
  });

  const makeLocal = (id: string, score: number): LocalSearchResult => ({
    id,
    score,
    sourceType: 'transcript',
  });

  const makeRemote = (id: string, score: number): FederatedResult => ({
    id,
    source: 'content-core',
    score,
    hydrationLevel: 'summary',
  });

  it('merges local and remote results sorted by normalized score', () => {
    const local = [makeLocal('a', 0.9), makeLocal('b', 0.5)];
    const remote = [makeRemote('c', 0.8), makeRemote('d', 0.3)];
    const merged = merger.merge(local, remote, 10);

    expect(merged.length).toBe(4);
    // Scores should be descending
    for (let i = 1; i < merged.length; i++) {
      expect(merged[i].score).toBeLessThanOrEqual(merged[i - 1].score);
    }
  });

  it('respects topK limit', () => {
    const local = [makeLocal('a', 1), makeLocal('b', 0.8)];
    const remote = [makeRemote('c', 0.9), makeRemote('d', 0.7)];
    const merged = merger.merge(local, remote, 2);
    expect(merged.length).toBe(2);
  });

  it('deduplicates by id, keeping the higher-scored entry', () => {
    const local = [makeLocal('same_id', 0.9)];
    const remote = [makeRemote('same_id', 0.2)];
    const merged = merger.merge(local, remote, 10);
    expect(merged.length).toBe(1);
    expect(merged[0].id).toBe('same_id');
  });

  it('handles empty local results', () => {
    const remote = [makeRemote('r1', 0.8)];
    const merged = merger.merge([], remote, 5);
    expect(merged.length).toBe(1);
    expect(merged[0].source).toBe('content-core');
  });

  it('handles empty remote results', () => {
    const local = [makeLocal('l1', 0.7)];
    const merged = merger.merge(local, [], 5);
    expect(merged.length).toBe(1);
    expect(merged[0].source).toBe('local');
  });

  it('handles both lists empty', () => {
    const merged = merger.merge([], [], 5);
    expect(merged.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ContentCoreClient
// ---------------------------------------------------------------------------

describe('ContentCoreClient', () => {
  let mock: MockContentCoreAdapter;
  let client: ContentCoreClient;

  beforeEach(() => {
    mock = new MockContentCoreAdapter();
    client = new ContentCoreClient(mock);
  });

  it('searchMetadata returns results and tracks them at stub level', async () => {
    const results = await client.searchMetadata('interview');
    expect(results.length).toBeGreaterThan(0);
    // Hydration level should be stub for newly searched results
    expect(client.getHydrationLevel(results[0].id)).toBe('stub');
  });

  it('semanticSearch returns results', async () => {
    const results = await client.semanticSearch({ text: 'skyline timelapse' });
    expect(results.length).toBeGreaterThan(0);
  });

  it('getAssetDetail upgrades hydration to full', async () => {
    // First search to populate stubs.
    const results = await client.searchMetadata('interview');
    expect(results.length).toBeGreaterThan(0);

    const id = results[0].id;
    expect(client.getHydrationLevel(id)).toBe('stub');

    // Now hydrate to full.
    const detail = await client.getAssetDetail(id, 'full');
    expect(detail.id).toBe(id);
    expect(client.getHydrationLevel(id)).toBe('full');
  });

  it('getAssetDetail uses cache on repeated calls', async () => {
    const spy = vi.spyOn(mock, 'getAssetDetail');
    await client.getAssetDetail('arc_001', 'full');
    await client.getAssetDetail('arc_001', 'full');
    // Second call should come from cache, so inner should only be called once.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('getRightsStatus delegates to inner adapter', async () => {
    const status = await client.getRightsStatus('arc_001');
    expect(status).toBe('cleared');
  });

  it('checkAvailability delegates to inner adapter', async () => {
    const avail = await client.checkAvailability(['arc_001', 'arc_010']);
    expect(avail.get('arc_001')).toBe(true);
    expect(avail.get('arc_010')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FederatedSearchService
// ---------------------------------------------------------------------------

describe('FederatedSearchService', () => {
  let service: FederatedSearchService;
  let mockAdapter: MockContentCoreAdapter;
  let localSearchFn: FederatedSearchConfig['localSearchFn'];

  beforeEach(() => {
    mockAdapter = new MockContentCoreAdapter();

    localSearchFn = async (query: string, topK: number) => {
      // Return a few fake local results matching "interview".
      if (!query.toLowerCase().includes('interview')) return [];
      return [
        { id: 'local_001', score: 0.95, sourceType: 'transcript', text: 'Interview segment' },
        { id: 'local_002', score: 0.80, sourceType: 'embedding' },
      ].slice(0, topK);
    };

    service = new FederatedSearchService({
      localSearchFn,
      contentCoreAdapter: mockAdapter,
      defaultTopK: 10,
      searchTimeoutMs: 5_000,
    });
  });

  it('search merges local and remote results', async () => {
    const { results, totalLocal, totalRemote } =
      await service.search('interview');

    expect(results.length).toBeGreaterThan(0);
    expect(totalLocal).toBeGreaterThan(0);
    expect(totalRemote).toBeGreaterThan(0);

    // Should contain both local and remote sources.
    const sources = new Set(results.map((r) => r.source));
    expect(sources.has('local')).toBe(true);
    expect(sources.has('content-core')).toBe(true);
  });

  it('search respects topK option', async () => {
    const { results } = await service.search('interview', { topK: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('search works with includeRemote=false', async () => {
    const { results, totalRemote } = await service.search('interview', {
      includeRemote: false,
    });
    expect(totalRemote).toBe(0);
    expect(results.every((r) => r.source === 'local')).toBe(true);
  });

  it('search handles local search failure gracefully', async () => {
    const failingService = new FederatedSearchService({
      localSearchFn: async () => {
        throw new Error('local search exploded');
      },
      contentCoreAdapter: mockAdapter,
    });

    const { results, totalLocal, totalRemote } =
      await failingService.search('interview');

    expect(totalLocal).toBe(0);
    expect(totalRemote).toBeGreaterThan(0);
    expect(results.length).toBeGreaterThan(0);
  });

  it('search handles remote search failure gracefully', async () => {
    const failingAdapter: MockContentCoreAdapter = {
      ...mockAdapter,
      searchMetadata: async () => {
        throw new Error('remote search exploded');
      },
    } as unknown as MockContentCoreAdapter;

    const failingService = new FederatedSearchService({
      localSearchFn,
      contentCoreAdapter: failingAdapter,
    });

    const { results, totalLocal } =
      await failingService.search('interview');

    expect(totalLocal).toBeGreaterThan(0);
    expect(results.length).toBeGreaterThan(0);
  });

  it('getCached returns null for unseen queries', () => {
    expect(service.getCached('never-searched')).toBeNull();
  });

  it('getCached returns results after a search', async () => {
    await service.search('interview');
    const cached = service.getCached('interview');
    expect(cached).not.toBeNull();
    expect(cached!.length).toBeGreaterThan(0);
  });

  it('hydrate fetches full detail for a result', async () => {
    const hydrated = await service.hydrate('arc_001');
    expect(hydrated.hydrationLevel).toBe('full');
    expect(hydrated.title).toBeDefined();
    expect(hydrated.rights).toBeDefined();
  });

  it('hydrate throws when no Content Core adapter is configured', async () => {
    const noRemoteService = new FederatedSearchService({
      localSearchFn,
    });
    await expect(noRemoteService.hydrate('arc_001')).rejects.toThrow(
      'Cannot hydrate',
    );
  });

  it('reports queryTimeMs', async () => {
    const { queryTimeMs } = await service.search('interview');
    expect(queryTimeMs).toBeGreaterThanOrEqual(0);
  });
});
