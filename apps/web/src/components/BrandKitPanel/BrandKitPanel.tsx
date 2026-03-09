// ─── Brand Kit Panel ─────────────────────────────────────────────────────────
// Displays and manages the active brand kit: logo files, color palettes,
// fonts, typography roles, safe area, voice/tone guidelines, approved music,
// and prohibited elements.

import React from 'react';
import { useBrandStore } from '../../store/brand.store';

// ─── Style constants ─────────────────────────────────────────────────────────

const BRAND_ACCENT = '#E94560';
const BRAND_ACCENT_DIM = 'rgba(233, 69, 96, 0.08)';

const S = {
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
    padding: 8,
    height: '100%',
    overflow: 'auto',
  },
  section: {
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-raised)',
    border: '1px solid var(--border-default)',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700 as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: 'var(--text-secondary)',
    marginBottom: 8,
  },
  colorSwatch: (color: string) => ({
    width: 28,
    height: 28,
    borderRadius: 'var(--radius-sm)',
    background: color,
    border: '1px solid var(--border-default)',
    cursor: 'pointer',
    flexShrink: 0,
  }),
  tag: (color?: string) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    borderRadius: 'var(--radius-sm)',
    background: color ?? 'var(--bg-hover)',
    color: 'var(--text-primary)',
    fontSize: 10,
    fontWeight: 500,
    border: '1px solid var(--border-subtle)',
  }),
  logoCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-void)',
    border: '1px solid var(--border-subtle)',
  },
  logoPreview: {
    width: 48,
    height: 32,
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-surface)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    color: 'var(--text-muted)',
    border: '1px solid var(--border-default)',
    flexShrink: 0,
  },
  fontRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: '1px solid var(--border-subtle)',
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: 32,
    color: 'var(--text-muted)',
    fontSize: 12,
  },
};

// ─── Component ───────────────────────────────────────────────────────────────

export function BrandKitPanel() {
  const { brandKits, activeBrandKitId, seedDemoBrandKit } = useBrandStore();
  const activeKit = brandKits.find((k) => k.id === activeBrandKitId);

  if (!activeKit) {
    return (
      <div style={S.emptyState}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>&#9903;</div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>No Brand Kit Selected</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
          Create or select a brand kit to manage brand assets.
        </div>
        <button
          onClick={() => seedDemoBrandKit('demo-org')}
          style={{
            padding: '7px 16px',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            background: BRAND_ACCENT,
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Load Demo Brand Kit
        </button>
      </div>
    );
  }

  return (
    <div style={S.panel}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 'var(--radius-md)',
          background: activeKit.primaryColors[0] ?? 'var(--bg-elevated)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, color: '#fff', fontWeight: 700,
        }}>
          {activeKit.brandName[0]}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {activeKit.brandName}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            Brand Kit
          </div>
        </div>
      </div>

      {/* Logo Files */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Logos ({activeKit.logoFiles.length})</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {activeKit.logoFiles.map((logo) => (
            <div key={logo.id} style={S.logoCard}>
              <div style={S.logoPreview}>
                {logo.variant === 'icon' ? '\u25C6' : '\u25A0'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {logo.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {logo.variant} &middot; {logo.format.toUpperCase()}
                  {logo.minWidth ? ` &middot; Min ${logo.minWidth}px` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Color Palette */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Colors</div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Primary</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {activeKit.primaryColors.map((color, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div style={S.colorSwatch(color)} title={color} />
                <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  {color}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Secondary</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {activeKit.secondaryColors.map((color, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div style={S.colorSwatch(color)} title={color} />
                <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  {color}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Typography */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Typography</div>
        {(['heading', 'body', 'caption'] as const).map((role) => (
          <div key={role} style={S.fontRow}>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                {role}
              </div>
              <div style={{
                fontSize: role === 'heading' ? 14 : role === 'body' ? 12 : 10,
                fontWeight: activeKit.typography[role].weight,
                fontStyle: activeKit.typography[role].style,
                color: 'var(--text-primary)',
              }}>
                {activeKit.typography[role].family}
              </div>
            </div>
            <span style={S.tag()}>
              {activeKit.typography[role].weight}
              {activeKit.typography[role].style === 'italic' ? ' italic' : ''}
            </span>
          </div>
        ))}
      </div>

      {/* Safe Area */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Safe Area</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <div key={side} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>{side}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {activeKit.safeArea[side]}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Voice & Tone */}
      {activeKit.voiceTone && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Voice & Tone</div>
          <div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            "{activeKit.voiceTone}"
          </div>
        </div>
      )}

      {/* Approved Music */}
      {activeKit.approvedMusicIds.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Approved Music ({activeKit.approvedMusicIds.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {activeKit.approvedMusicIds.map((id) => (
              <span key={id} style={S.tag('rgba(34,197,94,0.1)')}>
                <span style={{ color: 'var(--success, #22c55e)' }}>{'\u266B'}</span> {id}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Prohibited Elements */}
      {activeKit.prohibitedElements.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Prohibited Elements</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {activeKit.prohibitedElements.map((el) => (
              <span key={el} style={S.tag('rgba(239,68,68,0.1)')}>
                <span style={{ color: 'var(--error, #ef4444)' }}>{'\u2716'}</span> {el}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
