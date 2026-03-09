// =============================================================================
//  Power Windows Panel — Shape-Based Isolation Tools
//  Circle, Linear, Polygon, Gradient shapes with property controls.
// =============================================================================

import React, { useCallback } from 'react';
import { useColorStore, PowerWindow } from '../../store/color.store';

const SHAPE_ICONS: Record<PowerWindow['type'], string> = {
  circle: '\u25EF',   // Large circle
  linear: '\u25AD',   // White rectangle
  polygon: '\u2B23',  // Hexagon
  gradient: '\u2581',  // Lower block
};

export function PowerWindowsPanel() {
  const windows = useColorStore((s) => s.powerWindows);
  const selectedWindowId = useColorStore((s) => s.selectedWindowId);
  const addPowerWindow = useColorStore((s) => s.addPowerWindow);
  const removePowerWindow = useColorStore((s) => s.removePowerWindow);
  const updatePowerWindow = useColorStore((s) => s.updatePowerWindow);
  const selectPowerWindow = useColorStore((s) => s.selectPowerWindow);

  const selected = windows.find((w) => w.id === selectedWindowId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 4, padding: '4px 8px' }}>
      {/* Shape tools */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', marginRight: 4 }}>Add:</span>
        {(['circle', 'linear', 'polygon', 'gradient'] as const).map((type) => (
          <button
            key={type}
            onClick={() => addPowerWindow(type)}
            title={type}
            style={{
              width: 28,
              height: 24,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-raised)',
              border: '1px solid var(--border-default)',
              borderRadius: 3,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {SHAPE_ICONS[type]}
          </button>
        ))}
      </div>

      {/* Window list */}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {windows.map((w) => (
          <div
            key={w.id}
            onClick={() => selectPowerWindow(w.id)}
            style={{
              padding: '2px 8px',
              fontSize: 9,
              background: w.id === selectedWindowId ? 'var(--bg-active)' : 'var(--bg-raised)',
              border: `1px solid ${w.id === selectedWindowId ? 'var(--brand)' : 'var(--border-default)'}`,
              borderRadius: 3,
              cursor: 'pointer',
              color: w.enabled ? 'var(--text-primary)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>{SHAPE_ICONS[w.type]}</span>
            <span>{w.type}</span>
            <button
              onClick={(e) => { e.stopPropagation(); removePowerWindow(w.id); }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 9,
                padding: 0,
              }}
            >
              x
            </button>
          </div>
        ))}
      </div>

      {/* Properties for selected window */}
      {selected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, borderTop: '1px solid var(--border-default)', paddingTop: 4, flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <PropertySlider label="Center X" value={selected.centerX} min={0} max={1} step={0.01} onChange={(v) => updatePowerWindow(selected.id, { centerX: v })} />
            <PropertySlider label="Center Y" value={selected.centerY} min={0} max={1} step={0.01} onChange={(v) => updatePowerWindow(selected.id, { centerY: v })} />
            {(selected.type === 'circle') && (
              <>
                <PropertySlider label="Radius X" value={selected.radiusX} min={0.01} max={1} step={0.01} onChange={(v) => updatePowerWindow(selected.id, { radiusX: v })} />
                <PropertySlider label="Radius Y" value={selected.radiusY} min={0.01} max={1} step={0.01} onChange={(v) => updatePowerWindow(selected.id, { radiusY: v })} />
              </>
            )}
            {(selected.type === 'linear') && (
              <>
                <PropertySlider label="Width" value={selected.width} min={0.01} max={2} step={0.01} onChange={(v) => updatePowerWindow(selected.id, { width: v })} />
                <PropertySlider label="Height" value={selected.height} min={0.01} max={2} step={0.01} onChange={(v) => updatePowerWindow(selected.id, { height: v })} />
              </>
            )}
            <PropertySlider label="Rotation" value={selected.rotation} min={0} max={360} step={1} onChange={(v) => updatePowerWindow(selected.id, { rotation: v })} />
            <PropertySlider label="Softness" value={selected.softness} min={0} max={1} step={0.01} onChange={(v) => updatePowerWindow(selected.id, { softness: v })} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selected.invert}
                onChange={(e) => updatePowerWindow(selected.id, { invert: e.target.checked })}
                style={{ width: 12, height: 12 }}
              />
              Invert
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selected.enabled}
                onChange={(e) => updatePowerWindow(selected.id, { enabled: e.target.checked })}
                style={{ width: 12, height: 12 }}
              />
              Enabled
            </label>
          </div>
        </div>
      )}

      {windows.length === 0 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
          Click a shape tool to add a power window
        </div>
      )}
    </div>
  );
}

function PropertySlider({
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 120 }}>
      <span style={{ fontSize: 8, color: 'var(--text-muted)', width: 44, flexShrink: 0 }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, minWidth: 0, height: 3 }}
      />
      <span style={{ fontSize: 8, fontFamily: 'monospace', color: 'var(--text-secondary)', width: 30, textAlign: 'right' }}>
        {value.toFixed(step < 1 ? 2 : 0)}
      </span>
    </div>
  );
}
