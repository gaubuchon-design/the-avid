// ─── Sports Cam Viewer ────────────────────────────────────────────────────────
// SP-11c: 16-angle multi-cam grid for live sports production. Shows tally
// lights, recording indicators, camera labels, and supports layout switching
// between 2x2, 3x3, and 4x4 grids.

import React, { useCallback } from 'react';
import { useSportsStore } from '../../store/sports.store';
import type { SportsCamFeed, SportsCamGridConfig } from '@mcua/core';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTallyColor(tally: SportsCamFeed['tally']): string {
  switch (tally) {
    case 'PROGRAM': return '#ef4444';
    case 'PREVIEW': return '#4ade80';
    case 'OFF': return 'transparent';
  }
}

function getGridDimensions(layout: SportsCamGridConfig['layout']): { cols: number; rows: number } {
  switch (layout) {
    case '2x2': return { cols: 2, rows: 2 };
    case '3x3': return { cols: 3, rows: 3 };
    case '4x4': return { cols: 4, rows: 4 };
  }
}

// ─── Camera Feed Cell ─────────────────────────────────────────────────────────

function CamFeedCell({
  feed,
  isSelected,
  isProgram,
  showTally,
  showLabels,
  onSelect,
  onSetProgram,
}: {
  feed: SportsCamFeed;
  isSelected: boolean;
  isProgram: boolean;
  showTally: boolean;
  showLabels: boolean;
  onSelect: () => void;
  onSetProgram: () => void;
}) {
  const tallyColor = getTallyColor(feed.tally);

  return (
    <div
      onClick={onSelect}
      onDoubleClick={onSetProgram}
      style={{
        position: 'relative',
        background: '#111',
        borderRadius: 4,
        overflow: 'hidden',
        cursor: 'pointer',
        border: isSelected
          ? '2px solid #5b6af5'
          : isProgram
          ? '2px solid #ef4444'
          : '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        aspectRatio: '16 / 9',
        transition: 'border-color 0.15s',
      }}
    >
      {/* Placeholder for live video feed */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: feed.isLive
            ? `linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)`
            : '#0a0a0a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {feed.thumbnailUrl ? (
          <img
            src={feed.thumbnailUrl}
            alt={feed.label}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: 10, color: '#444' }}>
            {feed.isLive ? 'LIVE' : 'NO SIGNAL'}
          </span>
        )}
      </div>

      {/* Tally indicator */}
      {showTally && feed.tally !== 'OFF' && (
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: 2,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: tallyColor,
            boxShadow: `0 0 6px ${tallyColor}`,
          }}
        />
      )}

      {/* Recording indicator */}
      {feed.isRecording && (
        <div
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#ef4444',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      )}

      {/* Label */}
      {showLabels && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '2px 4px',
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontSize: 9,
              color: '#ccc',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {feed.label}
          </span>
          {feed.tally === 'PROGRAM' && (
            <span style={{ fontSize: 8, color: '#ef4444', fontWeight: 700 }}>PGM</span>
          )}
          {feed.tally === 'PREVIEW' && (
            <span style={{ fontSize: 8, color: '#4ade80', fontWeight: 700 }}>PVW</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SportsCamViewer() {
  const {
    camGrid,
    setCamGridLayout,
    selectCamFeed,
    setProgramFeed,
  } = useSportsStore();

  const { layout, feeds, selectedFeedId, programFeedId, showTally, showLabels } = camGrid;
  const { cols, rows } = getGridDimensions(layout);

  const visibleFeeds = feeds.slice(0, cols * rows);

  const handleSelect = useCallback(
    (feedId: string) => selectCamFeed(feedId),
    [selectCamFeed],
  );

  const handleSetProgram = useCallback(
    (feedId: string) => setProgramFeed(feedId),
    [setProgramFeed],
  );

  return (
    <div
      className="sports-cam-viewer"
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
          padding: '6px 10px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: '#222',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: '#e0e0e0' }}>
          Multi-Cam
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {(['2x2', '3x3', '4x4'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setCamGridLayout(l)}
              style={{
                background: layout === l ? 'rgba(91,106,245,0.3)' : 'rgba(255,255,255,0.06)',
                color: layout === l ? '#5b6af5' : '#888',
                border: layout === l ? '1px solid rgba(91,106,245,0.5)' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 3,
                padding: '2px 6px',
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          gap: 2,
          padding: 2,
          overflow: 'hidden',
        }}
      >
        {visibleFeeds.map((feed) => (
          <CamFeedCell
            key={feed.id}
            feed={feed}
            isSelected={selectedFeedId === feed.id}
            isProgram={programFeedId === feed.id}
            showTally={showTally}
            showLabels={showLabels}
            onSelect={() => handleSelect(feed.id)}
            onSetProgram={() => handleSetProgram(feed.id)}
          />
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '3px 8px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          fontSize: 9,
          color: '#666',
        }}
      >
        <span>{feeds.filter((f) => f.isRecording).length}/{feeds.length} recording</span>
        <span>Double-click to cut to program</span>
      </div>
    </div>
  );
}
