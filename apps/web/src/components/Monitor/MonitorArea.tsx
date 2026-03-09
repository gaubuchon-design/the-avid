import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useEditorStore } from '../../store/editor.store';
import { Timecode } from '../../lib/timecode';
import { videoSourceManager } from '../../engine/VideoSourceManager';
import { effectsEngine } from '../../engine/EffectsEngine';
import { renderTitle } from '../../engine/TitleRenderer';
import { useTitleStore } from '../../store/title.store';

/**
 * MonitorArea — Real video playback and compositing.
 *
 * Renders video frames onto a <canvas> element, applies effects via
 * EffectsEngine pixel processing, and composites titles/subtitles on top.
 */
export function MonitorArea() {
  const {
    isPlaying, togglePlay, playheadTime, setPlayhead, showSafeZones, duration,
    tracks, selectedClipIds, sourceAsset, inPoint, outPoint, isFullscreen,
    projectSettings,
  } = useEditorStore();

  const tc = new Timecode({ fps: projectSettings?.frameRate || 24 });
  const aspectRatio = projectSettings ? projectSettings.width / projectSettings.height : 16 / 9;
  const totalClips = tracks.reduce((n, t) => n + t.clips.length, 0);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>();
  const [videoLoaded, setVideoLoaded] = useState(false);
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
          // Container is wider — fit to height
          h = Math.floor(ch);
          w = Math.floor(h * aspectRatio);
        } else {
          // Container is taller — fit to width
          w = Math.floor(cw);
          h = Math.floor(w / aspectRatio);
        }
        setCanvasSize({ w, h });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [aspectRatio]);

  // ── Load video when sourceAsset changes ────────────────────────────────
  useEffect(() => {
    const asset = sourceAsset;
    if (!asset?.playbackUrl) {
      setVideoLoaded(false);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    video.src = asset.playbackUrl;
    video.load();

    const onLoaded = () => {
      setVideoLoaded(true);
      // Set active source in manager
      videoSourceManager.setActiveSource(asset.id);
    };

    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    return () => video.removeEventListener('loadedmetadata', onLoaded);
  }, [sourceAsset?.playbackUrl, sourceAsset?.id]);

  // ── Find active video clip at playhead ──────────────────────────────────
  const getActiveVideoClip = useCallback(() => {
    // Find the topmost video track with a clip at the playhead
    const videoTracks = tracks
      .filter((t) => t.type === 'VIDEO' && !t.muted)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    for (const track of videoTracks) {
      for (const clip of track.clips) {
        if (playheadTime >= clip.startTime && playheadTime < clip.endTime) {
          return clip;
        }
      }
    }
    return null;
  }, [tracks, playheadTime]);

  // ── Render loop — draw video frame + effects onto canvas ───────────────
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = canvasSize;
    canvas.width = w;
    canvas.height = h;

    // Clear canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // Draw video frame if available
    if (video && videoLoaded && video.readyState >= 2) {
      // Calculate letterboxing
      const videoAR = video.videoWidth / video.videoHeight;
      let drawW = w, drawH = h, drawX = 0, drawY = 0;

      if (videoAR > aspectRatio) {
        drawH = Math.floor(w / videoAR);
        drawY = Math.floor((h - drawH) / 2);
      } else if (videoAR < aspectRatio) {
        drawW = Math.floor(h * videoAR);
        drawX = Math.floor((w - drawW) / 2);
      }

      ctx.drawImage(video, drawX, drawY, drawW, drawH);

      // Apply effects if any clip is selected
      const activeClip = getActiveVideoClip();
      if (activeClip) {
        const clipEffects = effectsEngine.getClipEffects(activeClip.id);
        if (clipEffects.length > 0) {
          const imageData = ctx.getImageData(0, 0, w, h);
          const currentFrame = Math.floor(playheadTime * (projectSettings?.frameRate || 24));
          effectsEngine.processFrame(imageData, clipEffects, currentFrame);
          ctx.putImageData(imageData, 0, 0);
        }
      }
    } else if (sourceAsset) {
      // No video loaded but asset selected — show info
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(124, 92, 252, 0.3)';
      ctx.font = `${Math.max(24, w * 0.05)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(sourceAsset.type === 'AUDIO' ? '♪' : '▶', w / 2, h / 2 - 10);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = `${Math.max(11, w * 0.02)}px system-ui`;
      ctx.fillText(sourceAsset.name, w / 2, h / 2 + 20);
    }

    // ── Composite title graphics (GRAPHIC track) ────────────────
    const currentTitle = useTitleStore.getState().currentTitle;
    if (currentTitle && useTitleStore.getState().isEditing) {
      const currentFrame = Math.floor(playheadTime * (projectSettings?.frameRate || 24));
      renderTitle(ctx, currentTitle, w, h, currentFrame, projectSettings?.frameRate || 24);
    }

    // Render title clips from store
    const { titleClips } = useEditorStore.getState();
    const graphicTracks = tracks.filter(t => t.type === 'GRAPHIC' && !t.muted);
    for (const gTrack of graphicTracks) {
      for (const clip of gTrack.clips) {
        if (playheadTime >= clip.startTime && playheadTime < clip.endTime) {
          const titleData = titleClips.find(tc => tc.id === clip.assetId);
          if (titleData) {
            const clipFrame = Math.floor((playheadTime - clip.startTime) * (projectSettings?.frameRate || 24));
            renderTitle(ctx, titleData as any, w, h, clipFrame, projectSettings?.frameRate || 24);
          }
        }
      }
    }

    // ── Composite subtitles (SUBTITLE track) ─────────────────────
    const { subtitleTracks } = useEditorStore.getState();
    const subTracks = tracks.filter(t => t.type === 'SUBTITLE' && !t.muted);
    for (const sTrack of subTracks) {
      for (const clip of sTrack.clips) {
        if (playheadTime >= clip.startTime && playheadTime < clip.endTime) {
          // Find matching subtitle cue
          for (const subTrack of subtitleTracks) {
            for (const cue of subTrack.cues) {
              if (playheadTime >= cue.start && playheadTime < cue.end) {
                // Render subtitle text
                const fontSize = cue.style?.fontSize || Math.max(16, w * 0.028);
                const yPos = cue.style?.position === 'top' ? h * 0.08 : h * 0.88;
                ctx.save();
                ctx.font = `${fontSize}px system-ui, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                // Background bar
                const textWidth = ctx.measureText(cue.text).width;
                const bgOpacity = cue.style?.bgOpacity ?? 0.7;
                ctx.fillStyle = `rgba(0, 0, 0, ${bgOpacity})`;
                ctx.fillRect(
                  w / 2 - textWidth / 2 - 12,
                  yPos - fontSize / 2 - 4,
                  textWidth + 24,
                  fontSize + 8,
                );
                // Text
                ctx.fillStyle = cue.style?.color || '#ffffff';
                ctx.fillText(cue.text, w / 2, yPos);
                ctx.restore();
              }
            }
          }
          break; // Only render first matching subtitle track clip
        }
      }
    }

    // Safe zones overlay
    if (showSafeZones) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      // Action safe (90%)
      const actionInset = 0.05;
      ctx.strokeRect(
        w * actionInset, h * actionInset,
        w * (1 - 2 * actionInset), h * (1 - 2 * actionInset)
      );
      // Title safe (80%)
      const titleInset = 0.1;
      ctx.strokeRect(
        w * titleInset, h * titleInset,
        w * (1 - 2 * titleInset), h * (1 - 2 * titleInset)
      );
      ctx.setLineDash([]);
    }
  }, [canvasSize, videoLoaded, sourceAsset, showSafeZones, playheadTime, getActiveVideoClip, projectSettings?.frameRate, aspectRatio]);

  // ── Sync video seek with playhead ──────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoLoaded) return;
    if (!isPlaying) {
      // When scrubbing, seek the video to match the playhead
      const activeClip = getActiveVideoClip();
      if (activeClip) {
        const clipTime = playheadTime - activeClip.startTime + activeClip.trimStart;
        if (Math.abs(video.currentTime - clipTime) > 0.05) {
          video.currentTime = Math.max(0, clipTime);
        }
      }
    }
  }, [playheadTime, isPlaying, videoLoaded, getActiveVideoClip]);

  // ── Play/pause video with transport ────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoLoaded) return;
    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying, videoLoaded]);

  // ── Continuous render loop ─────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      renderFrame();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [renderFrame]);

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
        {/* Hidden video element — audio routes through Web Audio API */}
        <video
          ref={videoRef}
          style={{ display: 'none' }}
          playsInline
          crossOrigin="anonymous"
          preload="auto"
        />

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
      </div>
    </div>
  );
}
