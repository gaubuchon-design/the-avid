import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateEmbeddings } from '../capabilities/embedding';
import type { ModelRegistry } from '../ModelRegistry';
import type { IModelBackend, ModelResult } from '../ModelRunner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRegistry(
  findBestResult: { id: string } | undefined = { id: 'bge-m3' },
): ModelRegistry {
  return {
    findBest: vi.fn().mockReturnValue(findBestResult),
  } as unknown as ModelRegistry;
}

function createMockBackend(
  embeddings: number[][] = [[0.1, 0.2, 0.3]],
): IModelBackend {
  return {
    name: 'mock-backend',
    supportedCapabilities: ['embedding'],
    supportedHardware: ['cpu'],
    isAvailable: vi.fn().mockResolvedValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    getLoadedModels: vi.fn().mockReturnValue(['bge-m3']),
    execute: vi.fn().mockResolvedValue({
      modelId: 'bge-m3',
      capability: 'embedding',
      output: { embeddings },
      metrics: {
        durationMs: 50,
        tokensProcessed: 10,
        backend: 'mock',
        hardware: 'cpu',
      },
    } satisfies ModelResult),
  };
}

describe('generateEmbeddings', () => {
  let registry: ModelRegistry;
  let backend: IModelBackend;

  beforeEach(() => {
    registry = createMockRegistry();
    backend = createMockBackend();
  });

  // -----------------------------------------------------------------------
  // Input validation
  // -----------------------------------------------------------------------

  describe('input validation', () => {
    it('throws on empty texts array', async () => {
      await expect(
        generateEmbeddings([], registry, backend),
      ).rejects.toThrow('At least one text');
    });

    it('throws when a text exceeds maximum length', async () => {
      const longText = 'x'.repeat(100_001);
      await expect(
        generateEmbeddings([longText], registry, backend),
      ).rejects.toThrow('exceeds the maximum length');
    });

    it('throws when a text entry is not a string', async () => {
      // TypeScript prevents this but test at runtime
      await expect(
        generateEmbeddings([42 as unknown as string], registry, backend),
      ).rejects.toThrow('not a string');
    });

    it('includes index in error message for invalid texts', async () => {
      await expect(
        generateEmbeddings(
          ['valid', 123 as unknown as string],
          registry,
          backend,
        ),
      ).rejects.toThrow('texts[1]');
    });
  });

  // -----------------------------------------------------------------------
  // Model resolution
  // -----------------------------------------------------------------------

  describe('model resolution', () => {
    it('uses explicit modelId when provided', async () => {
      await generateEmbeddings(['hello'], registry, backend, {
        modelId: 'custom-model',
      });

      expect(registry.findBest).not.toHaveBeenCalled();
      expect(backend.execute).toHaveBeenCalledWith(
        expect.objectContaining({ modelId: 'custom-model' }),
      );
    });

    it('resolves model from registry when no modelId provided', async () => {
      await generateEmbeddings(['hello'], registry, backend);

      expect(registry.findBest).toHaveBeenCalledWith('embedding');
      expect(backend.execute).toHaveBeenCalledWith(
        expect.objectContaining({ modelId: 'bge-m3' }),
      );
    });

    it('throws when no embedding model is registered', async () => {
      const emptyRegistry: ModelRegistry = {
        findBest: vi.fn().mockReturnValue(undefined),
      } as unknown as ModelRegistry;

      const noopBackend: IModelBackend = {
        name: 'noop',
        supportedCapabilities: ['embedding'],
        supportedHardware: ['cpu'],
        isAvailable: vi.fn().mockResolvedValue(true),
        initialize: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn().mockResolvedValue(undefined),
        getLoadedModels: vi.fn().mockReturnValue([]),
        execute: vi.fn().mockRejectedValue(new Error('Should not be called')),
      };

      await expect(
        generateEmbeddings(['hello'], emptyRegistry, noopBackend),
      ).rejects.toThrow('No embedding model registered');
    });
  });

  // -----------------------------------------------------------------------
  // Single batch
  // -----------------------------------------------------------------------

  describe('single batch execution', () => {
    it('returns embedding result for a single text', async () => {
      const result = await generateEmbeddings(['hello world'], registry, backend);

      expect(result.embeddings).toHaveLength(1);
      expect(result.modelId).toBe('bge-m3');
      expect(result.dimensions).toBe(3);
    });

    it('handles multiple texts in a single batch', async () => {
      const mockBackend = createMockBackend([
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ]);

      const result = await generateEmbeddings(
        ['text 1', 'text 2'],
        registry,
        mockBackend,
      );

      expect(result.embeddings).toHaveLength(2);
    });

    it('sends correct input to backend', async () => {
      await generateEmbeddings(['hello', 'world'], registry, backend);

      expect(backend.execute).toHaveBeenCalledWith({
        modelId: 'bge-m3',
        capability: 'embedding',
        input: { embeddingTexts: ['hello', 'world'] },
      });
    });
  });

  // -----------------------------------------------------------------------
  // Batch chunking
  // -----------------------------------------------------------------------

  describe('batch chunking', () => {
    it('splits large input into multiple batches', async () => {
      const texts = Array.from({ length: 10 }, (_, i) => `text-${i}`);

      // Use batchSize=3 so 10 texts -> 4 batches (3+3+3+1)
      const mockBackend = {
        ...createMockBackend(),
        execute: vi.fn().mockImplementation(
          (req: { input: { embeddingTexts: readonly string[] } }) => {
            const batchTexts = req.input.embeddingTexts ?? [];
            return Promise.resolve({
              modelId: 'bge-m3',
              capability: 'embedding',
              output: {
                embeddings: batchTexts.map(() => [0.1, 0.2]),
              },
              metrics: { durationMs: 10, backend: 'mock', hardware: 'cpu' },
            } satisfies ModelResult);
          },
        ),
      } as unknown as IModelBackend;

      const result = await generateEmbeddings(texts, registry, mockBackend, {
        batchSize: 3,
      });

      expect(result.embeddings).toHaveLength(10);
      expect(mockBackend.execute).toHaveBeenCalledTimes(4);
    });

    it('uses default batchSize of 256', async () => {
      const texts = Array.from({ length: 300 }, (_, i) => `text-${i}`);

      const mockBackend = {
        ...createMockBackend(),
        execute: vi.fn().mockResolvedValue({
          modelId: 'bge-m3',
          capability: 'embedding',
          output: { embeddings: texts.map(() => [0.1]) },
          metrics: { durationMs: 10, backend: 'mock', hardware: 'cpu' },
        } satisfies ModelResult),
      } as unknown as IModelBackend;

      await generateEmbeddings(texts, registry, mockBackend);

      // 300 texts / 256 batch = 2 batches
      expect(mockBackend.execute).toHaveBeenCalledTimes(2);
    });

    it('handles exact batch size without extra call', async () => {
      const texts = Array.from({ length: 5 }, (_, i) => `text-${i}`);

      const mockBackend = createMockBackend(
        texts.map(() => [0.1, 0.2]),
      );

      await generateEmbeddings(texts, registry, mockBackend, {
        batchSize: 5,
      });

      // Exactly batchSize -- single batch fast path
      expect(mockBackend.execute).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles single character text', async () => {
      const result = await generateEmbeddings(['a'], registry, backend);
      expect(result.embeddings).toHaveLength(1);
    });

    it('handles text at max length', async () => {
      const maxText = 'x'.repeat(100_000);
      const result = await generateEmbeddings([maxText], registry, backend);
      expect(result.embeddings).toHaveLength(1);
    });

    it('handles backend returning empty embeddings array', async () => {
      const emptyBackend = createMockBackend([]);
      (emptyBackend.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        modelId: 'bge-m3',
        capability: 'embedding',
        output: { embeddings: [] },
        metrics: { durationMs: 10, backend: 'mock', hardware: 'cpu' },
      } satisfies ModelResult);

      const result = await generateEmbeddings(['hello'], registry, emptyBackend);
      expect(result.embeddings).toEqual([]);
      expect(result.dimensions).toBe(0);
    });

    it('propagates backend errors', async () => {
      const failBackend = createMockBackend();
      (failBackend.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Backend crashed'),
      );

      await expect(
        generateEmbeddings(['hello'], registry, failBackend),
      ).rejects.toThrow('Backend crashed');
    });
  });
});
