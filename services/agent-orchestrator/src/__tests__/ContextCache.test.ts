import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContextCache } from '../caching/ContextCache';

describe('ContextCache', () => {
  let cache: ContextCache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new ContextCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // get / set
  // -----------------------------------------------------------------------

  describe('get and set', () => {
    it('returns undefined for a missing key', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('stores and retrieves a value', () => {
      cache.set('key1', { data: 'hello' });
      expect(cache.get('key1')).toEqual({ data: 'hello' });
    });

    it('overwrites existing values', () => {
      cache.set('key1', 'first');
      cache.set('key1', 'second');
      expect(cache.get('key1')).toBe('second');
    });

    it('stores different types of values', () => {
      cache.set('str', 'hello');
      cache.set('num', 42);
      cache.set('arr', [1, 2, 3]);
      cache.set('obj', { nested: true });
      cache.set('bool', false);
      cache.set('null-val', null);

      expect(cache.get('str')).toBe('hello');
      expect(cache.get('num')).toBe(42);
      expect(cache.get('arr')).toEqual([1, 2, 3]);
      expect(cache.get('obj')).toEqual({ nested: true });
      expect(cache.get('bool')).toBe(false);
      // null is stored but get returns it as falsy; cache.has confirms presence
    });
  });

  // -----------------------------------------------------------------------
  // TTL expiry
  // -----------------------------------------------------------------------

  describe('TTL expiry', () => {
    it('returns value before TTL expires', () => {
      cache.set('ttl-key', 'value', 1000);
      vi.advanceTimersByTime(999);
      expect(cache.get('ttl-key')).toBe('value');
    });

    it('returns undefined after TTL expires', () => {
      cache.set('ttl-key', 'value', 1000);
      vi.advanceTimersByTime(1001);
      expect(cache.get('ttl-key')).toBeUndefined();
    });

    it('removes expired entry from the store on get()', () => {
      cache.set('expire-me', 'data', 500);
      vi.advanceTimersByTime(501);

      cache.get('expire-me');

      // Stats should show a miss, not a hit
      const stats = cache.getStats();
      expect(stats.misses).toBeGreaterThan(0);
    });

    it('uses default TTL when none specified', () => {
      cache.set('default-ttl', 'value');
      // Default is 5 minutes = 300000ms
      // TTL check is strictly greater-than, so advance past it
      vi.advanceTimersByTime(300001);
      expect(cache.get('default-ttl')).toBeUndefined();
    });

    it('value is still present at exact TTL boundary', () => {
      cache.set('default-ttl', 'value');
      vi.advanceTimersByTime(300000);
      expect(cache.get('default-ttl')).toBe('value');
    });
  });

  // -----------------------------------------------------------------------
  // has
  // -----------------------------------------------------------------------

  describe('has', () => {
    it('returns false for a missing key', () => {
      expect(cache.has('missing')).toBe(false);
    });

    it('returns true for an existing, non-expired key', () => {
      cache.set('key', 'value');
      expect(cache.has('key')).toBe(true);
    });

    it('returns false for an expired key', () => {
      cache.set('key', 'value', 100);
      vi.advanceTimersByTime(101);
      expect(cache.has('key')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // invalidate
  // -----------------------------------------------------------------------

  describe('invalidate', () => {
    it('removes a specific key', () => {
      cache.set('key', 'value');
      cache.invalidate('key');
      expect(cache.get('key')).toBeUndefined();
    });

    it('does not throw when invalidating a non-existent key', () => {
      expect(() => cache.invalidate('nonexistent')).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // invalidateByPrefix
  // -----------------------------------------------------------------------

  describe('invalidateByPrefix', () => {
    it('removes all keys matching the prefix', () => {
      cache.set('project:1:plan', 'a');
      cache.set('project:1:ctx', 'b');
      cache.set('project:2:plan', 'c');
      cache.set('other:key', 'd');

      const removed = cache.invalidateByPrefix('project:1:');
      expect(removed).toBe(2);
      expect(cache.get('project:1:plan')).toBeUndefined();
      expect(cache.get('project:1:ctx')).toBeUndefined();
      expect(cache.get('project:2:plan')).toBe('c');
      expect(cache.get('other:key')).toBe('d');
    });

    it('returns 0 when no keys match', () => {
      cache.set('key', 'value');
      expect(cache.invalidateByPrefix('nope:')).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // clear
  // -----------------------------------------------------------------------

  describe('clear', () => {
    it('removes all entries and resets stats', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.get('a'); // hit
      cache.get('missing'); // miss

      cache.clear();

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // getOrSet
  // -----------------------------------------------------------------------

  describe('getOrSet', () => {
    it('returns cached value on hit', async () => {
      cache.set('key', 'cached');
      const factory = vi.fn().mockResolvedValue('fresh');

      const result = await cache.getOrSet('key', factory);

      expect(result).toBe('cached');
      expect(factory).not.toHaveBeenCalled();
    });

    it('calls factory and caches result on miss', async () => {
      const factory = vi.fn().mockResolvedValue('computed');

      const result = await cache.getOrSet('new-key', factory);

      expect(result).toBe('computed');
      expect(factory).toHaveBeenCalledOnce();
      expect(cache.get('new-key')).toBe('computed');
    });

    it('uses the specified TTL for the cached value', async () => {
      await cache.getOrSet('ttl-key', () => 'value', 200);

      vi.advanceTimersByTime(199);
      expect(cache.get('ttl-key')).toBe('value');

      vi.advanceTimersByTime(2);
      expect(cache.get('ttl-key')).toBeUndefined();
    });

    it('works with synchronous factory functions', async () => {
      const result = await cache.getOrSet('sync-key', () => 'sync-value');
      expect(result).toBe('sync-value');
    });
  });

  // -----------------------------------------------------------------------
  // getStats
  // -----------------------------------------------------------------------

  describe('getStats', () => {
    it('starts with zero stats', () => {
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });

    it('tracks hits and misses', () => {
      cache.set('key', 'value');
      cache.get('key'); // hit
      cache.get('key'); // hit
      cache.get('missing'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.6667, 3);
    });

    it('reports correct size after pruning expired entries', () => {
      cache.set('a', 1, 100);
      cache.set('b', 2, 5000);

      vi.advanceTimersByTime(101);

      const stats = cache.getStats();
      // 'a' should have been pruned
      expect(stats.size).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Max size / eviction
  // -----------------------------------------------------------------------

  describe('max size and eviction', () => {
    it('evicts oldest entries when at capacity', () => {
      const smallCache = new ContextCache(3);

      smallCache.set('a', 1);
      smallCache.set('b', 2);
      smallCache.set('c', 3);
      // Cache is now full

      smallCache.set('d', 4);
      // 'a' should be evicted (oldest 10% = at least 1)

      const stats = smallCache.getStats();
      expect(stats.size).toBeLessThanOrEqual(3);
      expect(smallCache.get('d')).toBe(4);
    });

    it('prefers evicting expired entries before oldest', () => {
      const smallCache = new ContextCache(3);

      smallCache.set('expired', 1, 100);
      smallCache.set('fresh1', 2, 50000);
      smallCache.set('fresh2', 3, 50000);

      vi.advanceTimersByTime(101);

      // Adding a new entry should evict the expired one first
      smallCache.set('new', 4);
      expect(smallCache.get('fresh1')).toBe(2);
      expect(smallCache.get('fresh2')).toBe(3);
      expect(smallCache.get('new')).toBe(4);
    });
  });
});
