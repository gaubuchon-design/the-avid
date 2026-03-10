/**
 * @module MeshService
 *
 * Top-level coordinator for the knowledge-node mesh network. Wires
 * together peer discovery, shard lease management, replication, and
 * scatter/gather search into a cohesive service.
 *
 * The MeshService is the primary entry point for mesh operations and
 * is intended to be instantiated once per node. It owns the WebSocket
 * server for accepting inbound peer connections and delegates all
 * lower-level concerns to specialised sub-modules.
 */

import { createServer, type Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ShardManager } from '../shard/ShardManager.js';
import { IndexBuilder } from '../index/IndexBuilder.js';
import { PeerDiscovery, type PeerState } from './PeerDiscovery.js';
import { ShardLeaseManager, type Lease } from './ShardLeaseManager.js';
import { ReplicationManager } from './ReplicationManager.js';
import {
  ScatterGatherSearch,
  type SearchQuery,
  type MergedSearchResults,
  type SearchHit,
} from './ScatterGatherSearch.js';
import { ConflictHandler } from './ConflictHandler.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Configuration for a mesh node.
 */
export interface MeshConfig {
  /** Unique identifier for this node. */
  readonly nodeId: string;
  /** Hostname this node listens on. */
  readonly hostname: string;
  /** Port this node listens on for both HTTP and WebSocket. */
  readonly port: number;
  /** Filesystem path to the shard data directory. */
  readonly dataDir: string;
  /** Static peer addresses to connect to on startup. */
  readonly peers?: readonly PeerAddress[];
  /** Lease timeout in milliseconds (default: 30000). */
  readonly leaseTimeoutMs?: number;
  /** Heartbeat interval in milliseconds (default: 10000). */
  readonly heartbeatIntervalMs?: number;
  /** Search timeout in milliseconds (default: 5000). */
  readonly searchTimeoutMs?: number;
}

/**
 * Address of a remote peer node.
 */
export interface PeerAddress {
  /** Hostname of the peer. */
  readonly hostname: string;
  /** Port of the peer. */
  readonly port: number;
}

/**
 * Information about this node's current state.
 */
export interface NodeInfo {
  /** This node's unique identifier. */
  readonly nodeId: string;
  /** Hostname this node listens on. */
  readonly hostname: string;
  /** Port this node listens on. */
  readonly port: number;
  /** Number of local shards. */
  readonly shardCount: number;
  /** Shard IDs available locally. */
  readonly shardIds: readonly string[];
  /** Number of connected peers. */
  readonly peerCount: number;
  /** ISO 8601 timestamp when the node started. */
  readonly startedAt: string;
}

/** Callback for peer connection events. */
export type PeerEventHandler = (peer: PeerState) => void;

// ─── MeshService ────────────────────────────────────────────────────────────

/**
 * Main mesh service coordinating all mesh sub-systems.
 *
 * Lifecycle:
 * ```ts
 * const mesh = new MeshService(config, shardManager);
 * await mesh.start();
 * // ... use mesh.search(), mesh.getPeers(), etc.
 * await mesh.stop();
 * ```
 */
export class MeshService {
  /** Mesh configuration. */
  readonly config: MeshConfig;

  /** Shard manager for local shard operations. */
  private readonly shardManager: ShardManager;

  /** Peer discovery and connection management. */
  readonly peerDiscovery: PeerDiscovery;

  /** Shard lease management. */
  readonly leaseManager: ShardLeaseManager;

  /** Replication event log manager. */
  readonly replicationManager: ReplicationManager;

  /** Scatter/gather search engine. */
  private readonly searchEngine: ScatterGatherSearch;

  /** Conflict handler for mesh-level conflicts. */
  readonly conflictHandler: ConflictHandler;

  /** ANN index builder. */
  private readonly indexBuilder: IndexBuilder;

  /** HTTP server for the WebSocket upgrade. */
  private httpServer: HttpServer | null = null;

  /** WebSocket server for mesh peer connections. */
  private wss: WebSocketServer | null = null;

  /** ISO 8601 timestamp when the node started. */
  private startedAt: string = '';

  /** Peer connected event handlers. */
  private readonly peerConnectedHandlers: PeerEventHandler[] = [];

  /** Peer disconnected event handlers. */
  private readonly peerDisconnectedHandlers: PeerEventHandler[] = [];

  /**
   * @param config       - Mesh node configuration.
   * @param shardManager - Shard lifecycle manager.
   */
  constructor(config: MeshConfig, shardManager: ShardManager) {
    this.config = config;
    this.shardManager = shardManager;

    this.peerDiscovery = new PeerDiscovery(config);
    this.leaseManager = new ShardLeaseManager(config.leaseTimeoutMs ?? 30_000);
    this.replicationManager = new ReplicationManager(shardManager);
    this.conflictHandler = new ConflictHandler();
    this.indexBuilder = new IndexBuilder();

    this.searchEngine = new ScatterGatherSearch(
      shardManager,
      this.peerDiscovery,
      this.indexBuilder,
      config.nodeId,
      config.searchTimeoutMs ?? 5_000,
    );

    // Wire up message handling for search requests from peers.
    this.peerDiscovery.onMessage((nodeId, type, payload) => {
      this.handlePeerMessage(nodeId, type, payload);
    });
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Start the mesh node.
   *
   * This:
   * 1. Creates an HTTP + WebSocket server on the configured port.
   * 2. Connects to all statically-configured peers.
   * 3. Starts the heartbeat loop.
   *
   * @returns Resolves when the server is listening and initial peer
   *   connections have been attempted.
   */
  async start(): Promise<void> {
    this.startedAt = new Date().toISOString();

    // Create WebSocket server.
    await new Promise<void>((resolve, reject) => {
      this.httpServer = createServer();
      this.wss = new WebSocketServer({ server: this.httpServer });

      this.wss.on('connection', (ws: WebSocket) => {
        this.peerDiscovery.acceptConnection(ws);
      });

      this.httpServer.on('error', reject);
      this.httpServer.listen(this.config.port, this.config.hostname, () => {
        resolve();
      });
    });

    // Connect to static peers (best-effort, don't fail on individual errors).
    if (this.config.peers) {
      const connectPromises = this.config.peers.map(async (addr) => {
        try {
          await this.peerDiscovery.connectToPeer(addr);
        } catch {
          // Peer may not be up yet — will retry via heartbeat.
        }
      });
      await Promise.allSettled(connectPromises);
    }

    // Start heartbeat.
    this.peerDiscovery.startHeartbeat();
  }

  /**
   * Gracefully stop the mesh node.
   *
   * Disconnects all peers, stops the heartbeat, and closes the server.
   */
  async stop(): Promise<void> {
    this.peerDiscovery.stopHeartbeat();

    // Disconnect all peers.
    for (const peer of this.peerDiscovery.getPeers()) {
      this.peerDiscovery.disconnectPeer(peer.nodeId);
    }

    // Close WebSocket server.
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    // Close HTTP server.
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }
  }

  // ── Node Info ────────────────────────────────────────────────────────────

  /**
   * Get information about this node's current state.
   */
  getNodeInfo(): NodeInfo {
    const shards = this.shardManager.listShards();
    return {
      nodeId: this.config.nodeId,
      hostname: this.config.hostname,
      port: this.config.port,
      shardCount: shards.length,
      shardIds: shards.map((s) => s.shardId),
      peerCount: this.peerDiscovery.getConnectedPeers().length,
      startedAt: this.startedAt,
    };
  }

  // ── Peer Info ────────────────────────────────────────────────────────────

  /**
   * Get the state of all known peers.
   */
  getPeers(): PeerState[] {
    return this.peerDiscovery.getPeers();
  }

  // ── Search ───────────────────────────────────────────────────────────────

  /**
   * Execute a scatter/gather search across the mesh.
   *
   * Searches all local shards and fans out to connected peers, merging
   * and ranking the combined results.
   *
   * @param query - Search parameters.
   * @returns Merged, ranked results with timing metadata.
   */
  async search(query: SearchQuery): Promise<MergedSearchResults> {
    return this.searchEngine.search(query);
  }

  /**
   * Execute a local-only search (no fan-out to peers).
   *
   * Used internally to handle incoming search requests from remote peers.
   *
   * @param query - Search parameters.
   * @returns Local search hits.
   */
  searchLocal(query: SearchQuery): SearchHit[] {
    return this.searchEngine.searchLocal(query);
  }

  // ── Event Handlers ───────────────────────────────────────────────────────

  /**
   * Register a handler called when a new peer connects.
   *
   * @param handler - Callback receiving the connected peer's state.
   */
  onPeerConnected(handler: PeerEventHandler): void {
    this.peerConnectedHandlers.push(handler);
  }

  /**
   * Register a handler called when a peer disconnects.
   *
   * @param handler - Callback receiving the disconnected peer's state.
   */
  onPeerDisconnected(handler: PeerEventHandler): void {
    this.peerDisconnectedHandlers.push(handler);
  }

  // ── Internal Message Handling ────────────────────────────────────────────

  /**
   * Handle incoming messages from mesh peers.
   *
   * Routes messages to the appropriate sub-system based on type.
   */
  private handlePeerMessage(
    nodeId: string,
    type: string,
    payload: unknown,
  ): void {
    // Handle peer lifecycle events.
    if (type === 'peer:connected') {
      const peerState = this.peerDiscovery
        .getConnectedPeers()
        .find((p) => p.nodeId === nodeId);
      if (peerState) {
        for (const handler of this.peerConnectedHandlers) {
          handler(peerState);
        }
      }
      return;
    }

    if (type === 'peer:disconnected') {
      const disconnected: PeerState = {
        nodeId,
        hostname: 'unknown',
        port: 0,
        status: 'disconnected',
        lastSeen: new Date().toISOString(),
        shardIds: [],
      };
      for (const handler of this.peerDisconnectedHandlers) {
        handler(disconnected);
      }
      return;
    }

    // Handle search request from a peer.
    if (type === 'search:request') {
      const req = payload as Record<string, unknown>;
      const requestId = req['__requestId'] as string;
      const fromNodeId = req['__fromNodeId'] as string;
      const query = req as unknown as SearchQuery;

      const hits = this.searchLocal(query);
      this.peerDiscovery.sendResponse(fromNodeId, requestId, 'search:response', {
        hits,
      });
      return;
    }

    // Handle replication requests.
    if (type === 'replication:request') {
      const req = payload as Record<string, unknown>;
      const requestId = req['__requestId'] as string;
      const fromNodeId = req['__fromNodeId'] as string;
      const shardId = req['shardId'] as string;
      const sinceSequence = (req['sinceSequence'] as number) ?? 0;

      const events = this.replicationManager.getEventsSince(shardId, sinceSequence);
      this.peerDiscovery.sendResponse(
        fromNodeId,
        requestId,
        'replication:response',
        { events },
      );
      return;
    }

    // Handle lease queries.
    if (type === 'lease:query:request') {
      const req = payload as Record<string, unknown>;
      const requestId = req['__requestId'] as string;
      const fromNodeId = req['__fromNodeId'] as string;
      const shardId = req['shardId'] as string;

      const lease = this.leaseManager.getLease(shardId);
      this.peerDiscovery.sendResponse(
        fromNodeId,
        requestId,
        'lease:query:response',
        { lease },
      );
    }
  }
}
