import React, { useEffect, useState } from 'react';
import type { PlaybackConsumer } from '../../engine/PlaybackSnapshot';
import {
  getPlaybackRealtimeFallbackStats,
  type PlaybackRealtimeFallbackStats,
} from '../../engine/playbackSnapshotFrame';

interface PlaybackFallbackDiagnosticsProps {
  consumer?: PlaybackConsumer | 'all';
  telemetry?: PlaybackRealtimeFallbackStats;
  style?: React.CSSProperties;
}

function formatFallbackRate(rate: number): string {
  return `${(rate * 100).toFixed(rate >= 0.1 ? 0 : 1)}%`;
}

function buildTooltip(stats: PlaybackRealtimeFallbackStats): string {
  const scopeLabel = stats.consumer === 'all' ? 'all monitors' : stats.consumer;
  if (stats.degradedTransportFrames === 0) {
    return `Realtime post-color stable on ${scopeLabel}. ${stats.totalTransportFrames} transport frames measured.`;
  }

  return `Realtime post-color fallback on ${scopeLabel}. ${stats.degradedTransportFrames} of ${stats.totalTransportFrames} transport frames degraded to pre-color.`;
}

export function PlaybackFallbackDiagnostics({
  consumer = 'all',
  telemetry,
  style,
}: PlaybackFallbackDiagnosticsProps) {
  const [liveStats, setLiveStats] = useState<PlaybackRealtimeFallbackStats>(() => (
    telemetry ?? getPlaybackRealtimeFallbackStats(consumer)
  ));

  useEffect(() => {
    if (telemetry) {
      setLiveStats(telemetry);
      return;
    }

    setLiveStats(getPlaybackRealtimeFallbackStats(consumer));
    const interval = setInterval(() => {
      setLiveStats(getPlaybackRealtimeFallbackStats(consumer));
    }, 750);

    return () => {
      clearInterval(interval);
    };
  }, [consumer, telemetry]);

  if (liveStats.totalTransportFrames <= 0) {
    return null;
  }

  const text = liveStats.degradedTransportFrames > 0
    ? `Fallback ${liveStats.degradedTransportFrames}/${liveStats.totalTransportFrames} · ${formatFallbackRate(liveStats.fallbackRate)}`
    : `Post-color stable · ${liveStats.totalTransportFrames}f`;

  return (
    <span
      title={buildTooltip(liveStats)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        borderRadius: 999,
        fontSize: 10,
        lineHeight: 1.2,
        fontFamily: 'var(--font-mono), monospace',
        color: liveStats.degradedTransportFrames > 0 ? 'var(--warning, #f59e0b)' : 'var(--text-muted)',
        background: liveStats.degradedTransportFrames > 0
          ? 'rgba(245, 158, 11, 0.12)'
          : 'rgba(255, 255, 255, 0.06)',
        border: `1px solid ${liveStats.degradedTransportFrames > 0 ? 'rgba(245, 158, 11, 0.28)' : 'rgba(255, 255, 255, 0.08)'}`,
        ...style,
      }}
    >
      {text}
    </span>
  );
}
