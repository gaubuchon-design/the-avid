// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Audio Mixer, EQ & Dynamics Panel
// ═══════════════════════════════════════════════════════════════════════════

import React, { useRef, useEffect, useCallback, memo } from 'react';
import { useAudioStore, AudioTrackState } from '../../store/audio.store';

// ─── Styles (inline, matching design-system conventions) ───────────────────

const S = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: 'var(--bg-surface)',
    overflow: 'hidden',
    minHeight: 0,
  },
  tabBar: {
    display: 'flex',
    flexShrink: 0,
    borderBottom: '1px solid var(--border-default)',
  },
  tab: (active: boolean) => ({
    flex: 1,
    padding: '7px 6px',
    fontSize: '10px',
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
  body: {
    flex: 1,
    overflow: 'auto',
    minHeight: 0,
  },
  // Mixer
  mixerGrid: {
    display: 'flex',
    gap: '2px',
    padding: '8px',
    height: '100%',
    minHeight: 360,
    alignItems: 'stretch',
  },
  strip: (isMaster: boolean) => ({
    width: isMaster ? 76 : 60,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
    padding: '6px 4px',
    background: isMaster ? 'var(--bg-raised)' : 'var(--bg-void)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)',
  }),
  stripLabel: (isMaster: boolean) => ({
    fontFamily: 'var(--font-mono)',
    fontSize: isMaster ? '9px' : '8.5px',
    fontWeight: 600,
    color: isMaster ? 'var(--brand-bright)' : 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    textAlign: 'center' as const,
    width: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  }),
  meter: {
    width: 10,
    flex: 1,
    minHeight: 80,
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 2,
    position: 'relative' as const,
    overflow: 'hidden',
  },
  meterFill: (level: number) => {
    // Green < 0.7, Yellow 0.7-0.9, Red > 0.9
    const clamped = Math.max(0, Math.min(1, level));
    let color = 'var(--success)';
    if (clamped > 0.9) color = 'var(--error)';
    else if (clamped > 0.7) color = 'var(--warning)';
    return {
      position: 'absolute' as const,
      bottom: 0,
      left: 0,
      right: 0,
      height: `${clamped * 100}%`,
      background: color,
      transition: 'height 60ms',
      borderRadius: 1,
    };
  },
  faderWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '2px',
    width: '100%',
  },
  faderInput: {
    writingMode: 'vertical-lr' as const,
    direction: 'rtl' as const,
    width: 26,
    height: 80,
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
    background: 'transparent',
    cursor: 'pointer',
  },
  panSlider: {
    width: '100%',
    height: 3,
    cursor: 'pointer',
  },
  dbReadout: {
    fontFamily: 'var(--font-mono)',
    fontSize: '9px',
    color: 'var(--text-tertiary)',
    textAlign: 'center' as const,
    width: '100%',
  },
  muteBtn: (active: boolean) => ({
    width: 20,
    height: 16,
    border: 'none',
    borderRadius: 2,
    fontSize: '8px',
    fontWeight: 700,
    cursor: 'pointer',
    background: active ? 'rgba(239,68,68,0.25)' : 'var(--bg-elevated)',
    color: active ? 'var(--error)' : 'var(--text-muted)',
    transition: 'all 100ms',
  }),
  soloBtn: (active: boolean) => ({
    width: 20,
    height: 16,
    border: 'none',
    borderRadius: 2,
    fontSize: '8px',
    fontWeight: 700,
    cursor: 'pointer',
    background: active ? 'rgba(34,197,94,0.25)' : 'var(--bg-elevated)',
    color: active ? 'var(--success)' : 'var(--text-muted)',
    transition: 'all 100ms',
  }),
  msBtnRow: {
    display: 'flex',
    gap: '3px',
  },
  // LUFS
  lufsSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '6px 8px',
    borderTop: '1px solid var(--border-subtle)',
    background: 'var(--bg-raised)',
    flexShrink: 0,
  },
  lufsLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '9px',
    color: 'var(--text-tertiary)',
  },
  lufsValue: (current: number, target: number) => ({
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    fontWeight: 600,
    color: Math.abs(current - target) < 2 ? 'var(--success)' : 'var(--warning)',
  }),
  // EQ
  eqCanvas: {
    width: '100%',
    height: 200,
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    display: 'block',
  },
  eqSection: {
    padding: '8px 12px',
  },
  eqRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '5px',
  },
  eqBandLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '9px',
    color: 'var(--text-tertiary)',
    minWidth: 50,
    textAlign: 'right' as const,
  },
  eqSlider: {
    flex: 1,
    height: 3,
    cursor: 'pointer',
  },
  eqValue: {
    fontFamily: 'var(--font-mono)',
    fontSize: '9px',
    color: 'var(--text-secondary)',
    minWidth: 38,
    textAlign: 'right' as const,
  },
  // Dynamics
  dynSection: {
    padding: '8px 12px',
  },
  dynCanvas: {
    width: 150,
    height: 150,
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    display: 'block',
    margin: '0 auto 10px',
  },
  dynRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '5px',
  },
  dynLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '9.5px',
    color: 'var(--text-tertiary)',
    minWidth: 55,
    textAlign: 'right' as const,
  },
  dynValue: {
    fontFamily: 'var(--font-mono)',
    fontSize: '9.5px',
    color: 'var(--text-secondary)',
    minWidth: 42,
    textAlign: 'right' as const,
  },
  dynSlider: {
    flex: 1,
    height: 3,
    cursor: 'pointer',
  },
  noTrack: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-muted)',
    fontSize: '11px',
    fontStyle: 'italic' as const,
    padding: 20,
    textAlign: 'center' as const,
  },
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '9.5px',
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    color: 'var(--text-tertiary)',
    marginBottom: '10px',
  },
  grMeter: {
    width: '100%',
    height: 8,
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 2,
    position: 'relative' as const,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 8,
  },
  grFill: (amount: number) => ({
    position: 'absolute' as const,
    top: 0,
    right: 0,
    bottom: 0,
    width: `${Math.min(100, Math.abs(amount) * 100 / 30)}%`,
    background: 'var(--warning)',
    borderRadius: 1,
  }),
} as const;

// ─── Utilities ─────────────────────────────────────────────────────────────

function gainToDb(gain: number): string {
  if (gain <= 0) return '-inf';
  const db = 20 * Math.log10(gain);
  return db.toFixed(1);
}

function formatHz(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)}k`;
  return `${Math.round(hz)}`;
}

// ─── VU Meter Component ────────────────────────────────────────────────────

const VUMeter = memo(function VUMeter({ level }: { level: number }) {
  return (
    <div style={S.meter} role="meter" aria-valuenow={Math.round(level * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Audio level">
      <div style={S.meterFill(level)} />
    </div>
  );
});

// ─── Channel Strip ─────────────────────────────────────────────────────────

interface ChannelStripProps {
  track: AudioTrackState;
  isMaster?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
}

const ChannelStrip = memo(function ChannelStrip({
  track,
  isMaster,
  isSelected,
  onSelect,
}: ChannelStripProps) {
  const { setGain, setPan, toggleMute, toggleSolo } = useAudioStore();

  // Simulate meter levels (demo: use gain * random)
  const simLevel = track.muted ? 0 : track.gain * (0.3 + Math.random() * 0.4);

  const panLabel = track.pan > 0 ? `R${Math.round(track.pan * 100)}` : track.pan < 0 ? `L${Math.round(Math.abs(track.pan) * 100)}` : 'C';

  return (
    <div
      style={{
        ...S.strip(!!isMaster),
        borderColor: isSelected ? 'var(--brand)' : 'var(--border-subtle)',
      }}
      onClick={onSelect}
      role="group"
      aria-label={`Channel strip: ${track.name}`}
    >
      <div style={S.stripLabel(!!isMaster)}>{track.name}</div>

      <VUMeter level={simLevel} />

      {/* Gain fader */}
      <div style={S.faderWrap}>
        <input
          type="range"
          min={0}
          max={200}
          value={Math.round(track.gain * 100)}
          onChange={(e) => setGain(track.id, +e.target.value / 100)}
          style={S.faderInput}
          title={`Gain: ${gainToDb(track.gain)} dB`}
          aria-label={`${track.name} gain`}
          aria-valuetext={`${gainToDb(track.gain)} dB`}
        />
        <div style={S.dbReadout} aria-hidden="true">{gainToDb(track.gain)} dB</div>
      </div>

      {/* Pan */}
      <input
        type="range"
        className="range-slider"
        min={-100}
        max={100}
        value={Math.round(track.pan * 100)}
        onChange={(e) => setPan(track.id, +e.target.value / 100)}
        style={S.panSlider}
        title={`Pan: ${panLabel}`}
        aria-label={`${track.name} pan`}
        aria-valuetext={panLabel}
      />

      {/* M / S buttons */}
      <div style={S.msBtnRow} role="group" aria-label="Mute and Solo">
        <button
          style={S.muteBtn(track.muted)}
          onClick={(e) => { e.stopPropagation(); toggleMute(track.id); }}
          title="Mute"
          aria-label={`Mute ${track.name}`}
          aria-pressed={track.muted}
        >
          M
        </button>
        <button
          style={S.soloBtn(track.solo)}
          onClick={(e) => { e.stopPropagation(); toggleSolo(track.id); }}
          title="Solo"
          aria-label={`Solo ${track.name}`}
          aria-pressed={track.solo}
        >
          S
        </button>
      </div>
    </div>
  );
});

// ─── Master Strip ──────────────────────────────────────────────────────────

const MasterStrip = memo(function MasterStrip() {
  const { masterGain, masterMuted, setMasterGain, toggleMasterMute, currentLUFS, lufsTarget } = useAudioStore();

  const masterTrack: AudioTrackState = {
    id: 'master',
    name: 'MASTER',
    gain: masterMuted ? 0 : masterGain,
    pan: 0,
    muted: masterMuted,
    solo: false,
    peakL: 0,
    peakR: 0,
    eq: [],
    compressor: { threshold: -24, ratio: 4, attack: 3, release: 250, knee: 10 },
  };

  const simLevel = masterMuted ? 0 : masterGain * (0.4 + Math.random() * 0.3);

  return (
    <div style={{ ...S.strip(true), borderColor: 'var(--brand-dim)' }} role="group" aria-label="Master channel strip">
      <div style={S.stripLabel(true)}>MASTER</div>

      <VUMeter level={simLevel} />

      <div style={S.faderWrap}>
        <input
          type="range"
          min={0}
          max={200}
          value={Math.round(masterGain * 100)}
          onChange={(e) => setMasterGain(+e.target.value / 100)}
          style={S.faderInput}
          title={`Master: ${gainToDb(masterGain)} dB`}
          aria-label="Master gain"
          aria-valuetext={`${gainToDb(masterGain)} dB`}
        />
        <div style={S.dbReadout} aria-hidden="true">{gainToDb(masterGain)} dB</div>
      </div>

      <button
        style={S.muteBtn(masterMuted)}
        onClick={toggleMasterMute}
        title="Mute Master"
        aria-label="Mute master"
        aria-pressed={masterMuted}
      >
        M
      </button>

      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '8px',
        color: Math.abs(currentLUFS - lufsTarget) < 2 ? 'var(--success)' : 'var(--warning)',
        textAlign: 'center',
        marginTop: 2,
      }} aria-hidden="true">
        LUFS
      </div>
    </div>
  );
});

// ─── Mixer Tab ─────────────────────────────────────────────────────────────

const MixerTab = memo(function MixerTab() {
  const { tracks, selectedTrackId, selectTrack, currentLUFS, lufsTarget } = useAudioStore();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} role="region" aria-label="Audio mixer">
      <div style={S.mixerGrid} role="group" aria-label="Channel strips">
        {tracks.map((t) => (
          <ChannelStrip
            key={t.id}
            track={t}
            isSelected={selectedTrackId === t.id}
            onSelect={() => selectTrack(t.id)}
          />
        ))}
        <div style={{ width: 1, background: 'var(--border-default)', alignSelf: 'stretch', flexShrink: 0, margin: '0 4px' }} role="separator" aria-orientation="vertical" />
        <MasterStrip />
      </div>
      <div style={S.lufsSection} role="status" aria-live="polite" aria-label="Loudness metering">
        <span style={S.lufsLabel}>LUFS:</span>
        <span style={S.lufsValue(currentLUFS, lufsTarget)}>
          {currentLUFS.toFixed(1)}
        </span>
        <span style={S.lufsLabel}>/</span>
        <span style={S.lufsLabel}>Target: {lufsTarget.toFixed(1)}</span>
      </div>
    </div>
  );
});

// ─── EQ Tab ────────────────────────────────────────────────────────────────

const EQ_BAND_LABELS = [
  'Low Shelf', '62 Hz', '125 Hz', '250 Hz', '500 Hz',
  '1 kHz', '2 kHz', '4 kHz', '8 kHz', 'High Shelf',
];

const EQCurveCanvas = memo(function EQCurveCanvas({ track }: { track: AudioTrackState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      const x = (i / 10) * w;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let i = 1; i < 5; i++) {
      const y = (i / 5) * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Center line
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Frequency response curve
    ctx.strokeStyle = '#4dd9b4';
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let px = 0; px < w; px++) {
      // Map pixel to log frequency 20Hz-20kHz
      const freqRatio = px / w;
      const freq = 20 * Math.pow(1000, freqRatio);

      let totalGain = 0;
      for (const band of track.eq) {
        // Simplified frequency response simulation
        const centerFreq = band.frequency;
        const Q = Math.max(0.1, band.Q);
        const bandGain = band.gain;
        const logDist = Math.log2(freq / centerFreq);
        const response = bandGain * Math.exp(-0.5 * logDist * logDist * Q * Q);
        totalGain += response;
      }

      // Map gain (-18..+18 dB) to canvas y
      const y = h / 2 - (totalGain / 18) * (h / 2);
      if (px === 0) ctx.moveTo(px, Math.max(0, Math.min(h, y)));
      else ctx.lineTo(px, Math.max(0, Math.min(h, y)));
    }
    ctx.stroke();

    // Band markers
    for (let i = 0; i < track.eq.length; i++) {
      const band = track.eq[i];
      const freqRatio = Math.log(band!.frequency! / 20) / Math.log(1000);
      const x = freqRatio * w;
      const y = h / 2 - (band!.gain! / 18) * (h / 2);
      ctx.fillStyle = band!.gain! !== 0 ? '#4dd9b4' : 'rgba(77,217,180,0.4)';
      ctx.beginPath();
      ctx.arc(Math.max(4, Math.min(w - 4, x)), Math.max(4, Math.min(h - 4, y)), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [track.eq]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obs = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      draw();
    });
    obs.observe(canvas);
    return () => obs.disconnect();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={S.eqCanvas}
      aria-label="EQ frequency response curve"
      role="img"
    />
  );
});

const EQTab = memo(function EQTab() {
  const { tracks, selectedTrackId, setEQBand } = useAudioStore();
  const track = tracks.find((t) => t.id === selectedTrackId);

  if (!track) {
    return <div style={S.noTrack}>Select a track in the Mixer to edit EQ</div>;
  }

  return (
    <div style={{ overflow: 'auto', padding: 0 }} role="region" aria-label={`EQ for ${track.name}`}>
      <div style={S.eqSection}>
        <div style={S.sectionTitle}>Parametric EQ -- {track.name}</div>
        <EQCurveCanvas track={track} />
      </div>
      <div style={{ ...S.eqSection, paddingTop: 0 }}>
        {track.eq.map((band, i) => (
          <div key={i} role="group" aria-label={`EQ band: ${EQ_BAND_LABELS[i]}`}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '8.5px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              letterSpacing: '0.5px',
              marginBottom: 3,
              marginTop: i > 0 ? 6 : 0,
            }}>
              {EQ_BAND_LABELS[i]}
            </div>
            {/* Frequency */}
            <div style={S.eqRow}>
              <span style={S.eqBandLabel}>Freq</span>
              <input
                type="range"
                className="range-slider"
                min={20}
                max={20000}
                step={1}
                value={band.frequency}
                onChange={(e) => setEQBand(track.id, i, { ...band, frequency: +e.target.value })}
                style={S.eqSlider}
                aria-label={`${EQ_BAND_LABELS[i]} frequency`}
                aria-valuetext={`${formatHz(band.frequency)} Hz`}
              />
              <span style={S.eqValue} aria-hidden="true">{formatHz(band.frequency)} Hz</span>
            </div>
            {/* Gain */}
            <div style={S.eqRow}>
              <span style={S.eqBandLabel}>Gain</span>
              <input
                type="range"
                className="range-slider"
                min={-18}
                max={18}
                step={0.5}
                value={band.gain}
                onChange={(e) => setEQBand(track.id, i, { ...band, gain: +e.target.value })}
                style={S.eqSlider}
                aria-label={`${EQ_BAND_LABELS[i]} gain`}
                aria-valuetext={`${band.gain > 0 ? '+' : ''}${band.gain.toFixed(1)} dB`}
              />
              <span style={S.eqValue} aria-hidden="true">{band.gain > 0 ? '+' : ''}{band.gain.toFixed(1)} dB</span>
            </div>
            {/* Q */}
            <div style={S.eqRow}>
              <span style={S.eqBandLabel}>Q</span>
              <input
                type="range"
                className="range-slider"
                min={0.1}
                max={10}
                step={0.1}
                value={band.Q}
                onChange={(e) => setEQBand(track.id, i, { ...band, Q: +e.target.value })}
                style={S.eqSlider}
                aria-label={`${EQ_BAND_LABELS[i]} Q factor`}
                aria-valuetext={band.Q.toFixed(1)}
              />
              <span style={S.eqValue} aria-hidden="true">{band.Q.toFixed(1)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

// ─── Dynamics Tab ──────────────────────────────────────────────────────────

interface TransferCurveCanvasProps {
  threshold: number;
  ratio: number;
  knee: number;
}

const TransferCurveCanvas = memo(function TransferCurveCanvas({
  threshold,
  ratio,
  knee,
}: TransferCurveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 150;
    canvas.width = size * window.devicePixelRatio;
    canvas.height = size * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.clearRect(0, 0, size, size);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const p = (i / 6) * size;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    }

    // 1:1 reference line
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, size);
    ctx.lineTo(size, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Transfer curve
    ctx.strokeStyle = '#4dd9b4';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const dbMin = -60;
    const dbMax = 0;

    for (let px = 0; px <= size; px++) {
      const inputDb = dbMin + (px / size) * (dbMax - dbMin);
      let outputDb: number;

      const halfKnee = knee / 2;
      if (inputDb < threshold - halfKnee) {
        outputDb = inputDb;
      } else if (inputDb > threshold + halfKnee) {
        outputDb = threshold + (inputDb - threshold) / ratio;
      } else {
        // Soft knee region
        const diff = inputDb - threshold + halfKnee;
        outputDb = inputDb + ((1 / ratio - 1) * diff * diff) / (2 * knee);
      }

      const y = size - ((outputDb - dbMin) / (dbMax - dbMin)) * size;
      if (px === 0) ctx.moveTo(px, Math.max(0, Math.min(size, y)));
      else ctx.lineTo(px, Math.max(0, Math.min(size, y)));
    }
    ctx.stroke();

    // Threshold marker
    const threshX = ((threshold - dbMin) / (dbMax - dbMin)) * size;
    ctx.strokeStyle = 'rgba(239,68,68,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(threshX, 0);
    ctx.lineTo(threshX, size);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [threshold, ratio, knee]);

  useEffect(() => {
    draw();
  }, [draw]);

  return <canvas ref={canvasRef} style={S.dynCanvas} aria-label="Compressor transfer curve" role="img" />;
});

const DynamicsTab = memo(function DynamicsTab() {
  const { tracks, selectedTrackId, setCompressorParam } = useAudioStore();
  const track = tracks.find((t) => t.id === selectedTrackId);

  if (!track) {
    return <div style={S.noTrack}>Select a track in the Mixer to edit dynamics</div>;
  }

  const c = track.compressor;

  // Simulated gain reduction (demo)
  const grAmount = Math.max(0, (-c.threshold) * (1 - 1 / c.ratio) * 0.3);

  const controls: {
    label: string;
    param: keyof typeof c;
    min: number;
    max: number;
    step: number;
    unit: string;
    value: number;
  }[] = [
    { label: 'Thresh', param: 'threshold', min: -60, max: 0, step: 0.5, unit: 'dB', value: c.threshold },
    { label: 'Ratio', param: 'ratio', min: 1, max: 20, step: 0.5, unit: ':1', value: c.ratio },
    { label: 'Attack', param: 'attack', min: 0.1, max: 100, step: 0.1, unit: 'ms', value: c.attack },
    { label: 'Release', param: 'release', min: 10, max: 1000, step: 1, unit: 'ms', value: c.release },
    { label: 'Knee', param: 'knee', min: 0, max: 30, step: 0.5, unit: 'dB', value: c.knee },
  ];

  return (
    <div style={{ overflow: 'auto' }} role="region" aria-label={`Dynamics for ${track.name}`}>
      {/* Compressor */}
      <div style={S.dynSection} role="group" aria-label="Compressor">
        <div style={S.sectionTitle}>Compressor -- {track.name}</div>
        <TransferCurveCanvas threshold={c.threshold} ratio={c.ratio} knee={c.knee} />

        {controls.map(({ label, param, min, max, step, unit, value }) => (
          <div key={param} style={S.dynRow}>
            <span style={S.dynLabel}>{label}</span>
            <input
              type="range"
              className="range-slider"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={(e) => setCompressorParam(track.id, param, +e.target.value)}
              style={S.dynSlider}
              aria-label={`Compressor ${label}`}
              aria-valuetext={`${value.toFixed(param === 'attack' ? 1 : param === 'release' ? 0 : 1)}${unit}`}
            />
            <span style={S.dynValue} aria-hidden="true">
              {value.toFixed(param === 'attack' ? 1 : param === 'release' ? 0 : 1)}{unit}
            </span>
          </div>
        ))}

        {/* Gain Reduction Meter */}
        <div style={{ marginTop: 10 }}>
          <div style={{ ...S.sectionTitle, marginBottom: 4 }}>Gain Reduction</div>
          <div style={S.grMeter} role="meter" aria-valuenow={Math.round(grAmount * 10) / 10} aria-valuemin={0} aria-valuemax={30} aria-label="Gain reduction">
            <div style={S.grFill(grAmount)} />
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            color: 'var(--text-tertiary)',
            textAlign: 'center',
          }} aria-hidden="true">
            -{grAmount.toFixed(1)} dB
          </div>
        </div>
      </div>

      {/* Gate (simplified) */}
      <div style={S.dynSection} role="group" aria-label="Noise Gate">
        <div style={S.sectionTitle}>Noise Gate</div>
        {[
          { label: 'Thresh', min: -80, max: 0, step: 0.5, unit: 'dB', defaultVal: -40 },
          { label: 'Range', min: -80, max: 0, step: 0.5, unit: 'dB', defaultVal: -80 },
          { label: 'Attack', min: 0.01, max: 50, step: 0.01, unit: 'ms', defaultVal: 0.5 },
          { label: 'Release', min: 5, max: 500, step: 1, unit: 'ms', defaultVal: 50 },
          { label: 'Hold', min: 0, max: 500, step: 1, unit: 'ms', defaultVal: 10 },
        ].map((ctrl) => (
          <div key={ctrl.label} style={S.dynRow}>
            <span style={S.dynLabel}>{ctrl.label}</span>
            <input
              type="range"
              className="range-slider"
              min={ctrl.min}
              max={ctrl.max}
              step={ctrl.step}
              defaultValue={ctrl.defaultVal}
              style={S.dynSlider}
              aria-label={`Gate ${ctrl.label}`}
              aria-valuetext={`${ctrl.defaultVal}${ctrl.unit}`}
            />
            <span style={S.dynValue} aria-hidden="true">{ctrl.defaultVal}{ctrl.unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

// ─── Main AudioMixer Component ─────────────────────────────────────────────

export function AudioMixer() {
  const { activeTab, setActiveTab, updateLUFS } = useAudioStore();

  // Simulate LUFS updates
  useEffect(() => {
    const interval = setInterval(() => {
      updateLUFS(-14 + (Math.random() * 2 - 1));
    }, 500);
    return () => clearInterval(interval);
  }, [updateLUFS]);

  const tabs: { key: 'mixer' | 'eq' | 'dynamics'; label: string }[] = [
    { key: 'mixer', label: 'Mixer' },
    { key: 'eq', label: 'EQ' },
    { key: 'dynamics', label: 'Dynamics' },
  ];

  return (
    <div style={S.root} role="region" aria-label="Audio Mixer">
      <div style={S.tabBar} role="tablist" aria-label="Mixer tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            style={S.tab(activeTab === t.key)}
            onClick={() => setActiveTab(t.key)}
            role="tab"
            aria-selected={activeTab === t.key}
            aria-controls={`mixer-panel-${t.key}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={S.body} role="tabpanel" id={`mixer-panel-${activeTab}`}>
        {activeTab === 'mixer' && <MixerTab />}
        {activeTab === 'eq' && <EQTab />}
        {activeTab === 'dynamics' && <DynamicsTab />}
      </div>
    </div>
  );
}
