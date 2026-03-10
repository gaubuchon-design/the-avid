import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndexBuilder } from '../index/IndexBuilder';
import { BruteForceIndex } from '../index/ANNIndex';
import type { KnowledgeDB } from '../db/KnowledgeDB';

// Mock the fs module for rebuild temp file operations
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import { readFileSync, writeFileSync } from 'node:fs';

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock embedding chunk. */
function makeChunk(id: string, modelId: string, vector: number[]) {
  // bufferToVector expects a Buffer containing Float32Array data
  const f32 = new Float32Array(vector);
  return {
    id,
    modelId,
    vector: Buffer.from(f32.buffer),
  };
}

/** Create a mock KnowledgeDB instance. */
function createMockDB(
  chunks: Array<{ id: string; modelId: string; vector: Buffer }>,
): KnowledgeDB {
  return {
    getAllEmbeddings: vi.fn().mockReturnValue(chunks),
  } as unknown as KnowledgeDB;
}

// We need to mock bufferToVector since it's imported from KnowledgeDB
vi.mock('../db/KnowledgeDB.js', () => ({
  bufferToVector: (buf: Buffer) => {
    const f32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    return f32;
  },
}));

describe('IndexBuilder', () => {
  let builder: IndexBuilder;

  beforeEach(() => {
    builder = new IndexBuilder();
  });

  // -----------------------------------------------------------------------
  // buildIndex
  // -----------------------------------------------------------------------

  describe('buildIndex', () => {
    it('builds an index from embedding chunks', () => {
      const chunks = [
        makeChunk('c1', 'bge-m3', [1, 0, 0]),
        makeChunk('c2', 'bge-m3', [0, 1, 0]),
        makeChunk('c3', 'bge-m3', [0, 0, 1]),
      ];
      const db = createMockDB(chunks);

      const result = builder.buildIndex(db);

      expect(result.processed).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.total).toBe(3);
      expect(result.index.size()).toBe(3);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('filters by modelId when specified', () => {
      const chunks = [
        makeChunk('c1', 'bge-m3', [1, 0, 0]),
        makeChunk('c2', 'whisper', [0, 1, 0]),
        makeChunk('c3', 'bge-m3', [0, 0, 1]),
      ];
      const db = createMockDB(chunks);

      const result = builder.buildIndex(db, { modelId: 'bge-m3' });

      expect(result.processed).toBe(2);
      expect(result.skipped).toBe(1);
      expect(result.index.size()).toBe(2);
    });

    it('handles empty database', () => {
      const db = createMockDB([]);

      const result = builder.buildIndex(db);

      expect(result.processed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.total).toBe(0);
      expect(result.index.size()).toBe(0);
    });

    it('passes shardId to getAllEmbeddings', () => {
      const db = createMockDB([]);

      builder.buildIndex(db, { shardId: 'shard-1' });

      expect(db.getAllEmbeddings).toHaveBeenCalledWith('shard-1');
    });

    it('calls onProgress callback', () => {
      // Create enough chunks to trigger progress (>=500)
      const chunks = Array.from({ length: 500 }, (_, i) =>
        makeChunk(`c${i}`, 'bge-m3', [Math.sin(i), Math.cos(i), i / 500]),
      );
      const db = createMockDB(chunks);
      const onProgress = vi.fn();

      builder.buildIndex(db, { onProgress });

      // Should be called at least once for the 500th chunk and once for final
      expect(onProgress).toHaveBeenCalled();
    });

    it('always calls final progress report', () => {
      const chunks = [makeChunk('c1', 'bge-m3', [1, 0, 0])];
      const db = createMockDB(chunks);
      const onProgress = vi.fn();

      builder.buildIndex(db, { onProgress });

      // Final progress should always be called
      expect(onProgress).toHaveBeenCalled();
      const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1]!;
      expect(lastCall[0]).toBe(lastCall[1]); // processed+skipped === total
    });

    it('skips corrupt vectors and counts them', () => {
      // Create a chunk with invalid buffer (wrong size for Float32)
      const badChunk = {
        id: 'bad',
        modelId: 'bge-m3',
        vector: Buffer.from([0, 1, 2]), // Not aligned to Float32
      };

      const goodChunk = makeChunk('good', 'bge-m3', [1, 0, 0]);

      const db = createMockDB([goodChunk, badChunk]);

      const result = builder.buildIndex(db);

      // The bad chunk should be skipped (processed + skipped = total)
      expect(result.total).toBe(2);
      expect(result.processed + result.skipped).toBe(result.total);
    });

    it('returns a BruteForceIndex instance', () => {
      const db = createMockDB([makeChunk('c1', 'bge-m3', [1, 0, 0])]);
      const result = builder.buildIndex(db);
      expect(result.index).toBeInstanceOf(BruteForceIndex);
    });

    it('produces a searchable index', () => {
      const chunks = [
        makeChunk('c1', 'bge-m3', [1, 0, 0]),
        makeChunk('c2', 'bge-m3', [0, 1, 0]),
      ];
      const db = createMockDB(chunks);

      const { index: builtIndex } = builder.buildIndex(db);

      const results = builtIndex.search([1, 0, 0], 2);
      expect(results).toHaveLength(2);
      expect(results[0]!.id).toBe('c1');
      expect(results[0]!.score).toBeCloseTo(1.0);
    });
  });

  // -----------------------------------------------------------------------
  // rebuildIndex
  // -----------------------------------------------------------------------

  describe('rebuildIndex', () => {
    it('repopulates an existing BruteForceIndex', () => {
      const existingIndex = new BruteForceIndex();
      existingIndex.add('old', [1, 0, 0]);

      const chunks = [
        makeChunk('new1', 'bge-m3', [0, 1, 0]),
        makeChunk('new2', 'bge-m3', [0, 0, 1]),
      ];
      const db = createMockDB(chunks);

      // Mock save/load for the temp round-trip
      let savedData = '';
      mockWriteFileSync.mockImplementation((_path, data) => {
        savedData = data as string;
      });
      mockReadFileSync.mockImplementation(() => savedData);

      const result = builder.rebuildIndex(db, existingIndex);

      expect(result.index).toBe(existingIndex);
      expect(result.processed).toBe(2);
    });

    it('returns stats for the rebuild', () => {
      const existingIndex = new BruteForceIndex();
      const chunks = [makeChunk('c1', 'bge-m3', [1, 0, 0])];
      const db = createMockDB(chunks);

      let savedData = '';
      mockWriteFileSync.mockImplementation((_path, data) => {
        savedData = data as string;
      });
      mockReadFileSync.mockImplementation(() => savedData);

      const result = builder.rebuildIndex(db, existingIndex);

      expect(result.total).toBe(1);
      expect(result.processed).toBe(1);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
