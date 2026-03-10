import {
  PROJECT_SCHEMA_VERSION,
  getProjectDuration,
  type EditorProject,
  type ProjectTemplate,
} from '@mcua/core';
import {
  trackPatchingEngine,
  type SourceTrackDescriptor,
  type TrackPatch,
} from '../engine/TrackPatchingEngine';
import type {
  AIJob,
  Approval,
  Bin,
  CollabUser,
  Marker,
  MediaAsset,
  ProjectSettings,
  PublishJob,
  ReviewComment,
  SequenceSettings,
  Track,
  TranscriptCue,
  WatchFolder,
} from '../store/editor.store';

export interface EditorProjectPersistenceSource {
  projectId: string | null;
  projectName: string;
  projectTemplate: ProjectTemplate;
  projectDescription: string;
  projectTags: string[];
  projectSchemaVersion: number;
  projectCreatedAt: string | null;
  projectSettings: ProjectSettings;
  sequenceSettings: SequenceSettings;
  tracks: Track[];
  markers: Marker[];
  bins: Bin[];
  collabUsers: CollabUser[];
  aiJobs: AIJob[];
  transcript: TranscriptCue[];
  reviewComments: ReviewComment[];
  approvals: Approval[];
  publishJobs: PublishJob[];
  watchFolders: WatchFolder[];
  tokenBalance: number;
  subtitleTracks: EditorProject['workstationState']['subtitleTracks'];
  titleClips: EditorProject['workstationState']['titleClips'];
  trackHeights: Record<string, number>;
  activeWorkspaceId: string;
  composerLayout: 'source-record' | 'full-frame';
  showTrackingInfo: boolean;
  trackingInfoFields: string[];
  clipTextDisplay: 'name' | 'source' | 'media' | 'comments';
  dupeDetectionEnabled: boolean;
  versionHistoryRetentionPreference: 'manual' | 'session';
  versionHistoryCompareMode: 'summary' | 'details';
  sourceAsset: MediaAsset | null;
  selectedBinId: string | null;
  enabledTrackIds: string[];
  syncLockedTrackIds: string[];
  videoMonitorTrackId: string | null;
}

export interface EditorProjectPersistenceSnapshot {
  projectId: string;
  projectName: string;
  projectTemplate: ProjectTemplate;
  projectDescription: string;
  projectTags: string[];
  projectSchemaVersion: number;
  projectCreatedAt: string | null;
  projectSettings: ProjectSettings;
  sequenceSettings: SequenceSettings;
  tracks: Track[];
  markers: Marker[];
  bins: Bin[];
  collabUsers: CollabUser[];
  aiJobs: AIJob[];
  transcript: TranscriptCue[];
  reviewComments: ReviewComment[];
  approvals: Approval[];
  publishJobs: PublishJob[];
  watchFolders: WatchFolder[];
  tokenBalance: number;
  subtitleTracks: EditorProject['workstationState']['subtitleTracks'];
  titleClips: EditorProject['workstationState']['titleClips'];
  trackHeights: Record<string, number>;
  activeWorkspaceId: string;
  composerLayout: 'source-record' | 'full-frame';
  showTrackingInfo: boolean;
  trackingInfoFields: string[];
  clipTextDisplay: 'name' | 'source' | 'media' | 'comments';
  dupeDetectionEnabled: boolean;
  versionHistoryRetentionPreference: 'manual' | 'session';
  versionHistoryCompareMode: 'summary' | 'details';
  sourceAssetId: string | null;
  selectedBinId: string | null;
  enabledTrackIds: string[];
  syncLockedTrackIds: string[];
  videoMonitorTrackId: string | null;
  sourceTrackDescriptors: SourceTrackDescriptor[];
  trackPatches: TrackPatch[];
}

export interface HydratedEditorProjectState {
  projectId: string;
  projectName: string;
  projectTemplate: ProjectTemplate;
  projectDescription: string;
  projectTags: string[];
  projectSchemaVersion: number;
  projectCreatedAt: string;
  projectSettings: ProjectSettings;
  sequenceSettings: SequenceSettings;
  tracks: Track[];
  markers: Marker[];
  bins: Bin[];
  collabUsers: CollabUser[];
  aiJobs: AIJob[];
  transcript: TranscriptCue[];
  reviewComments: ReviewComment[];
  approvals: Approval[];
  publishJobs: PublishJob[];
  watchFolders: WatchFolder[];
  tokenBalance: number;
  subtitleTracks: EditorProject['workstationState']['subtitleTracks'];
  titleClips: EditorProject['workstationState']['titleClips'];
  trackHeights: Record<string, number>;
  activeWorkspaceId: string;
  composerLayout: 'source-record' | 'full-frame';
  showTrackingInfo: boolean;
  trackingInfoFields: string[];
  clipTextDisplay: 'name' | 'source' | 'media' | 'comments';
  dupeDetectionEnabled: boolean;
  versionHistoryRetentionPreference: 'manual' | 'session';
  versionHistoryCompareMode: 'summary' | 'details';
  duration: number;
  selectedBinId: string | null;
  activeBinAssets: MediaAsset[];
  sourceAsset: MediaAsset | null;
  enabledTrackIds: string[];
  syncLockedTrackIds: string[];
  videoMonitorTrackId: string | null;
  sourceTrackDescriptors: SourceTrackDescriptor[];
  trackPatches: TrackPatch[];
}

const DEFAULT_TIMESTAMP = '1970-01-01T00:00:00.000Z';

function resolveExportFormat(format: string): EditorProject['settings']['exportFormat'] {
  switch (format) {
    case 'mp4':
    case 'mov':
    case 'webm':
    case 'mp3':
    case 'wav':
    case 'aiff':
      return format;
    default:
      return 'mov';
  }
}

function serializeAIJobs(aiJobs: AIJob[]): EditorProject['aiJobs'] {
  return aiJobs.map((job) => {
    const existing = job as AIJob & Partial<EditorProject['aiJobs'][number]>;
    return {
      id: job.id,
      type: job.type,
      label: existing.label ?? job.type,
      status: job.status,
      progress: job.progress,
      resultSummary: job.resultSummary,
      cost: existing.cost ?? 0,
      createdAt: existing.createdAt ?? DEFAULT_TIMESTAMP,
      completedAt: existing.completedAt,
    };
  });
}

function serializeReviewComments(reviewComments: ReviewComment[]): EditorProject['reviewComments'] {
  return reviewComments.map((comment) => {
    const existing = comment as ReviewComment & Partial<EditorProject['reviewComments'][number]>;
    return {
      id: comment.id,
      author: comment.author,
      role: comment.role,
      color: comment.color,
      body: comment.body,
      time: comment.time,
      status: comment.status,
      createdAt: existing.createdAt ?? DEFAULT_TIMESTAMP,
    };
  });
}

function serializeApprovals(approvals: Approval[]): EditorProject['approvals'] {
  return approvals.map((approval) => {
    const existing = approval as Approval & Partial<EditorProject['approvals'][number]>;
    return {
      id: approval.id,
      reviewer: approval.reviewer,
      role: approval.role,
      status: approval.status,
      notes: approval.notes,
      updatedAt: existing.updatedAt ?? DEFAULT_TIMESTAMP,
    };
  });
}

function serializePublishJobs(publishJobs: PublishJob[]): EditorProject['publishJobs'] {
  return publishJobs.map((job) => {
    const existing = job as PublishJob & Partial<EditorProject['publishJobs'][number]>;
    return {
      id: job.id,
      label: job.label,
      preset: job.preset,
      destination: job.destination,
      status: job.status,
      progress: job.progress,
      outputSummary: job.outputSummary,
      createdAt: existing.createdAt ?? DEFAULT_TIMESTAMP,
      updatedAt: existing.updatedAt ?? DEFAULT_TIMESTAMP,
    };
  });
}

function serializeWatchFolders(watchFolders: WatchFolder[]): EditorProject['watchFolders'] {
  return watchFolders.map((watchFolder) => {
    const existing = watchFolder as WatchFolder & Partial<EditorProject['watchFolders'][number]>;
    return {
      id: watchFolder.id,
      name: watchFolder.name,
      path: watchFolder.path,
      status: watchFolder.status,
      createdAt: existing.createdAt ?? DEFAULT_TIMESTAMP,
      lastScannedAt: watchFolder.lastScannedAt,
      lastImportedAt: existing.lastImportedAt,
      importedAssetCount: watchFolder.importedAssetCount,
      error: existing.error,
    };
  });
}

function serializeWorkstationState(
  snapshot: Pick<
    EditorProjectPersistenceSnapshot,
    | 'subtitleTracks'
    | 'titleClips'
    | 'trackHeights'
    | 'activeWorkspaceId'
    | 'composerLayout'
    | 'showTrackingInfo'
    | 'trackingInfoFields'
    | 'clipTextDisplay'
    | 'dupeDetectionEnabled'
    | 'versionHistoryRetentionPreference'
    | 'versionHistoryCompareMode'
  >,
): EditorProject['workstationState'] {
  return {
    subtitleTracks: snapshot.subtitleTracks,
    titleClips: snapshot.titleClips,
    trackHeights: { ...snapshot.trackHeights },
    activeWorkspaceId: snapshot.activeWorkspaceId,
    composerLayout: snapshot.composerLayout,
    showTrackingInfo: snapshot.showTrackingInfo,
    trackingInfoFields: [...snapshot.trackingInfoFields],
    clipTextDisplay: snapshot.clipTextDisplay,
    dupeDetectionEnabled: snapshot.dupeDetectionEnabled,
    versionHistoryRetentionPreference: snapshot.versionHistoryRetentionPreference,
    versionHistoryCompareMode: snapshot.versionHistoryCompareMode,
  };
}

function findBinById(bins: Bin[], binId: string | null): Bin | null {
  if (!binId) {
    return null;
  }

  for (const bin of bins) {
    if (bin.id === binId) {
      return bin;
    }
    const child = findBinById(bin.children, binId);
    if (child) {
      return child;
    }
  }

  return null;
}

function findAssetById(bins: Bin[], assetId: string | null): MediaAsset | null {
  if (!assetId) {
    return null;
  }

  for (const bin of bins) {
    const asset = bin.assets.find((candidate) => candidate.id === assetId);
    if (asset) {
      return asset;
    }
    const child = findAssetById(bin.children, assetId);
    if (child) {
      return child;
    }
  }

  return null;
}

function getDefaultSelectedBinId(bins: Bin[]): string | null {
  for (const bin of bins) {
    if (bin.children.length > 0) {
      const childId = getDefaultSelectedBinId(bin.children);
      if (childId) {
        return childId;
      }
    }
    return bin.id;
  }

  return null;
}

function resolveSelectedBinId(bins: Bin[], requestedBinId: string | null): string | null {
  const requested = findBinById(bins, requestedBinId);
  return requested?.id ?? getDefaultSelectedBinId(bins);
}

function resolveEnabledTrackIds(tracks: Track[], enabledTrackIds: string[]): string[] {
  const trackIds = new Set(tracks.map((track) => track.id));
  const filtered = enabledTrackIds.filter((trackId) => trackIds.has(trackId));
  if (filtered.length > 0) {
    return filtered;
  }
  return tracks.filter((track) => !track.locked).map((track) => track.id);
}

function resolveSyncLockedTrackIds(tracks: Track[], syncLockedTrackIds: string[]): string[] {
  const trackIds = new Set(tracks.map((track) => track.id));
  return syncLockedTrackIds.filter((trackId) => trackIds.has(trackId));
}

function resolveVideoMonitorTrackId(tracks: Track[], requestedTrackId: string | null): string | null {
  const videoTracks = tracks.filter((track) => track.type === 'VIDEO' || track.type === 'GRAPHIC');
  if (requestedTrackId && videoTracks.some((track) => track.id === requestedTrackId)) {
    return requestedTrackId;
  }
  return videoTracks[0]?.id ?? null;
}

function resolveSourceTrackDescriptors(
  sourceAssetId: string | null,
  sourceTrackDescriptors: SourceTrackDescriptor[],
): SourceTrackDescriptor[] {
  if (!sourceAssetId) {
    return [];
  }

  return sourceTrackDescriptors
    .filter((descriptor) => (
      typeof descriptor.id === 'string'
      && (descriptor.type === 'VIDEO' || descriptor.type === 'AUDIO')
      && Number.isFinite(descriptor.index)
      && descriptor.index > 0
    ))
    .map((descriptor) => ({
      id: descriptor.id,
      type: descriptor.type,
      index: Math.round(descriptor.index),
    }));
}

function resolveTrackPatches(
  tracks: Track[],
  sourceTrackDescriptors: SourceTrackDescriptor[],
  trackPatches: TrackPatch[],
): TrackPatch[] {
  const trackIds = new Set(tracks.map((track) => track.id));
  const sourceTrackById = new Map(sourceTrackDescriptors.map((descriptor) => [descriptor.id, descriptor]));

  return trackPatches
    .filter((patch) => {
      const descriptor = sourceTrackById.get(patch.sourceTrackId);
      return (
        Boolean(descriptor)
        && trackIds.has(patch.recordTrackId)
      );
    })
    .map((patch) => {
      const descriptor = sourceTrackById.get(patch.sourceTrackId)!;
      return {
        sourceTrackId: descriptor.id,
        sourceTrackType: descriptor.type,
        sourceTrackIndex: descriptor.index,
        recordTrackId: patch.recordTrackId,
        enabled: patch.enabled,
      };
    });
}

export function getActiveBinAssets(bins: Bin[], selectedBinId: string | null): MediaAsset[] {
  return findBinById(bins, selectedBinId)?.assets ?? [];
}

export function buildProjectPersistenceSnapshot(
  state: EditorProjectPersistenceSource,
): EditorProjectPersistenceSnapshot | null {
  if (!state.projectId) {
    return null;
  }

  const sourceAssetId = state.sourceAsset?.id ?? null;
  const sourceTrackDescriptors = resolveSourceTrackDescriptors(
    sourceAssetId,
    trackPatchingEngine.getSourceTracks(),
  );
  const trackPatches = resolveTrackPatches(
    state.tracks,
    sourceTrackDescriptors,
    trackPatchingEngine.getPatches(),
  );

  return {
    projectId: state.projectId,
    projectName: state.projectName,
    projectTemplate: state.projectTemplate,
    projectDescription: state.projectDescription,
    projectTags: [...state.projectTags],
    projectSchemaVersion: state.projectSchemaVersion || PROJECT_SCHEMA_VERSION,
    projectCreatedAt: state.projectCreatedAt,
    projectSettings: { ...state.projectSettings },
    sequenceSettings: { ...state.sequenceSettings },
    tracks: state.tracks as Track[],
    markers: state.markers,
    bins: state.bins,
    collabUsers: state.collabUsers,
    aiJobs: state.aiJobs,
    transcript: state.transcript,
    reviewComments: state.reviewComments,
    approvals: state.approvals,
    publishJobs: state.publishJobs,
    watchFolders: state.watchFolders,
    tokenBalance: state.tokenBalance,
    subtitleTracks: state.subtitleTracks,
    titleClips: state.titleClips,
    trackHeights: { ...state.trackHeights },
    activeWorkspaceId: state.activeWorkspaceId,
    composerLayout: state.composerLayout,
    showTrackingInfo: state.showTrackingInfo,
    trackingInfoFields: [...state.trackingInfoFields],
    clipTextDisplay: state.clipTextDisplay,
    dupeDetectionEnabled: state.dupeDetectionEnabled,
    versionHistoryRetentionPreference: state.versionHistoryRetentionPreference,
    versionHistoryCompareMode: state.versionHistoryCompareMode,
    sourceAssetId,
    selectedBinId: state.selectedBinId,
    enabledTrackIds: resolveEnabledTrackIds(state.tracks, state.enabledTrackIds),
    syncLockedTrackIds: resolveSyncLockedTrackIds(state.tracks, state.syncLockedTrackIds),
    videoMonitorTrackId: resolveVideoMonitorTrackId(state.tracks, state.videoMonitorTrackId),
    sourceTrackDescriptors,
    trackPatches,
  };
}

export function getProjectPersistenceHash(snapshot: EditorProjectPersistenceSnapshot): string {
  return JSON.stringify({
    meta: {
      id: snapshot.projectId,
      name: snapshot.projectName,
      template: snapshot.projectTemplate,
      description: snapshot.projectDescription,
      tags: snapshot.projectTags,
      schemaVersion: snapshot.projectSchemaVersion,
      createdAt: snapshot.projectCreatedAt,
    },
    settings: snapshot.projectSettings,
    sequenceSettings: snapshot.sequenceSettings,
    tracks: snapshot.tracks,
    markers: snapshot.markers,
    bins: snapshot.bins,
    collaborators: snapshot.collabUsers,
    aiJobs: serializeAIJobs(snapshot.aiJobs),
    transcript: snapshot.transcript,
    reviewComments: serializeReviewComments(snapshot.reviewComments),
    approvals: serializeApprovals(snapshot.approvals),
    publishJobs: serializePublishJobs(snapshot.publishJobs),
    watchFolders: serializeWatchFolders(snapshot.watchFolders),
    tokenBalance: snapshot.tokenBalance,
    workstationState: serializeWorkstationState(snapshot),
    editorialState: {
      selectedBinId: resolveSelectedBinId(snapshot.bins, snapshot.selectedBinId),
      sourceAssetId: snapshot.sourceAssetId,
      enabledTrackIds: resolveEnabledTrackIds(snapshot.tracks, snapshot.enabledTrackIds),
      syncLockedTrackIds: resolveSyncLockedTrackIds(snapshot.tracks, snapshot.syncLockedTrackIds),
      videoMonitorTrackId: resolveVideoMonitorTrackId(snapshot.tracks, snapshot.videoMonitorTrackId),
      sourceTrackDescriptors: resolveSourceTrackDescriptors(
        snapshot.sourceAssetId,
        snapshot.sourceTrackDescriptors,
      ),
      trackPatches: resolveTrackPatches(
        snapshot.tracks,
        resolveSourceTrackDescriptors(snapshot.sourceAssetId, snapshot.sourceTrackDescriptors),
        snapshot.trackPatches,
      ),
    },
  });
}

export function buildProjectFromEditorState(
  snapshot: EditorProjectPersistenceSnapshot,
): EditorProject {
  return {
    schemaVersion: snapshot.projectSchemaVersion || PROJECT_SCHEMA_VERSION,
    id: snapshot.projectId,
    name: snapshot.projectName,
    description: snapshot.projectDescription,
    template: snapshot.projectTemplate,
    tags: [...snapshot.projectTags],
    createdAt: snapshot.projectCreatedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    progress: Math.max(0, Math.min(100, Math.round(getProjectDuration({ tracks: snapshot.tracks }) * 2))),
    settings: {
      frameRate: snapshot.projectSettings.frameRate,
      width: snapshot.projectSettings.width,
      height: snapshot.projectSettings.height,
      sampleRate: snapshot.sequenceSettings.sampleRate,
      exportFormat: resolveExportFormat(snapshot.projectSettings.exportFormat),
    },
    tracks: snapshot.tracks as Track[],
    markers: snapshot.markers,
    bins: snapshot.bins,
    collaborators: snapshot.collabUsers,
    aiJobs: serializeAIJobs(snapshot.aiJobs),
    transcript: snapshot.transcript,
    reviewComments: serializeReviewComments(snapshot.reviewComments),
    approvals: serializeApprovals(snapshot.approvals),
    publishJobs: serializePublishJobs(snapshot.publishJobs),
    watchFolders: serializeWatchFolders(snapshot.watchFolders),
    tokenBalance: snapshot.tokenBalance,
    workstationState: serializeWorkstationState(snapshot),
    editorialState: {
      selectedBinId: resolveSelectedBinId(snapshot.bins, snapshot.selectedBinId),
      sourceAssetId: snapshot.sourceAssetId,
      enabledTrackIds: resolveEnabledTrackIds(snapshot.tracks, snapshot.enabledTrackIds),
      syncLockedTrackIds: resolveSyncLockedTrackIds(snapshot.tracks, snapshot.syncLockedTrackIds),
      videoMonitorTrackId: resolveVideoMonitorTrackId(snapshot.tracks, snapshot.videoMonitorTrackId),
      sourceTrackDescriptors: resolveSourceTrackDescriptors(
        snapshot.sourceAssetId,
        snapshot.sourceTrackDescriptors,
      ),
      trackPatches: resolveTrackPatches(
        snapshot.tracks,
        resolveSourceTrackDescriptors(snapshot.sourceAssetId, snapshot.sourceTrackDescriptors),
        snapshot.trackPatches,
      ),
    },
  };
}

export function hydrateEditorStateFromProject(project: EditorProject): HydratedEditorProjectState {
  const tracks = project.tracks as Track[];
  const bins = project.bins as Bin[];
  const selectedBinId = resolveSelectedBinId(bins, project.editorialState?.selectedBinId ?? null);
  const sourceAsset = findAssetById(bins, project.editorialState?.sourceAssetId ?? null);
  const sourceTrackDescriptors = resolveSourceTrackDescriptors(
    project.editorialState?.sourceAssetId ?? null,
    project.editorialState?.sourceTrackDescriptors ?? [],
  );
  const trackPatches = resolveTrackPatches(
    tracks,
    sourceTrackDescriptors,
    project.editorialState?.trackPatches ?? [],
  );

  return {
    projectId: project.id,
    projectName: project.name,
    projectTemplate: project.template,
    projectDescription: project.description,
    projectTags: [...project.tags],
    projectSchemaVersion: project.schemaVersion,
    projectCreatedAt: project.createdAt,
    projectSettings: {
      width: project.settings.width,
      height: project.settings.height,
      frameRate: project.settings.frameRate,
      exportFormat: project.settings.exportFormat,
    },
    sequenceSettings: {
      name: 'Sequence 1',
      fps: project.settings.frameRate,
      dropFrame: false,
      startTC: 0,
      width: project.settings.width,
      height: project.settings.height,
      sampleRate: project.settings.sampleRate,
      colorSpace: 'rec709',
      displayTransform: 'sdr-rec709',
    },
    tracks,
    markers: project.markers as Marker[],
    bins,
    collabUsers: project.collaborators as CollabUser[],
    aiJobs: project.aiJobs as AIJob[],
    transcript: project.transcript as TranscriptCue[],
    reviewComments: project.reviewComments as ReviewComment[],
    approvals: project.approvals as Approval[],
    publishJobs: project.publishJobs as PublishJob[],
    watchFolders: project.watchFolders as WatchFolder[],
    tokenBalance: project.tokenBalance,
    subtitleTracks: project.workstationState.subtitleTracks,
    titleClips: project.workstationState.titleClips,
    trackHeights: { ...project.workstationState.trackHeights },
    activeWorkspaceId: project.workstationState.activeWorkspaceId,
    composerLayout: project.workstationState.composerLayout,
    showTrackingInfo: project.workstationState.showTrackingInfo,
    trackingInfoFields: [...project.workstationState.trackingInfoFields],
    clipTextDisplay: project.workstationState.clipTextDisplay,
    dupeDetectionEnabled: project.workstationState.dupeDetectionEnabled,
    versionHistoryRetentionPreference: project.workstationState.versionHistoryRetentionPreference,
    versionHistoryCompareMode: project.workstationState.versionHistoryCompareMode,
    duration: getProjectDuration(project),
    selectedBinId,
    activeBinAssets: getActiveBinAssets(bins, selectedBinId),
    sourceAsset,
    enabledTrackIds: resolveEnabledTrackIds(tracks, project.editorialState?.enabledTrackIds ?? []),
    syncLockedTrackIds: resolveSyncLockedTrackIds(tracks, project.editorialState?.syncLockedTrackIds ?? []),
    videoMonitorTrackId: resolveVideoMonitorTrackId(
      tracks,
      project.editorialState?.videoMonitorTrackId ?? null,
    ),
    sourceTrackDescriptors,
    trackPatches,
  };
}
