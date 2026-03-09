// ─── Collaboration Engine ────────────────────────────────────────────────────
// Real-time collaboration stubs: presence, comments/threads, reactions,
// and project versioning. Seeded with demo data for immediate UI testing.

// ─── Types ──────────────────────────────────────────────────────────────────

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
  snapshotData: any;
}

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
    snapshotData: { tracks: 6, clips: 8, duration: 34 },
  },
  {
    id: 'v2',
    name: 'Director\'s Review Cut',
    createdAt: now - 86400000, // 1 day ago
    createdBy: 'Marcus T.',
    description: 'Tightened edit after director feedback. Removed 8s of dead air, added B-roll transitions.',
    snapshotData: { tracks: 6, clips: 10, duration: 28 },
  },
];

// ─── Engine ─────────────────────────────────────────────────────────────────

export class CollabEngine {
  private users: Map<string, CollabUser>;
  private comments: CollabComment[];
  private versions: ProjectVersion[];
  private currentUserId = 'u_self';
  private currentUserName = 'You';
  private subscribers: Set<Subscriber> = new Set();
  private connected = false;

  constructor() {
    this.users = new Map(DEMO_USERS.map(u => [u.id, { ...u }]));
    this.comments = DEMO_COMMENTS.map(c => ({
      ...c,
      replies: c.replies.map(r => ({ ...r })),
      reactions: c.reactions.map(r => ({ ...r, userIds: [...r.userIds] })),
    }));
    this.versions = DEMO_VERSIONS.map(v => ({ ...v }));
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

  saveVersion(name: string, description: string): ProjectVersion {
    const version: ProjectVersion = {
      id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      createdAt: Date.now(),
      createdBy: this.currentUserName,
      description,
      snapshotData: { tracks: 6, clips: 8, duration: 34, timestamp: Date.now() },
    };
    this.versions.unshift(version);
    this.notify();
    return version;
  }

  getVersions(): ProjectVersion[] {
    return [...this.versions];
  }

  restoreVersion(versionId: string): void {
    const version = this.versions.find(v => v.id === versionId);
    if (version) {
      // In production, this would restore the timeline state from the snapshot
      console.log(`[CollabEngine] Restoring version: ${version.name}`);
      this.notify();
    }
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
}

export const collabEngine = new CollabEngine();
