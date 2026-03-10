import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useEditorStore } from '../../store/editor.store';
import { usePlayerStore } from '../../store/player.store';
import { useTitleStore } from '../../store/title.store';
import { Timecode } from '../../lib/timecode';
import { TrimStatusOverlay } from '../Editor/TrimStatusOverlay';
import { buildPlaybackSnapshot } from '../../engine/PlaybackSnapshot';
import { renderPlaybackSnapshotFrame } from '../../engine/playbackSnapshotFrame';
import {
  findActiveClip,
  syncVideoPlayback,
  pauseVideoSource,
  tryLoadClipSource,
} from '../../engine/compositeRecordFrame';

/**
 * MonitorArea — Full-record mode composited monitor.
 *
 * Uses the shared compositing pipeline for full compositing:
 * intrinsic transforms + effects + titles + subtitles + safe zones.
 * Identical output to RecordMonitor (dual mode).
 */
export function MonitorArea() {
  const {
    isPlaying, togglePlay, playheadTime, setPlayhead, showSafeZones, duration,
    tracks, selectedClipIds, inPoint, outPoint, isFullscreen,
    projectSettings,
  } = useEditorStore();

  const tc = new Timecode({ fps: projectSettings?.frameRate || 24 });
  const aspectRatio = projectSettings ? projectSettings.width / projectSettings.height : 16 / 9;
  const totalClips = tracks.reduce((n, t) => n + t.clips.length, 0);
  const trimActive = useEditorStore((s) => s.trimActive);
  const trimMode = useEditorStore((s) => s.trimMode);
  const trimSelectionLabel = useEditorStore((s) => s.trimSelectionLabel);
  const trimCounterFrames = useEditorStore((s) => s.trimCounterFrames);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrubRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>();
  const lastClipIdRef = useRef<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 640, h: 360 });

  // Calculate progress
  const progress = duration > 0 ? (playheadTime / duration) * 100 : 0;
  const inPos = inPoint !== null && duration > 0 ? (inPoint / duration) * 100 : null;
  const outPos = outPoint !== null && duration > 0 ? (outPoint / duration) * 100 : null;

  // ── Canvas sizing — maintain aspect ratio within container ────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: cw, height: ch } = entry.contentRect;
        if (cw <= 0 || ch <= 0) continue;

        const containerAR = cw / ch;
        let w: number, h: number;
        if (containerAR > aspectRatio) {
          h = Math.floor(ch);
          w = Math.floor(h * aspectRatio);
        } else {
          w = Math.floor(cw);
          h = Math.floor(w / aspectRatio);
        }
        setCanvasSize({ w, h });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [aspectRatio]);

  // ── Continuous RAF render loop ─────────────────────────────────────────
  // Uses the shared compositing pipeline for full compositing:
  // intrinsic transforms + effects + titles + subtitles + safe zones.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      const { w, h } = canvasSize;
      canvas.width = w;
      canvas.height = h;

      // Read latest state (non-reactive inside RAF)
      const state = useEditorStore.getState();
      const playerState = usePlayerStore.getState();
      const titleState = useTitleStore.getState();
      const snapshot = buildPlaybackSnapshot({
        tracks: state.tracks,
        subtitleTracks: state.subtitleTracks,
        titleClips: state.titleClips,
        playheadTime: state.playheadTime,
        duration: state.duration,
        isPlaying: state.isPlaying,
        showSafeZones: state.showSafeZones,
        activeMonitor: playerState.activeMonitor,
        activeScope: playerState.activeScope,
        sequenceSettings: state.sequenceSettings,
        projectSettings: state.projectSettings,
      }, 'program-monitor');

      // Sync video playback for the active clip
      const activeClip = snapshot.primaryVideoLayer?.clip ?? null;

      // Handle clip transitions: pause old clip, start new
      if (activeClip?.assetId !== lastClipIdRef.current) {
        if (lastClipIdRef.current) {
          pauseVideoSource(lastClipIdRef.current);
        }
        lastClipIdRef.current = activeClip?.assetId ?? null;
      }

      // Sync playback for the active clip
      if (activeClip) {
        syncVideoPlayback(activeClip, state.isPlaying, state.playheadTime, state.sequenceSettings.fps);
      }

      // Try loading unloaded clip sources
      if (activeClip?.assetId) {
        tryLoadClipSource(activeClip.assetId, state.bins as any);
      }

      renderPlaybackSnapshotFrame({
        snapshot,
        width: w,
        height: h,
        canvas,
        currentTitle: titleState.currentTitle,
        isTitleEditing: titleState.isEditing,
        colorProcessing: 'post',
        useCache: !state.isPlaying,
      });

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [canvasSize]);

  // Auto-inspect clip at playhead (Premiere Pro behavior — Inspector shows
  // properties for the clip currently visible in the record monitor)
  useEffect(() => {
    const state = useEditorStore.getState();
    if (state.selectedClipIds.length === 0) {
      const clip = findActiveClip(state.tracks, playheadTime);
      if (clip) {
        state.setInspectedClip(clip.id);
      }
    }
  }, [playheadTime]);

  // ── Scrub bar ──────────────────────────────────────────────────────────
  const handleScrub = useCallback((e: React.MouseEvent) => {
    const bar = scrubRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setPlayhead(pct * duration);
  }, [duration, setPlayhead]);

  const dragListenersRef = useRef<{ onMove: (ev: MouseEvent) => void; onUp: () => void } | null>(null);

  const handleScrubDrag = useCallback((e: React.MouseEvent) => {
    handleScrub(e);
    const bar = scrubRef.current;
    if (!bar) return;
    const onMove = (ev: MouseEvent) => {
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      setPlayhead(pct * duration);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      dragListenersRef.current = null;
    };
    dragListenersRef.current = { onMove, onUp };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [duration, setPlayhead, handleScrub]);

  useEffect(() => {
    return () => {
      if (dragListenersRef.current) {
        window.removeEventListener('mousemove', dragListenersRef.current.onMove);
        window.removeEventListener('mouseup', dragListenersRef.current.onUp);
        dragListenersRef.current = null;
      }
    };
  }, []);

  // ── Fullscreen ─────────────────────────────────────────────────────────
  const handleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  return (
    <div className="composer-monitor" ref={containerRef} role="region" aria-label="Program Monitor">
      {/* Video canvas */}
      <div className="composer-canvas">
        {/* Visible canvas for composited output */}
        <canvas
          ref={canvasRef}
          width={canvasSize.w}
          height={canvasSize.h}
          style={{
            width: canvasSize.w,
            height: canvasSize.h,
            maxWidth: '100%',
            maxHeight: '100%',
            display: 'block',
            margin: 'auto',
          }}
        />

        {/* Timecode overlay */}
        <div className="monitor-tc-overlay" role="status" aria-live="polite">
          {tc.secondsToTC(playheadTime)}
        </div>

        <TrimStatusOverlay />

        {/* Controls overlay — top right */}
        <div className="composer-controls-overlay">
          <button className="composer-ctrl-btn" title="Toggle Fullscreen" aria-label="Toggle Fullscreen" onClick={handleFullscreen}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrub bar */}
      <div
        className="composer-scrubbar"
        ref={scrubRef}
        onMouseDown={handleScrubDrag}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label="Playback position"
        tabIndex={0}
      >
        {inPos !== null && (
          <div className="composer-scrubbar-mark in" style={{ left: `${inPos}%` }} title={`In: ${tc.secondsToTC(inPoint!)}`} />
        )}
        {outPos !== null && (
          <div className="composer-scrubbar-mark out" style={{ left: `${outPos}%` }} title={`Out: ${tc.secondsToTC(outPoint!)}`} />
        )}
        {inPos !== null && outPos !== null && (
          <div className="composer-scrubbar-range" style={{ left: `${inPos}%`, width: `${outPos - inPos}%` }} />
        )}
        <div className="composer-scrubbar-fill" style={{ width: `${progress}%` }} />
        <div className="composer-scrubbar-head" style={{ left: `${progress}%` }} />
      </div>

      {/* Transport */}
      <div className="composer-transport">
        <button
          className="composer-play-btn"
          onClick={togglePlay}
          title="Play/Pause (Space)"
          aria-label="Play/Pause (Space)"
        >
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
        </button>
      </div>

      {/* Status bar */}
      <div className="composer-status-bar">
        <span>Selected: {selectedClipIds.length}</span>
        <span>Duration: {tc.secondsToTC(duration)}</span>
        <span>Viewing: {totalClips > 0 ? `${projectSettings?.width}×${projectSettings?.height}` : '--'}</span>
        <span>Trim: {trimActive ? `${trimMode.toUpperCase()} ${trimSelectionLabel} ${trimCounterFrames > 0 ? '+' : ''}${trimCounterFrames}f` : 'OFF'}</span>
      </div>
    </div>
  );
}
