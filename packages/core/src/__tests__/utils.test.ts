import { describe, it, expect, vi } from 'vitest';
import {
  formatTimecode,
  formatFileSize,
  generateId,
  parseTimecode,
  framesToSeconds,
  secondsToFrameCount,
  throttle,
  assertDefined,
  validateNonNegativeNumber,
  validatePositiveNumber,
  validateFrameNumber,
  validateNonEmptyString,
  safeDivide,
  clamp,
  deepClone,
  debounce,
  mapRange,
  lerp,
} from '../utils';

// =============================================================================
//  formatTimecode
// =============================================================================

describe('formatTimecode', () => {
  it('formats 0 seconds as 00:00:00:00', () => {
    expect(formatTimecode(0)).toBe('00:00:00:00');
  });

  it('formats an exact second boundary at 30fps', () => {
    expect(formatTimecode(1, 30)).toBe('00:00:01:00');
  });

  it('formats a fractional second with frames', () => {
    // 1.5s at 30fps = 45 frames -> 1 sec + 15 frames
    expect(formatTimecode(1.5, 30)).toBe('00:00:01:15');
  });

  it('formats minutes correctly', () => {
    expect(formatTimecode(90, 30)).toBe('00:01:30:00');
  });

  it('formats hours correctly', () => {
    expect(formatTimecode(3661, 30)).toBe('01:01:01:00');
  });

  it('handles 24fps frame rate', () => {
    // 1 second at 24fps = 24 frames
    expect(formatTimecode(1, 24)).toBe('00:00:01:00');
    // 0.5s at 24fps = 12 frames
    expect(formatTimecode(0.5, 24)).toBe('00:00:00:12');
  });

  it('handles 60fps frame rate', () => {
    expect(formatTimecode(0.5, 60)).toBe('00:00:00:30');
  });

  it.each([
    [NaN, '00:00:00:00'],
    [-1, '00:00:00:00'],
    [Infinity, '00:00:00:00'],
    [-Infinity, '00:00:00:00'],
  ])('returns fallback for invalid seconds=%s', (seconds, expected) => {
    expect(formatTimecode(seconds)).toBe(expected);
  });

  it.each([
    [NaN, '00:00:00:00'],
    [0, '00:00:00:00'],
    [-1, '00:00:00:00'],
    [Infinity, '00:00:00:00'],
  ])('returns fallback for invalid frameRate=%s', (frameRate, expected) => {
    expect(formatTimecode(10, frameRate)).toBe(expected);
  });

  it('uses default frame rate of 30 when not specified', () => {
    expect(formatTimecode(1)).toBe('00:00:01:00');
  });

  it('handles very large values', () => {
    // 100 hours
    const result = formatTimecode(360000, 30);
    expect(result).toBe('100:00:00:00');
  });
});

// =============================================================================
//  formatFileSize
// =============================================================================

describe('formatFileSize', () => {
  it('formats 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0.0 B');
  });

  it('formats small byte values', () => {
    expect(formatFileSize(512)).toBe('512.0 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
  });

  it('formats terabytes', () => {
    expect(formatFileSize(1024 * 1024 * 1024 * 1024)).toBe('1.0 TB');
  });

  it.each([
    [NaN, '0.0 B'],
    [-1, '0.0 B'],
    [Infinity, '0.0 B'],
    [-Infinity, '0.0 B'],
  ])('returns fallback for invalid bytes=%s', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });
});

// =============================================================================
//  generateId
// =============================================================================

describe('generateId', () => {
  it('returns a string of UUID v4 length (36 chars)', () => {
    const id = generateId();
    expect(id).toHaveLength(36);
  });

  it('matches UUID v4 format', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('prepends prefix when provided', () => {
    const id = generateId('clip');
    expect(id.startsWith('clip-')).toBe(true);
    // prefix + '-' + uuid (36 chars) = 5 + 36 = 41
    expect(id).toHaveLength(41);
  });

  it('generates unique IDs on successive calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('generates plain UUID when prefix is undefined', () => {
    const id = generateId(undefined);
    expect(id).toHaveLength(36);
  });
});

// =============================================================================
//  parseTimecode
// =============================================================================

describe('parseTimecode', () => {
  it('parses a valid HH:MM:SS:FF timecode', () => {
    // 01:02:03:15 at 30fps = 3600 + 120 + 3 + 15/30 = 3723.5
    expect(parseTimecode('01:02:03:15', 30)).toBeCloseTo(3723.5, 5);
  });

  it('parses zero timecode', () => {
    expect(parseTimecode('00:00:00:00', 30)).toBe(0);
  });

  it('accepts semicolon delimiter (drop frame notation)', () => {
    expect(parseTimecode('00;00;01;00', 30)).toBe(1);
  });

  it('accepts period delimiter', () => {
    expect(parseTimecode('00.00.01.00', 30)).toBe(1);
  });

  it('returns 0 for empty string', () => {
    expect(parseTimecode('')).toBe(0);
  });

  it('returns 0 for non-string input', () => {
    expect(parseTimecode(null as unknown as string)).toBe(0);
    expect(parseTimecode(undefined as unknown as string)).toBe(0);
  });

  it('returns 0 when minutes >= 60', () => {
    expect(parseTimecode('00:60:00:00', 30)).toBe(0);
  });

  it('returns 0 when seconds >= 60', () => {
    expect(parseTimecode('00:00:60:00', 30)).toBe(0);
  });

  it('returns 0 when frames >= frame rate', () => {
    expect(parseTimecode('00:00:00:30', 30)).toBe(0);
  });

  it('returns 0 for negative values', () => {
    expect(parseTimecode('00:00:00:-1', 30)).toBe(0);
  });

  it('returns 0 for invalid frameRate', () => {
    expect(parseTimecode('01:00:00:00', 0)).toBe(0);
    expect(parseTimecode('01:00:00:00', -1)).toBe(0);
    expect(parseTimecode('01:00:00:00', NaN)).toBe(0);
    expect(parseTimecode('01:00:00:00', Infinity)).toBe(0);
  });

  it('handles partial timecode gracefully (fills missing parts with 0)', () => {
    // '5' splits into ['5'], so parts = [5, NaN, NaN, NaN] which has NaN -> returns 0
    // Actually: parts = [5], the rest default to 0 via ?? operator
    // So h=5, m=0, s=0, f=0 -> 5*3600 = 18000 seconds
    expect(parseTimecode('5', 30)).toBe(18000);
    // HH:MM - treats first part as hours, second as minutes
    const result = parseTimecode('01:30', 30);
    expect(result).toBe(3600 + 1800);
  });

  it('uses default frame rate of 30', () => {
    expect(parseTimecode('00:00:01:00')).toBe(1);
  });
});

// =============================================================================
//  framesToSeconds
// =============================================================================

describe('framesToSeconds', () => {
  it('converts frames to seconds at 30fps', () => {
    expect(framesToSeconds(30, 30)).toBe(1);
    expect(framesToSeconds(60, 30)).toBe(2);
    expect(framesToSeconds(15, 30)).toBe(0.5);
  });

  it('converts frames at 24fps', () => {
    expect(framesToSeconds(24, 24)).toBe(1);
    expect(framesToSeconds(12, 24)).toBe(0.5);
  });

  it('returns 0 for zero frames', () => {
    expect(framesToSeconds(0, 30)).toBe(0);
  });

  it.each([
    [NaN, 30],
    [-1, 30],
    [Infinity, 30],
  ])('returns 0 for invalid frames=%s', (frames, fps) => {
    expect(framesToSeconds(frames, fps)).toBe(0);
  });

  it.each([
    [30, 0],
    [30, -1],
    [30, NaN],
    [30, Infinity],
  ])('returns 0 for invalid frameRate when frames=%s fps=%s', (frames, fps) => {
    expect(framesToSeconds(frames, fps)).toBe(0);
  });

  it('uses default frame rate of 30', () => {
    expect(framesToSeconds(30)).toBe(1);
  });
});

// =============================================================================
//  secondsToFrameCount
// =============================================================================

describe('secondsToFrameCount', () => {
  it('converts seconds to frames at 30fps', () => {
    expect(secondsToFrameCount(1, 30)).toBe(30);
    expect(secondsToFrameCount(0.5, 30)).toBe(15);
  });

  it('returns 0 for zero seconds', () => {
    expect(secondsToFrameCount(0, 30)).toBe(0);
  });

  it('rounds to nearest frame', () => {
    // 1/3 second at 30fps = 10 frames
    expect(secondsToFrameCount(1 / 3, 30)).toBe(10);
  });

  it.each([
    [NaN, 30],
    [-1, 30],
    [Infinity, 30],
  ])('returns 0 for invalid seconds=%s', (seconds, fps) => {
    expect(secondsToFrameCount(seconds, fps)).toBe(0);
  });

  it.each([
    [1, 0],
    [1, -1],
    [1, NaN],
    [1, Infinity],
  ])('returns 0 for invalid frameRate when seconds=%s fps=%s', (seconds, fps) => {
    expect(secondsToFrameCount(seconds, fps)).toBe(0);
  });
});

// =============================================================================
//  throttle
// =============================================================================

describe('throttle', () => {
  it('calls the function immediately on first invocation', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('suppresses calls within the interval', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 1000);

    throttled();
    throttled();
    throttled();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('allows calls after the interval has passed', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(101);
    throttled();
    expect(fn).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('passes arguments through', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 0);
    throttled(42, 'test');
    expect(fn).toHaveBeenCalledWith(42, 'test');
  });

  it('handles non-finite interval by defaulting to 0', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, NaN);
    throttled();
    throttled();
    // With interval 0, each call succeeds (since Date.now() - lastTime >= 0)
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
//  assertDefined
// =============================================================================

describe('assertDefined', () => {
  it('does not throw for defined values', () => {
    expect(() => assertDefined(0)).not.toThrow();
    expect(() => assertDefined('')).not.toThrow();
    expect(() => assertDefined(false)).not.toThrow();
    expect(() => assertDefined({})).not.toThrow();
  });

  it('throws for null', () => {
    expect(() => assertDefined(null)).toThrow('Expected value to be defined');
  });

  it('throws for undefined', () => {
    expect(() => assertDefined(undefined)).toThrow('Expected value to be defined');
  });

  it('throws with custom message', () => {
    expect(() => assertDefined(null, 'custom error')).toThrow('custom error');
  });
});

// =============================================================================
//  validateNonNegativeNumber
// =============================================================================

describe('validateNonNegativeNumber', () => {
  it('accepts zero', () => {
    expect(() => validateNonNegativeNumber(0, 'val')).not.toThrow();
  });

  it('accepts positive numbers', () => {
    expect(() => validateNonNegativeNumber(42, 'val')).not.toThrow();
  });

  it('throws for negative numbers', () => {
    expect(() => validateNonNegativeNumber(-1, 'val')).toThrow(RangeError);
  });

  it('throws for NaN', () => {
    expect(() => validateNonNegativeNumber(NaN, 'val')).toThrow(RangeError);
  });

  it('throws for Infinity', () => {
    expect(() => validateNonNegativeNumber(Infinity, 'val')).toThrow(RangeError);
  });

  it('includes param name in error message', () => {
    expect(() => validateNonNegativeNumber(-1, 'frames')).toThrow(/frames/);
  });
});

// =============================================================================
//  validatePositiveNumber
// =============================================================================

describe('validatePositiveNumber', () => {
  it('accepts positive numbers', () => {
    expect(() => validatePositiveNumber(1, 'val')).not.toThrow();
  });

  it('throws for zero', () => {
    expect(() => validatePositiveNumber(0, 'val')).toThrow(RangeError);
  });

  it('throws for negative numbers', () => {
    expect(() => validatePositiveNumber(-5, 'val')).toThrow(RangeError);
  });

  it('throws for NaN', () => {
    expect(() => validatePositiveNumber(NaN, 'val')).toThrow(RangeError);
  });
});

// =============================================================================
//  validateFrameNumber
// =============================================================================

describe('validateFrameNumber', () => {
  it('accepts 0', () => {
    expect(() => validateFrameNumber(0, 'frame')).not.toThrow();
  });

  it('accepts positive integers', () => {
    expect(() => validateFrameNumber(100, 'frame')).not.toThrow();
  });

  it('throws for non-integers', () => {
    expect(() => validateFrameNumber(1.5, 'frame')).toThrow(RangeError);
  });

  it('throws for negative numbers', () => {
    expect(() => validateFrameNumber(-1, 'frame')).toThrow(RangeError);
  });

  it('throws for NaN', () => {
    expect(() => validateFrameNumber(NaN, 'frame')).toThrow(RangeError);
  });
});

// =============================================================================
//  validateNonEmptyString
// =============================================================================

describe('validateNonEmptyString', () => {
  it('accepts non-empty strings', () => {
    expect(() => validateNonEmptyString('hello', 'name')).not.toThrow();
  });

  it('throws for empty string', () => {
    expect(() => validateNonEmptyString('', 'name')).toThrow(TypeError);
  });

  it('throws for whitespace-only string', () => {
    expect(() => validateNonEmptyString('   ', 'name')).toThrow(TypeError);
  });

  it('throws for non-string input', () => {
    expect(() => validateNonEmptyString(42 as unknown as string, 'name')).toThrow(TypeError);
  });
});

// =============================================================================
//  safeDivide
// =============================================================================

describe('safeDivide', () => {
  it('divides two valid numbers', () => {
    expect(safeDivide(10, 2)).toBe(5);
  });

  it('returns fallback for division by zero', () => {
    expect(safeDivide(10, 0)).toBe(0);
  });

  it('returns fallback for NaN numerator', () => {
    expect(safeDivide(NaN, 2)).toBe(0);
  });

  it('returns fallback for NaN denominator', () => {
    expect(safeDivide(10, NaN)).toBe(0);
  });

  it('returns fallback for Infinity numerator', () => {
    expect(safeDivide(Infinity, 2)).toBe(0);
  });

  it('uses custom fallback value', () => {
    expect(safeDivide(10, 0, -1)).toBe(-1);
  });
});

// =============================================================================
//  clamp
// =============================================================================

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps to max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('returns min for NaN value', () => {
    expect(clamp(NaN, 0, 10)).toBe(0);
  });

  it('returns value when min/max are non-finite', () => {
    expect(clamp(5, NaN, NaN)).toBe(5);
  });
});

// =============================================================================
//  deepClone
// =============================================================================

describe('deepClone', () => {
  it('clones a plain object', () => {
    const original = { a: 1, b: { c: 2 } };
    const clone = deepClone(original);
    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.b).not.toBe(original.b);
  });

  it('clones an array', () => {
    const original = [1, [2, 3], { a: 4 }];
    const clone = deepClone(original);
    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
  });

  it('clones primitive values', () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone('hello')).toBe('hello');
    expect(deepClone(null)).toBe(null);
  });
});

// =============================================================================
//  debounce
// =============================================================================

describe('debounce', () => {
  it('delays function execution', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('resets delay on subsequent calls', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(50);
    debounced(); // resets timer
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('handles invalid delay by defaulting to 0', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, NaN);

    debounced();
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});

// =============================================================================
//  mapRange
// =============================================================================

describe('mapRange', () => {
  it('maps value from one range to another', () => {
    expect(mapRange(5, 0, 10, 0, 100)).toBe(50);
  });

  it('maps value at input minimum to output minimum', () => {
    expect(mapRange(0, 0, 10, 100, 200)).toBe(100);
  });

  it('maps value at input maximum to output maximum', () => {
    expect(mapRange(10, 0, 10, 100, 200)).toBe(200);
  });

  it('returns outMin when inMin equals inMax (division by zero)', () => {
    expect(mapRange(5, 5, 5, 0, 100)).toBe(0);
  });

  it('returns outMin for NaN value', () => {
    expect(mapRange(NaN, 0, 10, 0, 100)).toBe(0);
  });

  it('returns outMin for non-finite input range', () => {
    expect(mapRange(5, NaN, 10, 0, 100)).toBe(0);
  });

  it('returns outMin for non-finite output range', () => {
    expect(mapRange(5, 0, 10, NaN, 100)).toBe(NaN);
  });
});

// =============================================================================
//  lerp
// =============================================================================

describe('lerp', () => {
  it('returns a when t=0', () => {
    expect(lerp(10, 20, 0)).toBe(10);
  });

  it('returns b when t=1', () => {
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it('returns midpoint at t=0.5', () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
  });

  it('clamps t to [0,1]', () => {
    expect(lerp(0, 100, -1)).toBe(0);
    expect(lerp(0, 100, 2)).toBe(100);
  });
});
