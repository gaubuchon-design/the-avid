/**
 * @fileoverview In-memory mock of {@link IMediaComposerAdapter}.
 *
 * Maintains a fully mutable timeline model with tracks, clips, bins, and a
 * playhead so that the agentic editing engine can be developed and demoed
 * without a running Media Composer instance.
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

  constructor() {
    this.sequenceId = 'seq_main_001';
    this.sequenceName = 'Main Assembly';
    this.frameRate = 23.976;

    this.seedDemoData();
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
      const def = trackDefs[i];
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
    if (sequenceId !== this.sequenceId) {
      throw new Error(`Sequence not found: ${sequenceId}`);
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
    const track = this.tracks.get(trackId);
    if (!track) throw new Error(`Track not found: ${trackId}`);

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
    const clip = this.clips.get(clipId);
    if (!clip) throw new Error(`Clip not found: ${clipId}`);

    const track = this.tracks.get(clip.trackId);
    if (track) {
      track.clips = track.clips.filter((c) => c.clipId !== clipId);
    }
    this.clips.delete(clipId);
  }

  async moveClip(
    clipId: string,
    targetTrackId: string,
    targetPosition: number,
  ): Promise<ClipResult> {
    const clip = this.clips.get(clipId);
    if (!clip) throw new Error(`Clip not found: ${clipId}`);

    const targetTrack = this.tracks.get(targetTrackId);
    if (!targetTrack) throw new Error(`Track not found: ${targetTrackId}`);

    // Remove from source track
    const sourceTrack = this.tracks.get(clip.trackId);
    if (sourceTrack) {
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
    const clip = this.clips.get(clipId);
    if (!clip) throw new Error(`Clip not found: ${clipId}`);

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
    const clip = this.clips.get(clipId);
    if (!clip) throw new Error(`Clip not found: ${clipId}`);

    const splitOffset = position - clip.position;
    if (splitOffset <= 0 || splitOffset >= clip.duration) {
      throw new Error(
        `Split position ${position} is outside clip range ` +
          `[${clip.position}, ${clip.position + clip.duration})`,
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

    const track = this.tracks.get(clip.trackId)!;
    track.clips.push(rightClip);
    this.clips.set(rightClip.clipId, rightClip);

    return [this.clipToResult(clip), this.clipToResult(rightClip)];
  }

  // -----------------------------------------------------------------------
  // IMediaComposerAdapter -- Playhead
  // -----------------------------------------------------------------------

  async setPlayhead(time: number): Promise<void> {
    this.playhead = Math.max(0, time);
  }

  async getPlayhead(): Promise<number> {
    return this.playhead;
  }

  // -----------------------------------------------------------------------
  // IMediaComposerAdapter -- Bins
  // -----------------------------------------------------------------------

  async getBins(): Promise<BinSnapshot[]> {
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
    if (parentId && !this.bins.has(parentId)) {
      throw new Error(`Parent bin not found: ${parentId}`);
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
    const target = this.bins.get(binId);
    if (!target) throw new Error(`Bin not found: ${binId}`);

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
    // Return a plausible default selection
    return {
      clipIds: this.clips.size > 0 ? [Array.from(this.clips.keys())[0]] : [],
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
    const clip = this.clips.get(clipId);
    if (!clip) throw new Error(`Clip not found: ${clipId}`);

    const effectId = nextId(`fx_${effectType}`);
    clip.effectIds.push(effectId);
  }

  async removeEffect(clipId: string, effectId: string): Promise<void> {
    const clip = this.clips.get(clipId);
    if (!clip) throw new Error(`Clip not found: ${clipId}`);

    const idx = clip.effectIds.indexOf(effectId);
    if (idx === -1) {
      throw new Error(`Effect ${effectId} not found on clip ${clipId}`);
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
    if (sequenceId !== this.sequenceId) {
      throw new Error(`Sequence not found: ${sequenceId}`);
    }

    const job: ExportJob = {
      jobId: nextId('export'),
      sequenceId,
      status: 'queued',
      progress: 0,
      startedAt: isoNow(),
    };

    this.exportJobs.set(job.jobId, job);

    // Simulate async rendering progression
    this.simulateExport(job, spec);

    return { ...job };
  }

  /**
   * Simulates an export progressing through queued -> rendering -> completed.
   * Updates the job object in place so that callers polling getExportJob see
   * realistic progress.
   */
  private simulateExport(job: ExportJob, spec: DeliverySpec): void {
    const steps = 10;
    let step = 0;

    const tick = (): void => {
      step++;
      if (step <= steps) {
        job.status = 'rendering';
        job.progress = Math.min(100, Math.round((step / steps) * 100));
        setTimeout(tick, 200);
      } else {
        job.status = 'completed';
        job.progress = 100;
        job.completedAt = isoNow();
        job.outputUri = `/exports/${job.sequenceId}_${spec.format}.${spec.format === 'ProRes' ? 'mov' : 'mp4'}`;
      }
    };

    setTimeout(tick, 100);
  }

  // -----------------------------------------------------------------------
  // Extra helper: retrieve an export job by ID (useful for demos).
  // -----------------------------------------------------------------------

  /**
   * Non-interface helper to poll an export job. Available on the mock only.
   */
  getExportJob(jobId: string): ExportJob | undefined {
    const job = this.exportJobs.get(jobId);
    return job ? { ...job } : undefined;
  }
}
