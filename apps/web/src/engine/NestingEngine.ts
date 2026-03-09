// =============================================================================
//  THE AVID -- Nested Sequences & Compound Clips Engine
// =============================================================================
//
// Implements Resolve/Premiere-style nested sequence and compound clip workflows:
//  - Create sequences with independent settings, tracks, and markers
//  - Nest clips into compound clips (creates a new sequence under the hood)
//  - Navigate into and out of nested sequences via a sequence stack
//  - Subscribe/notify pattern for UI reactivity
//
// =============================================================================

import {
  type Clip,
  type Track,
  type SequenceSettings,
  makeClip,
} from '../store/editor.store';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Full data for a sequence (timeline). */
export interface SequenceData {
  id: string;
  name: string;
  settings: SequenceSettings;
  tracks: Track[];
  markers: any[];
  duration: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

let sequenceIdCounter = 0;
function genSequenceId(): string {
  return `seq_${++sequenceIdCounter}_${Date.now().toString(36)}`;
}

let compoundClipIdCounter = 0;
function genCompoundClipId(): string {
  return `cc_${++compoundClipIdCounter}_${Date.now().toString(36)}`;
}

// =============================================================================
//  NestingEngine
// =============================================================================

/**
 * Engine for managing nested sequences and compound clips.
 *
 * Sequences are independent timelines with their own settings, tracks, and
 * markers. A compound clip is a single clip on the parent timeline that
 * references a nested sequence. Opening a compound clip pushes the nested
 * sequence onto the sequence stack; closing it pops back to the parent.
 */
export class NestingEngine {
  /** All known sequences keyed by ID. */
  sequences: Map<string, SequenceData> = new Map();

  /**
   * Stack of sequence IDs representing the nesting depth.
   * The bottom of the stack is the root/master sequence. The top is the
   * currently active (displayed) sequence.
   */
  sequenceStack: string[] = [];

  /** Subscriber callbacks. */
  private listeners = new Set<() => void>();

  // ─── Private helpers ──────────────────────────────────────────────────

  /** Notify all subscribers that state has changed. */
  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('[NestingEngine] Subscriber error:', err);
      }
    });
  }

  /**
   * Compute the total duration of a set of tracks based on the latest
   * clip end-time across all tracks.
   */
  private computeDuration(tracks: Track[]): number {
    let maxEnd = 0;
    for (const track of tracks) {
      for (const clip of track.clips) {
        if (clip.endTime > maxEnd) {
          maxEnd = clip.endTime;
        }
      }
    }
    return maxEnd;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Sequence CRUD
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create a new sequence with the given name and settings.
   *
   * The sequence starts with no tracks and no markers. If the sequence
   * stack is empty the new sequence is pushed as the root.
   *
   * @param name     Human-readable sequence name.
   * @param settings Sequence-level settings (resolution, fps, etc.).
   * @returns The newly created SequenceData.
   */
  createSequence(name: string, settings: SequenceSettings): SequenceData {
    const id = genSequenceId();
    const sequence: SequenceData = {
      id,
      name,
      settings,
      tracks: [],
      markers: [],
      duration: 0,
    };

    this.sequences.set(id, sequence);

    // If no sequence is active yet, make this one the root
    if (this.sequenceStack.length === 0) {
      this.sequenceStack.push(id);
    }

    this.notify();
    return sequence;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Compound Clips
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create a compound clip from a set of clips on the timeline.
   *
   * This works similarly to Premiere Pro's "Nest" or Resolve's compound
   * clip: the selected clips are moved into a new sub-sequence, and a
   * single reference clip replaces them on the parent timeline.
   *
   * @param clips  The clips to nest.
   * @param tracks The tracks containing the clips (used to derive settings).
   * @returns An object containing the replacement clip and the ID of the
   *          newly created nested sequence.
   */
  createCompoundClip(
    clips: Clip[],
    tracks: Track[],
  ): { clip: Clip; sequenceId: string } {
    if (clips.length === 0) {
      throw new Error('[NestingEngine] Cannot create compound clip from zero clips');
    }

    // Determine the time range spanned by the selected clips
    const earliestStart = Math.min(...clips.map((c) => c.startTime));
    const latestEnd = Math.max(...clips.map((c) => c.endTime));

    // Derive settings from the first matching track or use sensible defaults
    const firstTrack = tracks.find((t) =>
      t.clips.some((c) => clips.some((sel) => sel.id === c.id)),
    );
    const activeSequence = this.sequences.get(this.getActiveSequenceId());
    const settings: SequenceSettings = activeSequence?.settings ?? {
      name: 'Compound Clip',
      fps: 24,
      dropFrame: false,
      startTC: 0,
      width: 1920,
      height: 1080,
      sampleRate: 48000,
      colorSpace: 'rec709',
      displayTransform: 'sdr-rec709',
    };

    // Create the nested sequence
    const nestedSeq = this.createSequence(`Compound Clip`, { ...settings });

    // Build tracks for the nested sequence from the selected clips
    // Group selected clips by their original track
    const clipsByTrack = new Map<string, Clip[]>();
    for (const clip of clips) {
      const existing = clipsByTrack.get(clip.trackId) ?? [];
      existing.push(clip);
      clipsByTrack.set(clip.trackId, existing);
    }

    const nestedTracks: Track[] = [];
    let sortOrder = 0;
    for (const [trackId, trackClips] of clipsByTrack) {
      const originalTrack = tracks.find((t) => t.id === trackId);
      if (!originalTrack) continue;

      // Offset clip times so the nested sequence starts at 0
      const offsetClips: Clip[] = trackClips.map((c) => ({
        ...c,
        startTime: c.startTime - earliestStart,
        endTime: c.endTime - earliestStart,
        trackId: `${nestedSeq.id}-${originalTrack.name}`,
      }));

      nestedTracks.push({
        id: `${nestedSeq.id}-${originalTrack.name}`,
        name: originalTrack.name,
        type: originalTrack.type,
        sortOrder: sortOrder++,
        muted: false,
        locked: false,
        solo: false,
        volume: originalTrack.volume,
        clips: offsetClips,
        color: originalTrack.color,
      });
    }

    nestedSeq.tracks = nestedTracks;
    nestedSeq.duration = this.computeDuration(nestedTracks);

    // Create the replacement clip for the parent timeline
    const compoundClipId = genCompoundClipId();
    const replacementClip: Clip = makeClip({
      id: compoundClipId,
      trackId: firstTrack?.id ?? clips[0]!.trackId,
      name: nestedSeq.name,
      startTime: earliestStart,
      endTime: latestEnd,
      trimStart: 0,
      trimEnd: 0,
      type: 'video',
      assetId: nestedSeq.id, // reference to the nested sequence
    });

    this.notify();
    return { clip: replacementClip, sequenceId: nestedSeq.id };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Sequence Navigation
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Open (step into) a nested sequence.
   *
   * Pushes the sequence onto the stack so that it becomes the active
   * sequence. The UI should respond by displaying the nested sequence's
   * tracks and timeline.
   *
   * @param sequenceId The ID of the sequence to open.
   * @returns The SequenceData for the opened sequence, or null if not found.
   */
  openNestedSequence(sequenceId: string): SequenceData | null {
    const sequence = this.sequences.get(sequenceId);
    if (!sequence) {
      console.warn(`[NestingEngine] Sequence '${sequenceId}' not found`);
      return null;
    }

    this.sequenceStack.push(sequenceId);
    this.notify();
    return sequence;
  }

  /**
   * Close the current nested sequence and return to the parent.
   *
   * Pops the top of the sequence stack. If only the root sequence remains
   * (stack size 1), this is a no-op and returns null.
   *
   * @returns The parent sequence ID, or null if already at the root.
   */
  closeNestedSequence(): string | null {
    if (this.sequenceStack.length <= 1) {
      console.warn('[NestingEngine] Already at root sequence; nothing to close');
      return null;
    }

    this.sequenceStack.pop();
    const parentId = this.sequenceStack[this.sequenceStack.length - 1];
    this.notify();
    return parentId ?? null;
  }

  /**
   * Get the ID of the currently active (top-of-stack) sequence.
   *
   * @returns The active sequence ID, or an empty string if no sequence exists.
   */
  getActiveSequenceId(): string {
    if (this.sequenceStack.length === 0) return '';
    return this.sequenceStack[this.sequenceStack.length - 1]!;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Subscribe
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to nesting engine state changes.
   *
   * @param cb Callback invoked on any mutation.
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
   * Clear all sequences, reset the stack, and remove listeners.
   * Primarily useful for tests and teardown.
   */
  dispose(): void {
    this.sequences.clear();
    this.sequenceStack = [];
    this.listeners.clear();
  }
}

/** Singleton nesting engine instance. */
export const nestingEngine = new NestingEngine();
