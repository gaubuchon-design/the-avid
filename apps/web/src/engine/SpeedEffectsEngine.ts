// =============================================================================
//  THE AVID -- Speed Effects Engine
// =============================================================================
//
// Implements Resolve/Premiere-style speed effects for clips:
//  - Constant speed changes (50%, 200%, etc.)
//  - Variable speed ramps via time remap keyframes
//  - Freeze frames (hold keyframes)
//  - Clip reversal
//  - Source-time <-> timeline-time mapping
//
// All operations are non-destructive: they return new Clip objects rather
// than mutating the originals.
//
// =============================================================================

import {
  type Clip,
  type TimeRemapKeyframe,
  type TimeRemapState,
} from '../store/editor.store';

// =============================================================================
//  SpeedEffectsEngine
// =============================================================================

/**
 * Engine for applying and querying speed effects on clips.
 *
 * Speed effects are represented through the clip's `timeRemap` state:
 *  - **Constant speed**: two keyframes mapping the clip's start and end
 *    to scaled source times.
 *  - **Variable speed (ramp)**: multiple keyframes with varying slopes.
 *  - **Freeze frame**: a 'hold' keyframe that stops source time progression.
 *  - **Reverse**: keyframes where source time decreases as timeline time
 *    increases.
 *
 * All methods return new Clip objects (immutable pattern).
 */
export class SpeedEffectsEngine {
  /** Subscriber callbacks. */
  private listeners = new Set<() => void>();

  /** Notify all subscribers that state has changed. */
  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('[SpeedEffectsEngine] Subscriber error:', err);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Constant Speed
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Apply a constant speed change to a clip.
   *
   * A speed of 100% is normal playback. 200% is double speed (half
   * duration). 50% is half speed (double duration). Negative values
   * are not handled here — use `reverseClip` for reversal.
   *
   * The clip's timeline duration is adjusted inversely to the speed
   * percentage. Source trim points remain unchanged.
   *
   * @param clip         The clip to retime.
   * @param speedPercent Speed as a percentage (e.g. 100 = normal, 200 = 2x).
   * @returns A new Clip with adjusted duration and time remap keyframes.
   */
  applyConstantSpeed(clip: Clip, speedPercent: number): Clip {
    if (speedPercent <= 0) {
      console.warn('[SpeedEffectsEngine] Speed must be positive; use reverseClip for reversal');
      return clip;
    }

    const speedFactor = speedPercent / 100;
    const originalDuration = clip.endTime - clip.startTime;
    const sourceDuration = clip.trimStart + originalDuration + clip.trimEnd;

    // New timeline duration = source visible duration / speed factor
    const visibleSourceDuration = originalDuration; // at current speed = 100%
    const newTimelineDuration = visibleSourceDuration / speedFactor;
    const newEndTime = clip.startTime + newTimelineDuration;

    // Build time remap keyframes for constant speed
    const keyframes: TimeRemapKeyframe[] = [
      {
        timelineTime: clip.startTime,
        sourceTime: clip.trimStart,
        interpolation: 'linear',
      },
      {
        timelineTime: newEndTime,
        sourceTime: clip.trimStart + visibleSourceDuration,
        interpolation: 'linear',
      },
    ];

    const timeRemap: TimeRemapState = {
      enabled: true,
      keyframes,
      frameBlending: clip.timeRemap.frameBlending,
      pitchCorrection: clip.timeRemap.pitchCorrection,
    };

    this.notify();

    return {
      ...clip,
      endTime: newEndTime,
      timeRemap,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Variable Speed (Speed Ramps)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Apply a variable speed ramp to a clip using custom keyframes.
   *
   * The keyframes define a mapping from timeline time to source time.
   * Between keyframes, the effective speed is determined by the slope
   * of the source-time curve. Steeper slope = faster playback; shallower
   * slope = slower playback.
   *
   * @param clip      The clip to retime.
   * @param keyframes Array of time remap keyframes (timeline -> source mapping).
   * @returns A new Clip with the variable speed time remap applied.
   */
  addSpeedRamp(clip: Clip, keyframes: TimeRemapKeyframe[]): Clip {
    if (keyframes.length < 2) {
      console.warn('[SpeedEffectsEngine] Speed ramp requires at least 2 keyframes');
      return clip;
    }

    // Sort keyframes by timeline time
    const sorted = [...keyframes].sort((a, b) => a.timelineTime - b.timelineTime);

    // Adjust clip end time to match the last keyframe's timeline time
    // if the keyframes extend or contract the clip
    const lastKeyframe = sorted[sorted.length - 1];
    const newEndTime = Math.max(clip.endTime, lastKeyframe.timelineTime);

    const timeRemap: TimeRemapState = {
      enabled: true,
      keyframes: sorted,
      frameBlending: clip.timeRemap.frameBlending,
      pitchCorrection: clip.timeRemap.pitchCorrection,
    };

    this.notify();

    return {
      ...clip,
      endTime: newEndTime,
      timeRemap,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Freeze Frame
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create a freeze frame at a specific point within a clip.
   *
   * Inserts a 'hold' keyframe at `freezeTime` and a matching keyframe at
   * `freezeTime + freezeDuration`, effectively pausing source playback for
   * the specified duration. The clip's timeline duration is extended by the
   * freeze duration.
   *
   * @param clip           The clip to add a freeze frame to.
   * @param freezeTime     The timeline time at which to freeze (must be within clip range).
   * @param freezeDuration How long the freeze lasts in seconds.
   * @returns A new Clip with the freeze frame applied.
   */
  createFreezeFrame(clip: Clip, freezeTime: number, freezeDuration: number): Clip {
    if (freezeTime < clip.startTime || freezeTime > clip.endTime) {
      console.warn('[SpeedEffectsEngine] freezeTime is outside clip range');
      return clip;
    }
    if (freezeDuration <= 0) {
      console.warn('[SpeedEffectsEngine] freezeDuration must be positive');
      return clip;
    }

    // Determine the source time at the freeze point
    const sourceTimeAtFreeze = this.getSourceTimeAtTimeline(clip, freezeTime);

    // Build keyframes: before freeze, freeze start (hold), freeze end, after freeze
    const existingKeyframes = clip.timeRemap.enabled
      ? [...clip.timeRemap.keyframes]
      : [
          { timelineTime: clip.startTime, sourceTime: clip.trimStart, interpolation: 'linear' as const },
          { timelineTime: clip.endTime, sourceTime: clip.trimStart + (clip.endTime - clip.startTime), interpolation: 'linear' as const },
        ];

    // Split existing keyframes into before and after the freeze point
    const before = existingKeyframes.filter((kf) => kf.timelineTime < freezeTime);
    const after = existingKeyframes.filter((kf) => kf.timelineTime >= freezeTime);

    // Offset all "after" keyframes by the freeze duration
    const offsetAfter = after.map((kf) => ({
      ...kf,
      timelineTime: kf.timelineTime + freezeDuration,
    }));

    const newKeyframes: TimeRemapKeyframe[] = [
      ...before,
      // Hold keyframe at the freeze point
      {
        timelineTime: freezeTime,
        sourceTime: sourceTimeAtFreeze,
        interpolation: 'hold' as const,
      },
      // Resume keyframe after the freeze
      {
        timelineTime: freezeTime + freezeDuration,
        sourceTime: sourceTimeAtFreeze,
        interpolation: 'linear' as const,
      },
      ...offsetAfter,
    ];

    // Sort and deduplicate by timeline time
    const sorted = newKeyframes.sort((a, b) => a.timelineTime - b.timelineTime);

    const timeRemap: TimeRemapState = {
      enabled: true,
      keyframes: sorted,
      frameBlending: clip.timeRemap.frameBlending,
      pitchCorrection: clip.timeRemap.pitchCorrection,
    };

    const newEndTime = clip.endTime + freezeDuration;

    this.notify();

    return {
      ...clip,
      endTime: newEndTime,
      timeRemap,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Reverse
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Reverse a clip's playback.
   *
   * Creates time remap keyframes that map the clip's timeline start to the
   * source end and the clip's timeline end to the source start, effectively
   * playing the source media in reverse.
   *
   * @param clip The clip to reverse.
   * @returns A new Clip with reversed time remap.
   */
  reverseClip(clip: Clip): Clip {
    const visibleDuration = clip.endTime - clip.startTime;
    const sourceStart = clip.trimStart;
    const sourceEnd = clip.trimStart + visibleDuration;

    const keyframes: TimeRemapKeyframe[] = [
      {
        timelineTime: clip.startTime,
        sourceTime: sourceEnd,
        interpolation: 'linear',
      },
      {
        timelineTime: clip.endTime,
        sourceTime: sourceStart,
        interpolation: 'linear',
      },
    ];

    const timeRemap: TimeRemapState = {
      enabled: true,
      keyframes,
      frameBlending: clip.timeRemap.frameBlending,
      pitchCorrection: clip.timeRemap.pitchCorrection,
    };

    this.notify();

    return {
      ...clip,
      timeRemap,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Time Mapping Queries
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Map a timeline time to the corresponding source time for a clip.
   *
   * If the clip has no time remap enabled, this returns a simple linear
   * mapping based on trimStart. If time remap is enabled, the keyframes
   * are interpolated to find the source time.
   *
   * @param clip         The clip to query.
   * @param timelineTime The absolute timeline time.
   * @returns The corresponding source media time in seconds.
   */
  getSourceTimeAtTimeline(clip: Clip, timelineTime: number): number {
    // Clamp to clip range
    const clampedTime = Math.max(clip.startTime, Math.min(clip.endTime, timelineTime));

    if (!clip.timeRemap.enabled || clip.timeRemap.keyframes.length === 0) {
      // Simple linear mapping: source = trimStart + (timeline - clipStart)
      return clip.trimStart + (clampedTime - clip.startTime);
    }

    const keyframes = clip.timeRemap.keyframes;

    // Before the first keyframe
    if (clampedTime <= keyframes[0].timelineTime) {
      return keyframes[0].sourceTime;
    }

    // After the last keyframe
    if (clampedTime >= keyframes[keyframes.length - 1].timelineTime) {
      return keyframes[keyframes.length - 1].sourceTime;
    }

    // Find the surrounding keyframes
    for (let i = 0; i < keyframes.length - 1; i++) {
      const kf0 = keyframes[i];
      const kf1 = keyframes[i + 1];

      if (clampedTime >= kf0.timelineTime && clampedTime <= kf1.timelineTime) {
        // Hold interpolation: source time stays at kf0 until kf1
        if (kf0.interpolation === 'hold') {
          return kf0.sourceTime;
        }

        // Linear interpolation
        const t =
          (clampedTime - kf0.timelineTime) /
          (kf1.timelineTime - kf0.timelineTime);
        return kf0.sourceTime + t * (kf1.sourceTime - kf0.sourceTime);
      }
    }

    // Fallback (should not reach here)
    return clip.trimStart + (clampedTime - clip.startTime);
  }

  /**
   * Get the instantaneous playback speed at a given timeline time.
   *
   * Speed is expressed as a multiplier (1.0 = normal, 2.0 = double speed,
   * -1.0 = normal reverse). For clips without time remap this returns 1.0.
   *
   * @param clip         The clip to query.
   * @param timelineTime The absolute timeline time.
   * @returns The instantaneous speed as a multiplier.
   */
  getPlaybackSpeed(clip: Clip, timelineTime: number): number {
    if (!clip.timeRemap.enabled || clip.timeRemap.keyframes.length < 2) {
      return 1.0;
    }

    const clampedTime = Math.max(clip.startTime, Math.min(clip.endTime, timelineTime));
    const keyframes = clip.timeRemap.keyframes;

    // Find the segment containing the time
    for (let i = 0; i < keyframes.length - 1; i++) {
      const kf0 = keyframes[i];
      const kf1 = keyframes[i + 1];

      if (clampedTime >= kf0.timelineTime && clampedTime <= kf1.timelineTime) {
        if (kf0.interpolation === 'hold') {
          return 0; // Frozen — no playback
        }

        const timelineDelta = kf1.timelineTime - kf0.timelineTime;
        if (timelineDelta === 0) return 0;

        const sourceDelta = kf1.sourceTime - kf0.sourceTime;
        return sourceDelta / timelineDelta;
      }
    }

    return 1.0;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Subscribe
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to speed effects engine state changes.
   *
   * @param cb Callback invoked on any mutation.
   * @returns An unsubscribe function.
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Cleanup
  // ═══════════════════════════════════════════════════════════════════════

  /** Remove all listeners. Primarily useful for tests. */
  dispose(): void {
    this.listeners.clear();
  }
}

/** Singleton speed effects engine instance. */
export const speedEffectsEngine = new SpeedEffectsEngine();
