import type { Clip, TimeRemapKeyframe } from '../store/editor.store';

function clampTimelineTime(clip: Clip, timelineTime: number): number {
  return Math.max(clip.startTime, Math.min(clip.endTime, timelineTime));
}

function evaluateBezierInterpolation(
  t: number,
  from: TimeRemapKeyframe,
  to: TimeRemapKeyframe,
): number {
  const p1 = from.bezierOut?.y ?? t;
  const p2 = to.bezierIn?.y ?? t;
  const u = 1 - t;
  return (3 * u * u * t * p1) + (3 * u * t * t * p2) + (t * t * t);
}

export function getClipSourceTime(clip: Clip, timelineTime: number): number {
  const clampedTime = clampTimelineTime(clip, timelineTime);

  if (!clip.timeRemap.enabled || clip.timeRemap.keyframes.length === 0) {
    return clip.trimStart + (clampedTime - clip.startTime);
  }

  const keyframes = clip.timeRemap.keyframes;
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];

  if (!first || !last) {
    return clip.trimStart + (clampedTime - clip.startTime);
  }

  if (clampedTime <= first.timelineTime) {
    return first.sourceTime;
  }

  if (clampedTime >= last.timelineTime) {
    return last.sourceTime;
  }

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const current = keyframes[index];
    const next = keyframes[index + 1];
    if (!current || !next) {
      continue;
    }

    if (clampedTime < current.timelineTime || clampedTime > next.timelineTime) {
      continue;
    }

    if (current.interpolation === 'hold') {
      return current.sourceTime;
    }

    const timelineDelta = next.timelineTime - current.timelineTime;
    if (timelineDelta <= 0) {
      return current.sourceTime;
    }

    const normalized = (clampedTime - current.timelineTime) / timelineDelta;
    const interpolation = current.interpolation === 'bezier'
      ? evaluateBezierInterpolation(normalized, current, next)
      : normalized;

    return current.sourceTime + (interpolation * (next.sourceTime - current.sourceTime));
  }

  return clip.trimStart + (clampedTime - clip.startTime);
}

export function getClipPlaybackSpeed(clip: Clip, timelineTime: number): number {
  if (!clip.timeRemap.enabled || clip.timeRemap.keyframes.length < 2) {
    return 1;
  }

  const clampedTime = clampTimelineTime(clip, timelineTime);
  const keyframes = clip.timeRemap.keyframes;

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const current = keyframes[index];
    const next = keyframes[index + 1];
    if (!current || !next) {
      continue;
    }

    if (clampedTime < current.timelineTime || clampedTime > next.timelineTime) {
      continue;
    }

    if (current.interpolation === 'hold') {
      return 0;
    }

    const timelineDelta = next.timelineTime - current.timelineTime;
    if (timelineDelta <= 0) {
      return 0;
    }

    return (next.sourceTime - current.sourceTime) / timelineDelta;
  }

  return 1;
}
