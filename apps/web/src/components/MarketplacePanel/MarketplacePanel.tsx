import React, { useState, useCallback } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  pluginRegistry,
  PluginType,
  MarketplacePlugin,
  InstalledPlugin,
} from '../../engine/PluginRegistry';

// =============================================================================
//  Inline Zustand store
// =============================================================================

interface MarketplaceState {
  tab: 'browse' | 'installed';
  searchQuery: string;
  typeFilter: PluginType | null;
  expandedPluginId: string | null;
  settingsPluginId: string | null;
  installedIds: Set<string>;
  installedPlugins: InstalledPlugin[];
  marketplacePlugins: MarketplacePlugin[];
}

interface MarketplaceActions {
  setTab: (t: MarketplaceState['tab']) => void;
  setSearch: (q: string) => void;
  setTypeFilter: (t: PluginType | null) => void;
  setExpandedPlugin: (id: string | null) => void;
  setSettingsPlugin: (id: string | null) => void;
  installPlugin: (id: string) => void;
  uninstallPlugin: (id: string) => void;
  togglePlugin: (id: string) => void;
  refresh: () => void;
}

const useMarketplaceStore = create<MarketplaceState & MarketplaceActions>()(
  immer((set, get) => ({
    tab: 'browse',
    searchQuery: '',
    typeFilter: null,
    expandedPluginId: null,
    settingsPluginId: null,
    installedIds: new Set<string>(),
    installedPlugins: [],
    marketplacePlugins: pluginRegistry.browseMarketplace(),

    setTab: (t) => set((s) => { s.tab = t; }),
    setSearch: (q) =>
      set((s) => {
        s.searchQuery = q;
        s.marketplacePlugins = pluginRegistry.browseMarketplace(q, s.typeFilter ?? undefined) as any;
      }),
    setTypeFilter: (t) =>
      set((s) => {
        s.typeFilter = t;
        s.marketplacePlugins = pluginRegistry.browseMarketplace(s.searchQuery || undefined, t ?? undefined) as any;
      }),
    setExpandedPlugin: (id) => set((s) => { s.expandedPluginId = s.expandedPluginId === id ? null : id; }),
    setSettingsPlugin: (id) => set((s) => { s.settingsPluginId = s.settingsPluginId === id ? null : id; }),
    installPlugin: (id) => {
      pluginRegistry.installPlugin(id);
      set((s) => {
        s.installedIds.add(id);
        s.installedPlugins = pluginRegistry.getInstalledPlugins() as any;
      });
    },
    uninstallPlugin: (id) => {
      pluginRegistry.uninstallPlugin(id);
      set((s) => {
        s.installedIds.delete(id);
        s.installedPlugins = pluginRegistry.getInstalledPlugins() as any;
        if (s.settingsPluginId === id) s.settingsPluginId = null;
      });
    },
    togglePlugin: (id) => {
      const installed = pluginRegistry.getInstalledPlugins();
      const plugin = installed.find((p) => p.id === id);
      if (plugin?.enabled) {
        pluginRegistry.disablePlugin(id);
      } else {
        pluginRegistry.enablePlugin(id);
      }
      set((s) => {
        s.installedPlugins = pluginRegistry.getInstalledPlugins() as any;
      });
    },
    refresh: () =>
      set((s) => {
        s.installedPlugins = pluginRegistry.getInstalledPlugins() as any;
        s.marketplacePlugins = pluginRegistry.browseMarketplace(
          s.searchQuery || undefined,
          s.typeFilter ?? undefined,
        ) as any;
        const ids = new Set<string>();
        for (const p of pluginRegistry.getInstalledPlugins()) ids.add(p.id);
        s.installedIds = ids;
      }),
  })),
);

// =============================================================================
//  Styles
// =============================================================================

const panel: React.CSSProperties = {
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

const TYPE_FILTERS: { key: PluginType | null; label: string }[] = [
  { key: null, label: 'All' },
  { key: 'videoEffect', label: 'Video' },
  { key: 'audioEffect', label: 'Audio' },
  { key: 'aiTool', label: 'AI' },
  { key: 'exportFormat', label: 'Export' },
  { key: 'panelExtension', label: 'Panel' },
];

function formatDownloads(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const stars: string[] = [];
  for (let i = 0; i < 5; i++) {
    if (i < full) stars.push('\u2605');
    else if (i === full && half) stars.push('\u2605');
    else stars.push('\u2606');
  }
  return (
    <span style={{ color: 'var(--warning)', fontSize: 10, letterSpacing: 1 }}>
      {stars.join('')}
    </span>
  );
}

function PriceBadge({ pricing }: { pricing: MarketplacePlugin['pricing'] }) {
  if (pricing.type === 'free') {
    return (
      <span
        style={{
          fontSize: 9,
          padding: '2px 6px',
          borderRadius: 3,
          background: 'var(--ai-accent-dim)',
          color: 'var(--ai-accent)',
          fontWeight: 700,
        }}
      >
        FREE
      </span>
    );
  }
  if (pricing.type === 'subscription') {
    return (
      <span
        style={{
          fontSize: 9,
          padding: '2px 6px',
          borderRadius: 3,
          background: 'var(--accent-muted)',
          color: 'var(--brand-bright)',
          fontWeight: 700,
        }}
      >
        ${pricing.price}/mo
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: 9,
        padding: '2px 6px',
        borderRadius: 3,
        background: 'rgba(245,158,11,0.12)',
        color: 'var(--warning)',
        fontWeight: 700,
      }}
    >
      ${pricing.price}
    </span>
  );
}

// =============================================================================
//  Browse Tab
// =============================================================================

function BrowseTab() {
  const {
    searchQuery,
    setSearch,
    typeFilter,
    setTypeFilter,
    marketplacePlugins,
    expandedPluginId,
    setExpandedPlugin,
    installedIds,
    installPlugin,
  } = useMarketplaceStore();

  return (
    <div>
      {/* Search */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search plugins..."
        style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-default)',
          background: 'var(--bg-void)',
          color: 'var(--text-primary)',
          fontSize: 12,
          outline: 'none',
          marginBottom: 10,
          boxSizing: 'border-box',
        }}
      />

      {/* Type filter pills */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setTypeFilter(f.key)}
            style={{
              padding: '4px 10px',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${typeFilter === f.key ? 'var(--brand)' : 'var(--border-default)'}`,
              background: typeFilter === f.key ? 'var(--accent-muted)' : 'transparent',
              color: typeFilter === f.key ? 'var(--brand-bright)' : 'var(--text-muted)',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 80ms',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Plugin cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {marketplacePlugins.map((p) => (
          <PluginCard
            key={p.id}
            plugin={p}
            expanded={expandedPluginId === p.id}
            installed={installedIds.has(p.id)}
            onToggleExpand={() => setExpandedPlugin(p.id)}
            onInstall={() => installPlugin(p.id)}
          />
        ))}
      </div>

      {marketplacePlugins.length === 0 && (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 11 }}>
          No plugins found.
        </div>
      )}
    </div>
  );
}

function PluginCard({
  plugin,
  expanded,
  installed,
  onToggleExpand,
  onInstall,
}: {
  plugin: MarketplacePlugin;
  expanded: boolean;
  installed: boolean;
  onToggleExpand: () => void;
  onInstall: () => void;
}) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${expanded ? 'var(--brand)' : 'var(--border-default)'}`,
        background: 'var(--bg-raised)',
        cursor: 'pointer',
        transition: 'all 100ms',
        gridColumn: expanded ? '1 / -1' : undefined,
      }}
      onClick={onToggleExpand}
    >
      {/* Compact view */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 22, lineHeight: 1 }}>{plugin.icon ?? '🧩'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 11 }}>{plugin.name}</span>
            <PriceBadge pricing={plugin.pricing} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{plugin.author}</div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expanded ? 'normal' : 'nowrap' }}>
            {plugin.description}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <StarRating rating={plugin.rating} />
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>({plugin.ratingCount})</span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
              {formatDownloads(plugin.downloads)} downloads
            </span>
          </div>
        </div>
      </div>

      {/* Install button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        {installed ? (
          <span
            style={{
              fontSize: 10,
              padding: '4px 10px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--ai-accent-dim)',
              color: 'var(--ai-accent)',
              fontWeight: 600,
            }}
          >
            Installed
          </span>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInstall();
            }}
            style={{
              padding: '4px 12px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'var(--brand)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 80ms',
            }}
          >
            Install
          </button>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 10 }}>
            {plugin.description}
          </div>

          {/* Screenshots placeholder */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {(plugin.screenshots.length > 0 ? plugin.screenshots : ['placeholder']).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 80,
                  height: 50,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-elevated)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  color: 'var(--text-muted)',
                }}
              >
                Preview {i + 1}
              </div>
            ))}
          </div>

          {/* Meta */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Version</span>
              <span style={{ color: 'var(--text-primary)' }}>{plugin.version}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Last updated</span>
              <span style={{ color: 'var(--text-primary)' }}>{new Date(plugin.lastUpdated).toLocaleDateString()}</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Permissions:</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                {plugin.permissions.map((perm) => (
                  <span
                    key={perm}
                    style={{
                      fontSize: 9,
                      padding: '2px 6px',
                      borderRadius: 3,
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {perm}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
//  Installed Tab
// =============================================================================

function InstalledTab() {
  const { installedPlugins, uninstallPlugin, togglePlugin, settingsPluginId, setSettingsPlugin } =
    useMarketplaceStore();

  if (installedPlugins.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 11 }}>
        No plugins installed yet. Browse the marketplace to add plugins.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {installedPlugins.map((p) => (
        <div key={p.id}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-raised)',
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>{p.icon ?? '🧩'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 11 }}>{p.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>v{p.version}</div>
            </div>

            {/* Enable/Disable toggle */}
            <button
              onClick={() => togglePlugin(p.id)}
              title={p.enabled ? 'Disable' : 'Enable'}
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                border: 'none',
                background: p.enabled ? 'var(--brand)' : 'var(--bg-elevated)',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 150ms',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: '#fff',
                  position: 'absolute',
                  top: 3,
                  left: p.enabled ? 19 : 3,
                  transition: 'left 150ms',
                }}
              />
            </button>

            {/* Settings gear */}
            <button
              onClick={() => setSettingsPlugin(p.id)}
              title="Settings"
              style={{
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
                background: settingsPluginId === p.id ? 'var(--bg-elevated)' : 'transparent',
                color: 'var(--text-muted)',
                fontSize: 14,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              &#x2699;
            </button>

            {/* Uninstall */}
            <button
              onClick={() => uninstallPlugin(p.id)}
              title="Uninstall"
              style={{
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
                background: 'transparent',
                color: 'var(--error)',
                fontSize: 13,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              &#x1F5D1;
            </button>
          </div>

          {/* Settings pane */}
          {settingsPluginId === p.id && (
            <div
              style={{
                marginTop: 4,
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-elevated)',
                fontSize: 11,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
                {p.name} Settings
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Auto-apply on import</span>
                  <input type="checkbox" style={{ accentColor: 'var(--brand)' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Quality preset</span>
                  <select
                    style={{
                      padding: '3px 6px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-raised)',
                      color: 'var(--text-primary)',
                      fontSize: 10,
                      outline: 'none',
                    }}
                  >
                    <option>Low</option>
                    <option>Medium</option>
                    <option selected>High</option>
                  </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>GPU acceleration</span>
                  <input type="checkbox" defaultChecked style={{ accentColor: 'var(--brand)' }} />
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-tertiary)' }}>
                Permissions: {p.permissions.join(', ')}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// =============================================================================
//  Main MarketplacePanel component
// =============================================================================

export function MarketplacePanel() {
  const { tab, setTab } = useMarketplaceStore();

  return (
    <div style={panel}>
      <div style={headerStyle}>Plugin Marketplace</div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
        {(['browse', 'installed'] as const).map((t) => (
          <div
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: tab === t ? 'var(--brand-bright)' : 'var(--text-muted)',
              borderBottom: `2px solid ${tab === t ? 'var(--brand)' : 'transparent'}`,
              cursor: 'pointer',
              transition: 'all 80ms',
            }}
          >
            {t === 'browse' ? 'Browse' : 'Installed'}
          </div>
        ))}
      </div>

      <div style={bodyStyle}>
        {tab === 'browse' && <BrowseTab />}
        {tab === 'installed' && <InstalledTab />}
      </div>
    </div>
  );
}
