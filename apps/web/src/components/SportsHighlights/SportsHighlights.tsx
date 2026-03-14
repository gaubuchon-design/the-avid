// ─── Sports Highlights Panel ──────────────────────────────────────────────────
// SP-11b: Display AI-detected highlights with confidence scores, detection
// method badges, and timeline integration. Supports filtering by confidence
// level and event type, and one-click highlight reel assembly.

import React, { useState, useMemo } from 'react';
import { useSportsStore } from '../../store/sports.store';
import type { HighlightEvent, SportEventType, HighlightConfidenceLevel } from '@mcua/core';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getEventColor(type: SportEventType): string {
  const colors: Record<string, string> = {
    GOAL: '#ef4444',
    TOUCHDOWN: '#ef4444',
    DUNK: '#f59e0b',
    THREE_POINTER: '#f59e0b',
    HOME_RUN: '#ef4444',
    TACKLE: '#818cf8',
    PENALTY: '#ec4899',
    FOUL: '#e8943a',
    SAVE: '#4ade80',
    INTERCEPTION: '#0ea5e9',
    SACK: '#00d4aa',
    RED_CARD: '#ef4444',
    YELLOW_CARD: '#f59e0b',
    HAT_TRICK: '#ef4444',
    FIELD_GOAL: '#4ecdc4',
    OTHER: '#888',
  };
  return colors[type] ?? '#888';
}

function getConfidenceColor(level: HighlightConfidenceLevel): string {
  switch (level) {
    case 'HIGH': return '#4ade80';
    case 'MEDIUM': return '#f59e0b';
    case 'LOW': return '#888';
  }
}

function getDetectionMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    CROWD_NOISE: 'Crowd',
    SCOREBOARD_OCR: 'Score',
    PLAYER_TRACKING: 'Player',
    COMMENTARY_NLP: 'Commentary',
    REPLAY_MARKER: 'Replay',
    STATS_API: 'Stats',
  };
  return labels[method] ?? method;
}

// ─── Highlight Card ───────────────────────────────────────────────────────────

function HighlightCard({
  highlight,
  isSelected,
  onSelect,
}: {
  highlight: HighlightEvent;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const eventColor = getEventColor(highlight.type);
  const confColor = getConfidenceColor(highlight.confidenceLevel);

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '8px 10px',
        cursor: 'pointer',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: isSelected ? 'rgba(91,106,245,0.18)' : 'transparent',
        borderLeft: `3px solid ${eventColor}`,
        transition: 'background 0.15s',
      }}
    >
      {/* Top row: event type, confidence, timestamp */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            background: eventColor,
            color: '#fff',
            padding: '1px 6px',
            borderRadius: 3,
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          {highlight.type.replace(/_/g, ' ')}
        </span>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            marginLeft: 'auto',
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: confColor,
            }}
          />
          <span style={{ fontSize: 11, color: confColor, fontFamily: 'monospace' }}>
            {(highlight.confidence * 100).toFixed(0)}%
          </span>
        </div>

        <span style={{ fontSize: 10, color: '#888', fontFamily: 'monospace' }}>
          {formatTimestamp(highlight.timestamp)}
        </span>
      </div>

      {/* Description */}
      <div style={{ fontSize: 12, color: '#ccc', lineHeight: 1.4 }}>
        {highlight.description}
      </div>

      {/* Detection sources */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {highlight.sourceDetections.map((source, idx) => (
          <span
            key={idx}
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: '#999',
              padding: '1px 5px',
              borderRadius: 3,
              fontSize: 9,
            }}
          >
            {getDetectionMethodLabel(source.method)}
          </span>
        ))}

        {highlight.isReplay && (
          <span
            style={{
              background: 'rgba(239,68,68,0.15)',
              color: '#ef4444',
              padding: '1px 5px',
              borderRadius: 3,
              fontSize: 9,
            }}
          >
            REPLAY
          </span>
        )}

        {highlight.players.length > 0 && (
          <span style={{ fontSize: 10, color: '#777', marginLeft: 'auto' }}>
            {highlight.players.join(', ')}
          </span>
        )}
      </div>

      {/* Intensity bars */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
        {highlight.crowdReactionScore > 0 && (
          <IntensityBar label="Crowd" value={highlight.crowdReactionScore} color="#4ade80" />
        )}
        {highlight.commentaryExcitement > 0 && (
          <IntensityBar label="Commentary" value={highlight.commentaryExcitement} color="#f59e0b" />
        )}
        {highlight.audioIntensity > 0 && (
          <IntensityBar label="Audio" value={highlight.audioIntensity} color="#818cf8" />
        )}
      </div>
    </div>
  );
}

function IntensityBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 9, color: '#666', width: 55 }}>{label}</span>
      <div
        style={{
          width: 40,
          height: 4,
          background: 'rgba(255,255,255,0.1)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${value * 100}%`,
            height: '100%',
            background: color,
            borderRadius: 2,
          }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SportsHighlights() {
  const {
    highlights,
    highlightMinConfidence,
    selectedHighlightId,
    setHighlightMinConfidence,
    selectHighlight,
  } = useSportsStore();

  const [filterType, setFilterType] = useState<SportEventType | 'ALL'>('ALL');

  const filteredHighlights = useMemo(() => {
    let result = highlights.filter((h) => h.confidence >= highlightMinConfidence);

    if (filterType !== 'ALL') {
      result = result.filter((h) => h.type === filterType);
    }

    return result.sort((a, b) => b.confidence - a.confidence);
  }, [highlights, highlightMinConfidence, filterType]);

  const eventTypes = useMemo(() => {
    const types = new Set(highlights.map((h) => h.type));
    return Array.from(types);
  }, [highlights]);

  const highCount = filteredHighlights.filter((h) => h.confidenceLevel === 'HIGH').length;
  const mediumCount = filteredHighlights.filter((h) => h.confidenceLevel === 'MEDIUM').length;

  return (
    <div
      className="sports-highlights-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#1a1a1a',
        borderRadius: 6,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: '#222',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0' }}>
            AI Highlights
          </span>
          <span style={{ fontSize: 11, color: '#888' }}>
            {filteredHighlights.length} events
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: '#4ade80' }}>{highCount} high</span>
          <span style={{ fontSize: 10, color: '#f59e0b' }}>{mediumCount} med</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as SportEventType | 'ALL')}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            padding: '4px 6px',
            fontSize: 11,
            color: '#ccc',
            outline: 'none',
          }}
        >
          <option value="ALL">All Types</option>
          {eventTypes.map((type) => (
            <option key={type} value={type}>
              {type.replace(/_/g, ' ')}
            </option>
          ))}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
          <span style={{ fontSize: 10, color: '#888' }}>Min:</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={highlightMinConfidence}
            onChange={(e) => setHighlightMinConfidence(parseFloat(e.target.value))}
            style={{ flex: 1, height: 4 }}
          />
          <span style={{ fontSize: 10, color: '#aaa', fontFamily: 'monospace', width: 30, textAlign: 'right' }}>
            {(highlightMinConfidence * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Highlight List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredHighlights.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#555',
              fontSize: 12,
            }}
          >
            {highlights.length === 0
              ? 'No highlights detected yet'
              : 'No highlights match current filters'}
          </div>
        ) : (
          filteredHighlights.map((highlight) => (
            <HighlightCard
              key={highlight.id}
              highlight={highlight}
              isSelected={selectedHighlightId === highlight.id}
              onSelect={() => selectHighlight(highlight.id)}
            />
          ))
        )}
      </div>

      {/* Footer: Assemble button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <span style={{ fontSize: 10, color: '#666' }}>
          {highlights.length} total detected
        </span>
        <button
          disabled={filteredHighlights.length === 0}
          style={{
            background: filteredHighlights.length > 0 ? '#5b6af5' : 'rgba(255,255,255,0.06)',
            color: filteredHighlights.length > 0 ? '#fff' : '#666',
            border: 'none',
            borderRadius: 4,
            padding: '4px 12px',
            fontSize: 11,
            fontWeight: 600,
            cursor: filteredHighlights.length > 0 ? 'pointer' : 'default',
          }}
        >
          Assemble Reel
        </button>
      </div>
    </div>
  );
}
