import React, { useState } from 'react';
import { useEditorStore } from '../../store/editor.store';
import type { WorkspaceTab } from '../../store/editor.store';

function ColorWheelWidget({ label }: { label: string }) {
  const [dot, setDot] = useState({ x: 50, y: 50 });
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const update = (ev: MouseEvent) => setDot({
      x: Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100)),
    });
    update(e.nativeEvent);
    const up = () => { document.removeEventListener('mousemove', update); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', update);
    document.addEventListener('mouseup', up);
  };
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="color-wheel" style={{ width: 68, height: 68, margin: '0 auto' }} onMouseDown={handleMouseDown}>
        <div className="color-wheel-dot" style={{ left: `${dot.x}%`, top: `${dot.y}%` }} />
      </div>
      <div className="color-wheel-label">{label}</div>
    </div>
  );
}

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

function EffectRow({ name, defaultEnabled }: { name: string; defaultEnabled?: boolean }) {
  const [enabled, setEnabled] = useState(defaultEnabled ?? false);
  const [open, setOpen] = useState(false);
  return (
    <div className="effect-item">
      <div className="effect-header" onClick={() => setOpen(!open)}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{open ? '▾' : '▸'}</span>
        <span className="effect-name">{name}</span>
        <div className={`effect-toggle${enabled ? ' on' : ''}`}
          onClick={e => { e.stopPropagation(); setEnabled(!enabled); }} />
      </div>
      {open && (
        <div className="effect-body">
          <Slider label="Amount" value={50} onChange={() => {}} />
        </div>
      )}
    </div>
  );
}

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

function ColorTab() {
  const [curves, setCurves] = useState<{x:number;y:number}[]>([{x:0,y:100},{x:100,y:0}]);
  return (
    <div className="tab-content">
      <div className="inspector-section">
        <div className="inspector-section-title">Color Wheels</div>
        <div className="color-wheels-row">
          <ColorWheelWidget label="Lift" />
          <ColorWheelWidget label="Gamma" />
          <ColorWheelWidget label="Gain" />
        </div>
      </div>
      <div className="inspector-section">
        <div className="inspector-section-title">Curves</div>
        <div className="curves-canvas">
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            {[25,50,75].map(v => (
              <React.Fragment key={v}>
                <line x1={v} y1={0} x2={v} y2={100} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
                <line x1={0} y1={v} x2={100} y2={v} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
              </React.Fragment>
            ))}
            <path d="M 0,100 C 25,75 75,25 100,0" stroke="var(--brand-bright)" strokeWidth="1.5" fill="none" />
            {[[0,100],[50,50],[100,0]].map(([x,y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" fill="var(--brand-bright)" style={{ cursor: 'crosshair' }} />
            ))}
          </svg>
        </div>
        <Slider label="Contrast" value={50} onChange={() => {}} />
        <Slider label="Saturation" value={50} onChange={() => {}} />
        <Slider label="Temperature" value={50} onChange={() => {}} />
      </div>
    </div>
  );
}

function AudioTab() {
  const [gain, setGain] = useState(0);
  const [pan, setPan] = useState(0);
  return (
    <div className="tab-content">
      <div className="inspector-section">
        <div className="inspector-section-title">Audio</div>
        <Slider label="Gain" value={gain + 60} unit="dB" min={0} max={120} onChange={v => setGain(v - 60)} />
        <Slider label="Pan" value={pan + 50} unit="" min={0} max={100} onChange={v => setPan(v - 50)} />
        <Slider label="Pitch" value={50} min={0} max={100} onChange={() => {}} />
      </div>
      <div className="inspector-section">
        <div className="inspector-section-title">Audio Effects</div>
        <EffectRow name="EQ" />
        <EffectRow name="Compressor" defaultEnabled={true} />
        <EffectRow name="Noise Gate" />
        <EffectRow name="Voice Isolation" />
        <button className="btn btn-ghost" style={{ width: '100%', marginTop: 6, fontSize: 11 }}>+ Add Effect</button>
      </div>
    </div>
  );
}

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

  const duration = clip.endTime - clip.startTime;

  return (
    <div className="inspector-section">
      <div className="inspector-section-title">Clip Info</div>
      {[
        ['Name', clip.name],
        ['Start', `${clip.startTime.toFixed(2)}s`],
        ['End', `${clip.endTime.toFixed(2)}s`],
        ['Duration', `${duration.toFixed(2)}s`],
      ].map(([label, value]) => (
        <div key={label} className="property-row">
          <div className="property-label">{label}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)' }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

export function InspectorPanel() {
  const { activeInspectorTab, setInspectorTab, activePanel } = useEditorStore();

  const tabs = activePanel === 'color'
    ? ['color', 'video', 'audio']
    : activePanel === 'audio'
    ? ['audio', 'video', 'color']
    : ['video', 'color', 'audio'];

  return (
    <div className="inspector-panel">
      <div className="panel-header">
        <span className="panel-title">Inspector</span>
      </div>
      <div className="panel-tabs">
        {tabs.map(t => (
          <button key={t} className={`panel-tab${activeInspectorTab === t ? ' active' : ''}`}
            onClick={() => setInspectorTab(t as WorkspaceTab)}>
            {t}
          </button>
        ))}
      </div>

      <div className="panel-body">
        <ClipInfo />
        {activeInspectorTab === 'video' && <VideoTab />}
        {activeInspectorTab === 'color' && <ColorTab />}
        {activeInspectorTab === 'audio' && <AudioTab />}
      </div>
    </div>
  );
}
