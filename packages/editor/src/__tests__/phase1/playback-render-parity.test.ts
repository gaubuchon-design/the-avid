import { beforeEach, describe, expect, it, vi } from 'vitest';
import { colorEngine } from '../../engine/ColorEngine';
import { effectsEngine } from '../../engine/EffectsEngine';
import { buildPlaybackSnapshot } from '../../engine/PlaybackSnapshot';
import { compositePlaybackSnapshot } from '../../engine/compositeRecordFrame';
import {
  getPlaybackRealtimeFallbackStats,
  buildPlaybackSnapshotRenderRevision,
  evaluatePlaybackSnapshotImageData,
  getCachedPlaybackSnapshotCanvas,
  renderPlaybackSnapshotFrame,
  renderPlaybackSnapshotFrameAsync,
  resetPlaybackRealtimeFallbackStats,
  resetPlaybackSnapshotFrameCache,
} from '../../engine/playbackSnapshotFrame';
import { makeClip } from '../../store/editor.store';

vi.mock('../../engine/compositeRecordFrame', () => ({
  compositePlaybackSnapshot: vi.fn(),
}));

function makeSnapshot(
  consumer: 'record-monitor' | 'program-monitor' | 'export' | 'scope' = 'record-monitor',
) {
  return buildPlaybackSnapshot({
    tracks: [],
    subtitleTracks: [],
    titleClips: [],
    playheadTime: 2,
    duration: 10,
    isPlaying: false,
    showSafeZones: false,
    activeMonitor: 'record',
    activeScope: consumer === 'scope' ? 'waveform' : null,
    sequenceSettings: {
      fps: 24,
      width: 1920,
      height: 1080,
    },
    projectSettings: {
      frameRate: 24,
      width: 1920,
      height: 1080,
    },
  }, consumer);
}

function makePlayingSnapshot(
  consumer: 'record-monitor' | 'program-monitor' | 'export' | 'scope' = 'record-monitor',
) {
  return buildPlaybackSnapshot({
    tracks: [],
    subtitleTracks: [],
    titleClips: [],
    playheadTime: 2,
    duration: 10,
    isPlaying: true,
    showSafeZones: false,
    activeMonitor: 'record',
    activeScope: consumer === 'scope' ? 'waveform' : null,
    sequenceSettings: {
      fps: 24,
      width: 1920,
      height: 1080,
    },
    projectSettings: {
      frameRate: 24,
      width: 1920,
      height: 1080,
    },
  }, consumer);
}

function restorePrimaryDefaults() {
  const primaryNode = colorEngine.getAllNodes().find((node) => node.type === 'primary');
  if (!primaryNode) {
    throw new Error('Primary color node is required for playback render tests.');
  }

  colorEngine.updateNodeParams(primaryNode.id, {
    lift: { r: 0, g: 0, b: 0 },
    gamma: { r: 0, g: 0, b: 0 },
    gain: { r: 0, g: 0, b: 0 },
    offset: { r: 0, g: 0, b: 0 },
    saturation: 1,
    contrast: 1,
    temperature: 0,
    tint: 0,
  });
}

function createMockCanvas(width = 320, height = 180): HTMLCanvasElement {
  const canvas = {
    width,
    height,
    getContext: vi.fn(() => ({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => {
        const data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
        for (let index = 0; index < data.length; index += 4) {
          data[index] = 64;
          data[index + 1] = 64;
          data[index + 2] = 64;
          data[index + 3] = 255;
        }
        return new ImageData(data, canvas.width, canvas.height);
      }),
      putImageData: vi.fn(),
    })),
  };

  return canvas as unknown as HTMLCanvasElement;
}

function createThrowingReadbackCanvas(width = 320, height = 180): HTMLCanvasElement {
  const canvas = {
    width,
    height,
    getContext: vi.fn(() => ({
      getImageData: vi.fn(() => {
        throw new Error('readback unavailable');
      }),
      putImageData: vi.fn(),
    })),
  };

  return canvas as unknown as HTMLCanvasElement;
}

describe('phase 1 playback render parity', () => {
  beforeEach(() => {
    resetPlaybackSnapshotFrameCache();
    resetPlaybackRealtimeFallbackStats();
    restorePrimaryDefaults();
    vi.mocked(compositePlaybackSnapshot).mockClear();
  });

  it('builds the same evaluated frame revision across monitor and export consumers', () => {
    const recordRevision = buildPlaybackSnapshotRenderRevision({
      snapshot: makeSnapshot('record-monitor'),
      width: 640,
      height: 360,
      colorProcessing: 'post',
    });

    const exportRevision = buildPlaybackSnapshotRenderRevision({
      snapshot: makeSnapshot('export'),
      width: 640,
      height: 360,
      colorProcessing: 'post',
    });

    expect(recordRevision).toBe(exportRevision);
  });

  it('invalidates the evaluated frame revision when overlay processing changes', () => {
    const snapshot = makeSnapshot('scope');
    const preOverlayRevision = buildPlaybackSnapshotRenderRevision({
      snapshot,
      width: 640,
      height: 360,
      colorProcessing: 'post',
      overlayProcessing: 'pre',
    });
    const postOverlayRevision = buildPlaybackSnapshotRenderRevision({
      snapshot,
      width: 640,
      height: 360,
      colorProcessing: 'post',
      overlayProcessing: 'post',
    });

    expect(preOverlayRevision).not.toBe(postOverlayRevision);
  });

  it('reuses cached paused frames for identical revisions', () => {
    const snapshot = makeSnapshot('scope');

    const first = evaluatePlaybackSnapshotImageData({
      snapshot,
      width: 320,
      height: 180,
      canvas: createMockCanvas(),
      colorProcessing: 'post',
      useCache: true,
    });
    const second = evaluatePlaybackSnapshotImageData({
      snapshot,
      width: 320,
      height: 180,
      canvas: createMockCanvas(),
      colorProcessing: 'post',
      useCache: true,
    });

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(second.frameRevision).toBe(first.frameRevision);
    expect(second.imageData?.data).toEqual(first.imageData?.data);
  });

  it('invalidates the evaluated frame revision when the grade changes', () => {
    const snapshot = makeSnapshot('record-monitor');

    const before = evaluatePlaybackSnapshotImageData({
      snapshot,
      width: 320,
      height: 180,
      canvas: createMockCanvas(),
      colorProcessing: 'post',
      useCache: true,
    });

    const primaryNode = colorEngine.getAllNodes().find((node) => node.type === 'primary');
    if (!primaryNode) {
      throw new Error('Primary color node is required for playback render tests.');
    }

    colorEngine.updateNodeParams(primaryNode.id, {
      offset: { r: 0.2, g: 0, b: 0 },
    });

    const after = evaluatePlaybackSnapshotImageData({
      snapshot,
      width: 320,
      height: 180,
      canvas: createMockCanvas(),
      colorProcessing: 'post',
      useCache: true,
    });

    expect(after.frameRevision).not.toBe(before.frameRevision);
    expect(Array.from(after.imageData?.data.slice(0, 24) ?? [])).not.toEqual(
      Array.from(before.imageData?.data.slice(0, 24) ?? []),
    );
  });

  it('invalidates the render revision when active clip effects change', () => {
    const clipId = `clip-effects-${Date.now()}`;
    const effect = effectsEngine.createInstance('brightness-contrast');
    if (!effect) {
      throw new Error('Failed to create test effect instance.');
    }

    effectsEngine.addEffectToClip(clipId, effect.id);

    const source = {
      tracks: [
        {
          id: 't-v1',
          name: 'V1',
          type: 'VIDEO' as const,
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#7f8ca3',
          clips: [
            makeClip({
              id: clipId,
              trackId: 't-v1',
              name: 'Program',
              startTime: 0,
              endTime: 4,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
              assetId: 'asset-v1',
            }),
          ],
        },
      ],
      subtitleTracks: [],
      titleClips: [],
      playheadTime: 1,
      duration: 4,
      isPlaying: false,
      showSafeZones: false,
      activeMonitor: 'record' as const,
      activeScope: null,
      sequenceSettings: {
        fps: 24,
        width: 1920,
        height: 1080,
      },
      projectSettings: {
        frameRate: 24,
        width: 1920,
        height: 1080,
      },
    };

    const beforeSnapshot = buildPlaybackSnapshot(source, 'record-monitor');
    const beforeRevision = buildPlaybackSnapshotRenderRevision({
      snapshot: beforeSnapshot,
      width: 640,
      height: 360,
      colorProcessing: 'post',
    });

    effectsEngine.updateParam(effect.id, 'brightness', 18);

    const afterSnapshot = buildPlaybackSnapshot(source, 'record-monitor');
    const afterRevision = buildPlaybackSnapshotRenderRevision({
      snapshot: afterSnapshot,
      width: 640,
      height: 360,
      colorProcessing: 'post',
    });

    expect(afterSnapshot.effectsRevision).not.toBe(beforeSnapshot.effectsRevision);
    expect(afterRevision).not.toBe(beforeRevision);

    effectsEngine.removeInstance(effect.id);
  });

  it('falls back to pre-color composite when realtime graded readback fails during transport', () => {
    const canvas = createThrowingReadbackCanvas();
    const snapshot = makePlayingSnapshot('record-monitor');

    const result = renderPlaybackSnapshotFrame({
      snapshot,
      width: 320,
      height: 180,
      canvas,
      colorProcessing: 'post',
      useCache: false,
    });

    expect(result.degradedToPreColor).toBe(true);
    expect(result.cacheHit).toBe(false);
    expect(vi.mocked(compositePlaybackSnapshot)).toHaveBeenCalledTimes(2);

    const telemetry = getPlaybackRealtimeFallbackStats('record-monitor');
    expect(telemetry.totalTransportFrames).toBe(1);
    expect(telemetry.degradedTransportFrames).toBe(1);
    expect(telemetry.fallbackRate).toBe(1);
    expect(telemetry.lastFrameRevision).toBeTruthy();
  });

  it('records transport-time stability when realtime post-color renders succeed', () => {
    const snapshot = makePlayingSnapshot('program-monitor');

    const result = renderPlaybackSnapshotFrame({
      snapshot,
      width: 320,
      height: 180,
      canvas: createMockCanvas(),
      colorProcessing: 'post',
      useCache: false,
    });

    expect(result.degradedToPreColor).toBe(false);

    const telemetry = getPlaybackRealtimeFallbackStats('program-monitor');
    expect(telemetry.totalTransportFrames).toBe(1);
    expect(telemetry.degradedTransportFrames).toBe(0);
    expect(telemetry.fallbackRate).toBe(0);
  });

  it('caches async evaluated monitor frames so playback can upgrade without recomputing the same revision', async () => {
    const snapshot = makePlayingSnapshot('record-monitor');
    const processSpy = vi.spyOn(colorEngine, 'processFrameAsync').mockResolvedValue(
      new ImageData(new Uint8ClampedArray(320 * 180 * 4), 320, 180),
    );

    const first = await renderPlaybackSnapshotFrameAsync({
      snapshot,
      width: 320,
      height: 180,
      canvas: createMockCanvas(),
      colorProcessing: 'post',
      useCache: true,
    });
    const second = await renderPlaybackSnapshotFrameAsync({
      snapshot,
      width: 320,
      height: 180,
      colorProcessing: 'post',
      useCache: true,
    });

    expect(first.cacheHit).toBe(false);
    expect(getCachedPlaybackSnapshotCanvas(first.frameRevision)).toBeTruthy();
    expect(second.cacheHit).toBe(true);
    expect(second.frameRevision).toBe(first.frameRevision);
    expect(processSpy).toHaveBeenCalledTimes(1);

    processSpy.mockRestore();
  });
});
