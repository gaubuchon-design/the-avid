// ─── Sync Protocol ──────────────────────────────────────────────────────────
// Defines the message types, vector clocks, and transport abstractions needed
// for multi-device collaboration over both local-network (mDNS / LAN WebSocket)
// and cloud-relay channels.
//
// Key concepts:
//   - **Vector Clock**: tracks causal ordering across all participating nodes.
//   - **Delta Sync**: only changes since the remote's last-known vector clock
//     are transmitted.
//   - **SyncSession**: manages the handshake, heartbeat, and message dispatch
//     for one peer connection (transport-agnostic).
// ─────────────────────────────────────────────────────────────────────────────

import type {
  NodeId,
  HLC,
  ChangeEntry,
  ProjectDocumentSnapshot,
} from './ProjectDocument';

// ─── Vector Clock ───────────────────────────────────────────────────────────

/**
 * A vector clock mapping each `NodeId` to its latest known Lamport timestamp.
 * Used to determine which changes a remote peer is missing.
 */
export type VectorClock = Record<NodeId, number>;

/**
 * Create a new empty vector clock.
 */
export function createVectorClock(): VectorClock {
  return {};
}

/**
 * Increment the vector clock for a given node.
 * Returns a new clock (immutable pattern).
 */
export function tickVectorClock(clock: VectorClock, nodeId: NodeId): VectorClock {
  return { ...clock, [nodeId]: (clock[nodeId] ?? 0) + 1 };
}

/**
 * Merge two vector clocks by taking the max of each node's counter.
 * Returns a new clock.
 */
export function mergeVectorClocks(a: VectorClock, b: VectorClock): VectorClock {
  const merged: VectorClock = { ...a };
  for (const [nodeId, counter] of Object.entries(b)) {
    merged[nodeId] = Math.max(merged[nodeId] ?? 0, counter);
  }
  return merged;
}

/**
 * Returns `true` if clock `a` dominates (or equals) clock `b`.
 * Meaning: for every node in `b`, `a[node] >= b[node]`.
 */
export function dominates(a: VectorClock, b: VectorClock): boolean {
  for (const [nodeId, counter] of Object.entries(b)) {
    if ((a[nodeId] ?? 0) < counter) return false;
  }
  return true;
}

/**
 * Returns `true` if the two clocks are concurrent (neither dominates the other).
 */
export function isConcurrent(a: VectorClock, b: VectorClock): boolean {
  return !dominates(a, b) && !dominates(b, a);
}

/**
 * Update a vector clock from a received HLC.
 * Sets the node's counter to the max of the current value and the HLC's
 * wall-clock milliseconds (used as a coarse monotonic counter for the VC).
 */
export function updateVectorClockFromHLC(clock: VectorClock, hlc: HLC): VectorClock {
  const current = clock[hlc.nodeId] ?? 0;
  const incoming = hlc.wallMs;
  if (incoming > current) {
    return { ...clock, [hlc.nodeId]: incoming };
  }
  return clock;
}

// ─── Sync Message Types ─────────────────────────────────────────────────────

/**
 * The set of all sync protocol message types.
 * Each message includes a `type` discriminator and the originating `nodeId`.
 */
export type SyncMessage =
  | SyncHelloMessage
  | SyncRequestMessage
  | SyncResponseMessage
  | ChangeSetMessage
  | HeartbeatMessage
  | AckMessage
  | FullSnapshotRequestMessage
  | FullSnapshotResponseMessage;

// ── Hello (handshake) ────────────────────────────────────────────────────

/**
 * Sent when a peer first connects.  Announces itself and its current
 * vector clock so the remote can compute the delta.
 */
export interface SyncHelloMessage {
  type: 'sync:hello';
  /** The connecting peer's node id. */
  nodeId: NodeId;
  /** Project this session belongs to. */
  projectId: string;
  /** The peer's current vector clock. */
  vectorClock: VectorClock;
  /** Protocol version for forwards-compatibility. */
  protocolVersion: number;
  /** Display name of the connecting user. */
  displayName?: string;
}

// ── Sync Request ─────────────────────────────────────────────────────────

/**
 * Asks a peer to send all changes that are newer than the requester's
 * vector clock.
 */
export interface SyncRequestMessage {
  type: 'sync:request';
  nodeId: NodeId;
  projectId: string;
  /** The requester's vector clock — remote should send everything beyond this. */
  sinceVectorClock: VectorClock;
}

// ── Sync Response ────────────────────────────────────────────────────────

/**
 * Sent in reply to a `SyncRequest`.  Contains the delta changes and
 * the sender's updated vector clock.
 */
export interface SyncResponseMessage {
  type: 'sync:response';
  nodeId: NodeId;
  projectId: string;
  /** Changes the requester was missing. */
  changes: ChangeEntry[];
  /** The sender's vector clock after computing the delta. */
  vectorClock: VectorClock;
  /** If `true`, there are more changes to fetch (paginated). */
  hasMore: boolean;
}

// ── ChangeSet (push) ─────────────────────────────────────────────────────

/**
 * Proactively pushed to all connected peers whenever the local document
 * is mutated.  Contains one or more change entries.
 */
export interface ChangeSetMessage {
  type: 'sync:changeset';
  nodeId: NodeId;
  projectId: string;
  changes: ChangeEntry[];
  /** Sender's vector clock after these changes. */
  vectorClock: VectorClock;
}

// ── Heartbeat ────────────────────────────────────────────────────────────

/**
 * Sent periodically to maintain the connection and share presence
 * information.  Also used to detect stale peers.
 */
export interface HeartbeatMessage {
  type: 'sync:heartbeat';
  nodeId: NodeId;
  projectId: string;
  /** Sender's current vector clock. */
  vectorClock: VectorClock;
  /** Unix timestamp (ms) of when this heartbeat was created. */
  timestamp: number;
  /** Optional cursor / presence data. */
  presence?: PeerPresence;
}

// ── Ack ──────────────────────────────────────────────────────────────────

/**
 * Acknowledges receipt of a `ChangeSet` or `SyncResponse`.
 */
export interface AckMessage {
  type: 'sync:ack';
  nodeId: NodeId;
  projectId: string;
  /** The vector clock after applying the received changes. */
  vectorClock: VectorClock;
}

// ── Full Snapshot ────────────────────────────────────────────────────────

/**
 * Requests a full project snapshot (used on first connect or after
 * a long offline period where delta sync would be too expensive).
 */
export interface FullSnapshotRequestMessage {
  type: 'sync:snapshot-request';
  nodeId: NodeId;
  projectId: string;
}

/**
 * Response containing a full project snapshot.
 */
export interface FullSnapshotResponseMessage {
  type: 'sync:snapshot-response';
  nodeId: NodeId;
  projectId: string;
  snapshot: ProjectDocumentSnapshot;
  vectorClock: VectorClock;
}

// ─── Peer Presence ──────────────────────────────────────────────────────────

/**
 * Lightweight presence payload piggybacked on heartbeats.
 */
export interface PeerPresence {
  /** Display name. */
  displayName: string;
  /** Hex colour assigned to this peer. */
  color: string;
  /** Current playhead position (seconds). */
  playheadPosition?: number;
  /** Currently selected track id, if any. */
  selectedTrackId?: string | null;
  /** Currently selected clip id, if any. */
  selectedClipId?: string | null;
  /** Whether the peer is actively editing. */
  isEditing: boolean;
}

// ─── Transport Abstraction ──────────────────────────────────────────────────

/**
 * A transport-agnostic interface for sending and receiving sync messages.
 *
 * Implementations might use:
 *   - WebSocket (local LAN or cloud relay)
 *   - WebRTC DataChannel
 *   - BroadcastChannel (same-origin tabs)
 *   - mDNS + TCP for desktop LAN discovery
 */
export interface SyncTransport {
  /** Send a message to a specific peer. */
  send(peerId: NodeId, message: SyncMessage): void;

  /** Broadcast a message to all connected peers. */
  broadcast(message: SyncMessage): void;

  /** Register a handler for incoming messages. */
  onMessage(handler: (peerId: NodeId, message: SyncMessage) => void): void;

  /** Register a handler for peer connect events. */
  onPeerConnected(handler: (peerId: NodeId) => void): void;

  /** Register a handler for peer disconnect events. */
  onPeerDisconnected(handler: (peerId: NodeId) => void): void;

  /** Close all connections and clean up. */
  close(): void;
}

// ─── Sync Session ───────────────────────────────────────────────────────────

/** Configuration for a `SyncSession`. */
export interface SyncSessionConfig {
  /** Interval in ms between heartbeats (default: 5000). */
  heartbeatIntervalMs?: number;
  /** Peers that haven't sent a heartbeat within this window are marked stale (default: 15000). */
  peerTimeoutMs?: number;
  /** Maximum number of changes to include in a single SyncResponse (default: 500). */
  maxChangesPerResponse?: number;
  /** Whether to request a full snapshot on first connect (default: false). */
  requestFullSnapshotOnConnect?: boolean;
}

/**
 * Internal bookkeeping for a connected peer.
 */
interface PeerState {
  nodeId: NodeId;
  vectorClock: VectorClock;
  lastHeartbeat: number;
  presence?: PeerPresence;
  /** Whether the initial sync handshake is complete. */
  synced: boolean;
}

/**
 * Listener callback types emitted by `SyncSession`.
 */
export interface SyncSessionEvents {
  /** Fired when remote changes are received and ready to be applied. */
  onRemoteChanges: (changes: ChangeEntry[], fromNodeId: NodeId) => void;
  /** Fired when a full snapshot is received (first connect or recovery). */
  onFullSnapshot: (snapshot: ProjectDocumentSnapshot, fromNodeId: NodeId) => void;
  /** Fired when a peer's presence is updated. */
  onPresenceUpdate: (nodeId: NodeId, presence: PeerPresence) => void;
  /** Fired when a peer connects. */
  onPeerJoined: (nodeId: NodeId) => void;
  /** Fired when a peer is determined to be stale / disconnected. */
  onPeerLeft: (nodeId: NodeId) => void;
}

/**
 * Manages the sync lifecycle for one project across connected peers.
 *
 * Responsibilities:
 *   - Handshake (hello) on peer connect.
 *   - Delta sync (request / response).
 *   - Real-time push (changeset broadcast).
 *   - Heartbeat and stale-peer detection.
 *   - Full snapshot request / response for disaster recovery.
 *
 * This class is **transport-agnostic**: provide any `SyncTransport`
 * implementation (WebSocket, WebRTC, BroadcastChannel, etc.).
 *
 * @example
 * ```ts
 * const session = new SyncSession('proj-1', 'node-a', transport, {
 *   onRemoteChanges: (changes) => doc.applyRemote(changes),
 *   onPeerJoined: (id) => console.log(`${id} joined`),
 *   onPeerLeft: (id) => console.log(`${id} left`),
 *   onPresenceUpdate: (id, p) => updateCursors(id, p),
 *   onFullSnapshot: (snap) => doc.restoreFromSnapshot(snap),
 * });
 * session.start(myVectorClock);
 * ```
 */
export class SyncSession {
  /** Current protocol version. */
  static readonly PROTOCOL_VERSION = 1;

  readonly projectId: string;
  readonly nodeId: NodeId;

  private transport: SyncTransport;
  private events: SyncSessionEvents;
  private config: Required<SyncSessionConfig>;

  private localVectorClock: VectorClock;
  private peers: Map<NodeId, PeerState> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private staleCheckTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  constructor(
    projectId: string,
    nodeId: NodeId,
    transport: SyncTransport,
    events: SyncSessionEvents,
    config?: SyncSessionConfig,
  ) {
    this.projectId = projectId;
    this.nodeId = nodeId;
    this.transport = transport;
    this.events = events;
    this.localVectorClock = createVectorClock();

    this.config = {
      heartbeatIntervalMs: config?.heartbeatIntervalMs ?? 5_000,
      peerTimeoutMs: config?.peerTimeoutMs ?? 15_000,
      maxChangesPerResponse: config?.maxChangesPerResponse ?? 500,
      requestFullSnapshotOnConnect: config?.requestFullSnapshotOnConnect ?? false,
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * Start the sync session.
   *
   * @param initialVectorClock  The local document's current vector clock.
   */
  start(initialVectorClock: VectorClock): void {
    if (this.started) return;
    this.started = true;
    this.localVectorClock = { ...initialVectorClock };

    // Wire up transport event handlers.
    this.transport.onMessage((peerId, msg) => this.handleMessage(peerId, msg));
    this.transport.onPeerConnected((peerId) => this.handlePeerConnected(peerId));
    this.transport.onPeerDisconnected((peerId) => this.handlePeerDisconnected(peerId));

    // Start heartbeat.
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.config.heartbeatIntervalMs);

    // Start stale-peer checker.
    this.staleCheckTimer = setInterval(() => this.checkStalePeers(), this.config.peerTimeoutMs);
  }

  /**
   * Stop the sync session and clean up timers.
   */
  stop(): void {
    this.started = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.staleCheckTimer) {
      clearInterval(this.staleCheckTimer);
      this.staleCheckTimer = null;
    }
    this.transport.close();
    this.peers.clear();
  }

  /**
   * Update the local vector clock (e.g. after applying local changes).
   */
  updateLocalClock(clock: VectorClock): void {
    this.localVectorClock = mergeVectorClocks(this.localVectorClock, clock);
  }

  /**
   * Broadcast a set of local changes to all connected peers.
   */
  broadcastChanges(changes: ChangeEntry[]): void {
    if (changes.length === 0) return;

    // Update local vector clock from the changes.
    for (const change of changes) {
      this.localVectorClock = updateVectorClockFromHLC(this.localVectorClock, change.hlc);
    }

    const msg: ChangeSetMessage = {
      type: 'sync:changeset',
      nodeId: this.nodeId,
      projectId: this.projectId,
      changes,
      vectorClock: { ...this.localVectorClock },
    };
    this.transport.broadcast(msg);
  }

  /**
   * Send current presence information with the next heartbeat.
   */
  setLocalPresence(presence: PeerPresence): void {
    this._localPresence = presence;
  }

  private _localPresence: PeerPresence | undefined;

  /**
   * Get a list of all currently connected peers and their presence data.
   */
  getConnectedPeers(): Array<{ nodeId: NodeId; presence?: PeerPresence; lastHeartbeat: number }> {
    const result: Array<{ nodeId: NodeId; presence?: PeerPresence; lastHeartbeat: number }> = [];
    for (const peer of this.peers.values()) {
      result.push({
        nodeId: peer.nodeId,
        presence: peer.presence,
        lastHeartbeat: peer.lastHeartbeat,
      });
    }
    return result;
  }

  // ── Message Handling ───────────────────────────────────────────────────

  private handleMessage(peerId: NodeId, msg: SyncMessage): void {
    switch (msg.type) {
      case 'sync:hello':
        this.handleHello(peerId, msg);
        break;
      case 'sync:request':
        this.handleSyncRequest(peerId, msg);
        break;
      case 'sync:response':
        this.handleSyncResponse(peerId, msg);
        break;
      case 'sync:changeset':
        this.handleChangeSet(peerId, msg);
        break;
      case 'sync:heartbeat':
        this.handleHeartbeat(peerId, msg);
        break;
      case 'sync:ack':
        this.handleAck(peerId, msg);
        break;
      case 'sync:snapshot-request':
        this.handleSnapshotRequest(peerId, msg);
        break;
      case 'sync:snapshot-response':
        this.handleSnapshotResponse(peerId, msg);
        break;
    }
  }

  private handleHello(peerId: NodeId, msg: SyncHelloMessage): void {
    if (msg.projectId !== this.projectId) return;

    // Register the peer.
    this.peers.set(peerId, {
      nodeId: peerId,
      vectorClock: msg.vectorClock,
      lastHeartbeat: Date.now(),
      synced: false,
    });

    this.events.onPeerJoined(peerId);

    // Respond with our own hello.
    this.transport.send(peerId, {
      type: 'sync:hello',
      nodeId: this.nodeId,
      projectId: this.projectId,
      vectorClock: { ...this.localVectorClock },
      protocolVersion: SyncSession.PROTOCOL_VERSION,
    });

    // If the remote is behind us, we will get a sync:request from them.
    // If we are behind them, send a sync:request ourselves.
    if (!dominates(this.localVectorClock, msg.vectorClock)) {
      if (this.config.requestFullSnapshotOnConnect) {
        this.transport.send(peerId, {
          type: 'sync:snapshot-request',
          nodeId: this.nodeId,
          projectId: this.projectId,
        });
      } else {
        this.transport.send(peerId, {
          type: 'sync:request',
          nodeId: this.nodeId,
          projectId: this.projectId,
          sinceVectorClock: { ...this.localVectorClock },
        });
      }
    }
  }

  private handleSyncRequest(_peerId: NodeId, msg: SyncRequestMessage): void {
    if (msg.projectId !== this.projectId) return;

    // The actual change filtering is handled by the consumer who provides
    // the changes.  We emit an event so the owner can respond.
    // For now, we send an empty response — the consumer should override
    // this by providing changes via `respondToSyncRequest`.
    this.transport.send(msg.nodeId, {
      type: 'sync:response',
      nodeId: this.nodeId,
      projectId: this.projectId,
      changes: [],
      vectorClock: { ...this.localVectorClock },
      hasMore: false,
    });
  }

  private handleSyncResponse(peerId: NodeId, msg: SyncResponseMessage): void {
    if (msg.projectId !== this.projectId) return;

    const peer = this.peers.get(peerId);
    if (peer) {
      peer.vectorClock = mergeVectorClocks(peer.vectorClock, msg.vectorClock);
      peer.synced = true;
      peer.lastHeartbeat = Date.now();
    }

    if (msg.changes.length > 0) {
      // Update local clock.
      for (const change of msg.changes) {
        this.localVectorClock = updateVectorClockFromHLC(this.localVectorClock, change.hlc);
      }
      this.events.onRemoteChanges(msg.changes, peerId);
    }

    // Send ack.
    this.transport.send(peerId, {
      type: 'sync:ack',
      nodeId: this.nodeId,
      projectId: this.projectId,
      vectorClock: { ...this.localVectorClock },
    });
  }

  private handleChangeSet(peerId: NodeId, msg: ChangeSetMessage): void {
    if (msg.projectId !== this.projectId) return;

    const peer = this.peers.get(peerId);
    if (peer) {
      peer.vectorClock = mergeVectorClocks(peer.vectorClock, msg.vectorClock);
      peer.lastHeartbeat = Date.now();
    }

    if (msg.changes.length > 0) {
      for (const change of msg.changes) {
        this.localVectorClock = updateVectorClockFromHLC(this.localVectorClock, change.hlc);
      }
      this.events.onRemoteChanges(msg.changes, peerId);
    }

    // Ack.
    this.transport.send(peerId, {
      type: 'sync:ack',
      nodeId: this.nodeId,
      projectId: this.projectId,
      vectorClock: { ...this.localVectorClock },
    });
  }

  private handleHeartbeat(peerId: NodeId, msg: HeartbeatMessage): void {
    if (msg.projectId !== this.projectId) return;

    let peer = this.peers.get(peerId);
    if (!peer) {
      // Peer reconnected without a hello — create state.
      peer = {
        nodeId: peerId,
        vectorClock: msg.vectorClock,
        lastHeartbeat: Date.now(),
        synced: false,
      };
      this.peers.set(peerId, peer);
      this.events.onPeerJoined(peerId);
    } else {
      peer.vectorClock = mergeVectorClocks(peer.vectorClock, msg.vectorClock);
      peer.lastHeartbeat = Date.now();
    }

    if (msg.presence) {
      peer.presence = msg.presence;
      this.events.onPresenceUpdate(peerId, msg.presence);
    }
  }

  private handleAck(peerId: NodeId, msg: AckMessage): void {
    if (msg.projectId !== this.projectId) return;

    const peer = this.peers.get(peerId);
    if (peer) {
      peer.vectorClock = mergeVectorClocks(peer.vectorClock, msg.vectorClock);
      peer.lastHeartbeat = Date.now();
    }
  }

  private handleSnapshotRequest(peerId: NodeId, msg: FullSnapshotRequestMessage): void {
    if (msg.projectId !== this.projectId) return;
    // The consumer must call `sendSnapshot(peerId, snapshot)` to fulfill this.
    // This is a hook point — the session cannot create a snapshot itself.
  }

  private handleSnapshotResponse(peerId: NodeId, msg: FullSnapshotResponseMessage): void {
    if (msg.projectId !== this.projectId) return;

    const peer = this.peers.get(peerId);
    if (peer) {
      peer.vectorClock = mergeVectorClocks(peer.vectorClock, msg.vectorClock);
      peer.synced = true;
      peer.lastHeartbeat = Date.now();
    }

    this.localVectorClock = mergeVectorClocks(this.localVectorClock, msg.vectorClock);
    this.events.onFullSnapshot(msg.snapshot, peerId);
  }

  // ── Public helpers for sync response ───────────────────────────────────

  /**
   * Send a sync response with the provided changes to a specific peer.
   * Call this when you receive `onRemoteChanges` or handle a sync request
   * from the consumer side.
   */
  respondToSyncRequest(peerId: NodeId, changes: ChangeEntry[], hasMore: boolean): void {
    this.transport.send(peerId, {
      type: 'sync:response',
      nodeId: this.nodeId,
      projectId: this.projectId,
      changes,
      vectorClock: { ...this.localVectorClock },
      hasMore,
    });
  }

  /**
   * Send a full snapshot to a specific peer (in response to a snapshot request).
   */
  sendSnapshot(peerId: NodeId, snapshot: ProjectDocumentSnapshot): void {
    this.transport.send(peerId, {
      type: 'sync:snapshot-response',
      nodeId: this.nodeId,
      projectId: this.projectId,
      snapshot,
      vectorClock: { ...this.localVectorClock },
    });
  }

  // ── Heartbeat & Stale Detection ────────────────────────────────────────

  private sendHeartbeat(): void {
    const msg: HeartbeatMessage = {
      type: 'sync:heartbeat',
      nodeId: this.nodeId,
      projectId: this.projectId,
      vectorClock: { ...this.localVectorClock },
      timestamp: Date.now(),
      presence: this._localPresence,
    };
    this.transport.broadcast(msg);
  }

  private checkStalePeers(): void {
    const now = Date.now();
    const staleIds: NodeId[] = [];

    for (const [id, peer] of this.peers) {
      if (now - peer.lastHeartbeat > this.config.peerTimeoutMs) {
        staleIds.push(id);
      }
    }

    for (const id of staleIds) {
      this.peers.delete(id);
      this.events.onPeerLeft(id);
    }
  }

  private handlePeerConnected(peerId: NodeId): void {
    // Send hello when a new transport-level connection is established.
    this.transport.send(peerId, {
      type: 'sync:hello',
      nodeId: this.nodeId,
      projectId: this.projectId,
      vectorClock: { ...this.localVectorClock },
      protocolVersion: SyncSession.PROTOCOL_VERSION,
    });
  }

  private handlePeerDisconnected(peerId: NodeId): void {
    if (this.peers.has(peerId)) {
      this.peers.delete(peerId);
      this.events.onPeerLeft(peerId);
    }
  }
}
