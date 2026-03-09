import React, { useState } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface RenderNode {
  id: string;
  hostname: string;
  gpu: string;
  gpuVendor: string;
  status: 'idle' | 'busy' | 'offline' | 'error';
  currentJob: string | null;
  progress: number;
  vramMB: number;
  cpuCores: number;
  memoryGB: number;
}

interface RenderJob {
  id: string;
  name: string;
  format: string;
  priority: 'high' | 'normal' | 'low';
  status: 'queued' | 'rendering' | 'complete' | 'failed';
  progress: number;
  nodeId: string | null;
  submittedAt: number;
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_NODES: RenderNode[] = [
  {
    id: 'node-1',
    hostname: 'render-alpha',
    gpu: 'NVIDIA RTX 4090',
    gpuVendor: 'nvidia',
    status: 'busy',
    currentJob: 'job-1',
    progress: 67,
    vramMB: 24576,
    cpuCores: 16,
    memoryGB: 64,
  },
  {
    id: 'node-2',
    hostname: 'render-beta',
    gpu: 'AMD RX 7900 XTX',
    gpuVendor: 'amd',
    status: 'busy',
    currentJob: 'job-2',
    progress: 34,
    vramMB: 24576,
    cpuCores: 12,
    memoryGB: 32,
  },
  {
    id: 'node-3',
    hostname: 'render-gamma',
    gpu: 'NVIDIA RTX 3080',
    gpuVendor: 'nvidia',
    status: 'idle',
    currentJob: null,
    progress: 0,
    vramMB: 10240,
    cpuCores: 8,
    memoryGB: 32,
  },
  {
    id: 'node-4',
    hostname: 'render-delta',
    gpu: 'Apple M3 Max',
    gpuVendor: 'apple',
    status: 'offline',
    currentJob: null,
    progress: 0,
    vramMB: 0,
    cpuCores: 16,
    memoryGB: 128,
  },
];

const MOCK_JOBS: RenderJob[] = [
  {
    id: 'job-1',
    name: 'Documentary_Final_v3.mov',
    format: 'ProRes 4444',
    priority: 'high',
    status: 'rendering',
    progress: 67,
    nodeId: 'node-1',
    submittedAt: Date.now() - 3600_000,
  },
  {
    id: 'job-2',
    name: 'Commercial_30s_4K.mp4',
    format: 'H.265 / HEVC',
    priority: 'normal',
    status: 'rendering',
    progress: 34,
    nodeId: 'node-2',
    submittedAt: Date.now() - 1800_000,
  },
  {
    id: 'job-3',
    name: 'Wedding_Highlights_HDR.mp4',
    format: 'H.264 / AVC',
    priority: 'normal',
    status: 'queued',
    progress: 0,
    nodeId: null,
    submittedAt: Date.now() - 900_000,
  },
  {
    id: 'job-4',
    name: 'MusicVideo_AV1.webm',
    format: 'AV1',
    priority: 'low',
    status: 'queued',
    progress: 0,
    nodeId: null,
    submittedAt: Date.now() - 600_000,
  },
];

// ─── Styles ────────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-display), system-ui, sans-serif',
  fontSize: 12,
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--border-default)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexShrink: 0,
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: 16,
};

const thStyle: React.CSSProperties = {
  padding: '6px 8px',
  textAlign: 'left',
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid var(--border-default)',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 8px',
  fontSize: 11,
  borderBottom: '1px solid var(--border-subtle)',
  whiteSpace: 'nowrap',
};

const btnPrimary: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  background: 'var(--brand)',
  color: '#fff',
  fontSize: 10,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-default)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  fontSize: 10,
  fontWeight: 600,
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-default)',
  background: 'var(--bg-void)',
  color: 'var(--text-primary)',
  fontSize: 11,
  outline: 'none',
  boxSizing: 'border-box' as const,
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, { bg: string; color: string }> = {
    idle: { bg: 'rgba(34,197,94,.15)', color: 'var(--success)' },
    busy: { bg: 'rgba(109,76,250,.15)', color: 'var(--brand-bright)' },
    offline: { bg: 'var(--bg-overlay)', color: 'var(--text-tertiary)' },
    error: { bg: 'rgba(239,68,68,.15)', color: 'var(--error)' },
    queued: { bg: 'rgba(245,158,11,.15)', color: 'var(--warning)' },
    rendering: { bg: 'rgba(109,76,250,.15)', color: 'var(--brand-bright)' },
    complete: { bg: 'rgba(34,197,94,.15)', color: 'var(--success)' },
    failed: { bg: 'rgba(239,68,68,.15)', color: 'var(--error)' },
  };
  const style = map[status] || map['offline'];
  return (
    <span
      style={{
        fontSize: 9,
        padding: '2px 6px',
        borderRadius: 3,
        background: style!.bg!,
        color: style!.color!,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      {status}
    </span>
  );
}

function priorityBadge(priority: string) {
  const colors: Record<string, string> = {
    high: 'var(--error)',
    normal: 'var(--text-secondary)',
    low: 'var(--text-muted)',
  };
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 600,
        color: colors[priority] || 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {priority}
    </span>
  );
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function RenderFarm() {
  const [enabled, setEnabled] = useState(true);
  const [nodes, setNodes] = useState<RenderNode[]>(MOCK_NODES);
  const [jobs] = useState<RenderJob[]>(MOCK_JOBS);
  const [showAddNode, setShowAddNode] = useState(false);
  const [newHostname, setNewHostname] = useState('');
  const [newPort, setNewPort] = useState('4000');

  // Compute overall progress across active jobs
  const activeJobs = jobs.filter((j) => j.status === 'rendering');
  const overallProgress =
    activeJobs.length > 0
      ? Math.round(
          activeJobs.reduce((sum, j) => sum + j.progress, 0) / activeJobs.length,
        )
      : 0;

  const busyNodes = nodes.filter((n) => n.status === 'busy').length;
  const onlineNodes = nodes.filter((n) => n.status !== 'offline').length;

  function handleAddNode() {
    if (!newHostname.trim()) return;
    const node: RenderNode = {
      id: `node-${Date.now()}`,
      hostname: newHostname.trim(),
      gpu: 'Detecting...',
      gpuVendor: 'unknown',
      status: 'idle',
      currentJob: null,
      progress: 0,
      vramMB: 0,
      cpuCores: 0,
      memoryGB: 0,
    };
    setNodes((prev) => [...prev, node]);
    setNewHostname('');
    setNewPort('4000');
    setShowAddNode(false);
  }

  function handleRemoveNode(id: string) {
    setNodes((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.02em' }}>
          Distributed Rendering
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
          <button
            onClick={() => setEnabled(!enabled)}
            style={{
              width: 36,
              height: 18,
              borderRadius: 9,
              border: 'none',
              background: enabled ? 'var(--brand)' : 'var(--bg-overlay)',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 150ms',
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#fff',
                position: 'absolute',
                top: 2,
                left: enabled ? 20 : 2,
                transition: 'left 150ms',
              }}
            />
          </button>
        </div>
      </div>

      <div style={bodyStyle}>
        {/* Overview cards */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          {[
            {
              label: 'Nodes Online',
              value: `${onlineNodes}/${nodes.length}`,
              color: 'var(--success)',
            },
            {
              label: 'Active Jobs',
              value: `${busyNodes}`,
              color: 'var(--brand-bright)',
            },
            {
              label: 'Queue',
              value: `${jobs.filter((j) => j.status === 'queued').length}`,
              color: 'var(--warning)',
            },
            {
              label: 'Overall Progress',
              value: `${overallProgress}%`,
              color: 'var(--brand)',
            },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                flex: 1,
                padding: '12px 10px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-raised)',
                border: '1px solid var(--border-subtle)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  marginBottom: 4,
                }}
              >
                {card.label}
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: card.color,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {card.value}
              </div>
            </div>
          ))}
        </div>

        {/* Render Node List */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-primary)' }}>
            Render Nodes
          </div>
          <button onClick={() => setShowAddNode(!showAddNode)} style={btnPrimary}>
            + Add Node
          </button>
        </div>

        {/* Add node form */}
        {showAddNode && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-raised)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <input
              type="text"
              value={newHostname}
              onChange={(e) => setNewHostname(e.target.value)}
              placeholder="hostname or IP"
              style={{ ...inputStyle, flex: 1 }}
              onKeyDown={(e) => e.key === 'Enter' && handleAddNode()}
            />
            <input
              type="text"
              value={newPort}
              onChange={(e) => setNewPort(e.target.value)}
              placeholder="port"
              style={{ ...inputStyle, width: 60 }}
              onKeyDown={(e) => e.key === 'Enter' && handleAddNode()}
            />
            <button onClick={handleAddNode} style={btnPrimary}>
              Connect
            </button>
            <button onClick={() => setShowAddNode(false)} style={btnSecondary}>
              Cancel
            </button>
          </div>
        )}

        {/* Nodes table */}
        <div style={{ overflowX: 'auto', marginBottom: 20 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Hostname</th>
                <th style={thStyle}>GPU</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Current Job</th>
                <th style={{ ...thStyle, width: '20%' }}>Progress</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => {
                const job = node.currentJob
                  ? jobs.find((j) => j.id === node.currentJob)
                  : null;
                return (
                  <tr key={node.id}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      {node.hostname}
                      <span
                        style={{
                          fontSize: 9,
                          color: 'var(--text-muted)',
                          marginLeft: 6,
                        }}
                      >
                        {node.cpuCores > 0 &&
                          `${node.cpuCores}c / ${node.memoryGB}GB`}
                      </span>
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                      }}
                    >
                      {node.gpu}
                    </td>
                    <td style={tdStyle}>{statusBadge(node.status)}</td>
                    <td
                      style={{
                        ...tdStyle,
                        color: 'var(--text-muted)',
                        maxWidth: 140,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {job ? job.name : '-'}
                    </td>
                    <td style={tdStyle}>
                      {node.status === 'busy' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div
                            style={{
                              flex: 1,
                              height: 6,
                              borderRadius: 3,
                              background: 'var(--bg-elevated)',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                height: '100%',
                                width: `${node.progress}%`,
                                borderRadius: 3,
                                background: 'var(--brand)',
                                transition: 'width 300ms',
                              }}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--text-secondary)',
                              minWidth: 30,
                              textAlign: 'right',
                            }}
                          >
                            {node.progress}%
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>
                          -
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => handleRemoveNode(node.id)}
                        style={{
                          padding: '3px 8px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--error)',
                          background: 'transparent',
                          color: 'var(--error)',
                          fontSize: 9,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
              {nodes.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      ...tdStyle,
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      padding: 20,
                    }}
                  >
                    No render nodes configured. Click &quot;Add Node&quot; to get
                    started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Job Queue */}
        <div
          style={{
            fontWeight: 600,
            fontSize: 11,
            color: 'var(--text-primary)',
            marginBottom: 8,
          }}
        >
          Job Queue
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Job</th>
                <th style={thStyle}>Format</th>
                <th style={thStyle}>Priority</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, width: '20%' }}>Progress</th>
                <th style={thStyle}>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td style={{ ...tdStyle, fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {job.name}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                    }}
                  >
                    {job.format}
                  </td>
                  <td style={tdStyle}>{priorityBadge(job.priority)}</td>
                  <td style={tdStyle}>{statusBadge(job.status)}</td>
                  <td style={tdStyle}>
                    {job.status === 'rendering' ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <div
                          style={{
                            flex: 1,
                            height: 6,
                            borderRadius: 3,
                            background: 'var(--bg-elevated)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${job.progress}%`,
                              borderRadius: 3,
                              background: 'var(--brand)',
                              transition: 'width 300ms',
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-secondary)',
                            minWidth: 30,
                            textAlign: 'right',
                          }}
                        >
                          {job.progress}%
                        </span>
                      </div>
                    ) : (
                      <span
                        style={{ color: 'var(--text-tertiary)', fontSize: 10 }}
                      >
                        -
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {timeAgo(job.submittedAt)}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      ...tdStyle,
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      padding: 20,
                    }}
                  >
                    No render jobs in queue.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
