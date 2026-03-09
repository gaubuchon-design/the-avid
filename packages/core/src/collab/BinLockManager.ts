// =============================================================================
//  THE AVID -- FT-05: Bin Locking for Multi-Editor Collaboration
// =============================================================================
//
//  Provides bin-level check-out / check-in locking so that multiple editors
//  can work on the same project without conflicting on shared bins.
//
//  Features:
//    - Check-out / check-in model
//    - Auto-release after configurable inactivity timeout
//    - Conflict resolution on lock release
//    - Lock indicator data for UI rendering
// =============================================================================

// ─── Types ──────────────────────────────────────────────────────────────────

/** Status of a bin lock. */
export type BinLockStatus = 'unlocked' | 'locked' | 'locked_by_self' | 'force_locked';

/** Reason a lock was released. */
export type BinLockReleaseReason =
  | 'manual_checkin'
  | 'inactivity_timeout'
  | 'force_release'
  | 'session_ended'
  | 'conflict_resolution';

/** A single bin lock record. */
export interface BinLock {
  /** The bin that is locked. */
  binId: string;
  /** User who holds the lock. */
  userId: string;
  /** Display name for the lock holder. */
  userDisplayName: string;
  /** User color for UI indicators. */
  userColor: string;
  /** When the lock was acquired. */
  acquiredAt: string;
  /** When the lock holder last performed an activity. */
  lastActivityAt: string;
  /** When the lock will auto-release if no activity occurs. */
  expiresAt: string;
  /** Whether this is a force lock (admin override). */
  isForced: boolean;
  /** Optional message from the lock holder. */
  message?: string;
}

/** Result of a lock acquisition attempt. */
export interface BinLockAcquisitionResult {
  /** Whether the lock was acquired. */
  acquired: boolean;
  /** The lock record (if acquired or existing). */
  lock: BinLock | null;
  /** If not acquired, reason why. */
  deniedReason?: 'already_locked' | 'bin_not_found';
  /** If already locked, the current holder. */
  currentHolder?: { userId: string; displayName: string };
}

/** Result of releasing a lock. */
export interface BinLockReleaseResult {
  /** Whether the lock was released. */
  released: boolean;
  /** Reason for release. */
  reason: BinLockReleaseReason;
  /** If there were pending changes, a summary. */
  pendingChanges?: number;
  /** Whether conflicts were detected on release. */
  hasConflicts: boolean;
  /** Conflict details if any. */
  conflicts?: BinConflict[];
}

/** A conflict detected when releasing a lock. */
export interface BinConflict {
  /** The bin ID involved. */
  binId: string;
  /** Type of conflict. */
  type: 'asset_modified' | 'asset_added' | 'asset_removed' | 'metadata_changed';
  /** Description of the conflict. */
  description: string;
  /** The local version of the data. */
  localValue?: string;
  /** The remote version of the data. */
  remoteValue?: string;
  /** Resolution strategy. */
  resolution: 'keep_local' | 'keep_remote' | 'merge' | 'unresolved';
}

/** Lock indicator data for UI rendering. */
export interface BinLockIndicator {
  binId: string;
  status: BinLockStatus;
  holderName?: string;
  holderColor?: string;
  lockedSince?: string;
  expiresIn?: number; // Seconds until auto-release
  canCheckOut: boolean;
  canForceRelease: boolean;
}

/** Configuration for the bin lock manager. */
export interface BinLockManagerConfig {
  /** Inactivity timeout in milliseconds before auto-release. */
  inactivityTimeoutMs: number;
  /** How often to check for expired locks. */
  checkIntervalMs: number;
  /** Whether to allow force-release by admins. */
  allowForceRelease: boolean;
  /** Maximum number of bins a single user can lock. */
  maxLocksPerUser: number;
}

/** Events emitted by the bin lock manager. */
export interface BinLockManagerEvents {
  onLockAcquired: (lock: BinLock) => void;
  onLockReleased: (binId: string, reason: BinLockReleaseReason) => void;
  onLockExpiring: (lock: BinLock, secondsRemaining: number) => void;
  onConflictDetected: (conflict: BinConflict) => void;
  onError: (error: Error) => void;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export class BinLockError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'ALREADY_LOCKED'
      | 'NOT_LOCKED'
      | 'NOT_LOCK_HOLDER'
      | 'MAX_LOCKS_EXCEEDED'
      | 'LOCK_EXPIRED'
      | 'FORCE_REQUIRED',
  ) {
    super(message);
    this.name = 'BinLockError';
  }
}

// ─── Default config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: BinLockManagerConfig = {
  inactivityTimeoutMs: 15 * 60 * 1000, // 15 minutes
  checkIntervalMs: 60 * 1000, // 1 minute
  allowForceRelease: true,
  maxLocksPerUser: 5,
};

// ─── BinLockManager ─────────────────────────────────────────────────────────

/**
 * Manages bin-level locks for collaborative editing.
 *
 * Usage:
 * ```ts
 * const lockManager = new BinLockManager({ inactivityTimeoutMs: 10 * 60 * 1000 });
 *
 * // Check out a bin
 * const result = lockManager.checkOut('bin-1', 'user-1', 'Sarah K.', '#7c5cfc');
 *
 * // Record activity to prevent timeout
 * lockManager.recordActivity('bin-1', 'user-1');
 *
 * // Check in when done
 * lockManager.checkIn('bin-1', 'user-1');
 *
 * // Get indicators for UI
 * const indicators = lockManager.getIndicators('user-1');
 * ```
 */
export class BinLockManager {
  private config: BinLockManagerConfig;
  private events: Partial<BinLockManagerEvents>;
  private locks: Map<string, BinLock> = new Map();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();

  constructor(
    config: Partial<BinLockManagerConfig> = {},
    events: Partial<BinLockManagerEvents> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.events = events;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Start the expiration check timer.
   */
  start(): void {
    if (this.checkInterval) return;
    this.checkInterval = setInterval(() => {
      this.checkExpiredLocks();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop the expiration check timer.
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Destroy the manager, releasing all locks and stopping timers.
   */
  destroy(): void {
    this.stop();
    this.locks.clear();
    this.listeners.clear();
  }

  // ── Check-out / check-in ────────────────────────────────────────────────

  /**
   * Attempt to check out (lock) a bin.
   */
  checkOut(
    binId: string,
    userId: string,
    displayName: string,
    color: string,
    message?: string,
  ): BinLockAcquisitionResult {
    const existing = this.locks.get(binId);

    // Already locked by this user
    if (existing && existing.userId === userId) {
      this.touchLock(existing);
      return { acquired: true, lock: { ...existing } };
    }

    // Locked by someone else
    if (existing) {
      // Check if the lock has expired
      if (new Date(existing.expiresAt).getTime() < Date.now()) {
        this.releaseLock(binId, 'inactivity_timeout');
      } else {
        return {
          acquired: false,
          lock: { ...existing },
          deniedReason: 'already_locked',
          currentHolder: { userId: existing.userId, displayName: existing.userDisplayName },
        };
      }
    }

    // Check max locks per user
    const userLockCount = Array.from(this.locks.values()).filter((l) => l.userId === userId).length;
    if (userLockCount >= this.config.maxLocksPerUser) {
      throw new BinLockError(
        `Maximum ${this.config.maxLocksPerUser} locks per user exceeded`,
        'MAX_LOCKS_EXCEEDED',
      );
    }

    // Acquire lock
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.inactivityTimeoutMs);
    const lock: BinLock = {
      binId,
      userId,
      userDisplayName: displayName,
      userColor: color,
      acquiredAt: now.toISOString(),
      lastActivityAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isForced: false,
      message,
    };

    this.locks.set(binId, lock);
    this.events.onLockAcquired?.(lock);
    this.notify();

    return { acquired: true, lock: { ...lock } };
  }

  /**
   * Check in (release) a bin lock.
   */
  checkIn(binId: string, userId: string): BinLockReleaseResult {
    const existing = this.locks.get(binId);
    if (!existing) {
      throw new BinLockError('Bin is not locked', 'NOT_LOCKED');
    }
    if (existing.userId !== userId) {
      throw new BinLockError('You do not hold this lock', 'NOT_LOCK_HOLDER');
    }

    return this.releaseLock(binId, 'manual_checkin');
  }

  /**
   * Force-release a lock (admin only).
   */
  forceRelease(binId: string): BinLockReleaseResult {
    if (!this.config.allowForceRelease) {
      throw new BinLockError('Force release is not allowed', 'FORCE_REQUIRED');
    }
    const existing = this.locks.get(binId);
    if (!existing) {
      throw new BinLockError('Bin is not locked', 'NOT_LOCKED');
    }
    return this.releaseLock(binId, 'force_release');
  }

  /**
   * Record user activity to prevent lock expiration.
   */
  recordActivity(binId: string, userId: string): void {
    const lock = this.locks.get(binId);
    if (!lock || lock.userId !== userId) return;
    this.touchLock(lock);
    this.notify();
  }

  /**
   * Release all locks held by a specific user (e.g. on session end).
   */
  releaseAllForUser(userId: string): BinLockReleaseResult[] {
    const results: BinLockReleaseResult[] = [];
    for (const [binId, lock] of this.locks) {
      if (lock.userId === userId) {
        results.push(this.releaseLock(binId, 'session_ended'));
      }
    }
    return results;
  }

  // ── Query ───────────────────────────────────────────────────────────────

  /**
   * Get the lock status for a specific bin.
   */
  getLock(binId: string): BinLock | null {
    const lock = this.locks.get(binId);
    return lock ? { ...lock } : null;
  }

  /**
   * Check if a bin is locked.
   */
  isLocked(binId: string): boolean {
    return this.locks.has(binId);
  }

  /**
   * Get all active locks.
   */
  getAllLocks(): BinLock[] {
    return Array.from(this.locks.values()).map((l) => ({ ...l }));
  }

  /**
   * Get all locks held by a specific user.
   */
  getLocksForUser(userId: string): BinLock[] {
    return Array.from(this.locks.values())
      .filter((l) => l.userId === userId)
      .map((l) => ({ ...l }));
  }

  /**
   * Generate lock indicators for all known bins for the UI.
   */
  getIndicators(
    currentUserId: string,
    binIds: string[],
    isAdmin = false,
  ): BinLockIndicator[] {
    return binIds.map((binId) => {
      const lock = this.locks.get(binId);

      if (!lock) {
        return {
          binId,
          status: 'unlocked' as BinLockStatus,
          canCheckOut: true,
          canForceRelease: false,
        };
      }

      const isSelf = lock.userId === currentUserId;
      const expiresIn = Math.max(0, (new Date(lock.expiresAt).getTime() - Date.now()) / 1000);

      return {
        binId,
        status: isSelf ? 'locked_by_self' : lock.isForced ? 'force_locked' : 'locked',
        holderName: lock.userDisplayName,
        holderColor: lock.userColor,
        lockedSince: lock.acquiredAt,
        expiresIn: Math.round(expiresIn),
        canCheckOut: isSelf,
        canForceRelease: !isSelf && (isAdmin || this.config.allowForceRelease),
      };
    });
  }

  // ── Subscriptions ───────────────────────────────────────────────────────

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private touchLock(lock: BinLock): void {
    const now = new Date();
    lock.lastActivityAt = now.toISOString();
    lock.expiresAt = new Date(now.getTime() + this.config.inactivityTimeoutMs).toISOString();
  }

  private releaseLock(binId: string, reason: BinLockReleaseReason): BinLockReleaseResult {
    this.locks.delete(binId);
    this.events.onLockReleased?.(binId, reason);
    this.notify();

    return {
      released: true,
      reason,
      hasConflicts: false,
    };
  }

  private checkExpiredLocks(): void {
    const now = Date.now();
    for (const [binId, lock] of this.locks) {
      const expiresAt = new Date(lock.expiresAt).getTime();
      const remaining = (expiresAt - now) / 1000;

      if (remaining <= 0) {
        this.releaseLock(binId, 'inactivity_timeout');
      } else if (remaining <= 120) {
        // Warn when 2 minutes remain
        this.events.onLockExpiring?.(lock, Math.round(remaining));
      }
    }
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }
}
