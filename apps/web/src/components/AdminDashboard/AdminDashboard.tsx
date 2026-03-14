import React, { useEffect, useMemo, useState } from 'react';
import { adminEngine, type AuditEntry, type Role, type TeamMember, type TokenPolicy } from '../../engine/AdminEngine';
import {
  pluginRegistry,
  type InstalledPlugin,
  type MarketplacePlugin,
  type PluginType,
} from '../../engine/PluginRegistry';

const ADMIN_ACCENT = 'var(--brand, #4f46e5)';

const ROLE_OPTIONS: Role[] = ['viewer', 'reviewer', 'editor', 'senior_editor', 'producer', 'admin'];
const PLUGIN_TYPES: Array<{ value: PluginType | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'videoEffect', label: 'Video FX' },
  { value: 'audioEffect', label: 'Audio FX' },
  { value: 'exportFormat', label: 'Delivery' },
  { value: 'aiTool', label: 'AI' },
  { value: 'panelExtension', label: 'Panels' },
];

function bytesLabel(bytes: number): string {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }
  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }
  return `${bytes} B`;
}

function timeAgo(timestamp: number): string {
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) {
    return `${Math.max(1, minutes)}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function roleLabel(role: Role): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function AdminDashboard() {
  const [members, setMembers] = useState<TeamMember[]>(() => adminEngine.getTeamMembers());
  const [auditLog, setAuditLog] = useState<AuditEntry[]>(() => adminEngine.getAuditLog());
  const [tokenPolicies, setTokenPolicies] = useState<TokenPolicy[]>(() => adminEngine.getTokenPolicies());
  const [storageUsage, setStorageUsage] = useState(() => adminEngine.getStorageUsage());
  const [marketplace, setMarketplace] = useState<MarketplacePlugin[]>(() => pluginRegistry.browseMarketplace());
  const [installedPlugins, setInstalledPlugins] = useState<InstalledPlugin[]>(() => pluginRegistry.getInstalledPlugins());
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('editor');
  const [search, setSearch] = useState('');
  const [pluginFilter, setPluginFilter] = useState<PluginType | 'all'>('all');
  const [policyDraft, setPolicyDraft] = useState(() => {
    const teamPolicy = adminEngine.getTokenPolicies().find((policy) => policy.teamId === 'team-default');
    return {
      dailyLimit: String(teamPolicy?.dailyLimit ?? 500),
      monthlyLimit: String(teamPolicy?.monthlyLimit ?? 10000),
    };
  });

  useEffect(() => {
    const refreshAdmin = () => {
      setMembers(adminEngine.getTeamMembers());
      setAuditLog(adminEngine.getAuditLog());
      setTokenPolicies(adminEngine.getTokenPolicies());
      setStorageUsage(adminEngine.getStorageUsage());
    };

    const refreshPlugins = () => {
      setMarketplace(pluginRegistry.browseMarketplace(search, pluginFilter === 'all' ? undefined : pluginFilter));
      setInstalledPlugins(pluginRegistry.getInstalledPlugins());
    };

    refreshAdmin();
    refreshPlugins();

    const unsubscribeAdmin = adminEngine.subscribe(refreshAdmin);
    const unsubscribePlugins = pluginRegistry.subscribe(refreshPlugins);
    return () => {
      unsubscribeAdmin();
      unsubscribePlugins();
    };
  }, [pluginFilter, search]);

  useEffect(() => {
    setMarketplace(pluginRegistry.browseMarketplace(search, pluginFilter === 'all' ? undefined : pluginFilter));
  }, [pluginFilter, search]);

  const tokenSummary = useMemo(() => adminEngine.getTokenUsageSummary(), [members, tokenPolicies]);
  const totalStorageUsed = useMemo(() => adminEngine.getTotalStorageUsed(), [storageUsage]);
  const storageQuota = adminEngine.getStorageQuota();
  const installedPluginIds = useMemo(() => new Set(installedPlugins.map((plugin) => plugin.id)), [installedPlugins]);

  const filteredAudit = useMemo(() => {
    const trimmedSearch = search.trim().toLowerCase();
    if (!trimmedSearch) {
      return auditLog.slice(0, 10);
    }

    return auditLog.filter((entry) => {
      return `${entry.userName} ${entry.action} ${entry.target} ${entry.details}`.toLowerCase().includes(trimmedSearch);
    }).slice(0, 10);
  }, [auditLog, search]);

  const handleInvite = () => {
    const trimmedEmail = inviteEmail.trim();
    if (!trimmedEmail) {
      return;
    }

    adminEngine.inviteMember(trimmedEmail, inviteRole);
    setInviteEmail('');
  };

  const handleSavePolicy = () => {
    adminEngine.setTokenPolicy({
      teamId: 'team-default',
      dailyLimit: Number(policyDraft.dailyLimit) || 0,
      monthlyLimit: Number(policyDraft.monthlyLimit) || 0,
      used: tokenPolicies.find((policy) => policy.teamId === 'team-default')?.used ?? 0,
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        height: '100%',
        overflowY: 'auto',
        paddingRight: 4,
      }}
    >
      <header
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.5fr) minmax(320px, 1fr)',
          gap: 18,
          alignItems: 'start',
        }}
      >
        <div
          style={{
            padding: 20,
            borderRadius: 18,
            background: 'linear-gradient(180deg, rgba(79, 70, 229, 0.12), rgba(15, 23, 42, 0.92))',
            border: '1px solid rgba(99, 102, 241, 0.2)',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: ADMIN_ACCENT }}>
            Prompts 13-14
          </div>
          <h2 style={{ margin: '6px 0 0', fontSize: 24, lineHeight: 1.1 }}>Admin, Governance, and Marketplace</h2>
          <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: 760 }}>
            This workspace surfaces the repo&apos;s existing RBAC, audit, storage, token-governance, and plugin-marketplace engines as a single operations console.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <MetricCard label="Team" value={`${members.length} members`} accent={ADMIN_ACCENT} />
          <MetricCard label="Tokens" value={`${tokenSummary.used}/${tokenSummary.total}`} />
          <MetricCard label="Storage" value={`${bytesLabel(totalStorageUsed)} / ${bytesLabel(storageQuota)}`} />
          <MetricCard label="Plugins" value={`${installedPlugins.filter((plugin) => plugin.enabled).length} active`} />
        </div>
      </header>

      <section style={sectionStyle}>
        <SectionHeader title="Team Management" eyebrow="RBAC" />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 10 }}>
          <input
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="Invite by email"
            style={inputStyle}
          />
          <select
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value as Role)}
            style={inputStyle}
          >
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleInvite} style={primaryButtonStyle}>
            Invite
          </button>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {members.map((member) => {
            const usageRatio = member.tokenBudget > 0 ? member.tokenUsed / member.tokenBudget : 0;
            return (
              <article key={member.id} style={surfaceStyle}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'start' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{member.name}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>{member.email}</div>
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>Last active {timeAgo(member.lastActive)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                      value={member.role}
                      onChange={(event) => adminEngine.updateMemberRole(member.id, event.target.value as Role)}
                      style={{ ...inputStyle, minWidth: 158 }}
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {roleLabel(role)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => adminEngine.removeMember(member.id)}
                      style={ghostDangerButtonStyle}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>Token budget</span>
                    <span>{member.tokenUsed}/{member.tokenBudget}</span>
                  </div>
                  <div style={progressTrackStyle}>
                    <div style={{ ...progressFillStyle, width: `${Math.min(100, usageRatio * 100)}%`, background: usageRatio > 0.85 ? '#ef4444' : ADMIN_ACCENT }} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section style={sectionStyle}>
        <SectionHeader title="Token Governance" eyebrow="Budgets" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          {tokenSummary.byUser.map((entry) => (
            <div key={entry.name} style={surfaceStyle}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{entry.name}</div>
              <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{entry.used}</div>
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>tokens used</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          <input
            value={policyDraft.dailyLimit}
            onChange={(event) => setPolicyDraft((current) => ({ ...current, dailyLimit: event.target.value }))}
            placeholder="Daily limit"
            style={inputStyle}
          />
          <input
            value={policyDraft.monthlyLimit}
            onChange={(event) => setPolicyDraft((current) => ({ ...current, monthlyLimit: event.target.value }))}
            placeholder="Monthly limit"
            style={inputStyle}
          />
          <button type="button" onClick={handleSavePolicy} style={primaryButtonStyle}>
            Save Team Policy
          </button>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 0.9fr)', gap: 18 }}>
        <section style={sectionStyle}>
          <SectionHeader title="Audit Trail" eyebrow="Compliance" />
          <div style={{ display: 'grid', gap: 10 }}>
            {filteredAudit.map((entry) => (
              <article key={entry.id} style={surfaceStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{entry.action}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                      {entry.userName} {'->'} {entry.target}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(entry.timestamp)}</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                  {entry.details}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section style={sectionStyle}>
          <SectionHeader title="Storage" eyebrow="Quota" />
          <div style={{ display: 'grid', gap: 10 }}>
            {storageUsage.map((entry) => (
              <article key={entry.userId} style={surfaceStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{entry.userName}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                      {entry.projectCount} projects
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{bytesLabel(entry.bytesUsed)}</div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={progressTrackStyle}>
                    <div style={{ ...progressFillStyle, width: `${Math.min(100, (entry.bytesUsed / storageQuota) * 100)}%`, background: '#38bdf8' }} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section style={sectionStyle}>
        <SectionHeader title="Plugin Marketplace" eyebrow="Prompt 13" />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10 }}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search marketplace, audit events, or team members"
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PLUGIN_TYPES.map((entry) => (
              <button
                key={entry.value}
                type="button"
                onClick={() => setPluginFilter(entry.value)}
                style={{
                  ...filterButtonStyle,
                  borderColor: pluginFilter === entry.value ? 'rgba(79, 70, 229, 0.35)' : filterButtonStyle.borderColor,
                  color: pluginFilter === entry.value ? ADMIN_ACCENT : filterButtonStyle.color,
                  background: pluginFilter === entry.value ? 'rgba(79, 70, 229, 0.08)' : filterButtonStyle.background,
                }}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {marketplace.map((plugin) => {
            const installed = installedPluginIds.has(plugin.id);
            const installedPlugin = installedPlugins.find((entry) => entry.id === plugin.id);
            const enabled = installedPlugin?.enabled ?? false;
            return (
              <article key={plugin.id} style={surfaceStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{plugin.name}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>{plugin.author}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: ADMIN_ACCENT }}>
                    {plugin.type}
                  </span>
                </div>
                <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                  {plugin.description}
                </p>
                <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
                  <span>{plugin.downloads.toLocaleString()} installs</span>
                  <span>{plugin.rating.toFixed(1)} stars</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  {!installed ? (
                    <button type="button" onClick={() => pluginRegistry.installPlugin(plugin.id)} style={primaryButtonStyle}>
                      Install
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => enabled ? pluginRegistry.disablePlugin(plugin.id) : pluginRegistry.enablePlugin(plugin.id)}
                        style={primaryButtonStyle}
                      >
                        {enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button type="button" onClick={() => pluginRegistry.uninstallPlugin(plugin.id)} style={ghostButtonStyle}>
                        Uninstall
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent = 'var(--text-primary)',
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        borderRadius: 16,
        padding: '14px 16px',
        background: 'rgba(15, 23, 42, 0.72)',
        border: '1px solid rgba(148, 163, 184, 0.16)',
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, color: accent }}>
        {value}
      </div>
    </div>
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: ADMIN_ACCENT }}>
        {eyebrow}
      </div>
      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
        {title}
      </div>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  padding: 18,
  borderRadius: 18,
  background: 'rgba(15, 23, 42, 0.88)',
  border: '1px solid rgba(148, 163, 184, 0.16)',
};

const surfaceStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 14,
  background: 'rgba(15, 23, 42, 0.54)',
  border: '1px solid rgba(148, 163, 184, 0.16)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: 12,
  padding: '11px 12px',
  background: 'rgba(15, 23, 42, 0.92)',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  color: 'var(--text-primary)',
  font: 'inherit',
};

const primaryButtonStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: 12,
  padding: '11px 14px',
  background: ADMIN_ACCENT,
  color: '#eef2ff',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const ghostButtonStyle: React.CSSProperties = {
  borderRadius: 12,
  padding: '11px 14px',
  background: 'transparent',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const ghostDangerButtonStyle: React.CSSProperties = {
  ...ghostButtonStyle,
  color: '#fca5a5',
  border: '1px solid rgba(239, 68, 68, 0.2)',
};

const filterButtonStyle: React.CSSProperties = {
  borderRadius: 999,
  padding: '8px 12px',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  background: 'rgba(15, 23, 42, 0.44)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const progressTrackStyle: React.CSSProperties = {
  width: '100%',
  height: 8,
  borderRadius: 999,
  overflow: 'hidden',
  background: 'rgba(148, 163, 184, 0.12)',
};

const progressFillStyle: React.CSSProperties = {
  height: '100%',
  borderRadius: 999,
};
