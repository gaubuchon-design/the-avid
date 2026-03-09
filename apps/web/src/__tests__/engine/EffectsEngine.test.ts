import { describe, it, expect, beforeEach } from 'vitest';
import type { EffectInstance, Keyframe } from '../../engine/EffectsEngine';

// We need a fresh engine for each test to avoid shared state.
// The module exports a singleton, so we re-import via dynamic import tricks.
// Instead, we'll test against the singleton and reset between tests.
import { effectsEngine } from '../../engine/EffectsEngine';

describe('EffectsEngine', () => {
  // ── Definition Tests ──────────────────────────────────────────────────

  describe('definitions', () => {
    it('should have all 12 built-in effects registered', () => {
      const defs = effectsEngine.getDefinitions();
      expect(defs.length).toBe(12);
    });

    it('should contain expected effect IDs', () => {
      const ids = effectsEngine.getDefinitions().map((d) => d.id);
      expect(ids).toContain('blur-gaussian');
      expect(ids).toContain('sharpen');
      expect(ids).toContain('chroma-key');
      expect(ids).toContain('color-balance');
      expect(ids).toContain('brightness-contrast');
      expect(ids).toContain('hue-saturation');
      expect(ids).toContain('drop-shadow');
      expect(ids).toContain('glow');
      expect(ids).toContain('film-grain');
      expect(ids).toContain('vignette');
      expect(ids).toContain('letterbox');
      expect(ids).toContain('speed-ramp');
    });

    it('getDefinition() returns correct definition by ID', () => {
      const def = effectsEngine.getDefinition('blur-gaussian');
      expect(def).toBeDefined();
      expect(def!.name).toBe('Gaussian Blur');
      expect(def!.category).toBe('Blur');
      expect(def!.params.length).toBe(2);
    });

    it('getDefinition() returns undefined for nonexistent ID', () => {
      expect(effectsEngine.getDefinition('nonexistent')).toBeUndefined();
    });

    it('getCategories() returns sorted unique categories', () => {
      const cats = effectsEngine.getCategories();
      expect(cats).toEqual(['Blur', 'Color', 'Composite', 'Stylize', 'Transform']);
      // Verify sorted
      for (let i = 1; i < cats.length; i++) {
        expect(cats[i] >= cats[i - 1]).toBe(true);
      }
    });
  });

  // ── Instance Tests ─────────────────────────────────────────────────────

  describe('instances', () => {
    let instance: EffectInstance;

    beforeEach(() => {
      instance = effectsEngine.createInstance('brightness-contrast')!;
    });

    it('createInstance() creates instance with default params', () => {
      expect(instance).not.toBeNull();
      expect(instance.definitionId).toBe('brightness-contrast');
      expect(instance.enabled).toBe(true);
      expect(instance.params.brightness).toBe(0);
      expect(instance.params.contrast).toBe(0);
      expect(instance.params.useLegacy).toBe(false);
      expect(instance.keyframes).toEqual([]);
    });

    it('createInstance() returns null for nonexistent definition', () => {
      const result = effectsEngine.createInstance('nonexistent');
      expect(result).toBeNull();
    });

    it('createInstance() assigns unique incrementing IDs', () => {
      const a = effectsEngine.createInstance('blur-gaussian')!;
      const b = effectsEngine.createInstance('blur-gaussian')!;
      expect(a.id).not.toBe(b.id);
      expect(a.id).toMatch(/^fx_\d+$/);
      expect(b.id).toMatch(/^fx_\d+$/);
    });

    it('getInstance() retrieves created instance', () => {
      const retrieved = effectsEngine.getInstance(instance.id);
      expect(retrieved).toBe(instance);
    });

    it('removeInstance() deletes the instance', () => {
      effectsEngine.removeInstance(instance.id);
      expect(effectsEngine.getInstance(instance.id)).toBeUndefined();
    });
  });

  // ── Parameter Manipulation ─────────────────────────────────────────────

  describe('params', () => {
    it('updateParam() modifies instance params', () => {
      const inst = effectsEngine.createInstance('brightness-contrast')!;
      effectsEngine.updateParam(inst.id, 'brightness', 50);
      expect(inst.params.brightness).toBe(50);
    });

    it('updateParam() is a no-op for nonexistent instance', () => {
      // Should not throw
      effectsEngine.updateParam('nonexistent', 'brightness', 50);
    });
  });

  // ── Keyframes ──────────────────────────────────────────────────────────

  describe('keyframes', () => {
    let inst: EffectInstance;

    beforeEach(() => {
      inst = effectsEngine.createInstance('blur-gaussian')!;
    });

    it('addKeyframe() adds and sorts keyframes', () => {
      effectsEngine.addKeyframe(inst.id, {
        frame: 100, paramName: 'radius', value: 20, interpolation: 'linear',
      });
      effectsEngine.addKeyframe(inst.id, {
        frame: 0, paramName: 'radius', value: 0, interpolation: 'linear',
      });
      expect(inst.keyframes.length).toBe(2);
      expect(inst.keyframes[0].frame).toBe(0);
      expect(inst.keyframes[1].frame).toBe(100);
    });

    it('addKeyframe() replaces existing at same frame/param', () => {
      effectsEngine.addKeyframe(inst.id, {
        frame: 50, paramName: 'radius', value: 10, interpolation: 'linear',
      });
      effectsEngine.addKeyframe(inst.id, {
        frame: 50, paramName: 'radius', value: 30, interpolation: 'bezier',
      });
      expect(inst.keyframes.length).toBe(1);
      expect(inst.keyframes[0].value).toBe(30);
      expect(inst.keyframes[0].interpolation).toBe('bezier');
    });

    it('removeKeyframe() removes matching keyframe', () => {
      effectsEngine.addKeyframe(inst.id, {
        frame: 10, paramName: 'radius', value: 5, interpolation: 'linear',
      });
      effectsEngine.addKeyframe(inst.id, {
        frame: 20, paramName: 'radius', value: 10, interpolation: 'linear',
      });
      effectsEngine.removeKeyframe(inst.id, 10, 'radius');
      expect(inst.keyframes.length).toBe(1);
      expect(inst.keyframes[0].frame).toBe(20);
    });
  });

  // ── Interpolation ─────────────────────────────────────────────────────

  describe('getInterpolatedValue', () => {
    let inst: EffectInstance;

    beforeEach(() => {
      inst = effectsEngine.createInstance('blur-gaussian')!;
    });

    it('returns static value when no keyframes', () => {
      inst.params.radius = 15;
      expect(effectsEngine.getInterpolatedValue(inst, 'radius', 50)).toBe(15);
    });

    it('returns first keyframe value before first keyframe', () => {
      effectsEngine.addKeyframe(inst.id, {
        frame: 10, paramName: 'radius', value: 20, interpolation: 'linear',
      });
      expect(effectsEngine.getInterpolatedValue(inst, 'radius', 0)).toBe(20);
      expect(effectsEngine.getInterpolatedValue(inst, 'radius', 5)).toBe(20);
    });

    it('returns last keyframe value after last keyframe', () => {
      effectsEngine.addKeyframe(inst.id, {
        frame: 10, paramName: 'radius', value: 5, interpolation: 'linear',
      });
      effectsEngine.addKeyframe(inst.id, {
        frame: 50, paramName: 'radius', value: 25, interpolation: 'linear',
      });
      expect(effectsEngine.getInterpolatedValue(inst, 'radius', 100)).toBe(25);
    });

    it('linear interpolation between keyframes', () => {
      effectsEngine.addKeyframe(inst.id, {
        frame: 0, paramName: 'radius', value: 0, interpolation: 'linear',
      });
      effectsEngine.addKeyframe(inst.id, {
        frame: 100, paramName: 'radius', value: 100, interpolation: 'linear',
      });
      // Midpoint
      expect(effectsEngine.getInterpolatedValue(inst, 'radius', 50)).toBe(50);
      // Quarter
      expect(effectsEngine.getInterpolatedValue(inst, 'radius', 25)).toBe(25);
      // Three-quarters
      expect(effectsEngine.getInterpolatedValue(inst, 'radius', 75)).toBe(75);
    });

    it('bezier (ease) interpolation between keyframes', () => {
      effectsEngine.addKeyframe(inst.id, {
        frame: 0, paramName: 'radius', value: 0, interpolation: 'bezier',
      });
      effectsEngine.addKeyframe(inst.id, {
        frame: 100, paramName: 'radius', value: 100, interpolation: 'bezier',
      });
      const midVal = effectsEngine.getInterpolatedValue(inst, 'radius', 50) as number;
      // Bezier ease: t*t*(3-2*t) at t=0.5 => 0.5*0.5*2 = 0.5 => value = 50
      expect(midVal).toBe(50);
      // At t=0.25: 0.25*0.25*2.5 = 0.15625 => value = 15.625
      const quarterVal = effectsEngine.getInterpolatedValue(inst, 'radius', 25) as number;
      expect(quarterVal).toBeCloseTo(15.625, 2);
    });

    it('hold interpolation (step)', () => {
      effectsEngine.addKeyframe(inst.id, {
        frame: 0, paramName: 'radius', value: 10, interpolation: 'hold',
      });
      effectsEngine.addKeyframe(inst.id, {
        frame: 100, paramName: 'radius', value: 50, interpolation: 'linear',
      });
      // Hold keeps prev value until next keyframe
      expect(effectsEngine.getInterpolatedValue(inst, 'radius', 50)).toBe(10);
      expect(effectsEngine.getInterpolatedValue(inst, 'radius', 99)).toBe(10);
    });

    it('non-numeric values use step behavior', () => {
      const inst2 = effectsEngine.createInstance('letterbox')!;
      effectsEngine.addKeyframe(inst2.id, {
        frame: 0, paramName: 'ratio', value: '1.85:1', interpolation: 'linear',
      });
      effectsEngine.addKeyframe(inst2.id, {
        frame: 100, paramName: 'ratio', value: '2.39:1', interpolation: 'linear',
      });
      // t < 0.5 => prev value
      expect(effectsEngine.getInterpolatedValue(inst2, 'ratio', 25)).toBe('1.85:1');
      // t >= 0.5 => next value
      expect(effectsEngine.getInterpolatedValue(inst2, 'ratio', 75)).toBe('2.39:1');
    });
  });

  // ── Clip Effects ───────────────────────────────────────────────────────

  describe('clip effects', () => {
    it('addEffectToClip() / getClipEffects() returns ordered effects', () => {
      const fx1 = effectsEngine.createInstance('blur-gaussian')!;
      const fx2 = effectsEngine.createInstance('brightness-contrast')!;
      effectsEngine.addEffectToClip('clip_test', fx1.id);
      effectsEngine.addEffectToClip('clip_test', fx2.id);

      const effects = effectsEngine.getClipEffects('clip_test');
      expect(effects.length).toBe(2);
      expect(effects[0].id).toBe(fx1.id);
      expect(effects[1].id).toBe(fx2.id);
    });

    it('reorderEffects() changes order', () => {
      const fx1 = effectsEngine.createInstance('blur-gaussian')!;
      const fx2 = effectsEngine.createInstance('hue-saturation')!;
      effectsEngine.addEffectToClip('clip_reorder', fx1.id);
      effectsEngine.addEffectToClip('clip_reorder', fx2.id);

      effectsEngine.reorderEffects('clip_reorder', [fx2.id, fx1.id]);
      const reordered = effectsEngine.getClipEffects('clip_reorder');
      expect(reordered[0].id).toBe(fx2.id);
      expect(reordered[1].id).toBe(fx1.id);
    });

    it('removeInstance() cleans up clip mappings', () => {
      const fx = effectsEngine.createInstance('vignette')!;
      effectsEngine.addEffectToClip('clip_cleanup', fx.id);
      expect(effectsEngine.getClipEffects('clip_cleanup').length).toBe(1);

      effectsEngine.removeInstance(fx.id);
      expect(effectsEngine.getClipEffects('clip_cleanup').length).toBe(0);
    });

    it('getClipEffects() returns empty array for unknown clip', () => {
      expect(effectsEngine.getClipEffects('unknown_clip')).toEqual([]);
    });
  });

  // ── processFrame ──────────────────────────────────────────────────────

  describe('processFrame', () => {
    function createImageData(w: number, h: number, fill = 128): ImageData {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = fill;     // R
        data[i + 1] = fill; // G
        data[i + 2] = fill; // B
        data[i + 3] = 255;  // A
      }
      return { data, width: w, height: h, colorSpace: 'srgb' } as ImageData;
    }

    it('returns unchanged imageData with empty effects', () => {
      const img = createImageData(4, 4, 100);
      const original = new Uint8ClampedArray(img.data);
      const result = effectsEngine.processFrame(img, []);
      expect(result.data).toEqual(original);
    });

    it('skips disabled effects', () => {
      const fx = effectsEngine.createInstance('brightness-contrast')!;
      fx.enabled = false;
      fx.params.brightness = 100;
      const img = createImageData(4, 4, 100);
      const original = new Uint8ClampedArray(img.data);
      effectsEngine.processFrame(img, [fx]);
      expect(img.data).toEqual(original);
    });

    it('applies brightness-contrast effect when enabled', () => {
      const fx = effectsEngine.createInstance('brightness-contrast')!;
      fx.params.brightness = 50;
      const img = createImageData(4, 4, 100);
      effectsEngine.processFrame(img, [fx]);
      // With brightness=50 (modern mode), pixel values should increase
      expect(img.data[0]).toBeGreaterThan(100);
    });

    it('handles errors gracefully (returns original data)', () => {
      // Create an instance with an unknown definition ID to trigger the default case
      const fakeInstance: EffectInstance = {
        id: 'fake',
        definitionId: 'unknown-effect',
        params: {},
        enabled: true,
        keyframes: [],
      };
      const img = createImageData(4, 4, 128);
      // Should not throw
      const result = effectsEngine.processFrame(img, [fakeInstance]);
      expect(result).toBe(img);
    });
  });
});
