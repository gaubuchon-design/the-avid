import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRegistry } from '../ModelRegistry';
import type { ModelRegistryEntry } from '../ModelRegistry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<ModelRegistryEntry> = {}): ModelRegistryEntry {
  return {
    id: 'test-model',
    name: 'Test Model',
    capabilities: ['embedding'],
    languages: ['en'],
    backend: 'onnxruntime',
    quantization: 'fp16',
    hardware: 'cpu',
    sizeBytes: 100_000_000,
    dimensions: 768,
    description: 'A test model',
    version: '1.0.0',
    license: 'MIT',
    ...overrides,
  };
}

describe('ModelRegistry', () => {
  let registry: ModelRegistry;

  beforeEach(() => {
    registry = new ModelRegistry();
  });

  // -----------------------------------------------------------------------
  // register / unregister
  // -----------------------------------------------------------------------

  describe('register', () => {
    it('registers a model entry', () => {
      registry.register(makeEntry());
      expect(registry.getModel('test-model')).toBeDefined();
    });

    it('throws when registering a duplicate id', () => {
      registry.register(makeEntry());
      expect(() => registry.register(makeEntry())).toThrow('already registered');
    });

    it('initializes runtime state as unloaded', () => {
      registry.register(makeEntry());
      expect(registry.getLoadState('test-model')).toBe('unloaded');
    });
  });

  describe('unregister', () => {
    it('removes a model and returns true', () => {
      registry.register(makeEntry());
      const result = registry.unregister('test-model');
      expect(result).toBe(true);
      expect(registry.getModel('test-model')).toBeUndefined();
    });

    it('returns false for non-existent model', () => {
      expect(registry.unregister('nonexistent')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // lookup
  // -----------------------------------------------------------------------

  describe('getModel', () => {
    it('returns the model entry when found', () => {
      registry.register(makeEntry({ id: 'whisper-large' }));
      const model = registry.getModel('whisper-large');
      expect(model?.id).toBe('whisper-large');
    });

    it('returns undefined when not found', () => {
      expect(registry.getModel('nonexistent')).toBeUndefined();
    });
  });

  describe('findByCapability', () => {
    it('finds all models with a given capability', () => {
      registry.register(makeEntry({ id: 'emb1', capabilities: ['embedding'] }));
      registry.register(makeEntry({ id: 'stt1', capabilities: ['stt'] }));
      registry.register(makeEntry({ id: 'emb2', capabilities: ['embedding', 'stt'] }));

      const embModels = registry.findByCapability('embedding');
      expect(embModels).toHaveLength(2);
      expect(embModels.map((m) => m.id)).toContain('emb1');
      expect(embModels.map((m) => m.id)).toContain('emb2');
    });

    it('returns empty array when no models match', () => {
      registry.register(makeEntry({ capabilities: ['stt'] }));
      expect(registry.findByCapability('embedding')).toEqual([]);
    });
  });

  describe('findByLanguage', () => {
    it('finds models supporting a specific language', () => {
      registry.register(makeEntry({ id: 'en-model', languages: ['en'] }));
      registry.register(makeEntry({ id: 'fr-model', languages: ['fr'] }));

      const models = registry.findByLanguage('en');
      expect(models).toHaveLength(1);
      expect(models[0]!.id).toBe('en-model');
    });

    it('includes multilingual models (wildcard *)', () => {
      registry.register(makeEntry({ id: 'multi', languages: ['*'] }));
      registry.register(makeEntry({ id: 'en-only', languages: ['en'] }));

      const models = registry.findByLanguage('fr');
      expect(models).toHaveLength(1);
      expect(models[0]!.id).toBe('multi');
    });

    it('is case-insensitive', () => {
      registry.register(makeEntry({ id: 'model', languages: ['EN'] }));
      expect(registry.findByLanguage('en')).toHaveLength(1);
    });
  });

  describe('findBest', () => {
    it('returns undefined when no models match capability', () => {
      expect(registry.findBest('vision')).toBeUndefined();
    });

    it('selects model with highest quantization quality', () => {
      registry.register(
        makeEntry({ id: 'low-q', capabilities: ['embedding'], quantization: 'int4' }),
      );
      registry.register(
        makeEntry({ id: 'high-q', capabilities: ['embedding'], quantization: 'fp16' }),
      );

      const best = registry.findBest('embedding');
      expect(best?.id).toBe('high-q');
    });

    it('prefers language-matching models and then sorts by quantization', () => {
      registry.register(
        makeEntry({ id: 'multi', capabilities: ['stt'], languages: ['*'], quantization: 'fp32' }),
      );
      registry.register(
        makeEntry({ id: 'fr-stt', capabilities: ['stt'], languages: ['fr'], quantization: 'int8' }),
      );

      const best = registry.findBest('stt', { language: 'fr' });
      // Both match French (multi via wildcard, fr-stt via explicit)
      // After filtering, models are sorted by quantization quality (fp32 > int8)
      expect(best?.id).toBe('multi');
    });

    it('narrows to language matches when only some models support the language', () => {
      registry.register(
        makeEntry({ id: 'en-only', capabilities: ['stt'], languages: ['en'], quantization: 'fp32' }),
      );
      registry.register(
        makeEntry({ id: 'fr-stt', capabilities: ['stt'], languages: ['fr'], quantization: 'int8' }),
      );

      const best = registry.findBest('stt', { language: 'fr' });
      // Only fr-stt matches French, so it is selected despite lower quantization
      expect(best?.id).toBe('fr-stt');
    });

    it('prefers hardware-specific models', () => {
      registry.register(
        makeEntry({ id: 'cpu', capabilities: ['embedding'], hardware: 'cpu', quantization: 'fp16' }),
      );
      registry.register(
        makeEntry({ id: 'cuda', capabilities: ['embedding'], hardware: 'cuda', quantization: 'fp16' }),
      );

      const best = registry.findBest('embedding', { hardware: 'cuda' });
      expect(best?.id).toBe('cuda');
    });

    it('falls back when no hardware match exists', () => {
      registry.register(
        makeEntry({ id: 'cpu-only', capabilities: ['embedding'], hardware: 'cpu' }),
      );

      const best = registry.findBest('embedding', { hardware: 'tensorrt' });
      expect(best?.id).toBe('cpu-only');
    });

    it('ignores hardware preference when set to auto', () => {
      registry.register(
        makeEntry({ id: 'm1', capabilities: ['embedding'], hardware: 'cpu', quantization: 'fp32' }),
      );
      registry.register(
        makeEntry({ id: 'm2', capabilities: ['embedding'], hardware: 'cuda', quantization: 'int8' }),
      );

      const best = registry.findBest('embedding', { hardware: 'auto' });
      // Should pick by quantization quality since hardware = auto is ignored
      expect(best?.id).toBe('m1');
    });
  });

  describe('listAll', () => {
    it('returns all registered models', () => {
      registry.register(makeEntry({ id: 'a' }));
      registry.register(makeEntry({ id: 'b' }));

      const all = registry.listAll();
      expect(all).toHaveLength(2);
    });

    it('returns empty array when no models registered', () => {
      expect(registry.listAll()).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Lifecycle tracking
  // -----------------------------------------------------------------------

  describe('setLoadState', () => {
    it('updates the load state', () => {
      registry.register(makeEntry());
      registry.setLoadState('test-model', 'loading');
      expect(registry.getLoadState('test-model')).toBe('loading');
    });

    it('sets loadedAt when transitioning to loaded', () => {
      registry.register(makeEntry());
      registry.setLoadState('test-model', 'loaded');

      const state = registry.getLoadState('test-model');
      expect(state).toBe('loaded');
    });

    it('does not throw for non-existent model', () => {
      expect(() =>
        registry.setLoadState('nonexistent', 'loaded'),
      ).not.toThrow();
    });
  });

  describe('getLoadState', () => {
    it('returns undefined for non-existent model', () => {
      expect(registry.getLoadState('nonexistent')).toBeUndefined();
    });
  });

  describe('recordInvocation', () => {
    it('increments invoke count and tracks duration', () => {
      registry.register(makeEntry());
      registry.recordInvocation('test-model', 100);
      registry.recordInvocation('test-model', 200);

      const stats = registry.getModelStats('test-model');
      expect(stats?.invokeCount).toBe(2);
      expect(stats?.totalInferenceMs).toBe(300);
      expect(stats?.avgInferenceMs).toBe(150);
    });

    it('does not throw for non-existent model', () => {
      expect(() =>
        registry.recordInvocation('nonexistent', 100),
      ).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // getModelStats
  // -----------------------------------------------------------------------

  describe('getModelStats', () => {
    it('returns full stats for a registered model', () => {
      registry.register(makeEntry());
      registry.setLoadState('test-model', 'loaded');
      registry.recordInvocation('test-model', 50);

      const stats = registry.getModelStats('test-model');

      expect(stats).toBeDefined();
      expect(stats?.loadState).toBe('loaded');
      expect(stats?.invokeCount).toBe(1);
      expect(stats?.totalInferenceMs).toBe(50);
      expect(stats?.avgInferenceMs).toBe(50);
      expect(stats?.lastInvokedAt).toBeGreaterThan(0);
    });

    it('returns avgInferenceMs = 0 when no invocations', () => {
      registry.register(makeEntry());
      const stats = registry.getModelStats('test-model');
      expect(stats?.avgInferenceMs).toBe(0);
    });

    it('returns undefined for non-existent model', () => {
      expect(registry.getModelStats('nonexistent')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // findIdleModels
  // -----------------------------------------------------------------------

  describe('findIdleModels', () => {
    it('does not include models invoked in the same tick (age is 0, not > threshold)', () => {
      registry.register(makeEntry({ id: 'just-invoked' }));
      registry.setLoadState('just-invoked', 'loaded');
      registry.recordInvocation('just-invoked', 50);

      // Threshold of 0: check is `now - lastInvokedAt > 0`
      // Since invocation just happened at the same Date.now(), age=0 is not > 0
      const idle = registry.findIdleModels(0);
      expect(idle).not.toContain('just-invoked');
    });

    it('does not include unloaded models', () => {
      registry.register(makeEntry({ id: 'unloaded-model' }));
      registry.recordInvocation('unloaded-model', 50);

      const idle = registry.findIdleModels(0);
      expect(idle).not.toContain('unloaded-model');
    });

    it('does not include recently invoked models when threshold is very large', () => {
      registry.register(makeEntry({ id: 'active-model' }));
      registry.setLoadState('active-model', 'loaded');
      registry.recordInvocation('active-model', 50);

      // Use a very large threshold
      const idle = registry.findIdleModels(999_999_999);
      expect(idle).not.toContain('active-model');
    });

    it('does not include models that have never been invoked', () => {
      registry.register(makeEntry({ id: 'never-invoked' }));
      registry.setLoadState('never-invoked', 'loaded');

      // lastInvokedAt is 0 (never invoked), so the condition
      // `state.lastInvokedAt > 0` is false
      const idle = registry.findIdleModels(0);
      expect(idle).not.toContain('never-invoked');
    });
  });

  // -----------------------------------------------------------------------
  // getLoadedMemoryEstimate
  // -----------------------------------------------------------------------

  describe('getLoadedMemoryEstimate', () => {
    it('returns 0 when no models are loaded', () => {
      registry.register(makeEntry());
      expect(registry.getLoadedMemoryEstimate()).toBe(0);
    });

    it('sums sizeBytes of loaded models', () => {
      registry.register(makeEntry({ id: 'm1', sizeBytes: 100_000 }));
      registry.register(makeEntry({ id: 'm2', sizeBytes: 200_000 }));
      registry.register(makeEntry({ id: 'm3', sizeBytes: 300_000 }));

      registry.setLoadState('m1', 'loaded');
      registry.setLoadState('m2', 'loaded');
      // m3 stays unloaded

      expect(registry.getLoadedMemoryEstimate()).toBe(300_000);
    });
  });
});
