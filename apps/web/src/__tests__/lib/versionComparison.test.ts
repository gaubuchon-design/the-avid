import { describe, expect, it } from 'vitest';
import type { ProjectVersion } from '../../collab/CollabEngine';
import { buildVersionComparison, formatSignedDelta, pickComparisonBaseline } from '../../lib/versionComparison';

function makeVersion(overrides: Partial<ProjectVersion>): ProjectVersion {
  return {
    id: 'version-id',
    name: 'Version',
    createdAt: 0,
    createdBy: 'Tester',
    description: '',
    snapshotData: {},
    ...overrides,
  };
}

describe('versionComparison helpers', () => {
  it('buildVersionComparison() computes numeric deltas and changed keys', () => {
    const baseline = makeVersion({
      id: 'base',
      name: 'Baseline',
      createdAt: 1000,
      snapshotData: { tracks: 4, clips: 10, duration: 21, notes: 'old' },
    });
    const target = makeVersion({
      id: 'target',
      name: 'Target',
      createdAt: 4000,
      snapshotData: { tracks: 5, clips: 14, duration: 19, notes: 'new' },
    });

    const comparison = buildVersionComparison(target, baseline);
    expect(comparison.trackDelta).toBe(1);
    expect(comparison.clipDelta).toBe(4);
    expect(comparison.durationDelta).toBe(-2);
    expect(comparison.createdAtDeltaMs).toBe(3000);
    expect(comparison.changedSnapshotKeys).toEqual(['clips', 'duration', 'notes', 'tracks']);
  });

  it('pickComparisonBaseline() resolves previous/latest/custom baselines', () => {
    const versions = [
      makeVersion({ id: 'latest', createdAt: 300 }),
      makeVersion({ id: 'middle', createdAt: 200 }),
      makeVersion({ id: 'oldest', createdAt: 100 }),
    ];

    expect(pickComparisonBaseline(versions, 'middle', 'previous', '')?.id).toBe('oldest');
    expect(pickComparisonBaseline(versions, 'middle', 'latest', '')?.id).toBe('latest');
    expect(pickComparisonBaseline(versions, 'middle', 'custom', 'oldest')?.id).toBe('oldest');
    expect(pickComparisonBaseline(versions, 'middle', 'custom', 'missing')).toBeNull();
  });

  it('formatSignedDelta() formats positive, negative, and unknown values', () => {
    expect(formatSignedDelta(7, 's')).toBe('+7s');
    expect(formatSignedDelta(-3, '')).toBe('-3');
    expect(formatSignedDelta(0, 'f')).toBe('0f');
    expect(formatSignedDelta(null, '')).toBe('n/a');
  });
});
