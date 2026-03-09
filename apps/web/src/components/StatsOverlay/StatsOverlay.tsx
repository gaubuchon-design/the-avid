// ─── Stats Overlay Component ──────────────────────────────────────────────────
// SP-11e: Live stats data overlay showing current score, game clock, period,
// and recent events. Connects to StatsDataBridge live cache.

import React, { useMemo } from 'react';
import { useSportsStore } from '../../store/sports.store';
import type { StatsDataPoint } from '@mcua/core';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatGameClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getGameStateLabel(state: StatsDataPoint['gameState']): string {
  switch (state) {
    case 'PRE_GAME': return 'PRE-GAME';
    case 'IN_PLAY': return 'LIVE';
    case 'HALFTIME': return 'HALF TIME';
    case 'BREAK': return 'BREAK';
    case 'POST_GAME': return 'FULL TIME';
    case 'DELAYED': return 'DELAYED';
    case 'SUSPENDED': return 'SUSPENDED';
  }
}

function getGameStateColor(state: StatsDataPoint['gameState']): string {
  switch (state) {
    case 'IN_PLAY': return '#ef4444';
    case 'HALFTIME': return '#f59e0b';
    case 'POST_GAME': return '#4ade80';
    default: return '#888';
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function StatsOverlay() {
  const {
    latestStatsData,
    statsConnectionStatus,
    sportsMetadata,
    liveData,
  } = useSportsStore();

  const gameState = latestStatsData?.gameState ?? 'PRE_GAME';
  const gameStateColor = getGameStateColor(gameState);

  const homeScore = liveData['HOME_SCORE_LIVE'] ?? latestStatsData?.homeScore ?? 0;
  const awayScore = liveData['AWAY_SCORE_LIVE'] ?? latestStatsData?.awayScore ?? 0;
  const gameClock = liveData['GAME_CLOCK_LIVE'] ?? (latestStatsData ? formatGameClock(latestStatsData.gameClockMs) : '00:00');
  const period = liveData['PERIOD_LIVE'] ?? latestStatsData?.period ?? 1;

  const recentEvents = useMemo(() => {
    if (!latestStatsData) return [];
    return latestStatsData.events.slice(-3);
  }, [latestStatsData]);

  return (
    <div
      className="stats-overlay"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 8,
        background: 'rgba(0,0,0,0.85)',
        borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.1)',
        minWidth: 220,
      }}
    >
      {/* Connection Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: statsConnectionStatus === 'CONNECTED' ? '#4ade80' : '#ef4444',
          }}
        />
        <span style={{ fontSize: 9, color: '#888', textTransform: 'uppercase' }}>
          {statsConnectionStatus === 'CONNECTED' ? 'LIVE DATA' : statsConnectionStatus}
        </span>
      </div>

      {/* Score Bug */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: '6px 0',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#aaa', marginBottom: 2 }}>
            {sportsMetadata.teams[0] ?? 'HOME'}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>
            {homeScore}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: gameStateColor,
              textTransform: 'uppercase',
              padding: '1px 6px',
              background: `${gameStateColor}22`,
              borderRadius: 3,
            }}
          >
            {getGameStateLabel(gameState)}
          </span>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>
            {gameClock}
          </span>
          <span style={{ fontSize: 9, color: '#888' }}>
            Period {period}
          </span>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#aaa', marginBottom: 2 }}>
            {sportsMetadata.teams[1] ?? 'AWAY'}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>
            {awayScore}
          </div>
        </div>
      </div>

      {/* Recent Events */}
      {recentEvents.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 4 }}>
          {recentEvents.map((event) => (
            <div
              key={event.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '2px 0',
                fontSize: 10,
              }}
            >
              <span style={{ color: '#ef4444', fontWeight: 600, width: 50 }}>
                {event.type.replace(/_/g, ' ')}
              </span>
              <span style={{ color: '#ccc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {event.description}
              </span>
              <span style={{ color: '#666', fontFamily: 'monospace', fontSize: 9 }}>
                {formatGameClock(event.gameClockMs)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Competition Info */}
      {sportsMetadata.competitionName && (
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            paddingTop: 3,
            fontSize: 9,
            color: '#666',
            textAlign: 'center',
          }}
        >
          {sportsMetadata.competitionName}
          {sportsMetadata.venue && ` | ${sportsMetadata.venue}`}
        </div>
      )}
    </div>
  );
}
