import { useEffect, useRef, useState } from 'react';

interface MonitorTransportState {
  transportActive: boolean;
  renderScale: number;
  colorProcessing: 'pre' | 'post';
  effectQuality: 'draft' | 'preview';
  useCache: boolean;
}

const SETTLE_DELAY_MS = 110;

export function useMonitorTransportState(
  playheadTime: number,
  isPlaying: boolean,
): MonitorTransportState {
  const [transportActive, setTransportActive] = useState(isPlaying);
  const lastPlayheadRef = useRef<number | null>(null);
  const settleTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (settleTimeoutRef.current !== null) {
      window.clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }

    if (isPlaying) {
      setTransportActive(true);
      lastPlayheadRef.current = playheadTime;
      return;
    }

    const lastPlayhead = lastPlayheadRef.current;
    const playheadChanged = lastPlayhead !== null && Math.abs(lastPlayhead - playheadTime) > 1e-6;
    lastPlayheadRef.current = playheadTime;

    if (!playheadChanged) {
      setTransportActive(false);
      return;
    }

    setTransportActive(true);
    settleTimeoutRef.current = window.setTimeout(() => {
      settleTimeoutRef.current = null;
      setTransportActive(false);
    }, SETTLE_DELAY_MS);
  }, [isPlaying, playheadTime]);

  useEffect(() => {
    return () => {
      if (settleTimeoutRef.current !== null) {
        window.clearTimeout(settleTimeoutRef.current);
      }
    };
  }, []);

  const devicePixelRatio = typeof window === 'undefined'
    ? 1
    : Math.min(window.devicePixelRatio || 1, 2);

  return {
    transportActive,
    renderScale: transportActive ? 1 : devicePixelRatio,
    colorProcessing: transportActive ? 'pre' : 'post',
    effectQuality: transportActive ? 'draft' : 'preview',
    useCache: !transportActive,
  };
}
