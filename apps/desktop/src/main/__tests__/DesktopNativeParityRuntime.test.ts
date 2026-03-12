import os from 'os';
import path from 'path';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import type { EditorBin, EditorClip, EditorMediaAsset, EditorProject, EditorTrack } from '@mcua/core';
import { createDesktopNativeParityRuntime, DesktopNativeMediaManagementAdapter } from '../parity/DesktopNativeParityRuntime';

function makeAsset(overrides: Partial<EditorMediaAsset> & Pick<EditorMediaAsset, 'id' | 'name'>): EditorMediaAsset {
  return {
    id: overrides.id,
    name: overrides.name,
    type: overrides.type ?? 'VIDEO',
    duration: overrides.duration ?? 10,
    status: overrides.status ?? 'READY',
    thumbnailUrl: overrides.thumbnailUrl,
    playbackUrl: overrides.playbackUrl,
    waveformData: overrides.waveformData,
    fileExtension: overrides.fileExtension ?? 'mov',
    fileSizeBytes: overrides.fileSizeBytes,
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

function makeProject(sourcePath: string, offlineStem: string): EditorProject {
  const onlineAsset = makeAsset({
    id: 'asset-online',
    name: 'OnlineCam',
    playbackUrl: sourcePath,
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
  });

  const offlineAsset = makeAsset({
    id: 'asset-offline',
    name: offlineStem,
    status: 'OFFLINE',
    indexStatus: 'MISSING',
    locations: {
      pathHistory: [`/missing/${offlineStem}.mov`],
    },
    relinkIdentity: {
      assetKey: `${offlineStem}-key`,
      normalizedName: offlineStem.toLowerCase(),
      sourceFileStem: offlineStem,
      lastKnownPaths: [`/missing/${offlineStem}.mov`],
      frameRate: 24,
      durationSeconds: 10,
    },
    technicalMetadata: {
      frameRate: 24,
      width: 1920,
      height: 1080,
      sampleRate: 48000,
      audioChannels: 2,
      durationSeconds: 10,
    },
  });

  return {
    schemaVersion: 2,
    id: 'desktop-project-1',
    name: 'Desktop Native Runtime',
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
      makeTrack('V1', 'VIDEO', [makeClip('clip-1', 'V1', 'asset-online', 0, 10, 'video')]),
      makeTrack('A1', 'AUDIO', [makeClip('clip-2', 'A1', 'asset-online', 0, 10, 'audio')]),
    ],
    markers: [],
    bins: [makeBin('main', [onlineAsset, offlineAsset])],
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
      sourceAssetId: 'asset-online',
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

describe('DesktopNativeMediaManagementAdapter', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map(async (dir) => {
      await rm(dir, { recursive: true, force: true });
    }));
    tempDirs.length = 0;
  });

  it('binds projects, relinks offline media, consolidates, and transcodes with desktop-backed paths', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'avid-desktop-native-'));
    tempDirs.push(root);

    const packagePath = path.join(root, 'project-package');
    const sourceDir = path.join(root, 'source');
    const relinkDir = path.join(root, 'relink');
    const consolidateDir = path.join(root, 'consolidated');
    const proxyDir = path.join(root, 'proxy');

    await mkdir(packagePath, { recursive: true });
    await mkdir(sourceDir, { recursive: true });
    await mkdir(relinkDir, { recursive: true });

    const onlineSource = path.join(sourceDir, 'OnlineCam.mov');
    const relinkSource = path.join(relinkDir, 'OfflineCam.mov');
    await writeFile(onlineSource, 'online-media');
    await writeFile(relinkSource, 'offline-media');

    const project = makeProject(onlineSource, 'OfflineCam');
    const adapter = new DesktopNativeMediaManagementAdapter({
      pipeline: {
        async transcodeExportArtifact(request, outputDirectory) {
          const outputPath = path.join(outputDirectory, `${request.jobId}.${request.targetContainer}`);
          await mkdir(outputDirectory, { recursive: true });
          await writeFile(outputPath, Buffer.from(request.sourceArtifact));
          return {
            outputPath,
            outputContainer: request.targetContainer,
            outputVideoCodec: request.targetVideoCodec ?? 'libx264',
            outputAudioCodec: request.targetAudioCodec,
          };
        },
      },
    });

    await adapter.bindProject({
      project,
      projectPackagePath: packagePath,
    });

    const relinkResult = await adapter.relink({
      projectId: project.id,
      assetIds: ['asset-offline'],
      searchRoots: [relinkDir],
      strictKeys: ['clip-name'],
    });

    expect(relinkResult.relinkedAssetIds).toEqual(['asset-offline']);

    const consolidateHandle = await adapter.consolidate({
      projectId: project.id,
      assetIds: ['asset-online'],
      targetRoot: consolidateDir,
    });
    const transcodeHandle = await adapter.transcode({
      projectId: project.id,
      assetIds: ['asset-online'],
      targetCodec: 'prores-proxy',
      targetRoot: proxyDir,
      resolution: { width: 960, height: 540 },
    });

    const audit = await adapter.auditAssetLocations(project.id);
    const boundProject = adapter.getBoundProject(project.id);
    const mediaIndexPath = path.join(packagePath, 'media', 'indexes', 'media-index.json');
    const mediaIndex = JSON.parse(await readFile(mediaIndexPath, 'utf8')) as { assets: EditorMediaAsset[] };

    expect(consolidateHandle).toContain('desktop-consolidate-desktop-project-1');
    expect(transcodeHandle).toContain('desktop-transcode-desktop-project-1');
    expect(audit.some((locator) => locator.assetId === 'asset-offline' && locator.path === relinkSource && locator.online)).toBe(true);
    expect(audit.some((locator) => locator.assetId === 'asset-online' && locator.role === 'managed' && locator.path.startsWith(consolidateDir))).toBe(true);
    expect(audit.some((locator) => locator.assetId === 'asset-online' && locator.role === 'proxy' && locator.path.startsWith(proxyDir))).toBe(true);
    expect(boundProject?.bins[0]?.assets.find((asset) => asset.id === 'asset-offline')?.status).toBe('READY');
    expect(mediaIndex.assets.some((asset) => asset.id === 'asset-online' && asset.proxyMetadata?.filePath?.startsWith(proxyDir))).toBe(true);
  });
});

describe('DesktopNativeParityRuntime', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map(async (dir) => {
      await rm(dir, { recursive: true, force: true });
    }));
    tempDirs.length = 0;
  });

  it('replaces all nine parity ports with desktop-backed adapters', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'avid-desktop-runtime-'));
    tempDirs.push(root);

    const packagePath = path.join(root, 'project-package');
    const sourceDir = path.join(root, 'source');
    const relinkDir = path.join(root, 'relink');
    await mkdir(packagePath, { recursive: true });
    await mkdir(sourceDir, { recursive: true });
    await mkdir(relinkDir, { recursive: true });

    const onlineSource = path.join(sourceDir, 'OnlineCam.mov');
    const relinkSource = path.join(relinkDir, 'OfflineCam.mov');
    await writeFile(onlineSource, 'online-media');
    await writeFile(relinkSource, 'offline-media');

    const project = makeProject(onlineSource, 'OfflineCam');
    const runtime = createDesktopNativeParityRuntime({
      mediaAdapterOptions: {
        pipeline: {
          async transcodeExportArtifact(request, outputDirectory) {
            const outputPath = path.join(outputDirectory, `${request.jobId}.${request.targetContainer}`);
            await mkdir(outputDirectory, { recursive: true });
            await writeFile(outputPath, Buffer.from(request.sourceArtifact));
            return {
              outputPath,
              outputContainer: request.targetContainer,
              outputVideoCodec: request.targetVideoCodec ?? 'libx264',
              outputAudioCodec: request.targetAudioCodec,
            };
          },
          async writeConformExportPackage(project, paths, exportBaseName) {
            const exportDir = path.join(paths.exportsPath, `${exportBaseName}-test`);
            await mkdir(exportDir, { recursive: true });
            await writeFile(path.join(exportDir, 'project.avid.export.json'), JSON.stringify({ project }, null, 2));
            await writeFile(path.join(exportDir, 'media-index.json'), JSON.stringify({ projectId: project.id, assets: project.bins[0]?.assets ?? [] }, null, 2));
            await writeFile(path.join(exportDir, 'timeline.edl'), `TITLE: ${project.name}\n`);
            await writeFile(path.join(exportDir, 'timeline.otio.json'), JSON.stringify({ name: project.name }, null, 2));
            await writeFile(path.join(exportDir, 'audio-turnover.json'), JSON.stringify({ projectId: project.id }, null, 2));
            return exportDir;
          },
        },
      },
      sequenceRevisions: [
        {
          projectId: project.id,
          sequenceId: 'seq-1',
          revisionId: 'rev-1',
          events: [{ type: 'cut', trackId: 'V1', frame: 0, detail: 'Open on OnlineCam' }],
        },
        {
          projectId: project.id,
          sequenceId: 'seq-1',
          revisionId: 'rev-2',
          events: [
            { type: 'cut', trackId: 'V1', frame: 0, detail: 'Open on OnlineCam' },
            { type: 'replace', trackId: 'V1', frame: 96, detail: 'Replace shot with OfflineCam' },
          ],
        },
      ],
    });

    await runtime.bindProject({
      project,
      projectPackagePath: packagePath,
    });

    const relinkResult = await runtime.mediaManagement.relink({
      projectId: project.id,
      assetIds: ['asset-offline'],
      searchRoots: [relinkDir],
      strictKeys: ['clip-name'],
    });
    const snapshot = runtime.buildSnapshotForProject(project.id, 'seq-1', 'rev-1');
    const graph = await runtime.videoCompositing.compileGraph(snapshot);
    const composite = await runtime.videoCompositing.renderFrame({
      graphId: graph.graphId,
      frame: 12,
      target: 'record-monitor',
      quality: 'full',
    });
    const decodeSession = await runtime.mediaDecode.createSession(snapshot, {
      purpose: 'record-monitor',
      quality: 'full',
      prerollFrames: 12,
    });
    await runtime.mediaDecode.preroll(decodeSession, { startFrame: 0, endFrame: 12 });
    const decodedFrame = await runtime.mediaDecode.decodeVideoFrame(decodeSession, {
      assetId: 'asset-online',
      frame: 12,
      variant: 'source',
      priority: 'interactive',
    });
    const decodedAudio = await runtime.mediaDecode.decodeAudioSlice(decodeSession, {
      assetId: 'asset-online',
      timeRange: { startSeconds: 0, endSeconds: 1 },
      variant: 'source',
    });
    const transport = await runtime.realtimePlayback.createTransport(snapshot);
    await runtime.realtimePlayback.attachStreams(transport, [
      { streamId: 'program-video', assetId: 'asset-online', mediaType: 'video', role: 'program' },
      { streamId: 'program-audio', assetId: 'asset-online', mediaType: 'audio', role: 'program' },
      { streamId: 'angle-video', assetId: 'asset-offline', mediaType: 'video', role: 'multicam-angle' },
    ]);
    await runtime.realtimePlayback.preroll(transport, { startFrame: 0, endFrame: 24 });
    await runtime.realtimePlayback.start(transport, 0);
    const telemetry = await runtime.realtimePlayback.getTelemetry(transport);
    await runtime.realtimePlayback.stop(transport);
    const loudnessMix = await runtime.professionalAudioMix.compileMix(snapshot);
    await runtime.professionalAudioMix.writeAutomation(loudnessMix.mixId, {
      trackId: 'A1',
      parameter: 'gain',
      points: [
        { timeSeconds: 0, value: -2 },
        { timeSeconds: 1.5, value: 0 },
      ],
    });
    const audioPreview = await runtime.professionalAudioMix.renderPreview(loudnessMix.mixId, {
      startSeconds: 0,
      endSeconds: 3,
    });
    const loudness = await runtime.professionalAudioMix.analyzeLoudness(loudnessMix.mixId, {
      startSeconds: 0,
      endSeconds: 5,
    });
    const templatesBefore = await runtime.motionEffects.listTemplates();
    await runtime.motionEffects.invalidateTemplate(templatesBefore[0]!.templateId);
    const templatesAfter = await runtime.motionEffects.listTemplates();
    const motionFrame = await runtime.motionEffects.renderMotionFrame({
      templateId: templatesAfter[0]!.templateId,
      frame: 18,
      width: 1920,
      height: 1080,
      revisionId: snapshot.revisionId,
    });
    const edlPackage = await runtime.interchange.exportPackage(snapshot, 'EDL');
    const aafPackage = await runtime.interchange.exportPackage(snapshot, 'AAF');
    const importedPackage = await runtime.interchange.importPackage(aafPackage.artifactPaths[0]!);
    const validation = await runtime.interchange.validatePackage(edlPackage);
    const edlContents = await readFile(edlPackage.artifactPaths[0]!, 'utf8');
    const interchangeAuditPath = aafPackage.artifactPaths.find((artifactPath) => artifactPath.endsWith('desktop-interchange.audit.json'));
    const interchangeAudit = JSON.parse(await readFile(interchangeAuditPath!, 'utf8')) as {
      validation: { valid: boolean };
      primaryArtifacts: string[];
    };
    const standaloneImportDir = path.join(root, 'standalone-import');
    await mkdir(standaloneImportDir, { recursive: true });
    const standaloneAafPath = path.join(standaloneImportDir, 'external-tool.aaf.json');
    await writeFile(standaloneAafPath, await readFile(aafPackage.artifactPaths[0]!));
    const standaloneImportedPackage = await runtime.interchange.importPackage(standaloneAafPath);
    const diff = await runtime.changeLists.diffSequence({
      sequenceId: 'seq-1',
      baseRevisionId: 'rev-1',
      targetRevisionId: 'rev-2',
    });
    const changeList = await runtime.changeLists.exportChangeList({
      sequenceId: 'seq-1',
      baseRevisionId: 'rev-1',
      targetRevisionId: 'rev-2',
    });
    const changeEdl = await runtime.changeLists.exportEDL({
      sequenceId: 'seq-1',
      baseRevisionId: 'rev-1',
      targetRevisionId: 'rev-2',
    });
    const changeListContents = await readFile(changeList.path, 'utf8');
    const multicamGroup = await runtime.multicam.createGroup({
      groupId: 'multicam-1',
      projectId: project.id,
      sequenceId: 'seq-1',
      angles: [
        { angleId: 'angle-a', assetId: 'asset-online', label: 'Cam A', syncSource: 'timecode' },
        { angleId: 'angle-b', assetId: 'asset-offline', label: 'Cam B', syncSource: 'waveform' },
      ],
    });
    const multiview = await runtime.multicam.prepareMultiview('multicam-1', {
      startFrame: 0,
      endFrame: 48,
    });
    const multicamCuts = await runtime.multicam.recordCuts('multicam-1', [
      { frame: 0, angleId: 'angle-a' },
      { frame: 24, angleId: 'angle-b' },
    ]);
    const multicamCommit = await runtime.multicam.commitProgramTrack('multicam-1', 'V2');

    expect(relinkResult.relinkedAssetIds).toEqual(['asset-offline']);
    expect(runtime.getProject(project.id)?.bins[0]?.assets.find((asset) => asset.id === 'asset-offline')?.status).toBe('READY');
    expect(graph.graphId).toContain('desktop-graph-desktop-project-1');
    expect(composite.handle).toContain('desktop-composite-record-monitor');
    expect(decodeSession).toContain('desktop-decode-desktop-project-1');
    expect(decodedFrame?.handle).toContain('desktop-frame-asset-online');
    expect(decodedFrame?.storage).toBe('gpu');
    expect(decodedAudio?.sampleRate).toBe(48000);
    expect(transport).toContain('desktop-transport-desktop-project-1');
    expect(telemetry.activeStreamCount).toBe(3);
    expect(telemetry.maxDecodeLatencyMs).toBeGreaterThan(0);
    expect(loudnessMix.trackCount).toBe(1);
    expect(loudnessMix.mixId).toContain('desktop-mix-desktop-project-1');
    expect(audioPreview).toContain('desktop-mix-preview');
    expect(loudness.integratedLufs).toBeGreaterThan(-24);
    expect(templatesBefore).toHaveLength(3);
    expect(templatesAfter[0]?.version).not.toBe(templatesBefore[0]?.version);
    expect(motionFrame.handle).toContain('desktop-motion-');
    expect(edlPackage.artifactPaths[0]).toContain('timeline.edl');
    expect(aafPackage.artifactPaths[0]).toContain('timeline.aaf.json');
    expect(aafPackage.artifactPaths.some((artifactPath) => artifactPath.endsWith('protools-turnover.aaf.json'))).toBe(true);
    expect(aafPackage.artifactPaths.some((artifactPath) => artifactPath.endsWith('protools-turnover.validation.json'))).toBe(true);
    expect(aafPackage.artifactPaths.some((artifactPath) => artifactPath.endsWith('desktop-interchange.audit.json'))).toBe(true);
    expect(importedPackage.format).toBe('AAF');
    expect(standaloneImportedPackage.format).toBe('AAF');
    expect(standaloneImportedPackage.artifactPaths).toEqual([standaloneAafPath]);
    expect(validation.valid).toBe(true);
    expect(interchangeAudit.validation.valid).toBe(true);
    expect(interchangeAudit.primaryArtifacts.some((artifactPath) => artifactPath.endsWith('protools-turnover.aaf.json'))).toBe(true);
    expect(edlContents).toContain('TITLE: Desktop Native Runtime');
    expect(diff).toEqual([
      { type: 'replace', trackId: 'V1', frame: 96, detail: 'Replace shot with OfflineCam' },
    ]);
    expect(changeList.path).toContain('/change-lists/seq-1/rev-1-to-rev-2.txt');
    expect(changeEdl.path).toContain('timeline.edl');
    expect(changeListContents).toContain('REPLACE V1 @ 96: Replace shot with OfflineCam');
    expect(multicamGroup.synced).toBe(true);
    expect(multiview).toContain('desktop-multiview-multicam-1');
    expect(multicamCuts).toContain('desktop-multicam-cuts-multicam-1');
    expect(multicamCommit).toContain('desktop-multicam-commit-multicam-1');

    await runtime.videoCompositing.invalidateGraph(graph.graphId);
    await runtime.mediaDecode.releaseSession(decodeSession);
  });
});
