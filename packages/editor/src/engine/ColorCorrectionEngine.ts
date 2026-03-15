// =============================================================================
//  THE AVID -- Color Correction Engine (Avid Color Correction Mode)
// =============================================================================
//
// Implements Avid Media Composer's Color Correction mode:
//  - Three-way colour wheels (shadows / midtones / highlights)
//  - HSL master controls (hue, saturation, brightness)
//  - Per-channel curves (RGB, R, G, B)
//  - Levels (input black/white, gamma, output black/white)
//  - Secondary colour correction (hue/sat/lum qualifier)
//  - CSS filter generation for browser preview
//  - 3D LUT generation from corrections
//  - Copy/paste corrections between clips
//  - Auto-match colour between clips
//  - Preset save/load system
//
// =============================================================================

import { useEditorStore } from '../store/editor.store';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Three-way colour wheel values for shadows, midtones, or highlights. */
export interface ColorWheelValues {
  hue: number;          // 0-360
  saturation: number;   // 0-200 (100 = normal)
  brightness: number;   // -100 to 100
}

/** A single point on a colour curve. */
export interface CurvesPoint {
  input: number;        // 0-255
  output: number;       // 0-255
}

/** Full colour correction state for a single clip. */
export interface ColorCorrectionState {
  enabled: boolean;
  // HSL controls
  masterHue: number;
  masterSaturation: number;
  masterBrightness: number;
  // Three-way color wheels
  shadows: ColorWheelValues;
  midtones: ColorWheelValues;
  highlights: ColorWheelValues;
  // Curves
  rgbCurve: CurvesPoint[];
  redCurve: CurvesPoint[];
  greenCurve: CurvesPoint[];
  blueCurve: CurvesPoint[];
  // Levels
  inputBlack: number;
  inputWhite: number;
  gamma: number;
  outputBlack: number;
  outputWhite: number;
  // Secondary correction
  secondaryEnabled: boolean;
  secondaryHueRange: [number, number];
  secondarySatRange: [number, number];
  secondaryLumRange: [number, number];
}

/** A saved colour correction preset. */
export interface ColorCorrectionPreset {
  id: string;
  name: string;
  state: ColorCorrectionState;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

/** Default (identity) colour wheel -- no shift. */
function defaultColorWheel(): ColorWheelValues {
  return {
    hue: 0,
    saturation: 100,
    brightness: 0,
  };
}

/** Default (identity) curve -- straight diagonal from 0 to 255. */
function defaultCurve(): CurvesPoint[] {
  return [
    { input: 0, output: 0 },
    { input: 255, output: 255 },
  ];
}

/** Default (identity) colour correction state. */
function defaultColorCorrectionState(): ColorCorrectionState {
  return {
    enabled: true,
    masterHue: 0,
    masterSaturation: 100,
    masterBrightness: 0,
    shadows: defaultColorWheel(),
    midtones: defaultColorWheel(),
    highlights: defaultColorWheel(),
    rgbCurve: defaultCurve(),
    redCurve: defaultCurve(),
    greenCurve: defaultCurve(),
    blueCurve: defaultCurve(),
    inputBlack: 0,
    inputWhite: 255,
    gamma: 1.0,
    outputBlack: 0,
    outputWhite: 255,
    secondaryEnabled: false,
    secondaryHueRange: [0, 360],
    secondarySatRange: [0, 100],
    secondaryLumRange: [0, 100],
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

let presetIdCounter = 0;
function genPresetId(): string {
  return `ccpreset_${++presetIdCounter}_${Date.now().toString(36)}`;
}

/**
 * Clamp a value to a range.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Evaluate a piecewise-linear curve at a given input value.
 * Points must be sorted by input. Uses linear interpolation between points.
 */
function evaluateCurve(points: CurvesPoint[], input: number): number {
  if (points.length === 0) return input;
  if (points.length === 1) return points[0]!.output;

  // Clamp to first/last point
  if (input <= points[0]!.input) return points[0]!.output;
  if (input >= points[points.length - 1]!.input) return points[points.length - 1]!.output;

  // Find surrounding points
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    if (input >= p0!.input! && input <= p1!.input!) {
      const t = (input - p0!.input!) / (p1!.input! - p0!.input!);
      return p0!.output! + t * (p1!.output! - p0!.output!);
    }
  }

  return input;
}

// =============================================================================
//  ColorCorrectionEngine
// =============================================================================

/**
 * Avid-style Color Correction engine.
 *
 * Maintains per-clip colour corrections, provides CSS filter generation for
 * browser preview, 3D LUT generation, preset management, and auto-match.
 *
 * Colour corrections are stored per clip ID. When colour correction mode is
 * active, the engine's state drives the colour correction UI panels.
 */
export class ColorCorrectionEngine {
  /** Per-clip correction states keyed by clip ID. */
  private corrections: Map<string, ColorCorrectionState> = new Map();
  /** Saved presets. */
  private presets: ColorCorrectionPreset[] = [];
  /** Whether CC mode is currently active. */
  private active = false;
  /** General subscribers. */
  private listeners = new Set<() => void>();

  // ─── Private helpers ──────────────────────────────────────────────────

  /** Notify all subscribers that state has changed. */
  private notify(): void {
    this.listeners.forEach((fn) => {
      try { fn(); } catch (err) { console.error('[ColorCorrectionEngine] Subscriber error:', err); }
    });
  }

  /**
   * Get or create a correction state for a clip.
   * If no correction exists yet, a default (identity) state is initialised.
   */
  private getOrCreate(clipId: string): ColorCorrectionState {
    let state = this.corrections.get(clipId);
    if (!state) {
      state = defaultColorCorrectionState();
      this.corrections.set(clipId, state);
    }
    return state;
  }

  /**
   * Deep-clone a correction state.
   */
  private cloneState(state: ColorCorrectionState): ColorCorrectionState {
    return JSON.parse(JSON.stringify(state));
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Mode Control
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Enter colour correction mode.
   *
   * Switches the editor to the color correction workspace and activates
   * the CC panel UI.
   */
  enterColorMode(): void {
    if (this.active) return;
    this.active = true;
    try {
      useEditorStore.getState().setActivePanel('color');
    } catch {
      // Store may not be initialised in tests
    }
    this.notify();
  }

  /**
   * Exit colour correction mode.
   *
   * Returns the editor to the standard editing workspace.
   */
  exitColorMode(): void {
    if (!this.active) return;
    this.active = false;
    try {
      useEditorStore.getState().setActivePanel('edit');
    } catch {
      // Store may not be initialised in tests
    }
    this.notify();
  }

  /**
   * Whether colour correction mode is currently active.
   */
  isActive(): boolean {
    return this.active;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Correction Get / Set
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get the full colour correction state for a clip.
   *
   * Returns the identity state if no correction has been applied yet.
   *
   * @param clipId The clip ID.
   * @returns A copy of the ColorCorrectionState.
   */
  getCorrection(clipId: string): ColorCorrectionState {
    return this.cloneState(this.getOrCreate(clipId));
  }

  /**
   * Set (merge) colour correction state for a clip.
   *
   * Only the provided fields are merged; omitted fields retain their
   * current values.
   *
   * @param clipId The clip ID.
   * @param state  Partial correction state to merge.
   */
  setCorrection(clipId: string, state: Partial<ColorCorrectionState>): void {
    const current = this.getOrCreate(clipId);
    const merged: ColorCorrectionState = {
      ...current,
      ...state,
      // Deep-merge nested objects if provided
      shadows: state.shadows ? { ...current.shadows, ...state.shadows } : current.shadows,
      midtones: state.midtones ? { ...current.midtones, ...state.midtones } : current.midtones,
      highlights: state.highlights ? { ...current.highlights, ...state.highlights } : current.highlights,
      rgbCurve: state.rgbCurve ?? current.rgbCurve,
      redCurve: state.redCurve ?? current.redCurve,
      greenCurve: state.greenCurve ?? current.greenCurve,
      blueCurve: state.blueCurve ?? current.blueCurve,
      secondaryHueRange: state.secondaryHueRange ?? current.secondaryHueRange,
      secondarySatRange: state.secondarySatRange ?? current.secondarySatRange,
      secondaryLumRange: state.secondaryLumRange ?? current.secondaryLumRange,
    };
    this.corrections.set(clipId, merged);
    this.notify();
  }

  /**
   * Reset a clip's colour correction to the identity (no-op) state.
   *
   * @param clipId The clip ID.
   */
  resetCorrection(clipId: string): void {
    this.corrections.set(clipId, defaultColorCorrectionState());
    this.notify();
  }

  /**
   * Copy the colour correction from one clip to another.
   *
   * @param fromClipId Source clip ID.
   * @param toClipId   Destination clip ID.
   */
  copyCorrection(fromClipId: string, toClipId: string): void {
    const source = this.getOrCreate(fromClipId);
    this.corrections.set(toClipId, this.cloneState(source));
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Auto-Match
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Auto-match the colour of a target clip to a source clip.
   *
   * This is a simplified heuristic that adjusts the target's master HSL
   * and shadow/highlight wheels to approximate the source clip's grade.
   * A real implementation would use image analysis on frame data.
   *
   * @param sourceClipId The reference clip ID.
   * @param targetClipId The clip to adjust.
   */
  matchColor(sourceClipId: string, targetClipId: string): void {
    const sourceState = this.getOrCreate(sourceClipId);
    const targetState = this.getOrCreate(targetClipId);

    // Heuristic: blend target toward source values
    const blend = (src: number, _tgt: number, factor = 0.7) =>
      _tgt + (src - _tgt) * factor;

    const matched: ColorCorrectionState = {
      ...targetState,
      masterHue: blend(sourceState.masterHue, targetState.masterHue),
      masterSaturation: blend(sourceState.masterSaturation, targetState.masterSaturation),
      masterBrightness: blend(sourceState.masterBrightness, targetState.masterBrightness),
      shadows: {
        hue: blend(sourceState.shadows.hue, targetState.shadows.hue),
        saturation: blend(sourceState.shadows.saturation, targetState.shadows.saturation),
        brightness: blend(sourceState.shadows.brightness, targetState.shadows.brightness),
      },
      midtones: {
        hue: blend(sourceState.midtones.hue, targetState.midtones.hue),
        saturation: blend(sourceState.midtones.saturation, targetState.midtones.saturation),
        brightness: blend(sourceState.midtones.brightness, targetState.midtones.brightness),
      },
      highlights: {
        hue: blend(sourceState.highlights.hue, targetState.highlights.hue),
        saturation: blend(sourceState.highlights.saturation, targetState.highlights.saturation),
        brightness: blend(sourceState.highlights.brightness, targetState.highlights.brightness),
      },
      // Copy curves and levels directly from source
      rgbCurve: [...sourceState.rgbCurve.map((p) => ({ ...p }))],
      redCurve: [...sourceState.redCurve.map((p) => ({ ...p }))],
      greenCurve: [...sourceState.greenCurve.map((p) => ({ ...p }))],
      blueCurve: [...sourceState.blueCurve.map((p) => ({ ...p }))],
      inputBlack: blend(sourceState.inputBlack, targetState.inputBlack),
      inputWhite: blend(sourceState.inputWhite, targetState.inputWhite),
      gamma: blend(sourceState.gamma, targetState.gamma),
      outputBlack: blend(sourceState.outputBlack, targetState.outputBlack),
      outputWhite: blend(sourceState.outputWhite, targetState.outputWhite),
    };

    this.corrections.set(targetClipId, matched);
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Three-Way Colour Wheels
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Set shadow colour wheel values for a clip.
   *
   * @param clipId The clip ID.
   * @param values Partial shadow wheel values to merge.
   */
  setShadows(clipId: string, values: Partial<ColorWheelValues>): void {
    const state = this.getOrCreate(clipId);
    state.shadows = {
      hue: clamp(values.hue ?? state.shadows.hue, 0, 360),
      saturation: clamp(values.saturation ?? state.shadows.saturation, 0, 200),
      brightness: clamp(values.brightness ?? state.shadows.brightness, -100, 100),
    };
    this.corrections.set(clipId, state);
    this.notify();
  }

  /**
   * Set midtone colour wheel values for a clip.
   *
   * @param clipId The clip ID.
   * @param values Partial midtone wheel values to merge.
   */
  setMidtones(clipId: string, values: Partial<ColorWheelValues>): void {
    const state = this.getOrCreate(clipId);
    state.midtones = {
      hue: clamp(values.hue ?? state.midtones.hue, 0, 360),
      saturation: clamp(values.saturation ?? state.midtones.saturation, 0, 200),
      brightness: clamp(values.brightness ?? state.midtones.brightness, -100, 100),
    };
    this.corrections.set(clipId, state);
    this.notify();
  }

  /**
   * Set highlight colour wheel values for a clip.
   *
   * @param clipId The clip ID.
   * @param values Partial highlight wheel values to merge.
   */
  setHighlights(clipId: string, values: Partial<ColorWheelValues>): void {
    const state = this.getOrCreate(clipId);
    state.highlights = {
      hue: clamp(values.hue ?? state.highlights.hue, 0, 360),
      saturation: clamp(values.saturation ?? state.highlights.saturation, 0, 200),
      brightness: clamp(values.brightness ?? state.highlights.brightness, -100, 100),
    };
    this.corrections.set(clipId, state);
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Curves
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Set the curve control points for a specific channel.
   *
   * Points are automatically sorted by input value. Each point's input
   * and output values are clamped to 0-255.
   *
   * @param clipId  The clip ID.
   * @param channel Which curve channel: 'rgb', 'red', 'green', or 'blue'.
   * @param points  Array of curve control points.
   */
  setCurve(
    clipId: string,
    channel: 'rgb' | 'red' | 'green' | 'blue',
    points: CurvesPoint[],
  ): void {
    const state = this.getOrCreate(clipId);

    // Clamp and sort points
    const sanitised = points
      .map((p) => ({
        input: clamp(Math.round(p.input), 0, 255),
        output: clamp(Math.round(p.output), 0, 255),
      }))
      .sort((a, b) => a.input - b.input);

    switch (channel) {
      case 'rgb':
        state.rgbCurve = sanitised;
        break;
      case 'red':
        state.redCurve = sanitised;
        break;
      case 'green':
        state.greenCurve = sanitised;
        break;
      case 'blue':
        state.blueCurve = sanitised;
        break;
    }

    this.corrections.set(clipId, state);
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Levels
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Set levels parameters for a clip.
   *
   * @param clipId The clip ID.
   * @param levels Partial levels values to merge.
   */
  setLevels(
    clipId: string,
    levels: Partial<Pick<ColorCorrectionState, 'inputBlack' | 'inputWhite' | 'gamma' | 'outputBlack' | 'outputWhite'>>,
  ): void {
    const state = this.getOrCreate(clipId);

    if (levels.inputBlack !== undefined) {
      state.inputBlack = clamp(Math.round(levels.inputBlack), 0, 255);
    }
    if (levels.inputWhite !== undefined) {
      state.inputWhite = clamp(Math.round(levels.inputWhite), 0, 255);
    }
    if (levels.gamma !== undefined) {
      state.gamma = clamp(levels.gamma, 0.01, 10.0);
    }
    if (levels.outputBlack !== undefined) {
      state.outputBlack = clamp(Math.round(levels.outputBlack), 0, 255);
    }
    if (levels.outputWhite !== undefined) {
      state.outputWhite = clamp(Math.round(levels.outputWhite), 0, 255);
    }

    this.corrections.set(clipId, state);
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  CSS Filter Generation
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Generate a CSS filter string approximating the clip's colour correction.
   *
   * This is a simplified mapping from the full correction state to CSS
   * filter functions. It provides a reasonable preview in the browser but
   * is not a pixel-accurate representation of the full colour pipeline.
   *
   * @param clipId The clip ID.
   * @returns A CSS filter string (e.g. "brightness(1.1) saturate(1.2) hue-rotate(10deg)").
   */
  generateCSSFilter(clipId: string): string {
    const state = this.getOrCreate(clipId);
    if (!state.enabled) return 'none';

    const filters: string[] = [];

    // Master brightness: map -100..100 to CSS brightness 0..2
    const brightnessVal = 1 + (state.masterBrightness / 100);
    if (Math.abs(brightnessVal - 1) > 0.001) {
      filters.push(`brightness(${brightnessVal.toFixed(3)})`);
    }

    // Master saturation: map 0..200 to CSS saturate 0..2
    const saturateVal = state.masterSaturation / 100;
    if (Math.abs(saturateVal - 1) > 0.001) {
      filters.push(`saturate(${saturateVal.toFixed(3)})`);
    }

    // Master hue rotation
    if (Math.abs(state.masterHue) > 0.001) {
      filters.push(`hue-rotate(${state.masterHue.toFixed(1)}deg)`);
    }

    // Midtone brightness as additional brightness
    if (Math.abs(state.midtones.brightness) > 0.001) {
      const midBright = 1 + (state.midtones.brightness / 200);
      filters.push(`brightness(${midBright.toFixed(3)})`);
    }

    // Contrast from levels: rough approximation
    const inputRange = Math.max(1, state.inputWhite - state.inputBlack);
    const contrastVal = 255 / inputRange;
    if (Math.abs(contrastVal - 1) > 0.01) {
      filters.push(`contrast(${contrastVal.toFixed(3)})`);
    }

    // Gamma approximation (invert gamma as CSS brightness adjustment)
    if (Math.abs(state.gamma - 1) > 0.01) {
      const gammaAdjust = 1 / state.gamma;
      filters.push(`brightness(${gammaAdjust.toFixed(3)})`);
    }

    if (filters.length === 0) return 'none';
    return filters.join(' ');
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  3D LUT Generation
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Generate a 3D LUT (Look-Up Table) from the clip's colour corrections.
   *
   * The LUT is a flattened Float32Array of size^3 * 3 entries representing
   * RGB output values for each point in the 3D colour cube.
   *
   * @param clipId The clip ID.
   * @param size   LUT cube dimension (e.g. 17 for a 17x17x17 LUT). Default: 17.
   * @returns A Float32Array of length size^3 * 3 with normalised RGB values.
   */
  generateLUT(clipId: string, size = 17): Float32Array {
    const state = this.getOrCreate(clipId);
    const totalEntries = size * size * size * 3;
    const lut = new Float32Array(totalEntries);

    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          const idx = (b * size * size + g * size + r) * 3;

          // Normalised input (0-1)
          let rVal = r / (size - 1);
          let gVal = g / (size - 1);
          let bVal = b / (size - 1);

          // Convert to 0-255 for curve evaluation
          let r255 = rVal * 255;
          let g255 = gVal * 255;
          let b255 = bVal * 255;

          // Apply levels: input mapping
          const inRange = Math.max(1, state.inputWhite - state.inputBlack);
          r255 = clamp((r255 - state.inputBlack) / inRange * 255, 0, 255);
          g255 = clamp((g255 - state.inputBlack) / inRange * 255, 0, 255);
          b255 = clamp((b255 - state.inputBlack) / inRange * 255, 0, 255);

          // Apply gamma
          if (Math.abs(state.gamma - 1) > 0.001) {
            r255 = 255 * Math.pow(r255 / 255, 1 / state.gamma);
            g255 = 255 * Math.pow(g255 / 255, 1 / state.gamma);
            b255 = 255 * Math.pow(b255 / 255, 1 / state.gamma);
          }

          // Apply RGB curve
          r255 = evaluateCurve(state.rgbCurve, r255);
          g255 = evaluateCurve(state.rgbCurve, g255);
          b255 = evaluateCurve(state.rgbCurve, b255);

          // Apply per-channel curves
          r255 = evaluateCurve(state.redCurve, r255);
          g255 = evaluateCurve(state.greenCurve, g255);
          b255 = evaluateCurve(state.blueCurve, b255);

          // Apply master HSL adjustments
          // Brightness
          const brightMul = 1 + (state.masterBrightness / 100);
          r255 *= brightMul;
          g255 *= brightMul;
          b255 *= brightMul;

          // Saturation
          const satFactor = state.masterSaturation / 100;
          const lum = 0.2126 * r255 + 0.7152 * g255 + 0.0722 * b255;
          r255 = lum + (r255 - lum) * satFactor;
          g255 = lum + (g255 - lum) * satFactor;
          b255 = lum + (b255 - lum) * satFactor;

          // Apply levels: output mapping
          const outRange = state.outputWhite - state.outputBlack;
          r255 = state.outputBlack + (r255 / 255) * outRange;
          g255 = state.outputBlack + (g255 / 255) * outRange;
          b255 = state.outputBlack + (b255 / 255) * outRange;

          // Clamp and normalise to 0-1
          lut[idx]     = clamp(r255 / 255, 0, 1);
          lut[idx + 1] = clamp(g255 / 255, 0, 1);
          lut[idx + 2] = clamp(b255 / 255, 0, 1);
        }
      }
    }

    return lut;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Presets
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Save the current correction for a clip as a named preset.
   *
   * @param name   Display name for the preset.
   * @param clipId The clip whose correction to save.
   * @returns The created preset.
   */
  savePreset(name: string, clipId: string): ColorCorrectionPreset {
    const state = this.getOrCreate(clipId);
    const preset: ColorCorrectionPreset = {
      id: genPresetId(),
      name,
      state: this.cloneState(state),
    };
    this.presets.push(preset);
    this.notify();
    return preset;
  }

  /**
   * Load a preset's correction state onto a clip.
   *
   * @param presetId The preset ID to load.
   * @param clipId   The target clip ID.
   */
  loadPreset(presetId: string, clipId: string): void {
    const preset = this.presets.find((p) => p.id === presetId);
    if (!preset) {
      console.warn(`[ColorCorrectionEngine] Preset '${presetId}' not found`);
      return;
    }
    this.corrections.set(clipId, this.cloneState(preset.state));
    this.notify();
  }

  /**
   * Get all saved presets.
   *
   * @returns Array of ColorCorrectionPreset objects.
   */
  getPresets(): ColorCorrectionPreset[] {
    return [...this.presets];
  }

  /**
   * Delete a preset by ID.
   *
   * @param presetId The preset to remove.
   */
  deletePreset(presetId: string): void {
    this.presets = this.presets.filter((p) => p.id !== presetId);
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Subscribe
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to colour correction engine state changes.
   *
   * @param cb Callback invoked on any mutation.
   * @returns An unsubscribe function.
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Cleanup
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Remove all corrections, presets, and clear listeners.
   * Primarily useful for tests and teardown.
   */
  dispose(): void {
    this.corrections.clear();
    this.presets = [];
    this.active = false;
    this.listeners.clear();
  }
}

/** Singleton color correction engine instance. */
export const colorCorrectionEngine = new ColorCorrectionEngine();
