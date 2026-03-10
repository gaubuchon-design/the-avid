/**
 * @fileoverview In-memory mock of {@link IMediaComposerAdapter}.
 *
 * Maintains a fully mutable timeline model with tracks, clips, bins, and a
 * playhead so that the agentic editing engine can be developed and demoed
 * without a running Media Composer instance.
 *
 * ## State Machine
 *
 * The adapter follows a lifecycle state machine:
 *
 * ```
 *   idle -> loading -> ready -> error
 *            |                    |
 *            +<------- (retry) ---+
 * ```
 *
 * All operations require the adapter to be in the `ready` state. The
 * `initialize()` method transitions from `idle` to `loading` to `ready`.
 *
 * ## Configuration
 *
 * Pass {@link MockAdapterConfig} to the constructor to control simulated
 * delays, error rates, and initial data seeding.
 *
 * ## Events
 *
 * The adapter emits lifecycle events through the {@link onStateChange}
 * callback, enabling consumers to react to state transitions.
 *
 * The constructor seeds a realistic demo project:
 * - 1 sequence ("Main Assembly") with V1, V2, A1-A4 tracks
 * - 3 bins ("Interviews", "B-Roll", "Music")
 * - ~8 clips distributed across the tracks
 */

import type { DeliverySpec } from './contracts-types';
import type {
  BinSnapshot,
  ClipResult,
  ExportJob,
  IMediaComposerAdapter,
  SelectionSnapshot,
  TimelineSnapshot,
  TrackKind,
  TrackSnapshot,
} from './IMediaComposerAdapter';
import {
  ConflictError,
  InvalidArgumentError,
  NotFoundError,
  TimeoutError,
  UnavailableError,
} from './AdapterError';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Lifecycle state of the mock adapter.
 *
 * - `idle`    -- constructed but not yet initialized
 * - `loading` -- initialization in progress
 * - `ready`   -- fully operational, accepting commands
 * - `error`   -- initialization or runtime failure; must be re-initialized
 */
export type AdapterState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Configuration for the mock adapter's simulated behaviour.
 */
export interface MockAdapterConfig {
  /** Base delay in milliseconds for simulated async operations. Default: 50. */
  readonly baseDelayMs?: number;
  /** Jitter range in milliseconds added to the base delay. Default: 30. */
  readonly jitterMs?: number;
  /** Probability (0-1) that an operation will fail with a transient error. Default: 0. */
  readonly errorRate?: number;
  /** Simulated initialization delay in milliseconds. Default: 100. */
  readonly initDelayMs?: number;
  /** Callback invoked when the adapter state changes. */
  readonly onStateChange?: (newState: AdapterState, previousState: AdapterState) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _nextId = 1000;
function nextId(prefix: string): string {
  return `${prefix}_${++_nextId}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Internal mutable types
// ---------------------------------------------------------------------------

interface MutableClip {
  clipId: string;
  trackId: string;
  assetId: string;
  position: number;
  duration: number;
  sourceIn: number;
  sourceOut: number;
  effectIds: string[];
}

interface MutableTrack {
  id: string;
  name: string;
  kind: TrackKind;
  index: number;
  clips: MutableClip[];
  isMuted: boolean;
  isSolo: boolean;
  isLocked: boolean;
}

interface MutableBin {
  id: string;
  name: string;
  parentId?: string;
  assetIds: string[];
  childBinIds: string[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Mock adapter
// ---------------------------------------------------------------------------

/**
 * In-memory mock implementation of {@link IMediaComposerAdapter}.
 *
 * All state lives in plain objects -- no persistence. Ideal for unit tests,
 * integration tests, and the demo UI.
 *
 * The adapter implements a state machine: `idle -> loading -> ready -> error`.
 * Call {@link initialize} before issuing any operations. Operations on an
 * uninitialized adapter throw {@link UnavailableError}.
 */
export class MockMediaComposerAdapter implements IMediaComposerAdapter {
  private tracks: Map<string, MutableTrack> = new Map();
  private clips: Map<string, MutableClip> = new Map();
  private bins: Map<string, MutableBin> = new Map();
  private playhead = 0;
  private exportJobs: Map<string, ExportJob> = new Map();

  private readonly sequenceId: string;
  private readonly sequenceName: string;
  private readonly frameRate: number;

  private _state: AdapterState = 'idle';
  private readonly config: Required<Omit<MockAdapterConfig, 'onStateChange'>> & {
    readonly onStateChange?: (newState: AdapterState, previousState: AdapterState) => void;
  };

  /**
   * Construct a new mock adapter.
   *
   * @param config - Optional configuration for simulated behaviour.
   */
  constructor(config?: MockAdapterConfig) {
    this.sequenceId = 'seq_main_001';
    this.sequenceName = 'Main Assembly';
    this.frameRate = 23.976;

    this.config = {
      baseDelayMs: config?.baseDelayMs ?? 50,
      jitterMs: config?.jitterMs ?? 30,
      errorRate: config?.errorRate ?? 0,
      initDelayMs: config?.initDelayMs ?? 100,
      onStateChange: config?.onStateChange,
    };
  }

  // -----------------------------------------------------------------------
  // State machine
  // -----------------------------------------------------------------------

  /**
   * Current lifecycle state of the adapter.
   */
  get state(): AdapterState {
    return this._state;
  }

  /**
   * Transition the adapter state, invoking the callback if configured.
   */
  private setState(newState: AdapterState): void {
    const prev = this._state;
    this._state = newState;
    this.config.onStateChange?.(newState, prev);
  }

  /**
   * Initialize the adapter, transitioning from `idle` to `ready`.
   *
   * Seeds demo data and simulates an initialization delay.
   *
   * @throws {ConflictError} If the adapter is already initialized or loading.
   */
  async initialize(): Promise<void> {
    if (this._state === 'ready') {
      throw new ConflictError('media-composer', 'Adapter is already initialized.');
    }
    if (this._state === 'loading') {
      throw new ConflictError('media-composer', 'Adapter initialization is already in progress.');
    }

    this.setState('loading');

    try {
      await this.simulateDelay(this.config.initDelayMs, this.config.initDelayMs + 50);
      this.seedDemoData();
      this.setState('ready');
    } catch (err) {
      this.setState('error');
      throw err;
    }
  }

  /**
   * Ensure the adapter is in the `ready` state before performing an operation.
   *
   * @throws {UnavailableError} If the adapter is not ready.
   */
  private ensureReady(): void {
    if (this._state !== 'ready') {
      throw new UnavailableError(
        'media-composer',
        `Adapter is in "${this._state}" state. Call initialize() first.`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Simulated delay and error injection
  // -----------------------------------------------------------------------

  /**
   * Simulate an asynchronous operation with configurable delay.
   *
   * @param minMs - Minimum delay in milliseconds.
   * @param maxMs - Maximum delay in milliseconds.
   */
  private simulateDelay(minMs?: number, maxMs?: number): Promise<void> {
    const min = minMs ?? this.config.baseDelayMs;
    const max = maxMs ?? this.config.baseDelayMs + this.config.jitterMs;
    const ms = min + Math.random() * (max - min);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Possibly inject a transient error based on the configured error rate.
   *
   * @param operation - Name of the operation, used in error messages.
   * @throws {TimeoutError} With probability equal to `config.errorRate`.
   */
  private maybeInjectError(operation: string): void {
    if (this.config.errorRate > 0 && Math.random() < this.config.errorRate) {
      throw new TimeoutError(
        'media-composer',
        operation,
        this.config.baseDelayMs + this.config.jitterMs,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Seed
  // -----------------------------------------------------------------------

  private seedDemoData(): void {
    // -- Tracks -----------------------------------------------------------
    const trackDefs: Array<{ name: string; kind: TrackKind }> = [
      { name: 'V1', kind: 'video' },
      { name: 'V2', kind: 'video' },
      { name: 'A1', kind: 'audio' },
      { name: 'A2', kind: 'audio' },
      { name: 'A3', kind: 'audio' },
      { name: 'A4', kind: 'audio' },
    ];

    for (let i = 0; i < trackDefs.length; i++) {
      const def = trackDefs[i]!;
      const track: MutableTrack = {
        id: `track_${def.name.toLowerCase()}`,
        name: def.name,
        kind: def.kind,
        index: i,
        clips: [],
        isMuted: false,
        isSolo: false,
        isLocked: false,
      };
      this.tracks.set(track.id, track);
    }

    // -- Clips on V1 (interview bites) -----------------------------------
    const v1 = this.tracks.get('track_v1')!;
    const interviewClips: MutableClip[] = [
      {
        clipId: 'clip_001',
        trackId: 'track_v1',
        assetId: 'asset_int_sarah_01',
        position: 0,
        duration: 150,
        sourceIn: 30,
        sourceOut: 180,
        effectIds: [],
      },
      {
        clipId: 'clip_002',
        trackId: 'track_v1',
        assetId: 'asset_int_sarah_02',
        position: 150,
        duration: 200,
        sourceIn: 10,
        sourceOut: 210,
        effectIds: [],
      },
      {
        clipId: 'clip_003',
        trackId: 'track_v1',
        assetId: 'asset_int_marcus_01',
        position: 400,
        duration: 180,
        sourceIn: 0,
        sourceOut: 180,
        effectIds: [],
      },
    ];
    for (const c of interviewClips) {
      v1.clips.push(c);
      this.clips.set(c.clipId, c);
    }

    // -- Clips on V2 (b-roll) --------------------------------------------
    const v2 = this.tracks.get('track_v2')!;
    const brollClips: MutableClip[] = [
      {
        clipId: 'clip_004',
        trackId: 'track_v2',
        assetId: 'asset_broll_city_01',
        position: 150,
        duration: 100,
        sourceIn: 0,
        sourceOut: 100,
        effectIds: ['fx_dissolve_01'],
      },
      {
        clipId: 'clip_005',
        trackId: 'track_v2',
        assetId: 'asset_broll_office_01',
        position: 400,
        duration: 80,
        sourceIn: 20,
        sourceOut: 100,
        effectIds: [],
      },
    ];
    for (const c of brollClips) {
      v2.clips.push(c);
      this.clips.set(c.clipId, c);
    }

    // -- Audio clips on A1 (dialogue mirrors V1) --------------------------
    const a1 = this.tracks.get('track_a1')!;
    const audioClips: MutableClip[] = [
      {
        clipId: 'clip_006',
        trackId: 'track_a1',
        assetId: 'asset_int_sarah_01',
        position: 0,
        duration: 150,
        sourceIn: 30,
        sourceOut: 180,
        effectIds: [],
      },
      {
        clipId: 'clip_007',
        trackId: 'track_a1',
        assetId: 'asset_int_sarah_02',
        position: 150,
        duration: 200,
        sourceIn: 10,
        sourceOut: 210,
        effectIds: [],
      },
      {
        clipId: 'clip_008',
        trackId: 'track_a1',
        assetId: 'asset_int_marcus_01',
        position: 400,
        duration: 180,
        sourceIn: 0,
        sourceOut: 180,
        effectIds: [],
      },
    ];
    for (const c of audioClips) {
      a1.clips.push(c);
      this.clips.set(c.clipId, c);
    }

    // -- Bins -------------------------------------------------------------
    const rootBins: MutableBin[] = [
      {
        id: 'bin_interviews',
        name: 'Interviews',
        assetIds: [
          'asset_int_sarah_01',
          'asset_int_sarah_02',
          'asset_int_marcus_01',
        ],
        childBinIds: [],
        createdAt: '2025-11-01T10:00:00Z',
        updatedAt: '2025-11-15T14:30:00Z',
      },
      {
        id: 'bin_broll',
        name: 'B-Roll',
        assetIds: ['asset_broll_city_01', 'asset_broll_office_01'],
        childBinIds: [],
        createdAt: '2025-11-01T10:00:00Z',
        updatedAt: '2025-11-12T09:20:00Z',
      },
      {
        id: 'bin_music',
        name: 'Music',
        assetIds: ['asset_music_ambient_01', 'asset_music_upbeat_01'],
        childBinIds: [],
        createdAt: '2025-11-03T16:00:00Z',
        updatedAt: '2025-11-03T16:00:00Z',
      },
    ];
    for (const b of rootBins) {
      this.bins.set(b.id, b);
    }
  }

  // -----------------------------------------------------------------------
  // Snapshot helpers
  // -----------------------------------------------------------------------

  private clipToResult(c: MutableClip): ClipResult {
    return { ...c };
  }

  private trackToSnapshot(t: MutableTrack): TrackSnapshot {
    return {
      id: t.id,
      name: t.name,
      kind: t.kind,
      index: t.index,
      clips: t.clips.map((c) => this.clipToResult(c)),
      isMuted: t.isMuted,
      isSolo: t.isSolo,
      isLocked: t.isLocked,
    };
  }

  private computeTimelineDuration(): number {
    let max = 0;
    for (const t of this.tracks.values()) {
      for (const c of t.clips) {
        const end = c.position + c.duration;
        if (end > max) max = end;
      }
    }
    return max;
  }

  // -----------------------------------------------------------------------
  // IMediaComposerAdapter -- Timeline
  // -----------------------------------------------------------------------

  async getTimeline(sequenceId: string): Promise<TimelineSnapshot> {
    this.ensureReady();
    await this.simulateDelay();
    this.maybeInjectError('getTimeline');

    if (sequenceId !== this.sequenceId) {
      throw new NotFoundError('media-composer', 'Sequence', sequenceId);
    }
    return {
      sequenceId: this.sequenceId,
      name: this.sequenceName,
      duration: this.computeTimelineDuration(),
      frameRate: this.frameRate,
      tracks: Array.from(this.tracks.values()).map((t) =>
        this.trackToSnapshot(t),
      ),
      playhead: this.playhead,
      capturedAt: isoNow(),
    };
  }

  // -----------------------------------------------------------------------
  // IMediaComposerAdapter -- Clip operations
  // -----------------------------------------------------------------------

  async addClip(
    trackId: string,
    assetId: string,
    position: number,
    duration: number,
  ): Promise<ClipResult> {
    this.ensureReady();
    await this.simulateDelay();
    this.maybeInjectError('addClip');

    if (position < 0) {
      throw new InvalidArgumentError('media-composer', 'position', 'Position must be non-negative.');
    }
    if (duration <= 0) {
      throw new InvalidArgumentError('media-composer', 'duration', 'Duration must be positive.');
    }

    const track = this.tracks.get(trackId);
    if (!track) throw new NotFoundError('media-composer', 'Track', trackId);

    if (track.isLocked) {
      throw new ConflictError('media-composer', `Track "${track.name}" is locked and cannot be modified.`);
    }

    const clip: MutableClip = {
      clipId: nextId('clip'),
      trackId,
      assetId,
      position,
      duration,
      sourceIn: 0,
      sourceOut: duration,
      effectIds: [],
    };

    track.clips.push(clip);
    this.clips.set(clip.clipId, clip);
    return this.clipToResult(clip);
  }

  async removeClip(clipId: string): Promise<void> {
    this.ensureReady();
    await this.simulateDelay();
    this.maybeInjectError('removeClip');

    const clip = this.clips.get(clipId);
    if (!clip) throw new NotFoundError('media-composer', 'Clip', clipId);

    const track = this.tracks.get(clip.trackId);
    if (track) {
      if (track.isLocked) {
        throw new ConflictError('media-composer', `Track "${track.name}" is locked and cannot be modified.`);
      }
      track.clips = track.clips.filter((c) => c.clipId !== clipId);
    }
    this.clips.delete(clipId);
  }

  async moveClip(
    clipId: string,
    targetTrackId: string,
    targetPosition: number,
  ): Promise<ClipResult> {
    this.ensureReady();
    await this.simulateDelay();
    this.maybeInjectError('moveClip');

    const clip = this.clips.get(clipId);
    if (!clip) throw new NotFoundError('media-composer', 'Clip', clipId);

    if (targetPosition < 0) {
      throw new InvalidArgumentError('media-composer', 'targetPosition', 'Position must be non-negative.');
    }

    const targetTrack = this.tracks.get(targetTrackId);
    if (!targetTrack) throw new NotFoundError('media-composer', 'Track', targetTrackId);

    if (targetTrack.isLocked) {
      throw new ConflictError('media-composer', `Target track "${targetTrack.name}" is locked.`);
    }

    // Remove from source track
    const sourceTrack = this.tracks.get(clip.trackId);
    if (sourceTrack) {
      if (sourceTrack.isLocked) {
        throw new ConflictError('media-composer', `Source track "${sourceTrack.name}" is locked.`);
      }
      sourceTrack.clips = sourceTrack.clips.filter(
        (c) => c.clipId !== clipId,
      );
    }

    // Place on target track
    clip.trackId = targetTrackId;
    clip.position = targetPosition;
    targetTrack.clips.push(clip);

    return this.clipToResult(clip);
  }

  async trimClip(
    clipId: string,
    side: 'start' | 'end',
    delta: number,
  ): Promise<ClipResult> {
    this.ensureReady();
    await this.simulateDelay();
    this.maybeInjectError('trimClip');

    const clip = this.clips.get(clipId);
    if (!clip) throw new NotFoundError('media-composer', 'Clip', clipId);

    const track = this.tracks.get(clip.trackId);
    if (track?.isLocked) {
      throw new ConflictError('media-composer', `Track "${track.name}" is locked and cannot be modified.`);
    }

    if (side === 'start') {
      clip.position += delta;
      clip.sourceIn += delta;
      clip.duration -= delta;
    } else {
      clip.sourceOut += delta;
      clip.duration += delta;
    }

    // Clamp to sane values
    if (clip.duration < 1) clip.duration = 1;
    if (clip.position < 0) clip.position = 0;

    return this.clipToResult(clip);
  }

  async splitClip(
    clipId: string,
    position: number,
  ): Promise<[ClipResult, ClipResult]> {
    this.ensureReady();
    await this.simulateDelay();
    this.maybeInjectError('splitClip');

    const clip = this.clips.get(clipId);
    if (!clip) throw new NotFoundError('media-composer', 'Clip', clipId);

    const track = this.tracks.get(clip.trackId);
    if (track?.isLocked) {
      throw new ConflictError('media-composer', `Track "${track.name}" is locked and cannot be modified.`);
    }

    const splitOffset = position - clip.position;
    if (splitOffset <= 0 || splitOffset >= clip.duration) {
      throw new InvalidArgumentError(
        'media-composer',
        'position',
        `Split position ${position} is outside clip range [${clip.position}, ${clip.position + clip.duration})`,
      );
    }

    // Left half keeps the original clip ID
    const leftDuration = splitOffset;
    const rightDuration = clip.duration - splitOffset;

    // Update existing clip (left half)
    clip.duration = leftDuration;
    clip.sourceOut = clip.sourceIn + leftDuration;

    // Create right half
    const rightClip: MutableClip = {
      clipId: nextId('clip'),
      trackId: clip.trackId,
      assetId: clip.assetId,
      position: clip.position + leftDuration,
      duration: rightDuration,
      sourceIn: clip.sourceIn + leftDuration,
      sourceOut: clip.sourceIn + leftDuration + rightDuration,
      effectIds: [...clip.effectIds],
    };

    const trackRef = this.tracks.get(clip.trackId)!;
    trackRef.clips.push(rightClip);
    this.clips.set(rightClip.clipId, rightClip);

    return [this.clipToResult(clip), this.clipToResult(rightClip)];
  }

  // -----------------------------------------------------------------------
  // IMediaComposerAdapter -- Playhead
  // -----------------------------------------------------------------------

  async setPlayhead(time: number): Promise<void> {
    this.ensureReady();
    await this.simulateDelay();

    if (time < 0) {
      throw new InvalidArgumentError('media-composer', 'time', 'Playhead time must be non-negative.');
    }

    this.playhead = time;
  }

  async getPlayhead(): Promise<number> {
    this.ensureReady();
    await this.simulateDelay();
    return this.playhead;
  }

  // -----------------------------------------------------------------------
  // IMediaComposerAdapter -- Bins
  // -----------------------------------------------------------------------

  async getBins(): Promise<BinSnapshot[]> {
    this.ensureReady();
    await this.simulateDelay();
    this.maybeInjectError('getBins');

    return Array.from(this.bins.values()).map((b) => ({
      id: b.id,
      name: b.name,
      parentId: b.parentId,
      assetCount: b.assetIds.length,
      childBinIds: [...b.childBinIds],
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }));
  }

  async createBin(name: string, parentId?: string): Promise<BinSnapshot> {
    this.ensureReady();
    await this.simulateDelay();
    this.maybeInjectError('createBin');

    if (!name || name.trim().length === 0) {
      throw new InvalidArgumentError('media-composer', 'name', 'Bin name must be non-empty.');
    }

    if (parentId && !this.bins.has(parentId)) {
      throw new NotFoundError('media-composer', 'Bin', parentId);
    }

    const bin: MutableBin = {
      id: nextId('bin'),
      name,
      parentId,
      assetIds: [],
      childBinIds: [],
      createdAt: isoNow(),
      updatedAt: isoNow(),
    };

    this.bins.set(bin.id, bin);

    if (parentId) {
      const parent = this.bins.get(parentId)!;
      parent.childBinIds.push(bin.id);
    }

    return {
      id: bin.id,
      name: bin.name,
      parentId: bin.parentId,
      assetCount: 0,
      childBinIds: [],
      createdAt: bin.createdAt,
      updatedAt: bin.updatedAt,
    };
  }

  async moveToBin(assetIds: string[], binId: string): Promise<void> {
    this.ensureReady();
    await this.simulateDelay();
    this.maybeInjectError('moveToBin');

    if (assetIds.length === 0) {
      throw new InvalidArgumentError('media-composer', 'assetIds', 'Must provide at least one asset ID.');
    }

    const target = this.bins.get(binId);
    if (!target) throw new NotFoundError('media-composer', 'Bin', binId);

    // Remove from current bins
    for (const bin of this.bins.values()) {
      bin.assetIds = bin.assetIds.filter((id) => !assetIds.includes(id));
    }

    // Add to target
    target.assetIds.push(...assetIds);
    target.updatedAt = isoNow();
  }

  // -----------------------------------------------------------------------
  // IMediaComposerAdapter -- Selection
  // -----------------------------------------------------------------------

  async getSelection(): Promise<SelectionSnapshot> {
    this.ensureReady();
    await this.simulateDelay();

    // Return a plausible default selection
    return {
      clipIds: this.clips.size > 0 ? [Array.from(this.clips.keys())[0]!] : [],
      trackIds: ['track_v1'],
      markIn: undefined,
      markOut: undefined,
      activeSequenceId: this.sequenceId,
    };
  }

  // -----------------------------------------------------------------------
  // IMediaComposerAdapter -- Effects
  // -----------------------------------------------------------------------

  async applyEffect(
    clipId: string,
    effectType: string,
    _params: Record<string, unknown>,
  ): Promise<void> {
    this.ensureReady();
    await this.simulateDelay();
    this.maybeInjectError('applyEffect');

    if (!effectType || effectType.trim().length === 0) {
      throw new InvalidArgumentError('media-composer', 'effectType', 'Effect type must be non-empty.');
    }

    const clip = this.clips.get(clipId);
    if (!clip) throw new NotFoundError('media-composer', 'Clip', clipId);

    const track = this.tracks.get(clip.trackId);
    if (track?.isLocked) {
      throw new ConflictError('media-composer', `Track "${track.name}" is locked and cannot be modified.`);
    }

    const effectId = nextId(`fx_${effectType}`);
    clip.effectIds.push(effectId);
  }

  async removeEffect(clipId: string, effectId: string): Promise<void> {
    this.ensureReady();
    await this.simulateDelay();
    this.maybeInjectError('removeEffect');

    const clip = this.clips.get(clipId);
    if (!clip) throw new NotFoundError('media-composer', 'Clip', clipId);

    const track = this.tracks.get(clip.trackId);
    if (track?.isLocked) {
      throw new ConflictError('media-composer', `Track "${track.name}" is locked and cannot be modified.`);
    }

    const idx = clip.effectIds.indexOf(effectId);
    if (idx === -1) {
      throw new NotFoundError('media-composer', 'Effect', effectId);
    }
    clip.effectIds.splice(idx, 1);
  }

  // -----------------------------------------------------------------------
  // IMediaComposerAdapter -- Export
  // -----------------------------------------------------------------------

  async exportSequence(
    sequenceId: string,
    spec: DeliverySpec,
  ): Promise<ExportJob> {
    this.ensureReady();
    await this.simulateDelay();
    this.maybeInjectError('exportSequence');

    if (sequenceId !== this.sequenceId) {
      throw new NotFoundError('media-composer', 'Sequence', sequenceId);
    }

    const job: ExportJob = {
      jobId: nextId('export'),
      sequenceId,
      status: 'queued',
      progress: 0,
      startedAt: isoNow(),
    };

    this.exportJobs.set(job.jobId, job);

    // Simulate async rendering progression with configurable timing
    this.simulateExport(job, spec);

    return { ...job };
  }

  /**
   * Simulates an export progressing through queued -> rendering -> completed.
   * Updates the job object in place so that callers polling getExportJob see
   * realistic progress. Step intervals scale with the configured base delay.
   */
  private simulateExport(job: ExportJob, spec: DeliverySpec): void {
    const steps = 10;
    let step = 0;
    const stepInterval = Math.max(50, this.config.baseDelayMs * 2);

    const tick = (): void => {
      step++;
      if (step <= steps) {
        job.status = 'rendering';
        job.progress = Math.min(100, Math.round((step / steps) * 100));
        setTimeout(tick, stepInterval);
      } else {
        job.status = 'completed';
        job.progress = 100;
        job.completedAt = isoNow();
        job.outputUri = `/exports/${job.sequenceId}_${spec.format}.${spec.format === 'ProRes' ? 'mov' : 'mp4'}`;
      }
    };

    setTimeout(tick, stepInterval);
  }

  // -----------------------------------------------------------------------
  // Extra helpers (mock-only, not on the interface)
  // -----------------------------------------------------------------------

  /**
   * Non-interface helper to poll an export job. Available on the mock only.
   *
   * @param jobId - The export job identifier.
   * @returns The current export job snapshot, or `undefined` if not found.
   */
  getExportJob(jobId: string): ExportJob | undefined {
    const job = this.exportJobs.get(jobId);
    return job ? { ...job } : undefined;
  }

  /**
   * Non-interface helper to reset the adapter back to idle state.
   * Useful for test teardown.
   */
  reset(): void {
    this.tracks.clear();
    this.clips.clear();
    this.bins.clear();
    this.exportJobs.clear();
    this.playhead = 0;
    this.setState('idle');
  }

  /**
   * Non-interface health check. Returns a summary of the adapter's current state.
   *
   * @returns An object describing the adapter's health and resource counts.
   */
  healthCheck(): {
    readonly state: AdapterState;
    readonly trackCount: number;
    readonly clipCount: number;
    readonly binCount: number;
    readonly exportJobCount: number;
    readonly sequenceId: string;
    readonly frameRate: number;
  } {
    return {
      state: this._state,
      trackCount: this.tracks.size,
      clipCount: this.clips.size,
      binCount: this.bins.size,
      exportJobCount: this.exportJobs.size,
      sequenceId: this.sequenceId,
      frameRate: this.frameRate,
    };
  }
}
