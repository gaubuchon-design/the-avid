/**
 * @module mesh-protocol
 *
 * Types for the peer-to-peer mesh network that connects Knowledge DB
 * nodes. The mesh handles shard replication, writer leases, peer
 * discovery, and federated search across a local-area or wide-area
 * network of editing workstations.
 */

// ─── Mesh Event Type ──────────────────────────────────────────────────────────

/**
 * Discriminated event types emitted on the mesh event bus.
 */
export type MeshEventType =
  | 'peer-joined'
  | 'peer-left'
  | 'shard-created'
  | 'shard-replicated'
  | 'lease-acquired'
  | 'lease-released'
  | 'lease-expired'
  | 'conflict-detected'
  | 'search-request'
  | 'search-response';

// ─── Lease Info ───────────────────────────────────────────────────────────────

/**
 * A writer lease that grants exclusive write access to a shard.
 *
 * Only one node may hold a lease for a given shard at a time.
 * Leases expire automatically if not renewed.
 */
export interface LeaseInfo {
  /** Shard this lease governs. */
  readonly shardId: string;
  /** Node ID of the current lease holder. */
  readonly holderId: string;
  /** ISO 8601 timestamp when the lease was acquired. */
  readonly acquiredAt: string;
  /** ISO 8601 timestamp when the lease expires. */
  readonly expiresAt: string;
  /** Number of times this lease has been renewed. */
  readonly renewalCount: number;
}

// ─── Replication State ────────────────────────────────────────────────────────

/**
 * Describes the replication status between a source and target node
 * for a specific shard.
 */
export interface ReplicationState {
  /** Shard being replicated. */
  readonly shardId: string;
  /** Node that holds the primary copy. */
  readonly sourceNodeId: string;
  /** Node receiving the replica. */
  readonly targetNodeId: string;
  /** Last replicated sequence number (WAL offset or CRDT version). */
  readonly lastSequence: number;
  /** Number of un-replicated operations. */
  readonly lag: number;
  /** Current replication health. */
  readonly status: 'synced' | 'catching-up' | 'stale' | 'error';
}

// ─── Shard Manifest ───────────────────────────────────────────────────────────

/**
 * Metadata manifest for a Knowledge DB shard.
 *
 * Each shard is a self-contained partition of the Knowledge DB that
 * can be replicated, archived, and independently leased for writes.
 */
export interface ShardManifest {
  /** Unique shard identifier. */
  readonly shardId: string;
  /** Project this shard belongs to. */
  readonly projectId: string;
  /** Shard role in the replication topology. */
  readonly type: 'primary' | 'replica' | 'archive';
  /** User or service account that owns this shard. */
  readonly ownerId: string;
  /** Schema version of the shard's internal data model. */
  readonly schemaVersion: number;
  /** Content-addressable checksum of the shard data. */
  readonly checksum: string;
  /** Current writer lease, or `null` if no writer is active. */
  readonly writerLease: LeaseInfo | null;
  /** Current replication state, or `null` for standalone shards. */
  readonly replicationState: ReplicationState | null;
  /** Media root paths linked to assets within this shard. */
  readonly linkedMediaRoots: readonly string[];
  /** ISO 8601 creation timestamp. */
  readonly createdAt: string;
  /** ISO 8601 last-update timestamp. */
  readonly updatedAt: string;
}

// ─── Peer Info ────────────────────────────────────────────────────────────────

/**
 * Discovery and health information for a mesh peer node.
 */
export interface PeerInfo {
  /** Unique node identifier within the mesh. */
  readonly nodeId: string;
  /** Hostname or IP address of the peer. */
  readonly hostname: string;
  /** Port the peer is listening on. */
  readonly port: number;
  /** Current connectivity status. */
  readonly status: 'online' | 'offline' | 'syncing';
  /** ISO 8601 timestamp of the last heartbeat. */
  readonly lastSeen: string;
  /** Shard IDs hosted by this peer. */
  readonly shardIds: readonly string[];
  /** Feature capabilities advertised by this peer (e.g. `["search", "gpu-inference"]`). */
  readonly capabilities: readonly string[];
}

// ─── Mesh Event ───────────────────────────────────────────────────────────────

/**
 * An event emitted on the mesh event bus, used for peer discovery,
 * shard lifecycle notifications, and federated search coordination.
 */
export interface MeshEvent {
  /** Unique event identifier. */
  readonly id: string;
  /** Discriminated event type. */
  readonly type: MeshEventType;
  /** Node that originated this event. */
  readonly nodeId: string;
  /** Shard related to this event, or `null` for node-level events. */
  readonly shardId: string | null;
  /** Event-specific payload data. */
  readonly payload: Readonly<Record<string, unknown>>;
  /** ISO 8601 event timestamp. */
  readonly timestamp: string;
}
