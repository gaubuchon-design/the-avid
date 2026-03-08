import React, { useState } from 'react';
import { useEditorStore } from '../../store/editor.store';

function formatTC(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60),
        s = Math.floor(sec % 60), f = Math.floor((sec % 1) * 24);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(f).padStart(2,'0')}`;
}

/* ─── Shared widgets ─────────────────────────────────────────────────────── */

function Slider({ label, value, unit = '', min = 0, max = 100, onChange }: {
  label: string; value: number; unit?: string; min?: number; max?: number; onChange: (v: number) => void;
}) {
  return (
    <div className="property-row">
      <div className="property-label">{label}</div>
      <div className="property-value">
        <input type="number" className="property-input" value={value} style={{ width: 48 }}
          onChange={e => onChange(+e.target.value || 0)} />
        {unit && <span className="property-unit">{unit}</span>}
        <input type="range" className="range-slider" min={min} max={max} value={value}
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
    <div className={`effect-toggle${enabled ? ' on' : ''}`} onClick={onToggle} />
  );
}

function EffectRow({ name, defaultEnabled }: { name: string; defaultEnabled?: boolean }) {
  const [enabled, setEnabled] = useState(defaultEnabled ?? false);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(50);
  return (
    <div className="effect-item">
      <div className="effect-header" onClick={() => setOpen(!open)}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{open ? '▾' : '▸'}</span>
        <span className="effect-name">{name}</span>
        <ToggleSwitch enabled={enabled} onToggle={() => setEnabled(!enabled)} />
      </div>
      {open && (
        <div className="effect-body">
          <Slider label="Amount" value={amount} onChange={setAmount} />
        </div>
      )}
    </div>
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
        <span style={{ fontSize: 8 }}>{open ? '▾' : '▸'}</span>
        {title}
      </div>
      {open && children}
    </div>
  );
}

/* ─── Tab: Video ─────────────────────────────────────────────────────────── */

function VideoTab() {
  const [opacity, setOpacity] = useState(100);
  const [scale, setScale] = useState(100);
  const [x, setX] = useState(0), [y, setY] = useState(0), [rot, setRot] = useState(0);
  return (
    <div className="tab-content">
      <div className="inspector-section">
        <div className="inspector-section-title">Transform</div>
        <Slider label="Opacity" value={opacity} unit="%" onChange={setOpacity} />
        <Slider label="Scale" value={scale} unit="%" min={1} max={400} onChange={setScale} />
        <Slider label="Pos X" value={x} unit="px" min={-2000} max={2000} onChange={setX} />
        <Slider label="Pos Y" value={y} unit="px" min={-2000} max={2000} onChange={setY} />
        <Slider label="Rotation" value={rot} unit="°" min={-360} max={360} onChange={setRot} />
      </div>
      <div className="inspector-section">
        <div className="inspector-section-title">Applied Effects</div>
        <EffectRow name="Color Correction" defaultEnabled={true} />
        <EffectRow name="Noise Reduction" />
        <EffectRow name="Stabilizer" />
        <button className="btn btn-ghost" style={{ width: '100%', marginTop: 6, fontSize: 11 }}>+ Add Effect</button>
      </div>
    </div>
  );
}

/* ─── Tab: Audio (Figma: 304C + SP 76 + DynS) ───────────────────────────── */

function AudioTab() {
  const [gain, setGain] = useState(0);
  const [pan, setPan] = useState(0);
  const [slope, setSlope] = useState(50);
  const [attack, setAttack] = useState(30);
  const [release, setRelease] = useState(50);
  const [inputGain, setInputGain] = useState(0);
  const [compression, setCompression] = useState(40);
  const [outputGain, setOutputGain] = useState(0);
  // SP 76
  const [sp76Subject, setSp76Subject] = useState(50);
  const [sp76Mixes, setSp76Mixes] = useState(50);
  const [sp76Release, setSp76Release] = useState(50);
  // DynS
  const [dynEnabled, setDynEnabled] = useState(false);
  const [dynDepth, setDynDepth] = useState(0);

  return (
    <div className="tab-content">
      {/* 304C Section */}
      <div className="inspector-section">
        <div className="inspector-section-title">304C</div>
        <div className="vu-meter-container" style={{
          height: 32, background: 'var(--bg-void)', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-default)', marginBottom: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)',
        }}>VU Meter</div>
        <Slider label="Slope" value={slope} onChange={setSlope} />
        <Slider label="Attack" value={attack} onChange={setAttack} />
        <Slider label="Release" value={release} onChange={setRelease} />
        <Slider label="Input Gain" value={inputGain + 60} unit="dB" min={0} max={120} onChange={v => setInputGain(v - 60)} />
        <Slider label="Compression" value={compression} onChange={setCompression} />
        <Slider label="Output Gain" value={outputGain + 60} unit="dB" min={0} max={120} onChange={v => setOutputGain(v - 60)} />
      </div>

      {/* SP 76 Section */}
      <div className="inspector-section">
        <div className="inspector-section-title">SP 76</div>
        <Slider label="Subject" value={sp76Subject} onChange={setSp76Subject} />
        <Slider label="Mixes" value={sp76Mixes} onChange={setSp76Mixes} />
        <Slider label="Release" value={sp76Release} onChange={setSp76Release} />
      </div>

      {/* DynS Compressor/Limiter */}
      <div className="inspector-section">
        <div className="inspector-section-title" style={{ display: 'flex', alignItems: 'center' }}>
          DynS Compressor/Limiter
          <div style={{ marginLeft: 'auto' }}>
            <ToggleSwitch enabled={dynEnabled} onToggle={() => setDynEnabled(!dynEnabled)} />
          </div>
        </div>
        <Slider label="Dyn/Depth" value={dynDepth + 60} unit="dB" min={0} max={120} onChange={v => setDynDepth(v - 60)} />
      </div>

      {/* Audio basic controls */}
      <div className="inspector-section">
        <div className="inspector-section-title">Audio</div>
        <Slider label="Gain" value={gain + 60} unit="dB" min={0} max={120} onChange={v => setGain(v - 60)} />
        <Slider label="Pan" value={pan + 50} unit="" min={0} max={100} onChange={v => setPan(v - 50)} />
      </div>
    </div>
  );
}

/* ─── Tab: Info ──────────────────────────────────────────────────────────── */

function InfoTab() {
  const { tracks, selectedClipIds } = useEditorStore();
  const clip = selectedClipIds.length > 0
    ? tracks.flatMap(t => t.clips).find(c => c.id === selectedClipIds[0])
    : null;

  return (
    <div className="tab-content">
      <div className="inspector-section">
        <div className="inspector-section-title">Metadata</div>
        {[
          ['Format', '1920×1080 · 23.976fps'],
          ['Codec', 'ProRes 422 HQ'],
          ['Color Space', 'Rec. 709'],
          ['Sample Rate', '48kHz · 24-bit'],
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
            ['Start', `${clip.startTime.toFixed(2)}s`],
            ['End', `${clip.endTime.toFixed(2)}s`],
            ['Duration', `${(clip.endTime - clip.startTime).toFixed(2)}s`],
          ].map(([label, value]) => (
            <div key={label} className="property-row">
              <div className="property-label">{label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Tab: Effects Properties (!) — Figma "Taramara" variant ─────────────── */

function EffectsPropertiesTab() {
  // Animators
  const [acceleration, setAcceleration] = useState(0.01);
  const [keyframes, setKeyframes] = useState<number[]>([]);
  const [currentKfIdx, setCurrentKfIdx] = useState(-1);
  // Tracking / Luma Key
  const [lumaKeyEnabled, setLumaKeyEnabled] = useState(true);
  // Key
  const [hue, setHue] = useState(0.01);
  const [saturation, setSaturation] = useState(0.01);
  const [luminosity, setLuminosity] = useState(0.01);
  const [keyGain, setKeyGain] = useState(0.01);
  const [softness, setSoftness] = useState(0.01);
  const [keyColor1, setKeyColor1] = useState('#2563eb');
  const [keyColor2, setKeyColor2] = useState('#16a34a');
  // Foreground
  const [fgOpacity, setFgOpacity] = useState(0.51);
  // Checkboxes
  const [swapSources, setSwapSources] = useState(false);
  const [invertKey, setInvertKey] = useState(false);
  const [showAlpha, setShowAlpha] = useState(false);
  // Scaling
  const [scaleX, setScaleX] = useState(0.01);
  const [scaleY, setScaleY] = useState(0.01);
  const [fixedAspect, setFixedAspect] = useState(true);
  // Position
  const [posX, setPosX] = useState(0.01);
  const [posY, setPosY] = useState(0.01);
  // Grid
  const [gridSelect, setGridSelect] = useState('Default');
  const [gridFields, setGridFields] = useState(0);
  const [gridSubY, setGridSubY] = useState(0);
  // Source Scan
  const [scanRate, setScanRate] = useState(0);
  // Crop
  const [cropTop, setCropTop] = useState(0);
  const [cropBottom, setCropBottom] = useState(0);
  const [cropLeft, setCropLeft] = useState(0);
  const [cropRight, setCropRight] = useState(0);

  const { playheadTime } = useEditorStore();

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
    const idx = Math.max(0, currentKfIdx - 1);
    setCurrentKfIdx(idx);
  };

  const nextKeyframe = () => {
    if (keyframes.length === 0) return;
    const idx = Math.min(keyframes.length - 1, currentKfIdx + 1);
    setCurrentKfIdx(idx);
  };

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
            <button className="fx-keyframe-btn" title="Add Keyframe" onClick={addKeyframe}>◆</button>
            <button className="fx-keyframe-btn" title="Previous Keyframe" onClick={prevKeyframe}
              style={{ opacity: keyframes.length > 0 ? 1 : 0.3 }}>◀</button>
            <button className="fx-keyframe-btn" title="Next Keyframe" onClick={nextKeyframe}
              style={{ opacity: keyframes.length > 0 ? 1 : 0.3 }}>▶</button>
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
        {/* Color picker swatches — click to cycle through colors */}
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
  const { tracks, selectedClipIds } = useEditorStore();
  const clip = selectedClipIds.length > 0
    ? tracks.flatMap(t => t.clips).find(c => c.id === selectedClipIds[0])
    : null;

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
        ['Start', `${clip.startTime.toFixed(2)}s`],
        ['End', `${clip.endTime.toFixed(2)}s`],
        ['Duration', `${(clip.endTime - clip.startTime).toFixed(2)}s`],
      ].map(([label, value]) => (
        <div key={label} className="property-row">
          <div className="property-label">{label}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)' }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

/* ─── Main Inspector Panel ───────────────────────────────────────────────── */

export function InspectorPanel() {
  const { activeInspectorTab, setInspectorTab, selectedClipIds, tracks } = useEditorStore();
  const clip = selectedClipIds.length > 0
    ? tracks.flatMap(t => t.clips).find(c => c.id === selectedClipIds[0])
    : null;

  // Figma tabs: Video | Audio | Info | ! (effects properties)
  const tabs: Array<{ id: string; label: string }> = [
    { id: 'video', label: 'Video' },
    { id: 'audio', label: 'Audio' },
    { id: 'info', label: 'Info' },
    { id: 'effects', label: '!' },
  ];

  const clipName = clip?.name || 'No Clip';
  const clipDuration = clip ? formatTC(clip.endTime - clip.startTime) : '00:00:00:00';

  return (
    <div className="inspector-panel">
      <div className="panel-header">
        <span className="panel-title">Inspector</span>
      </div>

      {/* Clip header — name + timecode */}
      <div className="inspector-clip-header">
        <span className="inspector-clip-name">{clipName}</span>
        <span className="inspector-clip-tc">{clipDuration}</span>
      </div>

      {/* Tabs: Video | Audio | Info | ! */}
      <div className="panel-tabs">
        {tabs.map(t => (
          <button key={t.id}
            className={`panel-tab${activeInspectorTab === t.id ? ' active' : ''}`}
            onClick={() => setInspectorTab(t.id as any)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="panel-body">
        {activeInspectorTab === 'video' && (
          <>
            <ClipInfo />
            <VideoTab />
          </>
        )}
        {activeInspectorTab === 'audio' && <AudioTab />}
        {activeInspectorTab === 'info' && <InfoTab />}
        {activeInspectorTab === 'effects' && <EffectsPropertiesTab />}
      </div>
    </div>
  );
}
