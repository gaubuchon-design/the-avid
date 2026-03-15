// =============================================================================
//  THE AVID -- Fusion Page (DaVinci Resolve-Style Node-Based Compositing)
//  Node editor, dual viewers, media pool, effects library, inspector, splines.
// =============================================================================

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { useEditorStore, type Bin, type MediaAsset } from '../store/editor.store';

// ─── Types ──────────────────────────────────────────────────────────────────────

type FusionNodeType =
  | 'MediaIn'
  | 'MediaOut'
  | 'Merge'
  | 'Transform'
  | 'Blur'
  | 'ColorCorrector'
  | 'Background'
  | 'Keyer'
  | 'Tracker'
  | 'Text'
  | 'Resize'
  | 'ChannelBooleans'
  | 'BrightnessContrast'
  | 'ColorSpace'
  | 'Glow'
  | 'Sharpen'
  | 'FastNoise'
  | 'Gradient'
  | 'Polygon';

interface FusionNodePort {
  id: string;
  name: string;
  side: 'input' | 'output';
  dataType: 'image' | 'mask' | 'data';
}

interface FusionNode {
  id: string;
  type: FusionNodeType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ports: FusionNodePort[];
  selected: boolean;
  viewed: 'left' | 'right' | null;
  params: Record<string, number | string | boolean>;
}

interface FusionConnection {
  id: string;
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
}

interface SplineKeyframe {
  frame: number;
  value: number;
  interpolation: 'linear' | 'smooth' | 'step';
}

interface SplineCurve {
  paramName: string;
  color: string;
  keyframes: SplineKeyframe[];
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const NODE_WIDTH = 120;
const NODE_HEIGHT = 52;

const NODE_TYPE_COLORS: Record<FusionNodeType, string> = {
  MediaIn: '#4a9eff',
  MediaOut: '#ff6b4a',
  Merge: '#66cc66',
  Transform: '#cc9944',
  Blur: '#9966cc',
  ColorCorrector: '#cc6699',
  Background: '#669999',
  Keyer: '#99cc33',
  Tracker: '#cc6633',
  Text: '#6699cc',
  Resize: '#cc9966',
  ChannelBooleans: '#7799aa',
  BrightnessContrast: '#cc8866',
  ColorSpace: '#9988aa',
  Glow: '#ccaa44',
  Sharpen: '#88aacc',
  FastNoise: '#88aa77',
  Gradient: '#aa8877',
  Polygon: '#7788aa',
};

const NODE_TYPE_ICONS: Record<FusionNodeType, string> = {
  MediaIn: 'MI',
  MediaOut: 'MO',
  Merge: 'Mg',
  Transform: 'Xf',
  Blur: 'Bl',
  ColorCorrector: 'CC',
  Background: 'BG',
  Keyer: 'Ky',
  Tracker: 'Tk',
  Text: 'Tx',
  Resize: 'Rz',
  ChannelBooleans: 'CB',
  BrightnessContrast: 'BC',
  ColorSpace: 'CS',
  Glow: 'Gl',
  Sharpen: 'Sh',
  FastNoise: 'FN',
  Gradient: 'Gr',
  Polygon: 'Pg',
};

const EFFECTS_CATEGORIES: { name: string; nodes: { type: FusionNodeType; label: string }[] }[] = [
  {
    name: 'Blur',
    nodes: [
      { type: 'Blur', label: 'Blur' },
      { type: 'Glow', label: 'Glow' },
      { type: 'Sharpen', label: 'Sharpen / Unsharp Mask' },
    ],
  },
  {
    name: 'Color',
    nodes: [
      { type: 'ColorCorrector', label: 'Color Corrector' },
      { type: 'BrightnessContrast', label: 'Brightness/Contrast' },
      { type: 'ColorSpace', label: 'Color Space' },
    ],
  },
  {
    name: 'Composite',
    nodes: [
      { type: 'Merge', label: 'Merge' },
      { type: 'ChannelBooleans', label: 'Channel Booleans' },
    ],
  },
  {
    name: 'Creator',
    nodes: [
      { type: 'Background', label: 'Background' },
      { type: 'FastNoise', label: 'Fast Noise' },
      { type: 'Gradient', label: 'Gradient' },
      { type: 'Text', label: 'Text+' },
    ],
  },
  {
    name: 'Matte',
    nodes: [
      { type: 'Keyer', label: 'Delta Keyer' },
      { type: 'Polygon', label: 'Polygon' },
    ],
  },
  {
    name: 'Transform',
    nodes: [
      { type: 'Transform', label: 'Transform' },
      { type: 'Resize', label: 'Resize' },
    ],
  },
  {
    name: 'Tracker',
    nodes: [{ type: 'Tracker', label: 'Tracker' }],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeId(): string {
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makePortId(): string {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getPortsForType(type: FusionNodeType): FusionNodePort[] {
  switch (type) {
    case 'MediaIn':
      return [{ id: makePortId(), name: 'Output', side: 'output', dataType: 'image' }];
    case 'MediaOut':
      return [{ id: makePortId(), name: 'Input', side: 'input', dataType: 'image' }];
    case 'Merge':
      return [
        { id: makePortId(), name: 'Background', side: 'input', dataType: 'image' },
        { id: makePortId(), name: 'Foreground', side: 'input', dataType: 'image' },
        { id: makePortId(), name: 'EffectMask', side: 'input', dataType: 'mask' },
        { id: makePortId(), name: 'Output', side: 'output', dataType: 'image' },
      ];
    case 'Background':
    case 'FastNoise':
    case 'Gradient':
      return [{ id: makePortId(), name: 'Output', side: 'output', dataType: 'image' }];
    case 'Text':
      return [
        { id: makePortId(), name: 'Output', side: 'output', dataType: 'image' },
      ];
    default:
      return [
        { id: makePortId(), name: 'Input', side: 'input', dataType: 'image' },
        { id: makePortId(), name: 'EffectMask', side: 'input', dataType: 'mask' },
        { id: makePortId(), name: 'Output', side: 'output', dataType: 'image' },
      ];
  }
}

function getDefaultParams(type: FusionNodeType): Record<string, number | string | boolean> {
  switch (type) {
    case 'Transform':
      return { positionX: 0.5, positionY: 0.5, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0.5, pivotY: 0.5 };
    case 'Merge':
      return { blendMode: 'Normal', applyMode: 'Normal', size: 1, centerX: 0.5, centerY: 0.5, angle: 0, blend: 1 };
    case 'Blur':
      return { blurSize: 5, lockXY: true, blendAmount: 1 };
    case 'ColorCorrector':
      return {
        gainR: 1, gainG: 1, gainB: 1, gainMaster: 1,
        gammaR: 1, gammaG: 1, gammaB: 1, gammaMaster: 1,
        liftR: 0, liftG: 0, liftB: 0, liftMaster: 0,
        saturation: 1,
      };
    case 'Background':
      return { colorR: 0, colorG: 0, colorB: 0, alpha: 1, width: 1920, height: 1080 };
    case 'Keyer':
      return { threshold: 0.1, range: 0.3, softness: 0.05, spillRemoval: 0.5 };
    case 'BrightnessContrast':
      return { brightness: 0, contrast: 0, saturation: 1, blend: 1 };
    case 'Glow':
      return { glowSize: 5, blend: 0.5 };
    case 'Text':
      return { text: 'Text', fontSize: 0.1, fontFamily: 'Arial', colorR: 1, colorG: 1, colorB: 1 };
    case 'Resize':
      return { width: 1920, height: 1080, filterMethod: 'Lanczos' };
    case 'FastNoise':
      return { detailScale: 5, brightness: 0, contrast: 1, seethe: 0 };
    case 'Gradient':
      return { startX: 0, startY: 0.5, endX: 1, endY: 0.5, gradientType: 'Linear' };
    case 'Sharpen':
      return { amount: 0.5, radius: 1 };
    case 'Tracker':
      return { patternWidth: 0.05, patternHeight: 0.05, searchWidth: 0.1, searchHeight: 0.1 };
    default:
      return {};
  }
}

function createNode(
  type: FusionNodeType,
  name: string,
  x: number,
  y: number,
): FusionNode {
  return {
    id: makeId(),
    type,
    name,
    x,
    y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    ports: getPortsForType(type),
    selected: false,
    viewed: null,
    params: getDefaultParams(type),
  };
}

function getPortPosition(
  node: FusionNode,
  port: FusionNodePort,
): { x: number; y: number } {
  const inputPorts = node.ports.filter((p) => p.side === 'input');
  const outputPorts = node.ports.filter((p) => p.side === 'output');

  if (port.side === 'input') {
    const idx = inputPorts.indexOf(port);
    const spacing = node.height / (inputPorts.length + 1);
    return { x: node.x, y: node.y + spacing * (idx + 1) };
  } else {
    const idx = outputPorts.indexOf(port);
    const spacing = node.height / (outputPorts.length + 1);
    return { x: node.x + node.width, y: node.y + spacing * (idx + 1) };
  }
}

function buildBezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.abs(x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

// ─── Initial demo graph ─────────────────────────────────────────────────────────

function buildInitialGraph(): { nodes: FusionNode[]; connections: FusionConnection[] } {
  const mediaIn = createNode('MediaIn', 'MediaIn1', 60, 100);
  mediaIn.viewed = 'left';

  const transform = createNode('Transform', 'Transform1', 240, 100);

  const background = createNode('Background', 'Background1', 60, 220);
  background.params = { ...background.params, colorR: 0.05, colorG: 0.05, colorB: 0.08, alpha: 1 };

  const merge = createNode('Merge', 'Merge1', 420, 140);

  const mediaOut = createNode('MediaOut', 'MediaOut1', 600, 140);
  mediaOut.viewed = 'right';

  const nodes = [mediaIn, transform, background, merge, mediaOut];

  const mediaInOutput = mediaIn.ports.find((p) => p.side === 'output')!;
  const transformInput = transform.ports.find((p) => p.side === 'input' && p.dataType === 'image')!;
  const transformOutput = transform.ports.find((p) => p.side === 'output')!;
  const mergeFg = merge.ports.find((p) => p.name === 'Foreground')!;
  const mergeBg = merge.ports.find((p) => p.name === 'Background')!;
  const mergeOutput = merge.ports.find((p) => p.side === 'output')!;
  const bgOutput = background.ports.find((p) => p.side === 'output')!;
  const mediaOutInput = mediaOut.ports.find((p) => p.side === 'input')!;

  const connections: FusionConnection[] = [
    { id: 'c1', fromNodeId: mediaIn.id, fromPortId: mediaInOutput.id, toNodeId: transform.id, toPortId: transformInput.id },
    { id: 'c2', fromNodeId: transform.id, fromPortId: transformOutput.id, toNodeId: merge.id, toPortId: mergeFg.id },
    { id: 'c3', fromNodeId: background.id, fromPortId: bgOutput.id, toNodeId: merge.id, toPortId: mergeBg.id },
    { id: 'c4', fromNodeId: merge.id, fromPortId: mergeOutput.id, toNodeId: mediaOut.id, toPortId: mediaOutInput.id },
  ];

  return { nodes, connections };
}

// ─── Spline demo data ───────────────────────────────────────────────────────────

const DEMO_SPLINES: SplineCurve[] = [
  {
    paramName: 'Transform1.PositionX',
    color: '#ff5555',
    keyframes: [
      { frame: 0, value: 0.5, interpolation: 'smooth' },
      { frame: 30, value: 0.7, interpolation: 'smooth' },
      { frame: 60, value: 0.3, interpolation: 'smooth' },
      { frame: 90, value: 0.5, interpolation: 'smooth' },
    ],
  },
  {
    paramName: 'Transform1.PositionY',
    color: '#55ff55',
    keyframes: [
      { frame: 0, value: 0.5, interpolation: 'smooth' },
      { frame: 45, value: 0.2, interpolation: 'smooth' },
      { frame: 90, value: 0.5, interpolation: 'smooth' },
    ],
  },
];

// ─── Common styles ──────────────────────────────────────────────────────────────

const panelBorder: CSSProperties = {
  borderColor: 'var(--border-default)',
  borderStyle: 'solid',
};

const panelBg: CSSProperties = {
  background: 'var(--bg-surface)',
};

const tabStyle = (active: boolean): CSSProperties => ({
  padding: '6px 12px',
  fontSize: 11,
  fontWeight: active ? 600 : 400,
  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
  background: active ? 'var(--bg-elevated)' : 'transparent',
  border: 'none',
  borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
  cursor: 'pointer',
  outline: 'none',
  transition: 'color 0.15s, background 0.15s',
  whiteSpace: 'nowrap' as const,
});

const sectionHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '6px 10px',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-tertiary)',
  borderBottom: '1px solid var(--border-subtle)',
  background: 'var(--bg-raised)',
  userSelect: 'none',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '3px 6px',
  fontSize: 11,
  color: 'var(--text-primary)',
  background: 'var(--bg-void)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 3,
  outline: 'none',
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary)',
  minWidth: 60,
  textAlign: 'right' as const,
  marginRight: 8,
  userSelect: 'none' as const,
};

const toolbarBtnStyle = (active = false): CSSProperties => ({
  padding: '4px 8px',
  fontSize: 10,
  fontWeight: 500,
  color: active ? 'var(--brand-bright)' : 'var(--text-secondary)',
  background: active ? 'var(--bg-elevated)' : 'transparent',
  border: '1px solid',
  borderColor: active ? 'var(--brand)' : 'var(--border-subtle)',
  borderRadius: 3,
  cursor: 'pointer',
  outline: 'none',
  transition: 'all 0.15s',
  whiteSpace: 'nowrap' as const,
});

// =============================================================================
//  Media Pool Panel
// =============================================================================

function MediaPoolPanel({ onAddMediaIn }: { onAddMediaIn: (asset: MediaAsset) => void }) {
  const bins = useEditorStore((s) => s.bins);
  const [expandedBins, setExpandedBins] = useState<Set<string>>(new Set(['b1']));

  const toggleBin = useCallback((binId: string) => {
    setExpandedBins((prev) => {
      const next = new Set(prev);
      if (next.has(binId)) next.delete(binId);
      else next.add(binId);
      return next;
    });
  }, []);

  const renderBin = useCallback(
    (bin: Bin, depth: number) => {
      const isExpanded = expandedBins.has(bin.id);
      const indent = depth * 14;
      return (
        <div key={bin.id} role="treeitem" aria-expanded={isExpanded} aria-label={bin.name}>
          <button
            onClick={() => toggleBin(bin.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              padding: '4px 8px',
              paddingLeft: 8 + indent,
              fontSize: 11,
              color: 'var(--text-primary)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              gap: 6,
              textAlign: 'left',
            }}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${bin.name}`}
          >
            <span style={{ fontSize: 8, color: 'var(--text-tertiary)', width: 10 }}>
              {(bin.children.length > 0 || bin.assets.length > 0) ? (isExpanded ? '\u25BC' : '\u25B6') : '\u00A0'}
            </span>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: bin.color,
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {bin.name}
            </span>
            {bin.assets.length > 0 && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{bin.assets.length}</span>
            )}
          </button>
          {isExpanded && (
            <div role="group">
              {bin.children.map((child) => renderBin(child, depth + 1))}
              {bin.assets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => onAddMediaIn(asset)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    padding: '3px 8px',
                    paddingLeft: 20 + indent + 14,
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    gap: 6,
                    textAlign: 'left',
                  }}
                  title={`Add "${asset.name}" as MediaIn node`}
                  aria-label={`Add ${asset.name} as media input node`}
                >
                  <span style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: asset.type === 'VIDEO' ? '#4a9eff' : asset.type === 'AUDIO' ? '#2bb672' : '#e8943a',
                    width: 16,
                    flexShrink: 0,
                  }}>
                    {asset.type === 'VIDEO' ? 'VID' : asset.type === 'AUDIO' ? 'AUD' : 'IMG'}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {asset.name}
                  </span>
                  {asset.duration != null && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {asset.duration.toFixed(1)}s
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    },
    [expandedBins, toggleBin, onAddMediaIn],
  );

  return (
    <div role="tree" aria-label="Media pool bins" style={{ overflowY: 'auto', flex: 1 }}>
      {bins.map((bin) => renderBin(bin, 0))}
    </div>
  );
}

// =============================================================================
//  Effects Library Panel
// =============================================================================

function EffectsLibraryPanel({ onAddNode }: { onAddNode: (type: FusionNodeType) => void }) {
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  const toggleCat = useCallback((name: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  return (
    <div role="tree" aria-label="Effects library" style={{ overflowY: 'auto', flex: 1 }}>
      {EFFECTS_CATEGORIES.map((cat) => {
        const expanded = expandedCats.has(cat.name);
        return (
          <div key={cat.name} role="treeitem" aria-expanded={expanded}>
            <button
              onClick={() => toggleCat(cat.name)}
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                padding: '5px 10px',
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--text-primary)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                gap: 6,
              }}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${cat.name} category`}
            >
              <span style={{ fontSize: 8, color: 'var(--text-tertiary)', width: 10 }}>
                {expanded ? '\u25BC' : '\u25B6'}
              </span>
              <span>{cat.name}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {cat.nodes.length}
              </span>
            </button>
            {expanded && (
              <div role="group" style={{ paddingLeft: 18 }}>
                {cat.nodes.map((n) => (
                  <button
                    key={n.type + n.label}
                    onClick={() => onAddNode(n.type)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      padding: '3px 10px',
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      gap: 6,
                      textAlign: 'left',
                    }}
                    aria-label={`Add ${n.label} node`}
                  >
                    <span
                      style={{
                        width: 18,
                        height: 14,
                        borderRadius: 2,
                        background: NODE_TYPE_COLORS[n.type],
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 8,
                        fontWeight: 700,
                        color: '#fff',
                        flexShrink: 0,
                      }}
                    >
                      {NODE_TYPE_ICONS[n.type]}
                    </span>
                    <span>{n.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
//  Inspector Panel
// =============================================================================

function InspectorPanel({
  selectedNode,
  onParamChange,
}: {
  selectedNode: FusionNode | null;
  onParamChange: (nodeId: string, param: string, value: number | string | boolean) => void;
}) {
  if (!selectedNode) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          color: 'var(--text-muted)',
          fontSize: 12,
          textAlign: 'center',
        }}
        role="region"
        aria-label="Node inspector - no selection"
      >
        Select a node to view its properties
      </div>
    );
  }

  // Helper to safely read a param value
  const p = (key: string): number | string | boolean | undefined => selectedNode.params[key];
  const pn = (key: string): number => (p(key) as number) ?? 0;

  const renderNumericParam = (label: string, param: string, value: number, step = 0.01, min?: number, max?: number) => (
    <div key={param} style={{ display: 'flex', alignItems: 'center', padding: '2px 10px' }}>
      <span style={labelStyle}>{label}</span>
      <input
        type="number"
        value={typeof value === 'number' ? value : 0}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onParamChange(selectedNode.id, param, parseFloat(e.target.value) || 0)}
        style={{ ...inputStyle, width: 'auto', flex: 1 }}
        aria-label={`${selectedNode.name} ${label}`}
      />
    </div>
  );

  const renderDropdown = (label: string, param: string, options: string[]) => (
    <div key={param} style={{ display: 'flex', alignItems: 'center', padding: '2px 10px' }}>
      <span style={labelStyle}>{label}</span>
      <select
        value={String(selectedNode.params[param] ?? options[0])}
        onChange={(e) => onParamChange(selectedNode.id, param, e.target.value)}
        style={{ ...inputStyle, width: 'auto', flex: 1 }}
        aria-label={`${selectedNode.name} ${label}`}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );

  const renderToggle = (label: string, param: string) => (
    <div key={param} style={{ display: 'flex', alignItems: 'center', padding: '2px 10px' }}>
      <span style={labelStyle}>{label}</span>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={!!selectedNode.params[param]}
          onChange={(e) => onParamChange(selectedNode.id, param, e.target.checked)}
          aria-label={`${selectedNode.name} ${label}`}
        />
        {selectedNode.params[param] ? 'On' : 'Off'}
      </label>
    </div>
  );

  const renderNodeParams = () => {
    switch (selectedNode.type) {
      case 'Transform':
        return (
          <>
            <div style={sectionHeaderStyle}>Position</div>
            {renderNumericParam('X', 'positionX', pn('positionX'))}
            {renderNumericParam('Y', 'positionY', pn('positionY'))}
            <div style={sectionHeaderStyle}>Rotation / Scale</div>
            {renderNumericParam('Rotation', 'rotation', pn('rotation'), 0.1)}
            {renderNumericParam('Scale X', 'scaleX', pn('scaleX'))}
            {renderNumericParam('Scale Y', 'scaleY', pn('scaleY'))}
            <div style={sectionHeaderStyle}>Pivot</div>
            {renderNumericParam('Pivot X', 'pivotX', pn('pivotX'))}
            {renderNumericParam('Pivot Y', 'pivotY', pn('pivotY'))}
          </>
        );

      case 'Merge':
        return (
          <>
            <div style={sectionHeaderStyle}>Merge Settings</div>
            {renderDropdown('Blend', 'blendMode', [
              'Normal', 'Multiply', 'Screen', 'Overlay', 'SoftLight',
              'HardLight', 'ColorDodge', 'ColorBurn', 'Darken', 'Lighten',
              'Difference', 'Exclusion', 'Add', 'Subtract',
            ])}
            {renderDropdown('Apply', 'applyMode', ['Normal', 'Screen'])}
            {renderNumericParam('Size', 'size', pn('size'))}
            {renderNumericParam('Center X', 'centerX', pn('centerX'))}
            {renderNumericParam('Center Y', 'centerY', pn('centerY'))}
            {renderNumericParam('Angle', 'angle', pn('angle'), 0.1)}
            {renderNumericParam('Blend', 'blend', pn('blend'), 0.01, 0, 1)}
          </>
        );

      case 'Blur':
        return (
          <>
            <div style={sectionHeaderStyle}>Blur Settings</div>
            {renderNumericParam('Blur Size', 'blurSize', pn('blurSize'), 0.5, 0, 200)}
            {renderToggle('Lock X/Y', 'lockXY')}
            {renderNumericParam('Blend', 'blendAmount', pn('blendAmount'), 0.01, 0, 1)}
          </>
        );

      case 'ColorCorrector':
        return (
          <>
            <div style={sectionHeaderStyle}>Gain</div>
            {renderNumericParam('Master', 'gainMaster', pn('gainMaster'), 0.01, 0, 4)}
            {renderNumericParam('Red', 'gainR', pn('gainR'), 0.01, 0, 4)}
            {renderNumericParam('Green', 'gainG', pn('gainG'), 0.01, 0, 4)}
            {renderNumericParam('Blue', 'gainB', pn('gainB'), 0.01, 0, 4)}
            <div style={sectionHeaderStyle}>Gamma</div>
            {renderNumericParam('Master', 'gammaMaster', pn('gammaMaster'), 0.01, 0, 4)}
            {renderNumericParam('Red', 'gammaR', pn('gammaR'), 0.01, 0, 4)}
            {renderNumericParam('Green', 'gammaG', pn('gammaG'), 0.01, 0, 4)}
            {renderNumericParam('Blue', 'gammaB', pn('gammaB'), 0.01, 0, 4)}
            <div style={sectionHeaderStyle}>Lift</div>
            {renderNumericParam('Master', 'liftMaster', pn('liftMaster'), 0.01, -1, 1)}
            {renderNumericParam('Red', 'liftR', pn('liftR'), 0.01, -1, 1)}
            {renderNumericParam('Green', 'liftG', pn('liftG'), 0.01, -1, 1)}
            {renderNumericParam('Blue', 'liftB', pn('liftB'), 0.01, -1, 1)}
            <div style={sectionHeaderStyle}>Saturation</div>
            {renderNumericParam('Saturation', 'saturation', pn('saturation'), 0.01, 0, 4)}
          </>
        );

      case 'Background':
        return (
          <>
            <div style={sectionHeaderStyle}>Color</div>
            {renderNumericParam('Red', 'colorR', pn('colorR'), 0.01, 0, 1)}
            {renderNumericParam('Green', 'colorG', pn('colorG'), 0.01, 0, 1)}
            {renderNumericParam('Blue', 'colorB', pn('colorB'), 0.01, 0, 1)}
            {renderNumericParam('Alpha', 'alpha', pn('alpha'), 0.01, 0, 1)}
            <div style={sectionHeaderStyle}>Dimensions</div>
            {renderNumericParam('Width', 'width', pn('width'), 1, 1, 7680)}
            {renderNumericParam('Height', 'height', pn('height'), 1, 1, 4320)}
          </>
        );

      case 'Keyer':
        return (
          <>
            <div style={sectionHeaderStyle}>Keyer Settings</div>
            {renderNumericParam('Threshold', 'threshold', pn('threshold'), 0.01, 0, 1)}
            {renderNumericParam('Range', 'range', pn('range'), 0.01, 0, 1)}
            {renderNumericParam('Softness', 'softness', pn('softness'), 0.01, 0, 1)}
            {renderNumericParam('Spill Removal', 'spillRemoval', pn('spillRemoval'), 0.01, 0, 1)}
          </>
        );

      case 'BrightnessContrast':
        return (
          <>
            <div style={sectionHeaderStyle}>Settings</div>
            {renderNumericParam('Brightness', 'brightness', pn('brightness'), 0.01, -1, 1)}
            {renderNumericParam('Contrast', 'contrast', pn('contrast'), 0.01, -1, 1)}
            {renderNumericParam('Saturation', 'saturation', pn('saturation'), 0.01, 0, 4)}
            {renderNumericParam('Blend', 'blend', pn('blend'), 0.01, 0, 1)}
          </>
        );

      case 'Glow':
        return (
          <>
            <div style={sectionHeaderStyle}>Glow Settings</div>
            {renderNumericParam('Size', 'glowSize', pn('glowSize'), 0.5, 0, 100)}
            {renderNumericParam('Blend', 'blend', pn('blend'), 0.01, 0, 1)}
          </>
        );

      case 'Text':
        return (
          <>
            <div style={sectionHeaderStyle}>Text</div>
            <div style={{ padding: '2px 10px' }}>
              <input
                type="text"
                value={String(p('text') ?? '')}
                onChange={(e) => onParamChange(selectedNode.id, 'text', e.target.value)}
                style={inputStyle}
                aria-label={`${selectedNode.name} text content`}
              />
            </div>
            {renderNumericParam('Font Size', 'fontSize', pn('fontSize'), 0.005, 0.01, 1)}
            <div style={sectionHeaderStyle}>Color</div>
            {renderNumericParam('Red', 'colorR', pn('colorR'), 0.01, 0, 1)}
            {renderNumericParam('Green', 'colorG', pn('colorG'), 0.01, 0, 1)}
            {renderNumericParam('Blue', 'colorB', pn('colorB'), 0.01, 0, 1)}
          </>
        );

      default:
        return (
          <div style={{ padding: 10, fontSize: 11, color: 'var(--text-muted)' }}>
            {Object.entries(selectedNode.params).map(([key, val]) => {
              if (typeof val === 'number') {
                return renderNumericParam(key, key, val);
              }
              if (typeof val === 'boolean') {
                return renderToggle(key, key);
              }
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', padding: '2px 10px' }}>
                  <span style={labelStyle}>{key}</span>
                  <input
                    type="text"
                    value={String(val)}
                    onChange={(e) => onParamChange(selectedNode.id, key, e.target.value)}
                    style={{ ...inputStyle, width: 'auto', flex: 1 }}
                    aria-label={`${selectedNode.name} ${key}`}
                  />
                </div>
              );
            })}
          </div>
        );
    }
  };

  return (
    <div style={{ overflowY: 'auto', flex: 1 }} role="form" aria-label={`Inspector for ${selectedNode.name}`}>
      {/* Node header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--bg-raised)',
        }}
      >
        <span
          style={{
            width: 24,
            height: 18,
            borderRadius: 3,
            background: NODE_TYPE_COLORS[selectedNode.type],
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            fontWeight: 700,
            color: '#fff',
          }}
        >
          {NODE_TYPE_ICONS[selectedNode.type]}
        </span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{selectedNode.name}</div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{selectedNode.type}</div>
        </div>
      </div>
      {renderNodeParams()}
    </div>
  );
}

// =============================================================================
//  Viewer Panel
// =============================================================================

function ViewerPanel({ label, viewedNode }: { label: string; viewedNode: FusionNode | null }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        background: 'var(--bg-void)',
        borderRight: label === 'Left Viewer' ? '1px solid var(--border-default)' : undefined,
      }}
      role="region"
      aria-label={label}
    >
      {/* Viewer header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 10px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-raised)',
          minHeight: 24,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label === 'Left Viewer' ? 'Left' : 'Right'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
          {viewedNode ? viewedNode.name : 'None'}
        </span>
      </div>
      {/* Viewer canvas area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {viewedNode ? (
          <div
            style={{
              width: '80%',
              maxWidth: 400,
              aspectRatio: '16 / 9',
              background: '#0a0a0e',
              border: '1px solid var(--border-subtle)',
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 6,
              position: 'relative',
            }}
          >
            {/* Simulated viewer content */}
            <span
              style={{
                width: 32,
                height: 24,
                borderRadius: 3,
                background: NODE_TYPE_COLORS[viewedNode.type],
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 700,
                color: '#fff',
              }}
            >
              {NODE_TYPE_ICONS[viewedNode.type]}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{viewedNode.name}</span>
            {/* Safe area overlay */}
            <div
              style={{
                position: 'absolute',
                inset: '10%',
                border: '1px dashed rgba(255,255,255,0.08)',
                borderRadius: 1,
                pointerEvents: 'none',
              }}
            />
            {/* Center crosshair */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 20,
                height: 1,
                background: 'rgba(255,255,255,0.12)',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 1,
                height: 20,
                background: 'rgba(255,255,255,0.12)',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }}
            />
          </div>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No viewer assigned</span>
        )}
        {/* Resolution / frame indicator */}
        <div
          style={{
            position: 'absolute',
            bottom: 6,
            right: 10,
            fontSize: 10,
            color: 'var(--text-muted)',
          }}
        >
          1920 x 1080 | 24fps
        </div>
      </div>
    </div>
  );
}

// =============================================================================
//  Node Editor (Canvas)
// =============================================================================

function NodeEditor({
  nodes,
  connections,
  selectedNodeId,
  zoom,
  pan,
  onSelectNode,
  onMoveNode,
  onSetViewer,
  onZoomChange,
  onPanChange,
}: {
  nodes: FusionNode[];
  connections: FusionConnection[];
  selectedNodeId: string | null;
  zoom: number;
  pan: { x: number; y: number };
  onSelectNode: (id: string | null) => void;
  onMoveNode: (id: string, dx: number, dy: number) => void;
  onSetViewer: (id: string, viewer: 'left' | 'right') => void;
  onZoomChange: (z: number) => void;
  onPanChange: (p: { x: number; y: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    nodeStartX: number;
    nodeStartY: number;
  } | null>(null);
  const panDragRef = useRef<{
    startMouseX: number;
    startMouseY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 300 });

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Draw the node graph on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.width * dpr;
    canvas.height = canvasSize.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#111115';
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

    // Draw grid
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    const gridSize = 40;
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 0.5 / zoom;

    const viewLeft = -pan.x / zoom;
    const viewTop = -pan.y / zoom;
    const viewRight = (canvasSize.width - pan.x) / zoom;
    const viewBottom = (canvasSize.height - pan.y) / zoom;

    const startX = Math.floor(viewLeft / gridSize) * gridSize;
    const startY = Math.floor(viewTop / gridSize) * gridSize;

    for (let x = startX; x < viewRight; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, viewTop);
      ctx.lineTo(x, viewBottom);
      ctx.stroke();
    }
    for (let y = startY; y < viewBottom; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(viewLeft, y);
      ctx.lineTo(viewRight, y);
      ctx.stroke();
    }

    // Draw connections (bezier curves)
    for (const conn of connections) {
      const fromNode = nodes.find((n) => n.id === conn.fromNodeId);
      const toNode = nodes.find((n) => n.id === conn.toNodeId);
      if (!fromNode || !toNode) continue;

      const fromPort = fromNode.ports.find((p) => p.id === conn.fromPortId);
      const toPort = toNode.ports.find((p) => p.id === conn.toPortId);
      if (!fromPort || !toPort) continue;

      const from = getPortPosition(fromNode, fromPort);
      const to = getPortPosition(toNode, toPort);

      const isSelectedConn =
        fromNode.id === selectedNodeId || toNode.id === selectedNodeId;

      ctx.beginPath();
      const path = new Path2D(buildBezierPath(from.x, from.y, to.x, to.y));
      ctx.strokeStyle = isSelectedConn ? 'rgba(120,180,255,0.8)' : 'rgba(180,180,200,0.35)';
      ctx.lineWidth = isSelectedConn ? 2.5 / zoom : 1.5 / zoom;
      ctx.stroke(path);
    }

    // Draw nodes
    for (const node of nodes) {
      const isSelected = node.id === selectedNodeId;
      const nodeColor = NODE_TYPE_COLORS[node.type];

      // Node shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      const shadowRound = 4;
      roundRect(ctx, node.x + 2, node.y + 2, node.width, node.height, shadowRound);
      ctx.fill();

      // Node body
      ctx.fillStyle = isSelected ? '#2a2a32' : '#1e1e24';
      roundRect(ctx, node.x, node.y, node.width, node.height, 4);
      ctx.fill();

      // Node top accent bar
      ctx.fillStyle = nodeColor;
      roundRectTop(ctx, node.x, node.y, node.width, 4, 4);
      ctx.fill();

      // Selection border
      if (isSelected) {
        ctx.strokeStyle = 'var(--brand, #5b6af5)';
        ctx.lineWidth = 2 / zoom;
        roundRect(ctx, node.x, node.y, node.width, node.height, 4);
        ctx.stroke();
      }

      // Node border
      ctx.strokeStyle = isSelected ? nodeColor : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1 / zoom;
      roundRect(ctx, node.x, node.y, node.width, node.height, 4);
      ctx.stroke();

      // Type icon badge
      ctx.fillStyle = nodeColor;
      roundRect(ctx, node.x + 6, node.y + 14, 22, 16, 3);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${8 / Math.max(zoom, 0.5)}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(NODE_TYPE_ICONS[node.type], node.x + 17, node.y + 22);

      // Node name
      ctx.fillStyle = isSelected ? '#fff' : '#c8c8d0';
      ctx.font = `500 ${10 / Math.max(zoom, 0.5)}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const nameMaxWidth = node.width - 40;
      ctx.fillText(truncateText(ctx, node.name, nameMaxWidth), node.x + 32, node.y + 22);

      // Viewer indicator dots
      if (node.viewed === 'left') {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(node.x + node.width - 20, node.y + node.height - 10, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (node.viewed === 'right') {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(node.x + node.width - 10, node.y + node.height - 10, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw ports
      for (const port of node.ports) {
        const pos = getPortPosition(node, port);
        const portColor = port.dataType === 'mask' ? '#66cc66' : port.dataType === 'image' ? '#cccc66' : '#cc9966';

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 4 / Math.max(zoom, 0.5), 0, Math.PI * 2);
        ctx.fillStyle = portColor;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [nodes, connections, selectedNodeId, canvasSize, zoom, pan]);

  // Mouse handlers
  const screenToGraph = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };
      const rect = container.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      return {
        x: (sx - pan.x) / zoom,
        y: (sy - pan.y) / zoom,
      };
    },
    [pan, zoom],
  );

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      const gp = screenToGraph(e.clientX, e.clientY);

      // Middle button = pan
      if (e.button === 1) {
        e.preventDefault();
        panDragRef.current = {
          startMouseX: e.clientX,
          startMouseY: e.clientY,
          startPanX: pan.x,
          startPanY: pan.y,
        };
        return;
      }

      // Left click
      if (e.button === 0) {
        // Find clicked node (reverse order for z-index)
        for (let i = nodes.length - 1; i >= 0; i--) {
          const node = nodes[i]!;
          if (
            gp.x >= node.x &&
            gp.x <= node.x + node.width &&
            gp.y >= node.y &&
            gp.y <= node.y + node.height
          ) {
            onSelectNode(node.id);
            dragRef.current = {
              nodeId: node.id,
              startX: e.clientX,
              startY: e.clientY,
              nodeStartX: node.x,
              nodeStartY: node.y,
            };
            return;
          }
        }
        // Clicked empty space
        onSelectNode(null);

        // Start panning
        panDragRef.current = {
          startMouseX: e.clientX,
          startMouseY: e.clientY,
          startPanX: pan.x,
          startPanY: pan.y,
        };
      }
    },
    [nodes, onSelectNode, screenToGraph, pan],
  );

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      if (dragRef.current) {
        const dx = (e.clientX - dragRef.current.startX) / zoom;
        const dy = (e.clientY - dragRef.current.startY) / zoom;
        const newX = dragRef.current.nodeStartX + dx;
        const newY = dragRef.current.nodeStartY + dy;
        onMoveNode(dragRef.current.nodeId, newX, newY);
      }
      if (panDragRef.current) {
        const dx = e.clientX - panDragRef.current.startMouseX;
        const dy = e.clientY - panDragRef.current.startMouseY;
        onPanChange({
          x: panDragRef.current.startPanX + dx,
          y: panDragRef.current.startPanY + dy,
        });
      }
    },
    [zoom, onMoveNode, onPanChange],
  );

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
    panDragRef.current = null;
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.2, Math.min(3, zoom * delta));
      onZoomChange(newZoom);
    },
    [zoom, onZoomChange],
  );

  const handleDoubleClick = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      const gp = screenToGraph(e.clientX, e.clientY);
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i]!;
        if (
          gp.x >= node.x &&
          gp.x <= node.x + node.width &&
          gp.y >= node.y &&
          gp.y <= node.y + node.height
        ) {
          // Toggle viewer assignment on double-click
          if (!node.viewed) {
            onSetViewer(node.id, 'left');
          } else if (node.viewed === 'left') {
            onSetViewer(node.id, 'right');
          } else {
            // Cycle: right -> clear (handled by parent toggling)
            onSetViewer(node.id, 'left');
          }
          return;
        }
      }
    },
    [nodes, screenToGraph, onSetViewer],
  );

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        cursor: panDragRef.current ? 'grabbing' : dragRef.current ? 'move' : 'default',
      }}
    >
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        style={{
          width: canvasSize.width,
          height: canvasSize.height,
          display: 'block',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        role="application"
        aria-label="Node graph canvas. Click to select nodes, drag to move them, double-click to assign viewer."
        tabIndex={0}
      />
    </div>
  );
}

// Canvas helper: rounded rect
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Canvas helper: rounded rect top only
function roundRectTop(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Canvas helper: truncate text
function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + '...').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '...';
}

// =============================================================================
//  Spline Editor
// =============================================================================

function SplineEditor({
  curves,
  totalFrames,
  currentFrame,
}: {
  curves: SplineCurve[];
  totalFrames: number;
  currentFrame: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 100 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ width: Math.floor(width), height: Math.floor(height) });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    ctx.scale(dpr, dpr);

    const pad = { left: 50, right: 20, top: 12, bottom: 20 };
    const plotW = size.width - pad.left - pad.right;
    const plotH = size.height - pad.top - pad.bottom;

    // Clear
    ctx.fillStyle = '#111115';
    ctx.fillRect(0, 0, size.width, size.height);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;

    // Vertical grid (frames)
    const frameStep = Math.max(1, Math.floor(totalFrames / 10));
    for (let f = 0; f <= totalFrames; f += frameStep) {
      const x = pad.left + (f / totalFrames) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + plotH);
      ctx.stroke();

      // Frame labels
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(f), x, size.height - 4);
    }

    // Horizontal grid (values)
    const valueSteps = 5;
    for (let i = 0; i <= valueSteps; i++) {
      const y = pad.top + (i / valueSteps) * plotH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();

      // Value labels
      const val = (1 - i / valueSteps).toFixed(1);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(val, pad.left - 6, y + 3);
    }

    // Draw curves
    for (const curve of curves) {
      if (curve.keyframes.length < 2) continue;

      ctx.strokeStyle = curve.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      for (let i = 0; i < curve.keyframes.length; i++) {
        const kf = curve.keyframes[i]!;
        const x = pad.left + (kf.frame / totalFrames) * plotW;
        const y = pad.top + (1 - kf.value) * plotH;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          // Smooth interpolation using cubic bezier
          const prev = curve.keyframes[i - 1]!;
          const px = pad.left + (prev.frame / totalFrames) * plotW;
          const py = pad.top + (1 - prev.value) * plotH;
          const cpx = (px + x) / 2;
          ctx.bezierCurveTo(cpx, py, cpx, y, x, y);
        }
      }
      ctx.stroke();

      // Draw keyframe dots
      for (const kf of curve.keyframes) {
        const x = pad.left + (kf.frame / totalFrames) * plotW;
        const y = pad.top + (1 - kf.value) * plotH;

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = curve.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Playhead line
    const playheadX = pad.left + (currentFrame / totalFrames) * plotW;
    ctx.strokeStyle = 'rgba(255,100,100,0.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(playheadX, pad.top);
    ctx.lineTo(playheadX, pad.top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Axis lines
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + plotH);
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.stroke();
  }, [curves, totalFrames, currentFrame, size]);

  return (
    <div ref={containerRef} style={{ flex: 1, position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={size.width}
        height={size.height}
        style={{ width: '100%', height: '100%', display: 'block' }}
        role="img"
        aria-label={`Spline keyframe editor showing ${curves.length} curves over ${totalFrames} frames`}
      />
    </div>
  );
}

// =============================================================================
//  Node Toolbar
// =============================================================================

const TOOLBAR_NODES: { type: FusionNodeType; label: string }[] = [
  { type: 'MediaIn', label: 'MediaIn' },
  { type: 'MediaOut', label: 'MediaOut' },
  { type: 'Merge', label: 'Merge' },
  { type: 'Transform', label: 'Transform' },
  { type: 'Blur', label: 'Blur' },
  { type: 'ColorCorrector', label: 'CC' },
  { type: 'Keyer', label: 'Keyer' },
  { type: 'Background', label: 'BG' },
  { type: 'Text', label: 'Text+' },
  { type: 'Glow', label: 'Glow' },
  { type: 'BrightnessContrast', label: 'B/C' },
  { type: 'Tracker', label: 'Tracker' },
];

function NodeToolbar({
  onAddNode,
  zoom,
  onZoomChange,
  onFitAll,
}: {
  onAddNode: (type: FusionNodeType) => void;
  zoom: number;
  onZoomChange: (z: number) => void;
  onFitAll: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        padding: '4px 10px',
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--bg-raised)',
        flexWrap: 'wrap',
        minHeight: 30,
      }}
      role="toolbar"
      aria-label="Node editor toolbar"
    >
      {TOOLBAR_NODES.map((tn) => (
        <button
          key={tn.type}
          onClick={() => onAddNode(tn.type)}
          style={toolbarBtnStyle()}
          title={`Add ${tn.label} node`}
          aria-label={`Add ${tn.label} node`}
        >
          <span
            style={{
              display: 'inline-block',
              width: 12,
              height: 9,
              borderRadius: 2,
              background: NODE_TYPE_COLORS[tn.type],
              marginRight: 4,
              verticalAlign: 'middle',
            }}
          />
          {tn.label}
        </button>
      ))}

      <span style={{ flex: 1 }} />

      {/* Zoom controls */}
      <button
        onClick={() => onZoomChange(Math.max(0.2, zoom - 0.1))}
        style={toolbarBtnStyle()}
        title="Zoom out"
        aria-label="Zoom out"
      >
        -
      </button>
      <span
        style={{
          fontSize: 10,
          color: 'var(--text-secondary)',
          minWidth: 40,
          textAlign: 'center',
          userSelect: 'none',
        }}
      >
        {Math.round(zoom * 100)}%
      </span>
      <button
        onClick={() => onZoomChange(Math.min(3, zoom + 0.1))}
        style={toolbarBtnStyle()}
        title="Zoom in"
        aria-label="Zoom in"
      >
        +
      </button>
      <button
        onClick={onFitAll}
        style={toolbarBtnStyle()}
        title="Fit all nodes in view"
        aria-label="Fit all nodes in view"
      >
        Fit
      </button>
    </div>
  );
}

// =============================================================================
//  MAIN: FusionPage
// =============================================================================

export function FusionPage() {
  // ---- State ----
  const [graph, setGraph] = useState(() => buildInitialGraph());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<'media' | 'effects'>('media');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 40, y: 20 });
  const [splineCurves] = useState(DEMO_SPLINES);
  const [currentFrame, setCurrentFrame] = useState(0);

  const playheadTime = useEditorStore((s) => s.playheadTime);

  // Update current frame from playhead
  useEffect(() => {
    setCurrentFrame(Math.round(playheadTime * 24));
  }, [playheadTime]);

  // Derive selected node
  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [graph.nodes, selectedNodeId],
  );

  // Derive viewer nodes
  const leftViewedNode = useMemo(
    () => graph.nodes.find((n) => n.viewed === 'left') ?? null,
    [graph.nodes],
  );
  const rightViewedNode = useMemo(
    () => graph.nodes.find((n) => n.viewed === 'right') ?? null,
    [graph.nodes],
  );

  // ---- Callbacks ----

  const handleSelectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
  }, []);

  const handleMoveNode = useCallback((id: string, newX: number, newY: number) => {
    setGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === id ? { ...n, x: newX, y: newY } : n,
      ),
    }));
  }, []);

  const handleSetViewer = useCallback((id: string, viewer: 'left' | 'right') => {
    setGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => {
        if (n.id === id) return { ...n, viewed: viewer };
        if (n.viewed === viewer) return { ...n, viewed: null };
        return n;
      }),
    }));
  }, []);

  const handleParamChange = useCallback(
    (nodeId: string, param: string, value: number | string | boolean) => {
      setGraph((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === nodeId
            ? { ...n, params: { ...n.params, [param]: value } }
            : n,
        ),
      }));
    },
    [],
  );

  // Counter for unique node names
  const nodeCounterRef = useRef<Record<string, number>>({});

  const addNodeToGraph = useCallback(
    (type: FusionNodeType, nameOverride?: string) => {
      // Compute unique name
      if (!nodeCounterRef.current[type]) {
        nodeCounterRef.current[type] = graph.nodes.filter((n) => n.type === type).length;
      }
      nodeCounterRef.current[type]! += 1;
      const count = nodeCounterRef.current[type]!;
      const name = nameOverride ?? `${type}${count}`;

      // Place new node relative to existing nodes
      const maxX = graph.nodes.reduce((m, n) => Math.max(m, n.x + n.width), 0);
      const node = createNode(type, name, maxX + 50, 100 + Math.random() * 120);

      setGraph((prev) => ({
        ...prev,
        nodes: [...prev.nodes, node],
      }));
      setSelectedNodeId(node.id);
    },
    [graph.nodes],
  );

  const handleAddMediaIn = useCallback(
    (asset: MediaAsset) => {
      addNodeToGraph('MediaIn', `MediaIn_${asset.name.replace(/\s+/g, '_').slice(0, 12)}`);
    },
    [addNodeToGraph],
  );

  const handleFitAll = useCallback(() => {
    if (graph.nodes.length === 0) return;
    const minX = Math.min(...graph.nodes.map((n) => n.x));
    const minY = Math.min(...graph.nodes.map((n) => n.y));
    const maxX = Math.max(...graph.nodes.map((n) => n.x + n.width));
    const maxY = Math.max(...graph.nodes.map((n) => n.y + n.height));

    const graphW = maxX - minX + 80;
    const graphH = maxY - minY + 80;

    // Approximate available canvas area (will auto-adjust)
    const fitZoom = Math.min(1.5, Math.max(0.3, 700 / graphW, 250 / graphH));
    setZoom(Math.min(fitZoom, 1.2));
    setPan({ x: 40 - minX * fitZoom + 20, y: 20 - minY * fitZoom + 10 });
  }, [graph.nodes]);

  // ---- Render ----

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-void)',
        color: 'var(--text-primary)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
      role="region"
      aria-label="Fusion Compositing Page"
    >
      {/* ====== TOP SECTION: Media Pool / Viewers / Inspector ====== */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {/* LEFT PANEL: Media Pool / Effects Library */}
        <div
          style={{
            width: 220,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            ...panelBg,
            borderRight: '1px solid var(--border-default)',
          }}
          role="region"
          aria-label="Media Pool and Effects Library"
        >
          {/* Tabs */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid var(--border-default)',
              background: 'var(--bg-raised)',
            }}
            role="tablist"
            aria-label="Left panel tabs"
          >
            <button
              role="tab"
              aria-selected={leftTab === 'media'}
              onClick={() => setLeftTab('media')}
              style={tabStyle(leftTab === 'media')}
              id="tab-media"
              aria-controls="panel-media"
            >
              Media Pool
            </button>
            <button
              role="tab"
              aria-selected={leftTab === 'effects'}
              onClick={() => setLeftTab('effects')}
              style={tabStyle(leftTab === 'effects')}
              id="tab-effects"
              aria-controls="panel-effects"
            >
              Effects
            </button>
          </div>
          {/* Tab content */}
          <div
            role="tabpanel"
            id={leftTab === 'media' ? 'panel-media' : 'panel-effects'}
            aria-labelledby={leftTab === 'media' ? 'tab-media' : 'tab-effects'}
            style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          >
            {leftTab === 'media' ? (
              <MediaPoolPanel onAddMediaIn={handleAddMediaIn} />
            ) : (
              <EffectsLibraryPanel onAddNode={addNodeToGraph} />
            )}
          </div>
        </div>

        {/* CENTER: Dual Viewers */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            minWidth: 0,
          }}
        >
          <ViewerPanel label="Left Viewer" viewedNode={leftViewedNode} />
          <ViewerPanel label="Right Viewer" viewedNode={rightViewedNode} />
        </div>

        {/* RIGHT PANEL: Inspector */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            ...panelBg,
            borderLeft: '1px solid var(--border-default)',
          }}
          role="region"
          aria-label="Node Inspector"
        >
          {/* Inspector header */}
          <div
            style={{
              ...sectionHeaderStyle,
              justifyContent: 'space-between',
            }}
          >
            <span>Inspector</span>
            {selectedNode && (
              <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>
                {selectedNode.type}
              </span>
            )}
          </div>
          <InspectorPanel selectedNode={selectedNode} onParamChange={handleParamChange} />
        </div>
      </div>

      {/* ====== MIDDLE SECTION: Node Editor ====== */}
      <div
        style={{
          height: 300,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderTop: '1px solid var(--border-default)',
          background: '#111115',
        }}
        role="region"
        aria-label="Node Editor"
      >
        {/* Node toolbar */}
        <NodeToolbar
          onAddNode={addNodeToGraph}
          zoom={zoom}
          onZoomChange={setZoom}
          onFitAll={handleFitAll}
        />
        {/* Node canvas */}
        <NodeEditor
          nodes={graph.nodes}
          connections={graph.connections}
          selectedNodeId={selectedNodeId}
          zoom={zoom}
          pan={pan}
          onSelectNode={handleSelectNode}
          onMoveNode={handleMoveNode}
          onSetViewer={handleSetViewer}
          onZoomChange={setZoom}
          onPanChange={setPan}
        />
      </div>

      {/* ====== BOTTOM SECTION: Spline / Keyframe Editor ====== */}
      <div
        style={{
          height: 120,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderTop: '1px solid var(--border-default)',
          background: '#111115',
        }}
        role="region"
        aria-label="Spline Keyframe Editor"
      >
        {/* Spline header bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '3px 10px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-raised)',
            minHeight: 22,
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Spline Editor
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            {splineCurves.map((c) => (
              <span
                key={c.paramName}
                style={{
                  fontSize: 10,
                  color: c.color,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 2,
                    background: c.color,
                    display: 'inline-block',
                    borderRadius: 1,
                  }}
                />
                {c.paramName}
              </span>
            ))}
          </div>
        </div>
        {/* Spline canvas */}
        <SplineEditor
          curves={splineCurves}
          totalFrames={90}
          currentFrame={currentFrame}
        />
      </div>
    </div>
  );
}
