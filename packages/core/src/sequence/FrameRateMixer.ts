// =============================================================================
//  THE AVID -- FT-07: Frame Rate Mixer
// =============================================================================
//
//  Handles mixed frame-rate timelines:
//    - Warns on frame-rate mismatches when clips are added
//    - Provides conform options (pulldown, blend, nearest frame)
//    - Per-clip frame-rate indicator data for the UI
//    - Frame-rate conversion calculations
// =============================================================================

import type {
  EditorProject,
  EditorTrack,
  EditorClip,
  EditorMediaAsset,
} from '../project-library';
import { flattenAssets } from '../project-library';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Common professional frame rates. */
export const STANDARD_FRAME_RATES = [
  23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120,
] as const;

/** Named frame-rate presets. */
export const FRAME_RATE_PRESETS: Record<string, number> = {
  'Film (23.976)': 23.976,
  'Film (24)': 24,
  'PAL (25)': 25,
  'NTSC (29.97)': 29.97,
  'HD (30)': 30,
  'HFR Film (48)': 48,
  'PAL HFR (50)': 50,
  'NTSC HFR (59.94)': 59.94,
  'HD HFR (60)': 60,
  'Slow-motion (120)': 120,
};

// ─── Types ──────────────────────────────────────────────────────────────────

/** Method for conforming a clip to a different frame rate. */
export type ConformMethod =
  | 'none'           // No conform; play at native rate (speed changes)
  | 'pulldown_23'    // 2:3 pulldown (23.976 -> 29.97)
  | 'pulldown_32'    // 3:2 reverse pulldown (29.97 -> 23.976)
  | 'pulldown_2332'  // 2:3:3:2 advanced pulldown
  | 'blend'          // Frame blending / optical flow
  | 'nearest'        // Nearest-frame sampling (duplicating or dropping)
  | 'speed_adjust';  // Adjust clip speed to match timeline FPS

/** Severity of a frame-rate mismatch warning. */
export type MismatchSeverity = 'none' | 'info' | 'warning' | 'error';

/** Per-clip frame-rate indicator data for the UI. */
export interface ClipFrameRateIndicator {
  clipId: string;
  clipName: string;
  trackName: string;
  /** The clip's native (source) frame rate. */
  sourceFrameRate: number;
  /** The timeline (project) frame rate. */
  timelineFrameRate: number;
  /** Whether there is a mismatch. */
  isMismatch: boolean;
  /** Severity of the mismatch. */
  severity: MismatchSeverity;
  /** Human-readable description of the mismatch. */
  description: string;
  /** Current conform method applied to this clip. */
  conformMethod: ConformMethod;
  /** Speed ratio if conform is applied (1.0 = no change). */
  speedRatio: number;
  /** Effective duration after conforming. */
  conformedDurationSeconds: number;
  /** Whether pulldown cadence detection applies. */
  hasPulldownCadence: boolean;
}

/** A mismatch warning for the UI. */
export interface FrameRateMismatchWarning {
  /** Unique warning ID. */
  id: string;
  /** Severity. */
  severity: MismatchSeverity;
  /** Clip that caused the warning. */
  clipId: string;
  clipName: string;
  trackName: string;
  /** Description. */
  message: string;
  /** Suggested conform method. */
  suggestedConform: ConformMethod;
  /** Available conform options. */
  availableConforms: ConformMethod[];
}

/** Options for a conform operation. */
export interface ConformOptions {
  /** The clip to conform. */
  clipId: string;
  /** Method to use. */
  method: ConformMethod;
  /** Whether to apply to all clips with the same source frame rate. */
  applyToAll: boolean;
}

/** Result of a conform operation. */
export interface ConformResult {
  /** Number of clips affected. */
  clipsAffected: number;
  /** Details per clip. */
  details: Array<{
    clipId: string;
    clipName: string;
    originalDuration: number;
    conformedDuration: number;
    speedRatio: number;
    method: ConformMethod;
  }>;
}

/** Summary of frame rates across the project. */
export interface FrameRateSummary {
  /** The project/timeline frame rate. */
  timelineFrameRate: number;
  /** All unique frame rates found in clips. */
  uniqueFrameRates: number[];
  /** Total clips. */
  totalClips: number;
  /** Clips that match the timeline frame rate. */
  matchingClips: number;
  /** Clips with mismatched frame rates. */
  mismatchedClips: number;
  /** Whether the timeline is fully conformed. */
  isFullyConformed: boolean;
  /** Breakdown by frame rate. */
  breakdown: Array<{
    frameRate: number;
    clipCount: number;
    percentage: number;
    label: string;
  }>;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export class FrameRateMixerError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'INVALID_FRAME_RATE'
      | 'CLIP_NOT_FOUND'
      | 'CONFORM_FAILED'
      | 'UNSUPPORTED_CONFORM',
  ) {
    super(message);
    this.name = 'FrameRateMixerError';
  }
}

// ─── FrameRateMixer ─────────────────────────────────────────────────────────

/**
 * Analyses and manages mixed frame rates within a project timeline.
 *
 * Usage:
 * ```ts
 * const mixer = new FrameRateMixer(project);
 * const summary = mixer.getSummary();
 * const warnings = mixer.getWarnings();
 * const indicators = mixer.getClipIndicators();
 * const result = mixer.conform({ clipId: 'c1', method: 'blend', applyToAll: false });
 * ```
 */
export class FrameRateMixer {
  private project: EditorProject;
  private assetMap: Map<string, EditorMediaAsset>;
  private conformOverrides: Map<string, ConformMethod> = new Map();

  constructor(project: EditorProject) {
    this.project = project;
    this.assetMap = new Map();
    for (const asset of flattenAssets(project.bins)) {
      this.assetMap.set(asset.id, asset);
    }
  }

  // ── Analysis ────────────────────────────────────────────────────────────

  /**
   * Get a summary of frame rates across the entire project.
   */
  getSummary(): FrameRateSummary {
    const timelineRate = this.project.settings.frameRate;
    const fpsMap = new Map<number, number>(); // fps -> count
    let totalClips = 0;
    let matching = 0;

    for (const track of this.project.tracks) {
      for (const clip of track.clips) {
        totalClips++;
        const clipRate = this.getClipFrameRate(clip);

        fpsMap.set(clipRate, (fpsMap.get(clipRate) ?? 0) + 1);
        if (this.isFrameRateMatch(clipRate, timelineRate)) {
          matching++;
        }
      }
    }

    const uniqueRates = Array.from(fpsMap.keys()).sort((a, b) => a - b);
    const breakdown = uniqueRates.map((rate) => ({
      frameRate: rate,
      clipCount: fpsMap.get(rate) ?? 0,
      percentage: totalClips > 0 ? ((fpsMap.get(rate) ?? 0) / totalClips) * 100 : 0,
      label: this.getFrameRateLabel(rate),
    }));

    return {
      timelineFrameRate: timelineRate,
      uniqueFrameRates: uniqueRates,
      totalClips,
      matchingClips: matching,
      mismatchedClips: totalClips - matching,
      isFullyConformed: matching === totalClips,
      breakdown,
    };
  }

  /**
   * Get mismatch warnings for all clips.
   */
  getWarnings(): FrameRateMismatchWarning[] {
    const timelineRate = this.project.settings.frameRate;
    const warnings: FrameRateMismatchWarning[] = [];
    let warnId = 0;

    for (const track of this.project.tracks) {
      for (const clip of track.clips) {
        const clipRate = this.getClipFrameRate(clip);
        if (this.isFrameRateMatch(clipRate, timelineRate)) continue;

        const severity = this.getMismatchSeverity(clipRate, timelineRate);
        const suggested = this.suggestConformMethod(clipRate, timelineRate);
        const available = this.getAvailableConformMethods(clipRate, timelineRate);

        warnings.push({
          id: `frw-${++warnId}`,
          severity,
          clipId: clip.id,
          clipName: clip.name,
          trackName: track.name,
          message: this.buildWarningMessage(clip.name, clipRate, timelineRate),
          suggestedConform: suggested,
          availableConforms: available,
        });
      }
    }

    return warnings;
  }

  /**
   * Get frame-rate indicators for all clips (for timeline UI).
   */
  getClipIndicators(): ClipFrameRateIndicator[] {
    const timelineRate = this.project.settings.frameRate;
    const indicators: ClipFrameRateIndicator[] = [];

    for (const track of this.project.tracks) {
      for (const clip of track.clips) {
        const clipRate = this.getClipFrameRate(clip);
        const isMismatch = !this.isFrameRateMatch(clipRate, timelineRate);
        const conformMethod = this.conformOverrides.get(clip.id) ?? (isMismatch ? 'nearest' : 'none');
        const speedRatio = this.calculateSpeedRatio(clipRate, timelineRate, conformMethod);
        const originalDuration = clip.endTime - clip.startTime;

        indicators.push({
          clipId: clip.id,
          clipName: clip.name,
          trackName: track.name,
          sourceFrameRate: clipRate,
          timelineFrameRate: timelineRate,
          isMismatch,
          severity: isMismatch ? this.getMismatchSeverity(clipRate, timelineRate) : 'none',
          description: isMismatch
            ? `${clipRate}fps source in ${timelineRate}fps timeline`
            : `${clipRate}fps (matches timeline)`,
          conformMethod,
          speedRatio,
          conformedDurationSeconds: originalDuration / speedRatio,
          hasPulldownCadence: this.hasPulldownCadence(clipRate, timelineRate),
        });
      }
    }

    return indicators;
  }

  // ── Conform ─────────────────────────────────────────────────────────────

  /**
   * Apply a conform method to a clip (or all clips with the same source FPS).
   */
  conform(options: ConformOptions): ConformResult {
    const { clipId, method, applyToAll } = options;
    const timelineRate = this.project.settings.frameRate;

    // Find the target clip
    let targetClip: EditorClip | undefined;
    for (const track of this.project.tracks) {
      targetClip = track.clips.find((c) => c.id === clipId);
      if (targetClip) break;
    }
    if (!targetClip) {
      throw new FrameRateMixerError(`Clip ${clipId} not found`, 'CLIP_NOT_FOUND');
    }

    const sourceRate = this.getClipFrameRate(targetClip);
    const details: ConformResult['details'] = [];

    if (applyToAll) {
      // Apply to all clips with the same source frame rate
      for (const track of this.project.tracks) {
        for (const clip of track.clips) {
          const rate = this.getClipFrameRate(clip);
          if (this.isFrameRateMatch(rate, sourceRate)) {
            this.conformOverrides.set(clip.id, method);
            const speedRatio = this.calculateSpeedRatio(rate, timelineRate, method);
            const originalDur = clip.endTime - clip.startTime;
            details.push({
              clipId: clip.id,
              clipName: clip.name,
              originalDuration: originalDur,
              conformedDuration: originalDur / speedRatio,
              speedRatio,
              method,
            });
          }
        }
      }
    } else {
      this.conformOverrides.set(clipId, method);
      const speedRatio = this.calculateSpeedRatio(sourceRate, timelineRate, method);
      const originalDur = targetClip.endTime - targetClip.startTime;
      details.push({
        clipId,
        clipName: targetClip.name,
        originalDuration: originalDur,
        conformedDuration: originalDur / speedRatio,
        speedRatio,
        method,
      });
    }

    return { clipsAffected: details.length, details };
  }

  /**
   * Get the conform method currently applied to a clip.
   */
  getConformMethod(clipId: string): ConformMethod {
    return this.conformOverrides.get(clipId) ?? 'none';
  }

  /**
   * Clear all conform overrides.
   */
  clearConforms(): void {
    this.conformOverrides.clear();
  }

  // ── Static utilities ────────────────────────────────────────────────────

  /**
   * Check if two frame rates are functionally equivalent.
   */
  static areEquivalent(rateA: number, rateB: number): boolean {
    return Math.abs(rateA - rateB) < 0.02;
  }

  /**
   * Get the nearest standard frame rate.
   */
  static nearestStandard(rate: number): number {
    let nearest: number = STANDARD_FRAME_RATES[0];
    let minDiff = Math.abs(rate - nearest);
    for (const std of STANDARD_FRAME_RATES) {
      const diff = Math.abs(rate - std);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = std;
      }
    }
    return nearest;
  }

  /**
   * Convert a frame count between frame rates.
   */
  static convertFrames(frames: number, fromRate: number, toRate: number): number {
    const seconds = frames / fromRate;
    return Math.round(seconds * toRate);
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private getClipFrameRate(clip: EditorClip): number {
    if (clip.assetId) {
      const asset = this.assetMap.get(clip.assetId);
      if (asset?.technicalMetadata?.frameRate) {
        return asset.technicalMetadata.frameRate;
      }
    }
    return this.project.settings.frameRate;
  }

  private isFrameRateMatch(rateA: number, rateB: number): boolean {
    return Math.abs(rateA - rateB) < 0.02;
  }

  private getMismatchSeverity(clipRate: number, timelineRate: number): MismatchSeverity {
    const ratio = clipRate / timelineRate;

    // Integer multiples are relatively safe
    if (Math.abs(ratio - Math.round(ratio)) < 0.02) return 'info';

    // Common conversions (23.976 <-> 29.97, 25 <-> 30) are warnings
    if (
      (this.isFrameRateMatch(clipRate, 23.976) && this.isFrameRateMatch(timelineRate, 29.97)) ||
      (this.isFrameRateMatch(clipRate, 29.97) && this.isFrameRateMatch(timelineRate, 23.976)) ||
      (this.isFrameRateMatch(clipRate, 25) && this.isFrameRateMatch(timelineRate, 30)) ||
      (this.isFrameRateMatch(clipRate, 30) && this.isFrameRateMatch(timelineRate, 25))
    ) {
      return 'warning';
    }

    // Everything else is an error
    return 'error';
  }

  private suggestConformMethod(clipRate: number, timelineRate: number): ConformMethod {
    // 23.976 -> 29.97: pulldown
    if (this.isFrameRateMatch(clipRate, 23.976) && this.isFrameRateMatch(timelineRate, 29.97)) {
      return 'pulldown_23';
    }
    // 29.97 -> 23.976: reverse pulldown
    if (this.isFrameRateMatch(clipRate, 29.97) && this.isFrameRateMatch(timelineRate, 23.976)) {
      return 'pulldown_32';
    }
    // Small differences: frame blending
    const ratio = clipRate / timelineRate;
    if (ratio > 0.8 && ratio < 1.2) {
      return 'blend';
    }
    // Large differences: nearest frame
    return 'nearest';
  }

  private getAvailableConformMethods(clipRate: number, timelineRate: number): ConformMethod[] {
    const methods: ConformMethod[] = ['none', 'nearest', 'blend', 'speed_adjust'];

    if (this.isFrameRateMatch(clipRate, 23.976) && this.isFrameRateMatch(timelineRate, 29.97)) {
      methods.push('pulldown_23', 'pulldown_2332');
    }
    if (this.isFrameRateMatch(clipRate, 29.97) && this.isFrameRateMatch(timelineRate, 23.976)) {
      methods.push('pulldown_32');
    }

    return methods;
  }

  private calculateSpeedRatio(clipRate: number, timelineRate: number, method: ConformMethod): number {
    switch (method) {
      case 'none':
        return clipRate / timelineRate; // Plays at native speed (pitch/speed will differ)
      case 'speed_adjust':
        return clipRate / timelineRate;
      case 'pulldown_23':
      case 'pulldown_32':
      case 'pulldown_2332':
      case 'blend':
      case 'nearest':
        return 1.0; // Duration stays the same
      default:
        return 1.0;
    }
  }

  private hasPulldownCadence(clipRate: number, timelineRate: number): boolean {
    return (
      (this.isFrameRateMatch(clipRate, 23.976) && this.isFrameRateMatch(timelineRate, 29.97)) ||
      (this.isFrameRateMatch(clipRate, 29.97) && this.isFrameRateMatch(timelineRate, 23.976))
    );
  }

  private buildWarningMessage(clipName: string, clipRate: number, timelineRate: number): string {
    const clipLabel = this.getFrameRateLabel(clipRate);
    const tlLabel = this.getFrameRateLabel(timelineRate);
    return `"${clipName}" is ${clipLabel} in a ${tlLabel} timeline. Frame rate conversion required.`;
  }

  private getFrameRateLabel(rate: number): string {
    for (const [label, value] of Object.entries(FRAME_RATE_PRESETS)) {
      if (this.isFrameRateMatch(rate, value)) return label;
    }
    return `${rate}fps`;
  }
}
