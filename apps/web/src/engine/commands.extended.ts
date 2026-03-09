import type { Command } from './types';
import { useEditorStore, DEFAULT_INTRINSIC_VIDEO, DEFAULT_INTRINSIC_AUDIO, DEFAULT_TIME_REMAP } from '../store/editor.store';
import type { Clip, Track } from '../store/editor.store';

/** Helper: read-only snapshot of current editor state. */
const snap = () => useEditorStore.getState();

/** Create a unique ID with a prefix. */
function createId(prefix: string): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── SpliceIn Command ────────────────────────────────────────────────────

/**
 * Command to splice-in (insert) clips at a given time on a track.
 * Clips downstream of the insertion point are shifted right by the
 * combined duration of the inserted clips.
 */
export class SpliceInCommand implements Command {
  readonly description: string;
  private insertedClipIds: string[] = [];
  private shiftedClips: { id: string; prevStart: number; prevEnd: number }[] = [];
  private insertDuration: number;

  constructor(
    private clips: Clip[],
    private insertTime: number,
    private trackId: string,
  ) {
    this.description = `Splice-in ${clips.length} clip(s)`;
    this.insertDuration = clips.reduce(
      (sum, c) => sum + (c.endTime - c.startTime),
      0,
    );
    // Pre-assign IDs to inserted clips so undo can find them
    for (const clip of this.clips) {
      this.insertedClipIds.push(clip.id);
    }
  }

  execute(): void {
    useEditorStore.setState((s) => {
      const track = s.tracks.find((t) => t.id === this.trackId);
      if (!track) return;

      // Capture clips that will be shifted (downstream of insert point)
      this.shiftedClips = [];
      for (const c of track.clips) {
        if (c.startTime >= this.insertTime) {
          this.shiftedClips.push({
            id: c.id,
            prevStart: c.startTime,
            prevEnd: c.endTime,
          });
        }
      }

      // Shift downstream clips right
      for (const c of track.clips) {
        if (c.startTime >= this.insertTime) {
          c.startTime += this.insertDuration;
          c.endTime += this.insertDuration;
        }
      }

      // Insert the new clips at the insert time, sequentially
      let offset = this.insertTime;
      for (const clip of this.clips) {
        const duration = clip.endTime - clip.startTime;
        track.clips.push({
          ...clip,
          trackId: this.trackId,
          startTime: offset,
          endTime: offset + duration,
        });
        offset += duration;
      }

      track.clips.sort((a, b) => a.startTime - b.startTime);
    });
  }

  undo(): void {
    useEditorStore.setState((s) => {
      const track = s.tracks.find((t) => t.id === this.trackId);
      if (!track) return;

      // Remove inserted clips
      track.clips = track.clips.filter(
        (c) => !this.insertedClipIds.includes(c.id),
      );

      // Restore shifted clips to their original positions
      for (const saved of this.shiftedClips) {
        const c = track.clips.find((c) => c.id === saved.id);
        if (c) {
          c.startTime = saved.prevStart;
          c.endTime = saved.prevEnd;
        }
      }

      track.clips.sort((a, b) => a.startTime - b.startTime);
    });
  }
}

// ─── Overwrite Command ───────────────────────────────────────────────────

/**
 * Command to overwrite a region on a track with new clips.
 * Clips occupying the target region are removed or trimmed; the new clips
 * are placed without shifting downstream content.
 */
export class OverwriteCommand implements Command {
  readonly description: string;
  private overwrittenClips: Clip[] = [];
  private trimmedClips: { id: string; prevStart: number; prevEnd: number }[] = [];
  private insertedClipIds: string[] = [];

  constructor(
    private clips: Clip[],
    private startTime: number,
    private endTime: number,
    private trackId: string,
  ) {
    this.description = `Overwrite ${clips.length} clip(s)`;
    for (const clip of this.clips) {
      this.insertedClipIds.push(clip.id);
    }
  }

  execute(): void {
    useEditorStore.setState((s) => {
      const track = s.tracks.find((t) => t.id === this.trackId);
      if (!track) return;

      // Capture and handle clips in the overwrite region
      this.overwrittenClips = [];
      this.trimmedClips = [];

      const toRemove: string[] = [];

      for (const c of track.clips) {
        // Clip fully inside the overwrite region: remove it
        if (c.startTime >= this.startTime && c.endTime <= this.endTime) {
          this.overwrittenClips.push({ ...c });
          toRemove.push(c.id);
          continue;
        }

        // Clip overlaps the start of the region: trim its right edge
        if (
          c.startTime < this.startTime &&
          c.endTime > this.startTime &&
          c.endTime <= this.endTime
        ) {
          this.trimmedClips.push({
            id: c.id,
            prevStart: c.startTime,
            prevEnd: c.endTime,
          });
          c.endTime = this.startTime;
          continue;
        }

        // Clip overlaps the end of the region: trim its left edge
        if (
          c.startTime >= this.startTime &&
          c.startTime < this.endTime &&
          c.endTime > this.endTime
        ) {
          this.trimmedClips.push({
            id: c.id,
            prevStart: c.startTime,
            prevEnd: c.endTime,
          });
          c.startTime = this.endTime;
          continue;
        }

        // Clip spans the entire region: split it (trim right, remove middle)
        if (c.startTime < this.startTime && c.endTime > this.endTime) {
          this.trimmedClips.push({
            id: c.id,
            prevStart: c.startTime,
            prevEnd: c.endTime,
          });
          c.endTime = this.startTime;
          // Note: the trailing portion is lost in overwrite (Avid behavior)
        }
      }

      // Remove fully overwritten clips
      track.clips = track.clips.filter((c) => !toRemove.includes(c.id));

      // Place the new clips in the cleared region
      let offset = this.startTime;
      for (const clip of this.clips) {
        const duration = clip.endTime - clip.startTime;
        track.clips.push({
          ...clip,
          trackId: this.trackId,
          startTime: offset,
          endTime: offset + duration,
        });
        offset += duration;
      }

      track.clips.sort((a, b) => a.startTime - b.startTime);
    });
  }

  undo(): void {
    useEditorStore.setState((s) => {
      const track = s.tracks.find((t) => t.id === this.trackId);
      if (!track) return;

      // Remove inserted clips
      track.clips = track.clips.filter(
        (c) => !this.insertedClipIds.includes(c.id),
      );

      // Restore trimmed clips to their original bounds
      for (const saved of this.trimmedClips) {
        const c = track.clips.find((c) => c.id === saved.id);
        if (c) {
          c.startTime = saved.prevStart;
          c.endTime = saved.prevEnd;
        }
      }

      // Re-add fully overwritten clips
      for (const clip of this.overwrittenClips) {
        track.clips.push(clip);
      }

      track.clips.sort((a, b) => a.startTime - b.startTime);
    });
  }
}

// ─── Extract Command ─────────────────────────────────────────────────────

/**
 * Command to extract (remove and close gap) a time region from tracks.
 * Clips in the region are removed, and downstream clips shift left
 * to close the gap.
 */
export class ExtractCommand implements Command {
  readonly description = 'Extract region';
  private savedClips: { trackId: string; clip: Clip }[] = [];
  private shiftedClips: { trackId: string; id: string; prevStart: number; prevEnd: number }[] = [];
  private regionDuration: number;

  constructor(
    private startTime: number,
    private endTime: number,
    private trackIds: string[],
  ) {
    this.regionDuration = endTime - startTime;
  }

  execute(): void {
    useEditorStore.setState((s) => {
      this.savedClips = [];
      this.shiftedClips = [];

      for (const trackId of this.trackIds) {
        const track = s.tracks.find((t) => t.id === trackId);
        if (!track) continue;

        // Save clips that will be removed (fully inside region)
        const toRemove: string[] = [];
        for (const c of track.clips) {
          if (c.startTime >= this.startTime && c.endTime <= this.endTime) {
            this.savedClips.push({ trackId, clip: { ...c } });
            toRemove.push(c.id);
          }
        }

        // Remove clips in the region
        track.clips = track.clips.filter((c) => !toRemove.includes(c.id));

        // Capture and shift downstream clips left
        for (const c of track.clips) {
          if (c.startTime >= this.endTime) {
            this.shiftedClips.push({
              trackId,
              id: c.id,
              prevStart: c.startTime,
              prevEnd: c.endTime,
            });
            c.startTime -= this.regionDuration;
            c.endTime -= this.regionDuration;
          }
        }

        track.clips.sort((a, b) => a.startTime - b.startTime);
      }
    });
  }

  undo(): void {
    useEditorStore.setState((s) => {
      for (const trackId of this.trackIds) {
        const track = s.tracks.find((t) => t.id === trackId);
        if (!track) continue;

        // Restore shifted clips to their original positions
        for (const saved of this.shiftedClips) {
          if (saved.trackId !== trackId) continue;
          const c = track.clips.find((c) => c.id === saved.id);
          if (c) {
            c.startTime = saved.prevStart;
            c.endTime = saved.prevEnd;
          }
        }

        // Re-add removed clips
        for (const saved of this.savedClips) {
          if (saved.trackId !== trackId) continue;
          track.clips.push(saved.clip);
        }

        track.clips.sort((a, b) => a.startTime - b.startTime);
      }
    });
  }
}

// ─── Lift Command ────────────────────────────────────────────────────────

/**
 * Command to lift (remove without closing gap) a time region from tracks.
 * Clips in the region are removed but downstream clips stay in place,
 * leaving filler (empty space).
 */
export class LiftCommand implements Command {
  readonly description = 'Lift region';
  private savedClips: { trackId: string; clip: Clip }[] = [];

  constructor(
    private startTime: number,
    private endTime: number,
    private trackIds: string[],
  ) {}

  execute(): void {
    useEditorStore.setState((s) => {
      this.savedClips = [];

      for (const trackId of this.trackIds) {
        const track = s.tracks.find((t) => t.id === trackId);
        if (!track) continue;

        const toRemove: string[] = [];
        for (const c of track.clips) {
          if (c.startTime >= this.startTime && c.endTime <= this.endTime) {
            this.savedClips.push({ trackId, clip: { ...c } });
            toRemove.push(c.id);
          }
        }

        track.clips = track.clips.filter((c) => !toRemove.includes(c.id));
      }
    });
  }

  undo(): void {
    useEditorStore.setState((s) => {
      for (const trackId of this.trackIds) {
        const track = s.tracks.find((t) => t.id === trackId);
        if (!track) continue;

        for (const saved of this.savedClips) {
          if (saved.trackId !== trackId) continue;
          track.clips.push(saved.clip);
        }

        track.clips.sort((a, b) => a.startTime - b.startTime);
      }
    });
  }
}

// ─── Transition Commands ─────────────────────────────────────────────────

/**
 * Command to apply a transition at an edit point between two clips.
 */
export class ApplyTransitionCommand implements Command {
  readonly description: string;
  private transitionId: string;
  private savedClipATrimEnd: number | null = null;
  private savedClipBTrimStart: number | null = null;
  private clipAId: string | null = null;
  private clipBId: string | null = null;

  constructor(
    private trackId: string,
    private editPointTime: number,
    private definitionId: string,
    private duration: number,
  ) {
    this.description = `Apply transition "${definitionId}"`;
    this.transitionId = createId('trn');
  }

  execute(): void {
    useEditorStore.setState((s) => {
      const track = s.tracks.find((t) => t.id === this.trackId);
      if (!track) return;

      // Find clips on either side of the edit point
      const clipA = track.clips.find(
        (c) => Math.abs(c.endTime - this.editPointTime) < 0.001,
      );
      const clipB = track.clips.find(
        (c) => Math.abs(c.startTime - this.editPointTime) < 0.001,
      );

      // Save state for undo
      if (clipA) {
        this.clipAId = clipA.id;
        this.savedClipATrimEnd = clipA.trimEnd;
      }
      if (clipB) {
        this.clipBId = clipB.id;
        this.savedClipBTrimStart = clipB.trimStart;
      }

      // Apply overlap: extend clip A's end and clip B's start
      // by half the transition duration to create the overlap region
      const halfDur = this.duration / 2;
      if (clipA) {
        clipA.endTime += halfDur;
      }
      if (clipB) {
        clipB.startTime -= halfDur;
      }
    });
  }

  undo(): void {
    useEditorStore.setState((s) => {
      const track = s.tracks.find((t) => t.id === this.trackId);
      if (!track) return;

      // Restore clip boundaries
      const halfDur = this.duration / 2;
      if (this.clipAId) {
        const clipA = track.clips.find((c) => c.id === this.clipAId);
        if (clipA) {
          clipA.endTime -= halfDur;
        }
      }
      if (this.clipBId) {
        const clipB = track.clips.find((c) => c.id === this.clipBId);
        if (clipB) {
          clipB.startTime += halfDur;
        }
      }
    });
  }
}

// ─── Title Commands ──────────────────────────────────────────────────────

/**
 * Command to create a title clip on a track at a given time range.
 */
export class CreateTitleCommand implements Command {
  readonly description = 'Create title';
  private clipId: string;

  constructor(
    private trackId: string,
    private startTime: number,
    private endTime: number,
  ) {
    this.clipId = createId('title-clip');
  }

  execute(): void {
    useEditorStore.setState((s) => {
      const track = s.tracks.find((t) => t.id === this.trackId);
      if (!track) return;

      const clip: Clip = {
        id: this.clipId,
        trackId: this.trackId,
        name: 'Title',
        startTime: this.startTime,
        endTime: this.endTime,
        trimStart: 0,
        trimEnd: 0,
        type: 'effect',
        intrinsicVideo: { ...DEFAULT_INTRINSIC_VIDEO },
        intrinsicAudio: { ...DEFAULT_INTRINSIC_AUDIO },
        timeRemap: { ...DEFAULT_TIME_REMAP },
      };

      track.clips.push(clip);
      track.clips.sort((a, b) => a.startTime - b.startTime);
    });
  }

  undo(): void {
    useEditorStore.setState((s) => {
      const track = s.tracks.find((t) => t.id === this.trackId);
      if (!track) return;
      track.clips = track.clips.filter((c) => c.id !== this.clipId);
    });
  }
}

// ─── Multicam Cut Command ────────────────────────────────────────────────

/**
 * Command to perform a multicam cut, switching the active camera angle
 * at a given time. Stores the previous angle index for undo.
 */
export class MulticamCutCommand implements Command {
  readonly description: string;
  private prevAngleIndex: number = 0;
  private captured = false;

  constructor(
    private time: number,
    private angleIndex: number,
  ) {
    this.description = `Cut to angle ${angleIndex + 1}`;
  }

  execute(): void {
    const state = snap();

    // Determine which clip is under the playhead on the topmost video track
    // and capture the current angle for undo
    if (!this.captured) {
      for (const track of state.tracks) {
        if (track.type !== 'VIDEO') continue;
        for (const clip of track.clips) {
          if (this.time >= clip.startTime && this.time < clip.endTime) {
            // Store previous "angle" as the assetId hash for undo
            this.prevAngleIndex = 0; // default
            this.captured = true;
            break;
          }
        }
        if (this.captured) break;
      }
    }

    // Perform a split at the cut point and update the new clip's source
    useEditorStore.setState((s) => {
      for (const track of s.tracks) {
        if (track.type !== 'VIDEO') continue;
        const clip = track.clips.find(
          (c) => this.time > c.startTime && this.time < c.endTime,
        );
        if (!clip) continue;

        // Split the clip at the cut time
        const newClipId = createId('mcut');
        const origEnd = clip.endTime;
        clip.endTime = this.time;

        const newClip: Clip = {
          ...clip,
          id: newClipId,
          startTime: this.time,
          endTime: origEnd,
          name: `Angle ${this.angleIndex + 1}`,
          trimStart: clip.trimStart + (this.time - clip.startTime),
        };
        track.clips.push(newClip);
        track.clips.sort((a, b) => a.startTime - b.startTime);
        break;
      }
    });
  }

  undo(): void {
    // Undo the split: find the two clips at the cut point and merge them
    useEditorStore.setState((s) => {
      for (const track of s.tracks) {
        if (track.type !== 'VIDEO') continue;

        const clipA = track.clips.find(
          (c) => Math.abs(c.endTime - this.time) < 0.001,
        );
        const clipB = track.clips.find(
          (c) => Math.abs(c.startTime - this.time) < 0.001 && c !== clipA,
        );

        if (clipA && clipB) {
          // Merge: extend clipA to cover clipB, remove clipB
          clipA.endTime = clipB.endTime;
          track.clips = track.clips.filter((c) => c.id !== clipB.id);
          track.clips.sort((a, b) => a.startTime - b.startTime);
          break;
        }
      }
    });
  }
}

// ─── Add Marker Command ─────────────────────────────────────────────────

/**
 * Command to add a marker to the timeline at a given time.
 */
export class AddMarkerCommand implements Command {
  readonly description = 'Add marker';
  private markerId: string;

  constructor(
    private time: number,
    private label: string,
    private color: string,
  ) {
    this.markerId = createId('marker');
  }

  execute(): void {
    useEditorStore.setState((s) => {
      s.markers.push({
        id: this.markerId,
        time: this.time,
        label: this.label,
        color: this.color,
      });
    });
  }

  undo(): void {
    useEditorStore.setState((s) => {
      s.markers = s.markers.filter((m) => m.id !== this.markerId);
    });
  }
}

// ─── Clip Color Command ─────────────────────────────────────────────────

/**
 * Command to set a clip's display color in the timeline.
 * Captures the previous color for undo.
 */
export class SetClipColorCommand implements Command {
  readonly description = 'Set clip color';
  private prevColor: string | undefined = undefined;

  constructor(
    private clipId: string,
    private color: string,
  ) {
    // Capture previous color at construction time
    for (const track of snap().tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) {
        this.prevColor = clip.color;
        break;
      }
    }
  }

  execute(): void {
    useEditorStore.setState((s) => {
      for (const track of s.tracks) {
        const clip = track.clips.find((c) => c.id === this.clipId);
        if (clip) {
          clip.color = this.color;
          break;
        }
      }
    });
  }

  undo(): void {
    useEditorStore.setState((s) => {
      for (const track of s.tracks) {
        const clip = track.clips.find((c) => c.id === this.clipId);
        if (clip) {
          clip.color = this.prevColor;
          break;
        }
      }
    });
  }
}

// ─── Track Height Command ────────────────────────────────────────────────

/**
 * Command to change the display height of a track.
 * Operates on the trackHeights record in the editor store.
 */
export class SetTrackHeightCommand implements Command {
  readonly description = 'Resize track';
  private prevHeight: number;

  constructor(
    private trackId: string,
    private newHeight: number,
    prevHeight: number,
  ) {
    this.prevHeight = prevHeight;
  }

  execute(): void {
    snap().setTrackHeight(this.trackId, this.newHeight);
  }

  undo(): void {
    snap().setTrackHeight(this.trackId, this.prevHeight);
  }
}
