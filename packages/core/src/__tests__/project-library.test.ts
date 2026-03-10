import { describe, it, expect } from 'vitest';
import {
  buildProject,
  buildSeedProjectLibrary,
  flattenAssets,
  getProjectDuration,
  hydrateProject,
} from '../project-library';
import type { EditorBin, EditorMediaAsset, EditorProject, EditorTrack, EditorClip } from '../project-library';

// =============================================================================
//  Test helpers
// =============================================================================

function makeAsset(overrides: Partial<EditorMediaAsset> = {}): EditorMediaAsset {
  return {
    id: overrides.id ?? 'asset-1',
    name: overrides.name ?? 'test-asset.mp4',
    type: overrides.type ?? 'VIDEO',
    status: overrides.status ?? 'READY',
    tags: overrides.tags ?? [],
    isFavorite: overrides.isFavorite ?? false,
    ...overrides,
  };
}

function makeBin(overrides: Partial<EditorBin> = {}): EditorBin {
  return {
    id: overrides.id ?? 'bin-1',
    name: overrides.name ?? 'Test Bin',
    color: overrides.color ?? '#ffffff',
    children: overrides.children ?? [],
    assets: overrides.assets ?? [],
    isOpen: overrides.isOpen ?? true,
    ...overrides,
  };
}

function makeClip(overrides: Partial<EditorClip> = {}): EditorClip {
  return {
    id: overrides.id ?? 'clip-1',
    trackId: overrides.trackId ?? 'track-1',
    name: overrides.name ?? 'Test Clip',
    startTime: overrides.startTime ?? 0,
    endTime: overrides.endTime ?? 10,
    trimStart: overrides.trimStart ?? 0,
    trimEnd: overrides.trimEnd ?? 10,
    type: overrides.type ?? 'video',
    ...overrides,
  };
}

function makeTrack(overrides: Partial<EditorTrack> = {}): EditorTrack {
  return {
    id: overrides.id ?? 'track-1',
    name: overrides.name ?? 'V1',
    type: overrides.type ?? 'VIDEO',
    sortOrder: overrides.sortOrder ?? 0,
    muted: overrides.muted ?? false,
    locked: overrides.locked ?? false,
    solo: overrides.solo ?? false,
    volume: overrides.volume ?? 1,
    clips: overrides.clips ?? [],
    color: overrides.color ?? '#00ff00',
    ...overrides,
  };
}

// =============================================================================
//  flattenAssets
// =============================================================================

describe('flattenAssets', () => {
  it('returns empty array for empty bins array', () => {
    expect(flattenAssets([])).toEqual([]);
  });

  it('returns empty array for null/undefined input', () => {
    expect(flattenAssets(null as unknown as EditorBin[])).toEqual([]);
    expect(flattenAssets(undefined as unknown as EditorBin[])).toEqual([]);
  });

  it('returns assets from a single bin', () => {
    const asset1 = makeAsset({ id: 'a1' });
    const asset2 = makeAsset({ id: 'a2' });
    const bin = makeBin({ assets: [asset1, asset2] });

    const result = flattenAssets([bin]);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('a1');
    expect(result[1]!.id).toBe('a2');
  });

  it('flattens assets from multiple bins', () => {
    const bin1 = makeBin({ id: 'b1', assets: [makeAsset({ id: 'a1' })] });
    const bin2 = makeBin({ id: 'b2', assets: [makeAsset({ id: 'a2' })] });

    const result = flattenAssets([bin1, bin2]);
    expect(result).toHaveLength(2);
  });

  it('recursively flattens nested bins', () => {
    const child = makeBin({
      id: 'child',
      assets: [makeAsset({ id: 'a-child' })],
    });
    const parent = makeBin({
      id: 'parent',
      assets: [makeAsset({ id: 'a-parent' })],
      children: [child],
    });

    const result = flattenAssets([parent]);
    expect(result).toHaveLength(2);
    const ids = result.map((a) => a.id);
    expect(ids).toContain('a-parent');
    expect(ids).toContain('a-child');
  });

  it('handles deeply nested bin structures', () => {
    const deepChild = makeBin({
      id: 'deep',
      assets: [makeAsset({ id: 'a-deep' })],
    });
    const midChild = makeBin({
      id: 'mid',
      children: [deepChild],
    });
    const topBin = makeBin({
      id: 'top',
      children: [midChild],
      assets: [makeAsset({ id: 'a-top' })],
    });

    const result = flattenAssets([topBin]);
    expect(result).toHaveLength(2);
  });

  it('handles bins with no assets', () => {
    const bin = makeBin({ assets: [] });
    expect(flattenAssets([bin])).toEqual([]);
  });

  it('handles bins with empty children arrays', () => {
    const bin = makeBin({ assets: [makeAsset()], children: [] });
    expect(flattenAssets([bin])).toHaveLength(1);
  });
});

// =============================================================================
//  getProjectDuration
// =============================================================================

describe('getProjectDuration', () => {
  it('returns 0 for project with no tracks', () => {
    expect(getProjectDuration({ tracks: [] })).toBe(0);
  });

  it('returns 0 for project with empty tracks', () => {
    const project = { tracks: [makeTrack({ clips: [] })] };
    expect(getProjectDuration(project)).toBe(0);
  });

  it('returns the end time of the latest clip', () => {
    const project = {
      tracks: [
        makeTrack({
          clips: [
            makeClip({ startTime: 0, endTime: 10 }),
            makeClip({ startTime: 5, endTime: 20 }),
          ],
        }),
      ],
    };
    expect(getProjectDuration(project)).toBe(20);
  });

  it('considers clips across multiple tracks', () => {
    const project = {
      tracks: [
        makeTrack({
          id: 't1',
          clips: [makeClip({ endTime: 15 })],
        }),
        makeTrack({
          id: 't2',
          clips: [makeClip({ endTime: 30 })],
        }),
      ],
    };
    expect(getProjectDuration(project)).toBe(30);
  });

  it('handles zero-duration clips', () => {
    const project = {
      tracks: [
        makeTrack({
          clips: [makeClip({ startTime: 5, endTime: 5 })],
        }),
      ],
    };
    expect(getProjectDuration(project)).toBe(5);
  });

  it('handles clips starting at frame 0', () => {
    const project = {
      tracks: [
        makeTrack({
          clips: [makeClip({ startTime: 0, endTime: 0 })],
        }),
      ],
    };
    expect(getProjectDuration(project)).toBe(0);
  });

  it('ignores non-finite endTime values', () => {
    const project = {
      tracks: [
        makeTrack({
          clips: [
            makeClip({ endTime: NaN }),
            makeClip({ endTime: 10 }),
          ],
        }),
      ],
    };
    expect(getProjectDuration(project)).toBe(10);
  });

  it('handles undefined tracks gracefully', () => {
    const project = { tracks: undefined as unknown as EditorTrack[] };
    expect(getProjectDuration(project)).toBe(0);
  });
});

describe('hydrateProject editorialState', () => {
  it('provides editorial defaults for imported projects', () => {
    const hydrated = hydrateProject({
      id: 'project-1',
      name: 'Imported',
      tracks: [
        makeTrack({ id: 'v1', type: 'VIDEO' }),
        makeTrack({ id: 'a1', type: 'AUDIO' }),
      ],
      bins: [makeBin({ id: 'b-master' })],
    });

    expect(hydrated.editorialState.selectedBinId).toBe('b-master');
    expect(hydrated.editorialState.enabledTrackIds).toEqual(['v1', 'a1']);
    expect(hydrated.editorialState.syncLockedTrackIds).toEqual([]);
    expect(hydrated.editorialState.videoMonitorTrackId).toBe('v1');
    expect(hydrated.editorialState.sourceTrackDescriptors).toEqual([]);
    expect(hydrated.editorialState.trackPatches).toEqual([]);
    expect(hydrated.workstationState).toEqual({
      subtitleTracks: [],
      titleClips: [],
      trackHeights: {},
      activeWorkspaceId: 'source-record',
      composerLayout: 'source-record',
      showTrackingInfo: true,
      trackingInfoFields: ['master-tc', 'duration'],
      clipTextDisplay: 'name',
      dupeDetectionEnabled: false,
      versionHistoryRetentionPreference: 'manual',
      versionHistoryCompareMode: 'summary',
    });
    expect(hydrated.collaboration).toEqual({
      presenceSnapshots: [],
      comments: [],
      activityFeed: [],
    });
  });

  it('preserves provided editorial state for valid tracks', () => {
    const hydrated = hydrateProject({
      id: 'project-2',
      name: 'Saved',
      tracks: [
        makeTrack({ id: 'v1', type: 'VIDEO' }),
        makeTrack({ id: 'v2', type: 'VIDEO' }),
        makeTrack({ id: 'a1', type: 'AUDIO' }),
      ],
      bins: [makeBin({ id: 'b-selects' })],
      editorialState: {
        selectedBinId: 'b-selects',
        sourceAssetId: 'asset-1',
        enabledTrackIds: ['v2'],
        syncLockedTrackIds: ['a1'],
        videoMonitorTrackId: 'v2',
        sourceTrackDescriptors: [
          { id: 'src-v1', type: 'VIDEO', index: 1 },
          { id: 'src-a1', type: 'AUDIO', index: 1 },
        ],
        trackPatches: [
          {
            sourceTrackId: 'src-v1',
            sourceTrackType: 'VIDEO',
            sourceTrackIndex: 1,
            recordTrackId: 'v2',
            enabled: true,
          },
        ],
      },
      workstationState: {
        subtitleTracks: [],
        titleClips: [],
        trackHeights: {},
        activeWorkspaceId: 'audio-mixing',
        composerLayout: 'full-frame',
        showTrackingInfo: false,
        trackingInfoFields: ['duration'],
        clipTextDisplay: 'source',
        dupeDetectionEnabled: true,
        versionHistoryRetentionPreference: 'session',
        versionHistoryCompareMode: 'details',
      },
      collaboration: {
        presenceSnapshots: [
          {
            userId: 'user-1',
            displayName: 'Robin Producer',
            avatarUrl: 'avatar://robin',
            color: '#1f9de8',
            isOnline: true,
            cursorFrame: 120,
            cursorTrackId: 'v2',
            playheadTime: 5,
          },
        ],
        comments: [
          {
            id: 'comment-1',
            userId: 'user-1',
            userName: 'Robin Producer',
            frame: 120,
            trackId: 'v2',
            text: 'Tighten this transition.',
            timestamp: 1000,
            resolved: false,
            replies: [
              {
                id: 'reply-1',
                userId: 'user-2',
                userName: 'Taylor Editor',
                text: 'Will do.',
                timestamp: 1100,
              },
            ],
            reactions: [
              {
                emoji: '👍',
                userIds: ['user-2'],
              },
            ],
          },
        ],
        activityFeed: [
          {
            id: 'activity-1',
            userId: 'user-1',
            user: 'Robin Producer',
            action: 'reviewed',
            timestamp: 1200,
            detail: 'Captured new notes.',
          },
        ],
      },
    });

    expect(hydrated.editorialState).toEqual({
      selectedBinId: 'b-selects',
      sourceAssetId: 'asset-1',
      enabledTrackIds: ['v2'],
      syncLockedTrackIds: ['a1'],
      videoMonitorTrackId: 'v2',
      sourceTrackDescriptors: [
        { id: 'src-v1', type: 'VIDEO', index: 1 },
        { id: 'src-a1', type: 'AUDIO', index: 1 },
      ],
      trackPatches: [
        {
          sourceTrackId: 'src-v1',
          sourceTrackType: 'VIDEO',
          sourceTrackIndex: 1,
          recordTrackId: 'v2',
          enabled: true,
        },
      ],
    });
    expect(hydrated.workstationState.versionHistoryRetentionPreference).toBe('session');
    expect(hydrated.workstationState.versionHistoryCompareMode).toBe('details');
    expect(hydrated.collaboration?.presenceSnapshots[0]?.userId).toBe('user-1');
    expect(hydrated.collaboration?.comments[0]?.text).toBe('Tighten this transition.');
    expect(hydrated.collaboration?.activityFeed[0]?.action).toBe('reviewed');
  });
});

describe('buildProject', () => {
  it('creates blank user projects when seedContent is false', () => {
    const project = buildProject({
      name: 'Blank Project',
      template: 'film',
      seedContent: false,
    });

    expect(project.bins).toEqual([]);
    expect(project.tracks.length).toBeGreaterThan(0);
    expect(project.tracks.every((track) => track.clips.length === 0)).toBe(true);
    expect(project.markers).toEqual([]);
    expect(project.collaborators).toEqual([]);
    expect(project.transcript).toEqual([]);
    expect(project.reviewComments).toEqual([]);
    expect(project.approvals).toEqual([]);
    expect(project.publishJobs).toEqual([]);
    expect(project.progress).toBe(0);
    expect(project.tokenBalance).toBe(0);
    expect(project.editorialState.selectedBinId).toBeNull();
  });

  it('keeps the seed library populated with demo content', () => {
    const [seededProject] = buildSeedProjectLibrary();

    expect(seededProject).toBeDefined();
    expect(seededProject!.bins.length).toBeGreaterThan(0);
    expect(seededProject!.tracks.some((track) => track.clips.length > 0)).toBe(true);
    expect(seededProject!.reviewComments.length).toBeGreaterThan(0);
  });
});
