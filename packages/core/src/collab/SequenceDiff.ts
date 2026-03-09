// =============================================================================
//  THE AVID -- FT-06: Sequence Compare (Two-Sequence Visual Diff)
// =============================================================================
//
//  Compares two sequences (timelines) and produces a structured diff showing:
//    - Added, removed, and repositioned clips
//    - Changed effects / parameters
//    - Change list exportable as EDL
//    - Summary statistics
// =============================================================================

import type { EditorTrack, EditorClip } from '../project-library';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Type of change detected between two sequences. */
export type SequenceChangeType =
  | 'clip_added'
  | 'clip_removed'
  | 'clip_repositioned'
  | 'clip_trimmed'
  | 'clip_renamed'
  | 'effect_added'
  | 'effect_removed'
  | 'effect_changed'
  | 'track_added'
  | 'track_removed'
  | 'track_reordered'
  | 'track_muted'
  | 'track_unmuted'
  | 'track_locked'
  | 'track_unlocked'
  | 'volume_changed';

/** Severity of a change (for filtering / display). */
export type ChangeSeverity = 'info' | 'minor' | 'major' | 'critical';

/** A single change entry in the sequence diff. */
export interface SequenceChange {
  /** Unique ID for this change. */
  id: string;
  /** Type of change. */
  type: SequenceChangeType;
  /** Human-readable description. */
  description: string;
  /** Severity level. */
  severity: ChangeSeverity;
  /** Track name where the change occurred. */
  trackName: string;
  /** Track type. */
  trackType: string;
  /** Clip name (if applicable). */
  clipName?: string;
  /** Clip ID from sequence A. */
  clipIdA?: string;
  /** Clip ID from sequence B. */
  clipIdB?: string;
  /** Timeline position in seconds (where the change is visible). */
  timelinePosition: number;
  /** Duration of the affected region in seconds. */
  affectedDuration: number;
  /** Previous value (for parameter changes). */
  previousValue?: string;
  /** New value (for parameter changes). */
  newValue?: string;
}

/** Summary statistics of a sequence diff. */
export interface SequenceDiffSummary {
  /** Total number of changes. */
  totalChanges: number;
  /** Breakdown by change type. */
  byType: Record<SequenceChangeType, number>;
  /** Breakdown by severity. */
  bySeverity: Record<ChangeSeverity, number>;
  /** Number of clips added. */
  clipsAdded: number;
  /** Number of clips removed. */
  clipsRemoved: number;
  /** Number of clips repositioned. */
  clipsRepositioned: number;
  /** Number of clips trimmed. */
  clipsTrimmed: number;
  /** Number of effects changed. */
  effectsChanged: number;
  /** Number of track-level changes. */
  trackChanges: number;
  /** Duration of sequence A. */
  durationA: number;
  /** Duration of sequence B. */
  durationB: number;
  /** Net duration change in seconds. */
  durationDelta: number;
}

/** The complete result of a sequence comparison. */
export interface SequenceDiffResult {
  /** Name / label for sequence A. */
  nameA: string;
  /** Name / label for sequence B. */
  nameB: string;
  /** All detected changes, ordered by timeline position. */
  changes: SequenceChange[];
  /** Summary statistics. */
  summary: SequenceDiffSummary;
  /** Timestamp of the comparison. */
  comparedAt: string;
}

/** Input format for a sequence to compare. */
export interface SequenceInput {
  /** Display name for this sequence version. */
  name: string;
  /** Tracks with clips. */
  tracks: EditorTrack[];
}

/** Options for the diff operation. */
export interface SequenceDiffOptions {
  /** Threshold in seconds for considering a clip "repositioned" vs "different". */
  repositionThresholdSeconds?: number;
  /** Threshold in seconds for considering a trim change significant. */
  trimThresholdSeconds?: number;
  /** Whether to include track-level changes. */
  includeTrackChanges?: boolean;
  /** Whether to include effect changes. */
  includeEffectChanges?: boolean;
  /** Filter to specific track types. */
  trackTypeFilter?: string[];
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export class SequenceDiffError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_INPUT' | 'COMPARISON_FAILED',
  ) {
    super(message);
    this.name = 'SequenceDiffError';
  }
}

// ─── Default options ────────────────────────────────────────────────────────

const DEFAULT_DIFF_OPTIONS: Required<SequenceDiffOptions> = {
  repositionThresholdSeconds: 0.5,
  trimThresholdSeconds: 0.1,
  includeTrackChanges: true,
  includeEffectChanges: true,
  trackTypeFilter: [],
};

// ─── Helper: generate ID ────────────────────────────────────────────────────

let changeCounter = 0;
function genChangeId(): string {
  return `sc-${++changeCounter}-${Date.now().toString(36)}`;
}

// ─── SequenceDiff class ─────────────────────────────────────────────────────

/**
 * Compares two sequences and produces a structured diff with change entries,
 * summary statistics, and EDL-compatible change list output.
 *
 * Usage:
 * ```ts
 * const diff = new SequenceDiff();
 * const result = diff.compare(sequenceA, sequenceB);
 * console.log(result.summary.totalChanges);
 * const edl = diff.toChangeListEDL(result, 24);
 * ```
 */
export class SequenceDiff {
  /**
   * Compare two sequences and produce a diff result.
   */
  compare(
    seqA: SequenceInput,
    seqB: SequenceInput,
    options: SequenceDiffOptions = {},
  ): SequenceDiffResult {
    if (!seqA || !seqB) {
      throw new SequenceDiffError('Both sequences are required', 'INVALID_INPUT');
    }

    const opts = { ...DEFAULT_DIFF_OPTIONS, ...options };
    const changes: SequenceChange[] = [];

    try {
      const tracksA = this.filterTracks(seqA.tracks, opts.trackTypeFilter);
      const tracksB = this.filterTracks(seqB.tracks, opts.trackTypeFilter);

      // Track-level changes
      if (opts.includeTrackChanges) {
        changes.push(...this.diffTracks(tracksA, tracksB));
      }

      // Clip-level changes (match tracks by name)
      const trackPairs = this.pairTracksByName(tracksA, tracksB);
      for (const { trackA, trackB, trackName, trackType } of trackPairs) {
        const clipsA = trackA?.clips ?? [];
        const clipsB = trackB?.clips ?? [];
        changes.push(...this.diffClips(clipsA, clipsB, trackName, trackType, opts));
      }

      // Sort by timeline position
      changes.sort((a, b) => a.timelinePosition - b.timelinePosition);

      const durationA = this.calculateDuration(tracksA);
      const durationB = this.calculateDuration(tracksB);
      const summary = this.buildSummary(changes, durationA, durationB);

      return {
        nameA: seqA.name,
        nameB: seqB.name,
        changes,
        summary,
        comparedAt: new Date().toISOString(),
      };
    } catch (err) {
      throw new SequenceDiffError(
        `Comparison failed: ${err instanceof Error ? err.message : String(err)}`,
        'COMPARISON_FAILED',
      );
    }
  }

  /**
   * Generate a change list in EDL format from a diff result.
   */
  toChangeListEDL(result: SequenceDiffResult, frameRate = 24): string {
    const lines: string[] = [];
    lines.push(`TITLE: Change List: ${result.nameA} -> ${result.nameB}`);
    lines.push(`FCM: NON-DROP FRAME`);
    lines.push('');
    lines.push(`* Generated: ${result.comparedAt}`);
    lines.push(`* Total changes: ${result.summary.totalChanges}`);
    lines.push('');

    let eventNum = 1;
    for (const change of result.changes) {
      const tc = this.secondsToTimecodeStr(change.timelinePosition, frameRate);
      const endTc = this.secondsToTimecodeStr(
        change.timelinePosition + change.affectedDuration,
        frameRate,
      );
      const num = String(eventNum++).padStart(3, '0');

      lines.push(`${num}  AX       V     C        ${tc} ${endTc} ${tc} ${endTc}`);
      lines.push(`* CHANGE: [${change.type.toUpperCase()}] ${change.description}`);
      if (change.clipName) {
        lines.push(`* CLIP: ${change.clipName}`);
      }
      if (change.previousValue && change.newValue) {
        lines.push(`* FROM: ${change.previousValue}`);
        lines.push(`* TO:   ${change.newValue}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // ── Private: Track diffing ──────────────────────────────────────────────

  private diffTracks(tracksA: EditorTrack[], tracksB: EditorTrack[]): SequenceChange[] {
    const changes: SequenceChange[] = [];
    const namesA = new Set(tracksA.map((t) => t.name));
    const namesB = new Set(tracksB.map((t) => t.name));

    // Tracks added in B
    for (const track of tracksB) {
      if (!namesA.has(track.name)) {
        changes.push({
          id: genChangeId(),
          type: 'track_added',
          description: `Track "${track.name}" added`,
          severity: 'major',
          trackName: track.name,
          trackType: track.type,
          timelinePosition: 0,
          affectedDuration: 0,
        });
      }
    }

    // Tracks removed from A
    for (const track of tracksA) {
      if (!namesB.has(track.name)) {
        changes.push({
          id: genChangeId(),
          type: 'track_removed',
          description: `Track "${track.name}" removed`,
          severity: 'major',
          trackName: track.name,
          trackType: track.type,
          timelinePosition: 0,
          affectedDuration: 0,
        });
      }
    }

    // Track property changes
    for (const trackA of tracksA) {
      const trackB = tracksB.find((t) => t.name === trackA.name);
      if (!trackB) continue;

      if (trackA.muted !== trackB.muted) {
        changes.push({
          id: genChangeId(),
          type: trackB.muted ? 'track_muted' : 'track_unmuted',
          description: `Track "${trackA.name}" ${trackB.muted ? 'muted' : 'unmuted'}`,
          severity: 'minor',
          trackName: trackA.name,
          trackType: trackA.type,
          timelinePosition: 0,
          affectedDuration: 0,
          previousValue: String(trackA.muted),
          newValue: String(trackB.muted),
        });
      }

      if (trackA.locked !== trackB.locked) {
        changes.push({
          id: genChangeId(),
          type: trackB.locked ? 'track_locked' : 'track_unlocked',
          description: `Track "${trackA.name}" ${trackB.locked ? 'locked' : 'unlocked'}`,
          severity: 'info',
          trackName: trackA.name,
          trackType: trackA.type,
          timelinePosition: 0,
          affectedDuration: 0,
        });
      }

      if (Math.abs(trackA.volume - trackB.volume) > 0.01) {
        changes.push({
          id: genChangeId(),
          type: 'volume_changed',
          description: `Track "${trackA.name}" volume changed from ${(trackA.volume * 100).toFixed(0)}% to ${(trackB.volume * 100).toFixed(0)}%`,
          severity: 'minor',
          trackName: trackA.name,
          trackType: trackA.type,
          timelinePosition: 0,
          affectedDuration: 0,
          previousValue: `${(trackA.volume * 100).toFixed(0)}%`,
          newValue: `${(trackB.volume * 100).toFixed(0)}%`,
        });
      }

      // Track order changes
      const idxA = tracksA.indexOf(trackA);
      const idxB = tracksB.indexOf(trackB);
      if (idxA !== idxB) {
        changes.push({
          id: genChangeId(),
          type: 'track_reordered',
          description: `Track "${trackA.name}" moved from position ${idxA + 1} to ${idxB + 1}`,
          severity: 'info',
          trackName: trackA.name,
          trackType: trackA.type,
          timelinePosition: 0,
          affectedDuration: 0,
          previousValue: String(idxA + 1),
          newValue: String(idxB + 1),
        });
      }
    }

    return changes;
  }

  // ── Private: Clip diffing ──────────────────────────────────────────────

  private diffClips(
    clipsA: EditorClip[],
    clipsB: EditorClip[],
    trackName: string,
    trackType: string,
    opts: Required<SequenceDiffOptions>,
  ): SequenceChange[] {
    const changes: SequenceChange[] = [];

    // Match clips by ID first, then by name + approximate position
    const matchedA = new Set<string>();
    const matchedB = new Set<string>();
    const pairs: Array<{ clipA: EditorClip; clipB: EditorClip }> = [];

    // Pass 1: Match by ID
    for (const clipA of clipsA) {
      const clipB = clipsB.find((c) => c.id === clipA.id);
      if (clipB) {
        pairs.push({ clipA, clipB });
        matchedA.add(clipA.id);
        matchedB.add(clipB.id);
      }
    }

    // Pass 2: Match by name + assetId for unmatched clips
    for (const clipA of clipsA) {
      if (matchedA.has(clipA.id)) continue;
      const clipB = clipsB.find(
        (c) => !matchedB.has(c.id) && c.name === clipA.name && c.assetId === clipA.assetId,
      );
      if (clipB) {
        pairs.push({ clipA, clipB });
        matchedA.add(clipA.id);
        matchedB.add(clipB.id);
      }
    }

    // Pass 3: Match by name only for remaining
    for (const clipA of clipsA) {
      if (matchedA.has(clipA.id)) continue;
      const clipB = clipsB.find(
        (c) => !matchedB.has(c.id) && c.name === clipA.name,
      );
      if (clipB) {
        pairs.push({ clipA, clipB });
        matchedA.add(clipA.id);
        matchedB.add(clipB.id);
      }
    }

    // Removed clips (in A but not matched in B)
    for (const clipA of clipsA) {
      if (matchedA.has(clipA.id)) continue;
      changes.push({
        id: genChangeId(),
        type: 'clip_removed',
        description: `Clip "${clipA.name}" removed from ${trackName}`,
        severity: 'major',
        trackName,
        trackType,
        clipName: clipA.name,
        clipIdA: clipA.id,
        timelinePosition: clipA.startTime,
        affectedDuration: clipA.endTime - clipA.startTime,
      });
    }

    // Added clips (in B but not matched in A)
    for (const clipB of clipsB) {
      if (matchedB.has(clipB.id)) continue;
      changes.push({
        id: genChangeId(),
        type: 'clip_added',
        description: `Clip "${clipB.name}" added to ${trackName}`,
        severity: 'major',
        trackName,
        trackType,
        clipName: clipB.name,
        clipIdB: clipB.id,
        timelinePosition: clipB.startTime,
        affectedDuration: clipB.endTime - clipB.startTime,
      });
    }

    // Changed clips (matched pairs)
    for (const { clipA, clipB } of pairs) {
      // Position change
      const startDelta = Math.abs(clipB.startTime - clipA.startTime);
      const endDelta = Math.abs(clipB.endTime - clipA.endTime);

      if (startDelta > opts.repositionThresholdSeconds || endDelta > opts.repositionThresholdSeconds) {
        // Check if it's a reposition (both start and end moved by similar amount)
        const isMoved = Math.abs(startDelta - endDelta) < opts.repositionThresholdSeconds;

        if (isMoved && startDelta > opts.repositionThresholdSeconds) {
          changes.push({
            id: genChangeId(),
            type: 'clip_repositioned',
            description: `Clip "${clipA.name}" moved by ${startDelta.toFixed(2)}s on ${trackName}`,
            severity: 'major',
            trackName,
            trackType,
            clipName: clipA.name,
            clipIdA: clipA.id,
            clipIdB: clipB.id,
            timelinePosition: Math.min(clipA.startTime, clipB.startTime),
            affectedDuration: Math.max(clipA.endTime, clipB.endTime) - Math.min(clipA.startTime, clipB.startTime),
            previousValue: `${clipA.startTime.toFixed(2)}s - ${clipA.endTime.toFixed(2)}s`,
            newValue: `${clipB.startTime.toFixed(2)}s - ${clipB.endTime.toFixed(2)}s`,
          });
        } else {
          // Trim change
          if (startDelta > opts.trimThresholdSeconds || endDelta > opts.trimThresholdSeconds) {
            changes.push({
              id: genChangeId(),
              type: 'clip_trimmed',
              description: `Clip "${clipA.name}" trimmed on ${trackName}`,
              severity: 'minor',
              trackName,
              trackType,
              clipName: clipA.name,
              clipIdA: clipA.id,
              clipIdB: clipB.id,
              timelinePosition: Math.min(clipA.startTime, clipB.startTime),
              affectedDuration: Math.max(
                clipA.endTime - clipA.startTime,
                clipB.endTime - clipB.startTime,
              ),
              previousValue: `In: ${clipA.startTime.toFixed(2)}s Out: ${clipA.endTime.toFixed(2)}s`,
              newValue: `In: ${clipB.startTime.toFixed(2)}s Out: ${clipB.endTime.toFixed(2)}s`,
            });
          }
        }
      }

      // Name change
      if (clipA.name !== clipB.name) {
        changes.push({
          id: genChangeId(),
          type: 'clip_renamed',
          description: `Clip renamed from "${clipA.name}" to "${clipB.name}" on ${trackName}`,
          severity: 'info',
          trackName,
          trackType,
          clipName: clipB.name,
          clipIdA: clipA.id,
          clipIdB: clipB.id,
          timelinePosition: clipB.startTime,
          affectedDuration: clipB.endTime - clipB.startTime,
          previousValue: clipA.name,
          newValue: clipB.name,
        });
      }
    }

    return changes;
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private filterTracks(tracks: EditorTrack[], filter: string[]): EditorTrack[] {
    if (!filter || filter.length === 0) return tracks;
    return tracks.filter((t) => filter.includes(t.type));
  }

  private pairTracksByName(
    tracksA: EditorTrack[],
    tracksB: EditorTrack[],
  ): Array<{ trackA: EditorTrack | null; trackB: EditorTrack | null; trackName: string; trackType: string }> {
    const allNames = new Set([
      ...tracksA.map((t) => t.name),
      ...tracksB.map((t) => t.name),
    ]);

    return Array.from(allNames).map((name) => {
      const trackA = tracksA.find((t) => t.name === name) ?? null;
      const trackB = tracksB.find((t) => t.name === name) ?? null;
      return {
        trackA,
        trackB,
        trackName: name,
        trackType: (trackA ?? trackB)?.type ?? 'VIDEO',
      };
    });
  }

  private calculateDuration(tracks: EditorTrack[]): number {
    return tracks.reduce((max, track) => {
      const trackMax = track.clips.reduce((m, c) => Math.max(m, c.endTime), 0);
      return Math.max(max, trackMax);
    }, 0);
  }

  private buildSummary(
    changes: SequenceChange[],
    durationA: number,
    durationB: number,
  ): SequenceDiffSummary {
    const byType = {} as Record<SequenceChangeType, number>;
    const bySeverity = { info: 0, minor: 0, major: 0, critical: 0 } as Record<ChangeSeverity, number>;

    for (const change of changes) {
      byType[change.type] = (byType[change.type] ?? 0) + 1;
      bySeverity[change.severity]++;
    }

    return {
      totalChanges: changes.length,
      byType,
      bySeverity,
      clipsAdded: byType['clip_added'] ?? 0,
      clipsRemoved: byType['clip_removed'] ?? 0,
      clipsRepositioned: byType['clip_repositioned'] ?? 0,
      clipsTrimmed: byType['clip_trimmed'] ?? 0,
      effectsChanged: (byType['effect_added'] ?? 0) + (byType['effect_removed'] ?? 0) + (byType['effect_changed'] ?? 0),
      trackChanges: (byType['track_added'] ?? 0) + (byType['track_removed'] ?? 0) +
        (byType['track_reordered'] ?? 0) + (byType['track_muted'] ?? 0) +
        (byType['track_unmuted'] ?? 0) + (byType['track_locked'] ?? 0) + (byType['track_unlocked'] ?? 0),
      durationA,
      durationB,
      durationDelta: durationB - durationA,
    };
  }

  private secondsToTimecodeStr(seconds: number, frameRate: number): string {
    const totalFrames = Math.round(seconds * frameRate);
    const f = totalFrames % frameRate;
    const totalSec = Math.floor(totalFrames / frameRate);
    const s = totalSec % 60;
    const m = Math.floor(totalSec / 60) % 60;
    const h = Math.floor(totalSec / 3600);
    return [
      String(h).padStart(2, '0'),
      String(m).padStart(2, '0'),
      String(s).padStart(2, '0'),
      String(f).padStart(2, '0'),
    ].join(':');
  }
}
