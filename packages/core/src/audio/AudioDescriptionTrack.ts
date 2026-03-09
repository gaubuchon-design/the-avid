// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Audio Description Track (AC-01)
//  Dedicated audio description (AD) track type for accessibility.
//  Features: AD track management, program audio ducking, separate stem
//  export, and AI-assisted silence detection for AD insert points.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Types ─────────────────────────────────────────────────────────────────

export type ADTrackStatus = 'active' | 'inactive' | 'recording' | 'editing';
export type ADMixMode = 'above-program' | 'replace-program' | 'side-by-side';

export interface AudioDescriptionCue {
  id: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  text: string;
  voiceArtist?: string;
  audioFilePath?: string;
  audioDurationSeconds: number;
  isRecorded: boolean;
  silenceGapId?: string; // Reference to detected silence gap
}

export interface SilenceGap {
  id: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
  averageLevelDb: number;
  isUsable: boolean; // Long enough for an AD insert
  suggestedCueText?: string;
}

export interface ADDuckingConfig {
  enabled: boolean;
  duckLevelDb: number; // How much to reduce program audio (e.g., -12)
  attackMs: number; // Fade-in time for ducking
  releaseMs: number; // Fade-out time
  holdMs: number; // Minimum hold time
  threshold: number; // 0-1, when to trigger ducking
}

export interface ADExportConfig {
  format: 'wav' | 'aiff' | 'mp3';
  sampleRate: number;
  bitDepth: 16 | 24 | 32;
  channels: 'mono' | 'stereo';
  includeADOnly: boolean;
  includeMixedProgram: boolean;
  normalizeLevel: number; // dBFS
}

export interface ADExportResult {
  success: boolean;
  adStemPath: string | null;
  mixedProgramPath: string | null;
  totalCues: number;
  totalDurationSeconds: number;
  errors: string[];
}

export interface AudioDescriptionTrackConfig {
  trackId: string;
  trackName: string;
  mixMode: ADMixMode;
  ducking: ADDuckingConfig;
  silenceThresholdDb: number;
  minSilenceDurationSeconds: number;
  minADCueDurationSeconds: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_DUCK_LEVEL_DB = -12;
const DEFAULT_ATTACK_MS = 200;
const DEFAULT_RELEASE_MS = 500;
const DEFAULT_SILENCE_THRESHOLD_DB = -40;
const DEFAULT_MIN_SILENCE_DURATION = 2.0;
const DEFAULT_MIN_AD_CUE_DURATION = 1.5;

// ─── Audio Description Track Manager ───────────────────────────────────────

export class AudioDescriptionTrack {
  private config: AudioDescriptionTrackConfig;
  private cues: AudioDescriptionCue[] = [];
  private silenceGaps: SilenceGap[] = [];
  private status: ADTrackStatus = 'inactive';
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor(config?: Partial<AudioDescriptionTrackConfig>) {
    this.config = {
      trackId: config?.trackId ?? `ad-track-${Date.now()}`,
      trackName: config?.trackName ?? 'Audio Description',
      mixMode: config?.mixMode ?? 'above-program',
      ducking: config?.ducking ?? {
        enabled: true,
        duckLevelDb: DEFAULT_DUCK_LEVEL_DB,
        attackMs: DEFAULT_ATTACK_MS,
        releaseMs: DEFAULT_RELEASE_MS,
        holdMs: 100,
        threshold: 0.5,
      },
      silenceThresholdDb: config?.silenceThresholdDb ?? DEFAULT_SILENCE_THRESHOLD_DB,
      minSilenceDurationSeconds: config?.minSilenceDurationSeconds ?? DEFAULT_MIN_SILENCE_DURATION,
      minADCueDurationSeconds: config?.minADCueDurationSeconds ?? DEFAULT_MIN_AD_CUE_DURATION,
    };
  }

  // ─── Track Management ──────────────────────────────────────────────

  activate(): void {
    this.status = 'active';
    this.emit('track:activated', { trackId: this.config.trackId });
  }

  deactivate(): void {
    this.status = 'inactive';
    this.emit('track:deactivated', { trackId: this.config.trackId });
  }

  getStatus(): ADTrackStatus {
    return this.status;
  }

  getConfig(): AudioDescriptionTrackConfig {
    return { ...this.config };
  }

  updateConfig(update: Partial<AudioDescriptionTrackConfig>): void {
    Object.assign(this.config, update);
    this.emit('track:configUpdated', this.config);
  }

  // ─── Cue Management ────────────────────────────────────────────────

  addCue(cue: Omit<AudioDescriptionCue, 'id'>): AudioDescriptionCue {
    const newCue: AudioDescriptionCue = {
      ...cue,
      id: `ad-cue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };

    // Insert in chronological order
    const insertIndex = this.cues.findIndex(
      (c) => c.startTimeSeconds > newCue.startTimeSeconds,
    );
    if (insertIndex >= 0) {
      this.cues.splice(insertIndex, 0, newCue);
    } else {
      this.cues.push(newCue);
    }

    this.emit('cue:added', newCue);
    return newCue;
  }

  updateCue(cueId: string, update: Partial<AudioDescriptionCue>): void {
    const cue = this.cues.find((c) => c.id === cueId);
    if (cue) {
      Object.assign(cue, update);
      this.emit('cue:updated', cue);
    }
  }

  removeCue(cueId: string): void {
    this.cues = this.cues.filter((c) => c.id !== cueId);
    this.emit('cue:removed', { cueId });
  }

  getCues(): AudioDescriptionCue[] {
    return [...this.cues];
  }

  getCueAtTime(timeSeconds: number): AudioDescriptionCue | null {
    return this.cues.find(
      (c) => timeSeconds >= c.startTimeSeconds && timeSeconds <= c.endTimeSeconds,
    ) ?? null;
  }

  getCuesInRange(startSeconds: number, endSeconds: number): AudioDescriptionCue[] {
    return this.cues.filter(
      (c) => c.endTimeSeconds >= startSeconds && c.startTimeSeconds <= endSeconds,
    );
  }

  // ─── AI Silence Detection ──────────────────────────────────────────

  /**
   * Analyzes program audio to find natural silences suitable for AD inserts.
   * In a real implementation, this would use Web Audio API or FFmpeg
   * to analyze the actual audio waveform.
   */
  detectSilenceGaps(
    programAudioPeaks: number[],
    totalDurationSeconds: number,
  ): SilenceGap[] {
    const gaps: SilenceGap[] = [];
    const samplesPerSecond = programAudioPeaks.length / totalDurationSeconds;
    const thresholdLinear = Math.pow(10, this.config.silenceThresholdDb / 20);

    let gapStart: number | null = null;

    for (let i = 0; i < programAudioPeaks.length; i++) {
      const level = Math.abs(programAudioPeaks[i]);
      const timeSeconds = i / samplesPerSecond;

      if (level < thresholdLinear) {
        if (gapStart === null) {
          gapStart = timeSeconds;
        }
      } else {
        if (gapStart !== null) {
          const gapDuration = timeSeconds - gapStart;
          if (gapDuration >= this.config.minSilenceDurationSeconds) {
            const avgLevel = this.computeAverageLevel(
              programAudioPeaks,
              Math.floor(gapStart * samplesPerSecond),
              i,
            );

            gaps.push({
              id: `silence-${gaps.length}`,
              startTimeSeconds: gapStart,
              endTimeSeconds: timeSeconds,
              durationSeconds: gapDuration,
              averageLevelDb: avgLevel,
              isUsable: gapDuration >= this.config.minADCueDurationSeconds,
            });
          }
          gapStart = null;
        }
      }
    }

    // Handle trailing silence
    if (gapStart !== null) {
      const gapDuration = totalDurationSeconds - gapStart;
      if (gapDuration >= this.config.minSilenceDurationSeconds) {
        gaps.push({
          id: `silence-${gaps.length}`,
          startTimeSeconds: gapStart,
          endTimeSeconds: totalDurationSeconds,
          durationSeconds: gapDuration,
          averageLevelDb: -60,
          isUsable: gapDuration >= this.config.minADCueDurationSeconds,
        });
      }
    }

    this.silenceGaps = gaps;
    this.emit('silence:detected', { count: gaps.length, usable: gaps.filter((g) => g.isUsable).length });
    return gaps;
  }

  getUsableSilenceGaps(): SilenceGap[] {
    return this.silenceGaps.filter((g) => g.isUsable);
  }

  getSilenceGaps(): SilenceGap[] {
    return [...this.silenceGaps];
  }

  // ─── Ducking ───────────────────────────────────────────────────────

  getDuckingConfig(): ADDuckingConfig {
    return { ...this.config.ducking };
  }

  setDuckingConfig(ducking: Partial<ADDuckingConfig>): void {
    Object.assign(this.config.ducking, ducking);
    this.emit('ducking:updated', this.config.ducking);
  }

  /**
   * Computes the ducking envelope for the entire timeline.
   * Returns an array of { time, gainDb } control points.
   */
  computeDuckingEnvelope(): Array<{ timeSeconds: number; gainDb: number }> {
    if (!this.config.ducking.enabled) return [];

    const envelope: Array<{ timeSeconds: number; gainDb: number }> = [];
    const attackSeconds = this.config.ducking.attackMs / 1000;
    const releaseSeconds = this.config.ducking.releaseMs / 1000;

    for (const cue of this.cues) {
      // Pre-duck (attack)
      envelope.push({
        timeSeconds: Math.max(0, cue.startTimeSeconds - attackSeconds),
        gainDb: 0,
      });
      // Full duck
      envelope.push({
        timeSeconds: cue.startTimeSeconds,
        gainDb: this.config.ducking.duckLevelDb,
      });
      // End of cue
      envelope.push({
        timeSeconds: cue.endTimeSeconds,
        gainDb: this.config.ducking.duckLevelDb,
      });
      // Post-duck (release)
      envelope.push({
        timeSeconds: cue.endTimeSeconds + releaseSeconds,
        gainDb: 0,
      });
    }

    return envelope.sort((a, b) => a.timeSeconds - b.timeSeconds);
  }

  // ─── Export ────────────────────────────────────────────────────────

  /**
   * Exports the AD track as a separate audio stem.
   */
  exportStem(config?: Partial<ADExportConfig>): ADExportResult {
    const exportConfig: ADExportConfig = {
      format: config?.format ?? 'wav',
      sampleRate: config?.sampleRate ?? 48000,
      bitDepth: config?.bitDepth ?? 24,
      channels: config?.channels ?? 'mono',
      includeADOnly: config?.includeADOnly ?? true,
      includeMixedProgram: config?.includeMixedProgram ?? true,
      normalizeLevel: config?.normalizeLevel ?? -3,
    };

    const recordedCues = this.cues.filter((c) => c.isRecorded);
    const totalDuration = recordedCues.reduce(
      (max, c) => Math.max(max, c.endTimeSeconds),
      0,
    );

    const baseName = `${this.config.trackName.replace(/[^a-z0-9]/gi, '_')}`;

    return {
      success: recordedCues.length > 0,
      adStemPath: exportConfig.includeADOnly ? `${baseName}_AD.${exportConfig.format}` : null,
      mixedProgramPath: exportConfig.includeMixedProgram ? `${baseName}_MIX.${exportConfig.format}` : null,
      totalCues: recordedCues.length,
      totalDurationSeconds: totalDuration,
      errors: recordedCues.length === 0 ? ['No recorded AD cues to export'] : [],
    };
  }

  // ─── Events ────────────────────────────────────────────────────────

  on(event: string, callback: (...args: unknown[]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: unknown): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try { handler(data); } catch { /* swallow */ }
      }
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private computeAverageLevel(peaks: number[], startIndex: number, endIndex: number): number {
    let sum = 0;
    let count = 0;
    for (let i = startIndex; i < endIndex && i < peaks.length; i++) {
      sum += Math.abs(peaks[i]);
      count++;
    }
    const avgLinear = count > 0 ? sum / count : 0;
    return avgLinear > 0 ? 20 * Math.log10(avgLinear) : -96;
  }

  dispose(): void {
    this.listeners.clear();
    this.cues = [];
    this.silenceGaps = [];
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────

export function createAudioDescriptionTrack(
  config?: Partial<AudioDescriptionTrackConfig>,
): AudioDescriptionTrack {
  return new AudioDescriptionTrack(config);
}
