// ─── HFR (High Frame Rate) Workflow Engine ────────────────────────────────────
// SP-07: Manage 120fps, 240fps, 480fps footage in standard-rate sequences.
// Auto speed-change (e.g., 120fps at 25% in 29.97fps sequence).
// Speed ramp editor with keyframe curves and frame blend options.

import type {
  HFRClipMetadata,
  SpeedRampConfig,
  SpeedRampKeyframe,
  SpeedRampInterpolation,
  FrameBlendMode,
} from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createId(prefix: string): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Calculate the automatic speed percentage when dropping HFR footage
 * into a standard-rate sequence.
 *
 * Example: 120fps source in 29.97fps sequence = 24.975% speed (slow motion).
 */
export function calculateAutoSpeed(sourceFrameRate: number, sequenceFrameRate: number): number {
  if (sourceFrameRate <= 0 || sequenceFrameRate <= 0) return 100;
  return (sequenceFrameRate / sourceFrameRate) * 100;
}

/**
 * Calculate the resulting duration of a clip at a given speed percentage.
 */
export function calculateRetimeDuration(
  originalDuration: number,
  speedPercent: number,
): number {
  if (speedPercent <= 0) return originalDuration;
  return originalDuration * (100 / speedPercent);
}

/**
 * Interpolate between two speed values using the specified interpolation type.
 */
export function interpolateSpeed(
  startSpeed: number,
  endSpeed: number,
  t: number, // 0-1 normalized position between keyframes
  interpolation: SpeedRampInterpolation,
  bezierHandleIn?: { x: number; y: number },
  bezierHandleOut?: { x: number; y: number },
): number {
  const clampedT = Math.max(0, Math.min(1, t));

  switch (interpolation) {
    case 'LINEAR':
      return startSpeed + (endSpeed - startSpeed) * clampedT;

    case 'EASE_IN': {
      const eased = clampedT * clampedT;
      return startSpeed + (endSpeed - startSpeed) * eased;
    }

    case 'EASE_OUT': {
      const eased = 1 - (1 - clampedT) * (1 - clampedT);
      return startSpeed + (endSpeed - startSpeed) * eased;
    }

    case 'EASE_IN_OUT': {
      const eased = clampedT < 0.5
        ? 2 * clampedT * clampedT
        : 1 - Math.pow(-2 * clampedT + 2, 2) / 2;
      return startSpeed + (endSpeed - startSpeed) * eased;
    }

    case 'BEZIER': {
      // Cubic bezier evaluation
      const p0 = 0;
      const p1 = bezierHandleOut?.y ?? 0.25;
      const p2 = bezierHandleIn?.y ?? 0.75;
      const p3 = 1;
      const bezierT =
        (1 - clampedT) ** 3 * p0 +
        3 * (1 - clampedT) ** 2 * clampedT * p1 +
        3 * (1 - clampedT) * clampedT ** 2 * p2 +
        clampedT ** 3 * p3;
      return startSpeed + (endSpeed - startSpeed) * bezierT;
    }

    default:
      return startSpeed + (endSpeed - startSpeed) * clampedT;
  }
}

/**
 * Evaluate a speed ramp at a given time position within the clip.
 */
export function evaluateSpeedRamp(config: SpeedRampConfig, time: number): number {
  const { keyframes } = config;
  if (keyframes.length === 0) return 100;
  if (keyframes.length === 1) return keyframes[0]!.speed;

  // Before first keyframe
  if (time <= keyframes[0]!.time) return keyframes[0]!.speed;

  // After last keyframe
  if (time >= keyframes[keyframes.length - 1]!.time) return keyframes[keyframes.length - 1]!.speed;

  // Find surrounding keyframes
  for (let i = 0; i < keyframes.length - 1; i++) {
    const current = keyframes[i]!;
    const next = keyframes[i + 1]!;

    if (time >= current.time && time <= next.time) {
      const segmentDuration = next.time - current.time;
      const t = segmentDuration > 0 ? (time - current.time) / segmentDuration : 0;
      return interpolateSpeed(
        current.speed,
        next.speed,
        t,
        current.interpolation,
        next.bezierHandleIn,
        current.bezierHandleOut,
      );
    }
  }

  return keyframes[keyframes.length - 1]!.speed;
}

// ─── Events ───────────────────────────────────────────────────────────────────

export type HFREvent =
  | { type: 'CLIP_REGISTERED'; metadata: HFRClipMetadata }
  | { type: 'SPEED_RAMP_UPDATED'; clipId: string; config: SpeedRampConfig }
  | { type: 'FRAME_BLEND_CHANGED'; clipId: string; mode: FrameBlendMode }
  | { type: 'AUTO_SPEED_APPLIED'; clipId: string; speedPercent: number }
  | { type: 'ERROR'; clipId: string; error: string };

export type HFRListener = (event: HFREvent) => void;

// ─── Engine ───────────────────────────────────────────────────────────────────

export class HFREngine {
  private clips: Map<string, HFRClipMetadata> = new Map();
  private listeners: Set<HFRListener> = new Set();
  private defaultSequenceFrameRate = 29.97;
  private defaultFrameBlendMode: FrameBlendMode = 'OPTICAL_FLOW';

  constructor(options?: { sequenceFrameRate?: number; defaultFrameBlend?: FrameBlendMode }) {
    if (options?.sequenceFrameRate) {
      this.defaultSequenceFrameRate = options.sequenceFrameRate;
    }
    if (options?.defaultFrameBlend) {
      this.defaultFrameBlendMode = options.defaultFrameBlend;
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  setSequenceFrameRate(fps: number): void {
    this.defaultSequenceFrameRate = fps;
    // Re-calculate auto speeds for all registered clips
    for (const metadata of this.clips.values()) {
      metadata.sequenceFrameRate = fps;
      metadata.autoSpeedPercent = calculateAutoSpeed(metadata.nativeFrameRate, fps);
    }
  }

  getSequenceFrameRate(): number {
    return this.defaultSequenceFrameRate;
  }

  /**
   * Register a high frame rate clip and calculate its auto speed.
   */
  registerClip(clipId: string, nativeFrameRate: number): HFRClipMetadata {
    const autoSpeedPercent = calculateAutoSpeed(nativeFrameRate, this.defaultSequenceFrameRate);

    const metadata: HFRClipMetadata = {
      clipId,
      nativeFrameRate,
      sequenceFrameRate: this.defaultSequenceFrameRate,
      autoSpeedPercent,
      frameBlendMode: this.defaultFrameBlendMode,
      isRetimed: nativeFrameRate !== this.defaultSequenceFrameRate,
    };

    this.clips.set(clipId, metadata);
    this.emit({ type: 'CLIP_REGISTERED', metadata });

    if (metadata.isRetimed) {
      this.emit({ type: 'AUTO_SPEED_APPLIED', clipId, speedPercent: autoSpeedPercent });
    }

    return metadata;
  }

  /**
   * Get metadata for a registered HFR clip.
   */
  getClipMetadata(clipId: string): HFRClipMetadata | null {
    return this.clips.get(clipId) ?? null;
  }

  /**
   * Get all registered HFR clips.
   */
  getAllClips(): HFRClipMetadata[] {
    return Array.from(this.clips.values());
  }

  /**
   * Get clips that are being retimed (not at native speed).
   */
  getRetimedClips(): HFRClipMetadata[] {
    return Array.from(this.clips.values()).filter((c) => c.isRetimed);
  }

  /**
   * Check if a frame rate qualifies as HFR for the current sequence.
   */
  isHFR(sourceFrameRate: number): boolean {
    return sourceFrameRate > this.defaultSequenceFrameRate * 1.5;
  }

  /**
   * Get common HFR frame rate presets with their auto-speed percentages.
   */
  getHFRPresets(): Array<{ fps: number; speedPercent: number; label: string }> {
    const rates = [60, 120, 180, 240, 300, 480, 960, 1000];
    return rates.map((fps) => ({
      fps,
      speedPercent: calculateAutoSpeed(fps, this.defaultSequenceFrameRate),
      label: `${fps}fps (${calculateAutoSpeed(fps, this.defaultSequenceFrameRate).toFixed(1)}% speed)`,
    }));
  }

  // ─── Speed Ramp ─────────────────────────────────────────────────────────────

  /**
   * Create or update a speed ramp configuration for a clip.
   */
  setSpeedRamp(clipId: string, keyframes: SpeedRampKeyframe[]): SpeedRampConfig | null {
    const metadata = this.clips.get(clipId);
    if (!metadata) return null;

    const config: SpeedRampConfig = {
      clipId,
      keyframes: [...keyframes].sort((a, b) => a.time - b.time),
      frameBlendMode: metadata.frameBlendMode,
      sourceFrameRate: metadata.nativeFrameRate,
      targetFrameRate: metadata.sequenceFrameRate,
      preserveAudioPitch: true,
    };

    metadata.speedRamp = config;
    metadata.isRetimed = true;
    this.emit({ type: 'SPEED_RAMP_UPDATED', clipId, config });

    return config;
  }

  /**
   * Add a keyframe to an existing speed ramp.
   */
  addSpeedRampKeyframe(
    clipId: string,
    time: number,
    speed: number,
    interpolation: SpeedRampInterpolation = 'EASE_IN_OUT',
  ): boolean {
    const metadata = this.clips.get(clipId);
    if (!metadata) return false;

    if (!metadata.speedRamp) {
      this.setSpeedRamp(clipId, [
        { time, speed, interpolation },
      ]);
      return true;
    }

    const existingIndex = metadata.speedRamp.keyframes.findIndex((k) => Math.abs(k.time - time) < 0.01);
    if (existingIndex >= 0) {
      metadata.speedRamp.keyframes[existingIndex] = { time, speed, interpolation };
    } else {
      metadata.speedRamp.keyframes.push({ time, speed, interpolation });
      metadata.speedRamp.keyframes.sort((a, b) => a.time - b.time);
    }

    this.emit({ type: 'SPEED_RAMP_UPDATED', clipId, config: metadata.speedRamp });
    return true;
  }

  /**
   * Remove a keyframe from a speed ramp.
   */
  removeSpeedRampKeyframe(clipId: string, keyframeIndex: number): boolean {
    const metadata = this.clips.get(clipId);
    if (!metadata?.speedRamp) return false;

    if (keyframeIndex >= 0 && keyframeIndex < metadata.speedRamp.keyframes.length) {
      metadata.speedRamp.keyframes.splice(keyframeIndex, 1);
      if (metadata.speedRamp.keyframes.length === 0) {
        metadata.speedRamp = undefined;
        metadata.isRetimed = metadata.nativeFrameRate !== metadata.sequenceFrameRate;
      }
      return true;
    }
    return false;
  }

  /**
   * Clear the speed ramp and revert to auto speed.
   */
  clearSpeedRamp(clipId: string): void {
    const metadata = this.clips.get(clipId);
    if (!metadata) return;
    metadata.speedRamp = undefined;
    metadata.isRetimed = metadata.nativeFrameRate !== metadata.sequenceFrameRate;
  }

  /**
   * Evaluate the speed at a given time position within a clip.
   */
  getSpeedAtTime(clipId: string, time: number): number {
    const metadata = this.clips.get(clipId);
    if (!metadata) return 100;

    if (metadata.speedRamp) {
      return evaluateSpeedRamp(metadata.speedRamp, time);
    }

    return metadata.autoSpeedPercent;
  }

  // ─── Frame Blend Mode ───────────────────────────────────────────────────────

  /**
   * Set the frame blending mode for a clip.
   */
  setFrameBlendMode(clipId: string, mode: FrameBlendMode): void {
    const metadata = this.clips.get(clipId);
    if (!metadata) return;
    metadata.frameBlendMode = mode;
    if (metadata.speedRamp) {
      metadata.speedRamp.frameBlendMode = mode;
    }
    this.emit({ type: 'FRAME_BLEND_CHANGED', clipId, mode });
  }

  /**
   * Get recommended frame blend mode for a given speed change.
   */
  getRecommendedBlendMode(speedPercent: number): FrameBlendMode {
    if (speedPercent >= 80) return 'NONE';
    if (speedPercent >= 40) return 'FRAME_BLEND';
    return 'OPTICAL_FLOW';
  }

  // ─── Events ─────────────────────────────────────────────────────────────────

  on(listener: HFRListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  off(listener: HFRListener): void {
    this.listeners.delete(listener);
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────────

  unregisterClip(clipId: string): void {
    this.clips.delete(clipId);
  }

  destroy(): void {
    this.clips.clear();
    this.listeners.clear();
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private emit(event: HFREvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Swallow listener errors
      }
    }
  }
}

/**
 * Create a pre-configured HFREngine for sports production.
 */
export function createHFREngine(
  sequenceFrameRate = 29.97,
  defaultFrameBlend: FrameBlendMode = 'OPTICAL_FLOW',
): HFREngine {
  return new HFREngine({ sequenceFrameRate, defaultFrameBlend });
}
