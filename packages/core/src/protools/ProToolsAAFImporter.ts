// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Pro Tools AAF Importer (PT-02)
//  Imports revised AAF files from Pro Tools, re-links audio to the
//  original sequence, preserves video tracks, and shows diff of changes.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  EditorProject,
  EditorTrack,
  EditorClip,
  EditorMarker,
} from '../project-library';

// ─── Types ─────────────────────────────────────────────────────────────────

export type AAFImportStatus = 'pending' | 'parsing' | 'relinking' | 'merging' | 'complete' | 'error';

export interface AAFSourceClip {
  clipId: string;
  clipName: string;
  trackName: string;
  sourceFilePath: string;
  startTimecodeTC: string;
  endTimecodeTC: string;
  timelineStartSeconds: number;
  timelineEndSeconds: number;
  trimStartSeconds: number;
  trimEndSeconds: number;
  gainDb: number;
}

export interface AAFSourceTrack {
  trackId: string;
  trackName: string;
  clips: AAFSourceClip[];
}

export interface AAFParsedFile {
  formatVersion: string;
  sampleRate: number;
  bitDepth: number;
  tracks: AAFSourceTrack[];
  markers: AAFSourceMarker[];
  totalDurationSeconds: number;
}

export interface AAFSourceMarker {
  id: string;
  label: string;
  timeSeconds: number;
  color?: string;
}

export interface AAFDiffEntry {
  type: 'added' | 'removed' | 'modified' | 'moved' | 'retimed';
  clipId: string;
  clipName: string;
  trackName: string;
  description: string;
  originalStartSeconds?: number;
  originalEndSeconds?: number;
  revisedStartSeconds?: number;
  revisedEndSeconds?: number;
  gainChangeDb?: number;
}

export interface AAFRelinkResult {
  clipId: string;
  originalAssetId: string | null;
  relinkedAssetId: string | null;
  status: 'linked' | 'unlinked' | 'missing';
  matchConfidence: number; // 0-1
}

export interface AAFImportOptions {
  preserveVideoTracks: boolean;
  relinkMedia: boolean;
  mergeMode: 'replace' | 'overlay' | 'append';
  showDiff: boolean;
  acceptGainChanges: boolean;
  acceptTimingChanges: boolean;
}

export interface AAFImportResult {
  success: boolean;
  status: AAFImportStatus;
  parsedFile: AAFParsedFile | null;
  diff: AAFDiffEntry[];
  relinkResults: AAFRelinkResult[];
  mergedTracks: EditorTrack[];
  preservedVideoTracks: EditorTrack[];
  warnings: string[];
  errors: string[];
}

// ─── Importer ──────────────────────────────────────────────────────────────

export class ProToolsAAFImporter {
  private project: EditorProject;
  private options: AAFImportOptions;
  private errors: string[] = [];
  private warnings: string[] = [];

  constructor(project: EditorProject, options?: Partial<AAFImportOptions>) {
    this.project = project;
    this.options = {
      preserveVideoTracks: options?.preserveVideoTracks ?? true,
      relinkMedia: options?.relinkMedia ?? true,
      mergeMode: options?.mergeMode ?? 'replace',
      showDiff: options?.showDiff ?? true,
      acceptGainChanges: options?.acceptGainChanges ?? true,
      acceptTimingChanges: options?.acceptTimingChanges ?? true,
    };
  }

  /**
   * Parses raw AAF data (simulated as a structured object).
   */
  parseAAF(rawData: string | Record<string, unknown>): AAFParsedFile {
    try {
      const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;

      const tracks: AAFSourceTrack[] = Array.isArray(data.tracks)
        ? data.tracks.map((t: Record<string, unknown>) => ({
            trackId: String(t['trackId'] ?? ''),
            trackName: String(t['trackName'] ?? ''),
            clips: Array.isArray(t['clips'])
              ? t['clips'].map((c: Record<string, unknown>) => ({
                  clipId: String(c['clipId'] ?? ''),
                  clipName: String(c['clipName'] ?? ''),
                  trackName: String(t['trackName'] ?? ''),
                  sourceFilePath: String(c['sourceFilePath'] ?? ''),
                  startTimecodeTC: String(c['startTimecodeTC'] ?? '00:00:00:00'),
                  endTimecodeTC: String(c['endTimecodeTC'] ?? '00:00:00:00'),
                  timelineStartSeconds: Number(c['timelineStartSeconds'] ?? 0),
                  timelineEndSeconds: Number(c['timelineEndSeconds'] ?? 0),
                  trimStartSeconds: Number(c['trimStartSeconds'] ?? 0),
                  trimEndSeconds: Number(c['trimEndSeconds'] ?? 0),
                  gainDb: Number(c['gainDb'] ?? 0),
                }))
              : [],
          }))
        : [];

      const markers: AAFSourceMarker[] = Array.isArray(data.markers)
        ? data.markers.map((m: Record<string, unknown>) => ({
            id: String(m['id'] ?? ''),
            label: String(m['label'] ?? ''),
            timeSeconds: Number(m['timeSeconds'] ?? 0),
            color: m['color'] ? String(m['color']) : undefined,
          }))
        : [];

      return {
        formatVersion: String(data.formatVersion ?? '1.1'),
        sampleRate: Number(data.sampleRate ?? 48000),
        bitDepth: Number(data.bitDepth ?? 24),
        tracks,
        markers,
        totalDurationSeconds: tracks.reduce((max, t) =>
          Math.max(max, ...t.clips.map((c) => c.timelineEndSeconds)), 0),
      };
    } catch (err) {
      this.errors.push(`Failed to parse AAF data: ${String(err)}`);
      return {
        formatVersion: '1.1',
        sampleRate: 48000,
        bitDepth: 24,
        tracks: [],
        markers: [],
        totalDurationSeconds: 0,
      };
    }
  }

  /**
   * Computes the diff between the original project audio tracks
   * and the incoming AAF file.
   */
  computeDiff(parsed: AAFParsedFile): AAFDiffEntry[] {
    const diff: AAFDiffEntry[] = [];
    const originalAudioTracks = this.project.tracks.filter((t) => t.type === 'AUDIO');

    const originalClipMap = new Map<string, { clip: EditorClip; trackName: string }>();
    for (const track of originalAudioTracks) {
      for (const clip of track.clips) {
        originalClipMap.set(clip.id, { clip, trackName: track.name });
      }
    }

    const revisedClipIds = new Set<string>();

    for (const track of parsed.tracks) {
      for (const clip of track.clips) {
        revisedClipIds.add(clip.clipId);
        const original = originalClipMap.get(clip.clipId);

        if (!original) {
          diff.push({
            type: 'added',
            clipId: clip.clipId,
            clipName: clip.clipName,
            trackName: clip.trackName,
            description: `New clip "${clip.clipName}" added on track "${clip.trackName}"`,
            revisedStartSeconds: clip.timelineStartSeconds,
            revisedEndSeconds: clip.timelineEndSeconds,
          });
          continue;
        }

        const origClip = original.clip;
        const timingChanged =
          Math.abs(origClip.startTime - clip.timelineStartSeconds) > 0.001 ||
          Math.abs(origClip.endTime - clip.timelineEndSeconds) > 0.001;

        if (timingChanged) {
          diff.push({
            type: 'retimed',
            clipId: clip.clipId,
            clipName: clip.clipName,
            trackName: clip.trackName,
            description: `Clip "${clip.clipName}" retimed on "${clip.trackName}"`,
            originalStartSeconds: origClip.startTime,
            originalEndSeconds: origClip.endTime,
            revisedStartSeconds: clip.timelineStartSeconds,
            revisedEndSeconds: clip.timelineEndSeconds,
          });
        }

        if (original.trackName !== clip.trackName) {
          diff.push({
            type: 'moved',
            clipId: clip.clipId,
            clipName: clip.clipName,
            trackName: clip.trackName,
            description: `Clip "${clip.clipName}" moved from "${original.trackName}" to "${clip.trackName}"`,
          });
        }
      }
    }

    for (const [clipId, entry] of originalClipMap) {
      if (!revisedClipIds.has(clipId)) {
        diff.push({
          type: 'removed',
          clipId,
          clipName: entry.clip.name,
          trackName: entry.trackName,
          description: `Clip "${entry.clip.name}" removed from "${entry.trackName}"`,
          originalStartSeconds: entry.clip.startTime,
          originalEndSeconds: entry.clip.endTime,
        });
      }
    }

    return diff;
  }

  /**
   * Re-links revised AAF clips to original project media assets.
   */
  relinkMedia(parsed: AAFParsedFile): AAFRelinkResult[] {
    const results: AAFRelinkResult[] = [];
    const originalAudioTracks = this.project.tracks.filter((t) => t.type === 'AUDIO');
    const clipToAssetMap = new Map<string, string>();

    for (const track of originalAudioTracks) {
      for (const clip of track.clips) {
        if (clip.assetId) {
          clipToAssetMap.set(clip.id, clip.assetId);
          clipToAssetMap.set(clip.name, clip.assetId);
        }
      }
    }

    for (const track of parsed.tracks) {
      for (const clip of track.clips) {
        const directMatch = clipToAssetMap.get(clip.clipId);
        const nameMatch = clipToAssetMap.get(clip.clipName);
        const relinkedAssetId = directMatch ?? nameMatch ?? null;

        results.push({
          clipId: clip.clipId,
          originalAssetId: directMatch ?? null,
          relinkedAssetId,
          status: relinkedAssetId ? 'linked' : 'missing',
          matchConfidence: directMatch ? 1.0 : nameMatch ? 0.8 : 0,
        });

        if (!relinkedAssetId) {
          this.warnings.push(`Could not relink clip "${clip.clipName}" to original media`);
        }
      }
    }

    return results;
  }

  /**
   * Merges the revised AAF into the project, preserving video tracks.
   */
  merge(parsed: AAFParsedFile, relinkResults: AAFRelinkResult[]): AAFImportResult {
    const relinkMap = new Map<string, AAFRelinkResult>();
    for (const result of relinkResults) {
      relinkMap.set(result.clipId, result);
    }

    const preservedVideoTracks = this.options.preserveVideoTracks
      ? this.project.tracks.filter((t) => t.type === 'VIDEO' || t.type === 'EFFECT' || t.type === 'SUBTITLE')
      : [];

    const mergedTracks: EditorTrack[] = parsed.tracks.map((sourceTrack, index) => ({
      id: sourceTrack.trackId || `aaf-track-${index}`,
      name: sourceTrack.trackName,
      type: 'AUDIO' as const,
      sortOrder: preservedVideoTracks.length + index,
      muted: false,
      locked: false,
      solo: false,
      volume: 1,
      color: index % 2 === 0 ? '#2bb672' : '#4ade80',
      clips: sourceTrack.clips.map((sourceClip) => {
        const relink = relinkMap.get(sourceClip.clipId);
        return {
          id: sourceClip.clipId,
          trackId: sourceTrack.trackId || `aaf-track-${index}`,
          name: sourceClip.clipName,
          startTime: sourceClip.timelineStartSeconds,
          endTime: sourceClip.timelineEndSeconds,
          trimStart: sourceClip.trimStartSeconds,
          trimEnd: sourceClip.trimEndSeconds,
          type: 'audio' as const,
          assetId: relink?.relinkedAssetId ?? undefined,
        };
      }),
    }));

    const diff = this.options.showDiff ? this.computeDiff(parsed) : [];

    return {
      success: this.errors.length === 0,
      status: 'complete',
      parsedFile: parsed,
      diff,
      relinkResults,
      mergedTracks,
      preservedVideoTracks,
      warnings: [...this.warnings],
      errors: [...this.errors],
    };
  }

  /**
   * Full import pipeline: parse, diff, relink, merge.
   */
  importAAF(rawData: string | Record<string, unknown>): AAFImportResult {
    const parsed = this.parseAAF(rawData);

    if (this.errors.length > 0) {
      return {
        success: false,
        status: 'error',
        parsedFile: null,
        diff: [],
        relinkResults: [],
        mergedTracks: [],
        preservedVideoTracks: [],
        warnings: [...this.warnings],
        errors: [...this.errors],
      };
    }

    const relinkResults = this.options.relinkMedia ? this.relinkMedia(parsed) : [];
    return this.merge(parsed, relinkResults);
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────

export function createAAFImporter(
  project: EditorProject,
  options?: Partial<AAFImportOptions>,
): ProToolsAAFImporter {
  return new ProToolsAAFImporter(project, options);
}

export function importAAFToProject(
  project: EditorProject,
  rawData: string | Record<string, unknown>,
  options?: Partial<AAFImportOptions>,
): AAFImportResult {
  const importer = new ProToolsAAFImporter(project, options);
  return importer.importAAF(rawData);
}
