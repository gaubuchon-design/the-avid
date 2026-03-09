/**
 * @module indexing.bench
 *
 * Performance benchmarks for KnowledgeDB indexing operations.
 *
 * Measures throughput for bulk asset, transcript, and embedding
 * inserts as well as ANN index rebuild time. Uses simple timing
 * via `performance.now()` and reports ops/sec.
 *
 * Run with:
 *   cd services/knowledge-node && npx vitest run src/__tests__/bench/indexing.bench.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { KnowledgeDB, vectorToBuffer } from '../../db/KnowledgeDB.js';
import { IndexBuilder } from '../../index/IndexBuilder.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a temp directory for a benchmark database. */
function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'kn-bench-'));
}

/** Generate a random string of the given length. */
function randomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/** Generate a random unit vector of the given dimensionality. */
function randomVector(dims: number): number[] {
  const vec = Array.from({ length: dims }, () => Math.random() * 2 - 1);
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return vec.map((v) => v / (norm || 1));
}

/** Format ops/sec with comma separators. */
function formatOps(ops: number): string {
  return ops.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Run a timed operation and return duration in ms. */
function timed(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

// ─── Benchmarks ─────────────────────────────────────────────────────────────

describe('Indexing Benchmarks', () => {
  let tempDir: string;
  let db: KnowledgeDB;

  beforeAll(() => {
    tempDir = makeTempDir();
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ── Asset Insertion ────────────────────────────────────────────────────

  it('should insert 1000 assets — measure throughput', () => {
    const dbPath = join(tempDir, 'bench-assets.db');
    db = new KnowledgeDB(dbPath);

    const count = 1000;

    const durationMs = timed(() => {
      for (let i = 0; i < count; i++) {
        db.insertAsset({
          id: `asset-${i}`,
          name: `Test Asset ${i} — ${randomString(20)}`,
          type: i % 3 === 0 ? 'video' : i % 3 === 1 ? 'audio' : 'image',
          shardId: 'bench-shard',
          durationMs: Math.floor(Math.random() * 600_000),
          fileSize: Math.floor(Math.random() * 500_000_000),
          mediaRoot: '/media/bench',
          relativePath: `clips/asset-${i}.mxf`,
          format: 'MXF',
          codec: 'DNxHD',
          resolutionW: 1920,
          resolutionH: 1080,
          frameRate: 29.97,
          sampleRate: 48000,
          channels: 2,
          checksum: randomString(64),
          approvalStatus: 'approved',
          rightsJson: null,
          tagsJson: JSON.stringify(['bench', 'test']),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    });

    const opsPerSec = (count / durationMs) * 1000;
    console.log(
      `  [BENCH] Insert ${count} assets: ${durationMs.toFixed(1)} ms ` +
        `(${formatOps(opsPerSec)} ops/sec)`,
    );

    expect(db.getStats().assets).toBe(count);
    expect(durationMs).toBeLessThan(10_000); // Sanity: should finish under 10s
    db.close();
  });

  // ── Transcript Segment Insertion ──────────────────────────────────────

  it('should insert 5000 transcript segments — measure throughput', () => {
    const dbPath = join(tempDir, 'bench-transcripts.db');
    db = new KnowledgeDB(dbPath);

    // Need a parent asset for foreign keys
    db.insertAsset({
      id: 'parent-asset',
      name: 'Parent Asset',
      type: 'video',
      shardId: 'bench-shard',
      durationMs: 3_600_000,
      fileSize: 1_000_000_000,
      mediaRoot: null,
      relativePath: null,
      format: null,
      codec: null,
      resolutionW: null,
      resolutionH: null,
      frameRate: null,
      sampleRate: null,
      channels: null,
      checksum: null,
      approvalStatus: 'approved',
      rightsJson: null,
      tagsJson: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const count = 5000;
    const words = [
      'the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog',
      'and', 'then', 'runs', 'across', 'field', 'with', 'great', 'speed',
      'while', 'camera', 'pans', 'slowly', 'to', 'reveal', 'landscape',
    ];

    const durationMs = timed(() => {
      for (let i = 0; i < count; i++) {
        const startMs = i * 3000;
        const segmentWords = Array.from(
          { length: 8 + Math.floor(Math.random() * 12) },
          () => words[Math.floor(Math.random() * words.length)],
        );
        db.insertTranscriptSegment({
          id: `seg-${i}`,
          assetId: 'parent-asset',
          startTimeMs: startMs,
          endTimeMs: startMs + 2800,
          text: segmentWords.join(' '),
          confidence: 0.85 + Math.random() * 0.15,
          speakerId: `speaker-${i % 4}`,
          speakerName: `Speaker ${i % 4}`,
          languageCode: 'en',
          wordsJson: null,
        });
      }
    });

    const opsPerSec = (count / durationMs) * 1000;
    console.log(
      `  [BENCH] Insert ${count} transcript segments: ${durationMs.toFixed(1)} ms ` +
        `(${formatOps(opsPerSec)} ops/sec)`,
    );

    expect(db.getStats().transcriptSegments).toBe(count);
    expect(durationMs).toBeLessThan(15_000);
    db.close();
  });

  // ── Embedding Chunk Insertion ─────────────────────────────────────────

  it('should insert 10000 embedding chunks — measure throughput', () => {
    const dbPath = join(tempDir, 'bench-embeddings.db');
    db = new KnowledgeDB(dbPath);

    // Parent asset
    db.insertAsset({
      id: 'emb-parent',
      name: 'Embedding Parent',
      type: 'video',
      shardId: 'bench-shard',
      durationMs: 7_200_000,
      fileSize: 2_000_000_000,
      mediaRoot: null,
      relativePath: null,
      format: null,
      codec: null,
      resolutionW: null,
      resolutionH: null,
      frameRate: null,
      sampleRate: null,
      channels: null,
      checksum: null,
      approvalStatus: 'approved',
      rightsJson: null,
      tagsJson: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const count = 10_000;
    const dims = 384;

    // Pre-generate vectors to separate generation from insertion timing
    const vectors = Array.from({ length: count }, () => randomVector(dims));

    const durationMs = timed(() => {
      for (let i = 0; i < count; i++) {
        db.insertEmbeddingChunk({
          id: `emb-${i}`,
          sourceId: 'emb-parent',
          sourceType: 'transcript',
          shardId: 'bench-shard',
          vector: vectorToBuffer(vectors[i]!),
          modelId: 'bge-m3',
          dimensions: dims,
          startTimeMs: i * 500,
          endTimeMs: i * 500 + 450,
          text: `Embedding chunk ${i}`,
          createdAt: new Date().toISOString(),
        });
      }
    });

    const opsPerSec = (count / durationMs) * 1000;
    console.log(
      `  [BENCH] Insert ${count} embedding chunks (${dims}d): ${durationMs.toFixed(1)} ms ` +
        `(${formatOps(opsPerSec)} ops/sec)`,
    );

    expect(db.getStats().embeddingChunks).toBe(count);
    expect(durationMs).toBeLessThan(60_000);
    db.close();
  });

  // ── ANN Index Rebuild ─────────────────────────────────────────────────

  it('should rebuild ANN index from 10000 embeddings — measure latency', () => {
    const dbPath = join(tempDir, 'bench-ann-rebuild.db');
    db = new KnowledgeDB(dbPath);

    // Parent asset
    db.insertAsset({
      id: 'ann-parent',
      name: 'ANN Parent',
      type: 'video',
      shardId: 'bench-shard',
      durationMs: 3_600_000,
      fileSize: 1_000_000_000,
      mediaRoot: null,
      relativePath: null,
      format: null,
      codec: null,
      resolutionW: null,
      resolutionH: null,
      frameRate: null,
      sampleRate: null,
      channels: null,
      checksum: null,
      approvalStatus: 'approved',
      rightsJson: null,
      tagsJson: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const count = 10_000;
    const dims = 128; // Use smaller dims for faster benchmarking

    for (let i = 0; i < count; i++) {
      db.insertEmbeddingChunk({
        id: `ann-emb-${i}`,
        sourceId: 'ann-parent',
        sourceType: 'transcript',
        shardId: 'bench-shard',
        vector: vectorToBuffer(randomVector(dims)),
        modelId: 'bge-m3',
        dimensions: dims,
        startTimeMs: i * 500,
        endTimeMs: i * 500 + 450,
        text: null,
        createdAt: new Date().toISOString(),
      });
    }

    const builder = new IndexBuilder();

    const durationMs = timed(() => {
      const index = builder.buildIndex(db);
      expect(index.size()).toBe(count);
    });

    console.log(
      `  [BENCH] Rebuild ANN index from ${count} embeddings (${dims}d): ` +
        `${durationMs.toFixed(1)} ms`,
    );

    expect(durationMs).toBeLessThan(60_000);
    db.close();
  });

  // ── Bulk Insert: Transaction-Wrapped vs Individual ────────────────────

  it('should compare transaction-wrapped vs individual inserts', () => {
    const count = 2000;

    // Individual inserts
    const dbPathIndiv = join(tempDir, 'bench-individual.db');
    const dbIndiv = new KnowledgeDB(dbPathIndiv);

    const individualMs = timed(() => {
      for (let i = 0; i < count; i++) {
        dbIndiv.insertAsset({
          id: `indiv-${i}`,
          name: `Individual Asset ${i}`,
          type: 'video',
          shardId: 'bench-shard',
          durationMs: 60_000,
          fileSize: 100_000,
          mediaRoot: null,
          relativePath: null,
          format: null,
          codec: null,
          resolutionW: null,
          resolutionH: null,
          frameRate: null,
          sampleRate: null,
          channels: null,
          checksum: null,
          approvalStatus: 'approved',
          rightsJson: null,
          tagsJson: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    });
    dbIndiv.close();

    // Transaction-wrapped inserts
    const dbPathTxn = join(tempDir, 'bench-transaction.db');
    const dbTxn = new KnowledgeDB(dbPathTxn);

    const txnMs = timed(() => {
      const insertMany = dbTxn.db.transaction(() => {
        for (let i = 0; i < count; i++) {
          dbTxn.insertAsset({
            id: `txn-${i}`,
            name: `Transaction Asset ${i}`,
            type: 'video',
            shardId: 'bench-shard',
            durationMs: 60_000,
            fileSize: 100_000,
            mediaRoot: null,
            relativePath: null,
            format: null,
            codec: null,
            resolutionW: null,
            resolutionH: null,
            frameRate: null,
            sampleRate: null,
            channels: null,
            checksum: null,
            approvalStatus: 'approved',
            rightsJson: null,
            tagsJson: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      });
      insertMany();
    });
    dbTxn.close();

    const individualOps = (count / individualMs) * 1000;
    const txnOps = (count / txnMs) * 1000;
    const speedup = individualMs / txnMs;

    console.log(
      `  [BENCH] Individual inserts (${count}): ${individualMs.toFixed(1)} ms ` +
        `(${formatOps(individualOps)} ops/sec)`,
    );
    console.log(
      `  [BENCH] Transaction-wrapped inserts (${count}): ${txnMs.toFixed(1)} ms ` +
        `(${formatOps(txnOps)} ops/sec)`,
    );
    console.log(
      `  [BENCH] Transaction speedup: ${speedup.toFixed(1)}x`,
    );

    // Transaction wrapping should be faster (WAL mode mitigates but
    // transactions still avoid per-statement implicit commits).
    expect(txnMs).toBeLessThan(individualMs * 2); // Allow generous margin
  });
});
