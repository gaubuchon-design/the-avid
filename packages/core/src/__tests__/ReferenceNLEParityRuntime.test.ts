import { describe, expect, it } from 'vitest';
import {
  ReferenceNLEParityRuntime,
  createReferenceNLEParityRuntime,
  type ReferenceSequenceRevision,
} from '../parity';
import type {
  EditorBin,
  EditorClip,
  EditorMediaAsset,
  EditorProject,
  EditorTrack,
} from '../project-library';

function makeAsset(overrides: Partial<EditorMediaAsset> & Pick<EditorMediaAsset, 'id' | 'name'>): EditorMediaAsset {
  return {
    id: overrides.id,
    name: overrides.name,
    type: overrides.type ?? 'VIDEO',
    duration: overrides.duration ?? 20,
    status: overrides.status ?? 'READY',
    thumbnailUrl: overrides.thumbnailUrl,
    playbackUrl: overrides.playbackUrl,
    waveformData: overrides.waveformData,
    fileExtension: overrides.fileExtension ?? 'mov',
    fileSizeBytes: overrides.fileSizeBytes ?? 2_000_000,
    indexStatus: overrides.indexStatus ?? 'READY',
    ingestMetadata: overrides.ingestMetadata,
    locations: overrides.locations,
    fingerprint: overrides.fingerprint,
    technicalMetadata: overrides.technicalMetadata,
    relinkIdentity: overrides.relinkIdentity,
    proxyMetadata: overrides.proxyMetadata,
    waveformMetadata: overrides.waveformMetadata,
    semanticMetadata: overrides.semanticMetadata,
    tags: overrides.tags ?? [],
    isFavorite: overrides.isFavorite ?? false,
  };
}

function makeClip(id: string, trackId: string, assetId: string, startTime: number, endTime: number, type: EditorClip['type']): EditorClip {
  return {
    id,
    trackId,
    name: id,
    startTime,
    endTime,
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

function makeBin(id: string, assets: EditorMediaAsset[]): EditorBin {
  return {
    id,
    name: id,
    color: '#ffffff',
    children: [],
    assets,
    isOpen: true,
  };
}

function makeProject(): EditorProject {
  const assetA = makeAsset({
    id: 'asset-a',
    name: 'CamA',
    duration: 24,
    locations: {
      originalPath: '/mnt/facility/CamA.mov',
      managedPath: '/managed/CamA.mov',
      relativeManagedPath: 'CamA.mov',
      playbackUrl: '/managed/CamA.mov',
      pathHistory: ['/mnt/facility/CamA.mov', '/managed/CamA.mov'],
    },
    playbackUrl: '/managed/CamA.mov',
    technicalMetadata: {
      frameRate: 24,
      width: 1920,
      height: 1080,
      sampleRate: 48000,
      audioChannels: 2,
      durationSeconds: 24,
      timecodeStart: '01:00:00:00',
      reelName: 'CAMA',
    },
    waveformMetadata: {
      status: 'READY',
      peaks: [0, 1, 0, 1, 0.2],
      sampleCount: 5,
      updatedAt: '2024-01-01T00:00:00Z',
    },
    fingerprint: {
      algorithm: 'sha1-partial',
      digest: 'digest-a',
      sizeBytes: 2_000_000,
      modifiedAt: '2024-01-01T00:00:00Z',
    },
  });
  const assetB = makeAsset({
    id: 'asset-b',
    name: 'CamB',
    duration: 24,
    locations: {
      originalPath: '/mnt/facility/CamB.mov',
      managedPath: '/managed/CamB.mov',
      relativeManagedPath: 'CamB.mov',
      playbackUrl: '/managed/CamB.mov',
      pathHistory: ['/mnt/facility/CamB.mov', '/managed/CamB.mov'],
    },
    playbackUrl: '/managed/CamB.mov',
    technicalMetadata: {
      frameRate: 24,
      width: 1920,
      height: 1080,
      sampleRate: 48000,
      audioChannels: 2,
      durationSeconds: 24,
      timecodeStart: '01:00:00:12',
      reelName: 'CAMB',
    },
    waveformMetadata: {
      status: 'READY',
      peaks: [0, 0.9, 0.1, 1, 0.1],
      sampleCount: 5,
      updatedAt: '2024-01-01T00:00:00Z',
    },
  });
  const relinkSource = makeAsset({
    id: 'asset-c-source',
    name: 'OfflineCam',
    duration: 10,
    locations: {
      originalPath: '/mnt/facility/offline/OfflineCam.mov',
      managedPath: '/managed/OfflineCam.mov',
      relativeManagedPath: 'OfflineCam.mov',
      playbackUrl: '/managed/OfflineCam.mov',
      pathHistory: ['/mnt/facility/offline/OfflineCam.mov'],
    },
    playbackUrl: '/managed/OfflineCam.mov',
    technicalMetadata: {
      frameRate: 24,
      width: 1280,
      height: 720,
      durationSeconds: 10,
      sampleRate: 48000,
      audioChannels: 2,
    },
    fingerprint: {
      algorithm: 'sha1-partial',
      digest: 'offline-digest',
      sizeBytes: 1_000_000,
      modifiedAt: '2024-01-01T00:00:00Z',
    },
  });
  const offlineAsset = makeAsset({
    id: 'asset-c-offline',
    name: 'OfflineCam',
    duration: 10,
    status: 'OFFLINE',
    indexStatus: 'MISSING',
    locations: {
      pathHistory: ['/missing/OfflineCam.mov'],
    },
    relinkIdentity: {
      assetKey: 'offline-1',
      normalizedName: 'offlinecam',
      sourceFileStem: 'offlinecam',
      lastKnownPaths: ['/missing/OfflineCam.mov'],
      durationSeconds: 10,
      frameRate: 24,
    },
    technicalMetadata: {
      frameRate: 24,
      width: 1280,
      height: 720,
      durationSeconds: 10,
      sampleRate: 48000,
      audioChannels: 2,
    },
    fingerprint: {
      algorithm: 'sha1-partial',
      digest: 'offline-digest',
      sizeBytes: 1_000_000,
      modifiedAt: '2024-01-01T00:00:00Z',
    },
  });

  const videoTrack = makeTrack('V1', 'VIDEO', [
    makeClip('clip-a', 'V1', 'asset-a', 0, 12, 'video'),
    makeClip('clip-b', 'V1', 'asset-b', 12, 24, 'video'),
  ]);
  const audioTrack = makeTrack('A1', 'AUDIO', [
    makeClip('clip-a-audio', 'A1', 'asset-a', 0, 12, 'audio'),
    makeClip('clip-b-audio', 'A1', 'asset-b', 12, 24, 'audio'),
  ]);

  return {
    schemaVersion: 2,
    id: 'project-1',
    name: 'Parity Runtime Project',
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
    tracks: [videoTrack, audioTrack],
    markers: [],
    bins: [makeBin('main', [assetA, assetB, relinkSource, offlineAsset])],
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
      sourceAssetId: 'asset-a',
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

function makeRuntime(): ReferenceNLEParityRuntime {
  const project = makeProject();
  const revisions: ReferenceSequenceRevision[] = [
    {
      projectId: project.id,
      sequenceId: 'seq-1',
      revisionId: 'rev-a',
      events: [
        { type: 'cut', trackId: 'V1', frame: 0, detail: 'Open on CamA' },
      ],
    },
    {
      projectId: project.id,
      sequenceId: 'seq-1',
      revisionId: 'rev-b',
      events: [
        { type: 'cut', trackId: 'V1', frame: 0, detail: 'Open on CamA' },
        { type: 'replace', trackId: 'V1', frame: 288, detail: 'Replace second shot with CamB' },
      ],
    },
  ];
  return createReferenceNLEParityRuntime({
    projects: [project],
    sequenceRevisions: revisions,
  });
}

describe('ReferenceNLEParityRuntime', () => {
  it('drives decode and compositing from a project snapshot', async () => {
    const runtime = makeRuntime();
    const snapshot = runtime.buildSnapshotForProject('project-1', 'seq-1', 'rev-a');

    const session = await runtime.mediaDecode.createSession(snapshot, {
      purpose: 'record-monitor',
      quality: 'full',
      prerollFrames: 12,
    });
    await runtime.mediaDecode.preroll(session, { startFrame: 0, endFrame: 12 });

    const frame = await runtime.mediaDecode.decodeVideoFrame(session, {
      assetId: 'asset-a',
      frame: 24,
      variant: 'source',
      priority: 'interactive',
    });
    const audio = await runtime.mediaDecode.decodeAudioSlice(session, {
      assetId: 'asset-a',
      timeRange: { startSeconds: 0, endSeconds: 1 },
      variant: 'source',
    });

    expect(frame?.width).toBe(1920);
    expect(frame?.storage).toBe('gpu');
    expect(audio?.sampleRate).toBe(48000);

    const graph = await runtime.videoCompositing.compileGraph(snapshot);
    const composite = await runtime.videoCompositing.renderFrame({
      graphId: graph.graphId,
      frame: 24,
      target: 'record-monitor',
      quality: 'full',
    });

    expect(graph.nodes.some((node) => node.id === 'program-output')).toBe(true);
    expect(composite.width).toBe(1920);
    expect(composite.handle).toContain('composite-record-monitor');
  });

  it('exports, validates, imports, and diffs interchange artifacts', async () => {
    const runtime = makeRuntime();
    const snapshot = runtime.buildSnapshotForProject('project-1', 'seq-1', 'rev-b');

    const aafPackage = await runtime.interchange.exportPackage(snapshot, 'AAF');
    const edlPackage = await runtime.interchange.exportPackage(snapshot, 'EDL');
    const validation = await runtime.interchange.validatePackage(aafPackage);
    const imported = await runtime.interchange.importPackage(aafPackage.artifactPaths[0]!);
    const diff = await runtime.changeLists.diffSequence({
      sequenceId: 'seq-1',
      baseRevisionId: 'rev-a',
      targetRevisionId: 'rev-b',
    });
    const changeList = await runtime.changeLists.exportChangeList({
      sequenceId: 'seq-1',
      baseRevisionId: 'rev-a',
      targetRevisionId: 'rev-b',
    });
    const edl = await runtime.changeLists.exportEDL({
      sequenceId: 'seq-1',
      baseRevisionId: 'rev-a',
      targetRevisionId: 'rev-b',
    });

    expect(aafPackage.assets.length).toBeGreaterThan(0);
    expect(edlPackage.artifactPaths[0]).toContain('.edl');
    expect(validation.valid).toBe(true);
    expect(imported.sequenceId).toBe('seq-1');
    expect(diff).toHaveLength(1);
    expect(changeList.path).toContain('rev-a-to-rev-b');
    expect(edl.path).toContain('.edl');
    expect(runtime.listArtifacts().some((artifact) => artifact.path === changeList.path)).toBe(true);
  });

  it('runs transport, audio, and motion services', async () => {
    const runtime = makeRuntime();
    const snapshot = runtime.buildSnapshotForProject('project-1', 'seq-1', 'rev-b');

    const transport = await runtime.realtimePlayback.createTransport(snapshot);
    await runtime.realtimePlayback.attachStreams(transport, [
      { streamId: 'video-main', assetId: 'asset-a', mediaType: 'video', role: 'program' },
      { streamId: 'audio-main', assetId: 'asset-a', mediaType: 'audio', role: 'program' },
    ]);
    await runtime.realtimePlayback.preroll(transport, { startFrame: 0, endFrame: 24 });
    await runtime.realtimePlayback.start(transport, 0);
    const telemetry = await runtime.realtimePlayback.getTelemetry(transport);
    await runtime.realtimePlayback.stop(transport);

    const mix = await runtime.professionalAudioMix.compileMix(snapshot);
    await runtime.professionalAudioMix.writeAutomation(mix.mixId, {
      trackId: 'A1',
      parameter: 'gain',
      points: [
        { timeSeconds: 0, value: -2 },
        { timeSeconds: 2, value: 0 },
      ],
    });
    const preview = await runtime.professionalAudioMix.renderPreview(mix.mixId, {
      startSeconds: 0,
      endSeconds: 5,
    });
    const loudness = await runtime.professionalAudioMix.analyzeLoudness(mix.mixId, {
      startSeconds: 0,
      endSeconds: 5,
    });

    const templates = await runtime.motionEffects.listTemplates();
    const rendered = await runtime.motionEffects.renderMotionFrame({
      templateId: templates[0]!.templateId,
      frame: 12,
      width: 1920,
      height: 1080,
      revisionId: 'rev-b',
    });

    expect(telemetry.activeStreamCount).toBe(2);
    expect(telemetry.maxDecodeLatencyMs).toBeGreaterThan(0);
    expect(preview).toContain('mix-preview');
    expect(loudness.integratedLufs).toBeGreaterThan(-24);
    expect(templates).toHaveLength(3);
    expect(rendered.handle).toContain('motion');
  });

  it('handles media management and multicam workflows', async () => {
    const runtime = makeRuntime();

    const beforeAudit = await runtime.mediaManagement.auditAssetLocations('project-1');
    const relink = await runtime.mediaManagement.relink({
      projectId: 'project-1',
      assetIds: ['asset-c-offline'],
      searchRoots: ['/mnt/facility/offline'],
      strictKeys: ['hash', 'clip-name'],
    });
    const consolidate = await runtime.mediaManagement.consolidate({
      projectId: 'project-1',
      assetIds: ['asset-c-offline'],
      targetRoot: '/consolidated',
    });
    const transcode = await runtime.mediaManagement.transcode({
      projectId: 'project-1',
      assetIds: ['asset-c-offline'],
      targetCodec: 'prores-proxy',
      targetRoot: '/proxy-cache',
      resolution: { width: 960, height: 540 },
    });
    const afterAudit = await runtime.mediaManagement.auditAssetLocations('project-1');

    expect(beforeAudit.some((locator) => locator.assetId === 'asset-c-offline')).toBe(false);
    expect(relink.relinkedAssetIds).toEqual(['asset-c-offline']);
    expect(consolidate).toContain('consolidate-project-1');
    expect(transcode).toContain('transcode-project-1');
    expect(afterAudit.some((locator) => locator.assetId === 'asset-c-offline' && locator.role === 'managed')).toBe(true);
    expect(afterAudit.some((locator) => locator.assetId === 'asset-c-offline' && locator.role === 'proxy')).toBe(true);

    const group = await runtime.multicam.createGroup({
      groupId: 'multicam-1',
      projectId: 'project-1',
      sequenceId: 'seq-1',
      angles: [
        { angleId: 'angle-a', assetId: 'asset-a', label: 'Cam A', syncSource: 'timecode' },
        { angleId: 'angle-b', assetId: 'asset-b', label: 'Cam B', syncSource: 'timecode' },
      ],
    });
    const multiview = await runtime.multicam.prepareMultiview('multicam-1', {
      startFrame: 0,
      endFrame: 48,
    });
    const cutJob = await runtime.multicam.recordCuts('multicam-1', [
      { frame: 0, angleId: 'angle-a' },
      { frame: 24, angleId: 'angle-b' },
    ]);
    const commit = await runtime.multicam.commitProgramTrack('multicam-1', 'V2');

    expect(group.synced).toBe(true);
    expect(multiview).toContain('multiview-multicam-1');
    expect(cutJob).toContain('multicam-cuts-multicam-1');
    expect(commit).toContain('multicam-commit-multicam-1');
  });
});
