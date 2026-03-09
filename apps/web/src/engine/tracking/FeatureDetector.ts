// =============================================================================
//  THE AVID — Feature Detector
//  Pure-JS ORB-like feature detection, BRIEF-like descriptors, brute-force
//  matching, and RANSAC-based homography estimation.
//  (Standalone implementation — no OpenCV dependency required.)
// =============================================================================

import type { HomographyMatrix, Point2D } from './PlanarTracker';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Feature {
  x: number;
  y: number;
  response: number;       // corner response strength
  angle: number;          // orientation in radians
  descriptor: Uint8Array; // 32-byte BRIEF descriptor
}

export interface Match {
  src: Feature;
  dst: Feature;
  distance: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PATCH_SIZE = 31;
const HALF_PATCH = 15;
const DESCRIPTOR_BYTES = 32;
const DESCRIPTOR_BITS = DESCRIPTOR_BYTES * 8;

// Pre-computed sampling pattern for BRIEF descriptor (256 pairs within patch)
// Gaussian-distributed sampling offsets
const BRIEF_PATTERN: [number, number, number, number][] = [];
function initBriefPattern(): void {
  if (BRIEF_PATTERN.length > 0) return;
  // Deterministic pseudo-random pattern using simple LCG
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed / 0x7fffffff) * 2 - 1;
  };
  for (let i = 0; i < DESCRIPTOR_BITS; i++) {
    BRIEF_PATTERN.push([
      Math.round(rand() * HALF_PATCH),
      Math.round(rand() * HALF_PATCH),
      Math.round(rand() * HALF_PATCH),
      Math.round(rand() * HALF_PATCH),
    ]);
  }
}

// ─── Grayscale Conversion ───────────────────────────────────────────────────

function toGrayscale(imageData: ImageData): Float32Array {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  return gray;
}

// ─── Gaussian Blur (separable 5x5) ─────────────────────────────────────────

const GAUSS_KERNEL = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];

function gaussianBlur(src: Float32Array, w: number, h: number): Float32Array {
  const temp = new Float32Array(w * h);
  const dst = new Float32Array(w * h);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -2; k <= 2; k++) {
        const sx = Math.min(Math.max(x + k, 0), w - 1);
        sum += src[y * w + sx] * GAUSS_KERNEL[k + 2];
      }
      temp[y * w + x] = sum;
    }
  }

  // Vertical pass
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let k = -2; k <= 2; k++) {
        const sy = Math.min(Math.max(y + k, 0), h - 1);
        sum += temp[sy * w + x] * GAUSS_KERNEL[k + 2];
      }
      dst[y * w + x] = sum;
    }
  }

  return dst;
}

// ─── FAST Corner Detection (FAST-9) ────────────────────────────────────────

const CIRCLE_OFFSETS: [number, number][] = [
  [0, -3], [1, -3], [2, -2], [3, -1],
  [3, 0],  [3, 1],  [2, 2],  [1, 3],
  [0, 3],  [-1, 3], [-2, 2], [-3, 1],
  [-3, 0], [-3, -1],[-2, -2],[-1, -3],
];

function detectFASTCorners(
  gray: Float32Array,
  w: number,
  h: number,
  threshold: number,
  roi?: { x: number; y: number; w: number; h: number },
): { x: number; y: number; response: number }[] {
  const corners: { x: number; y: number; response: number }[] = [];
  const startX = roi ? Math.max(HALF_PATCH, Math.floor(roi.x)) : HALF_PATCH;
  const startY = roi ? Math.max(HALF_PATCH, Math.floor(roi.y)) : HALF_PATCH;
  const endX = roi ? Math.min(w - HALF_PATCH, Math.ceil(roi.x + roi.w)) : w - HALF_PATCH;
  const endY = roi ? Math.min(h - HALF_PATCH, Math.ceil(roi.y + roi.h)) : h - HALF_PATCH;

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const center = gray[y * w + x];
      let consecutive = 0;
      let maxConsecutive = 0;
      let responseSum = 0;

      // Check 16 + 16 (wrap around) pixels on the Bresenham circle
      for (let i = 0; i < 32; i++) {
        const idx = i % 16;
        const [dx, dy] = CIRCLE_OFFSETS[idx];
        const val = gray[(y + dy) * w + (x + dx)];
        const diff = Math.abs(val - center);

        if (diff > threshold) {
          consecutive++;
          responseSum += diff;
          if (consecutive > maxConsecutive) maxConsecutive = consecutive;
        } else {
          consecutive = 0;
        }
      }

      if (maxConsecutive >= 9) {
        corners.push({ x, y, response: responseSum });
      }
    }
  }

  return corners;
}

// ─── Non-Maximum Suppression ────────────────────────────────────────────────

function nonMaxSuppression(
  corners: { x: number; y: number; response: number }[],
  radius: number,
  maxFeatures: number,
): { x: number; y: number; response: number }[] {
  // Sort by response (strongest first)
  corners.sort((a, b) => b.response - a.response);

  const kept: { x: number; y: number; response: number }[] = [];
  const r2 = radius * radius;

  for (const c of corners) {
    let suppressed = false;
    for (const k of kept) {
      const dx = c.x - k.x;
      const dy = c.y - k.y;
      if (dx * dx + dy * dy < r2) {
        suppressed = true;
        break;
      }
    }
    if (!suppressed) {
      kept.push(c);
      if (kept.length >= maxFeatures) break;
    }
  }

  return kept;
}

// ─── Orientation (Intensity Centroid) ───────────────────────────────────────

function computeOrientation(gray: Float32Array, w: number, x: number, y: number): number {
  let m01 = 0, m10 = 0;
  for (let dy = -HALF_PATCH; dy <= HALF_PATCH; dy++) {
    for (let dx = -HALF_PATCH; dx <= HALF_PATCH; dx++) {
      if (dx * dx + dy * dy > HALF_PATCH * HALF_PATCH) continue;
      const val = gray[(y + dy) * w + (x + dx)];
      m10 += dx * val;
      m01 += dy * val;
    }
  }
  return Math.atan2(m01, m10);
}

// ─── BRIEF Descriptor (rotation-aware) ─────────────────────────────────────

function computeDescriptor(
  gray: Float32Array,
  w: number,
  x: number,
  y: number,
  angle: number,
): Uint8Array {
  initBriefPattern();

  const descriptor = new Uint8Array(DESCRIPTOR_BYTES);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  for (let i = 0; i < DESCRIPTOR_BITS; i++) {
    const [ax, ay, bx, by] = BRIEF_PATTERN[i];

    // Rotate sampling points by orientation
    const rax = Math.round(ax * cosA - ay * sinA);
    const ray = Math.round(ax * sinA + ay * cosA);
    const rbx = Math.round(bx * cosA - by * sinA);
    const rby = Math.round(bx * sinA + by * cosA);

    const valA = gray[(y + ray) * w + (x + rax)];
    const valB = gray[(y + rby) * w + (x + rbx)];

    if (valA < valB) {
      descriptor[i >> 3] |= (1 << (i & 7));
    }
  }

  return descriptor;
}

// ─── Hamming Distance ───────────────────────────────────────────────────────

function hammingDistance(a: Uint8Array, b: Uint8Array): number {
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let xor = a[i] ^ b[i];
    while (xor) {
      dist += xor & 1;
      xor >>= 1;
    }
  }
  return dist;
}

// ─── RANSAC Homography ─────────────────────────────────────────────────────

function solveHomographyDLT(srcPts: Point2D[], dstPts: Point2D[]): HomographyMatrix | null {
  // Direct Linear Transform for 4-point correspondences
  if (srcPts.length < 4) return null;

  // Build the 8x9 matrix A for Ah = 0
  const n = srcPts.length;
  const A: number[][] = [];

  for (let i = 0; i < n; i++) {
    const { x: sx, y: sy } = srcPts[i];
    const { x: dx, y: dy } = dstPts[i];

    A.push([
      -sx, -sy, -1, 0, 0, 0, dx * sx, dx * sy, dx,
    ]);
    A.push([
      0, 0, 0, -sx, -sy, -1, dy * sx, dy * sy, dy,
    ]);
  }

  // Solve via simplified SVD for the 9x9 case: find nullspace of A^T A
  // For a minimal solver (4 points → 8 equations, 9 unknowns), we solve via
  // cross-product of last two rows of row-echelon form

  // Use the pseudo-inverse approach: solve A^T A h = 0
  // Find eigenvector of smallest eigenvalue via power iteration on (A^T A)^{-1}
  const ATA = new Array(9).fill(null).map(() => new Array(9).fill(0));
  for (let i = 0; i < A.length; i++) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        ATA[r][c] += A[i][r] * A[i][c];
      }
    }
  }

  // Inverse power iteration to find eigenvector of smallest eigenvalue
  let h = [1, 0, 0, 0, 1, 0, 0, 0, 1]; // initial guess
  for (let iter = 0; iter < 30; iter++) {
    // Solve ATA * x = h using Gaussian elimination
    const aug = ATA.map((row, i) => [...row, h[i]]);

    // Forward elimination
    for (let col = 0; col < 9; col++) {
      let maxRow = col;
      for (let row = col + 1; row < 9; row++) {
        if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
      }
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

      if (Math.abs(aug[col][col]) < 1e-12) continue;

      for (let row = col + 1; row < 9; row++) {
        const factor = aug[row][col] / aug[col][col];
        for (let k = col; k <= 9; k++) {
          aug[row][k] -= factor * aug[col][k];
        }
      }
    }

    // Back substitution
    const x = new Array(9).fill(0);
    for (let i = 8; i >= 0; i--) {
      if (Math.abs(aug[i][i]) < 1e-12) {
        x[i] = 0;
        continue;
      }
      x[i] = aug[i][9];
      for (let j = i + 1; j < 9; j++) {
        x[i] -= aug[i][j] * x[j];
      }
      x[i] /= aug[i][i];
    }

    // Normalize
    let norm = 0;
    for (let i = 0; i < 9; i++) norm += x[i] * x[i];
    norm = Math.sqrt(norm);
    if (norm < 1e-12) return null;

    h = x.map(v => v / norm);
  }

  // Normalize so h[8] = 1
  if (Math.abs(h[8]) < 1e-12) return null;
  const scale = 1 / h[8];
  return h.map(v => v * scale) as HomographyMatrix;
}

function projectPoint(H: HomographyMatrix, p: Point2D): Point2D {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  if (Math.abs(w) < 1e-12) return { x: 0, y: 0 };
  return {
    x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
    y: (H[3] * p.x + H[4] * p.y + H[5]) / w,
  };
}

// ─── Feature Detector Class ─────────────────────────────────────────────────

export class FeatureDetector {
  private fastThreshold = 20;
  private maxFeatures = 500;
  private nmsRadius = 8;
  private ransacThreshold = 3.0;
  private ransacIterations = 200;

  /**
   * Detect ORB-like features within an optional ROI.
   */
  detectFeatures(
    imageData: ImageData,
    roi?: { x: number; y: number; w: number; h: number },
  ): Feature[] {
    const { width, height } = imageData;
    const gray = toGrayscale(imageData);
    const blurred = gaussianBlur(gray, width, height);

    // Detect FAST corners
    const rawCorners = detectFASTCorners(blurred, width, height, this.fastThreshold, roi);

    // Non-max suppression
    const corners = nonMaxSuppression(rawCorners, this.nmsRadius, this.maxFeatures);

    // Compute orientation and BRIEF descriptor for each corner
    const features: Feature[] = [];
    for (const c of corners) {
      const angle = computeOrientation(blurred, width, c.x, c.y);
      const descriptor = computeDescriptor(blurred, width, c.x, c.y, angle);
      features.push({
        x: c.x,
        y: c.y,
        response: c.response,
        angle,
        descriptor,
      });
    }

    return features;
  }

  /**
   * Match features between two sets using brute-force Hamming distance with cross-check.
   */
  matchFeatures(features1: Feature[], features2: Feature[]): Match[] {
    if (features1.length === 0 || features2.length === 0) return [];

    // Forward matches: for each f1, find best f2
    const forward = new Map<number, { idx: number; dist: number }>();
    for (let i = 0; i < features1.length; i++) {
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let j = 0; j < features2.length; j++) {
        const dist = hammingDistance(features1[i].descriptor, features2[j].descriptor);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = j;
        }
      }
      forward.set(i, { idx: bestIdx, dist: bestDist });
    }

    // Backward matches: for each f2, find best f1
    const backward = new Map<number, number>();
    for (let j = 0; j < features2.length; j++) {
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < features1.length; i++) {
        const dist = hammingDistance(features1[i].descriptor, features2[j].descriptor);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      backward.set(j, bestIdx);
    }

    // Cross-check: keep only mutual best matches
    const matches: Match[] = [];
    const maxDist = DESCRIPTOR_BITS * 0.4; // 40% threshold

    for (const [i, { idx: j, dist }] of forward) {
      if (dist > maxDist) continue;
      if (backward.get(j) === i) {
        matches.push({
          src: features1[i],
          dst: features2[j],
          distance: dist,
        });
      }
    }

    // Sort by distance (best matches first)
    matches.sort((a, b) => a.distance - b.distance);
    return matches;
  }

  /**
   * Estimate a homography from feature matches using RANSAC.
   * Returns null if no valid homography can be found.
   */
  estimateHomography(matches: Match[]): HomographyMatrix | null {
    if (matches.length < 4) return null;

    let bestH: HomographyMatrix | null = null;
    let bestInliers = 0;

    for (let iter = 0; iter < this.ransacIterations; iter++) {
      // Random sample of 4 matches
      const sample = this.randomSample(matches, 4);
      const srcPts = sample.map(m => ({ x: m.src.x, y: m.src.y }));
      const dstPts = sample.map(m => ({ x: m.dst.x, y: m.dst.y }));

      const H = solveHomographyDLT(srcPts, dstPts);
      if (!H) continue;

      // Count inliers
      let inliers = 0;
      for (const m of matches) {
        const projected = projectPoint(H, { x: m.src.x, y: m.src.y });
        const dx = projected.x - m.dst.x;
        const dy = projected.y - m.dst.y;
        if (Math.sqrt(dx * dx + dy * dy) < this.ransacThreshold) {
          inliers++;
        }
      }

      if (inliers > bestInliers) {
        bestInliers = inliers;
        bestH = H;
      }

      // Early exit if most matches are inliers
      if (inliers > matches.length * 0.8) break;
    }

    // Re-estimate from all inliers if we found a good model
    if (bestH && bestInliers >= 4) {
      const inlierMatches = matches.filter(m => {
        const projected = projectPoint(bestH!, { x: m.src.x, y: m.src.y });
        const dx = projected.x - m.dst.x;
        const dy = projected.y - m.dst.y;
        return Math.sqrt(dx * dx + dy * dy) < this.ransacThreshold;
      });

      if (inlierMatches.length >= 4) {
        const srcPts = inlierMatches.map(m => ({ x: m.src.x, y: m.src.y }));
        const dstPts = inlierMatches.map(m => ({ x: m.dst.x, y: m.dst.y }));
        const refined = solveHomographyDLT(srcPts, dstPts);
        if (refined) return refined;
      }
    }

    return bestH;
  }

  private randomSample<T>(arr: T[], count: number): T[] {
    const result: T[] = [];
    const indices = new Set<number>();
    while (indices.size < count && indices.size < arr.length) {
      const idx = Math.floor(Math.random() * arr.length);
      if (!indices.has(idx)) {
        indices.add(idx);
        result.push(arr[idx]);
      }
    }
    return result;
  }
}
