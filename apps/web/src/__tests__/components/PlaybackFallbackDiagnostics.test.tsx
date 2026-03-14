import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PlaybackFallbackDiagnostics } from '../../components/Diagnostics/PlaybackFallbackDiagnostics';

describe('PlaybackFallbackDiagnostics', () => {
  it('renders a stable transport summary when no fallback frames are present', () => {
    const markup = renderToStaticMarkup(
      <PlaybackFallbackDiagnostics
        telemetry={{
          consumer: 'record-monitor',
          totalTransportFrames: 48,
          degradedTransportFrames: 0,
          fallbackRate: 0,
          lastDegradedAt: null,
          lastFrameRevision: null,
        }}
      />,
    );

    expect(markup).toContain('Post-color stable · 48f');
  });

  it('renders fallback frequency when degraded transport frames are present', () => {
    const markup = renderToStaticMarkup(
      <PlaybackFallbackDiagnostics
        telemetry={{
          consumer: 'all',
          totalTransportFrames: 48,
          degradedTransportFrames: 3,
          fallbackRate: 3 / 48,
          lastDegradedAt: Date.now(),
          lastFrameRevision: 'frame-revision-1',
        }}
      />,
    );

    expect(markup).toContain('Fallback 3/48 · 6.3%');
  });

  it('renders nothing when no transport telemetry has been collected yet', () => {
    const markup = renderToStaticMarkup(
      <PlaybackFallbackDiagnostics
        telemetry={{
          consumer: 'scope',
          totalTransportFrames: 0,
          degradedTransportFrames: 0,
          fallbackRate: 0,
          lastDegradedAt: null,
          lastFrameRevision: null,
        }}
      />,
    );

    expect(markup).toBe('');
  });
});
