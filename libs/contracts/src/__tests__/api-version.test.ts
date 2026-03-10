import { describe, it, expect } from 'vitest';
import {
  parseVersion,
  compareVersions,
  isCompatible,
  CURRENT_API_VERSION,
  API_VERSION_STRING,
} from '../api-version';
import type { ApiVersion } from '../api-version';

// =============================================================================
//  parseVersion
// =============================================================================

describe('parseVersion', () => {
  it('parses a valid semver string', () => {
    const version = parseVersion('1.2.3');
    expect(version).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('parses version "0.0.0"', () => {
    const version = parseVersion('0.0.0');
    expect(version).toEqual({ major: 0, minor: 0, patch: 0 });
  });

  it('parses large version numbers', () => {
    const version = parseVersion('100.200.300');
    expect(version).toEqual({ major: 100, minor: 200, patch: 300 });
  });

  it('throws for too few parts', () => {
    expect(() => parseVersion('1.2')).toThrow(/Invalid version string/);
  });

  it('throws for too many parts', () => {
    expect(() => parseVersion('1.2.3.4')).toThrow(/Invalid version string/);
  });

  it('throws for empty string', () => {
    expect(() => parseVersion('')).toThrow(/Invalid version string/);
  });

  it('throws for non-numeric parts', () => {
    expect(() => parseVersion('a.b.c')).toThrow(/Invalid version components/);
  });

  it('throws for negative version numbers', () => {
    expect(() => parseVersion('-1.0.0')).toThrow(/Invalid version components/);
  });

  it('throws for floating point version numbers', () => {
    expect(() => parseVersion('1.2.3.4')).toThrow();
  });

  it('throws for version with mixed separators', () => {
    expect(() => parseVersion('1-2-3')).toThrow();
  });
});

// =============================================================================
//  compareVersions
// =============================================================================

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    const a: ApiVersion = { major: 1, minor: 2, patch: 3 };
    const b: ApiVersion = { major: 1, minor: 2, patch: 3 };
    expect(compareVersions(a, b)).toBe(0);
  });

  it('returns negative when a < b (major)', () => {
    const a: ApiVersion = { major: 0, minor: 0, patch: 0 };
    const b: ApiVersion = { major: 1, minor: 0, patch: 0 };
    expect(compareVersions(a, b)).toBeLessThan(0);
  });

  it('returns positive when a > b (major)', () => {
    const a: ApiVersion = { major: 2, minor: 0, patch: 0 };
    const b: ApiVersion = { major: 1, minor: 0, patch: 0 };
    expect(compareVersions(a, b)).toBeGreaterThan(0);
  });

  it('returns negative when a < b (minor)', () => {
    const a: ApiVersion = { major: 1, minor: 1, patch: 0 };
    const b: ApiVersion = { major: 1, minor: 2, patch: 0 };
    expect(compareVersions(a, b)).toBeLessThan(0);
  });

  it('returns positive when a > b (minor)', () => {
    const a: ApiVersion = { major: 1, minor: 3, patch: 0 };
    const b: ApiVersion = { major: 1, minor: 2, patch: 0 };
    expect(compareVersions(a, b)).toBeGreaterThan(0);
  });

  it('returns negative when a < b (patch)', () => {
    const a: ApiVersion = { major: 1, minor: 2, patch: 0 };
    const b: ApiVersion = { major: 1, minor: 2, patch: 1 };
    expect(compareVersions(a, b)).toBeLessThan(0);
  });

  it('returns positive when a > b (patch)', () => {
    const a: ApiVersion = { major: 1, minor: 2, patch: 5 };
    const b: ApiVersion = { major: 1, minor: 2, patch: 3 };
    expect(compareVersions(a, b)).toBeGreaterThan(0);
  });

  it('compares major before minor', () => {
    const a: ApiVersion = { major: 2, minor: 0, patch: 0 };
    const b: ApiVersion = { major: 1, minor: 99, patch: 99 };
    expect(compareVersions(a, b)).toBeGreaterThan(0);
  });

  it('compares minor before patch', () => {
    const a: ApiVersion = { major: 1, minor: 2, patch: 0 };
    const b: ApiVersion = { major: 1, minor: 1, patch: 99 };
    expect(compareVersions(a, b)).toBeGreaterThan(0);
  });
});

// =============================================================================
//  isCompatible
// =============================================================================

describe('isCompatible', () => {
  it('returns true when client and server have same version', () => {
    const client: ApiVersion = { major: 1, minor: 2, patch: 3 };
    const server: ApiVersion = { major: 1, minor: 2, patch: 3 };
    expect(isCompatible(client, server)).toBe(true);
  });

  it('returns true when client minor is less than server minor', () => {
    const client: ApiVersion = { major: 1, minor: 1, patch: 0 };
    const server: ApiVersion = { major: 1, minor: 3, patch: 0 };
    expect(isCompatible(client, server)).toBe(true);
  });

  it('returns false when client minor is greater than server minor', () => {
    const client: ApiVersion = { major: 1, minor: 5, patch: 0 };
    const server: ApiVersion = { major: 1, minor: 3, patch: 0 };
    expect(isCompatible(client, server)).toBe(false);
  });

  it('returns false when major versions differ', () => {
    const client: ApiVersion = { major: 1, minor: 0, patch: 0 };
    const server: ApiVersion = { major: 2, minor: 0, patch: 0 };
    expect(isCompatible(client, server)).toBe(false);
  });

  it('ignores patch version differences', () => {
    const client: ApiVersion = { major: 1, minor: 2, patch: 0 };
    const server: ApiVersion = { major: 1, minor: 2, patch: 99 };
    expect(isCompatible(client, server)).toBe(true);
  });

  it('returns true for 0.x versions with matching major', () => {
    const client: ApiVersion = { major: 0, minor: 1, patch: 0 };
    const server: ApiVersion = { major: 0, minor: 3, patch: 0 };
    expect(isCompatible(client, server)).toBe(true);
  });

  it('returns false for 0.x client vs 1.x server', () => {
    const client: ApiVersion = { major: 0, minor: 3, patch: 0 };
    const server: ApiVersion = { major: 1, minor: 0, patch: 0 };
    expect(isCompatible(client, server)).toBe(false);
  });
});

// =============================================================================
//  Constants
// =============================================================================

describe('CURRENT_API_VERSION', () => {
  it('has valid version fields', () => {
    expect(Number.isInteger(CURRENT_API_VERSION.major)).toBe(true);
    expect(Number.isInteger(CURRENT_API_VERSION.minor)).toBe(true);
    expect(Number.isInteger(CURRENT_API_VERSION.patch)).toBe(true);
    expect(CURRENT_API_VERSION.major).toBeGreaterThanOrEqual(0);
    expect(CURRENT_API_VERSION.minor).toBeGreaterThanOrEqual(0);
    expect(CURRENT_API_VERSION.patch).toBeGreaterThanOrEqual(0);
  });
});

describe('API_VERSION_STRING', () => {
  it('matches CURRENT_API_VERSION', () => {
    const expected = `${CURRENT_API_VERSION.major}.${CURRENT_API_VERSION.minor}.${CURRENT_API_VERSION.patch}`;
    expect(API_VERSION_STRING).toBe(expected);
  });

  it('is parseable back to same version', () => {
    const parsed = parseVersion(API_VERSION_STRING);
    expect(parsed).toEqual(CURRENT_API_VERSION);
  });
});

// =============================================================================
//  Round-trip tests
// =============================================================================

describe('parseVersion + compareVersions round-trip', () => {
  it('round-trips a version string correctly', () => {
    const original = '2.5.10';
    const parsed = parseVersion(original);
    const reparsed = parseVersion(`${parsed.major}.${parsed.minor}.${parsed.patch}`);
    expect(compareVersions(parsed, reparsed)).toBe(0);
  });

  it.each([
    ['0.1.0', '0.2.0', -1],
    ['1.0.0', '0.9.9', 1],
    ['1.1.1', '1.1.1', 0],
  ])('compareVersions(parseVersion("%s"), parseVersion("%s")) sign is %i', (a, b, expectedSign) => {
    const va = parseVersion(a);
    const vb = parseVersion(b);
    const result = compareVersions(va, vb);
    if (expectedSign < 0) expect(result).toBeLessThan(0);
    else if (expectedSign > 0) expect(result).toBeGreaterThan(0);
    else expect(result).toBe(0);
  });
});
