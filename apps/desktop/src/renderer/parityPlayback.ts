import type {
  EditorProject,
  FrameRange,
  PlaybackStreamDescriptor,
  PlaybackTelemetry,
  TimelineRenderSnapshot,
} from '@mcua/core';

export interface DesktopParityPlaybackTransportView {
  buffer: SharedArrayBuffer;
  width: number;
  height: number;
  bytesPerPixel: number;
  slots: number;
}

export interface DesktopParityPlaybackTransportDescriptor {
  transportHandle: string;
  view: DesktopParityPlaybackTransportView;
}

export interface DesktopParityPlaybackFrame {
  metadata: {
    width: number;
    height: number;
    frameNumber: number;
    timestamp: number;
    timecode: string;
  };
  pixelData: Uint8Array;
}

const HEADER_SIZE = 64;
const FLAG_WRITTEN = 1;
const FLAG_READ = 2;
const TIMECODE_OFFSET = 24;
const TIMECODE_MAX_LENGTH = 32;
const textDecoder = new TextDecoder();

export function readDesktopParityPlaybackFrame(
  view: DesktopParityPlaybackTransportView,
): DesktopParityPlaybackFrame | null {
  const slotSize = Math.ceil((HEADER_SIZE + (view.width * view.height * view.bytesPerPixel)) / 8) * 8;
  const int32View = new Int32Array(view.buffer);
  const uint32View = new Uint32Array(view.buffer);
  const float64View = new Float64Array(view.buffer);
  const uint8View = new Uint8Array(view.buffer);
  let selectedSlot = -1;
  let latestTimestamp = Number.NEGATIVE_INFINITY;

  for (let slot = 0; slot < view.slots; slot += 1) {
    const byteOffset = slot * slotSize;
    const flagIndex = byteOffset >> 2;
    const flag = Atomics.load(int32View, flagIndex);
    if (flag !== FLAG_WRITTEN) {
      continue;
    }

    const timestamp = float64View[(byteOffset + 16) >> 3]!;
    if (timestamp >= latestTimestamp) {
      latestTimestamp = timestamp;
      selectedSlot = slot;
    }
  }

  if (selectedSlot < 0) {
    return null;
  }

  const byteOffset = selectedSlot * slotSize;
  const flagIndex = byteOffset >> 2;
  const width = uint32View[(byteOffset + 4) >> 2]!;
  const height = uint32View[(byteOffset + 8) >> 2]!;
  const frameNumber = uint32View[(byteOffset + 12) >> 2]!;
  const timestamp = float64View[(byteOffset + 16) >> 3]!;
  const timecodeBytes = uint8View.subarray(
    byteOffset + TIMECODE_OFFSET,
    byteOffset + TIMECODE_OFFSET + TIMECODE_MAX_LENGTH,
  );
  const timecodeEnd = timecodeBytes.indexOf(0);
  const timecode = textDecoder.decode(
    timecodeBytes.subarray(0, timecodeEnd >= 0 ? timecodeEnd : timecodeBytes.length),
  );
  const pixelData = uint8View.slice(byteOffset + HEADER_SIZE, byteOffset + slotSize);

  Atomics.store(int32View, flagIndex, FLAG_READ);

  return {
    metadata: {
      width,
      height,
      frameNumber,
      timestamp,
      timecode,
    },
    pixelData,
  };
}

export class DesktopParityPlaybackBridge {
  get available(): boolean {
    return Boolean(window.electronAPI?.parityPlayback);
  }

  async syncProject(project: EditorProject): Promise<boolean> {
    if (!window.electronAPI?.parityPlayback) {
      return false;
    }
    return window.electronAPI.parityPlayback.syncProject(project);
  }

  async createTransport(request: {
    project: EditorProject;
    snapshot?: TimelineRenderSnapshot;
    sequenceId?: string;
    revisionId?: string;
  }): Promise<DesktopParityPlaybackTransportDescriptor | null> {
    if (!window.electronAPI?.parityPlayback) {
      return null;
    }
    return window.electronAPI.parityPlayback.createTransport(request);
  }

  async attachStreams(transportHandle: string, streams: PlaybackStreamDescriptor[]): Promise<boolean> {
    if (!window.electronAPI?.parityPlayback) {
      return false;
    }
    return window.electronAPI.parityPlayback.attachStreams(transportHandle, streams);
  }

  async preroll(transportHandle: string, range: FrameRange): Promise<boolean> {
    if (!window.electronAPI?.parityPlayback) {
      return false;
    }
    return window.electronAPI.parityPlayback.preroll(transportHandle, range);
  }

  async start(transportHandle: string, frame: number): Promise<boolean> {
    if (!window.electronAPI?.parityPlayback) {
      return false;
    }
    return window.electronAPI.parityPlayback.start(transportHandle, frame);
  }

  async stop(transportHandle: string): Promise<boolean> {
    if (!window.electronAPI?.parityPlayback) {
      return false;
    }
    return window.electronAPI.parityPlayback.stop(transportHandle);
  }

  async releaseTransport(transportHandle: string): Promise<boolean> {
    if (!window.electronAPI?.parityPlayback) {
      return false;
    }
    return window.electronAPI.parityPlayback.releaseTransport(transportHandle);
  }

  async play(transportHandle: string, frame: number, playbackRate?: number): Promise<boolean> {
    if (!window.electronAPI?.parityPlayback) {
      return false;
    }
    return window.electronAPI.parityPlayback.play(transportHandle, frame, playbackRate);
  }

  async syncFrame(transportHandle: string, frame: number): Promise<boolean> {
    if (!window.electronAPI?.parityPlayback) {
      return false;
    }
    return window.electronAPI.parityPlayback.syncFrame(transportHandle, frame);
  }

  async getTelemetry(transportHandle: string): Promise<PlaybackTelemetry | null> {
    if (!window.electronAPI?.parityPlayback) {
      return null;
    }
    return window.electronAPI.parityPlayback.getTelemetry(transportHandle);
  }

  async attachOutputDevice(transportHandle: string, config: unknown): Promise<boolean> {
    if (!window.electronAPI?.parityPlayback) {
      return false;
    }
    return window.electronAPI.parityPlayback.attachOutputDevice(transportHandle, config);
  }

  async detachOutputDevice(transportHandle: string, deviceId?: string): Promise<boolean> {
    if (!window.electronAPI?.parityPlayback) {
      return false;
    }
    return window.electronAPI.parityPlayback.detachOutputDevice(transportHandle, deviceId);
  }

  async invalidateCaches(projectId: string): Promise<boolean> {
    if (!window.electronAPI?.parityPlayback) {
      return false;
    }
    return window.electronAPI.parityPlayback.invalidateCaches(projectId);
  }

  async getTransportView(transportHandle: string): Promise<DesktopParityPlaybackTransportView | null> {
    if (!window.electronAPI?.parityPlayback) {
      return null;
    }
    return window.electronAPI.parityPlayback.getTransportView(transportHandle);
  }

  async readLatestFrame(transportHandle: string): Promise<DesktopParityPlaybackFrame | null> {
    const view = await this.getTransportView(transportHandle);
    return view ? readDesktopParityPlaybackFrame(view) : null;
  }
}

export const desktopParityPlaybackBridge = new DesktopParityPlaybackBridge();
