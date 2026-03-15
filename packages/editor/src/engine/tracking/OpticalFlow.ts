// =============================================================================
//  THE AVID — Optical Flow Engine
//  Lucas-Kanade sparse optical flow and Farneback-style dense optical flow.
//  Used by warp-stabilizer, morph-cut, fluid-morph, and frame interpolation.
// =============================================================================

import type { Point2D } from './PlanarTracker';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FlowVector {
  dx: number;
  dy: number;
}

/** Dense flow field: dx/dy per pixel. */
export interface DenseFlowField {
  width: number;
  height: number;
  dx: Float32Array;
  dy: Float32Array;
}

/** Sparse flow result for a set of tracked points. */
export interface SparseFlowResult {
  points: Point2D[];
  flow: FlowVector[];
  status: boolean[];  // true if point was successfully tracked
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toGrayscale(imageData: ImageData): Float32Array {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114;
  }
  return gray;
}

/** Build a Gaussian pyramid (each level is half-resolution). */
function buildPyramid(gray: Float32Array, w: number, h: number, levels: number): { data: Float32Array; w: number; h: number }[] {
  const pyramid: { data: Float32Array; w: number; h: number }[] = [{ data: gray, w, h }];

  let current = gray;
  let cw = w;
  let ch = h;

  for (let l = 1; l < levels; l++) {
    const nw = Math.max(1, cw >> 1);
    const nh = Math.max(1, ch >> 1);
    const next = new Float32Array(nw * nh);

    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const sx = x * 2;
        const sy = y * 2;
        const sx1 = Math.min(sx + 1, cw - 1);
        const sy1 = Math.min(sy + 1, ch - 1);
        next[y * nw + x] = (
          current[sy * cw + sx]! +
          current[sy * cw + sx1]! +
          current[sy1 * cw + sx]! +
          current[sy1 * cw + sx1]!
        ) * 0.25;
      }
    }

    pyramid.push({ data: next, w: nw, h: nh });
    current = next;
    cw = nw;
    ch = nh;
  }

  return pyramid;
}

/** Compute image gradients (Scharr operator). */
function computeGradients(
  gray: Float32Array,
  w: number,
  h: number,
): { Ix: Float32Array; Iy: Float32Array } {
  const Ix = new Float32Array(w * h);
  const Iy = new Float32Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      // Scharr kernel for X
      Ix[y * w + x] =
        -3 * gray[(y - 1) * w + (x - 1)]! + 3 * gray[(y - 1) * w + (x + 1)]! +
        -10 * gray[y * w + (x - 1)]! + 10 * gray[y * w + (x + 1)]! +
        -3 * gray[(y + 1) * w + (x - 1)]! + 3 * gray[(y + 1) * w + (x + 1)]!;

      // Scharr kernel for Y
      Iy[y * w + x] =
        -3 * gray[(y - 1) * w + (x - 1)]! - 10 * gray[(y - 1) * w + x]! - 3 * gray[(y - 1) * w + (x + 1)]! +
        3 * gray[(y + 1) * w + (x - 1)]! + 10 * gray[(y + 1) * w + x]! + 3 * gray[(y + 1) * w + (x + 1)]!;
    }
  }

  return { Ix, Iy };
}

/** Bilinear interpolation for sub-pixel sampling. */
function sampleBilinear(data: Float32Array, w: number, h: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);

  if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return 0;

  const fx = x - x0;
  const fy = y - y0;

  return (
    data[y0 * w + x0]! * (1 - fx) * (1 - fy) +
    data[y0 * w + x1]! * fx * (1 - fy) +
    data[y1 * w + x0]! * (1 - fx) * fy +
    data[y1 * w + x1]! * fx * fy
  );
}

// ─── Optical Flow Engine ────────────────────────────────────────────────────

export class OpticalFlowEngine {
  private pyramidLevels = 4;
  private windowSize = 15;
  private maxIterations = 20;
  private epsilon = 0.01;

  /**
   * Lucas-Kanade sparse optical flow with pyramidal coarse-to-fine estimation.
   * Tracks a set of points from one frame to the next.
   */
  calcSparseFlow(
    prevImage: ImageData,
    nextImage: ImageData,
    points: Point2D[],
  ): SparseFlowResult {
    const prevGray = toGrayscale(prevImage);
    const nextGray = toGrayscale(nextImage);
    const w = prevImage.width;
    const h = prevImage.height;

    const prevPyramid = buildPyramid(prevGray, w, h, this.pyramidLevels);
    const nextPyramid = buildPyramid(nextGray, w, h, this.pyramidLevels);

    const flow: FlowVector[] = [];
    const status: boolean[] = [];
    const resultPoints: Point2D[] = [];

    const halfWin = Math.floor(this.windowSize / 2);

    for (const pt of points) {
      let ux = 0;
      let uy = 0;
      let tracked = true;

      // Coarse to fine: start from highest pyramid level
      for (let level = this.pyramidLevels - 1; level >= 0; level--) {
        const scale = 1 / (1 << level);
        const pl = prevPyramid[level];
        const nl = nextPyramid[level];

        const px = pt.x * scale;
        const py = pt.y * scale;

        // Scaled flow estimate from previous level
        ux *= 2;
        uy *= 2;

        if (level === this.pyramidLevels - 1) {
          ux = 0;
          uy = 0;
        }

        // Compute gradient structure tensor in the window
        const { Ix, Iy } = computeGradients(pl!.data!, pl!.w!, pl!.h!);

        let sumIxIx = 0, sumIxIy = 0, sumIyIy = 0;

        for (let wy = -halfWin; wy <= halfWin; wy++) {
          for (let wx = -halfWin; wx <= halfWin; wx++) {
            const sx = Math.round(px + wx);
            const sy = Math.round(py + wy);
            if (sx < 0 || sx >= pl!.w! || sy < 0 || sy >= pl!.h!) continue;

            const ix = Ix[sy * pl!.w! + sx];
            const iy = Iy[sy * pl!.w! + sx];
            sumIxIx += ix! * ix!;
            sumIxIy += ix! * iy!;
            sumIyIy += iy! * iy!;
          }
        }

        // Check if the structure tensor is invertible
        const det = sumIxIx * sumIyIy - sumIxIy * sumIxIy;
        if (Math.abs(det) < 1e-6) {
          tracked = false;
          break;
        }

        const invDet = 1.0 / det;

        // Iterative refinement
        for (let iter = 0; iter < this.maxIterations; iter++) {
          let sumIxIt = 0, sumIyIt = 0;

          for (let wy = -halfWin; wy <= halfWin; wy++) {
            for (let wx = -halfWin; wx <= halfWin; wx++) {
              const sx = Math.round(px + wx);
              const sy = Math.round(py + wy);
              if (sx < 0 || sx >= pl!.w! || sy < 0 || sy >= pl!.h!) continue;

              const ix = Ix[sy * pl!.w! + sx];
              const iy = Iy[sy * pl!.w! + sx];
              const prevVal = sampleBilinear(pl!.data!, pl!.w!, pl!.h!, px + wx, py + wy);
              const nextVal = sampleBilinear(nl!.data!, nl!.w!, nl!.h!, px + wx + ux, py + wy + uy);
              const it = nextVal - prevVal;

              sumIxIt += ix! * it;
              sumIyIt += iy! * it;
            }
          }

          // Solve 2x2 system: [Ixx Ixy; Ixy Iyy] * [du; dv] = -[IxIt; IyIt]
          const du = -invDet * (sumIyIy * sumIxIt - sumIxIy * sumIyIt);
          const dv = -invDet * (-sumIxIy * sumIxIt + sumIxIx * sumIyIt);

          ux += du;
          uy += dv;

          if (Math.abs(du) < this.epsilon && Math.abs(dv) < this.epsilon) break;
        }
      }

      // Check if tracked point is within image bounds
      const nx = pt.x + ux;
      const ny = pt.y + uy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
        tracked = false;
      }

      flow.push({ dx: ux, dy: uy });
      status.push(tracked);
      resultPoints.push({ x: pt.x + ux, y: pt.y + uy });
    }

    return { points: resultPoints, flow, status };
  }

  /**
   * Dense optical flow using a simplified Farneback-like polynomial expansion approach.
   * Returns a flow field at reduced resolution for efficiency.
   */
  calcDenseFlow(
    prevImage: ImageData,
    nextImage: ImageData,
    scale: number = 0.5,
  ): DenseFlowField {
    const prevGray = toGrayscale(prevImage);
    const nextGray = toGrayscale(nextImage);
    const w = prevImage.width;
    const h = prevImage.height;

    const ow = Math.round(w * scale);
    const oh = Math.round(h * scale);

    // Downsample both frames
    const prevSmall = this.downsample(prevGray, w, h, ow, oh);
    const nextSmall = this.downsample(nextGray, w, h, ow, oh);

    const { Ix, Iy } = computeGradients(prevSmall, ow, oh);

    // Temporal gradient
    const It = new Float32Array(ow * oh);
    for (let i = 0; i < It.length; i++) {
      It[i] = nextSmall[i]! - prevSmall[i]!;
    }

    const dx = new Float32Array(ow * oh);
    const dy = new Float32Array(ow * oh);
    const halfWin = 3;

    for (let y = halfWin; y < oh - halfWin; y++) {
      for (let x = halfWin; x < ow - halfWin; x++) {
        let sumIxIx = 0, sumIxIy = 0, sumIyIy = 0;
        let sumIxIt = 0, sumIyIt = 0;

        for (let wy = -halfWin; wy <= halfWin; wy++) {
          for (let wx = -halfWin; wx <= halfWin; wx++) {
            const idx = (y + wy) * ow + (x + wx);
            const ix = Ix[idx];
            const iy = Iy[idx];
            const it = It[idx];
            sumIxIx += ix! * ix!;
            sumIxIy += ix! * iy!;
            sumIyIy += iy! * iy!;
            sumIxIt += ix! * it!;
            sumIyIt += iy! * it!;
          }
        }

        const det = sumIxIx * sumIyIy - sumIxIy * sumIxIy;
        if (Math.abs(det) < 1e-4) continue;

        const invDet = 1.0 / det;
        const idx = y * ow + x;
        dx[idx] = -invDet * (sumIyIy * sumIxIt - sumIxIy * sumIyIt);
        dy[idx] = -invDet * (-sumIxIy * sumIxIt + sumIxIx * sumIyIt);
      }
    }

    return { width: ow, height: oh, dx, dy };
  }

  /**
   * Estimate global motion from sparse flow (for stabilization).
   * Returns translation (dx, dy) and rotation (radians).
   */
  estimateGlobalMotion(
    flowResult: SparseFlowResult,
  ): { dx: number; dy: number; rotation: number; scale: number } {
    const validFlow = flowResult.flow.filter((_, i) => flowResult.status[i]);
    const validPts = flowResult.points.filter((_, i) => flowResult.status[i]);

    if (validFlow.length < 3) {
      return { dx: 0, dy: 0, rotation: 0, scale: 1 };
    }

    // Median translation (robust to outliers)
    const dxs = validFlow.map(f => f.dx).sort((a, b) => a - b);
    const dys = validFlow.map(f => f.dy).sort((a, b) => a - b);
    const medianDx = dxs[Math.floor(dxs.length / 2)];
    const medianDy = dys[Math.floor(dys.length / 2)];

    // Estimate rotation from flow field
    // Use cross-product of position vectors relative to center
    const cx = validPts.reduce((s, p) => s + p.x, 0) / validPts.length;
    const cy = validPts.reduce((s, p) => s + p.y, 0) / validPts.length;

    let sumAngle = 0;
    let angleCount = 0;

    for (let i = 0; i < validPts.length; i++) {
      const px = validPts[i]!.x - cx;
      const py = validPts[i]!.y - cy;
      const dist = Math.sqrt(px * px + py * py);
      if (dist < 10) continue; // skip points near center

      const fx = validFlow[i]!.dx - medianDx!;
      const fy = validFlow[i]!.dy - medianDy!;

      // Cross product gives angular velocity
      const cross = (px * fy - py * fx) / (dist * dist);
      sumAngle += cross;
      angleCount++;
    }

    const rotation = angleCount > 0 ? sumAngle / angleCount : 0;

    return { dx: medianDx!, dy: medianDy!, rotation, scale: 1 };
  }

  /**
   * Warp an image using a dense flow field (for frame interpolation).
   */
  warpByFlow(
    imageData: ImageData,
    flowField: DenseFlowField,
    t: number, // 0-1 interpolation factor
  ): ImageData {
    const { width, height, data } = imageData;
    const result = new ImageData(width, height);
    const out = result.data;
    const scaleX = flowField.width / width;
    const scaleY = flowField.height / height;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Sample flow at this position
        const fx = Math.min(Math.floor(x * scaleX), flowField.width - 1);
        const fy = Math.min(Math.floor(y * scaleY), flowField.height - 1);
        const fidx = fy * flowField.width + fx;

        const srcX = x - flowField.dx[fidx]! * t / scaleX;
        const srcY = y - flowField.dy[fidx]! * t / scaleY;

        // Bilinear sample from source
        const x0 = Math.floor(srcX);
        const y0 = Math.floor(srcY);
        const x1 = Math.min(x0 + 1, width - 1);
        const y1 = Math.min(y0 + 1, height - 1);

        if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) {
          const didx = (y * width + x) * 4;
          out[didx] = data[didx]!;
          out[didx + 1] = data[didx + 1]!;
          out[didx + 2] = data[didx + 2]!;
          out[didx + 3] = data[didx + 3]!;
          continue;
        }

        const fxl = srcX - x0;
        const fyl = srcY - y0;

        const i00 = (y0 * width + x0) * 4;
        const i10 = (y0 * width + x1) * 4;
        const i01 = (y1 * width + x0) * 4;
        const i11 = (y1 * width + x1) * 4;

        const didx = (y * width + x) * 4;
        for (let c = 0; c < 4; c++) {
          out[didx + c] = Math.round(
            data[i00 + c]! * (1 - fxl) * (1 - fyl) +
            data[i10 + c]! * fxl * (1 - fyl) +
            data[i01 + c]! * (1 - fxl) * fyl +
            data[i11 + c]! * fxl * fyl,
          );
        }
      }
    }

    return result;
  }

  private downsample(src: Float32Array, sw: number, sh: number, dw: number, dh: number): Float32Array {
    const dst = new Float32Array(dw * dh);
    const scaleX = sw / dw;
    const scaleY = sh / dh;

    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const sx = Math.min(Math.floor(x * scaleX), sw - 1);
        const sy = Math.min(Math.floor(y * scaleY), sh - 1);
        dst[y * dw + x] = src[sy * sw + sx]!;
      }
    }

    return dst;
  }
}

export const opticalFlowEngine = new OpticalFlowEngine();
