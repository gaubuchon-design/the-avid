// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Beat Sync Panel
//  Beat detection, sync modes, and BPM visualization
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useCreatorStore } from '../../store/creator.store';
import type { BeatSyncMode, BeatMarker } from '@mcua/core';

// ─── Styles ───────────────────────────────────────────────────────────────

const S = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: 'var(--bg-surface)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    color: 'var(--text-secondary)',
  },
  body: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    minHeight: 0,
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  sectionLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    color: 'var(--text-tertiary)',
  },
  bpmDisplay: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '16px',
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
  },
  bpmValue: {
    fontFamily: 'var(--font-mono)',
    fontSize: '32px',
    fontWeight: 700,
    color: 'var(--brand-bright)',
    lineHeight: 1,
  },
  bpmLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
  },
  modeRow: {
    display: 'flex',
    gap: '4px',
  },
  modeBtn: (active: boolean) => ({
    flex: 1,
    padding: '8px 6px',
    fontSize: '10px',
    fontWeight: 600,
    background: active ? 'var(--brand-dim)' : 'var(--bg-elevated)',
    color: active ? 'var(--brand-bright)' : 'var(--text-muted)',
    border: `1px solid ${active ? 'var(--brand)' : 'var(--border-subtle)'}`,
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'all 150ms',
  }),
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  label: {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    color: 'var(--text-tertiary)',
    minWidth: 75,
  },
  slider: {
    flex: 1,
    height: 3,
    cursor: 'pointer',
  },
  value: {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    color: 'var(--text-secondary)',
    minWidth: 35,
    textAlign: 'right' as const,
  },
  beatViz: {
    width: '100%',
    height: 60,
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    display: 'block',
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
  },
  statLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '9.5px',
    color: 'var(--text-tertiary)',
  },
  statValue: {
    fontFamily: 'var(--font-mono)',
    fontSize: '9.5px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  actionBtn: {
    padding: '8px 12px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    background: 'var(--brand)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'opacity 150ms',
    width: '100%',
  },
  secondaryBtn: {
    padding: '6px 12px',
    fontSize: '10px',
    fontWeight: 600,
    background: 'var(--bg-elevated)',
    color: 'var(--text-muted)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all 150ms',
    width: '100%',
  },
  input: {
    width: 50,
    padding: '4px 6px',
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    textAlign: 'center' as const,
    outline: 'none',
  },
  footer: {
    padding: '8px 12px',
    borderTop: '1px solid var(--border-default)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    flexShrink: 0,
  },
};

// ─── Beat Visualization ───────────────────────────────────────────────────

function BeatVisualization({ beats }: { beats: BeatMarker[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || beats.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);

    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    ctx.clearRect(0, 0, w, h);

    // Draw center line
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    if (beats.length === 0) return;

    const maxTime = beats[beats.length - 1].time;
    if (maxTime === 0) return;

    // Draw beats as vertical bars
    for (const beat of beats) {
      const x = (beat.time / maxTime) * w;
      const barHeight = beat.strength * h * 0.8;

      ctx.fillStyle = beat.type === 'downbeat'
        ? 'rgba(99,102,241,0.8)'
        : beat.type === 'beat'
        ? 'rgba(99,102,241,0.4)'
        : 'rgba(99,102,241,0.2)';

      ctx.fillRect(x - 1, (h - barHeight) / 2, 2, barHeight);
    }
  }, [beats]);

  return (
    <canvas
      ref={canvasRef}
      style={S.beatViz}
    />
  );
}

// ─── Mode Descriptions ────────────────────────────────────────────────────

const MODE_INFO: Record<BeatSyncMode, { label: string; description: string }> = {
  auto_cut: {
    label: 'Auto Cut',
    description: 'Automatically cut between source clips at beat positions',
  },
  markers: {
    label: 'Markers',
    description: 'Add timeline markers at detected beat positions',
  },
  speed_ramp: {
    label: 'Speed Ramp',
    description: 'Create speed variations aligned to musical beats',
  },
};

// ─── Main Component ───────────────────────────────────────────────────────

export function BeatSyncPanel() {
  const {
    beatSyncConfig,
    setBeatSyncConfig,
    beatSyncResult,
    setBeatSyncResult,
    detectedBeats,
    setDetectedBeats,
    beatSyncProcessing,
    setBeatSyncProcessing,
  } = useCreatorStore();

  const [manualBPM, setManualBPM] = useState('120');

  const handleDetectBeats = useCallback(() => {
    setBeatSyncProcessing(true);

    // Simulate beat detection
    setTimeout(() => {
      const bpm = parseInt(manualBPM, 10) || 120;
      const beatInterval = 60 / bpm;
      const duration = 60; // seconds
      const beats: BeatMarker[] = [];
      let count = 0;

      for (let time = 0; time < duration; time += beatInterval) {
        const isDownbeat = count % 4 === 0;
        beats.push({
          time,
          strength: isDownbeat ? 0.9 + Math.random() * 0.1 : 0.5 + Math.random() * 0.3,
          type: isDownbeat ? 'downbeat' : count % 2 === 0 ? 'beat' : 'offbeat',
        });
        count++;
      }

      setDetectedBeats(beats);
      setBeatSyncProcessing(false);
    }, 600);
  }, [manualBPM, setDetectedBeats, setBeatSyncProcessing]);

  const handleSync = useCallback(() => {
    if (detectedBeats.length === 0) return;

    setBeatSyncProcessing(true);
    setTimeout(() => {
      const bpm = parseInt(manualBPM, 10) || 120;
      setBeatSyncResult({
        id: `sync-${Date.now()}`,
        config: { ...beatSyncConfig },
        detectedBPM: bpm,
        beats: detectedBeats,
        cuts: beatSyncConfig.mode === 'auto_cut'
          ? detectedBeats
              .filter((b) => b.strength >= beatSyncConfig.beatThreshold)
              .filter((_, i) => i % beatSyncConfig.everyNBeats === 0)
              .map((b, i) => ({
                time: b.time,
                clipId: beatSyncConfig.sourceClipIds[i % Math.max(1, beatSyncConfig.sourceClipIds.length)] ?? 'clip-1',
              }))
          : [],
        markers: beatSyncConfig.mode === 'markers'
          ? detectedBeats
              .filter((b) => b.strength >= beatSyncConfig.beatThreshold)
              .map((b, i) => ({
                time: b.time,
                label: b.type === 'downbeat' ? `Beat ${i + 1} (Downbeat)` : `Beat ${i + 1}`,
              }))
          : [],
        speedKeyframes: beatSyncConfig.mode === 'speed_ramp'
          ? detectedBeats
              .filter((b) => b.type === 'downbeat' && b.strength >= beatSyncConfig.beatThreshold)
              .flatMap((b) => [
                { time: b.time, speed: 1 + (beatSyncConfig.speedRampIntensity ?? 0.5) * 0.8 },
                { time: b.time + 0.15, speed: 1.0 },
              ])
          : undefined,
        status: 'completed',
      });
      setBeatSyncProcessing(false);
    }, 500);
  }, [detectedBeats, beatSyncConfig, manualBPM, setBeatSyncResult, setBeatSyncProcessing]);

  const currentBPM = parseInt(manualBPM, 10) || 0;

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.title}>Beat Sync</span>
      </div>

      {/* Body */}
      <div style={S.body}>
        {/* BPM Display */}
        <div style={S.bpmDisplay}>
          <div style={{ textAlign: 'center' }}>
            <div style={S.bpmValue}>{currentBPM || '--'}</div>
            <div style={S.bpmLabel}>BPM</div>
          </div>
        </div>

        {/* BPM Input */}
        <div style={S.section}>
          <span style={S.sectionLabel}>Tempo</span>
          <div style={S.row}>
            <span style={S.label}>Manual BPM</span>
            <input
              style={S.input}
              type="number"
              min={40}
              max={240}
              value={manualBPM}
              onChange={(e) => setManualBPM(e.target.value)}
            />
            <button
              style={{ ...S.secondaryBtn, width: 'auto', padding: '4px 10px', fontSize: '9px' }}
              onClick={handleDetectBeats}
              disabled={beatSyncProcessing}
            >
              {beatSyncProcessing ? 'Analyzing...' : 'Detect'}
            </button>
          </div>
        </div>

        {/* Beat Visualization */}
        {detectedBeats.length > 0 && (
          <div style={S.section}>
            <span style={S.sectionLabel}>Beat Grid</span>
            <BeatVisualization beats={detectedBeats} />
            <div style={S.statRow}>
              <span style={S.statLabel}>Beats detected</span>
              <span style={S.statValue}>{detectedBeats.length}</span>
            </div>
            <div style={S.statRow}>
              <span style={S.statLabel}>Downbeats</span>
              <span style={S.statValue}>{detectedBeats.filter((b) => b.type === 'downbeat').length}</span>
            </div>
          </div>
        )}

        {/* Sync Mode */}
        <div style={S.section}>
          <span style={S.sectionLabel}>Sync Mode</span>
          <div style={S.modeRow}>
            {(['auto_cut', 'markers', 'speed_ramp'] as BeatSyncMode[]).map((mode) => (
              <button
                key={mode}
                style={S.modeBtn(beatSyncConfig.mode === mode)}
                onClick={() => setBeatSyncConfig({ mode })}
              >
                {MODE_INFO[mode].label}
              </button>
            ))}
          </div>
          <div style={{
            fontSize: '9.5px',
            color: 'var(--text-muted)',
            fontStyle: 'italic',
            padding: '2px 0',
          }}>
            {MODE_INFO[beatSyncConfig.mode].description}
          </div>
        </div>

        {/* Threshold */}
        <div style={S.section}>
          <span style={S.sectionLabel}>Parameters</span>
          <div style={S.row}>
            <span style={S.label}>Threshold</span>
            <input
              type="range"
              className="range-slider"
              min={0}
              max={100}
              value={beatSyncConfig.beatThreshold * 100}
              onChange={(e) => setBeatSyncConfig({ beatThreshold: +e.target.value / 100 })}
              style={S.slider}
            />
            <span style={S.value}>{Math.round(beatSyncConfig.beatThreshold * 100)}%</span>
          </div>

          {/* Auto-cut specific */}
          {beatSyncConfig.mode === 'auto_cut' && (
            <div style={S.row}>
              <span style={S.label}>Every N beats</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 4, 8].map((n) => (
                  <button
                    key={n}
                    style={S.modeBtn(beatSyncConfig.everyNBeats === n)}
                    onClick={() => setBeatSyncConfig({ everyNBeats: n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Speed ramp specific */}
          {beatSyncConfig.mode === 'speed_ramp' && (
            <div style={S.row}>
              <span style={S.label}>Intensity</span>
              <input
                type="range"
                className="range-slider"
                min={0}
                max={100}
                value={(beatSyncConfig.speedRampIntensity ?? 0.5) * 100}
                onChange={(e) => setBeatSyncConfig({ speedRampIntensity: +e.target.value / 100 })}
                style={S.slider}
              />
              <span style={S.value}>{Math.round((beatSyncConfig.speedRampIntensity ?? 0.5) * 100)}%</span>
            </div>
          )}
        </div>

        {/* Result Stats */}
        {beatSyncResult && beatSyncResult.status === 'completed' && (
          <div style={S.section}>
            <span style={S.sectionLabel}>Result</span>
            {beatSyncResult.cuts.length > 0 && (
              <div style={S.statRow}>
                <span style={S.statLabel}>Cut points</span>
                <span style={S.statValue}>{beatSyncResult.cuts.length}</span>
              </div>
            )}
            {beatSyncResult.markers.length > 0 && (
              <div style={S.statRow}>
                <span style={S.statLabel}>Markers created</span>
                <span style={S.statValue}>{beatSyncResult.markers.length}</span>
              </div>
            )}
            {beatSyncResult.speedKeyframes && (
              <div style={S.statRow}>
                <span style={S.statLabel}>Speed keyframes</span>
                <span style={S.statValue}>{beatSyncResult.speedKeyframes.length}</span>
              </div>
            )}
            <div style={S.statRow}>
              <span style={S.statLabel}>Detected BPM</span>
              <span style={S.statValue}>{beatSyncResult.detectedBPM}</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={S.footer}>
        <button
          style={S.actionBtn}
          onClick={handleSync}
          disabled={detectedBeats.length === 0 || beatSyncProcessing}
        >
          {beatSyncProcessing ? 'Processing...' : 'Apply Beat Sync'}
        </button>
      </div>
    </div>
  );
}
