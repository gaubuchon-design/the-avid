// ─── Collaboration Store ────────────────────────────────────────────────────
// Zustand store for collaboration state: online users, comments, versions,
// and activity feed. Initialized with demo data from CollabEngine.

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { collabEngine, type CollabUser, type CollabComment, type ProjectVersion } from '../collab/CollabEngine';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ActivityEntry {
  id: string;
  user: string;
  action: string;
  timestamp: number;
  detail: string;
}

interface CollabState {
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

// ─── Store ──────────────────────────────────────────────────────────────────

export const useCollabStore = create<CollabState & CollabActions>()(
  immer((set, get) => ({
    // Initial state
    connected: false,
    currentUserId: 'u_self',
    onlineUsers: collabEngine.getOnlineUsers(),
    comments: collabEngine.getComments(),
    versions: collabEngine.getVersions(),
    activeTab: 'comments',
    selectedCommentId: null,
    commentFilter: 'all',
    activityFeed: DEMO_ACTIVITY,

    // Connection
    connect: (projectId, userId) => {
      collabEngine.connect(projectId, userId);
      set((s) => {
        s.connected = true;
        s.currentUserId = userId;
        s.onlineUsers = collabEngine.getOnlineUsers();
      });
    },

    disconnect: () => {
      collabEngine.disconnect();
      set((s) => { s.connected = false; });
    },

    // UI
    setActiveTab: (tab) => set((s) => { s.activeTab = tab; }),
    setCommentFilter: (filter) => set((s) => { s.commentFilter = filter; }),
    selectComment: (id) => set((s) => { s.selectedCommentId = id; }),

    // Comments
    addComment: (frame, trackId, text) => {
      const comment = collabEngine.addComment(frame, trackId, text);
      set((s) => {
        s.comments = collabEngine.getComments();
      });
      get().addActivity('You', 'added comment', `"${text.slice(0, 40)}${text.length > 40 ? '...' : ''}"`);
    },

    replyToComment: (commentId, text) => {
      collabEngine.replyToComment(commentId, text);
      set((s) => {
        s.comments = collabEngine.getComments();
      });
      get().addActivity('You', 'replied to comment', `"${text.slice(0, 40)}${text.length > 40 ? '...' : ''}"`);
    },

    resolveComment: (commentId) => {
      collabEngine.resolveComment(commentId);
      set((s) => {
        s.comments = collabEngine.getComments();
      });
      get().addActivity('You', 'resolved comment', `Comment ${commentId}`);
    },

    reopenComment: (commentId) => {
      collabEngine.reopenComment(commentId);
      set((s) => {
        s.comments = collabEngine.getComments();
      });
      get().addActivity('You', 'reopened comment', `Comment ${commentId}`);
    },

    addReaction: (commentId, emoji) => {
      collabEngine.addReaction(commentId, emoji);
      set((s) => {
        s.comments = collabEngine.getComments();
      });
    },

    // Versions
    saveVersion: (name, description) => {
      collabEngine.saveVersion(name, description);
      set((s) => {
        s.versions = collabEngine.getVersions();
      });
      get().addActivity('You', 'saved version', `"${name}"`);
    },

    restoreVersion: (versionId) => {
      collabEngine.restoreVersion(versionId);
      const version = collabEngine.getVersions().find(v => v.id === versionId);
      if (version) {
        get().addActivity('You', 'restored version', `"${version.name}"`);
      }
    },

    // Sync
    refreshFromEngine: () => set((s) => {
      s.onlineUsers = collabEngine.getOnlineUsers();
      s.comments = collabEngine.getComments();
      s.versions = collabEngine.getVersions();
    }),

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
    }),
  }))
);
