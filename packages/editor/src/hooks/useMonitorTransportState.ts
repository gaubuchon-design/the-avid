import { useEffect, useRef, useState } from 'react';

export type RenderQuality = 'scrub' | 'preview' | 'full';

interface MonitorTransportState {
  transportActive: boolean;
  /** True specifically during scrub gestures (not playback). */
  scrubActive: boolean;
  /** Current render quality level. */
  renderQuality: RenderQuality;
  /** Canvas render scale (DPR during idle, 1 during transport, 0.5 during scrub). */
  renderScale: number;
  /** Color processing phase. */
  colorProcessing: 'pre' | 'post';
  /** Effect quality passed to EffectsEngine. */
  effectQuality: 'draft' | 'preview';
  /** Whether to skip effects entirely (during active scrub). */
  skipEffects: boolean;
  /** Whether to skip titles/subtitles (during active scrub). */
  skipOverlays: boolean;
  /** Whether frame caching should be used. */
  useCache: boolean;
}

/** Delay before upgrading quality after scrub/transport settles. */
const SETTLE_DELAY_MS = 80;
/** Delay before upgrading from preview to full quality after settle. */
const FULL_QUALITY_DELAY_MS = 200;

export function useMonitorTransportState(
  playheadTime: number,
  isPlaying: boolean,
): MonitorTransportState {
  const [transportActive, setTransportActive] = useState(isPlaying);
  const [scrubActive, setScrubActive] = useState(false);
  const [renderQuality, setRenderQuality] = useState<RenderQuality>('full');
  const lastPlayheadRef = useRef<number | null>(null);
  const settleTimeoutRef = useRef<number | null>(null);
  const fullQualityTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (settleTimeoutRef.current !== null) {
      window.clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }
    if (fullQualityTimeoutRef.current !== null) {
      window.clearTimeout(fullQualityTimeoutRef.current);
      fullQualityTimeoutRef.current = null;
    }

    if (isPlaying) {
      setTransportActive(true);
      setScrubActive(false);
      setRenderQuality('preview');
      lastPlayheadRef.current = playheadTime;
      return;
    }

    const lastPlayhead = lastPlayheadRef.current;
    const playheadChanged = lastPlayhead !== null && Math.abs(lastPlayhead - playheadTime) > 1e-6;
    lastPlayheadRef.current = playheadTime;

    if (!playheadChanged) {
      setTransportActive(false);
      setScrubActive(false);
      // Progressive quality upgrade: preview immediately, full after delay
      setRenderQuality('preview');
      fullQualityTimeoutRef.current = window.setTimeout(() => {
        fullQualityTimeoutRef.current = null;
        setRenderQuality('full');
      }, FULL_QUALITY_DELAY_MS);
      return;
    }

    // Playhead changed while not playing = scrub gesture
    setTransportActive(true);
    setScrubActive(true);
    setRenderQuality('scrub');

    settleTimeoutRef.current = window.setTimeout(() => {
      settleTimeoutRef.current = null;
      setTransportActive(false);
      setScrubActive(false);
      // Upgrade to preview on settle, full after further delay
      setRenderQuality('preview');
      fullQualityTimeoutRef.current = window.setTimeout(() => {
        fullQualityTimeoutRef.current = null;
        setRenderQuality('full');
      }, FULL_QUALITY_DELAY_MS);
    }, SETTLE_DELAY_MS);
  }, [isPlaying, playheadTime]);

  useEffect(() => {
    return () => {
      if (settleTimeoutRef.current !== null) {
        window.clearTimeout(settleTimeoutRef.current);
      }
      if (fullQualityTimeoutRef.current !== null) {
        window.clearTimeout(fullQualityTimeoutRef.current);
      }
    };
  }, []);

  const devicePixelRatio = typeof window === 'undefined'
    ? 1
    : Math.min(window.devicePixelRatio || 1, 2);

  const isScrubbing = scrubActive && !isPlaying;

  return {
    transportActive,
    scrubActive: isScrubbing,
    renderQuality,
    // During scrub: half resolution. During playback: 1x. Idle: DPR-scaled.
    renderScale: isScrubbing ? 0.5 : transportActive ? 1 : devicePixelRatio,
    colorProcessing: transportActive ? 'pre' : 'post',
    effectQuality: transportActive ? 'draft' : 'preview',
    // Skip expensive operations during active scrub
    skipEffects: isScrubbing,
    skipOverlays: isScrubbing,
    useCache: !transportActive,
  };
}
