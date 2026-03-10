// ─── Collaboration Store ────────────────────────────────────────────────────
// Zustand store for collaboration state: online users, comments, versions,
// and activity feed. Initialized with demo data from CollabEngine.

import type { EditorProject, EditorProjectVersionHistoryEntry } from '@mcua/core';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import {
  collabEngine,
  DEFAULT_VERSION_RETENTION_PREFERENCES,
  type CollabComment,
  type CollabUser,
  type ProjectVersion,
  type VersionRetentionPreferences,
  type VersionRetentionPreset,
} from '../collab/CollabEngine';
import { buildProjectFromEditorState, buildProjectPersistenceSnapshot } from '../lib/editorProjectState';
import { getProjectFromRepository, saveProjectToRepository } from '../lib/projectRepository';
import { useEditorStore } from './editor.store';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ActivityEntry {
  id: string;
  user: string;
  action: string;
  timestamp: number;
  detail: string;
}

interface CollabState {
  projectId: string | null;
  connected: boolean;
  currentUserId: string;
  onlineUsers: CollabUser[];
  comments: CollabComment[];
  versions: ProjectVersion[];
  activeTab: 'users' | 'comments' | 'versions' | 'activity';
  selectedCommentId: string | null;
  commentFilter: 'all' | 'open' | 'resolved';
  versionRetentionPreferences: VersionRetentionPreferences;
  activityFeed: ActivityEntry[];
}

interface CollabActions {
  // Connection
  connect: (projectId: string, userId: string) => void;
  disconnect: () => void;

  // UI
  setActiveTab: (tab: CollabState['activeTab']) => void;
  setCommentFilter: (filter: CollabState['commentFilter']) => void;
  selectComment: (id: string | null) => void;

  // Comments
  addComment: (frame: number, trackId: string | null, text: string) => void;
  replyToComment: (commentId: string, text: string) => void;
  resolveComment: (commentId: string) => void;
  reopenComment: (commentId: string) => void;
  addReaction: (commentId: string, emoji: string) => void;

  // Versions
  saveVersion: (
    name: string,
    description: string,
    snapshotData?: unknown,
    options?: { retentionPolicy?: 'manual' | 'session' },
  ) => void;
  restoreVersion: (versionId: string) => void;
  setVersionRetentionPreferences: (preferences: Partial<VersionRetentionPreferences>) => void;

  // Sync
  refreshFromEngine: () => void;

  // Activity
  addActivity: (user: string, action: string, detail: string) => void;

  // Reset
  resetStore: () => void;
}

// ─── Demo activity feed ─────────────────────────────────────────────────────

const now = Date.now();

const DEMO_ACTIVITY: ActivityEntry[] = [
  { id: 'act1', user: 'Sarah K.', action: 'trimmed clip', timestamp: now - 300000, detail: "Trimmed 'INT. OFFICE' right edge -12 frames" },
  { id: 'act2', user: 'Marcus T.', action: 'adjusted audio level', timestamp: now - 600000, detail: 'Set Dialogue Track to -12dB' },
  { id: 'act3', user: 'Sarah K.', action: 'added marker', timestamp: now - 900000, detail: "Added 'Scene 1 End' marker at 00:00:08:12" },
  { id: 'act4', user: 'Marcus T.', action: 'resolved comment', timestamp: now - 1200000, detail: "Resolved 'Love this shot!' comment" },
  { id: 'act5', user: 'Sarah K.', action: 'saved version', timestamp: now - 1800000, detail: "Saved version 'Director's Review Cut'" },
  { id: 'act6', user: 'Marcus T.', action: 'split clip', timestamp: now - 2400000, detail: "Split 'EXT. ROOFTOP' at 00:00:14:18" },
  { id: 'act7', user: 'Sarah K.', action: 'added B-roll', timestamp: now - 3600000, detail: "Placed 'City Timelapse' on V2 at 00:00:04:00" },
  { id: 'act8', user: 'Marcus T.', action: 'normalized audio', timestamp: now - 5400000, detail: 'Normalized A1 and A2 to -23 LUFS' },
];

function buildCurrentProjectVersionSnapshot(): (EditorProject & { playheadTime: number }) | null {
  const snapshot = buildProjectPersistenceSnapshot(useEditorStore.getState());
  if (!snapshot) {
    return null;
  }

  return {
    ...buildProjectFromEditorState(snapshot),
    playheadTime: useEditorStore.getState().playheadTime,
  };
}

function isEditorProjectSnapshot(value: unknown): value is EditorProject {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<EditorProject>;
  return (
    typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && Array.isArray(candidate.tracks)
    && Array.isArray(candidate.bins)
    && typeof candidate.editorialState === 'object'
    && candidate.editorialState !== null
    && typeof candidate.workstationState === 'object'
    && candidate.workstationState !== null
  );
}

const VERSION_RETENTION_STORAGE_KEY = 'avid:version-retention-preferences';

function isVersionRetentionPreset(value: unknown): value is VersionRetentionPreset {
  return value === 'keep-all' || value === 'last-10' || value === 'last-25' || value === 'last-50';
}

function loadVersionRetentionPreferences(): VersionRetentionPreferences {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_VERSION_RETENTION_PREFERENCES };
  }
  try {
    const raw = window.localStorage.getItem(VERSION_RETENTION_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VERSION_RETENTION_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<VersionRetentionPreferences>;
    return {
      preset: isVersionRetentionPreset(parsed.preset)
        ? parsed.preset
        : DEFAULT_VERSION_RETENTION_PREFERENCES.preset,
      autoPrune: typeof parsed.autoPrune === 'boolean'
        ? parsed.autoPrune
        : DEFAULT_VERSION_RETENTION_PREFERENCES.autoPrune,
    };
  } catch {
    return { ...DEFAULT_VERSION_RETENTION_PREFERENCES };
  }
}

function persistVersionRetentionPreferences(preferences: VersionRetentionPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VERSION_RETENTION_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // ignore localStorage persistence failures in private/incognito contexts
  }
}

function toPersistedVersionHistoryEntry(version: ProjectVersion): EditorProjectVersionHistoryEntry {
  return {
    id: version.id,
    name: version.name,
    createdAt: version.createdAt,
    createdBy: version.createdBy,
    description: version.description,
    snapshotData: version.snapshotData,
    isRestorePoint: version.isRestorePoint,
  };
}

function toProjectVersionFromPersistedEntry(entry: EditorProjectVersionHistoryEntry): ProjectVersion {
  return {
    id: entry.id,
    name: entry.name,
    createdAt: entry.createdAt,
    createdBy: entry.createdBy,
    description: entry.description,
    kind: 'restore-point',
    isRestorePoint: entry.isRestorePoint ?? true,
    retentionPolicy: 'manual',
    snapshotSummary: null,
    compareSummary: null,
    compareBaselineName: null,
    compareMetrics: [],
    snapshotData: entry.snapshotData,
  };
}

function getPersistableVersions(): ProjectVersion[] {
  return collabEngine.getVersions().filter((version) => version.kind === 'restore-point');
}

async function persistVersionsToRepository(projectId: string | null): Promise<void> {
  if (!projectId) return;
  const project = await getProjectFromRepository(projectId);
  if (!project) return;
  const versionHistory = getPersistableVersions().map(toPersistedVersionHistoryEntry);
  await saveProjectToRepository({
    ...project,
    versionHistory,
  });
}

const initialVersionRetentionPreferences = loadVersionRetentionPreferences();
collabEngine.setVersionRetentionPreferences(initialVersionRetentionPreferences);
// ─── Initial State ──────────────────────────────────────────────────────────

const INITIAL_STATE: CollabState = {
  projectId: null,
  connected: false,
  currentUserId: 'u_self',
  onlineUsers: collabEngine.getOnlineUsers(),
  comments: collabEngine.getComments(),
  versions: collabEngine.getVersions(),
  activeTab: 'comments',
  selectedCommentId: null,
  commentFilter: 'all',
  versionRetentionPreferences: initialVersionRetentionPreferences,
  activityFeed: DEMO_ACTIVITY,
};

// ─── Store ──────────────────────────────────────────────────────────────────

export const useCollabStore = create<CollabState & CollabActions>()(
  devtools(
    immer((set, get) => ({
      // Initial state
      ...INITIAL_STATE,

      // Connection
      connect: (projectId, userId) => {
        const connectRequestToken = `${projectId}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
        collabEngine.connect(projectId, userId);
        set((s) => {
          s.projectId = projectId;
          s.connected = true;
          s.currentUserId = userId;
          s.onlineUsers = collabEngine.getOnlineUsers();
        }, false, 'collab/connect');

        void (async () => {
          try {
            const project = await getProjectFromRepository(projectId);
            if (!project) return;
            const state = get();
            const activeToken = `${state.projectId}:${state.connected}`;
            const expectedToken = `${projectId}:true`;
            if (activeToken !== expectedToken || !state.connected || state.projectId !== projectId) {
              return;
            }

            const persistedVersions = (project.versionHistory ?? []).map(toProjectVersionFromPersistedEntry);
            collabEngine.hydrateVersions(persistedVersions);
            set((s) => {
              if (!s.connected || s.projectId !== projectId) return;
              s.versions = collabEngine.getVersions();
            }, false, `collab/hydrateVersions/${connectRequestToken}`);
          } catch (error) {
            console.error('Failed to hydrate collaboration version history', error);
          }
        })();
      },

      disconnect: () => {
        collabEngine.disconnect();
        set((s) => {
          s.connected = false;
          s.projectId = null;
        }, false, 'collab/disconnect');
      },

      // UI
      setActiveTab: (tab) => set((s) => { s.activeTab = tab; }, false, 'collab/setActiveTab'),
      setCommentFilter: (filter) => set((s) => { s.commentFilter = filter; }, false, 'collab/setCommentFilter'),
      selectComment: (id) => set((s) => { s.selectedCommentId = id; }, false, 'collab/selectComment'),

      // Comments
      addComment: (frame, trackId, text) => {
        collabEngine.addComment(frame, trackId, text);
        set((s) => {
          s.comments = collabEngine.getComments();
        }, false, 'collab/addComment');
        get().addActivity('You', 'added comment', `"${text.slice(0, 40)}${text.length > 40 ? '...' : ''}"`);
      },

      replyToComment: (commentId, text) => {
        collabEngine.replyToComment(commentId, text);
        set((s) => {
          s.comments = collabEngine.getComments();
        }, false, 'collab/replyToComment');
        get().addActivity('You', 'replied to comment', `"${text.slice(0, 40)}${text.length > 40 ? '...' : ''}"`);
      },

      resolveComment: (commentId) => {
        collabEngine.resolveComment(commentId);
        set((s) => {
          s.comments = collabEngine.getComments();
        }, false, 'collab/resolveComment');
        get().addActivity('You', 'resolved comment', `Comment ${commentId}`);
      },

      reopenComment: (commentId) => {
        collabEngine.reopenComment(commentId);
        set((s) => {
          s.comments = collabEngine.getComments();
        }, false, 'collab/reopenComment');
        get().addActivity('You', 'reopened comment', `Comment ${commentId}`);
      },

      addReaction: (commentId, emoji) => {
        collabEngine.addReaction(commentId, emoji);
        set((s) => {
          s.comments = collabEngine.getComments();
        }, false, 'collab/addReaction');
      },

      // Versions
      saveVersion: (name, description, snapshotData, options) => {
        collabEngine.saveVersion(
          name,
          description,
          snapshotData ?? buildCurrentProjectVersionSnapshot() ?? undefined,
          options,
        );
        set((s) => {
          s.versions = collabEngine.getVersions();
        }, false, 'collab/saveVersion');
        get().addActivity('You', 'saved version', `"${name}"`);
        void persistVersionsToRepository(get().projectId).catch((error) => {
          console.error('Failed to persist collaboration version history', error);
        });
      },

      restoreVersion: (versionId) => {
        const currentSnapshot = buildCurrentProjectVersionSnapshot();
        const versionToRestore = collabEngine.getVersions().find((version) => version.id === versionId) ?? null;
        if (currentSnapshot && versionToRestore) {
          collabEngine.saveVersion(
            `Restore Point · Before ${versionToRestore.name}`,
            `Auto-created before restoring ${versionToRestore.name}.`,
            currentSnapshot,
            { retentionPolicy: 'session' },
          );
        }

        const version = collabEngine.restoreVersion(versionId);
        if (!version) {
          return;
        }

        set((s) => {
          s.versions = collabEngine.getVersions();
        }, false, 'collab/restoreVersion');

        if (isEditorProjectSnapshot(version.snapshotData)) {
          useEditorStore.getState().restoreProjectSnapshot(version.snapshotData);
          const savedPlayheadTime = (version.snapshotData as { playheadTime?: unknown }).playheadTime;
          if (typeof savedPlayheadTime === 'number') {
            useEditorStore.setState((state) => ({
              ...state,
              playheadTime: savedPlayheadTime,
            }));
          }
          // Persist the restored snapshot immediately so reopen/reload reflects the restored timeline/shell state.
          void useEditorStore.getState().saveProject().catch((error) => {
            console.error('Failed to persist restored collaboration snapshot', error);
          });
          get().addActivity('You', 'restored version', `"${version.name}"`);
          void persistVersionsToRepository(get().projectId).catch((error) => {
            console.error('Failed to persist collaboration version history', error);
          });
          return;
        }

        get().addActivity('You', 'restore unavailable', `"${version.name}" does not contain a restorable project snapshot.`);
      },

      setVersionRetentionPreferences: (preferences) => {
        const mergedPreferences = {
          ...get().versionRetentionPreferences,
          ...preferences,
        };
        collabEngine.setVersionRetentionPreferences(mergedPreferences);
        persistVersionRetentionPreferences(mergedPreferences);
        set((s) => {
          s.versionRetentionPreferences = mergedPreferences;
          s.versions = collabEngine.getVersions();
        }, false, 'collab/setVersionRetentionPreferences');
        void persistVersionsToRepository(get().projectId).catch((error) => {
          console.error('Failed to persist collaboration version history', error);
        });
      },

      // Sync
      refreshFromEngine: () => set((s) => {
        s.onlineUsers = collabEngine.getOnlineUsers();
        s.comments = collabEngine.getComments();
        s.versions = collabEngine.getVersions();
      }, false, 'collab/refreshFromEngine'),

      // Activity
      addActivity: (user, action, detail) => set((s) => {
        s.activityFeed.unshift({
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          user,
          action,
          timestamp: Date.now(),
          detail,
        });
        // Keep feed under 50 entries
        if (s.activityFeed.length > 50) {
          s.activityFeed = s.activityFeed.slice(0, 50);
        }
      }, false, 'collab/addActivity'),

      // Reset
      resetStore: () => {
        collabEngine.disconnect();
        set(() => ({
          ...INITIAL_STATE,
          onlineUsers: collabEngine.getOnlineUsers(),
          comments: collabEngine.getComments(),
          versions: collabEngine.getVersions(),
          versionRetentionPreferences: get().versionRetentionPreferences,
        }), true, 'collab/resetStore');
      },
    })),
    { name: 'CollabStore', enabled: import.meta.env.DEV },
  )
);

// ─── Named Selectors ────────────────────────────────────────────────────────

type CollabStoreState = CollabState & CollabActions;

export const selectCollabConnected = (state: CollabStoreState) => state.connected;
export const selectOnlineUsers = (state: CollabStoreState) => state.onlineUsers;
export const selectCollabComments = (state: CollabStoreState) => state.comments;
export const selectCollabVersions = (state: CollabStoreState) => state.versions;
export const selectCollabActiveTab = (state: CollabStoreState) => state.activeTab;
export const selectSelectedCommentId = (state: CollabStoreState) => state.selectedCommentId;
export const selectCommentFilter = (state: CollabStoreState) => state.commentFilter;
export const selectVersionRetentionPreferences = (state: CollabStoreState) => state.versionRetentionPreferences;
export const selectActivityFeed = (state: CollabStoreState) => state.activityFeed;
export const selectOnlineUserCount = (state: CollabStoreState) => state.onlineUsers.length;
export const selectOpenComments = (state: CollabStoreState) =>
  state.comments.filter((c) => !c.resolved);
export const selectResolvedComments = (state: CollabStoreState) =>
  state.comments.filter((c) => c.resolved);
export const selectFilteredComments = (state: CollabStoreState) => {
  if (state.commentFilter === 'all') return state.comments;
  if (state.commentFilter === 'open') return state.comments.filter((c) => !c.resolved);
  return state.comments.filter((c) => c.resolved);
};
