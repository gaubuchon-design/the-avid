// ─── Validation Helpers ────────────────────────────────────────────────────────

/**
 * Validate that a value is a non-negative finite number.
 * @throws {RangeError} if the value is not a non-negative finite number.
 */
export function validateNonNegativeNumber(value: number, paramName: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `${paramName} must be a non-negative finite number, got ${String(value)}`,
    );
  }
}

/**
 * Validate that a value is a positive finite number.
 * @throws {RangeError} if the value is not a positive finite number.
 */
export function validatePositiveNumber(value: number, paramName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(
      `${paramName} must be a positive finite number, got ${String(value)}`,
    );
  }
}

/**
 * Validate that a value is a non-negative integer.
 * @throws {RangeError} if the value is not a non-negative integer.
 */
export function validateFrameNumber(value: number, paramName: string): void {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new RangeError(
      `${paramName} must be a non-negative integer, got ${String(value)}`,
    );
  }
}

/**
 * Validate that a value is a non-empty string.
 * @throws {TypeError} if the value is not a non-empty string.
 */
export function validateNonEmptyString(value: string, paramName: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(
      `${paramName} must be a non-empty string, got ${JSON.stringify(value)}`,
    );
  }
}

/**
 * Safely divide two numbers, returning a fallback on division by zero or NaN.
 * Guards against division by zero and NaN propagation.
 */
export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return fallback;
  }
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : fallback;
}

// ─── Time Utilities ────────────────────────────────────────────────────────────

/**
 * Format seconds into HH:MM:SS:FF (timecode with frames).
 *
 * Returns '00:00:00:00' for invalid input (NaN, negative, non-finite).
 *
 * @param seconds - Time value in seconds. Must be a non-negative finite number.
 * @param frameRate - Frame rate in fps. Must be a positive finite number. Defaults to 30.
 * @returns Formatted timecode string in HH:MM:SS:FF format.
 */
export function formatTimecode(seconds: number, frameRate = 30): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00:00:00';
  if (!Number.isFinite(frameRate) || frameRate <= 0) return '00:00:00:00';
  const nominalRate = Math.round(frameRate);
  if (nominalRate <= 0) return '00:00:00:00';
  const totalFrames = Math.floor(seconds * frameRate);
  const frames = totalFrames % nominalRate;
  const totalSeconds = Math.floor(safeDivide(totalFrames, nominalRate, 0));
  const secs = totalSeconds % 60;
  const mins = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  return [
    hours.toString().padStart(2, '0'),
    mins.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0'),
    frames.toString().padStart(2, '0'),
  ].join(':');
}

/**
 * Format bytes into a human-readable string (e.g. "1.5 GB").
 *
 * Returns '0.0 B' for invalid input (NaN, negative, non-finite).
 *
 * @param bytes - Size in bytes. Must be a non-negative finite number.
 * @returns Human-readable file size string.
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0.0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  const unit = units[unitIndex] ?? 'B';
  return `${size.toFixed(1)} ${unit}`;
}

/**
 * Generate a prefixed UUID v4.
 * When called without arguments, returns a plain UUID.
 * When called with a prefix string, returns `prefix-uuid`.
 */
export function generateId(prefix?: string): string {
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
  return prefix ? `${prefix}-${uuid}` : uuid;
}

/**
 * Clamp a number between min and max.
 * Returns `min` if any argument is NaN.
 */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return value;
  return Math.max(min, Math.min(max, value));
}

/**
 * Deep clone an object.
 * Uses structuredClone when available (handles Date, RegExp, etc.),
 * falls back to JSON round-trip for simple objects.
 */
export function deepClone<T>(obj: T): T {
  if (typeof globalThis !== 'undefined' && typeof (globalThis as any).structuredClone === 'function') {
    return (globalThis as any).structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Debounce a function.
 * Delay must be a positive finite number; defaults to 0 if invalid.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  const safeDelay = Number.isFinite(delay) && delay > 0 ? delay : 0;
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), safeDelay);
  };
}

// ─── Additional Utilities ──────────────────────────────────────────────────────

/**
 * Parse a timecode string (HH:MM:SS:FF) into total seconds.
 * Returns 0 for invalid input. Validates each field is within range.
 *
 * @param timecode - Timecode string in HH:MM:SS:FF format. Accepts ':', ';', or '.' delimiters.
 * @param frameRate - Frame rate in fps. Must be a positive finite number. Defaults to 30.
 * @returns Total seconds represented by the timecode, or 0 for invalid input.
 */
export function parseTimecode(timecode: string, frameRate = 30): number {
  if (!timecode || typeof timecode !== 'string') return 0;
  if (!Number.isFinite(frameRate) || frameRate <= 0) return 0;

  const parts = timecode.split(/[:;.]/).map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const s = parts[2] ?? 0;
  const f = parts[3] ?? 0;

  if ([h, m, s, f].some((v) => !Number.isFinite(v) || v < 0)) return 0;

  // Validate ranges: minutes and seconds must be < 60, frames must be < frame rate
  if (m >= 60 || s >= 60) return 0;
  const nominalRate = Math.round(frameRate);
  if (nominalRate > 0 && f >= nominalRate) return 0;

  const result = h * 3600 + m * 60 + s + safeDivide(f, frameRate, 0);
  return Number.isFinite(result) ? result : 0;
}

/**
 * Convert frames to seconds at a given frame rate.
 * Returns 0 for invalid input. Guards against division by zero.
 *
 * @param frames - Frame count. Must be a non-negative finite number.
 * @param frameRate - Frame rate in fps. Must be a positive finite number. Defaults to 30.
 * @returns Time in seconds, or 0 for invalid input.
 */
export function framesToSeconds(frames: number, frameRate = 30): number {
  if (!Number.isFinite(frames) || frames < 0) return 0;
  if (!Number.isFinite(frameRate) || frameRate <= 0) return 0;
  return safeDivide(frames, frameRate, 0);
}

/**
 * Convert seconds to a frame count at a given frame rate.
 * Returns 0 for invalid input. Uses Math.round for frame-accurate conversion.
 *
 * @param seconds - Time in seconds. Must be a non-negative finite number.
 * @param frameRate - Frame rate in fps. Must be a positive finite number. Defaults to 30.
 * @returns Frame count (rounded to nearest integer), or 0 for invalid input.
 *
 * Note: For AAF/EDL-specific frame conversion, use `secondsToFrames`
 * from the media module instead.
 */
export function secondsToFrameCount(seconds: number, frameRate = 30): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  if (!Number.isFinite(frameRate) || frameRate <= 0) return 0;
  const result = seconds * frameRate;
  return Number.isFinite(result) ? Math.round(result) : 0;
}

/**
 * Throttle a function so it fires at most once per `interval` ms.
 */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  interval: number,
): (...args: Parameters<T>) => void {
  const safeInterval = Number.isFinite(interval) && interval > 0 ? interval : 0;
  let lastTime = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastTime >= safeInterval) {
      lastTime = now;
      fn(...args);
    }
  };
}

/**
 * Assert a condition is truthy. Throws with the provided message if not.
 * Useful as a TypeScript type guard to narrow types after runtime checks.
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message = 'Expected value to be defined',
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

/**
 * Map a value from one range to another.
 * Commonly used for converting between normalized (0-1) and pixel ranges.
 *
 * Guards against division by zero (when inMin === inMax, returns outMin)
 * and NaN propagation (non-finite inputs return outMin).
 *
 * @param value - The value to map. Must be a finite number.
 * @param inMin - Input range minimum.
 * @param inMax - Input range maximum.
 * @param outMin - Output range minimum.
 * @param outMax - Output range maximum.
 * @returns Mapped value, or outMin for invalid input.
 */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (!Number.isFinite(value)) return outMin;
  if (!Number.isFinite(inMin) || !Number.isFinite(inMax)) return outMin;
  if (!Number.isFinite(outMin) || !Number.isFinite(outMax)) return outMin;
  const inRange = inMax - inMin;
  if (inRange === 0) return outMin;
  const result = outMin + safeDivide(value - inMin, inRange, 0) * (outMax - outMin);
  return Number.isFinite(result) ? result : outMin;
}

/**
 * Linearly interpolate between two values.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}
