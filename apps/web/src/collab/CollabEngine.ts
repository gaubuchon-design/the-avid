// ─── Collaboration Engine ────────────────────────────────────────────────────
// Real-time collaboration stubs: presence, comments/threads, reactions,
// and project versioning. Seeded with demo data for immediate UI testing.

// ─── Types ──────────────────────────────────────────────────────────────────

import type { EditorProject } from '@mcua/core';

export interface CollabUser {
  id: string;
  name: string;
  avatar?: string;
  color: string;
  cursorFrame: number;
  cursorTrackId: string | null;
  isOnline: boolean;
}

export interface CollabReply {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
}

export interface CollabComment {
  id: string;
  userId: string;
  userName: string;
  frame: number;
  trackId?: string;
  text: string;
  timestamp: number;
  resolved: boolean;
  replies: CollabReply[];
  reactions: { emoji: string; userIds: string[] }[];
}

export interface ProjectVersion {
  id: string;
  name: string;
  createdAt: number;
  createdBy: string;
  description: string;
  kind: 'demo' | 'restore-point';
  retentionPolicy: 'fixture' | 'manual' | 'session';
  snapshotSummary: ProjectVersionSnapshotSummary | null;
  compareSummary: ProjectVersionCompareSummary | null;
  compareBaselineName: string | null;
  compareMetrics: ProjectVersionCompareMetric[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- snapshot is an opaque serialized project blob
  snapshotData: any;
}

export interface ProjectVersionSnapshotSummary {
  trackCount: number;
  clipCount: number;
  binCount: number;
  duration: number;
}

export interface ProjectVersionCompareSummary {
  trackDelta: number;
  clipDelta: number;
  binDelta: number;
  durationDelta: number;
}

export interface ProjectVersionCompareMetric {
  label: string;
  previousValue: string;
  currentValue: string;
}

export type VersionRetentionPreset = 'keep-all' | 'last-10' | 'last-25' | 'last-50';

export interface VersionRetentionPreferences {
  preset: VersionRetentionPreset;
  autoPrune: boolean;
}

export const DEFAULT_VERSION_RETENTION_PREFERENCES: VersionRetentionPreferences = {
  preset: 'last-25',
  autoPrune: true,
};

type Subscriber = () => void;

// ─── Demo data ──────────────────────────────────────────────────────────────

const DEMO_USERS: CollabUser[] = [
  {
    id: 'u1',
    name: 'Sarah K.',
    color: '#7c5cfc',
    cursorFrame: 120,
    cursorTrackId: 't1',
    isOnline: true,
  },
  {
    id: 'u2',
    name: 'Marcus T.',
    color: '#2bb672',
    cursorFrame: 456,
    cursorTrackId: 't3',
    isOnline: true,
  },
];

const now = Date.now();

const DEMO_COMMENTS: CollabComment[] = [
  {
    id: 'cmt1',
    userId: 'u1',
    userName: 'Sarah K.',
    frame: 102,
    trackId: 't1',
    text: 'The transition here feels abrupt. Can we try a 12-frame dissolve?',
    timestamp: now - 3600000 * 2, // 2 hours ago
    resolved: false,
    replies: [
      {
        id: 'reply1',
        userId: 'u2',
        userName: 'Marcus T.',
        text: 'Good call. I\'ll add a cross-dissolve effect.',
        timestamp: now - 3600000 * 1.5,
      },
    ],
    reactions: [
      { emoji: '👍', userIds: ['u2'] },
    ],
  },
  {
    id: 'cmt2',
    userId: 'u2',
    userName: 'Marcus T.',
    frame: 340,
    trackId: 't3',
    text: 'Audio level is too hot here. Dialogue peaks at -6dB, needs to come down to -12.',
    timestamp: now - 3600000, // 1 hour ago
    resolved: false,
    replies: [],
    reactions: [],
  },
  {
    id: 'cmt3',
    userId: 'u1',
    userName: 'Sarah K.',
    frame: 550,
    trackId: 't1',
    text: 'Love this shot! Let\'s extend it by 2 seconds for the emotional beat.',
    timestamp: now - 1800000, // 30 min ago
    resolved: true,
    replies: [
      {
        id: 'reply2',
        userId: 'u1',
        userName: 'Sarah K.',
        text: 'Done. Extended to 4.5s and it flows much better now.',
        timestamp: now - 900000,
      },
    ],
    reactions: [
      { emoji: '❤️', userIds: ['u1', 'u2'] },
      { emoji: '✨', userIds: ['u1'] },
    ],
  },
];

const DEMO_VERSIONS: ProjectVersion[] = [
  {
    id: 'v1',
    name: 'First Assembly',
    createdAt: now - 86400000 * 2, // 2 days ago
    createdBy: 'Sarah K.',
    description: 'Initial rough cut with all scenes assembled in order.',
    kind: 'demo',
    retentionPolicy: 'fixture',
    snapshotSummary: {
      trackCount: 6,
      clipCount: 8,
      binCount: 0,
      duration: 34,
    },
    compareSummary: null,
    compareBaselineName: null,
    compareMetrics: [],
    snapshotData: { tracks: 6, clips: 8, duration: 34 },
  },
  {
    id: 'v2',
    name: 'Director\'s Review Cut',
    createdAt: now - 86400000, // 1 day ago
    createdBy: 'Marcus T.',
    description: 'Tightened edit after director feedback. Removed 8s of dead air, added B-roll transitions.',
    kind: 'demo',
    retentionPolicy: 'fixture',
    snapshotSummary: {
      trackCount: 6,
      clipCount: 10,
      binCount: 0,
      duration: 28,
    },
    compareSummary: {
      trackDelta: 0,
      clipDelta: 2,
      binDelta: 0,
      durationDelta: -6,
    },
    compareBaselineName: 'First Assembly',
    compareMetrics: [
      { label: 'Tracks', previousValue: '6', currentValue: '6' },
      { label: 'Clips', previousValue: '8', currentValue: '10' },
      { label: 'Bins', previousValue: '0', currentValue: '0' },
      { label: 'Duration', previousValue: '34s', currentValue: '28s' },
    ],
    snapshotData: { tracks: 6, clips: 10, duration: 28 },
  },
];

function countBins(bins: unknown): number {
  if (!Array.isArray(bins)) {
    return 0;
  }

  return bins.reduce((count, bin) => {
    if (!bin || typeof bin !== 'object') {
      return count;
    }

    const candidate = bin as { children?: unknown };
    return count + 1 + countBins(candidate.children);
  }, 0);
}

function summarizeProjectVersionSnapshot(snapshotData: unknown): ProjectVersionSnapshotSummary | null {
  if (!snapshotData || typeof snapshotData !== 'object') {
    return null;
  }

  const candidate = snapshotData as {
    tracks?: unknown;
    bins?: unknown;
    duration?: unknown;
    clips?: unknown;
  };

  if (Array.isArray(candidate.tracks)) {
    const clipCount = candidate.tracks.reduce((count, track) => {
      if (!track || typeof track !== 'object') {
        return count;
      }

      const clipCandidate = track as { clips?: unknown[] };
      return count + (Array.isArray(clipCandidate.clips) ? clipCandidate.clips.length : 0);
    }, 0);
    const durationFromTracks = candidate.tracks.reduce((maxDuration, track) => {
      if (!track || typeof track !== 'object') {
        return maxDuration;
      }

      const clipCandidate = track as {
        clips?: Array<{ endTime?: unknown }>;
      };
      const trackEnd = Array.isArray(clipCandidate.clips)
        ? clipCandidate.clips.reduce((maxClipEnd, clip) => {
          return typeof clip?.endTime === 'number' ? Math.max(maxClipEnd, clip.endTime) : maxClipEnd;
        }, 0)
        : 0;

      return Math.max(maxDuration, trackEnd);
    }, 0);

    return {
      trackCount: candidate.tracks.length,
      clipCount,
      binCount: countBins(candidate.bins),
      duration: typeof candidate.duration === 'number' ? candidate.duration : durationFromTracks,
    };
  }

  if (
    typeof candidate.tracks === 'number'
    && typeof candidate.clips === 'number'
    && typeof candidate.duration === 'number'
  ) {
    return {
      trackCount: candidate.tracks,
      clipCount: candidate.clips,
      binCount: 0,
      duration: candidate.duration,
    };
  }

  return null;
}

function buildVersionCompareSummary(
  snapshotSummary: ProjectVersionSnapshotSummary | null,
  previousSummary: ProjectVersionSnapshotSummary | null,
): ProjectVersionCompareSummary | null {
  if (!snapshotSummary || !previousSummary) {
    return null;
  }

  return {
    trackDelta: snapshotSummary.trackCount - previousSummary.trackCount,
    clipDelta: snapshotSummary.clipCount - previousSummary.clipCount,
    binDelta: snapshotSummary.binCount - previousSummary.binCount,
    durationDelta: snapshotSummary.duration - previousSummary.duration,
  };
}

function formatDurationMetric(duration: number): string {
  return Number.isInteger(duration) ? `${duration}s` : `${duration.toFixed(2)}s`;
}

function isEditorProjectSnapshot(snapshotData: unknown): snapshotData is Pick<
  EditorProject,
  'tracks' | 'bins' | 'editorialState' | 'workstationState'
> {
  if (!snapshotData || typeof snapshotData !== 'object') {
    return false;
  }

  const candidate = snapshotData as Partial<EditorProject>;
  return (
    Array.isArray(candidate.tracks)
    && Array.isArray(candidate.bins)
    && typeof candidate.editorialState === 'object'
    && candidate.editorialState !== null
    && typeof candidate.workstationState === 'object'
    && candidate.workstationState !== null
  );
}

function buildVersionCompareMetrics(
  snapshotData: unknown,
  previousSnapshotData: unknown,
): ProjectVersionCompareMetric[] {
  const snapshotSummary = summarizeProjectVersionSnapshot(snapshotData);
  const previousSummary = summarizeProjectVersionSnapshot(previousSnapshotData);
  const metrics: ProjectVersionCompareMetric[] = [];

  if (snapshotSummary && previousSummary) {
    metrics.push(
      {
        label: 'Tracks',
        previousValue: String(previousSummary.trackCount),
        currentValue: String(snapshotSummary.trackCount),
      },
      {
        label: 'Clips',
        previousValue: String(previousSummary.clipCount),
        currentValue: String(snapshotSummary.clipCount),
      },
      {
        label: 'Bins',
        previousValue: String(previousSummary.binCount),
        currentValue: String(snapshotSummary.binCount),
      },
      {
        label: 'Duration',
        previousValue: formatDurationMetric(previousSummary.duration),
        currentValue: formatDurationMetric(snapshotSummary.duration),
      },
    );
  }

  if (isEditorProjectSnapshot(snapshotData) && isEditorProjectSnapshot(previousSnapshotData)) {
    metrics.push(
      {
        label: 'Workspace',
        previousValue: previousSnapshotData.workstationState.activeWorkspaceId,
        currentValue: snapshotData.workstationState.activeWorkspaceId,
      },
      {
        label: 'Composer',
        previousValue: previousSnapshotData.workstationState.composerLayout,
        currentValue: snapshotData.workstationState.composerLayout,
      },
      {
        label: 'Selected bin',
        previousValue: previousSnapshotData.editorialState.selectedBinId ?? 'none',
        currentValue: snapshotData.editorialState.selectedBinId ?? 'none',
      },
      {
        label: 'Target tracks',
        previousValue: String(previousSnapshotData.editorialState.enabledTrackIds.length),
        currentValue: String(snapshotData.editorialState.enabledTrackIds.length),
      },
      {
        label: 'Sync locks',
        previousValue: String(previousSnapshotData.editorialState.syncLockedTrackIds.length),
        currentValue: String(snapshotData.editorialState.syncLockedTrackIds.length),
      },
    );
  }

  return metrics;
}

// ─── Engine ─────────────────────────────────────────────────────────────────

export class CollabEngine {
  private users: Map<string, CollabUser>;
  private comments: CollabComment[];
  private versions: ProjectVersion[];
  private currentUserId = 'u_self';
  private currentUserName = 'You';
  private subscribers: Set<Subscriber> = new Set();
  private connected = false;
  private versionRetentionPreferences: VersionRetentionPreferences = {
    ...DEFAULT_VERSION_RETENTION_PREFERENCES,
  };

  constructor() {
    this.users = new Map(DEMO_USERS.map(u => [u.id, { ...u }]));
    this.comments = DEMO_COMMENTS.map(c => ({
      ...c,
      replies: c.replies.map(r => ({ ...r })),
      reactions: c.reactions.map(r => ({ ...r, userIds: [...r.userIds] })),
    }));
    this.versions = DEMO_VERSIONS.map(v => ({ ...v, compareMetrics: [...v.compareMetrics] }));
  }

  // ── Connection ──────────────────────────────────────────────────────────

  connect(projectId: string, userId: string): void {
    this.currentUserId = userId;
    this.connected = true;

    // Add self to users if not present
    if (!this.users.has(userId)) {
      this.users.set(userId, {
        id: userId,
        name: this.currentUserName,
        color: '#f59e0b',
        cursorFrame: 0,
        cursorTrackId: null,
        isOnline: true,
      });
    }

    this.notify();
  }

  disconnect(): void {
    this.connected = false;
    const self = this.users.get(this.currentUserId);
    if (self) self.isOnline = false;
    this.notify();
  }

  isConnected(): boolean {
    return this.connected;
  }

  getCurrentUserId(): string {
    return this.currentUserId;
  }

  // ── Presence ────────────────────────────────────────────────────────────

  updateCursor(frame: number, trackId: string | null): void {
    const self = this.users.get(this.currentUserId);
    if (self) {
      self.cursorFrame = frame;
      self.cursorTrackId = trackId;
      this.notify();
    }
  }

  getOnlineUsers(): CollabUser[] {
    return Array.from(this.users.values()).filter(u => u.isOnline);
  }

  getAllUsers(): CollabUser[] {
    return Array.from(this.users.values());
  }

  // ── Comments ────────────────────────────────────────────────────────────

  addComment(frame: number, trackId: string | null, text: string): CollabComment {
    const comment: CollabComment = {
      id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: this.currentUserId,
      userName: this.currentUserName,
      frame,
      trackId: trackId ?? undefined,
      text,
      timestamp: Date.now(),
      resolved: false,
      replies: [],
      reactions: [],
    };
    this.comments.unshift(comment);
    this.notify();
    return comment;
  }

  replyToComment(commentId: string, text: string): CollabReply {
    const reply: CollabReply = {
      id: `reply_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: this.currentUserId,
      userName: this.currentUserName,
      text,
      timestamp: Date.now(),
    };
    const comment = this.comments.find(c => c.id === commentId);
    if (comment) {
      comment.replies.push(reply);
      this.notify();
    }
    return reply;
  }

  resolveComment(commentId: string): void {
    const comment = this.comments.find(c => c.id === commentId);
    if (comment) {
      comment.resolved = true;
      this.notify();
    }
  }

  reopenComment(commentId: string): void {
    const comment = this.comments.find(c => c.id === commentId);
    if (comment) {
      comment.resolved = false;
      this.notify();
    }
  }

  addReaction(commentId: string, emoji: string): void {
    const comment = this.comments.find(c => c.id === commentId);
    if (!comment) return;

    const existing = comment.reactions.find(r => r.emoji === emoji);
    if (existing) {
      if (existing.userIds.includes(this.currentUserId)) {
        // Remove reaction
        existing.userIds = existing.userIds.filter(id => id !== this.currentUserId);
        if (existing.userIds.length === 0) {
          comment.reactions = comment.reactions.filter(r => r.emoji !== emoji);
        }
      } else {
        existing.userIds.push(this.currentUserId);
      }
    } else {
      comment.reactions.push({ emoji, userIds: [this.currentUserId] });
    }
    this.notify();
  }

  getComments(): CollabComment[] {
    return [...this.comments];
  }

  getCommentsAtFrame(frame: number): CollabComment[] {
    // Return comments within +/- 12 frames of the target
    const tolerance = 12;
    return this.comments.filter(c =>
      Math.abs(c.frame - frame) <= tolerance,
    );
  }

  // ── Versions ────────────────────────────────────────────────────────────

  saveVersion(
    name: string,
    description: string,
    snapshotData?: unknown,
    options?: { retentionPolicy?: 'manual' | 'session' },
  ): ProjectVersion {
    const effectiveSnapshot = snapshotData ?? { tracks: 6, clips: 8, duration: 34, timestamp: Date.now() };
    const snapshotSummary = summarizeProjectVersionSnapshot(effectiveSnapshot);
    const previousVersion = this.versions.find((version) => version.snapshotSummary) ?? null;
    const previousSummary = previousVersion?.snapshotSummary ?? null;
    const version: ProjectVersion = {
      id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      createdAt: Date.now(),
      createdBy: this.currentUserName,
      description,
      kind: 'restore-point',
      retentionPolicy: options?.retentionPolicy ?? 'manual',
      snapshotSummary,
      compareSummary: buildVersionCompareSummary(snapshotSummary, previousSummary),
      compareBaselineName: previousVersion?.name ?? null,
      compareMetrics: buildVersionCompareMetrics(effectiveSnapshot, previousVersion?.snapshotData ?? null),
      snapshotData: effectiveSnapshot,
    };
    this.versions.unshift(version);
    this.applyVersionRetention();
    this.notify();
    return version;
  }

  getVersions(): ProjectVersion[] {
    return this.versions.map((version) => ({
      ...version,
      compareMetrics: [...version.compareMetrics],
    }));
  }

  getVersionRetentionPreferences(): VersionRetentionPreferences {
    return { ...this.versionRetentionPreferences };
  }

  setVersionRetentionPreferences(preferences: VersionRetentionPreferences): void {
    this.versionRetentionPreferences = { ...preferences };
    this.applyVersionRetention();
    this.notify();
  }

  restoreVersion(versionId: string): ProjectVersion | null {
    const version = this.versions.find(v => v.id === versionId);
    if (version) {
      // Snapshot application happens in the editor store; the engine resolves
      // the selected version and emits a change for the collaboration UI.
      console.debug(`[CollabEngine] Restoring version: ${version.name}`);
      this.notify();
      return { ...version, compareMetrics: [...version.compareMetrics] };
    }
    return null;
  }

  // ── Subscriptions ───────────────────────────────────────────────────────

  subscribe(cb: Subscriber): () => void {
    this.subscribers.add(cb);
    return () => { this.subscribers.delete(cb); };
  }

  private notify(): void {
    this.subscribers.forEach(cb => {
      try { cb(); } catch (err) {
        console.error('[CollabEngine] Listener error:', err);
      }
    });
  }

  private applyVersionRetention(): void {
    if (!this.versionRetentionPreferences.autoPrune) return;
    const maxVersionCountByPreset: Record<Exclude<VersionRetentionPreset, 'keep-all'>, number> = {
      'last-10': 10,
      'last-25': 25,
      'last-50': 50,
    };
    if (this.versionRetentionPreferences.preset === 'keep-all') return;
    const maxVersionCount = maxVersionCountByPreset[this.versionRetentionPreferences.preset];
    if (this.versions.length <= maxVersionCount) return;
    this.versions = this.versions.slice(0, maxVersionCount);
  }
}

export const collabEngine = new CollabEngine();
