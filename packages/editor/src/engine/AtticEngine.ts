// =============================================================================
//  THE AVID -- Attic Engine (Auto-Save Backup System)
// =============================================================================
//
// Implements Avid Media Composer's Attic feature: an automatic background
// snapshot system that preserves rolling project state to IndexedDB.
//
//  - Auto-save at configurable intervals (default: every 5 minutes)
//  - Save on key events: visibility change (blur), beforeunload
//  - Rolling history with configurable max snapshots (default: 20)
//  - IndexedDB persistence via inline idb-keyval wrapper (no external deps)
//  - Full project state serialisation from the Zustand editor store
//  - Snapshot listing, restore, delete, and pruning
//
// =============================================================================

import { useEditorStore } from '../store/editor.store';

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single Attic snapshot representing a saved project state. */
export interface AtticSnapshot {
  /** Unique identifier for this snapshot. */
  id: string;
  /** The project this snapshot belongs to. */
  projectId: string;
  /** Unix-epoch milliseconds when the snapshot was taken. */
  timestamp: number;
  /** Human-readable description of what triggered the save. */
  description: string;
  /** Serialised editor store state (JSON string). */
  stateJson: string;
  /** Schema version for migration compatibility. */
  version: number;
}

/** Configuration for the Attic auto-save system. */
export interface AtticConfig {
  /** Interval in milliseconds between auto-saves. Default: 300000 (5 min). */
  autoSaveIntervalMs: number;
  /** Maximum number of snapshots to retain per project. Default: 20. */
  maxSnapshots: number;
  /** Whether the Attic system is enabled. */
  enabled: boolean;
}

/** Summary info returned for UI listing (excludes bulky stateJson). */
export interface AtticSnapshotSummary {
  id: string;
  projectId: string;
  timestamp: number;
  description: string;
  version: number;
  /** Approximate size of the serialised state in bytes. */
  sizeBytes: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Current snapshot schema version. Increment when state shape changes. */
const ATTIC_SCHEMA_VERSION = 1;

/** IndexedDB database name for Attic storage. */
const DB_NAME = 'the-avid-attic';

/** IndexedDB object store name. */
const STORE_NAME = 'snapshots';

/** Default configuration values. */
const DEFAULT_CONFIG: AtticConfig = {
  autoSaveIntervalMs: 300_000, // 5 minutes
  maxSnapshots: 20,
  enabled: true,
};

// ─── IndexedDB Wrapper (inline idb-keyval pattern) ──────────────────────────

/**
 * Minimal IndexedDB wrapper providing get/set/delete/getAll operations.
 *
 * All operations return promises and handle database lifecycle internally.
 * Uses a single object store with out-of-line keys (snapshot IDs).
 */
class AtticDB {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /** Open (or reuse) the IndexedDB connection. */
  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('[AtticDB] IndexedDB is not available'));
        return;
      }

      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('projectId', 'projectId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  /** Execute a read/write transaction against the object store. */
  private async withStore<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = fn(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /** Store a snapshot. */
  async put(snapshot: AtticSnapshot): Promise<void> {
    await this.withStore('readwrite', (store) => store.put(snapshot));
  }

  /** Retrieve a snapshot by ID. */
  async get(id: string): Promise<AtticSnapshot | undefined> {
    return this.withStore('readonly', (store) => store.get(id));
  }

  /** Delete a snapshot by ID. */
  async delete(id: string): Promise<void> {
    await this.withStore('readwrite', (store) => store.delete(id));
  }

  /** Get all snapshots for a given project, sorted by timestamp descending. */
  async getAllForProject(projectId: string): Promise<AtticSnapshot[]> {
    const db = await this.open();
    return new Promise<AtticSnapshot[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('projectId');
      const request = index.getAll(projectId);
      request.onsuccess = () => {
        const results = (request.result as AtticSnapshot[]) ?? [];
        results.sort((a, b) => b.timestamp - a.timestamp);
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /** Close the database connection and reset the cached promise. */
  close(): void {
    if (this.dbPromise) {
      this.dbPromise.then((db) => db.close()).catch(() => {});
      this.dbPromise = null;
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function createSnapshotId(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `attic-${globalThis.crypto.randomUUID()}`;
  }
  return `attic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Serialise the current editor store state into a JSON string.
 *
 * Extracts only the data fields (tracks, clips, playhead, etc.) and
 * omits function references and transient UI state that cannot be
 * round-tripped through JSON.
 */
function serializeEditorState(): string {
  const state = useEditorStore.getState();

  // Extract serialisable data -- omit functions and transient state
  const serialisable: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (typeof value !== 'function') {
      serialisable[key] = value;
    }
  }

  return JSON.stringify(serialisable);
}

/**
 * Approximate byte size of a string (UTF-16 code units * 2).
 */
function byteSize(str: string): number {
  return str.length * 2;
}

// =============================================================================
//  AtticEngine
// =============================================================================

/**
 * Avid-style Attic (auto-save backup) engine.
 *
 * Manages a rolling history of project state snapshots persisted to
 * IndexedDB.  Provides auto-save at configurable intervals, event-driven
 * saves (page blur, beforeunload), snapshot listing for recovery UI, and
 * restore/delete/prune operations.
 *
 * Exported as a singleton (`atticEngine`) following the pattern of other
 * engines in the codebase.
 */
export class AtticEngine {
  /** Current configuration. */
  private config: AtticConfig = { ...DEFAULT_CONFIG };
  /** The project currently being watched. */
  private currentProjectId: string | null = null;
  /** Handle for the auto-save interval timer. */
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  /** IndexedDB wrapper instance. */
  private db = new AtticDB();
  /** Whether initialization has completed. */
  private initialized = false;
  /** Bound event handler references (for removal on destroy). */
  private boundVisibilityHandler: (() => void) | null = null;
  private boundBeforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;
  /** General subscribers notified on snapshot mutations. */
  private listeners = new Set<() => void>();
  /** Guard against concurrent saves. */
  private saving = false;
  /** Timestamp of the last successful save (for debouncing). */
  private lastSaveTimestamp = 0;
  /** Minimum ms between saves to prevent rapid-fire writes. */
  private readonly MIN_SAVE_INTERVAL_MS = 5_000;

  // ─── Private helpers ──────────────────────────────────────────────────

  /** Notify all subscribers that snapshot state has changed. */
  private notify(): void {
    this.listeners.forEach((fn) => {
      try { fn(); } catch (err) { console.error('[AtticEngine] Subscriber error:', err); }
    });
  }

  /** Start the auto-save interval timer. */
  private startAutoSaveTimer(): void {
    this.stopAutoSaveTimer();
    if (!this.config.enabled || this.config.autoSaveIntervalMs <= 0) return;

    this.autoSaveTimer = setInterval(() => {
      this.saveSnapshot('Auto-save').catch((err) => {
        console.error('[AtticEngine] Auto-save failed:', err);
      });
    }, this.config.autoSaveIntervalMs);
  }

  /** Stop the auto-save interval timer. */
  private stopAutoSaveTimer(): void {
    if (this.autoSaveTimer !== null) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /** Register page visibility and beforeunload listeners. */
  private attachBrowserListeners(): void {
    this.detachBrowserListeners();

    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    // Visibility change: save when the user tabs away or minimises
    this.boundVisibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        this.saveSnapshot('Visibility change (page hidden)').catch((err) => {
          console.error('[AtticEngine] Visibility-change save failed:', err);
        });
      }
    };
    document.addEventListener('visibilitychange', this.boundVisibilityHandler);

    // Before unload: last-chance save when closing / navigating away
    this.boundBeforeUnloadHandler = (_e: BeforeUnloadEvent) => {
      // Use synchronous-ish save attempt via navigator.sendBeacon fallback.
      // IndexedDB writes are async, so we fire-and-forget here.
      this.saveSnapshotSync('Before unload');
    };
    window.addEventListener('beforeunload', this.boundBeforeUnloadHandler);
  }

  /** Remove browser event listeners. */
  private detachBrowserListeners(): void {
    if (typeof document !== 'undefined' && this.boundVisibilityHandler) {
      document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
      this.boundVisibilityHandler = null;
    }
    if (typeof window !== 'undefined' && this.boundBeforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.boundBeforeUnloadHandler);
      this.boundBeforeUnloadHandler = null;
    }
  }

  /**
   * Best-effort synchronous save for beforeunload.
   *
   * IndexedDB is async, so this fires the write without awaiting.
   * In most browsers the IDB transaction will complete if the page
   * is kept alive long enough (which is typical for beforeunload).
   */
  private saveSnapshotSync(description: string): void {
    if (!this.config.enabled || !this.currentProjectId) return;

    try {
      const stateJson = serializeEditorState();
      const snapshot: AtticSnapshot = {
        id: createSnapshotId(),
        projectId: this.currentProjectId,
        timestamp: Date.now(),
        description,
        stateJson,
        version: ATTIC_SCHEMA_VERSION,
      };

      // Fire and forget -- no await
      this.db.put(snapshot).catch((err) => {
        console.error('[AtticEngine] Sync save failed:', err);
      });
    } catch (err) {
      console.error('[AtticEngine] Sync save serialisation error:', err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Initialization
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Initialize the Attic engine for a specific project.
   *
   * Starts auto-save timers and attaches browser event listeners.
   * If already initialized for a different project, the previous
   * session is cleanly torn down first.
   *
   * @param projectId  The unique identifier for the current project.
   */
  initialize(projectId: string): void {
    if (this.initialized && this.currentProjectId === projectId) {
      return; // Already watching this project
    }

    // Tear down any previous session
    if (this.initialized) {
      this.destroy();
    }

    this.currentProjectId = projectId;
    this.initialized = true;

    if (this.config.enabled) {
      this.startAutoSaveTimer();
      this.attachBrowserListeners();
    }

    console.info(`[AtticEngine] Initialized for project "${projectId}"`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Snapshot Operations
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Save a snapshot of the current project state.
   *
   * Serialises the full Zustand editor store and persists it to IndexedDB.
   * Automatically prunes old snapshots beyond `maxSnapshots`.
   *
   * @param description  Human-readable label for why this save happened.
   * @returns The created snapshot summary, or null if save was skipped.
   */
  async saveSnapshot(description?: string): Promise<AtticSnapshotSummary | null> {
    if (!this.config.enabled || !this.currentProjectId) {
      return null;
    }

    // Debounce: skip if saved too recently
    const now = Date.now();
    if (now - this.lastSaveTimestamp < this.MIN_SAVE_INTERVAL_MS) {
      return null;
    }

    // Prevent concurrent saves
    if (this.saving) {
      return null;
    }
    this.saving = true;

    try {
      const stateJson = serializeEditorState();

      const snapshot: AtticSnapshot = {
        id: createSnapshotId(),
        projectId: this.currentProjectId,
        timestamp: now,
        description: description ?? 'Manual save',
        stateJson,
        version: ATTIC_SCHEMA_VERSION,
      };

      await this.db.put(snapshot);
      this.lastSaveTimestamp = now;

      // Prune excess snapshots
      await this.pruneOldSnapshots(this.currentProjectId);

      this.notify();

      return {
        id: snapshot.id,
        projectId: snapshot.projectId,
        timestamp: snapshot.timestamp,
        description: snapshot.description,
        version: snapshot.version,
        sizeBytes: byteSize(stateJson),
      };
    } catch (err) {
      console.error('[AtticEngine] Save failed:', err);
      return null;
    } finally {
      this.saving = false;
    }
  }

  /**
   * List all snapshots for a project, newest first.
   *
   * Returns summaries (without the bulky stateJson) for UI display.
   *
   * @param projectId  The project to list snapshots for.
   * @returns Array of snapshot summaries sorted by timestamp descending.
   */
  async listSnapshots(projectId: string): Promise<AtticSnapshotSummary[]> {
    try {
      const snapshots = await this.db.getAllForProject(projectId);
      return snapshots.map((s) => ({
        id: s.id,
        projectId: s.projectId,
        timestamp: s.timestamp,
        description: s.description,
        version: s.version,
        sizeBytes: byteSize(s.stateJson),
      }));
    } catch (err) {
      console.error('[AtticEngine] List failed:', err);
      return [];
    }
  }

  /**
   * Restore the editor store state from a specific snapshot.
   *
   * Deserialises the snapshot's stateJson and applies it to the Zustand
   * editor store via `setState`.  A pre-restore snapshot is automatically
   * saved so the user can undo the restore if needed.
   *
   * @param snapshotId  The snapshot ID to restore.
   * @returns true if restore succeeded, false otherwise.
   */
  async restoreSnapshot(snapshotId: string): Promise<boolean> {
    try {
      const snapshot = await this.db.get(snapshotId);
      if (!snapshot) {
        console.warn(`[AtticEngine] Snapshot '${snapshotId}' not found`);
        return false;
      }

      // Save current state before restoring so the user can undo
      await this.saveSnapshot('Pre-restore backup');

      // Parse the saved state
      const restoredState = JSON.parse(snapshot.stateJson);

      // Apply to the Zustand store (partial merge, preserving functions)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic state merging requires runtime type checks
      const currentState = useEditorStore.getState() as any;
      const patch: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(restoredState)) {
        // Only restore data fields, skip anything that is currently a function
        if (typeof currentState[key] !== 'function') {
          patch[key] = value;
        }
      }

      useEditorStore.setState(patch);

      this.notify();
      console.info(`[AtticEngine] Restored snapshot '${snapshotId}' from ${new Date(snapshot.timestamp).toLocaleString()}`);
      return true;
    } catch (err) {
      console.error('[AtticEngine] Restore failed:', err);
      return false;
    }
  }

  /**
   * Delete a specific snapshot from IndexedDB.
   *
   * @param snapshotId  The snapshot ID to delete.
   */
  async deleteSnapshot(snapshotId: string): Promise<void> {
    try {
      await this.db.delete(snapshotId);
      this.notify();
    } catch (err) {
      console.error('[AtticEngine] Delete failed:', err);
    }
  }

  /**
   * Prune old snapshots for a project, keeping only the most recent
   * `maxSnapshots` entries.
   *
   * @param projectId  The project to prune snapshots for.
   */
  async pruneOldSnapshots(projectId: string): Promise<void> {
    try {
      const snapshots = await this.db.getAllForProject(projectId);

      if (snapshots.length <= this.config.maxSnapshots) {
        return; // Nothing to prune
      }

      // snapshots are sorted newest-first from getAllForProject
      const toDelete = snapshots.slice(this.config.maxSnapshots);
      for (const snapshot of toDelete) {
        await this.db.delete(snapshot.id);
      }

      if (toDelete.length > 0) {
        this.notify();
      }
    } catch (err) {
      console.error('[AtticEngine] Prune failed:', err);
    }
  }

  /**
   * Delete all snapshots for a project.
   *
   * @param projectId  The project whose snapshots should be cleared.
   */
  async clearAllSnapshots(projectId: string): Promise<void> {
    try {
      const snapshots = await this.db.getAllForProject(projectId);
      for (const snapshot of snapshots) {
        await this.db.delete(snapshot.id);
      }
      this.notify();
    } catch (err) {
      console.error('[AtticEngine] Clear all failed:', err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Configuration
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get the current Attic configuration.
   *
   * @returns A copy of the current AtticConfig.
   */
  getConfig(): AtticConfig {
    return { ...this.config };
  }

  /**
   * Update the Attic configuration.
   *
   * Partial updates are merged with the existing config.  If `enabled`
   * is toggled or the interval changes, timers and listeners are
   * restarted accordingly.
   *
   * @param config  Partial configuration to merge.
   */
  setConfig(config: Partial<AtticConfig>): void {
    const wasEnabled = this.config.enabled;
    const prevInterval = this.config.autoSaveIntervalMs;

    this.config = { ...this.config, ...config };

    // Handle enable/disable transitions
    if (this.initialized) {
      if (!wasEnabled && this.config.enabled) {
        // Was disabled, now enabled
        this.startAutoSaveTimer();
        this.attachBrowserListeners();
      } else if (wasEnabled && !this.config.enabled) {
        // Was enabled, now disabled
        this.stopAutoSaveTimer();
        this.detachBrowserListeners();
      } else if (this.config.enabled && this.config.autoSaveIntervalMs !== prevInterval) {
        // Interval changed while enabled -- restart timer
        this.startAutoSaveTimer();
      }
    }

    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Queries
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get the project ID currently being watched.
   *
   * @returns The current project ID, or null if not initialized.
   */
  getCurrentProjectId(): string | null {
    return this.currentProjectId;
  }

  /**
   * Check whether the Attic engine is currently initialized and running.
   *
   * @returns true if initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check whether auto-save is currently active.
   *
   * @returns true if the auto-save timer is running.
   */
  isAutoSaveActive(): boolean {
    return this.autoSaveTimer !== null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Manual Save Triggers
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Save a snapshot before a major editing operation.
   *
   * Call this from edit commands (e.g., before splice-in, extract, etc.)
   * to create a safety net the user can recover from via the Attic UI.
   *
   * @param operationName  Description of the pending operation.
   * @returns The created snapshot summary, or null.
   */
  async saveBeforeEdit(operationName: string): Promise<AtticSnapshotSummary | null> {
    return this.saveSnapshot(`Before: ${operationName}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Subscribe
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to Attic state changes (snapshot create/delete/restore).
   *
   * @param cb  Callback invoked on any mutation.
   * @returns An unsubscribe function.
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Cleanup
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Stop all auto-save activity, remove event listeners, and close the
   * IndexedDB connection.
   *
   * Does NOT delete existing snapshots -- they remain available for
   * recovery on next session.
   */
  destroy(): void {
    this.stopAutoSaveTimer();
    this.detachBrowserListeners();
    this.db.close();
    this.currentProjectId = null;
    this.initialized = false;
    this.saving = false;
    this.lastSaveTimestamp = 0;
    this.listeners.clear();
    console.info('[AtticEngine] Destroyed');
  }

  /**
   * Full teardown including clearing all listeners.
   * Primarily useful for tests.
   */
  dispose(): void {
    this.destroy();
  }
}

/** Singleton Attic engine instance. */
export const atticEngine = new AtticEngine();
