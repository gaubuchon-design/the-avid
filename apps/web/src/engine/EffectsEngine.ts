// =============================================================================
//  THE AVID -- Effects Engine
// =============================================================================

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
  /** Whether this is an intrinsic/fixed effect vs user-added plugin effect. */
  intrinsic?: boolean;
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
  // ── Blur ──
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
    id: 'directional-blur',
    name: 'Directional Blur',
    category: 'Blur',
    params: [
      { name: 'angle', type: 'number', default: 0, min: 0, max: 360, step: 1, unit: 'deg' },
      { name: 'length', type: 'number', default: 10, min: 0, max: 200, step: 1, unit: 'px' },
    ],
  },
  {
    id: 'radial-blur',
    name: 'Radial Blur',
    category: 'Blur',
    params: [
      { name: 'amount', type: 'number', default: 10, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'type', type: 'select', default: 'spin', options: ['spin', 'zoom'] },
      { name: 'centerX', type: 'number', default: 50, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'centerY', type: 'number', default: 50, min: 0, max: 100, step: 1, unit: '%' },
    ],
  },

  // ── Composite ──
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
    id: 'luma-key',
    name: 'Luma Key',
    category: 'Composite',
    params: [
      { name: 'threshold', type: 'number', default: 50, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'softness', type: 'number', default: 10, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'invertKey', type: 'boolean', default: false },
    ],
  },
  {
    id: 'blend-mode',
    name: 'Blend Mode',
    category: 'Composite',
    params: [
      { name: 'mode', type: 'select', default: 'normal', options: ['normal', 'multiply', 'screen', 'overlay', 'softLight', 'hardLight', 'difference', 'exclusion', 'add', 'subtract'] },
      { name: 'opacity', type: 'number', default: 100, min: 0, max: 100, step: 1, unit: '%' },
    ],
  },

  // ── Color ──
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
    id: 'curves',
    name: 'Curves',
    category: 'Color',
    params: [
      { name: 'channel', type: 'select', default: 'rgb', options: ['rgb', 'red', 'green', 'blue'] },
      { name: 'shadows', type: 'number', default: 0, min: -100, max: 100, step: 1 },
      { name: 'midtones', type: 'number', default: 0, min: -100, max: 100, step: 1 },
      { name: 'highlights', type: 'number', default: 0, min: -100, max: 100, step: 1 },
    ],
  },
  {
    id: 'levels',
    name: 'Levels',
    category: 'Color',
    params: [
      { name: 'inputBlack', type: 'number', default: 0, min: 0, max: 255, step: 1 },
      { name: 'inputWhite', type: 'number', default: 255, min: 0, max: 255, step: 1 },
      { name: 'gamma', type: 'number', default: 1.0, min: 0.1, max: 10, step: 0.01 },
      { name: 'outputBlack', type: 'number', default: 0, min: 0, max: 255, step: 1 },
      { name: 'outputWhite', type: 'number', default: 255, min: 0, max: 255, step: 1 },
    ],
  },
  {
    id: 'color-lookup',
    name: 'Color Lookup (LUT)',
    category: 'Color',
    params: [
      { name: 'lut', type: 'select', default: 'none', options: ['none', 'teal-orange', 'warm-sunset', 'cool-night', 'bleach-bypass', 'cross-process'] },
      { name: 'intensity', type: 'number', default: 100, min: 0, max: 100, step: 1, unit: '%' },
    ],
  },

  // ── Stylize ──
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
    id: 'glitch',
    name: 'Glitch',
    category: 'Stylize',
    params: [
      { name: 'amount', type: 'number', default: 30, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'blockSize', type: 'number', default: 20, min: 2, max: 200, step: 1, unit: 'px' },
      { name: 'rgbSplit', type: 'number', default: 5, min: 0, max: 50, step: 1, unit: 'px' },
      { name: 'scanlines', type: 'boolean', default: true },
      { name: 'animated', type: 'boolean', default: true },
    ],
  },
  {
    id: 'halftone',
    name: 'Halftone',
    category: 'Stylize',
    params: [
      { name: 'dotSize', type: 'number', default: 5, min: 1, max: 50, step: 1, unit: 'px' },
      { name: 'angle', type: 'number', default: 45, min: 0, max: 180, step: 1, unit: 'deg' },
      { name: 'shape', type: 'select', default: 'circle', options: ['circle', 'square', 'diamond'] },
    ],
  },

  // ── Morph / Transition ──
  {
    id: 'fluid-morph',
    name: 'FluidMorph',
    category: 'Morph',
    params: [
      { name: 'blendAmount', type: 'number', default: 50, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'meshDensity', type: 'number', default: 16, min: 4, max: 64, step: 4 },
      { name: 'smoothness', type: 'number', default: 50, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'warpStrength', type: 'number', default: 50, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'opticalFlow', type: 'boolean', default: true },
      { name: 'edgeMode', type: 'select', default: 'clamp', options: ['clamp', 'wrap', 'mirror'] },
    ],
  },
  {
    id: 'morph-cut',
    name: 'Morph Cut',
    category: 'Morph',
    params: [
      { name: 'analysisQuality', type: 'select', default: 'high', options: ['low', 'medium', 'high'] },
      { name: 'smoothness', type: 'number', default: 75, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'duration', type: 'number', default: 15, min: 5, max: 60, step: 1, unit: 'frames' },
    ],
  },

  // ── Distort ──
  {
    id: 'warp-stabilizer',
    name: 'Warp Stabilizer',
    category: 'Distort',
    params: [
      { name: 'smoothness', type: 'number', default: 50, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'method', type: 'select', default: 'position-scale-rotation', options: ['position', 'position-scale-rotation', 'perspective', 'subspace-warp'] },
      { name: 'cropLess', type: 'number', default: 50, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'rollingShutter', type: 'boolean', default: false },
    ],
  },
  {
    id: 'lens-distortion',
    name: 'Lens Distortion',
    category: 'Distort',
    params: [
      { name: 'curvature', type: 'number', default: 0, min: -100, max: 100, step: 1, unit: '%' },
      { name: 'verticalDecentering', type: 'number', default: 0, min: -100, max: 100, step: 1 },
      { name: 'horizontalDecentering', type: 'number', default: 0, min: -100, max: 100, step: 1 },
      { name: 'fillColor', type: 'color', default: '#000000' },
    ],
  },
  {
    id: 'turbulent-displace',
    name: 'Turbulent Displace',
    category: 'Distort',
    params: [
      { name: 'amount', type: 'number', default: 25, min: 0, max: 500, step: 1 },
      { name: 'size', type: 'number', default: 50, min: 1, max: 200, step: 1 },
      { name: 'complexity', type: 'number', default: 3, min: 1, max: 10, step: 1 },
      { name: 'evolution', type: 'number', default: 0, min: 0, max: 360, step: 1, unit: 'deg' },
      { name: 'type', type: 'select', default: 'turbulent-smoother', options: ['turbulent', 'turbulent-smoother', 'bulge-smoother', 'twist'] },
    ],
  },

  // ── Generate ──
  {
    id: 'solid-color',
    name: 'Solid Color',
    category: 'Generate',
    params: [
      { name: 'color', type: 'color', default: '#000000' },
      { name: 'opacity', type: 'number', default: 100, min: 0, max: 100, step: 1, unit: '%' },
    ],
  },
  {
    id: 'gradient',
    name: 'Gradient',
    category: 'Generate',
    params: [
      { name: 'startColor', type: 'color', default: '#000000' },
      { name: 'endColor', type: 'color', default: '#ffffff' },
      { name: 'type', type: 'select', default: 'linear', options: ['linear', 'radial'] },
      { name: 'angle', type: 'number', default: 0, min: 0, max: 360, step: 1, unit: 'deg' },
      { name: 'blend', type: 'number', default: 100, min: 0, max: 100, step: 1, unit: '%' },
    ],
  },
  {
    id: 'noise',
    name: 'Noise',
    category: 'Generate',
    params: [
      { name: 'amount', type: 'number', default: 10, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'type', type: 'select', default: 'gaussian', options: ['gaussian', 'uniform'] },
      { name: 'colored', type: 'boolean', default: false },
      { name: 'animated', type: 'boolean', default: true },
    ],
  },

  // ── Transform ──
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
  {
    id: 'mirror',
    name: 'Mirror',
    category: 'Transform',
    params: [
      { name: 'axis', type: 'select', default: 'horizontal', options: ['horizontal', 'vertical', 'both'] },
      { name: 'center', type: 'number', default: 50, min: 0, max: 100, step: 1, unit: '%' },
    ],
  },

  // ── Audio FX ──
  {
    id: 'audio-eq',
    name: 'Parametric EQ',
    category: 'Audio',
    params: [
      { name: 'lowFreq', type: 'number', default: 80, min: 20, max: 500, step: 1, unit: 'Hz' },
      { name: 'lowGain', type: 'number', default: 0, min: -20, max: 20, step: 0.5, unit: 'dB' },
      { name: 'midFreq', type: 'number', default: 1000, min: 200, max: 5000, step: 10, unit: 'Hz' },
      { name: 'midGain', type: 'number', default: 0, min: -20, max: 20, step: 0.5, unit: 'dB' },
      { name: 'highFreq', type: 'number', default: 8000, min: 2000, max: 20000, step: 100, unit: 'Hz' },
      { name: 'highGain', type: 'number', default: 0, min: -20, max: 20, step: 0.5, unit: 'dB' },
    ],
  },
  {
    id: 'audio-compressor',
    name: 'Dynamics Compressor',
    category: 'Audio',
    params: [
      { name: 'threshold', type: 'number', default: -20, min: -60, max: 0, step: 0.5, unit: 'dB' },
      { name: 'ratio', type: 'number', default: 4, min: 1, max: 20, step: 0.5 },
      { name: 'attack', type: 'number', default: 10, min: 0.1, max: 100, step: 0.1, unit: 'ms' },
      { name: 'release', type: 'number', default: 100, min: 10, max: 1000, step: 10, unit: 'ms' },
      { name: 'makeupGain', type: 'number', default: 0, min: 0, max: 30, step: 0.5, unit: 'dB' },
    ],
  },
  {
    id: 'audio-reverb',
    name: 'Reverb',
    category: 'Audio',
    params: [
      { name: 'roomSize', type: 'number', default: 50, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'damping', type: 'number', default: 50, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'wetDry', type: 'number', default: 30, min: 0, max: 100, step: 1, unit: '%' },
      { name: 'preDelay', type: 'number', default: 20, min: 0, max: 200, step: 1, unit: 'ms' },
    ],
  },
  {
    id: 'audio-delay',
    name: 'Delay',
    category: 'Audio',
    params: [
      { name: 'delayTime', type: 'number', default: 250, min: 10, max: 2000, step: 10, unit: 'ms' },
      { name: 'feedback', type: 'number', default: 30, min: 0, max: 95, step: 1, unit: '%' },
      { name: 'wetDry', type: 'number', default: 30, min: 0, max: 100, step: 1, unit: '%' },
    ],
  },
  {
    id: 'audio-deesser',
    name: 'De-esser',
    category: 'Audio',
    params: [
      { name: 'frequency', type: 'number', default: 6000, min: 2000, max: 12000, step: 100, unit: 'Hz' },
      { name: 'threshold', type: 'number', default: -20, min: -60, max: 0, step: 0.5, unit: 'dB' },
      { name: 'reduction', type: 'number', default: 6, min: 0, max: 20, step: 0.5, unit: 'dB' },
    ],
  },
];

// ─── Engine Class ──────────────────────────────────────────────────────────

class EffectsEngine {
  private definitions: Map<string, EffectDefinition> = new Map();
  private instances: Map<string, EffectInstance> = new Map();
  private clipEffectsMap: Map<string, string[]> = new Map();
  private nextInstanceId = 1;

  constructor() {
    for (const def of BUILT_IN_EFFECTS) {
      this.definitions.set(def.id, def);
    }
  }

  // ── Definitions ────────────────────────────────────────────────────────

  getDefinitions(): EffectDefinition[] {
    return Array.from(this.definitions.values());
  }

  getDefinition(id: string): EffectDefinition | undefined {
    return this.definitions.get(id);
  }

  getCategories(): string[] {
    const cats = new Set<string>();
    for (const def of this.definitions.values()) {
      cats.add(def.category);
    }
    return Array.from(cats).sort();
  }

  /** Register a custom effect definition (e.g. from an OpenFX plugin). */
  registerDefinition(def: EffectDefinition): void {
    this.definitions.set(def.id, def);
  }

  /** Unregister an effect definition. */
  unregisterDefinition(id: string): void {
    this.definitions.delete(id);
  }

  // ── Instance management ────────────────────────────────────────────────

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

  removeInstance(instanceId: string): void {
    this.instances.delete(instanceId);
    for (const [, ids] of this.clipEffectsMap) {
      const idx = ids.indexOf(instanceId);
      if (idx >= 0) {
        ids.splice(idx, 1);
        break;
      }
    }
  }

  getInstance(instanceId: string): EffectInstance | undefined {
    return this.instances.get(instanceId);
  }

  // ── Parameter manipulation ─────────────────────────────────────────────

  updateParam(instanceId: string, paramName: string, value: any): void {
    const inst = this.instances.get(instanceId);
    if (inst) {
      inst.params[paramName] = value;
    }
  }

  // ── Keyframes ──────────────────────────────────────────────────────────

  addKeyframe(instanceId: string, keyframe: Keyframe): void {
    const inst = this.instances.get(instanceId);
    if (!inst) return;

    inst.keyframes = inst.keyframes.filter(
      (kf) => !(kf.frame === keyframe.frame && kf.paramName === keyframe.paramName)
    );
    inst.keyframes.push(keyframe);
    inst.keyframes.sort((a, b) => a.frame - b.frame);
  }

  removeKeyframe(instanceId: string, frame: number, paramName: string): void {
    const inst = this.instances.get(instanceId);
    if (!inst) return;
    inst.keyframes = inst.keyframes.filter(
      (kf) => !(kf.frame === frame && kf.paramName === paramName)
    );
  }

  getInterpolatedValue(instance: EffectInstance, paramName: string, frame: number): any {
    const keyframes = instance.keyframes
      .filter((kf) => kf.paramName === paramName)
      .sort((a, b) => a.frame - b.frame);

    if (keyframes.length === 0) {
      return instance.params[paramName];
    }

    if (frame <= keyframes[0].frame) return keyframes[0].value;
    if (frame >= keyframes[keyframes.length - 1].frame) return keyframes[keyframes.length - 1].value;

    let prev = keyframes[0];
    let next = keyframes[keyframes.length - 1];
    for (let i = 0; i < keyframes.length - 1; i++) {
      if (frame >= keyframes[i].frame && frame <= keyframes[i + 1].frame) {
        prev = keyframes[i];
        next = keyframes[i + 1];
        break;
      }
    }

    if (prev.interpolation === 'hold') return prev.value;

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

    return t < 0.5 ? prev.value : next.value;
  }

  // ── Effect ordering ────────────────────────────────────────────────────

  reorderEffects(clipId: string, newOrder: string[]): void {
    this.clipEffectsMap.set(clipId, [...newOrder]);
  }

  getClipEffects(clipId: string): EffectInstance[] {
    const ids = this.clipEffectsMap.get(clipId) || [];
    return ids
      .map((id) => this.instances.get(id))
      .filter((inst): inst is EffectInstance => inst !== undefined);
  }

  addEffectToClip(clipId: string, instanceId: string): void {
    const ids = this.clipEffectsMap.get(clipId) || [];
    ids.push(instanceId);
    this.clipEffectsMap.set(clipId, ids);
  }

  // ── Processing ────────────────────────────────────────────────────────

  /**
   * Generate a CSS filter string for a stack of effects.
   * This enables real-time preview in the browser via CSS filters.
   */
  getCSSFilter(effects: EffectInstance[], frame: number): string {
    const filters: string[] = [];
    for (const fx of effects) {
      if (!fx.enabled) continue;
      const get = (name: string) => this.getInterpolatedValue(fx, name, frame);

      switch (fx.definitionId) {
        case 'blur-gaussian': {
          const r = get('radius');
          if (r > 0) filters.push(`blur(${r}px)`);
          break;
        }
        case 'brightness-contrast': {
          const b = get('brightness');
          const c = get('contrast');
          if (b !== 0) filters.push(`brightness(${1 + b / 100})`);
          if (c !== 0) filters.push(`contrast(${1 + c / 100})`);
          break;
        }
        case 'hue-saturation': {
          const h = get('hue');
          const s = get('saturation');
          const l = get('lightness');
          if (h !== 0) filters.push(`hue-rotate(${h}deg)`);
          if (s !== 0) filters.push(`saturate(${1 + s / 100})`);
          if (l !== 0) filters.push(`brightness(${1 + l / 100})`);
          break;
        }
        case 'drop-shadow': {
          const angle = get('angle') * Math.PI / 180;
          const dist = get('distance');
          const blur = get('blur');
          const opacity = get('opacity') / 100;
          const color = get('color');
          const dx = Math.round(Math.cos(angle) * dist);
          const dy = Math.round(Math.sin(angle) * dist);
          filters.push(`drop-shadow(${dx}px ${dy}px ${blur}px ${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')})`);
          break;
        }
        case 'vignette':
        case 'film-grain':
        case 'glow':
          // These require canvas-level processing; no CSS equivalent
          break;
        default:
          break;
      }
    }
    return filters.length > 0 ? filters.join(' ') : 'none';
  }

  /**
   * Process a frame through a stack of effects using Canvas 2D.
   * Applies pixel-level operations for effects that can't use CSS filters.
   */
  processFrame(imageData: ImageData, effects: EffectInstance[], frame = 0): ImageData {
    try {
      const data = imageData.data;
      const w = imageData.width;
      const h = imageData.height;

      for (const fx of effects) {
        if (!fx.enabled) continue;
        const get = (name: string) => this.getInterpolatedValue(fx, name, frame);

        switch (fx.definitionId) {
          case 'brightness-contrast': {
            const brightness = get('brightness') / 100;
            const contrast = get('contrast') / 100;
            const factor = (1 + contrast);
            for (let i = 0; i < data.length; i += 4) {
              data[i]     = Math.min(255, Math.max(0, (data[i]     + brightness * 255) * factor));
              data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] + brightness * 255) * factor));
              data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] + brightness * 255) * factor));
            }
            break;
          }
          case 'hue-saturation': {
            const hueShift = get('hue');
            const satMod = 1 + get('saturation') / 100;
            const lightMod = get('lightness') / 100;
            if (hueShift !== 0 || satMod !== 1 || lightMod !== 0) {
              for (let i = 0; i < data.length; i += 4) {
                let r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
                // Convert to HSL
                const max = Math.max(r, g, b), min = Math.min(r, g, b);
                let hh = 0, ss = 0;
                const ll = (max + min) / 2;
                if (max !== min) {
                  const d = max - min;
                  ss = ll > 0.5 ? d / (2 - max - min) : d / (max + min);
                  if (max === r) hh = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                  else if (max === g) hh = ((b - r) / d + 2) / 6;
                  else hh = ((r - g) / d + 4) / 6;
                }
                // Apply modifications
                hh = (hh + hueShift / 360 + 1) % 1;
                ss = Math.min(1, Math.max(0, ss * satMod));
                const newL = Math.min(1, Math.max(0, ll + lightMod));
                // Convert back to RGB
                if (ss === 0) {
                  data[i] = data[i + 1] = data[i + 2] = Math.round(newL * 255);
                } else {
                  const hue2rgb = (p: number, q: number, t: number) => {
                    if (t < 0) t += 1;
                    if (t > 1) t -= 1;
                    if (t < 1/6) return p + (q - p) * 6 * t;
                    if (t < 1/2) return q;
                    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                    return p;
                  };
                  const q = newL < 0.5 ? newL * (1 + ss) : newL + ss - newL * ss;
                  const p = 2 * newL - q;
                  data[i]     = Math.round(hue2rgb(p, q, hh + 1/3) * 255);
                  data[i + 1] = Math.round(hue2rgb(p, q, hh) * 255);
                  data[i + 2] = Math.round(hue2rgb(p, q, hh - 1/3) * 255);
                }
              }
            }
            break;
          }
          case 'film-grain': {
            const amount = get('amount') / 100;
            if (amount > 0) {
              for (let i = 0; i < data.length; i += 4) {
                const noise = (Math.random() - 0.5) * 2 * amount * 50;
                data[i]     = Math.min(255, Math.max(0, data[i] + noise));
                data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
                data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
              }
            }
            break;
          }
          case 'chroma-key': {
            const keyHex = get('keyColor') as string;
            const tol = get('tolerance') / 100;
            const soft = get('softness') / 100;
            // Parse key color
            const kr = parseInt(keyHex.slice(1, 3), 16);
            const kg = parseInt(keyHex.slice(3, 5), 16);
            const kb = parseInt(keyHex.slice(5, 7), 16);
            for (let i = 0; i < data.length; i += 4) {
              const dr = (data[i] - kr) / 255;
              const dg = (data[i + 1] - kg) / 255;
              const db = (data[i + 2] - kb) / 255;
              const dist = Math.sqrt(dr * dr + dg * dg + db * db);
              if (dist < tol) {
                data[i + 3] = 0; // fully transparent
              } else if (dist < tol + soft) {
                const alpha = (dist - tol) / soft;
                data[i + 3] = Math.round(alpha * data[i + 3]);
              }
            }
            break;
          }
          case 'levels': {
            const inBlack = get('inputBlack');
            const inWhite = get('inputWhite');
            const gamma = get('gamma');
            const outBlack = get('outputBlack');
            const outWhite = get('outputWhite');
            const range = inWhite - inBlack || 1;
            for (let i = 0; i < data.length; i += 4) {
              for (let c = 0; c < 3; c++) {
                let v = (data[i + c] - inBlack) / range;
                v = Math.max(0, Math.min(1, v));
                v = Math.pow(v, 1 / gamma);
                data[i + c] = Math.round(outBlack + v * (outWhite - outBlack));
              }
            }
            break;
          }
          default:
            break;
        }
      }

      return imageData;
    } catch (err) {
      console.error('[EffectsEngine] processFrame error:', err);
      return imageData;
    }
  }
}

/** Singleton effects engine instance. */
export const effectsEngine = new EffectsEngine();
