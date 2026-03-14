import { buildProject, type EditorBin, type EditorProject, type EditorTrack } from '@mcua/core';

interface CreateDesktopProjectFixtureOptions {
  id: string;
  name: string;
  bins: EditorBin[];
  tracks: EditorTrack[];
  sourceAssetId?: string | null;
  enabledTrackIds?: string[];
  videoMonitorTrackId?: string | null;
}

const FIXTURE_TIMESTAMP = '2024-01-01T00:00:00Z';

export function createDesktopProjectFixture({
  id,
  name,
  bins,
  tracks,
  sourceAssetId = null,
  enabledTrackIds = tracks.map((track) => track.id),
  videoMonitorTrackId = tracks.find(
    (track) => track.type === 'VIDEO' || track.type === 'GRAPHIC',
  )?.id ?? null,
}: CreateDesktopProjectFixtureOptions): EditorProject {
  const baseProject = buildProject({
    seedContent: false,
    template: 'film',
    name,
  });

  return {
    ...baseProject,
    id,
    name,
    description: '',
    tags: [],
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
    progress: 0,
    settings: {
      ...baseProject.settings,
      frameRate: 24,
      width: 1920,
      height: 1080,
      sampleRate: 48000,
      exportFormat: 'mov',
    },
    tracks,
    markers: [],
    bins,
    collaborators: [],
    aiJobs: [],
    transcript: [],
    reviewComments: [],
    approvals: [],
    publishJobs: [],
    watchFolders: [],
    tokenBalance: 1000,
    editorialState: {
      ...baseProject.editorialState,
      selectedBinId: bins[0]?.id ?? null,
      sourceAssetId,
      enabledTrackIds,
      syncLockedTrackIds: [],
      videoMonitorTrackId,
      sourceTrackDescriptors: [],
      trackPatches: [],
    },
    workstationState: {
      ...baseProject.workstationState,
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
