import { describe, expect, it } from 'vitest';
import { ProToolsAAFExporter } from '../protools/ProToolsAAFExporter';
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
    type: overrides.type ?? 'AUDIO',
    duration: overrides.duration ?? 12,
    status: overrides.status ?? 'READY',
    playbackUrl: overrides.playbackUrl,
    fileExtension: overrides.fileExtension ?? 'wav',
    indexStatus: overrides.indexStatus ?? 'READY',
    locations: overrides.locations,
    technicalMetadata: overrides.technicalMetadata,
    tags: overrides.tags ?? [],
    isFavorite: overrides.isFavorite ?? false,
  };
}

function makeClip(id: string, trackId: string, assetId: string): EditorClip {
  return {
    id,
    trackId,
    name: id,
    startTime: 0,
    endTime: 12,
    trimStart: 0,
    trimEnd: 0,
    type: 'audio',
    assetId,
  };
}

function makeTrack(id: string, clips: EditorClip[]): EditorTrack {
  return {
    id,
    name: id,
    type: 'AUDIO',
    sortOrder: 0,
    muted: false,
    locked: false,
    solo: false,
    volume: 1,
    clips,
    color: '#00ff00',
  };
}

function makeProject(assets: EditorMediaAsset[], tracks: EditorTrack[]): EditorProject {
  const bin: EditorBin = {
    id: 'main',
    name: 'Main',
    color: '#ffffff',
    children: [],
    assets,
    isOpen: true,
  };

  return {
    schemaVersion: 2,
    id: 'audio-project',
    name: 'Audio Project',
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
    tracks,
    markers: [],
    bins: [bin],
    collaborators: [],
    aiJobs: [],
    transcript: [],
    reviewComments: [],
    approvals: [],
    publishJobs: [],
    watchFolders: [],
    tokenBalance: 0,
    editorialState: {
      selectedBinId: 'main',
      sourceAssetId: assets[0]?.id ?? null,
      enabledTrackIds: tracks.map((track) => track.id),
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

describe('ProToolsAAFExporter', () => {
  it('preserves multichannel track assignment for containerized audio', () => {
    const surroundAsset = makeAsset({
      id: 'asset-surround',
      name: 'Production Mix',
      locations: {
        originalPath: '/facility/audio/ProductionMix.wav',
        managedPath: '/managed/audio/ProductionMix.wav',
        relativeManagedPath: 'audio/ProductionMix.wav',
        playbackUrl: '/managed/audio/ProductionMix.wav',
        pathHistory: ['/facility/audio/ProductionMix.wav'],
      },
      technicalMetadata: {
        sampleRate: 48000,
        audioChannels: 6,
        audioChannelLayout: '5.1',
      },
    });
    const project = makeProject(
      [surroundAsset],
      [makeTrack('A1', [makeClip('clip-surround', 'A1', surroundAsset.id)])],
    );

    const exportResult = new ProToolsAAFExporter(project).export();

    expect(exportResult.success).toBe(true);
    expect(exportResult.tracks[0]?.channelAssignment).toBe('5.1');
    expect(exportResult.tracks[0]?.clips[0]?.channelAssignment).toBe('5.1');
    expect(exportResult.tracks[0]?.clips[0]?.sourceFilePath).toBe('/managed/audio/ProductionMix.wav');
  });

  it('flags mixed track layouts during turnover validation', () => {
    const stereoAsset = makeAsset({
      id: 'asset-stereo',
      name: 'Stereo Mix',
      technicalMetadata: {
        sampleRate: 48000,
        audioChannels: 2,
        audioChannelLayout: 'stereo',
      },
    });
    const surroundAsset = makeAsset({
      id: 'asset-surround',
      name: 'Surround Mix',
      technicalMetadata: {
        sampleRate: 48000,
        audioChannels: 6,
        audioChannelLayout: '5.1',
      },
    });
    const project = makeProject(
      [stereoAsset, surroundAsset],
      [makeTrack('A1', [
        makeClip('clip-stereo', 'A1', stereoAsset.id),
        makeClip('clip-surround', 'A1', surroundAsset.id),
      ])],
    );

    const validation = new ProToolsAAFExporter(project).validate();

    expect(validation.valid).toBe(false);
    expect(validation.issues).toContain('Track "A1" mixes incompatible channel layouts: stereo, 5.1');
    expect(validation.summary.mixedLayoutTrackCount).toBe(1);
  });

  it('reports missing source paths and sample-rate conversion risks', () => {
    const resampleAsset = makeAsset({
      id: 'asset-resample',
      name: 'Production Stem',
      technicalMetadata: {
        sampleRate: 44100,
        audioChannels: 2,
        audioChannelLayout: 'stereo',
      },
    });
    const project = makeProject(
      [resampleAsset],
      [makeTrack('A1', [makeClip('clip-resample', 'A1', resampleAsset.id)])],
    );

    const validation = new ProToolsAAFExporter(project).validate();

    expect(validation.valid).toBe(false);
    expect(validation.issues).toContain(
      'Clip "clip-resample" on track "A1" is missing a resolvable source file path',
    );
    expect(validation.warnings).toContain(
      'Clip "clip-resample" on track "A1" will be sample-rate converted from 44100Hz to 48000Hz',
    );
    expect(validation.summary.missingSourcePathCount).toBe(1);
    expect(validation.summary.resampleRequiredCount).toBe(1);
    expect(validation.summary.insufficientHeadHandleCount).toBe(1);
    expect(validation.summary.insufficientTailHandleCount).toBe(1);
  });
});
