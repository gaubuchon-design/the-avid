/**
 * @fileoverview Mocked loudness normalization workflow that simulates
 * preparing audio tracks for broadcast loudness compliance.
 *
 * {@link runLoudnessPrep} measures the input loudness, applies
 * gain staging / limiting to reach the target LUFS, and returns
 * before/after measurements.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Loudness measurements for a single analysis pass. */
export interface LoudnessMeasurement {
  /** Integrated loudness in LUFS. */
  readonly integratedLufs: number;
  /** Short-term loudness maximum in LUFS. */
  readonly shortTermMaxLufs: number;
  /** Momentary loudness maximum in LUFS. */
  readonly momentaryMaxLufs: number;
  /** Loudness range in LU. */
  readonly loudnessRangeLu: number;
  /** True-peak level in dBTP. */
  readonly truePeakDbtp: number;
}

/** Result of the loudness preparation workflow. */
export interface LoudnessPrepResult {
  /** Whether the workflow completed without errors. */
  readonly success: boolean;
  /** Target loudness that was requested. */
  readonly targetLufs: number;
  /** Measurement taken before processing. */
  readonly before: LoudnessMeasurement;
  /** Measurement taken after processing. */
  readonly after: LoudnessMeasurement;
  /** Gain adjustment applied in dB. */
  readonly gainAppliedDb: number;
  /** IDs of the tracks that were processed. */
  readonly processedTrackIds: readonly string[];
  /** Non-fatal warnings. */
  readonly warnings: readonly string[];
}

// ---------------------------------------------------------------------------
// Implementation helpers
// ---------------------------------------------------------------------------

/** Round to one decimal place. */
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Generate a plausible "before" loudness measurement. */
function generateBefore(): LoudnessMeasurement {
  const integrated = round1(-30 + Math.random() * 12); // -30 to -18 LUFS
  return {
    integratedLufs: integrated,
    shortTermMaxLufs: round1(integrated + 4 + Math.random() * 4),
    momentaryMaxLufs: round1(integrated + 8 + Math.random() * 6),
    loudnessRangeLu: round1(6 + Math.random() * 12),
    truePeakDbtp: round1(-1 - Math.random() * 5),
  };
}

/** Generate an "after" measurement that meets the target. */
function generateAfter(target: number): LoudnessMeasurement {
  const jitter = (Math.random() - 0.5) * 0.4; // +/- 0.2 LUFS
  const integrated = round1(target + jitter);
  return {
    integratedLufs: integrated,
    shortTermMaxLufs: round1(integrated + 2 + Math.random() * 2),
    momentaryMaxLufs: round1(integrated + 4 + Math.random() * 3),
    loudnessRangeLu: round1(4 + Math.random() * 4), // compressed range
    truePeakDbtp: round1(-1 - Math.random() * 0.5), // controlled peak
  };
}

import { InvalidArgumentError } from '../AdapterError';

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

/**
 * Simulate loudness normalization to a broadcast standard.
 *
 * Processing steps:
 * 1. Analyse input loudness (integrated, short-term, momentary, range,
 *    true-peak).
 * 2. Calculate required gain adjustment.
 * 3. Apply gain + peak limiting to meet the target LUFS.
 * 4. Re-analyse and return before/after measurements.
 *
 * @param trackIds   - Audio tracks to process.
 * @param targetLUFS - Target integrated loudness (e.g. -24 for EBU R128,
 *                     -23 for ATSC A/85).
 * @returns A {@link LoudnessPrepResult} with before/after measurements.
 *
 * @example
 * ```ts
 * const result = await runLoudnessPrep(['trk_01', 'trk_02'], -24);
 * console.log(result.after.integratedLufs); // ~-24
 * ```
 */
export async function runLoudnessPrep(
  trackIds: string[],
  targetLUFS: number,
): Promise<LoudnessPrepResult> {
  if (trackIds.length === 0) {
    throw new InvalidArgumentError('pro-tools', 'trackIds', 'At least one track ID is required for loudness prep.');
  }

  // Simulate processing delay.
  const delayMs = 150 + trackIds.length * 80;
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));

  const before = generateBefore();
  const after = generateAfter(targetLUFS);
  const gainApplied = round1(after.integratedLufs - before.integratedLufs);

  const warnings: string[] = [];
  if (targetLUFS > -16) {
    warnings.push(
      `Target ${targetLUFS} LUFS exceeds typical broadcast specs (-24 to -16 LUFS).`,
    );
  }
  if (before.truePeakDbtp > -0.5) {
    warnings.push(
      'Input true-peak is very high; limiting may introduce audible pumping.',
    );
  }

  return {
    success: true,
    targetLufs: targetLUFS,
    before,
    after,
    gainAppliedDb: gainApplied,
    processedTrackIds: [...trackIds],
    warnings,
  };
}
