// =============================================================================
//  Scopes Panel — Waveform / Vectorscope / Histogram / Parade
//  Wired to record-monitor frames with a functional pre/post grading toggle.
// =============================================================================

import React, { useCallback, useEffect, useRef } from 'react';
import { useColorStore, ScopeType } from '../../store/color.store';
import { scopesEngine } from '../../engine/ScopesEngine';
import { buildPlaybackSnapshot } from '../../engine/PlaybackSnapshot';
import { capturePlaybackSnapshotImageData } from '../../engine/playbackSnapshotFrame';
import { useEditorStore } from '../../store/editor.store';
import { useTitleStore } from '../../store/title.store';

const SCOPE_TABS: { value: ScopeType; label: string }[] = [
  { value: 'waveform', label: 'Wave' },
  { value: 'vectorscope', label: 'Vector' },
  { value: 'histogram', label: 'Histo' },
  { value: 'parade', label: 'Parade' },
];

const SCOPE_SAMPLE_WIDTH = 320;
const SCOPE_SAMPLE_HEIGHT = 200;

export function ScopesPanel() {
  const scopeType = useColorStore((s) => s.scopeType);
  const scopePosition = useColorStore((s) => s.scopePosition);
  const setScopeType = useColorStore((s) => s.setScopeType);
  const setScopePosition = useColorStore((s) => s.setScopePosition);
  const tracks = useEditorStore((s) => s.tracks);
  const subtitleTracks = useEditorStore((s) => s.subtitleTracks);
  const titleClips = useEditorStore((s) => s.titleClips);
  const playheadTime = useEditorStore((s) => s.playheadTime);
  const duration = useEditorStore((s) => s.duration);
  const sequenceSettings = useEditorStore((s) => s.sequenceSettings);
  const projectSettings = useEditorStore((s) => s.projectSettings);
  const showSafeZones = useEditorStore((s) => s.showSafeZones);
  const currentTitle = useTitleStore((s) => s.currentTitle);
  const isTitleEditing = useTitleStore((s) => s.isEditing);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const renderScope = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    scopesEngine.setEnabled(true);
    scopesEngine.setActiveScopeType(scopeType);

    const snapshot = buildPlaybackSnapshot({
      tracks,
      subtitleTracks,
      titleClips,
      playheadTime,
      duration,
      isPlaying: false,
      showSafeZones,
      activeMonitor: 'record',
      activeScope: scopeType,
      sequenceSettings,
      projectSettings,
    }, 'scope');

    const imageData = capturePlaybackSnapshotImageData({
      snapshot,
      width: w,
      height: h,
      currentTitle,
      isTitleEditing,
      colorProcessing: scopePosition,
      overlayProcessing: 'pre',
      useCache: true,
    });

    if (imageData) {
      scopesEngine.updateAndRender(imageData, canvas);
      return;
    }

    switch (scopeType) {
      case 'waveform':
        renderWaveformGraticule(ctx, w, h);
        break;
      case 'vectorscope':
        renderVectorscopeGraticule(ctx, w, h);
        break;
      case 'histogram':
        renderHistogramGraticule(ctx, w, h);
        break;
      case 'parade':
        renderParadeGraticule(ctx, w, h);
        break;
    }
  }, [
    currentTitle,
    duration,
    isTitleEditing,
    playheadTime,
    projectSettings,
    scopePosition,
    scopeType,
    sequenceSettings,
    showSafeZones,
    subtitleTracks,
    titleClips,
    tracks,
  ]);

  useEffect(() => {
    renderScope();
  }, [renderScope]);

  useEffect(() => {
    const interval = setInterval(renderScope, 100);
    return () => {
      clearInterval(interval);
      scopesEngine.setEnabled(false);
    };
  }, [renderScope]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
        {SCOPE_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setScopeType(tab.value)}
            style={{
              padding: '3px 8px',
              fontSize: 9,
              fontWeight: scopeType === tab.value ? 600 : 400,
              color: scopeType === tab.value ? 'var(--text-primary)' : 'var(--text-muted)',
              background: scopeType === tab.value ? 'var(--bg-active)' : 'transparent',
              border: 'none',
              borderBottom: scopeType === tab.value ? '1px solid var(--brand)' : '1px solid transparent',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setScopePosition(scopePosition === 'pre' ? 'post' : 'pre')}
          style={{
            padding: '3px 6px',
            fontSize: 8,
            color: 'var(--text-muted)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textTransform: 'uppercase',
          }}
          title="Toggle scopes between pre-grade and post-grade image data"
        >
          {scopePosition}
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, background: '#000' }}>
        <canvas
          ref={canvasRef}
          width={SCOPE_SAMPLE_WIDTH}
          height={SCOPE_SAMPLE_HEIGHT}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
    </div>
  );
}

function renderWaveformGraticule(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 0.5;

  for (let i = 0; i <= 4; i += 1) {
    const y = h - (i / 4) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '8px monospace';
    ctx.fillText(`${i * 25}`, 2, y - 2);
  }
}

function renderVectorscopeGraticule(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(cx, cy) - 8;

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 0.5;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.75, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy + radius);
  ctx.stroke();
}

function renderHistogramGraticule(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 0.5;

  for (let i = 1; i < 4; i += 1) {
    const x = (i / 4) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
}

function renderParadeGraticule(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const channelWidth = w / 3;

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(channelWidth, 0);
  ctx.lineTo(channelWidth, h);
  ctx.moveTo(channelWidth * 2, 0);
  ctx.lineTo(channelWidth * 2, h);
  ctx.stroke();
}

function cloneImageData(source: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
}

function sampleRecordMonitorFrame(width: number, height: number): ImageData | null {
  const monitorCanvas = document.querySelector('[aria-label="Record Monitor"] canvas');
  if (!(monitorCanvas instanceof HTMLCanvasElement)) return null;

  const scratchCanvas = document.createElement('canvas');
  scratchCanvas.width = width;
  scratchCanvas.height = height;
  const scratchCtx = scratchCanvas.getContext('2d');
  if (!scratchCtx) return null;

  try {
    scratchCtx.drawImage(monitorCanvas, 0, 0, width, height);
    return scratchCtx.getImageData(0, 0, width, height);
  } catch {
    return null;
  }
}

function createFallbackFrame(width: number, height: number, tick: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  const phase = tick * 0.03;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const nx = x / Math.max(1, width - 1);
      const ny = y / Math.max(1, height - 1);
      const wave = Math.sin((nx * 6 + phase)) * 0.5 + 0.5;
      const sweep = Math.cos((ny * 9 - phase * 0.7)) * 0.5 + 0.5;
      data[idx] = Math.round(wave * 255);
      data[idx + 1] = Math.round(sweep * 255);
      data[idx + 2] = Math.round(((1 - nx) * 0.6 + ny * 0.4) * 255);
      data[idx + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}
