import React, { useRef, useEffect } from 'react';
import { useEditorStore } from '../../store/editor.store';
import type { RenderState, RenderTrack } from '../../workers/renderer-protocol';

const TRACK_H = 40;

export function TimelineCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const tracks = useEditorStore((s) => s.tracks);
  const playheadTime = useEditorStore((s) => s.playheadTime);
  const zoom = useEditorStore((s) => s.zoom);
  const scrollLeft = useEditorStore((s) => s.scrollLeft);
  const duration = useEditorStore((s) => s.duration);
  const markers = useEditorStore((s) => s.markers);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);

  // Initialize worker + canvas (handles React strict mode double-mount)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
    container.appendChild(canvas);
    canvasRef.current = canvas;

    // Feature-check OffscreenCanvas transfer
    if (typeof canvas.transferControlToOffscreen !== 'function') {
      return () => {
        canvas.remove();
      };
    }

    const offscreen = canvas.transferControlToOffscreen();
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    offscreen.width = Math.round(rect.width * dpr);
    offscreen.height = Math.round(rect.height * dpr);

    const worker = new Worker(
      new URL('../../workers/timeline-renderer.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.postMessage({ type: 'init', canvas: offscreen, dpr }, [offscreen]);
    workerRef.current = worker;

    // Resize observer
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      worker.postMessage({
        type: 'resize',
        width,
        height,
        dpr: window.devicePixelRatio || 1,
      });
    });
    obs.observe(container);

    return () => {
      obs.disconnect();
      worker.postMessage({ type: 'destroy' });
      worker.terminate();
      workerRef.current = null;
      canvas.remove();
      canvasRef.current = null;
    };
  }, []);

  // Send state updates to worker
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;

    const renderTracks: RenderTrack[] = tracks.map((t) => ({
      id: t.id,
      type: t.type,
      color: t.color,
      muted: t.muted,
      locked: t.locked,
      clips: t.clips.map((c) => ({
        id: c.id,
        startTime: c.startTime,
        endTime: c.endTime,
        type: c.type,
        color: c.color || t.color,
        waveformData: c.waveformData,
        selected: selectedClipIds.includes(c.id),
      })),
    }));

    const state: RenderState = {
      tracks: renderTracks,
      playheadTime,
      zoom,
      scrollLeft,
      scrollTop: 0,
      duration,
      markers: markers.map((m) => ({ time: m.time, color: m.color })),
      trackHeight: TRACK_H,
      viewportWidth: containerRef.current?.clientWidth || 800,
      viewportHeight: containerRef.current?.clientHeight || 300,
    };

    worker.postMessage({ type: 'update', state });
  }, [tracks, playheadTime, zoom, scrollLeft, duration, markers, selectedClipIds]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
