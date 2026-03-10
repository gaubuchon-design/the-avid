// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Sports Panel (SP-11)
//  Sports production dashboard with live scoreboard, highlights list,
//  growing files section, quick package buttons, and stats overlay.
//  Follows BinPanel patterns: functional components, hooks, CSS classes.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useMemo, useCallback } from 'react';
import { useSportsStore } from '../../store/sports.store';
import type {
  SportEventType,
  HighlightEvent,
  GrowingFileState,
  SportsPackageType,
} from '@mcua/core';

// ─── Constants ─────────────────────────────────────────────────────────────

const EVENT_ICONS: Partial<Record<SportEventType, string>> = {
  GOAL:          '\u26BD',
  TOUCHDOWN:     '\uD83C\uDFC8',
  HOME_RUN:      '\u26BE',
  THREE_POINTER: '\uD83C\uDFC0',
  DUNK:          '\uD83C\uDFC0',
  PENALTY:       '\u26A0',
  FOUL:          '!',
  SAVE:          '\uD83E\uDDB6',
  RED_CARD:      'RC',
  YELLOW_CARD:   'YC',
  INTERCEPTION:  'INT',
  SACK:          'SK',
  FIELD_GOAL:    'FG',
  HAT_TRICK:     'HT',
  STRIKEOUT:     'K',
};

const PACKAGE_TYPES: { type: SportsPackageType; label: string; color: string }[] = [
  { type: 'PRE_GAME',  label: 'Pre-Game',  color: '#3b82f6' },
  { type: 'HALFTIME',  label: 'Halftime',  color: '#f59e0b' },
  { type: 'POST_GAME', label: 'Post-Game', color: '#22c55e' },
  { type: 'SOCIAL_CLIP', label: 'Social Clip', color: '#ec4899' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatGameClock(clock: string): string {
  return clock || '00:00';
}

function formatGrowingProgress(file: GrowingFileState): number {
  if (!file.expectedDuration || file.expectedDuration === 0) return 0;
  return Math.min((file.currentDuration / file.expectedDuration) * 100, 100);
}

function formatDurationShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─── Scoreboard Header ────────────────────────────────────────────────────

function ScoreboardHeader() {
  const { sportsMetadata } = useSportsStore();
  const { teams, scoreAtEvent, gameClock, period } = sportsMetadata;

  const homeTeam = teams[0] ?? 'Home';
  const awayTeam = teams[1] ?? 'Away';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: 'var(--bg-void)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {/* Home Team */}
      <div style={{ flex: 1, textAlign: 'right' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{homeTeam}</div>
      </div>

      {/* Home Score */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 24,
          fontWeight: 800,
          color: 'var(--text-primary)',
          minWidth: 36,
          textAlign: 'center',
        }}
      >
        {scoreAtEvent.home}
      </div>

      {/* Center Info */}
      <div style={{ textAlign: 'center', minWidth: 60 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            fontWeight: 700,
            color: '#22c55e',
          }}
        >
          {formatGameClock(gameClock)}
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em' }}>
          P{period}
        </div>
      </div>

      {/* Away Score */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 24,
          fontWeight: 800,
          color: 'var(--text-primary)',
          minWidth: 36,
          textAlign: 'center',
        }}
      >
        {scoreAtEvent.away}
      </div>

      {/* Away Team */}
      <div style={{ flex: 1, textAlign: 'left' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{awayTeam}</div>
      </div>
    </div>
  );
}

// ─── Highlight Item ────────────────────────────────────────────────────────

function HighlightItem({ highlight, isSelected, onSelect }: {
  highlight: HighlightEvent;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const icon = EVENT_ICONS[highlight.type] ?? '\u2605';

  return (
    <div
      onClick={() => onSelect(highlight.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 8px',
        cursor: 'pointer',
        background: isSelected ? 'var(--bg-active, rgba(124,92,252,0.08))' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--accent, #7c5cfc)' : '2px solid transparent',
        transition: 'background 60ms',
      }}
    >
      {/* Event Type Icon */}
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 'var(--radius-sm, 4px)',
          background: 'var(--bg-elevated)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-secondary)',
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        {icon}
      </span>

      {/* Description + Timestamp */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-primary)',
            fontWeight: isSelected ? 600 : 400,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {highlight.description}
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {formatTimestamp(highlight.timestamp)} - {highlight.type.replace(/_/g, ' ')}
        </div>
      </div>

      {/* Confidence */}
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: highlight.confidence >= 0.8 ? '#22c55e' : highlight.confidence >= 0.5 ? '#f59e0b' : '#ef4444',
        }}
      >
        {Math.round(highlight.confidence * 100)}%
      </span>
    </div>
  );
}

// ─── Growing Files Section ─────────────────────────────────────────────────

function GrowingFilesSection() {
  const { growingFiles } = useSportsStore();

  if (growingFiles.length === 0) {
    return (
      <div style={{ padding: '8px 12px', fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
        No active camera feeds recording.
      </div>
    );
  }

  return (
    <div style={{ padding: '4px 8px' }}>
      {growingFiles.map((file) => {
        const progress = formatGrowingProgress(file);

        return (
          <div
            key={file.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 4px',
              fontSize: 10,
            }}
          >
            {/* Recording indicator */}
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: file.isGrowing ? '#ef4444' : '#22c55e',
                flexShrink: 0,
                boxShadow: file.isGrowing ? '0 0 4px #ef4444' : 'none',
              }}
            />

            {/* File label */}
            <span
              style={{
                color: 'var(--text-secondary)',
                flex: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {file.serverName ?? file.filePath.split('/').pop() ?? file.id}
            </span>

            {/* Duration */}
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 9 }}>
              {formatDurationShort(file.currentDuration)}
            </span>

            {/* Progress Bar */}
            <div
              style={{
                width: 50,
                height: 4,
                borderRadius: 2,
                background: 'var(--bg-elevated)',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: file.isGrowing ? '#ef4444' : '#22c55e',
                  borderRadius: 2,
                  transition: 'width 300ms ease',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Quick Package Buttons ─────────────────────────────────────────────────

function QuickPackageButtons() {
  const { addPackage, sportsMetadata } = useSportsStore();

  const handleCreatePackage = useCallback((type: SportsPackageType, label: string) => {
    addPackage({
      id: `pkg-${type.toLowerCase()}-${Date.now()}`,
      name: `${label} - ${sportsMetadata.teams.join(' vs ')}`,
      type,
      league: sportsMetadata.league,
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      elements: [],
      requiredElements: [],
      deliveryTargets: [],
      metadata: sportsMetadata,
    });
  }, [addPackage, sportsMetadata]);

  return (
    <div style={{ display: 'flex', gap: 4, padding: '6px 8px', flexWrap: 'wrap' }}>
      {PACKAGE_TYPES.map(({ type, label, color }) => (
        <button
          key={type}
          className="tl-btn"
          onClick={() => handleCreatePackage(type, label)}
          style={{
            flex: 1,
            minWidth: 70,
            padding: '5px 8px',
            fontSize: 10,
            fontWeight: 600,
            color,
            background: `${color}15`,
            border: `1px solid ${color}30`,
            borderRadius: 'var(--radius-sm, 4px)',
            cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Stats Overlay ─────────────────────────────────────────────────────────

function StatsOverlaySection() {
  const { latestStatsData, liveData, statsConnectionStatus } = useSportsStore();

  if (statsConnectionStatus !== 'CONNECTED' && !latestStatsData) {
    return (
      <div style={{ padding: '8px 12px', fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
        Stats feed: {statsConnectionStatus}
      </div>
    );
  }

  const dataEntries = Object.entries(liveData);

  return (
    <div style={{ padding: '4px 8px' }}>
      {latestStatsData && (
        <div
          style={{
            display: 'flex',
            gap: 12,
            padding: '4px 4px',
            fontSize: 10,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: 4,
          }}
        >
          <span>State: <span style={{ color: 'var(--text-secondary)' }}>{latestStatsData.gameState}</span></span>
          <span>Period: <span style={{ color: 'var(--text-secondary)' }}>{latestStatsData.period}</span></span>
          <span>Events: <span style={{ color: 'var(--text-secondary)' }}>{latestStatsData.events.length}</span></span>
        </div>
      )}

      {dataEntries.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
          {dataEntries.slice(0, 10).map(([key, val]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 4px', fontSize: 10 }}>
              <span style={{ color: 'var(--text-muted)' }}>{key}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{String(val)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: 4 }}>
          No live stats data available.
        </div>
      )}
    </div>
  );
}

// ─── SportsPanel Component ─────────────────────────────────────────────────

export function SportsPanel() {
  const {
    highlights,
    selectedHighlightId,
    selectHighlight,
    showStatsOverlay,
    toggleStatsOverlay,
    sportsMetadata,
  } = useSportsStore();

  const [activeSection, setActiveSection] = useState<'highlights' | 'growing' | 'stats'>('highlights');

  const sortedHighlights = useMemo(() => {
    return [...highlights].sort((a, b) => b.timestamp - a.timestamp);
  }, [highlights]);

  return (
    <div className="bin-panel" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Scoreboard Header */}
      <ScoreboardHeader />

      {/* Panel Header */}
      <div className="panel-header">
        <span className="panel-title">Sports</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 10, marginRight: 'auto' }}>
          {sportsMetadata.league} - {sportsMetadata.venue || 'No venue'}
        </span>

        {/* Stats Overlay Toggle */}
        <button
          className="tl-btn"
          onClick={toggleStatsOverlay}
          title={showStatsOverlay ? 'Hide stats overlay' : 'Show stats overlay'}
          style={{
            padding: '2px 8px',
            fontSize: 10,
            fontWeight: 600,
            color: showStatsOverlay ? '#3b82f6' : 'var(--text-muted)',
            background: showStatsOverlay ? 'rgba(59,130,246,0.12)' : 'transparent',
            border: `1px solid ${showStatsOverlay ? 'rgba(59,130,246,0.3)' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--radius-sm, 4px)',
          }}
        >
          STATS
        </button>
      </div>

      {/* Section Tabs */}
      <div className="panel-tabs" style={{ display: 'flex', gap: 2, padding: '4px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
        {(['highlights', 'growing', 'stats'] as const).map((tab) => (
          <button
            key={tab}
            className={`panel-tab${activeSection === tab ? ' active' : ''}`}
            onClick={() => setActiveSection(tab)}
            style={{ fontSize: 10, padding: '2px 7px', textTransform: 'capitalize' }}
          >
            {tab === 'growing' ? 'Growing Files' : tab}
          </button>
        ))}
      </div>

      {/* Quick Package Buttons */}
      <QuickPackageButtons />

      {/* Section Content */}
      <div className="panel-body" style={{ flex: 1, overflow: 'auto' }}>
        {activeSection === 'highlights' && (
          <>
            {sortedHighlights.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                No highlights detected yet. Events will appear as the game progresses.
              </div>
            ) : (
              sortedHighlights.map((hl) => (
                <HighlightItem
                  key={hl.id}
                  highlight={hl}
                  isSelected={selectedHighlightId === hl.id}
                  onSelect={selectHighlight}
                />
              ))
            )}
          </>
        )}

        {activeSection === 'growing' && <GrowingFilesSection />}

        {activeSection === 'stats' && <StatsOverlaySection />}
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 10px',
          background: 'var(--bg-void)',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: 10,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span>{highlights.length} highlights</span>
        <span style={{ marginLeft: 'auto' }}>
          {sportsMetadata.gameClock || '00:00'} P{sportsMetadata.period}
        </span>
      </div>
    </div>
  );
}
