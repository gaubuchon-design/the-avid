// =============================================================================
//  Node Graph — Visual Color Pipeline Editor
//  Serial/parallel/layer node display with add/remove/enable controls.
// =============================================================================

import React, { useCallback, useRef } from 'react';
import { useColorStore } from '../../store/color.store';
import { colorEngine, ColorNode, ColorNodeType } from '../../engine/ColorEngine';

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

const NODE_LABELS: Record<ColorNodeType, string> = {
  source: 'SRC',
  primary: 'PRI',
  secondary: 'SEC',
  curves: 'CRV',
  huesat: 'HSL',
  lut: 'LUT',
  mixer: 'MIX',
  output: 'OUT',
};

const ADDABLE_TYPES: { type: ColorNodeType; label: string }[] = [
  { type: 'primary', label: 'Primary' },
  { type: 'curves', label: 'Curves' },
  { type: 'huesat', label: 'Hue/Sat' },
  { type: 'secondary', label: 'Qualifier' },
  { type: 'mixer', label: 'Mixer' },
  { type: 'lut', label: 'LUT' },
];

function NodeBox({
  node,
  isSelected,
  onClick,
  onToggle,
  onRemove,
}: {
  node: ColorNode;
  isSelected: boolean;
  onClick: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const color = NODE_COLORS[node.type];
  const isFixed = node.type === 'source' || node.type === 'output';

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      <div
        style={{
          width: 52,
          height: 36,
          borderRadius: 4,
          background: isSelected ? `${color}22` : 'var(--bg-raised)',
          border: `2px solid ${isSelected ? color : node.enabled ? color + '60' : 'var(--border-default)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: node.enabled ? 1 : 0.4,
          position: 'relative',
        }}
      >
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.06em',
          color: node.enabled ? color : 'var(--text-muted)',
        }}>
          {NODE_LABELS[node.type]}
        </span>

        {/* Enable/disable toggle (not on source/output) */}
        {!isFixed && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: node.enabled ? '#4ade80' : '#666',
              border: '1px solid var(--bg-surface)',
              cursor: 'pointer',
              padding: 0,
              fontSize: 0,
            }}
            title={node.enabled ? 'Disable' : 'Enable'}
          />
        )}
      </div>

      {/* Node label */}
      <span style={{ fontSize: 8, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
        {node.type}
      </span>

      {/* Remove button (not on source/output) */}
      {!isFixed && isSelected && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{
            position: 'absolute',
            top: -6,
            left: -6,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#f87171',
            border: '1px solid var(--bg-surface)',
            cursor: 'pointer',
            padding: 0,
            fontSize: 8,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}
          title="Remove node"
        >
          x
        </button>
      )}
    </div>
  );
}

export function NodeGraph() {
  const nodes = useColorStore((s) => s.nodes);
  const connections = useColorStore((s) => s.connections);
  const selectedNodeId = useColorStore((s) => s.selectedNodeId);
  const selectNode = useColorStore((s) => s.selectNode);
  const addNode = useColorStore((s) => s.addNode);
  const removeNode = useColorStore((s) => s.removeNode);
  const [showAddMenu, setShowAddMenu] = React.useState(false);

  // Build ordered chain
  const chain: ColorNode[] = [];
  const visited = new Set<string>();
  let current = nodes.find((n) => n.type === 'source');
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push(current);
    const conn = connections.find((c) => c.from === current!.id);
    current = conn ? nodes.find((n) => n.id === conn.to) : undefined;
  }

  const handleToggle = useCallback((id: string) => {
    const node = colorEngine.getNode(id);
    if (!node) return;
    colorEngine.updateNodeParams(id, {}); // trigger change
    // Toggle enabled directly
    node.enabled = !node.enabled;
    (colorEngine as any).notify();
  }, []);

  const handleAddNode = useCallback((type: ColorNodeType) => {
    // Insert before output
    const outputNode = nodes.find((n) => n.type === 'output');
    if (!outputNode) {
      addNode(type);
      return;
    }

    // Find node connected to output
    const conn = connections.find((c) => c.to === outputNode.id);
    if (!conn) {
      addNode(type);
      return;
    }

    const newNode = colorEngine.addNode(type);
    // Disconnect previous -> output
    colorEngine.removeNode(newNode.id); // Remove and re-add with wiring
    const nn = colorEngine.addNode(type);

    // Rewire: previous -> new -> output
    const prevId = conn.from;
    (colorEngine as any).connections = (colorEngine as any).connections.filter(
      (c: any) => !(c.from === prevId && c.to === outputNode.id),
    );
    const prevNode = colorEngine.getNode(prevId);
    if (prevNode) {
      prevNode.outputs = prevNode.outputs.filter((o) => o !== outputNode.id);
    }
    outputNode.inputs = outputNode.inputs.filter((i) => i !== prevId);

    colorEngine.connectNodes(prevId, nn.id);
    colorEngine.connectNodes(nn.id, outputNode.id);

    setShowAddMenu(false);
  }, [nodes, connections, addNode]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '6px 8px', gap: 4 }}>
      {/* Add node button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          style={{
            padding: '3px 8px',
            fontSize: 9,
            background: 'var(--bg-raised)',
            border: '1px solid var(--border-default)',
            borderRadius: 3,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          + Add Node
        </button>
        {showAddMenu && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 100,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 4,
            padding: 2,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}>
            {ADDABLE_TYPES.map(({ type, label }) => (
              <button
                key={type}
                onClick={() => handleAddNode(type)}
                style={{
                  padding: '4px 12px',
                  fontSize: 10,
                  color: NODE_COLORS[type],
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          {chain.length} nodes
        </span>
      </div>

      {/* Node chain visualization */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        flex: 1,
        overflowX: 'auto',
        padding: '8px 0',
      }}>
        {chain.map((node, i) => (
          <React.Fragment key={node.id}>
            <NodeBox
              node={node}
              isSelected={node.id === selectedNodeId}
              onClick={() => selectNode(node.id === selectedNodeId ? null : node.id)}
              onToggle={() => handleToggle(node.id)}
              onRemove={() => removeNode(node.id)}
            />
            {i < chain.length - 1 && (
              <div style={{
                width: 20,
                height: 2,
                background: 'var(--border-default)',
                flexShrink: 0,
                position: 'relative',
              }}>
                <div style={{
                  position: 'absolute',
                  right: -2,
                  top: -3,
                  width: 0,
                  height: 0,
                  borderLeft: '5px solid var(--border-default)',
                  borderTop: '4px solid transparent',
                  borderBottom: '4px solid transparent',
                }} />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
