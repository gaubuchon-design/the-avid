import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  buildProject,
  flattenAssets,
  getProjectDuration,
  PROJECT_SCHEMA_VERSION,
} from '@mcua/core';
import type {
  EditorApproval,
  CollaboratorPresence,
  EditorAIJob,
  EditorBin,
  EditorClip,
  EditorMediaAsset,
  EditorMarker,
  EditorPublishJob,
  EditorProject,
  EditorProjectSettings,
  EditorReviewComment,
  EditorTrack,
  EditorTranscriptCue,
  EditorWatchFolder,
  PanelType,
  ProjectTemplate,
  WorkspaceTab,
} from '@mcua/core';
import {
  createProjectInRepository,
  getProjectFromRepository,
  saveProjectToRepository,
} from '../lib/projectRepository';

export type {
  EditorApproval as Approval,
  CollaboratorPresence as CollabUser,
  EditorAIJob as AIJob,
  EditorBin as Bin,
  EditorClip as Clip,
  EditorMediaAsset as MediaAsset,
  EditorMarker as Marker,
  EditorPublishJob as PublishJob,
  EditorProjectSettings,
  EditorReviewComment as ReviewComment,
  EditorTrack as Track,
  EditorTranscriptCue as TranscriptCue,
  EditorWatchFolder as WatchFolder,
  PanelType,
  ProjectTemplate,
  WorkspaceTab,
};

type SaveStatus = 'idle' | 'saved' | 'saving' | 'error';

export interface DesktopJob {
  id: string;
  kind: 'INGEST' | 'EXPORT';
  projectId: string;
  label: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: number;
  startedAt: string;
  updatedAt: string;
  outputPath?: string;
  error?: string;
}

interface EditorState {
  projectId: string | null;
  projectName: string;
  projectCreatedAt: string | null;
  projectDescription: string;
  projectTemplate: ProjectTemplate;
  projectTags: string[];
  projectProgress: number;
  projectSettings: EditorProjectSettings;

  tracks: EditorTrack[];
  markers: EditorMarker[];
  playheadTime: number;
  isPlaying: boolean;
  zoom: number;
  scrollLeft: number;
  duration: number;

  selectedClipIds: string[];
  selectedTrackId: string | null;

  bins: EditorBin[];
  selectedBinId: string | null;
  activeBinAssets: EditorMediaAsset[];

  sourceAsset: EditorMediaAsset | null;
  inPoint: number | null;
  outPoint: number | null;
  showSafeZones: boolean;

  activePanel: PanelType;
  activeInspectorTab: WorkspaceTab;
  showAIPanel: boolean;
  showCollabPanel: boolean;
  isFullscreen: boolean;

  collabUsers: CollaboratorPresence[];
  aiJobs: EditorAIJob[];
  desktopJobs: DesktopJob[];
  transcript: EditorTranscriptCue[];
  reviewComments: EditorReviewComment[];
  approvals: EditorApproval[];
  publishJobs: EditorPublishJob[];
  watchFolders: EditorWatchFolder[];
  tokenBalance: number;

  volume: number;
  isMuted: boolean;

  isDirty: boolean;
  lastSavedAt: string | null;
  saveStatus: SaveStatus;
  isCommandPaletteOpen: boolean;
}

interface EditorActions {
  setPlayhead: (time: number) => void;
  togglePlay: () => void;
  setZoom: (zoom: number) => void;
  setScrollLeft: (position: number) => void;

  toggleMute: (trackId: string) => void;
  toggleSolo: (trackId: string) => void;
  toggleLock: (trackId: string) => void;
  setTrackVolume: (trackId: string, volume: number) => void;
  selectTrack: (trackId: string | null) => void;

  addClip: (clip: EditorClip) => void;
  removeClip: (clipId: string) => void;
  moveClip: (clipId: string, newTrackId: string, newStart: number) => void;
  trimClip: (clipId: string, side: 'left' | 'right', time: number) => void;
  splitClip: (clipId: string, time: number) => void;
  selectClip: (clipId: string, multi?: boolean) => void;
  clearSelection: () => void;
  appendAssetToTimeline: (assetId: string) => void;
  importAssets: (assets: EditorMediaAsset[], targetBinId?: string | null) => void;
  razorAtPlayhead: () => void;
  liftSelection: () => void;
  extractSelection: () => void;
  matchFrame: () => void;

  selectBin: (binId: string) => void;
  toggleBin: (binId: string) => void;
  setSourceAsset: (asset: EditorMediaAsset | null) => void;

  setInPoint: (time: number | null) => void;
  setOutPoint: (time: number | null) => void;
  setInToPlayhead: () => void;
  setOutToPlayhead: () => void;
  clearInOut: () => void;
  addMarkerAtPlayhead: (label?: string) => void;
  toggleSafeZones: () => void;

  setActivePanel: (panel: PanelType) => void;
  setInspectorTab: (tab: WorkspaceTab) => void;
  toggleAIPanel: () => void;
  toggleCollabPanel: () => void;
  setProjectName: (name: string) => void;

  setVolume: (volume: number) => void;
  toggleMuteAll: () => void;

  loadProject: (projectId: string) => Promise<string>;
  saveProject: () => Promise<EditorProject | null>;
  setSaveStatus: (status: SaveStatus) => void;
  setDesktopJobs: (jobs: DesktopJob[]) => void;
  upsertDesktopJob: (job: DesktopJob) => void;
  toggleCommandPalette: (open?: boolean) => void;
  addReviewComment: (comment: { body: string; author?: string; role?: string; color?: string }) => void;
  setApprovalStatus: (approvalId: string, status: EditorApproval['status'], notes?: string) => void;
  queuePublishJob: (job: Pick<EditorPublishJob, 'label' | 'preset' | 'destination'>) => string;
  updatePublishJob: (jobId: string, patch: Partial<EditorPublishJob>) => void;

  startAIJob: (tool: { id: string; label: string; cost: number }) => string | null;
  updateAIJob: (jobId: string, patch: Partial<EditorAIJob>) => void;
}

function createId(prefix: string): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function findBinAssets(bins: EditorBin[], binId: string | null): EditorMediaAsset[] {
  if (!binId) {
    return [];
  }

  for (const bin of bins) {
    if (bin.id === binId) {
      return bin.assets;
    }

    const nested = findBinAssets(bin.children, binId);
    if (nested.length > 0) {
      return nested;
    }
  }

  return [];
}

function getDefaultSelectedBinId(bins: EditorBin[]): string | null {
  const firstNestedBin = bins.flatMap((bin) => bin.children).find((bin) => bin.assets.length > 0);
  return firstNestedBin?.id ?? bins.find((bin) => bin.assets.length > 0)?.id ?? bins[0]?.id ?? null;
}

function projectProgressFromState(state: Pick<EditorState, 'tracks' | 'aiJobs' | 'bins'>): number {
  const clipCount = state.tracks.reduce((total, track) => total + track.clips.length, 0);
  const completedJobs = state.aiJobs.filter((job) => job.status === 'COMPLETED').length;
  const assetCount = flattenAssets(state.bins).length;
  return Math.max(12, Math.min(100, Math.round(assetCount * 3 + clipCount * 7 + completedJobs * 10)));
}

function sortDesktopJobs(jobs: DesktopJob[]): DesktopJob[] {
  return [...jobs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function findBinByIdMutable(bins: EditorBin[], binId: string | null): EditorBin | null {
  if (!binId) {
    return null;
  }

  for (const bin of bins) {
    if (bin.id === binId) {
      return bin;
    }

    const nested = findBinByIdMutable(bin.children, binId);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function ensureImportTargetBin(state: EditorState): EditorBin {
  const selectedBin = findBinByIdMutable(state.bins, state.selectedBinId);
  if (selectedBin) {
    return selectedBin;
  }

  if (state.bins[0]) {
    return state.bins[0];
  }

  const createdBin: EditorBin = {
    id: createId('bin'),
    name: 'Imported Media',
    color: '#4f63f5',
    children: [],
    assets: [],
    isOpen: true,
  };
  state.bins.unshift(createdBin);
  return createdBin;
}

function refreshSelectedBinState(state: EditorState): void {
  if (!findBinByIdMutable(state.bins, state.selectedBinId)) {
    state.selectedBinId = state.bins[0]?.id ?? null;
  }

  state.activeBinAssets = findBinAssets(state.bins, state.selectedBinId);
  const allAssets = flattenAssets(state.bins);
  const currentSourceAssetId = state.sourceAsset?.id;
  state.sourceAsset = (currentSourceAssetId
    ? allAssets.find((asset) => asset.id === currentSourceAssetId) ?? null
    : null) ?? state.activeBinAssets[0] ?? allAssets[0] ?? null;
}

function findClipContextAtTime(state: Pick<EditorState, 'tracks' | 'playheadTime' | 'selectedTrackId'>): { clip: EditorClip; track: EditorTrack } | null {
  const candidateTracks = state.selectedTrackId
    ? state.tracks.filter((track) => track.id === state.selectedTrackId)
    : state.tracks;

  for (const track of candidateTracks) {
    const clip = track.clips.find((item) => item.startTime <= state.playheadTime && item.endTime >= state.playheadTime);
    if (clip) {
      return { clip, track };
    }
  }

  for (const track of state.tracks) {
    const clip = track.clips.find((item) => item.startTime <= state.playheadTime && item.endTime >= state.playheadTime);
    if (clip) {
      return { clip, track };
    }
  }

  return null;
}

function hydrateFromProject(state: EditorState, project: EditorProject): void {
  const selectedBinId = getDefaultSelectedBinId(project.bins);
  const activeBinAssets = findBinAssets(project.bins, selectedBinId);

  state.projectId = project.id;
  state.projectName = project.name;
  state.projectCreatedAt = project.createdAt;
  state.projectDescription = project.description;
  state.projectTemplate = project.template;
  state.projectTags = [...project.tags];
  state.projectProgress = project.progress;
  state.projectSettings = { ...project.settings };
  state.tracks = project.tracks;
  state.markers = project.markers;
  state.duration = Math.max(getProjectDuration(project), 1);
  state.selectedClipIds = [];
  state.selectedTrackId = null;
  state.bins = project.bins;
  state.selectedBinId = selectedBinId;
  state.activeBinAssets = activeBinAssets;
  state.sourceAsset = activeBinAssets[0] ?? flattenAssets(project.bins)[0] ?? null;
  state.inPoint = null;
  state.outPoint = null;
  state.collabUsers = project.collaborators;
  state.aiJobs = project.aiJobs;
  state.desktopJobs = [];
  state.transcript = project.transcript;
  state.reviewComments = project.reviewComments;
  state.approvals = project.approvals;
  state.publishJobs = project.publishJobs;
  state.watchFolders = project.watchFolders;
  state.tokenBalance = project.tokenBalance;
  state.lastSavedAt = project.updatedAt;
  state.saveStatus = 'saved';
  state.isDirty = false;
  state.isCommandPaletteOpen = false;
  state.playheadTime = 0;
  state.isPlaying = false;
}

function touchProject(state: EditorState): void {
  state.duration = Math.max(getProjectDuration({ tracks: state.tracks }), 1);
  state.projectProgress = projectProgressFromState(state);
  state.isDirty = true;
  state.saveStatus = 'idle';
}

function serializeProject(state: EditorState): EditorProject | null {
  if (!state.projectId) {
    return null;
  }

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: state.projectId,
    name: state.projectName,
    createdAt: state.projectCreatedAt ?? new Date().toISOString(),
    description: state.projectDescription,
    template: state.projectTemplate,
    tags: [...state.projectTags],
    updatedAt: new Date().toISOString(),
    progress: projectProgressFromState(state),
    settings: { ...state.projectSettings },
    tracks: state.tracks,
    markers: state.markers,
    bins: state.bins,
    collaborators: state.collabUsers,
    aiJobs: state.aiJobs,
    transcript: state.transcript,
    reviewComments: state.reviewComments,
    approvals: state.approvals,
    publishJobs: state.publishJobs,
    watchFolders: state.watchFolders,
    tokenBalance: state.tokenBalance,
  };
}

const initialProject = buildProject({ name: 'Untitled Film Project', template: 'film' });
const initialSelectedBinId = getDefaultSelectedBinId(initialProject.bins);
const initialAssets = findBinAssets(initialProject.bins, initialSelectedBinId);

export const useEditorStore = create<EditorState & EditorActions>()(
  immer((set, get) => ({
    projectId: initialProject.id,
    projectName: initialProject.name,
    projectCreatedAt: initialProject.createdAt,
    projectDescription: initialProject.description,
    projectTemplate: initialProject.template,
    projectTags: [...initialProject.tags],
    projectProgress: initialProject.progress,
    projectSettings: { ...initialProject.settings },

    tracks: initialProject.tracks,
    markers: initialProject.markers,
    playheadTime: 0,
    isPlaying: false,
    zoom: 60,
    scrollLeft: 0,
    duration: Math.max(getProjectDuration(initialProject), 1),

    selectedClipIds: [],
    selectedTrackId: null,

    bins: initialProject.bins,
    selectedBinId: initialSelectedBinId,
    activeBinAssets: initialAssets,

    sourceAsset: initialAssets[0] ?? flattenAssets(initialProject.bins)[0] ?? null,
    inPoint: null,
    outPoint: null,
    showSafeZones: false,

    activePanel: 'edit',
    activeInspectorTab: 'video',
    showAIPanel: false,
    showCollabPanel: false,
    isFullscreen: false,

    collabUsers: initialProject.collaborators,
    aiJobs: initialProject.aiJobs,
    desktopJobs: [],
    transcript: initialProject.transcript,
    reviewComments: initialProject.reviewComments,
    approvals: initialProject.approvals,
    publishJobs: initialProject.publishJobs,
    watchFolders: initialProject.watchFolders,
    tokenBalance: initialProject.tokenBalance,

    volume: 0.8,
    isMuted: false,

    isDirty: false,
    lastSavedAt: initialProject.updatedAt,
    saveStatus: 'saved',
    isCommandPaletteOpen: false,

    setPlayhead: (time) => set((state) => {
      state.playheadTime = Math.max(0, Math.min(time, state.duration));
    }),
    togglePlay: () => set((state) => {
      state.isPlaying = !state.isPlaying;
    }),
    setZoom: (zoom) => set((state) => {
      state.zoom = Math.max(10, Math.min(300, zoom));
    }),
    setScrollLeft: (position) => set((state) => {
      state.scrollLeft = Math.max(0, position);
    }),

    toggleMute: (trackId) => set((state) => {
      const track = state.tracks.find((item) => item.id === trackId);
      if (!track) {
        return;
      }
      track.muted = !track.muted;
      touchProject(state);
    }),
    toggleSolo: (trackId) => set((state) => {
      const track = state.tracks.find((item) => item.id === trackId);
      if (!track) {
        return;
      }
      track.solo = !track.solo;
      touchProject(state);
    }),
    toggleLock: (trackId) => set((state) => {
      const track = state.tracks.find((item) => item.id === trackId);
      if (!track) {
        return;
      }
      track.locked = !track.locked;
      touchProject(state);
    }),
    setTrackVolume: (trackId, volume) => set((state) => {
      const track = state.tracks.find((item) => item.id === trackId);
      if (!track) {
        return;
      }
      track.volume = Math.max(0, Math.min(1, volume));
      touchProject(state);
    }),
    selectTrack: (trackId) => set((state) => {
      state.selectedTrackId = trackId;
    }),

    addClip: (clip) => set((state) => {
      const track = state.tracks.find((item) => item.id === clip.trackId);
      if (!track || track.locked) {
        return;
      }
      track.clips.push(clip);
      state.selectedClipIds = [clip.id];
      touchProject(state);
    }),
    removeClip: (clipId) => set((state) => {
      state.tracks.forEach((track) => {
        if (!track.locked) {
          track.clips = track.clips.filter((clip) => clip.id !== clipId);
        }
      });
      state.selectedClipIds = state.selectedClipIds.filter((selectedId) => selectedId !== clipId);
      touchProject(state);
    }),
    moveClip: (clipId, newTrackId, newStart) => set((state) => {
      const sourceTrack = state.tracks.find((track) => track.clips.some((clip) => clip.id === clipId));
      const targetTrack = state.tracks.find((track) => track.id === newTrackId);
      if (!sourceTrack || !targetTrack || sourceTrack.locked || targetTrack.locked) {
        return;
      }

      const clipIndex = sourceTrack.clips.findIndex((clip) => clip.id === clipId);
      if (clipIndex < 0) {
        return;
      }

      const [clip] = sourceTrack.clips.splice(clipIndex, 1);
      const clipDuration = clip.endTime - clip.startTime;
      clip.trackId = newTrackId;
      clip.startTime = Math.max(0, newStart);
      clip.endTime = clip.startTime + clipDuration;
      targetTrack.clips.push(clip);
      targetTrack.clips.sort((left, right) => left.startTime - right.startTime);
      state.selectedClipIds = [clip.id];
      touchProject(state);
    }),
    trimClip: (clipId, side, time) => set((state) => {
      state.tracks.forEach((track) => {
        if (track.locked) {
          return;
        }

        const clip = track.clips.find((item) => item.id === clipId);
        if (!clip) {
          return;
        }

        if (side === 'left') {
          clip.startTime = Math.max(0, Math.min(time, clip.endTime - 0.1));
        } else {
          clip.endTime = Math.max(time, clip.startTime + 0.1);
        }
      });
      touchProject(state);
    }),
    splitClip: (clipId, time) => set((state) => {
      state.tracks.forEach((track) => {
        if (track.locked) {
          return;
        }

        const index = track.clips.findIndex((clip) => clip.id === clipId);
        if (index < 0) {
          return;
        }

        const clip = track.clips[index];
        if (time <= clip.startTime || time >= clip.endTime) {
          return;
        }

        const splitClip: EditorClip = {
          ...clip,
          id: createId('clip'),
          startTime: time,
        };
        clip.endTime = time;
        track.clips.splice(index + 1, 0, splitClip);
        state.selectedClipIds = [clip.id, splitClip.id];
      });
      touchProject(state);
    }),
    selectClip: (clipId, multi = false) => set((state) => {
      if (multi) {
        const index = state.selectedClipIds.indexOf(clipId);
        if (index >= 0) {
          state.selectedClipIds.splice(index, 1);
        } else {
          state.selectedClipIds.push(clipId);
        }
        return;
      }
      state.selectedClipIds = [clipId];
    }),
    clearSelection: () => set((state) => {
      state.selectedClipIds = [];
    }),
    appendAssetToTimeline: (assetId) => set((state) => {
      const asset = flattenAssets(state.bins).find((item) => item.id === assetId);
      if (!asset) {
        return;
      }

      const targetTrack = asset.type === 'AUDIO'
        ? state.tracks.find((track) => track.type === 'AUDIO' && !track.locked)
        : state.tracks.find((track) => track.type === 'VIDEO' && !track.locked);

      if (!targetTrack) {
        return;
      }

      const nextStart = targetTrack.clips.reduce((max, clip) => Math.max(max, clip.endTime), 0);
      const clipDuration = Math.max(2, Math.min(asset.duration ?? 8, 18));
      const clip: EditorClip = {
        id: createId('clip'),
        trackId: targetTrack.id,
        name: asset.name,
        startTime: nextStart,
        endTime: nextStart + clipDuration,
        trimStart: 0,
        trimEnd: 0,
        type: asset.type === 'AUDIO' ? 'audio' : 'video',
        assetId: asset.id,
        waveformData: asset.type === 'AUDIO' ? asset.waveformData : undefined,
      };

      targetTrack.clips.push(clip);
      targetTrack.clips.sort((left, right) => left.startTime - right.startTime);
      state.sourceAsset = asset;
      state.playheadTime = clip.startTime;
      state.selectedClipIds = [clip.id];
      touchProject(state);
    }),
    importAssets: (assets, targetBinId = null) => set((state) => {
      if (assets.length === 0) {
        return;
      }

      const targetBin = findBinByIdMutable(state.bins, targetBinId) ?? ensureImportTargetBin(state);
      const existingAssetIds = new Set(targetBin.assets.map((asset) => asset.id));
      const nextAssets = assets.filter((asset) => !existingAssetIds.has(asset.id));
      if (nextAssets.length === 0) {
        state.selectedBinId = targetBin.id;
        refreshSelectedBinState(state);
        return;
      }

      targetBin.isOpen = true;
      targetBin.assets.unshift(...nextAssets);
      state.selectedBinId = targetBin.id;
      refreshSelectedBinState(state);
      state.sourceAsset = nextAssets[0] ?? state.sourceAsset;
      touchProject(state);
    }),
    razorAtPlayhead: () => set((state) => {
      let didSplit = false;
      for (const track of state.tracks) {
        if (track.locked) {
          continue;
        }

        const clip = track.clips.find((item) => item.startTime < state.playheadTime && item.endTime > state.playheadTime);
        if (!clip) {
          continue;
        }

        const index = track.clips.findIndex((item) => item.id === clip.id);
        if (index < 0) {
          continue;
        }

        const splitClip: EditorClip = {
          ...clip,
          id: createId('clip'),
          startTime: state.playheadTime,
        };
        clip.endTime = state.playheadTime;
        track.clips.splice(index + 1, 0, splitClip);
        state.selectedClipIds = [clip.id, splitClip.id];
        didSplit = true;
      }

      if (didSplit) {
        touchProject(state);
      }
    }),
    liftSelection: () => set((state) => {
      const selectedIds = state.selectedClipIds.length > 0
        ? new Set(state.selectedClipIds)
        : (() => {
            const context = findClipContextAtTime(state);
            return context ? new Set([context.clip.id]) : null;
          })();

      if (!selectedIds || selectedIds.size === 0) {
        return;
      }

      let didRemove = false;
      for (const track of state.tracks) {
        if (track.locked) {
          continue;
        }
        const nextClips = track.clips.filter((clip) => !selectedIds.has(clip.id));
        if (nextClips.length !== track.clips.length) {
          track.clips = nextClips;
          didRemove = true;
        }
      }

      if (!didRemove) {
        return;
      }

      state.selectedClipIds = [];
      touchProject(state);
    }),
    extractSelection: () => set((state) => {
      const context = state.selectedClipIds.length > 0
        ? (() => {
            for (const track of state.tracks) {
              const clip = track.clips.find((item) => item.id === state.selectedClipIds[0]);
              if (clip) {
                return { clip, track };
              }
            }
            return null;
          })()
        : findClipContextAtTime(state);

      if (!context || context.track.locked) {
        return;
      }

      const removedDuration = context.clip.endTime - context.clip.startTime;
      context.track.clips = context.track.clips
        .filter((clip) => clip.id !== context.clip.id)
        .map((clip) => {
          if (clip.startTime >= context.clip.endTime) {
            return {
              ...clip,
              startTime: Math.max(0, clip.startTime - removedDuration),
              endTime: Math.max(clip.startTime - removedDuration, clip.endTime - removedDuration),
            };
          }
          return clip;
        });

      state.playheadTime = Math.max(0, context.clip.startTime);
      state.selectedClipIds = [];
      touchProject(state);
    }),
    matchFrame: () => set((state) => {
      const context = state.selectedClipIds.length > 0
        ? (() => {
            for (const track of state.tracks) {
              const clip = track.clips.find((item) => item.id === state.selectedClipIds[0]);
              if (clip) {
                return { clip, track };
              }
            }
            return null;
          })()
        : findClipContextAtTime(state);

      if (!context?.clip.assetId) {
        return;
      }

      const asset = flattenAssets(state.bins).find((item) => item.id === context.clip.assetId);
      if (!asset) {
        return;
      }

      state.sourceAsset = asset;
      state.selectedTrackId = context.track.id;
      state.inPoint = context.clip.trimStart;
      state.outPoint = context.clip.trimStart + (context.clip.endTime - context.clip.startTime);
    }),

    selectBin: (binId) => set((state) => {
      state.selectedBinId = binId;
      state.activeBinAssets = findBinAssets(state.bins, binId);
      state.sourceAsset = state.activeBinAssets[0] ?? state.sourceAsset;
    }),
    toggleBin: (binId) => set((state) => {
      const toggle = (bins: EditorBin[]) => {
        for (const bin of bins) {
          if (bin.id === binId) {
            bin.isOpen = !bin.isOpen;
            return true;
          }
          if (toggle(bin.children)) {
            return true;
          }
        }
        return false;
      };

      toggle(state.bins);
    }),
    setSourceAsset: (asset) => set((state) => {
      state.sourceAsset = asset;
    }),

    setInPoint: (time) => set((state) => {
      state.inPoint = time;
    }),
    setOutPoint: (time) => set((state) => {
      state.outPoint = time;
    }),
    setInToPlayhead: () => set((state) => {
      state.inPoint = state.playheadTime;
    }),
    setOutToPlayhead: () => set((state) => {
      state.outPoint = state.playheadTime;
    }),
    clearInOut: () => set((state) => {
      state.inPoint = null;
      state.outPoint = null;
    }),
    addMarkerAtPlayhead: (label = 'Marker') => set((state) => {
      state.markers.unshift({
        id: createId('marker'),
        time: state.playheadTime,
        label,
        color: ['#f59e0b', '#7c5cfc', '#ef4444', '#25a865'][state.markers.length % 4],
      });
      touchProject(state);
    }),
    toggleSafeZones: () => set((state) => {
      state.showSafeZones = !state.showSafeZones;
    }),

    setActivePanel: (panel) => set((state) => {
      state.activePanel = panel;
      if (panel === 'color') {
        state.activeInspectorTab = 'color';
      } else if (panel === 'audio') {
        state.activeInspectorTab = 'audio';
      } else if (panel === 'review' || panel === 'publish' || panel === 'script' || panel === 'ingest') {
        state.showAIPanel = false;
      }
    }),
    setInspectorTab: (tab) => set((state) => {
      state.activeInspectorTab = tab;
    }),
    toggleAIPanel: () => set((state) => {
      state.showAIPanel = !state.showAIPanel;
    }),
    toggleCollabPanel: () => set((state) => {
      state.showCollabPanel = !state.showCollabPanel;
    }),
    setProjectName: (name) => set((state) => {
      state.projectName = name.trim() || 'Untitled Project';
      touchProject(state);
    }),

    setVolume: (volume) => set((state) => {
      state.volume = Math.max(0, Math.min(1, volume));
    }),
    toggleMuteAll: () => set((state) => {
      state.isMuted = !state.isMuted;
    }),

    loadProject: async (projectId) => {
      const project = projectId === 'new'
        ? await createProjectInRepository()
        : await getProjectFromRepository(projectId) ?? await createProjectInRepository({ name: 'Recovered Project' });
      set((state) => {
        hydrateFromProject(state, project);
      });
      return project.id;
    },
    saveProject: async () => {
      const snapshot = serializeProject(get());
      if (!snapshot) {
        return null;
      }

      set((state) => {
        state.saveStatus = 'saving';
      });

      try {
        const saved = await saveProjectToRepository(snapshot);
        set((state) => {
          state.projectId = saved.id;
          state.projectCreatedAt = saved.createdAt;
          state.lastSavedAt = saved.updatedAt;
          state.projectProgress = saved.progress;
          state.tokenBalance = saved.tokenBalance;
          state.aiJobs = saved.aiJobs;
          state.transcript = saved.transcript;
          state.reviewComments = saved.reviewComments;
          state.approvals = saved.approvals;
          state.publishJobs = saved.publishJobs;
          state.watchFolders = saved.watchFolders;
          state.saveStatus = 'saved';
          state.isDirty = false;
        });
        return saved;
      } catch (error) {
        set((state) => {
          state.saveStatus = 'error';
        });
        throw error;
      }
    },
    setSaveStatus: (status) => set((state) => {
      state.saveStatus = status;
    }),
    setDesktopJobs: (jobs) => set((state) => {
      state.desktopJobs = sortDesktopJobs(
        state.projectId
          ? jobs.filter((job) => job.projectId === state.projectId)
          : jobs,
      );
    }),
    upsertDesktopJob: (job) => set((state) => {
      if (state.projectId && job.projectId !== state.projectId) {
        return;
      }

      const index = state.desktopJobs.findIndex((item) => item.id === job.id);
      if (index >= 0) {
        state.desktopJobs[index] = job;
      } else {
        state.desktopJobs.unshift(job);
      }
      state.desktopJobs = sortDesktopJobs(state.desktopJobs);
    }),
    toggleCommandPalette: (open) => set((state) => {
      state.isCommandPaletteOpen = open ?? !state.isCommandPaletteOpen;
    }),
    addReviewComment: (comment) => set((state) => {
      state.reviewComments.unshift({
        id: createId('comment'),
        author: comment.author ?? 'You',
        role: comment.role ?? 'Editor',
        color: comment.color ?? '#4f63f5',
        body: comment.body,
        time: state.playheadTime,
        createdAt: new Date().toISOString(),
        status: 'OPEN',
      });
      touchProject(state);
    }),
    setApprovalStatus: (approvalId, status, notes) => set((state) => {
      const approval = state.approvals.find((item) => item.id === approvalId);
      if (!approval) {
        return;
      }
      approval.status = status;
      approval.notes = notes ?? approval.notes;
      approval.updatedAt = new Date().toISOString();
      touchProject(state);
    }),
    queuePublishJob: (job) => {
      const jobId = createId('publish');
      set((state) => {
        state.publishJobs.unshift({
          id: jobId,
          label: job.label,
          preset: job.preset,
          destination: job.destination,
          status: 'QUEUED',
          progress: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        touchProject(state);
      });
      return jobId;
    },
    updatePublishJob: (jobId, patch) => set((state) => {
      const job = state.publishJobs.find((item) => item.id === jobId);
      if (!job) {
        return;
      }
      Object.assign(job, patch, { updatedAt: new Date().toISOString() });
      touchProject(state);
    }),

    startAIJob: (tool) => {
      const state = get();
      if (state.tokenBalance < tool.cost) {
        return null;
      }

      const jobId = createId('job');
      set((draft) => {
        draft.tokenBalance -= tool.cost;
        draft.aiJobs.unshift({
          id: jobId,
          type: tool.id,
          label: tool.label,
          status: 'RUNNING',
          progress: 0,
          cost: tool.cost,
          createdAt: new Date().toISOString(),
        });
        touchProject(draft);
      });
      return jobId;
    },
    updateAIJob: (jobId, patch) => set((state) => {
      const job = state.aiJobs.find((item) => item.id === jobId);
      if (!job) {
        return;
      }

      Object.assign(job, patch);
      if (job.status === 'COMPLETED' || job.status === 'FAILED') {
        job.completedAt = new Date().toISOString();
      }
      touchProject(state);
    }),
  })),
);
