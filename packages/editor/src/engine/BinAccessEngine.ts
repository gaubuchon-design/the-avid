// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Bin Access Engine
// ═══════════════════════════════════════════════════════════════════════════
//
// Manages per-bin access control for collaborative editing:
//  - Share/unshare bins with specific users at granular access levels
//  - Query effective permissions for any user on any bin
//  - Public bin flag for open-access bins
//  - Subscriber/notify pattern for UI reactivity
//

// ─── Types ──────────────────────────────────────────────────────────────────

export type BinAccessLevel = 'read' | 'write' | 'lock' | 'admin';

export interface BinShareEntry {
  userId: string;
  displayName: string;
  accessLevel: BinAccessLevel;
  sharedAt: number;
}

export interface BinShare {
  binId: string;
  sharedWith: BinShareEntry[];
  isPublic: boolean;
}

// ─── Access level hierarchy ─────────────────────────────────────────────────

const ACCESS_HIERARCHY: Record<BinAccessLevel, number> = {
  read: 0,
  write: 1,
  lock: 2,
  admin: 3,
};

function hasAtLeast(current: BinAccessLevel, required: BinAccessLevel): boolean {
  return ACCESS_HIERARCHY[current] >= ACCESS_HIERARCHY[required];
}

// ─── Subscriber type ────────────────────────────────────────────────────────

type Subscriber = () => void;

// ─── BinAccessEngine ────────────────────────────────────────────────────────

export class BinAccessEngine {
  private shares = new Map<string, BinShare>();
  private subscribers = new Set<Subscriber>();

  // ── Sharing ───────────────────────────────────────────────────────────

  /**
   * Share a bin with a user at the given access level.
   * If the user already has access, their level is updated.
   */
  shareBin(
    binId: string,
    userId: string,
    displayName: string,
    level: BinAccessLevel,
  ): void {
    let share = this.shares.get(binId);

    if (!share) {
      share = { binId, sharedWith: [], isPublic: false };
      this.shares.set(binId, share);
    }

    const existing = share.sharedWith.find((e) => e.userId === userId);

    if (existing) {
      existing.accessLevel = level;
      existing.displayName = displayName;
    } else {
      share.sharedWith.push({
        userId,
        displayName,
        accessLevel: level,
        sharedAt: Date.now(),
      });
    }

    this.notify();
  }

  /**
   * Remove a user's access to a bin.
   */
  unshareBin(binId: string, userId: string): void {
    const share = this.shares.get(binId);
    if (!share) return;

    share.sharedWith = share.sharedWith.filter((e) => e.userId !== userId);

    // Clean up empty shares that are also not public
    if (share.sharedWith.length === 0 && !share.isPublic) {
      this.shares.delete(binId);
    }

    this.notify();
  }

  // ── Queries ───────────────────────────────────────────────────────────

  /**
   * Return the full share record for a bin, or undefined if not shared.
   */
  getShares(binId: string): BinShare | undefined {
    return this.shares.get(binId);
  }

  /**
   * Return the effective access level for a user on a bin, or null if
   * the user has no access.
   */
  getAccessLevel(binId: string, userId: string): BinAccessLevel | null {
    const share = this.shares.get(binId);
    if (!share) return null;

    // Public bins grant read to everyone
    if (share.isPublic) {
      const explicit = share.sharedWith.find((e) => e.userId === userId);
      if (explicit) return explicit.accessLevel;
      return 'read';
    }

    const entry = share.sharedWith.find((e) => e.userId === userId);
    return entry ? entry.accessLevel : null;
  }

  /**
   * Can the user write to this bin?
   * Requires at least 'write' access.
   */
  canWrite(binId: string, userId: string): boolean {
    const level = this.getAccessLevel(binId, userId);
    if (!level) return false;
    return hasAtLeast(level, 'write');
  }

  /**
   * Can the user lock this bin?
   * Requires at least 'lock' access.
   */
  canLock(binId: string, userId: string): boolean {
    const level = this.getAccessLevel(binId, userId);
    if (!level) return false;
    return hasAtLeast(level, 'lock');
  }

  /**
   * Is this bin shared with anyone (or public)?
   */
  isShared(binId: string): boolean {
    const share = this.shares.get(binId);
    if (!share) return false;
    return share.isPublic || share.sharedWith.length > 0;
  }

  /**
   * Return all bins that a given user has access to.
   */
  getSharedBinsForUser(userId: string): BinShare[] {
    const result: BinShare[] = [];

    for (const share of this.shares.values()) {
      if (share.isPublic) {
        result.push(share);
        continue;
      }
      if (share.sharedWith.some((e) => e.userId === userId)) {
        result.push(share);
      }
    }

    return result;
  }

  // ── Public flag ───────────────────────────────────────────────────────

  /**
   * Mark a bin as publicly accessible (read-only to anyone).
   */
  setPublic(binId: string, isPublic: boolean): void {
    let share = this.shares.get(binId);

    if (!share) {
      share = { binId, sharedWith: [], isPublic };
      this.shares.set(binId, share);
    } else {
      share.isPublic = isPublic;
    }

    // Clean up if no longer shared and not public
    if (!share.isPublic && share.sharedWith.length === 0) {
      this.shares.delete(binId);
    }

    this.notify();
  }

  // ── Subscribe / Notify ────────────────────────────────────────────────

  /**
   * Register a callback that fires whenever sharing state changes.
   * Returns an unsubscribe function.
   */
  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  private notify(): void {
    for (const fn of this.subscribers) {
      try {
        fn();
      } catch {
        // Subscriber errors must not break the engine
      }
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const binAccessEngine = new BinAccessEngine();
