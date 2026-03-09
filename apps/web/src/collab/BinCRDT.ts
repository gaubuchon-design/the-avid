// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Bin CRDT
// ═══════════════════════════════════════════════════════════════════════════
//
// Operation-based CRDT for concurrent bin edits. Uses a Hybrid Logical
// Clock (HLC) for deterministic causal ordering across nodes:
//
//  - Each mutation is recorded as a `BinOp` stamped with an HLC
//  - Operations are commutative & idempotent after merge
//  - State is computed by replaying the ordered op log
//  - `compact()` prunes redundant sequences (add → remove)
//

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HLC {
  wallMs: number;
  counter: number;
  nodeId: string;
}

export type BinOp =
  | {
      type: 'add-asset';
      assetId: string;
      position: number;
      assetData: any;
      hlc: HLC;
    }
  | {
      type: 'remove-asset';
      assetId: string;
      hlc: HLC;
    }
  | {
      type: 'move-asset';
      assetId: string;
      newPosition: number;
      hlc: HLC;
    }
  | {
      type: 'rename-asset';
      assetId: string;
      newName: string;
      hlc: HLC;
    }
  | {
      type: 'update-metadata';
      assetId: string;
      field: string;
      value: unknown;
      hlc: HLC;
    };

// ─── Internal asset state ───────────────────────────────────────────────────

interface AssetState {
  assetId: string;
  position: number;
  name?: string;
  data?: any;
  metadata: Record<string, unknown>;
  removed: boolean;
}

// ─── BinCRDT ────────────────────────────────────────────────────────────────

export class BinCRDT {
  private operations: BinOp[] = [];
  private hlc: HLC;

  /** Set of op identities we have already applied (dedup). */
  private appliedSet = new Set<string>();

  constructor(nodeId: string) {
    this.hlc = { wallMs: Date.now(), counter: 0, nodeId };
  }

  // ── HLC operations ────────────────────────────────────────────────────

  /**
   * Advance the local HLC and return the new timestamp.
   */
  tick(): HLC {
    const now = Date.now();
    if (now > this.hlc.wallMs) {
      this.hlc = { wallMs: now, counter: 0, nodeId: this.hlc.nodeId };
    } else {
      this.hlc = {
        wallMs: this.hlc.wallMs,
        counter: this.hlc.counter + 1,
        nodeId: this.hlc.nodeId,
      };
    }
    return { ...this.hlc };
  }

  /**
   * Merge a remote HLC into the local clock (Lamport-style).
   * Returns the updated local HLC.
   */
  receive(remoteHlc: HLC): HLC {
    const now = Date.now();
    const maxWall = Math.max(now, this.hlc.wallMs, remoteHlc.wallMs);

    if (maxWall === this.hlc.wallMs && maxWall === remoteHlc.wallMs) {
      // Same wall time on all three — advance counter past both
      this.hlc = {
        wallMs: maxWall,
        counter: Math.max(this.hlc.counter, remoteHlc.counter) + 1,
        nodeId: this.hlc.nodeId,
      };
    } else if (maxWall === this.hlc.wallMs) {
      this.hlc = {
        wallMs: maxWall,
        counter: this.hlc.counter + 1,
        nodeId: this.hlc.nodeId,
      };
    } else if (maxWall === remoteHlc.wallMs) {
      this.hlc = {
        wallMs: maxWall,
        counter: remoteHlc.counter + 1,
        nodeId: this.hlc.nodeId,
      };
    } else {
      // now is the largest
      this.hlc = { wallMs: maxWall, counter: 0, nodeId: this.hlc.nodeId };
    }

    return { ...this.hlc };
  }

  /**
   * Deterministic total-order comparison of two HLCs.
   * Returns -1, 0, or 1.
   */
  compareHLC(a: HLC, b: HLC): number {
    if (a.wallMs !== b.wallMs) return a.wallMs < b.wallMs ? -1 : 1;
    if (a.counter !== b.counter) return a.counter < b.counter ? -1 : 1;
    if (a.nodeId < b.nodeId) return -1;
    if (a.nodeId > b.nodeId) return 1;
    return 0;
  }

  // ── Operations ────────────────────────────────────────────────────────

  /**
   * Apply a single operation to the log.
   * Duplicate operations (same HLC identity) are ignored.
   */
  apply(op: BinOp): void {
    const key = this.opKey(op);
    if (this.appliedSet.has(key)) return;

    this.appliedSet.add(key);
    this.operations.push(op);

    // Keep ops sorted by HLC for deterministic replay
    this.operations.sort((a, b) => this.compareHLC(a.hlc, b.hlc));

    // Advance local clock past the incoming op
    this.receive(op.hlc);
  }

  /**
   * Merge a set of remote operations into the local log.
   * Returns which ops were actually applied and which conflicted.
   *
   * A "conflict" is defined as two concurrent ops that touch the same
   * asset with incompatible intents (e.g., two moves to different
   * positions). In a true CRDT the last-writer-wins, but we surface
   * the conflict so the UI can display a resolution prompt.
   */
  merge(remoteOps: BinOp[]): { applied: BinOp[]; conflicts: BinOp[] } {
    const applied: BinOp[] = [];
    const conflicts: BinOp[] = [];

    for (const remoteOp of remoteOps) {
      const key = this.opKey(remoteOp);
      if (this.appliedSet.has(key)) continue;

      // Detect conflicts: concurrent ops on the same asset with
      // incompatible types
      const concurrent = this.operations.filter(
        (local) =>
          local.assetId === remoteOp.assetId &&
          this.compareHLC(local.hlc, remoteOp.hlc) !== 0 &&
          this.isConflicting(local, remoteOp),
      );

      if (concurrent.length > 0) {
        conflicts.push(remoteOp);
      }

      // Apply regardless — last-writer-wins semantics
      this.apply(remoteOp);
      applied.push(remoteOp);
    }

    return { applied, conflicts };
  }

  // ── State computation ─────────────────────────────────────────────────

  /**
   * Compute current bin state by replaying the ordered op log.
   */
  getState(): { assetId: string; position: number; name?: string; data?: any }[] {
    const assets = new Map<string, AssetState>();

    for (const op of this.operations) {
      switch (op.type) {
        case 'add-asset': {
          // If asset was previously removed and re-added, honor the add
          const existing = assets.get(op.assetId);
          if (existing && !existing.removed) break; // already exists
          assets.set(op.assetId, {
            assetId: op.assetId,
            position: op.position,
            data: op.assetData,
            metadata: {},
            removed: false,
          });
          break;
        }

        case 'remove-asset': {
          const asset = assets.get(op.assetId);
          if (asset) asset.removed = true;
          break;
        }

        case 'move-asset': {
          const asset = assets.get(op.assetId);
          if (asset && !asset.removed) {
            asset.position = op.newPosition;
          }
          break;
        }

        case 'rename-asset': {
          const asset = assets.get(op.assetId);
          if (asset && !asset.removed) {
            asset.name = op.newName;
          }
          break;
        }

        case 'update-metadata': {
          const asset = assets.get(op.assetId);
          if (asset && !asset.removed) {
            asset.metadata[op.field] = op.value;
          }
          break;
        }
      }
    }

    // Collect non-removed assets, sorted by position
    return Array.from(assets.values())
      .filter((a) => !a.removed)
      .sort((a, b) => a.position - b.position)
      .map((a) => ({
        assetId: a.assetId,
        position: a.position,
        ...(a.name !== undefined ? { name: a.name } : {}),
        ...(a.data !== undefined ? { data: a.data } : {}),
        ...(Object.keys(a.metadata).length > 0 ? { metadata: a.metadata } : {}),
      }));
  }

  /**
   * Get all operations since a given HLC (exclusive).
   * If no HLC is provided, returns all operations.
   */
  getOps(sinceHlc?: HLC): BinOp[] {
    if (!sinceHlc) return [...this.operations];

    return this.operations.filter(
      (op) => this.compareHLC(op.hlc, sinceHlc) > 0,
    );
  }

  /**
   * Compact the operation log by removing redundant sequences.
   * Examples:
   *   - add-asset followed by remove-asset = both pruned
   *   - Multiple move-asset on same id = only keep last
   *   - Multiple rename-asset on same id = only keep last
   *   - Multiple update-metadata on same id+field = only keep last
   */
  compact(): void {
    // Identify removed asset ids (assets that end up removed)
    const removedIds = new Set<string>();
    for (const op of this.operations) {
      if (op.type === 'remove-asset') {
        removedIds.add(op.assetId);
      }
    }

    // First pass: remove all ops for assets that were removed
    let remaining = this.operations.filter((op) => {
      if (removedIds.has(op.assetId)) return false;
      return true;
    });

    // Second pass: for each asset, keep only the last move/rename/metadata-per-field
    const lastMove = new Map<string, BinOp>();
    const lastRename = new Map<string, BinOp>();
    const lastMeta = new Map<string, BinOp>(); // key: assetId::field

    // Walk forward to find the last of each
    for (const op of remaining) {
      if (op.type === 'move-asset') lastMove.set(op.assetId, op);
      if (op.type === 'rename-asset') lastRename.set(op.assetId, op);
      if (op.type === 'update-metadata') lastMeta.set(`${op.assetId}::${op.field}`, op);
    }

    const keepSet = new Set<BinOp>();

    for (const op of remaining) {
      if (op.type === 'add-asset') {
        keepSet.add(op);
      } else if (op.type === 'move-asset') {
        if (lastMove.get(op.assetId) === op) keepSet.add(op);
      } else if (op.type === 'rename-asset') {
        if (lastRename.get(op.assetId) === op) keepSet.add(op);
      } else if (op.type === 'update-metadata') {
        if (lastMeta.get(`${op.assetId}::${op.field}`) === op) keepSet.add(op);
      } else {
        keepSet.add(op);
      }
    }

    remaining = remaining.filter((op) => keepSet.has(op));

    // Rebuild applied set
    this.appliedSet.clear();
    for (const op of remaining) {
      this.appliedSet.add(this.opKey(op));
    }

    this.operations = remaining;
  }

  // ── Private helpers ───────────────────────────────────────────────────

  /**
   * Generate a unique identity key for an operation (for dedup).
   */
  private opKey(op: BinOp): string {
    return `${op.hlc.nodeId}:${op.hlc.wallMs}:${op.hlc.counter}:${op.type}:${op.assetId}`;
  }

  /**
   * Determine if two ops on the same asset are conflicting.
   */
  private isConflicting(a: BinOp, b: BinOp): boolean {
    // Different types: move + rename is not a conflict
    if (a.type !== b.type) {
      // remove vs anything = conflict
      if (a.type === 'remove-asset' || b.type === 'remove-asset') return true;
      return false;
    }

    // Same type on same asset:
    switch (a.type) {
      case 'move-asset':
        // Two moves to different positions
        return (
          b.type === 'move-asset' &&
          (a as Extract<BinOp, { type: 'move-asset' }>).newPosition !==
            (b as Extract<BinOp, { type: 'move-asset' }>).newPosition
        );

      case 'rename-asset':
        return (
          b.type === 'rename-asset' &&
          (a as Extract<BinOp, { type: 'rename-asset' }>).newName !==
            (b as Extract<BinOp, { type: 'rename-asset' }>).newName
        );

      case 'update-metadata':
        // Conflict only if same field with different values
        if (b.type !== 'update-metadata') return false;
        {
          const am = a as Extract<BinOp, { type: 'update-metadata' }>;
          const bm = b as Extract<BinOp, { type: 'update-metadata' }>;
          return am.field === bm.field && am.value !== bm.value;
        }

      default:
        return false;
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Create a new BinCRDT instance scoped to a node.
 */
export function createBinCRDT(nodeId: string): BinCRDT {
  return new BinCRDT(nodeId);
}
