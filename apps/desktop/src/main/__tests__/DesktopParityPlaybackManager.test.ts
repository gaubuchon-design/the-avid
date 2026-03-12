import os from 'os';
import path from 'path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorBin, EditorClip, EditorMediaAsset, EditorProject, EditorTrack } from '@mcua/core';
import { DesktopParityPlaybackManager } from '../parity/DesktopParityPlaybackManager';

function makeAsset(sourcePath: string): EditorMediaAsset {
  return {
    id: 'asset-online',
    name: 'Online Cam',
    type: 'VIDEO',
    duration: 10,
    status: 'READY',
    playbackUrl: sourcePath,
    fileExtension: 'mov',
    indexStatus: 'READY',
    locations: {
      originalPath: sourcePath,
      managedPath: sourcePath,
      relativeManagedPath: 'OnlineCam.mov',
      playbackUrl: sourcePath,
      pathHistory: [sourcePath],
    },
    technicalMetadata: {
      frameRate: 24,
      width: 1920,
      height: 1080,
      sampleRate: 48000,
      audioChannels: 2,
      durationSeconds: 10,
    },
    tags: [],
    isFavorite: false,
  };
}

function makeClip(id: string, trackId: string, assetId: string, type: EditorClip['type']): EditorClip {
  return {
    id,
    trackId,
    name: id,
    startTime: 0,
    endTime: 10,
    trimStart: 0,
    trimEnd: 0,
    type,
    assetId,
  };
}

function makeTrack(id: string, type: EditorTrack['type'], clips: EditorClip[]): EditorTrack {
  return {
    id,
    name: id,
    type,
    sortOrder: 0,
    muted: false,
    locked: false,
    solo: false,
    volume: 1,
    clips,
    color: '#00ff00',
  };
}

function makeBin(asset: EditorMediaAsset): EditorBin {
  return {
    id: 'main',
    name: 'Main',
    color: '#ffffff',
    children: [],
    assets: [asset],
    isOpen: true,
  };
}

function makeProject(sourcePath: string): EditorProject {
  const asset = makeAsset(sourcePath);
  return {
    schemaVersion: 2,
    id: 'desktop-project-bridge',
    name: 'Desktop Playback Bridge',
    description: '',
    template: 'film',
    tags: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    progress: 0,
    settings: {
      frameRate: 24,
      width: 1920,
      height: 1080,
      sampleRate: 48000,
      exportFormat: 'mov',
    },
    tracks: [
      makeTrack('V1', 'VIDEO', [makeClip('clip-v1', 'V1', asset.id, 'video')]),
      makeTrack('A1', 'AUDIO', [makeClip('clip-a1', 'A1', asset.id, 'audio')]),
    ],
    markers: [],
    bins: [makeBin(asset)],
    collaborators: [],
    aiJobs: [],
    transcript: [],
    reviewComments: [],
    approvals: [],
    publishJobs: [],
    watchFolders: [],
    tokenBalance: 1000,
    editorialState: {
      selectedBinId: 'main',
      sourceAssetId: asset.id,
      enabledTrackIds: ['V1', 'A1'],
      syncLockedTrackIds: [],
      videoMonitorTrackId: 'V1',
      sourceTrackDescriptors: [],
      trackPatches: [],
    },
    workstationState: {
      subtitleTracks: [],
      titleClips: [],
      trackHeights: {},
      activeWorkspaceId: 'source-record',
      composerLayout: 'source-record',
      showTrackingInfo: true,
      trackingInfoFields: ['master-tc'],
      clipTextDisplay: 'name',
      dupeDetectionEnabled: false,
      versionHistoryRetentionPreference: 'manual',
      versionHistoryCompareMode: 'summary',
    },
  };
}

describe('DesktopParityPlaybackManager', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(tempDirs.map(async (dir) => {
      await rm(dir, { recursive: true, force: true });
    }));
    tempDirs.length = 0;
  });

  it('creates a transport from the current project and forwards output to device bindings', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'desktop-parity-playback-'));
    tempDirs.push(tempDir);

    const sourcePath = path.join(tempDir, 'OnlineCam.mov');
    await writeFile(sourcePath, 'desktop playback source', 'utf8');

    const startPlayback = vi.fn<(config: {
      deviceId: string;
      displayModeId: string;
      pixelFormat: '8BitBGRA';
      audioChannels: number;
      audioBitDepth: 24;
    }) => Promise<void>>(async () => undefined);
    const stopPlayback = vi.fn<(deviceId: string) => Promise<void>>(async () => undefined);
    const sendFrame = vi.fn<(deviceId: string, frameData: Buffer) => Promise<void>>(async () => undefined);

    const manager = new DesktopParityPlaybackManager({
      getProjectPackagePath: (projectId) => path.join(tempDir, projectId),
      ensureProjectPackageDir: async (projectId) => {
        await mkdir(path.join(tempDir, projectId), { recursive: true });
      },
      outputBindings: {
        startPlayback,
        stopPlayback,
        sendFrame,
      },
    });

    const project = makeProject(sourcePath);
    const descriptor = await manager.createTransport({
      project,
      sequenceId: 'seq-bridge',
      revisionId: 'rev-bridge',
    });

    expect(descriptor.transportHandle).toContain('desktop-transport-desktop-project-bridge');
    expect(descriptor.view.width).toBe(1920);
    expect(descriptor.view.height).toBe(1080);
    expect(descriptor.view.buffer.byteLength).toBeGreaterThan(0);

    await manager.attachStreams(descriptor.transportHandle, [
      { streamId: 'program-video', assetId: 'asset-online', mediaType: 'video', role: 'program' },
      { streamId: 'program-audio', assetId: 'asset-online', mediaType: 'audio', role: 'program' },
    ]);
    await manager.preroll(descriptor.transportHandle, { startFrame: 0, endFrame: 24 });
    await manager.attachOutputDevice(descriptor.transportHandle, {
      deviceId: 'decklink-1',
      displayModeId: '1080p24',
      pixelFormat: '8BitBGRA',
      audioChannels: 2,
      audioBitDepth: 24,
    });
    await manager.start(descriptor.transportHandle, 12);

    const telemetry = await manager.getTelemetry(descriptor.transportHandle);
    expect(telemetry.activeStreamCount).toBe(2);
    expect(telemetry.streamPressure).toBe('single');
    expect(telemetry.currentQuality).toBe('full');
    expect(telemetry.cacheStrategy).toBe('source-only');
    expect(startPlayback).toHaveBeenCalledWith({
      deviceId: 'decklink-1',
      displayModeId: '1080p24',
      pixelFormat: '8BitBGRA',
      audioChannels: 2,
      audioBitDepth: 24,
    });
    expect(sendFrame).toHaveBeenCalledTimes(1);
    const firstSendFrameCall = sendFrame.mock.calls[0];
    expect(firstSendFrameCall?.[0]).toBe('decklink-1');
    expect(Buffer.isBuffer(firstSendFrameCall?.[1])).toBe(true);

    await manager.stop(descriptor.transportHandle);
    expect(stopPlayback).toHaveBeenCalledWith('decklink-1');

    await manager.invalidateCaches(project.id);
    await manager.releaseTransport(descriptor.transportHandle);
  });

  it('keeps rendering and forwarding frames while continuous playback is running', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'desktop-parity-playback-loop-'));
    tempDirs.push(tempDir);

    const sourcePath = path.join(tempDir, 'OnlineCam.mov');
    await writeFile(sourcePath, 'desktop playback source', 'utf8');

    const sendFrame = vi.fn<(deviceId: string, frameData: Buffer) => Promise<void>>(async () => undefined);
    const manager = new DesktopParityPlaybackManager({
      getProjectPackagePath: (projectId) => path.join(tempDir, projectId),
      ensureProjectPackageDir: async (projectId) => {
        await mkdir(path.join(tempDir, projectId), { recursive: true });
      },
      outputBindings: {
        startPlayback: vi.fn(async () => undefined),
        stopPlayback: vi.fn(async () => undefined),
        sendFrame,
      },
    });

    const project = makeProject(sourcePath);
    const descriptor = await manager.createTransport({
      project,
      sequenceId: 'seq-loop',
      revisionId: 'rev-loop',
    });

    await manager.attachStreams(descriptor.transportHandle, [
      { streamId: 'program-video', assetId: 'asset-online', mediaType: 'video', role: 'program' },
      { streamId: 'program-audio', assetId: 'asset-online', mediaType: 'audio', role: 'program' },
    ]);
    await manager.preroll(descriptor.transportHandle, { startFrame: 0, endFrame: 24 });
    await manager.attachOutputDevice(descriptor.transportHandle, {
      deviceId: 'decklink-1',
      displayModeId: '1080p24',
      pixelFormat: '8BitBGRA',
      audioChannels: 2,
      audioBitDepth: 24,
    });

    await manager.play(descriptor.transportHandle, 0);
    await new Promise((resolve) => {
      setTimeout(resolve, 175);
    });

    expect(sendFrame.mock.calls.length).toBeGreaterThan(1);

    const telemetry = await manager.getTelemetry(descriptor.transportHandle);
    expect(telemetry.activeStreamCount).toBe(2);
    expect(telemetry.currentQuality).toBe('full');

    await manager.stop(descriptor.transportHandle);
    await manager.releaseTransport(descriptor.transportHandle);
  });

  it('drops into promoted-cache policy under heavy multistream pressure', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'desktop-parity-playback-heavy-'));
    tempDirs.push(tempDir);

    const sourcePath = path.join(tempDir, 'OnlineCam.mov');
    await writeFile(sourcePath, 'desktop playback source', 'utf8');

    const sendFrame = vi.fn<(deviceId: string, frameData: Buffer) => Promise<void>>(async () => undefined);
    const manager = new DesktopParityPlaybackManager({
      getProjectPackagePath: (projectId) => path.join(tempDir, projectId),
      ensureProjectPackageDir: async (projectId) => {
        await mkdir(path.join(tempDir, projectId), { recursive: true });
      },
      outputBindings: {
        startPlayback: vi.fn(async () => undefined),
        stopPlayback: vi.fn(async () => undefined),
        sendFrame,
      },
    });

    const project = makeProject(sourcePath);
    const descriptor = await manager.createTransport({
      project,
      sequenceId: 'seq-heavy',
      revisionId: 'rev-heavy',
    });

    await manager.attachStreams(descriptor.transportHandle, [
      { streamId: 'video-1', assetId: 'asset-online', mediaType: 'video', role: 'program' },
      { streamId: 'video-2', assetId: 'asset-online', mediaType: 'video', role: 'program' },
      { streamId: 'video-3', assetId: 'asset-online', mediaType: 'video', role: 'program' },
      { streamId: 'video-4', assetId: 'asset-online', mediaType: 'video', role: 'program' },
      { streamId: 'video-5', assetId: 'asset-online', mediaType: 'video', role: 'program' },
      { streamId: 'audio-1', assetId: 'asset-online', mediaType: 'audio', role: 'program' },
    ]);
    await manager.preroll(descriptor.transportHandle, { startFrame: 0, endFrame: 24 });
    await manager.attachOutputDevice(descriptor.transportHandle, {
      deviceId: 'decklink-1',
      displayModeId: '1080p24',
      pixelFormat: '8BitBGRA',
      audioChannels: 2,
      audioBitDepth: 24,
    });

    await manager.play(descriptor.transportHandle, 0);
    await new Promise((resolve) => {
      setTimeout(resolve, 225);
    });

    expect(sendFrame.mock.calls.length).toBeGreaterThan(1);

    const telemetry = await manager.getTelemetry(descriptor.transportHandle);
    expect(telemetry.activeStreamCount).toBe(6);
    expect(telemetry.streamPressure).toBe('heavy');
    expect(telemetry.currentQuality).toBe('draft');
    expect(telemetry.cacheStrategy).toBe('prefer-promoted-cache');
    expect(telemetry.promotedFrameCount).toBeGreaterThan(0);

    await manager.stop(descriptor.transportHandle);
    await manager.releaseTransport(descriptor.transportHandle);
  });
});
