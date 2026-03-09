import React, { useCallback, useEffect, useRef } from 'react';
import { usePlayerStore, ScopeType } from '../../store/player.store';
import { useEditorStore } from '../../store/editor.store';
import { playbackEngine } from '../../engine/PlaybackEngine';
import { videoSourceManager } from '../../engine/VideoSourceManager';
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

const SCOPE_OPTIONS: { value: ScopeType; label: string }[] = [
  { value: 'waveform', label: 'Waveform' },
  { value: 'vectorscope', label: 'Vectorscope' },
  { value: 'histogram', label: 'Histogram' },
  { value: 'parade', label: 'Parade' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function SourceMonitor() {
  const {
    isPlaying,
    currentFrame,
    inPoint,
    outPoint,
    showSafeZones,
    activeScope,
    sourceClipId,
    play,
    pause,
    stop,
    seekFrame,
    setInPoint,
    setOutPoint,
    toggleSafeZones,
    setActiveScope,
    setActiveMonitor,
  } = usePlayerStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastBitmapRef = useRef<ImageBitmap | null>(null);

  // Get the source asset to load video from (look up through bins or use sourceAsset)
  const sourceAsset = useEditorStore((s) => {
    if (!sourceClipId) return s.sourceAsset;
    // Search bins for the asset
    const findInBins = (bins: typeof s.bins): typeof s.sourceAsset => {
      for (const bin of bins) {
        const found = bin.assets.find((a) => a.id === sourceClipId);
        if (found) return found;
        const childResult = findInBins(bin.children);
        if (childResult) return childResult;
      }
      return null;
    };
    return findInBins(s.bins);
  });

  // Load video source when sourceClipId changes
  useEffect(() => {
    if (!sourceAsset?.fileHandle && !sourceAsset?.playbackUrl) return;
    const assetId = sourceAsset.id;
    const source = videoSourceManager.getSource(assetId);
    if (source?.ready) return; // Already loaded

    const urlOrFile = sourceAsset.fileHandle ?? sourceAsset.playbackUrl;
    if (!urlOrFile) return;
    videoSourceManager.loadSource(assetId, urlOrFile).catch((err) => {
      console.warn('[SourceMonitor] Failed to load source:', err.message);
    });
  }, [sourceAsset]);

  // Render video frame or placeholder
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Try to render real video frame
    if (sourceClipId) {
      const timeSeconds = currentFrame / playbackEngine.fps;
      frameCompositor.renderSourceFrame(sourceClipId, timeSeconds, w, h).then((bitmap) => {
        if (bitmap) {
          lastBitmapRef.current = bitmap;
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(bitmap, 0, 0, w, h);
          // Overlay in/out markers
          drawMarkers(ctx, w, h);
        } else {
          drawPlaceholder(ctx, w, h);
        }
      }).catch(() => {
        drawPlaceholder(ctx, w, h);
      });
    } else {
      drawPlaceholder(ctx, w, h);
    }

    function drawMarkers(c: CanvasRenderingContext2D, cw: number, ch: number) {
      if (inPoint !== null) {
        c.fillStyle = 'rgba(59, 130, 246, 0.6)';
        c.font = '500 10px monospace';
        c.textAlign = 'left';
        c.textBaseline = 'alphabetic';
        c.fillText('IN: ' + frameToTimecode(inPoint), 10, ch - 10);
      }
      if (outPoint !== null) {
        c.fillStyle = 'rgba(59, 130, 246, 0.6)';
        c.font = '500 10px monospace';
        c.textAlign = 'right';
        c.textBaseline = 'alphabetic';
        c.fillText('OUT: ' + frameToTimecode(outPoint), cw - 10, ch - 10);
      }
    }

    function drawPlaceholder(c: CanvasRenderingContext2D, cw: number, ch: number) {
      c.fillStyle = '#000000';
      c.fillRect(0, 0, cw, ch);
      c.fillStyle = 'rgba(255, 255, 255, 0.12)';
      c.font = '700 28px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('SOURCE', cw / 2, ch / 2 - 14);
      c.fillStyle = 'rgba(255, 255, 255, 0.25)';
      c.font = '500 13px monospace';
      c.fillText(frameToTimecode(currentFrame), cw / 2, ch / 2 + 16);
      drawMarkers(c, cw, ch);
    }
  }, [currentFrame, sourceClipId, inPoint, outPoint]);

  // Transport handlers
  const handlePlayPause = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  const handleGoToIn = useCallback(() => {
    if (inPoint !== null) seekFrame(inPoint);
  }, [inPoint, seekFrame]);

  const handleGoToOut = useCallback(() => {
    if (outPoint !== null) seekFrame(outPoint);
  }, [outPoint, seekFrame]);

  const handlePrevFrame = useCallback(() => {
    playbackEngine.prevFrame();
  }, []);

  const handleNextFrame = useCallback(() => {
    playbackEngine.nextFrame();
  }, []);

  const handleRewind = useCallback(() => {
    playbackEngine.jklShuttle('j');
  }, []);

  const handleFastForward = useCallback(() => {
    playbackEngine.jklShuttle('l');
  }, []);

  const handleMarkIn = useCallback(() => {
    setInPoint(currentFrame);
  }, [currentFrame, setInPoint]);

  const handleMarkOut = useCallback(() => {
    setOutPoint(currentFrame);
  }, [currentFrame, setOutPoint]);

  const handleScopeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      setActiveScope(val === '' ? null : (val as ScopeType));
    },
    [setActiveScope]
  );

  // Focus this monitor on click
  const handleFocus = useCallback(() => {
    setActiveMonitor('source');
  }, [setActiveMonitor]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key.toLowerCase()) {
        case 'i':
          handleMarkIn();
          break;
        case 'o':
          handleMarkOut();
          break;
        case 'j':
          playbackEngine.jklShuttle('j');
          break;
        case 'k':
          playbackEngine.jklShuttle('k');
          break;
        case 'l':
          playbackEngine.jklShuttle('l');
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleMarkIn, handleMarkOut]);

  const tc = frameToTimecode(currentFrame);

  return (
    <div className="monitor" onClick={handleFocus}>
      {/* Header */}
      <div className="monitor-header">
        <span className="monitor-label source">SOURCE</span>
        {sourceClipId && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>
            {sourceClipId}
          </span>
        )}
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
        {/* Mark In */}
        <button
          className="transport-btn"
          onClick={handleMarkIn}
          title="Mark In (I)"
          style={{ fontSize: 10, fontWeight: 600, color: inPoint !== null ? 'var(--info)' : undefined }}
        >
          I
        </button>

        {/* Transport controls */}
        <div className="transport-controls">
          <button className="transport-btn" onClick={handleGoToIn} title="Go to In (Shift+I)">
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
            {isPlaying ? '\u23F8' : '\u25B6'}
          </button>
          <button className="transport-btn" onClick={handleNextFrame} title="Next Frame (Right)">
            &rsaquo;
          </button>
          <button className="transport-btn" onClick={handleFastForward} title="Fast Forward (L)">
            &raquo;
          </button>
          <button className="transport-btn" onClick={handleGoToOut} title="Go to Out (Shift+O)">
            &raquo;|
          </button>
        </div>

        {/* Mark Out */}
        <button
          className="transport-btn"
          onClick={handleMarkOut}
          title="Mark Out (O)"
          style={{ fontSize: 10, fontWeight: 600, color: outPoint !== null ? 'var(--info)' : undefined }}
        >
          O
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Safe zones toggle */}
        <button
          className={`transport-btn${showSafeZones ? ' active' : ''}`}
          onClick={toggleSafeZones}
          title="Toggle Safe Zones"
          style={{ fontSize: 9 }}
        >
          [&nbsp;]
        </button>

        {/* Scope selector */}
        <select
          value={activeScope ?? ''}
          onChange={handleScopeChange}
          title="Video Scope"
          style={{
            background: 'var(--bg-void)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 10,
            padding: '2px 4px',
            outline: 'none',
          }}
        >
          <option value="">No Scope</option>
          {SCOPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
