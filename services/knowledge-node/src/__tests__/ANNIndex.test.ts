import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BruteForceIndex } from '../index/ANNIndex';

// Mock the fs module for save/load tests
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { readFileSync, writeFileSync } from 'node:fs';

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a simple unit vector for testing (1 in the ith position). */
function basisVector(dim: number, i: number): number[] {
  const v = Array(dim).fill(0) as number[];
  v[i] = 1;
  return v;
}

/** Creates a random-ish vector with known values. */
function makeVector(dim: number, seed: number): number[] {
  return Array.from({ length: dim }, (_, i) => Math.sin(seed * (i + 1)));
}

describe('BruteForceIndex', () => {
  let index: BruteForceIndex;

  beforeEach(() => {
    index = new BruteForceIndex();
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // add
  // -----------------------------------------------------------------------

  describe('add', () => {
    it('adds a vector to the index', () => {
      index.add('v1', [1, 0, 0]);
      expect(index.size()).toBe(1);
    });

    it('increments size for each added vector', () => {
      index.add('v1', [1, 0, 0]);
      index.add('v2', [0, 1, 0]);
      expect(index.size()).toBe(2);
    });

    it('overwrites vectors with the same id', () => {
      index.add('v1', [1, 0, 0]);
      index.add('v1', [0, 1, 0]);
      expect(index.size()).toBe(1);
    });

    it('throws on empty id', () => {
      expect(() => index.add('', [1, 0, 0])).toThrow('non-empty string');
    });

    it('throws on empty vector', () => {
      expect(() => index.add('v1', [])).toThrow('at least one dimension');
    });

    it('throws on dimension mismatch', () => {
      index.add('v1', [1, 0, 0]);
      expect(() => index.add('v2', [1, 0])).toThrow('Dimension mismatch');
    });
  });

  // -----------------------------------------------------------------------
  // addBatch
  // -----------------------------------------------------------------------

  describe('addBatch', () => {
    it('adds multiple vectors at once', () => {
      index.addBatch([
        { id: 'a', vector: [1, 0, 0] },
        { id: 'b', vector: [0, 1, 0] },
        { id: 'c', vector: [0, 0, 1] },
      ]);
      expect(index.size()).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // search
  // -----------------------------------------------------------------------

  describe('search', () => {
    it('returns empty array for empty index', () => {
      expect(index.search([1, 0, 0], 5)).toEqual([]);
    });

    it('returns empty array for topK <= 0', () => {
      index.add('v1', [1, 0, 0]);
      expect(index.search([1, 0, 0], 0)).toEqual([]);
    });

    it('returns empty array for zero-magnitude query', () => {
      index.add('v1', [1, 0, 0]);
      expect(index.search([0, 0, 0], 5)).toEqual([]);
    });

    it('finds exact match with score ~1.0', () => {
      index.add('v1', [1, 0, 0]);
      const results = index.search([1, 0, 0], 1);

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('v1');
      expect(results[0]!.score).toBeCloseTo(1.0);
    });

    it('ranks results by cosine similarity (descending)', () => {
      // v1 = [1, 0, 0], v2 = [0.7, 0.7, 0], v3 = [0, 1, 0]
      index.add('v1', [1, 0, 0]);
      index.add('v2', [0.7, 0.7, 0]);
      index.add('v3', [0, 1, 0]);

      const results = index.search([1, 0, 0], 3);

      expect(results).toHaveLength(3);
      expect(results[0]!.id).toBe('v1'); // exact match
      expect(results[1]!.id).toBe('v2'); // partial match
      expect(results[2]!.id).toBe('v3'); // orthogonal

      // Scores should be descending
      for (let i = 1; i < results.length; i++) {
        expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score);
      }
    });

    it('returns at most topK results', () => {
      for (let i = 0; i < 10; i++) {
        index.add(`v${i}`, makeVector(3, i + 1));
      }

      const results = index.search([1, 0, 0], 3);
      expect(results).toHaveLength(3);
    });

    it('returns fewer results than topK when index is smaller', () => {
      index.add('v1', [1, 0, 0]);
      index.add('v2', [0, 1, 0]);

      const results = index.search([1, 0, 0], 10);
      expect(results).toHaveLength(2);
    });

    it('finds orthogonal vectors with score ~0', () => {
      index.add('v1', basisVector(3, 0));
      index.add('v2', basisVector(3, 1));

      const results = index.search(basisVector(3, 0), 2);
      expect(results[0]!.id).toBe('v1');
      expect(results[0]!.score).toBeCloseTo(1.0);
      expect(results[1]!.score).toBeCloseTo(0.0);
    });

    it('handles negative cosine similarity (anti-parallel)', () => {
      index.add('parallel', [1, 0, 0]);
      index.add('anti', [-1, 0, 0]);

      const results = index.search([1, 0, 0], 2);
      expect(results[0]!.id).toBe('parallel');
      expect(results[0]!.score).toBeCloseTo(1.0);
      expect(results[1]!.id).toBe('anti');
      expect(results[1]!.score).toBeCloseTo(-1.0);
    });

    it('skips zero-magnitude vectors in the index', () => {
      index.add('zero', [0, 0, 0]);
      index.add('real', [1, 0, 0]);

      const results = index.search([1, 0, 0], 5);
      // Only 'real' should appear
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('real');
    });
  });

  // -----------------------------------------------------------------------
  // remove
  // -----------------------------------------------------------------------

  describe('remove', () => {
    it('removes a vector from the index', () => {
      index.add('v1', [1, 0, 0]);
      index.remove('v1');
      expect(index.size()).toBe(0);
    });

    it('does not throw when removing a non-existent id', () => {
      expect(() => index.remove('nonexistent')).not.toThrow();
    });

    it('makes removed vector unsearchable', () => {
      index.add('v1', [1, 0, 0]);
      index.add('v2', [0, 1, 0]);
      index.remove('v1');

      const results = index.search([1, 0, 0], 5);
      expect(results.every((r) => r.id !== 'v1')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // size
  // -----------------------------------------------------------------------

  describe('size', () => {
    it('returns 0 for empty index', () => {
      expect(index.size()).toBe(0);
    });

    it('returns correct count', () => {
      index.add('a', [1, 0]);
      index.add('b', [0, 1]);
      expect(index.size()).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // Serialization (save / load)
  // -----------------------------------------------------------------------

  describe('save', () => {
    it('serializes index to JSON', () => {
      index.add('v1', [1, 0, 0]);
      index.add('v2', [0, 1, 0]);

      index.save('/tmp/test-index.json');

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/tmp/test-index.json',
        expect.any(String),
        'utf-8',
      );

      const written = mockWriteFileSync.mock.calls[0]![1] as string;
      const parsed = JSON.parse(written);
      expect(parsed.version).toBe(1);
      expect(parsed.entries).toHaveLength(2);
    });

    it('stores dimension info', () => {
      index.add('v1', [1, 2, 3]);
      index.save('/tmp/test.json');

      const written = mockWriteFileSync.mock.calls[0]![1] as string;
      const parsed = JSON.parse(written);
      expect(parsed.dimensions).toBe(3);
    });
  });

  describe('load', () => {
    it('loads a previously saved index', () => {
      const serialized = JSON.stringify({
        version: 1,
        dimensions: 3,
        entries: [
          { id: 'v1', vector: [1, 0, 0] },
          { id: 'v2', vector: [0, 1, 0] },
        ],
      });

      mockReadFileSync.mockReturnValue(serialized);

      index.load('/tmp/test-index.json');

      expect(index.size()).toBe(2);
      const results = index.search([1, 0, 0], 1);
      expect(results[0]!.id).toBe('v1');
      expect(results[0]!.score).toBeCloseTo(1.0);
    });

    it('clears existing data before loading', () => {
      index.add('old', [1, 0, 0]);

      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          version: 1,
          dimensions: 3,
          entries: [{ id: 'new', vector: [0, 1, 0] }],
        }),
      );

      index.load('/tmp/test.json');

      expect(index.size()).toBe(1);
      const results = index.search([1, 0, 0], 5);
      expect(results[0]!.id).toBe('new');
    });

    it('throws on unsupported version', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          version: 99,
          dimensions: 3,
          entries: [],
        }),
      );

      expect(() => index.load('/tmp/bad.json')).toThrow('Unsupported index version');
    });
  });

  // -----------------------------------------------------------------------
  // Round-trip save/load
  // -----------------------------------------------------------------------

  describe('save/load round-trip', () => {
    it('preserves search behavior after round-trip', () => {
      index.add('v1', [1, 0, 0]);
      index.add('v2', [0, 1, 0]);
      index.add('v3', [0, 0, 1]);

      // Save
      let savedData = '';
      mockWriteFileSync.mockImplementation((_path, data) => {
        savedData = data as string;
      });
      index.save('/tmp/roundtrip.json');

      // Load into a fresh index
      mockReadFileSync.mockReturnValue(savedData);
      const newIndex = new BruteForceIndex();
      newIndex.load('/tmp/roundtrip.json');

      expect(newIndex.size()).toBe(3);
      const results = newIndex.search([1, 0, 0], 3);
      expect(results[0]!.id).toBe('v1');
      expect(results[0]!.score).toBeCloseTo(1.0);
    });
  });

  // -----------------------------------------------------------------------
  // High-dimensional vectors
  // -----------------------------------------------------------------------

  describe('high-dimensional vectors', () => {
    it('handles 768-dimensional vectors', () => {
      const dim = 768;
      const v1 = Array.from({ length: dim }, (_, i) => Math.sin(i));
      const v2 = Array.from({ length: dim }, (_, i) => Math.cos(i));

      index.add('emb1', v1);
      index.add('emb2', v2);

      const results = index.search(v1, 2);
      expect(results).toHaveLength(2);
      expect(results[0]!.id).toBe('emb1');
      expect(results[0]!.score).toBeCloseTo(1.0, 4);
    });
  });
});
