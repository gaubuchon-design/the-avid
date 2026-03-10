// =============================================================================
//  THE AVID -- Safe Math Utilities
//  Defensive numeric operations that handle NaN, Infinity, and edge cases.
// =============================================================================

/**
 * Ensures a value is a finite number, returning a fallback if it is NaN,
 * Infinity, null, or undefined.
 */
export function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

/**
 * Safely divides two numbers, returning a fallback if the divisor is zero,
 * or the result is NaN/Infinity.
 */
export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (denominator === 0 || !Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return fallback;
  }
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : fallback;
}

/**
 * Clamps a number between min and max, handling NaN/Infinity by returning
 * the min value.
 */
export function safeClamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Safely computes a percentage (0-100), handling edge cases.
 */
export function safePercentage(current: number, total: number, fallback = 0): number {
  if (!Number.isFinite(current) || !Number.isFinite(total) || total === 0) {
    return fallback;
  }
  const result = (current / total) * 100;
  return Number.isFinite(result) ? Math.max(0, Math.min(100, result)) : fallback;
}

/**
 * Safely formats a number for display, returning a fallback string for
 * NaN/Infinity.
 */
export function safeFormatNumber(
  value: number,
  options?: { decimals?: number; fallback?: string },
): string {
  const { decimals = 0, fallback = '--' } = options ?? {};
  if (!Number.isFinite(value)) return fallback;
  return value.toFixed(decimals);
}
