/**
 * @module search.bench
 *
 * Performance benchmarks for KnowledgeDB search operations.
 *
 * Measures latency and throughput for text search, ANN vector search,
 * combined text + vector search, and asset metadata search with filters.
 *
 * Run with:
 *   cd services/knowledge-node && npx vitest run src/__tests__/bench/search.bench.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { KnowledgeDB, vectorToBuffer } from '../../db/KnowledgeDB.js';
import { IndexBuilder } from '../../index/IndexBuilder.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'kn-search-bench-'));
}

function randomVector(dims: number): number[] {
  const vec = Array.from({ length: dims }, () => Math.random() * 2 - 1);
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return vec.map((v) => v / (norm || 1));
}

function formatOps(ops: number): string {
  return ops.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Corpus of realistic transcript phrases for populating the DB. */
const PHRASES = [
  'The president announced a new infrastructure plan today',
  'Breaking news from the weather center about incoming storms',
  'Sports highlights showing the championship winning goal',
  'Interview with the director about the upcoming film release',
  'Market analysis shows technology stocks rising sharply',
  'Local community celebrates the annual harvest festival',
  'Scientists discover a new species in the deep ocean',
  'The fire department responded to a three-alarm blaze downtown',
  'Traffic delays expected on the highway due to construction',
  'Education reform bill passes the senate with bipartisan support',
  'Healthcare workers receive recognition at the ceremony',
  'Environmental activists protest outside the corporate headquarters',
  'New restaurant opens featuring farm-to-table dining experience',
  'Music festival lineup announced for the summer season',
  'Technology company unveils next generation smartphone device',
  'Astronauts aboard the space station conduct experiments',
  'Police investigation into the weekend incident continues',
  'Archaeological dig uncovers ancient artifacts near the river',
  'City council approves the downtown development project',
  'Renewable energy installations break records this quarter',
];

// ─── Benchmarks ─────────────────────────────────────────────────────────────

describe('Search Benchmarks', () => {
  let tempDir: string;
  let db: KnowledgeDB;

  const SEGMENT_COUNT = 5000;
  const EMBEDDING_COUNT = 10_000;
  const EMBEDDING_DIMS = 128;

  beforeAll(() => {
    tempDir = makeTempDir();
    const dbPath = join(tempDir, 'search-bench.db');
    db = new KnowledgeDB(dbPath);

    // Seed a parent asset
    db.insertAsset({
      id: 'search-parent',
      name: 'Search Benchmark Parent',
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

    // Populate transcript segments
    const insertSegments = db.db.transaction(() => {
      for (let i = 0; i < SEGMENT_COUNT; i++) {
        const phrase = PHRASES[i % PHRASES.length];
        const startMs = i * 3000;
        db.insertTranscriptSegment({
          id: `search-seg-${i}`,
          assetId: 'search-parent',
          startTimeMs: startMs,
          endTimeMs: startMs + 2800,
          text: `${phrase} segment ${i}`,
          confidence: 0.9 + Math.random() * 0.1,
          speakerId: `speaker-${i % 3}`,
          speakerName: null,
          languageCode: 'en',
          wordsJson: null,
        });
      }
    });
    insertSegments();

    // Populate embedding chunks
    const insertEmbeddings = db.db.transaction(() => {
      for (let i = 0; i < EMBEDDING_COUNT; i++) {
        db.insertEmbeddingChunk({
          id: `search-emb-${i}`,
          sourceId: 'search-parent',
          sourceType: 'transcript',
          shardId: 'bench-shard',
          vector: vectorToBuffer(randomVector(EMBEDDING_DIMS)),
          modelId: 'bge-m3',
          dimensions: EMBEDDING_DIMS,
          startTimeMs: i * 500,
          endTimeMs: i * 500 + 450,
          text: `Embedding text ${i}`,
          createdAt: new Date().toISOString(),
        });
      }
    });
    insertEmbeddings();

    // Populate additional assets for metadata search
    const insertAssets = db.db.transaction(() => {
      for (let i = 0; i < 500; i++) {
        db.insertAsset({
          id: `search-asset-${i}`,
          name: `${PHRASES[i % PHRASES.length]} clip ${i}`,
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
          checksum: null,
          approvalStatus: i % 5 === 0 ? 'pending' : 'approved',
          rightsJson: null,
          tagsJson: JSON.stringify(['bench', i % 2 === 0 ? 'sports' : 'news']),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    });
    insertAssets();

    console.log(
      `  [SETUP] Populated DB: ${db.getStats().transcriptSegments} segments, ` +
        `${db.getStats().embeddingChunks} embeddings, ` +
        `${db.getStats().assets} assets`,
    );
  });

  afterAll(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ── Text Search Across Transcript Segments ────────────────────────────

  it('should search 5000 transcript segments by text — measure latency', () => {
    const queries = [
      'president infrastructure',
      'weather storms',
      'championship goal',
      'technology stocks',
      'environmental protest',
      'space station experiments',
      'renewable energy records',
      'downtown development',
    ];

    const iterations = queries.length;
    let totalHits = 0;

    const start = performance.now();
    for (const query of queries) {
      const results = db.searchTranscripts(query, 100);
      totalHits += results.length;
    }
    const durationMs = performance.now() - start;

    const avgMs = durationMs / iterations;
    const qps = (iterations / durationMs) * 1000;

    console.log(
      `  [BENCH] Text search (${SEGMENT_COUNT} segments, ${iterations} queries): ` +
        `${durationMs.toFixed(1)} ms total, ${avgMs.toFixed(1)} ms/query ` +
        `(${formatOps(qps)} QPS), ${totalHits} total hits`,
    );

    expect(totalHits).toBeGreaterThan(0);
    expect(avgMs).toBeLessThan(5_000); // Each query should finish in under 5s
  });

  // ── ANN Vector Search ─────────────────────────────────────────────────

  it('should ANN search 10000 embeddings with top-10 — measure latency', () => {
    // Build the index first
    const builder = new IndexBuilder();
    const buildStart = performance.now();
    const index = builder.buildIndex(db);
    const buildMs = performance.now() - buildStart;

    console.log(
      `  [BENCH] ANN index build: ${buildMs.toFixed(1)} ms ` +
        `(${index.size()} vectors)`,
    );

    // Run multiple search queries
    const queryCount = 50;
    const topK = 10;
    const queryVectors = Array.from({ length: queryCount }, () =>
      randomVector(EMBEDDING_DIMS),
    );

    const searchStart = performance.now();
    let totalResults = 0;
    for (const qv of queryVectors) {
      const results = index.search(qv, topK);
      totalResults += results.length;
    }
    const searchMs = performance.now() - searchStart;

    const avgMs = searchMs / queryCount;
    const qps = (queryCount / searchMs) * 1000;

    console.log(
      `  [BENCH] ANN search (${EMBEDDING_COUNT} vectors, ${queryCount} queries, top-${topK}): ` +
        `${searchMs.toFixed(1)} ms total, ${avgMs.toFixed(1)} ms/query ` +
        `(${formatOps(qps)} QPS), ${totalResults} total results`,
    );

    expect(totalResults).toBe(queryCount * topK);
    expect(avgMs).toBeLessThan(5_000);
  });

  // ── Combined Text + Vector Search ─────────────────────────────────────

  it('should combine text + vector search — measure latency', () => {
    const builder = new IndexBuilder();
    const index = builder.buildIndex(db);

    const queryCount = 20;
    const topK = 10;

    const start = performance.now();
    let totalHits = 0;

    for (let i = 0; i < queryCount; i++) {
      // Text search phase
      const textQuery = PHRASES[i % PHRASES.length].split(' ').slice(0, 3).join(' ');
      const textResults = db.searchTranscripts(textQuery, topK);

      // Vector search phase
      const queryVector = randomVector(EMBEDDING_DIMS);
      const vectorResults = index.search(queryVector, topK);

      // Merge (simple interleave for benchmark — real merger is in ResultRanker)
      const merged = new Set<string>();
      for (const r of textResults) merged.add(r.id);
      for (const r of vectorResults) merged.add(r.id);

      totalHits += merged.size;
    }
    const durationMs = performance.now() - start;

    const avgMs = durationMs / queryCount;
    const qps = (queryCount / durationMs) * 1000;

    console.log(
      `  [BENCH] Combined text + vector search (${queryCount} queries): ` +
        `${durationMs.toFixed(1)} ms total, ${avgMs.toFixed(1)} ms/query ` +
        `(${formatOps(qps)} QPS), ${totalHits} total merged hits`,
    );

    expect(totalHits).toBeGreaterThan(0);
    expect(avgMs).toBeLessThan(10_000);
  });

  // ── Asset Metadata Search with Filters ────────────────────────────────

  it('should search assets by metadata — measure latency', () => {
    const queries = [
      'president',
      'sports',
      'technology',
      'championship',
      'weather',
      'renewable',
      'downtown',
      'music festival',
      'spacecraft',
      'community',
    ];

    const iterations = queries.length;
    let totalHits = 0;

    const start = performance.now();
    for (const query of queries) {
      const results = db.searchAssets(query);
      totalHits += results.length;
    }
    const durationMs = performance.now() - start;

    const avgMs = durationMs / iterations;
    const qps = (iterations / durationMs) * 1000;

    console.log(
      `  [BENCH] Asset metadata search (${db.getStats().assets} assets, ` +
        `${iterations} queries): ${durationMs.toFixed(1)} ms total, ` +
        `${avgMs.toFixed(1)} ms/query (${formatOps(qps)} QPS), ` +
        `${totalHits} total hits`,
    );

    expect(totalHits).toBeGreaterThan(0);
    expect(avgMs).toBeLessThan(5_000);
  });

  // ── Concurrent Search Throughput ──────────────────────────────────────

  it('should handle rapid sequential search bursts', () => {
    const burstSize = 100;
    let totalHits = 0;

    const start = performance.now();
    for (let i = 0; i < burstSize; i++) {
      const query = PHRASES[i % PHRASES.length].split(' ')[0];
      const results = db.searchTranscripts(query, 10);
      totalHits += results.length;
    }
    const durationMs = performance.now() - start;

    const qps = (burstSize / durationMs) * 1000;

    console.log(
      `  [BENCH] Search burst (${burstSize} sequential queries): ` +
        `${durationMs.toFixed(1)} ms total (${formatOps(qps)} QPS), ` +
        `${totalHits} total hits`,
    );

    expect(totalHits).toBeGreaterThan(0);
    expect(durationMs).toBeLessThan(30_000);
  });
});
