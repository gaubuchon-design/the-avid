// ─── DAM Browser Panel ──────────────────────────────────────────────────────
// Standalone Digital Asset Management browser: connection manager, asset
// search with provider filtering, asset cards with metadata, and download /
// link-to-timeline actions.

import React, { useState } from 'react';
import { useBrandStore } from '../../store/brand.store';
import type { DAMAsset, DAMConnection } from '@mcua/core';

// ─── Styles ─────────────────────────────────────────────────────────────────

const BRAND_ACCENT = '#E94560';

const S = {
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-display), system-ui, sans-serif',
    fontSize: 12,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.02em',
    flex: 1,
  },
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: 12,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-muted)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    marginBottom: 6,
  },
  searchRow: {
    display: 'flex',
    gap: 6,
  },
  input: {
    flex: 1,
    padding: '8px 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-void)',
    color: 'var(--text-primary)',
    fontSize: 12,
    outline: 'none',
    fontFamily: 'var(--font-display), system-ui, sans-serif',
  } as React.CSSProperties,
  btnPrimary: (disabled: boolean): React.CSSProperties => ({
    padding: '8px 14px',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    background: disabled ? 'var(--bg-elevated)' : BRAND_ACCENT,
    color: disabled ? 'var(--text-muted)' : '#fff',
    fontSize: 11,
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    flexShrink: 0,
  }),
  emptyState: {
    textAlign: 'center' as const,
    padding: 24,
    color: 'var(--text-muted)',
    fontSize: 11,
    lineHeight: 1.6,
  },
};

// ─── Connection Card ────────────────────────────────────────────────────────

function ConnectionCard({ connection }: { connection: DAMConnection }) {
  const { connectDam, disconnectDam, isDamConnecting } = useBrandStore();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 10px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-raised)',
      border: '1px solid var(--border-default)',
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: connection.isConnected ? 'var(--success, #22c55e)' : 'var(--text-muted)',
          }} />
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
            {connection.displayName}
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, paddingLeft: 14 }}>
          {connection.provider}
          {connection.lastSyncedAt
            ? ` \u2022 Last sync: ${new Date(connection.lastSyncedAt).toLocaleDateString()}`
            : ''}
        </div>
      </div>
      <button
        onClick={() => connection.isConnected ? disconnectDam(connection.id) : connectDam(connection.id)}
        disabled={isDamConnecting}
        style={{
          padding: '4px 12px',
          borderRadius: 'var(--radius-sm)',
          border: connection.isConnected ? '1px solid var(--error, #ef4444)' : 'none',
          background: connection.isConnected ? 'transparent' : BRAND_ACCENT,
          color: connection.isConnected ? 'var(--error, #ef4444)' : '#fff',
          fontSize: 10,
          fontWeight: 600,
          cursor: isDamConnecting ? 'default' : 'pointer',
          opacity: isDamConnecting ? 0.5 : 1,
        }}
      >
        {isDamConnecting ? '...' : connection.isConnected ? 'Disconnect' : 'Connect'}
      </button>
    </div>
  );
}

// ─── Asset Card ─────────────────────────────────────────────────────────────

function AssetCard({ asset }: { asset: DAMAsset }) {
  return (
    <div style={{
      padding: '8px 10px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-raised)',
      border: '1px solid var(--border-default)',
    }}>
      {/* Preview area */}
      <div style={{
        width: '100%',
        height: 56,
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-void)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
        marginBottom: 6,
        border: '1px solid var(--border-subtle)',
      }}>
        {asset.type === 'video' ? '\u25B6' : asset.type === 'image' ? '\u25A3' : '\u266B'}
        {' '}
        {asset.format?.toUpperCase()}
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {asset.name}
      </div>

      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
        {asset.type} {asset.provider ? `\u2022 ${asset.provider}` : ''}
      </div>

      {/* Metadata tags */}
      {asset.tags && asset.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 4 }}>
          {asset.tags.slice(0, 4).map((tag) => (
            <span key={tag} style={{
              padding: '1px 5px',
              borderRadius: 2,
              fontSize: 8,
              background: 'var(--bg-hover)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
            }}>
              {tag}
            </span>
          ))}
          {asset.tags.length > 4 && (
            <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>
              +{asset.tags.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Rights expiry */}
      {asset.rightsExpiresAt && (
        <div style={{
          fontSize: 9,
          color: new Date(asset.rightsExpiresAt) < new Date() ? 'var(--error, #ef4444)' : 'var(--warning, #f59e0b)',
          marginTop: 4,
        }}>
          Rights: {new Date(asset.rightsExpiresAt) < new Date() ? 'EXPIRED' : `Expires ${new Date(asset.rightsExpiresAt).toLocaleDateString()}`}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function DAMBrowser() {
  const {
    damConnections,
    damSearchResults,
    isDamSearching,
    searchDam,
    clearDamSearch,
  } = useBrandStore();

  const [query, setQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState<string | undefined>(undefined);

  const handleSearch = () => {
    if (!query.trim()) return;
    searchDam(query, providerFilter as any);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const connectedProviders = damConnections.filter((c) => c.isConnected);

  return (
    <div style={S.panel}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.title}>{'\u2601'} DAM Browser</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {connectedProviders.length} connected
        </span>
      </div>

      <div style={S.body}>
        {/* Connections */}
        <div>
          <div style={S.sectionTitle}>Connections ({damConnections.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {damConnections.map((conn) => (
              <ConnectionCard key={conn.id} connection={conn} />
            ))}
          </div>
        </div>

        {/* Search */}
        <div>
          <div style={S.sectionTitle}>Search Assets</div>
          <div style={S.searchRow}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search assets..."
              style={S.input}
            />
            <button
              onClick={handleSearch}
              disabled={isDamSearching || !query.trim()}
              style={S.btnPrimary(isDamSearching || !query.trim())}
            >
              {isDamSearching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Provider filter */}
          {connectedProviders.length > 1 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
              <button
                onClick={() => setProviderFilter('')}
                style={{
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${!providerFilter ? BRAND_ACCENT : 'var(--border-subtle)'}`,
                  background: !providerFilter ? 'rgba(233,69,96,0.08)' : 'transparent',
                  color: !providerFilter ? BRAND_ACCENT : 'var(--text-muted)',
                  fontSize: 9,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                All
              </button>
              {connectedProviders.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setProviderFilter(c.provider)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${providerFilter === c.provider ? BRAND_ACCENT : 'var(--border-subtle)'}`,
                    background: providerFilter === c.provider ? 'rgba(233,69,96,0.08)' : 'transparent',
                    color: providerFilter === c.provider ? BRAND_ACCENT : 'var(--text-muted)',
                    fontSize: 9,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {c.provider}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Results */}
        {damSearchResults.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={S.sectionTitle}>
                Results ({damSearchResults.length})
              </div>
              <button
                onClick={clearDamSearch}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 10,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Clear
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {damSearchResults.slice(0, 20).map((asset) => (
                <AssetCard key={asset.id} asset={asset} />
              ))}
            </div>
          </div>
        )}

        {damSearchResults.length === 0 && !isDamSearching && query && (
          <div style={S.emptyState}>No results found. Try a different search query.</div>
        )}
      </div>
    </div>
  );
}
