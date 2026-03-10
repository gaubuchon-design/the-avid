// =============================================================================
//  Scopes Panel — Waveform / Vectorscope / Histogram / Parade
//  Wired to record-monitor frames with a functional pre/post grading toggle.
// =============================================================================

import React, { useCallback, useEffect, useRef } from 'react';
import { useColorStore, ScopeType } from '../../store/color.store';
import { scopesEngine } from '../../engine/ScopesEngine';
import { colorEngine } from '../../engine/ColorEngine';

const SCOPE_TABS: { value: ScopeType; label: string }[] = [
  { value: 'waveform', label: 'Wave' },
  { value: 'vectorscope', label: 'Vector' },
  { value: 'histogram', label: 'Histo' },
  { value: 'parade', label: 'Parade' },
];

const SCOPE_SAMPLE_WIDTH = 320;
const SCOPE_SAMPLE_HEIGHT = 200;

export function ScopesPanel() {
  const scopeType = useColorStore((s) => s.scopeType);
  const scopePosition = useColorStore((s) => s.scopePosition);
  const setScopeType = useColorStore((s) => s.setScopeType);
  const setScopePosition = useColorStore((s) => s.setScopePosition);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameTickRef = useRef(0);

  const renderScope = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    scopesEngine.setActiveScopeType(scopeType);

    const preGradeFrame =
      sampleRecordMonitorFrame(SCOPE_SAMPLE_WIDTH, SCOPE_SAMPLE_HEIGHT)
      ?? createFallbackFrame(SCOPE_SAMPLE_WIDTH, SCOPE_SAMPLE_HEIGHT, frameTickRef.current);

    const scopeSource = scopePosition === 'post'
      ? colorEngine.processFrame(cloneImageData(preGradeFrame))
      : preGradeFrame;

    scopesEngine.updateAndRender(scopeSource, canvas);
    frameTickRef.current += 1;
  }, [scopePosition, scopeType]);

  useEffect(() => {
    renderScope();
  }, [renderScope]);

  useEffect(() => {
    const interval = setInterval(renderScope, 100);
    return () => clearInterval(interval);
  }, [renderScope]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
        {SCOPE_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setScopeType(tab.value)}
            style={{
              padding: '3px 8px',
              fontSize: 9,
              fontWeight: scopeType === tab.value ? 600 : 400,
              color: scopeType === tab.value ? 'var(--text-primary)' : 'var(--text-muted)',
              background: scopeType === tab.value ? 'var(--bg-active)' : 'transparent',
              border: 'none',
              borderBottom: scopeType === tab.value ? '1px solid var(--brand)' : '1px solid transparent',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setScopePosition(scopePosition === 'pre' ? 'post' : 'pre')}
          style={{
            padding: '3px 6px',
            fontSize: 8,
            color: 'var(--text-muted)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textTransform: 'uppercase',
          }}
          title="Toggle scopes between pre-grade and post-grade image data"
        >
          {scopePosition}
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, background: '#000' }}>
        <canvas
          ref={canvasRef}
          width={SCOPE_SAMPLE_WIDTH}
          height={SCOPE_SAMPLE_HEIGHT}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
    </div>
  );
}

function cloneImageData(source: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
}

function sampleRecordMonitorFrame(width: number, height: number): ImageData | null {
  const monitorCanvas = document.querySelector('[aria-label="Record Monitor"] canvas');
  if (!(monitorCanvas instanceof HTMLCanvasElement)) return null;

  const scratchCanvas = document.createElement('canvas');
  scratchCanvas.width = width;
  scratchCanvas.height = height;
  const scratchCtx = scratchCanvas.getContext('2d');
  if (!scratchCtx) return null;

  try {
    scratchCtx.drawImage(monitorCanvas, 0, 0, width, height);
    return scratchCtx.getImageData(0, 0, width, height);
  } catch {
    return null;
  }
}

function createFallbackFrame(width: number, height: number, tick: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  const phase = tick * 0.03;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const nx = x / Math.max(1, width - 1);
      const ny = y / Math.max(1, height - 1);
      const wave = Math.sin((nx * 6 + phase)) * 0.5 + 0.5;
      const sweep = Math.cos((ny * 9 - phase * 0.7)) * 0.5 + 0.5;
      data[idx] = Math.round(wave * 255);
      data[idx + 1] = Math.round(sweep * 255);
      data[idx + 2] = Math.round(((1 - nx) * 0.6 + ny * 0.4) * 255);
      data[idx + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}
