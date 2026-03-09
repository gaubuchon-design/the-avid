/**
 * @module model-unavailable.test
 *
 * Reliability tests for model unavailability scenarios. Verifies that
 * the local AI runtime degrades gracefully when preferred backends are
 * unavailable and falls back appropriately.
 *
 * Uses real backend instances (all non-mock backends report unavailable
 * in CI) and the MockBackend as the guaranteed fallback.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockBackend } from '../../backends/MockBackend.js';
import { ONNXBackend } from '../../backends/ONNXBackend.js';
import { TensorRTBackend } from '../../backends/TensorRTBackend.js';
import { LlamaCppBackend } from '../../backends/LlamaCppBackend.js';
import { MLXBackend } from '../../backends/MLXBackend.js';
import { CTranslate2Backend } from '../../backends/CTranslate2Backend.js';
import { ModelRegistry } from '../../ModelRegistry.js';
import { createSeededRegistry } from '../../registry-seed.js';
import type {
  IModelBackend,
  ModelCapability,
  ModelRequest,
} from '../../ModelRunner.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve the first available backend for a capability.
 * Mirrors the server's resolveBackend logic.
 */
async function resolveBackend(
  capability: ModelCapability,
  backends: IModelBackend[],
): Promise<IModelBackend> {
  for (const backend of backends) {
    if (
      backend.supportedCapabilities.includes(capability) &&
      (await backend.isAvailable())
    ) {
      return backend;
    }
  }
  const mock = backends.find((b) => b.name === 'mock');
  if (mock) return mock;
  throw new Error('No backend available (not even MockBackend).');
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Model Unavailability Reliability', () => {
  let registry: ModelRegistry;
  let mockBackend: MockBackend;
  let allBackends: IModelBackend[];

  beforeAll(async () => {
    registry = createSeededRegistry();
    mockBackend = new MockBackend();
    await mockBackend.initialize();

    // All real backends plus mock — real backends will report unavailable
    allBackends = [
      new ONNXBackend(),
      new TensorRTBackend(),
      new LlamaCppBackend(),
      new MLXBackend(),
      new CTranslate2Backend(),
      mockBackend,
    ];
  });

  afterAll(async () => {
    await mockBackend.shutdown();
  });

  // ── All Real Backends Unavailable — Fallback to MockBackend ───────────

  it('should fall back to MockBackend when all real backends are unavailable', async () => {
    const capabilities: ModelCapability[] = [
      'embedding',
      'stt',
      'translation',
      'text-generation',
      'vision',
      'semantic-analysis',
      'query-rewrite',
    ];

    for (const capability of capabilities) {
      const backend = await resolveBackend(capability, allBackends);

      // In CI/dev, only MockBackend is available
      expect(backend.name).toBe('mock');

      // Verify it can actually execute
      const request: ModelRequest = {
        modelId: `test-${capability}`,
        capability,
        input: {
          text: `Test input for ${capability}`,
          audioPath: capability === 'stt' ? '/tmp/test.wav' : undefined,
          imagePath: capability === 'vision' ? '/tmp/test.jpg' : undefined,
          sourceLanguage: capability === 'translation' ? 'en' : undefined,
          targetLanguage: capability === 'translation' ? 'es' : undefined,
        },
      };

      const result = await backend.execute(request);
      expect(result.modelId).toBe(request.modelId);
      expect(result.capability).toBe(capability);
      expect(result.metrics.backend).toBe('mock');
    }
  });

  // ── Preferred Model Not Found — Select Alternative ────────────────────

  it('should select an alternative model when preferred is not in registry', async () => {
    // Try to find a nonexistent model
    const preferred = registry.getModel('nonexistent-model-v99');
    expect(preferred).toBeUndefined();

    // Find best available for embedding capability
    const alternative = registry.findBest('embedding');
    expect(alternative).toBeDefined();
    expect(alternative!.capabilities).toContain('embedding');

    // Execute with the alternative
    const backend = await resolveBackend('embedding', allBackends);
    const result = await backend.execute({
      modelId: alternative!.id,
      capability: 'embedding',
      input: { text: 'Find an alternative model' },
    });

    expect(result.output.embeddings).toBeDefined();
    expect(result.output.embeddings!.length).toBeGreaterThan(0);
  });

  // ── Registry Selection with Hardware Preference ───────────────────────

  it('should select best model considering hardware preference', () => {
    // CUDA preference — should still find a model (may not target CUDA)
    const cudaModel = registry.findBest('embedding', { hardware: 'cuda' });
    expect(cudaModel).toBeDefined();

    // Metal preference
    const metalModel = registry.findBest('embedding', { hardware: 'metal' });
    expect(metalModel).toBeDefined();

    // Auto preference — should work with any hardware
    const autoModel = registry.findBest('embedding', { hardware: 'auto' });
    expect(autoModel).toBeDefined();
  });

  // ── Registry Selection with Language Preference ───────────────────────

  it('should prefer models supporting the requested language', () => {
    // English models
    const enModel = registry.findBest('stt', { language: 'en' });
    expect(enModel).toBeDefined();

    // Multilingual models for a rare language
    const rarelangModel = registry.findBest('translation', { language: 'sw' });
    // Should still find something (multilingual models use '*')
    if (rarelangModel) {
      expect(
        rarelangModel.languages.includes('*') ||
        rarelangModel.languages.includes('sw'),
      ).toBe(true);
    }
  });

  // ── Empty Registry Returns Clear Error ────────────────────────────────

  it('should return undefined when registry has no models for a capability', () => {
    const emptyRegistry = new ModelRegistry();

    const result = emptyRegistry.findBest('embedding');
    expect(result).toBeUndefined();

    const byCapability = emptyRegistry.findByCapability('stt');
    expect(byCapability).toHaveLength(0);

    const byLanguage = emptyRegistry.findByLanguage('en');
    expect(byLanguage).toHaveLength(0);
  });

  // ── Backend Resolution with Empty Backends List ───────────────────────

  it('should throw when no backends are available at all', async () => {
    await expect(
      resolveBackend('embedding', []),
    ).rejects.toThrow('No backend available');
  });

  // ── Backend Resolution with Only Unavailable Backends ─────────────────

  it('should fall back to mock when only unavailable backends plus mock exist', async () => {
    const backendsNoMock: IModelBackend[] = [
      new ONNXBackend(),
      new TensorRTBackend(),
    ];

    // Without MockBackend, these will throw
    await expect(
      resolveBackend('embedding', backendsNoMock),
    ).rejects.toThrow('No backend available');

    // With MockBackend appended, should succeed
    backendsNoMock.push(new MockBackend());
    const backend = await resolveBackend('embedding', backendsNoMock);
    expect(backend.name).toBe('mock');
  });

  // ── Mock Backend Supports All Capabilities ────────────────────────────

  it('should handle all capabilities through MockBackend', async () => {
    const requests: ModelRequest[] = [
      {
        modelId: 'mock-embed',
        capability: 'embedding',
        input: { embeddingTexts: ['hello', 'world'] },
      },
      {
        modelId: 'mock-stt',
        capability: 'stt',
        input: { audioPath: '/tmp/audio.wav' },
      },
      {
        modelId: 'mock-translate',
        capability: 'translation',
        input: { text: 'Hello', sourceLanguage: 'en', targetLanguage: 'fr' },
      },
      {
        modelId: 'mock-gen',
        capability: 'text-generation',
        input: { text: 'Generate a summary' },
      },
      {
        modelId: 'mock-vision',
        capability: 'vision',
        input: { imagePath: '/tmp/frame.jpg' },
      },
      {
        modelId: 'mock-semantic',
        capability: 'semantic-analysis',
        input: { text: 'Analyze this text semantically' },
      },
      {
        modelId: 'mock-rewrite',
        capability: 'query-rewrite',
        input: { text: 'find sports clips' },
      },
    ];

    for (const req of requests) {
      const result = await mockBackend.execute(req);
      expect(result.modelId).toBe(req.modelId);
      expect(result.capability).toBe(req.capability);
      expect(result.metrics).toBeDefined();
      expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  // ── Backend Lifecycle (Init / Shutdown / Re-init) ─────────────────────

  it('should handle backend shutdown and re-initialization', async () => {
    const backend = new MockBackend();

    // Initialize
    await backend.initialize();
    expect(await backend.isAvailable()).toBe(true);

    // Execute a request
    const result1 = await backend.execute({
      modelId: 'lifecycle-test',
      capability: 'embedding',
      input: { text: 'before shutdown' },
    });
    expect(result1.output.embeddings).toBeDefined();
    expect(backend.getLoadedModels()).toContain('lifecycle-test');

    // Shutdown
    await backend.shutdown();
    expect(backend.getLoadedModels()).toHaveLength(0);

    // Re-initialize and execute again
    await backend.initialize();
    const result2 = await backend.execute({
      modelId: 'lifecycle-test-2',
      capability: 'stt',
      input: { audioPath: '/tmp/test.wav' },
    });
    expect(result2.output.transcriptSegments).toBeDefined();
    expect(backend.getLoadedModels()).toContain('lifecycle-test-2');

    await backend.shutdown();
  });
});
