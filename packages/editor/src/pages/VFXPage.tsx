// =============================================================================
//  THE AVID -- VFX Page (Nuke/Fusion-Style Node-Based Compositor)
//  Layout: Left media pool | Center node graph (top) + viewer (bottom) | Right properties
// =============================================================================

import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import { BinPanel } from '../components/Bins/BinPanel';

// ─── Types ──────────────────────────────────────────────────────────────────

interface NodePosition {
  x: number;
  y: number;
}

interface VFXNode {
  id: string;
  type: 'input' | 'color_correct' | 'blur' | 'key' | 'merge' | 'output' | 'transform' | 'grade';
  label: string;
  position: NodePosition;
  color: string;
  inputs: string[];
  outputs: string[];
  params: Record<string, number | string | boolean>;
}

interface Connection {
  id: string;
  fromNode: string;
  fromOutput: number;
  toNode: string;
  toInput: number;
}

// ─── Default Node Graph ─────────────────────────────────────────────────────

const DEFAULT_NODES: VFXNode[] = [
  {
    id: 'input-1',
    type: 'input',
    label: 'Read1',
    position: { x: 100, y: 80 },
    color: '#4a90d9',
    inputs: [],
    outputs: ['out'],
    params: { file: 'plate_fg.exr', format: '1920x1080', colorspace: 'ACEScg' },
  },
  {
    id: 'input-2',
    type: 'input',
    label: 'Read2',
    position: { x: 100, y: 260 },
    color: '#4a90d9',
    inputs: [],
    outputs: ['out'],
    params: { file: 'plate_bg.exr', format: '1920x1080', colorspace: 'ACEScg' },
  },
  {
    id: 'cc-1',
    type: 'color_correct',
    label: 'ColorCorrect1',
    position: { x: 300, y: 80 },
    color: '#d4a843',
    inputs: ['in'],
    outputs: ['out'],
    params: { saturation: 1.0, gain: 1.0, gamma: 1.0, offset: 0.0, lift: 0.0 },
  },
  {
    id: 'key-1',
    type: 'key',
    label: 'Keylight1',
    position: { x: 300, y: 180 },
    color: '#4dc95e',
    inputs: ['in'],
    outputs: ['out', 'matte'],
    params: { screenColor: '#00ff00', screenGain: 1.0, screenBalance: 0.5, clipBlack: 0.0, clipWhite: 1.0 },
  },
  {
    id: 'blur-1',
    type: 'blur',
    label: 'Blur1',
    position: { x: 500, y: 130 },
    color: '#8a6dcf',
    inputs: ['in'],
    outputs: ['out'],
    params: { size: 5.0, channels: 'rgba', filter: 'gaussian', quality: 15 },
  },
  {
    id: 'merge-1',
    type: 'merge',
    label: 'Merge1',
    position: { x: 500, y: 260 },
    color: '#cf6d6d',
    inputs: ['A', 'B', 'mask'],
    outputs: ['out'],
    params: { operation: 'over', mix: 1.0, screenAlpha: false },
  },
  {
    id: 'output-1',
    type: 'output',
    label: 'Write1',
    position: { x: 700, y: 200 },
    color: '#e0e0e0',
    inputs: ['in'],
    outputs: [],
    params: { file: 'comp_output.exr', format: 'EXR (16-bit half)', compression: 'DWAA' },
  },
];

const DEFAULT_CONNECTIONS: Connection[] = [
  { id: 'c1', fromNode: 'input-1', fromOutput: 0, toNode: 'cc-1', toInput: 0 },
  { id: 'c2', fromNode: 'input-1', fromOutput: 0, toNode: 'key-1', toInput: 0 },
  { id: 'c3', fromNode: 'cc-1', fromOutput: 0, toNode: 'blur-1', toInput: 0 },
  { id: 'c4', fromNode: 'blur-1', fromOutput: 0, toNode: 'merge-1', toInput: 0 },
  { id: 'c5', fromNode: 'input-2', fromOutput: 0, toNode: 'merge-1', toInput: 1 },
  { id: 'c6', fromNode: 'merge-1', fromOutput: 0, toNode: 'output-1', toInput: 0 },
];

// ─── Styles ─────────────────────────────────────────────────────────────────

const S = {
  root: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  } as React.CSSProperties,
  leftPanel: {
    width: 220,
    flexShrink: 0,
    borderRight: '1px solid var(--border-default)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  } as React.CSSProperties,
  centerPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    minWidth: 0,
  } as React.CSSProperties,
  nodeGraph: {
    flex: 1,
    position: 'relative' as const,
    background: '#1a1a2e',
    overflow: 'hidden',
    cursor: 'default',
    minHeight: 0,
  } as React.CSSProperties,
  viewer: {
    height: 240,
    flexShrink: 0,
    borderTop: '1px solid var(--border-default)',
    background: 'var(--bg-void)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  } as React.CSSProperties,
  viewerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 10px',
    borderBottom: '1px solid var(--border-subtle)',
    background: 'var(--bg-surface)',
    flexShrink: 0,
  } as React.CSSProperties,
  viewerCanvas: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0d0d0d',
    position: 'relative' as const,
    overflow: 'hidden',
  } as React.CSSProperties,
  rightPanel: {
    width: 280,
    flexShrink: 0,
    borderLeft: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  } as React.CSSProperties,
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  } as React.CSSProperties,
  panelTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-primary)',
  } as React.CSSProperties,
  paramSection: {
    padding: '10px 12px',
    borderBottom: '1px solid var(--border-subtle)',
  } as React.CSSProperties,
  paramRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 0',
    fontSize: 11,
  } as React.CSSProperties,
  paramLabel: {
    color: 'var(--text-muted)',
    fontSize: 10,
  } as React.CSSProperties,
  paramValue: {
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    fontWeight: 500,
  } as React.CSSProperties,
  nodeBox: (color: string, isSelected: boolean) => ({
    position: 'absolute' as const,
    minWidth: 120,
    background: 'var(--bg-surface)',
    border: `2px solid ${isSelected ? 'var(--brand)' : color}`,
    borderRadius: 6,
    boxShadow: isSelected
      ? '0 0 0 2px var(--brand), 0 4px 12px rgba(0,0,0,0.4)'
      : '0 2px 8px rgba(0,0,0,0.3)',
    cursor: 'grab',
    userSelect: 'none' as const,
    zIndex: isSelected ? 10 : 1,
    transition: 'box-shadow 150ms',
  }),
  nodeHeader: (color: string) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 10px',
    background: color,
    borderRadius: '4px 4px 0 0',
    fontSize: 10,
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '0.03em',
  }),
  nodeBody: {
    padding: '6px 10px',
  } as React.CSSProperties,
  nodePort: (side: 'left' | 'right') => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--text-muted)',
    border: '1px solid var(--bg-void)',
    position: 'absolute' as const,
    [side]: -5,
    cursor: 'crosshair',
    transition: 'background 100ms',
  }),
  nodePortLabel: {
    fontSize: 8,
    color: 'var(--text-muted)',
    letterSpacing: '0.03em',
  } as React.CSSProperties,
  graphToolbar: {
    position: 'absolute' as const,
    top: 8,
    left: 8,
    display: 'flex',
    gap: 4,
    zIndex: 20,
  } as React.CSSProperties,
  graphBtn: (active?: boolean) => ({
    padding: '4px 10px',
    fontSize: 10,
    fontWeight: 600,
    background: active ? 'var(--brand-dim)' : 'rgba(255,255,255,0.08)',
    color: active ? 'var(--brand-bright)' : 'var(--text-secondary)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'all 150ms',
  }),
  addNodeMenu: {
    position: 'absolute' as const,
    top: 36,
    left: 8,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-default)',
    borderRadius: 6,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    zIndex: 30,
    padding: '4px 0',
    minWidth: 160,
  } as React.CSSProperties,
  addNodeItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    fontSize: 11,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    width: '100%',
    textAlign: 'left' as const,
    transition: 'background 100ms',
  } as React.CSSProperties,
};

// ─── Node Type Configs ──────────────────────────────────────────────────────

const NODE_TYPES: { type: VFXNode['type']; label: string; color: string }[] = [
  { type: 'input', label: 'Read (Input)', color: '#4a90d9' },
  { type: 'color_correct', label: 'Color Correct', color: '#d4a843' },
  { type: 'blur', label: 'Blur', color: '#8a6dcf' },
  { type: 'key', label: 'Keylight', color: '#4dc95e' },
  { type: 'merge', label: 'Merge', color: '#cf6d6d' },
  { type: 'transform', label: 'Transform', color: '#5cbed6' },
  { type: 'grade', label: 'Grade', color: '#d69c5c' },
  { type: 'output', label: 'Write (Output)', color: '#e0e0e0' },
];

// ─── SVG Connection Lines ───────────────────────────────────────────────────

const ConnectionLines = memo(function ConnectionLines({
  connections,
  nodes,
}: {
  connections: Connection[];
  nodes: VFXNode[];
}) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <svg
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      {connections.map((conn) => {
        const fromNode = nodeMap.get(conn.fromNode);
        const toNode = nodeMap.get(conn.toNode);
        if (!fromNode || !toNode) return null;

        const x1 = fromNode.position.x + 120;
        const y1 = fromNode.position.y + 20 + conn.fromOutput * 18;
        const x2 = toNode.position.x;
        const y2 = toNode.position.y + 20 + conn.toInput * 18;
        const cx = (x1 + x2) / 2;

        return (
          <path
            key={conn.id}
            d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke="rgba(155,125,255,0.5)"
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
});

// ─── Node Component ─────────────────────────────────────────────────────────

interface NodeProps {
  node: VFXNode;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDragStart: (id: string, e: React.MouseEvent) => void;
}

const NodeComponent = memo(function NodeComponent({ node, isSelected, onSelect, onDragStart }: NodeProps) {
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(node.id);
    onDragStart(node.id, e);
  }, [node.id, onSelect, onDragStart]);

  const typeIcon: Record<string, string> = {
    input: 'IN',
    output: 'OUT',
    color_correct: 'CC',
    blur: 'BL',
    key: 'KY',
    merge: 'MG',
    transform: 'TR',
    grade: 'GR',
  };

  return (
    <div
      style={{
        ...S.nodeBox(node.color, isSelected),
        left: node.position.x,
        top: node.position.y,
      }}
      onMouseDown={handleMouseDown}
      role="button"
      aria-label={`Node: ${node.label}`}
      aria-pressed={isSelected}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(node.id); }}
    >
      <div style={S.nodeHeader(node.color)}>
        <span style={{
          width: 18, height: 18, borderRadius: 3,
          background: 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 7, fontWeight: 800, letterSpacing: '0.05em',
        }}>
          {typeIcon[node.type] || '??'}
        </span>
        {node.label}
      </div>
      <div style={S.nodeBody}>
        {/* Input ports */}
        {node.inputs.map((inputName, i) => (
          <div key={`in-${i}`} style={{ position: 'relative', marginBottom: 2 }}>
            <div style={{ ...S.nodePort('left'), top: i * 18 + 2 }} title={`Input: ${inputName}`} />
            <span style={{ ...S.nodePortLabel, paddingLeft: 10 }}>{inputName}</span>
          </div>
        ))}
        {/* Output ports */}
        {node.outputs.map((outputName, i) => (
          <div key={`out-${i}`} style={{ position: 'relative', marginBottom: 2, textAlign: 'right' }}>
            <div style={{ ...S.nodePort('right'), top: i * 18 + 2 }} title={`Output: ${outputName}`} />
            <span style={{ ...S.nodePortLabel, paddingRight: 10 }}>{outputName}</span>
          </div>
        ))}
        {node.inputs.length === 0 && node.outputs.length === 0 && (
          <div style={{ fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic' }}>No ports</div>
        )}
      </div>
    </div>
  );
});

// ─── Properties Panel ───────────────────────────────────────────────────────

function PropertiesPanel({ node }: { node: VFXNode | null }) {
  if (!node) {
    return (
      <div style={S.rightPanel}>
        <div style={S.panelHeader}>
          <span style={S.panelTitle}>Properties</span>
        </div>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)', fontSize: 11, fontStyle: 'italic', padding: 20,
          textAlign: 'center',
        }}>
          Select a node to view properties
        </div>
      </div>
    );
  }

  return (
    <div style={S.rightPanel}>
      <div style={S.panelHeader}>
        <span style={S.panelTitle}>{node.label}</span>
        <span style={{
          marginLeft: 'auto', fontSize: 9, fontWeight: 600,
          padding: '2px 6px', borderRadius: 4,
          background: `${node.color}22`, color: node.color,
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          {node.type.replace('_', ' ')}
        </span>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Node Info */}
        <div style={S.paramSection}>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6,
          }}>
            Node Info
          </div>
          <div style={S.paramRow}>
            <span style={S.paramLabel}>ID</span>
            <span style={{ ...S.paramValue, fontSize: 9 }}>{node.id}</span>
          </div>
          <div style={S.paramRow}>
            <span style={S.paramLabel}>Inputs</span>
            <span style={S.paramValue}>{node.inputs.length}</span>
          </div>
          <div style={S.paramRow}>
            <span style={S.paramLabel}>Outputs</span>
            <span style={S.paramValue}>{node.outputs.length}</span>
          </div>
        </div>

        {/* Parameters */}
        <div style={S.paramSection}>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6,
          }}>
            Parameters
          </div>
          {Object.entries(node.params).map(([key, value]) => (
            <div key={key} style={S.paramRow}>
              <span style={S.paramLabel}>{key}</span>
              {typeof value === 'number' ? (
                <input
                  type="range"
                  min={0}
                  max={key === 'quality' ? 30 : key === 'size' ? 100 : 2}
                  step={key === 'quality' ? 1 : 0.01}
                  value={value}
                  readOnly
                  style={{ width: 80, height: 3, cursor: 'pointer' }}
                  aria-label={key}
                  aria-valuetext={String(value)}
                />
              ) : typeof value === 'boolean' ? (
                <span style={{
                  ...S.paramValue,
                  color: value ? 'var(--success)' : 'var(--text-muted)',
                }}>
                  {value ? 'On' : 'Off'}
                </span>
              ) : (
                <span style={{ ...S.paramValue, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {String(value)}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Transform controls for applicable nodes */}
        {(node.type === 'merge' || node.type === 'transform') && (
          <div style={S.paramSection}>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6,
            }}>
              Transform
            </div>
            {['Translate X', 'Translate Y', 'Rotate', 'Scale'].map((param) => (
              <div key={param} style={S.paramRow}>
                <span style={S.paramLabel}>{param}</span>
                <span style={S.paramValue}>0.0</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Viewer Panel ───────────────────────────────────────────────────────────

function ViewerPanel({ selectedNodeLabel }: { selectedNodeLabel: string | null }) {
  return (
    <div style={S.viewer} role="region" aria-label="Composite viewer">
      <div style={S.viewerHeader}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Viewer
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {selectedNodeLabel || 'Write1'} | 1920x1080 | F001
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {['R', 'G', 'B', 'A'].map((ch) => (
            <button key={ch} style={{
              width: 18, height: 18, fontSize: 9, fontWeight: 700,
              border: '1px solid var(--border-subtle)', borderRadius: 3,
              background: 'transparent', cursor: 'pointer',
              color: ch === 'R' ? '#ef4444' : ch === 'G' ? '#22c55e' : ch === 'B' ? '#3b82f6' : 'var(--text-muted)',
            }} title={`View ${ch} channel`} aria-label={`View ${ch} channel`}>
              {ch}
            </button>
          ))}
        </div>
      </div>
      <div style={S.viewerCanvas}>
        {/* Placeholder composite preview */}
        <div style={{
          width: '80%', maxWidth: 480, aspectRatio: '16/9',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #2d1b4e 50%, #1a2e1a 100%)',
          borderRadius: 4, border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Grid overlay */}
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.1 }}>
            <defs>
              <pattern id="vfx-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#vfx-grid)" />
          </svg>
          <div style={{
            fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            Composite Preview
          </div>
          {/* Frame number */}
          <div style={{
            position: 'absolute', bottom: 6, right: 8,
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'rgba(255,255,255,0.3)',
          }}>
            F001 | 00:00:00:01
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────────────────

function VFXPageSkeleton() {
  return (
    <div style={S.root} aria-hidden="true">
      <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
        <div style={{ padding: 12 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ height: 12, background: 'var(--bg-elevated)', borderRadius: 3, marginBottom: 8, width: `${60 + Math.random() * 40}%` }} />
          ))}
        </div>
      </div>
      <div style={{ flex: 1, background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid var(--border-subtle)', borderTopColor: 'var(--brand)', animation: 'spin 0.8s linear infinite' }} />
      </div>
      <div style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--border-default)', background: 'var(--bg-surface)' }} />
    </div>
  );
}

// ─── Main VFX Page ──────────────────────────────────────────────────────────

export function VFXPage() {
  const [isReady, setIsReady] = useState(false);
  const [nodes, setNodes] = useState<VFXNode[]>(DEFAULT_NODES);
  const [connections] = useState<Connection[]>(DEFAULT_CONNECTIONS);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const dragState = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
  const graphRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 150);
    return () => clearTimeout(timer);
  }, []);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;

  const handleNodeSelect = useCallback((id: string) => {
    setSelectedNodeId(id);
  }, []);

  const handleDragStart = useCallback((nodeId: string, e: React.MouseEvent) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    dragState.current = {
      nodeId,
      offsetX: e.clientX - node.position.x,
      offsetY: e.clientY - node.position.y,
    };
  }, [nodes]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState.current) return;
    const { nodeId, offsetX, offsetY } = dragState.current;
    setNodes((prev) => prev.map((n) =>
      n.id === nodeId
        ? { ...n, position: { x: e.clientX - offsetX, y: e.clientY - offsetY } }
        : n
    ));
  }, []);

  const handleMouseUp = useCallback(() => {
    dragState.current = null;
  }, []);

  const handleAddNode = useCallback((type: VFXNode['type'], label: string, color: string) => {
    const newNode: VFXNode = {
      id: `${type}-${Date.now()}`,
      type,
      label: `${label.split(' ')[0]}${nodes.filter((n) => n.type === type).length + 1}`,
      position: { x: 300 + Math.random() * 100, y: 150 + Math.random() * 100 },
      color,
      inputs: type === 'input' ? [] : type === 'merge' ? ['A', 'B', 'mask'] : ['in'],
      outputs: type === 'output' ? [] : type === 'key' ? ['out', 'matte'] : ['out'],
      params: {},
    };
    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
    setShowAddMenu(false);
  }, [nodes]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedNodeId) return;
    setNodes((prev) => prev.filter((n) => n.id !== selectedNodeId));
    setSelectedNodeId(null);
  }, [selectedNodeId]);

  const handleGraphClick = useCallback(() => {
    setSelectedNodeId(null);
    setShowAddMenu(false);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelected();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleDeleteSelected]);

  if (!isReady) {
    return <VFXPageSkeleton />;
  }

  return (
    <div style={S.root} role="region" aria-label="VFX Page - Node-based compositing">
      {/* Left: Media Pool */}
      <div style={S.leftPanel}>
        <BinPanel />
      </div>

      {/* Center: Node Graph + Viewer */}
      <div style={S.centerPanel}>
        {/* Node Graph */}
        <div
          ref={graphRef}
          style={S.nodeGraph}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleGraphClick}
          role="application"
          aria-label="Node graph editor"
        >
          {/* Grid background */}
          <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width="100%" height="100%" aria-hidden="true">
            <defs>
              <pattern id="dot-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="0.5" fill="rgba(255,255,255,0.06)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dot-grid)" />
          </svg>

          {/* Toolbar */}
          <div style={S.graphToolbar}>
            <button
              style={S.graphBtn(false)}
              onClick={(e) => { e.stopPropagation(); setShowAddMenu((p) => !p); }}
              title="Add node"
              aria-label="Add node"
            >
              + Add Node
            </button>
            <button
              style={S.graphBtn(false)}
              onClick={(e) => { e.stopPropagation(); setNodes(DEFAULT_NODES); setSelectedNodeId(null); }}
              title="Reset graph"
              aria-label="Reset graph"
            >
              Reset
            </button>
            <button
              style={S.graphBtn(false)}
              onClick={(e) => { e.stopPropagation(); handleDeleteSelected(); }}
              disabled={!selectedNodeId}
              title="Delete selected node"
              aria-label="Delete selected node"
            >
              Delete
            </button>
            <span style={{
              fontSize: 9, color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 8,
              fontFamily: 'var(--font-mono)',
            }}>
              {nodes.length} nodes | {connections.length} connections
            </span>
          </div>

          {/* Add Node Menu */}
          {showAddMenu && (
            <div style={S.addNodeMenu} role="menu" aria-label="Add node menu">
              {NODE_TYPES.map((nt) => (
                <button
                  key={nt.type}
                  style={S.addNodeItem}
                  onClick={(e) => { e.stopPropagation(); handleAddNode(nt.type, nt.label, nt.color); }}
                  role="menuitem"
                  onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; }}
                  onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <span style={{
                    width: 10, height: 10, borderRadius: 2,
                    background: nt.color, flexShrink: 0,
                  }} />
                  {nt.label}
                </button>
              ))}
            </div>
          )}

          {/* Connection lines */}
          <ConnectionLines connections={connections} nodes={nodes} />

          {/* Nodes */}
          {nodes.map((node) => (
            <NodeComponent
              key={node.id}
              node={node}
              isSelected={selectedNodeId === node.id}
              onSelect={handleNodeSelect}
              onDragStart={handleDragStart}
            />
          ))}
        </div>

        {/* Viewer */}
        <ViewerPanel selectedNodeLabel={selectedNode?.label || null} />
      </div>

      {/* Right: Properties */}
      <PropertiesPanel node={selectedNode} />
    </div>
  );
}
