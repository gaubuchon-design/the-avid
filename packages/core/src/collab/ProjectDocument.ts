// ─── CRDT-based Project Document ─────────────────────────────────────────────
// Provides conflict-free collaborative editing of video project timelines.
//
// Uses two fundamental CRDT patterns implemented inline (no external library):
//   - LWW Register (Last-Writer-Wins) — for scalar fields (name, position, etc.)
//   - G-Set (Grow-Only Set) — for collections (tracks, clips) with tombstone deletion
//
// Every mutation produces a `ChangeEntry` with a Lamport timestamp so that
// changes can be replayed, merged, and synced across devices.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Foundational Types ─────────────────────────────────────────────────────

/** Globally unique identifier for a node (peer / device). */
export type NodeId = string;

/** Lamport logical timestamp — monotonically increasing per node. */
export type LamportTimestamp = number;

/**
 * HLC (Hybrid Logical Clock) combining wall-clock time and a logical counter.
 * Used as the ordering key for LWW registers. When two writes have the same
 * wall-clock millisecond, the `counter` breaks the tie.  If counters also
 * match, `nodeId` is used as a deterministic tiebreaker.
 */
export interface HLC {
  /** Wall-clock milliseconds (Date.now()). */
  wallMs: number;
  /** Monotonic counter within the same millisecond. */
  counter: number;
  /** Originating node so ties are deterministic. */
  nodeId: NodeId;
}

// ─── LWW Register ───────────────────────────────────────────────────────────

/**
 * A Last-Writer-Wins Register.  Stores a single value of type `T`.
 * On concurrent writes the write with the later `HLC` wins.
 *
 * @typeParam T  The payload type stored in this register.
 */
export interface LWWRegister<T> {
  value: T;
  /** The timestamp at which `value` was written. */
  timestamp: HLC;
}

/**
 * Compare two HLCs.  Returns a positive number if `a` is later than `b`,
 * negative if earlier, and 0 if identical.
 */
export function compareHLC(a: HLC, b: HLC): number {
  if (a.wallMs !== b.wallMs) return a.wallMs - b.wallMs;
  if (a.counter !== b.counter) return a.counter - b.counter;
  // Deterministic tiebreaker on nodeId (lexicographic).
  if (a.nodeId < b.nodeId) return -1;
  if (a.nodeId > b.nodeId) return 1;
  return 0;
}

/**
 * Create a new LWW register with an initial value.
 */
export function createLWW<T>(value: T, hlc: HLC): LWWRegister<T> {
  return { value, timestamp: hlc };
}

/**
 * Attempt to write a new value to an LWW register.
 * Only succeeds if `hlc` is strictly later than the current timestamp.
 *
 * @returns The (possibly updated) register.
 */
export function writeLWW<T>(reg: LWWRegister<T>, value: T, hlc: HLC): LWWRegister<T> {
  if (compareHLC(hlc, reg.timestamp) > 0) {
    return { value, timestamp: hlc };
  }
  return reg;
}

// ─── G-Set with Tombstones (2P-Set behaviour) ──────────────────────────────

/**
 * An element inside a G-Set.  Items are never physically removed; instead
 * `deleted` is flipped to `true` (tombstone pattern).
 *
 * @typeParam T  The payload type of each element.
 */
export interface GSetEntry<T> {
  id: string;
  data: LWWRegister<T>;
  /** When `true` the element has been logically deleted. */
  deleted: LWWRegister<boolean>;
}

/**
 * A Grow-Only Set with tombstone deletion.
 *
 * - `add` inserts a new element.
 * - `remove` sets the tombstone flag via LWW.
 * - `update` merges a new payload via LWW.
 * - `entries` returns only non-deleted elements.
 */
export class GSet<T> {
  private items: Map<string, GSetEntry<T>> = new Map();

  /** Add an element.  If the id already exists the write is ignored. */
  add(id: string, data: T, hlc: HLC): void {
    if (this.items.has(id)) return;
    this.items.set(id, {
      id,
      data: createLWW(data, hlc),
      deleted: createLWW(false, hlc),
    });
  }

  /** Tombstone-delete an element via LWW. */
  remove(id: string, hlc: HLC): void {
    const entry = this.items.get(id);
    if (!entry) return;
    entry.deleted = writeLWW(entry.deleted, true, hlc);
  }

  /** Update the payload of an existing (non-deleted) element via LWW. */
  update(id: string, data: T, hlc: HLC): void {
    const entry = this.items.get(id);
    if (!entry) return;
    entry.data = writeLWW(entry.data, data, hlc);
  }

  /** Return all live (non-deleted) elements. */
  entries(): GSetEntry<T>[] {
    const result: GSetEntry<T>[] = [];
    for (const entry of this.items.values()) {
      if (!entry.deleted.value) {
        result.push(entry);
      }
    }
    return result;
  }

  /** Return all elements including tombstoned ones (useful for sync). */
  allEntries(): GSetEntry<T>[] {
    return Array.from(this.items.values());
  }

  /** Get a single entry by id (including tombstoned). */
  get(id: string): GSetEntry<T> | undefined {
    return this.items.get(id);
  }

  /** Whether the set contains a live entry with the given id. */
  has(id: string): boolean {
    const entry = this.items.get(id);
    return entry !== undefined && !entry.deleted.value;
  }

  /** Number of live entries. */
  get size(): number {
    let count = 0;
    for (const entry of this.items.values()) {
      if (!entry.deleted.value) count++;
    }
    return count;
  }

  /**
   * Directly set an entry (used for snapshot restoration).
   * Bypasses the "already exists" check in `add`.
   */
  restoreEntry(id: string, data: LWWRegister<T>, deleted: LWWRegister<boolean>): void {
    this.items.set(id, { id, data, deleted });
  }

  /**
   * Merge another GSet into this one.  For each entry:
   *   - If the id is new, adopt it wholesale.
   *   - If the id exists, merge `data` and `deleted` via LWW.
   */
  merge(other: GSet<T>): void {
    for (const remote of other.allEntries()) {
      const local = this.items.get(remote.id);
      if (!local) {
        // New entry from remote — adopt directly.
        this.items.set(remote.id, {
          id: remote.id,
          data: { ...remote.data, timestamp: { ...remote.data.timestamp } },
          deleted: { ...remote.deleted, timestamp: { ...remote.deleted.timestamp } },
        });
      } else {
        // Existing entry — LWW merge both fields.
        local.data = writeLWW(local.data, remote.data.value, remote.data.timestamp);
        local.deleted = writeLWW(local.deleted, remote.deleted.value, remote.deleted.timestamp);
      }
    }
  }
}

// ─── Track & Clip Data Types ────────────────────────────────────────────────

/** The type of content a track carries. */
export type CollabTrackType = 'video' | 'audio' | 'effect' | 'subtitle' | 'graphic';

/** Payload stored inside the tracks G-Set. */
export interface CollabTrackData {
  name: string;
  type: CollabTrackType;
  sortOrder: number;
  muted: boolean;
  locked: boolean;
  solo: boolean;
  volume: number;
  color: string;
}

/** Payload stored inside the clips G-Set. */
export interface CollabClipData {
  trackId: string;
  assetId: string;
  /** Position on the timeline (seconds). */
  startTime: number;
  /** End position on the timeline (seconds). */
  endTime: number;
  /** Source-side trim from the beginning (seconds). */
  trimStart: number;
  /** Source-side trim from the end (seconds). */
  trimEnd: number;
  /** Playback speed multiplier. */
  speed: number;
  /** Optional display name. */
  name: string;
}

// ─── Change Entry ───────────────────────────────────────────────────────────

/**
 * Every mutation on a `ProjectDocument` produces a `ChangeEntry`.
 * These entries form the replayable operation log.
 */
export interface ChangeEntry {
  /** Unique id for this change. */
  id: string;
  /** Which node created this change. */
  nodeId: NodeId;
  /** HLC at the time of the change. */
  hlc: HLC;
  /** The type of operation. */
  operation: ChangeOperation;
  /** ISO-8601 wall-clock timestamp for display purposes. */
  createdAt: string;
}

export type ChangeOperation =
  | { type: 'addTrack'; trackId: string; data: CollabTrackData }
  | { type: 'removeTrack'; trackId: string }
  | { type: 'updateTrack'; trackId: string; data: Partial<CollabTrackData> }
  | { type: 'addClip'; clipId: string; data: CollabClipData }
  | { type: 'removeClip'; clipId: string }
  | { type: 'moveClip'; clipId: string; trackId: string; startTime: number; endTime: number }
  | { type: 'trimClip'; clipId: string; trimStart: number; trimEnd: number; startTime: number; endTime: number }
  | { type: 'splitClip'; originalClipId: string; newClipId: string; splitPoint: number }
  | { type: 'setMetadata'; key: string; value: unknown };

// ─── HLC Clock ──────────────────────────────────────────────────────────────

/**
 * A Hybrid Logical Clock implementation.
 *
 * Guarantees monotonically increasing HLC values even when the wall clock
 * drifts or multiple events occur in the same millisecond.
 */
export class HLClock {
  private wallMs: number;
  private counter: number;
  readonly nodeId: NodeId;

  constructor(nodeId: NodeId) {
    this.nodeId = nodeId;
    this.wallMs = Date.now();
    this.counter = 0;
  }

  /** Generate a new HLC that is guaranteed to be later than any previous one. */
  now(): HLC {
    const physical = Date.now();
    if (physical > this.wallMs) {
      this.wallMs = physical;
      this.counter = 0;
    } else {
      this.counter++;
    }
    return { wallMs: this.wallMs, counter: this.counter, nodeId: this.nodeId };
  }

  /**
   * Receive a remote HLC and update the local clock so that the next
   * `now()` call is guaranteed to be strictly later.
   */
  receive(remote: HLC): void {
    const physical = Date.now();
    if (physical > this.wallMs && physical > remote.wallMs) {
      this.wallMs = physical;
      this.counter = 0;
    } else if (remote.wallMs > this.wallMs) {
      this.wallMs = remote.wallMs;
      this.counter = remote.counter + 1;
    } else if (this.wallMs === remote.wallMs) {
      this.counter = Math.max(this.counter, remote.counter) + 1;
    } else {
      // local wall is ahead of both physical and remote — just bump counter
      this.counter++;
    }
  }
}

// ─── Project Document ───────────────────────────────────────────────────────

/**
 * A CRDT-based project document for conflict-free real-time collaboration.
 *
 * The document owns:
 *   - A set of metadata registers (project name, frame rate, etc.) stored as LWW.
 *   - A G-Set of tracks.
 *   - A G-Set of clips.
 *   - An append-only change log.
 *
 * All mutations go through named methods (`addTrack`, `moveClip`, etc.)
 * which update both the CRDT state and the change log atomically.
 *
 * Two documents can be merged by calling `merge(other)`, which reconciles
 * the CRDT state and replays any missing changes.
 *
 * @example
 * ```ts
 * const doc = new ProjectDocument('project-1', 'node-a');
 * doc.addTrack('t1', { name: 'V1', type: 'video', ... });
 * doc.addClip('c1', { trackId: 't1', assetId: 'a1', ... });
 * doc.moveClip('c1', 't1', 5.0, 10.0);
 * ```
 */
export class ProjectDocument {
  /** Unique project identifier. */
  readonly projectId: string;

  /** The local HLC clock. */
  readonly clock: HLClock;

  // ── CRDT state ──────────────────────────────────────────────────────────

  /** Metadata fields stored as LWW registers. */
  private metadata: Map<string, LWWRegister<unknown>> = new Map();

  /** All tracks in the project. */
  readonly tracks: GSet<CollabTrackData> = new GSet();

  /** All clips in the project. */
  readonly clips: GSet<CollabClipData> = new GSet();

  // ── Change log ──────────────────────────────────────────────────────────

  private changeLog: ChangeEntry[] = [];

  /** Monotonic counter for generating unique change IDs within this node. */
  private changeSeq = 0;

  constructor(projectId: string, nodeId: NodeId) {
    this.projectId = projectId;
    this.clock = new HLClock(nodeId);
  }

  // ── Metadata accessors ─────────────────────────────────────────────────

  /**
   * Set a metadata field (e.g. "name", "frameRate", "resolution").
   * Uses LWW so concurrent writes to the same key resolve deterministically.
   */
  setMetadata(key: string, value: unknown): ChangeEntry {
    const hlc = this.clock.now();
    const existing = this.metadata.get(key);
    if (existing) {
      this.metadata.set(key, writeLWW(existing, value, hlc));
    } else {
      this.metadata.set(key, createLWW(value, hlc));
    }
    return this.recordChange(hlc, { type: 'setMetadata', key, value });
  }

  /** Read a metadata value.  Returns `undefined` if the key has never been set. */
  getMetadata<T = unknown>(key: string): T | undefined {
    const reg = this.metadata.get(key);
    return reg ? (reg.value as T) : undefined;
  }

  /** Return all metadata keys and their current values. */
  getAllMetadata(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, reg] of this.metadata) {
      result[key] = reg.value;
    }
    return result;
  }

  /**
   * Return all metadata entries as LWW registers.
   * Useful for merging with another document.
   */
  getMetadataRegisters(): ReadonlyMap<string, LWWRegister<unknown>> {
    return this.metadata;
  }

  // ── Track operations ───────────────────────────────────────────────────

  /**
   * Add a new track to the project.
   *
   * @param trackId  Unique identifier for the track.
   * @param data     Track properties (name, type, etc.).
   * @returns The change entry recording this operation.
   */
  addTrack(trackId: string, data: CollabTrackData): ChangeEntry {
    const hlc = this.clock.now();
    this.tracks.add(trackId, data, hlc);
    return this.recordChange(hlc, { type: 'addTrack', trackId, data });
  }

  /**
   * Remove (tombstone) a track and all clips that belong to it.
   */
  removeTrack(trackId: string): ChangeEntry {
    const hlc = this.clock.now();
    this.tracks.remove(trackId, hlc);

    // Also tombstone all clips on this track.
    for (const entry of this.clips.entries()) {
      if (entry.data.value.trackId === trackId) {
        this.clips.remove(entry.id, hlc);
      }
    }
    return this.recordChange(hlc, { type: 'removeTrack', trackId });
  }

  // ── Clip operations ────────────────────────────────────────────────────

  /**
   * Add a new clip to a track.
   *
   * @param clipId  Unique identifier for the clip.
   * @param data    Clip properties (trackId, startTime, etc.).
   * @returns The change entry recording this operation.
   */
  addClip(clipId: string, data: CollabClipData): ChangeEntry {
    const hlc = this.clock.now();
    this.clips.add(clipId, data, hlc);
    return this.recordChange(hlc, { type: 'addClip', clipId, data });
  }

  /**
   * Remove (tombstone) a clip.
   */
  removeClip(clipId: string): ChangeEntry {
    const hlc = this.clock.now();
    this.clips.remove(clipId, hlc);
    return this.recordChange(hlc, { type: 'removeClip', clipId });
  }

  /**
   * Move a clip to a new track and/or timeline position.
   *
   * @param clipId     The clip to move.
   * @param trackId    Target track id.
   * @param startTime  New start position (seconds).
   * @param endTime    New end position (seconds).
   */
  moveClip(clipId: string, trackId: string, startTime: number, endTime: number): ChangeEntry {
    const hlc = this.clock.now();
    const entry = this.clips.get(clipId);
    if (entry && !entry.deleted.value) {
      const updated: CollabClipData = {
        ...entry.data.value,
        trackId,
        startTime,
        endTime,
      };
      this.clips.update(clipId, updated, hlc);
    }
    return this.recordChange(hlc, { type: 'moveClip', clipId, trackId, startTime, endTime });
  }

  /**
   * Trim a clip by adjusting its source-side in/out points and corresponding
   * timeline positions.
   *
   * @param clipId      The clip to trim.
   * @param trimStart   New source trim-in (seconds).
   * @param trimEnd     New source trim-out (seconds).
   * @param startTime   New timeline start (seconds).
   * @param endTime     New timeline end (seconds).
   */
  trimClip(
    clipId: string,
    trimStart: number,
    trimEnd: number,
    startTime: number,
    endTime: number,
  ): ChangeEntry {
    const hlc = this.clock.now();
    const entry = this.clips.get(clipId);
    if (entry && !entry.deleted.value) {
      const updated: CollabClipData = {
        ...entry.data.value,
        trimStart,
        trimEnd,
        startTime,
        endTime,
      };
      this.clips.update(clipId, updated, hlc);
    }
    return this.recordChange(hlc, {
      type: 'trimClip',
      clipId,
      trimStart,
      trimEnd,
      startTime,
      endTime,
    });
  }

  /**
   * Split a clip at a given timeline point, producing two clips.
   *
   * The original clip is shortened to end at `splitPoint`.
   * A new clip is created starting at `splitPoint` with the remaining duration.
   *
   * @param originalClipId  The clip to split.
   * @param newClipId       Id for the newly created second half.
   * @param splitPoint      Timeline position (seconds) at which to split.
   */
  splitClip(originalClipId: string, newClipId: string, splitPoint: number): ChangeEntry {
    const hlc = this.clock.now();
    const entry = this.clips.get(originalClipId);

    if (entry && !entry.deleted.value) {
      const original = entry.data.value;

      // Validate split point is within the clip.
      if (splitPoint <= original.startTime || splitPoint >= original.endTime) {
        // Out of range — record the change for the log but do not mutate state.
        return this.recordChange(hlc, {
          type: 'splitClip',
          originalClipId,
          newClipId,
          splitPoint,
        });
      }

      const originalDuration = original.endTime - original.startTime;
      const leftDuration = splitPoint - original.startTime;
      const rightDuration = originalDuration - leftDuration;

      // Update the original clip to end at the split point.
      const leftData: CollabClipData = {
        ...original,
        endTime: splitPoint,
        trimEnd: original.trimEnd + rightDuration / (original.speed || 1),
      };
      this.clips.update(originalClipId, leftData, hlc);

      // Create the right-side clip.
      const rightData: CollabClipData = {
        ...original,
        startTime: splitPoint,
        trimStart: original.trimStart + leftDuration / (original.speed || 1),
      };
      this.clips.add(newClipId, rightData, hlc);
    }

    return this.recordChange(hlc, {
      type: 'splitClip',
      originalClipId,
      newClipId,
      splitPoint,
    });
  }

  // ── Change log ─────────────────────────────────────────────────────────

  /**
   * Return all changes recorded in this document, ordered chronologically.
   */
  getChangeLog(): readonly ChangeEntry[] {
    return this.changeLog;
  }

  /**
   * Return changes recorded after a given HLC (exclusive).
   * Useful for delta sync — only send what the remote is missing.
   */
  getChangesSince(since: HLC): ChangeEntry[] {
    return this.changeLog.filter((c) => compareHLC(c.hlc, since) > 0);
  }

  // ── Merge ──────────────────────────────────────────────────────────────

  /**
   * Merge another `ProjectDocument` into this one.
   *
   * - CRDT state (tracks, clips, metadata) is merged via LWW / G-Set rules.
   * - The change log is union-merged and de-duplicated by `id`.
   * - The local HLC is advanced past any remote HLC.
   */
  merge(other: ProjectDocument): void {
    // Merge metadata registers.
    for (const [key, remote] of other.getMetadataRegisters()) {
      const local = this.metadata.get(key);
      if (!local) {
        this.metadata.set(key, { value: remote.value, timestamp: { ...remote.timestamp } });
      } else {
        this.metadata.set(key, writeLWW(local, remote.value, remote.timestamp));
      }
      this.clock.receive(remote.timestamp);
    }

    // Merge tracks and clips G-Sets.
    this.tracks.merge(other.tracks);
    this.clips.merge(other.clips);

    // Merge change logs (de-duplicate by id).
    const existingIds = new Set(this.changeLog.map((c) => c.id));
    for (const entry of other.getChangeLog()) {
      this.clock.receive(entry.hlc);
      if (!existingIds.has(entry.id)) {
        this.changeLog.push(entry);
      }
    }

    // Re-sort the change log by HLC.
    this.changeLog.sort((a, b) => compareHLC(a.hlc, b.hlc));
  }

  // ── Snapshot (serialisation) ───────────────────────────────────────────

  /**
   * Serialise the full document state to a plain JSON-compatible object.
   * Used for persistence and snapshot-based versioning.
   */
  toSnapshot(): ProjectDocumentSnapshot {
    return {
      projectId: this.projectId,
      nodeId: this.clock.nodeId,
      metadata: Object.fromEntries(
        Array.from(this.metadata.entries()).map(
          ([k, v]) => [k, { value: v.value, timestamp: v.timestamp }] as const,
        ),
      ),
      tracks: this.tracks.allEntries().map((e) => ({
        id: e.id,
        data: e.data,
        deleted: e.deleted,
      })),
      clips: this.clips.allEntries().map((e) => ({
        id: e.id,
        data: e.data,
        deleted: e.deleted,
      })),
      changeLog: [...this.changeLog],
      changeSeq: this.changeSeq,
    };
  }

  /**
   * Restore a document from a previously-created snapshot.
   *
   * @returns A new `ProjectDocument` populated with the snapshot data.
   */
  static fromSnapshot(snapshot: ProjectDocumentSnapshot): ProjectDocument {
    const doc = new ProjectDocument(snapshot.projectId, snapshot.nodeId);

    // Restore metadata.
    for (const [key, reg] of Object.entries(snapshot.metadata)) {
      const register = reg as LWWRegister<unknown>;
      doc.restoreMetadataRegister(key, {
        value: register.value,
        timestamp: { ...register.timestamp },
      });
      doc.clock.receive(register.timestamp);
    }

    // Restore tracks.
    for (const entry of snapshot.tracks) {
      doc.tracks.restoreEntry(
        entry.id,
        { value: entry.data.value, timestamp: { ...entry.data.timestamp } },
        { value: entry.deleted.value, timestamp: { ...entry.deleted.timestamp } },
      );
      doc.clock.receive(entry.data.timestamp);
      doc.clock.receive(entry.deleted.timestamp);
    }

    // Restore clips.
    for (const entry of snapshot.clips) {
      doc.clips.restoreEntry(
        entry.id,
        { value: entry.data.value, timestamp: { ...entry.data.timestamp } },
        { value: entry.deleted.value, timestamp: { ...entry.deleted.timestamp } },
      );
      doc.clock.receive(entry.data.timestamp);
      doc.clock.receive(entry.deleted.timestamp);
    }

    // Restore change log.
    doc.restoreChangeLog(snapshot.changeLog, snapshot.changeSeq);

    // Advance the clock past all changes.
    for (const change of snapshot.changeLog) {
      doc.clock.receive(change.hlc);
    }

    return doc;
  }

  // ── Internal restoration helpers ─────────────────────────────────────

  /**
   * Restore a single metadata register from a snapshot.
   * Used by `fromSnapshot` — not intended for external use.
   */
  restoreMetadataRegister(key: string, register: LWWRegister<unknown>): void {
    this.metadata.set(key, register);
  }

  /**
   * Restore the change log and sequence counter from a snapshot.
   * Used by `fromSnapshot` — not intended for external use.
   */
  restoreChangeLog(log: ChangeEntry[], seq: number): void {
    this.changeLog = [...log];
    this.changeSeq = seq;
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /** Record a change in the log and return the entry. */
  private recordChange(hlc: HLC, operation: ChangeOperation): ChangeEntry {
    this.changeSeq++;
    const entry: ChangeEntry = {
      id: `${this.clock.nodeId}:${this.changeSeq}`,
      nodeId: this.clock.nodeId,
      hlc,
      operation,
      createdAt: new Date(hlc.wallMs).toISOString(),
    };
    this.changeLog.push(entry);
    return entry;
  }
}

// ─── Snapshot Type ──────────────────────────────────────────────────────────

/**
 * Serialisable representation of a `ProjectDocument`'s full state.
 * Can be persisted to disk, stored in a database, or transmitted over the wire.
 */
export interface ProjectDocumentSnapshot {
  projectId: string;
  nodeId: NodeId;
  metadata: Record<string, LWWRegister<unknown>>;
  tracks: Array<{
    id: string;
    data: LWWRegister<CollabTrackData>;
    deleted: LWWRegister<boolean>;
  }>;
  clips: Array<{
    id: string;
    data: LWWRegister<CollabClipData>;
    deleted: LWWRegister<boolean>;
  }>;
  changeLog: ChangeEntry[];
  changeSeq: number;
}
