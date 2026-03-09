// =============================================================================
//  THE AVID — Planar Tracker (Mocha-style)
//  Region-based planar motion tracking using feature detection, matching,
//  and homography estimation. Supports forward/backward tracking, exports
//  tracking data as keyframes for effects (corner pin, stabilize, etc.).
// =============================================================================

import { FeatureDetector } from './FeatureDetector';
import type { Keyframe } from '../EffectsEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Point2D {
  x: number;
  y: number;
}

/** A 3x3 homography matrix stored as a flat 9-element array. */
export type HomographyMatrix = [
  number, number, number,
  number, number, number,
  number, number, number,
];

/** Decomposed transform data from a homography. */
export interface DecomposedTransform {
  position: Point2D;
  scale: Point2D;
  rotation: number; // degrees
  cornerPin: {
    topLeft: Point2D;
    topRight: Point2D;
    bottomLeft: Point2D;
    bottomRight: Point2D;
  };
}

/** Per-frame tracking result. */
export interface FrameTrackingResult {
  frame: number;
  homography: HomographyMatrix;
  decomposed: DecomposedTransform;
  confidence: number; // 0-1, percentage of inlier matches
  matchCount: number;
}

/** A tracking region defined by polygon control points. */
export interface TrackRegion {
  id: string;
  points: Point2D[]; // polygon vertices defining the region of interest
  type: 'polygon' | 'rectangle';
}

/** Complete tracking session data. */
export interface TrackingData {
  regionId: string;
  startFrame: number;
  endFrame: number;
  direction: 'forward' | 'backward';
  frames: Map<number, FrameTrackingResult>;
  status: 'idle' | 'tracking' | 'completed' | 'failed';
  progress: number; // 0-1
  error?: string;
}

export type FrameProvider = (frame: number) => Promise<ImageData>;

// ─── Identity homography ──────────────────────────────────────────────────────

const IDENTITY: HomographyMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Get the bounding box of a polygon region. */
function regionBounds(points: Point2D[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Apply a homography to a 2D point. */
function transformPoint(h: HomographyMatrix, p: Point2D): Point2D {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / w,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / w,
  };
}

/** Multiply two 3x3 matrices. */
function multiplyHomography(a: HomographyMatrix, b: HomographyMatrix): HomographyMatrix {
  const r: number[] = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return r as HomographyMatrix;
}

/** Decompose a homography into position, scale, rotation, and corner pin. */
function decomposeHomography(
  h: HomographyMatrix,
  regionW: number,
  regionH: number,
  originX: number,
  originY: number,
): DecomposedTransform {
  // Map the four corners of the original region through the cumulative homography
  const tl = transformPoint(h, { x: originX, y: originY });
  const tr = transformPoint(h, { x: originX + regionW, y: originY });
  const bl = transformPoint(h, { x: originX, y: originY + regionH });
  const br = transformPoint(h, { x: originX + regionW, y: originY + regionH });

  // Center = average of all four corners
  const cx = (tl.x + tr.x + bl.x + br.x) / 4;
  const cy = (tl.y + tr.y + bl.y + br.y) / 4;

  // Scale: average edge length ratio
  const topEdge = Math.sqrt((tr.x - tl.x) ** 2 + (tr.y - tl.y) ** 2);
  const leftEdge = Math.sqrt((bl.x - tl.x) ** 2 + (bl.y - tl.y) ** 2);
  const scaleX = topEdge / regionW;
  const scaleY = leftEdge / regionH;

  // Rotation: angle of top edge
  const rotation = Math.atan2(tr.y - tl.y, tr.x - tl.x) * (180 / Math.PI);

  return {
    position: { x: cx - (originX + regionW / 2), y: cy - (originY + regionH / 2) },
    scale: { x: scaleX * 100, y: scaleY * 100 },
    rotation,
    cornerPin: { topLeft: tl, topRight: tr, bottomLeft: bl, bottomRight: br },
  };
}

// ─── Tracker Class ────────────────────────────────────────────────────────────

export class PlanarTracker {
  private detector = new FeatureDetector();
  private abortController: AbortController | null = null;

  /**
   * Track a region forward through a frame range.
   * Calls the frame provider to get each frame's ImageData.
   * Emits progress via onProgress callback.
   */
  async trackForward(
    region: TrackRegion,
    startFrame: number,
    endFrame: number,
    getFrame: FrameProvider,
    onProgress?: (data: TrackingData) => void,
  ): Promise<TrackingData> {
    return this.track(region, startFrame, endFrame, 1, getFrame, onProgress);
  }

  /**
   * Track a region backward through a frame range.
   */
  async trackBackward(
    region: TrackRegion,
    startFrame: number,
    endFrame: number,
    getFrame: FrameProvider,
    onProgress?: (data: TrackingData) => void,
  ): Promise<TrackingData> {
    return this.track(region, endFrame, startFrame, -1, getFrame, onProgress);
  }

  /**
   * Cancel an in-progress tracking operation.
   */
  cancel(): void {
    this.abortController?.abort();
  }

  /**
   * Core tracking loop. Processes frame pairs sequentially, detecting features
   * within the ROI, matching between frames, and estimating per-frame homography.
   */
  private async track(
    region: TrackRegion,
    from: number,
    to: number,
    step: number,
    getFrame: FrameProvider,
    onProgress?: (data: TrackingData) => void,
  ): Promise<TrackingData> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const data: TrackingData = {
      regionId: region.id,
      startFrame: Math.min(from, to),
      endFrame: Math.max(from, to),
      direction: step > 0 ? 'forward' : 'backward',
      frames: new Map(),
      status: 'tracking',
      progress: 0,
    };

    const totalFrames = Math.abs(to - from);
    if (totalFrames === 0) {
      data.status = 'completed';
      data.progress = 1;
      return data;
    }

    const bounds = regionBounds(region.points);

    try {
      let prevFrame = await getFrame(from);
      let prevFeatures = this.detector.detectFeatures(prevFrame, bounds);
      let cumulativeH: HomographyMatrix = [...IDENTITY];

      // Store initial frame result (identity)
      data.frames.set(from, {
        frame: from,
        homography: [...IDENTITY],
        decomposed: decomposeHomography(IDENTITY, bounds.w, bounds.h, bounds.x, bounds.y),
        confidence: 1,
        matchCount: prevFeatures.length,
      });

      let framesDone = 0;

      for (let f = from + step; step > 0 ? f <= to : f >= to; f += step) {
        if (signal.aborted) {
          data.status = 'failed';
          data.error = 'Tracking cancelled';
          return data;
        }

        const currentFrame = await getFrame(f);
        const currentFeatures = this.detector.detectFeatures(currentFrame, bounds);

        // Match features between consecutive frames
        const matches = this.detector.matchFeatures(prevFeatures, currentFeatures);

        if (matches.length < 4) {
          // Not enough matches — tracking lost, use previous homography
          data.frames.set(f, {
            frame: f,
            homography: [...cumulativeH],
            decomposed: decomposeHomography(cumulativeH, bounds.w, bounds.h, bounds.x, bounds.y),
            confidence: 0,
            matchCount: matches.length,
          });
        } else {
          // Estimate homography via DLT + RANSAC
          const frameH = this.detector.estimateHomography(matches);
          if (frameH) {
            cumulativeH = multiplyHomography(frameH, cumulativeH);
            const inlierRatio = matches.length / Math.max(prevFeatures.length, 1);
            data.frames.set(f, {
              frame: f,
              homography: [...cumulativeH],
              decomposed: decomposeHomography(cumulativeH, bounds.w, bounds.h, bounds.x, bounds.y),
              confidence: Math.min(1, inlierRatio),
              matchCount: matches.length,
            });
          } else {
            data.frames.set(f, {
              frame: f,
              homography: [...cumulativeH],
              decomposed: decomposeHomography(cumulativeH, bounds.w, bounds.h, bounds.x, bounds.y),
              confidence: 0,
              matchCount: matches.length,
            });
          }
        }

        // Update ROI for next frame based on current tracking
        prevFrame = currentFrame;
        prevFeatures = currentFeatures;
        framesDone++;
        data.progress = framesDone / totalFrames;
        onProgress?.(data);

        // Yield to event loop every 10 frames for UI responsiveness
        if (framesDone % 10 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      data.status = 'completed';
      data.progress = 1;
      onProgress?.(data);
    } catch (err) {
      data.status = 'failed';
      data.error = err instanceof Error ? err.message : 'Unknown tracking error';
    }

    return data;
  }

  /**
   * Export tracking data as effect keyframes (position, scale, rotation).
   * Suitable for applying to intrinsic video properties or stabilization.
   */
  exportAsKeyframes(trackingData: TrackingData): Keyframe[] {
    const keyframes: Keyframe[] = [];

    for (const [frame, result] of trackingData.frames) {
      const { position, scale, rotation } = result.decomposed;

      keyframes.push(
        { frame, paramName: 'positionX', value: position.x, interpolation: 'linear' },
        { frame, paramName: 'positionY', value: position.y, interpolation: 'linear' },
        { frame, paramName: 'scaleX', value: scale.x, interpolation: 'linear' },
        { frame, paramName: 'scaleY', value: scale.y, interpolation: 'linear' },
        { frame, paramName: 'rotation', value: rotation, interpolation: 'linear' },
      );
    }

    return keyframes;
  }

  /**
   * Export tracking data as per-frame corner pin coordinates.
   * Each entry maps a frame number to four corner positions (0-100% normalized).
   */
  exportAsCornerPin(
    trackingData: TrackingData,
    imageWidth: number,
    imageHeight: number,
  ): Keyframe[] {
    const keyframes: Keyframe[] = [];

    for (const [frame, result] of trackingData.frames) {
      const { cornerPin } = result.decomposed;

      keyframes.push(
        { frame, paramName: 'topLeftX', value: (cornerPin.topLeft.x / imageWidth) * 100, interpolation: 'linear' },
        { frame, paramName: 'topLeftY', value: (cornerPin.topLeft.y / imageHeight) * 100, interpolation: 'linear' },
        { frame, paramName: 'topRightX', value: (cornerPin.topRight.x / imageWidth) * 100, interpolation: 'linear' },
        { frame, paramName: 'topRightY', value: (cornerPin.topRight.y / imageHeight) * 100, interpolation: 'linear' },
        { frame, paramName: 'bottomLeftX', value: (cornerPin.bottomLeft.x / imageWidth) * 100, interpolation: 'linear' },
        { frame, paramName: 'bottomLeftY', value: (cornerPin.bottomLeft.y / imageHeight) * 100, interpolation: 'linear' },
        { frame, paramName: 'bottomRightX', value: (cornerPin.bottomRight.x / imageWidth) * 100, interpolation: 'linear' },
        { frame, paramName: 'bottomRightY', value: (cornerPin.bottomRight.y / imageHeight) * 100, interpolation: 'linear' },
      );
    }

    return keyframes;
  }
}

export const planarTracker = new PlanarTracker();
