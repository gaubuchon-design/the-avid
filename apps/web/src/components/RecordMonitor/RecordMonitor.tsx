import React, { useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '../../store/editor.store';
import { usePlayerStore } from '../../store/player.store';
import { playbackEngine } from '../../engine/PlaybackEngine';
import { frameCompositor } from '../../engine/FrameCompositor';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function frameToTimecode(frame: number, fps = 23.976): string {
  const totalSeconds = frame / fps;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const f = Math.floor(frame % Math.ceil(fps));
  return (
    String(h).padStart(2, '0') + ':' +
    String(m).padStart(2, '0') + ':' +
    String(s).padStart(2, '0') + ':' +
    String(f).padStart(2, '0')
  );
}

function timeToTimecode(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const f = Math.floor((sec % 1) * 24);
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
  const showSafeZones = useEditorStore((s) => s.showSafeZones);
  const duration = useEditorStore((s) => s.duration);

  const { setActiveMonitor } = usePlayerStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Get timeline tracks and sequence settings for compositing
  const tracks = useEditorStore((s) => s.tracks);
  const sequenceSettings = useEditorStore((s) => s.sequenceSettings);

  // Render composited timeline frame or placeholder
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Check if there are any video tracks with clips
    const hasVideoClips = tracks.some(
      (t) => (t.type === 'VIDEO' || t.type === 'GRAPHIC') && t.clips.length > 0
    );

    if (hasVideoClips) {
      frameCompositor
        .renderTimelineFrame(tracks, playheadTime, sequenceSettings, w, h)
        .then((bitmap) => {
          if (bitmap) {
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(bitmap, 0, 0, w, h);
            bitmap.close();
            // Draw progress bar overlay
            drawProgressBar(ctx, w, h);
          } else {
            drawPlaceholder(ctx, w, h);
          }
        })
        .catch(() => {
          drawPlaceholder(ctx, w, h);
        });
    } else {
      drawPlaceholder(ctx, w, h);
    }

    function drawProgressBar(c: CanvasRenderingContext2D, cw: number, ch: number) {
      const progress = duration > 0 ? playheadTime / duration : 0;
      c.fillStyle = 'rgba(255, 255, 255, 0.05)';
      c.fillRect(0, ch - 3, cw, 3);
      c.fillStyle = '#7c5cfc';
      c.fillRect(0, ch - 3, cw * progress, 3);
    }

    function drawPlaceholder(c: CanvasRenderingContext2D, cw: number, ch: number) {
      c.fillStyle = '#000000';
      c.fillRect(0, 0, cw, ch);
      c.fillStyle = 'rgba(255, 255, 255, 0.12)';
      c.font = '700 28px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('RECORD', cw / 2, ch / 2 - 14);
      c.fillStyle = 'rgba(255, 255, 255, 0.25)';
      c.font = '500 13px monospace';
      c.fillText(timeToTimecode(playheadTime), cw / 2, ch / 2 + 16);
      drawProgressBar(c, cw, ch);
    }
  }, [playheadTime, duration, tracks, sequenceSettings]);

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
    useEditorStore.getState().setPlayhead(Math.max(0, current - 1 / 24));
  }, []);

  const handleNextFrame = useCallback(() => {
    const current = useEditorStore.getState().playheadTime;
    useEditorStore.getState().setPlayhead(current + 1 / 24);
  }, []);

  const handleRewind = useCallback(() => {
    const current = useEditorStore.getState().playheadTime;
    useEditorStore.getState().setPlayhead(Math.max(0, current - 2));
  }, []);

  const handleFastForward = useCallback(() => {
    const current = useEditorStore.getState().playheadTime;
    useEditorStore.getState().setPlayhead(current + 2);
  }, []);

  const handleMatchFrame = useCallback(() => {
    // Match frame: sync the source monitor's frame to the record playhead position
    const frame = Math.round(playheadTime * playbackEngine.fps);
    playbackEngine.seekToFrame(frame);
  }, [playheadTime]);

  // Focus this monitor on click
  const handleFocus = useCallback(() => {
    setActiveMonitor('record');
  }, [setActiveMonitor]);

  // F key for match frame
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === 'f') {
        handleMatchFrame();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleMatchFrame]);

  const tc = timeToTimecode(playheadTime);

  return (
    <div className="monitor" onClick={handleFocus}>
      {/* Header */}
      <div className="monitor-header">
        <span className="monitor-label record">RECORD</span>
        <span className="monitor-tc">{tc}</span>
      </div>

      {/* Canvas area */}
      <div className="monitor-canvas">
        <canvas
          ref={canvasRef}
          width={480}
          height={270}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
        {showSafeZones && (
          <div className="safe-zone">
            <div className="safe-zone-action" />
            <div className="safe-zone-title" />
          </div>
        )}
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
        <div className="transport-controls">
          <button className="transport-btn" onClick={handleGoToStart} title="Go to Start (Home)">
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
        <div className="timecode-display" style={{ marginLeft: 8, minWidth: 100 }}>
          {tc}
        </div>
      </div>
    </div>
  );
}
