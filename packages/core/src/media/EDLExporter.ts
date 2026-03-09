// =============================================================================
//  THE AVID -- FT-02: EDL / ALE / CSV Sequence Export
// =============================================================================
//
//  Exports timeline data in industry-standard interchange formats:
//    - CMX 3600 EDL (Edit Decision List)
//    - Avid Log Exchange (ALE)
//    - CSV from sequence
//
//  Supports drop-frame / non-drop timecode, dissolves, speed changes,
//  and custom metadata columns.
// =============================================================================

import type {
  EditorProject,
  EditorTrack,
  EditorClip,
  EditorMediaAsset,
} from '../project-library';
import { flattenAssets } from '../project-library';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Timecode mode for EDL generation. */
export type TimecodeMode = 'non-drop' | 'drop-frame';

/** Transition type for an EDL event. */
export type EDLTransition = 'C' | 'D' | 'W' | 'K';

/** A single event line in a CMX 3600 EDL. */
export interface EDLEvent {
  eventNumber: number;
  reelName: string;
  trackType: 'V' | 'A' | 'A2' | 'AA' | 'AA/V' | 'B';
  transition: EDLTransition;
  transitionDuration: number; // In frames; 0 for cuts
  sourceIn: string;
  sourceOut: string;
  recordIn: string;
  recordOut: string;
  clipName: string;
  speedChange?: number; // Percentage (100 = normal)
  comment?: string;
}

/** Options for EDL export. */
export interface EDLExportOptions {
  /** Title of the EDL. */
  title?: string;
  /** Frame rate for timecode calculation. */
  frameRate?: number;
  /** Timecode mode. */
  timecodeMode?: TimecodeMode;
  /** Include comments / clip name lines. */
  includeComments?: boolean;
  /** Include speed change annotations (M2 lines). */
  includeSpeedChanges?: boolean;
  /** Restrict to specific track types. */
  trackTypes?: ('VIDEO' | 'AUDIO')[];
  /** Maximum reel name length (CMX 3600 supports 8 chars). */
  reelNameLength?: number;
}

/** A column definition for ALE export. */
export interface ALEColumn {
  name: string;
  /** Value extractor from clip + asset. */
  extractor: (clip: EditorClip, asset: EditorMediaAsset | undefined, track: EditorTrack) => string;
}

/** Options for ALE export. */
export interface ALEExportOptions {
  /** Frame rate. */
  frameRate?: number;
  /** Timecode mode. */
  timecodeMode?: TimecodeMode;
  /** Custom columns to include beyond the defaults. */
  customColumns?: ALEColumn[];
  /** Film format identifier. */
  filmFormat?: string;
  /** Audio format identifier. */
  audioFormat?: string;
  /** Video format identifier. */
  videoFormat?: string;
}

/** Options for CSV export. */
export interface CSVExportOptions {
  /** Frame rate. */
  frameRate?: number;
  /** Delimiter character. */
  delimiter?: string;
  /** Include header row. */
  includeHeaders?: boolean;
  /** Columns to include. */
  columns?: string[];
}

/** Errors from EDL/ALE export. */
export class EDLExportError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_PROJECT' | 'NO_CLIPS' | 'TIMECODE_ERROR',
  ) {
    super(message);
    this.name = 'EDLExportError';
  }
}

// ─── Timecode helpers ───────────────────────────────────────────────────────

function secondsToTimecode(seconds: number, frameRate: number, dropFrame: boolean): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00:00:00';
  const totalFrames = Math.floor(seconds * frameRate);
  return framesToTimecode(totalFrames, frameRate, dropFrame);
}

function framesToTimecode(inputFrames: number, frameRate: number, dropFrame: boolean): string {
  const nominalRate = Math.round(frameRate);
  let frames = Math.max(0, inputFrames);

  if (dropFrame && (Math.abs(frameRate - 29.97) < 0.05 || nominalRate === 30)) {
    // Standard SMPTE drop-frame: frame numbers 0 and 1 are skipped at the
    // start of each minute except every 10th minute.
    const dropFrames = 2;
    const framesPerMinNominal = nominalRate * 60;                            // 1800
    const framesPerMinActual = framesPerMinNominal - dropFrames;             // 1798
    const framesPer10Min = framesPerMinNominal * 10 - dropFrames * 9;        // 17982

    // Wrap at 24 hours
    const framesPer24Hours = framesPer10Min * 6 * 24;
    frames = frames % framesPer24Hours;

    const d = Math.floor(frames / framesPer10Min);
    const m = frames % framesPer10Min;

    if (m >= dropFrames) {
      frames += dropFrames * (d * 9 + Math.floor((m - dropFrames) / framesPerMinActual));
    } else {
      frames += dropFrames * d * 9;
    }
  }

  const f = frames % nominalRate;
  const totalSec = Math.floor(frames / nominalRate);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);

  const sep = dropFrame ? ';' : ':';
  return [
    String(h).padStart(2, '0'),
    String(m).padStart(2, '0'),
    String(s).padStart(2, '0'),
  ].join(':') + sep + String(f).padStart(2, '0');
}

function sanitizeReelName(name: string, maxLen: number): string {
  return name
    .replace(/[^A-Za-z0-9_\- ]/g, '')
    .trim()
    .substring(0, maxLen)
    .padEnd(maxLen, ' ');
}

// ─── EDL Exporter ───────────────────────────────────────────────────────────

/**
 * Exports timeline state as a CMX 3600 Edit Decision List.
 *
 * Usage:
 * ```ts
 * const exporter = new EDLExporter(project);
 * const edlString = exporter.exportEDL({ title: 'My Sequence' });
 * ```
 */
export class EDLExporter {
  private project: EditorProject;
  private assetMap: Map<string, EditorMediaAsset>;

  constructor(project: EditorProject) {
    if (!project || !project.id) {
      throw new EDLExportError('A valid project is required', 'INVALID_PROJECT');
    }
    this.project = project;
    this.assetMap = new Map();
    for (const asset of flattenAssets(project.bins)) {
      this.assetMap.set(asset.id, asset);
    }
  }

  // ── CMX 3600 EDL ────────────────────────────────────────────────────────

  /**
   * Generate a CMX 3600 EDL string.
   */
  exportEDL(options: EDLExportOptions = {}): string {
    const frameRate = options.frameRate ?? this.project.settings.frameRate;
    const dropFrame = options.timecodeMode === 'drop-frame';
    const includeComments = options.includeComments ?? true;
    const includeSpeedChanges = options.includeSpeedChanges ?? true;
    const reelLen = options.reelNameLength ?? 8;
    const trackFilter = options.trackTypes ?? ['VIDEO', 'AUDIO'];

    const events = this.buildEDLEvents(frameRate, dropFrame, reelLen, trackFilter);

    if (events.length === 0) {
      throw new EDLExportError('No clips available for EDL export', 'NO_CLIPS');
    }

    const lines: string[] = [];
    const title = options.title ?? this.project.name;
    lines.push(`TITLE: ${title}`);
    lines.push(`FCM: ${dropFrame ? 'DROP FRAME' : 'NON-DROP FRAME'}`);
    lines.push('');

    for (const event of events) {
      // Main event line
      const eventNum = String(event.eventNumber).padStart(3, '0');
      const reel = event.reelName.padEnd(reelLen, ' ');
      const trackCode = event.trackType.padEnd(5, ' ');
      const transition = event.transition;
      const transDur = event.transitionDuration > 0
        ? String(event.transitionDuration).padStart(3, '0')
        : '   ';

      lines.push(
        `${eventNum}  ${reel} ${trackCode} ${transition}    ${transDur} ` +
        `${event.sourceIn} ${event.sourceOut} ${event.recordIn} ${event.recordOut}`
      );

      // Speed change line (M2)
      if (includeSpeedChanges && event.speedChange && event.speedChange !== 100) {
        lines.push(`M2   ${reel}       ${event.speedChange.toFixed(1)}                ${event.sourceIn}`);
      }

      // Comment / clip name line
      if (includeComments && event.clipName) {
        lines.push(`* FROM CLIP NAME: ${event.clipName}`);
      }
      if (includeComments && event.comment) {
        lines.push(`* ${event.comment}`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  // ── ALE Export ──────────────────────────────────────────────────────────

  /**
   * Generate an Avid Log Exchange (ALE) file string.
   */
  exportALE(options: ALEExportOptions = {}): string {
    const frameRate = options.frameRate ?? this.project.settings.frameRate;
    const dropFrame = options.timecodeMode === 'drop-frame';

    const defaultColumns: ALEColumn[] = [
      { name: 'Name', extractor: (clip) => clip.name },
      { name: 'Tracks', extractor: (_c, _a, track) => track.type },
      { name: 'Start', extractor: (clip) => secondsToTimecode(clip.startTime, frameRate, dropFrame) },
      { name: 'End', extractor: (clip) => secondsToTimecode(clip.endTime, frameRate, dropFrame) },
      { name: 'Duration', extractor: (clip) => secondsToTimecode(clip.endTime - clip.startTime, frameRate, dropFrame) },
      { name: 'Source In', extractor: (clip) => secondsToTimecode(clip.trimStart, frameRate, dropFrame) },
      { name: 'Source Out', extractor: (clip) => secondsToTimecode(clip.trimStart + (clip.endTime - clip.startTime), frameRate, dropFrame) },
      { name: 'Tape', extractor: (_c, asset) => asset?.technicalMetadata?.reelName ?? asset?.relinkIdentity?.reelName ?? '' },
      { name: 'ASC_SOP', extractor: () => '' },
      { name: 'ASC_SAT', extractor: () => '' },
      { name: 'Codec', extractor: (_c, asset) => asset?.technicalMetadata?.videoCodec ?? '' },
      { name: 'Resolution', extractor: (_c, asset) => {
        const w = asset?.technicalMetadata?.width;
        const h = asset?.technicalMetadata?.height;
        return w && h ? `${w}x${h}` : '';
      }},
      { name: 'FPS', extractor: (_c, asset) => asset?.technicalMetadata?.frameRate ? String(asset.technicalMetadata.frameRate) : String(frameRate) },
    ];

    const columns = [...defaultColumns, ...(options.customColumns ?? [])];

    const lines: string[] = [];

    // Heading section
    lines.push('Heading');
    lines.push(`FIELD_DELIM\tTABS`);
    lines.push(`VIDEO_FORMAT\t${options.videoFormat ?? `${this.project.settings.width}x${this.project.settings.height}`}`);
    lines.push(`AUDIO_FORMAT\t${options.audioFormat ?? `${this.project.settings.sampleRate}Hz`}`);
    lines.push(`FPS\t${frameRate}`);
    lines.push('');

    // Column headers
    lines.push('Column');
    lines.push(columns.map((c) => c.name).join('\t'));
    lines.push('');

    // Data section
    lines.push('Data');
    for (const track of this.project.tracks) {
      for (const clip of track.clips) {
        const asset = clip.assetId ? this.assetMap.get(clip.assetId) : undefined;
        const values = columns.map((col) => col.extractor(clip, asset, track));
        lines.push(values.join('\t'));
      }
    }

    return lines.join('\n');
  }

  // ── CSV Export ──────────────────────────────────────────────────────────

  /**
   * Export the sequence as a CSV file.
   */
  exportCSV(options: CSVExportOptions = {}): string {
    const frameRate = options.frameRate ?? this.project.settings.frameRate;
    const delimiter = options.delimiter ?? ',';
    const includeHeaders = options.includeHeaders ?? true;

    const defaultColumns = [
      'Clip Name', 'Track', 'Type', 'Timeline In', 'Timeline Out',
      'Duration', 'Source In', 'Source Out', 'Reel', 'File Name',
    ];
    const columns = options.columns ?? defaultColumns;

    const rows: string[] = [];
    if (includeHeaders) {
      rows.push(columns.map((c) => this.csvEscape(c, delimiter)).join(delimiter));
    }

    for (const track of this.project.tracks) {
      for (const clip of track.clips) {
        const asset = clip.assetId ? this.assetMap.get(clip.assetId) : undefined;
        const duration = clip.endTime - clip.startTime;
        const sourceIn = secondsToTimecode(clip.trimStart, frameRate, false);
        const sourceOut = secondsToTimecode(clip.trimStart + duration, frameRate, false);

        const valueMap: Record<string, string> = {
          'Clip Name': clip.name,
          'Track': track.name,
          'Type': track.type,
          'Timeline In': secondsToTimecode(clip.startTime, frameRate, false),
          'Timeline Out': secondsToTimecode(clip.endTime, frameRate, false),
          'Duration': secondsToTimecode(duration, frameRate, false),
          'Source In': sourceIn,
          'Source Out': sourceOut,
          'Reel': asset?.technicalMetadata?.reelName ?? '',
          'File Name': asset?.name ?? clip.name,
        };

        const values = columns.map((col) => this.csvEscape(valueMap[col] ?? '', delimiter));
        rows.push(values.join(delimiter));
      }
    }

    return rows.join('\n');
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private buildEDLEvents(
    frameRate: number,
    dropFrame: boolean,
    reelLen: number,
    trackFilter: string[],
  ): EDLEvent[] {
    const events: EDLEvent[] = [];
    let eventNumber = 1;

    // Collect clips from matching tracks, sorted by timeline position
    const allClips: Array<{ clip: EditorClip; track: EditorTrack }> = [];
    for (const track of this.project.tracks) {
      if (!trackFilter.includes(track.type)) continue;
      for (const clip of track.clips) {
        allClips.push({ clip, track });
      }
    }
    allClips.sort((a, b) => a.clip.startTime - b.clip.startTime);

    for (const { clip, track } of allClips) {
      const asset = clip.assetId ? this.assetMap.get(clip.assetId) : undefined;
      const reelName = sanitizeReelName(
        asset?.technicalMetadata?.reelName ?? asset?.relinkIdentity?.reelName ?? 'AX',
        reelLen,
      );

      // Determine track type code
      let trackType: EDLEvent['trackType'] = 'V';
      if (track.type === 'AUDIO') {
        const audioIndex = this.project.tracks
          .filter((t) => t.type === 'AUDIO')
          .indexOf(track);
        trackType = audioIndex === 0 ? 'A' : audioIndex === 1 ? 'A2' : 'AA';
      }

      // Detect transitions (dissolve if clips overlap)
      let transition: EDLTransition = 'C';
      let transitionDuration = 0;
      if (events.length > 0) {
        const prevEvent = events[events.length - 1];
        const prevOutFrames = Math.round(parseTimecodeToSeconds(prevEvent.recordOut, frameRate, dropFrame) * frameRate);
        const thisInFrames = Math.round(clip.startTime * frameRate);
        if (thisInFrames < prevOutFrames) {
          transition = 'D';
          transitionDuration = prevOutFrames - thisInFrames;
        }
      }

      const duration = clip.endTime - clip.startTime;
      events.push({
        eventNumber: eventNumber++,
        reelName,
        trackType,
        transition,
        transitionDuration,
        sourceIn: secondsToTimecode(clip.trimStart, frameRate, dropFrame),
        sourceOut: secondsToTimecode(clip.trimStart + duration, frameRate, dropFrame),
        recordIn: secondsToTimecode(clip.startTime, frameRate, dropFrame),
        recordOut: secondsToTimecode(clip.endTime, frameRate, dropFrame),
        clipName: clip.name,
        speedChange: 100,
        comment: asset ? `Source: ${asset.name}` : undefined,
      });
    }

    return events;
  }

  private csvEscape(value: string, delimiter: string): string {
    if (value.includes(delimiter) || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}

// ─── Helper to parse timecode back to seconds ───────────────────────────────

function parseTimecodeToSeconds(tc: string, frameRate: number, dropFrame: boolean): number {
  const parts = tc.split(/[:;]/);
  if (parts.length !== 4) return 0;
  const [h, m, s, f] = parts.map(Number);
  const nominalRate = Math.round(frameRate);

  // Convert display timecode to a raw frame count
  let totalFrames = h * 3600 * nominalRate + m * 60 * nominalRate + s * nominalRate + f;

  if (dropFrame && (Math.abs(frameRate - 29.97) < 0.05 || nominalRate === 30)) {
    // Reverse the drop-frame adjustment: subtract the frames that were
    // added during display timecode generation.
    const dropFrames = 2;
    const totalMinutes = h * 60 + m;
    // Frames 0 and 1 are dropped every minute except every 10th minute
    totalFrames -= dropFrames * (totalMinutes - Math.floor(totalMinutes / 10));
  }

  return totalFrames / frameRate;
}

// ─── Re-exports ─────────────────────────────────────────────────────────────

export { secondsToTimecode, framesToTimecode };
