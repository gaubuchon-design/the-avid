// =============================================================================
//  THE AVID — Shared Record Monitor Compositing Pipeline
//  Single source of truth for rendering composited timeline frames.
//  Used by both RecordMonitor (dual mode) and MonitorArea (full-record mode).
//  Applies intrinsic video transforms, effects, titles, subtitles, safe zones.
// =============================================================================

import { videoSourceManager } from './VideoSourceManager';
import { effectsEngine } from './EffectsEngine';
import { buildPlaybackSnapshot, type PlaybackSnapshot } from './PlaybackSnapshot';
import { processEffectsFrame } from './effectsEngineInterop';
import { renderTitle } from './TitleRenderer';
import type {
  Track,
  Clip,
  IntrinsicVideoProps,
  SubtitleTrack,
  TitleClipData,
} from '../store/editor.store';
import type { ScopeType } from '../store/player.store';
import { getClipSourceTime } from './clipTiming';
import type { EffectRenderQuality } from './EffectsEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompositingContext {
  ctx: CanvasRenderingContext2D;
  canvasW: number;
  canvasH: number;
  playheadTime: number;
  tracks: Track[];
  fps: number;
  aspectRatio: number;
  showSafeZones: boolean;
  isPlaying: boolean;
  // Title compositing
  titleClips: TitleClipData[];
  subtitleTracks: SubtitleTrack[];
  currentTitle: any | null;
  isTitleEditing: boolean;
}

export interface PlaybackCompositingContext {
  ctx: CanvasRenderingContext2D;
  canvasW: number;
  canvasH: number;
  snapshot: PlaybackSnapshot;
  currentTitle: any | null;
  isTitleEditing: boolean;
  overlayProcessing?: 'pre' | 'post';
  effectQuality?: EffectRenderQuality;
}

export interface PlaybackVideoLayerAvailability {
  totalVideoLayers: number;
  drawableVideoLayers: number;
  pendingVideoLayers: number;
}

let layerScratchCanvas: HTMLCanvasElement | null = null;

// ─── Exported Helpers ─────────────────────────────────────────────────────────

/** Find the topmost visible video clip at a given timeline time. */
export function findActiveClip(tracks: Track[], time: number): Clip | null {
  const videoTracks = tracks
    .filter((t) => (t.type === 'VIDEO' || t.type === 'GRAPHIC') && !t.muted)
    .sort((a, b) => b.sortOrder - a.sortOrder);

  for (const track of videoTracks) {
    const clip = track.clips.find((c) => time >= c.startTime && time < c.endTime);
    if (clip?.assetId) return clip;
  }
  return null;
}

/** Find the topmost active timeline media clip, preferring real video over graphic overlays. */
export function findActiveMediaClip(tracks: Track[], time: number): Clip | null {
  const findOnTrackType = (trackType: Track['type']) => {
    const orderedTracks = tracks
      .filter((track) => track.type === trackType && !track.muted)
      .sort((left, right) => right.sortOrder - left.sortOrder);

    for (const track of orderedTracks) {
      const clip = track.clips.find(
        (candidate) =>
          Boolean(candidate.assetId) && time >= candidate.startTime && time < candidate.endTime
      );
      if (clip?.assetId) {
        return clip;
      }
    }

    return null;
  };

  return findOnTrackType('VIDEO') ?? findOnTrackType('GRAPHIC');
}

/** Map timeline time to source media time for a clip. */
export function getSourceTime(clip: Clip, timelineTime: number): number {
  return getClipSourceTime(clip, timelineTime);
}

// ─── Intrinsic Transform Application ──────────────────────────────────────────
//  Ported from FrameCompositor.applyTransforms() (lines 77-93)
//  Applies position, rotation, scale, anchor, and opacity as canvas transforms.

function applyIntrinsicTransforms(
  ctx: CanvasRenderingContext2D,
  props: IntrinsicVideoProps,
  canvasW: number,
  canvasH: number
): void {
  // Only apply transforms if non-default
  const hasTransform =
    props.positionX !== 0 ||
    props.positionY !== 0 ||
    props.scaleX !== 100 ||
    props.scaleY !== 100 ||
    props.rotation !== 0 ||
    props.anchorX !== 0 ||
    props.anchorY !== 0;

  if (hasTransform) {
    const cx = canvasW / 2 + props.positionX + props.anchorX;
    const cy = canvasH / 2 + props.positionY + props.anchorY;

    ctx.translate(cx, cy);
    ctx.rotate((props.rotation * Math.PI) / 180);
    ctx.scale(props.scaleX / 100, props.scaleY / 100);
    ctx.translate(-cx, -cy);
  }

  if (props.opacity !== 100) {
    ctx.globalAlpha = props.opacity / 100;
  }
}

function getLayerRenderContext(
  width: number,
  height: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') {
    return null;
  }

  if (!layerScratchCanvas) {
    layerScratchCanvas = document.createElement('canvas');
  }

  layerScratchCanvas.width = width;
  layerScratchCanvas.height = height;
  const layerCtx = layerScratchCanvas.getContext('2d');
  if (!layerCtx) {
    return null;
  }

  layerCtx.setTransform?.(1, 0, 0, 1, 0, 0);
  layerCtx.clearRect(0, 0, width, height);
  return {
    canvas: layerScratchCanvas,
    ctx: layerCtx,
  };
}

function applyClipEffectsToLayer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  clipId: string,
  frameNumber: number,
  quality: EffectRenderQuality
): void {
  const clipEffects = effectsEngine.getClipEffects(clipId);
  if (clipEffects.length === 0) {
    return;
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  processEffectsFrame(imageData, clipEffects, frameNumber, quality);
  ctx.putImageData(imageData, 0, 0);
}

function applyEffectLayerToComposite(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  clipId: string,
  frameNumber: number,
  quality: EffectRenderQuality
): void {
  const effectStack = effectsEngine.getClipEffects(clipId);
  if (effectStack.length === 0) {
    return;
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  processEffectsFrame(imageData, effectStack, frameNumber, quality);
  ctx.putImageData(imageData, 0, 0);
}

// ─── Video Playback Sync ──────────────────────────────────────────────────────
//  Properly manages video.play()/pause() instead of seeking every frame.

/**
 * Sync a video element's playback state with the timeline.
 * During playback: lets the video play natively, only correcting drift.
 * When paused: seeks to the exact frame.
 */
export function syncVideoPlayback(
  clip: Clip,
  isPlaying: boolean,
  playheadTime: number,
  fps: number
): void {
  if (!clip.assetId) return;
  const source = videoSourceManager.getSource(clip.assetId);
  if (!source?.element || !source.ready) return;

  const vid = source.element;
  const sourceTime = getSourceTime(clip, playheadTime);
  const frameTolerance = fps > 0 ? Math.max(0.5 / fps, 0.02) : 0.02;

  if (isPlaying) {
    // During playback: use native video.play(), only correct excessive drift
    if (vid.paused) {
      vid.currentTime = sourceTime;
      vid.play().catch(() => {});
    }
    // Correct drift if video is more than 2 frames away from expected position
    const frameDuration = 1 / fps;
    const drift = Math.abs(vid.currentTime - sourceTime);
    if (drift > frameDuration * 2) {
      vid.currentTime = sourceTime;
    }
  } else {
    // When paused: stop video and seek to exact frame
    if (!vid.paused) vid.pause();
    if (!vid.seeking && Math.abs(vid.currentTime - sourceTime) > frameTolerance) {
      vid.currentTime = sourceTime;
    }
  }
}

/**
 * Pause a video element by asset ID (used during clip transitions).
 */
export function pauseVideoSource(assetId: string): void {
  const source = videoSourceManager.getSource(assetId);
  if (source?.element && !source.element.paused) {
    source.element.pause();
  }
}

/**
 * Try to load a video source from bin assets if not already loaded.
 */
export function tryLoadClipSource(
  assetId: string,
  bins: Array<{
    assets: Array<{ id: string; fileHandle?: File; playbackUrl?: string }>;
    children: any[];
  }>
): void {
  if (videoSourceManager.getSource(assetId)) return;

  const search = (binList: typeof bins): void => {
    for (const bin of binList) {
      const asset = bin.assets.find((a) => a.id === assetId);
      if (asset && (asset.fileHandle || asset.playbackUrl)) {
        const urlOrFile = asset.fileHandle ?? asset.playbackUrl!;
        videoSourceManager.loadSource(assetId, urlOrFile).catch(() => {});
        return;
      }
      if (bin.children) search(bin.children);
    }
  };
  search(bins);
}

export function inspectPlaybackVideoLayerAvailability(
  snapshot: PlaybackSnapshot
): PlaybackVideoLayerAvailability {
  let totalVideoLayers = 0;
  let drawableVideoLayers = 0;

  for (const layer of snapshot.videoLayers) {
    if (!layer.assetId) {
      continue;
    }

    totalVideoLayers += 1;
    const source = videoSourceManager.getSource(layer.assetId);
    const vid = source?.element;
    const isDrawable = Boolean(
      vid && source?.ready && vid.readyState >= 2 && (snapshot.isPlaying || !vid.seeking)
    );

    if (isDrawable) {
      drawableVideoLayers += 1;
    }
  }

  return {
    totalVideoLayers,
    drawableVideoLayers,
    pendingVideoLayers: totalVideoLayers - drawableVideoLayers,
  };
}

// ─── Compositing Pipeline ─────────────────────────────────────────────────────

/**
 * Render a complete composited record monitor frame.
 *
 * Pipeline:
 * 1. Clear to black
 * 2. For each video/graphic track (bottom-to-top):
 *    a. Apply intrinsic transforms (position, scale, rotation, anchor, opacity)
 *    b. Draw video frame with letterboxing
 *    c. Apply clip effects via EffectsEngine
 * 3. Composite GRAPHIC track titles
 * 4. Composite SUBTITLE track cues
 * 5. Draw safe zones overlay
 * 6. Draw placeholder if no video was drawn
 */
export function compositeRecordFrame(cx: CompositingContext): void {
  const snapshot = buildPlaybackSnapshot(
    {
      tracks: cx.tracks,
      subtitleTracks: cx.subtitleTracks,
      titleClips: cx.titleClips,
      playheadTime: cx.playheadTime,
      duration: 0,
      isPlaying: cx.isPlaying,
      showSafeZones: cx.showSafeZones,
      activeMonitor: 'record',
      activeScope: null as ScopeType | null,
      sequenceSettings: {
        fps: cx.fps,
        width: Math.round(cx.aspectRatio * 1000),
        height: 1000,
      },
      projectSettings: {
        frameRate: cx.fps,
        width: Math.round(cx.aspectRatio * 1000),
        height: 1000,
      },
    },
    'record-monitor'
  );
  compositePlaybackSnapshot({
    ctx: cx.ctx,
    canvasW: cx.canvasW,
    canvasH: cx.canvasH,
    snapshot,
    currentTitle: cx.currentTitle,
    isTitleEditing: cx.isTitleEditing,
  });
}

export function compositePlaybackSnapshot(cx: PlaybackCompositingContext): void {
  const { ctx, canvasW, canvasH, snapshot } = cx;
  const overlayProcessing = cx.overlayProcessing ?? 'post';
  const effectQuality = cx.effectQuality ?? 'preview';
  const compositorOwnsSeeking =
    !snapshot.isPlaying && (snapshot.consumer === 'export' || snapshot.consumer === 'scope');
  const frameTolerance = snapshot.fps > 0 ? Math.max(0.5 / snapshot.fps, 0.02) : 0.02;

  // 1. Clear to black
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvasW, canvasH);

  let drewVideo = false;

  for (const layer of snapshot.videoLayers) {
    const clip = layer.clip;
    if (!layer.assetId) continue;

    const source = videoSourceManager.getSource(layer.assetId);
    const vid = source?.element;
    if (!vid || !source.ready || vid.readyState < 2) continue;

    // Export/scope rendering drives its own seeking. Monitor rendering syncs earlier.
    if (
      compositorOwnsSeeking &&
      !vid.seeking &&
      Math.abs(vid.currentTime - layer.sourceTime) > frameTolerance
    ) {
      vid.currentTime = layer.sourceTime;
    }

    // 2a. Calculate letterboxed draw rect
    const videoAR = vid.videoWidth / vid.videoHeight;
    let drawW = canvasW,
      drawH = canvasH,
      drawX = 0,
      drawY = 0;
    if (videoAR > snapshot.aspectRatio) {
      drawH = Math.floor(canvasW / videoAR);
      drawY = Math.floor((canvasH - drawH) / 2);
    } else if (videoAR < snapshot.aspectRatio) {
      drawW = Math.floor(canvasH * videoAR);
      drawX = Math.floor((canvasW - drawW) / 2);
    }

    const layerRender = getLayerRenderContext(canvasW, canvasH);
    const blendMode = (clip.blendMode ??
      layer.trackBlendMode ??
      'source-over') as GlobalCompositeOperation;

    if (layerRender) {
      // Render the clip into an isolated layer so effects only touch that layer.
      layerRender.ctx.save();
      applyIntrinsicTransforms(layerRender.ctx, clip.intrinsicVideo, canvasW, canvasH);
      layerRender.ctx.drawImage(vid, drawX, drawY, drawW, drawH);
      layerRender.ctx.restore();

      applyClipEffectsToLayer(
        layerRender.ctx,
        canvasW,
        canvasH,
        clip.id,
        snapshot.frameNumber,
        effectQuality
      );

      ctx.save();
      ctx.globalCompositeOperation = blendMode;
      ctx.drawImage(layerRender.canvas, 0, 0, canvasW, canvasH);
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalCompositeOperation = blendMode;
      applyIntrinsicTransforms(ctx, clip.intrinsicVideo, canvasW, canvasH);
      ctx.drawImage(vid, drawX, drawY, drawW, drawH);
      ctx.restore();
    }

    drewVideo = true;
  }

  for (const effectLayer of snapshot.effectLayers) {
    applyEffectLayerToComposite(
      ctx,
      canvasW,
      canvasH,
      effectLayer.clip.id,
      snapshot.frameNumber,
      effectQuality
    );
  }

  if (overlayProcessing === 'post') {
    // 3. Composite title graphics (GRAPHIC track title clips)
    if (cx.currentTitle && cx.isTitleEditing) {
      renderTitle(ctx, cx.currentTitle, canvasW, canvasH, snapshot.frameNumber, snapshot.fps);
    }

    for (const titleLayer of snapshot.titleLayers) {
      renderTitle(
        ctx,
        titleLayer.titleClip as any,
        canvasW,
        canvasH,
        titleLayer.frameOffset,
        snapshot.fps
      );
    }

    for (const subtitleCue of snapshot.subtitleCues) {
      renderSubtitleCue(ctx, subtitleCue.cue, canvasW, canvasH);
    }

    // 5. Safe zones overlay
    if (snapshot.showSafeZones) {
      drawSafeZones(ctx, canvasW, canvasH);
    }
  }

  // 6. Placeholder when no video is drawn
  if (!drewVideo && overlayProcessing === 'post') {
    drawRecordPlaceholder(ctx, canvasW, canvasH, snapshot.playheadTime, snapshot.fps);
  }
}

// ─── Subtitle Rendering ──────────────────────────────────────────────────────

function renderSubtitleCue(
  ctx: CanvasRenderingContext2D,
  cue: {
    text: string;
    style?: { fontSize?: number; position?: string; color?: string; bgOpacity?: number };
  },
  w: number,
  h: number
): void {
  const fontSize = cue.style?.fontSize || Math.max(16, w * 0.028);
  const yPos = cue.style?.position === 'top' ? h * 0.08 : h * 0.88;

  ctx.save();
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Background bar
  const textWidth = ctx.measureText(cue.text).width;
  const bgOpacity = cue.style?.bgOpacity ?? 0.7;
  ctx.fillStyle = `rgba(0, 0, 0, ${bgOpacity})`;
  ctx.fillRect(w / 2 - textWidth / 2 - 12, yPos - fontSize / 2 - 4, textWidth + 24, fontSize + 8);

  // Text
  ctx.fillStyle = cue.style?.color || '#ffffff';
  ctx.fillText(cue.text, w / 2, yPos);
  ctx.restore();
}

// ─── Safe Zones ───────────────────────────────────────────────────────────────

function drawSafeZones(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  // Action safe (90%)
  const actionInset = 0.05;
  ctx.strokeRect(
    w * actionInset,
    h * actionInset,
    w * (1 - 2 * actionInset),
    h * (1 - 2 * actionInset)
  );

  // Title safe (80%)
  const titleInset = 0.1;
  ctx.strokeRect(
    w * titleInset,
    h * titleInset,
    w * (1 - 2 * titleInset),
    h * (1 - 2 * titleInset)
  );

  ctx.setLineDash([]);
}

// ─── Placeholder ──────────────────────────────────────────────────────────────

function timeToTimecode(sec: number, fps = 24): string {
  const totalFrames = Math.round(sec * fps);
  const h = Math.floor(totalFrames / (fps * 3600));
  const m = Math.floor((totalFrames % (fps * 3600)) / (fps * 60));
  const s = Math.floor((totalFrames % (fps * 60)) / fps);
  const f = totalFrames % Math.ceil(fps);
  return (
    String(h).padStart(2, '0') +
    ':' +
    String(m).padStart(2, '0') +
    ':' +
    String(s).padStart(2, '0') +
    ':' +
    String(f).padStart(2, '0')
  );
}

function drawRecordPlaceholder(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  fps: number
): void {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.font = '700 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RECORD', w / 2, h / 2 - 10);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.font = '500 13px monospace';
  ctx.fillText(timeToTimecode(time, fps), w / 2, h / 2 + 16);

  // Progress bar
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fillRect(0, h - 3, w, 3);
}
