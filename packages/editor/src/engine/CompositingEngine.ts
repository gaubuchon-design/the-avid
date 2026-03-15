// =============================================================================
//  THE AVID -- Compositing Engine
//  Production-quality compositing pipeline matching DaVinci Resolve / Avid
//  capabilities. Supports all standard Photoshop/DaVinci blend modes, alpha
//  channel operations, chroma/luma/difference/ultra keying, track-based
//  compositing, and GPU-accelerated rendering via WebGPU with WebGL2 fallback.
// =============================================================================

import type { CompositeMode, IntrinsicVideoProps } from '../store/editor.store';

// ─── Blend Mode Enumeration ─────────────────────────────────────────────────

/**
 * Complete set of industry-standard blend modes matching Photoshop, DaVinci
 * Resolve, and Avid Media Composer.
 */
export enum BlendMode {
  // ── Normal ──
  Normal = 'normal',
  Dissolve = 'dissolve',

  // ── Darken ──
  Darken = 'darken',
  Multiply = 'multiply',
  ColorBurn = 'color-burn',
  LinearBurn = 'linear-burn',
  DarkerColor = 'darker-color',

  // ── Lighten ──
  Lighten = 'lighten',
  Screen = 'screen',
  ColorDodge = 'color-dodge',
  LinearDodge = 'linear-dodge',
  LighterColor = 'lighter-color',

  // ── Contrast ──
  Overlay = 'overlay',
  SoftLight = 'soft-light',
  HardLight = 'hard-light',
  VividLight = 'vivid-light',
  LinearLight = 'linear-light',
  PinLight = 'pin-light',
  HardMix = 'hard-mix',

  // ── Inversion ──
  Difference = 'difference',
  Exclusion = 'exclusion',
  Subtract = 'subtract',
  Divide = 'divide',

  // ── HSL Component ──
  Hue = 'hue',
  Saturation = 'saturation',
  Color = 'color',
  Luminosity = 'luminosity',
}

/** Numeric index for GPU shader dispatch. */
export const BLEND_MODE_INDEX: Record<BlendMode, number> = {
  [BlendMode.Normal]: 0,
  [BlendMode.Dissolve]: 1,
  [BlendMode.Darken]: 2,
  [BlendMode.Multiply]: 3,
  [BlendMode.ColorBurn]: 4,
  [BlendMode.LinearBurn]: 5,
  [BlendMode.DarkerColor]: 6,
  [BlendMode.Lighten]: 7,
  [BlendMode.Screen]: 8,
  [BlendMode.ColorDodge]: 9,
  [BlendMode.LinearDodge]: 10,
  [BlendMode.LighterColor]: 11,
  [BlendMode.Overlay]: 12,
  [BlendMode.SoftLight]: 13,
  [BlendMode.HardLight]: 14,
  [BlendMode.VividLight]: 15,
  [BlendMode.LinearLight]: 16,
  [BlendMode.PinLight]: 17,
  [BlendMode.HardMix]: 18,
  [BlendMode.Difference]: 19,
  [BlendMode.Exclusion]: 20,
  [BlendMode.Subtract]: 21,
  [BlendMode.Divide]: 22,
  [BlendMode.Hue]: 23,
  [BlendMode.Saturation]: 24,
  [BlendMode.Color]: 25,
  [BlendMode.Luminosity]: 26,
};

// ─── Alpha / Matte Types ────────────────────────────────────────────────────

/** Alpha matte operation type. */
export enum MatteMode {
  /** Use alpha channel of matte source to mask the target. */
  AlphaMatte = 'alpha-matte',
  /** Invert the alpha matte. */
  AlphaMatteInverted = 'alpha-matte-inverted',
  /** Use luminance of the matte source as alpha for the target. */
  LumaMatte = 'luma-matte',
  /** Invert the luma matte. */
  LumaMatteInverted = 'luma-matte-inverted',
  /** Avid-style traveling matte (key from matte track). */
  TravelingMatte = 'traveling-matte',
}

// ─── Transform Types ────────────────────────────────────────────────────────

/** 2D affine transform for compositing layers. */
export interface Transform2D {
  /** Horizontal translation in pixels from center. */
  translateX: number;
  /** Vertical translation in pixels from center. */
  translateY: number;
  /** Horizontal scale factor (1.0 = 100%). */
  scaleX: number;
  /** Vertical scale factor (1.0 = 100%). */
  scaleY: number;
  /** Rotation in degrees. */
  rotation: number;
  /** Anchor point X offset in pixels (from layer center). */
  anchorX: number;
  /** Anchor point Y offset in pixels (from layer center). */
  anchorY: number;
}

export const DEFAULT_TRANSFORM: Transform2D = {
  translateX: 0,
  translateY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  anchorX: 0,
  anchorY: 0,
};

// ─── Composite Layer ────────────────────────────────────────────────────────

/**
 * A single layer in the compositing stack. Represents one track/clip
 * at a given point in time.
 */
export interface CompositeLayer {
  /** The frame pixel data for this layer. */
  frame: ImageData;
  /** Layer opacity, 0 to 1. */
  opacity: number;
  /** Blend mode for compositing onto layers below. */
  blendMode: BlendMode;
  /** 2D affine transform (position, scale, rotation). */
  transform: Transform2D;
  /** Optional mask (alpha channel used to restrict visibility). */
  mask?: ImageData;
  /** Whether the source frame has meaningful alpha data. */
  hasAlpha: boolean;
  /** Optional matte mode for alpha/luma matte compositing. */
  matteMode?: MatteMode;
  /** Optional matte source (for traveling matte, alpha matte, etc.). */
  matteSource?: ImageData;
}

// ─── Keying Configuration Types ─────────────────────────────────────────────

/** Configuration for chroma key (green/blue screen removal). */
export interface ChromaKeyConfig {
  /** Key/screen color as hex (#RRGGBB). */
  screenColor: string;
  /** Hue range tolerance, 0-1. */
  hueRange: number;
  /** Saturation range tolerance, 0-1. */
  saturationRange: number;
  /** Luminance range tolerance, 0-1. */
  luminanceRange: number;
  /** Spill suppression strength, 0-1. */
  spillSuppression: number;
  /** Spill suppression method. */
  spillMethod: 'average' | 'desaturate' | 'complementary';
  /** Edge blend / softness, 0-1. */
  edgeBlend: number;
  /** Matte choke (erode positive, dilate negative), -1 to 1. */
  choke: number;
  /** Edge softness (feather), 0-1. */
  edgeSoften: number;
  /** Light wrap amount (wrap background light onto foreground edges), 0-1. */
  lightWrap: number;
  /** Clip black level (core matte floor), 0-1. */
  clipBlack: number;
  /** Clip white level (core matte ceiling), 0-1. */
  clipWhite: number;
}

export const DEFAULT_CHROMA_KEY_CONFIG: ChromaKeyConfig = {
  screenColor: '#00ff00',
  hueRange: 0.3,
  saturationRange: 0.5,
  luminanceRange: 0.5,
  spillSuppression: 0.5,
  spillMethod: 'average',
  edgeBlend: 0.1,
  choke: 0,
  edgeSoften: 0.05,
  lightWrap: 0,
  clipBlack: 0,
  clipWhite: 1,
};

/** Configuration for luma key. */
export interface LumaKeyConfig {
  /** Luminance threshold, 0-1 (pixels below this are keyed). */
  threshold: number;
  /** Edge softness, 0-1. */
  softness: number;
  /** Invert the key (key bright pixels instead of dark). */
  invert: boolean;
  /** Clip black (floor the matte), 0-1. */
  clipBlack: number;
  /** Clip white (ceiling the matte), 0-1. */
  clipWhite: number;
}

export const DEFAULT_LUMA_KEY_CONFIG: LumaKeyConfig = {
  threshold: 0.5,
  softness: 0.1,
  invert: false,
  clipBlack: 0,
  clipWhite: 1,
};

/** Configuration for difference key (clean plate subtraction). */
export interface DiffKeyConfig {
  /** Tolerance / threshold for the difference, 0-1. */
  threshold: number;
  /** Edge softness, 0-1. */
  softness: number;
  /** Pre-blur the difference to reduce noise, 0-20 radius. */
  preBlur: number;
  /** Post-blur the matte for smoother edges, 0-20 radius. */
  postBlur: number;
  /** Clip black, 0-1. */
  clipBlack: number;
  /** Clip white, 0-1. */
  clipWhite: number;
}

export const DEFAULT_DIFF_KEY_CONFIG: DiffKeyConfig = {
  threshold: 0.15,
  softness: 0.1,
  preBlur: 1,
  postBlur: 1,
  clipBlack: 0,
  clipWhite: 1,
};

/**
 * Configuration for ultra key -- advanced multi-pass keyer with
 * separate core/edge/spill stages. Matches DaVinci Resolve Ultra Key.
 */
export interface UltraKeyConfig {
  /** Screen color as hex (#RRGGBB). */
  screenColor: string;
  /** Key method preset. */
  keyMode: 'balanced' | 'aggressive' | 'relaxed' | 'custom';
  /** Transparency / key strength, 0-1. */
  transparency: number;
  /** Highlight recovery, 0-1. */
  highlight: number;
  /** Shadow recovery, 0-1. */
  shadow: number;
  /** Tolerance, 0-1. */
  tolerance: number;
  /** Pedestal / clip black, 0-1. */
  pedestal: number;

  // ── Matte Generation ──
  /** Core matte choke, -1 to 1. */
  choke: number;
  /** Core matte softness, 0-1. */
  coreSoftness: number;
  /** Edge refinement iterations. */
  edgeIterations: number;
  /** Edge softness, 0-1. */
  edgeSoftness: number;
  /** Edge contrast, 0-1. */
  edgeContrast: number;

  // ── Spill Suppression ──
  /** Spill suppression amount, 0-1. */
  spillAmount: number;
  /** Spill replacement luma shift, -1 to 1. */
  spillLumaShift: number;
  /** Spill range, 0-1. */
  spillRange: number;

  // ── Color Correction ──
  /** Foreground saturation adjustment, 0-2. */
  fgSaturation: number;
  /** Foreground hue adjustment, -180 to 180 degrees. */
  fgHue: number;
  /** Foreground luminance adjustment, -1 to 1. */
  fgLuminance: number;

  // ── Light Wrap ──
  /** Light wrap strength, 0-1. */
  lightWrap: number;
  /** Light wrap width in pixels. */
  lightWrapWidth: number;
}

export const DEFAULT_ULTRA_KEY_CONFIG: UltraKeyConfig = {
  screenColor: '#00ff00',
  keyMode: 'balanced',
  transparency: 0.5,
  highlight: 0.5,
  shadow: 0.5,
  tolerance: 0.4,
  pedestal: 0,
  choke: 0,
  coreSoftness: 0.1,
  edgeIterations: 2,
  edgeSoftness: 0.1,
  edgeContrast: 0.5,
  spillAmount: 0.6,
  spillLumaShift: 0,
  spillRange: 0.5,
  fgSaturation: 1,
  fgHue: 0,
  fgLuminance: 0,
  lightWrap: 0,
  lightWrapWidth: 4,
};

// ─── Drop Shadow / Border / Reflection Config ───────────────────────────────

/** Drop shadow parameters for composited layers. */
export interface DropShadowConfig {
  enabled: boolean;
  color: [number, number, number, number]; // RGBA, 0-1
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
}

/** Border parameters for composited layers. */
export interface BorderConfig {
  enabled: boolean;
  color: [number, number, number, number]; // RGBA, 0-1
  width: number;
  cornerRadius: number;
}

/** Reflection parameters for composited layers. */
export interface ReflectionConfig {
  enabled: boolean;
  opacity: number; // 0-1
  distance: number; // gap in pixels
  fadeHeight: number; // pixels
  scale: number; // vertical scale of reflection
}

// ─── Color Space Helpers ────────────────────────────────────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }

  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];

  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return [
    hue2rgb(p, q, h + 1 / 3),
    hue2rgb(p, q, h),
    hue2rgb(p, q, h - 1 / 3),
  ];
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToRgbNorm(hex: string): [number, number, number] {
  const match = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return [0, 0, 0];
  return [
    parseInt(match[1]!, 16) / 255,
    parseInt(match[2]!, 16) / 255,
    parseInt(match[3]!, 16) / 255,
  ];
}

// ─── Blend Mode Functions ───────────────────────────────────────────────────

/** Per-channel blend function: (base, blend) => result, all in [0, 1]. */
type BlendFn = (b: number, o: number) => number;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

const BLEND_FUNCTIONS: Record<BlendMode, BlendFn | 'hsl'> = {
  // ── Normal ──
  [BlendMode.Normal]: (_b, o) => o,
  [BlendMode.Dissolve]: (_b, o) => o, // Handled specially with noise threshold

  // ── Darken ──
  [BlendMode.Darken]: (b, o) => Math.min(b, o),
  [BlendMode.Multiply]: (b, o) => b * o,
  [BlendMode.ColorBurn]: (b, o) =>
    o === 0 ? 0 : clamp01(1 - (1 - b) / o),
  [BlendMode.LinearBurn]: (b, o) => clamp01(b + o - 1),
  [BlendMode.DarkerColor]: 'hsl', // Requires per-pixel luminance comparison

  // ── Lighten ──
  [BlendMode.Lighten]: (b, o) => Math.max(b, o),
  [BlendMode.Screen]: (b, o) => 1 - (1 - b) * (1 - o),
  [BlendMode.ColorDodge]: (b, o) =>
    o >= 1 ? 1 : clamp01(b / (1 - o)),
  [BlendMode.LinearDodge]: (b, o) => clamp01(b + o),
  [BlendMode.LighterColor]: 'hsl', // Requires per-pixel luminance comparison

  // ── Contrast ──
  [BlendMode.Overlay]: (b, o) =>
    b < 0.5 ? 2 * b * o : 1 - 2 * (1 - b) * (1 - o),
  [BlendMode.SoftLight]: (b, o) => {
    if (o <= 0.5) {
      return b - (1 - 2 * o) * b * (1 - b);
    }
    const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
    return b + (2 * o - 1) * (d - b);
  },
  [BlendMode.HardLight]: (b, o) =>
    o < 0.5 ? 2 * b * o : 1 - 2 * (1 - b) * (1 - o),
  [BlendMode.VividLight]: (b, o) => {
    if (o <= 0.5) {
      const o2 = o * 2;
      return o2 === 0 ? 0 : clamp01(1 - (1 - b) / o2);
    }
    const o2m1 = 2 * (o - 0.5);
    return o2m1 >= 1 ? 1 : clamp01(b / (1 - o2m1));
  },
  [BlendMode.LinearLight]: (b, o) =>
    clamp01(b + 2 * o - 1),
  [BlendMode.PinLight]: (b, o) => {
    if (o <= 0.5) return Math.min(b, 2 * o);
    return Math.max(b, 2 * (o - 0.5));
  },
  [BlendMode.HardMix]: (b, o) => (b + o >= 1 ? 1 : 0),

  // ── Inversion ──
  [BlendMode.Difference]: (b, o) => Math.abs(b - o),
  [BlendMode.Exclusion]: (b, o) => b + o - 2 * b * o,
  [BlendMode.Subtract]: (b, o) => clamp01(b - o),
  [BlendMode.Divide]: (b, o) =>
    o === 0 ? 1 : clamp01(b / o),

  // ── HSL Component modes ──
  [BlendMode.Hue]: 'hsl',
  [BlendMode.Saturation]: 'hsl',
  [BlendMode.Color]: 'hsl',
  [BlendMode.Luminosity]: 'hsl',
};

// ─── GPU Acceleration Types ─────────────────────────────────────────────────

interface GPUCompositingState {
  device: GPUDevice;
  adapter: GPUAdapter;
  blendPipeline: GPUComputePipeline | null;
  chromaKeyPipeline: GPUComputePipeline | null;
  transformPipeline: GPUComputePipeline | null;
  alphaCompositePipeline: GPUComputePipeline | null;
  bindGroupLayouts: Map<string, GPUBindGroupLayout>;
  texturePool: Map<string, GPUTexture>;
  uniformBuffer: GPUBuffer | null;
}

// ─── Main Compositing Engine ────────────────────────────────────────────────

/**
 * Production-quality compositing engine with GPU acceleration.
 *
 * Provides:
 *  - All 27 standard Photoshop/DaVinci blend modes
 *  - Alpha premultiply/unpremultiply, matte operations
 *  - Chroma, luma, difference, and ultra keying
 *  - Track-based layer compositing with transforms
 *  - PiP, drop shadow, border, reflection
 *  - WebGPU compute shader acceleration with WebGL2 fallback
 */
class CompositingEngineClass {
  private gpuState: GPUCompositingState | null = null;
  private _gpuAvailable = false;
  private _useGPU = true;
  private offscreenCanvas: OffscreenCanvas | null = null;
  private offscreenCtx: OffscreenCanvasRenderingContext2D | null = null;
  private glCanvas: OffscreenCanvas | null = null;
  private glCtx: WebGL2RenderingContext | null = null;

  /** Whether GPU compositing is available and initialized. */
  get gpuAvailable(): boolean {
    return this._gpuAvailable;
  }

  /** Toggle GPU acceleration on/off. */
  set useGPU(enabled: boolean) {
    this._useGPU = enabled;
  }

  get useGPU(): boolean {
    return this._useGPU && this._gpuAvailable;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Initialization
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialize GPU compositing pipeline.
   * Attempts WebGPU first, then sets up WebGL2 fallback.
   */
  async initGPU(): Promise<boolean> {
    try {
      if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
        console.warn('[CompositingEngine] WebGPU not available, using CPU fallback');
        this._gpuAvailable = false;
        return false;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter = await (navigator as any).gpu.requestAdapter({
        powerPreference: 'high-performance',
      });

      if (!adapter) {
        console.warn('[CompositingEngine] No GPU adapter found');
        this._gpuAvailable = false;
        return false;
      }

      const device = await adapter.requestDevice({
        label: 'the-avid-compositing',
      });

      device.lost.then((info: GPUDeviceLostInfo) => {
        console.error(`[CompositingEngine] GPU device lost: ${info.message}`);
        this._gpuAvailable = false;
        this.gpuState = null;
      });

      this.gpuState = {
        device,
        adapter,
        blendPipeline: null,
        chromaKeyPipeline: null,
        transformPipeline: null,
        alphaCompositePipeline: null,
        bindGroupLayouts: new Map(),
        texturePool: new Map(),
        uniformBuffer: device.createBuffer({
          label: 'compositing-uniforms',
          size: 512, // Generous uniform buffer
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        }),
      };

      this._gpuAvailable = true;
      console.info('[CompositingEngine] GPU pipeline initialized successfully');
      return true;
    } catch (err) {
      console.error('[CompositingEngine] GPU init failed:', err);
      this._gpuAvailable = false;
      return false;
    }
  }

  /**
   * Initialize WebGL2 fallback for compositing when WebGPU is unavailable.
   */
  initWebGL2Fallback(width: number, height: number): boolean {
    try {
      this.glCanvas = new OffscreenCanvas(width, height);
      this.glCtx = this.glCanvas.getContext('webgl2') as WebGL2RenderingContext | null;

      if (!this.glCtx) {
        console.warn('[CompositingEngine] WebGL2 not available');
        return false;
      }

      // Enable required extensions
      this.glCtx.getExtension('EXT_color_buffer_float');
      this.glCtx.getExtension('OES_texture_float_linear');

      console.info('[CompositingEngine] WebGL2 fallback initialized');
      return true;
    } catch (err) {
      console.error('[CompositingEngine] WebGL2 init failed:', err);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Alpha Channel Operations
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Premultiply alpha: multiply RGB by alpha for correct compositing.
   * Canvas 2D and GPU compositing pipelines expect premultiplied alpha.
   */
  premultiplyAlpha(imageData: ImageData): ImageData {
    const result = new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height,
    );
    const d = result.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]! / 255;
      d[i] = Math.round(d[i]! * a);
      d[i + 1] = Math.round(d[i + 1]! * a);
      d[i + 2] = Math.round(d[i + 2]! * a);
    }
    return result;
  }

  /**
   * Unpremultiply alpha: divide RGB by alpha to recover straight alpha.
   */
  unpremultiplyAlpha(imageData: ImageData): ImageData {
    const result = new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height,
    );
    const d = result.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]!;
      if (a === 0) continue;
      const invA = 255 / a;
      d[i] = Math.min(255, Math.round(d[i]! * invA));
      d[i + 1] = Math.min(255, Math.round(d[i + 1]! * invA));
      d[i + 2] = Math.min(255, Math.round(d[i + 2]! * invA));
    }
    return result;
  }

  /**
   * Invert the alpha channel (swap transparent and opaque).
   */
  invertAlpha(imageData: ImageData): ImageData {
    const result = new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height,
    );
    const d = result.data;
    for (let i = 3; i < d.length; i += 4) {
      d[i] = 255 - d[i]!;
    }
    return result;
  }

  /**
   * Feather / blur the edges of an alpha channel.
   * Uses a separable Gaussian blur on the alpha channel only.
   *
   * @param imageData  Source image data
   * @param radius     Feather radius in pixels
   */
  featherAlpha(imageData: ImageData, radius: number): ImageData {
    if (radius <= 0) {
      return new ImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height,
      );
    }

    const w = imageData.width;
    const h = imageData.height;
    const src = imageData.data;
    const r = Math.ceil(radius);

    // Build 1D Gaussian kernel
    const sigma = radius / 3;
    const kernelSize = r * 2 + 1;
    const kernel = new Float32Array(kernelSize);
    let kernelSum = 0;
    for (let k = -r; k <= r; k++) {
      const val = Math.exp(-(k * k) / (2 * sigma * sigma));
      kernel[k + r] = val;
      kernelSum += val;
    }
    for (let k = 0; k < kernelSize; k++) {
      kernel[k]! /= kernelSum;
    }

    // Extract alpha channel
    const alpha = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      alpha[i] = src[i * 4 + 3]! / 255;
    }

    // Horizontal pass
    const temp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) {
          const sx = Math.min(w - 1, Math.max(0, x + k));
          sum += alpha[y * w + sx]! * kernel[k + r]!;
        }
        temp[y * w + x] = sum;
      }
    }

    // Vertical pass
    const blurred = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) {
          const sy = Math.min(h - 1, Math.max(0, y + k));
          sum += temp[sy * w + x]! * kernel[k + r]!;
        }
        blurred[y * w + x] = sum;
      }
    }

    // Write back
    const result = new ImageData(
      new Uint8ClampedArray(src),
      w,
      h,
    );
    const d = result.data;
    for (let i = 0; i < w * h; i++) {
      d[i * 4 + 3] = Math.round(clamp01(blurred[i]!) * 255);
    }
    return result;
  }

  /**
   * Apply an alpha matte: use one image's alpha or luminance as the
   * visibility mask for another.
   *
   * @param target     The image to be masked
   * @param matte      The matte source
   * @param mode       Matte operation type
   */
  applyMatte(target: ImageData, matte: ImageData, mode: MatteMode): ImageData {
    const w = Math.min(target.width, matte.width);
    const h = Math.min(target.height, matte.height);
    const result = new ImageData(
      new Uint8ClampedArray(target.data),
      target.width,
      target.height,
    );
    const rd = result.data;
    const md = matte.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ti = (y * target.width + x) * 4;
        const mi = (y * matte.width + x) * 4;

        let matteValue: number;

        switch (mode) {
          case MatteMode.AlphaMatte:
            matteValue = md[mi + 3]! / 255;
            break;
          case MatteMode.AlphaMatteInverted:
            matteValue = 1 - md[mi + 3]! / 255;
            break;
          case MatteMode.LumaMatte:
            matteValue = luminance(
              md[mi]! / 255,
              md[mi + 1]! / 255,
              md[mi + 2]! / 255,
            );
            break;
          case MatteMode.LumaMatteInverted:
            matteValue = 1 - luminance(
              md[mi]! / 255,
              md[mi + 1]! / 255,
              md[mi + 2]! / 255,
            );
            break;
          case MatteMode.TravelingMatte:
            // Traveling matte uses the alpha of the matte track
            matteValue = md[mi + 3]! / 255;
            break;
          default:
            matteValue = 1;
        }

        // Multiply the target's existing alpha by the matte value
        rd[ti + 3] = Math.round(rd[ti + 3]! * matteValue);
      }
    }

    return result;
  }

  /**
   * Generate a simple garbage matte (rectangular region mask).
   * Points define a polygon; pixels inside are white, outside are black.
   *
   * @param width   Output width
   * @param height  Output height
   * @param points  Polygon vertices as [x, y] pairs, normalized 0-1
   * @param feather Edge feather radius in pixels
   */
  generateGarbageMatte(
    width: number,
    height: number,
    points: Array<[number, number]>,
    feather: number = 0,
  ): ImageData {
    const result = new ImageData(width, height);
    const d = result.data;

    if (points.length < 3) {
      // Not enough points for a polygon; return fully opaque
      d.fill(255);
      return result;
    }

    // Convert normalized points to pixel coordinates
    const pixelPoints = points.map(([x, y]) => [x * width, y * height] as [number, number]);

    // Point-in-polygon test (ray casting)
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        let inside = false;
        let minDist = Infinity;

        for (let i = 0, j = pixelPoints.length - 1; i < pixelPoints.length; j = i++) {
          const [xi, yi] = pixelPoints[i]!;
          const [xj, yj] = pixelPoints[j]!;

          // Ray casting
          if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
            inside = !inside;
          }

          // Distance to edge segment for feathering
          if (feather > 0) {
            const dx = xj - xi;
            const dy = yj - yi;
            const lenSq = dx * dx + dy * dy;
            let t = lenSq === 0 ? 0 : clamp01(((px - xi) * dx + (py - yi) * dy) / lenSq);
            const closestX = xi + t * dx;
            const closestY = yi + t * dy;
            const edgeDist = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
            minDist = Math.min(minDist, edgeDist);
          }
        }

        const idx = (py * width + px) * 4;
        let alpha: number;

        if (feather > 0) {
          if (inside) {
            alpha = minDist >= feather ? 255 : Math.round((minDist / feather) * 255);
            // Inside: fully opaque if far from edge, feathered near edge
            alpha = inside ? Math.round(Math.min(1, minDist / feather) * 255) : 0;
            // Ensure inside pixels are at least partially visible
            alpha = Math.max(alpha, inside ? Math.round(clamp01(minDist / feather) * 255) : 0);
          } else {
            // Outside: feathered near edge, fully transparent far from edge
            alpha = minDist < feather ? Math.round((1 - minDist / feather) * 255) : 0;
          }
        } else {
          alpha = inside ? 255 : 0;
        }

        d[idx] = 255;
        d[idx + 1] = 255;
        d[idx + 2] = 255;
        d[idx + 3] = alpha;
      }
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Keying Operations
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Chroma Key -- Production-quality green/blue screen removal with
   * spill suppression, edge refinement, and matte clipping.
   */
  chromaKey(frame: ImageData, config: ChromaKeyConfig): ImageData {
    const w = frame.width;
    const h = frame.height;
    const result = new ImageData(
      new Uint8ClampedArray(frame.data),
      w,
      h,
    );
    const d = result.data;
    const [kr, kg, kb] = hexToRgbNorm(config.screenColor);
    const [kH, kS, kL] = rgbToHsl(kr, kg, kb);

    // Pass 1: Generate initial key matte
    const matte = new Float32Array(w * h);

    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      const r = d[idx]! / 255;
      const g = d[idx + 1]! / 255;
      const b = d[idx + 2]! / 255;

      const [pH, pS, pL] = rgbToHsl(r, g, b);

      // Hue distance (circular)
      let hDist = Math.abs(pH - kH);
      if (hDist > 0.5) hDist = 1 - hDist;

      // Normalize distances by their respective ranges
      const hFactor = hDist / Math.max(config.hueRange, 0.001);
      const sFactor = Math.abs(pS - kS) / Math.max(config.saturationRange, 0.001);
      const lFactor = Math.abs(pL - kL) / Math.max(config.luminanceRange, 0.001);

      // Combined weighted distance
      const dist = Math.sqrt(hFactor * hFactor + sFactor * sFactor * 0.5 + lFactor * lFactor * 0.3);

      // Map distance to alpha with edge blend
      const innerEdge = 1.0 - config.edgeBlend;
      if (dist < innerEdge) {
        matte[i] = 0; // Fully keyed (transparent)
      } else if (dist < 1.0) {
        matte[i] = (dist - innerEdge) / (1.0 - innerEdge);
      } else {
        matte[i] = 1; // Fully visible
      }
    }

    // Pass 2: Apply clip black/white (core matte)
    for (let i = 0; i < matte.length; i++) {
      let v = matte[i]!;
      // Clip black: push low values to 0
      if (v <= config.clipBlack) {
        v = 0;
      } else if (v >= config.clipWhite) {
        v = 1;
      } else {
        v = (v - config.clipBlack) / (config.clipWhite - config.clipBlack);
      }
      matte[i] = v;
    }

    // Pass 3: Choke (erode/dilate the matte)
    if (config.choke !== 0) {
      this.chokeMatte(matte, w, h, config.choke);
    }

    // Pass 4: Soften edges
    if (config.edgeSoften > 0) {
      this.softenMatte(matte, w, h, Math.ceil(config.edgeSoften * 10));
    }

    // Pass 5: Apply spill suppression and write alpha
    const isGreenScreen = kg > kr && kg > kb;
    const isBlueScreen = kb > kr && kb > kg;

    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      const alpha = matte[i]!;

      // Write alpha
      d[idx + 3] = Math.round(alpha * 255);

      // Spill suppression on partially/fully visible pixels
      if (config.spillSuppression > 0 && alpha > 0) {
        const r = d[idx]! / 255;
        const g = d[idx + 1]! / 255;
        const b = d[idx + 2]! / 255;

        if (isGreenScreen) {
          const spillAmount = Math.max(0, g - Math.max(r, b));
          const suppressed = this.suppressSpill(
            r, g, b, spillAmount, config.spillSuppression, config.spillMethod, 'green',
          );
          d[idx] = Math.round(suppressed[0] * 255);
          d[idx + 1] = Math.round(suppressed[1] * 255);
          d[idx + 2] = Math.round(suppressed[2] * 255);
        } else if (isBlueScreen) {
          const spillAmount = Math.max(0, b - Math.max(r, g));
          const suppressed = this.suppressSpill(
            r, g, b, spillAmount, config.spillSuppression, config.spillMethod, 'blue',
          );
          d[idx] = Math.round(suppressed[0] * 255);
          d[idx + 1] = Math.round(suppressed[1] * 255);
          d[idx + 2] = Math.round(suppressed[2] * 255);
        }
      }
    }

    return result;
  }

  /**
   * Luma Key -- Key pixels based on luminance with production controls.
   */
  lumaKey(frame: ImageData, config: LumaKeyConfig): ImageData {
    const w = frame.width;
    const h = frame.height;
    const result = new ImageData(
      new Uint8ClampedArray(frame.data),
      w,
      h,
    );
    const d = result.data;

    const innerThreshold = Math.max(0, config.threshold - config.softness * 0.5);
    const outerThreshold = Math.min(1, config.threshold + config.softness * 0.5);
    const range = outerThreshold - innerThreshold || 0.001;

    for (let i = 0; i < d.length; i += 4) {
      const luma = luminance(d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255);
      const l = config.invert ? 1 - luma : luma;

      let alpha: number;
      if (l < innerThreshold) {
        alpha = 0;
      } else if (l < outerThreshold) {
        alpha = (l - innerThreshold) / range;
      } else {
        alpha = 1;
      }

      // Apply clip black/white
      if (alpha <= config.clipBlack) {
        alpha = 0;
      } else if (alpha >= config.clipWhite) {
        alpha = 1;
      } else {
        alpha = (alpha - config.clipBlack) / (config.clipWhite - config.clipBlack);
      }

      d[i + 3] = Math.round(alpha * d[i + 3]! / 255 * 255);
    }

    return result;
  }

  /**
   * Difference Key -- Compare frame to a clean plate and key differences.
   */
  differenceKey(frame: ImageData, cleanPlate: ImageData, config: DiffKeyConfig): ImageData {
    const w = frame.width;
    const h = frame.height;
    const result = new ImageData(
      new Uint8ClampedArray(frame.data),
      w,
      h,
    );
    const d = result.data;
    const cd = cleanPlate.data;

    // Generate difference matte
    const matte = new Float32Array(w * h);
    const maxDist = Math.sqrt(3); // Max distance between two normalized RGB values

    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      const dr = (d[idx]! - cd[idx]!) / 255;
      const dg = (d[idx + 1]! - cd[idx + 1]!) / 255;
      const db = (d[idx + 2]! - cd[idx + 2]!) / 255;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db) / maxDist;

      // Map difference to alpha
      const innerEdge = config.threshold;
      const outerEdge = config.threshold + config.softness;

      if (dist < innerEdge) {
        matte[i] = 0; // Similar to clean plate -- key out
      } else if (dist < outerEdge) {
        matte[i] = (dist - innerEdge) / (outerEdge - innerEdge);
      } else {
        matte[i] = 1; // Different from clean plate -- keep
      }
    }

    // Pre-blur the matte to reduce noise
    if (config.preBlur > 0) {
      this.softenMatte(matte, w, h, Math.ceil(config.preBlur));
    }

    // Apply clip black/white
    for (let i = 0; i < matte.length; i++) {
      let v = matte[i]!;
      if (v <= config.clipBlack) {
        v = 0;
      } else if (v >= config.clipWhite) {
        v = 1;
      } else {
        v = (v - config.clipBlack) / (config.clipWhite - config.clipBlack);
      }
      matte[i] = v;
    }

    // Post-blur the matte for smoother edges
    if (config.postBlur > 0) {
      this.softenMatte(matte, w, h, Math.ceil(config.postBlur));
    }

    // Write alpha channel
    for (let i = 0; i < w * h; i++) {
      d[i * 4 + 3] = Math.round(matte[i]! * 255);
    }

    return result;
  }

  /**
   * Ultra Key -- Advanced multi-pass keyer matching DaVinci Resolve quality.
   * Performs core extraction, matte refinement, spill suppression, and
   * optional foreground color correction in a single pipeline.
   */
  ultraKey(frame: ImageData, config: UltraKeyConfig): ImageData {
    const w = frame.width;
    const h = frame.height;
    const result = new ImageData(
      new Uint8ClampedArray(frame.data),
      w,
      h,
    );
    const d = result.data;
    const [kr, kg, kb] = hexToRgbNorm(config.screenColor);
    const isGreenScreen = kg > kr && kg > kb;

    // ── Determine effective parameters from key mode ──
    let effectiveTolerance = config.tolerance;
    let effectivePedestal = config.pedestal;
    let effectiveSpill = config.spillAmount;
    let effectiveChoke = config.choke;

    switch (config.keyMode) {
      case 'aggressive':
        effectiveTolerance *= 1.4;
        effectiveSpill *= 1.3;
        effectiveChoke += 0.05;
        break;
      case 'relaxed':
        effectiveTolerance *= 0.7;
        effectivePedestal += 0.05;
        effectiveChoke -= 0.03;
        break;
      case 'balanced':
        // Use defaults
        break;
      case 'custom':
        // Use exact values
        break;
    }

    // ── Pass 1: Core key extraction ──
    const matte = new Float32Array(w * h);

    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      const r = d[idx]! / 255;
      const g = d[idx + 1]! / 255;
      const b = d[idx + 2]! / 255;

      // Per-channel key extraction (IBK-style)
      let keyVal: number;
      if (isGreenScreen) {
        const avgRB = (r + b) / 2;
        keyVal = Math.max(0, g - avgRB * (1 + config.transparency * 0.5));
        keyVal /= Math.max(0.001, g);
      } else {
        const avgRG = (r + g) / 2;
        keyVal = Math.max(0, b - avgRG * (1 + config.transparency * 0.5));
        keyVal /= Math.max(0.001, b);
      }

      // Apply tolerance
      keyVal = keyVal / Math.max(effectiveTolerance, 0.001);
      keyVal = clamp01(keyVal);

      // Apply highlight recovery
      const lum = luminance(r, g, b);
      if (lum > 0.8) {
        keyVal *= (1 - config.highlight * (lum - 0.8) / 0.2);
      }

      // Apply shadow recovery
      if (lum < 0.2) {
        keyVal *= (1 - config.shadow * (0.2 - lum) / 0.2);
      }

      // Pedestal (clip black)
      if (keyVal < effectivePedestal) {
        keyVal = 0;
      }

      matte[i] = 1 - clamp01(keyVal);
    }

    // ── Pass 2: Core matte refinement ──
    // Apply choke
    if (effectiveChoke !== 0) {
      this.chokeMatte(matte, w, h, effectiveChoke);
    }

    // Apply core softness
    if (config.coreSoftness > 0) {
      this.softenMatte(matte, w, h, Math.ceil(config.coreSoftness * 8));
    }

    // ── Pass 3: Edge refinement (iterative) ──
    for (let iter = 0; iter < config.edgeIterations; iter++) {
      // Edge detection pass: find edges of the matte
      const edgeMask = new Float32Array(w * h);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = y * w + x;
          const center = matte[idx]!;
          // Sobel-like gradient magnitude
          const gx = (matte[idx + 1]! - matte[idx - 1]!) * 0.5;
          const gy = (matte[(y + 1) * w + x]! - matte[(y - 1) * w + x]!) * 0.5;
          edgeMask[idx] = Math.sqrt(gx * gx + gy * gy);
        }
      }

      // Refine edges: apply softness and contrast to edge region
      for (let i = 0; i < w * h; i++) {
        if (edgeMask[i]! > 0.01) {
          // Apply edge contrast
          let v = matte[i]!;
          v = 0.5 + (v - 0.5) * (1 + config.edgeContrast * 2);
          matte[i] = clamp01(v);
        }
      }

      // Smooth edges
      if (config.edgeSoftness > 0) {
        // Only soften at edges
        const smoothed = new Float32Array(matte);
        this.softenMatte(smoothed, w, h, Math.max(1, Math.ceil(config.edgeSoftness * 4)));
        for (let i = 0; i < w * h; i++) {
          if (edgeMask[i]! > 0.01) {
            const edgeStrength = clamp01(edgeMask[i]! * 5);
            matte[i] = matte[i]! * (1 - edgeStrength) + smoothed[i]! * edgeStrength;
          }
        }
      }
    }

    // ── Pass 4: Spill suppression ──
    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      const alpha = matte[i]!;

      if (effectiveSpill > 0 && alpha > 0) {
        let r = d[idx]! / 255;
        let g = d[idx + 1]! / 255;
        let b = d[idx + 2]! / 255;

        if (isGreenScreen) {
          const avgRB = (r + b) / 2;
          const spillAmount = Math.max(0, g - avgRB) * effectiveSpill;

          // Spill replacement
          g -= spillAmount;
          r += spillAmount * 0.2; // Warm shift
          b += spillAmount * 0.1;

          // Luma shift on spill area
          if (config.spillLumaShift !== 0) {
            const lumaAdj = spillAmount * config.spillLumaShift;
            r = clamp01(r + lumaAdj);
            g = clamp01(g + lumaAdj);
            b = clamp01(b + lumaAdj);
          }
        } else {
          const avgRG = (r + g) / 2;
          const spillAmount = Math.max(0, b - avgRG) * effectiveSpill;

          b -= spillAmount;
          r += spillAmount * 0.15;
          g += spillAmount * 0.1;

          if (config.spillLumaShift !== 0) {
            const lumaAdj = spillAmount * config.spillLumaShift;
            r = clamp01(r + lumaAdj);
            g = clamp01(g + lumaAdj);
            b = clamp01(b + lumaAdj);
          }
        }

        d[idx] = Math.round(clamp01(r) * 255);
        d[idx + 1] = Math.round(clamp01(g) * 255);
        d[idx + 2] = Math.round(clamp01(b) * 255);
      }

      // ── Pass 5: Foreground color correction ──
      if (alpha > 0 && (config.fgSaturation !== 1 || config.fgHue !== 0 || config.fgLuminance !== 0)) {
        let r = d[idx]! / 255;
        let g = d[idx + 1]! / 255;
        let b = d[idx + 2]! / 255;

        const [fgH, fgS, fgL] = rgbToHsl(r, g, b);
        const newH = ((fgH + config.fgHue / 360) % 1 + 1) % 1;
        const newS = clamp01(fgS * config.fgSaturation);
        const newL = clamp01(fgL + config.fgLuminance);
        const [nr, ng, nb] = hslToRgb(newH, newS, newL);

        // Only apply correction proportional to alpha (avoid touching fully keyed areas)
        d[idx] = Math.round(nr * 255);
        d[idx + 1] = Math.round(ng * 255);
        d[idx + 2] = Math.round(nb * 255);
      }

      // Write final alpha
      d[idx + 3] = Math.round(alpha * 255);
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Blend Mode Compositing
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Blend a single pixel using the specified blend mode.
   * All channel values in [0, 1].
   */
  private blendPixel(
    baseR: number, baseG: number, baseB: number, baseA: number,
    overR: number, overG: number, overB: number, overA: number,
    mode: BlendMode,
    opacity: number,
    dissolveRandom?: number,
  ): [number, number, number, number] {
    // Dissolve: treat as normal but with stochastic alpha
    if (mode === BlendMode.Dissolve) {
      const dissolveThreshold = overA * opacity;
      if ((dissolveRandom ?? Math.random()) > dissolveThreshold) {
        return [baseR, baseG, baseB, baseA];
      }
      // If we pass the threshold, composite at full opacity like normal
      return this.blendPixel(baseR, baseG, baseB, baseA, overR, overG, overB, 1, BlendMode.Normal, 1);
    }

    const fn = BLEND_FUNCTIONS[mode];
    const effectiveAlpha = overA * opacity;

    if (effectiveAlpha <= 0) return [baseR, baseG, baseB, baseA];

    let blendR: number, blendG: number, blendB: number;

    if (fn === 'hsl') {
      // HSL component modes
      [blendR, blendG, blendB] = this.blendHSL(
        baseR, baseG, baseB, overR, overG, overB, mode,
      );
    } else if (mode === BlendMode.DarkerColor) {
      // Compare luminance of entire pixel
      const baseLum = luminance(baseR, baseG, baseB);
      const overLum = luminance(overR, overG, overB);
      if (overLum < baseLum) {
        blendR = overR; blendG = overG; blendB = overB;
      } else {
        blendR = baseR; blendG = baseG; blendB = baseB;
      }
    } else if (mode === BlendMode.LighterColor) {
      const baseLum = luminance(baseR, baseG, baseB);
      const overLum = luminance(overR, overG, overB);
      if (overLum > baseLum) {
        blendR = overR; blendG = overG; blendB = overB;
      } else {
        blendR = baseR; blendG = baseG; blendB = baseB;
      }
    } else {
      blendR = fn(baseR, overR);
      blendG = fn(baseG, overG);
      blendB = fn(baseB, overB);
    }

    // Porter-Duff source-over compositing with blend result
    const outA = effectiveAlpha + baseA * (1 - effectiveAlpha);
    if (outA <= 0) return [0, 0, 0, 0];

    const outR = (blendR * effectiveAlpha + baseR * baseA * (1 - effectiveAlpha)) / outA;
    const outG = (blendG * effectiveAlpha + baseG * baseA * (1 - effectiveAlpha)) / outA;
    const outB = (blendB * effectiveAlpha + baseB * baseA * (1 - effectiveAlpha)) / outA;

    return [clamp01(outR), clamp01(outG), clamp01(outB), clamp01(outA)];
  }

  /**
   * HSL component blend modes: Hue, Saturation, Color, Luminosity.
   */
  private blendHSL(
    bR: number, bG: number, bB: number,
    oR: number, oG: number, oB: number,
    mode: BlendMode,
  ): [number, number, number] {
    const [bH, bS, bL] = rgbToHsl(bR, bG, bB);
    const [oH, oS, oL] = rgbToHsl(oR, oG, oB);

    let rH: number, rS: number, rL: number;

    switch (mode) {
      case BlendMode.Hue:
        rH = oH; rS = bS; rL = bL;
        break;
      case BlendMode.Saturation:
        rH = bH; rS = oS; rL = bL;
        break;
      case BlendMode.Color:
        rH = oH; rS = oS; rL = bL;
        break;
      case BlendMode.Luminosity:
        rH = bH; rS = bS; rL = oL;
        break;
      default:
        rH = oH; rS = oS; rL = oL;
    }

    return hslToRgb(rH, rS, rL);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Frame Compositing (CPU Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Composite all layers together, bottom-to-top.
   * This is the main compositing entry point.
   *
   * @param layers  Ordered array of composite layers (index 0 = bottom)
   * @param width   Output canvas width
   * @param height  Output canvas height
   */
  compositeFrame(layers: CompositeLayer[], width: number, height: number): ImageData {
    // Initialize output with transparent black
    const output = new ImageData(width, height);

    if (layers.length === 0) return output;

    // Composite each layer onto the output, bottom to top
    for (const layer of layers) {
      this.compositeLayer(output, layer, width, height);
    }

    return output;
  }

  /**
   * Composite a single layer onto the accumulator buffer.
   */
  private compositeLayer(
    output: ImageData,
    layer: CompositeLayer,
    canvasW: number,
    canvasH: number,
  ): void {
    const srcW = layer.frame.width;
    const srcH = layer.frame.height;
    const srcData = layer.frame.data;
    const outData = output.data;
    const t = layer.transform;

    // Apply matte if present
    let effectiveFrame = layer.frame;
    if (layer.matteSource && layer.matteMode) {
      effectiveFrame = this.applyMatte(layer.frame, layer.matteSource, layer.matteMode);
    }

    // Apply mask if present
    if (layer.mask) {
      effectiveFrame = this.applyMatte(
        effectiveFrame,
        layer.mask,
        MatteMode.AlphaMatte,
      );
    }

    const effData = effectiveFrame.data;

    // Precompute inverse transform matrix for mapping output pixels to source
    const cx = canvasW / 2 + t.translateX;
    const cy = canvasH / 2 + t.translateY;
    const ax = t.anchorX;
    const ay = t.anchorY;
    const cosR = Math.cos(-t.rotation * Math.PI / 180);
    const sinR = Math.sin(-t.rotation * Math.PI / 180);
    const invSx = t.scaleX === 0 ? 0 : 1 / t.scaleX;
    const invSy = t.scaleY === 0 ? 0 : 1 / t.scaleY;

    // Source center
    const srcCx = srcW / 2;
    const srcCy = srcH / 2;

    // Seed for dissolve
    let dissolveCounter = 0;

    for (let oy = 0; oy < canvasH; oy++) {
      for (let ox = 0; ox < canvasW; ox++) {
        // Map output pixel to source pixel via inverse transform
        const dx = ox - cx + ax;
        const dy = oy - cy + ay;

        // Inverse rotation
        const rx = dx * cosR - dy * sinR;
        const ry = dx * sinR + dy * cosR;

        // Inverse scale
        const sx = rx * invSx + srcCx;
        const sy = ry * invSy + srcCy;

        // Bounds check
        if (sx < 0 || sx >= srcW || sy < 0 || sy >= srcH) continue;

        // Bilinear interpolation
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const x1 = Math.min(x0 + 1, srcW - 1);
        const y1 = Math.min(y0 + 1, srcH - 1);
        const fx = sx - x0;
        const fy = sy - y0;

        const i00 = (y0 * srcW + x0) * 4;
        const i10 = (y0 * srcW + x1) * 4;
        const i01 = (y1 * srcW + x0) * 4;
        const i11 = (y1 * srcW + x1) * 4;

        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;

        const overR = (effData[i00]! * w00 + effData[i10]! * w10 + effData[i01]! * w01 + effData[i11]! * w11) / 255;
        const overG = (effData[i00 + 1]! * w00 + effData[i10 + 1]! * w10 + effData[i01 + 1]! * w01 + effData[i11 + 1]! * w11) / 255;
        const overB = (effData[i00 + 2]! * w00 + effData[i10 + 2]! * w10 + effData[i01 + 2]! * w01 + effData[i11 + 2]! * w11) / 255;
        const overA = (effData[i00 + 3]! * w00 + effData[i10 + 3]! * w10 + effData[i01 + 3]! * w01 + effData[i11 + 3]! * w11) / 255;

        if (overA <= 0 && !layer.hasAlpha) continue;

        // Read current base pixel
        const outIdx = (oy * canvasW + ox) * 4;
        const baseR = outData[outIdx]! / 255;
        const baseG = outData[outIdx + 1]! / 255;
        const baseB = outData[outIdx + 2]! / 255;
        const baseA = outData[outIdx + 3]! / 255;

        // Generate dissolve random from position hash
        dissolveCounter++;
        const dissolveRandom = layer.blendMode === BlendMode.Dissolve
          ? this.hashFloat(dissolveCounter)
          : undefined;

        // Blend
        const [rR, rG, rB, rA] = this.blendPixel(
          baseR, baseG, baseB, baseA,
          overR, overG, overB, overA,
          layer.blendMode,
          layer.opacity,
          dissolveRandom,
        );

        outData[outIdx] = Math.round(rR * 255);
        outData[outIdx + 1] = Math.round(rG * 255);
        outData[outIdx + 2] = Math.round(rB * 255);
        outData[outIdx + 3] = Math.round(rA * 255);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Track Compositing (Avid-style)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Composite timeline tracks for a single frame, Avid-style (bottom-to-top).
   *
   * @param trackFrames  Array of { frame, trackBlendMode, trackOpacity, clipBlendMode, clipOpacity, transform, mask }
   * @param width        Output resolution width
   * @param height       Output resolution height
   * @param backgroundColor  Background color as hex (#RRGGBB)
   */
  compositeTimeline(
    trackFrames: Array<{
      frame: ImageData;
      trackBlendMode?: BlendMode | CompositeMode;
      trackOpacity?: number;
      clipBlendMode?: BlendMode | CompositeMode;
      clipOpacity?: number;
      intrinsicVideo?: IntrinsicVideoProps;
      mask?: ImageData;
      matteMode?: MatteMode;
      matteSource?: ImageData;
      hasAlpha?: boolean;
    }>,
    width: number,
    height: number,
    backgroundColor: string = '#000000',
  ): ImageData {
    // Start with background
    const output = new ImageData(width, height);
    const [bgR, bgG, bgB] = hexToRgbNorm(backgroundColor);
    const od = output.data;
    for (let i = 0; i < od.length; i += 4) {
      od[i] = Math.round(bgR * 255);
      od[i + 1] = Math.round(bgG * 255);
      od[i + 2] = Math.round(bgB * 255);
      od[i + 3] = 255;
    }

    // Build composite layers from track frames
    const layers: CompositeLayer[] = trackFrames.map((tf) => {
      // Resolve blend mode: clip-level overrides track-level
      const rawMode = tf.clipBlendMode || tf.trackBlendMode || 'normal';
      const blendMode = this.resolveBlendMode(rawMode);

      // Resolve opacity: clip opacity * track opacity
      const clipOp = (tf.clipOpacity ?? 100) / 100;
      const trackOp = (tf.trackOpacity ?? 100) / 100;

      // Build transform from intrinsic video props
      const transform: Transform2D = tf.intrinsicVideo
        ? {
            translateX: tf.intrinsicVideo.positionX,
            translateY: tf.intrinsicVideo.positionY,
            scaleX: tf.intrinsicVideo.scaleX / 100,
            scaleY: tf.intrinsicVideo.scaleY / 100,
            rotation: tf.intrinsicVideo.rotation,
            anchorX: tf.intrinsicVideo.anchorX,
            anchorY: tf.intrinsicVideo.anchorY,
          }
        : { ...DEFAULT_TRANSFORM };

      return {
        frame: tf.frame,
        opacity: clipOp * trackOp,
        blendMode,
        transform,
        mask: tf.mask,
        hasAlpha: tf.hasAlpha ?? false,
        matteMode: tf.matteMode,
        matteSource: tf.matteSource,
      };
    });

    return this.compositeFrame(layers, width, height);
  }

  /**
   * Composite a nested sequence as a single layer. The nested sequence
   * is first rendered to a single ImageData, then composited onto the parent.
   *
   * @param nestedFrame  Pre-rendered nested sequence frame
   * @param parentOutput Parent compositing accumulator
   * @param blendMode    Blend mode for the nested layer
   * @param opacity      Opacity of the nested layer (0-1)
   * @param transform    2D transform
   */
  compositeNestedSequence(
    nestedFrame: ImageData,
    parentOutput: ImageData,
    blendMode: BlendMode = BlendMode.Normal,
    opacity: number = 1,
    transform: Transform2D = DEFAULT_TRANSFORM,
  ): void {
    const layer: CompositeLayer = {
      frame: nestedFrame,
      opacity,
      blendMode,
      transform,
      hasAlpha: true,
    };

    this.compositeLayer(parentOutput, layer, parentOutput.width, parentOutput.height);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PiP / Layer Effects (Drop Shadow, Border, Reflection)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Apply drop shadow to a composited layer.
   */
  applyDropShadow(frame: ImageData, config: DropShadowConfig): ImageData {
    if (!config.enabled) return frame;

    const w = frame.width;
    const h = frame.height;
    const padX = Math.ceil(Math.abs(config.offsetX) + config.blur * 2 + config.spread);
    const padY = Math.ceil(Math.abs(config.offsetY) + config.blur * 2 + config.spread);

    // Create padded canvas
    const paddedW = w + padX * 2;
    const paddedH = h + padY * 2;
    const result = new ImageData(paddedW, paddedH);
    const rd = result.data;

    // Generate shadow from alpha channel
    const shadowMatte = new Float32Array(paddedW * paddedH);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcIdx = (y * w + x) * 4;
        const alpha = frame.data[srcIdx + 3]! / 255;
        const dstX = x + padX + Math.round(config.offsetX);
        const dstY = y + padY + Math.round(config.offsetY);

        if (dstX >= 0 && dstX < paddedW && dstY >= 0 && dstY < paddedH) {
          shadowMatte[dstY * paddedW + dstX] = alpha;
        }
      }
    }

    // Blur shadow
    if (config.blur > 0) {
      this.softenMatte(shadowMatte, paddedW, paddedH, Math.ceil(config.blur));
    }

    // Draw shadow
    for (let i = 0; i < paddedW * paddedH; i++) {
      const idx = i * 4;
      const shadowA = shadowMatte[i]! * config.color[3];
      rd[idx] = Math.round(config.color[0] * 255);
      rd[idx + 1] = Math.round(config.color[1] * 255);
      rd[idx + 2] = Math.round(config.color[2] * 255);
      rd[idx + 3] = Math.round(shadowA * 255);
    }

    // Composite original on top
    const fd = frame.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcIdx = (y * w + x) * 4;
        const dstIdx = ((y + padY) * paddedW + (x + padX)) * 4;

        const srcA = fd[srcIdx + 3]! / 255;
        if (srcA <= 0) continue;

        const dstA = rd[dstIdx + 3]! / 255;
        const outA = srcA + dstA * (1 - srcA);

        if (outA > 0) {
          rd[dstIdx] = Math.round((fd[srcIdx]! * srcA + rd[dstIdx]! * dstA * (1 - srcA)) / outA);
          rd[dstIdx + 1] = Math.round((fd[srcIdx + 1]! * srcA + rd[dstIdx + 1]! * dstA * (1 - srcA)) / outA);
          rd[dstIdx + 2] = Math.round((fd[srcIdx + 2]! * srcA + rd[dstIdx + 2]! * dstA * (1 - srcA)) / outA);
          rd[dstIdx + 3] = Math.round(outA * 255);
        }
      }
    }

    return result;
  }

  /**
   * Apply border/outline to a composited layer.
   */
  applyBorder(frame: ImageData, config: BorderConfig): ImageData {
    if (!config.enabled || config.width <= 0) return frame;

    const w = frame.width;
    const h = frame.height;
    const bw = Math.ceil(config.width);
    const resultW = w + bw * 2;
    const resultH = h + bw * 2;
    const result = new ImageData(resultW, resultH);
    const rd = result.data;
    const fd = frame.data;

    // Generate dilated alpha for border region
    const borderMatte = new Float32Array(resultW * resultH);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcA = fd[(y * w + x) * 4 + 3]! / 255;
        if (srcA > 0.5) {
          // Stamp a filled circle of radius bw around this pixel
          for (let dy = -bw; dy <= bw; dy++) {
            for (let dx = -bw; dx <= bw; dx++) {
              if (dx * dx + dy * dy <= bw * bw) {
                const bx = x + bw + dx;
                const by = y + bw + dy;
                if (bx >= 0 && bx < resultW && by >= 0 && by < resultH) {
                  borderMatte[by * resultW + bx] = Math.max(
                    borderMatte[by * resultW + bx]!,
                    srcA,
                  );
                }
              }
            }
          }
        }
      }
    }

    // Draw border
    for (let i = 0; i < resultW * resultH; i++) {
      const idx = i * 4;
      const borderA = borderMatte[i]!;
      rd[idx] = Math.round(config.color[0] * 255);
      rd[idx + 1] = Math.round(config.color[1] * 255);
      rd[idx + 2] = Math.round(config.color[2] * 255);
      rd[idx + 3] = Math.round(borderA * config.color[3] * 255);
    }

    // Composite original on top (centered)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcIdx = (y * w + x) * 4;
        const dstIdx = ((y + bw) * resultW + (x + bw)) * 4;

        const srcA = fd[srcIdx + 3]! / 255;
        if (srcA <= 0) continue;

        rd[dstIdx] = fd[srcIdx]!;
        rd[dstIdx + 1] = fd[srcIdx + 1]!;
        rd[dstIdx + 2] = fd[srcIdx + 2]!;
        rd[dstIdx + 3] = Math.round(srcA * 255);
      }
    }

    return result;
  }

  /**
   * Generate a reflection effect below a composited layer.
   */
  applyReflection(frame: ImageData, config: ReflectionConfig): ImageData {
    if (!config.enabled || config.opacity <= 0) return frame;

    const w = frame.width;
    const h = frame.height;
    const reflectionH = Math.ceil(h * config.scale);
    const gap = Math.ceil(config.distance);
    const totalH = h + gap + reflectionH;

    const result = new ImageData(w, totalH);
    const rd = result.data;
    const fd = frame.data;

    // Copy original
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcIdx = (y * w + x) * 4;
        const dstIdx = (y * w + x) * 4;
        rd[dstIdx] = fd[srcIdx]!;
        rd[dstIdx + 1] = fd[srcIdx + 1]!;
        rd[dstIdx + 2] = fd[srcIdx + 2]!;
        rd[dstIdx + 3] = fd[srcIdx + 3]!;
      }
    }

    // Generate flipped reflection
    for (let ry = 0; ry < reflectionH; ry++) {
      const srcY = Math.min(h - 1, Math.floor((ry / reflectionH) * h));
      const mirrorY = h - 1 - srcY;
      const dstY = h + gap + ry;
      const fadeAlpha = config.opacity * (1 - ry / Math.max(config.fadeHeight, 1));

      if (fadeAlpha <= 0) continue;

      for (let x = 0; x < w; x++) {
        const srcIdx = (mirrorY * w + x) * 4;
        const dstIdx = (dstY * w + x) * 4;

        rd[dstIdx] = fd[srcIdx]!;
        rd[dstIdx + 1] = fd[srcIdx + 1]!;
        rd[dstIdx + 2] = fd[srcIdx + 2]!;
        rd[dstIdx + 3] = Math.round((fd[srcIdx + 3]! / 255) * clamp01(fadeAlpha) * 255);
      }
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  GPU-Accelerated Compositing
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GPU-accelerated frame compositing using WebGPU compute shaders.
   * Falls back to CPU if GPU is unavailable.
   *
   * @param layers  Ordered composite layers
   * @param width   Output width
   * @param height  Output height
   * @param shaderSources  Compiled WGSL shader source strings
   */
  async compositeFrameGPU(
    layers: CompositeLayer[],
    width: number,
    height: number,
    shaderSources: {
      blend: string;
      alphaComposite: string;
      chromaKey: string;
      transform: string;
    },
  ): Promise<ImageData> {
    if (!this.gpuState || !this._gpuAvailable) {
      // Fallback to CPU compositing
      return this.compositeFrame(layers, width, height);
    }

    const { device } = this.gpuState;

    try {
      // Lazily compile pipelines
      if (!this.gpuState.blendPipeline) {
        this.gpuState.blendPipeline = this.compileComputePipeline(
          device, 'compositing-blend', shaderSources.blend,
        );
      }
      if (!this.gpuState.alphaCompositePipeline) {
        this.gpuState.alphaCompositePipeline = this.compileComputePipeline(
          device, 'compositing-alpha', shaderSources.alphaComposite,
        );
      }

      // Create textures for output accumulator
      const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
      const accumulatorTexture = this.getOrCreateTexture(device, `acc-${width}x${height}`, width, height);
      const layerTexture = this.getOrCreateTexture(device, `layer-${width}x${height}`, width, height);
      const resultTexture = this.getOrCreateTexture(device, `result-${width}x${height}`, width, height);

      // Clear accumulator to transparent black
      const clearData = new Uint8Array(bytesPerRow * height);
      device.queue.writeTexture(
        { texture: accumulatorTexture },
        clearData,
        { bytesPerRow, rowsPerImage: height },
        { width, height },
      );

      // Composite each layer via GPU
      for (const layer of layers) {
        // Upload layer frame to GPU
        device.queue.writeTexture(
          { texture: layerTexture },
          layer.frame.data.buffer,
          { bytesPerRow: width * 4, rowsPerImage: height },
          { width: Math.min(layer.frame.width, width), height: Math.min(layer.frame.height, height) },
        );

        // Pack uniforms: blend mode index, opacity, transform matrix
        const uniformBuf = new ArrayBuffer(64);
        const f32 = new Float32Array(uniformBuf);
        const u32 = new Uint32Array(uniformBuf);

        u32[0] = BLEND_MODE_INDEX[layer.blendMode] ?? 0;
        f32[1] = layer.opacity;
        // Transform matrix (2x3 affine packed into 8 floats)
        const cosR = Math.cos(layer.transform.rotation * Math.PI / 180);
        const sinR = Math.sin(layer.transform.rotation * Math.PI / 180);
        f32[2] = cosR * layer.transform.scaleX;  // m00
        f32[3] = -sinR * layer.transform.scaleY; // m01
        f32[4] = layer.transform.translateX;       // m02
        f32[5] = sinR * layer.transform.scaleX;   // m10
        f32[6] = cosR * layer.transform.scaleY;   // m11
        f32[7] = layer.transform.translateY;       // m12
        f32[8] = layer.transform.anchorX;
        f32[9] = layer.transform.anchorY;
        u32[10] = layer.hasAlpha ? 1 : 0;
        f32[11] = width;
        f32[12] = height;

        device.queue.writeBuffer(this.gpuState.uniformBuffer!, 0, uniformBuf);

        // Create bind group layout for two-texture compositing
        const bgl = device.createBindGroupLayout({
          label: 'composite-bgl',
          entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'read-only', format: 'rgba8unorm' } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'read-only', format: 'rgba8unorm' } },
            { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba8unorm' } },
            { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          ],
        });

        const bindGroup = device.createBindGroup({
          layout: bgl,
          entries: [
            { binding: 0, resource: accumulatorTexture.createView() },
            { binding: 1, resource: layerTexture.createView() },
            { binding: 2, resource: resultTexture.createView() },
            { binding: 3, resource: { buffer: this.gpuState.uniformBuffer!, size: 64 } },
          ],
        });

        // Dispatch
        const encoder = device.createCommandEncoder({ label: 'composite-dispatch' });
        const pass = encoder.beginComputePass({ label: 'composite-pass' });

        // Use blend pipeline for compositing
        const pipeline = this.gpuState.blendPipeline!;
        // Recreate pipeline with the bind group layout if needed
        const compositePipeline = device.createComputePipeline({
          label: 'composite-pipeline',
          layout: device.createPipelineLayout({
            bindGroupLayouts: [bgl],
          }),
          compute: {
            module: device.createShaderModule({
              label: 'composite-shader',
              code: shaderSources.blend,
            }),
            entryPoint: 'main',
          },
        });

        pass.setPipeline(compositePipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(
          Math.ceil(width / 16),
          Math.ceil(height / 16),
        );
        pass.end();

        // Copy result back to accumulator
        (encoder as any).copyTextureToTexture(
          { texture: resultTexture },
          { texture: accumulatorTexture },
          { width, height },
        );

        device.queue.submit([encoder.finish()]);
      }

      // Read back final result
      return await this.readbackTexture(device, accumulatorTexture, width, height);
    } catch (err) {
      console.error('[CompositingEngine] GPU compositing failed, falling back to CPU:', err);
      return this.compositeFrame(layers, width, height);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Internal Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Erode (positive choke) or dilate (negative choke) a float matte.
   * Simple min/max morphological operation.
   */
  private chokeMatte(matte: Float32Array, w: number, h: number, amount: number): void {
    const radius = Math.ceil(Math.abs(amount) * 10);
    if (radius <= 0) return;

    const isErode = amount > 0;
    const temp = new Float32Array(matte);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let val = isErode ? 1 : 0;

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (dx * dx + dy * dy > radius * radius) continue;
            const sx = Math.min(w - 1, Math.max(0, x + dx));
            const sy = Math.min(h - 1, Math.max(0, y + dy));

            if (isErode) {
              val = Math.min(val, temp[sy * w + sx]!);
            } else {
              val = Math.max(val, temp[sy * w + sx]!);
            }
          }
        }

        matte[y * w + x] = val;
      }
    }
  }

  /**
   * Gaussian blur a float matte (separable, horizontal then vertical).
   */
  private softenMatte(matte: Float32Array, w: number, h: number, radius: number): void {
    if (radius <= 0) return;

    const sigma = radius / 3;
    const kernelSize = radius * 2 + 1;
    const kernel = new Float32Array(kernelSize);
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      const val = Math.exp(-(k * k) / (2 * sigma * sigma));
      kernel[k + radius] = val;
      sum += val;
    }
    for (let k = 0; k < kernelSize; k++) kernel[k]! /= sum;

    // Horizontal pass
    const temp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let k = -radius; k <= radius; k++) {
          const sx = Math.min(w - 1, Math.max(0, x + k));
          acc += matte[y * w + sx]! * kernel[k + radius]!;
        }
        temp[y * w + x] = acc;
      }
    }

    // Vertical pass
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let k = -radius; k <= radius; k++) {
          const sy = Math.min(h - 1, Math.max(0, y + k));
          acc += temp[sy * w + x]! * kernel[k + radius]!;
        }
        matte[y * w + x] = acc;
      }
    }
  }

  /**
   * Spill suppression with configurable method.
   */
  private suppressSpill(
    r: number, g: number, b: number,
    spillAmount: number,
    strength: number,
    method: 'average' | 'desaturate' | 'complementary',
    channel: 'green' | 'blue',
  ): [number, number, number] {
    const suppression = spillAmount * strength;

    switch (method) {
      case 'average': {
        // Replace spill with average of other channels
        if (channel === 'green') {
          const avg = (r + b) / 2;
          return [r, clamp01(g - suppression + suppression * (avg / Math.max(g, 0.001))), b];
        }
        const avg = (r + g) / 2;
        return [r, g, clamp01(b - suppression + suppression * (avg / Math.max(b, 0.001)))];
      }
      case 'desaturate': {
        // Desaturate the spill channel
        const lum = luminance(r, g, b);
        if (channel === 'green') {
          return [r, clamp01(g - suppression * (g - lum)), b];
        }
        return [r, g, clamp01(b - suppression * (b - lum))];
      }
      case 'complementary': {
        // Push toward the complementary color
        if (channel === 'green') {
          return [
            clamp01(r + suppression * 0.3),
            clamp01(g - suppression),
            clamp01(b + suppression * 0.3),
          ];
        }
        return [
          clamp01(r + suppression * 0.2),
          clamp01(g + suppression * 0.2),
          clamp01(b - suppression),
        ];
      }
      default:
        return [r, g, b];
    }
  }

  /**
   * Resolve a CompositeMode (from the editor store) to a BlendMode enum value.
   */
  private resolveBlendMode(mode: BlendMode | CompositeMode | string): BlendMode {
    // Direct match
    if (Object.values(BlendMode).includes(mode as BlendMode)) {
      return mode as BlendMode;
    }

    // Map CompositeMode strings to BlendMode
    const compositeModeMap: Record<string, BlendMode> = {
      'source-over': BlendMode.Normal,
      'multiply': BlendMode.Multiply,
      'screen': BlendMode.Screen,
      'overlay': BlendMode.Overlay,
      'darken': BlendMode.Darken,
      'lighten': BlendMode.Lighten,
      'color-dodge': BlendMode.ColorDodge,
      'color-burn': BlendMode.ColorBurn,
      'hard-light': BlendMode.HardLight,
      'soft-light': BlendMode.SoftLight,
      'difference': BlendMode.Difference,
      'exclusion': BlendMode.Exclusion,
      'hue': BlendMode.Hue,
      'saturation': BlendMode.Saturation,
      'color': BlendMode.Color,
      'luminosity': BlendMode.Luminosity,
    };

    return compositeModeMap[mode] ?? BlendMode.Normal;
  }

  /**
   * Simple hash function for dissolve randomness (deterministic per position).
   */
  private hashFloat(seed: number): number {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  /**
   * Compile a WGSL compute shader into a GPUComputePipeline.
   */
  private compileComputePipeline(
    device: GPUDevice,
    label: string,
    source: string,
  ): GPUComputePipeline {
    const shaderModule = device.createShaderModule({
      label: `${label}-module`,
      code: source,
    });

    return device.createComputePipeline({
      label: `${label}-pipeline`,
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });
  }

  /**
   * Get or create a GPU texture from the pool.
   */
  private getOrCreateTexture(
    device: GPUDevice,
    key: string,
    width: number,
    height: number,
  ): GPUTexture {
    const existing = this.gpuState?.texturePool.get(key);
    if (existing && existing.width === width && existing.height === height) {
      return existing;
    }

    existing?.destroy();

    const texture = device.createTexture({
      label: key,
      size: { width, height },
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.TEXTURE_BINDING,
    });

    this.gpuState?.texturePool.set(key, texture);
    return texture;
  }

  /**
   * Read back a GPU texture to CPU ImageData.
   */
  private async readbackTexture(
    device: GPUDevice,
    texture: GPUTexture,
    width: number,
    height: number,
  ): Promise<ImageData> {
    const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
    const bufferSize = bytesPerRow * height;

    const readbackBuffer = device.createBuffer({
      label: 'compositing-readback',
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const encoder = device.createCommandEncoder({ label: 'compositing-readback-copy' });
    encoder.copyTextureToBuffer(
      { texture },
      { buffer: readbackBuffer, bytesPerRow, rowsPerImage: height },
      { width, height },
    );
    device.queue.submit([encoder.finish()]);

    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const mapped = readbackBuffer.getMappedRange();

    const result = new ImageData(width, height);
    const src = new Uint8Array(mapped);
    const dst = result.data;

    if (bytesPerRow === width * 4) {
      dst.set(new Uint8Array(mapped, 0, width * height * 4));
    } else {
      for (let row = 0; row < height; row++) {
        const srcOffset = row * bytesPerRow;
        const dstOffset = row * width * 4;
        dst.set(src.subarray(srcOffset, srcOffset + width * 4), dstOffset);
      }
    }

    readbackBuffer.unmap();
    readbackBuffer.destroy();
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Cleanup
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Release all GPU resources.
   */
  cleanup(): void {
    if (this.gpuState) {
      for (const [, texture] of this.gpuState.texturePool) {
        texture.destroy();
      }
      this.gpuState.texturePool.clear();
      this.gpuState.uniformBuffer?.destroy();
      this.gpuState.device.destroy();
      this.gpuState = null;
    }

    this._gpuAvailable = false;
    this.offscreenCanvas = null;
    this.offscreenCtx = null;
    this.glCanvas = null;
    this.glCtx = null;
  }
}

// ─── Singleton Export ───────────────────────────────────────────────────────

export const compositingEngine = new CompositingEngineClass();
