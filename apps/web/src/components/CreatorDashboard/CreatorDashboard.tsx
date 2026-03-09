// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Creator Dashboard
//  Series/Channel management with episode tracking and analytics
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useCallback } from 'react';
import { useCreatorStore } from '../../store/creator.store';
import type {
  SeriesProject,
  SeriesEpisode,
  EpisodeStatus,
} from '@mcua/core';

// ─── Styles ───────────────────────────────────────────────────────────────

const S = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: 'var(--bg-surface)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    color: 'var(--text-secondary)',
  },
  body: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    minHeight: 0,
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  sectionLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    color: 'var(--text-tertiary)',
  },
  seriesCard: (isActive: boolean) => ({
    padding: '10px 12px',
    background: isActive ? 'var(--bg-hover)' : 'var(--bg-raised)',
    border: `1px solid ${isActive ? 'var(--brand)' : 'var(--border-subtle)'}`,
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all 150ms',
  }),
  seriesName: {
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 2,
  },
  seriesDesc: {
    fontSize: '10px',
    color: 'var(--text-tertiary)',
    marginBottom: 6,
  },
  seriesStats: {
    display: 'flex',
    gap: '12px',
    fontFamily: 'var(--font-mono)',
    fontSize: '9px',
    color: 'var(--text-muted)',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    lineHeight: 1.2,
  },
  statLabel: {
    fontSize: '8.5px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  episodeList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  episodeItem: (isActive: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    background: isActive ? 'var(--bg-hover)' : 'transparent',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'background 100ms',
    borderLeft: isActive ? '3px solid var(--brand)' : '3px solid transparent',
  }),
  episodeNumber: {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--text-muted)',
    minWidth: 24,
    textAlign: 'center' as const,
  },
  episodeInfo: {
    flex: 1,
    minWidth: 0,
  },
  episodeTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  statusBadge: (status: EpisodeStatus) => {
    const colors: Record<EpisodeStatus, { bg: string; color: string }> = {
      idea: { bg: 'rgba(156,163,175,0.15)', color: '#9ca3af' },
      scripted: { bg: 'rgba(99,102,241,0.15)', color: '#818cf8' },
      filming: { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24' },
      editing: { bg: 'rgba(14,165,233,0.15)', color: '#38bdf8' },
      review: { bg: 'rgba(168,85,247,0.15)', color: '#c084fc' },
      published: { bg: 'rgba(34,197,94,0.15)', color: '#4ade80' },
    };
    const c = colors[status];
    return {
      fontFamily: 'var(--font-mono)',
      fontSize: '8px',
      fontWeight: 700,
      letterSpacing: '0.5px',
      textTransform: 'uppercase' as const,
      padding: '2px 6px',
      borderRadius: 8,
      background: c.bg,
      color: c.color,
      flexShrink: 0,
    };
  },
  analyticsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
  },
  analyticsCard: {
    padding: '10px 12px',
    background: 'var(--bg-raised)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)',
    textAlign: 'center' as const,
  },
  analyticsValue: {
    fontFamily: 'var(--font-mono)',
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--brand-bright)',
    lineHeight: 1.2,
  },
  analyticsLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '8.5px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginTop: 2,
  },
  btn: {
    padding: '5px 10px',
    fontSize: '9px',
    fontWeight: 600,
    background: 'var(--bg-elevated)',
    color: 'var(--text-muted)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all 150ms',
  },
  brandAssetItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    background: 'var(--bg-raised)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)',
  },
  brandAssetIcon: {
    width: 24,
    height: 24,
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-void)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    color: 'var(--text-muted)',
    flexShrink: 0,
  },
  brandAssetName: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    flex: 1,
  },
  brandAssetType: {
    fontFamily: 'var(--font-mono)',
    fontSize: '8px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    color: 'var(--text-muted)',
    fontSize: '11px',
    fontStyle: 'italic' as const,
    textAlign: 'center' as const,
    gap: '12px',
  },
  createBtn: {
    padding: '8px 16px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    background: 'var(--brand)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'opacity 150ms',
  },
};

// ─── Utility ──────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const ASSET_TYPE_ICONS: Record<string, string> = {
  logo: 'L',
  intro: 'I',
  outro: 'O',
  watermark: 'W',
  lower_third: 'LT',
  font: 'F',
  color_palette: 'C',
  music_sting: 'S',
};

// ─── Series List View ─────────────────────────────────────────────────────

function SeriesListView() {
  const { seriesList, activeSeriesId, setActiveSeriesId, addSeries } = useCreatorStore();

  const handleCreateSeries = useCallback(() => {
    const now = new Date().toISOString();
    const newSeries: SeriesProject = {
      id: `series-${Date.now()}`,
      name: `New Series ${seriesList.length + 1}`,
      description: 'New content series',
      episodes: [],
      brandAssets: [],
      analytics: {
        totalViews: 0,
        totalWatchTimeMinutes: 0,
        subscriberDelta: 0,
        averageViewsPerEpisode: 0,
      },
      defaultSettings: {
        resolution: { width: 1920, height: 1080 },
        frameRate: 30,
        exportFormat: 'mp4',
      },
      createdAt: now,
      updatedAt: now,
    };
    addSeries(newSeries);
    setActiveSeriesId(newSeries.id);
  }, [seriesList.length, addSeries, setActiveSeriesId]);

  if (seriesList.length === 0) {
    return (
      <div style={S.emptyState}>
        <span>No series yet</span>
        <button style={S.createBtn} onClick={handleCreateSeries}>
          Create Series
        </button>
      </div>
    );
  }

  return (
    <div style={S.section}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={S.sectionLabel}>Series</span>
        <button style={S.btn} onClick={handleCreateSeries}>+ New</button>
      </div>
      {seriesList.map((series) => (
        <div
          key={series.id}
          style={S.seriesCard(activeSeriesId === series.id)}
          onClick={() => setActiveSeriesId(series.id)}
        >
          <div style={S.seriesName}>{series.name}</div>
          <div style={S.seriesDesc}>{series.description}</div>
          <div style={S.seriesStats}>
            <span>{series.episodes.length} episodes</span>
            <span>{formatNumber(series.analytics.totalViews)} views</span>
            <span>{series.brandAssets.length} brand assets</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Series Detail View ───────────────────────────────────────────────────

function SeriesDetailView() {
  const {
    seriesList,
    activeSeriesId,
    activeEpisodeId,
    setActiveSeriesId,
    setActiveEpisodeId,
    updateSeries,
  } = useCreatorStore();

  const series = seriesList.find((s) => s.id === activeSeriesId);
  if (!series) return null;

  const handleAddEpisode = () => {
    const epNum = series.episodes.length + 1;
    const newEpisode: SeriesEpisode = {
      id: `ep-${Date.now()}`,
      projectId: '',
      episodeNumber: epNum,
      title: `Episode ${epNum}`,
      description: '',
      status: 'idea',
      tags: [],
    };
    updateSeries(series.id, {
      episodes: [...series.episodes, newEpisode],
    });
  };

  return (
    <>
      {/* Back button */}
      <button
        style={{ ...S.btn, alignSelf: 'flex-start' }}
        onClick={() => setActiveSeriesId(null)}
      >
        Back to Series
      </button>

      {/* Series Header */}
      <div style={S.section}>
        <div style={S.seriesName}>{series.name}</div>
        <div style={S.seriesDesc}>{series.description}</div>
      </div>

      {/* Analytics */}
      <div style={S.section}>
        <span style={S.sectionLabel}>Analytics</span>
        <div style={S.analyticsGrid}>
          <div style={S.analyticsCard}>
            <div style={S.analyticsValue}>{formatNumber(series.analytics.totalViews)}</div>
            <div style={S.analyticsLabel}>Total Views</div>
          </div>
          <div style={S.analyticsCard}>
            <div style={S.analyticsValue}>{formatNumber(series.analytics.totalWatchTimeMinutes)}</div>
            <div style={S.analyticsLabel}>Watch Time (min)</div>
          </div>
          <div style={S.analyticsCard}>
            <div style={{ ...S.analyticsValue, color: series.analytics.subscriberDelta >= 0 ? 'var(--success)' : 'var(--error)' }}>
              {series.analytics.subscriberDelta >= 0 ? '+' : ''}{formatNumber(series.analytics.subscriberDelta)}
            </div>
            <div style={S.analyticsLabel}>Subscribers</div>
          </div>
          <div style={S.analyticsCard}>
            <div style={S.analyticsValue}>{formatNumber(series.analytics.averageViewsPerEpisode)}</div>
            <div style={S.analyticsLabel}>Avg Views/Ep</div>
          </div>
        </div>
      </div>

      {/* Episodes */}
      <div style={S.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={S.sectionLabel}>Episodes ({series.episodes.length})</span>
          <button style={S.btn} onClick={handleAddEpisode}>+ Add</button>
        </div>
        <div style={S.episodeList}>
          {series.episodes.length === 0 ? (
            <div style={{ ...S.emptyState, padding: 12 }}>No episodes yet</div>
          ) : (
            series.episodes.map((episode) => (
              <div
                key={episode.id}
                style={S.episodeItem(activeEpisodeId === episode.id)}
                onClick={() => setActiveEpisodeId(episode.id)}
              >
                <span style={S.episodeNumber}>{episode.episodeNumber}</span>
                <div style={S.episodeInfo}>
                  <div style={S.episodeTitle}>{episode.title}</div>
                  {episode.duration && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-muted)' }}>
                      {formatDuration(episode.duration)}
                    </div>
                  )}
                </div>
                <span style={S.statusBadge(episode.status)}>{episode.status}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Brand Assets */}
      <div style={S.section}>
        <span style={S.sectionLabel}>Brand Assets ({series.brandAssets.length})</span>
        {series.brandAssets.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontStyle: 'italic', padding: '4px 0' }}>
            No brand assets linked
          </div>
        ) : (
          series.brandAssets.map((asset) => (
            <div key={asset.id} style={S.brandAssetItem}>
              <div style={S.brandAssetIcon}>
                {ASSET_TYPE_ICONS[asset.type] ?? '?'}
              </div>
              <span style={S.brandAssetName}>{asset.name}</span>
              <span style={S.brandAssetType}>{asset.type.replace('_', ' ')}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export function CreatorDashboard() {
  const { activeSeriesId } = useCreatorStore();

  return (
    <div style={S.root}>
      <div style={S.header}>
        <span style={S.title}>Creator Dashboard</span>
      </div>
      <div style={S.body}>
        {activeSeriesId ? <SeriesDetailView /> : <SeriesListView />}
      </div>
    </div>
  );
}
