// ─── Creator Panel ─────────────────────────────────────────────────────────
// Creator workflow dashboard: series/channel selector, episode list, auto-reframe
// presets, quick actions, agent memory, and playbook browser.

import React, { useState, useCallback } from 'react';
import { useCreatorStore } from '../../store/creator.store';

// ─── Types ────────────────────────────────────────────────────────────────

type AspectPreset = '16:9' | '9:16' | '1:1' | '4:5';

interface LearnedPreference {
  id: string;
  label: string;
  detail: string;
  learnedAt: string;
}

interface Playbook {
  id: string;
  name: string;
  description: string;
  usageCount: number;
}

// ─── Constants ────────────────────────────────────────────────────────────

const ASPECT_PRESETS: { value: AspectPreset; label: string; icon: string }[] = [
  { value: '16:9', label: '16:9', icon: 'Landscape' },
  { value: '9:16', label: '9:16', icon: 'Portrait' },
  { value: '1:1', label: '1:1', icon: 'Square' },
  { value: '4:5', label: '4:5', icon: 'Social' },
];

const DEMO_PREFERENCES: LearnedPreference[] = [
  { id: 'pref-1', label: 'Jump-cut style', detail: 'Prefers 0.3s gap between cuts in talking-head segments', learnedAt: '2h ago' },
  { id: 'pref-2', label: 'Color grade', detail: 'Warm tones with lifted blacks for vlogs', learnedAt: '1d ago' },
  { id: 'pref-3', label: 'Intro length', detail: 'Keep intros under 5 seconds', learnedAt: '3d ago' },
];

const DEMO_PLAYBOOKS: Playbook[] = [
  { id: 'pb-1', name: 'Vlog Edit', description: 'Auto-cut silences, add music, color grade', usageCount: 47 },
  { id: 'pb-2', name: 'Tutorial Format', description: 'Chapter markers, zoom on screen, lower thirds', usageCount: 23 },
  { id: 'pb-3', name: 'Shorts Repurpose', description: 'Extract highlights, reframe 9:16, add captions', usageCount: 31 },
  { id: 'pb-4', name: 'Podcast Edit', description: 'Remove filler, level audio, generate chapters', usageCount: 15 },
];

// ─── Styles ────────────────────────────────────────────────────────────────

const S = {
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-display), system-ui, sans-serif',
    fontSize: 12,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.02em',
  },
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: 12,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-muted)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    marginBottom: 8,
  },
};

// ─── Episode Status Badge ─────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, { bg: string; fg: string }> = {
    draft: { bg: 'rgba(148,163,184,0.15)', fg: 'var(--text-muted)' },
    editing: { bg: 'rgba(99,102,241,0.15)', fg: 'var(--accent)' },
    review: { bg: 'rgba(245,158,11,0.15)', fg: 'var(--warning)' },
    published: { bg: 'rgba(34,197,94,0.15)', fg: 'var(--success)' },
    scheduled: { bg: 'rgba(139,92,246,0.15)', fg: '#8b5cf6' },
  };
  const colors = colorMap[status.toLowerCase()] ?? colorMap.draft;

  return (
    <span
      style={{
        fontSize: 9,
        padding: '2px 6px',
        borderRadius: 3,
        background: colors.bg,
        color: colors.fg,
        fontWeight: 700,
        textTransform: 'uppercase',
      }}
    >
      {status}
    </span>
  );
}

// ─── Series / Channel Selector ────────────────────────────────────────────

function SeriesSelector() {
  const { seriesList, activeSeriesId, setActiveSeriesId } = useCreatorStore();

  const activeSeries = seriesList.find((s) => s.id === activeSeriesId);

  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Series / Channel</div>
      <select
        value={activeSeriesId ?? ''}
        onChange={(e) => setActiveSeriesId(e.target.value || null)}
        style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-void)',
          color: 'var(--text-primary)',
          fontSize: 12,
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        <option value="">Select a series...</option>
        {seriesList.map((series) => (
          <option key={series.id} value={series.id}>
            {series.name}
          </option>
        ))}
      </select>
      {activeSeries && (
        <div
          style={{
            marginTop: 6,
            padding: '6px 8px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-void)',
            border: '1px solid var(--border-subtle)',
            fontSize: 10,
            color: 'var(--text-muted)',
          }}
        >
          {activeSeries.episodes?.length ?? 0} episodes
        </div>
      )}
    </div>
  );
}

// ─── Episode List ─────────────────────────────────────────────────────────

function EpisodeList() {
  const { seriesList, activeSeriesId, activeEpisodeId, setActiveEpisodeId } = useCreatorStore();

  const activeSeries = seriesList.find((s) => s.id === activeSeriesId);
  const episodes = activeSeries?.episodes ?? [];

  if (!activeSeriesId) {
    return (
      <div style={S.section}>
        <div style={S.sectionTitle}>Episodes</div>
        <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: 11 }}>
          Select a series to view episodes.
        </div>
      </div>
    );
  }

  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Episodes ({episodes.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {episodes.map((ep, idx) => (
          <div
            key={ep.id}
            onClick={() => setActiveEpisodeId(ep.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              background: activeEpisodeId === ep.id ? 'var(--bg-void)' : 'transparent',
              border: activeEpisodeId === ep.id ? '1px solid var(--border-subtle)' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 80ms',
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                width: 28,
                flexShrink: 0,
              }}
            >
              E{String(idx + 1).padStart(2, '0')}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {ep.title}
              </div>
            </div>
            <StatusBadge status={ep.status} />
          </div>
        ))}
      </div>
      {episodes.length === 0 && (
        <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: 11 }}>
          No episodes yet.
        </div>
      )}
    </div>
  );
}

// ─── Auto-Reframe Presets ─────────────────────────────────────────────────

function ReframePresets() {
  const { reframeConfig, setReframeConfig } = useCreatorStore();

  const currentAspect = `${reframeConfig.targetAspect.width}:${reframeConfig.targetAspect.height}` as AspectPreset;

  const handleSelect = useCallback(
    (preset: AspectPreset) => {
      const [w, h] = preset.split(':').map(Number);
      setReframeConfig({ targetAspect: { width: w, height: h, label: preset } });
    },
    [setReframeConfig],
  );

  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Auto-Reframe</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {ASPECT_PRESETS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => handleSelect(preset.value)}
            className="tl-btn"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '10px 6px',
              borderRadius: 'var(--radius-sm)',
              border: `1.5px solid ${currentAspect === preset.value ? 'var(--accent)' : 'var(--border-subtle)'}`,
              background: currentAspect === preset.value ? 'rgba(99,102,241,0.1)' : 'var(--bg-void)',
              color: currentAspect === preset.value ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 100ms',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700 }}>{preset.label}</span>
            <span style={{ fontSize: 9, opacity: 0.7 }}>{preset.icon}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Quick Actions ────────────────────────────────────────────────────────

function QuickActions() {
  const { toggleCreatorPanel } = useCreatorStore();

  const actions = [
    { label: 'Create Episode', icon: '+', onClick: () => toggleCreatorPanel('series') },
    { label: 'Publish', icon: '\u21A5', onClick: () => {} },
    { label: 'Generate Thumbnail', icon: '\u25A3', onClick: () => toggleCreatorPanel('thumbnail') },
  ];

  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Quick Actions</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            className="tl-btn"
            style={{
              flex: 1,
              padding: '8px 6px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-void)',
              color: 'var(--text-primary)',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              transition: 'all 80ms',
            }}
          >
            <span style={{ fontSize: 16 }}>{action.icon}</span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Agent Memory ─────────────────────────────────────────────────────────

function AgentMemory() {
  const [expanded, setExpanded] = useState(false);
  const visiblePrefs = expanded ? DEMO_PREFERENCES : DEMO_PREFERENCES.slice(0, 2);

  return (
    <div style={S.section}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={S.sectionTitle}>Agent Memory</div>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            fontSize: 10,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {expanded ? 'Show Less' : 'Show All'}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visiblePrefs.map((pref) => (
          <div
            key={pref.id}
            style={{
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-void)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{pref.label}</span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{pref.learnedAt}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>{pref.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Playbook Browser ─────────────────────────────────────────────────────

function PlaybookBrowser() {
  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Playbooks</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {DEMO_PLAYBOOKS.map((pb) => (
          <div
            key={pb.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-void)',
              border: '1px solid var(--border-subtle)',
              cursor: 'pointer',
              transition: 'all 80ms',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{pb.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{pb.description}</div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {pb.usageCount}
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>uses</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Creator Panel ───────────────────────────────────────────────────

export function CreatorPanel() {
  return (
    <div style={S.panel}>
      <div className="panel-header" style={S.header}>
        <span className="panel-title" style={S.title}>Creator Dashboard</span>
      </div>

      <div className="panel-body" style={S.body}>
        <SeriesSelector />
        <EpisodeList />
        <ReframePresets />
        <QuickActions />
        <AgentMemory />
        <PlaybookBrowser />
      </div>
    </div>
  );
}
