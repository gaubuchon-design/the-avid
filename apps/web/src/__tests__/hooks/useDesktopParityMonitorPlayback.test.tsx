import React, { useRef } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFrameTransport } from '../../../../desktop/src/main/videoIO/FrameTransport';
import {
  DEFAULT_INTRINSIC_AUDIO,
  DEFAULT_INTRINSIC_VIDEO,
  DEFAULT_TIME_REMAP,
  useEditorStore,
} from '../../store/editor.store';
import { useDesktopParityMonitorPlayback } from '../../hooks/useDesktopParityMonitorPlayback';

function DesktopParityMonitorHarness() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useDesktopParityMonitorPlayback({
    consumer: 'record-monitor',
    canvasRef,
    canvasSize: { w: 320, h: 180 },
  });

  return <canvas ref={canvasRef} width={320} height={180} />;
}

describe('useDesktopParityMonitorPlayback', () => {
  const initialState = useEditorStore.getState();
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

  function primeEditorState(overrides: Partial<ReturnType<typeof useEditorStore.getState>> = {}) {
    useEditorStore.setState((state) => ({
      ...state,
      projectId: 'project-1',
      projectName: 'Desktop Monitor Project',
      projectTemplate: 'film',
      projectDescription: '',
      projectTags: [],
      projectSchemaVersion: 2,
      projectCreatedAt: '2024-01-01T00:00:00Z',
      projectSettings: {
        width: 320,
        height: 180,
        frameRate: 24,
        exportFormat: 'mov',
      },
      sequenceSettings: {
        ...state.sequenceSettings,
        name: 'Sequence 1',
        width: 320,
        height: 180,
        fps: 24,
        sampleRate: 48000,
        colorSpace: 'rec709',
      },
      duration: 12,
      playheadTime: 1,
      isPlaying: false,
      showSafeZones: false,
      markers: [],
      subtitleTracks: [],
      titleClips: [],
      sourceAsset: null,
      selectedBinId: 'main',
      enabledTrackIds: ['V1', 'A1'],
      syncLockedTrackIds: [],
      videoMonitorTrackId: 'V1',
      tracks: [
        {
          id: 'V1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 1,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#00ff00',
          clips: [
            {
              id: 'clip-video-1',
              trackId: 'V1',
              name: 'Clip Video 1',
              startTime: 0,
              endTime: 6,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
              assetId: 'asset-video-1',
              intrinsicVideo: DEFAULT_INTRINSIC_VIDEO,
              intrinsicAudio: DEFAULT_INTRINSIC_AUDIO,
              timeRemap: DEFAULT_TIME_REMAP,
            },
          ],
        },
        {
          id: 'A1',
          name: 'A1',
          type: 'AUDIO',
          sortOrder: 2,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#00ff00',
          clips: [
            {
              id: 'clip-audio-1',
              trackId: 'A1',
              name: 'Clip Audio 1',
              startTime: 0,
              endTime: 6,
              trimStart: 0,
              trimEnd: 0,
              type: 'audio',
              assetId: 'asset-audio-1',
              intrinsicVideo: DEFAULT_INTRINSIC_VIDEO,
              intrinsicAudio: DEFAULT_INTRINSIC_AUDIO,
              timeRemap: DEFAULT_TIME_REMAP,
            },
          ],
        },
      ],
      bins: [
        {
          id: 'main',
          name: 'Main',
          color: '#ffffff',
          children: [],
          isOpen: true,
          assets: [
            {
              id: 'asset-video-1',
              name: 'Video 1',
              type: 'VIDEO',
              duration: 6,
              status: 'READY',
              playbackUrl: 'file:///video.mov',
              tags: [],
              isFavorite: false,
            },
            {
              id: 'asset-audio-1',
              name: 'Audio 1',
              type: 'AUDIO',
              duration: 6,
              status: 'READY',
              playbackUrl: 'file:///audio.wav',
              tags: [],
              isFavorite: false,
            },
          ],
        },
      ],
      ...overrides,
    }));
  }

  afterEach(() => {
    useEditorStore.setState(initialState);
    window.electronAPI = undefined;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    vi.restoreAllMocks();
  });

  it('drives the shared monitor canvas from the desktop parity playback bridge', async () => {
    const transport = createFrameTransport(320, 180, 4, 2);
    const syncProject = vi.fn(async () => true);
    const createTransport = vi.fn(async () => ({
      transportHandle: 'transport-1',
      view: {
        buffer: transport.getBuffer(),
        width: 320,
        height: 180,
        bytesPerPixel: 4,
        slots: 2,
      },
    }));
    const attachStreams = vi.fn(async () => true);
    const preroll = vi.fn(async () => true);
    const start = vi.fn(async (_transportHandle: string, frameNumber: number) => {
      const pixels = new Uint8Array(320 * 180 * 4);
      pixels[0] = 0x11;
      pixels[1] = 0x22;
      pixels[2] = 0x33;
      pixels[3] = 0xff;
      transport.writeFrame(pixels, {
        width: 320,
        height: 180,
        frameNumber,
        timestamp: 1000,
        timecode: '00:00:01:00',
      });
      return true;
    });
    const play = vi.fn(async () => true);
    const syncFrame = vi.fn(async () => true);
    const releaseTransport = vi.fn(async () => true);
    const putImageData = vi.fn();
    const clearRect = vi.fn();
    const drawImage = vi.fn();

    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      clearRect,
      putImageData,
      drawImage,
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    window.electronAPI = {
      parityPlayback: {
        syncProject,
        createTransport,
        getTransportView: vi.fn(),
        attachStreams,
        preroll,
        start,
        play,
        stop: vi.fn(async () => true),
        syncFrame,
        releaseTransport,
        getTelemetry: vi.fn(),
        attachOutputDevice: vi.fn(async () => true),
        detachOutputDevice: vi.fn(async () => true),
        invalidateCaches: vi.fn(async () => true),
      },
    } as unknown as typeof window.electronAPI;

    primeEditorState();

    const { unmount } = render(<DesktopParityMonitorHarness />);

    await waitFor(() => {
      expect(createTransport).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(start).toHaveBeenCalledTimes(1);
    });

    expect(syncProject).toHaveBeenCalledTimes(1);
    expect(attachStreams).toHaveBeenCalledWith('transport-1', [
      { streamId: 'program-video-0', assetId: 'asset-video-1', mediaType: 'video', role: 'program' },
      { streamId: 'program-audio-0', assetId: 'asset-audio-1', mediaType: 'audio', role: 'program' },
    ]);
    expect(preroll).toHaveBeenCalledWith('transport-1', { startFrame: 22, endFrame: 26 });
    expect(putImageData).toHaveBeenCalledTimes(1);

    const renderedImageData = putImageData.mock.calls[0]?.[0] as ImageData;
    expect(renderedImageData.data[0]).toBe(0x33);
    expect(renderedImageData.data[1]).toBe(0x22);
    expect(renderedImageData.data[2]).toBe(0x11);
    expect(renderedImageData.data[3]).toBe(0xff);

    unmount();

    await waitFor(() => {
      expect(releaseTransport).toHaveBeenCalledWith('transport-1');
    });
  });

  it('uses a continuous desktop playback loop without reconfiguring the transport on small playhead drift', async () => {
    const transport = createFrameTransport(320, 180, 4, 2);
    const pendingRaf = new Map<number, FrameRequestCallback>();
    let rafId = 0;
    const flushAnimationFrame = (timestamp = 0) => {
      const callbacks = Array.from(pendingRaf.values());
      pendingRaf.clear();
      for (const callback of callbacks) {
        callback(timestamp);
      }
    };

    globalThis.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      const id = ++rafId;
      pendingRaf.set(id, callback);
      return id;
    });
    globalThis.cancelAnimationFrame = vi.fn((id: number) => {
      pendingRaf.delete(id);
    });

    const syncProject = vi.fn(async () => true);
    const createTransport = vi.fn(async () => ({
      transportHandle: 'transport-1',
      view: {
        buffer: transport.getBuffer(),
        width: 320,
        height: 180,
        bytesPerPixel: 4,
        slots: 2,
      },
    }));
    const attachStreams = vi.fn(async () => true);
    const preroll = vi.fn(async () => true);
    const start = vi.fn(async () => true);
    const play = vi.fn(async (_transportHandle: string, frameNumber: number) => {
      const pixels = new Uint8Array(320 * 180 * 4);
      pixels[0] = 0x10;
      pixels[1] = 0x20;
      pixels[2] = 0x30;
      pixels[3] = 0xff;
      transport.writeFrame(pixels, {
        width: 320,
        height: 180,
        frameNumber,
        timestamp: 1000,
        timecode: '00:00:01:00',
      });
      return true;
    });
    const syncFrame = vi.fn(async (_transportHandle: string, frameNumber: number) => {
      const pixels = new Uint8Array(320 * 180 * 4);
      pixels[0] = 0xaa;
      pixels[1] = 0xbb;
      pixels[2] = 0xcc;
      pixels[3] = 0xff;
      transport.writeFrame(pixels, {
        width: 320,
        height: 180,
        frameNumber,
        timestamp: 3000,
        timecode: '00:00:02:02',
      });
      return true;
    });
    const releaseTransport = vi.fn(async () => true);
    const putImageData = vi.fn();
    const clearRect = vi.fn();
    const drawImage = vi.fn();

    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      clearRect,
      putImageData,
      drawImage,
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    window.electronAPI = {
      parityPlayback: {
        syncProject,
        createTransport,
        getTransportView: vi.fn(),
        attachStreams,
        preroll,
        start,
        play,
        stop: vi.fn(async () => true),
        syncFrame,
        releaseTransport,
        getTelemetry: vi.fn(),
        attachOutputDevice: vi.fn(async () => true),
        detachOutputDevice: vi.fn(async () => true),
        invalidateCaches: vi.fn(async () => true),
      },
    } as unknown as typeof window.electronAPI;

    primeEditorState({ isPlaying: true });

    const { unmount } = render(<DesktopParityMonitorHarness />);

    await waitFor(() => {
      expect(createTransport).toHaveBeenCalledTimes(1);
      expect(play).toHaveBeenCalledTimes(1);
    });

    expect(syncProject).toHaveBeenCalledTimes(1);
    expect(attachStreams).toHaveBeenCalledTimes(1);
    expect(preroll).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
    expect(syncFrame).not.toHaveBeenCalled();

    act(() => {
      flushAnimationFrame(16);
    });

    await waitFor(() => {
      expect(putImageData).toHaveBeenCalledTimes(1);
    });

    const firstFrame = putImageData.mock.calls[0]?.[0] as ImageData;
    expect(firstFrame.data[0]).toBe(0x30);
    expect(firstFrame.data[1]).toBe(0x20);
    expect(firstFrame.data[2]).toBe(0x10);

    act(() => {
      useEditorStore.setState((state) => ({
        ...state,
        playheadTime: 25 / 24,
      }));
    });

    await waitFor(() => {
      expect(play).toHaveBeenCalledTimes(1);
    });

    expect(syncProject).toHaveBeenCalledTimes(1);
    expect(attachStreams).toHaveBeenCalledTimes(1);
    expect(preroll).toHaveBeenCalledTimes(1);
    expect(syncFrame).not.toHaveBeenCalled();

    const secondPixels = new Uint8Array(320 * 180 * 4);
    secondPixels[0] = 0x01;
    secondPixels[1] = 0x02;
    secondPixels[2] = 0x03;
    secondPixels[3] = 0xff;
    transport.writeFrame(secondPixels, {
      width: 320,
      height: 180,
      frameNumber: 25,
      timestamp: 2000,
      timecode: '00:00:01:01',
    });

    act(() => {
      flushAnimationFrame(32);
    });

    await waitFor(() => {
      expect(putImageData).toHaveBeenCalledTimes(2);
    });

    const secondFrame = putImageData.mock.calls[1]?.[0] as ImageData;
    expect(secondFrame.data[0]).toBe(0x03);
    expect(secondFrame.data[1]).toBe(0x02);
    expect(secondFrame.data[2]).toBe(0x01);

    act(() => {
      useEditorStore.setState((state) => ({
        ...state,
        playheadTime: 50 / 24,
      }));
    });

    await waitFor(() => {
      expect(syncFrame).toHaveBeenCalledTimes(1);
    });

    expect(syncProject).toHaveBeenCalledTimes(1);
    expect(attachStreams).toHaveBeenCalledTimes(1);
    expect(preroll).toHaveBeenCalledTimes(1);

    act(() => {
      flushAnimationFrame(48);
    });

    await waitFor(() => {
      expect(putImageData).toHaveBeenCalledTimes(3);
    });

    const thirdFrame = putImageData.mock.calls[2]?.[0] as ImageData;
    expect(thirdFrame.data[0]).toBe(0xcc);
    expect(thirdFrame.data[1]).toBe(0xbb);
    expect(thirdFrame.data[2]).toBe(0xaa);

    unmount();

    await waitFor(() => {
      expect(releaseTransport).toHaveBeenCalledWith('transport-1');
    });
  });
});
