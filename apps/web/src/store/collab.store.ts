// ─── Collaboration Store ────────────────────────────────────────────────────
// Zustand store for collaboration state: online users, comments, versions,
// and activity feed. Initialized with demo data from CollabEngine.

import type {
  EditorProject,
  EditorProjectCollaborationActivityEntry,
  EditorProjectCollaborationPanelPreferences,
  EditorProjectCollaborationActivityRetentionPreferences,
  EditorProjectCollaborationCommentEntry,
  EditorProjectVersionHistoryEntry,
} from '@mcua/core';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import {
  collabEngine,
  type CollabIdentityProfile,
  DEFAULT_VERSION_RETENTION_PREFERENCES,
  type CollabComment,
  type CollabReaction,
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
  userId?: string;
  action: string;
  timestamp: number;
  detail: string;
}

export type ActivityRetentionPreset = 'keep-all' | 'last-25' | 'last-50' | 'last-100';

export interface ActivityRetentionPreferences {
  preset: ActivityRetentionPreset;
  autoPrune: boolean;
}

export type ActivityActionFilter = 'all' | 'comments' | 'versions' | 'other';

export interface CollaboratorIdentityProfile {
  userId?: string;
  displayName: string;
  avatarUrl?: string;
  color?: string;
}

interface CollabState {
  projectId: string | null;
  connected: boolean;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar?: string;
  identityProfiles: Record<string, CollaboratorIdentityProfile>;
  onlineUsers: CollabUser[];
  comments: CollabComment[];
  versions: ProjectVersion[];
  activeTab: 'users' | 'comments' | 'versions' | 'activity';
  selectedCommentId: string | null;
  commentFilter: 'all' | 'open' | 'resolved';
  activityActionFilter: ActivityActionFilter;
  activitySearchQuery: string;
  versionRetentionPreferences: VersionRetentionPreferences;
  activityRetentionPreferences: ActivityRetentionPreferences;
  activityFeed: ActivityEntry[];
}

interface CollabActions {
  // Connection
  connect: (projectId: string, userId: string, profile?: CollabIdentityProfile) => void;
  disconnect: () => void;

  // UI
  setActiveTab: (tab: CollabState['activeTab']) => void;
  setCommentFilter: (filter: CollabState['commentFilter']) => void;
  setActivityActionFilter: (filter: CollabState['activityActionFilter']) => void;
  setActivitySearchQuery: (query: string) => void;
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
  setActivityRetentionPreferences: (preferences: Partial<ActivityRetentionPreferences>) => void;

  // Sync
  refreshFromEngine: () => void;

  // Activity
  addActivity: (user: string, action: string, detail: string, userId?: string) => void;

  // Reset
  resetStore: () => void;
}

// ─── Demo activity feed ─────────────────────────────────────────────────────

const now = Date.now();

const DEMO_ACTIVITY: ActivityEntry[] = [
  { id: 'act1', user: 'Sarah K.', userId: 'u1', action: 'trimmed clip', timestamp: now - 300000, detail: "Trimmed 'INT. OFFICE' right edge -12 frames" },
  { id: 'act2', user: 'Marcus T.', userId: 'u2', action: 'adjusted audio level', timestamp: now - 600000, detail: 'Set Dialogue Track to -12dB' },
  { id: 'act3', user: 'Sarah K.', userId: 'u1', action: 'added marker', timestamp: now - 900000, detail: "Added 'Scene 1 End' marker at 00:00:08:12" },
  { id: 'act4', user: 'Marcus T.', userId: 'u2', action: 'resolved comment', timestamp: now - 1200000, detail: "Resolved 'Love this shot!' comment" },
  { id: 'act5', user: 'Sarah K.', userId: 'u1', action: 'saved version', timestamp: now - 1800000, detail: "Saved version 'Director's Review Cut'" },
  { id: 'act6', user: 'Marcus T.', userId: 'u2', action: 'split clip', timestamp: now - 2400000, detail: "Split 'EXT. ROOFTOP' at 00:00:14:18" },
  { id: 'act7', user: 'Sarah K.', userId: 'u1', action: 'added B-roll', timestamp: now - 3600000, detail: "Placed 'City Timelapse' on V2 at 00:00:04:00" },
  { id: 'act8', user: 'Marcus T.', userId: 'u2', action: 'normalized audio', timestamp: now - 5400000, detail: 'Normalized A1 and A2 to -23 LUFS' },
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
const ACTIVITY_RETENTION_STORAGE_KEY = 'avid:activity-retention-preferences';
const DEFAULT_ACTIVITY_RETENTION_PREFERENCES: ActivityRetentionPreferences = {
  preset: 'last-50',
  autoPrune: true,
};

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

function isActivityRetentionPreset(value: unknown): value is ActivityRetentionPreset {
  return value === 'keep-all' || value === 'last-25' || value === 'last-50' || value === 'last-100';
}

function loadActivityRetentionPreferences(): ActivityRetentionPreferences {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_ACTIVITY_RETENTION_PREFERENCES };
  }
  try {
    const raw = window.localStorage.getItem(ACTIVITY_RETENTION_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ACTIVITY_RETENTION_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<ActivityRetentionPreferences>;
    return {
      preset: isActivityRetentionPreset(parsed.preset)
        ? parsed.preset
        : DEFAULT_ACTIVITY_RETENTION_PREFERENCES.preset,
      autoPrune: typeof parsed.autoPrune === 'boolean'
        ? parsed.autoPrune
        : DEFAULT_ACTIVITY_RETENTION_PREFERENCES.autoPrune,
    };
  } catch {
    return { ...DEFAULT_ACTIVITY_RETENTION_PREFERENCES };
  }
}

function persistActivityRetentionPreferences(preferences: ActivityRetentionPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACTIVITY_RETENTION_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // ignore localStorage persistence failures in private/incognito contexts
  }
}

function applyActivityRetention(
  entries: ActivityEntry[],
  preferences: ActivityRetentionPreferences,
): ActivityEntry[] {
  if (!preferences.autoPrune) {
    return entries;
  }
  const maxEntriesByPreset: Record<Exclude<ActivityRetentionPreset, 'keep-all'>, number> = {
    'last-25': 25,
    'last-50': 50,
    'last-100': 100,
  };
  if (preferences.preset === 'keep-all') {
    return entries;
  }
  const maxEntries = maxEntriesByPreset[preferences.preset];
  if (entries.length <= maxEntries) {
    return entries;
  }
  return entries.slice(0, maxEntries);
}

function toPersistedVersionHistoryEntry(version: ProjectVersion): EditorProjectVersionHistoryEntry {
  return {
    id: version.id,
    name: version.name,
    createdAt: version.createdAt,
    createdBy: version.createdBy,
    createdByProfile: version.createdByProfile
      ? {
        userId: version.createdByProfile.userId,
        displayName: version.createdByProfile.displayName,
        avatarUrl: version.createdByProfile.avatarUrl,
        color: version.createdByProfile.color,
      }
      : undefined,
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
    createdByProfile: entry.createdByProfile
      ? {
        userId: entry.createdByProfile.userId,
        displayName: entry.createdByProfile.displayName || entry.createdBy,
        avatarUrl: entry.createdByProfile.avatarUrl,
        color: entry.createdByProfile.color,
      }
      : undefined,
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

function toPersistedCollaborationCommentEntry(comment: CollabComment): EditorProjectCollaborationCommentEntry {
  return {
    id: comment.id,
    userId: comment.userId,
    userName: comment.userName,
    frame: comment.frame,
    trackId: comment.trackId,
    text: comment.text,
    timestamp: comment.timestamp,
    resolved: comment.resolved,
    replies: comment.replies.map((reply) => ({
      id: reply.id,
      userId: reply.userId,
      userName: reply.userName,
      text: reply.text,
      timestamp: reply.timestamp,
    })),
    reactions: comment.reactions.map((reaction) => ({
      emoji: reaction.emoji,
      userIds: [...reaction.userIds],
      actorProfiles: reaction.actorProfiles?.map((profile) => ({
        userId: profile.userId,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        color: profile.color,
      })),
    })),
  };
}

function toCollabCommentFromPersistedEntry(entry: EditorProjectCollaborationCommentEntry): CollabComment {
  return {
    id: entry.id,
    userId: entry.userId,
    userName: entry.userName,
    frame: entry.frame,
    trackId: entry.trackId,
    text: entry.text,
    timestamp: entry.timestamp,
    resolved: entry.resolved,
    replies: entry.replies.map((reply) => ({
      id: reply.id,
      userId: reply.userId,
      userName: reply.userName,
      text: reply.text,
      timestamp: reply.timestamp,
    })),
    reactions: entry.reactions.map((reaction) => ({
      emoji: reaction.emoji,
      userIds: [...reaction.userIds],
      actorProfiles: reaction.actorProfiles?.map((profile) => ({
        userId: profile.userId,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        color: profile.color,
      })),
    })),
  };
}

function getPersistableComments(): CollabComment[] {
  return collabEngine.getComments();
}

function toPersistedActivityEntry(entry: ActivityEntry): EditorProjectCollaborationActivityEntry {
  return {
    id: entry.id,
    user: entry.user,
    userId: entry.userId,
    action: entry.action,
    timestamp: entry.timestamp,
    detail: entry.detail,
  };
}

function toActivityEntryFromPersistedEntry(entry: EditorProjectCollaborationActivityEntry): ActivityEntry {
  return {
    id: entry.id,
    user: entry.user,
    userId: entry.userId,
    action: entry.action,
    timestamp: entry.timestamp,
    detail: entry.detail,
  };
}

function toPersistedActivityRetentionPreferences(
  preferences: ActivityRetentionPreferences,
): EditorProjectCollaborationActivityRetentionPreferences {
  return {
    preset: preferences.preset,
    autoPrune: preferences.autoPrune,
  };
}

function toActivityRetentionPreferencesFromPersistedEntry(
  entry?: EditorProjectCollaborationActivityRetentionPreferences,
): ActivityRetentionPreferences {
  if (!entry) {
    return { ...DEFAULT_ACTIVITY_RETENTION_PREFERENCES };
  }
  return {
    preset: isActivityRetentionPreset(entry.preset)
      ? entry.preset
      : DEFAULT_ACTIVITY_RETENTION_PREFERENCES.preset,
    autoPrune: typeof entry.autoPrune === 'boolean'
      ? entry.autoPrune
      : DEFAULT_ACTIVITY_RETENTION_PREFERENCES.autoPrune,
  };
}

function isCollabActiveTab(value: unknown): value is CollabState['activeTab'] {
  return value === 'users' || value === 'comments' || value === 'versions' || value === 'activity';
}

function isCommentFilter(value: unknown): value is CollabState['commentFilter'] {
  return value === 'all' || value === 'open' || value === 'resolved';
}

function isActivityActionFilter(value: unknown): value is ActivityActionFilter {
  return value === 'all' || value === 'comments' || value === 'versions' || value === 'other';
}

function toPersistedPanelPreferences(
  state: Pick<CollabState, 'activeTab' | 'commentFilter' | 'activityActionFilter' | 'activitySearchQuery'>,
): EditorProjectCollaborationPanelPreferences {
  return {
    activeTab: state.activeTab,
    commentFilter: state.commentFilter,
    activityActionFilter: state.activityActionFilter,
    activitySearchQuery: state.activitySearchQuery,
  };
}

function toPanelPreferencesFromPersistedEntry(
  entry?: EditorProjectCollaborationPanelPreferences,
): Pick<CollabState, 'activeTab' | 'commentFilter' | 'activityActionFilter' | 'activitySearchQuery'> {
  return {
    activeTab: isCollabActiveTab(entry?.activeTab) ? entry.activeTab : 'comments',
    commentFilter: isCommentFilter(entry?.commentFilter) ? entry.commentFilter : 'all',
    activityActionFilter: isActivityActionFilter(entry?.activityActionFilter) ? entry.activityActionFilter : 'all',
    activitySearchQuery: typeof entry?.activitySearchQuery === 'string' ? entry.activitySearchQuery : '',
  };
}

function getIdentityProfileKey(userId?: string, displayName?: string): string | null {
  const normalizedUserId = userId?.trim();
  if (normalizedUserId) {
    return `id:${normalizedUserId}`;
  }

  const normalizedName = displayName?.trim().toLowerCase();
  if (normalizedName) {
    return `name:${normalizedName}`;
  }

  return null;
}

function mergeIdentityProfile(
  profiles: Record<string, CollaboratorIdentityProfile>,
  incoming: CollaboratorIdentityProfile,
): Record<string, CollaboratorIdentityProfile> {
  const normalizedDisplayName = incoming.displayName.trim();
  const profile: CollaboratorIdentityProfile = {
    ...incoming,
    displayName: normalizedDisplayName || incoming.userId || 'Unknown User',
  };

  const keys = [
    getIdentityProfileKey(profile.userId, profile.displayName),
    getIdentityProfileKey(undefined, profile.displayName),
  ].filter((key): key is string => Boolean(key));

  if (keys.length === 0) {
    return profiles;
  }

  const nextProfiles = { ...profiles };
  keys.forEach((key) => {
    const existing = nextProfiles[key];
    nextProfiles[key] = {
      ...existing,
      ...profile,
      displayName: profile.displayName || existing?.displayName || 'Unknown User',
    };
  });

  return nextProfiles;
}

function buildIdentityProfilesFromVersions(
  versions: ProjectVersion[],
): Record<string, CollaboratorIdentityProfile> {
  return versions.reduce<Record<string, CollaboratorIdentityProfile>>((profiles, version) => {
    const createdByProfile = version.createdByProfile;
    const displayName = createdByProfile?.displayName || version.createdBy;
    if (!displayName) {
      return profiles;
    }

    return mergeIdentityProfile(profiles, {
      userId: createdByProfile?.userId,
      displayName,
      avatarUrl: createdByProfile?.avatarUrl,
      color: createdByProfile?.color,
    });
  }, {});
}

function buildIdentityProfilesFromOnlineUsers(users: CollabUser[]): Record<string, CollaboratorIdentityProfile> {
  return users.reduce<Record<string, CollaboratorIdentityProfile>>((profiles, user) => {
    return mergeIdentityProfile(profiles, {
      userId: user.id,
      displayName: user.name,
      avatarUrl: user.avatar,
      color: user.color,
    });
  }, {});
}

function buildIdentityProfilesFromReactions(
  reactions: CollabReaction[],
  existingProfiles: Record<string, CollaboratorIdentityProfile>,
): Record<string, CollaboratorIdentityProfile> {
  return reactions.reduce<Record<string, CollaboratorIdentityProfile>>((profiles, reaction) => {
    const profilesFromMetadata = (reaction.actorProfiles ?? []).reduce<Record<string, CollaboratorIdentityProfile>>(
      (reactionProfiles, actorProfile) => mergeIdentityProfile(reactionProfiles, actorProfile),
      profiles,
    );

    return reaction.userIds.reduce<Record<string, CollaboratorIdentityProfile>>((reactionProfiles, userId) => {
      if (reactionProfiles[`id:${userId}`]) {
        return reactionProfiles;
      }
      const fallbackProfile = existingProfiles[`id:${userId}`];
      if (!fallbackProfile) {
        return reactionProfiles;
      }
      return mergeIdentityProfile(reactionProfiles, fallbackProfile);
    }, profilesFromMetadata);
  }, existingProfiles);
}

function buildIdentityProfilesFromComments(
  comments: CollabComment[],
  existingProfiles: Record<string, CollaboratorIdentityProfile>,
): Record<string, CollaboratorIdentityProfile> {
  return comments.reduce<Record<string, CollaboratorIdentityProfile>>((profiles, comment) => {
    const withCommentAuthor = mergeIdentityProfile(profiles, {
      userId: comment.userId,
      displayName: comment.userName,
    });

    const withReplyAuthors = comment.replies.reduce<Record<string, CollaboratorIdentityProfile>>(
      (replyProfiles, reply) => mergeIdentityProfile(replyProfiles, {
        userId: reply.userId,
        displayName: reply.userName,
      }),
      withCommentAuthor,
    );

    return buildIdentityProfilesFromReactions(comment.reactions, withReplyAuthors);
  }, existingProfiles);
}

async function persistCollaborationStateToRepository(
  projectId: string | null,
  activityFeed: ActivityEntry[],
  activityRetentionPreferences: ActivityRetentionPreferences,
  panelPreferences: Pick<CollabState, 'activeTab' | 'commentFilter' | 'activityActionFilter' | 'activitySearchQuery'>,
): Promise<void> {
  if (!projectId) return;
  const project = await getProjectFromRepository(projectId);
  if (!project) return;
  const versionHistory = getPersistableVersions().map(toPersistedVersionHistoryEntry);
  const collaborationComments = getPersistableComments().map(toPersistedCollaborationCommentEntry);
  const collaborationActivityFeed = activityFeed.map(toPersistedActivityEntry);
  await saveProjectToRepository({
    ...project,
    versionHistory,
    collaborationComments,
    collaborationActivityFeed,
    collaborationActivityRetentionPreferences: toPersistedActivityRetentionPreferences(activityRetentionPreferences),
    collaborationPanelPreferences: toPersistedPanelPreferences(panelPreferences),
  });
}

const initialVersionRetentionPreferences = loadVersionRetentionPreferences();
const initialActivityRetentionPreferences = loadActivityRetentionPreferences();
collabEngine.setVersionRetentionPreferences(initialVersionRetentionPreferences);
// ─── Initial State ──────────────────────────────────────────────────────────

const initialComments = collabEngine.getComments();
const initialIdentityProfiles = buildIdentityProfilesFromComments(
  initialComments,
  buildIdentityProfilesFromOnlineUsers(collabEngine.getOnlineUsers()),
);

const INITIAL_STATE: CollabState = {
  projectId: null,
  connected: false,
  currentUserId: 'u_self',
  currentUserName: 'You',
  currentUserAvatar: undefined,
  identityProfiles: initialIdentityProfiles,
  onlineUsers: collabEngine.getOnlineUsers(),
  comments: initialComments,
  versions: collabEngine.getVersions(),
  activeTab: 'comments',
  selectedCommentId: null,
  commentFilter: 'all',
  activityActionFilter: 'all',
  activitySearchQuery: '',
  versionRetentionPreferences: initialVersionRetentionPreferences,
  activityRetentionPreferences: initialActivityRetentionPreferences,
  activityFeed: applyActivityRetention(DEMO_ACTIVITY, initialActivityRetentionPreferences),
};

// ─── Store ──────────────────────────────────────────────────────────────────

export const useCollabStore = create<CollabState & CollabActions>()(
  devtools(
    immer((set, get) => ({
      // Initial state
      ...INITIAL_STATE,

      // Connection
      connect: (projectId, userId, profile) => {
        const connectRequestToken = `${projectId}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
        collabEngine.connect(projectId, userId, profile);
        set((s) => {
          const onlineUsers = collabEngine.getOnlineUsers();
          const comments = collabEngine.getComments();
          const connectedUser = onlineUsers.find((candidate) => candidate.id === userId);
          const profileDisplayName = profile?.name?.trim() || connectedUser?.name || s.currentUserName;
          const profileAvatar = profile?.avatar || connectedUser?.avatar;
          s.projectId = projectId;
          s.connected = true;
          s.currentUserId = userId;
          s.currentUserName = profileDisplayName;
          s.currentUserAvatar = profileAvatar;
          s.onlineUsers = onlineUsers;
          s.comments = comments;
          s.identityProfiles = mergeIdentityProfile(
            buildIdentityProfilesFromComments(
              comments,
              {
                ...s.identityProfiles,
                ...buildIdentityProfilesFromOnlineUsers(onlineUsers),
              },
            ),
            {
              userId,
              displayName: profileDisplayName,
              avatarUrl: profileAvatar,
              color: connectedUser?.color,
            },
          );
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
            const persistedComments = (project.collaborationComments ?? []).map(toCollabCommentFromPersistedEntry);
            const persistedActivityFeed = (project.collaborationActivityFeed ?? []).map(toActivityEntryFromPersistedEntry);
            const persistedActivityRetentionPreferences = toActivityRetentionPreferencesFromPersistedEntry(
              project.collaborationActivityRetentionPreferences,
            );
            const persistedPanelPreferences = toPanelPreferencesFromPersistedEntry(project.collaborationPanelPreferences);
            collabEngine.hydrateVersions(persistedVersions);
            collabEngine.hydrateComments(persistedComments);
            set((s) => {
              if (!s.connected || s.projectId !== projectId) return;
              const versions = collabEngine.getVersions();
              const comments = collabEngine.getComments();
              s.versions = versions;
              s.comments = comments;
              s.activeTab = persistedPanelPreferences.activeTab;
              s.commentFilter = persistedPanelPreferences.commentFilter;
              s.activityActionFilter = persistedPanelPreferences.activityActionFilter;
              s.activitySearchQuery = persistedPanelPreferences.activitySearchQuery;
              s.activityRetentionPreferences = persistedActivityRetentionPreferences;
              s.activityFeed = applyActivityRetention(persistedActivityFeed, persistedActivityRetentionPreferences);
              s.identityProfiles = {
                ...s.identityProfiles,
                ...buildIdentityProfilesFromComments(comments, s.identityProfiles),
                ...buildIdentityProfilesFromVersions(versions),
              };
            }, false, `collab/hydrateVersions/${connectRequestToken}`);
            persistActivityRetentionPreferences(persistedActivityRetentionPreferences);
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
      setActiveTab: (tab) => {
        set((s) => { s.activeTab = tab; }, false, 'collab/setActiveTab');
        void persistCollaborationStateToRepository(
          get().projectId,
          get().activityFeed,
          get().activityRetentionPreferences,
          get(),
        ).catch((error) => {
          console.error('Failed to persist collaboration panel preferences', error);
        });
      },
      setCommentFilter: (filter) => {
        set((s) => { s.commentFilter = filter; }, false, 'collab/setCommentFilter');
        void persistCollaborationStateToRepository(
          get().projectId,
          get().activityFeed,
          get().activityRetentionPreferences,
          get(),
        ).catch((error) => {
          console.error('Failed to persist collaboration panel preferences', error);
        });
      },
      setActivityActionFilter: (filter) => {
        set((s) => { s.activityActionFilter = filter; }, false, 'collab/setActivityActionFilter');
        void persistCollaborationStateToRepository(
          get().projectId,
          get().activityFeed,
          get().activityRetentionPreferences,
          get(),
        ).catch((error) => {
          console.error('Failed to persist collaboration panel preferences', error);
        });
      },
      setActivitySearchQuery: (query) => {
        set((s) => { s.activitySearchQuery = query; }, false, 'collab/setActivitySearchQuery');
        void persistCollaborationStateToRepository(
          get().projectId,
          get().activityFeed,
          get().activityRetentionPreferences,
          get(),
        ).catch((error) => {
          console.error('Failed to persist collaboration panel preferences', error);
        });
      },
      selectComment: (id) => set((s) => { s.selectedCommentId = id; }, false, 'collab/selectComment'),

      // Comments
      addComment: (frame, trackId, text) => {
        collabEngine.addComment(frame, trackId, text);
        set((s) => {
          const comments = collabEngine.getComments();
          s.comments = comments;
          s.identityProfiles = buildIdentityProfilesFromComments(comments, s.identityProfiles);
        }, false, 'collab/addComment');
        get().addActivity(get().currentUserName, 'added comment', `"${text.slice(0, 40)}${text.length > 40 ? '...' : ''}"`, get().currentUserId);
        void persistCollaborationStateToRepository(get().projectId, get().activityFeed, get().activityRetentionPreferences, get()).catch((error) => {
          console.error('Failed to persist collaboration comments', error);
        });
      },

      replyToComment: (commentId, text) => {
        collabEngine.replyToComment(commentId, text);
        set((s) => {
          const comments = collabEngine.getComments();
          s.comments = comments;
          s.identityProfiles = buildIdentityProfilesFromComments(comments, s.identityProfiles);
        }, false, 'collab/replyToComment');
        get().addActivity(get().currentUserName, 'replied to comment', `"${text.slice(0, 40)}${text.length > 40 ? '...' : ''}"`, get().currentUserId);
        void persistCollaborationStateToRepository(get().projectId, get().activityFeed, get().activityRetentionPreferences, get()).catch((error) => {
          console.error('Failed to persist collaboration comments', error);
        });
      },

      resolveComment: (commentId) => {
        collabEngine.resolveComment(commentId);
        set((s) => {
          const comments = collabEngine.getComments();
          s.comments = comments;
          s.identityProfiles = buildIdentityProfilesFromComments(comments, s.identityProfiles);
        }, false, 'collab/resolveComment');
        get().addActivity(get().currentUserName, 'resolved comment', `Comment ${commentId}`, get().currentUserId);
        void persistCollaborationStateToRepository(get().projectId, get().activityFeed, get().activityRetentionPreferences, get()).catch((error) => {
          console.error('Failed to persist collaboration comments', error);
        });
      },

      reopenComment: (commentId) => {
        collabEngine.reopenComment(commentId);
        set((s) => {
          const comments = collabEngine.getComments();
          s.comments = comments;
          s.identityProfiles = buildIdentityProfilesFromComments(comments, s.identityProfiles);
        }, false, 'collab/reopenComment');
        get().addActivity(get().currentUserName, 'reopened comment', `Comment ${commentId}`, get().currentUserId);
        void persistCollaborationStateToRepository(get().projectId, get().activityFeed, get().activityRetentionPreferences, get()).catch((error) => {
          console.error('Failed to persist collaboration comments', error);
        });
      },

      addReaction: (commentId, emoji) => {
        collabEngine.addReaction(commentId, emoji);
        set((s) => {
          const comments = collabEngine.getComments();
          s.comments = comments;
          s.identityProfiles = buildIdentityProfilesFromComments(comments, s.identityProfiles);
        }, false, 'collab/addReaction');
        void persistCollaborationStateToRepository(get().projectId, get().activityFeed, get().activityRetentionPreferences, get()).catch((error) => {
          console.error('Failed to persist collaboration comments', error);
        });
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
          const versions = collabEngine.getVersions();
          s.versions = versions;
          s.identityProfiles = {
            ...s.identityProfiles,
            ...buildIdentityProfilesFromVersions(versions),
          };
        }, false, 'collab/saveVersion');
        get().addActivity(get().currentUserName, 'saved version', `"${name}"`, get().currentUserId);
        void persistCollaborationStateToRepository(get().projectId, get().activityFeed, get().activityRetentionPreferences, get()).catch((error) => {
          console.error('Failed to persist collaboration state', error);
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
          const versions = collabEngine.getVersions();
          s.versions = versions;
          s.identityProfiles = {
            ...s.identityProfiles,
            ...buildIdentityProfilesFromVersions(versions),
          };
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
          get().addActivity(get().currentUserName, 'restored version', `"${version.name}"`, get().currentUserId);
          void persistCollaborationStateToRepository(get().projectId, get().activityFeed, get().activityRetentionPreferences, get()).catch((error) => {
            console.error('Failed to persist collaboration state', error);
          });
          return;
        }

        get().addActivity(
          get().currentUserName,
          'restore unavailable',
          `"${version.name}" does not contain a restorable project snapshot.`,
          get().currentUserId,
        );
        void persistCollaborationStateToRepository(get().projectId, get().activityFeed, get().activityRetentionPreferences, get()).catch((error) => {
          console.error('Failed to persist collaboration state', error);
        });
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
        void persistCollaborationStateToRepository(get().projectId, get().activityFeed, get().activityRetentionPreferences, get()).catch((error) => {
          console.error('Failed to persist collaboration state', error);
        });
      },
      setActivityRetentionPreferences: (preferences) => {
        const mergedPreferences = {
          ...get().activityRetentionPreferences,
          ...preferences,
        };
        persistActivityRetentionPreferences(mergedPreferences);
        set((s) => {
          s.activityRetentionPreferences = mergedPreferences;
          s.activityFeed = applyActivityRetention(s.activityFeed, mergedPreferences);
        }, false, 'collab/setActivityRetentionPreferences');
        void persistCollaborationStateToRepository(get().projectId, get().activityFeed, mergedPreferences, get()).catch((error) => {
          console.error('Failed to persist collaboration state', error);
        });
      },

      // Sync
      refreshFromEngine: () => set((s) => {
        const onlineUsers = collabEngine.getOnlineUsers();
        const comments = collabEngine.getComments();
        s.onlineUsers = onlineUsers;
        s.comments = comments;
        s.versions = collabEngine.getVersions();
        s.identityProfiles = {
          ...buildIdentityProfilesFromComments(comments, s.identityProfiles),
          ...buildIdentityProfilesFromOnlineUsers(onlineUsers),
          ...buildIdentityProfilesFromVersions(s.versions),
        };
      }, false, 'collab/refreshFromEngine'),

      // Activity
      addActivity: (user, action, detail, userId) => set((s) => {
        const nextFeed = [
          {
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          user,
          userId,
          action,
          timestamp: Date.now(),
          detail,
          },
          ...s.activityFeed,
        ];
        s.activityFeed = applyActivityRetention(nextFeed, s.activityRetentionPreferences);
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
          activityRetentionPreferences: get().activityRetentionPreferences,
          identityProfiles: get().identityProfiles,
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
export const selectActivityActionFilter = (state: CollabStoreState) => state.activityActionFilter;
export const selectActivitySearchQuery = (state: CollabStoreState) => state.activitySearchQuery;
export const selectVersionRetentionPreferences = (state: CollabStoreState) => state.versionRetentionPreferences;
export const selectActivityRetentionPreferences = (state: CollabStoreState) => state.activityRetentionPreferences;
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
