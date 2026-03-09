// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Pro Tools Unified Live Session Bridge (PT-05)
//  Strategic P0: Real-time collaboration between Avid Editor and Pro Tools.
//  Supports session handshake, ripple propagation, marker sync (<500ms),
//  shared playhead, inline comments, CRDT reconciliation, co-presence.
// ═══════════════════════════════════════════════════════════════════════════

import type { EditorMarker, EditorProject } from '../project-library';

// ─── Types ─────────────────────────────────────────────────────────────────

export type SessionBridgeStatus =
  | 'disconnected'
  | 'handshaking'
  | 'connected'
  | 'syncing'
  | 'diverged'
  | 'error';

export type RippleEventType = 'splice' | 'overwrite' | 'lift' | 'extract' | 'trim' | 'slip';

export interface RippleEvent {
  id: string;
  type: RippleEventType;
  trackId: string;
  timeSeconds: number;
  durationDelta: number;
  clipId?: string;
  originApp: 'avid' | 'protools';
  timestamp: number;
  sequenceNumber: number;
}

export interface PlayheadState {
  timeSeconds: number;
  isPlaying: boolean;
  sourceApp: 'avid' | 'protools';
  timestamp: number;
}

export interface InlineComment {
  id: string;
  authorId: string;
  authorName: string;
  sourceApp: 'avid' | 'protools';
  timeSeconds: number;
  trackId?: string;
  body: string;
  createdAt: string;
  resolved: boolean;
}

export interface CoPresenceUser {
  userId: string;
  displayName: string;
  application: 'avid' | 'protools';
  color: string;
  playheadTimeSeconds: number;
  selectedTrackIds: string[];
  isOnline: boolean;
  lastActiveAt: string;
}

export interface CRDTOperation {
  id: string;
  type: 'insert' | 'delete' | 'update';
  path: string[];
  value: unknown;
  timestamp: number;
  lamportClock: number;
  originNode: string;
}

export interface SessionDivergence {
  divergedAt: string;
  avidOperations: CRDTOperation[];
  proToolsOperations: CRDTOperation[];
  conflictPaths: string[];
  autoResolvable: boolean;
}

export interface SessionBridgeConfig {
  mediaCentralProjectId: string;
  localUserId: string;
  localDisplayName: string;
  markerSyncLatencyMs: number;
  playheadSyncEnabled: boolean;
  ripplePropagationEnabled: boolean;
  commentSyncEnabled: boolean;
  crdtEnabled: boolean;
  heartbeatIntervalMs: number;
}

export interface SessionHandshakeResult {
  success: boolean;
  sessionId: string;
  mediaCentralProjectId: string;
  participants: CoPresenceUser[];
  syncState: 'in-sync' | 'diverged' | 'initializing';
  errors: string[];
}

// ─── Session Bridge ────────────────────────────────────────────────────────

export class ProToolsSessionBridge {
  private config: SessionBridgeConfig;
  private status: SessionBridgeStatus = 'disconnected';
  private sessionId: string | null = null;
  private participants: CoPresenceUser[] = [];
  private localPlayhead: PlayheadState = {
    timeSeconds: 0,
    isPlaying: false,
    sourceApp: 'avid',
    timestamp: Date.now(),
  };
  private remotePlayhead: PlayheadState | null = null;
  private rippleBuffer: RippleEvent[] = [];
  private comments: InlineComment[] = [];
  private crdtLog: CRDTOperation[] = [];
  private lamportClock = 0;
  private sequenceCounter = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor(config: Partial<SessionBridgeConfig> = {}) {
    this.config = {
      mediaCentralProjectId: config.mediaCentralProjectId ?? '',
      localUserId: config.localUserId ?? `user-${Date.now()}`,
      localDisplayName: config.localDisplayName ?? 'Editor',
      markerSyncLatencyMs: config.markerSyncLatencyMs ?? 500,
      playheadSyncEnabled: config.playheadSyncEnabled ?? true,
      ripplePropagationEnabled: config.ripplePropagationEnabled ?? true,
      commentSyncEnabled: config.commentSyncEnabled ?? true,
      crdtEnabled: config.crdtEnabled ?? true,
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 2000,
    };
  }

  // ─── Session Handshake ─────────────────────────────────────────────

  /**
   * Initiates session handshake via MediaCentral project ID.
   * Returns list of connected participants and initial sync state.
   */
  async handshake(mediaCentralProjectId?: string): Promise<SessionHandshakeResult> {
    if (mediaCentralProjectId) {
      this.config.mediaCentralProjectId = mediaCentralProjectId;
    }

    if (!this.config.mediaCentralProjectId) {
      return {
        success: false,
        sessionId: '',
        mediaCentralProjectId: '',
        participants: [],
        syncState: 'initializing',
        errors: ['MediaCentral project ID is required'],
      };
    }

    this.status = 'handshaking';
    this.emit('status:change', this.status);

    await this.simulateDelay(200);

    this.sessionId = `session-${this.config.mediaCentralProjectId}-${Date.now()}`;

    const localParticipant: CoPresenceUser = {
      userId: this.config.localUserId,
      displayName: this.config.localDisplayName,
      application: 'avid',
      color: '#5b6af5',
      playheadTimeSeconds: 0,
      selectedTrackIds: [],
      isOnline: true,
      lastActiveAt: new Date().toISOString(),
    };

    // Simulate discovering a PT participant
    const ptParticipant: CoPresenceUser = {
      userId: 'pt-mixer-01',
      displayName: 'PT Mixer',
      application: 'protools',
      color: '#7c5cfc',
      playheadTimeSeconds: 0,
      selectedTrackIds: [],
      isOnline: true,
      lastActiveAt: new Date().toISOString(),
    };

    this.participants = [localParticipant, ptParticipant];
    this.status = 'connected';
    this.startHeartbeat();

    const result: SessionHandshakeResult = {
      success: true,
      sessionId: this.sessionId,
      mediaCentralProjectId: this.config.mediaCentralProjectId,
      participants: [...this.participants],
      syncState: 'in-sync',
      errors: [],
    };

    this.emit('session:handshake', result);
    this.emit('status:change', this.status);
    return result;
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    this.status = 'disconnected';
    this.sessionId = null;
    this.participants = [];
    this.emit('status:change', this.status);
    this.emit('session:disconnected', {});
  }

  // ─── Ripple Propagation ────────────────────────────────────────────

  /**
   * Emits a ripple event to Pro Tools. Timeline edits (splice, overwrite,
   * lift, extract) propagate to the mix session.
   */
  emitRippleEvent(event: Omit<RippleEvent, 'id' | 'timestamp' | 'sequenceNumber' | 'originApp'>): void {
    if (!this.config.ripplePropagationEnabled || this.status !== 'connected') return;

    const rippleEvent: RippleEvent = {
      ...event,
      id: `ripple-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      originApp: 'avid',
      timestamp: Date.now(),
      sequenceNumber: ++this.sequenceCounter,
    };

    this.rippleBuffer.push(rippleEvent);
    this.emit('ripple:outgoing', rippleEvent);

    if (this.config.crdtEnabled) {
      this.appendCRDTOperation({
        type: 'update',
        path: ['timeline', 'tracks', event.trackId, 'clips'],
        value: event,
      });
    }
  }

  /**
   * Receives a ripple event from Pro Tools.
   */
  receiveRippleEvent(event: RippleEvent): void {
    if (!this.config.ripplePropagationEnabled) return;

    this.rippleBuffer.push(event);
    this.emit('ripple:incoming', event);
  }

  getRippleBuffer(): RippleEvent[] {
    return [...this.rippleBuffer];
  }

  clearRippleBuffer(): void {
    this.rippleBuffer = [];
  }

  // ─── Marker Sync (<500ms) ──────────────────────────────────────────

  /**
   * Syncs a marker change to the remote application within the latency target.
   */
  syncMarker(marker: EditorMarker, action: 'add' | 'update' | 'delete'): void {
    if (this.status !== 'connected') return;

    const payload = {
      markerId: marker.id,
      action,
      label: marker.label,
      timeSeconds: marker.time,
      color: marker.color,
      sourceApp: 'avid' as const,
      timestamp: Date.now(),
    };

    this.emit('marker:sync', payload);

    if (this.config.crdtEnabled) {
      this.appendCRDTOperation({
        type: action === 'delete' ? 'delete' : action === 'add' ? 'insert' : 'update',
        path: ['markers', marker.id],
        value: action === 'delete' ? null : marker,
      });
    }
  }

  // ─── Shared Playhead ───────────────────────────────────────────────

  /**
   * Updates the local playhead state and broadcasts to remote.
   */
  updatePlayhead(timeSeconds: number, isPlaying: boolean): void {
    if (!this.config.playheadSyncEnabled || this.status !== 'connected') return;

    this.localPlayhead = {
      timeSeconds,
      isPlaying,
      sourceApp: 'avid',
      timestamp: Date.now(),
    };

    this.emit('playhead:local', this.localPlayhead);

    // Update co-presence
    const localUser = this.participants.find((p) => p.userId === this.config.localUserId);
    if (localUser) {
      localUser.playheadTimeSeconds = timeSeconds;
      localUser.lastActiveAt = new Date().toISOString();
    }

    this.emit('presence:update', [...this.participants]);
  }

  /**
   * Receives a remote playhead update from Pro Tools.
   */
  receiveRemotePlayhead(state: PlayheadState): void {
    this.remotePlayhead = state;

    const remoteUser = this.participants.find((p) => p.application === 'protools');
    if (remoteUser) {
      remoteUser.playheadTimeSeconds = state.timeSeconds;
      remoteUser.lastActiveAt = new Date().toISOString();
    }

    this.emit('playhead:remote', state);
    this.emit('presence:update', [...this.participants]);
  }

  getRemotePlayhead(): PlayheadState | null {
    return this.remotePlayhead;
  }

  // ─── Inline Comments ───────────────────────────────────────────────

  /**
   * Adds an inline comment visible in both Avid and Pro Tools.
   */
  addComment(body: string, timeSeconds: number, trackId?: string): InlineComment {
    const comment: InlineComment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      authorId: this.config.localUserId,
      authorName: this.config.localDisplayName,
      sourceApp: 'avid',
      timeSeconds,
      trackId,
      body,
      createdAt: new Date().toISOString(),
      resolved: false,
    };

    this.comments.push(comment);
    this.emit('comment:added', comment);

    if (this.config.crdtEnabled) {
      this.appendCRDTOperation({
        type: 'insert',
        path: ['comments', comment.id],
        value: comment,
      });
    }

    return comment;
  }

  receiveComment(comment: InlineComment): void {
    this.comments.push(comment);
    this.emit('comment:received', comment);
  }

  resolveComment(commentId: string): void {
    const comment = this.comments.find((c) => c.id === commentId);
    if (comment) {
      comment.resolved = true;
      this.emit('comment:resolved', comment);
    }
  }

  getComments(): InlineComment[] {
    return [...this.comments];
  }

  // ─── Co-Presence ───────────────────────────────────────────────────

  getParticipants(): CoPresenceUser[] {
    return [...this.participants];
  }

  getOnlineParticipants(): CoPresenceUser[] {
    return this.participants.filter((p) => p.isOnline);
  }

  // ─── CRDT Reconciliation ───────────────────────────────────────────

  /**
   * Detects session divergence and attempts reconciliation.
   */
  detectDivergence(remoteOperations: CRDTOperation[]): SessionDivergence | null {
    if (!this.config.crdtEnabled) return null;

    const localPaths = new Set(this.crdtLog.map((op) => op.path.join('.')));
    const remotePaths = new Set(remoteOperations.map((op) => op.path.join('.')));
    const conflictPaths: string[] = [];

    for (const path of localPaths) {
      if (remotePaths.has(path)) {
        conflictPaths.push(path);
      }
    }

    if (conflictPaths.length === 0) return null;

    const divergence: SessionDivergence = {
      divergedAt: new Date().toISOString(),
      avidOperations: [...this.crdtLog],
      proToolsOperations: [...remoteOperations],
      conflictPaths,
      autoResolvable: conflictPaths.every((path) => {
        // Auto-resolvable if all conflicts are on independent leaf nodes
        return !path.includes('clips') || conflictPaths.filter((p) => p.startsWith(path)).length <= 1;
      }),
    };

    if (!divergence.autoResolvable) {
      this.status = 'diverged';
      this.emit('status:change', this.status);
    }

    this.emit('session:divergence', divergence);
    return divergence;
  }

  /**
   * Reconciles diverged state using last-writer-wins strategy.
   */
  reconcile(divergence: SessionDivergence): CRDTOperation[] {
    const mergedOps: CRDTOperation[] = [];
    const allOps = [
      ...divergence.avidOperations,
      ...divergence.proToolsOperations,
    ].sort((a, b) => a.lamportClock - b.lamportClock);

    const seenPaths = new Map<string, CRDTOperation>();
    for (const op of allOps) {
      const pathKey = op.path.join('.');
      const existing = seenPaths.get(pathKey);
      if (!existing || op.lamportClock > existing.lamportClock) {
        seenPaths.set(pathKey, op);
      }
    }

    for (const op of seenPaths.values()) {
      mergedOps.push(op);
    }

    this.crdtLog = [];
    this.status = 'connected';
    this.emit('status:change', this.status);
    this.emit('session:reconciled', mergedOps);

    return mergedOps;
  }

  // ─── State ───────────────────────────────────────────────────────────

  getStatus(): SessionBridgeStatus {
    return this.status;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  isConnected(): boolean {
    return this.status === 'connected' || this.status === 'syncing';
  }

  // ─── Events ──────────────────────────────────────────────────────────

  on(event: string, callback: (...args: unknown[]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private appendCRDTOperation(partial: Omit<CRDTOperation, 'id' | 'timestamp' | 'lamportClock' | 'originNode'>): void {
    this.lamportClock++;
    this.crdtLog.push({
      ...partial,
      id: `crdt-${this.lamportClock}-${Date.now()}`,
      timestamp: Date.now(),
      lamportClock: this.lamportClock,
      originNode: this.config.localUserId,
    });
  }

  private emit(event: string, data: unknown): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch {
          // swallow
        }
      }
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.emit('heartbeat', {
        sessionId: this.sessionId,
        participants: this.participants.filter((p) => p.isOnline).length,
        timestamp: Date.now(),
      });
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  dispose(): void {
    this.stopHeartbeat();
    this.listeners.clear();
    this.participants = [];
    this.rippleBuffer = [];
    this.comments = [];
    this.crdtLog = [];
    this.sessionId = null;
    this.status = 'disconnected';
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────

export function createSessionBridge(
  config?: Partial<SessionBridgeConfig>,
): ProToolsSessionBridge {
  return new ProToolsSessionBridge(config);
}
