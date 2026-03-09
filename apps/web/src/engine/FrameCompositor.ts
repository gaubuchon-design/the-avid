// =============================================================================
//  THE AVID — Frame Compositor Engine
//  Central rendering pipeline: decodes video frames from sources, composites
//  multiple timeline tracks, applies intrinsic transforms, and outputs
//  ImageBitmap for display in Source/Record monitors.
// =============================================================================

import { videoSourceManager } from './VideoSourceManager';
import type { Track, Clip, IntrinsicVideoProps, SequenceSettings } from '../store/editor.store';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompositorConfig {
  outputWidth: number;
  outputHeight: number;
  backgroundColor: string;
}

interface FrameCache {
  assetId: string;
  time: number;
  bitmap: ImageBitmap;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

class FrameCompositorClass {
  private frameCache: FrameCache[] = [];
  private readonly MAX_CACHE = 30;
  private canvas: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;

  /**
   * Ensure the offscreen canvas exists at the given dimensions.
   */
  private ensureCanvas(w: number, h: number): OffscreenCanvasRenderingContext2D {
    if (!this.canvas || this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas = new OffscreenCanvas(w, h);
      this.ctx = this.canvas.getContext('2d')!;
    }
    return this.ctx!;
  }

  /**
   * Get a cached frame or seek the video source and capture a new one.
   */
  private async getFrame(assetId: string, timeSeconds: number): Promise<ImageBitmap | null> {
    // Check cache (within 1 frame tolerance at 24fps = ~0.04s)
    const cached = this.frameCache.find(
      (f) => f.assetId === assetId && Math.abs(f.time - timeSeconds) < 0.02
    );
    if (cached) return cached.bitmap;

    // Seek and capture
    const source = videoSourceManager.getSource(assetId);
    if (!source?.ready) return null;

    try {
      const bitmap = await videoSourceManager.seekToExactFrame(assetId, timeSeconds);
      if (bitmap) {
        // Add to cache
        this.frameCache.push({ assetId, time: timeSeconds, bitmap });
        if (this.frameCache.length > this.MAX_CACHE) {
          const evicted = this.frameCache.shift();
          evicted?.bitmap.close();
        }
      }
      return bitmap;
    } catch {
      return null;
    }
  }

  /**
   * Apply intrinsic video transforms to a canvas context before drawing a frame.
   */
  private applyTransforms(
    ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
    props: IntrinsicVideoProps,
    frameW: number,
    frameH: number,
    canvasW: number,
    canvasH: number,
  ): void {
    const cx = canvasW / 2 + props.positionX + props.anchorX;
    const cy = canvasH / 2 + props.positionY + props.anchorY;

    ctx.translate(cx, cy);
    ctx.rotate((props.rotation * Math.PI) / 180);
    ctx.scale(props.scaleX / 100, props.scaleY / 100);
    ctx.translate(-cx, -cy);
    ctx.globalAlpha = props.opacity / 100;
  }

  /**
   * Find the clip on a track that is active at a given timeline time.
   */
  private findClipAtTime(track: Track, time: number): Clip | null {
    return track.clips.find(
      (c) => time >= c.startTime && time < c.endTime
    ) ?? null;
  }

  /**
   * Map timeline time to source media time for a clip, accounting for
   * trim offsets and the clip's native frame rate vs sequence frame rate.
   */
  private getSourceTime(clip: Clip, timelineTime: number, seqFps: number, clipFps?: number): number {
    const clipOffset = timelineTime - clip.startTime;
    const rate = clipFps && clipFps !== seqFps ? clipFps / seqFps : 1;

    // If time remap is enabled, evaluate keyframes
    if (clip.timeRemap.enabled && clip.timeRemap.keyframes.length >= 2) {
      return this.evaluateTimeRemap(clip, clipOffset);
    }

    return clip.trimStart + clipOffset * rate;
  }

  /**
   * Evaluate time remap keyframes to get source time.
   */
  private evaluateTimeRemap(clip: Clip, clipOffset: number): number {
    const kfs = clip.timeRemap.keyframes;
    const absTime = clip.startTime + clipOffset;

    // Before first keyframe
    if (absTime <= kfs[0].timelineTime) return kfs[0].sourceTime;
    // After last keyframe
    if (absTime >= kfs[kfs.length - 1].timelineTime) return kfs[kfs.length - 1].sourceTime;

    // Find surrounding keyframes
    for (let i = 0; i < kfs.length - 1; i++) {
      const a = kfs[i], b = kfs[i + 1];
      if (absTime >= a.timelineTime && absTime <= b.timelineTime) {
        const t = (absTime - a.timelineTime) / (b.timelineTime - a.timelineTime);

        if (a.interpolation === 'hold') return a.sourceTime;
        if (a.interpolation === 'linear') {
          return a.sourceTime + t * (b.sourceTime - a.sourceTime);
        }
        // Bezier interpolation (cubic approximation)
        if (a.interpolation === 'bezier') {
          const ct = this.cubicBezier(t, a.bezierOut?.y ?? t, b.bezierIn?.y ?? t);
          return a.sourceTime + ct * (b.sourceTime - a.sourceTime);
        }
      }
    }

    return clip.trimStart + clipOffset;
  }

  private cubicBezier(t: number, p1: number, p2: number): number {
    // Simplified cubic bezier with control points
    const u = 1 - t;
    return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
  }

  /**
   * Render a single source clip frame for the Source Monitor.
   */
  async renderSourceFrame(
    assetId: string,
    timeSeconds: number,
    outputWidth: number,
    outputHeight: number,
  ): Promise<ImageBitmap | null> {
    const bitmap = await this.getFrame(assetId, timeSeconds);
    if (!bitmap) return null;

    // Scale to output size
    const ctx = this.ensureCanvas(outputWidth, outputHeight);
    ctx.clearRect(0, 0, outputWidth, outputHeight);

    // Letterbox / pillarbox to maintain aspect ratio
    const srcAspect = bitmap.width / bitmap.height;
    const outAspect = outputWidth / outputHeight;

    let drawW: number, drawH: number, drawX: number, drawY: number;
    if (srcAspect > outAspect) {
      drawW = outputWidth;
      drawH = outputWidth / srcAspect;
      drawX = 0;
      drawY = (outputHeight - drawH) / 2;
    } else {
      drawH = outputHeight;
      drawW = outputHeight * srcAspect;
      drawX = (outputWidth - drawW) / 2;
      drawY = 0;
    }

    ctx.drawImage(bitmap, drawX, drawY, drawW, drawH);

    return createImageBitmap(this.canvas!);
  }

  /**
   * Render a composited timeline frame for the Record Monitor.
   * Composites all visible video tracks at the given playhead time.
   */
  async renderTimelineFrame(
    tracks: Track[],
    currentTime: number,
    settings: SequenceSettings,
    outputWidth: number,
    outputHeight: number,
  ): Promise<ImageBitmap | null> {
    const ctx = this.ensureCanvas(outputWidth, outputHeight);
    ctx.clearRect(0, 0, outputWidth, outputHeight);

    // Fill with black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, outputWidth, outputHeight);

    // Sort video tracks by sortOrder (bottom to top = lowest sortOrder first)
    const videoTracks = tracks
      .filter((t) => (t.type === 'VIDEO' || t.type === 'GRAPHIC') && !t.muted)
      .sort((a, b) => b.sortOrder - a.sortOrder); // Higher sortOrder = lower in stack

    for (const track of videoTracks) {
      const clip = this.findClipAtTime(track, currentTime);
      if (!clip || !clip.assetId) continue;

      const sourceTime = this.getSourceTime(clip, currentTime, settings.fps);
      const bitmap = await this.getFrame(clip.assetId, sourceTime);
      if (!bitmap) continue;

      // Save context for transforms
      ctx.save();

      // Apply intrinsic video transforms
      this.applyTransforms(ctx, clip.intrinsicVideo, bitmap.width, bitmap.height, outputWidth, outputHeight);

      // Draw with letterboxing
      const srcAspect = bitmap.width / bitmap.height;
      const outAspect = outputWidth / outputHeight;
      let drawW: number, drawH: number, drawX: number, drawY: number;

      if (srcAspect > outAspect) {
        drawW = outputWidth;
        drawH = outputWidth / srcAspect;
        drawX = 0;
        drawY = (outputHeight - drawH) / 2;
      } else {
        drawH = outputHeight;
        drawW = outputHeight * srcAspect;
        drawX = (outputWidth - drawW) / 2;
        drawY = 0;
      }

      ctx.drawImage(bitmap, drawX, drawY, drawW, drawH);
      ctx.restore();
    }

    return createImageBitmap(this.canvas!);
  }

  /**
   * Clear the frame cache (call when seeking or switching sequences).
   */
  clearCache(): void {
    for (const entry of this.frameCache) {
      entry.bitmap.close();
    }
    this.frameCache = [];
  }
}

export const frameCompositor = new FrameCompositorClass();
