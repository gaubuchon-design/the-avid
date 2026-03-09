// =============================================================================
//  Professional Curves Editor — Custom + HueSat Curves
//  Cubic spline rendering, multi-channel support, control point manipulation.
// =============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { colorEngine, CurveParams, HueSatParams, Point } from '../../engine/ColorEngine';
import { useColorStore, CurveType } from '../../store/color.store';
import { bakeCurveToLUT } from '../../engine/color/ColorMath';

const CURVE_TYPES: { value: CurveType; label: string }[] = [
  { value: 'custom', label: 'Custom' },
  { value: 'hueVsHue', label: 'Hue vs Hue' },
  { value: 'hueVsSat', label: 'Hue vs Sat' },
  { value: 'hueVsLum', label: 'Hue vs Lum' },
  { value: 'lumVsSat', label: 'Lum vs Sat' },
  { value: 'satVsSat', label: 'Sat vs Sat' },
];

type CustomChannel = 'master' | 'red' | 'green' | 'blue';
const CHANNEL_COLORS: Record<CustomChannel, string> = {
  master: '#ccc',
  red: '#f87171',
  green: '#4ade80',
  blue: '#60a5fa',
};

// ── Canvas Curves Renderer ───────────────────────────────────────────────────

function CurveCanvas({
  points,
  color,
  width,
  height,
  showGrid,
  showHueBar,
  onPointAdd,
  onPointMove,
  onPointRemove,
}: {
  points: Point[];
  color: string;
  width: number;
  height: number;
  showGrid?: boolean;
  showHueBar?: boolean;
  onPointAdd: (pt: Point) => void;
  onPointMove: (index: number, pt: Point) => void;
  onPointRemove: (index: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragIdxRef = useRef<number>(-1);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Hue bar on X axis
    if (showHueBar) {
      for (let x = 0; x < width; x++) {
        const hue = (x / width) * 360;
        ctx.fillStyle = `hsl(${hue}, 80%, 40%)`;
        ctx.fillRect(x, height - 8, 1, 8);
      }
    }

    // Grid
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 0.5;
      for (let i = 1; i < 4; i++) {
        const x = (i / 4) * width;
        const y = (i / 4) * height;
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x, height);
        ctx.moveTo(0, y); ctx.lineTo(width, y);
        ctx.stroke();
      }
      // Diagonal
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(width, 0);
      ctx.stroke();
    }

    // Bake and draw curve
    const lut = bakeCurveToLUT(points, width);
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    for (let x = 0; x < width; x++) {
      const y = height - lut[x] * height;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Control points
    for (const pt of points) {
      const px = pt.x * width;
      const py = height - pt.y * height;

      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [points, color, width, height, showGrid, showHueBar]);

  // Interaction
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = 1 - (e.clientY - rect.top) / rect.height;

    // Check if clicking an existing point
    const threshold = 12 / rect.width;
    let found = -1;
    for (let i = 0; i < points.length; i++) {
      const dx = points[i].x - mx;
      const dy = points[i].y - my;
      if (Math.sqrt(dx * dx + dy * dy) < threshold) {
        found = i;
        break;
      }
    }

    if (e.button === 2 && found >= 0) {
      // Right-click to remove
      e.preventDefault();
      onPointRemove(found);
      return;
    }

    if (found >= 0) {
      dragIdxRef.current = found;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } else {
      // Add new point
      const pt = { x: Math.max(0, Math.min(1, mx)), y: Math.max(0, Math.min(1, my)) };
      onPointAdd(pt);
    }
  }, [points, onPointAdd, onPointRemove]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragIdxRef.current < 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const my = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    onPointMove(dragIdxRef.current, { x: mx, y: my });
  }, [onPointMove]);

  const handlePointerUp = useCallback(() => {
    dragIdxRef.current = -1;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width: '100%', height: '100%', cursor: 'crosshair' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

// ── Curves Editor Panel ──────────────────────────────────────────────────────

export function CurvesEditor() {
  const curveType = useColorStore((s) => s.curveType);
  const setCurveType = useColorStore((s) => s.setCurveType);
  const nodes = useColorStore((s) => s.nodes);
  const selectedNodeId = useColorStore((s) => s.selectedNodeId);
  const [activeChannel, setActiveChannel] = useState<CustomChannel>('master');

  // Find curves or huesat node
  const curvesNode = nodes.find((n) => {
    if (curveType === 'custom') {
      if (selectedNodeId) return n.id === selectedNodeId && n.type === 'curves';
      return n.type === 'curves';
    }
    if (selectedNodeId) return n.id === selectedNodeId && n.type === 'huesat';
    return n.type === 'huesat';
  });

  const curveParams = curvesNode?.params as CurveParams | undefined;
  const hueSatParams = curvesNode?.params as HueSatParams | undefined;

  const getActivePoints = useCallback((): Point[] => {
    if (curveType === 'custom' && curveParams) {
      return curveParams[activeChannel] || [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    }
    if (hueSatParams) {
      const key = curveType as keyof HueSatParams;
      return (hueSatParams[key] as Point[]) || [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }];
    }
    return curveType === 'custom' ? [{ x: 0, y: 0 }, { x: 1, y: 1 }] : [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }];
  }, [curveType, activeChannel, curveParams, hueSatParams]);

  const updatePoints = useCallback((newPoints: Point[]) => {
    if (!curvesNode) return;
    if (curveType === 'custom') {
      colorEngine.updateNodeParams(curvesNode.id, { [activeChannel]: newPoints });
    } else {
      colorEngine.updateNodeParams(curvesNode.id, { [curveType]: newPoints });
    }
  }, [curvesNode, curveType, activeChannel]);

  const handlePointAdd = useCallback((pt: Point) => {
    const pts = [...getActivePoints(), pt].sort((a, b) => a.x - b.x);
    updatePoints(pts);
  }, [getActivePoints, updatePoints]);

  const handlePointMove = useCallback((index: number, pt: Point) => {
    const pts = [...getActivePoints()];
    pts[index] = pt;
    updatePoints(pts);
  }, [getActivePoints, updatePoints]);

  const handlePointRemove = useCallback((index: number) => {
    const pts = getActivePoints().filter((_, i) => i !== index);
    if (pts.length < 2) return; // Keep at least 2 points
    updatePoints(pts);
  }, [getActivePoints, updatePoints]);

  const points = getActivePoints();
  const isHueBased = curveType.startsWith('hue');
  const curveColor = curveType === 'custom' ? CHANNEL_COLORS[activeChannel] : '#fbbf24';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Curve type tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', flexShrink: 0, overflowX: 'auto' }}>
        {CURVE_TYPES.map((ct) => (
          <button
            key={ct.value}
            onClick={() => setCurveType(ct.value)}
            style={{
              padding: '3px 8px',
              fontSize: 9,
              fontWeight: curveType === ct.value ? 600 : 400,
              color: curveType === ct.value ? 'var(--text-primary)' : 'var(--text-muted)',
              background: curveType === ct.value ? 'var(--bg-active)' : 'transparent',
              border: 'none',
              borderBottom: curveType === ct.value ? '2px solid var(--brand)' : '2px solid transparent',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {ct.label}
          </button>
        ))}
      </div>

      {/* Channel selector (custom mode only) */}
      {curveType === 'custom' && (
        <div style={{ display: 'flex', gap: 2, padding: '2px 4px', flexShrink: 0 }}>
          {(['master', 'red', 'green', 'blue'] as CustomChannel[]).map((ch) => (
            <button
              key={ch}
              onClick={() => setActiveChannel(ch)}
              style={{
                padding: '2px 8px',
                fontSize: 9,
                color: activeChannel === ch ? CHANNEL_COLORS[ch] : 'var(--text-muted)',
                background: activeChannel === ch ? 'rgba(255,255,255,0.05)' : 'transparent',
                border: `1px solid ${activeChannel === ch ? CHANNEL_COLORS[ch] + '40' : 'transparent'}`,
                borderRadius: 3,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {ch}
            </button>
          ))}
        </div>
      )}

      {/* Curve canvas */}
      <div style={{ flex: 1, minHeight: 0, padding: 4 }}>
        <CurveCanvas
          points={points}
          color={curveColor}
          width={400}
          height={200}
          showGrid
          showHueBar={isHueBased}
          onPointAdd={handlePointAdd}
          onPointMove={handlePointMove}
          onPointRemove={handlePointRemove}
        />
      </div>
    </div>
  );
}
