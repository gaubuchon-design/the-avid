import { ipcMain, type IpcMain } from 'electron';
import type {
  EditorProject,
  FrameRange,
  NativeResourceHandle,
  PlaybackStreamDescriptor,
  PlaybackTelemetry,
  TimelineRenderSnapshot,
} from '@mcua/core';
import {
  createDesktopNativeParityRuntime,
  type DesktopNativeParityRuntime,
  type DesktopNativeParityRuntimeOptions,
  type DesktopPlaybackTransportView,
} from './DesktopNativeParityRuntime';
import type { PlaybackConfig } from '../videoIO/types';

export interface DesktopParityPlaybackOutputBindings {
  startPlayback(config: PlaybackConfig): Promise<void> | void;
  stopPlayback(deviceId: string): Promise<void> | void;
  sendFrame(deviceId: string, frameData: Buffer): Promise<void> | void;
}

export interface DesktopParityPlaybackCreateTransportRequest {
  project: EditorProject;
  snapshot?: TimelineRenderSnapshot;
  sequenceId?: string;
  revisionId?: string;
}

export interface DesktopParityPlaybackTransportDescriptor {
  transportHandle: NativeResourceHandle;
  view: DesktopPlaybackTransportView;
}

export interface DesktopParityPlaybackManagerOptions {
  getProjectPackagePath(projectId: string): string;
  ensureProjectPackageDir(projectId: string): Promise<void>;
  outputBindings?: Partial<DesktopParityPlaybackOutputBindings>;
  runtime?: DesktopNativeParityRuntime;
  runtimeOptions?: Omit<DesktopNativeParityRuntimeOptions, 'mediaAdapterOptions'>;
}

function assertObject(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid parameter "${name}": expected an object`);
  }
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid parameter "${name}": expected a non-empty string`);
  }
}

function assertArray(value: unknown, name: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid parameter "${name}": expected an array`);
  }
}

function assertProject(value: unknown): asserts value is EditorProject {
  assertObject(value, 'project');
  if (typeof value['id'] !== 'string' || value['id'].length === 0) {
    throw new Error('Project must include a valid string "id" field');
  }
}

function assertCreateTransportRequest(value: unknown): asserts value is DesktopParityPlaybackCreateTransportRequest {
  assertObject(value, 'request');
  assertProject(value['project']);
  if (value['snapshot'] !== undefined) {
    assertObject(value['snapshot'], 'snapshot');
  }
  if (value['sequenceId'] !== undefined) {
    assertString(value['sequenceId'], 'sequenceId');
  }
  if (value['revisionId'] !== undefined) {
    assertString(value['revisionId'], 'revisionId');
  }
}

function assertPlaybackConfig(value: unknown): asserts value is PlaybackConfig {
  assertObject(value, 'config');
  assertString(value['deviceId'], 'deviceId');
  assertString(value['displayModeId'], 'displayModeId');
  assertString(value['pixelFormat'], 'pixelFormat');
  if (typeof value['audioChannels'] !== 'number' || !Number.isFinite(value['audioChannels'])) {
    throw new Error('Playback config must include numeric "audioChannels"');
  }
  if (typeof value['audioBitDepth'] !== 'number' || !Number.isFinite(value['audioBitDepth'])) {
    throw new Error('Playback config must include numeric "audioBitDepth"');
  }
}

function assertFrameRange(value: unknown): asserts value is FrameRange {
  assertObject(value, 'range');
  if (typeof value['startFrame'] !== 'number' || !Number.isFinite(value['startFrame'])) {
    throw new Error('Frame range must include numeric "startFrame"');
  }
  if (typeof value['endFrame'] !== 'number' || !Number.isFinite(value['endFrame'])) {
    throw new Error('Frame range must include numeric "endFrame"');
  }
}

export class DesktopParityPlaybackManager {
  private readonly runtime: DesktopNativeParityRuntime;
  private readonly getProjectPackagePath: (projectId: string) => string;
  private readonly ensureProjectPackageDir: (projectId: string) => Promise<void>;
  private ipcRegistered = false;

  constructor(options: DesktopParityPlaybackManagerOptions) {
    this.getProjectPackagePath = options.getProjectPackagePath;
    this.ensureProjectPackageDir = options.ensureProjectPackageDir;
    this.runtime = options.runtime ?? createDesktopNativeParityRuntime({
      ...options.runtimeOptions,
      mediaAdapterOptions: {
        playbackOutput: options.outputBindings,
      },
    });
  }

  async syncProject(project: EditorProject): Promise<void> {
    await this.ensureProjectPackageDir(project.id);
    await this.runtime.bindProject({
      project,
      projectPackagePath: this.getProjectPackagePath(project.id),
    });
  }

  async createTransport(
    request: DesktopParityPlaybackCreateTransportRequest,
  ): Promise<DesktopParityPlaybackTransportDescriptor> {
    await this.syncProject(request.project);
    const sequenceId = request.sequenceId ?? request.project.id;
    const revisionId = request.revisionId ?? `${sequenceId}-desktop-live`;
    const snapshot = request.snapshot ?? this.runtime.buildSnapshotForProject(request.project.id, sequenceId, revisionId);
    const transportHandle = await this.runtime.realtimePlayback.createTransport(snapshot);
    return {
      transportHandle,
      view: this.runtime.getPlaybackTransportView(transportHandle),
    };
  }

  getTransportView(transportHandle: NativeResourceHandle): DesktopPlaybackTransportView {
    return this.runtime.getPlaybackTransportView(transportHandle);
  }

  async attachStreams(
    transportHandle: NativeResourceHandle,
    streams: PlaybackStreamDescriptor[],
  ): Promise<void> {
    await this.runtime.realtimePlayback.attachStreams(transportHandle, streams);
  }

  async preroll(
    transportHandle: NativeResourceHandle,
    range: FrameRange,
  ): Promise<void> {
    await this.runtime.realtimePlayback.preroll(transportHandle, range);
  }

  async start(
    transportHandle: NativeResourceHandle,
    frame: number,
  ): Promise<void> {
    await this.runtime.realtimePlayback.start(transportHandle, frame);
  }

  async stop(transportHandle: NativeResourceHandle): Promise<void> {
    await this.runtime.realtimePlayback.stop(transportHandle);
  }

  async releaseTransport(transportHandle: NativeResourceHandle): Promise<void> {
    await this.runtime.releasePlaybackTransport(transportHandle);
  }

  async play(
    transportHandle: NativeResourceHandle,
    frame: number,
    playbackRate?: number,
  ): Promise<void> {
    await this.runtime.playPlaybackTransport(transportHandle, frame, playbackRate);
  }

  async syncFrame(
    transportHandle: NativeResourceHandle,
    frame: number,
  ): Promise<void> {
    await this.runtime.syncPlaybackTransportFrame(transportHandle, frame);
  }

  async getTelemetry(transportHandle: NativeResourceHandle): Promise<PlaybackTelemetry> {
    return this.runtime.realtimePlayback.getTelemetry(transportHandle);
  }

  async attachOutputDevice(
    transportHandle: NativeResourceHandle,
    config: PlaybackConfig,
  ): Promise<void> {
    await this.runtime.attachPlaybackOutputDevice(transportHandle, config);
  }

  async detachOutputDevice(
    transportHandle: NativeResourceHandle,
    deviceId?: string,
  ): Promise<void> {
    await this.runtime.detachPlaybackOutputDevice(transportHandle, deviceId);
  }

  async invalidateCaches(projectId: string): Promise<void> {
    await this.runtime.invalidatePlaybackCaches(projectId);
  }

  registerIPCHandlers(ipc: IpcMain = ipcMain): void {
    if (this.ipcRegistered) {
      return;
    }
    this.ipcRegistered = true;

    ipc.handle('parity-playback:sync-project', async (_event, project: unknown) => {
      assertProject(project);
      await this.syncProject(project);
      return true;
    });

    ipc.handle('parity-playback:create-transport', async (_event, request: unknown) => {
      assertCreateTransportRequest(request);
      return this.createTransport(request);
    });

    ipc.handle('parity-playback:get-transport-view', async (_event, transportHandle: unknown) => {
      assertString(transportHandle, 'transportHandle');
      return this.getTransportView(transportHandle);
    });

    ipc.handle('parity-playback:attach-streams', async (_event, transportHandle: unknown, streams: unknown) => {
      assertString(transportHandle, 'transportHandle');
      assertArray(streams, 'streams');
      await this.attachStreams(transportHandle, streams as PlaybackStreamDescriptor[]);
      return true;
    });

    ipc.handle('parity-playback:preroll', async (_event, transportHandle: unknown, range: unknown) => {
      assertString(transportHandle, 'transportHandle');
      assertFrameRange(range);
      await this.preroll(transportHandle, range);
      return true;
    });

    ipc.handle('parity-playback:start', async (_event, transportHandle: unknown, frame: unknown) => {
      assertString(transportHandle, 'transportHandle');
      if (typeof frame !== 'number' || !Number.isFinite(frame)) {
        throw new Error('Invalid parameter "frame": expected a finite number');
      }
      await this.start(transportHandle, frame);
      return true;
    });

    ipc.handle('parity-playback:stop', async (_event, transportHandle: unknown) => {
      assertString(transportHandle, 'transportHandle');
      await this.stop(transportHandle);
      return true;
    });

    ipc.handle('parity-playback:release-transport', async (_event, transportHandle: unknown) => {
      assertString(transportHandle, 'transportHandle');
      await this.releaseTransport(transportHandle);
      return true;
    });

    ipc.handle('parity-playback:play', async (_event, transportHandle: unknown, frame: unknown, playbackRate: unknown) => {
      assertString(transportHandle, 'transportHandle');
      if (typeof frame !== 'number' || !Number.isFinite(frame)) {
        throw new Error('Invalid parameter "frame": expected a finite number');
      }
      if (playbackRate !== undefined && (typeof playbackRate !== 'number' || !Number.isFinite(playbackRate))) {
        throw new Error('Invalid parameter "playbackRate": expected a finite number');
      }
      await this.play(transportHandle, frame, playbackRate as number | undefined);
      return true;
    });

    ipc.handle('parity-playback:sync-frame', async (_event, transportHandle: unknown, frame: unknown) => {
      assertString(transportHandle, 'transportHandle');
      if (typeof frame !== 'number' || !Number.isFinite(frame)) {
        throw new Error('Invalid parameter "frame": expected a finite number');
      }
      await this.syncFrame(transportHandle, frame);
      return true;
    });

    ipc.handle('parity-playback:get-telemetry', async (_event, transportHandle: unknown) => {
      assertString(transportHandle, 'transportHandle');
      return this.getTelemetry(transportHandle);
    });

    ipc.handle('parity-playback:attach-output-device', async (_event, transportHandle: unknown, config: unknown) => {
      assertString(transportHandle, 'transportHandle');
      assertPlaybackConfig(config);
      await this.attachOutputDevice(transportHandle, config);
      return true;
    });

    ipc.handle('parity-playback:detach-output-device', async (_event, transportHandle: unknown, deviceId: unknown) => {
      assertString(transportHandle, 'transportHandle');
      if (deviceId !== undefined) {
        assertString(deviceId, 'deviceId');
      }
      await this.detachOutputDevice(transportHandle, deviceId as string | undefined);
      return true;
    });

    ipc.handle('parity-playback:invalidate-caches', async (_event, projectId: unknown) => {
      assertString(projectId, 'projectId');
      await this.invalidateCaches(projectId);
      return true;
    });
  }
}
