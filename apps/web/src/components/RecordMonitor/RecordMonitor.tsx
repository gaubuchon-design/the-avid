import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editor.store';
import { usePlayerStore } from '../../store/player.store';
import { useTitleStore } from '../../store/title.store';
import { TrimStatusOverlay } from '../Editor/TrimStatusOverlay';
import { buildPlaybackSnapshot } from '../../engine/PlaybackSnapshot';
import { renderPlaybackSnapshotFrame } from '../../engine/playbackSnapshotFrame';
import {
  compositePlaybackSnapshot,
  findActiveClip,
  getSourceTime,
  syncVideoPlayback,
  pauseVideoSource,
  tryLoadClipSource,
} from '../../engine/compositeRecordFrame';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeToTimecode(sec: number, fps = 24): string {
  const totalFrames = Math.round(sec * fps);
  const h = Math.floor(totalFrames / (fps * 3600));
  const m = Math.floor((totalFrames % (fps * 3600)) / (fps * 60));
  const s = Math.floor((totalFrames % (fps * 60)) / fps);
  const f = totalFrames % Math.ceil(fps);
  return (
    String(h).padStart(2, '0') + ':' +
    String(m).padStart(2, '0') + ':' +
    String(s).padStart(2, '0') + ':' +
    String(f).padStart(2, '0')
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RecordMonitor() {
  const playheadTime = useEditorStore((s) => s.playheadTime);
  const editorIsPlaying = useEditorStore((s) => s.isPlaying);
  const editorTogglePlay = useEditorStore((s) => s.togglePlay);
  const duration = useEditorStore((s) => s.duration);
  const fps = useEditorStore((s) => s.sequenceSettings.fps);

  const { setActiveMonitor } = usePlayerStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>();
  const lastClipIdRef = useRef<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 480, h: 270 });

  // Responsive canvas sizing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: cw, height: ch } = entry.contentRect;
        if (cw <= 0 || ch <= 0) continue;
        const ar = 16 / 9;
        let w: number, h: number;
        if (cw / ch > ar) {
          h = Math.floor(ch);
          w = Math.floor(h * ar);
        } else {
          w = Math.floor(cw);
          h = Math.floor(w / ar);
        }
        setCanvasSize({ w: Math.max(w, 160), h: Math.max(h, 90) });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // ── Continuous RAF render loop ──────────────────────────────────────────────
  // Uses the shared compositing pipeline for full compositing:
  // intrinsic transforms + effects + titles + subtitles + safe zones.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(render); return; }

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
      }, 'record-monitor');

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

      if (state.isPlaying) {
        compositePlaybackSnapshot({
          ctx,
          canvasW: w,
          canvasH: h,
          snapshot,
          currentTitle: titleState.currentTitle,
          isTitleEditing: titleState.isEditing,
        });
      } else {
        renderPlaybackSnapshotFrame({
          snapshot,
          width: w,
          height: h,
          canvas,
          currentTitle: titleState.currentTitle,
          isTitleEditing: titleState.isEditing,
          colorProcessing: 'post',
          useCache: true,
        });
      }

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

  // Transport handlers
  const handlePlayPause = useCallback(() => {
    editorTogglePlay();
  }, [editorTogglePlay]);

  const handleGoToStart = useCallback(() => {
    useEditorStore.getState().setPlayhead(0);
  }, []);

  const handleGoToEnd = useCallback(() => {
    useEditorStore.getState().setPlayhead(duration);
  }, [duration]);

  const handlePrevFrame = useCallback(() => {
    const current = useEditorStore.getState().playheadTime;
    useEditorStore.getState().setPlayhead(Math.max(0, current - 1 / fps));
  }, [fps]);

  const handleNextFrame = useCallback(() => {
    const current = useEditorStore.getState().playheadTime;
    useEditorStore.getState().setPlayhead(current + 1 / fps);
  }, [fps]);

  const handleRewind = useCallback(() => {
    const current = useEditorStore.getState().playheadTime;
    useEditorStore.getState().setPlayhead(Math.max(0, current - 2));
  }, []);

  const handleFastForward = useCallback(() => {
    const current = useEditorStore.getState().playheadTime;
    useEditorStore.getState().setPlayhead(current + 2);
  }, []);

  const handleMatchFrame = useCallback(() => {
    const state = useEditorStore.getState();
    const clip = findActiveClip(state.tracks, state.playheadTime);
    if (clip?.assetId) {
      const sourceTime = getSourceTime(clip, state.playheadTime);
      const bin = state.bins.find((b) => b.assets.some((a) => a.id === clip.assetId));
      const asset = bin?.assets.find((a) => a.id === clip.assetId);
      if (asset) {
        state.setSourceAsset(asset);
        state.setSourcePlayhead(sourceTime);
        state.setInspectedClip(clip.id);
        usePlayerStore.getState().setActiveMonitor('source');
      }
    }
  }, []);

  const handleFocus = useCallback(() => {
    setActiveMonitor('record');
  }, [setActiveMonitor]);

  const tc = timeToTimecode(playheadTime, fps);
  const isActive = usePlayerStore((s) => s.activeMonitor === 'record');
  const trimActive = useEditorStore((s) => s.trimActive);
  const trimMode = useEditorStore((s) => s.trimMode);
  const trimSelectionLabel = useEditorStore((s) => s.trimSelectionLabel);
  const trimCounterFrames = useEditorStore((s) => s.trimCounterFrames);

  return (
    <div className={`monitor${isActive ? ' monitor-active' : ''}`} onClick={handleFocus} role="region" aria-label="Record Monitor">
      {/* Header */}
      <div className="monitor-header">
        <span className="monitor-label record" aria-hidden="true">RECORD</span>
        {trimActive && (
          <span className="monitor-trim-summary">
            {trimMode.toUpperCase()} {trimSelectionLabel} {trimCounterFrames > 0 ? '+' : ''}{trimCounterFrames}f
          </span>
        )}
        <span className="monitor-tc">{tc}</span>
      </div>

      {/* Canvas area */}
      <div className="monitor-canvas" ref={containerRef} style={{ flex: 1, minHeight: 0 }}>
        <canvas
          ref={canvasRef}
          width={canvasSize.w}
          height={canvasSize.h}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
        <TrimStatusOverlay />
      </div>

      {/* Footer / Transport */}
      <div className="monitor-footer">
        {/* Match Frame */}
        <button
          className="transport-btn"
          onClick={handleMatchFrame}
          title="Match Frame (F)"
          style={{ fontSize: 10, fontWeight: 600 }}
        >
          F
        </button>

        {/* Transport controls */}
        <div className="transport-controls" role="group" aria-label="Record transport controls">
          <button className="transport-btn" onClick={handleGoToStart} title="Go to Start (Home)" aria-label="Go to start">
            |&laquo;
          </button>
          <button className="transport-btn" onClick={handleRewind} title="Rewind (J)">
            &laquo;
          </button>
          <button className="transport-btn" onClick={handlePrevFrame} title="Prev Frame (Left)">
            &lsaquo;
          </button>
          <button
            className="transport-btn play-btn"
            onClick={handlePlayPause}
            title="Play/Pause (Space)"
          >
            {editorIsPlaying ? '\u23F8' : '\u25B6'}
          </button>
          <button className="transport-btn" onClick={handleNextFrame} title="Next Frame (Right)">
            &rsaquo;
          </button>
          <button className="transport-btn" onClick={handleFastForward} title="Fast Forward (L)">
            &raquo;
          </button>
          <button className="transport-btn" onClick={handleGoToEnd} title="Go to End (End)">
            &raquo;|
          </button>
        </div>

        {/* Timecode display */}
        <div className="timecode-display" style={{ marginLeft: 8, minWidth: 100 }} role="status" aria-live="polite" aria-label="Current timecode">
          {tc}
        </div>
      </div>
    </div>
  );
}
