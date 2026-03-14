import React from 'react';
import type { ProjectVersion } from '../../collab/CollabEngine';
import { useCollabStore } from '../../store/collab.store';
import { useEditorStore } from '../../store/editor.store';

function timeAgo(timestamp: number): string {
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function canRestoreVersion(version: ProjectVersion): boolean {
  const snapshot = version.snapshotData as {
    id?: unknown;
    tracks?: unknown;
    bins?: unknown;
    editorialState?: unknown;
    workstationState?: unknown;
  } | null;

  return Boolean(
    snapshot
      && typeof snapshot.id === 'string'
      && Array.isArray(snapshot.tracks)
      && Array.isArray(snapshot.bins)
      && snapshot.editorialState
      && snapshot.workstationState,
  );
}

function formatVersionDuration(duration: number): string {
  const totalFrames = Math.max(0, Math.round(duration * 24));
  const hours = Math.floor(totalFrames / (24 * 3600));
  const minutes = Math.floor((totalFrames % (24 * 3600)) / (24 * 60));
  const seconds = Math.floor((totalFrames % (24 * 60)) / 24);
  const frames = totalFrames % 24;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

function retentionLabel(version: ProjectVersion): string {
  if (version.retentionPolicy === 'manual') {
    return 'Retained manually';
  }
  if (version.retentionPolicy === 'session') {
    return 'Session retention';
  }
  return 'Fixture';
}

function kindLabel(version: ProjectVersion): string {
  return version.kind === 'restore-point' ? 'Restore point' : 'Legacy demo';
}

function summaryText(version: ProjectVersion): string | null {
  if (!version.snapshotSummary) {
    return null;
  }

  return [
    `Tracks ${version.snapshotSummary.trackCount}`,
    `Clips ${version.snapshotSummary.clipCount}`,
    `Bins ${version.snapshotSummary.binCount}`,
    formatVersionDuration(version.snapshotSummary.duration),
  ].join(' · ');
}

function metricRows(version: ProjectVersion): string[] {
  if (!version.compareMetrics.length || !version.compareBaselineName) {
    return [];
  }

  return version.compareMetrics.map((metric) => (
    `${metric.label}: ${metric.previousValue} -> ${metric.currentValue}`
  ));
}

export function VersionHistoryPanel() {
  const { versions, restoreVersion } = useCollabStore((state) => ({
    versions: state.versions,
    restoreVersion: state.restoreVersion,
  }));
  const {
    versionHistoryRetentionPreference,
    versionHistoryCompareMode,
  } = useEditorStore((state) => ({
    versionHistoryRetentionPreference: state.versionHistoryRetentionPreference,
    versionHistoryCompareMode: state.versionHistoryCompareMode,
  }));

  return (
    <section
      style={{
        display: 'grid',
        gap: 8,
        padding: 12,
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border-default)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <header style={{ display: 'grid', gap: 4 }}>
        <strong style={{ fontSize: 13 }}>Version History</strong>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)' }}>
          <span>{versionHistoryRetentionPreference === 'manual' ? 'Manual retain' : 'Session retention'}</span>
          <span>{versionHistoryCompareMode === 'details' ? 'Detailed compare' : 'Summary view'}</span>
        </div>
      </header>

      {versions.map((version) => {
        const summary = summaryText(version);
        const metrics = metricRows(version);
        const restorable = canRestoreVersion(version);

        return (
          <article
            key={version.id}
            style={{
              display: 'grid',
              gap: 6,
              padding: 10,
              borderRadius: 10,
              border: '1px solid var(--border-default)',
              background: 'var(--bg-raised)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong style={{ fontSize: 12 }}>{version.name}</strong>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timeAgo(version.createdAt)}</span>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 10, color: 'var(--text-muted)' }}>
              <span>{kindLabel(version)}</span>
              <span>{retentionLabel(version)}</span>
            </div>

            {version.description && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{version.description}</div>
            )}

            {summary && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{summary}</div>
            )}

            {version.compareSummary && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                vs previous {version.compareSummary.trackDelta >= 0 ? '+' : ''}{version.compareSummary.trackDelta} tracks
              </div>
            )}

            {versionHistoryCompareMode === 'details' && metrics.length > 0 && (
              <div style={{ display: 'grid', gap: 3, fontSize: 10, color: 'var(--text-secondary)' }}>
                <div>Compared to {version.compareBaselineName}</div>
                {metrics.map((metric) => (
                  <div key={`${version.id}-${metric}`}>{metric}</div>
                ))}
              </div>
            )}

            {!restorable && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                This entry is demo history only and cannot restore editor state.
              </div>
            )}

            <div>
              <button
                type="button"
                aria-label={`Restore ${version.name}`}
                disabled={!restorable}
                onClick={() => restoreVersion(version.id)}
                style={{
                  padding: '5px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border-default)',
                  background: 'transparent',
                  color: restorable ? 'var(--text-secondary)' : 'var(--text-muted)',
                  cursor: restorable ? 'pointer' : 'default',
                  opacity: restorable ? 1 : 0.6,
                }}
              >
                Restore
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
