// ─── Collaboration Store ────────────────────────────────────────────────────
// Zustand store for collaboration state: online users, comments, versions,
// and activity feed. Initialized with demo data from CollabEngine.

import type { EditorProjectVersionHistoryEntry } from '@mcua/core';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { collabEngine, type CollabUser, type CollabComment, type ProjectVersion } from '../collab/CollabEngine';
import { captureEditorVersionSnapshot, applyEditorVersionSnapshot } from '../collab/versionSnapshots';
import { getProjectFromRepository, saveProjectToRepository } from '../lib/projectRepository';

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
  saveVersion: (name: string, description: string) => void;
  restoreVersion: (versionId: string) => void;

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
  activityFeed: DEMO_ACTIVITY,
};

function toProjectVersionHistory(versions: ProjectVersion[]): EditorProjectVersionHistoryEntry[] {
  return versions.map((version) => ({
    id: version.id,
    name: version.name,
    createdAt: version.createdAt,
    createdBy: version.createdBy,
    description: version.description,
    snapshotData: version.snapshotData,
    isRestorePoint: version.isRestorePoint,
  }));
}

function toCollabVersions(entries: EditorProjectVersionHistoryEntry[]): ProjectVersion[] {
  return entries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    createdAt: Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : Date.now(),
    createdBy: entry.createdBy,
    description: entry.description,
    snapshotData: entry.snapshotData,
    isRestorePoint: entry.isRestorePoint,
  }));
}

async function persistVersionHistory(projectId: string, versions: ProjectVersion[]): Promise<void> {
  try {
    const project = await getProjectFromRepository(projectId);
    if (!project) {
      return;
    }
    await saveProjectToRepository({
      ...project,
      versionHistory: toProjectVersionHistory(versions),
    });
  } catch (error) {
    console.warn('[CollabStore] Failed to persist version history', error);
  }
}

async function hydrateVersionHistory(projectId: string): Promise<ProjectVersion[] | null> {
  try {
    const project = await getProjectFromRepository(projectId);
    const entries = project?.versionHistory;
    if (!entries || entries.length === 0) {
      return null;
    }
    return toCollabVersions(entries);
  } catch (error) {
    console.warn('[CollabStore] Failed to hydrate version history', error);
    return null;
  }
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useCollabStore = create<CollabState & CollabActions>()(
  devtools(
    immer((set, get) => ({
      // Initial state
      ...INITIAL_STATE,

      // Connection
      connect: (projectId, userId) => {
        collabEngine.connect(projectId, userId);
        set((s) => {
          s.projectId = projectId;
          s.connected = true;
          s.currentUserId = userId;
          s.onlineUsers = collabEngine.getOnlineUsers();
        }, false, 'collab/connect');

        void hydrateVersionHistory(projectId).then((versions) => {
          if (!versions || versions.length === 0) {
            return;
          }
          collabEngine.hydrateVersions(versions);
          set((s) => {
            if (s.projectId === projectId) {
              s.versions = collabEngine.getVersions();
            }
          }, false, 'collab/hydrateVersionHistory');
        });
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
      saveVersion: (name, description) => {
        const snapshotData = captureEditorVersionSnapshot();
        collabEngine.saveVersion(name, description, snapshotData);
        const versions = collabEngine.getVersions();
        set((s) => {
          s.versions = versions;
        }, false, 'collab/saveVersion');
        get().addActivity('You', 'saved version', `"${name}"`);
        const projectId = get().projectId;
        if (projectId) {
          void persistVersionHistory(projectId, versions);
        }
      },

      restoreVersion: (versionId) => {
        const currentSnapshot = captureEditorVersionSnapshot();
        const requestedVersion = collabEngine.getVersions().find((version) => version.id === versionId);
        if (!requestedVersion) {
          return;
        }

        collabEngine.saveVersion(
          `Restore Point: ${requestedVersion.name}`,
          `Automatic restore point created before restoring "${requestedVersion.name}".`,
          currentSnapshot,
          true,
        );

        const restoredVersion = collabEngine.restoreVersion(versionId);
        const restored = restoredVersion ? applyEditorVersionSnapshot(restoredVersion.snapshotData) : false;

        const versions = collabEngine.getVersions();
        set((s) => {
          s.versions = versions;
        }, false, 'collab/restoreVersion');

        if (restoredVersion) {
          get().addActivity('You', 'restored version', `"${restoredVersion.name}"`);
        }
        if (!restored) {
          get().addActivity('System', 'restore warning', `Version "${requestedVersion.name}" had no restorable snapshot payload`);
        }

        const projectId = get().projectId;
        if (projectId) {
          void persistVersionHistory(projectId, versions);
        }
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
