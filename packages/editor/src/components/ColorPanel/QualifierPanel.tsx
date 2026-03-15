// =============================================================================
//  HSL Qualifier Panel — Range-based color isolation
//  Hue/Sat/Lum range sliders with matte preview modes.
// =============================================================================

import React, { useCallback, useRef, useEffect } from 'react';
import { colorEngine, SecondaryParams } from '../../engine/ColorEngine';
import { useColorStore } from '../../store/color.store';

// ── Range Slider with Color Preview ──────────────────────────────────────────

function QualifierRange({
  label,
  low,
  high,
  softness,
  min,
  max,
  step,
  gradient,
  onChangeLow,
  onChangeHigh,
  onChangeSoftness,
}: {
  label: string;
  low: number;
  high: number;
  softness: number;
  min: number;
  max: number;
  step: number;
  gradient: string;
  onChangeLow: (v: number) => void;
  onChangeHigh: (v: number) => void;
  onChangeSoftness: (v: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Draw gradient bar
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    if (gradient === 'hue') {
      for (let i = 0; i <= 12; i++) {
        grad.addColorStop(i / 12, `hsl(${i * 30}, 100%, 50%)`);
      }
    } else if (gradient === 'sat') {
      grad.addColorStop(0, 'hsl(0, 0%, 50%)');
      grad.addColorStop(1, 'hsl(0, 100%, 50%)');
    } else {
      grad.addColorStop(0, '#000');
      grad.addColorStop(1, '#fff');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Dim outside range
    const range = max - min;
    const lowPx = ((low - min) / range) * w;
    const highPx = ((high - min) / range) * w;
    const softPx = (softness / range) * w;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, Math.max(0, lowPx - softPx), h);
    ctx.fillRect(Math.min(w, highPx + softPx), 0, w - highPx - softPx, h);

    // Softness gradient
    if (softPx > 0) {
      const leftGrad = ctx.createLinearGradient(lowPx - softPx, 0, lowPx, 0);
      leftGrad.addColorStop(0, 'rgba(0,0,0,0.7)');
      leftGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = leftGrad;
      ctx.fillRect(lowPx - softPx, 0, softPx, h);

      const rightGrad = ctx.createLinearGradient(highPx, 0, highPx + softPx, 0);
      rightGrad.addColorStop(0, 'rgba(0,0,0,0)');
      rightGrad.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.fillStyle = rightGrad;
      ctx.fillRect(highPx, 0, softPx, h);
    }

    // Range markers
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(lowPx, 0); ctx.lineTo(lowPx, h);
    ctx.moveTo(highPx, 0); ctx.lineTo(highPx, h);
    ctx.stroke();
  }, [low, high, softness, min, max, gradient]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', width: 24 }}>{label}</span>
        <canvas
          ref={canvasRef}
          width={280}
          height={16}
          style={{ width: '100%', height: 16, borderRadius: 3, cursor: 'pointer' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, paddingLeft: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 9, color: 'var(--text-muted)' }}>
          <span>Low</span>
          <input
            type="number"
            value={low.toFixed(step < 1 ? 2 : 0)}
            step={step}
            style={{ width: 42, fontSize: 9, background: 'var(--bg-inset)', border: '1px solid var(--border-default)', borderRadius: 2, color: 'var(--text-primary)', padding: '1px 3px' }}
            onChange={(e) => onChangeLow(parseFloat(e.target.value) || 0)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 9, color: 'var(--text-muted)' }}>
          <span>High</span>
          <input
            type="number"
            value={high.toFixed(step < 1 ? 2 : 0)}
            step={step}
            style={{ width: 42, fontSize: 9, background: 'var(--bg-inset)', border: '1px solid var(--border-default)', borderRadius: 2, color: 'var(--text-primary)', padding: '1px 3px' }}
            onChange={(e) => onChangeHigh(parseFloat(e.target.value) || 0)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 9, color: 'var(--text-muted)' }}>
          <span>Soft</span>
          <input
            type="number"
            value={softness.toFixed(2)}
            step={0.01}
            style={{ width: 42, fontSize: 9, background: 'var(--bg-inset)', border: '1px solid var(--border-default)', borderRadius: 2, color: 'var(--text-primary)', padding: '1px 3px' }}
            onChange={(e) => onChangeSoftness(parseFloat(e.target.value) || 0)}
          />
        </div>
      </div>
    </div>
  );
}

// ── Qualifier Panel ──────────────────────────────────────────────────────────

export function QualifierPanel() {
  const nodes = useColorStore((s) => s.nodes);
  const selectedNodeId = useColorStore((s) => s.selectedNodeId);
  const qualifierShowMatte = useColorStore((s) => s.qualifierShowMatte);
  const qualifierMatteMode = useColorStore((s) => s.qualifierMatteMode);
  const setQualifierShowMatte = useColorStore((s) => s.setQualifierShowMatte);
  const setQualifierMatteMode = useColorStore((s) => s.setQualifierMatteMode);

  const secondaryNode = nodes.find((n) => {
    if (selectedNodeId) return n.id === selectedNodeId && n.type === 'secondary';
    return n.type === 'secondary';
  });

  const params = (secondaryNode?.params ?? {
    hueRange: [0, 360],
    satRange: [0, 1],
    lumRange: [0, 1],
    softness: 0.1,
    enabled: true,
  }) as SecondaryParams;

  const update = useCallback((updates: Partial<SecondaryParams>) => {
    if (!secondaryNode) return;
    colorEngine.updateNodeParams(secondaryNode.id, updates);
  }, [secondaryNode]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 6, padding: '6px 8px' }}>
      {/* Qualifier ranges */}
      <QualifierRange
        label="Hue"
        low={params.hueRange[0]}
        high={params.hueRange[1]}
        softness={params.softness * 360}
        min={0}
        max={360}
        step={1}
        gradient="hue"
        onChangeLow={(v) => update({ hueRange: [v, params.hueRange[1]] })}
        onChangeHigh={(v) => update({ hueRange: [params.hueRange[0], v] })}
        onChangeSoftness={(v) => update({ softness: v / 360 })}
      />
      <QualifierRange
        label="Sat"
        low={params.satRange[0]}
        high={params.satRange[1]}
        softness={params.softness}
        min={0}
        max={1}
        step={0.01}
        gradient="sat"
        onChangeLow={(v) => update({ satRange: [v, params.satRange[1]] })}
        onChangeHigh={(v) => update({ satRange: [params.satRange[0], v] })}
        onChangeSoftness={(v) => update({ softness: v })}
      />
      <QualifierRange
        label="Lum"
        low={params.lumRange[0]}
        high={params.lumRange[1]}
        softness={params.softness}
        min={0}
        max={1}
        step={0.01}
        gradient="lum"
        onChangeLow={(v) => update({ lumRange: [v, params.lumRange[1]] })}
        onChangeHigh={(v) => update({ lumRange: [params.lumRange[0], v] })}
        onChangeSoftness={(v) => update({ softness: v })}
      />

      {/* Matte preview controls */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', borderTop: '1px solid var(--border-default)', paddingTop: 4 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={qualifierShowMatte}
            onChange={(e) => setQualifierShowMatte(e.target.checked)}
            style={{ width: 12, height: 12 }}
          />
          Show Matte
        </label>
        {qualifierShowMatte && (
          <div style={{ display: 'flex', gap: 2 }}>
            {(['highlight', 'bw', 'result'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setQualifierMatteMode(mode)}
                style={{
                  padding: '2px 6px',
                  fontSize: 8,
                  textTransform: 'uppercase',
                  color: qualifierMatteMode === mode ? 'var(--text-primary)' : 'var(--text-muted)',
                  background: qualifierMatteMode === mode ? 'var(--bg-active)' : 'transparent',
                  border: '1px solid var(--border-default)',
                  borderRadius: 2,
                  cursor: 'pointer',
                }}
              >
                {mode}
              </button>
            ))}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={params.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            style={{ width: 12, height: 12 }}
          />
          Enabled
        </label>
      </div>
    </div>
  );
}
