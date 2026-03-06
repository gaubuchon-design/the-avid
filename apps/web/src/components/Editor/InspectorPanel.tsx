import React, { useState } from 'react';
import { useEditorStore } from '../../store/editor.store';

function ColorWheelWidget({ label }: { label: string }) {
  const [dot, setDot] = useState({ x: 50, y: 50 });
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const update = (ev: MouseEvent) => {
      setDot({
        x: Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100)),
        y: Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100)),
      });
    };
    update(e.nativeEvent);
    const up = () => { document.removeEventListener('mousemove', update); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', update);
    document.addEventListener('mouseup', up);
  };
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="color-wheel" style={{ width: 72, height: 72, margin: '0 auto' }} onMouseDown={handleMouseDown}>
        <div className="color-wheel-dot" style={{ left: `${dot.x}%`, top: `${dot.y}%` }} />
      </div>
      <div className="color-wheel-label">{label}</div>
    </div>
  );
}

function EffectRow({ name, defaultEnabled }: { name: string; defaultEnabled?: boolean }) {
  const [enabled, setEnabled] = useState(defaultEnabled ?? false);
  const [open, setOpen] = useState(false);
  return (
    <div className="effect-item">
      <div className="effect-header" onClick={() => setOpen(!open)}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{open ? '▾' : '▸'}</span>
        <span className="effect-name">{name}</span>
        <div className={`effect-toggle${enabled ? ' on' : ''}`} onClick={(e) => { e.stopPropagation(); setEnabled(!enabled); }} />
      </div>
      {open && (
        <div className="effect-body">
          <div className="property-row" style={{ marginTop: 8 }}>
            <div className="property-label" style={{ fontSize: 10 }}>Intensity</div>
            <input type="range" className="range-slider" min={0} max={100} defaultValue={50} style={{ flex: 1 }} />
          </div>
        </div>
      )}
    </div>
  );
}

function VideoTab() {
  const [opacity, setOpacity] = useState(100);
  const [scale, setScale] = useState(100);
  const Row = ({ label, value, unit = '', min = 0, max = 100, onChange }: any) => (
    <div className="property-row">
      <div className="property-label">{label}</div>
      <div className="property-value">
        <input type="number" className="property-input" value={value} style={{ width: 54 }} onChange={e => onChange(+e.target.value || 0)} />
        {unit && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{unit}</span>}
        <input type="range" className="range-slider" min={min} max={max} value={value} onChange={e => onChange(+e.target.value)} style={{ flex: 1 }} />
      </div>
    </div>
  );
  return (
    <div className="tab-content">
      <div className="inspector-section">
        <div className="inspector-section-title">Transform</div>
        <Row label="Opacity" value={opacity} unit="%" onChange={setOpacity} />
        <Row label="Scale" value={scale} unit="%" min={1} max={400} onChange={setScale} />
        <Row label="Pos X" value={0} unit="px" min={-2000} max={2000} onChange={() => {}} />
        <Row label="Pos Y" value={0} unit="px" min={-2000} max={2000} onChange={() => {}} />
        <Row label="Rotation" value={0} unit="°" min={-360} max={360} onChange={() => {}} />
      </div>
      <div className="inspector-section">
        <div className="inspector-section-title">Applied Effects</div>
        <EffectRow name="Color Correction" defaultEnabled={true} />
        <EffectRow name="Noise Reduction" />
        <EffectRow name="Stabilizer" />
        <button className="btn btn-ghost" style={{ width: '100%', marginTop: 4, fontSize: 11 }}>+ Add Effect</button>
      </div>
    </div>
  );
}

function ColorTab() {
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
        <div style={{ width: '100%', height: 100, background: 'var(--bg-void)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            {[25,50,75].map(v => <React.Fragment key={v}><line x1={v} y1={0} x2={v} y2={100} stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" /><line x1={0} y1={v} x2={100} y2={v} stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" /></React.Fragment>)}
            <line x1={0} y1={100} x2={100} y2={0} stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" strokeDasharray="3,3" />
            <path d="M0,100 C20,90 40,30 60,20 S90,5 100,0" stroke="var(--accent)" strokeWidth="1.5" fill="none" />
            {[[20,88],[60,20],[90,4]].map(([x,y],i) => <circle key={i} cx={x} cy={y} r={2.5} fill="var(--accent)" stroke="white" strokeWidth="0.8" />)}
          </svg>
        </div>
      </div>
      <div className="inspector-section">
        <div className="inspector-section-title">HSL</div>
        {['Hue','Saturation','Luminance'].map(l => (
          <div key={l} className="property-row">
            <div className="property-label">{l}</div>
            <input type="range" className="range-slider" min={-100} max={100} defaultValue={0} style={{ flex: 1 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AudioTab() {
  return (
    <div className="tab-content">
      <div className="inspector-section">
        <div className="inspector-section-title">Levels</div>
        {['Gain','Pan','Bass','Mid','Treble'].map(l => (
          <div key={l} className="property-row">
            <div className="property-label">{l}</div>
            <input type="range" className="range-slider" min={l === 'Pan' ? -100 : 0} max={l === 'Gain' ? 200 : 100} defaultValue={l === 'Gain' ? 100 : l === 'Pan' ? 0 : 70} style={{ flex: 1 }} />
          </div>
        ))}
      </div>
      <div className="inspector-section">
        <div className="inspector-section-title">AI Audio Tools</div>
        {[{name:'Voice Isolation',desc:'Remove background noise'},{name:'Enhance Speech',desc:'Clarity & presence'},{name:'Auto Duck',desc:'Duck music under dialogue'}].map(tool => (
          <div key={tool.name} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 8px',background:'var(--bg-raised)',borderRadius:4,border:'1px solid var(--border)',marginBottom:4 }}>
            <div><div style={{fontSize:11,color:'var(--text-secondary)'}}>{tool.name}</div><div style={{fontSize:10,color:'var(--text-muted)'}}>{tool.desc}</div></div>
            <button className="btn btn-ghost" style={{fontSize:10,padding:'3px 8px'}}>Apply</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InspectorPanel() {
  const { activeInspectorTab, setInspectorTab } = useEditorStore();
  const tabs = [
    { id: 'video' as const, label: 'Video', icon: '▶' },
    { id: 'color' as const, label: 'Color', icon: '🎨' },
    { id: 'audio' as const, label: 'Audio', icon: '♪' },
    { id: 'ai'    as const, label: 'AI',    icon: '✦' },
  ];
  return (
    <div className="inspector-panel">
      <div className="tabs">
        {tabs.map(t => (
          <div key={t.id} className={`tab${activeInspectorTab === t.id ? ' active' : ''}`} onClick={() => setInspectorTab(t.id)}>
            <span>{t.icon}</span>{t.label}
          </div>
        ))}
      </div>
      {activeInspectorTab === 'video' && <VideoTab />}
      {activeInspectorTab === 'color' && <ColorTab />}
      {activeInspectorTab === 'audio' && <AudioTab />}
      {activeInspectorTab === 'ai' && (
        <div className="tab-content">
          <div className="inspector-section">
            <div className="inspector-section-title">Smart Effects</div>
            {[{name:'Object Masking',icon:'⬡',desc:'Hover-and-click masking',cost:30},{name:'Smart Reframe',icon:'⊡',desc:'Auto-resize to any ratio',cost:20},{name:'Relight Scene',icon:'☀',desc:'AI lighting adjustment',cost:25},{name:'Depth of Field',icon:'◎',desc:'Synthetic bokeh',cost:15}].map(item => (
              <div key={item.name} style={{padding:'8px',background:'var(--bg-raised)',borderRadius:5,border:'1px solid var(--border)',marginBottom:5,cursor:'pointer'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:16,width:24,textAlign:'center'}}>{item.icon}</span>
                  <div style={{flex:1}}><div style={{fontSize:11,fontWeight:500,color:'var(--text-primary)'}}>{item.name}</div><div style={{fontSize:10,color:'var(--text-muted)'}}>{item.desc}</div></div>
                  <span style={{fontSize:9,color:'var(--text-accent)',fontFamily:'var(--font-mono)'}}>{item.cost}t</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
