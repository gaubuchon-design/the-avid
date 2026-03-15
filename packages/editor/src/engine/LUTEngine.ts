// =============================================================================
//  THE AVID -- 3D LUT Engine
// =============================================================================
// Parses .cube files (Resolve/Adobe standard 3D LUT format), stores LUT data
// as Float32Array, and provides trilinear-interpolated LUT application.
// Manages a library of loaded LUTs for use across the color pipeline.

// ─── Types ──────────────────────────────────────────────────────────────────

/** A parsed 3D Look-Up Table. */
export interface LUT3D {
  /** Unique identifier for this LUT. */
  id: string;
  /** Display name (derived from TITLE or filename). */
  name: string;
  /** Cube dimension (e.g. 17, 33, 65). */
  size: number;
  /**
   * Flattened RGB data: size^3 * 3 float values in [0, 1].
   * Indexed as: data[(b * size * size + g * size + r) * 3 + channel]
   * where channel: 0 = R, 1 = G, 2 = B.
   */
  data: Float32Array;
}

/** An RGB triplet in [0, 1] range. */
export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

/** Callback type for LUT engine state changes. */
export type LUTSubscriber = () => void;

// ─── Helpers ────────────────────────────────────────────────────────────────

let lutIdCounter = 0;
function genLutId(): string {
  return `lut_${++lutIdCounter}_${Date.now().toString(36)}`;
}

/**
 * Clamp a number to [min, max].
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation between two values.
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// =============================================================================
//  .cube File Parser
// =============================================================================

/**
 * Parse a .cube file string into a LUT3D object.
 *
 * Supports the standard .cube format used by DaVinci Resolve, Adobe, and
 * other professional color grading tools:
 *   - TITLE keyword for LUT name
 *   - LUT_3D_SIZE for cube dimension
 *   - DOMAIN_MIN / DOMAIN_MAX for input range remapping
 *   - Comment lines beginning with #
 *   - Whitespace-separated R G B triplets
 *
 * @param contents  The raw text content of the .cube file.
 * @param fallbackName  Name to use if no TITLE is found.
 * @returns The parsed LUT3D, or null if parsing fails.
 */
function parseCubeFile(contents: string, fallbackName: string): LUT3D | null {
  const lines = contents.split(/\r?\n/);

  let title = fallbackName;
  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const rawEntries: number[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (line.length === 0 || line.startsWith('#')) continue;

    // Parse keywords
    if (line.startsWith('TITLE')) {
      // TITLE "My LUT" or TITLE My LUT
      const match = line.match(/^TITLE\s+"?(.+?)"?\s*$/);
      if (match) {
        title = match[1]!;
      }
      continue;
    }

    if (line.startsWith('LUT_3D_SIZE')) {
      const match = line.match(/^LUT_3D_SIZE\s+(\d+)/);
      if (match) {
        size = parseInt(match[1]!, 10);
      }
      continue;
    }

    if (line.startsWith('LUT_1D_SIZE')) {
      // 1D LUTs are not supported in this engine
      console.warn('[LUTEngine] 1D LUTs are not supported; only 3D LUTs are handled');
      return null;
    }

    if (line.startsWith('DOMAIN_MIN')) {
      const parts = line.replace('DOMAIN_MIN', '').trim().split(/\s+/);
      if (parts.length >= 3) {
        domainMin = [parseFloat(parts[0]!), parseFloat(parts[1]!), parseFloat(parts[2]!)];
      }
      continue;
    }

    if (line.startsWith('DOMAIN_MAX')) {
      const parts = line.replace('DOMAIN_MAX', '').trim().split(/\s+/);
      if (parts.length >= 3) {
        domainMax = [parseFloat(parts[0]!), parseFloat(parts[1]!), parseFloat(parts[2]!)];
      }
      continue;
    }

    // Skip other known keywords
    if (/^[A-Z_]+\s/.test(line)) continue;

    // Parse data line: three space-separated floats
    const parts = line.split(/\s+/);
    if (parts.length >= 3) {
      const r = parseFloat(parts[0]!);
      const g = parseFloat(parts[1]!);
      const b = parseFloat(parts[2]!);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        rawEntries.push(r, g, b);
      }
    }
  }

  if (size === 0) {
    console.error('[LUTEngine] No LUT_3D_SIZE found in .cube file');
    return null;
  }

  const expectedEntries = size * size * size * 3;
  if (rawEntries.length !== expectedEntries) {
    console.error(
      `[LUTEngine] Expected ${expectedEntries} values (${size}^3 * 3) but found ${rawEntries.length}`,
    );
    return null;
  }

  // Remap from [domainMin, domainMax] to [0, 1] if needed
  const data = new Float32Array(expectedEntries);
  const needsRemap =
    domainMin[0] !== 0 || domainMin[1] !== 0 || domainMin[2] !== 0 ||
    domainMax[0] !== 1 || domainMax[1] !== 1 || domainMax[2] !== 1;

  if (needsRemap) {
    for (let i = 0; i < rawEntries.length; i += 3) {
      const rangeR = domainMax[0] - domainMin[0];
      const rangeG = domainMax[1] - domainMin[1];
      const rangeB = domainMax[2] - domainMin[2];
      data[i]     = rangeR! !== 0 ? (rawEntries[i]!     - domainMin[0]) / rangeR : rawEntries[i]!;
      data[i + 1] = rangeG! !== 0 ? (rawEntries[i + 1]! - domainMin[1]) / rangeG : rawEntries[i + 1]!;
      data[i + 2] = rangeB! !== 0 ? (rawEntries[i + 2]! - domainMin[2]) / rangeB : rawEntries[i + 2]!;
    }
  } else {
    data.set(rawEntries);
  }

  return {
    id: genLutId(),
    name: title,
    size,
    data,
  };
}

// =============================================================================
//  Trilinear Interpolation
// =============================================================================

/**
 * Apply a 3D LUT to an input RGB color using trilinear interpolation.
 *
 * The input color is mapped into the LUT cube, and the eight surrounding
 * lattice points are trilinearly interpolated to produce a smooth output.
 *
 * @param input  Input RGB color with components in [0, 1].
 * @param lut    The 3D LUT to apply.
 * @returns      Output RGB color with components in [0, 1].
 */
export function applyLUT(input: RGBColor, lut: LUT3D): RGBColor {
  const { size, data } = lut;
  const maxIdx = size - 1;

  // Scale input to LUT grid coordinates
  const rScaled = clamp(input.r, 0, 1) * maxIdx;
  const gScaled = clamp(input.g, 0, 1) * maxIdx;
  const bScaled = clamp(input.b, 0, 1) * maxIdx;

  // Integer lattice indices (lower corner of the interpolation cube)
  const r0 = Math.floor(rScaled);
  const g0 = Math.floor(gScaled);
  const b0 = Math.floor(bScaled);

  // Upper corner indices (clamped to valid range)
  const r1 = Math.min(r0 + 1, maxIdx);
  const g1 = Math.min(g0 + 1, maxIdx);
  const b1 = Math.min(b0 + 1, maxIdx);

  // Fractional offsets for interpolation
  const dr = rScaled - r0;
  const dg = gScaled - g0;
  const db = bScaled - b0;

  // Helper to look up a lattice point value
  // .cube files store data in R-fastest order: for (B) for (G) for (R) { R G B }
  const lookup = (ri: number, gi: number, bi: number, ch: number): number => {
    return data[(bi * size * size + gi * size + ri) * 3 + ch]!;
  };

  // Trilinear interpolation for each output channel
  const result: RGBColor = { r: 0, g: 0, b: 0 };
  const channels: Array<keyof RGBColor> = ['r', 'g', 'b'];

  for (let ch = 0; ch < 3; ch++) {
    // Interpolate along R axis at 4 edge pairs
    const c00 = lerp(lookup(r0, g0, b0, ch), lookup(r1, g0, b0, ch), dr);
    const c01 = lerp(lookup(r0, g0, b1, ch), lookup(r1, g0, b1, ch), dr);
    const c10 = lerp(lookup(r0, g1, b0, ch), lookup(r1, g1, b0, ch), dr);
    const c11 = lerp(lookup(r0, g1, b1, ch), lookup(r1, g1, b1, ch), dr);

    // Interpolate along G axis
    const c0 = lerp(c00, c10, dg);
    const c1 = lerp(c01, c11, dg);

    // Interpolate along B axis
    result[channels[ch]!] = lerp(c0, c1, db);
  }

  return result;
}

/**
 * Apply a 3D LUT to an entire ImageData buffer in-place.
 *
 * Processes every pixel through trilinear interpolation. For large frames,
 * consider using the GPU-accelerated path via ColorTransformPipeline instead.
 *
 * @param imageData  The ImageData to process (modified in place).
 * @param lut        The 3D LUT to apply.
 */
export function applyLUTToImageData(imageData: ImageData, lut: LUT3D): void {
  const { data } = imageData;
  const { size, data: lutData } = lut;
  const maxIdx = size - 1;
  const pixelCount = data.length / 4;

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;

    // Normalise from 0-255 to 0-1
    const rIn = data[offset]! / 255;
    const gIn = data[offset + 1]! / 255;
    const bIn = data[offset + 2]! / 255;

    // Scale to LUT grid
    const rScaled = clamp(rIn, 0, 1) * maxIdx;
    const gScaled = clamp(gIn, 0, 1) * maxIdx;
    const bScaled = clamp(bIn, 0, 1) * maxIdx;

    const r0 = Math.floor(rScaled);
    const g0 = Math.floor(gScaled);
    const b0 = Math.floor(bScaled);
    const r1 = Math.min(r0 + 1, maxIdx);
    const g1 = Math.min(g0 + 1, maxIdx);
    const b1 = Math.min(b0 + 1, maxIdx);

    const dr = rScaled - r0;
    const dg = gScaled - g0;
    const db = bScaled - b0;

    // Pre-compute base indices for the 8 corners
    const idx000 = (b0 * size * size + g0 * size + r0) * 3;
    const idx100 = (b0 * size * size + g0 * size + r1) * 3;
    const idx010 = (b0 * size * size + g1 * size + r0) * 3;
    const idx110 = (b0 * size * size + g1 * size + r1) * 3;
    const idx001 = (b1 * size * size + g0 * size + r0) * 3;
    const idx101 = (b1 * size * size + g0 * size + r1) * 3;
    const idx011 = (b1 * size * size + g1 * size + r0) * 3;
    const idx111 = (b1 * size * size + g1 * size + r1) * 3;

    // Trilinear interpolation for each channel
    for (let ch = 0; ch < 3; ch++) {
      const c00 = lerp(lutData[idx000 + ch]!, lutData[idx100 + ch]!, dr);
      const c01 = lerp(lutData[idx001 + ch]!, lutData[idx101 + ch]!, dr);
      const c10 = lerp(lutData[idx010 + ch]!, lutData[idx110 + ch]!, dr);
      const c11 = lerp(lutData[idx011 + ch]!, lutData[idx111 + ch]!, dr);

      const c0 = lerp(c00, c10, dg);
      const c1 = lerp(c01, c11, dg);

      data[offset + ch] = clamp(Math.round(lerp(c0, c1, db) * 255), 0, 255);
    }
    // Alpha is preserved (not modified)
  }
}

// =============================================================================
//  LUT Engine
// =============================================================================

/**
 * 3D LUT management engine.
 *
 * Provides .cube file parsing, a library of loaded LUTs, and methods to
 * apply LUTs to individual colors or full ImageData frames. Follows the
 * singleton pattern used by other engines in the project.
 */
export class LUTEngine {
  /** Loaded LUT library keyed by LUT ID. */
  private library: Map<string, LUT3D> = new Map();
  /** Currently active LUT ID (if any). */
  private activeLutId: string | null = null;
  /** Subscriber callbacks. */
  private subscribers = new Set<LUTSubscriber>();

  // ── Loading ───────────────────────────────────────────────────────────

  /**
   * Load a .cube file from a File object.
   *
   * Reads the file as text, parses the .cube format, and adds the
   * resulting LUT3D to the library.
   *
   * @param file  A File object pointing to a .cube file.
   * @returns     The parsed LUT3D object.
   * @throws      If the file cannot be read or parsed.
   *
   * @example
   * const lut = await lutEngine.loadCubeFile(fileInput.files[0]);
   * console.log(`Loaded LUT: ${lut.name} (${lut.size}^3)`);
   */
  async loadCubeFile(file: File): Promise<LUT3D> {
    const contents = await file.text();
    const name = file.name.replace(/\.cube$/i, '');
    const lut = parseCubeFile(contents, name);

    if (!lut) {
      throw new Error(`[LUTEngine] Failed to parse .cube file: ${file.name}`);
    }

    this.library.set(lut.id, lut);
    this.notify();
    return lut;
  }

  /**
   * Load a .cube file from a raw string.
   *
   * Useful for loading embedded LUTs or LUTs fetched from a URL.
   *
   * @param contents  The raw .cube file text.
   * @param name      Fallback name if no TITLE is found.
   * @returns         The parsed LUT3D object.
   * @throws          If the content cannot be parsed.
   */
  loadCubeString(contents: string, name = 'Untitled LUT'): LUT3D {
    const lut = parseCubeFile(contents, name);

    if (!lut) {
      throw new Error('[LUTEngine] Failed to parse .cube string');
    }

    this.library.set(lut.id, lut);
    this.notify();
    return lut;
  }

  // ── Library Management ────────────────────────────────────────────────

  /**
   * Get a LUT by its ID.
   *
   * @param id  The LUT ID.
   * @returns   The LUT3D, or undefined if not found.
   */
  getLut(id: string): LUT3D | undefined {
    return this.library.get(id);
  }

  /**
   * Get all loaded LUTs.
   *
   * @returns  Array of all LUT3D objects in the library.
   */
  getAllLuts(): LUT3D[] {
    return Array.from(this.library.values());
  }

  /**
   * Remove a LUT from the library.
   *
   * If the removed LUT was the active LUT, the active LUT is cleared.
   *
   * @param id  The LUT ID to remove.
   */
  removeLut(id: string): void {
    this.library.delete(id);
    if (this.activeLutId === id) {
      this.activeLutId = null;
    }
    this.notify();
  }

  /**
   * Clear all LUTs from the library.
   */
  clearLibrary(): void {
    this.library.clear();
    this.activeLutId = null;
    this.notify();
  }

  // ── Active LUT ────────────────────────────────────────────────────────

  /**
   * Set the currently active LUT.
   *
   * @param id  The LUT ID to activate, or null to deactivate.
   */
  setActiveLut(id: string | null): void {
    if (id !== null && !this.library.has(id)) {
      console.warn(`[LUTEngine] LUT '${id}' not found in library`);
      return;
    }
    this.activeLutId = id;
    this.notify();
  }

  /**
   * Get the currently active LUT.
   *
   * @returns  The active LUT3D, or null if none is active.
   */
  getActiveLut(): LUT3D | null {
    if (!this.activeLutId) return null;
    return this.library.get(this.activeLutId) ?? null;
  }

  /**
   * Get the currently active LUT ID.
   *
   * @returns  The active LUT ID, or null.
   */
  getActiveLutId(): string | null {
    return this.activeLutId;
  }

  // ── Application ───────────────────────────────────────────────────────

  /**
   * Apply a specific LUT to an RGB color value.
   *
   * @param input  Input RGB with components in [0, 1].
   * @param lutId  The LUT ID to apply. If omitted, uses the active LUT.
   * @returns      The transformed RGB color, or the input if no LUT is found.
   */
  applyToColor(input: RGBColor, lutId?: string): RGBColor {
    const id = lutId ?? this.activeLutId;
    if (!id) return input;
    const lut = this.library.get(id);
    if (!lut) return input;
    return applyLUT(input, lut);
  }

  /**
   * Apply a specific LUT to an ImageData buffer in-place.
   *
   * @param imageData  The ImageData to process (modified in place).
   * @param lutId      The LUT ID to apply. If omitted, uses the active LUT.
   * @returns          true if the LUT was applied, false if no LUT was found.
   */
  applyToImageData(imageData: ImageData, lutId?: string): boolean {
    const id = lutId ?? this.activeLutId;
    if (!id) return false;
    const lut = this.library.get(id);
    if (!lut) return false;
    applyLUTToImageData(imageData, lut);
    return true;
  }

  // ── Identity LUT Generation ───────────────────────────────────────────

  /**
   * Generate an identity LUT of the given size.
   *
   * An identity LUT maps every color to itself. Useful as a starting
   * point for LUT baking or as a neutral reference.
   *
   * @param size  Cube dimension (e.g. 17, 33, 65).
   * @param name  Display name for the identity LUT.
   * @returns     The identity LUT3D.
   */
  generateIdentityLut(size: number, name = 'Identity'): LUT3D {
    const totalEntries = size * size * size * 3;
    const data = new Float32Array(totalEntries);
    const maxIdx = size - 1;

    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          const idx = (b * size * size + g * size + r) * 3;
          data[idx]     = r / maxIdx;
          data[idx + 1] = g / maxIdx;
          data[idx + 2] = b / maxIdx;
        }
      }
    }

    const lut: LUT3D = {
      id: genLutId(),
      name,
      size,
      data,
    };

    this.library.set(lut.id, lut);
    this.notify();
    return lut;
  }

  /**
   * Export a LUT3D to .cube format string.
   *
   * Produces a standard .cube file that can be imported into DaVinci
   * Resolve, Adobe Premiere, and other grading tools.
   *
   * @param lutId  The LUT ID to export.
   * @returns      The .cube file content as a string, or null if not found.
   */
  exportToCubeString(lutId: string): string | null {
    const lut = this.library.get(lutId);
    if (!lut) return null;

    const lines: string[] = [];
    lines.push('# Created by THE AVID LUT Engine');
    lines.push(`TITLE "${lut.name}"`);
    lines.push(`LUT_3D_SIZE ${lut.size}`);
    lines.push('DOMAIN_MIN 0.0 0.0 0.0');
    lines.push('DOMAIN_MAX 1.0 1.0 1.0');
    lines.push('');

    const { size, data } = lut;
    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          const idx = (b * size * size + g * size + r) * 3;
          lines.push(
            `${data[idx]!.toFixed(6)} ${data[idx + 1]!.toFixed(6)} ${data[idx + 2]!.toFixed(6)}`,
          );
        }
      }
    }

    return lines.join('\n');
  }

  // ── Subscription ──────────────────────────────────────────────────────

  /**
   * Subscribe to LUT engine state changes.
   *
   * @param cb  Callback invoked on change.
   * @returns   An unsubscribe function.
   */
  subscribe(cb: LUTSubscriber): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  /** Notify all subscribers that state has changed. */
  private notify(): void {
    this.subscribers.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error('[LUTEngine] Subscriber error:', err);
      }
    });
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    this.library.clear();
    this.activeLutId = null;
    this.subscribers.clear();
  }
}

/** Singleton LUT engine instance. */
export const lutEngine = new LUTEngine();
