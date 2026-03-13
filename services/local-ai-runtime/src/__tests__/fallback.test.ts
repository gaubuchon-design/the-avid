/**
 * @file fallback.test.ts
 *
 * Tests that the system correctly falls back to MockBackend when preferred
 * backends are unavailable, and that MockBackend produces valid results for
 * every capability.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockBackend } from '../backends/MockBackend';
import { ONNXBackend } from '../backends/ONNXBackend';
import { TensorRTBackend } from '../backends/TensorRTBackend';
import { LlamaCppBackend } from '../backends/LlamaCppBackend';
import { MLXBackend } from '../backends/MLXBackend';
import { CTranslate2Backend } from '../backends/CTranslate2Backend';
import { FasterWhisperBackend } from '../backends/FasterWhisperBackend';
import { createSeededRegistry } from '../registry-seed';
import { generateEmbeddings } from '../capabilities/embedding';
import { transcribe } from '../capabilities/stt';
import { translate } from '../capabilities/translation';
import { analyzeQuery, analyzeContent } from '../capabilities/semantic-analysis';
import type { IModelBackend, ModelCapability } from '../ModelRunner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the first available backend, same logic as server.ts. */
async function resolveBackend(
  backends: IModelBackend[],
  capability: ModelCapability,
): Promise<IModelBackend> {
  for (const backend of backends) {
    if (
      backend.supportedCapabilities.includes(capability) &&
      (await backend.isAvailable())
    ) {
      return backend;
    }
  }
  throw new Error('No backend available.');
}

// ---------------------------------------------------------------------------
// Tests — backend availability
// ---------------------------------------------------------------------------

describe('Backend fallback', () => {
  it('ONNXBackend should not be available in test environment', async () => {
    const backend = new ONNXBackend();
    expect(await backend.isAvailable()).toBe(false);
  });

  it('TensorRTBackend should not be available in test environment', async () => {
    const backend = new TensorRTBackend();
    expect(await backend.isAvailable()).toBe(false);
  });

  it('MLXBackend should not be available in test environment', async () => {
    const backend = new MLXBackend();
    expect(await backend.isAvailable()).toBe(false);
  });

  it('CTranslate2Backend should not be available in test environment', async () => {
    const backend = new CTranslate2Backend();
    expect(await backend.isAvailable()).toBe(false);
  });

  it('FasterWhisperBackend availability probe returns a boolean', async () => {
    const backend = new FasterWhisperBackend();
    expect(typeof (await backend.isAvailable())).toBe('boolean');
  });

  it('MockBackend should always be available', async () => {
    const backend = new MockBackend();
    expect(await backend.isAvailable()).toBe(true);
  });

  it('should resolve to MockBackend when all real backends are unavailable', async () => {
    const backends: IModelBackend[] = [
      new ONNXBackend(),
      new TensorRTBackend(),
      new LlamaCppBackend(),
      new MLXBackend(),
      new CTranslate2Backend(),
      new MockBackend(),
    ];

    const resolved = await resolveBackend(backends, 'embedding');
    expect(resolved.name).toBe('mock');
  });
});

// ---------------------------------------------------------------------------
// Tests — MockBackend produces valid results for all capabilities
// ---------------------------------------------------------------------------

describe('MockBackend execution', () => {
  let backend: MockBackend;

  beforeEach(async () => {
    backend = new MockBackend();
    await backend.initialize();
  });

  it('should produce embedding vectors of correct dimensions', async () => {
    const result = await backend.execute({
      modelId: 'test-embed',
      capability: 'embedding',
      input: { embeddingTexts: ['hello', 'world'] },
    });

    expect(result.modelId).toBe('test-embed');
    expect(result.capability).toBe('embedding');
    expect(result.output.embeddings).toBeDefined();
    expect(result.output.embeddings).toHaveLength(2);
    expect(result.output.embeddings![0]).toHaveLength(384);
    // Verify L2 normalisation (should be close to 1)
    const norm = Math.sqrt(
      result!.output.embeddings![0]!.reduce((s, v) => s + v * v, 0),
    );
    expect(norm).toBeCloseTo(1, 1);
  });

  it('should produce transcript segments for STT', async () => {
    const result = await backend.execute({
      modelId: 'test-stt',
      capability: 'stt',
      input: { audioPath: '/dev/null' },
    });

    expect(result.output.transcriptSegments).toBeDefined();
    expect(result.output.transcriptSegments!.length).toBeGreaterThan(0);

    const seg = result.output.transcriptSegments![0];
    expect(seg!.startTime).toBeDefined();
    expect(seg!.endTime).toBeGreaterThan(seg!.startTime);
    expect(seg!.text).toBeTruthy();
    expect(seg!.confidence).toBeGreaterThan(0);
    expect(seg!.confidence).toBeLessThanOrEqual(1);
  });

  it('should produce translated text with target language prefix', async () => {
    const result = await backend.execute({
      modelId: 'test-translate',
      capability: 'translation',
      input: { text: 'Hello world', sourceLanguage: 'en', targetLanguage: 'fr' },
    });

    expect(result.output.translatedText).toBeDefined();
    expect(result.output.translatedText).toContain('[TRANSLATED:fr]');
    expect(result.output.translatedText).toContain('Hello world');
  });

  it('should produce generated text for text-generation', async () => {
    const result = await backend.execute({
      modelId: 'test-gen',
      capability: 'text-generation',
      input: { text: 'Tell me about video editing.' },
    });

    expect(result.output.text).toBeDefined();
    expect(result.output.text!.length).toBeGreaterThan(0);
    expect(result.output.text).toContain('MockBackend');
  });

  it('should produce scene analysis for vision', async () => {
    const result = await backend.execute({
      modelId: 'test-vision',
      capability: 'vision',
      input: { imagePath: '/dev/null' },
    });

    expect(result.output.analysisResult).toBeDefined();
    expect(result.output.analysisResult!['description']).toBeTruthy();
    expect(result.output.analysisResult!['objects']).toBeDefined();
    expect(result.output.analysisResult!['tags']).toBeDefined();
  });

  it('should produce analysis result for semantic-analysis', async () => {
    const result = await backend.execute({
      modelId: 'test-analysis',
      capability: 'semantic-analysis',
      input: { text: 'Some content to analyse.' },
    });

    expect(result.output.analysisResult).toBeDefined();
    expect(result.output.analysisResult!['summary']).toBeTruthy();
    expect(result.output.analysisResult!['keywords']).toBeDefined();
    expect(result.output.analysisResult!['sentiment']).toBeDefined();
  });

  it('should produce rewritten query for query-rewrite', async () => {
    const result = await backend.execute({
      modelId: 'test-rewrite',
      capability: 'query-rewrite',
      input: { text: 'find sports clips' },
    });

    expect(result.output.text).toBeDefined();
    expect(result.output.text).toContain('find sports clips');
  });

  it('should include valid execution metrics', async () => {
    const result = await backend.execute({
      modelId: 'metrics-test',
      capability: 'text-generation',
      input: { text: 'test' },
    });

    expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.metrics.backend).toBe('mock');
    expect(result.metrics.hardware).toBe('cpu');
  });

  it('should track loaded models', async () => {
    await backend.execute({
      modelId: 'model-a',
      capability: 'text-generation',
      input: { text: 'test' },
    });
    await backend.execute({
      modelId: 'model-b',
      capability: 'embedding',
      input: { embeddingTexts: ['test'] },
    });

    const loaded = backend.getLoadedModels();
    expect(loaded).toContain('model-a');
    expect(loaded).toContain('model-b');
  });

  it('should clear loaded models on shutdown', async () => {
    await backend.execute({
      modelId: 'model-x',
      capability: 'text-generation',
      input: { text: 'test' },
    });
    await backend.shutdown();

    expect(backend.getLoadedModels()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests — capability pipelines fall back to MockBackend
// ---------------------------------------------------------------------------

describe('Capability pipeline fallback', () => {
  const registry = createSeededRegistry();
  let backend: MockBackend;

  beforeEach(async () => {
    backend = new MockBackend();
    await backend.initialize();
  });

  it('generateEmbeddings should work via MockBackend', async () => {
    const result = await generateEmbeddings(
      ['test sentence one', 'test sentence two'],
      registry,
      backend,
    );

    expect(result.embeddings).toHaveLength(2);
    expect(result.dimensions).toBe(384);
    expect(result.modelId).toBeTruthy();
  });

  it('transcribe should work via MockBackend', async () => {
    const result = await transcribe('/dev/null', registry, backend);

    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.language).toBe('en');
    expect(result.modelId).toBeTruthy();
  });

  it('translate should work via MockBackend', async () => {
    const result = await translate(
      'Hello world',
      'en',
      'fr',
      registry,
      backend,
    );

    expect(result.translatedText).toContain('[TRANSLATED:fr]');
    expect(result.translatedText).toContain('Hello world');
    expect(result.modelId).toBeTruthy();
  });

  it('analyzeQuery should work via MockBackend', async () => {
    const result = await analyzeQuery(
      'find video clips about sports',
      registry,
      backend,
    );

    expect(result.rewrittenQuery).toBeTruthy();
    expect(result.intents.length).toBeGreaterThan(0);
    expect(result.modalities.length).toBeGreaterThan(0);
  });

  it('analyzeContent should work via MockBackend', async () => {
    const result = await analyzeContent(
      'This is a test article about artificial intelligence in video editing.',
      registry,
      backend,
    );

    expect(result.summary).toBeTruthy();
    expect(result.keywords).toBeDefined();
    expect(result.sentiment).toBeTruthy();
    expect(result.topics).toBeDefined();
  });
});
