// =============================================================================
//  THE AVID -- ProTools Page (Audio-Focused Editing)
//  Layout: Left mixer | Center audio timeline | Right plugin rack + bridge
// =============================================================================

import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { AudioMixer } from '../components/AudioMixer/AudioMixer';
import { ProToolsBridge } from '../components/ProToolsBridge/ProToolsBridge';
import { useAudioStore } from '../store/audio.store';
import { useEditorStore } from '../store/editor.store';

// ─── Types ──────────────────────────────────────────────────────────────────

interface AudioPlugin {
  id: string;
  name: string;
  type: 'eq' | 'compressor' | 'reverb' | 'delay' | 'gate' | 'limiter' | 'deesser' | 'saturator';
  active: boolean;
  vendor: string;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const S = {
  root: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  } as React.CSSProperties,
  leftPanel: {
    width: 320,
    flexShrink: 0,
    borderRight: '1px solid var(--border-default)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  } as React.CSSProperties,
  centerPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    minWidth: 0,
  } as React.CSSProperties,
  rightPanel: {
    width: 280,
    flexShrink: 0,
    borderLeft: '1px solid var(--border-default)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  } as React.CSSProperties,
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
    flexShrink: 0,
  } as React.CSSProperties,
  panelTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-primary)',
  } as React.CSSProperties,
  // Audio Timeline
  timelineArea: {
    flex: 1,
    background: 'var(--bg-void)',
    overflow: 'hidden',
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column' as const,
  } as React.CSSProperties,
  timelineHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    borderBottom: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
    flexShrink: 0,
  } as React.CSSProperties,
  timelineRuler: {
    height: 24,
    background: 'var(--bg-raised)',
    borderBottom: '1px solid var(--border-subtle)',
    position: 'relative' as const,
    flexShrink: 0,
    overflow: 'hidden',
  } as React.CSSProperties,
  timelineTracks: {
    flex: 1,
    overflow: 'auto',
    position: 'relative' as const,
  } as React.CSSProperties,
  trackRow: (color: string, isSelected: boolean) => ({
    display: 'flex',
    alignItems: 'stretch',
    height: 64,
    borderBottom: '1px solid var(--border-subtle)',
    background: isSelected ? 'rgba(91, 106, 245, 0.06)' : 'transparent',
  }),
  trackLabel: (color: string) => ({
    width: 120,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    padding: '4px 8px',
    borderRight: '1px solid var(--border-subtle)',
    background: 'var(--bg-surface)',
  }),
  trackName: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  trackMeta: {
    fontSize: 8,
    color: 'var(--text-muted)',
    letterSpacing: '0.03em',
    marginTop: 2,
  } as React.CSSProperties,
  waveformArea: {
    flex: 1,
    position: 'relative' as const,
    overflow: 'hidden',
    minWidth: 0,
  } as React.CSSProperties,
  // VU Meter Bar
  meterBar: {
    height: 48,
    flexShrink: 0,
    borderTop: '1px solid var(--border-default)',
    background: 'var(--bg-raised)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    gap: 12,
  } as React.CSSProperties,
  vuMeter: {
    flex: 1,
    maxWidth: 600,
    height: 24,
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 3,
    position: 'relative' as const,
    overflow: 'hidden',
  } as React.CSSProperties,
  vuFill: (level: number, channel: 'L' | 'R') => {
    const clamped = Math.max(0, Math.min(1, level));
    const green = '#22c55e';
    const yellow = '#eab308';
    const red = '#ef4444';
    const color = clamped > 0.9 ? red : clamped > 0.7 ? yellow : green;
    return {
      position: 'absolute' as const,
      left: 0,
      top: channel === 'L' ? 0 : '50%',
      height: '50%',
      width: `${clamped * 100}%`,
      background: `linear-gradient(to right, ${green}, ${clamped > 0.7 ? yellow : green}, ${clamped > 0.9 ? red : clamped > 0.7 ? yellow : green})`,
      transition: 'width 60ms',
    };
  },
  // Plugin Rack
  pluginList: {
    flex: 1,
    overflow: 'auto',
    padding: 0,
  } as React.CSSProperties,
  pluginItem: (active: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-subtle)',
    opacity: active ? 1 : 0.5,
    cursor: 'pointer',
    transition: 'all 100ms',
  }),
  pluginToggle: (active: boolean) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: active ? 'var(--success)' : 'var(--text-muted)',
    flexShrink: 0,
    border: 'none',
    cursor: 'pointer',
  }),
  pluginName: {
    fontSize: 11,
    color: 'var(--text-primary)',
    fontWeight: 500,
    flex: 1,
  } as React.CSSProperties,
  pluginVendor: {
    fontSize: 9,
    color: 'var(--text-muted)',
    fontWeight: 400,
  } as React.CSSProperties,
  pluginType: {
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    padding: '1px 5px',
    borderRadius: 3,
    background: 'var(--bg-elevated)',
    color: 'var(--text-tertiary)',
    flexShrink: 0,
  } as React.CSSProperties,
  bridgeSection: {
    height: 280,
    flexShrink: 0,
    borderTop: '1px solid var(--border-default)',
    overflow: 'hidden',
  } as React.CSSProperties,
  rightTabBar: {
    display: 'flex',
    flexShrink: 0,
    borderBottom: '1px solid var(--border-default)',
  } as React.CSSProperties,
  rightTab: (active: boolean) => ({
    flex: 1,
    padding: '7px 6px',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    color: active ? 'var(--brand-bright)' : 'var(--text-muted)',
    border: 'none',
    background: active ? 'var(--bg-hover)' : 'transparent',
    borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'all 150ms',
  }),
};

// ─── Default Plugin Rack ────────────────────────────────────────────────────

const DEFAULT_PLUGINS: AudioPlugin[] = [
  { id: 'p1', name: 'Pro-Q 3', type: 'eq', active: true, vendor: 'FabFilter' },
  { id: 'p2', name: 'Pro-C 2', type: 'compressor', active: true, vendor: 'FabFilter' },
  { id: 'p3', name: 'Pro-DS', type: 'deesser', active: true, vendor: 'FabFilter' },
  { id: 'p4', name: 'R-Verb', type: 'reverb', active: false, vendor: 'Waves' },
  { id: 'p5', name: 'H-Delay', type: 'delay', active: false, vendor: 'Waves' },
  { id: 'p6', name: 'NS1', type: 'gate', active: true, vendor: 'Waves' },
  { id: 'p7', name: 'L2 Ultramaximizer', type: 'limiter', active: true, vendor: 'Waves' },
  { id: 'p8', name: 'Saturn 2', type: 'saturator', active: false, vendor: 'FabFilter' },
];

// ─── Audio Track Data ───────────────────────────────────────────────────────

interface AudioTrackDisplay {
  id: string;
  name: string;
  color: string;
  type: 'mono' | 'stereo';
  armed: boolean;
  input: string;
}

const AUDIO_TRACKS: AudioTrackDisplay[] = [
  { id: 'at1', name: 'Dialogue 1', color: '#4a90d9', type: 'mono', armed: false, input: 'Mic 1' },
  { id: 'at2', name: 'Dialogue 2', color: '#4a90d9', type: 'mono', armed: false, input: 'Mic 2' },
  { id: 'at3', name: 'Room Tone', color: '#5cbed6', type: 'stereo', armed: false, input: 'Stereo L/R' },
  { id: 'at4', name: 'SFX', color: '#d4a843', type: 'stereo', armed: false, input: 'Bus 1-2' },
  { id: 'at5', name: 'Foley', color: '#d4a843', type: 'mono', armed: false, input: 'Bus 3' },
  { id: 'at6', name: 'Music Bed', color: '#4dc95e', type: 'stereo', armed: false, input: 'Bus 5-6' },
  { id: 'at7', name: 'Music Sting', color: '#4dc95e', type: 'stereo', armed: false, input: 'Bus 7-8' },
  { id: 'at8', name: 'Ambience', color: '#8a6dcf', type: 'stereo', armed: false, input: 'Bus 9-10' },
  { id: 'at9', name: 'VO Narration', color: '#cf6d6d', type: 'mono', armed: true, input: 'Mic 3' },
  { id: 'at10', name: 'Master Bus', color: '#e0e0e0', type: 'stereo', armed: false, input: 'Mix' },
];

// ─── Waveform Canvas ────────────────────────────────────────────────────────

const WaveformCanvas = memo(function WaveformCanvas({ color, trackId }: { color: string; trackId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    canvas.width = w * window.devicePixelRatio;
    canvas.height = h * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, w, h);

    // Generate pseudo-random waveform based on trackId
    const seed = trackId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const rng = (i: number) => Math.sin(seed * 9301 + i * 49297) * 0.5 + 0.5;

    ctx.fillStyle = color + '40';
    ctx.strokeStyle = color + '80';
    ctx.lineWidth = 0.5;

    const mid = h / 2;
    for (let x = 0; x < w; x++) {
      const amplitude = rng(x) * 0.3 + rng(x + 1000) * 0.4 + rng(x * 3) * 0.3;
      const barH = amplitude * (h * 0.8);
      ctx.fillRect(x, mid - barH / 2, 1, barH);
    }

    // Center line
    ctx.strokeStyle = color + '30';
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();
  }, [color, trackId]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
      aria-label="Audio waveform"
      role="img"
    />
  );
});

// ─── Timeline Ruler ─────────────────────────────────────────────────────────

function TimelineRuler() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.offsetWidth;
    const h = 24;
    canvas.width = w * window.devicePixelRatio;
    canvas.height = h * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px monospace';

    for (let i = 0; i < w; i += 100) {
      const seconds = Math.floor(i / 100);
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      const tc = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}:00`;

      // Major tick
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(i, h - 8, 1, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillText(tc, i + 3, 10);

      // Minor ticks
      for (let j = 1; j < 4; j++) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(i + j * 25, h - 4, 1, 4);
      }
    }
  }, []);

  return (
    <div style={S.timelineRuler}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden="true" />
    </div>
  );
}

// ─── Plugin Rack ────────────────────────────────────────────────────────────

function PluginRack() {
  const [plugins, setPlugins] = useState(DEFAULT_PLUGINS);

  const togglePlugin = useCallback((id: string) => {
    setPlugins((prev) => prev.map((p) => p.id === id ? { ...p, active: !p.active } : p));
  }, []);

  return (
    <div style={S.pluginList} role="list" aria-label="Plugin rack">
      {plugins.map((plugin) => (
        <div
          key={plugin.id}
          style={S.pluginItem(plugin.active)}
          role="listitem"
          onClick={() => togglePlugin(plugin.id)}
        >
          <div
            style={S.pluginToggle(plugin.active)}
            role="switch"
            aria-checked={plugin.active}
            aria-label={`Toggle ${plugin.name}`}
          />
          <div style={{ flex: 1 }}>
            <div style={S.pluginName}>{plugin.name}</div>
            <div style={S.pluginVendor}>{plugin.vendor}</div>
          </div>
          <span style={S.pluginType}>{plugin.type}</span>
        </div>
      ))}
    </div>
  );
}

// ─── VU Meters ──────────────────────────────────────────────────────────────

const VUMeters = memo(function VUMeters() {
  const [levelL, setLevelL] = useState(0.65);
  const [levelR, setLevelR] = useState(0.60);

  useEffect(() => {
    const interval = setInterval(() => {
      setLevelL((prev) => Math.max(0.1, Math.min(0.95, prev + (Math.random() - 0.5) * 0.08)));
      setLevelR((prev) => Math.max(0.1, Math.min(0.95, prev + (Math.random() - 0.5) * 0.08)));
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={S.meterBar} role="status" aria-label="Audio output meters">
      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', width: 24 }}>
        OUT
      </span>
      <div style={S.vuMeter} role="meter" aria-valuenow={Math.round(levelL * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Left channel">
        <div style={S.vuFill(levelL, 'L')} />
        <div style={S.vuFill(levelR, 'R')} />
        {/* Scale marks */}
        {[0.25, 0.5, 0.75, 0.9].map((pos) => (
          <div key={pos} style={{
            position: 'absolute', left: `${pos * 100}%`, top: 0, bottom: 0,
            width: 1, background: 'rgba(255,255,255,0.08)', pointerEvents: 'none',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginBottom: 1 }}>L</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: levelL > 0.9 ? 'var(--error)' : 'var(--text-primary)', fontWeight: 600 }}>
            {(20 * Math.log10(levelL)).toFixed(1)}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginBottom: 1 }}>R</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: levelR > 0.9 ? 'var(--error)' : 'var(--text-primary)', fontWeight: 600 }}>
            {(20 * Math.log10(levelR)).toFixed(1)}
          </div>
        </div>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>LUFS</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--success)' }}>-14.2</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>/ -14.0</span>
      </div>
    </div>
  );
});

// ─── Loading Skeleton ───────────────────────────────────────────────────────

function ProToolsPageSkeleton() {
  return (
    <div style={S.root} aria-hidden="true">
      <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
        <div style={{ padding: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: 40, background: 'var(--bg-elevated)', borderRadius: 3, marginBottom: 4 }} />
          ))}
        </div>
      </div>
      <div style={{ flex: 1, background: 'var(--bg-void)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid var(--border-subtle)', borderTopColor: 'var(--brand)', animation: 'spin 0.8s linear infinite' }} />
      </div>
      <div style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--border-default)', background: 'var(--bg-surface)' }} />
    </div>
  );
}

// ─── Main ProTools Page ─────────────────────────────────────────────────────

export function ProToolsPage() {
  const [isReady, setIsReady] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>('at1');
  const [rightTab, setRightTab] = useState<'plugins' | 'bridge'>('plugins');
  const playheadTime = useEditorStore((s) => s.playheadTime);

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 150);
    return () => clearTimeout(timer);
  }, []);

  if (!isReady) {
    return <ProToolsPageSkeleton />;
  }

  return (
    <div style={S.root} role="region" aria-label="ProTools Page - Audio editing and mixing">
      {/* Left: Mixer Panel */}
      <div style={S.leftPanel}>
        <AudioMixer />
      </div>

      {/* Center: Audio Timeline */}
      <div style={S.centerPanel}>
        <div style={S.timelineHeader}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Audio Timeline
          </span>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
              48kHz / 24-bit
            </span>
            <span style={{ width: 1, height: 12, background: 'var(--border-subtle)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
              {AUDIO_TRACKS.length} tracks
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={{
              padding: '3px 8px', fontSize: 9, fontWeight: 600, border: '1px solid var(--border-default)',
              borderRadius: 3, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer',
            }} title="Zoom In" aria-label="Zoom in">+</button>
            <button style={{
              padding: '3px 8px', fontSize: 9, fontWeight: 600, border: '1px solid var(--border-default)',
              borderRadius: 3, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer',
            }} title="Zoom Out" aria-label="Zoom out">-</button>
            <button style={{
              padding: '3px 8px', fontSize: 9, fontWeight: 600, border: '1px solid var(--border-default)',
              borderRadius: 3, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer',
            }} title="Fit All" aria-label="Fit all tracks">FIT</button>
          </div>
        </div>

        <div style={S.timelineArea}>
          <TimelineRuler />

          {/* Playhead indicator */}
          <div style={{
            position: 'absolute',
            top: 24,
            bottom: 0,
            left: `${120 + (playheadTime || 0) * 100}px`,
            width: 1,
            background: 'var(--playhead, #ef4444)',
            zIndex: 10,
            pointerEvents: 'none',
          }}>
            <div style={{
              position: 'absolute', top: -2, left: -4,
              width: 0, height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: '6px solid var(--playhead, #ef4444)',
            }} />
          </div>

          <div style={S.timelineTracks}>
            {AUDIO_TRACKS.map((track) => (
              <div
                key={track.id}
                style={S.trackRow(track.color, selectedTrackId === track.id)}
                onClick={() => setSelectedTrackId(track.id)}
                role="button"
                aria-label={`Audio track: ${track.name}`}
                aria-pressed={selectedTrackId === track.id}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedTrackId(track.id); }}
              >
                <div style={S.trackLabel(track.color)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: track.color, flexShrink: 0 }} />
                    <span style={S.trackName}>{track.name}</span>
                  </div>
                  <div style={S.trackMeta}>
                    {track.type === 'stereo' ? 'ST' : 'M'} | {track.input}
                    {track.armed && (
                      <span style={{ color: '#ef4444', fontWeight: 700, marginLeft: 4 }}>REC</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                    <button
                      style={{
                        width: 16, height: 12, fontSize: 7, fontWeight: 700, border: 'none',
                        borderRadius: 2, cursor: 'pointer',
                        background: 'rgba(239,68,68,0.15)', color: '#ef4444',
                      }}
                      title="Mute"
                      aria-label={`Mute ${track.name}`}
                    >M</button>
                    <button
                      style={{
                        width: 16, height: 12, fontSize: 7, fontWeight: 700, border: 'none',
                        borderRadius: 2, cursor: 'pointer',
                        background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                      }}
                      title="Solo"
                      aria-label={`Solo ${track.name}`}
                    >S</button>
                    <button
                      style={{
                        width: 16, height: 12, fontSize: 7, fontWeight: 700, border: 'none',
                        borderRadius: 2, cursor: 'pointer',
                        background: track.armed ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.08)',
                        color: track.armed ? '#fff' : '#ef4444',
                      }}
                      title="Arm Record"
                      aria-label={`Record arm ${track.name}`}
                    >R</button>
                  </div>
                </div>

                <div style={S.waveformArea}>
                  <WaveformCanvas color={track.color} trackId={track.id} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* VU Meters */}
        <VUMeters />
      </div>

      {/* Right: Plugin Rack + Bridge */}
      <div style={S.rightPanel}>
        <div style={S.rightTabBar} role="tablist" aria-label="Right panel tabs">
          <button
            role="tab"
            aria-selected={rightTab === 'plugins'}
            style={S.rightTab(rightTab === 'plugins')}
            onClick={() => setRightTab('plugins')}
          >
            Plugins
          </button>
          <button
            role="tab"
            aria-selected={rightTab === 'bridge'}
            style={S.rightTab(rightTab === 'bridge')}
            onClick={() => setRightTab('bridge')}
          >
            PT Bridge
          </button>
        </div>

        {rightTab === 'plugins' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={S.panelHeader}>
              <span style={S.panelTitle}>Plugin Rack</span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                {DEFAULT_PLUGINS.filter((p) => p.active).length} active
              </span>
            </div>
            <PluginRack />
          </div>
        )}

        {rightTab === 'bridge' && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <ProToolsBridge />
          </div>
        )}
      </div>
    </div>
  );
}
