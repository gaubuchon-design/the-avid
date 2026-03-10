import React, { useState, useEffect, useRef, useCallback } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  adminEngine,
  Role,
  TeamMember,
  AuditEntry,
  StorageUsage,
  TokenPolicy,
} from '../../engine/AdminEngine';

// =============================================================================
//  Inline Zustand store
// =============================================================================

type AdminTab = 'team' | 'access' | 'storage' | 'tokens' | 'audit';

interface AdminState {
  tab: AdminTab;
  members: TeamMember[];
  auditLog: AuditEntry[];
  storageUsage: StorageUsage[];
  tokenSummary: { total: number; used: number; byUser: { name: string; used: number }[] };
  // Invite form
  inviteEmail: string;
  inviteRole: Role;
  // Audit filters
  auditFilterUser: string;
  auditFilterAction: string;
  auditPage: number;
  // Token budget form
  budgetUserId: string;
  budgetAmount: string;
}

interface AdminActions {
  setTab: (t: AdminTab) => void;
  refresh: () => void;
  setInviteEmail: (e: string) => void;
  setInviteRole: (r: Role) => void;
  inviteMember: () => void;
  updateRole: (userId: string, role: Role) => void;
  removeMember: (userId: string) => void;
  setAuditFilterUser: (u: string) => void;
  setAuditFilterAction: (a: string) => void;
  setAuditPage: (p: number) => void;
  setBudgetUserId: (id: string) => void;
  setBudgetAmount: (a: string) => void;
  applyBudget: () => void;
}

const useAdminStore = create<AdminState & AdminActions>()(
  immer((set, get) => ({
    tab: 'team',
    members: adminEngine.getTeamMembers(),
    auditLog: adminEngine.getAuditLog(),
    storageUsage: adminEngine.getStorageUsage(),
    tokenSummary: adminEngine.getTokenUsageSummary(),
    inviteEmail: '',
    inviteRole: 'editor',
    auditFilterUser: '',
    auditFilterAction: '',
    auditPage: 0,
    budgetUserId: '',
    budgetAmount: '2000',

    setTab: (t) => set((s) => { s.tab = t; }),

    refresh: () =>
      set((s) => {
        s.members = adminEngine.getTeamMembers() as any;
        s.auditLog = adminEngine.getAuditLog({
          userId: s.auditFilterUser || undefined,
          action: s.auditFilterAction || undefined,
        }) as any;
        s.storageUsage = adminEngine.getStorageUsage() as any;
        s.tokenSummary = adminEngine.getTokenUsageSummary() as any;
      }),

    setInviteEmail: (e) => set((s) => { s.inviteEmail = e; }),
    setInviteRole: (r) => set((s) => { s.inviteRole = r; }),
    inviteMember: () => {
      const state = get();
      if (!state.inviteEmail.trim()) return;
      adminEngine.inviteMember(state.inviteEmail.trim(), state.inviteRole);
      set((s) => {
        s.inviteEmail = '';
        s.members = adminEngine.getTeamMembers() as any;
        s.auditLog = adminEngine.getAuditLog() as any;
      });
    },

    updateRole: (userId, role) => {
      adminEngine.updateMemberRole(userId, role);
      set((s) => {
        s.members = adminEngine.getTeamMembers() as any;
        s.auditLog = adminEngine.getAuditLog() as any;
      });
    },

    removeMember: (userId) => {
      adminEngine.removeMember(userId);
      set((s) => {
        s.members = adminEngine.getTeamMembers() as any;
        s.auditLog = adminEngine.getAuditLog() as any;
      });
    },

    setAuditFilterUser: (u) =>
      set((s) => {
        s.auditFilterUser = u;
        s.auditPage = 0;
        s.auditLog = adminEngine.getAuditLog({
          userId: u || undefined,
          action: s.auditFilterAction || undefined,
        }) as any;
      }),

    setAuditFilterAction: (a) =>
      set((s) => {
        s.auditFilterAction = a;
        s.auditPage = 0;
        s.auditLog = adminEngine.getAuditLog({
          userId: s.auditFilterUser || undefined,
          action: a || undefined,
        }) as any;
      }),

    setAuditPage: (p) => set((s) => { s.auditPage = p; }),

    setBudgetUserId: (id) => set((s) => { s.budgetUserId = id; }),
    setBudgetAmount: (a) => set((s) => { s.budgetAmount = a; }),

    applyBudget: () => {
      const state = get();
      const member = state.members.find((m) => m.id === state.budgetUserId);
      if (!member) return;
      // Stub: in production would call adminEngine.setTokenPolicy
      // For demo, we just update the member's budget directly
      set((s) => {
        const m = s.members.find((m: TeamMember) => m.id === state.budgetUserId);
        if (m) (m as TeamMember).tokenBudget = parseInt(state.budgetAmount) || 2000;
        s.tokenSummary = adminEngine.getTokenUsageSummary() as any;
        // Recalculate summary from local state
        const total = s.members.reduce((sum: number, m: TeamMember) => sum + m.tokenBudget, 0);
        const used = s.members.reduce((sum: number, m: TeamMember) => sum + m.tokenUsed, 0);
        s.tokenSummary = {
          total,
          used,
          byUser: s.members.map((m: TeamMember) => ({ name: m.name, used: m.tokenUsed })),
        };
      });
    },
  })),
);

// =============================================================================
//  Styles
// =============================================================================

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
  fontWeight: 700,
  fontSize: 13,
  letterSpacing: '0.02em',
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

const selectStyle: React.CSSProperties = {
  padding: '3px 6px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-default)',
  background: 'var(--bg-raised)',
  color: 'var(--text-primary)',
  fontSize: 10,
  outline: 'none',
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

const btnDanger: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--error)',
  background: 'transparent',
  color: 'var(--error)',
  fontSize: 10,
  fontWeight: 600,
  cursor: 'pointer',
};

const ALL_ROLES: Role[] = ['viewer', 'reviewer', 'editor', 'senior_editor', 'producer', 'admin'];

const ALL_PERMISSIONS = [
  'project.view',
  'project.comment',
  'project.create',
  'project.delete',
  'project.export',
  'timeline.edit',
  'color.grade',
  'ai.use',
  'admin.access',
  'billing.manage',
];

const ACTIONS = [
  'project.create',
  'project.delete',
  'project.export',
  'project.comment',
  'timeline.edit',
  'color.grade',
  'ai.use',
  'admin.access',
  'billing.manage',
];

// =============================================================================
//  Helpers
// =============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
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

function roleLabel(role: Role): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function avatarInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const AVATAR_COLORS = ['#5b6af5', '#2bb672', '#e8943a', '#e05b8e', '#6bc5e3', '#7c5cfc'];

// =============================================================================
//  Tab: Team
// =============================================================================

function TeamTab() {
  const { members, inviteEmail, inviteRole, setInviteEmail, setInviteRole, inviteMember, updateRole, removeMember } =
    useAdminStore();

  return (
    <div>
      {/* Invite form */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 16,
          padding: '10px 12px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-raised)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <input
          type="email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          placeholder="email@example.com"
          style={{ ...inputStyle, flex: 1 }}
          onKeyDown={(e) => e.key === 'Enter' && inviteMember()}
        />
        <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} style={selectStyle}>
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
        <button onClick={inviteMember} style={btnPrimary}>
          Invite
        </button>
      </div>

      {/* Team table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}></th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>Last Active</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => (
              <tr key={m.id}>
                <td style={tdStyle}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#fff',
                    }}
                  >
                    {avatarInitials(m.name)}
                  </div>
                </td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{m.name}</td>
                <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{m.email}</td>
                <td style={tdStyle}>
                  <select
                    value={m.role}
                    onChange={(e) => updateRole(m.id, e.target.value as Role)}
                    style={selectStyle}
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 10 }}>
                  {m.lastActive > 0 ? timeAgo(m.lastActive) : 'Never'}
                </td>
                <td style={tdStyle}>
                  <button onClick={() => removeMember(m.id)} style={btnDanger}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
//  Tab: Access (RBAC Matrix)
// =============================================================================

function AccessTab() {
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>
        Role Permissions Matrix
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 1 }}>
                Role
              </th>
              {ALL_PERMISSIONS.map((p) => (
                <th key={p} style={{ ...thStyle, textAlign: 'center', fontSize: 9 }}>
                  {p.replace('.', '\n')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_ROLES.map((role) => {
              const perms = adminEngine.getRolePermissions(role);
              return (
                <tr key={role}>
                  <td
                    style={{
                      ...tdStyle,
                      fontWeight: 600,
                      position: 'sticky',
                      left: 0,
                      background: 'var(--bg-surface)',
                      zIndex: 1,
                    }}
                  >
                    {roleLabel(role)}
                  </td>
                  {ALL_PERMISSIONS.map((p) => (
                    <td key={p} style={{ ...tdStyle, textAlign: 'center' }}>
                      {perms.includes(p) ? (
                        <span style={{ color: 'var(--success)', fontSize: 14 }}>&#10003;</span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>-</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
//  Tab: Storage
// =============================================================================

function StorageTab() {
  const { storageUsage } = useAdminStore();
  const totalUsed = adminEngine.getTotalStorageUsed();
  const quota = adminEngine.getStorageQuota();
  const pct = Math.round((totalUsed / quota) * 100);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw pie chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = 200 * dpr;
    canvas.height = 200 * dpr;
    ctx.scale(dpr, dpr);

    const cx = 100;
    const cy = 100;
    const r = 80;
    const total = storageUsage.reduce((s, u) => s + u.bytesUsed, 0);

    let startAngle = -Math.PI / 2;
    const colors = AVATAR_COLORS;

    storageUsage.forEach((u, i) => {
      const sliceAngle = total > 0 ? (u.bytesUsed / total) * Math.PI * 2 : 0;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length]!;
      ctx.fill();
      startAngle += sliceAngle;
    });

    // Center hole
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = 'var(--bg-surface)';
    // Read computed style for the fill
    const computedBg = getComputedStyle(canvas).getPropertyValue('--bg-surface') || '#1a1a2e';
    ctx.fillStyle = computedBg.trim();
    ctx.fill();

    // Center text
    ctx.fillStyle = '#e0e0e0';
    ctx.font = '700 14px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${pct}%`, cx, cy - 6);
    ctx.fillStyle = '#888';
    ctx.font = '500 9px system-ui';
    ctx.fillText('used', cx, cy + 10);
  }, [storageUsage, pct]);

  return (
    <div>
      {/* Total usage bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
          <span style={{ fontWeight: 600 }}>Total Storage</span>
          <span style={{ color: 'var(--text-muted)' }}>
            {formatBytes(totalUsed)} / {formatBytes(quota)}
          </span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              borderRadius: 4,
              background: pct > 80 ? 'var(--warning)' : 'var(--brand)',
              transition: 'width 300ms',
            }}
          />
        </div>
      </div>

      {/* Pie chart + legend */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 16 }}>
        <canvas ref={canvasRef} style={{ width: 200, height: 200, flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10 }}>
          {storageUsage.map((u, i) => (
            <div key={u.userId} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 10, color: 'var(--text-primary)' }}>{u.userName}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {formatBytes(u.bytesUsed)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-user table */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>User</th>
            <th style={thStyle}>Storage</th>
            <th style={thStyle}>Projects</th>
            <th style={{ ...thStyle, width: '40%' }}>Usage</th>
          </tr>
        </thead>
        <tbody>
          {storageUsage.map((u) => {
            const userPct = quota > 0 ? (u.bytesUsed / quota) * 100 : 0;
            return (
              <tr key={u.userId}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{u.userName}</td>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                  {formatBytes(u.bytesUsed)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>{u.projectCount}</td>
                <td style={tdStyle}>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${userPct}%`,
                        borderRadius: 3,
                        background: 'var(--brand-dim)',
                      }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
//  Tab: AI Tokens
// =============================================================================

function TokensTab() {
  const { members, tokenSummary, budgetUserId, budgetAmount, setBudgetUserId, setBudgetAmount, applyBudget } =
    useAdminStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const remaining = tokenSummary.total - tokenSummary.used;

  // Draw daily usage bar chart (last 7 days, simulated)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = 300;
    const h = 140;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Simulated daily data
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const values = [320, 480, 610, 390, 550, 180, 270];
    const maxVal = Math.max(...values);

    const barW = 28;
    const gap = (w - 40 - days.length * barW) / (days.length - 1);
    const chartH = h - 30;
    const left = 30;

    // Y axis labels
    ctx.fillStyle = '#666';
    ctx.font = '500 9px system-ui';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 3; i++) {
      const val = Math.round((maxVal / 3) * i);
      const y = chartH - (chartH * i) / 3;
      ctx.fillText(String(val), left - 6, y);
      // grid line
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Bars
    days.forEach((day, i) => {
      const x = left + i * (barW + gap);
      const barH = maxVal > 0 ? (values[i]! / maxVal) * (chartH - 10) : 0;
      const y = chartH - barH;

      // Bar
      ctx.fillStyle = '#7c5cfc';
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, [3, 3, 0, 0]);
      ctx.fill();

      // Day label
      ctx.fillStyle = '#888';
      ctx.font = '500 9px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(day, x + barW / 2, chartH + 6);
    });
  }, []);

  return (
    <div>
      {/* Overview */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total Budget', value: tokenSummary.total.toLocaleString(), color: 'var(--brand)' },
          { label: 'Used', value: tokenSummary.used.toLocaleString(), color: 'var(--warning)' },
          { label: 'Remaining', value: remaining.toLocaleString(), color: 'var(--success)' },
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
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{card.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: card.color, fontFamily: 'var(--font-mono)' }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Per-user table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <thead>
          <tr>
            <th style={thStyle}>User</th>
            <th style={thStyle}>Budget</th>
            <th style={thStyle}>Used</th>
            <th style={thStyle}>Remaining</th>
            <th style={{ ...thStyle, width: '30%' }}>Usage</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const mRemaining = m.tokenBudget - m.tokenUsed;
            const mPct = m.tokenBudget > 0 ? (m.tokenUsed / m.tokenBudget) * 100 : 0;
            return (
              <tr key={m.id}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{m.name}</td>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 10 }}>{m.tokenBudget.toLocaleString()}</td>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--warning)' }}>
                  {m.tokenUsed.toLocaleString()}
                </td>
                <td
                  style={{
                    ...tdStyle,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: mRemaining < 100 ? 'var(--error)' : 'var(--success)',
                  }}
                >
                  {mRemaining.toLocaleString()}
                </td>
                <td style={tdStyle}>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, mPct)}%`,
                        borderRadius: 3,
                        background: mPct > 90 ? 'var(--error)' : mPct > 70 ? 'var(--warning)' : 'var(--brand)',
                      }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Set budget form */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          padding: '10px 12px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-raised)',
          border: '1px solid var(--border-subtle)',
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Set budget:</span>
        <select
          value={budgetUserId}
          onChange={(e) => setBudgetUserId(e.target.value)}
          style={{ ...selectStyle, flex: 1 }}
        >
          <option value="">Select user...</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={budgetAmount}
          onChange={(e) => setBudgetAmount(e.target.value)}
          style={{ ...inputStyle, width: 80 }}
          min={0}
        />
        <button onClick={applyBudget} disabled={!budgetUserId} style={{ ...btnPrimary, opacity: budgetUserId ? 1 : 0.4 }}>
          Apply
        </button>
      </div>

      {/* Daily usage chart */}
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 11 }}>Daily Token Usage (Last 7 Days)</div>
      <canvas ref={canvasRef} style={{ width: 300, height: 140, borderRadius: 'var(--radius-md)', background: 'var(--bg-raised)' }} />
    </div>
  );
}

// =============================================================================
//  Tab: Audit Log
// =============================================================================

function AuditTab() {
  const {
    auditLog,
    members,
    auditFilterUser,
    auditFilterAction,
    auditPage,
    setAuditFilterUser,
    setAuditFilterAction,
    setAuditPage,
  } = useAdminStore();

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(auditLog.length / PAGE_SIZE));
  const paged = auditLog.slice(auditPage * PAGE_SIZE, (auditPage + 1) * PAGE_SIZE);

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <select value={auditFilterUser} onChange={(e) => setAuditFilterUser(e.target.value)} style={selectStyle}>
          <option value="">All Users</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          value={auditFilterAction}
          onChange={(e) => setAuditFilterAction(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Time</th>
              <th style={thStyle}>User</th>
              <th style={thStyle}>Action</th>
              <th style={thStyle}>Target</th>
              <th style={thStyle}>Details</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((entry) => (
              <tr key={entry.id}>
                <td style={{ ...tdStyle, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {timeAgo(entry.timestamp)}
                </td>
                <td style={{ ...tdStyle, fontWeight: 500 }}>{entry.userName}</td>
                <td style={tdStyle}>
                  <span
                    style={{
                      fontSize: 9,
                      padding: '2px 6px',
                      borderRadius: 3,
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {entry.action}
                  </span>
                </td>
                <td style={{ ...tdStyle, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {entry.target}
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 10, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {entry.details}
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>
                  No audit entries found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <button
            onClick={() => setAuditPage(Math.max(0, auditPage - 1))}
            disabled={auditPage === 0}
            style={{
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)',
              background: 'transparent',
              color: auditPage === 0 ? 'var(--text-tertiary)' : 'var(--text-secondary)',
              fontSize: 10,
              cursor: auditPage === 0 ? 'default' : 'pointer',
            }}
          >
            Prev
          </button>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {auditPage + 1} / {totalPages}
          </span>
          <button
            onClick={() => setAuditPage(Math.min(totalPages - 1, auditPage + 1))}
            disabled={auditPage >= totalPages - 1}
            style={{
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)',
              background: 'transparent',
              color: auditPage >= totalPages - 1 ? 'var(--text-tertiary)' : 'var(--text-secondary)',
              fontSize: 10,
              cursor: auditPage >= totalPages - 1 ? 'default' : 'pointer',
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
//  Main AdminDashboard component
// =============================================================================

const TAB_LABELS: { key: AdminTab; label: string }[] = [
  { key: 'team', label: 'Team' },
  { key: 'access', label: 'Access' },
  { key: 'storage', label: 'Storage' },
  { key: 'tokens', label: 'AI Tokens' },
  { key: 'audit', label: 'Audit Log' },
];

export function AdminDashboard() {
  const { tab, setTab } = useAdminStore();

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>Admin Dashboard</div>

      {/* Tab bar */}
      <div role="tablist" style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
        {TAB_LABELS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            aria-selected={tab === t.key}
            role="tab"
            style={{
              flex: 1,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: tab === t.key ? 'var(--brand-bright)' : 'var(--text-muted)',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${tab === t.key ? 'var(--brand)' : 'transparent'}`,
              cursor: 'pointer',
              transition: 'all 80ms',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={bodyStyle}>
        {tab === 'team' && <TeamTab />}
        {tab === 'access' && <AccessTab />}
        {tab === 'storage' && <StorageTab />}
        {tab === 'tokens' && <TokensTab />}
        {tab === 'audit' && <AuditTab />}
      </div>
    </div>
  );
}
