import type { ProjectVersion } from '../collab/CollabEngine';

export type VersionCompareMode = 'previous' | 'latest' | 'custom';

export interface VersionComparison {
  target: ProjectVersion;
  baseline: ProjectVersion;
  trackDelta: number | null;
  clipDelta: number | null;
  durationDelta: number | null;
  createdAtDeltaMs: number;
  changedSnapshotKeys: string[];
}

function getNumericSnapshotMetric(version: ProjectVersion, key: string): number | null {
  if (key === 'tracks' && version.snapshotSummary) {
    return version.snapshotSummary.trackCount;
  }
  if (key === 'clips' && version.snapshotSummary) {
    return version.snapshotSummary.clipCount;
  }
  if (key === 'duration' && version.snapshotSummary) {
    return version.snapshotSummary.duration;
  }
  const value = (version.snapshotData as Record<string, unknown> | null | undefined)?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getChangedSnapshotKeys(target: ProjectVersion, baseline: ProjectVersion): string[] {
  const targetSnapshot = (target.snapshotData as Record<string, unknown> | null | undefined) ?? {};
  const baselineSnapshot = (baseline.snapshotData as Record<string, unknown> | null | undefined) ?? {};
  const allKeys = new Set([
    ...Object.keys(targetSnapshot),
    ...Object.keys(baselineSnapshot),
  ]);
  return [...allKeys].filter((key) => targetSnapshot[key] !== baselineSnapshot[key]).sort();
}

export function buildVersionComparison(
  target: ProjectVersion,
  baseline: ProjectVersion,
): VersionComparison {
  const targetTracks = getNumericSnapshotMetric(target, 'tracks');
  const targetClips = getNumericSnapshotMetric(target, 'clips');
  const targetDuration = getNumericSnapshotMetric(target, 'duration');
  const baselineTracks = getNumericSnapshotMetric(baseline, 'tracks');
  const baselineClips = getNumericSnapshotMetric(baseline, 'clips');
  const baselineDuration = getNumericSnapshotMetric(baseline, 'duration');

  return {
    target,
    baseline,
    trackDelta: targetTracks !== null && baselineTracks !== null ? targetTracks - baselineTracks : null,
    clipDelta: targetClips !== null && baselineClips !== null ? targetClips - baselineClips : null,
    durationDelta: targetDuration !== null && baselineDuration !== null ? targetDuration - baselineDuration : null,
    createdAtDeltaMs: target.createdAt - baseline.createdAt,
    changedSnapshotKeys: getChangedSnapshotKeys(target, baseline),
  };
}

export function pickComparisonBaseline(
  versions: ProjectVersion[],
  targetVersionId: string,
  mode: VersionCompareMode,
  customBaselineId: string,
): ProjectVersion | null {
  const targetIndex = versions.findIndex((version) => version.id === targetVersionId);
  if (targetIndex === -1) return null;

  if (mode === 'previous') {
    return versions[targetIndex + 1] ?? null;
  }
  if (mode === 'latest') {
    return versions.find((version) => version.id !== targetVersionId) ?? null;
  }
  return versions.find((version) => version.id === customBaselineId) ?? null;
}

export function formatSignedDelta(value: number | null, unit: string): string {
  if (value === null) return 'n/a';
  if (value === 0) return `0${unit}`;
  return `${value > 0 ? '+' : ''}${value}${unit}`;
}
