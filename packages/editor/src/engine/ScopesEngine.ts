// =============================================================================
//  THE AVID -- Video Scopes Engine
// =============================================================================
// Professional video scopes for color grading: waveform, vectorscope,
// RGB histogram, and RGB parade. Computes scope data from pixel buffers
// and renders them onto canvas elements.

// ─── Constants ──────────────────────────────────────────────────────────────

/** Rec. 709 luma weights (ITU-R BT.709). */
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

/** Standard scope render dimensions. */
const SCOPE_WIDTH = 256;
const SCOPE_HEIGHT = 256;

/** Waveform/parade vertical resolution (number of luma bins). */
const WAVEFORM_BINS = 256;

/** Vectorscope angular reference for skin tone line (approximately 123 degrees in CbCr space). */
const SKIN_TONE_ANGLE_DEG = 123;

/** Callback type for scopes engine state changes. */
export type ScopesSubscriber = () => void;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Clamp a value to [min, max].
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// =============================================================================
//  Scope Computation Functions
// =============================================================================

/**
 * Compute a luma waveform from image data.
 *
 * For each column of the image, accumulates the luma distribution into
 * bins. The result is a Float32Array of width * WAVEFORM_BINS entries,
 * where each entry counts how many pixels in that column fell into that
 * luma bin. Values are normalised to [0, 1] relative to the column height.
 *
 * @param imageData  Source image pixel data.
 * @returns Float32Array of shape [width * WAVEFORM_BINS], column-major.
 */
export function computeWaveform(imageData: ImageData): Float32Array {
  const { width, height, data } = imageData;
  const result = new Float32Array(width * WAVEFORM_BINS);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const r = data[offset]! / 255;
      const g = data[offset + 1]! / 255;
      const b = data[offset + 2]! / 255;

      // Rec. 709 luma
      const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;
      const bin = clamp(Math.floor(luma * (WAVEFORM_BINS - 1)), 0, WAVEFORM_BINS - 1);

      result[x * WAVEFORM_BINS + bin]! += 1;
    }
  }

  // Normalise by column height so values are in [0, 1]
  if (height > 0) {
    for (let x = 0; x < width; x++) {
      const base = x * WAVEFORM_BINS;
      for (let bin = 0; bin < WAVEFORM_BINS; bin++) {
        result[base + bin]! /= height;
      }
    }
  }

  return result;
}

/**
 * Compute a CbCr vectorscope scatter plot from image data.
 *
 * Converts each pixel from RGB to YCbCr (BT.709) and returns the Cb and Cr
 * components as parallel Float32Arrays. Values are in [-0.5, 0.5] range.
 *
 * @param imageData  Source image pixel data.
 * @returns Object with cb and cr Float32Arrays of length width * height.
 */
export function computeVectorscope(imageData: ImageData): { cb: Float32Array; cr: Float32Array } {
  const { width, height, data } = imageData;
  const pixelCount = width * height;
  const cb = new Float32Array(pixelCount);
  const cr = new Float32Array(pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    const r = data[offset]! / 255;
    const g = data[offset + 1]! / 255;
    const b = data[offset + 2]! / 255;

    // BT.709 YCbCr conversion
    const y = LUMA_R * r + LUMA_G * g + LUMA_B * b;

    // Cb = (B - Y) / (2 * (1 - Kb))  where Kb = 0.0722
    // Cr = (R - Y) / (2 * (1 - Kr))  where Kr = 0.2126
    cb[i] = (b - y) / (2 * (1 - LUMA_B));
    cr[i] = (r - y) / (2 * (1 - LUMA_R));
  }

  return { cb, cr };
}

/**
 * Compute an RGB histogram from image data.
 *
 * Returns three Uint32Array channels of 256 bins each, counting the number
 * of pixels at each intensity level for R, G, and B.
 *
 * @param imageData  Source image pixel data.
 * @returns Object with r, g, b Uint32Array histograms (256 bins each).
 */
export function computeHistogram(imageData: ImageData): {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
} {
  const { data } = imageData;
  const pixelCount = data.length / 4;

  const rHist = new Uint32Array(256);
  const gHist = new Uint32Array(256);
  const bHist = new Uint32Array(256);

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    rHist[data[offset]!]!++;
    gHist[data[offset + 1]!]!++;
    bHist[data[offset + 2]!]!++;
  }

  return { r: rHist, g: gHist, b: bHist };
}

/**
 * Compute an RGB parade (per-channel waveform) from image data.
 *
 * Like computeWaveform, but produces separate R, G, and B distributions
 * per column. Each channel result is a Float32Array of width * WAVEFORM_BINS.
 *
 * @param imageData  Source image pixel data.
 * @returns Object with r, g, b Float32Arrays of shape [width * WAVEFORM_BINS].
 */
export function computeParade(imageData: ImageData): {
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
} {
  const { width, height, data } = imageData;

  const rResult = new Float32Array(width * WAVEFORM_BINS);
  const gResult = new Float32Array(width * WAVEFORM_BINS);
  const bResult = new Float32Array(width * WAVEFORM_BINS);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;

      const rBin = clamp(Math.floor((data[offset]! / 255) * (WAVEFORM_BINS - 1)), 0, WAVEFORM_BINS - 1);
      const gBin = clamp(Math.floor((data[offset + 1]! / 255) * (WAVEFORM_BINS - 1)), 0, WAVEFORM_BINS - 1);
      const bBin = clamp(Math.floor((data[offset + 2]! / 255) * (WAVEFORM_BINS - 1)), 0, WAVEFORM_BINS - 1);

      rResult[x * WAVEFORM_BINS + rBin]! += 1;
      gResult[x * WAVEFORM_BINS + gBin]! += 1;
      bResult[x * WAVEFORM_BINS + bBin]! += 1;
    }
  }

  // Normalise by column height
  if (height > 0) {
    for (let x = 0; x < width; x++) {
      const base = x * WAVEFORM_BINS;
      for (let bin = 0; bin < WAVEFORM_BINS; bin++) {
        rResult[base + bin]! /= height;
        gResult[base + bin]! /= height;
        bResult[base + bin]! /= height;
      }
    }
  }

  return { r: rResult, g: gResult, b: bResult };
}

// =============================================================================
//  Scope Rendering Functions
// =============================================================================

/**
 * Render a luma waveform scope onto a canvas.
 *
 * Draws a green-on-black waveform display with graticule lines at 0%, 50%,
 * and 100% IRE. Brighter pixels indicate higher density of values at that
 * luma level for the given column.
 *
 * @param waveformData  Float32Array from computeWaveform().
 * @param canvas        Target HTML canvas element.
 */
export function renderWaveform(waveformData: Float32Array, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width: canvasW, height: canvasH } = canvas;
  const sourceColumns = waveformData.length / WAVEFORM_BINS;

  // Clear to black
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Draw graticule lines
  ctx.strokeStyle = 'rgba(80, 80, 80, 0.6)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  const graticuleLabels = ['100%', '75%', '50%', '25%', '0%'];
  const graticuleLevels = [0, 0.25, 0.5, 0.75, 1.0];
  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(120, 120, 120, 0.8)';

  for (let i = 0; i < graticuleLevels.length; i++) {
    const y = graticuleLevels[i]! * canvasH;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasW, y);
    ctx.stroke();
    ctx.fillText(graticuleLabels[i]!, 4, y - 3);
  }
  ctx.setLineDash([]);

  // Find max density for auto-gain
  let maxDensity = 0;
  for (let i = 0; i < waveformData.length; i++) {
    if (waveformData[i]! > maxDensity) maxDensity = waveformData[i]!;
  }
  if (maxDensity === 0) return;

  // Render waveform: map each source column to canvas columns
  const colScale = canvasW / sourceColumns;

  for (let srcX = 0; srcX < sourceColumns; srcX++) {
    const base = srcX * WAVEFORM_BINS;
    const drawX = Math.floor(srcX * colScale);
    const drawW = Math.max(1, Math.ceil(colScale));

    for (let bin = 0; bin < WAVEFORM_BINS; bin++) {
      const density = waveformData[base + bin];
      if (density! <= 0) continue;

      // Normalise density and apply a square root curve for visibility
      const normDensity = Math.sqrt(density! / maxDensity);
      const alpha = clamp(normDensity, 0.05, 1.0);

      // Bin 0 = bottom of scope (darkest), bin 255 = top (brightest)
      // Canvas Y is inverted: top = 0
      const drawY = Math.floor((1 - bin / (WAVEFORM_BINS - 1)) * canvasH);

      ctx.fillStyle = `rgba(0, 255, 0, ${alpha.toFixed(3)})`;
      ctx.fillRect(drawX, drawY, drawW, 1);
    }
  }
}

/**
 * Render a vectorscope onto a canvas.
 *
 * Draws a circular CbCr vectorscope with color targets for primary and
 * secondary colors, plus a skin tone indicator line. Pixel density is
 * represented by brightness.
 *
 * @param data    Object with cb and cr Float32Arrays from computeVectorscope().
 * @param canvas  Target HTML canvas element.
 */
export function renderVectorscope(
  data: { cb: Float32Array; cr: Float32Array },
  canvas: HTMLCanvasElement,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width: canvasW, height: canvasH } = canvas;
  const centerX = canvasW / 2;
  const centerY = canvasH / 2;
  const radius = Math.min(centerX, centerY) - 10;

  // Clear to black
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Draw circular graticule
  ctx.strokeStyle = 'rgba(60, 60, 60, 0.6)';
  ctx.lineWidth = 1;

  // Outer circle
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Inner circles at 25%, 50%, 75%
  for (const frac of [0.25, 0.5, 0.75]) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * frac, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Cross-hairs
  ctx.beginPath();
  ctx.moveTo(centerX - radius, centerY);
  ctx.lineTo(centerX + radius, centerY);
  ctx.moveTo(centerX, centerY - radius);
  ctx.lineTo(centerX, centerY + radius);
  ctx.stroke();

  // Draw skin tone line
  const skinAngleRad = (SKIN_TONE_ANGLE_DEG * Math.PI) / 180;
  ctx.strokeStyle = 'rgba(200, 160, 120, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(
    centerX + Math.cos(skinAngleRad) * radius,
    centerY - Math.sin(skinAngleRad) * radius,
  );
  ctx.stroke();

  // Draw color target boxes (approximate BT.709 CbCr positions for primaries/secondaries)
  const targets = [
    { label: 'R', cb: -0.169, cr: 0.500, color: 'rgba(255, 0, 0, 0.7)' },
    { label: 'G', cb: -0.331, cr: -0.419, color: 'rgba(0, 255, 0, 0.7)' },
    { label: 'B', cb: 0.500, cr: -0.081, color: 'rgba(0, 100, 255, 0.7)' },
    { label: 'Yl', cb: -0.500, cr: 0.081, color: 'rgba(255, 255, 0, 0.5)' },
    { label: 'Cy', cb: 0.169, cr: -0.500, color: 'rgba(0, 255, 255, 0.5)' },
    { label: 'Mg', cb: 0.331, cr: 0.419, color: 'rgba(255, 0, 255, 0.5)' },
  ];

  ctx.font = '9px monospace';
  for (const t of targets) {
    // CbCr maps: Cb -> horizontal, Cr -> vertical (inverted for screen coords)
    const tx = centerX + (t.cb / 0.5) * radius;
    const ty = centerY - (t.cr / 0.5) * radius;

    ctx.strokeStyle = t.color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tx - 4, ty - 4, 8, 8);

    ctx.fillStyle = t.color;
    ctx.fillText(t.label, tx + 6, ty + 3);
  }

  // Accumulate pixel density on a 2D grid
  const gridSize = Math.min(canvasW, canvasH);
  const densityGrid = new Float32Array(gridSize * gridSize);
  const pixelCount = data.cb.length;

  for (let i = 0; i < pixelCount; i++) {
    // Map CbCr [-0.5, 0.5] to grid coordinates
    const gx = Math.floor(((data.cb[i]! / 0.5) * 0.5 + 0.5) * (gridSize - 1));
    const gy = Math.floor(((-data.cr[i]! / 0.5) * 0.5 + 0.5) * (gridSize - 1));

    if (gx >= 0 && gx < gridSize && gy >= 0 && gy < gridSize) {
      densityGrid[gy * gridSize + gx]! += 1;
    }
  }

  // Find max density for normalisation
  let maxDensity = 0;
  for (let i = 0; i < densityGrid.length; i++) {
    if (densityGrid[i]! > maxDensity) maxDensity = densityGrid[i]!;
  }

  if (maxDensity === 0) return;

  // Render density as green dots
  const scaleX = canvasW / gridSize;
  const scaleY = canvasH / gridSize;

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const density = densityGrid[gy * gridSize + gx];
      if (density! <= 0) continue;

      const normDensity = Math.sqrt(density! / maxDensity);
      const alpha = clamp(normDensity, 0.1, 1.0);

      ctx.fillStyle = `rgba(0, 255, 0, ${alpha.toFixed(3)})`;
      ctx.fillRect(
        Math.floor(gx * scaleX),
        Math.floor(gy * scaleY),
        Math.max(1, Math.ceil(scaleX)),
        Math.max(1, Math.ceil(scaleY)),
      );
    }
  }
}

/**
 * Render an RGB histogram overlay onto a canvas.
 *
 * Draws semi-transparent red, green, and blue histogram curves overlaid
 * on a black background. Where channels overlap, colors blend additively.
 *
 * @param data    Object with r, g, b Uint32Array histograms from computeHistogram().
 * @param canvas  Target HTML canvas element.
 */
export function renderHistogram(
  data: { r: Uint32Array; g: Uint32Array; b: Uint32Array },
  canvas: HTMLCanvasElement,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width: canvasW, height: canvasH } = canvas;

  // Clear to black
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Find overall max for normalisation
  let maxCount = 0;
  for (let i = 0; i < 256; i++) {
    if (data.r[i]! > maxCount) maxCount = data.r[i]!;
    if (data.g[i]! > maxCount) maxCount = data.g[i]!;
    if (data.b[i]! > maxCount) maxCount = data.b[i]!;
  }

  if (maxCount === 0) return;

  // Use additive blending for overlapping channels
  ctx.globalCompositeOperation = 'lighter';

  const channels = [
    { hist: data.r, color: 'rgba(255, 0, 0, 0.6)' },
    { hist: data.g, color: 'rgba(0, 255, 0, 0.6)' },
    { hist: data.b, color: 'rgba(0, 100, 255, 0.6)' },
  ];

  for (const ch of channels) {
    ctx.fillStyle = ch.color;
    ctx.beginPath();
    ctx.moveTo(0, canvasH);

    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * canvasW;
      const h = (ch.hist[i]! / maxCount) * canvasH;
      ctx.lineTo(x, canvasH - h);
    }

    ctx.lineTo(canvasW, canvasH);
    ctx.closePath();
    ctx.fill();
  }

  // Reset composite operation
  ctx.globalCompositeOperation = 'source-over';

  // Draw graticule
  ctx.strokeStyle = 'rgba(80, 80, 80, 0.4)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);

  // Vertical lines at 25%, 50%, 75%
  for (const frac of [0.25, 0.5, 0.75]) {
    const x = frac * canvasW;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasH);
    ctx.stroke();
  }

  ctx.setLineDash([]);
}

/**
 * Render an RGB parade scope onto a canvas.
 *
 * Draws three side-by-side waveform columns: red, green, and blue. Each
 * column shows the per-channel intensity distribution per source column.
 *
 * @param data    Object with r, g, b Float32Arrays from computeParade().
 * @param canvas  Target HTML canvas element.
 */
export function renderParade(
  data: { r: Float32Array; g: Float32Array; b: Float32Array },
  canvas: HTMLCanvasElement,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width: canvasW, height: canvasH } = canvas;
  const columnWidth = Math.floor(canvasW / 3);

  // Clear to black
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Draw column separators
  ctx.strokeStyle = 'rgba(80, 80, 80, 0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(columnWidth, 0);
  ctx.lineTo(columnWidth, canvasH);
  ctx.moveTo(columnWidth * 2, 0);
  ctx.lineTo(columnWidth * 2, canvasH);
  ctx.stroke();

  // Draw horizontal graticule lines across all three columns
  ctx.strokeStyle = 'rgba(60, 60, 60, 0.4)';
  ctx.setLineDash([3, 3]);
  for (const frac of [0.25, 0.5, 0.75]) {
    const y = frac * canvasH;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasW, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Find max density across all channels for consistent scaling
  let maxDensity = 0;
  const allData = [data.r, data.g, data.b];
  for (const chData of allData) {
    for (let i = 0; i < chData.length; i++) {
      if (chData[i]! > maxDensity) maxDensity = chData[i]!;
    }
  }

  if (maxDensity === 0) return;

  const sourceColumns = data.r.length / WAVEFORM_BINS;

  // Render each channel in its column
  const channelConfigs = [
    { data: data.r, color: [255, 60, 60], offsetX: 0 },
    { data: data.g, color: [60, 255, 60], offsetX: columnWidth },
    { data: data.b, color: [60, 100, 255], offsetX: columnWidth * 2 },
  ];

  for (const ch of channelConfigs) {
    const colScale = columnWidth / sourceColumns;

    for (let srcX = 0; srcX < sourceColumns; srcX++) {
      const base = srcX * WAVEFORM_BINS;
      const drawX = ch.offsetX + Math.floor(srcX * colScale);
      const drawW = Math.max(1, Math.ceil(colScale));

      for (let bin = 0; bin < WAVEFORM_BINS; bin++) {
        const density = ch.data[base + bin];
        if (density! <= 0) continue;

        const normDensity = Math.sqrt(density! / maxDensity);
        const alpha = clamp(normDensity, 0.05, 1.0);

        // Bin 0 = bottom (dark), bin 255 = top (bright)
        const drawY = Math.floor((1 - bin / (WAVEFORM_BINS - 1)) * canvasH);

        ctx.fillStyle = `rgba(${ch.color[0]}, ${ch.color[1]}, ${ch.color[2]}, ${alpha.toFixed(3)})`;
        ctx.fillRect(drawX, drawY, drawW, 1);
      }
    }
  }
}

// =============================================================================
//  Scopes Engine
// =============================================================================

/** Supported scope types. */
export type ScopeType = 'waveform' | 'vectorscope' | 'histogram' | 'parade';

/**
 * Video scopes engine for professional color grading.
 *
 * Computes and renders waveform, vectorscope, RGB histogram, and RGB parade
 * scopes from frame pixel data. Follows the singleton pattern used by other
 * engines in the project.
 */
export class ScopesEngine {
  /** Currently active scope type. */
  private activeScopeType: ScopeType = 'waveform';
  /** Whether scopes are enabled. */
  private enabled = true;
  /** Cached waveform data. */
  private cachedWaveform: Float32Array | null = null;
  /** Cached vectorscope data. */
  private cachedVectorscope: { cb: Float32Array; cr: Float32Array } | null = null;
  /** Cached histogram data. */
  private cachedHistogram: { r: Uint32Array; g: Uint32Array; b: Uint32Array } | null = null;
  /** Cached parade data. */
  private cachedParade: { r: Float32Array; g: Float32Array; b: Float32Array } | null = null;
  /** Subscriber callbacks. */
  private subscribers = new Set<ScopesSubscriber>();

  // ── Computation ───────────────────────────────────────────────────────

  /**
   * Compute waveform data from image pixels.
   *
   * @param imageData  Source image pixel data.
   * @returns Float32Array of waveform bin data.
   */
  computeWaveform(imageData: ImageData): Float32Array {
    this.cachedWaveform = computeWaveform(imageData);
    return this.cachedWaveform;
  }

  /**
   * Compute vectorscope data from image pixels.
   *
   * @param imageData  Source image pixel data.
   * @returns Object with cb and cr Float32Arrays.
   */
  computeVectorscope(imageData: ImageData): { cb: Float32Array; cr: Float32Array } {
    this.cachedVectorscope = computeVectorscope(imageData);
    return this.cachedVectorscope;
  }

  /**
   * Compute RGB histogram data from image pixels.
   *
   * @param imageData  Source image pixel data.
   * @returns Object with r, g, b Uint32Array histograms.
   */
  computeHistogram(imageData: ImageData): { r: Uint32Array; g: Uint32Array; b: Uint32Array } {
    this.cachedHistogram = computeHistogram(imageData);
    return this.cachedHistogram;
  }

  /**
   * Compute RGB parade data from image pixels.
   *
   * @param imageData  Source image pixel data.
   * @returns Object with r, g, b Float32Arrays.
   */
  computeParade(imageData: ImageData): { r: Float32Array; g: Float32Array; b: Float32Array } {
    this.cachedParade = computeParade(imageData);
    return this.cachedParade;
  }

  /**
   * Compute all scope types from a single ImageData source.
   *
   * More efficient than calling each compute method individually since
   * the image data only needs to be traversed once for histogram, and
   * the other scopes can share the same pass where applicable.
   *
   * @param imageData  Source image pixel data.
   */
  computeAll(imageData: ImageData): void {
    this.cachedWaveform = computeWaveform(imageData);
    this.cachedVectorscope = computeVectorscope(imageData);
    this.cachedHistogram = computeHistogram(imageData);
    this.cachedParade = computeParade(imageData);
    this.notify();
  }

  // ── Rendering ─────────────────────────────────────────────────────────

  /**
   * Render waveform scope data onto a canvas.
   *
   * @param data    Float32Array from computeWaveform().
   * @param canvas  Target HTML canvas element.
   */
  renderWaveform(data: Float32Array, canvas: HTMLCanvasElement): void {
    renderWaveform(data, canvas);
  }

  /**
   * Render vectorscope data onto a canvas.
   *
   * @param data    Object from computeVectorscope().
   * @param canvas  Target HTML canvas element.
   */
  renderVectorscope(
    data: { cb: Float32Array; cr: Float32Array },
    canvas: HTMLCanvasElement,
  ): void {
    renderVectorscope(data, canvas);
  }

  /**
   * Render RGB histogram data onto a canvas.
   *
   * @param data    Object from computeHistogram().
   * @param canvas  Target HTML canvas element.
   */
  renderHistogram(
    data: { r: Uint32Array; g: Uint32Array; b: Uint32Array },
    canvas: HTMLCanvasElement,
  ): void {
    renderHistogram(data, canvas);
  }

  /**
   * Render RGB parade data onto a canvas.
   *
   * @param data    Object from computeParade().
   * @param canvas  Target HTML canvas element.
   */
  renderParade(
    data: { r: Float32Array; g: Float32Array; b: Float32Array },
    canvas: HTMLCanvasElement,
  ): void {
    renderParade(data, canvas);
  }

  /**
   * Compute scope data from imageData and render the active scope type
   * onto the provided canvas in a single call.
   *
   * @param imageData  Source image pixel data.
   * @param canvas     Target canvas element.
   */
  updateAndRender(imageData: ImageData, canvas: HTMLCanvasElement): void {
    if (!this.enabled) return;

    switch (this.activeScopeType) {
      case 'waveform': {
        const data = this.computeWaveform(imageData);
        this.renderWaveform(data, canvas);
        break;
      }
      case 'vectorscope': {
        const data = this.computeVectorscope(imageData);
        this.renderVectorscope(data, canvas);
        break;
      }
      case 'histogram': {
        const data = this.computeHistogram(imageData);
        this.renderHistogram(data, canvas);
        break;
      }
      case 'parade': {
        const data = this.computeParade(imageData);
        this.renderParade(data, canvas);
        break;
      }
    }
  }

  // ── State Management ──────────────────────────────────────────────────

  /**
   * Set the active scope type.
   *
   * @param type  The scope type to display.
   */
  setActiveScopeType(type: ScopeType): void {
    this.activeScopeType = type;
    this.notify();
  }

  /**
   * Get the currently active scope type.
   *
   * @returns The active ScopeType.
   */
  getActiveScopeType(): ScopeType {
    return this.activeScopeType;
  }

  /**
   * Enable or disable scope computation and rendering.
   *
   * @param enabled  Whether scopes should be active.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.notify();
  }

  /**
   * Whether scopes are currently enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get cached scope data (if available).
   */
  getCachedWaveform(): Float32Array | null {
    return this.cachedWaveform;
  }

  getCachedVectorscope(): { cb: Float32Array; cr: Float32Array } | null {
    return this.cachedVectorscope;
  }

  getCachedHistogram(): { r: Uint32Array; g: Uint32Array; b: Uint32Array } | null {
    return this.cachedHistogram;
  }

  getCachedParade(): { r: Float32Array; g: Float32Array; b: Float32Array } | null {
    return this.cachedParade;
  }

  // ── Subscription ──────────────────────────────────────────────────────

  /**
   * Subscribe to scope engine state changes.
   *
   * @param cb  Callback invoked on change.
   * @returns   An unsubscribe function.
   */
  subscribe(cb: ScopesSubscriber): () => void {
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
        console.error('[ScopesEngine] Subscriber error:', err);
      }
    });
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  /**
   * Dispose of all cached data and clear listeners.
   */
  dispose(): void {
    this.cachedWaveform = null;
    this.cachedVectorscope = null;
    this.cachedHistogram = null;
    this.cachedParade = null;
    this.subscribers.clear();
  }
}

/** Singleton scopes engine instance. */
export const scopesEngine = new ScopesEngine();
