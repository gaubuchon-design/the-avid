import { beforeEach, describe, expect, it, vi } from 'vitest';
import { colorEngine } from '../../engine/ColorEngine';
import { buildPlaybackSnapshot } from '../../engine/PlaybackSnapshot';
import { compositePlaybackSnapshot } from '../../engine/compositeRecordFrame';
import {
  buildPlaybackSnapshotRenderRevision,
  evaluatePlaybackSnapshotImageData,
  renderPlaybackSnapshotFrame,
  resetPlaybackSnapshotFrameCache,
} from '../../engine/playbackSnapshotFrame';

vi.mock('../../engine/compositeRecordFrame', () => ({
  compositePlaybackSnapshot: vi.fn(),
}));

function makeSnapshot(consumer: 'record-monitor' | 'export' | 'scope' = 'record-monitor') {
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

function makePlayingSnapshot(consumer: 'record-monitor' | 'export' | 'scope' = 'record-monitor') {
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
  });
});
