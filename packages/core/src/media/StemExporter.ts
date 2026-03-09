// =============================================================================
//  THE AVID -- FT-08: Audio Stem Export
// =============================================================================
//
//  Exports audio as separate stems for professional audio post-production:
//    - Standard stem types: D&E, Music, Effects, Mix, M&E
//    - WAV/AIFF at 24-bit 48kHz with embedded timecode
//    - Track-to-stem assignment with UI mapping data
// =============================================================================

import type {
  EditorProject,
  EditorTrack,
  EditorClip,
} from '../project-library';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Standard audio stem categories used in film/TV post-production. */
export type StemType =
  | 'dialogue'       // Dialogue & narration
  | 'effects'        // Sound effects
  | 'music'          // Music score & source music
  | 'mix'            // Full mix (all stems combined)
  | 'me'             // Music & Effects (international mix)
  | 'de'             // Dialogue & Effects
  | 'dm'             // Dialogue & Music
  | 'foley'          // Foley effects
  | 'ambience'       // Background ambience / atmosphere
  | 'narration'      // Voice-over narration
  | 'custom';        // User-defined custom stem

/** Audio file format for stem export. */
export type StemAudioFormat = 'wav' | 'aiff';

/** Bit depth for audio export. */
export type StemBitDepth = 16 | 24 | 32;

/** Channel configuration for a stem. */
export type StemChannelConfig =
  | 'mono'
  | 'stereo'
  | '5.1'
  | '7.1'
  | 'custom';

/** A single stem definition with track assignments. */
export interface StemDefinition {
  /** Unique stem identifier. */
  id: string;
  /** Stem name (e.g. 'Dialogue', 'Music Score'). */
  name: string;
  /** Stem type category. */
  type: StemType;
  /** Track IDs assigned to this stem. */
  trackIds: string[];
  /** Channel configuration. */
  channelConfig: StemChannelConfig;
  /** Number of output channels. */
  channelCount: number;
  /** Volume gain for this stem (1.0 = unity). */
  gain: number;
  /** Whether to include pan automation. */
  includePan: boolean;
  /** Color for UI display. */
  color: string;
  /** Whether this stem is enabled for export. */
  enabled: boolean;
  /** Custom filename suffix (appended to project name). */
  filenameSuffix?: string;
}

/** Configuration for the stem export operation. */
export interface StemExportConfig {
  /** Audio format. */
  format: StemAudioFormat;
  /** Bit depth. */
  bitDepth: StemBitDepth;
  /** Sample rate in Hz. */
  sampleRate: number;
  /** Whether to embed timecode in the file header. */
  embedTimecode: boolean;
  /** Start timecode for the exported stems. */
  startTimecode?: string;
  /** Whether to normalize peak levels. */
  normalize: boolean;
  /** Peak normalization target in dBFS (e.g. -1.0). */
  normalizationTarget: number;
  /** Whether to include a full mix stem alongside individual stems. */
  includeFullMix: boolean;
  /** Whether to add tail/handle at the end (seconds). */
  tailSeconds: number;
  /** Whether to add a pre-roll (seconds). */
  preRollSeconds: number;
  /** Dither type when converting bit depth. */
  ditherType: 'none' | 'triangular' | 'shaped';
  /** Output directory path. */
  outputDirectory?: string;
}

/** A stem export job descriptor (returned to the caller / UI). */
export interface StemExportJob {
  /** Unique job identifier. */
  id: string;
  /** The stem being exported. */
  stem: StemDefinition;
  /** Output file name. */
  outputFileName: string;
  /** Output file path. */
  outputFilePath: string;
  /** Status of this job. */
  status: 'pending' | 'processing' | 'completed' | 'failed';
  /** Progress 0-100. */
  progress: number;
  /** Duration of the stem in seconds. */
  durationSeconds: number;
  /** Estimated file size in bytes. */
  estimatedSizeBytes: number;
  /** Error message if failed. */
  error?: string;
}

/** Result of the overall stem export operation. */
export interface StemExportResult {
  /** Total stems exported. */
  totalStems: number;
  /** Successfully exported. */
  completed: number;
  /** Failed exports. */
  failed: number;
  /** Individual job results. */
  jobs: StemExportJob[];
  /** Total duration of the export in seconds. */
  totalDurationSeconds: number;
  /** Total estimated size in bytes. */
  totalEstimatedSizeBytes: number;
  /** Start timecode embedded in files. */
  startTimecode: string;
}

/** Track-to-stem mapping for the assignment UI. */
export interface TrackStemAssignment {
  trackId: string;
  trackName: string;
  trackType: string;
  assignedStemId: string | null;
  assignedStemName: string | null;
  assignedStemColor: string | null;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export class StemExportError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NO_STEMS'
      | 'NO_AUDIO_TRACKS'
      | 'INVALID_CONFIG'
      | 'EXPORT_FAILED'
      | 'TRACK_NOT_FOUND',
  ) {
    super(message);
    this.name = 'StemExportError';
  }
}

// ─── Default configuration ──────────────────────────────────────────────────

const DEFAULT_EXPORT_CONFIG: StemExportConfig = {
  format: 'wav',
  bitDepth: 24,
  sampleRate: 48000,
  embedTimecode: true,
  normalize: false,
  normalizationTarget: -1.0,
  includeFullMix: true,
  tailSeconds: 2.0,
  preRollSeconds: 0,
  ditherType: 'triangular',
};

/** Standard stem presets for common workflows. */
const STEM_PRESETS: Record<string, Omit<StemDefinition, 'id' | 'trackIds'>[]> = {
  'Film/TV Standard': [
    { name: 'Dialogue', type: 'dialogue', channelConfig: 'stereo', channelCount: 2, gain: 1.0, includePan: true, color: '#4f63f5', enabled: true, filenameSuffix: '_DX' },
    { name: 'Music', type: 'music', channelConfig: 'stereo', channelCount: 2, gain: 1.0, includePan: true, color: '#2bb672', enabled: true, filenameSuffix: '_MX' },
    { name: 'Effects', type: 'effects', channelConfig: 'stereo', channelCount: 2, gain: 1.0, includePan: true, color: '#e8943a', enabled: true, filenameSuffix: '_FX' },
    { name: 'M&E', type: 'me', channelConfig: 'stereo', channelCount: 2, gain: 1.0, includePan: true, color: '#c94f84', enabled: true, filenameSuffix: '_ME' },
    { name: 'Full Mix', type: 'mix', channelConfig: 'stereo', channelCount: 2, gain: 1.0, includePan: true, color: '#7c5cfc', enabled: true, filenameSuffix: '_MIX' },
  ],
  'Broadcast DE/ME': [
    { name: 'D&E', type: 'de', channelConfig: 'stereo', channelCount: 2, gain: 1.0, includePan: true, color: '#4f63f5', enabled: true, filenameSuffix: '_DE' },
    { name: 'Music', type: 'music', channelConfig: 'stereo', channelCount: 2, gain: 1.0, includePan: true, color: '#2bb672', enabled: true, filenameSuffix: '_MX' },
    { name: 'M&E', type: 'me', channelConfig: 'stereo', channelCount: 2, gain: 1.0, includePan: true, color: '#c94f84', enabled: true, filenameSuffix: '_ME' },
  ],
  'Podcast Simple': [
    { name: 'Voice', type: 'dialogue', channelConfig: 'mono', channelCount: 1, gain: 1.0, includePan: false, color: '#4f63f5', enabled: true, filenameSuffix: '_VO' },
    { name: 'Music Bed', type: 'music', channelConfig: 'stereo', channelCount: 2, gain: 1.0, includePan: true, color: '#2bb672', enabled: true, filenameSuffix: '_MX' },
    { name: 'Full Mix', type: 'mix', channelConfig: 'stereo', channelCount: 2, gain: 1.0, includePan: true, color: '#7c5cfc', enabled: true, filenameSuffix: '_MIX' },
  ],
  'Music Video': [
    { name: 'Music Master', type: 'music', channelConfig: 'stereo', channelCount: 2, gain: 1.0, includePan: true, color: '#2bb672', enabled: true, filenameSuffix: '_MUSIC' },
    { name: 'Production Audio', type: 'dialogue', channelConfig: 'stereo', channelCount: 2, gain: 1.0, includePan: true, color: '#4f63f5', enabled: true, filenameSuffix: '_PROD' },
    { name: 'SFX', type: 'effects', channelConfig: 'stereo', channelCount: 2, gain: 1.0, includePan: true, color: '#e8943a', enabled: true, filenameSuffix: '_SFX' },
  ],
};

// ─── Helper: generate ID ────────────────────────────────────────────────────

function generateId(prefix: string): string {
  if (typeof globalThis !== 'undefined' && (globalThis as any).crypto?.randomUUID) {
    return `${prefix}-${(globalThis as any).crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── StemExporter ───────────────────────────────────────────────────────────

/**
 * Manages audio stem definitions, track-to-stem assignments, and generates
 * export job descriptors for downstream encoding.
 *
 * Usage:
 * ```ts
 * const exporter = new StemExporter(project);
 * exporter.loadPreset('Film/TV Standard');
 * exporter.assignTrack('track-a1', 'stem-dialogue');
 * const result = exporter.export({ format: 'wav', bitDepth: 24, sampleRate: 48000 });
 * ```
 */
export class StemExporter {
  private project: EditorProject;
  private stems: Map<string, StemDefinition> = new Map();
  private listeners = new Set<() => void>();

  constructor(project: EditorProject) {
    this.project = project;
  }

  // ── Preset management ───────────────────────────────────────────────────

  /**
   * Get available stem preset names.
   */
  getPresetNames(): string[] {
    return Object.keys(STEM_PRESETS);
  }

  /**
   * Load a stem preset, creating stem definitions.
   */
  loadPreset(presetName: string): StemDefinition[] {
    const preset = STEM_PRESETS[presetName];
    if (!preset) {
      throw new StemExportError(`Unknown preset: ${presetName}`, 'INVALID_CONFIG');
    }

    this.stems.clear();
    const created: StemDefinition[] = [];

    for (const stemDef of preset) {
      const id = generateId('stem');
      const stem: StemDefinition = {
        id,
        ...stemDef,
        trackIds: [],
      };
      this.stems.set(id, stem);
      created.push({ ...stem });
    }

    // Auto-assign tracks based on naming heuristics
    this.autoAssignTracks();
    this.notify();
    return created;
  }

  // ── Stem CRUD ───────────────────────────────────────────────────────────

  /**
   * Add a custom stem definition.
   */
  addStem(stem: Omit<StemDefinition, 'id'>): StemDefinition {
    const id = generateId('stem');
    const newStem: StemDefinition = { id, ...stem };
    this.stems.set(id, newStem);
    this.notify();
    return { ...newStem };
  }

  /**
   * Update a stem definition.
   */
  updateStem(stemId: string, updates: Partial<Omit<StemDefinition, 'id'>>): StemDefinition {
    const stem = this.stems.get(stemId);
    if (!stem) throw new StemExportError('Stem not found', 'NO_STEMS');
    Object.assign(stem, updates);
    this.notify();
    return { ...stem };
  }

  /**
   * Remove a stem definition.
   */
  removeStem(stemId: string): void {
    this.stems.delete(stemId);
    this.notify();
  }

  /**
   * Get all stem definitions.
   */
  getStems(): StemDefinition[] {
    return Array.from(this.stems.values()).map((s) => ({ ...s, trackIds: [...s.trackIds] }));
  }

  /**
   * Get a specific stem.
   */
  getStem(stemId: string): StemDefinition | undefined {
    const stem = this.stems.get(stemId);
    return stem ? { ...stem, trackIds: [...stem.trackIds] } : undefined;
  }

  // ── Track assignment ────────────────────────────────────────────────────

  /**
   * Assign a track to a stem.
   */
  assignTrack(trackId: string, stemId: string): void {
    const stem = this.stems.get(stemId);
    if (!stem) throw new StemExportError('Stem not found', 'NO_STEMS');

    const track = this.project.tracks.find((t) => t.id === trackId);
    if (!track) throw new StemExportError(`Track ${trackId} not found`, 'TRACK_NOT_FOUND');

    // Remove from any other stem first
    for (const [, s] of this.stems) {
      s.trackIds = s.trackIds.filter((id) => id !== trackId);
    }

    stem.trackIds.push(trackId);
    this.notify();
  }

  /**
   * Unassign a track from its current stem.
   */
  unassignTrack(trackId: string): void {
    for (const [, stem] of this.stems) {
      stem.trackIds = stem.trackIds.filter((id) => id !== trackId);
    }
    this.notify();
  }

  /**
   * Get the track-to-stem assignment map for the UI.
   */
  getTrackAssignments(): TrackStemAssignment[] {
    const audioTracks = this.project.tracks.filter((t) => t.type === 'AUDIO');
    return audioTracks.map((track) => {
      let assignedStem: StemDefinition | null = null;
      for (const [, stem] of this.stems) {
        if (stem.trackIds.includes(track.id)) {
          assignedStem = stem;
          break;
        }
      }
      return {
        trackId: track.id,
        trackName: track.name,
        trackType: track.type,
        assignedStemId: assignedStem?.id ?? null,
        assignedStemName: assignedStem?.name ?? null,
        assignedStemColor: assignedStem?.color ?? null,
      };
    });
  }

  /**
   * Auto-assign tracks to stems based on track names and types.
   */
  autoAssignTracks(): void {
    const audioTracks = this.project.tracks.filter((t) => t.type === 'AUDIO');

    for (const track of audioTracks) {
      const name = track.name.toLowerCase();
      let bestStem: StemDefinition | null = null;

      for (const [, stem] of this.stems) {
        // Match by track name heuristics
        if (stem.type === 'dialogue' && (name.includes('dx') || name.includes('dial') || name.includes('vo') || name.includes('a1'))) {
          bestStem = stem;
          break;
        }
        if (stem.type === 'music' && (name.includes('mx') || name.includes('music') || name.includes('score') || name.includes('a2'))) {
          bestStem = stem;
          break;
        }
        if (stem.type === 'effects' && (name.includes('fx') || name.includes('sfx') || name.includes('effect'))) {
          bestStem = stem;
          break;
        }
        if (stem.type === 'foley' && name.includes('foley')) {
          bestStem = stem;
          break;
        }
        if (stem.type === 'ambience' && (name.includes('amb') || name.includes('bg') || name.includes('atm'))) {
          bestStem = stem;
          break;
        }
        if (stem.type === 'narration' && (name.includes('narr') || name.includes('vo'))) {
          bestStem = stem;
          break;
        }
      }

      if (bestStem && !bestStem.trackIds.includes(track.id)) {
        bestStem.trackIds.push(track.id);
      }
    }
  }

  // ── Export ──────────────────────────────────────────────────────────────

  /**
   * Generate stem export jobs from the current stem definitions and config.
   * Returns descriptors for a downstream encoder to process.
   */
  export(config: Partial<StemExportConfig> = {}): StemExportResult {
    const fullConfig: StemExportConfig = { ...DEFAULT_EXPORT_CONFIG, ...config };
    const enabledStems = Array.from(this.stems.values()).filter((s) => s.enabled && s.trackIds.length > 0);

    if (enabledStems.length === 0) {
      throw new StemExportError('No enabled stems with assigned tracks', 'NO_STEMS');
    }

    // Calculate timeline duration
    const timelineDuration = this.calculateTimelineDuration();
    const totalDuration = timelineDuration + fullConfig.tailSeconds + fullConfig.preRollSeconds;

    // Generate start timecode
    const startTimecode = fullConfig.startTimecode ?? this.generateStartTimecode(fullConfig.preRollSeconds);

    const jobs: StemExportJob[] = [];
    const projectName = this.project.name.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
    const ext = fullConfig.format;

    for (const stem of enabledStems) {
      const suffix = stem.filenameSuffix ?? `_${stem.type.toUpperCase()}`;
      const fileName = `${projectName}${suffix}.${ext}`;
      const filePath = fullConfig.outputDirectory
        ? `${fullConfig.outputDirectory}/${fileName}`
        : fileName;

      const estimatedSize = this.estimateFileSize(
        totalDuration,
        fullConfig.sampleRate,
        fullConfig.bitDepth,
        stem.channelCount,
      );

      jobs.push({
        id: generateId('stemjob'),
        stem: { ...stem, trackIds: [...stem.trackIds] },
        outputFileName: fileName,
        outputFilePath: filePath,
        status: 'pending',
        progress: 0,
        durationSeconds: totalDuration,
        estimatedSizeBytes: estimatedSize,
      });
    }

    // Include full mix if requested
    if (fullConfig.includeFullMix) {
      const allTrackIds = new Set<string>();
      for (const stem of enabledStems) {
        for (const tid of stem.trackIds) allTrackIds.add(tid);
      }

      const mixStem: StemDefinition = {
        id: generateId('stem'),
        name: 'Full Mix',
        type: 'mix',
        trackIds: Array.from(allTrackIds),
        channelConfig: 'stereo',
        channelCount: 2,
        gain: 1.0,
        includePan: true,
        color: '#7c5cfc',
        enabled: true,
        filenameSuffix: '_MIX',
      };

      // Only add if not already present
      const hasMix = enabledStems.some((s) => s.type === 'mix');
      if (!hasMix) {
        const fileName = `${projectName}_MIX.${ext}`;
        const filePath = fullConfig.outputDirectory
          ? `${fullConfig.outputDirectory}/${fileName}`
          : fileName;

        jobs.push({
          id: generateId('stemjob'),
          stem: mixStem,
          outputFileName: fileName,
          outputFilePath: filePath,
          status: 'pending',
          progress: 0,
          durationSeconds: totalDuration,
          estimatedSizeBytes: this.estimateFileSize(totalDuration, fullConfig.sampleRate, fullConfig.bitDepth, 2),
        });
      }
    }

    const totalEstimatedSize = jobs.reduce((sum, j) => sum + j.estimatedSizeBytes, 0);

    return {
      totalStems: jobs.length,
      completed: 0,
      failed: 0,
      jobs,
      totalDurationSeconds: totalDuration,
      totalEstimatedSizeBytes: totalEstimatedSize,
      startTimecode,
    };
  }

  /**
   * Get export config validation results.
   */
  validateConfig(config: Partial<StemExportConfig> = {}): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const fullConfig: StemExportConfig = { ...DEFAULT_EXPORT_CONFIG, ...config };

    if (![16, 24, 32].includes(fullConfig.bitDepth)) {
      errors.push(`Unsupported bit depth: ${fullConfig.bitDepth}. Use 16, 24, or 32.`);
    }
    if (![44100, 48000, 88200, 96000].includes(fullConfig.sampleRate)) {
      warnings.push(`Non-standard sample rate: ${fullConfig.sampleRate}Hz. Industry standard is 48000Hz.`);
    }
    if (fullConfig.sampleRate !== 48000) {
      warnings.push('Broadcast standard is 48kHz. Some deliverables may require sample rate conversion.');
    }
    if (fullConfig.bitDepth !== 24) {
      warnings.push('24-bit is the broadcast standard. Some deliverables may require bit depth conversion.');
    }

    const enabledStems = Array.from(this.stems.values()).filter((s) => s.enabled);
    if (enabledStems.length === 0) {
      errors.push('No stems are enabled for export.');
    }

    const unassigned = enabledStems.filter((s) => s.trackIds.length === 0);
    if (unassigned.length > 0) {
      warnings.push(`${unassigned.length} enabled stem(s) have no tracks assigned: ${unassigned.map((s) => s.name).join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ── Subscriptions ───────────────────────────────────────────────────────

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private calculateTimelineDuration(): number {
    return this.project.tracks.reduce((max, track) => {
      const trackMax = track.clips.reduce((m, c) => Math.max(m, c.endTime), 0);
      return Math.max(max, trackMax);
    }, 0);
  }

  private estimateFileSize(
    durationSeconds: number,
    sampleRate: number,
    bitDepth: number,
    channelCount: number,
  ): number {
    const bytesPerSample = bitDepth / 8;
    return Math.ceil(durationSeconds * sampleRate * bytesPerSample * channelCount);
  }

  private generateStartTimecode(preRollSeconds: number): string {
    const frameRate = this.project.settings.frameRate;
    const nominalRate = Math.round(frameRate);
    const preRollFrames = Math.round(preRollSeconds * frameRate);

    // Default start at 01:00:00:00 minus pre-roll
    const oneHourFrames = 3600 * nominalRate;
    const startFrame = Math.max(0, oneHourFrames - preRollFrames);

    const f = startFrame % nominalRate;
    const totalSec = Math.floor(startFrame / nominalRate);
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

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }
}
