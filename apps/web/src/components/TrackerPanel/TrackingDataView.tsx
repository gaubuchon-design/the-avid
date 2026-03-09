// =============================================================================
//  Tracking Data View
//  Displays per-frame tracking quality visualization: confidence graph,
//  match counts, and decomposed transform values.
// =============================================================================

import React, { useMemo } from 'react';
import type { TrackingData } from '../../engine/tracking/PlanarTracker';

// ─── Styles ─────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  fontSize: 11,
  color: '#a6adc8',
};

const graphContainer: React.CSSProperties = {
  height: 60,
  backgroundColor: '#11111b',
  borderRadius: 4,
  overflow: 'hidden',
  position: 'relative',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  fontSize: 10,
  fontFamily: 'monospace',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left' as const,
  padding: '2px 4px',
  color: '#6c7086',
  borderBottom: '1px solid #313244',
  fontWeight: 500,
};

const tdStyle: React.CSSProperties = {
  padding: '2px 4px',
  borderBottom: '1px solid rgba(49, 50, 68, 0.4)',
};

const summaryRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '2px 0',
};

// ─── Component ──────────────────────────────────────────────────────────────

interface TrackingDataViewProps {
  data: TrackingData;
  maxDisplayFrames?: number;
}

export const TrackingDataView: React.FC<TrackingDataViewProps> = ({
  data,
  maxDisplayFrames = 50,
}) => {
  const frames = useMemo(() => {
    const entries = Array.from(data.frames.entries()).sort((a, b) => a[0] - b[0]);
    // Subsample if too many frames
    if (entries.length > maxDisplayFrames) {
      const step = Math.ceil(entries.length / maxDisplayFrames);
      return entries.filter((_, i) => i % step === 0);
    }
    return entries;
  }, [data.frames, maxDisplayFrames]);

  const stats = useMemo(() => {
    const confidences = Array.from(data.frames.values()).map(f => f.confidence);
    const matches = Array.from(data.frames.values()).map(f => f.matchCount);

    return {
      avgConfidence: confidences.reduce((s, v) => s + v, 0) / confidences.length,
      minConfidence: Math.min(...confidences),
      maxMatches: Math.max(...matches),
      avgMatches: Math.round(matches.reduce((s, v) => s + v, 0) / matches.length),
      totalFrames: data.frames.size,
      lowConfidenceFrames: confidences.filter(c => c < 0.3).length,
    };
  }, [data.frames]);

  // Build SVG path for confidence graph
  const graphPath = useMemo(() => {
    if (frames.length < 2) return '';
    const xStep = 100 / (frames.length - 1);

    const points = frames.map(([, result], i) => {
      const x = i * xStep;
      const y = 100 - result.confidence * 100;
      return `${x},${y}`;
    });

    return `M ${points.join(' L ')}`;
  }, [frames]);

  const fillPath = useMemo(() => {
    if (frames.length < 2) return '';
    return `${graphPath} L 100,100 L 0,100 Z`;
  }, [graphPath, frames.length]);

  const confidenceColor = (c: number) => {
    if (c >= 0.7) return '#a6e3a1';
    if (c >= 0.4) return '#f9e2af';
    return '#f38ba8';
  };

  return (
    <div style={containerStyle}>
      {/* Summary stats */}
      <div>
        <div style={summaryRow}>
          <span>Frames</span>
          <span>{stats.totalFrames}</span>
        </div>
        <div style={summaryRow}>
          <span>Avg Confidence</span>
          <span style={{ color: confidenceColor(stats.avgConfidence) }}>
            {(stats.avgConfidence * 100).toFixed(1)}%
          </span>
        </div>
        <div style={summaryRow}>
          <span>Min Confidence</span>
          <span style={{ color: confidenceColor(stats.minConfidence) }}>
            {(stats.minConfidence * 100).toFixed(1)}%
          </span>
        </div>
        <div style={summaryRow}>
          <span>Avg Matches</span>
          <span>{stats.avgMatches}</span>
        </div>
        {stats.lowConfidenceFrames > 0 && (
          <div style={{ ...summaryRow, color: '#f38ba8' }}>
            <span>Low quality frames</span>
            <span>{stats.lowConfidenceFrames}</span>
          </div>
        )}
      </div>

      {/* Confidence graph */}
      <div>
        <div style={{ fontSize: 10, color: '#6c7086', marginBottom: 2 }}>
          Tracking Confidence
        </div>
        <div style={graphContainer}>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ width: '100%', height: '100%' }}
          >
            {/* Threshold line */}
            <line
              x1="0" y1="70" x2="100" y2="70"
              stroke="#f38ba8"
              strokeWidth="0.5"
              strokeDasharray="2 2"
              opacity="0.4"
            />

            {/* Confidence fill */}
            <path
              d={fillPath}
              fill="rgba(166, 227, 161, 0.15)"
            />

            {/* Confidence line */}
            <path
              d={graphPath}
              fill="none"
              stroke="#a6e3a1"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      </div>

      {/* Per-frame data table (scrollable) */}
      <div style={{ maxHeight: 200, overflow: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Frame</th>
              <th style={thStyle}>Conf.</th>
              <th style={thStyle}>Matches</th>
              <th style={thStyle}>dX</th>
              <th style={thStyle}>dY</th>
              <th style={thStyle}>Rot</th>
            </tr>
          </thead>
          <tbody>
            {frames.map(([frame, result]) => (
              <tr key={frame}>
                <td style={tdStyle}>{frame}</td>
                <td style={{ ...tdStyle, color: confidenceColor(result.confidence) }}>
                  {(result.confidence * 100).toFixed(0)}%
                </td>
                <td style={tdStyle}>{result.matchCount}</td>
                <td style={tdStyle}>{result.decomposed.position.x.toFixed(1)}</td>
                <td style={tdStyle}>{result.decomposed.position.y.toFixed(1)}</td>
                <td style={tdStyle}>{result.decomposed.rotation.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
