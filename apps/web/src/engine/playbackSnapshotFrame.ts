import type { PlaybackSnapshot } from './PlaybackSnapshot';
import { buildPlaybackFrameSignature } from './PlaybackSnapshot';
import { colorEngine } from './ColorEngine';
import type { TitleData } from './TitleRenderer';
import { compositePlaybackSnapshot } from './compositeRecordFrame';

export type PlaybackColorProcessing = 'pre' | 'post';

export interface PlaybackSnapshotFrameOptions {
  snapshot: PlaybackSnapshot;
  width: number;
  height: number;
  currentTitle?: TitleData | null;
  isTitleEditing?: boolean;
  canvas?: HTMLCanvasElement | null;
  colorProcessing?: PlaybackColorProcessing;
  useCache?: boolean;
}

export interface PlaybackSnapshotFrameResult {
  canvas: HTMLCanvasElement | null;
  frameRevision: string;
  cacheHit: boolean;
}

export interface PlaybackSnapshotImageDataResult {
  imageData: ImageData | null;
  frameRevision: string;
  cacheHit: boolean;
}

let scratchCanvas: HTMLCanvasElement | null = null;
const playbackFrameCache = new Map<string, ImageData>();
const PLAYBACK_FRAME_CACHE_LIMIT = 24;

function cloneImageData(imageData: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
}

function rememberCachedFrame(frameRevision: string, imageData: ImageData): void {
  if (playbackFrameCache.has(frameRevision)) {
    playbackFrameCache.delete(frameRevision);
  }

  playbackFrameCache.set(frameRevision, cloneImageData(imageData));

  while (playbackFrameCache.size > PLAYBACK_FRAME_CACHE_LIMIT) {
    const oldestKey = playbackFrameCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    playbackFrameCache.delete(oldestKey);
  }
}

function resolveRenderCanvas(
  targetCanvas: HTMLCanvasElement | null | undefined,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  if (targetCanvas) {
    targetCanvas.width = width;
    targetCanvas.height = height;
    return targetCanvas;
  }

  if (typeof document === 'undefined') {
    return null;
  }

  if (!scratchCanvas) {
    scratchCanvas = document.createElement('canvas');
  }

  scratchCanvas.width = width;
  scratchCanvas.height = height;
  return scratchCanvas;
}

export function buildPlaybackSnapshotRenderRevision(options: PlaybackSnapshotFrameOptions): string {
  const titleRevision = options.isTitleEditing && options.currentTitle
    ? `title-edit:${String((options.currentTitle as { id?: unknown }).id ?? 'draft')}`
    : 'title-static';
  const colorRevision = options.colorProcessing === 'post'
    ? colorEngine.getProcessingRevision()
    : 'pre';

  return [
    buildPlaybackFrameSignature(options.snapshot),
    `${options.width}x${options.height}`,
    options.snapshot.activeMonitor,
    options.snapshot.showSafeZones ? 'safezones' : 'clean',
    options.colorProcessing ?? 'pre',
    colorRevision,
    titleRevision,
  ].join(':');
}

function shouldUsePlaybackFrameCache(options: PlaybackSnapshotFrameOptions): boolean {
  if (options.useCache === false) {
    return false;
  }

  if (options.snapshot.isPlaying) {
    return false;
  }

  if (options.isTitleEditing && options.currentTitle) {
    return false;
  }

  return true;
}

function compositeSnapshotToCanvas(
  canvas: HTMLCanvasElement,
  options: PlaybackSnapshotFrameOptions,
): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  compositePlaybackSnapshot({
    ctx,
    canvasW: options.width,
    canvasH: options.height,
    snapshot: options.snapshot,
    currentTitle: options.currentTitle ?? null,
    isTitleEditing: options.isTitleEditing ?? false,
  });

  return ctx;
}

export function evaluatePlaybackSnapshotImageData(
  options: PlaybackSnapshotFrameOptions,
): PlaybackSnapshotImageDataResult {
  const frameRevision = buildPlaybackSnapshotRenderRevision(options);
  const canUseCache = shouldUsePlaybackFrameCache(options);
  if (canUseCache) {
    const cached = playbackFrameCache.get(frameRevision);
    if (cached) {
      return {
        imageData: cloneImageData(cached),
        frameRevision,
        cacheHit: true,
      };
    }
  }

  const canvas = resolveRenderCanvas(options.canvas, options.width, options.height);
  if (!canvas) {
    return {
      imageData: null,
      frameRevision,
      cacheHit: false,
    };
  }

  const ctx = compositeSnapshotToCanvas(canvas, options);
  if (!ctx) {
    return {
      imageData: null,
      frameRevision,
      cacheHit: false,
    };
  }

  let imageData = ctx.getImageData(0, 0, options.width, options.height);
  if ((options.colorProcessing ?? 'pre') === 'post') {
    imageData = colorEngine.processFrame(imageData);
  }

  if (canUseCache) {
    rememberCachedFrame(frameRevision, imageData);
  }

  return {
    imageData: cloneImageData(imageData),
    frameRevision,
    cacheHit: false,
  };
}

export function renderPlaybackSnapshotFrame(options: PlaybackSnapshotFrameOptions): PlaybackSnapshotFrameResult {
  const frameRevision = buildPlaybackSnapshotRenderRevision(options);
  const canvas = resolveRenderCanvas(options.canvas, options.width, options.height);
  if (!canvas) {
    return {
      canvas: null,
      frameRevision,
      cacheHit: false,
    };
  }

  if ((options.colorProcessing ?? 'pre') === 'pre' && !shouldUsePlaybackFrameCache(options)) {
    compositeSnapshotToCanvas(canvas, options);
    return {
      canvas,
      frameRevision,
      cacheHit: false,
    };
  }

  const result = evaluatePlaybackSnapshotImageData({
    ...options,
    canvas: null,
  });
  const ctx = canvas.getContext('2d');
  if (!ctx || !result.imageData) {
    return {
      canvas,
      frameRevision: result.frameRevision,
      cacheHit: result.cacheHit,
    };
  }

  ctx.putImageData(result.imageData, 0, 0);
  return {
    canvas,
    frameRevision: result.frameRevision,
    cacheHit: result.cacheHit,
  };
}

export function capturePlaybackSnapshotImageData(options: PlaybackSnapshotFrameOptions): ImageData | null {
  return evaluatePlaybackSnapshotImageData(options).imageData;
}

export function resetPlaybackSnapshotFrameCache(): void {
  playbackFrameCache.clear();
}
