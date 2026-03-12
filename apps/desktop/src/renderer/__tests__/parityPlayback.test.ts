import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFrameTransport } from '../../main/videoIO/FrameTransport';
import {
  DesktopParityPlaybackBridge,
  readDesktopParityPlaybackFrame,
} from '../parityPlayback';

describe('desktop parity playback bridge', () => {
  const root = globalThis as typeof globalThis & {
    window?: Window & typeof globalThis & {
      electronAPI?: typeof window.electronAPI;
    };
  };
  root.window ??= {} as Window & typeof globalThis;
  const originalElectronAPI = root.window.electronAPI;

  afterEach(() => {
    root.window!.electronAPI = originalElectronAPI;
    vi.restoreAllMocks();
  });

  it('reads the latest frame from a playback transport view', () => {
    const transport = createFrameTransport(4, 2, 4, 2);
    transport.writeFrame(new Uint8Array(32).fill(7), {
      width: 4,
      height: 2,
      frameNumber: 7,
      timestamp: 1234,
      timecode: '00:00:00:07',
    });

    const frame = readDesktopParityPlaybackFrame({
      buffer: transport.getBuffer(),
      width: 4,
      height: 2,
      bytesPerPixel: 4,
      slots: 2,
    });

    expect(frame).not.toBeNull();
    expect(frame?.metadata.frameNumber).toBe(7);
    expect(frame?.metadata.timecode).toBe('00:00:00:07');
    expect(frame?.pixelData[0]).toBe(7);
    expect(frame?.pixelData.length).toBeGreaterThanOrEqual(32);
  });

  it('uses the desktop preload bridge to fetch and decode transport frames', async () => {
    const transport = createFrameTransport(2, 2, 4, 2);
    transport.writeFrame(new Uint8Array(16).fill(19), {
      width: 2,
      height: 2,
      frameNumber: 42,
      timestamp: 9876,
      timecode: '00:00:01:18',
    });

    const getTransportView = vi.fn(async () => ({
      buffer: transport.getBuffer(),
      width: 2,
      height: 2,
      bytesPerPixel: 4,
      slots: 2,
    }));

    root.window!.electronAPI = {
      parityPlayback: {
        getTransportView,
      },
    } as unknown as typeof window.electronAPI;

    const bridge = new DesktopParityPlaybackBridge();
    const frame = await bridge.readLatestFrame('transport-42');

    expect(bridge.available).toBe(true);
    expect(getTransportView).toHaveBeenCalledWith('transport-42');
    expect(frame?.metadata.frameNumber).toBe(42);
    expect(frame?.metadata.timecode).toBe('00:00:01:18');
    expect(frame?.pixelData[0]).toBe(19);
  });
});
