// ─── Campaign Dashboard ─────────────────────────────────────────────────────
// Standalone campaign management view: campaign list, deliverable pipeline,
// approval chain status, token budget tracker, and per-market statistics.

import React, { useState } from 'react';
import { useBrandStore } from '../../store/brand.store';
import type { CampaignProject, Deliverable, DeliverableStatus } from '@mcua/core';

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
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-muted)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    marginBottom: 6,
  },
  card: {
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-raised)',
    border: '1px solid var(--border-default)',
    marginBottom: 6,
    cursor: 'pointer',
  } as React.CSSProperties,
  statGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 6,
    marginBottom: 12,
  },
  statCard: {
    padding: 8,
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-raised)',
    border: '1px solid var(--border-default)',
    textAlign: 'center' as const,
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 14,
    padding: 4,
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: 32,
    color: 'var(--text-muted)',
    fontSize: 11,
    lineHeight: 1.6,
  },
};

// ─── Status helpers ─────────────────────────────────────────────────────────

const STATUS_PIPELINE: DeliverableStatus[] = [
  'brief', 'in-production', 'review', 'approved', 'delivered',
];

function statusColor(status: string) {
  switch (status) {
    case 'delivered':
    case 'approved':
      return { bg: 'rgba(34,197,94,0.15)', fg: 'var(--success, #22c55e)' };
    case 'in-production':
    case 'review':
      return { bg: 'rgba(59,130,246,0.15)', fg: 'var(--info, #3b82f6)' };
    case 'rejected':
      return { bg: 'rgba(239,68,68,0.15)', fg: 'var(--error, #ef4444)' };
    default:
      return { bg: 'var(--bg-hover)', fg: 'var(--text-muted)' };
  }
}

// ─── Campaign List View ─────────────────────────────────────────────────────

function CampaignList({
  campaigns,
  onSelect,
}: {
  campaigns: CampaignProject[];
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <div style={S.sectionTitle}>All Campaigns ({campaigns.length})</div>
      {campaigns.map((c) => {
        const delivered = c.deliverables.filter((d) => d.status === 'delivered').length;
        const tokenPct = c.tokenBudget > 0
          ? ((c.tokensUsed / c.tokenBudget) * 100).toFixed(0)
          : '0';

        return (
          <div key={c.id} style={S.card} onClick={() => onSelect(c.id)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                {c.name}
              </div>
              <span style={{
                fontSize: 9, fontWeight: 600, padding: '2px 6px',
                borderRadius: 'var(--radius-sm)',
                ...(() => { const sc = statusColor(c.status); return { background: sc.bg, color: sc.fg }; })(),
                textTransform: 'uppercase' as const,
              }}>
                {c.status}
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              {c.startDate} to {c.endDate}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 10, color: 'var(--text-secondary)' }}>
              <span>{delivered}/{c.deliverables.length} delivered</span>
              <span>{c.markets.length} market{c.markets.length !== 1 ? 's' : ''}</span>
              <span>{tokenPct}% token budget used</span>
            </div>
          </div>
        );
      })}
      {campaigns.length === 0 && (
        <div style={S.emptyState}>No campaigns yet. Seed demo data to get started.</div>
      )}
    </>
  );
}

// ─── Deliverable Row ────────────────────────────────────────────────────────

function DeliverableRow({
  deliverable,
  campaignId,
}: {
  deliverable: Deliverable;
  campaignId: string;
}) {
  const { updateDeliverableStatus } = useBrandStore();
  const sc = statusColor(deliverable.status);

  // Calculate next status in pipeline
  const currentIdx = STATUS_PIPELINE.indexOf(deliverable.status);
  const canAdvance = currentIdx >= 0 && currentIdx < STATUS_PIPELINE.length - 1;
  const nextStatus = canAdvance ? STATUS_PIPELINE[currentIdx + 1] : undefined;

  return (
    <div style={{
      padding: '8px 10px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-raised)',
      border: '1px solid var(--border-default)',
      marginBottom: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
          {deliverable.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontSize: 9, fontWeight: 600, padding: '2px 6px',
            borderRadius: 'var(--radius-sm)',
            background: sc.bg, color: sc.fg,
            textTransform: 'uppercase',
          }}>
            {deliverable.status}
          </span>
          {canAdvance && nextStatus && (
            <button
              onClick={() => updateDeliverableStatus(campaignId, deliverable.id, nextStatus)}
              style={{
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: BRAND_ACCENT,
                color: '#fff',
                fontSize: 9,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {'\u2192'} {nextStatus}
            </button>
          )}
        </div>
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
        {deliverable.type}
        {deliverable.platform ? ` \u2022 ${deliverable.platform}` : ''}
        {deliverable.aspectRatio ? ` \u2022 ${deliverable.aspectRatio}` : ''}
        {deliverable.duration ? ` \u2022 ${deliverable.duration}s` : ''}
      </div>

      {deliverable.assignedEditor && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
          Editor: {deliverable.assignedEditor}
        </div>
      )}

      {/* Approval chain */}
      {deliverable.approvalChain.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          {deliverable.approvalChain.map((step) => {
            const asc = statusColor(step.status);
            return (
              <span key={step.id} style={{
                padding: '1px 6px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 9,
                background: asc.bg,
                color: asc.fg,
              }}>
                {step.reviewer}: {step.status}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Campaign Detail View ───────────────────────────────────────────────────

function CampaignDetail({
  campaign,
  onBack,
}: {
  campaign: CampaignProject;
  onBack: () => void;
}) {
  const delivered = campaign.deliverables.filter((d) => d.status === 'delivered').length;
  const inProduction = campaign.deliverables.filter((d) => d.status === 'in-production').length;
  const tokensRemaining = campaign.tokenBudget - campaign.tokensUsed;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button onClick={onBack} style={S.backBtn}>{'\u2190'}</button>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            {campaign.name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {campaign.startDate} to {campaign.endDate}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={S.statGrid}>
        <div style={S.statCard}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            {delivered}/{campaign.deliverables.length}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Delivered
          </div>
        </div>
        <div style={S.statCard}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            {inProduction}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            In Production
          </div>
        </div>
        <div style={S.statCard}>
          <div style={{ fontSize: 18, fontWeight: 700, color: tokensRemaining > 0 ? 'var(--text-primary)' : 'var(--error, #ef4444)' }}>
            {tokensRemaining.toLocaleString()}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Tokens Left
          </div>
        </div>
      </div>

      {/* Token budget bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
          <span>Token Budget</span>
          <span>{campaign.tokensUsed.toLocaleString()} / {campaign.tokenBudget.toLocaleString()}</span>
        </div>
        <div style={{
          height: 6, borderRadius: 3,
          background: 'var(--bg-void)', overflow: 'hidden',
        }}>
          <div style={{
            width: `${Math.min((campaign.tokensUsed / campaign.tokenBudget) * 100, 100)}%`,
            height: '100%', borderRadius: 3,
            background: tokensRemaining > campaign.tokenBudget * 0.2 ? BRAND_ACCENT : 'var(--error, #ef4444)',
            transition: 'width 300ms',
          }} />
        </div>
      </div>

      {/* Brief */}
      <div style={{ marginBottom: 12 }}>
        <div style={S.sectionTitle}>Brief</div>
        <div style={{
          fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)',
          fontStyle: 'italic', padding: '8px 10px',
          borderRadius: 'var(--radius-sm)', background: 'var(--bg-void)',
          border: '1px solid var(--border-subtle)',
        }}>
          {campaign.brief}
        </div>
      </div>

      {/* Markets */}
      <div style={{ marginBottom: 12 }}>
        <div style={S.sectionTitle}>Markets ({campaign.markets.length})</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {campaign.markets.map((m) => (
            <span key={m} style={{
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-hover)',
              color: 'var(--text-secondary)',
              fontSize: 10,
              fontWeight: 600,
              border: '1px solid var(--border-subtle)',
            }}>
              {m}
            </span>
          ))}
        </div>
      </div>

      {/* Deliverables */}
      <div>
        <div style={S.sectionTitle}>
          Deliverables ({campaign.deliverables.length})
        </div>
        {campaign.deliverables.map((d) => (
          <DeliverableRow key={d.id} deliverable={d} campaignId={campaign.id} />
        ))}
      </div>
    </>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function CampaignDashboard() {
  const { campaigns, activeCampaignId, setActiveCampaign, seedDemoCampaign } = useBrandStore();
  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId);

  return (
    <div style={S.panel}>
      <div style={S.header}>
        <span style={S.title}>{'\u2691'} Campaign Dashboard</span>
        {!activeCampaign && (
          <button
            onClick={seedDemoCampaign}
            style={{
              padding: '5px 12px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: BRAND_ACCENT,
              color: '#fff',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + New Campaign
          </button>
        )}
      </div>

      <div style={S.body}>
        {activeCampaign ? (
          <CampaignDetail
            campaign={activeCampaign}
            onBack={() => setActiveCampaign(null)}
          />
        ) : (
          <CampaignList campaigns={campaigns} onSelect={setActiveCampaign} />
        )}
      </div>
    </div>
  );
}
