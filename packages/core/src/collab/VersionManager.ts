// ─── Version Manager ────────────────────────────────────────────────────────
// Provides snapshot-based versioning with incremental change tracking,
// conflict resolution, and offline disaster recovery for collaborative
// video editing projects.
//
// Architecture:
//   - **VersionSnapshot**: A full serialisation of the project state at a
//     point in time.
//   - **VersionChain**: A linked list of snapshots with incremental
//     `ChangeEntry` deltas between them.
//   - **ConflictResolver**: Detects overlapping edits and provides both
//     automatic and manual resolution strategies.
//   - **OfflineRecovery**: Manages the local replica and can rebuild
//     project state from snapshots + deltas.
// ─────────────────────────────────────────────────────────────────────────────

import type { NodeId, ChangeEntry, HLC, ProjectDocumentSnapshot } from './ProjectDocument';
import { compareHLC } from './ProjectDocument';
import type { VectorClock } from './SyncProtocol';
import { mergeVectorClocks, dominates, isConcurrent } from './SyncProtocol';

// ─── Version Snapshot ───────────────────────────────────────────────────────

/**
 * A full project state captured at a specific moment.
 * Snapshots serve as checkpoints from which the project can be restored
 * or from which incremental deltas can be computed.
 */
export interface VersionSnapshot {
  /** Unique snapshot identifier. */
  id: string;
  /** Human-readable name (e.g. "Director's Cut v2"). */
  name: string;
  /** Optional description / notes. */
  description: string;
  /** The user who created this snapshot. */
  createdBy: NodeId;
  /** ISO-8601 timestamp. */
  createdAt: string;
  /** The full project document state. */
  documentSnapshot: ProjectDocumentSnapshot;
  /** The vector clock at the time of the snapshot. */
  vectorClock: VectorClock;
  /** Id of the parent snapshot (forming the version chain). `null` for the root. */
  parentSnapshotId: string | null;
  /** Optional tags for filtering / grouping. */
  tags: string[];
}

// ─── Version Chain Link ─────────────────────────────────────────────────────

/**
 * Connects two adjacent snapshots in the version chain.
 * Stores the incremental changes between them so that full snapshots
 * do not need to be stored for every save.
 */
export interface VersionChainLink {
  /** The snapshot this link points FROM. */
  fromSnapshotId: string;
  /** The snapshot this link points TO. */
  toSnapshotId: string;
  /** The incremental changes between the two snapshots. */
  changes: ChangeEntry[];
}

// ─── Conflict Types ─────────────────────────────────────────────────────────

/** Identifies which resource was edited concurrently. */
export interface ConflictTarget {
  /** The type of resource involved. */
  resourceType: 'track' | 'clip' | 'metadata';
  /** The id of the resource. */
  resourceId: string;
  /** The specific field that was modified (e.g. "startTime", "name"). */
  field?: string;
}

/** The resolution strategy chosen for a conflict. */
export type ConflictResolution =
  | { strategy: 'accept-local' }
  | { strategy: 'accept-remote' }
  | { strategy: 'accept-value'; value: unknown }
  | { strategy: 'merge-both' };

/**
 * Represents a detected conflict between two concurrent edits.
 */
export interface EditConflict {
  /** Unique conflict id. */
  id: string;
  /** What was edited. */
  target: ConflictTarget;
  /** The local change. */
  localChange: ChangeEntry;
  /** The remote change. */
  remoteChange: ChangeEntry;
  /** Whether this conflict has been resolved. */
  resolved: boolean;
  /** The resolution chosen, if any. */
  resolution?: ConflictResolution;
  /** Auto-resolved conflicts do not need user intervention. */
  autoResolved: boolean;
}

// ─── Conflict Resolver ──────────────────────────────────────────────────────

/**
 * Detects and resolves conflicts between concurrent edits.
 *
 * **Automatic resolution** (non-overlapping edits):
 *   - Different resources -> no conflict.
 *   - Same resource, different fields -> merge both.
 *   - Same resource, same field -> LWW (later HLC wins).
 *
 * **Manual resolution** (overlapping edits that LWW cannot cleanly resolve):
 *   - Same clip with incompatible positional changes (move + trim).
 *   - Split clip where the original was also modified remotely.
 *
 * @example
 * ```ts
 * const resolver = new ConflictResolver();
 * const conflicts = resolver.detect(localChanges, remoteChanges);
 * for (const c of conflicts) {
 *   if (!c.autoResolved) {
 *     // Present to user
 *   }
 * }
 * ```
 */
export class ConflictResolver {
  private conflictSeq = 0;

  /**
   * Detect conflicts between a batch of local and remote changes.
   *
   * @param localChanges   Changes from the local document.
   * @param remoteChanges  Changes received from a remote peer.
   * @returns An array of detected conflicts, some of which may already be auto-resolved.
   */
  detect(localChanges: ChangeEntry[], remoteChanges: ChangeEntry[]): EditConflict[] {
    const conflicts: EditConflict[] = [];

    for (const local of localChanges) {
      for (const remote of remoteChanges) {
        // Only check for conflicts between concurrent changes.
        if (local.nodeId === remote.nodeId) continue;

        const localTarget = this.extractTarget(local);
        const remoteTarget = this.extractTarget(remote);
        if (!localTarget || !remoteTarget) continue;

        // Different resources -> no conflict.
        if (
          localTarget.resourceType !== remoteTarget.resourceType ||
          localTarget.resourceId !== remoteTarget.resourceId
        ) {
          continue;
        }

        // Same resource — check field overlap.
        const conflict = this.createConflict(local, remote, localTarget, remoteTarget);
        if (conflict) {
          conflicts.push(conflict);
        }
      }
    }

    return conflicts;
  }

  /**
   * Resolve a conflict with the given strategy.
   *
   * @param conflict    The conflict to resolve.
   * @param resolution  The chosen resolution.
   * @returns The updated conflict (marked resolved).
   */
  resolve(conflict: EditConflict, resolution: ConflictResolution): EditConflict {
    return {
      ...conflict,
      resolved: true,
      resolution,
      autoResolved: false,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /**
   * Extract the conflict target from a change entry.
   */
  private extractTarget(change: ChangeEntry): ConflictTarget | null {
    const op = change.operation;
    switch (op.type) {
      case 'addTrack':
      case 'removeTrack':
      case 'updateTrack':
        return { resourceType: 'track', resourceId: op.trackId };
      case 'addClip':
      case 'removeClip':
        return {
          resourceType: 'clip',
          resourceId: op.type === 'addClip' ? op.clipId : op.clipId,
        };
      case 'moveClip':
        return { resourceType: 'clip', resourceId: op.clipId, field: 'position' };
      case 'trimClip':
        return { resourceType: 'clip', resourceId: op.clipId, field: 'trim' };
      case 'splitClip':
        return { resourceType: 'clip', resourceId: op.originalClipId, field: 'split' };
      case 'setMetadata':
        return { resourceType: 'metadata', resourceId: op.key };
      default:
        return null;
    }
  }

  /**
   * Create a conflict if two changes are actually conflicting.
   */
  private createConflict(
    local: ChangeEntry,
    remote: ChangeEntry,
    localTarget: ConflictTarget,
    remoteTarget: ConflictTarget,
  ): EditConflict | null {
    this.conflictSeq++;
    const id = `conflict:${this.conflictSeq}`;

    // Same resource, different fields -> auto-merge.
    if (localTarget.field && remoteTarget.field && localTarget.field !== remoteTarget.field) {
      return {
        id,
        target: localTarget,
        localChange: local,
        remoteChange: remote,
        resolved: true,
        resolution: { strategy: 'merge-both' },
        autoResolved: true,
      };
    }

    // Same field or no field specified -> check if LWW can resolve.
    const hlcComparison = compareHLC(local.hlc, remote.hlc);
    if (hlcComparison !== 0) {
      // LWW can resolve deterministically.
      const winner = hlcComparison > 0 ? 'accept-local' : 'accept-remote';
      return {
        id,
        target: localTarget,
        localChange: local,
        remoteChange: remote,
        resolved: true,
        resolution: { strategy: winner },
        autoResolved: true,
      };
    }

    // Identical HLC (extremely unlikely but possible) — needs manual resolution.
    return {
      id,
      target: localTarget,
      localChange: local,
      remoteChange: remote,
      resolved: false,
      autoResolved: false,
    };
  }
}

// ─── Version Manager ────────────────────────────────────────────────────────

/** Configuration for the `VersionManager`. */
export interface VersionManagerConfig {
  /** Maximum number of snapshots to retain in memory (default: 50). */
  maxSnapshots?: number;
  /**
   * Number of changes between automatic snapshots (default: 100).
   * Set to 0 to disable auto-snapshots.
   */
  autoSnapshotThreshold?: number;
  /**
   * Maximum number of changes to keep in the pending buffer before
   * forcing a snapshot (default: 500).
   */
  maxPendingChanges?: number;
}

/**
 * Manages project version history with snapshot-based checkpointing,
 * incremental change tracking, conflict resolution, and offline
 * disaster recovery.
 *
 * Key features:
 *   - **Snapshot chain**: An ordered list of full project snapshots linked
 *     by incremental change deltas.
 *   - **Auto-snapshot**: After a configurable number of changes, a snapshot
 *     is automatically created.
 *   - **Conflict detection**: Uses `ConflictResolver` when merging remote
 *     changes.
 *   - **Offline DR**: The local replica (latest snapshot + pending changes)
 *     can be used to rebuild the project if the remote is lost.
 *
 * @example
 * ```ts
 * const vm = new VersionManager('node-a');
 * vm.createSnapshot('snap-1', 'Initial', '', documentSnapshot, vectorClock);
 * vm.recordChange(changeEntry);
 * // After many changes...
 * vm.createSnapshot('snap-2', 'After edits', '', documentSnapshot, vectorClock);
 * // Recover from offline:
 * const recovery = vm.getRecoveryBundle();
 * ```
 */
export class VersionManager {
  readonly nodeId: NodeId;
  private config: Required<VersionManagerConfig>;
  private snapshots: Map<string, VersionSnapshot> = new Map();
  private chainLinks: VersionChainLink[] = [];
  private pendingChanges: ChangeEntry[] = [];
  private latestSnapshotId: string | null = null;
  private snapshotOrder: string[] = [];

  readonly conflictResolver: ConflictResolver;

  constructor(nodeId: NodeId, config?: VersionManagerConfig) {
    this.nodeId = nodeId;
    this.conflictResolver = new ConflictResolver();
    this.config = {
      maxSnapshots: config?.maxSnapshots ?? 50,
      autoSnapshotThreshold: config?.autoSnapshotThreshold ?? 100,
      maxPendingChanges: config?.maxPendingChanges ?? 500,
    };
  }

  // ── Snapshot Management ────────────────────────────────────────────────

  /**
   * Create a new version snapshot.
   *
   * @param id                Unique snapshot id.
   * @param name              Human-readable name.
   * @param description       Description / notes.
   * @param documentSnapshot  Full project document state.
   * @param vectorClock       Current vector clock.
   * @param tags              Optional tags.
   * @returns The created snapshot.
   */
  createSnapshot(
    id: string,
    name: string,
    description: string,
    documentSnapshot: ProjectDocumentSnapshot,
    vectorClock: VectorClock,
    tags: string[] = [],
  ): VersionSnapshot {
    const snapshot: VersionSnapshot = {
      id,
      name,
      description,
      createdBy: this.nodeId,
      createdAt: new Date().toISOString(),
      documentSnapshot,
      vectorClock: { ...vectorClock },
      parentSnapshotId: this.latestSnapshotId,
      tags,
    };

    // Create chain link from previous snapshot if one exists.
    if (this.latestSnapshotId) {
      this.chainLinks.push({
        fromSnapshotId: this.latestSnapshotId,
        toSnapshotId: id,
        changes: [...this.pendingChanges],
      });
    }

    this.snapshots.set(id, snapshot);
    this.snapshotOrder.push(id);
    this.latestSnapshotId = id;
    this.pendingChanges = [];

    // Evict old snapshots if over the limit (keep the most recent).
    this.evictOldSnapshots();

    return snapshot;
  }

  /**
   * Record a change entry.  If auto-snapshot threshold is reached, returns
   * `true` to signal the caller should create a snapshot.
   */
  recordChange(change: ChangeEntry): boolean {
    this.pendingChanges.push(change);

    const threshold = this.config.autoSnapshotThreshold;
    if (threshold > 0 && this.pendingChanges.length >= threshold) {
      return true; // Signal: caller should create a snapshot.
    }
    if (this.pendingChanges.length >= this.config.maxPendingChanges) {
      return true;
    }
    return false;
  }

  /**
   * Record multiple change entries at once.
   * Returns `true` if a snapshot should be created.
   */
  recordChanges(changes: ChangeEntry[]): boolean {
    let shouldSnapshot = false;
    for (const change of changes) {
      if (this.recordChange(change)) {
        shouldSnapshot = true;
      }
    }
    return shouldSnapshot;
  }

  // ── Retrieval ──────────────────────────────────────────────────────────

  /**
   * Get a specific snapshot by id.
   */
  getSnapshot(id: string): VersionSnapshot | undefined {
    return this.snapshots.get(id);
  }

  /**
   * Get the most recent snapshot.
   */
  getLatestSnapshot(): VersionSnapshot | undefined {
    return this.latestSnapshotId ? this.snapshots.get(this.latestSnapshotId) : undefined;
  }

  /**
   * Get all snapshots in chronological order (oldest first).
   */
  getAllSnapshots(): VersionSnapshot[] {
    return this.snapshotOrder
      .map((id) => this.snapshots.get(id))
      .filter((s): s is VersionSnapshot => s !== undefined);
  }

  /**
   * Get the changes between two snapshots.
   * Returns `undefined` if no direct chain link exists.
   */
  getChangesBetween(fromSnapshotId: string, toSnapshotId: string): ChangeEntry[] | undefined {
    const link = this.chainLinks.find(
      (l) => l.fromSnapshotId === fromSnapshotId && l.toSnapshotId === toSnapshotId,
    );
    return link?.changes;
  }

  /**
   * Get changes that have been recorded since the last snapshot.
   */
  getPendingChanges(): readonly ChangeEntry[] {
    return this.pendingChanges;
  }

  /**
   * Get the full version chain (ordered list of chain links).
   */
  getVersionChain(): readonly VersionChainLink[] {
    return this.chainLinks;
  }

  // ── Conflict Detection ─────────────────────────────────────────────────

  /**
   * Detect conflicts between local pending changes and a batch of
   * incoming remote changes.
   *
   * @param remoteChanges  Changes received from a remote peer.
   * @returns Detected conflicts (some auto-resolved, some requiring manual input).
   */
  detectConflicts(remoteChanges: ChangeEntry[]): EditConflict[] {
    return this.conflictResolver.detect(this.pendingChanges, remoteChanges);
  }

  // ── Offline Disaster Recovery ──────────────────────────────────────────

  /**
   * A recovery bundle containing everything needed to rebuild the project
   * state from a client's local data.
   */
  getRecoveryBundle(): RecoveryBundle {
    return {
      latestSnapshot: this.getLatestSnapshot() ?? null,
      pendingChanges: [...this.pendingChanges],
      allSnapshots: this.getAllSnapshots(),
      chainLinks: [...this.chainLinks],
      nodeId: this.nodeId,
      recoveredAt: new Date().toISOString(),
    };
  }

  /**
   * Restore the version manager state from a recovery bundle.
   * Used when coming back online after an extended offline period.
   *
   * @param bundle  The recovery bundle (typically from local storage).
   */
  restoreFromBundle(bundle: RecoveryBundle): void {
    this.snapshots.clear();
    this.snapshotOrder = [];
    this.chainLinks = [];
    this.pendingChanges = [];
    this.latestSnapshotId = null;

    for (const snapshot of bundle.allSnapshots) {
      this.snapshots.set(snapshot.id, snapshot);
      this.snapshotOrder.push(snapshot.id);
    }

    this.chainLinks = [...bundle.chainLinks];
    this.pendingChanges = [...bundle.pendingChanges];

    if (bundle.latestSnapshot) {
      this.latestSnapshotId = bundle.latestSnapshot.id;
    } else if (this.snapshotOrder.length > 0) {
      this.latestSnapshotId = this.snapshotOrder[this.snapshotOrder.length - 1];
    }
  }

  /**
   * Determine whether a full re-sync is needed by comparing the local
   * vector clock against a remote vector clock.
   *
   * @param localClock   The local vector clock.
   * @param remoteClock  The remote peer's vector clock.
   * @returns An object describing the sync strategy.
   */
  determineSyncStrategy(
    localClock: VectorClock,
    remoteClock: VectorClock,
  ): SyncStrategy {
    if (dominates(localClock, remoteClock)) {
      return { type: 'local-ahead', description: 'Local is ahead — push changes to remote.' };
    }
    if (dominates(remoteClock, localClock)) {
      return { type: 'remote-ahead', description: 'Remote is ahead — pull changes from remote.' };
    }
    if (isConcurrent(localClock, remoteClock)) {
      return {
        type: 'concurrent',
        description: 'Concurrent edits detected — delta sync with conflict resolution required.',
      };
    }
    return { type: 'in-sync', description: 'Both replicas are up to date.' };
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /**
   * Evict the oldest snapshots when the limit is exceeded.
   * Always keeps the latest snapshot.
   */
  private evictOldSnapshots(): void {
    while (this.snapshotOrder.length > this.config.maxSnapshots) {
      const oldestId = this.snapshotOrder.shift();
      if (oldestId && oldestId !== this.latestSnapshotId) {
        this.snapshots.delete(oldestId);
        // Remove chain links that reference the evicted snapshot.
        this.chainLinks = this.chainLinks.filter(
          (link) => link.fromSnapshotId !== oldestId,
        );
      }
    }
  }
}

// ─── Recovery Bundle ────────────────────────────────────────────────────────

/**
 * Contains everything a client needs to restore the project after being
 * offline or recovering from a crash.
 */
export interface RecoveryBundle {
  /** The most recent snapshot. */
  latestSnapshot: VersionSnapshot | null;
  /** Changes recorded after the latest snapshot. */
  pendingChanges: ChangeEntry[];
  /** All available snapshots in order. */
  allSnapshots: VersionSnapshot[];
  /** Links between adjacent snapshots. */
  chainLinks: VersionChainLink[];
  /** The node that produced this bundle. */
  nodeId: NodeId;
  /** ISO-8601 timestamp of when the bundle was created. */
  recoveredAt: string;
}

// ─── Sync Strategy ──────────────────────────────────────────────────────────

/**
 * Describes the recommended sync approach after comparing vector clocks.
 */
export interface SyncStrategy {
  type: 'local-ahead' | 'remote-ahead' | 'concurrent' | 'in-sync';
  description: string;
}
