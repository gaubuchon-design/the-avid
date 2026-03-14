import React, { useState, useEffect, useCallback } from 'react';
import { useEditorStore } from '../../store/editor.store';
import { useEffectsStore } from '../../store/effects.store';
import { Timecode } from '../../lib/timecode';
import { audioEngine } from '../../engine/AudioEngine';
import { effectsEngine } from '../../engine/EffectsEngine';
import {
  BIN_COLOR_PRESETS,
  TRACK_COLOR_PRESETS,
} from '../../store/editor.store';
import type { Bin, Clip, MediaAsset, Track } from '../../store/editor.store';

function formatTC(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60),
        s = Math.floor(sec % 60), f = Math.floor((sec % 1) * 24);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(f).padStart(2,'0')}`;
}

/** Hook to resolve the inspected or selected clip from the store.
 *  Priority: inspectedClipId (set by match-frame / auto-playhead) > selectedClipIds[0].
 */
function useSelectedClip(): Clip | null {
  const { tracks, selectedClipIds, inspectedClipId } = useEditorStore();
  const targetId = inspectedClipId ?? selectedClipIds[0] ?? null;
  if (!targetId) return null;
  return tracks.flatMap(t => t.clips).find(c => c.id === targetId) ?? null;
}

function findTrackForClip(tracks: Track[], clipId: string | null): Track | null {
  if (!clipId) return null;
  return tracks.find((track) => track.clips.some((clip) => clip.id === clipId)) ?? null;
}

function findBinById(bins: Bin[], binId: string | null): Bin | null {
  if (!binId) return null;
  for (const bin of bins) {
    if (bin.id === binId) {
      return bin;
    }
    const nested = findBinById(bin.children, binId);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function findAssetById(bins: Bin[], assetId: string | undefined): MediaAsset | null {
  if (!assetId) {
    return null;
  }
  for (const bin of bins) {
    const asset = bin.assets.find((candidate) => candidate.id === assetId);
    if (asset) {
      return asset;
    }
    const nested = findAssetById(bin.children, assetId);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function countBinAssets(bin: Bin): number {
  return bin.assets.length + bin.children.reduce((count, child) => count + countBinAssets(child), 0);
}

function getInspectorDomain(track: Track | null, clip: Clip | null): 'audio' | 'video' | 'bin' | 'none' {
  if (clip) {
    return clip.type === 'audio' ? 'audio' : 'video';
  }

  if (!track) {
    return 'none';
  }

  return track.type === 'AUDIO' ? 'audio' : 'video';
}

/* ─── Shared widgets ─────────────────────────────────────────────────────── */

function Slider({ label, value, unit = '', min = 0, max = 100, step, onChange }: {
  label: string; value: number; unit?: string; min?: number; max?: number; step?: number; onChange: (v: number) => void;
}) {
  return (
    <div className="property-row">
      <div className="property-label">{label}</div>
      <div className="property-value">
        <input type="number" className="property-input" value={value} style={{ width: 56 }}
          step={step}
          onChange={e => onChange(+e.target.value || 0)} />
        {unit && <span className="property-unit">{unit}</span>}
        <input type="range" className="range-slider" min={min} max={max} value={value}
          step={step}
          onChange={e => onChange(+e.target.value)} style={{ flex: 1 }} />
      </div>
    </div>
  );
}

function NumberInput({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="property-row">
      <div className="property-label">{label}</div>
      <div className="property-value">
        <input type="number" className="property-input" value={value} style={{ width: 64 }}
          onChange={e => onChange(+e.target.value || 0)} step={0.01} />
      </div>
    </div>
  );
}

function ToggleSwitch({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <div
      className={`effect-toggle${enabled ? ' on' : ''}`}
      onClick={onToggle}
      role="switch"
      aria-checked={enabled}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
    />
  );
}

function CollapsibleSection({ title, children, defaultOpen = false }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="inspector-section">
      <div className="inspector-section-title" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        onClick={() => setOpen(!open)}>
        <span style={{ fontSize: 10 }}>{open ? '▾' : '▸'}</span>
        {title}
      </div>
      {open && children}
    </div>
  );
}

/* ─── Tab: Video (reads/writes intrinsic video props from store) ─────────── */

function VideoTab() {
  const clip = useSelectedClip();
  const { updateIntrinsicVideo, resetIntrinsicVideo } = useEditorStore();

  if (!clip) return (
    <EmptyInspectorState message="Select a video clip to inspect." />
  );

  const v = clip.intrinsicVideo;
  const update = (patch: Partial<typeof v>) => updateIntrinsicVideo(clip.id, patch);

  return (
    <div className="tab-content">
      {/* Intrinsic: Motion (fixed effect - always present) */}
      <div className="inspector-section">
        <div className="inspector-section-title" style={{ display: 'flex', alignItems: 'center' }}>
          Motion
          <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--accent-blue)', cursor: 'pointer' }}
            onClick={() => resetIntrinsicVideo(clip.id)}>Reset</span>
        </div>
        <Slider label="Pos X" value={v.positionX} unit="px" min={-2000} max={2000} onChange={val => update({ positionX: val })} />
        <Slider label="Pos Y" value={v.positionY} unit="px" min={-2000} max={2000} onChange={val => update({ positionY: val })} />
        <Slider label="Scale X" value={v.scaleX} unit="%" min={0} max={400} onChange={val => update({ scaleX: val })} />
        <Slider label="Scale Y" value={v.scaleY} unit="%" min={0} max={400} onChange={val => update({ scaleY: val })} />
        <Slider label="Rotation" value={v.rotation} unit="deg" min={-360} max={360} step={0.1} onChange={val => update({ rotation: val })} />
        <Slider label="Anchor X" value={v.anchorX} unit="px" min={-2000} max={2000} onChange={val => update({ anchorX: val })} />
        <Slider label="Anchor Y" value={v.anchorY} unit="px" min={-2000} max={2000} onChange={val => update({ anchorY: val })} />
      </div>

      {/* Intrinsic: Opacity (fixed effect - always present) */}
      <div className="inspector-section">
        <div className="inspector-section-title">Opacity</div>
        <Slider label="Opacity" value={v.opacity} unit="%" min={0} max={100} onChange={val => update({ opacity: val })} />
      </div>

      {/* Intrinsic: Time Remapping */}
      <TimeRemapSection clip={clip} />
    </div>
  );
}

/* ─── Applied Effect Row (reads from effects store) ────────────────────── */

function AppliedEffectRow({ clipId, effectId, name, enabled, params, paramDefs }: {
  clipId: string; effectId: string; name: string; enabled: boolean;
  params: Record<string, any>; paramDefs: Array<{ name: string; type: string; min?: number; max?: number; step?: number; unit?: string; options?: string[] }>;
}) {
  const [open, setOpen] = useState(false);
  const { toggleEffect, updateParam, removeEffect } = useEffectsStore();

  return (
    <div className="effect-item">
      <div className="effect-header" onClick={() => setOpen(!open)}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{open ? '▾' : '▸'}</span>
        <span className="effect-name">{name}</span>
        <ToggleSwitch enabled={enabled} onToggle={() => toggleEffect(clipId, effectId)} />
        <button className="fx-keyframe-btn" title="Remove Effect"
          style={{ marginLeft: 4, fontSize: 9 }}
          onClick={e => { e.stopPropagation(); removeEffect(clipId, effectId); }}>x</button>
      </div>
      {open && (
        <div className="effect-body">
          {paramDefs.map(pd => {
            if (pd.type === 'number') {
              return (
                <Slider key={pd.name} label={pd.name} value={params[pd.name] ?? 0}
                  unit={pd.unit ?? ''} min={pd.min ?? 0} max={pd.max ?? 100} step={pd.step}
                  onChange={v => updateParam(clipId, effectId, pd.name, v)} />
              );
            }
            if (pd.type === 'boolean') {
              return (
                <div key={pd.name} className="property-row">
                  <div className="property-label">{pd.name}</div>
                  <ToggleSwitch enabled={!!params[pd.name]}
                    onToggle={() => updateParam(clipId, effectId, pd.name, !params[pd.name])} />
                </div>
              );
            }
            if (pd.type === 'color') {
              return (
                <div key={pd.name} className="property-row">
                  <div className="property-label">{pd.name}</div>
                  <input type="color" value={params[pd.name] ?? '#000000'}
                    onChange={e => updateParam(clipId, effectId, pd.name, e.target.value)}
                    style={{ width: 24, height: 18, border: 'none', cursor: 'pointer' }} />
                </div>
              );
            }
            if (pd.type === 'select' && pd.options) {
              return (
                <div key={pd.name} className="property-row">
                  <div className="property-label">{pd.name}</div>
                  <select className="property-input" style={{ width: 80, fontSize: 10 }}
                    value={params[pd.name]} onChange={e => updateParam(clipId, effectId, pd.name, e.target.value)}>
                    {pd.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Effect Browser Button ──────────────────────────────────────────────── */

function EffectBrowserButton({ clipId }: { clipId: string }) {
  const [showBrowser, setShowBrowser] = useState(false);
  const { addEffect } = useEffectsStore();
  const definitions = effectsEngine.getDefinitions();
  const categories = effectsEngine.getCategories();
  const [searchQ, setSearchQ] = useState('');
  const [catFilter, setCatFilter] = useState<string | null>(null);

  const filtered = definitions.filter(d => {
    if (catFilter && d.category !== catFilter) return false;
    if (searchQ && !d.name.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });

  if (!showBrowser) {
    return (
      <button className="btn btn-ghost" style={{ width: '100%', marginTop: 6, fontSize: 11 }}
        onClick={() => setShowBrowser(true)}>+ Add Effect</button>
    );
  }

  return (
    <div style={{ border: '1px solid var(--border-default)', borderRadius: 4, padding: 6, marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        <input type="text" placeholder="Search effects..." value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          className="property-input" style={{ flex: 1, fontSize: 10 }} />
        <button className="fx-keyframe-btn" onClick={() => setShowBrowser(false)}
          style={{ fontSize: 9 }}>x</button>
      </div>
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginBottom: 6 }}>
        <button className={`fx-keyframe-btn${!catFilter ? ' active' : ''}`}
          style={{ fontSize: 8 }} onClick={() => setCatFilter(null)}>All</button>
        {categories.map(cat => (
          <button key={cat} className={`fx-keyframe-btn${catFilter === cat ? ' active' : ''}`}
            style={{ fontSize: 8 }} onClick={() => setCatFilter(cat)}>{cat}</button>
        ))}
      </div>
      <div style={{ maxHeight: 150, overflowY: 'auto' }}>
        {filtered.map(def => (
          <div key={def.id} style={{ display: 'flex', alignItems: 'center', padding: '3px 0', cursor: 'pointer', fontSize: 10 }}
            onClick={() => { addEffect(clipId, def.id); setShowBrowser(false); }}>
            <span style={{ color: 'var(--text-muted)', marginRight: 6, fontSize: 8 }}>{def.category}</span>
            <span style={{ color: 'var(--text-primary)' }}>{def.name}</span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: 6 }}>No effects found</div>
        )}
      </div>
    </div>
  );
}

/* ─── Time Remapping Section ─────────────────────────────────────────────── */

function TimeRemapSection({ clip }: { clip: Clip }) {
  const { updateTimeRemap, addTimeRemapKeyframe, removeTimeRemapKeyframe, playheadTime } = useEditorStore();
  const tr = clip.timeRemap;

  const toggleEnabled = useCallback(() => {
    const newEnabled = !tr.enabled;
    updateTimeRemap(clip.id, { enabled: newEnabled });
    // When enabling, add default keyframes at clip start/end
    if (newEnabled && tr.keyframes.length === 0) {
      const duration = clip.endTime - clip.startTime;
      addTimeRemapKeyframe(clip.id, {
        timelineTime: 0, sourceTime: 0, interpolation: 'linear',
      });
      addTimeRemapKeyframe(clip.id, {
        timelineTime: duration, sourceTime: duration, interpolation: 'linear',
      });
    }
  }, [tr, clip, updateTimeRemap, addTimeRemapKeyframe]);

  // Calculate current speed at playhead
  const clipRelTime = Math.max(0, Math.min(playheadTime - clip.startTime, clip.endTime - clip.startTime));
  let currentSpeed = 100;
  if (tr.enabled && tr.keyframes.length >= 2) {
    // Find surrounding keyframes and compute slope
    const kfs = tr.keyframes;
    for (let i = 0; i < kfs.length - 1; i++) {
      if (clipRelTime >= kfs[i]!.timelineTime && clipRelTime <= kfs[i + 1]!.timelineTime) {
        const dt = kfs[i + 1]!.timelineTime - kfs[i]!.timelineTime;
        const ds = kfs[i + 1]!.sourceTime - kfs[i]!.sourceTime;
        currentSpeed = dt > 0 ? (ds / dt) * 100 : 100;
        break;
      }
    }
  }

  return (
    <CollapsibleSection title="Time Remapping">
      <div className="property-row">
        <div className="property-label">Enabled</div>
        <ToggleSwitch enabled={tr.enabled} onToggle={toggleEnabled} />
      </div>
      {tr.enabled && (
        <>
          <div className="property-row">
            <div className="property-label">Speed</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-primary)' }}>
              {currentSpeed.toFixed(1)}%
            </div>
          </div>
          <div className="property-row">
            <div className="property-label">Keyframes</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-primary)' }}>
              {tr.keyframes.length}
            </div>
          </div>
          <div className="property-row">
            <div className="property-label">Frame Blend</div>
            <select className="property-input" style={{ width: 100, fontSize: 10 }}
              value={tr.frameBlending}
              onChange={e => updateTimeRemap(clip.id, { frameBlending: e.target.value as any })}>
              <option value="none">None</option>
              <option value="frame-mix">Frame Mix</option>
              <option value="optical-flow">Optical Flow</option>
            </select>
          </div>
          <div className="property-row">
            <div className="property-label">Pitch Correct</div>
            <ToggleSwitch enabled={tr.pitchCorrection}
              onToggle={() => updateTimeRemap(clip.id, { pitchCorrection: !tr.pitchCorrection })} />
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            <button className="btn btn-ghost" style={{ flex: 1, fontSize: 10 }}
              onClick={() => addTimeRemapKeyframe(clip.id, {
                timelineTime: clipRelTime,
                sourceTime: clipRelTime, // Default 1:1 mapping
                interpolation: 'linear',
              })}>+ Keyframe</button>
          </div>
          {/* Keyframe list */}
          <div style={{ maxHeight: 100, overflowY: 'auto', marginTop: 4 }}>
            {tr.keyframes.map((kf, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0', fontSize: 9 }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', width: 50 }}>
                  TL:{kf.timelineTime.toFixed(2)}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', width: 50 }}>
                  Src:{kf.sourceTime.toFixed(2)}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>{kf.interpolation}</span>
                <button className="fx-keyframe-btn" style={{ marginLeft: 'auto', fontSize: 8 }}
                  onClick={() => removeTimeRemapKeyframe(clip.id, kf.timelineTime)}>x</button>
              </div>
            ))}
          </div>
        </>
      )}
    </CollapsibleSection>
  );
}

/* ─── Tab: Audio (reads/writes intrinsic audio props from store) ─────────── */

function AudioTab() {
  const clip = useSelectedClip();
  const { updateIntrinsicAudio, resetIntrinsicAudio } = useEditorStore();

  if (!clip) return (
    <EmptyInspectorState message="Select an audio clip to inspect." />
  );

  const a = clip.intrinsicAudio;
  const updateA = (patch: Partial<typeof a>) => updateIntrinsicAudio(clip.id, patch);

  return (
    <div className="tab-content">
      {/* Intrinsic: Volume & Pan (fixed effects - always present) */}
      <div className="inspector-section">
        <div className="inspector-section-title" style={{ display: 'flex', alignItems: 'center' }}>
          Audio
          <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--accent-blue)', cursor: 'pointer' }}
            onClick={() => resetIntrinsicAudio(clip.id)}>Reset</span>
        </div>
        <Slider label="Volume" value={a.volume + 60} unit="dB" min={0} max={72}
          onChange={v => updateA({ volume: v - 60 })} />
        <Slider label="Pan" value={a.pan + 100} unit="" min={0} max={200}
          onChange={v => updateA({ pan: v - 100 })} />
      </div>
    </div>
  );
}

function AudioEffectsTab({ clip, track }: { clip: Clip | null; track: Track | null }) {
  const trackId = track?.id ?? 'master';
  const [gain, setGain] = useState(0);
  const [pan, setPan] = useState(0);
  const [slope, setSlope] = useState(50);
  const [attack, setAttack] = useState(30);
  const [release, setRelease] = useState(50);
  const [inputGain, setInputGain] = useState(0);
  const [compression, setCompression] = useState(40);
  const [outputGain, setOutputGain] = useState(0);
  const [sp76Subject, setSp76Subject] = useState(50);
  const [sp76Mixes, setSp76Mixes] = useState(50);
  const [sp76Release, setSp76Release] = useState(50);
  const [dynEnabled, setDynEnabled] = useState(false);
  const [dynDepth, setDynDepth] = useState(0);
  const [meterLevel, setMeterLevel] = useState({ peak: 0, rms: 0 });

  useEffect(() => {
    audioEngine.init();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setMeterLevel(audioEngine.getMeterLevel(trackId));
    }, 50);
    return () => clearInterval(interval);
  }, [trackId]);

  const handleGainChange = useCallback((dB: number) => {
    setGain(dB);
    const linear = dB <= -60 ? 0 : Math.pow(10, dB / 20);
    audioEngine.setTrackGain(trackId, Math.min(2, linear));
  }, [trackId]);

  const handlePanChange = useCallback((panVal: number) => {
    setPan(panVal);
    audioEngine.setTrackPan(trackId, panVal / 50);
  }, [trackId]);

  const handleCompressorUpdate = useCallback((params: {
    attack?: number; release?: number; inputGain?: number;
    compression?: number; outputGain?: number; slope?: number;
  }) => {
    audioEngine.setCompressor(trackId, {
      threshold: -(params.compression ?? compression),
      ratio: 1 + ((params.slope ?? slope) / 100) * 19,
      attack: (params.attack ?? attack) / 1000,
      release: (params.release ?? release) / 1000,
      knee: 10,
    });
  }, [trackId, attack, release, compression, slope]);

  if (!clip && !track) {
    return <EmptyInspectorState message="Select an audio clip or audio track to inspect effects." />;
  }

  return (
    <div className="tab-content">
      <div className="inspector-section">
        <div className="inspector-section-title">304C</div>
        <div className="vu-meter-container" title={`Peak: ${(meterLevel.peak * 100).toFixed(1)}%  RMS: ${(meterLevel.rms * 100).toFixed(1)}%`}>
          <div style={{
            height: 8, borderRadius: 2, background: 'var(--bg-tertiary)',
            overflow: 'hidden', position: 'relative',
          }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${Math.min(100, meterLevel.rms * 100)}%`,
              background: meterLevel.peak > 0.9 ? '#ef4444' : '#22c896',
              transition: 'width 50ms',
            }} />
            <div style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${Math.min(100, meterLevel.peak * 100)}%`,
              width: 2, background: '#fff',
            }} />
          </div>
        </div>
        <Slider label="Slope" value={slope} onChange={(value) => { setSlope(value); handleCompressorUpdate({ slope: value }); }} />
        <Slider label="Attack" value={attack} onChange={(value) => { setAttack(value); handleCompressorUpdate({ attack: value }); }} />
        <Slider label="Release" value={release} onChange={(value) => { setRelease(value); handleCompressorUpdate({ release: value }); }} />
        <Slider label="Input Gain" value={inputGain + 60} unit="dB" min={0} max={120} onChange={(value) => {
          const dB = value - 60;
          setInputGain(dB);
          handleCompressorUpdate({ inputGain: dB });
        }} />
        <Slider label="Compression" value={compression} onChange={(value) => { setCompression(value); handleCompressorUpdate({ compression: value }); }} />
        <Slider label="Output Gain" value={outputGain + 60} unit="dB" min={0} max={120} onChange={(value) => setOutputGain(value - 60)} />
      </div>

      <div className="inspector-section">
        <div className="inspector-section-title">SP 76</div>
        <Slider label="Subject" value={sp76Subject} onChange={setSp76Subject} />
        <Slider label="Mixes" value={sp76Mixes} onChange={setSp76Mixes} />
        <Slider label="Release" value={sp76Release} onChange={setSp76Release} />
      </div>

      <div className="inspector-section">
        <div className="inspector-section-title" style={{ display: 'flex', alignItems: 'center' }}>
          DynS Compressor/Limiter
          <div style={{ marginLeft: 'auto' }}>
            <ToggleSwitch enabled={dynEnabled} onToggle={() => setDynEnabled(!dynEnabled)} />
          </div>
        </div>
        <Slider label="Dyn/Depth" value={dynDepth + 60} unit="dB" min={0} max={120} onChange={(value) => setDynDepth(value - 60)} />
      </div>

      <div className="inspector-section">
        <div className="inspector-section-title">Audio Engine</div>
        <Slider label="Gain" value={gain + 60} unit="dB" min={0} max={120} onChange={(value) => handleGainChange(value - 60)} />
        <Slider label="Pan" value={pan + 50} unit="" min={0} max={100} onChange={(value) => handlePanChange(value - 50)} />
      </div>
    </div>
  );
}

/* ─── Tab: Info ──────────────────────────────────────────────────────────── */

function InfoTab() {
  const clip = useSelectedClip();
  const { projectSettings } = useEditorStore();
  const infoTc = new Timecode({ fps: projectSettings?.frameRate || 24 });

  return (
    <div className="tab-content">
      <div className="inspector-section">
        <div className="inspector-section-title">Metadata</div>
        {[
          ['Format', '1920x1080 / 23.976fps'],
          ['Codec', 'ProRes 422 HQ'],
          ['Color Space', 'Rec. 709'],
          ['Sample Rate', '48kHz / 24-bit'],
          ['Channels', 'Stereo'],
        ].map(([label, value]) => (
          <div key={label} className="property-row">
            <div className="property-label">{label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-primary)' }}>{value}</div>
          </div>
        ))}
      </div>
      {clip && (
        <div className="inspector-section">
          <div className="inspector-section-title">Clip Info</div>
          {[
            ['Name', clip.name],
            ['Start', infoTc.secondsToTC(clip.startTime)],
            ['End', infoTc.secondsToTC(clip.endTime)],
            ['Duration', infoTc.secondsToTC(clip.endTime - clip.startTime)],
            ['Type', clip.type],
          ].map(([label, value]) => (
            <div key={label} className="property-row">
              <div className="property-label">{label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>
      )}
      {clip && (
        <div className="inspector-section">
          <div className="inspector-section-title">Intrinsic Properties</div>
          {[
            ['Opacity', `${clip.intrinsicVideo.opacity}%`],
            ['Scale', `${clip.intrinsicVideo.scaleX}% x ${clip.intrinsicVideo.scaleY}%`],
            ['Position', `${clip.intrinsicVideo.positionX}, ${clip.intrinsicVideo.positionY}`],
            ['Rotation', `${clip.intrinsicVideo.rotation}deg`],
            ['Volume', `${clip.intrinsicAudio.volume}dB`],
            ['Pan', `${clip.intrinsicAudio.pan}`],
            ['Time Remap', clip.timeRemap.enabled ? 'Enabled' : 'Off'],
          ].map(([label, value]) => (
            <div key={label} className="property-row">
              <div className="property-label">{label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Tab: Effects Properties (!) — Figma "Taramara" variant ─────────────── */

function EffectsPropertiesTab() {
  const clip = useSelectedClip();
  const { playheadTime } = useEditorStore();
  const [acceleration, setAcceleration] = useState(0.01);
  const [keyframes, setKeyframes] = useState<number[]>([]);
  const [currentKfIdx, setCurrentKfIdx] = useState(-1);
  const [lumaKeyEnabled, setLumaKeyEnabled] = useState(true);
  const [hue, setHue] = useState(0.01);
  const [saturation, setSaturation] = useState(0.01);
  const [luminosity, setLuminosity] = useState(0.01);
  const [keyGain, setKeyGain] = useState(0.01);
  const [softness, setSoftness] = useState(0.01);
  const [keyColor1, setKeyColor1] = useState('#2563eb');
  const [keyColor2, setKeyColor2] = useState('#16a34a');
  const [fgOpacity, setFgOpacity] = useState(0.51);
  const [swapSources, setSwapSources] = useState(false);
  const [invertKey, setInvertKey] = useState(false);
  const [showAlpha, setShowAlpha] = useState(false);
  const [scaleX, setScaleX] = useState(0.01);
  const [scaleY, setScaleY] = useState(0.01);
  const [fixedAspect, setFixedAspect] = useState(true);
  const [posX, setPosX] = useState(0.01);
  const [posY, setPosY] = useState(0.01);
  const [gridSelect, setGridSelect] = useState('Default');
  const [gridFields, setGridFields] = useState(0);
  const [gridSubY, setGridSubY] = useState(0);
  const [scanRate, setScanRate] = useState(0);
  const [cropTop, setCropTop] = useState(0);
  const [cropBottom, setCropBottom] = useState(0);
  const [cropLeft, setCropLeft] = useState(0);
  const [cropRight, setCropRight] = useState(0);

  const addKeyframe = () => {
    const time = playheadTime;
    if (!keyframes.includes(time)) {
      const updated = [...keyframes, time].sort((a, b) => a - b);
      setKeyframes(updated);
      setCurrentKfIdx(updated.indexOf(time));
    }
  };

  const prevKeyframe = () => {
    if (keyframes.length === 0) return;
    setCurrentKfIdx(Math.max(0, currentKfIdx - 1));
  };

  const nextKeyframe = () => {
    if (keyframes.length === 0) return;
    setCurrentKfIdx(Math.min(keyframes.length - 1, currentKfIdx + 1));
  };

  if (!clip) return (
    <div className="tab-content" style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
      Select a clip to inspect
    </div>
  );

  return (
    <div className="tab-content">
      {/* Animators */}
      <div className="inspector-section">
        <div className="inspector-section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Animators
          <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 4 }}>
            {keyframes.length > 0 ? `${currentKfIdx + 1}/${keyframes.length}` : ''}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button className="fx-keyframe-btn" title="Add Keyframe" onClick={addKeyframe}>&#9670;</button>
            <button className="fx-keyframe-btn" title="Previous Keyframe" onClick={prevKeyframe}
              style={{ opacity: keyframes.length > 0 ? 1 : 0.3 }}>&#9664;</button>
            <button className="fx-keyframe-btn" title="Next Keyframe" onClick={nextKeyframe}
              style={{ opacity: keyframes.length > 0 ? 1 : 0.3 }}>&#9654;</button>
          </div>
        </div>
        <NumberInput label="Acceleration" value={acceleration} onChange={setAcceleration} />
      </div>

      {/* Tracking */}
      <div className="inspector-section">
        <div className="inspector-section-title" style={{ display: 'flex', alignItems: 'center' }}>
          Tracking
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Luma Key</span>
            <ToggleSwitch enabled={lumaKeyEnabled} onToggle={() => setLumaKeyEnabled(!lumaKeyEnabled)} />
          </div>
        </div>
      </div>

      {/* Key */}
      <div className="inspector-section">
        <div className="inspector-section-title">Key</div>
        <div className="property-row">
          <div className="property-label">Color</div>
          <div style={{ display: 'flex', gap: 4, position: 'relative' }}>
            <label style={{ position: 'relative', cursor: 'pointer' }}>
              <div className="fx-color-swatch" style={{ background: keyColor1 }} />
              <input type="color" value={keyColor1} onChange={e => setKeyColor1(e.target.value)}
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
            </label>
            <label style={{ position: 'relative', cursor: 'pointer' }}>
              <div className="fx-color-swatch" style={{ background: keyColor2 }} />
              <input type="color" value={keyColor2} onChange={e => setKeyColor2(e.target.value)}
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
            </label>
          </div>
        </div>
        <NumberInput label="Hue" value={hue} onChange={setHue} />
        <NumberInput label="Saturation" value={saturation} onChange={setSaturation} />
        <NumberInput label="Luminosity" value={luminosity} onChange={setLuminosity} />
        <NumberInput label="Gain" value={keyGain} onChange={setKeyGain} />
        <NumberInput label="Softness" value={softness} onChange={setSoftness} />
      </div>

      {/* Foreground */}
      <div className="inspector-section">
        <div className="inspector-section-title">Foreground</div>
        <NumberInput label="Opacity" value={fgOpacity} onChange={setFgOpacity} />
      </div>

      {/* Checkboxes */}
      <div className="inspector-section" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { label: 'Swap sources', checked: swapSources, toggle: () => setSwapSources(!swapSources) },
          { label: 'Invert Key', checked: invertKey, toggle: () => setInvertKey(!invertKey) },
          { label: 'Show Alpha', checked: showAlpha, toggle: () => setShowAlpha(!showAlpha) },
        ].map(cb => (
          <label key={cb.label} className="fx-checkbox-row">
            <input type="checkbox" checked={cb.checked} onChange={cb.toggle} />
            <span>{cb.label}</span>
          </label>
        ))}
      </div>

      {/* Scaling */}
      <div className="inspector-section">
        <div className="inspector-section-title">Scaling</div>
        <NumberInput label="X" value={scaleX} onChange={v => { setScaleX(v); if (fixedAspect) setScaleY(v); }} />
        <NumberInput label="Y" value={scaleY} onChange={v => { setScaleY(v); if (fixedAspect) setScaleX(v); }} />
        <label className="fx-checkbox-row" style={{ marginTop: 4 }}>
          <input type="checkbox" checked={fixedAspect} onChange={() => setFixedAspect(!fixedAspect)} />
          <span>Fixed aspect ratio</span>
        </label>
      </div>

      {/* Position */}
      <div className="inspector-section">
        <div className="inspector-section-title">Position</div>
        <NumberInput label="X" value={posX} onChange={setPosX} />
        <NumberInput label="Y" value={posY} onChange={setPosY} />
      </div>

      {/* Grid */}
      <CollapsibleSection title="Grid">
        <div className="property-row">
          <div className="property-label">Select</div>
          <select className="property-input" style={{ width: 80, fontSize: 10 }}
            value={gridSelect} onChange={e => setGridSelect(e.target.value)}>
            <option>Default</option>
            <option>Custom</option>
          </select>
        </div>
        <NumberInput label="Fields" value={gridFields} onChange={setGridFields} />
        <NumberInput label="Sub Y" value={gridSubY} onChange={setGridSubY} />
      </CollapsibleSection>

      {/* Source Scan */}
      <CollapsibleSection title="Source Scan">
        <NumberInput label="Rate" value={scanRate} onChange={setScanRate} />
      </CollapsibleSection>

      {/* Crop */}
      <CollapsibleSection title="Crop">
        <NumberInput label="Top" value={cropTop} onChange={setCropTop} />
        <NumberInput label="Bottom" value={cropBottom} onChange={setCropBottom} />
        <NumberInput label="Left" value={cropLeft} onChange={setCropLeft} />
        <NumberInput label="Right" value={cropRight} onChange={setCropRight} />
      </CollapsibleSection>
    </div>
  );
}

/* ─── Clip Info block ────────────────────────────────────────────────────── */

function ClipInfo() {
  const clip = useSelectedClip();
  const { projectSettings } = useEditorStore();
  const clipTc = new Timecode({ fps: projectSettings?.frameRate || 24 });

  if (!clip) return (
    <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
      Select a clip to inspect
    </div>
  );

  return (
    <div className="inspector-section">
      <div className="inspector-section-title">Clip Info</div>
      {[
        ['Name', clip.name],
        ['Start', clipTc.secondsToTC(clip.startTime)],
        ['End', clipTc.secondsToTC(clip.endTime)],
        ['Duration', clipTc.secondsToTC(clip.endTime - clip.startTime)],
      ].map(([label, value]) => (
        <div key={label} className="property-row">
          <div className="property-label">{label}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)' }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function EmptyInspectorState({ message }: { message: string }) {
  return (
    <div className="tab-content" style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
      {message}
    </div>
  );
}

function ColorPickerSection({
  title,
  color,
  palette,
  onChange,
}: {
  title: string;
  color: string;
  palette: string[];
  onChange: (color: string) => void;
}) {
  return (
    <div className="inspector-section">
      <div className="inspector-section-title">{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {palette.map((swatch) => (
          <button
            key={swatch}
            className="fx-keyframe-btn"
            onClick={() => onChange(swatch)}
            title={swatch}
            style={{
              width: 18,
              height: 18,
              padding: 0,
              borderRadius: 999,
              background: swatch,
              boxShadow: color.toLowerCase() === swatch.toLowerCase()
                ? '0 0 0 1px rgba(255,255,255,0.9), 0 0 0 3px rgba(91,106,245,0.35)'
                : undefined,
            }}
          />
        ))}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 2 }}>
          <input
            type="color"
            value={color}
            onChange={(event) => onChange(event.target.value)}
            style={{ width: 24, height: 20, border: 'none', background: 'transparent', padding: 0 }}
          />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
            {color.toUpperCase()}
          </span>
        </label>
      </div>
    </div>
  );
}

function TrackContextCard({ track }: { track: Track }) {
  const { toggleMute, toggleSolo, toggleLock, setTrackVolume, updateTrackColor } = useEditorStore();
  const clipCount = track.clips.length;
  const trackRole = track.type === 'AUDIO'
    ? 'Audio'
    : track.type === 'GRAPHIC'
      ? 'Graphic'
      : track.type === 'EFFECT'
        ? 'Effect'
        : track.type === 'SUBTITLE'
          ? 'Subtitle'
          : 'Video';

  return (
    <>
      <div className="inspector-section">
        <div className="inspector-section-title">Track</div>
        <div className="property-row">
          <div className="property-label">Name</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)' }}>{track.name}</div>
        </div>
        <div className="property-row">
          <div className="property-label">Role</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)' }}>{trackRole}</div>
        </div>
        <div className="property-row">
          <div className="property-label">Clips</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)' }}>{clipCount}</div>
        </div>
        <Slider
          label="Track Level"
          value={Math.round(track.volume * 100)}
          unit="%"
          min={0}
          max={200}
          onChange={(value) => setTrackVolume(track.id, value / 100)}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button className={`fx-keyframe-btn${track.muted ? ' active' : ''}`} onClick={() => toggleMute(track.id)}>Mute</button>
          <button className={`fx-keyframe-btn${track.solo ? ' active' : ''}`} onClick={() => toggleSolo(track.id)}>Solo</button>
          <button className={`fx-keyframe-btn${track.locked ? ' active' : ''}`} onClick={() => toggleLock(track.id)}>Lock</button>
        </div>
      </div>
      <ColorPickerSection
        title="Track Color"
        color={track.color}
        palette={TRACK_COLOR_PRESETS[track.type] ?? TRACK_COLOR_PRESETS.VIDEO}
        onChange={(color) => updateTrackColor(track.id, color)}
      />
    </>
  );
}

function BinContextCard({ bin }: { bin: Bin }) {
  const { updateBinColor } = useEditorStore();
  const totalAssets = countBinAssets(bin);

  return (
    <>
      <div className="inspector-section">
        <div className="inspector-section-title">Bin</div>
        <div className="property-row">
          <div className="property-label">Name</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)' }}>{bin.name}</div>
        </div>
        <div className="property-row">
          <div className="property-label">Items</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)' }}>{totalAssets}</div>
        </div>
        <div className="property-row">
          <div className="property-label">Children</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)' }}>{bin.children.length}</div>
        </div>
      </div>
      <ColorPickerSection
        title="Bin Color"
        color={bin.color}
        palette={BIN_COLOR_PRESETS}
        onChange={(color) => updateBinColor(bin.id, color)}
      />
    </>
  );
}

function VideoEffectsTab({ clip, track }: { clip: Clip | null; track: Track | null }) {
  const { clipEffects } = useEffectsStore();

  if (!clip) {
    return (
      <EmptyInspectorState message={`Select a clip on ${track?.name ?? 'a video track'} to apply video effects.`} />
    );
  }

  const effects = clipEffects[clip.id] || [];

  return (
    <div className="tab-content">
      <div className="inspector-section">
        <div className="inspector-section-title">Video Effects</div>
        {effects.length === 0 && (
          <div style={{ padding: '6px 0', fontSize: 10, color: 'var(--text-muted)' }}>No video effects applied</div>
        )}
        {effects.map((fx) => {
          const def = effectsEngine.getDefinition(fx.definitionId);
          return (
            <AppliedEffectRow
              key={fx.id}
              clipId={clip.id}
              effectId={fx.id}
              name={def?.name ?? fx.definitionId}
              enabled={fx.enabled}
              params={fx.params}
              paramDefs={def?.params ?? []}
            />
          );
        })}
        <EffectBrowserButton clipId={clip.id} />
      </div>
    </div>
  );
}

function ContextInfoTab({
  clip,
  track,
  bin,
  asset,
}: {
  clip: Clip | null;
  track: Track | null;
  bin: Bin | null;
  asset: MediaAsset | null;
}) {
  const { projectSettings } = useEditorStore();
  const infoTc = new Timecode({ fps: projectSettings?.frameRate || 24 });

  if (!clip && !track && !bin) {
    return <EmptyInspectorState message="Select a clip, track, or bin to inspect." />;
  }

  return (
    <div className="tab-content">
      {asset && (
        <div className="inspector-section">
          <div className="inspector-section-title">Source Media</div>
          {[
            ['Asset', asset.name],
            ['Type', asset.type],
            ['Duration', asset.duration ? infoTc.secondsToTC(asset.duration) : '--'],
            ['Resolution', asset.width && asset.height ? `${asset.width}x${asset.height}` : '--'],
            ['Waveform', asset.waveformData?.length ? `${asset.waveformData.length} samples` : 'Unavailable'],
            ['Thumbnails', asset.thumbnailFrames?.length ? `${asset.thumbnailFrames.length} frames` : asset.thumbnailUrl ? 'Poster frame ready' : 'Unavailable'],
          ].map(([label, value]) => (
            <div key={label} className="property-row">
              <div className="property-label">{label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>
      )}
      {clip && (
        <div className="inspector-section">
          <div className="inspector-section-title">Clip Info</div>
          {[
            ['Name', clip.name],
            ['Start', infoTc.secondsToTC(clip.startTime)],
            ['End', infoTc.secondsToTC(clip.endTime)],
            ['Duration', infoTc.secondsToTC(clip.endTime - clip.startTime)],
            ['Track', track?.name ?? '--'],
          ].map(([label, value]) => (
            <div key={label} className="property-row">
              <div className="property-label">{label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>
      )}
      {track && (
        <div className="inspector-section">
          <div className="inspector-section-title">Track Info</div>
          {[
            ['Name', track.name],
            ['Type', track.type],
            ['Color', track.color.toUpperCase()],
            ['Clips', String(track.clips.length)],
          ].map(([label, value]) => (
            <div key={label} className="property-row">
              <div className="property-label">{label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>
      )}
      {bin && (
        <div className="inspector-section">
          <div className="inspector-section-title">Bin Info</div>
          {[
            ['Name', bin.name],
            ['Color', bin.color.toUpperCase()],
            ['Items', String(countBinAssets(bin))],
            ['Sub Bins', String(bin.children.length)],
          ].map(([label, value]) => (
            <div key={label} className="property-row">
              <div className="property-label">{label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main Inspector Panel ───────────────────────────────────────────────── */

export function InspectorPanel() {
  const {
    activeInspectorTab,
    setInspectorTab,
    projectSettings,
    tracks,
    selectedTrackId,
    selectedBinId,
    bins,
  } = useEditorStore();
  const clip = useSelectedClip();
  const clipTrack = findTrackForClip(tracks, clip?.id ?? null);
  const selectedTrack = tracks.find((track) => track.id === selectedTrackId) ?? null;
  const track = clipTrack ?? selectedTrack;
  const bin = !clip ? findBinById(bins, selectedBinId) : null;
  const asset = clip ? findAssetById(bins, clip.assetId) : null;
  const domain = clip || track ? getInspectorDomain(track, clip) : bin ? 'bin' : 'none';

  const tc = new Timecode({ fps: projectSettings?.frameRate || 24 });

  const tabs: Array<{ id: string; label: string }> = [
    ...(domain === 'video'
      ? [
          { id: 'video', label: 'Video' },
          { id: 'effects', label: 'Video FX' },
        ]
      : domain === 'audio'
        ? [
            { id: 'audio', label: 'Audio' },
            { id: 'effects', label: 'Audio FX' },
          ]
        : []),
    { id: 'info', label: 'Info' },
  ];
  const resolvedTab = tabs.some((tab) => tab.id === activeInspectorTab)
    ? activeInspectorTab
    : tabs[0]?.id ?? 'info';

  const clipName = clip?.name ?? track?.name ?? bin?.name ?? 'Nothing Selected';
  const clipDuration = clip
    ? tc.secondsToTC(clip.endTime - clip.startTime)
      : track
        ? `${track.type} • ${track.clips.length} clip${track.clips.length === 1 ? '' : 's'}`
      : bin
        ? `${countBinAssets(bin)} asset${countBinAssets(bin) === 1 ? '' : 's'}`
        : 'Select a clip, track, or bin';

  return (
    <div className="inspector-panel">
      <div className="panel-header">
        <span className="panel-title">Inspector</span>
      </div>

      {/* Clip header */}
      <div className="inspector-clip-header">
        <span className="inspector-clip-name">{clipName}</span>
        <span className="inspector-clip-tc">{clipDuration}</span>
      </div>

      {/* Tabs: Video | Audio | Info | FX */}
      <div className="panel-tabs">
        {tabs.map(t => (
          <button key={t.id}
            className={`panel-tab${resolvedTab === t.id ? ' active' : ''}`}
            onClick={() => setInspectorTab(t.id as any)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="panel-body">
        {track && <TrackContextCard track={track} />}
        {!track && bin && <BinContextCard bin={bin} />}

        {resolvedTab === 'video' && <VideoTab />}
        {resolvedTab === 'audio' && <AudioTab />}
        {resolvedTab === 'info' && (
          <ContextInfoTab clip={clip} track={track} bin={bin} asset={asset} />
        )}
        {resolvedTab === 'effects' && domain === 'audio' && <AudioEffectsTab clip={clip} track={track} />}
        {resolvedTab === 'effects' && domain === 'video' && <VideoEffectsTab clip={clip} track={track} />}
      </div>
    </div>
  );
}
