// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Effects Engine
// ═══════════════════════════════════════════════════════════════════════════

// ─── Types ─────────────────────────────────────────────────────────────────

/** Definition of a single effect parameter. */
export interface EffectParamDef {
  name: string;
  type: 'number' | 'color' | 'boolean' | 'select';
  default: any;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  unit?: string;
}

/** A registered effect definition (template). */
export interface EffectDefinition {
  id: string;
  name: string;
  category: string;
  params: EffectParamDef[];
}

/** A keyframe entry binding a parameter value to a specific frame. */
export interface Keyframe {
  frame: number;
  paramName: string;
  value: any;
  interpolation: 'linear' | 'bezier' | 'hold';
}

/** A live instance of an effect applied to a clip. */
export interface EffectInstance {
  id: string;
  definitionId: string;
  params: Record<string, any>;
  enabled: boolean;
  keyframes: Keyframe[];
}

// ─── Built-in Effect Definitions ───────────────────────────────────────────

const BUILT_IN_EFFECTS: EffectDefinition[] = [
  {
    id: 'blur-gaussian',
    name: 'Gaussian Blur',
    category: 'Blur',
    params: [
      { name: 'radius', type: 'number', default: 5, min: 0, max: 100, step: 0.5, unit: 'px' },
      { name: 'iterations', type: 'number', default: 1, min: 1, max: 5, step: 1 },
    ],
  },
  {
    id: 'sharpen',
    name: 'Sharpen',
    category: 'Blur',
    params: [
      { name: 'amount', type: 'number', default: 50, min: 0, max: 200, step: 1, unit: '%' },
      { name: 'radius', type: 'number', default: 1, min: 0.5, max: 10, step: 0.5, unit: 'px' },
      { name: 'threshold', type: 'number', default: 0, min: 0, max: 255, step: 1 },
    ],
  },
  {
    id: 'chroma-key',
    name: 'Chroma Key',
    category: 'Composite',
    params: [
      { name: 'keyColor', type: 'color', default: '#00ff00' },
      { name: 'tolerance', type: 'number', default: 40, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'softness', type: 'number', default: 10, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'spillSuppression', type: 'number', default: 50, min: 0, max: 100, step: 1, unit: '%' },
    ],
  },
  {
    id: 'color-balance',
    name: 'Color Balance',
    category: 'Color',
    params: [
      { name: 'shadowsR', type: 'number', default: 0, min: -100, max: 100, step: 1 },
      { name: 'shadowsG', type: 'number', default: 0, min: -100, max: 100, step: 1 },
      { name: 'shadowsB', type: 'number', default: 0, min: -100, max: 100, step: 1 },
      { name: 'midtonesR', type: 'number', default: 0, min: -100, max: 100, step: 1 },
      { name: 'midtonesG', type: 'number', default: 0, min: -100, max: 100, step: 1 },
      { name: 'midtonesB', type: 'number', default: 0, min: -100, max: 100, step: 1 },
      { name: 'highlightsR', type: 'number', default: 0, min: -100, max: 100, step: 1 },
      { name: 'highlightsG', type: 'number', default: 0, min: -100, max: 100, step: 1 },
      { name: 'highlightsB', type: 'number', default: 0, min: -100, max: 100, step: 1 },
      { name: 'preserveLuminosity', type: 'boolean', default: true },
    ],
  },
  {
    id: 'brightness-contrast',
    name: 'Brightness/Contrast',
    category: 'Color',
    params: [
      { name: 'brightness', type: 'number', default: 0, min: -100, max: 100, step: 1 },
      { name: 'contrast', type: 'number', default: 0, min: -100, max: 100, step: 1 },
      { name: 'useLegacy', type: 'boolean', default: false },
    ],
  },
  {
    id: 'hue-saturation',
    name: 'Hue/Saturation',
    category: 'Color',
    params: [
      { name: 'hue', type: 'number', default: 0, min: -180, max: 180, step: 1, unit: 'deg' },
      { name: 'saturation', type: 'number', default: 0, min: -100, max: 100, step: 1 },
      { name: 'lightness', type: 'number', default: 0, min: -100, max: 100, step: 1 },
      { name: 'colorize', type: 'boolean', default: false },
    ],
  },
  {
    id: 'drop-shadow',
    name: 'Drop Shadow',
    category: 'Stylize',
    params: [
      { name: 'color', type: 'color', default: '#000000' },
      { name: 'opacity', type: 'number', default: 75, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'angle', type: 'number', default: 135, min: 0, max: 360, step: 1, unit: 'deg' },
      { name: 'distance', type: 'number', default: 5, min: 0, max: 200, step: 1, unit: 'px' },
      { name: 'blur', type: 'number', default: 5, min: 0, max: 100, step: 1, unit: 'px' },
    ],
  },
  {
    id: 'glow',
    name: 'Glow',
    category: 'Stylize',
    params: [
      { name: 'radius', type: 'number', default: 10, min: 0, max: 100, step: 1, unit: 'px' },
      { name: 'intensity', type: 'number', default: 50, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'threshold', type: 'number', default: 60, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'color', type: 'color', default: '#ffffff' },
    ],
  },
  {
    id: 'film-grain',
    name: 'Film Grain',
    category: 'Stylize',
    params: [
      { name: 'amount', type: 'number', default: 25, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'size', type: 'number', default: 1.5, min: 0.5, max: 5, step: 0.1, unit: 'px' },
      { name: 'softness', type: 'number', default: 50, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'animated', type: 'boolean', default: true },
    ],
  },
  {
    id: 'vignette',
    name: 'Vignette',
    category: 'Stylize',
    params: [
      { name: 'amount', type: 'number', default: 50, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'midpoint', type: 'number', default: 50, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'roundness', type: 'number', default: 50, min: 0, max: 100, step: 1 },
      { name: 'feather', type: 'number', default: 50, min: 0, max: 100, step: 1 },
    ],
  },
  {
    id: 'letterbox',
    name: 'Letterbox',
    category: 'Transform',
    params: [
      { name: 'ratio', type: 'select', default: '2.39:1', options: ['1.85:1', '2.00:1', '2.20:1', '2.39:1', '2.76:1'] },
      { name: 'color', type: 'color', default: '#000000' },
      { name: 'opacity', type: 'number', default: 100, min: 0, max: 100, step: 1, unit: '%' },
    ],
  },
  {
    id: 'speed-ramp',
    name: 'Speed Ramp',
    category: 'Transform',
    params: [
      { name: 'speed', type: 'number', default: 100, min: 10, max: 400, step: 1, unit: '%' },
      { name: 'rampDuration', type: 'number', default: 30, min: 1, max: 120, step: 1, unit: 'frames' },
      { name: 'easing', type: 'select', default: 'ease-in-out', options: ['linear', 'ease-in', 'ease-out', 'ease-in-out'] },
      { name: 'frameBlending', type: 'boolean', default: true },
    ],
  },
];

// ─── Engine Class ──────────────────────────────────────────────────────────

/**
 * Effects engine managing effect definitions, instances, keyframes,
 * and per-clip effect stacks.
 *
 * Provides interpolation logic for keyframed parameters and a clip-to-effects
 * mapping so effects can be reordered per clip.
 */
class EffectsEngine {
  private definitions: Map<string, EffectDefinition> = new Map();
  private instances: Map<string, EffectInstance> = new Map();
  private clipEffectsMap: Map<string, string[]> = new Map(); // clipId -> instanceIds
  private nextInstanceId = 1;

  /** Initialise with built-in effect definitions. */
  constructor() {
    for (const def of BUILT_IN_EFFECTS) {
      this.definitions.set(def.id, def);
    }
  }

  // ── Definitions ────────────────────────────────────────────────────────

  /**
   * Get all registered effect definitions.
   * @returns Array of EffectDefinition objects.
   * @example
   * const defs = effectsEngine.getDefinitions();
   */
  getDefinitions(): EffectDefinition[] {
    return Array.from(this.definitions.values());
  }

  /**
   * Look up an effect definition by ID.
   * @param id Definition ID.
   * @returns The definition, or `undefined` if not found.
   * @example
   * const blur = effectsEngine.getDefinition('blur-gaussian');
   */
  getDefinition(id: string): EffectDefinition | undefined {
    return this.definitions.get(id);
  }

  /**
   * Get all distinct effect categories.
   * @returns Sorted array of category names.
   * @example
   * const cats = effectsEngine.getCategories(); // ['Blur', 'Color', 'Composite', ...]
   */
  getCategories(): string[] {
    const cats = new Set<string>();
    for (const def of this.definitions.values()) {
      cats.add(def.category);
    }
    return Array.from(cats).sort();
  }

  // ── Instance management ────────────────────────────────────────────────

  /**
   * Create a new effect instance from a definition.
   * @param defId The definition ID to instantiate.
   * @returns The new instance, or `null` if the definition was not found.
   * @example
   * const blur = effectsEngine.createInstance('blur-gaussian');
   */
  createInstance(defId: string): EffectInstance | null {
    const def = this.definitions.get(defId);
    if (!def) {
      console.warn(`[EffectsEngine] Definition "${defId}" not found`);
      return null;
    }

    const params: Record<string, any> = {};
    for (const p of def.params) {
      params[p.name] = p.default;
    }

    const instance: EffectInstance = {
      id: `fx_${this.nextInstanceId++}`,
      definitionId: defId,
      params,
      enabled: true,
      keyframes: [],
    };

    this.instances.set(instance.id, instance);
    return instance;
  }

  /**
   * Remove an effect instance and clean up any clip mappings.
   * @param instanceId The instance ID to remove.
   * @example
   * effectsEngine.removeInstance('fx_1');
   */
  removeInstance(instanceId: string): void {
    this.instances.delete(instanceId);
    for (const [clipId, ids] of this.clipEffectsMap) {
      const idx = ids.indexOf(instanceId);
      if (idx >= 0) {
        ids.splice(idx, 1);
        if (ids.length === 0) this.clipEffectsMap.delete(clipId);
        break;
      }
    }
  }

  /**
   * Retrieve an effect instance by ID.
   * @param instanceId The instance ID.
   * @returns The instance, or `undefined` if not found.
   */
  getInstance(instanceId: string): EffectInstance | undefined {
    return this.instances.get(instanceId);
  }

  // ── Parameter manipulation ─────────────────────────────────────────────

  /**
   * Update a single parameter value on an effect instance.
   * @param instanceId The instance ID.
   * @param paramName  The parameter name.
   * @param value      The new value.
   * @example
   * effectsEngine.updateParam('fx_1', 'radius', 10);
   */
  updateParam(instanceId: string, paramName: string, value: any): void {
    const inst = this.instances.get(instanceId);
    if (inst) {
      inst.params[paramName] = value;
    }
  }

  // ── Keyframes ──────────────────────────────────────────────────────────

  /**
   * Add or replace a keyframe on an effect instance.
   * @param instanceId The instance ID.
   * @param keyframe   The keyframe to add (replaces existing at same frame/param).
   * @example
   * effectsEngine.addKeyframe('fx_1', {
   *   frame: 0, paramName: 'radius', value: 0, interpolation: 'linear',
   * });
   */
  addKeyframe(instanceId: string, keyframe: Keyframe): void {
    const inst = this.instances.get(instanceId);
    if (!inst) return;

    inst.keyframes = inst.keyframes.filter(
      (kf) => !(kf.frame === keyframe.frame && kf.paramName === keyframe.paramName)
    );
    inst.keyframes.push(keyframe);
    inst.keyframes.sort((a, b) => a.frame - b.frame);
  }

  /**
   * Remove a keyframe from an effect instance.
   * @param instanceId The instance ID.
   * @param frame      The frame number.
   * @param paramName  The parameter name.
   * @example
   * effectsEngine.removeKeyframe('fx_1', 0, 'radius');
   */
  removeKeyframe(instanceId: string, frame: number, paramName: string): void {
    const inst = this.instances.get(instanceId);
    if (!inst) return;
    inst.keyframes = inst.keyframes.filter(
      (kf) => !(kf.frame === frame && kf.paramName === paramName)
    );
  }

  /**
   * Get the interpolated value of a parameter at a given frame.
   *
   * Supports linear, bezier (cubic ease-in-out), and hold interpolation.
   * Falls back to the static parameter value if no keyframes exist.
   *
   * @param instance  The effect instance.
   * @param paramName The parameter to evaluate.
   * @param frame     The frame number to evaluate at.
   * @returns The interpolated value.
   * @example
   * const radius = effectsEngine.getInterpolatedValue(blurInstance, 'radius', 48);
   */
  getInterpolatedValue(instance: EffectInstance, paramName: string, frame: number): any {
    const keyframes = instance.keyframes
      .filter((kf) => kf.paramName === paramName)
      .sort((a, b) => a.frame - b.frame);

    if (keyframes.length === 0) {
      return instance.params[paramName];
    }

    // Before first keyframe
    if (frame <= keyframes[0].frame) {
      return keyframes[0].value;
    }

    // After last keyframe
    if (frame >= keyframes[keyframes.length - 1].frame) {
      return keyframes[keyframes.length - 1].value;
    }

    // Find surrounding keyframes
    let prev = keyframes[0];
    let next = keyframes[keyframes.length - 1];
    for (let i = 0; i < keyframes.length - 1; i++) {
      if (frame >= keyframes[i].frame && frame <= keyframes[i + 1].frame) {
        prev = keyframes[i];
        next = keyframes[i + 1];
        break;
      }
    }

    // Interpolation
    if (prev.interpolation === 'hold') {
      return prev.value;
    }

    const t = (frame - prev.frame) / (next.frame - prev.frame);
    if (typeof prev.value === 'number' && typeof next.value === 'number') {
      if (prev.interpolation === 'linear') {
        return prev.value + (next.value - prev.value) * t;
      }
      if (prev.interpolation === 'bezier') {
        const ease = t * t * (3 - 2 * t);
        return prev.value + (next.value - prev.value) * ease;
      }
    }

    // Non-numeric: step
    return t < 0.5 ? prev.value : next.value;
  }

  // ── Effect ordering ────────────────────────────────────────────────────

  /**
   * Set the effect ordering for a clip.
   * @param clipId   Clip identifier.
   * @param newOrder Array of instance IDs in the desired order.
   * @example
   * effectsEngine.reorderEffects('clip_1', ['fx_2', 'fx_1']);
   */
  reorderEffects(clipId: string, newOrder: string[]): void {
    this.clipEffectsMap.set(clipId, [...newOrder]);
  }

  /**
   * Get all effect instances applied to a clip, in order.
   * @param clipId Clip identifier.
   * @returns Ordered array of EffectInstance objects.
   */
  getClipEffects(clipId: string): EffectInstance[] {
    const ids = this.clipEffectsMap.get(clipId) || [];
    return ids
      .map((id) => this.instances.get(id))
      .filter((inst): inst is EffectInstance => inst !== undefined);
  }

  /**
   * Add an effect instance to a clip's effect stack.
   * @param clipId     Clip identifier.
   * @param instanceId Effect instance ID to add.
   * @example
   * const fx = effectsEngine.createInstance('blur-gaussian');
   * if (fx) effectsEngine.addEffectToClip('clip_1', fx.id);
   */
  addEffectToClip(clipId: string, instanceId: string): void {
    const ids = this.clipEffectsMap.get(clipId) || [];
    ids.push(instanceId);
    this.clipEffectsMap.set(clipId, ids);
  }

  // ── Processing (stub) ──────────────────────────────────────────────────

  /**
   * Process a frame through a stack of effects.
   * Stub -- returns unmodified image data in the demo build.
   * @param imageData Source image data.
   * @param effects   Ordered array of effect instances to apply.
   * @returns The processed ImageData.
   */
  processFrame(imageData: ImageData, effects: EffectInstance[]): ImageData {
    try {
      void effects;
      return imageData;
    } catch (err) {
      console.error('[EffectsEngine] processFrame error:', err);
      return imageData;
    }
  }
}

/** Singleton effects engine instance. */
export const effectsEngine = new EffectsEngine();
