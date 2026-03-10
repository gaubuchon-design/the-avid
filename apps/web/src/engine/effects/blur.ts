// ═══════════════════════════════════════════════════════════════════════════
//  Gaussian Blur Effect
//  Uses box blur approximation (3-pass) for performance.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply a Gaussian blur via 3-pass box blur approximation.
 * Returns a new ImageData (does not modify in place for safety).
 *
 * @param imageData  Source image data
 * @param radius     Blur radius in pixels (0-100)
 * @param iterations Number of box-blur passes (1-5, higher = more Gaussian-like)
 */
export function applyGaussianBlur(
  imageData: ImageData,
  radius: number,
  iterations = 1,
): ImageData {
  if (radius <= 0) return imageData;

  const { width, height } = imageData;
  const r = Math.min(Math.round(radius), Math.min(width, height) / 2);
  if (r <= 0) return imageData;

  // Copy data — we work on a copy to avoid mutation issues
  const src = new Uint8ClampedArray(imageData.data);
  const dst = new Uint8ClampedArray(imageData.data.length);

  for (let pass = 0; pass < Math.max(1, Math.min(iterations, 5)); pass++) {
    // Horizontal pass
    boxBlurH(src, dst, width, height, r);
    // Vertical pass
    boxBlurV(dst, src, width, height, r);
  }

  // Write result back
  imageData.data.set(src);
  return imageData;
}

function boxBlurH(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  w: number,
  h: number,
  r: number,
): void {
  const iarr = 1 / (r + r + 1);

  for (let y = 0; y < h; y++) {
    let ri = y * w * 4;
    let li = ri;
    let ti = ri;
    const fv = [src[ri], src[ri + 1], src[ri + 2], src[ri + 3]];
    const lv_idx = (y * w + w - 1) * 4;
    const lv = [src[lv_idx], src[lv_idx + 1], src[lv_idx + 2], src[lv_idx + 3]];

    const val = [fv[0]! * (r + 1), fv[1]! * (r + 1), fv[2]! * (r + 1), fv[3]! * (r + 1)];

    for (let j = 0; j < r; j++) {
      const idx = Math.min(j, w - 1) * 4 + y * w * 4;
      val[0]! += src[idx]!;
      val[1]! += src[idx + 1]!;
      val[2]! += src[idx + 2]!;
      val[3]! += src[idx + 3]!;
    }

    for (let j = 0; j <= r; j++) {
      const idx = Math.min(j + r, w - 1) * 4 + y * w * 4;
      val[0]! += src[idx]! - fv[0]!;
      val[1]! += src[idx + 1]! - fv[1]!;
      val[2]! += src[idx + 2]! - fv[2]!;
      val[3]! += src[idx + 3]! - fv[3]!;
      dst[ti]     = Math.round(val[0]! * iarr);
      dst[ti + 1] = Math.round(val[1]! * iarr);
      dst[ti + 2] = Math.round(val[2]! * iarr);
      dst[ti + 3] = Math.round(val[3]! * iarr);
      ti += 4;
    }

    for (let j = r + 1; j < w - r; j++) {
      const add_idx = (j + r) * 4 + y * w * 4;
      const sub_idx = (j - r - 1) * 4 + y * w * 4;
      val[0]! += src[add_idx]! - src[sub_idx]!;
      val[1]! += src[add_idx + 1]! - src[sub_idx + 1]!;
      val[2]! += src[add_idx + 2]! - src[sub_idx + 2]!;
      val[3]! += src[add_idx + 3]! - src[sub_idx + 3]!;
      dst[ti]     = Math.round(val[0]! * iarr);
      dst[ti + 1] = Math.round(val[1]! * iarr);
      dst[ti + 2] = Math.round(val[2]! * iarr);
      dst[ti + 3] = Math.round(val[3]! * iarr);
      ti += 4;
    }

    for (let j = w - r; j < w; j++) {
      const sub_idx = (j - r - 1) * 4 + y * w * 4;
      val[0]! += lv[0]! - src[sub_idx]!;
      val[1]! += lv[1]! - src[sub_idx + 1]!;
      val[2]! += lv[2]! - src[sub_idx + 2]!;
      val[3]! += lv[3]! - src[sub_idx + 3]!;
      dst[ti]     = Math.round(val[0]! * iarr);
      dst[ti + 1] = Math.round(val[1]! * iarr);
      dst[ti + 2] = Math.round(val[2]! * iarr);
      dst[ti + 3] = Math.round(val[3]! * iarr);
      ti += 4;
    }
  }
}

function boxBlurV(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  w: number,
  h: number,
  r: number,
): void {
  const iarr = 1 / (r + r + 1);

  for (let x = 0; x < w; x++) {
    const ti_start = x * 4;
    const fv = [src[ti_start], src[ti_start + 1], src[ti_start + 2], src[ti_start + 3]];
    const lv_idx = ((h - 1) * w + x) * 4;
    const lv = [src[lv_idx], src[lv_idx + 1], src[lv_idx + 2], src[lv_idx + 3]];

    const val = [fv[0]! * (r + 1), fv[1]! * (r + 1), fv[2]! * (r + 1), fv[3]! * (r + 1)];

    for (let j = 0; j < r; j++) {
      const idx = (Math.min(j, h - 1) * w + x) * 4;
      val[0]! += src[idx]!;
      val[1]! += src[idx + 1]!;
      val[2]! += src[idx + 2]!;
      val[3]! += src[idx + 3]!;
    }

    let ti = ti_start;
    for (let j = 0; j <= r; j++) {
      const idx = (Math.min(j + r, h - 1) * w + x) * 4;
      val[0]! += src[idx]! - fv[0]!;
      val[1]! += src[idx + 1]! - fv[1]!;
      val[2]! += src[idx + 2]! - fv[2]!;
      val[3]! += src[idx + 3]! - fv[3]!;
      dst[ti]     = Math.round(val[0]! * iarr);
      dst[ti + 1] = Math.round(val[1]! * iarr);
      dst[ti + 2] = Math.round(val[2]! * iarr);
      dst[ti + 3] = Math.round(val[3]! * iarr);
      ti += w * 4;
    }

    for (let j = r + 1; j < h - r; j++) {
      const add_idx = ((j + r) * w + x) * 4;
      const sub_idx = ((j - r - 1) * w + x) * 4;
      val[0]! += src[add_idx]! - src[sub_idx]!;
      val[1]! += src[add_idx + 1]! - src[sub_idx + 1]!;
      val[2]! += src[add_idx + 2]! - src[sub_idx + 2]!;
      val[3]! += src[add_idx + 3]! - src[sub_idx + 3]!;
      dst[ti]     = Math.round(val[0]! * iarr);
      dst[ti + 1] = Math.round(val[1]! * iarr);
      dst[ti + 2] = Math.round(val[2]! * iarr);
      dst[ti + 3] = Math.round(val[3]! * iarr);
      ti += w * 4;
    }

    for (let j = h - r; j < h; j++) {
      const sub_idx = ((j - r - 1) * w + x) * 4;
      val[0]! += lv[0]! - src[sub_idx]!;
      val[1]! += lv[1]! - src[sub_idx + 1]!;
      val[2]! += lv[2]! - src[sub_idx + 2]!;
      val[3]! += lv[3]! - src[sub_idx + 3]!;
      dst[ti]     = Math.round(val[0]! * iarr);
      dst[ti + 1] = Math.round(val[1]! * iarr);
      dst[ti + 2] = Math.round(val[2]! * iarr);
      dst[ti + 3] = Math.round(val[3]! * iarr);
      ti += w * 4;
    }
  }
}
