import type { Command } from './types';
import { useEditorStore } from '../store/editor.store';
import type { Clip, Track } from '../store/editor.store';

/** Helper: read-only snapshot of current editor state. */
const snap = () => useEditorStore.getState();

// ─── 1. AddClip ──────────────────────────────────────────────────────────────

/** Command to add a clip to a track. */
export class AddClipCommand implements Command {
  readonly description: string;
  constructor(private clip: Clip) {
    this.description = `Add clip "${clip.name}"`;
  }
  execute(): void {
    snap().addClip(this.clip);
  }
  undo(): void {
    snap().removeClip(this.clip.id);
  }
}

// ─── 2. RemoveClip ───────────────────────────────────────────────────────────

/** Command to remove a clip from its track, capturing state for undo. */
export class RemoveClipCommand implements Command {
  readonly description: string;
  private saved: Clip | null = null;

  constructor(private clipId: string) {
    this.description = 'Remove clip';
    for (const track of snap().tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) {
        this.saved = { ...clip };
        this.description = `Remove "${clip.name}"`;
        break;
      }
    }
  }
  execute(): void {
    snap().removeClip(this.clipId);
  }
  undo(): void {
    if (this.saved) snap().addClip(this.saved);
  }
}

// ─── 3. MoveClip ─────────────────────────────────────────────────────────────

/** Command to move a clip to a new track and/or position. */
export class MoveClipCommand implements Command {
  readonly description = 'Move clip';
  constructor(
    private clipId: string,
    private prevTrackId: string,
    private prevStart: number,
    private newTrackId: string,
    private newStart: number,
  ) {}
  execute(): void {
    snap().moveClip(this.clipId, this.newTrackId, this.newStart);
  }
  undo(): void {
    snap().moveClip(this.clipId, this.prevTrackId, this.prevStart);
  }
}

// ─── 4. TrimClipLeft ─────────────────────────────────────────────────────────

/** Command to trim the left (start) edge of a clip. */
export class TrimClipLeftCommand implements Command {
  readonly description = 'Trim clip left';
  constructor(
    private clipId: string,
    private prevTime: number,
    private newTime: number,
  ) {}
  execute(): void {
    snap().trimClip(this.clipId, 'left', this.newTime);
  }
  undo(): void {
    snap().trimClip(this.clipId, 'left', this.prevTime);
  }
}

// ─── 5. TrimClipRight ────────────────────────────────────────────────────────

/** Command to trim the right (end) edge of a clip. */
export class TrimClipRightCommand implements Command {
  readonly description = 'Trim clip right';
  constructor(
    private clipId: string,
    private prevTime: number,
    private newTime: number,
  ) {}
  execute(): void {
    snap().trimClip(this.clipId, 'right', this.newTime);
  }
  undo(): void {
    snap().trimClip(this.clipId, 'right', this.prevTime);
  }
}

// ─── 6. SplitClip ────────────────────────────────────────────────────────────

/** Command to split a clip at a given time, creating two clips. */
export class SplitClipCommand implements Command {
  readonly description = 'Split clip';
  private prevEndTime = 0;
  private newClipId: string;

  constructor(
    private clipId: string,
    private time: number,
  ) {
    this.newClipId = `${clipId}_split_${Date.now()}`;
    for (const track of snap().tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) {
        this.prevEndTime = clip.endTime;
        break;
      }
    }
  }
  execute(): void {
    snap().splitClipWithId(this.clipId, this.time, this.newClipId);
  }
  undo(): void {
    snap().removeClip(this.newClipId);
    snap().trimClip(this.clipId, 'right', this.prevEndTime);
  }
}

// ─── 7. AddTrack ─────────────────────────────────────────────────────────────

/** Command to add a new track to the timeline. */
export class AddTrackCommand implements Command {
  readonly description: string;
  constructor(private track: Track) {
    this.description = `Add track "${track.name}"`;
  }
  execute(): void {
    snap().addTrack(this.track);
  }
  undo(): void {
    snap().removeTrack(this.track.id);
  }
}

// ─── 8. RemoveTrack ──────────────────────────────────────────────────────────

/** Command to remove a track, capturing state for undo. */
export class RemoveTrackCommand implements Command {
  readonly description: string;
  private savedTrack: Track | null = null;
  private savedIndex = -1;

  constructor(private trackId: string) {
    this.description = 'Remove track';
    const state = snap();
    const idx = state.tracks.findIndex((t) => t.id === trackId);
    if (idx >= 0) {
      const t = state.tracks[idx];
      this.savedTrack = { ...t, clips: t.clips.map((c) => ({ ...c })) };
      this.savedIndex = idx;
      this.description = `Remove track "${t.name}"`;
    }
  }
  execute(): void {
    snap().removeTrack(this.trackId);
  }
  undo(): void {
    if (this.savedTrack) {
      snap().insertTrack(this.savedTrack, this.savedIndex);
    }
  }
}

// ─── 9. SlipClip ─────────────────────────────────────────────────────────────

/** Command to slip a clip's media within its timeline position. */
export class SlipClipCommand implements Command {
  readonly description = 'Slip clip';
  constructor(
    private clipId: string,
    private delta: number,
  ) {}
  execute(): void {
    snap().slipClip(this.clipId, this.delta);
  }
  undo(): void {
    snap().slipClip(this.clipId, -this.delta);
  }
}

// ─── 10. SlideClip ───────────────────────────────────────────────────────────

/** Command to slide a clip, adjusting its position and neighbors. */
export class SlideClipCommand implements Command {
  readonly description = 'Slide clip';
  private prevNeighbors: { id: string; startTime: number; endTime: number }[] = [];

  constructor(
    private clipId: string,
    private trackId: string,
    private delta: number,
  ) {
    const state = snap();
    const track = state.tracks.find((t) => t.id === trackId);
    if (track) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) {
        // Capture neighbors
        for (const c of track.clips) {
          if (c.id === clipId) continue;
          if (c.endTime === clip.startTime || c.startTime === clip.endTime) {
            this.prevNeighbors.push({
              id: c.id,
              startTime: c.startTime,
              endTime: c.endTime,
            });
          }
        }
      }
    }
  }
  execute(): void {
    useEditorStore.setState((s) => {
      const track = s.tracks.find((t) => t.id === this.trackId);
      if (!track) return;
      const clip = track.clips.find((c) => c.id === this.clipId);
      if (!clip) return;

      // Find left and right neighbors
      const leftNeighbor = track.clips.find(
        (c) => c.id !== this.clipId && c.endTime === clip.startTime,
      );
      const rightNeighbor = track.clips.find(
        (c) => c.id !== this.clipId && c.startTime === clip.endTime,
      );

      clip.startTime += this.delta;
      clip.endTime += this.delta;
      if (leftNeighbor) leftNeighbor.endTime += this.delta;
      if (rightNeighbor) rightNeighbor.startTime += this.delta;
    });
  }
  undo(): void {
    useEditorStore.setState((s) => {
      const track = s.tracks.find((t) => t.id === this.trackId);
      if (!track) return;
      const clip = track.clips.find((c) => c.id === this.clipId);
      if (!clip) return;

      clip.startTime -= this.delta;
      clip.endTime -= this.delta;
      for (const saved of this.prevNeighbors) {
        const n = track.clips.find((c) => c.id === saved.id);
        if (n) {
          n.startTime = saved.startTime;
          n.endTime = saved.endTime;
        }
      }
    });
  }
}

// ─── 11. RippleDelete ────────────────────────────────────────────────────────

/** Command to delete a clip and shift subsequent clips to close the gap. */
export class RippleDeleteCommand implements Command {
  readonly description = 'Ripple delete';
  private savedClip: Clip | null = null;
  private trackId = '';
  private shiftAmount = 0;
  private shiftedClips: { id: string; prevStart: number; prevEnd: number }[] = [];

  constructor(private clipId: string) {
    for (const track of snap().tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) {
        this.savedClip = { ...clip };
        this.trackId = track.id;
        this.shiftAmount = clip.endTime - clip.startTime;
        // Capture clips that will shift
        for (const c of track.clips) {
          if (c.startTime >= clip.endTime) {
            this.shiftedClips.push({
              id: c.id,
              prevStart: c.startTime,
              prevEnd: c.endTime,
            });
          }
        }
        break;
      }
    }
  }
  execute(): void {
    useEditorStore.setState((s) => {
      const track = s.tracks.find((t) => t.id === this.trackId);
      if (!track) return;
      // Remove the clip
      track.clips = track.clips.filter((c) => c.id !== this.clipId);
      // Shift subsequent clips left
      for (const c of track.clips) {
        if (this.savedClip && c.startTime >= this.savedClip.endTime) {
          c.startTime -= this.shiftAmount;
          c.endTime -= this.shiftAmount;
        }
      }
    });
  }
  undo(): void {
    useEditorStore.setState((s) => {
      const track = s.tracks.find((t) => t.id === this.trackId);
      if (!track) return;
      // Restore shifted clips
      for (const saved of this.shiftedClips) {
        const c = track.clips.find((c) => c.id === saved.id);
        if (c) {
          c.startTime = saved.prevStart;
          c.endTime = saved.prevEnd;
        }
      }
      // Re-add the deleted clip
      if (this.savedClip) {
        track.clips.push(this.savedClip);
        track.clips.sort((a, b) => a.startTime - b.startTime);
      }
    });
  }
}

// ─── 12. GroupClips ──────────────────────────────────────────────────────────

/** Command to group multiple clips under a single group ID. */
export class GroupClipsCommand implements Command {
  readonly description = 'Group clips';

  constructor(
    private groupId: string,
    private clipIds: string[],
  ) {}
  execute(): void {
    snap().setClipGroup(this.groupId, this.clipIds);
  }
  undo(): void {
    snap().removeClipGroup(this.groupId);
  }
}
