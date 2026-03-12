import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPlaybackSnapshot } from '../../engine/PlaybackSnapshot';
import {
  compositePlaybackSnapshot,
  inspectPlaybackVideoLayerAvailability,
} from '../../engine/compositeRecordFrame';
import { makeClip } from '../../store/editor.store';

const effectsEngineMocks = vi.hoisted(() => ({
  getClipEffects: vi.fn(),
  processFrame: vi.fn(),
}));

const videoSourceManagerMocks = vi.hoisted(() => ({
  getSource: vi.fn(),
}));

vi.mock('../../engine/EffectsEngine', () => ({
  effectsEngine: effectsEngineMocks,
}));

vi.mock('../../engine/VideoSourceManager', () => ({
  videoSourceManager: videoSourceManagerMocks,
}));

function createImageData(width: number, height: number): ImageData {
  return new ImageData(new Uint8ClampedArray(width * height * 4), width, height);
}

describe('composite record frame', () => {
  beforeEach(() => {
    effectsEngineMocks.getClipEffects.mockReset();
    effectsEngineMocks.processFrame.mockReset();
    videoSourceManagerMocks.getSource.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isolates per-clip effects to an offscreen layer before compositing', () => {
    const videoElement = {
      readyState: 4,
      seeking: false,
      currentTime: 0,
      paused: true,
      videoWidth: 1920,
      videoHeight: 1080,
      play: vi.fn(),
      pause: vi.fn(),
    };
    const layerImageData = createImageData(320, 180);
    const layerCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => layerImageData),
      putImageData: vi.fn(),
      clearRect: vi.fn(),
      setTransform: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      globalAlpha: 1,
    };
    const layerCanvas = {
      width: 320,
      height: 180,
      getContext: vi.fn(() => layerCtx),
    } as unknown as HTMLCanvasElement;
    const mainCtx = {
      fillStyle: '#000000',
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => {
        throw new Error('main context readback should not be used for clip effects');
      }),
      putImageData: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      setLineDash: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 0 })),
      globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;
    const originalCreateElement = document.createElement.bind(document);

    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName === 'canvas') {
        return layerCanvas;
      }
      return originalCreateElement(tagName);
    }) as typeof document.createElement);

    effectsEngineMocks.getClipEffects.mockReturnValue([
      {
        id: 'fx-1',
        definitionId: 'brightness-contrast',
        enabled: true,
        params: {},
        keyframes: [],
      },
    ]);
    videoSourceManagerMocks.getSource.mockReturnValue({
      ready: true,
      element: videoElement,
    });

    const snapshot = buildPlaybackSnapshot({
      tracks: [
        {
          id: 'v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [
            makeClip({
              id: 'clip-v1',
              trackId: 'v1',
              name: 'Interview',
              startTime: 0,
              endTime: 5,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
              assetId: 'asset-video',
            }),
          ],
        },
      ],
      subtitleTracks: [],
      titleClips: [],
      playheadTime: 1,
      duration: 5,
      isPlaying: false,
      showSafeZones: false,
      activeMonitor: 'record',
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
    }, 'record-monitor');

    compositePlaybackSnapshot({
      ctx: mainCtx,
      canvasW: 320,
      canvasH: 180,
      snapshot,
      currentTitle: null,
      isTitleEditing: false,
    });

    expect(effectsEngineMocks.getClipEffects).toHaveBeenCalledWith('clip-v1');
    expect(layerCtx.getImageData).toHaveBeenCalledOnce();
    expect(effectsEngineMocks.processFrame).toHaveBeenCalledWith(layerImageData, expect.any(Array), snapshot.frameNumber);
    expect(mainCtx.getImageData).not.toHaveBeenCalled();
    expect(mainCtx.drawImage).toHaveBeenCalledWith(layerCanvas, 0, 0, 320, 180);
  });

  it('reports pending video layers while a paused monitor frame is still seeking', () => {
    const snapshot = buildPlaybackSnapshot({
      tracks: [
        {
          id: 'v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [
            makeClip({
              id: 'clip-v1',
              trackId: 'v1',
              name: 'Interview',
              startTime: 0,
              endTime: 5,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
              assetId: 'asset-video',
            }),
          ],
        },
      ],
      subtitleTracks: [],
      titleClips: [],
      playheadTime: 1,
      duration: 5,
      isPlaying: false,
      showSafeZones: false,
      activeMonitor: 'record',
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
    }, 'record-monitor');

    videoSourceManagerMocks.getSource.mockReturnValue({
      ready: true,
      element: {
        readyState: 4,
        seeking: true,
        currentTime: 0,
      },
    });

    expect(inspectPlaybackVideoLayerAvailability(snapshot)).toEqual({
      totalVideoLayers: 1,
      drawableVideoLayers: 0,
      pendingVideoLayers: 1,
    });
  });

  it('avoids compositor-owned seek retargeting for record monitor frames', () => {
    const videoElement = {
      readyState: 4,
      seeking: false,
      currentTime: 0,
      paused: true,
      videoWidth: 1920,
      videoHeight: 1080,
      play: vi.fn(),
      pause: vi.fn(),
    };
    const mainCtx = {
      fillStyle: '#000000',
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => createImageData(320, 180)),
      putImageData: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      setLineDash: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 0 })),
      globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;
    const snapshotSource = {
      tracks: [
        {
          id: 'v1',
          name: 'V1',
          type: 'VIDEO' as const,
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [
            makeClip({
              id: 'clip-v1',
              trackId: 'v1',
              name: 'Interview',
              startTime: 0,
              endTime: 5,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
              assetId: 'asset-video',
            }),
          ],
        },
      ],
      subtitleTracks: [],
      titleClips: [],
      playheadTime: 1,
      duration: 5,
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

    effectsEngineMocks.getClipEffects.mockReturnValue([]);
    videoSourceManagerMocks.getSource.mockReturnValue({
      ready: true,
      element: videoElement,
    });

    compositePlaybackSnapshot({
      ctx: mainCtx,
      canvasW: 320,
      canvasH: 180,
      snapshot: buildPlaybackSnapshot(snapshotSource, 'record-monitor'),
      currentTitle: null,
      isTitleEditing: false,
    });
    expect(videoElement.currentTime).toBe(0);

    compositePlaybackSnapshot({
      ctx: mainCtx,
      canvasW: 320,
      canvasH: 180,
      snapshot: buildPlaybackSnapshot(snapshotSource, 'export'),
      currentTitle: null,
      isTitleEditing: false,
    });
    expect(videoElement.currentTime).toBeCloseTo(1, 6);
  });
});
