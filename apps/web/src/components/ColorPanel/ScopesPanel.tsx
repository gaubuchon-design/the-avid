// =============================================================================
//  Scopes Panel — Waveform / Vectorscope / Histogram / Parade
//  Wired to the color pipeline output with pre/post toggle.
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

  // Render scope
  const renderScope = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

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

  // Periodic update
  useEffect(() => {
    const interval = setInterval(renderScope, 100);
    return () => {
      clearInterval(interval);
      scopesEngine.setEnabled(false);
    };
  }, [renderScope]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Scope tab bar */}
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
        {/* Pre/Post toggle */}
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
        >
          {scopePosition}
        </button>
      </div>

      {/* Scope canvas */}
      <div style={{ flex: 1, minHeight: 0, background: '#000' }}>
        <canvas
          ref={canvasRef}
          width={320}
          height={200}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
    </div>
  );
}

// ── Graticule Renderers ──────────────────────────────────────────────────────

function renderWaveformGraticule(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 0.5;

  // IRE levels: 0, 25, 50, 75, 100
  for (let i = 0; i <= 4; i++) {
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
  const r = Math.min(cx, cy) - 8;

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 0.5;

  // Outer circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // 75% circle
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
  ctx.stroke();

  // Crosshair
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.stroke();

  // Color target markers (Rec.709)
  const targets = [
    { label: 'R', angle: 103, dist: 0.63 },
    { label: 'G', angle: 241, dist: 0.56 },
    { label: 'B', angle: 347, dist: 0.59 },
    { label: 'Yl', angle: 167, dist: 0.44 },
    { label: 'Cy', angle: 283, dist: 0.50 },
    { label: 'Mg', angle: 61, dist: 0.59 },
  ];
  for (const t of targets) {
    const rad = (t.angle * Math.PI) / 180;
    const tx = cx + Math.cos(rad) * r * t.dist;
    const ty = cy - Math.sin(rad) * r * t.dist;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(tx - 2, ty - 2, 4, 4);
    ctx.font = '7px monospace';
    ctx.fillText(t.label, tx + 4, ty + 3);
  }

  // Skin tone line (approximately 123 degrees on vectorscope)
  const skinAngle = (123 * Math.PI) / 180;
  ctx.strokeStyle = 'rgba(255,180,100,0.3)';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(skinAngle) * r, cy - Math.sin(skinAngle) * r);
  ctx.stroke();
}

function renderHistogramGraticule(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 0.5;

  for (let i = 1; i < 4; i++) {
    const x = (i / 4) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // Level labels
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '8px monospace';
  ctx.fillText('0', 2, h - 2);
  ctx.fillText('64', w * 0.25 - 8, h - 2);
  ctx.fillText('128', w * 0.5 - 10, h - 2);
  ctx.fillText('192', w * 0.75 - 10, h - 2);
  ctx.fillText('255', w - 20, h - 2);
}

function renderParadeGraticule(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const channelW = w / 3;

  // Channel separators
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(channelW, 0);
  ctx.lineTo(channelW, h);
  ctx.moveTo(channelW * 2, 0);
  ctx.lineTo(channelW * 2, h);
  ctx.stroke();

  // Channel labels
  const labels = [
    { text: 'R', color: 'rgba(248,113,113,0.5)' },
    { text: 'G', color: 'rgba(74,222,128,0.5)' },
    { text: 'B', color: 'rgba(96,165,250,0.5)' },
  ];
  labels.forEach((l, i) => {
    ctx.fillStyle = l.color;
    ctx.font = '9px monospace';
    ctx.fillText(l.text, channelW * i + 4, 12);
  });

  // IRE lines per channel
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  for (let c = 0; c < 3; c++) {
    for (let i = 1; i < 4; i++) {
      const y = h - (i / 4) * h;
      ctx.beginPath();
      ctx.moveTo(channelW * c, y);
      ctx.lineTo(channelW * (c + 1), y);
      ctx.stroke();
    }
  }
}
