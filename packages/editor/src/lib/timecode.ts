// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Timecode Library
//  Supports all standard frame rates, drop-frame (29.97/59.94),
//  start-time offsets, and bidirectional conversion.
// ═══════════════════════════════════════════════════════════════════════════

/** All supported frame rates with human-readable labels. */
export const FRAME_RATE_OPTIONS = [
  { value: 23.976, label: '23.976 Film (NTSC)' },
  { value: 24, label: '24 True Film' },
  { value: 25, label: '25 PAL / SECAM' },
  { value: 29.97, label: '29.97 NTSC' },
  { value: 30, label: '30' },
  { value: 48, label: '48 HFR Film' },
  { value: 50, label: '50 PAL HFR' },
  { value: 59.94, label: '59.94 NTSC HFR' },
  { value: 60, label: '60' },
  { value: 120, label: '120' },
] as const;

/** Nominal integer fps for a given fractional rate. */
function nominalFps(fps: number): number {
  // 23.976 → 24, 29.97 → 30, 59.94 → 60
  return Math.round(fps);
}

/** Whether a frame rate supports drop-frame. */
export function supportsDropFrame(fps: number): boolean {
  return Math.abs(fps - 29.97) < 0.01 || Math.abs(fps - 59.94) < 0.01;
}

/**
 * Resolution presets for the sequence dialog.
 */
export const RESOLUTION_PRESETS = [
  { label: 'HD 1080p', width: 1920, height: 1080 },
  { label: '4K UHD', width: 3840, height: 2160 },
  { label: '720p', width: 1280, height: 720 },
  { label: 'Vertical 1080', width: 1080, height: 1920 },
  { label: '2K DCI', width: 2048, height: 1080 },
  { label: '4K DCI', width: 4096, height: 2160 },
] as const;

// ─── Timecode Class ──────────────────────────────────────────────────────────

export interface TimecodeConfig {
  fps: number;
  dropFrame?: boolean;
  /** Starting timecode offset in total frames (e.g., 01:00:00:00 at 24fps = 86400). */
  startOffset?: number;
}

/**
 * Production-grade timecode handler supporting non-drop-frame and
 * drop-frame (29.97 / 59.94) formats.
 *
 * Drop-frame algorithm:
 *   At 29.97fps, drop frames 0 and 1 at each minute boundary EXCEPT
 *   every 10th minute. This keeps timecode in sync with real wall-clock time.
 *   At 59.94fps, drop frames 0,1,2,3 at each minute boundary EXCEPT
 *   every 10th minute.
 */
export class Timecode {
  readonly fps: number;
  readonly dropFrame: boolean;
  readonly startOffset: number;
  /** Nominal integer frames per second (24, 30, 60, etc.) */
  readonly nom: number;
  /** Frames to drop per minute boundary for DF. */
  private readonly dropCount: number;

  constructor(config: TimecodeConfig) {
    this.fps = config.fps;
    this.dropFrame = config.dropFrame ?? false;
    this.startOffset = config.startOffset ?? 0;
    this.nom = nominalFps(this.fps);

    // Validate drop frame
    if (this.dropFrame && !supportsDropFrame(this.fps)) {
      console.warn(
        `[Timecode] Drop-frame not supported for ${this.fps}fps, disabling.`
      );
      this.dropFrame = false;
    }

    // 29.97 drops 2 frames, 59.94 drops 4 frames per minute (except every 10th)
    this.dropCount = Math.abs(this.fps - 59.94) < 0.01 ? 4 : 2;
  }

  // ── Frames → Timecode ───────────────────────────────────────────────────

  /**
   * Convert an absolute frame number to HH:MM:SS:FF (or HH:MM:SS;FF for DF).
   * Applies startOffset automatically.
   */
  framesToTC(absoluteFrame: number): string {
    const frame = Math.max(0, Math.floor(absoluteFrame + this.startOffset));
    const sep = this.dropFrame ? ';' : ':';

    if (this.dropFrame) {
      return this.framesToDropFrameTC(frame, sep);
    }
    return this.framesToNonDropTC(frame, sep);
  }

  private framesToNonDropTC(totalFrames: number, sep: string): string {
    const fps = this.nom;
    const f = totalFrames % fps;
    const s = Math.floor(totalFrames / fps) % 60;
    const m = Math.floor(totalFrames / (fps * 60)) % 60;
    const h = Math.floor(totalFrames / (fps * 3600));
    return (
      pad2(h) + ':' + pad2(m) + ':' + pad2(s) + sep + pad2(f)
    );
  }

  private framesToDropFrameTC(totalFrames: number, sep: string): string {
    const fps = this.nom; // 30 or 60
    const d = this.dropCount; // 2 or 4
    const framesPerMin = fps * 60 - d; // frames in a non-10th minute
    const framesPer10Min = framesPerMin * 10 + d; // frames in 10 minutes

    const tenMinBlocks = Math.floor(totalFrames / framesPer10Min);
    let remainder = totalFrames % framesPer10Min;

    // First minute of the 10-min block has no drops
    let minuteInBlock: number;
    if (remainder < fps * 60) {
      // We're in the first minute of this 10-minute block (no drops)
      minuteInBlock = 0;
    } else {
      remainder -= fps * 60; // remove the first minute
      minuteInBlock = 1 + Math.floor(remainder / framesPerMin);
      remainder = remainder % framesPerMin;

      // Add back dropped frames for display
      remainder += d;
    }

    const totalMinutes = tenMinBlocks * 10 + minuteInBlock;

    const f = remainder % fps;
    const s = Math.floor(remainder / fps) % 60;
    const m = totalMinutes % 60;
    const h = Math.floor(totalMinutes / 60);

    return pad2(h) + ':' + pad2(m) + ':' + pad2(s) + sep + pad2(f);
  }

  // ── Timecode → Frames ───────────────────────────────────────────────────

  /**
   * Parse a timecode string (HH:MM:SS:FF or HH:MM:SS;FF) to absolute frame number.
   * Returns frame number WITHOUT startOffset applied (so you can store raw frame values).
   */
  tcToFrames(tc: string): number {
    const parts = tc.replace(/;/g, ':').split(':').map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) {
      console.warn(`[Timecode] Invalid timecode: "${tc}"`);
      return 0;
    }
    const [h, m, s, f] = parts;
    const isDF = tc.includes(';') || this.dropFrame;

    if (isDF && supportsDropFrame(this.fps)) {
      return this.dropFrameTCToFrames(h!, m!, s!, f!) - this.startOffset;
    }

    const fps = this.nom;
    return h! * fps * 3600 + m! * fps * 60 + s! * fps + f! - this.startOffset;
  }

  private dropFrameTCToFrames(h: number, m: number, s: number, f: number): number {
    const fps = this.nom;
    const d = this.dropCount;

    const totalMinutes = h * 60 + m;
    const tenMinBlocks = Math.floor(totalMinutes / 10);
    const remainingMinutes = totalMinutes % 10;

    // Total dropped frames up to this point
    const droppedFrames = d * (totalMinutes - tenMinBlocks);

    return (
      h * fps * 3600 +
      m * fps * 60 +
      s * fps +
      f -
      droppedFrames
    );
  }

  // ── Seconds ↔ Timecode ──────────────────────────────────────────────────

  /**
   * Convert seconds to timecode string.
   */
  secondsToTC(seconds: number): string {
    const frame = Math.floor(seconds * this.fps);
    return this.framesToTC(frame);
  }

  /**
   * Convert timecode string to seconds.
   */
  tcToSeconds(tc: string): number {
    const frames = this.tcToFrames(tc);
    return frames / this.fps;
  }

  /**
   * Convert seconds to frame number.
   */
  secondsToFrames(seconds: number): number {
    return Math.floor(seconds * this.fps);
  }

  /**
   * Convert frame number to seconds.
   */
  framesToSeconds(frames: number): number {
    return frames / this.fps;
  }
}

// ─── Convenience Functions ──────────────────────────────────────────────────

/** Zero-pad to 2 digits. */
function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

/**
 * Simple timecode formatter for quick display (backwards-compatible).
 * Uses non-drop-frame format.
 */
export function toTimecode(seconds: number, fps = 23.976): string {
  const tc = new Timecode({ fps, dropFrame: false });
  return tc.secondsToTC(seconds);
}

/**
 * Format a duration as M:SS for dashboard/short display.
 */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Track type → CSS color.
 */
export function trackTypeColor(type: string): string {
  switch (type) {
    case 'VIDEO':    return '#5b6ef4';
    case 'AUDIO':    return '#22c896';
    case 'EFFECT':   return '#f0a500';
    case 'SUBTITLE': return '#c084fc';
    case 'GRAPHIC':  return '#fb7185';
    default:         return '#5b6ef4';
  }
}

/**
 * Track type → clip CSS class.
 */
export function trackTypeClass(type: string): string {
  switch (type) {
    case 'VIDEO':    return 'clip-video';
    case 'AUDIO':    return 'clip-audio';
    case 'EFFECT':   return 'clip-effect';
    case 'SUBTITLE': return 'clip-subtitle';
    case 'GRAPHIC':  return 'clip-graphic';
    default:         return 'clip-video';
  }
}

/**
 * Media type → icon character.
 */
export function mediaTypeIcon(type: string): string {
  switch (type) {
    case 'VIDEO':    return '🎬';
    case 'AUDIO':    return '🎵';
    case 'IMAGE':    return '🖼️';
    case 'DOCUMENT': return '📄';
    default:         return '📁';
  }
}
