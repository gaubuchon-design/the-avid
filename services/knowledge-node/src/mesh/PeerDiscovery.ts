/**
 * @module PeerDiscovery
 *
 * WebSocket-based peer management for the knowledge-node mesh. Handles
 * outbound connections to known peers, tracks connection state, and
 * provides message routing (broadcast and point-to-point).
 *
 * Wire protocol: every WebSocket frame is a UTF-8 JSON object with the
 * shape `{ type: string; payload: unknown; requestId?: string }`.
 * Request/response correlation is achieved via the optional `requestId`
 * field — responses echo back the same ID.
 */

import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import type { MeshConfig, PeerAddress } from './MeshService.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Snapshot of a remote peer's connection state.
 */
export interface PeerState {
  /** Unique identifier of the remote node. */
  readonly nodeId: string;
  /** Remote peer's hostname. */
  readonly hostname: string;
  /** Remote peer's port. */
  readonly port: number;
  /** Current connection status. */
  readonly status: 'connecting' | 'connected' | 'disconnected' | 'error';
  /** ISO 8601 timestamp of the last successful message or heartbeat. */
  readonly lastSeen: string;
  /** Shard IDs the remote peer advertises as locally available. */
  readonly shardIds: readonly string[];
  /** Most recently measured round-trip latency in milliseconds. */
  readonly latencyMs?: number;
}

/** Internal mutable state for a connected peer. */
interface PeerConnection {
  nodeId: string;
  hostname: string;
  port: number;
  status: PeerState['status'];
  lastSeen: string;
  shardIds: string[];
  latencyMs?: number;
  ws: WebSocket;
  pendingRequests: Map<string, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>;
}

/** Wire-format message. */
interface MeshMessage {
  type: string;
  payload: unknown;
  requestId?: string;
}

/** Callback signature for incoming mesh messages. */
export type MessageHandler = (
  nodeId: string,
  type: string,
  payload: unknown,
) => void;

/** Default timeout for request/response pairs (5 seconds). */
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;

// ─── PeerDiscovery ──────────────────────────────────────────────────────────

/**
 * Manages WebSocket connections to mesh peers.
 *
 * Responsibilities:
 * - Establish outbound connections to statically-configured or
 *   dynamically-discovered peer addresses.
 * - Send and receive JSON-RPC-style messages.
 * - Track per-peer metadata (node ID, shards, latency).
 * - Heartbeat broadcasting for liveness detection.
 */
export class PeerDiscovery {
  /** Mesh configuration. */
  private readonly config: MeshConfig;

  /** Active peer connections keyed by node ID. */
  private readonly peers: Map<string, PeerConnection> = new Map();

  /** Registered message handlers. */
  private readonly handlers: MessageHandler[] = [];

  /** Heartbeat interval handle. */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /** Default timeout for request/response calls. */
  private readonly requestTimeoutMs: number;

  /**
   * @param config - Mesh configuration including this node's identity
   *   and static peer addresses.
   */
  constructor(config: MeshConfig) {
    this.config = config;
    this.requestTimeoutMs = config.searchTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  // ── Connect / Disconnect ─────────────────────────────────────────────────

  /**
   * Establish a WebSocket connection to a peer.
   *
   * The handshake sends an `identify` message with this node's ID and
   * shard list. The remote peer is expected to respond with its own
   * `identify` payload.
   *
   * If a connection to the same address already exists, the existing
   * connection is returned without creating a duplicate.
   *
   * @param address - Hostname and port of the remote peer.
   * @returns The peer's state once the connection is established.
   */
  connectToPeer(address: PeerAddress): Promise<PeerState> {
    // Check if we already have a connection to this address.
    for (const peer of this.peers.values()) {
      if (peer.hostname === address.hostname && peer.port === address.port) {
        if (peer.status === 'connected' || peer.status === 'connecting') {
          return Promise.resolve(this.toPeerState(peer));
        }
      }
    }

    return new Promise<PeerState>((resolve, reject) => {
      const url = `ws://${address.hostname}:${address.port}`;
      const ws = new WebSocket(url);

      // Temporary ID until the remote peer identifies itself.
      const tempId = `pending-${address.hostname}:${address.port}`;

      // Track whether the promise has been settled to avoid double
      // resolve/reject from racing open/error/close events.
      let settled = false;

      const conn: PeerConnection = {
        nodeId: tempId,
        hostname: address.hostname,
        port: address.port,
        status: 'connecting',
        lastSeen: new Date().toISOString(),
        shardIds: [],
        ws,
        pendingRequests: new Map(),
      };

      this.peers.set(tempId, conn);

      const connectTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          conn.status = 'error';
          ws.terminate();
          this.peers.delete(tempId);
          reject(new Error(`Connection to ${url} timed out`));
        }
      }, this.requestTimeoutMs);

      ws.on('open', () => {
        clearTimeout(connectTimeout);
        conn.status = 'connected';
        conn.lastSeen = new Date().toISOString();

        // Send our identity.
        this.sendRaw(ws, {
          type: 'identify',
          payload: {
            nodeId: this.config.nodeId,
            hostname: this.config.hostname,
            port: this.config.port,
            shardIds: [],
          },
        });

        if (!settled) {
          settled = true;
          resolve(this.toPeerState(conn));
        }
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as MeshMessage;
          this.handleIncoming(conn, msg);
        } catch {
          // Ignore malformed messages.
        }
      });

      ws.on('close', () => {
        clearTimeout(connectTimeout);
        const prevStatus = conn.status;
        conn.status = 'disconnected';

        // Clean up pending requests.
        for (const [, pending] of conn.pendingRequests) {
          clearTimeout(pending.timer);
          pending.reject(new Error('Connection closed'));
        }
        conn.pendingRequests.clear();

        // Re-key if the peer had identified itself.
        if (conn.nodeId !== tempId) {
          this.peers.delete(conn.nodeId);
        }
        this.peers.delete(tempId);

        // Notify handlers of disconnection.
        if (prevStatus === 'connected') {
          for (const handler of this.handlers) {
            handler(conn.nodeId, 'peer:disconnected', {
              nodeId: conn.nodeId,
            });
          }
        }
      });

      ws.on('error', (err) => {
        clearTimeout(connectTimeout);
        conn.status = 'error';

        // Clean up pending requests.
        for (const [, pending] of conn.pendingRequests) {
          clearTimeout(pending.timer);
          pending.reject(err instanceof Error ? err : new Error(String(err)));
        }
        conn.pendingRequests.clear();

        if (this.peers.has(tempId) && conn.nodeId === tempId) {
          this.peers.delete(tempId);
        }

        // Only reject the connect promise if we haven't resolved yet.
        if (!settled) {
          settled = true;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
  }

  /**
   * Disconnect from a peer by node ID.
   *
   * @param nodeId - The peer to disconnect from.
   */
  disconnectPeer(nodeId: string): void {
    const peer = this.peers.get(nodeId);
    if (!peer) return;

    // Clean up pending requests.
    for (const [, pending] of peer.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Deliberately disconnected'));
    }
    peer.pendingRequests.clear();

    if (peer.ws.readyState === WebSocket.OPEN ||
        peer.ws.readyState === WebSocket.CONNECTING) {
      peer.ws.close();
    }

    this.peers.delete(nodeId);
  }

  // ── Peer State ───────────────────────────────────────────────────────────

  /**
   * Get the state of all known peers (including disconnected ones that
   * haven't been cleaned up yet).
   */
  getPeers(): PeerState[] {
    return Array.from(this.peers.values()).map((p) => this.toPeerState(p));
  }

  /**
   * Get only peers with an active WebSocket connection.
   */
  getConnectedPeers(): PeerState[] {
    return Array.from(this.peers.values())
      .filter((p) => p.status === 'connected')
      .map((p) => this.toPeerState(p));
  }

  // ── Messaging ────────────────────────────────────────────────────────────

  /**
   * Broadcast a message to all connected peers.
   *
   * @param type    - Message type identifier.
   * @param payload - Message payload (must be JSON-serialisable).
   */
  broadcastMessage(type: string, payload: unknown): void {
    for (const peer of this.peers.values()) {
      if (peer.status !== 'connected') continue;
      if (peer.ws.readyState !== WebSocket.OPEN) continue;

      this.sendRaw(peer.ws, { type, payload });
    }
  }

  /**
   * Send a request to a specific peer and wait for a response.
   *
   * The request is correlated via a `requestId`. If the peer does not
   * respond within the configured timeout, the returned promise rejects.
   *
   * @param nodeId  - Target peer's node ID.
   * @param type    - Message type identifier.
   * @param payload - Message payload.
   * @returns The response payload from the peer.
   * @throws {Error} If the peer is not connected or the request times out.
   */
  sendToPeer(nodeId: string, type: string, payload: unknown): Promise<unknown> {
    const peer = this.peers.get(nodeId);
    if (!peer || peer.status !== 'connected') {
      return Promise.reject(new Error(`Peer "${nodeId}" is not connected`));
    }

    const requestId = randomUUID();

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        peer.pendingRequests.delete(requestId);
        reject(new Error(`Request to "${nodeId}" timed out (${this.requestTimeoutMs}ms)`));
      }, this.requestTimeoutMs);

      peer.pendingRequests.set(requestId, { resolve, reject, timer });
      this.sendRaw(peer.ws, { type, payload, requestId });
    });
  }

  // ── Heartbeat ────────────────────────────────────────────────────────────

  /**
   * Start the heartbeat loop. Sends a `heartbeat` message to all
   * connected peers at the configured interval.
   */
  startHeartbeat(): void {
    if (this.heartbeatTimer) return;

    const interval = this.config.heartbeatIntervalMs ?? 10_000;
    this.heartbeatTimer = setInterval(() => {
      this.broadcastMessage('heartbeat', {
        nodeId: this.config.nodeId,
        timestamp: new Date().toISOString(),
      });
    }, interval);

    // Unref the timer so it does not prevent process exit during shutdown
    if (typeof this.heartbeatTimer === 'object' && 'unref' in this.heartbeatTimer) {
      this.heartbeatTimer.unref();
    }
  }

  /**
   * Stop the heartbeat loop.
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Destroy the peer discovery layer: stop heartbeat and disconnect
   * all peers. Call this during graceful shutdown.
   */
  destroy(): void {
    this.stopHeartbeat();
    for (const peer of Array.from(this.peers.values())) {
      this.disconnectPeer(peer.nodeId);
    }
    this.handlers.length = 0;
  }

  // ── Handler Registration ─────────────────────────────────────────────────

  /**
   * Register a handler that is called for every incoming message from
   * any connected peer.
   *
   * @param handler - Callback receiving `(nodeId, type, payload)`.
   */
  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  // ── Inbound Connection Handling ──────────────────────────────────────────

  /**
   * Accept an inbound WebSocket connection from a remote peer.
   *
   * This is called by the server when a new WS connection arrives.
   * The remote peer is expected to send an `identify` message shortly
   * after connecting.
   *
   * @param ws - The inbound WebSocket connection.
   */
  acceptConnection(ws: WebSocket): void {
    const tempId = `inbound-${randomUUID().slice(0, 8)}`;

    const conn: PeerConnection = {
      nodeId: tempId,
      hostname: 'unknown',
      port: 0,
      status: 'connected',
      lastSeen: new Date().toISOString(),
      shardIds: [],
      ws,
      pendingRequests: new Map(),
    };

    this.peers.set(tempId, conn);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as MeshMessage;
        this.handleIncoming(conn, msg);
      } catch {
        // Ignore malformed messages.
      }
    });

    ws.on('close', () => {
      conn.status = 'disconnected';

      for (const [, pending] of conn.pendingRequests) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Connection closed'));
      }
      conn.pendingRequests.clear();

      // Clean up both temp and real IDs.
      this.peers.delete(tempId);
      if (conn.nodeId !== tempId) {
        this.peers.delete(conn.nodeId);
      }

      for (const handler of this.handlers) {
        handler(conn.nodeId, 'peer:disconnected', { nodeId: conn.nodeId });
      }
    });

    ws.on('error', () => {
      conn.status = 'error';
    });

    // Send our identity to the inbound peer.
    this.sendRaw(ws, {
      type: 'identify',
      payload: {
        nodeId: this.config.nodeId,
        hostname: this.config.hostname,
        port: this.config.port,
        shardIds: [],
      },
    });
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /**
   * Handle an incoming message from a peer.
   */
  private handleIncoming(conn: PeerConnection, msg: MeshMessage): void {
    conn.lastSeen = new Date().toISOString();

    // Handle the `identify` handshake.
    if (msg.type === 'identify') {
      const info = msg.payload as {
        nodeId: string;
        hostname: string;
        port: number;
        shardIds?: string[];
      };

      // Re-key the peer from its temp ID to its real node ID.
      const oldId = conn.nodeId;
      if (oldId !== info.nodeId) {
        this.peers.delete(oldId);
        conn.nodeId = info.nodeId;
        conn.hostname = info.hostname;
        conn.port = info.port;
        conn.shardIds = info.shardIds ?? [];
        this.peers.set(info.nodeId, conn);
      }

      // Notify handlers.
      for (const handler of this.handlers) {
        handler(conn.nodeId, 'peer:connected', {
          nodeId: info.nodeId,
          hostname: info.hostname,
          port: info.port,
        });
      }
      return;
    }

    // Handle response correlation.
    if (msg.requestId && conn.pendingRequests.has(msg.requestId)) {
      const pending = conn.pendingRequests.get(msg.requestId)!;
      clearTimeout(pending.timer);
      conn.pendingRequests.delete(msg.requestId);

      if (msg.type === 'error') {
        pending.reject(new Error(String(msg.payload)));
      } else {
        pending.resolve(msg.payload);
      }
      return;
    }

    // Handle heartbeat.
    if (msg.type === 'heartbeat') {
      const hb = msg.payload as { nodeId?: string; shardIds?: string[] };
      if (hb.shardIds) {
        conn.shardIds = hb.shardIds;
      }
      return;
    }

    // Dispatch to registered handlers. If the message has a requestId,
    // the handler is expected to send a response via sendToPeer.
    for (const handler of this.handlers) {
      handler(conn.nodeId, msg.type, msg.payload);
    }

    // If the message expects a response (has requestId) but was not
    // handled by a specific response mechanism, the MeshService layer
    // is responsible for sending the reply. We store the requestId
    // in the payload for upstream processing.
    if (msg.requestId) {
      for (const handler of this.handlers) {
        handler(conn.nodeId, `${msg.type}:request`, {
          ...((msg.payload ?? {}) as Record<string, unknown>),
          __requestId: msg.requestId,
          __fromNodeId: conn.nodeId,
        });
      }
    }
  }

  /**
   * Send a raw JSON message over a WebSocket.
   */
  private sendRaw(ws: WebSocket, msg: MeshMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Convert an internal connection to an immutable peer state snapshot.
   */
  private toPeerState(conn: PeerConnection): PeerState {
    return {
      nodeId: conn.nodeId,
      hostname: conn.hostname,
      port: conn.port,
      status: conn.status,
      lastSeen: conn.lastSeen,
      shardIds: [...conn.shardIds],
      latencyMs: conn.latencyMs,
    };
  }

  /**
   * Send a response to a pending request from a peer.
   *
   * This is used internally by the MeshService to respond to
   * search requests and other RPC-style messages.
   *
   * @param nodeId    - The peer to respond to.
   * @param requestId - The original request's correlation ID.
   * @param type      - Response message type.
   * @param payload   - Response payload.
   */
  sendResponse(
    nodeId: string,
    requestId: string,
    type: string,
    payload: unknown,
  ): void {
    const peer = this.peers.get(nodeId);
    if (!peer || peer.ws.readyState !== WebSocket.OPEN) return;
    this.sendRaw(peer.ws, { type, payload, requestId });
  }
}
