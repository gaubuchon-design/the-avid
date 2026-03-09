/**
 * @module transcription.bench
 *
 * Performance benchmarks for the local AI runtime inference pipeline
 * using MockBackend. Measures latency and throughput for transcription,
 * batch transcription, embedding generation, and translation.
 *
 * Run with:
 *   cd services/local-ai-runtime && npx vitest run src/__tests__/bench/transcription.bench.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { performance } from 'node:perf_hooks';
import { MockBackend } from '../../backends/MockBackend.js';
import type { ModelRequest, ModelResult } from '../../ModelRunner.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatOps(ops: number): string {
  return ops.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// ─── Benchmarks ─────────────────────────────────────────────────────────────

describe('Transcription Pipeline Benchmarks (MockBackend)', () => {
  let backend: MockBackend;

  beforeAll(async () => {
    backend = new MockBackend();
    await backend.initialize();
  });

  afterAll(async () => {
    await backend.shutdown();
  });

  // ── Single Short Audio Transcription ──────────────────────────────────

  it('should transcribe a single short audio — measure latency', async () => {
    const request: ModelRequest = {
      modelId: 'whisper-large-v3-turbo',
      capability: 'stt',
      input: {
        audioPath: '/tmp/bench-audio-short.wav',
      },
    };

    const iterations = 100;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      const result = await backend.execute(request);
      expect(result.output.transcriptSegments).toBeDefined();
      expect(result.output.transcriptSegments!.length).toBeGreaterThan(0);
    }

    const durationMs = performance.now() - start;
    const avgMs = durationMs / iterations;
    const opsPerSec = (iterations / durationMs) * 1000;

    console.log(
      `  [BENCH] Single STT transcription (${iterations} iterations): ` +
        `${durationMs.toFixed(1)} ms total, ${avgMs.toFixed(2)} ms/call ` +
        `(${formatOps(opsPerSec)} ops/sec)`,
    );

    expect(avgMs).toBeLessThan(100); // MockBackend should be very fast
  });

  // ── Batch Transcription of 10 Files ───────────────────────────────────

  it('should batch-transcribe 10 files — measure total latency', async () => {
    const batchSize = 10;
    const files = Array.from(
      { length: batchSize },
      (_, i) => `/tmp/bench-audio-${i}.wav`,
    );

    const start = performance.now();
    const results: ModelResult[] = [];

    for (const audioPath of files) {
      const result = await backend.execute({
        modelId: 'whisper-large-v3-turbo',
        capability: 'stt',
        input: { audioPath },
      });
      results.push(result);
    }

    const durationMs = performance.now() - start;
    const avgMs = durationMs / batchSize;

    console.log(
      `  [BENCH] Batch STT (${batchSize} files, sequential): ` +
        `${durationMs.toFixed(1)} ms total, ${avgMs.toFixed(2)} ms/file`,
    );

    expect(results).toHaveLength(batchSize);
    for (const r of results) {
      expect(r.output.transcriptSegments).toBeDefined();
    }

    // Now test parallel batch
    const parallelStart = performance.now();
    const parallelResults = await Promise.all(
      files.map((audioPath) =>
        backend.execute({
          modelId: 'whisper-large-v3-turbo',
          capability: 'stt',
          input: { audioPath },
        }),
      ),
    );
    const parallelMs = performance.now() - parallelStart;

    console.log(
      `  [BENCH] Batch STT (${batchSize} files, parallel): ` +
        `${parallelMs.toFixed(1)} ms total`,
    );

    expect(parallelResults).toHaveLength(batchSize);
  });

  // ── Embedding Generation for 100 Texts ────────────────────────────────

  it('should generate embeddings for 100 texts — measure throughput', async () => {
    const texts = Array.from(
      { length: 100 },
      (_, i) =>
        `This is benchmark text number ${i} for measuring embedding generation throughput. ` +
        `It contains enough words to simulate a realistic transcript segment.`,
    );

    // Single-batch embedding (all texts at once)
    const singleBatchStart = performance.now();
    const batchResult = await backend.execute({
      modelId: 'bge-m3',
      capability: 'embedding',
      input: { embeddingTexts: texts },
    });
    const singleBatchMs = performance.now() - singleBatchStart;

    expect(batchResult.output.embeddings).toBeDefined();
    expect(batchResult.output.embeddings!.length).toBe(texts.length);

    console.log(
      `  [BENCH] Embedding generation (100 texts, single batch): ` +
        `${singleBatchMs.toFixed(1)} ms ` +
        `(${formatOps((100 / singleBatchMs) * 1000)} texts/sec)`,
    );

    // Per-text embedding (one at a time)
    const perTextStart = performance.now();
    for (const text of texts) {
      const result = await backend.execute({
        modelId: 'bge-m3',
        capability: 'embedding',
        input: { text },
      });
      expect(result.output.embeddings).toBeDefined();
    }
    const perTextMs = performance.now() - perTextStart;

    console.log(
      `  [BENCH] Embedding generation (100 texts, per-text): ` +
        `${perTextMs.toFixed(1)} ms ` +
        `(${formatOps((100 / perTextMs) * 1000)} texts/sec)`,
    );

    expect(singleBatchMs).toBeLessThan(5_000);
  });

  // ── Translation Pipeline Latency ──────────────────────────────────────

  it('should translate text — measure pipeline latency', async () => {
    const texts = [
      'The president announced a new trade agreement with neighboring countries.',
      'Scientists have discovered a promising treatment for the rare disease.',
      'The technology summit attracted leaders from across the industry.',
      'Weather forecasts predict heavy rainfall throughout the weekend.',
      'The championship game drew record-breaking viewership numbers.',
    ];

    const targetLanguages = ['es', 'fr', 'de', 'ja', 'zh'];
    const iterations = texts.length * targetLanguages.length; // 25 translations

    const start = performance.now();
    const results: ModelResult[] = [];

    for (const text of texts) {
      for (const targetLang of targetLanguages) {
        const result = await backend.execute({
          modelId: 'nllb-200-1.3b',
          capability: 'translation',
          input: {
            text,
            sourceLanguage: 'en',
            targetLanguage: targetLang,
          },
        });
        results.push(result);
      }
    }

    const durationMs = performance.now() - start;
    const avgMs = durationMs / iterations;
    const opsPerSec = (iterations / durationMs) * 1000;

    console.log(
      `  [BENCH] Translation pipeline (${iterations} translations): ` +
        `${durationMs.toFixed(1)} ms total, ${avgMs.toFixed(2)} ms/translation ` +
        `(${formatOps(opsPerSec)} ops/sec)`,
    );

    for (const r of results) {
      expect(r.output.translatedText).toBeDefined();
      expect(r.output.translatedText!).toContain('[TRANSLATED:');
    }
    expect(avgMs).toBeLessThan(100);
  });

  // ── Multi-Capability Pipeline ─────────────────────────────────────────

  it('should run mixed-capability workload — measure aggregate throughput', async () => {
    const workload: ModelRequest[] = [
      // STT requests
      ...Array.from({ length: 10 }, (_, i) => ({
        modelId: 'whisper-large-v3-turbo',
        capability: 'stt' as const,
        input: { audioPath: `/tmp/mixed-${i}.wav` },
      })),
      // Embedding requests
      ...Array.from({ length: 20 }, (_, i) => ({
        modelId: 'bge-m3',
        capability: 'embedding' as const,
        input: { text: `Mixed workload embedding text ${i}` },
      })),
      // Translation requests
      ...Array.from({ length: 10 }, (_, i) => ({
        modelId: 'nllb-200-1.3b',
        capability: 'translation' as const,
        input: {
          text: `Mixed workload sentence ${i}`,
          sourceLanguage: 'en',
          targetLanguage: 'es',
        },
      })),
      // Text generation requests
      ...Array.from({ length: 10 }, (_, i) => ({
        modelId: 'phi-3-mini',
        capability: 'text-generation' as const,
        input: { text: `Generate a summary for item ${i}` },
      })),
    ];

    const totalOps = workload.length;

    // Sequential execution
    const seqStart = performance.now();
    for (const req of workload) {
      await backend.execute(req);
    }
    const seqMs = performance.now() - seqStart;

    // Parallel execution
    const parStart = performance.now();
    await Promise.all(workload.map((req) => backend.execute(req)));
    const parMs = performance.now() - parStart;

    console.log(
      `  [BENCH] Mixed workload (${totalOps} ops):`,
    );
    console.log(
      `    Sequential: ${seqMs.toFixed(1)} ms ` +
        `(${formatOps((totalOps / seqMs) * 1000)} ops/sec)`,
    );
    console.log(
      `    Parallel:   ${parMs.toFixed(1)} ms ` +
        `(${formatOps((totalOps / parMs) * 1000)} ops/sec)`,
    );

    expect(seqMs).toBeLessThan(30_000);
    expect(parMs).toBeLessThan(30_000);
  });
});
