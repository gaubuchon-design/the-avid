import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useColorStore, ColorViewTab } from '../../store/color.store';
import {
  colorEngine,
  PrimaryParams,
  CurveParams,
  Point,
  ColorNode,
  ColorNodeType,
} from '../../engine/ColorEngine';

// ─── Tab definitions ─────────────────────────────────────────────────────────

const TABS: { value: ColorViewTab; label: string }[] = [
  { value: 'wheels', label: 'Wheels' },
  { value: 'curves', label: 'Curves' },
  { value: 'huesat', label: 'Hue/Sat' },
  { value: 'qualification', label: 'Qualification' },
  { value: 'nodeGraph', label: 'Node Graph' },
];

const NODE_COLORS: Record<ColorNodeType, string> = {
  source: '#4ade80',
  primary: '#818cf8',
  secondary: '#f472b6',
  curves: '#fbbf24',
  huesat: '#fb923c',
  lut: '#6ee7b7',
  mixer: '#a78bfa',
  output: '#f87171',
};

// ─── Shared Slider ───────────────────────────────────────────────────────────

function Slider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="property-row">
      <div className="property-label">{label}</div>
      <div className="property-value">
        <input
          type="number"
          className="property-input"
          value={Number(value.toFixed(3))}
          step={step}
          style={{ width: 52 }}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
        <input
          type="range"
          className="range-slider"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ flex: 1 }}
        />
      </div>
    </div>
  );
}

// ─── Color Wheel ─────────────────────────────────────────────────────────────

function ColorWheel({
  label,
  r,
  g,
  b,
  onChangeR,
  onChangeG,
  onChangeB,
}: {
  label: string;
  r: number;
  g: number;
  b: number;
  onChangeR: (v: number) => void;
  onChangeG: (v: number) => void;
  onChangeB: (v: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = 80;

  // Derive dot position from r,g,b (simplified: map to x,y around center)
  const dotX = 50 + r * 40;
  const dotY = 50 + g * 40;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = w / 2 - 2;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Draw color wheel
    for (let angle = 0; angle < 360; angle += 1) {
      const rad = (angle * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, rad, rad + (Math.PI / 180) * 2);
      ctx.closePath();
      ctx.fillStyle = `hsl(${angle}, 75%, 50%)`;
      ctx.fill();
    }

    // Radial gradient overlay for brightness
    const radGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    radGrad.addColorStop(0, 'rgba(180,180,180,0.85)');
    radGrad.addColorStop(0.7, 'rgba(180,180,180,0)');
    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'var(--border-default)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshair at center
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy);
    ctx.lineTo(cx + 6, cy);
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx, cy + 6);
    ctx.stroke();

    // Draw dot for current value
    const dx = cx + r * (radius * 0.8);
    const dy = cy - g * (radius * 0.8); // invert y
    ctx.beginPath();
    ctx.arc(dx, dy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [r, g, b, size]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const radius = rect.width / 2;

      const update = (ev: MouseEvent) => {
        const relX = (ev.clientX - rect.left - radius) / (radius * 0.8);
        const relY = -(ev.clientY - rect.top - radius) / (radius * 0.8);
        const clamped = Math.sqrt(relX * relX + relY * relY);
        const scale = clamped > 1 ? 1 / clamped : 1;
        onChangeR(Math.max(-1, Math.min(1, relX * scale)));
        onChangeG(Math.max(-1, Math.min(1, relY * scale)));
        // B stays where it is — wheel controls R and G
      };

      update(e.nativeEvent);
      const up = () => {
        document.removeEventListener('mousemove', update);
        document.removeEventListener('mouseup', up);
      };
      document.addEventListener('mousemove', update);
      document.addEventListener('mouseup', up);
    },
    [onChangeR, onChangeG]
  );

  const handleDoubleClick = useCallback(() => {
    onChangeR(0);
    onChangeG(0);
    onChangeB(0);
  }, [onChangeR, onChangeG, onChangeB]);

  return (
    <div style={{ textAlign: 'center' }}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="color-wheel"
        style={{
          width: size,
          height: size,
          cursor: 'crosshair',
          borderRadius: '50%',
          display: 'block',
          margin: '0 auto',
        }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      />
      <div className="color-wheel-label">{label}</div>
    </div>
  );
}

// ─── Wheels Tab ──────────────────────────────────────────────────────────────

function WheelsTab() {
  const { nodes, selectedNodeId } = useColorStore();

  // Find the first primary node (or selected if it's primary)
  const primaryNode = nodes.find((n) => {
    if (selectedNodeId && n.id === selectedNodeId && n.type === 'primary') return true;
    return !selectedNodeId && n.type === 'primary';
  }) ?? nodes.find((n) => n.type === 'primary');

  const params: PrimaryParams = (primaryNode?.params as PrimaryParams) ?? {
    lift: { r: 0, g: 0, b: 0 },
    gamma: { r: 0, g: 0, b: 0 },
    gain: { r: 0, g: 0, b: 0 },
    offset: { r: 0, g: 0, b: 0 },
    saturation: 1,
    contrast: 1,
    temperature: 0,
    tint: 0,
  };

  const updateParam = useCallback(
    (key: string, value: any) => {
      if (!primaryNode) return;
      colorEngine.updateNodeParams(primaryNode.id, { [key]: value });
    },
    [primaryNode]
  );

  const updateRGB = useCallback(
    (group: 'lift' | 'gamma' | 'gain', channel: 'r' | 'g' | 'b', value: number) => {
      if (!primaryNode) return;
      const current = (primaryNode.params as PrimaryParams)[group];
      colorEngine.updateNodeParams(primaryNode.id, {
        [group]: { ...current, [channel]: value },
      });
    },
    [primaryNode]
  );

  return (
    <div className="tab-content">
      <div className="inspector-section">
        <div className="inspector-section-title">Color Wheels</div>
        <div className="color-wheels-row">
          <ColorWheel
            label="Lift"
            r={params.lift.r}
            g={params.lift.g}
            b={params.lift.b}
            onChangeR={(v) => updateRGB('lift', 'r', v)}
            onChangeG={(v) => updateRGB('lift', 'g', v)}
            onChangeB={(v) => updateRGB('lift', 'b', v)}
          />
          <ColorWheel
            label="Gamma"
            r={params.gamma.r}
            g={params.gamma.g}
            b={params.gamma.b}
            onChangeR={(v) => updateRGB('gamma', 'r', v)}
            onChangeG={(v) => updateRGB('gamma', 'g', v)}
            onChangeB={(v) => updateRGB('gamma', 'b', v)}
          />
          <ColorWheel
            label="Gain"
            r={params.gain.r}
            g={params.gain.g}
            b={params.gain.b}
            onChangeR={(v) => updateRGB('gain', 'r', v)}
            onChangeG={(v) => updateRGB('gain', 'g', v)}
            onChangeB={(v) => updateRGB('gain', 'b', v)}
          />
        </div>
      </div>

      <div className="inspector-section">
        <div className="inspector-section-title">Adjustments</div>
        <Slider
          label="Saturation"
          value={params.saturation}
          min={0}
          max={3}
          step={0.01}
          onChange={(v) => updateParam('saturation', v)}
        />
        <Slider
          label="Contrast"
          value={params.contrast}
          min={0}
          max={3}
          step={0.01}
          onChange={(v) => updateParam('contrast', v)}
        />
        <Slider
          label="Temperature"
          value={params.temperature}
          min={-1}
          max={1}
          step={0.01}
          onChange={(v) => updateParam('temperature', v)}
        />
        <Slider
          label="Tint"
          value={params.tint}
          min={-1}
          max={1}
          step={0.01}
          onChange={(v) => updateParam('tint', v)}
        />
      </div>
    </div>
  );
}

// ─── Curves Tab ──────────────────────────────────────────────────────────────

type CurveChannel = 'master' | 'red' | 'green' | 'blue';

const CURVE_COLORS: Record<CurveChannel, string> = {
  master: 'rgba(255,255,255,0.85)',
  red: '#f87171',
  green: '#4ade80',
  blue: '#60a5fa',
};

function CurvesTab() {
  const { nodes, selectedNodeId } = useColorStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeChannel, setActiveChannel] = useState<CurveChannel>('master');
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  // Find the first curves node
  const curvesNode = nodes.find((n) => {
    if (selectedNodeId && n.id === selectedNodeId && n.type === 'curves') return true;
    return n.type === 'curves';
  });

  const params: CurveParams = (curvesNode?.params as CurveParams) ?? {
    master: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    red: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    green: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    blue: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  };

  const points = params[activeChannel];
  const W = 280;
  const H = 160;

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      const x = (W * i) / 4;
      const y = (H * i) / 4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Diagonal reference line
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(W, 0);
    ctx.stroke();

    // Draw all channels faintly, active channel brightly
    const channels: CurveChannel[] = ['red', 'green', 'blue', 'master'];
    for (const ch of channels) {
      const pts = params[ch];
      const isActive = ch === activeChannel;
      ctx.strokeStyle = isActive ? CURVE_COLORS[ch] : CURVE_COLORS[ch].replace(')', ',0.15)').replace('rgba', 'rgba').replace('rgb(', 'rgba(');
      if (!isActive && ch !== 'master') {
        ctx.strokeStyle = 'rgba(128,128,128,0.1)';
      }
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const px = pts[i].x * W;
        const py = (1 - pts[i].y) * H;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Draw points for active channel
      if (isActive) {
        for (let i = 0; i < pts.length; i++) {
          const px = pts[i].x * W;
          const py = (1 - pts[i].y) * H;
          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fillStyle = CURVE_COLORS[ch];
          ctx.fill();
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }, [params, activeChannel, W, H]);

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!curvesNode) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = 1 - (e.clientY - rect.top) / rect.height;

      // Check if clicking near existing point
      let nearestIdx = -1;
      let nearestDist = Infinity;
      for (let i = 0; i < points.length; i++) {
        const dist = Math.hypot(points[i].x - mx, points[i].y - my);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }

      if (nearestDist < 0.06) {
        // Drag existing point
        setDraggingIdx(nearestIdx);
      } else {
        // Add a new point
        const newPoints = [...points, { x: mx, y: my }].sort((a, b) => a.x - b.x);
        colorEngine.updateNodeParams(curvesNode.id, {
          [activeChannel]: newPoints,
        });
        // Find the index of the newly added point
        const idx = newPoints.findIndex((p) => p.x === mx && p.y === my);
        setDraggingIdx(idx);
      }
    },
    [curvesNode, points, activeChannel]
  );

  useEffect(() => {
    if (draggingIdx === null || !curvesNode) return;

    const handleMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const my = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));

      const newPoints = [...points];
      if (draggingIdx >= 0 && draggingIdx < newPoints.length) {
        newPoints[draggingIdx] = { x: mx, y: my };
        newPoints.sort((a, b) => a.x - b.x);
        colorEngine.updateNodeParams(curvesNode.id, {
          [activeChannel]: newPoints,
        });
      }
    };

    const handleUp = () => {
      setDraggingIdx(null);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [draggingIdx, curvesNode, points, activeChannel]);

  return (
    <div className="tab-content">
      <div className="inspector-section">
        <div className="inspector-section-title">Curves</div>

        {/* Channel selector */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
          {(['master', 'red', 'green', 'blue'] as CurveChannel[]).map((ch) => (
            <button
              key={ch}
              onClick={() => setActiveChannel(ch)}
              style={{
                flex: 1,
                padding: '3px 6px',
                border: activeChannel === ch ? `1px solid ${CURVE_COLORS[ch]}` : '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                background: activeChannel === ch ? 'var(--bg-elevated)' : 'transparent',
                color: CURVE_COLORS[ch],
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {ch === 'master' ? 'M' : ch[0].toUpperCase()}
            </button>
          ))}
        </div>

        {/* Curves canvas */}
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="curves-canvas"
          style={{ width: '100%', height: H, cursor: 'crosshair' }}
          onMouseDown={handleCanvasMouseDown}
        />
      </div>
    </div>
  );
}

// ─── Hue/Sat Tab ─────────────────────────────────────────────────────────────

function HueSatTab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const W = 280;
  const H = 100;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    // Draw hue spectrum on x axis
    for (let x = 0; x < W; x++) {
      const hue = (x / W) * 360;
      ctx.fillStyle = `hsl(${hue}, 70%, 40%)`;
      ctx.fillRect(x, H - 3, 1, 3);
    }

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      const y = (H * i) / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Flat line at center (default — no adjustment)
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Hue vs Sat', 6, 14);
  }, []);

  return (
    <div className="tab-content">
      <div className="inspector-section">
        <div className="inspector-section-title">Hue vs Saturation</div>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="curves-canvas"
          style={{ width: '100%', height: H, cursor: 'crosshair' }}
        />
      </div>

      <div className="inspector-section">
        <div className="inspector-section-title">Hue vs Luminance</div>
        <div
          className="curves-canvas"
          style={{
            width: '100%',
            height: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          Hue vs Lum
        </div>
      </div>
    </div>
  );
}

// ─── Qualification Tab ───────────────────────────────────────────────────────

function QualificationTab() {
  const [hueMin, setHueMin] = useState(0);
  const [hueMax, setHueMax] = useState(360);
  const [satMin, setSatMin] = useState(0);
  const [satMax, setSatMax] = useState(100);
  const [lumMin, setLumMin] = useState(0);
  const [lumMax, setLumMax] = useState(100);
  const [softness, setSoftness] = useState(10);
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="tab-content">
      <div className="inspector-section">
        <div className="inspector-section-title">HSL Qualifier</div>

        <Slider label="Hue Min" value={hueMin} min={0} max={360} step={1} onChange={setHueMin} />
        <Slider label="Hue Max" value={hueMax} min={0} max={360} step={1} onChange={setHueMax} />

        <div style={{ height: 6 }} />

        <Slider label="Sat Min" value={satMin} min={0} max={100} step={1} onChange={setSatMin} />
        <Slider label="Sat Max" value={satMax} min={0} max={100} step={1} onChange={setSatMax} />

        <div style={{ height: 6 }} />

        <Slider label="Lum Min" value={lumMin} min={0} max={100} step={1} onChange={setLumMin} />
        <Slider label="Lum Max" value={lumMax} min={0} max={100} step={1} onChange={setLumMax} />

        <div style={{ height: 6 }} />

        <Slider label="Softness" value={softness} min={0} max={100} step={1} onChange={setSoftness} />
      </div>

      <div className="inspector-section">
        <div className="property-row">
          <div className="property-label">Preview</div>
          <div className="property-value">
            <div
              className={`effect-toggle${showPreview ? ' on' : ''}`}
              onClick={() => setShowPreview(!showPreview)}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {showPreview ? 'On' : 'Off'}
            </span>
          </div>
        </div>

        {/* Qualification preview area */}
        {showPreview && (
          <div
            style={{
              width: '100%',
              height: 60,
              background: '#000',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Qualifier Matte Preview
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Node Graph Tab ──────────────────────────────────────────────────────────

function NodeGraphTab() {
  const { nodes, connections, selectedNodeId, selectNode, addNode, removeNode } = useColorStore();
  const canvasRef = useRef<HTMLDivElement>(null);

  // Position nodes in a horizontal chain
  const nodePositions = new Map<string, { x: number; y: number }>();
  const chain = colorEngine.getNodeChain();
  chain.forEach((node, i) => {
    nodePositions.set(node.id, {
      x: 20 + i * 100,
      y: 60,
    });
  });

  // Add any nodes not in the chain
  let orphanY = 140;
  for (const node of nodes) {
    if (!nodePositions.has(node.id)) {
      nodePositions.set(node.id, { x: 20, y: orphanY });
      orphanY += 60;
    }
  }

  return (
    <div className="tab-content">
      <div className="inspector-section">
        <div className="inspector-section-title">Node Graph</div>

        {/* Add node buttons */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
          {(['primary', 'curves', 'huesat', 'secondary', 'lut', 'mixer'] as ColorNodeType[]).map(
            (type) => (
              <button
                key={type}
                onClick={() => addNode(type)}
                style={{
                  padding: '2px 6px',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-elevated)',
                  color: NODE_COLORS[type],
                  fontSize: 9,
                  cursor: 'pointer',
                }}
              >
                + {type}
              </button>
            )
          )}
        </div>

        {/* Graph area */}
        <div
          ref={canvasRef}
          style={{
            position: 'relative',
            width: '100%',
            height: 200,
            background: 'var(--bg-void)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-default)',
            overflow: 'auto',
          }}
        >
          {/* SVG lines for connections */}
          <svg
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          >
            {connections.map((conn, i) => {
              const fromPos = nodePositions.get(conn.from);
              const toPos = nodePositions.get(conn.to);
              if (!fromPos || !toPos) return null;
              return (
                <line
                  key={i}
                  x1={fromPos.x + 40}
                  y1={fromPos.y + 20}
                  x2={toPos.x}
                  y2={toPos.y + 20}
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="1.5"
                />
              );
            })}
          </svg>

          {/* Node cards */}
          {nodes.map((node) => {
            const pos = nodePositions.get(node.id) ?? { x: 0, y: 0 };
            const isSelected = node.id === selectedNodeId;
            return (
              <div
                key={node.id}
                onClick={() => selectNode(node.id)}
                style={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y,
                  width: 80,
                  height: 40,
                  background: 'var(--bg-raised)',
                  border: isSelected
                    ? `2px solid ${NODE_COLORS[node.type]}`
                    : '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  opacity: node.enabled ? 1 : 0.4,
                  transition: 'border-color 0.15s',
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: NODE_COLORS[node.type],
                    marginBottom: 2,
                  }}
                />
                <div
                  style={{
                    fontSize: 8,
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-mono)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  {node.type}
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected node info */}
        {selectedNodeId && (
          <div style={{ marginTop: 8 }}>
            <div className="property-row">
              <div className="property-label">Selected</div>
              <div style={{ fontSize: 10, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {nodes.find((n) => n.id === selectedNodeId)?.type ?? 'none'}
              </div>
            </div>
            {/* Delete button (don't allow deleting source/output) */}
            {(() => {
              const selNode = nodes.find((n) => n.id === selectedNodeId);
              if (selNode && selNode.type !== 'source' && selNode.type !== 'output') {
                return (
                  <button
                    onClick={() => {
                      removeNode(selectedNodeId);
                      useColorStore.getState().selectNode(null);
                    }}
                    style={{
                      width: '100%',
                      padding: '4px 8px',
                      border: '1px solid var(--error)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'transparent',
                      color: 'var(--error)',
                      fontSize: 10,
                      cursor: 'pointer',
                      marginTop: 4,
                    }}
                  >
                    Delete Node
                  </button>
                );
              }
              return null;
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Gallery Bar ─────────────────────────────────────────────────────────────

function GalleryBar() {
  const { stills, looks, saveLook, saveStill } = useColorStore();
  const [lookName, setLookName] = useState('');

  const handleSaveStill = useCallback(() => {
    saveStill(`Still ${stills.length + 1}`);
  }, [stills.length, saveStill]);

  const handleSaveLook = useCallback(() => {
    if (lookName.trim()) {
      saveLook(lookName.trim());
      setLookName('');
    }
  }, [lookName, saveLook]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
        overflowX: 'auto',
        flexShrink: 0,
      }}
    >
      {/* Save still button */}
      <button
        onClick={handleSaveStill}
        style={{
          padding: '3px 8px',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-elevated)',
          color: 'var(--text-secondary)',
          fontSize: 9,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        Save Still
      </button>

      {/* Stills */}
      {stills.map((still) => (
        <div
          key={still.id}
          style={{
            width: 48,
            height: 28,
            background: 'var(--bg-void)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 7,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          title={still.name}
        >
          {still.name.slice(0, 6)}
        </div>
      ))}

      {/* Separator */}
      {(stills.length > 0 || looks.length > 0) && (
        <div
          style={{
            width: 1,
            height: 20,
            background: 'var(--border-subtle)',
            flexShrink: 0,
          }}
        />
      )}

      {/* Looks */}
      {looks.map((look) => (
        <div
          key={look.id}
          onClick={() => useColorStore.getState().loadLook(look.id)}
          style={{
            width: 48,
            height: 28,
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--brand-dim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 7,
            color: 'var(--brand-bright)',
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          title={look.name}
        >
          {look.name.slice(0, 6)}
        </div>
      ))}

      {/* Save look input */}
      <div style={{ display: 'flex', gap: 3, marginLeft: 'auto', flexShrink: 0 }}>
        <input
          type="text"
          placeholder="Look name..."
          value={lookName}
          onChange={(e) => setLookName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSaveLook()}
          style={{
            width: 80,
            padding: '2px 6px',
            background: 'var(--bg-void)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontSize: 9,
            outline: 'none',
          }}
        />
        <button
          onClick={handleSaveLook}
          style={{
            padding: '2px 6px',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
            fontSize: 9,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Save Look
        </button>
      </div>
    </div>
  );
}

// ─── Main Color Panel ────────────────────────────────────────────────────────

export function ColorPanel() {
  const { activeView, setActiveView, abWipeEnabled, toggleABWipe, abWipePosition, setABWipePosition } =
    useColorStore();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-surface)',
        overflow: 'hidden',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          padding: '0 8px',
          height: 30,
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--bg-raised)',
          flexShrink: 0,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.value}
            className={`panel-tab${activeView === tab.value ? ' active' : ''}`}
            onClick={() => setActiveView(tab.value)}
            style={{
              padding: '4px 10px',
              border: 'none',
              borderBottom: activeView === tab.value ? '2px solid var(--brand)' : '2px solid transparent',
              background: activeView === tab.value ? 'var(--bg-elevated)' : 'transparent',
              color: activeView === tab.value ? 'var(--text-primary)' : 'var(--text-tertiary)',
              fontSize: 10.5,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
              letterSpacing: 0.3,
            }}
          >
            {tab.label}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* A/B Wipe toggle */}
        <button
          onClick={toggleABWipe}
          style={{
            padding: '3px 6px',
            border: abWipeEnabled ? '1px solid var(--brand)' : '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            background: abWipeEnabled ? 'var(--brand-dim)' : 'transparent',
            color: abWipeEnabled ? 'var(--brand-bright)' : 'var(--text-muted)',
            fontSize: 9,
            fontWeight: 600,
            cursor: 'pointer',
          }}
          title="A/B Wipe Compare"
        >
          A|B
        </button>
      </div>

      {/* A/B wipe slider (shown when enabled) */}
      {abWipeEnabled && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>A</span>
          <input
            type="range"
            min={0}
            max={100}
            value={abWipePosition}
            onChange={(e) => setABWipePosition(parseInt(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>B</span>
        </div>
      )}

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {activeView === 'wheels' && <WheelsTab />}
        {activeView === 'curves' && <CurvesTab />}
        {activeView === 'huesat' && <HueSatTab />}
        {activeView === 'qualification' && <QualificationTab />}
        {activeView === 'nodeGraph' && <NodeGraphTab />}
      </div>

      {/* Gallery bar */}
      <GalleryBar />
    </div>
  );
}
