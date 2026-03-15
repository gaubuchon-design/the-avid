// =============================================================================
//  Professional Color Wheels — Lift / Gamma / Gain / Offset
//  Canvas-based HSV wheel with luminance jog, Shift+drag for fine control.
// =============================================================================

import React, { useCallback, useEffect, useRef } from 'react';
import { colorEngine, PrimaryParams, RGB } from '../../engine/ColorEngine';
import { useColorStore } from '../../store/color.store';

// ── Types ────────────────────────────────────────────────────────────────────

interface WheelProps {
  label: string;
  rgb: RGB;
  master: number;
  onChangeRGB: (rgb: Partial<RGB>) => void;
  onChangeMaster: (v: number) => void;
}

// ── Single Color Wheel ───────────────────────────────────────────────────────

function ColorWheel({ label, rgb, master, onChangeRGB, onChangeMaster }: WheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);
  const jogDraggingRef = useRef(false);
  const lastYRef = useRef(0);
  const SIZE = 100;
  const RADIUS = SIZE / 2 - 6;

  // Draw the wheel
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const cx = SIZE / 2;
    const cy = SIZE / 2;

    ctx.clearRect(0, 0, SIZE, SIZE);

    // Draw HSV gradient wheel
    for (let angle = 0; angle < 360; angle += 1) {
      const startAngle = ((angle - 1) * Math.PI) / 180;
      const endAngle = ((angle + 1) * Math.PI) / 180;

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, RADIUS);
      gradient.addColorStop(0, `hsl(${angle}, 0%, 30%)`);
      gradient.addColorStop(0.6, `hsl(${angle}, 60%, 35%)`);
      gradient.addColorStop(1, `hsl(${angle}, 100%, 45%)`);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, RADIUS, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Center crosshair
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy);
    ctx.lineTo(cx + 4, cy);
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(cx, cy + 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Indicator dot (position from RGB offset)
    const dotX = cx + rgb.r * RADIUS * 2;
    const dotY = cy - rgb.g * RADIUS * 2;

    ctx.beginPath();
    ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Line from center to dot
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(dotX, dotY);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }, [rgb.r, rgb.g, rgb.b, SIZE, RADIUS]);

  // Wheel drag handler
  const handleWheelPointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleWheelPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const x = e.clientX - rect.left - cx;
    const y = -(e.clientY - rect.top - cy);

    const fine = e.shiftKey ? 0.25 : 1;
    const scale = fine / (RADIUS * 2);

    onChangeRGB({
      r: Math.max(-0.5, Math.min(0.5, x * scale)),
      g: Math.max(-0.5, Math.min(0.5, y * scale)),
    });
  }, [onChangeRGB, RADIUS]);

  const handleWheelPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const handleDoubleClick = useCallback(() => {
    onChangeRGB({ r: 0, g: 0, b: 0 });
    onChangeMaster(0);
  }, [onChangeRGB, onChangeMaster]);

  // Jog wheel (luminance / master)
  const handleJogPointerDown = useCallback((e: React.PointerEvent) => {
    jogDraggingRef.current = true;
    lastYRef.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleJogPointerMove = useCallback((e: React.PointerEvent) => {
    if (!jogDraggingRef.current) return;
    const dy = lastYRef.current - e.clientY;
    lastYRef.current = e.clientY;
    const fine = e.shiftKey ? 0.001 : 0.005;
    onChangeMaster(Math.max(-1, Math.min(1, master + dy * fine)));
  }, [master, onChangeMaster]);

  const handleJogPointerUp = useCallback(() => {
    jogDraggingRef.current = false;
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 110 }}>
      {/* Label */}
      <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>
        {label}
      </div>

      {/* Wheel */}
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        style={{ width: SIZE, height: SIZE, cursor: 'crosshair', borderRadius: '50%' }}
        onPointerDown={handleWheelPointerDown}
        onPointerMove={handleWheelPointerMove}
        onPointerUp={handleWheelPointerUp}
        onDoubleClick={handleDoubleClick}
      />

      {/* Master jog */}
      <div
        style={{
          width: SIZE - 10,
          height: 14,
          background: 'var(--bg-inset)',
          borderRadius: 7,
          cursor: 'ns-resize',
          position: 'relative',
          overflow: 'hidden',
          border: '1px solid var(--border-default)',
        }}
        onPointerDown={handleJogPointerDown}
        onPointerMove={handleJogPointerMove}
        onPointerUp={handleJogPointerUp}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            bottom: 0,
            width: Math.abs(master) * 50 + '%',
            marginLeft: master >= 0 ? 0 : -Math.abs(master) * 50 + '%',
            background: 'var(--brand)',
            opacity: 0.6,
          }}
        />
      </div>

      {/* Numeric readouts */}
      <div style={{ display: 'flex', gap: 4, fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
        <span style={{ color: '#f87171' }}>{rgb.r.toFixed(2)}</span>
        <span style={{ color: '#4ade80' }}>{rgb.g.toFixed(2)}</span>
        <span style={{ color: '#60a5fa' }}>{rgb.b.toFixed(2)}</span>
        <span>{master.toFixed(2)}</span>
      </div>
    </div>
  );
}

// ── Primary Wheels Panel ─────────────────────────────────────────────────────

export function PrimaryWheels() {
  const selectedNodeId = useColorStore((s) => s.selectedNodeId);
  const nodes = useColorStore((s) => s.nodes);

  // Find the primary node
  const primaryNode = nodes.find((n) => {
    if (selectedNodeId) return n.id === selectedNodeId && n.type === 'primary';
    return n.type === 'primary';
  });

  const params = (primaryNode?.params ?? {
    lift: { r: 0, g: 0, b: 0 },
    gamma: { r: 0, g: 0, b: 0 },
    gain: { r: 0, g: 0, b: 0 },
    offset: { r: 0, g: 0, b: 0 },
    saturation: 1,
    contrast: 1,
    temperature: 0,
    tint: 0,
  }) as PrimaryParams;

  const updateParam = useCallback((key: string, value: any) => {
    if (!primaryNode) return;
    colorEngine.updateNodeParams(primaryNode.id, { [key]: value });
  }, [primaryNode]);

  const updateWheel = useCallback((wheel: 'lift' | 'gamma' | 'gain' | 'offset', partial: Partial<RGB>) => {
    if (!primaryNode) return;
    const current = params[wheel];
    colorEngine.updateNodeParams(primaryNode.id, {
      [wheel]: { ...current, ...partial },
    });
  }, [primaryNode, params]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 4, padding: '4px 8px' }}>
      {/* Wheels row */}
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start', flex: 1, minHeight: 0 }}>
        <ColorWheel
          label="Lift"
          rgb={params.lift}
          master={0}
          onChangeRGB={(rgb) => updateWheel('lift', rgb)}
          onChangeMaster={() => {}}
        />
        <ColorWheel
          label="Gamma"
          rgb={params.gamma}
          master={0}
          onChangeRGB={(rgb) => updateWheel('gamma', rgb)}
          onChangeMaster={() => {}}
        />
        <ColorWheel
          label="Gain"
          rgb={params.gain}
          master={0}
          onChangeRGB={(rgb) => updateWheel('gain', rgb)}
          onChangeMaster={() => {}}
        />
        <ColorWheel
          label="Offset"
          rgb={params.offset}
          master={0}
          onChangeRGB={(rgb) => updateWheel('offset', rgb)}
          onChangeMaster={() => {}}
        />
      </div>

      {/* Global controls row */}
      <div style={{ display: 'flex', gap: 12, padding: '2px 0', borderTop: '1px solid var(--border-default)' }}>
        <SliderControl label="Sat" value={params.saturation} min={0} max={2} step={0.01} onChange={(v) => updateParam('saturation', v)} />
        <SliderControl label="Contrast" value={params.contrast} min={0.5} max={2} step={0.01} onChange={(v) => updateParam('contrast', v)} />
        <SliderControl label="Temp" value={params.temperature} min={-100} max={100} step={1} onChange={(v) => updateParam('temperature', v)} />
        <SliderControl label="Tint" value={params.tint} min={-100} max={100} step={1} onChange={(v) => updateParam('tint', v)} />
      </div>
    </div>
  );
}

// ── Log Wheels Panel ─────────────────────────────────────────────────────────

export function LogWheels() {
  const selectedNodeId = useColorStore((s) => s.selectedNodeId);
  const nodes = useColorStore((s) => s.nodes);

  const primaryNode = nodes.find((n) => {
    if (selectedNodeId) return n.id === selectedNodeId && n.type === 'primary';
    return n.type === 'primary';
  });

  const params = (primaryNode?.params ?? {
    lift: { r: 0, g: 0, b: 0 },
    gamma: { r: 0, g: 0, b: 0 },
    gain: { r: 0, g: 0, b: 0 },
    offset: { r: 0, g: 0, b: 0 },
    saturation: 1,
    contrast: 1,
    temperature: 0,
    tint: 0,
  }) as PrimaryParams;

  const updateWheel = useCallback((wheel: 'lift' | 'gamma' | 'gain' | 'offset', partial: Partial<RGB>) => {
    if (!primaryNode) return;
    const current = params[wheel];
    colorEngine.updateNodeParams(primaryNode.id, {
      [wheel]: { ...current, ...partial },
    });
  }, [primaryNode, params]);

  const updateParam = useCallback((key: string, value: any) => {
    if (!primaryNode) return;
    colorEngine.updateNodeParams(primaryNode.id, { [key]: value });
  }, [primaryNode]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 4, padding: '4px 8px' }}>
      {/* Log wheels row — mapped to Shadows (lift), Midtones (gamma), Highlights (gain) */}
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start', flex: 1, minHeight: 0 }}>
        <ColorWheel
          label="Shadows"
          rgb={params.lift}
          master={0}
          onChangeRGB={(rgb) => updateWheel('lift', rgb)}
          onChangeMaster={() => {}}
        />
        <ColorWheel
          label="Midtones"
          rgb={params.gamma}
          master={0}
          onChangeRGB={(rgb) => updateWheel('gamma', rgb)}
          onChangeMaster={() => {}}
        />
        <ColorWheel
          label="Highlights"
          rgb={params.gain}
          master={0}
          onChangeRGB={(rgb) => updateWheel('gain', rgb)}
          onChangeMaster={() => {}}
        />
      </div>

      {/* Pivot + controls */}
      <div style={{ display: 'flex', gap: 12, padding: '2px 0', borderTop: '1px solid var(--border-default)' }}>
        <SliderControl label="Sat" value={params.saturation} min={0} max={2} step={0.01} onChange={(v) => updateParam('saturation', v)} />
        <SliderControl label="Contrast" value={params.contrast} min={0.5} max={2} step={0.01} onChange={(v) => updateParam('contrast', v)} />
        <SliderControl label="Pivot" value={0.435} min={0} max={1} step={0.01} onChange={() => {}} />
      </div>
    </div>
  );
}

// ── Compact Slider ───────────────────────────────────────────────────────────

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0, width: 40 }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, minWidth: 0, height: 4 }}
      />
      <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--text-secondary)', width: 36, textAlign: 'right' }}>
        {value.toFixed(2)}
      </span>
    </div>
  );
}
