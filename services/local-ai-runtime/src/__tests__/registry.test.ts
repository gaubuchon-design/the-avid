/**
 * @file registry.test.ts
 *
 * Tests for ModelRegistry — registration, lookup by capability/language,
 * findBest heuristics, and edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRegistry, type ModelRegistryEntry } from '../ModelRegistry';
import { seedRegistry, createSeededRegistry } from '../registry-seed';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<ModelRegistryEntry> = {}): ModelRegistryEntry {
  return {
    id: 'test-model',
    name: 'Test Model',
    capabilities: ['text-generation'],
    languages: ['en'],
    backend: 'mock',
    quantization: 'fp16',
    hardware: 'cpu',
    sizeBytes: 1_000_000,
    description: 'A test model.',
    version: '1.0.0',
    license: 'mit',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModelRegistry', () => {
  let registry: ModelRegistry;

  beforeEach(() => {
    registry = new ModelRegistry();
  });

  // -----------------------------------------------------------------------
  // register / unregister
  // -----------------------------------------------------------------------

  describe('register', () => {
    it('should register a model and retrieve it by ID', () => {
      const entry = makeEntry({ id: 'my-model' });
      registry.register(entry);

      const result = registry.getModel('my-model');
      expect(result).toBeDefined();
      expect(result!.id).toBe('my-model');
      expect(result!.name).toBe('Test Model');
    });

    it('should throw when registering a duplicate model ID', () => {
      registry.register(makeEntry({ id: 'dup' }));
      expect(() => registry.register(makeEntry({ id: 'dup' }))).toThrow(
        'Model "dup" is already registered',
      );
    });
  });

  describe('unregister', () => {
    it('should remove a registered model', () => {
      registry.register(makeEntry({ id: 'removable' }));
      expect(registry.unregister('removable')).toBe(true);
      expect(registry.getModel('removable')).toBeUndefined();
    });

    it('should return false for unknown model IDs', () => {
      expect(registry.unregister('nonexistent')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getModel
  // -----------------------------------------------------------------------

  describe('getModel', () => {
    it('should return undefined for unknown IDs', () => {
      expect(registry.getModel('nope')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // findByCapability
  // -----------------------------------------------------------------------

  describe('findByCapability', () => {
    it('should return models matching the requested capability', () => {
      registry.register(makeEntry({ id: 'a', capabilities: ['embedding'] }));
      registry.register(makeEntry({ id: 'b', capabilities: ['stt'] }));
      registry.register(makeEntry({ id: 'c', capabilities: ['embedding', 'text-generation'] }));

      const embeddingModels = registry.findByCapability('embedding');
      expect(embeddingModels).toHaveLength(2);
      expect(embeddingModels.map((m) => m.id).sort()).toEqual(['a', 'c']);
    });

    it('should return an empty array when no models match', () => {
      registry.register(makeEntry({ id: 'x', capabilities: ['stt'] }));
      expect(registry.findByCapability('vision')).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // findByLanguage
  // -----------------------------------------------------------------------

  describe('findByLanguage', () => {
    it('should return models that list the given language', () => {
      registry.register(makeEntry({ id: 'en-model', languages: ['en'] }));
      registry.register(makeEntry({ id: 'fr-model', languages: ['fr'] }));
      registry.register(makeEntry({ id: 'multi', languages: ['*'] }));

      const frModels = registry.findByLanguage('fr');
      expect(frModels.map((m) => m.id).sort()).toEqual(['fr-model', 'multi']);
    });

    it('should be case-insensitive', () => {
      registry.register(makeEntry({ id: 'en-upper', languages: ['EN'] }));
      expect(registry.findByLanguage('en')).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // findBest
  // -----------------------------------------------------------------------

  describe('findBest', () => {
    it('should return the model with the highest quantization quality', () => {
      registry.register(makeEntry({ id: 'low', capabilities: ['embedding'], quantization: 'int4' }));
      registry.register(makeEntry({ id: 'high', capabilities: ['embedding'], quantization: 'fp16' }));
      registry.register(makeEntry({ id: 'mid', capabilities: ['embedding'], quantization: 'int8' }));

      const best = registry.findBest('embedding');
      expect(best).toBeDefined();
      expect(best!.id).toBe('high');
    });

    it('should prefer models matching the requested language', () => {
      registry.register(
        makeEntry({ id: 'en-only', capabilities: ['stt'], languages: ['en'], quantization: 'fp32' }),
      );
      registry.register(
        makeEntry({ id: 'fr-only', capabilities: ['stt'], languages: ['fr'], quantization: 'fp16' }),
      );

      const best = registry.findBest('stt', { language: 'fr' });
      expect(best).toBeDefined();
      expect(best!.id).toBe('fr-only');
    });

    it('should prefer models matching the requested hardware', () => {
      registry.register(
        makeEntry({ id: 'cpu-model', capabilities: ['text-generation'], hardware: 'cpu', quantization: 'fp16' }),
      );
      registry.register(
        makeEntry({ id: 'cuda-model', capabilities: ['text-generation'], hardware: 'cuda', quantization: 'fp16' }),
      );

      const best = registry.findBest('text-generation', { hardware: 'cuda' });
      expect(best).toBeDefined();
      expect(best!.id).toBe('cuda-model');
    });

    it('should return undefined when no models match the capability', () => {
      registry.register(makeEntry({ id: 'no-match', capabilities: ['stt'] }));
      expect(registry.findBest('vision')).toBeUndefined();
    });

    it('should ignore hardware preference "auto"', () => {
      registry.register(
        makeEntry({ id: 'any', capabilities: ['embedding'], hardware: 'cpu', quantization: 'fp16' }),
      );

      const best = registry.findBest('embedding', { hardware: 'auto' });
      expect(best).toBeDefined();
      expect(best!.id).toBe('any');
    });
  });

  // -----------------------------------------------------------------------
  // listAll
  // -----------------------------------------------------------------------

  describe('listAll', () => {
    it('should return all registered models', () => {
      registry.register(makeEntry({ id: 'one' }));
      registry.register(makeEntry({ id: 'two' }));
      registry.register(makeEntry({ id: 'three' }));

      expect(registry.listAll()).toHaveLength(3);
    });

    it('should return an empty array when no models are registered', () => {
      expect(registry.listAll()).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // seedRegistry
  // -----------------------------------------------------------------------

  describe('seedRegistry', () => {
    it('should populate the registry with all catalogue entries', () => {
      const count = seedRegistry(registry);
      expect(count).toBe(10);
      expect(registry.listAll()).toHaveLength(10);
    });

    it('should be idempotent (no errors on double-seed)', () => {
      seedRegistry(registry);
      const secondCount = seedRegistry(registry);
      expect(secondCount).toBe(0); // All already registered
      expect(registry.listAll()).toHaveLength(10);
    });
  });

  describe('createSeededRegistry', () => {
    it('should return a registry pre-populated with all models', () => {
      const seeded = createSeededRegistry();
      expect(seeded.listAll().length).toBe(10);

      // Spot-check some models
      expect(seeded.getModel('whisper-large-v3')).toBeDefined();
      expect(seeded.getModel('bge-m3')).toBeDefined();
      expect(seeded.getModel('gemma-3')).toBeDefined();
    });

    it('should have embedding models with dimensions set', () => {
      const seeded = createSeededRegistry();
      const bge = seeded.getModel('bge-m3');
      expect(bge).toBeDefined();
      expect(bge!.dimensions).toBe(1024);

      const nvEmbed = seeded.getModel('nvidia-embed-v2');
      expect(nvEmbed).toBeDefined();
      expect(nvEmbed!.dimensions).toBe(768);
    });
  });
});
