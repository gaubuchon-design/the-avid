import type { PlaybackConsumer, PlaybackSnapshot } from './PlaybackSnapshot';
import { buildPlaybackFrameSignature } from './PlaybackSnapshot';
import { colorEngine } from './ColorEngine';
import type { TitleData } from './TitleRenderer';
import { compositePlaybackSnapshot } from './compositeRecordFrame';

export type PlaybackColorProcessing = 'pre' | 'post';
export type PlaybackOverlayProcessing = 'pre' | 'post';

export interface PlaybackSnapshotFrameOptions {
  snapshot: PlaybackSnapshot;
  width: number;
  height: number;
  currentTitle?: TitleData | null;
  isTitleEditing?: boolean;
  canvas?: HTMLCanvasElement | null;
  colorProcessing?: PlaybackColorProcessing;
  overlayProcessing?: PlaybackOverlayProcessing;
  useCache?: boolean;
}

export interface PlaybackSnapshotFrameResult {
  canvas: HTMLCanvasElement | null;
  frameRevision: string;
  cacheHit: boolean;
  degradedToPreColor?: boolean;
}

export interface PlaybackSnapshotImageDataResult {
  imageData: ImageData | null;
  frameRevision: string;
  cacheHit: boolean;
  degradedToPreColor?: boolean;
}

export interface PlaybackRealtimeFallbackStats {
  consumer: PlaybackConsumer | 'all';
  totalTransportFrames: number;
  degradedTransportFrames: number;
  fallbackRate: number;
  lastDegradedAt: number | null;
  lastFrameRevision: string | null;
}

let scratchCanvas: HTMLCanvasElement | null = null;
const playbackFrameCache = new Map<string, ImageData>();
const playbackCanvasCache = new Map<string, HTMLCanvasElement>();
const PLAYBACK_FRAME_CACHE_LIMIT = 24;
const realtimeFallbackStats = new Map<PlaybackConsumer, PlaybackRealtimeFallbackStats>([
  ['record-monitor', createEmptyRealtimeFallbackStats('record-monitor')],
  ['program-monitor', createEmptyRealtimeFallbackStats('program-monitor')],
  ['scope', createEmptyRealtimeFallbackStats('scope')],
  ['export', createEmptyRealtimeFallbackStats('export')],
]);

function createEmptyRealtimeFallbackStats(
  consumer: PlaybackConsumer | 'all',
): PlaybackRealtimeFallbackStats {
  return {
    consumer,
    totalTransportFrames: 0,
    degradedTransportFrames: 0,
    fallbackRate: 0,
    lastDegradedAt: null,
    lastFrameRevision: null,
  };
}

function cloneRealtimeFallbackStats(
  stats: PlaybackRealtimeFallbackStats,
): PlaybackRealtimeFallbackStats {
  return { ...stats };
}

function cloneImageData(imageData: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
}

function cloneCanvas(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const clone = document.createElement('canvas');
  clone.width = sourceCanvas.width;
  clone.height = sourceCanvas.height;
  const ctx = clone.getContext('2d');
  if (!ctx) {
    return null;
  }

  ctx.clearRect(0, 0, clone.width, clone.height);
  ctx.drawImage(sourceCanvas, 0, 0, clone.width, clone.height);
  return clone;
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

function rememberCachedCanvas(frameRevision: string, canvas: HTMLCanvasElement): void {
  const cachedCanvas = cloneCanvas(canvas) ?? canvas;

  if (playbackCanvasCache.has(frameRevision)) {
    playbackCanvasCache.delete(frameRevision);
  }

  playbackCanvasCache.set(frameRevision, cachedCanvas);

  while (playbackCanvasCache.size > PLAYBACK_FRAME_CACHE_LIMIT) {
    const oldestKey = playbackCanvasCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    playbackCanvasCache.delete(oldestKey);
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
    options.overlayProcessing ?? 'post',
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

function shouldUsePlaybackCanvasCache(options: PlaybackSnapshotFrameOptions): boolean {
  if (options.useCache === false) {
    return false;
  }

  if (options.isTitleEditing && options.currentTitle) {
    return false;
  }

  return true;
}

function shouldUseRealtimePreColorFallback(options: PlaybackSnapshotFrameOptions): boolean {
  return options.snapshot.isPlaying && (options.colorProcessing ?? 'pre') === 'post';
}

function recordRealtimeFallbackSample(
  options: PlaybackSnapshotFrameOptions,
  frameRevision: string,
  degradedToPreColor: boolean,
): void {
  if (!shouldUseRealtimePreColorFallback(options)) {
    return;
  }

  const current = realtimeFallbackStats.get(options.snapshot.consumer)
    ?? createEmptyRealtimeFallbackStats(options.snapshot.consumer);
  const totalTransportFrames = current.totalTransportFrames + 1;
  const degradedTransportFrames = current.degradedTransportFrames + (degradedToPreColor ? 1 : 0);

  realtimeFallbackStats.set(options.snapshot.consumer, {
    consumer: options.snapshot.consumer,
    totalTransportFrames,
    degradedTransportFrames,
    fallbackRate: totalTransportFrames > 0 ? degradedTransportFrames / totalTransportFrames : 0,
    lastDegradedAt: degradedToPreColor ? Date.now() : current.lastDegradedAt,
    lastFrameRevision: degradedToPreColor ? frameRevision : current.lastFrameRevision,
  });
}

export function getPlaybackRealtimeFallbackStats(
  consumer: PlaybackConsumer | 'all' = 'all',
): PlaybackRealtimeFallbackStats {
  if (consumer !== 'all') {
    return cloneRealtimeFallbackStats(
      realtimeFallbackStats.get(consumer) ?? createEmptyRealtimeFallbackStats(consumer),
    );
  }

  const aggregate = createEmptyRealtimeFallbackStats('all');
  for (const stats of realtimeFallbackStats.values()) {
    aggregate.totalTransportFrames += stats.totalTransportFrames;
    aggregate.degradedTransportFrames += stats.degradedTransportFrames;
    if ((stats.lastDegradedAt ?? 0) > (aggregate.lastDegradedAt ?? 0)) {
      aggregate.lastDegradedAt = stats.lastDegradedAt;
      aggregate.lastFrameRevision = stats.lastFrameRevision;
    }
  }

  aggregate.fallbackRate = aggregate.totalTransportFrames > 0
    ? aggregate.degradedTransportFrames / aggregate.totalTransportFrames
    : 0;
  return aggregate;
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
    overlayProcessing: options.overlayProcessing ?? 'post',
  });

  return ctx;
}

function drawCanvasToTarget(
  targetCanvas: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement,
): boolean {
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) {
    return false;
  }

  if (targetCanvas.width !== sourceCanvas.width) {
    targetCanvas.width = sourceCanvas.width;
  }
  if (targetCanvas.height !== sourceCanvas.height) {
    targetCanvas.height = sourceCanvas.height;
  }

  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  ctx.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
  return true;
}

function createAsyncRenderCanvas(
  width: number,
  height: number,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
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
        degradedToPreColor: false,
      };
    }
  }

  const canvas = resolveRenderCanvas(options.canvas, options.width, options.height);
  if (!canvas) {
    return {
      imageData: null,
      frameRevision,
      cacheHit: false,
      degradedToPreColor: false,
    };
  }

  const ctx = compositeSnapshotToCanvas(canvas, options);
  if (!ctx) {
    return {
      imageData: null,
      frameRevision,
      cacheHit: false,
      degradedToPreColor: false,
    };
  }

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, options.width, options.height);
    if ((options.colorProcessing ?? 'pre') === 'post') {
      imageData = colorEngine.processFrame(imageData);
    }
  } catch {
    return {
      imageData: null,
      frameRevision,
      cacheHit: false,
      degradedToPreColor: shouldUseRealtimePreColorFallback(options),
    };
  }

  if (canUseCache) {
    rememberCachedFrame(frameRevision, imageData);
  }

  return {
    imageData: cloneImageData(imageData),
    frameRevision,
    cacheHit: false,
    degradedToPreColor: false,
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
      degradedToPreColor: false,
    };
  }

  if ((options.colorProcessing ?? 'pre') === 'pre' && !shouldUsePlaybackFrameCache(options)) {
    compositeSnapshotToCanvas(canvas, options);
    return {
      canvas,
      frameRevision,
      cacheHit: false,
      degradedToPreColor: false,
    };
  }

  const result = evaluatePlaybackSnapshotImageData({
    ...options,
    canvas,
  });

  if (!result.imageData && shouldUseRealtimePreColorFallback(options)) {
    compositeSnapshotToCanvas(canvas, {
      ...options,
      colorProcessing: 'pre',
      useCache: false,
    });
    recordRealtimeFallbackSample(options, result.frameRevision, true);
    return {
      canvas,
      frameRevision: result.frameRevision,
      cacheHit: false,
      degradedToPreColor: true,
    };
  }

  const ctx = canvas.getContext('2d');
  if (!ctx || !result.imageData) {
    recordRealtimeFallbackSample(options, result.frameRevision, Boolean(result.degradedToPreColor));
    return {
      canvas,
      frameRevision: result.frameRevision,
      cacheHit: result.cacheHit,
      degradedToPreColor: result.degradedToPreColor,
    };
  }

  ctx.putImageData(result.imageData, 0, 0);
  recordRealtimeFallbackSample(options, result.frameRevision, Boolean(result.degradedToPreColor));
  return {
    canvas,
    frameRevision: result.frameRevision,
    cacheHit: result.cacheHit,
    degradedToPreColor: result.degradedToPreColor,
  };
}

export function getCachedPlaybackSnapshotCanvas(frameRevision: string): HTMLCanvasElement | null {
  return playbackCanvasCache.get(frameRevision) ?? null;
}

export async function renderPlaybackSnapshotFrameAsync(
  options: PlaybackSnapshotFrameOptions,
): Promise<PlaybackSnapshotFrameResult> {
  const frameRevision = buildPlaybackSnapshotRenderRevision(options);
  const canUseCache = shouldUsePlaybackCanvasCache(options);
  const cachedCanvas = canUseCache ? playbackCanvasCache.get(frameRevision) ?? null : null;

  if (cachedCanvas) {
    if (options.canvas && drawCanvasToTarget(options.canvas, cachedCanvas)) {
      return {
        canvas: options.canvas,
        frameRevision,
        cacheHit: true,
        degradedToPreColor: false,
      };
    }

    return {
      canvas: cachedCanvas,
      frameRevision,
      cacheHit: true,
      degradedToPreColor: false,
    };
  }

  const canvas = options.canvas ?? createAsyncRenderCanvas(options.width, options.height);
  if (!canvas) {
    return {
      canvas: null,
      frameRevision,
      cacheHit: false,
      degradedToPreColor: false,
    };
  }

  const ctx = compositeSnapshotToCanvas(canvas, {
    ...options,
    colorProcessing: 'pre',
  });
  if (!ctx) {
    return {
      canvas: null,
      frameRevision,
      cacheHit: false,
      degradedToPreColor: false,
    };
  }

  let degradedToPreColor = false;
  if ((options.colorProcessing ?? 'pre') === 'post') {
    try {
      const imageData = ctx.getImageData(0, 0, options.width, options.height);
      const processedImage = await colorEngine.processFrameAsync(imageData);
      ctx.putImageData(processedImage, 0, 0);
    } catch {
      degradedToPreColor = shouldUseRealtimePreColorFallback(options);
    }
  }

  if (canUseCache) {
    rememberCachedCanvas(frameRevision, canvas);
  }

  return {
    canvas,
    frameRevision,
    cacheHit: false,
    degradedToPreColor,
  };
}

export function capturePlaybackSnapshotImageData(options: PlaybackSnapshotFrameOptions): ImageData | null {
  return evaluatePlaybackSnapshotImageData(options).imageData;
}

export function resetPlaybackSnapshotFrameCache(): void {
  playbackFrameCache.clear();
  playbackCanvasCache.clear();
}

export function resetPlaybackRealtimeFallbackStats(): void {
  realtimeFallbackStats.set('record-monitor', createEmptyRealtimeFallbackStats('record-monitor'));
  realtimeFallbackStats.set('program-monitor', createEmptyRealtimeFallbackStats('program-monitor'));
  realtimeFallbackStats.set('scope', createEmptyRealtimeFallbackStats('scope'));
  realtimeFallbackStats.set('export', createEmptyRealtimeFallbackStats('export'));
}
