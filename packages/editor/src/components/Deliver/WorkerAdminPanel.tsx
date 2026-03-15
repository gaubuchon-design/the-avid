// =============================================================================
//  THE AVID — Worker Admin Panel (Deliver Page Right Panel — Workers Tab)
//  Farm stat cards, worker list with status/capabilities, and add worker form.
// =============================================================================

import React, { useState } from 'react';
import { useDeliverStore } from '../../store/deliver.store';
import { renderFarmEngine } from '../../engine/RenderFarmEngine';
import type { WorkerNode, WorkerStatus } from '../../types/deliver.types';

// ─── Status colors ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<WorkerStatus, string> = {
  idle: 'var(--success)',
  busy: 'var(--brand)',
  offline: 'var(--text-tertiary)',
  error: 'var(--error)',
  draining: 'var(--warning)',
};

const STATUS_LABELS: Record<WorkerStatus, string> = {
  idle: 'Idle',
  busy: 'Busy',
  offline: 'Offline',
  error: 'Error',
  draining: 'Draining',
};

// ─── Component ──────────────────────────────────────────────────────────────

export function WorkerAdminPanel() {
  const workers = useDeliverStore((s) => s.workers);
  const farmStats = useDeliverStore((s) => s.farmStats);
  const isConnected = useDeliverStore((s) => s.isConnected);
  const workerFilter = useDeliverStore((s) => s.workerFilter);

  const removeWorker = useDeliverStore((s) => s.removeWorker);
  const drainWorker = useDeliverStore((s) => s.drainWorker);
  const setWorkerFilter = useDeliverStore((s) => s.setWorkerFilter);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showInstallScript, setShowInstallScript] = useState(false);
  const [newHostname, setNewHostname] = useState('');
  const [newPort, setNewPort] = useState('4001');
  const [expandedNode, setExpandedNode] = useState<string | null>(null);

  const filteredWorkers = workerFilter === 'all'
    ? workers
    : workers.filter((w) => w.status === workerFilter);

  const handleAddWorker = () => {
    if (!newHostname.trim()) return;
    renderFarmEngine.registerWorker(newHostname.trim(), parseInt(newPort) || 4001);
    setNewHostname('');
    setNewPort('4001');
    setShowAddForm(false);
  };

  const installScript = renderFarmEngine.generateInstallScript(['render', 'ingest', 'transcribe', 'metadata']);
  const dockerCmd = renderFarmEngine.generateDockerCommand(['render']);

  return (
    <div style={panelStyle}>
      {/* Farm Stats Cards */}
      <div style={statsGridStyle}>
        <StatCard label="Nodes Online" value={`${farmStats.nodesOnline}/${farmStats.nodesTotal}`} color="var(--success)" />
        <StatCard label="Active Jobs" value={String(farmStats.activeJobs)} color="var(--brand)" />
        <StatCard label="Queue Depth" value={String(farmStats.queueDepth)} color="var(--warning)" />
        <StatCard label="Utilization" value={`${farmStats.utilization}%`} color="var(--info)" />
      </div>

      {/* Connection status */}
      <div style={connectionBarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: isConnected ? 'var(--success)' : 'var(--error)' }} />
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            {isConnected ? 'Connected to coordinator' : 'Disconnected'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setShowAddForm((v) => !v)} style={actionBtn}>+ Add</button>
          <button onClick={() => setShowInstallScript((v) => !v)} style={actionBtn}>📋 Install</button>
        </div>
      </div>

      {/* Add Worker Form */}
      {showAddForm && (
        <div style={formStyle}>
          <div style={formRowStyle}>
            <input
              placeholder="hostname / IP"
              value={newHostname}
              onChange={(e) => setNewHostname(e.target.value)}
              style={formInputStyle}
              onKeyDown={(e) => e.key === 'Enter' && handleAddWorker()}
            />
            <input
              placeholder="port"
              value={newPort}
              onChange={(e) => setNewPort(e.target.value)}
              style={{ ...formInputStyle, width: 60 }}
              type="number"
            />
            <button onClick={handleAddWorker} style={{ ...actionBtn, background: 'var(--success)', color: '#fff' }}>Add</button>
          </div>
        </div>
      )}

      {/* Install Script */}
      {showInstallScript && (
        <div style={scriptStyle}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
            INSTALL SCRIPT (copy & run on target machine)
          </div>
          <pre
            style={preStyle}
            onClick={() => navigator.clipboard?.writeText(installScript)}
            title="Click to copy"
          >
            {installScript}
          </pre>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', marginTop: 6, marginBottom: 4 }}>
            DOCKER (alternative)
          </div>
          <pre
            style={preStyle}
            onClick={() => navigator.clipboard?.writeText(dockerCmd)}
            title="Click to copy"
          >
            {dockerCmd}
          </pre>
        </div>
      )}

      {/* Filter bar */}
      <div style={filterBarStyle}>
        {(['all', 'idle', 'busy', 'offline', 'error', 'draining'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setWorkerFilter(f)}
            style={{
              ...filterBtn,
              background: workerFilter === f ? 'var(--brand-dim)' : 'transparent',
              color: workerFilter === f ? 'var(--text-accent)' : 'var(--text-muted)',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Worker list */}
      <div style={listStyle}>
        {filteredWorkers.length === 0 && (
          <div style={emptyStyle}>
            {workers.length === 0
              ? <>No render agents connected.<br />Use the Install button to set up a worker.</>
              : `No workers matching "${workerFilter}".`}
          </div>
        )}
        {filteredWorkers.map((worker) => (
          <WorkerRow
            key={worker.id}
            worker={worker}
            isExpanded={expandedNode === worker.id}
            onToggleExpand={() => setExpandedNode(expandedNode === worker.id ? null : worker.id)}
            onRemove={() => removeWorker(worker.id)}
            onDrain={() => drainWorker(worker.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={statCardStyle}>
      <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{value}</div>
      <div style={{ fontSize: 8, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em' }}>{label}</div>
    </div>
  );
}

// ─── Worker Row ─────────────────────────────────────────────────────────────

function WorkerRow({
  worker,
  isExpanded,
  onToggleExpand,
  onRemove,
  onDrain,
}: {
  worker: WorkerNode;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRemove: () => void;
  onDrain: () => void;
}) {
  const timeSinceHeartbeat = Math.round((Date.now() - worker.lastHeartbeat) / 1000);

  return (
    <div style={workerRowStyle}>
      <div style={workerHeaderStyle} onClick={onToggleExpand}>
        {/* Status dot */}
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[worker.status], flexShrink: 0 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={hostnameStyle}>{worker.hostname}</div>
          <div style={workerMetaStyle}>
            <span>{worker.ip}:{worker.port}</span>
            <span style={dotSep}>·</span>
            <span style={{ color: STATUS_COLORS[worker.status] }}>{STATUS_LABELS[worker.status]}</span>
            {worker.status === 'busy' && (
              <>
                <span style={dotSep}>·</span>
                <span>{Math.round(worker.progress)}%</span>
              </>
            )}
          </div>
        </div>

        {/* Worker type badges */}
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          {worker.workerTypes.map((wt) => (
            <span key={wt} style={workerTypeBadge}>{wt}</span>
          ))}
        </div>

        <span style={expandArrow}>{isExpanded ? '▾' : '▸'}</span>
      </div>

      {/* Progress bar for busy workers */}
      {worker.status === 'busy' && (
        <div style={{ padding: '0 10px 4px', marginTop: -2 }}>
          <div style={progressTrack}>
            <div style={{ ...progressFill, width: `${worker.progress}%` }} />
          </div>
        </div>
      )}

      {/* Expanded details */}
      {isExpanded && (
        <div style={expandedStyle}>
          {/* Hardware */}
          <div style={detailGrid}>
            <DetailItem label="GPU" value={worker.capabilities.gpuName} />
            <DetailItem label="VRAM" value={worker.capabilities.vramMB > 0 ? `${Math.round(worker.capabilities.vramMB / 1024)} GB` : 'N/A'} />
            <DetailItem label="CPU" value={`${worker.capabilities.cpuCores} cores`} />
            <DetailItem label="Memory" value={`${worker.capabilities.memoryGB} GB`} />
            <DetailItem label="FFmpeg" value={worker.capabilities.ffmpegVersion || 'N/A'} />
            <DetailItem label="HW Accel" value={worker.capabilities.hwAccel.join(', ') || 'None'} />
            <DetailItem label="Codecs" value={worker.capabilities.availableCodecs.slice(0, 6).join(', ')} />
            <DetailItem label="Max Jobs" value={String(worker.capabilities.maxConcurrentJobs)} />
          </div>

          {/* Metrics */}
          <div style={{ ...detailGrid, marginTop: 6 }}>
            <DetailItem label="Jobs Done" value={String(worker.metrics.jobsCompleted)} />
            <DetailItem label="Avg Duration" value={worker.metrics.averageJobDurationMs > 0 ? `${Math.round(worker.metrics.averageJobDurationMs / 1000)}s` : 'N/A'} />
            <DetailItem label="Failure Rate" value={`${(worker.metrics.failureRate * 100).toFixed(1)}%`} />
            <DetailItem label="CPU Usage" value={`${Math.round(worker.metrics.cpuUtilization)}%`} />
            <DetailItem label="GPU Usage" value={`${Math.round(worker.metrics.gpuUtilization)}%`} />
            <DetailItem label="Disk Free" value={`${worker.metrics.diskFreeGB.toFixed(1)} GB`} />
            <DetailItem label="Uptime" value={formatUptime(worker.metrics.uptimeMs)} />
            <DetailItem label="Heartbeat" value={`${timeSinceHeartbeat}s ago`} />
          </div>

          {/* Actions */}
          <div style={workerActionsStyle}>
            {worker.status !== 'draining' && worker.status !== 'offline' && (
              <button onClick={onDrain} style={{ ...workerActionBtn, color: 'var(--warning)' }}>Drain</button>
            )}
            <button onClick={onRemove} style={{ ...workerActionBtn, color: 'var(--error)' }}>Remove</button>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 8, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  );
}

function formatUptime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${mins}m`;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  overflow: 'hidden',
};

const statsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 4,
  padding: 6,
  borderBottom: '1px solid var(--border-default)',
};

const statCardStyle: React.CSSProperties = {
  padding: '6px 8px',
  background: 'var(--bg-overlay)',
  borderRadius: 'var(--radius-sm)',
  textAlign: 'center',
};

const connectionBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '4px 10px',
  borderBottom: '1px solid var(--border-default)',
};

const actionBtn: React.CSSProperties = {
  fontSize: 9,
  padding: '2px 8px',
  border: '1px solid var(--border-subtle)',
  borderRadius: 3,
  background: 'var(--bg-overlay)',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontWeight: 600,
};

const formStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderBottom: '1px solid var(--border-default)',
  background: 'var(--bg-raised)',
};

const formRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  alignItems: 'center',
};

const formInputStyle: React.CSSProperties = {
  flex: 1,
  padding: '3px 6px',
  fontSize: 10,
  background: 'var(--bg-overlay)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 3,
  color: 'var(--text-primary)',
  outline: 'none',
};

const scriptStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderBottom: '1px solid var(--border-default)',
  background: 'var(--bg-raised)',
};

const preStyle: React.CSSProperties = {
  fontSize: 8,
  padding: 6,
  background: 'var(--bg-overlay)',
  borderRadius: 3,
  color: 'var(--text-secondary)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  fontFamily: 'var(--font-mono)',
  cursor: 'pointer',
  maxHeight: 80,
  overflow: 'auto',
  border: '1px solid var(--border-subtle)',
};

const filterBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 2,
  padding: '4px 6px',
  borderBottom: '1px solid var(--border-default)',
  flexWrap: 'wrap',
};

const filterBtn: React.CSSProperties = {
  padding: '1px 5px',
  fontSize: 8,
  fontWeight: 600,
  textTransform: 'uppercase',
  borderRadius: 3,
  border: 'none',
  cursor: 'pointer',
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
};

const emptyStyle: React.CSSProperties = {
  padding: 20,
  textAlign: 'center',
  color: 'var(--text-muted)',
  fontSize: 10,
  lineHeight: 1.6,
};

const workerRowStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--border-subtle)',
};

const workerHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 10px',
  cursor: 'pointer',
};

const hostnameStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--text-primary)',
};

const workerMetaStyle: React.CSSProperties = {
  fontSize: 9,
  color: 'var(--text-tertiary)',
  display: 'flex',
  gap: 4,
  marginTop: 1,
};

const dotSep: React.CSSProperties = {
  color: 'var(--text-tertiary)',
};

const workerTypeBadge: React.CSSProperties = {
  fontSize: 7,
  padding: '1px 4px',
  borderRadius: 2,
  background: 'var(--bg-overlay)',
  color: 'var(--text-tertiary)',
  fontWeight: 600,
  textTransform: 'uppercase',
};

const expandArrow: React.CSSProperties = {
  fontSize: 8,
  color: 'var(--text-tertiary)',
  flexShrink: 0,
};

const progressTrack: React.CSSProperties = {
  height: 2,
  background: 'var(--bg-overlay)',
  borderRadius: 1,
  overflow: 'hidden',
};

const progressFill: React.CSSProperties = {
  height: '100%',
  background: 'var(--brand)',
  borderRadius: 1,
  transition: 'width 0.3s',
};

const expandedStyle: React.CSSProperties = {
  padding: '4px 10px 8px',
  background: 'var(--bg-raised)',
  borderTop: '1px solid var(--border-subtle)',
};

const detailGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 4,
};

const workerActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  marginTop: 8,
  justifyContent: 'flex-end',
};

const workerActionBtn: React.CSSProperties = {
  fontSize: 9,
  padding: '2px 10px',
  border: '1px solid var(--border-subtle)',
  borderRadius: 3,
  background: 'transparent',
  cursor: 'pointer',
  fontWeight: 600,
};
