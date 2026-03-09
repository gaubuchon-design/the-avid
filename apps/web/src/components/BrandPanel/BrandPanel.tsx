// ─── Brand Panel ─────────────────────────────────────────────────────────────
// Master panel containing tabbed navigation across all brand & marketing
// features: Brand Kit, Templates, Variants, Compliance, DAM, Campaigns,
// Ad Validator, Localization, Creative, and Analytics.

import React, { useEffect } from 'react';
import { useBrandStore } from '../../store/brand.store';
import { BrandKitPanel } from '../BrandKitPanel/BrandKitPanel';
import type { BrandPanelTab } from '@mcua/core';

// ─── Style constants ─────────────────────────────────────────────────────────

const BRAND_ACCENT = '#E94560';
const BRAND_ACCENT_DIM = 'rgba(233, 69, 96, 0.08)';

const S = {
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: 'var(--bg-surface)',
    borderLeft: '1px solid var(--border-default)',
    fontFamily: 'var(--font-ui)',
    fontSize: 12,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    minWidth: 320,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  },
  headerIcon: {
    fontSize: 16,
    color: BRAND_ACCENT,
    fontWeight: 700,
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    flex: 1,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 14,
    padding: 4,
  },
  tabScroller: {
    display: 'flex',
    overflowX: 'auto' as const,
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
    scrollbarWidth: 'none' as const,
  },
  tab: (active: boolean) => ({
    padding: '8px 12px',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.03em',
    color: active ? BRAND_ACCENT : 'var(--text-muted)',
    borderBottom: `2px solid ${active ? BRAND_ACCENT : 'transparent'}`,
    cursor: 'pointer',
    transition: 'all 80ms',
    background: 'none',
    border: 'none',
    borderTop: 'none',
    borderLeft: 'none',
    borderRight: 'none',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  }),
  body: {
    flex: 1,
    overflow: 'auto',
  },
  seedBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 12px',
    borderTop: '1px solid var(--border-default)',
    background: 'var(--bg-raised)',
    flexShrink: 0,
  },
};

// ─── Tab configuration ───────────────────────────────────────────────────────

interface TabConfig {
  key: BrandPanelTab;
  label: string;
  icon: string;
}

const TABS: TabConfig[] = [
  { key: 'brand-kit', label: 'Brand Kit', icon: '\u25C6' },
  { key: 'templates', label: 'Templates', icon: '\u25A3' },
  { key: 'variants', label: 'Variants', icon: '\u25CB' },
  { key: 'compliance', label: 'Compliance', icon: '\u2713' },
  { key: 'dam', label: 'DAM', icon: '\u2601' },
  { key: 'campaigns', label: 'Campaigns', icon: '\u2691' },
  { key: 'ad-validator', label: 'Ad Specs', icon: '\u2611' },
  { key: 'localization', label: 'L10n', icon: '\u2637' },
  { key: 'creative', label: 'Creative', icon: '\u2728' },
  { key: 'analytics', label: 'Analytics', icon: '\u2B24' },
];

// ─── Sub-panels ──────────────────────────────────────────────────────────────

function TemplatesPanel() {
  const { templates, overrideRequests } = useBrandStore();
  return (
    <div style={{ padding: 8 }}>
      <SectionHeader title="Locked Templates" count={templates.length} />
      {templates.map((t) => (
        <div key={t.id} style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>{'\u25A3'}</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{t.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                v{t.version} &middot; {t.elements.length} elements &middot; {t.lockedElementIds.length} locked
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {t.elements.map((el) => (
              <span key={el.id} style={{
                padding: '2px 6px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 9,
                fontWeight: 600,
                background: t.lockedElementIds.includes(el.id) ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                color: t.lockedElementIds.includes(el.id) ? 'var(--error, #ef4444)' : 'var(--success, #22c55e)',
              }}>
                {t.lockedElementIds.includes(el.id) ? '\uD83D\uDD12' : '\u270E'} {el.label ?? el.type}
              </span>
            ))}
          </div>
        </div>
      ))}
      {overrideRequests.length > 0 && (
        <>
          <SectionHeader title="Override Requests" count={overrideRequests.length} />
          {overrideRequests.map((r) => (
            <div key={r.id} style={cardStyle}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>Override: {r.elementId}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                By {r.requestedBy} &middot; {r.reason}
              </div>
              <StatusBadge status={r.status} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function VariantsPanel() {
  const { variantDefinitions, variantResults, isGeneratingVariants, generateAllVariants } = useBrandStore();
  return (
    <div style={{ padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <SectionHeader title="Variant Matrix" count={variantDefinitions.length} />
        <button
          onClick={() => generateAllVariants('master-seq-1')}
          disabled={isGeneratingVariants || variantDefinitions.length === 0}
          style={primaryBtnStyle(isGeneratingVariants)}
        >
          {isGeneratingVariants ? 'Generating...' : 'Generate All'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {variantDefinitions.map((def) => {
          const result = variantResults.find((r) => r.variantDefinitionId === def.id);
          return (
            <div key={def.id} style={cardStyle}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{def.variantName}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {def.languageCode}{def.market ? ` \u2022 ${def.market}` : ''}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                {def.changes.length} change{def.changes.length !== 1 ? 's' : ''}
              </div>
              <StatusBadge status={result?.status ?? 'pending'} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompliancePanel() {
  const { complianceReports, isRunningCompliance, runComplianceScan } = useBrandStore();
  return (
    <div style={{ padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <SectionHeader title="Compliance Reports" count={complianceReports.length} />
        <button
          onClick={() => runComplianceScan('current-project', 40)}
          disabled={isRunningCompliance}
          style={primaryBtnStyle(isRunningCompliance)}
        >
          {isRunningCompliance ? 'Scanning...' : 'Run Scan'}
        </button>
      </div>
      {complianceReports.map((report) => (
        <div key={report.id} style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, fontWeight: 600 }}>
              {report.overallStatus === 'pass' ? '\u2705' : report.overallStatus === 'warning' ? '\u26A0\uFE0F' : '\u274C'}{' '}
              {report.overallStatus.toUpperCase()}
            </div>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {report.duration.toFixed(1)}s
            </span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            {report.findings.length} finding{report.findings.length !== 1 ? 's' : ''} &middot;{' '}
            {new Date(report.checkedAt).toLocaleString()}
          </div>
          {report.findings.slice(0, 3).map((f) => (
            <div key={f.id} style={{
              marginTop: 4,
              padding: '4px 6px',
              borderRadius: 'var(--radius-sm)',
              background: f.severity === 'error' ? 'rgba(239,68,68,0.08)' : f.severity === 'warning' ? 'rgba(245,158,11,0.08)' : 'rgba(59,130,246,0.08)',
              fontSize: 10,
              color: f.severity === 'error' ? 'var(--error, #ef4444)' : f.severity === 'warning' ? 'var(--warning, #f59e0b)' : 'var(--info, #3b82f6)',
            }}>
              [{f.frameTime.toFixed(1)}s] {f.description}
            </div>
          ))}
          {report.findings.length > 3 && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>
              +{report.findings.length - 3} more findings
            </div>
          )}
        </div>
      ))}
      {complianceReports.length === 0 && !isRunningCompliance && (
        <EmptyState text="No compliance reports yet. Run a scan to validate brand adherence." />
      )}
    </div>
  );
}

function DAMPanel() {
  const { damConnections, damSearchResults, isDamSearching, isDamConnecting, searchDam, connectDam, disconnectDam } = useBrandStore();
  const [query, setQuery] = React.useState('');

  return (
    <div style={{ padding: 8 }}>
      <SectionHeader title="DAM Connections" count={damConnections.length} />
      {damConnections.map((conn) => (
        <div key={conn.id} style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600 }}>{conn.displayName}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {conn.provider} &middot; {conn.isConnected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
          <button
            onClick={() => conn.isConnected ? disconnectDam(conn.id) : connectDam(conn.id)}
            disabled={isDamConnecting}
            style={{
              padding: '4px 10px',
              borderRadius: 'var(--radius-sm)',
              border: conn.isConnected ? '1px solid var(--error, #ef4444)' : 'none',
              background: conn.isConnected ? 'transparent' : BRAND_ACCENT,
              color: conn.isConnected ? 'var(--error, #ef4444)' : '#fff',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {conn.isConnected ? 'Disconnect' : 'Connect'}
          </button>
        </div>
      ))}
      <div style={{ marginTop: 12 }}>
        <SectionHeader title="Search DAM" />
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search assets..."
            onKeyDown={(e) => e.key === 'Enter' && query.trim() && searchDam(query)}
            style={inputStyle}
          />
          <button
            onClick={() => query.trim() && searchDam(query)}
            disabled={isDamSearching || !query.trim()}
            style={primaryBtnStyle(isDamSearching || !query.trim())}
          >
            {isDamSearching ? '...' : 'Search'}
          </button>
        </div>
        {damSearchResults.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {damSearchResults.slice(0, 12).map((asset) => (
              <div key={asset.id} style={cardStyle}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {asset.name}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                  {asset.type} &middot; {asset.provider}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignsPanel() {
  const { campaigns, activeCampaignId, setActiveCampaign, updateDeliverableStatus } = useBrandStore();
  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId);

  if (!activeCampaign) {
    return (
      <div style={{ padding: 8 }}>
        <SectionHeader title="Campaigns" count={campaigns.length} />
        {campaigns.map((c) => (
          <div key={c.id} style={cardStyle} onClick={() => setActiveCampaign(c.id)}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>{c.name}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {c.deliverables.length} deliverables &middot; {c.status}
            </div>
          </div>
        ))}
        {campaigns.length === 0 && <EmptyState text="No campaigns yet." />}
      </div>
    );
  }

  const stats = {
    total: activeCampaign.deliverables.length,
    delivered: activeCampaign.deliverables.filter((d) => d.status === 'delivered').length,
    tokensRemaining: activeCampaign.tokenBudget - activeCampaign.tokensUsed,
  };

  return (
    <div style={{ padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <button onClick={() => setActiveCampaign(null)} style={S.closeBtn}>{'\u2190'}</button>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{activeCampaign.name}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {activeCampaign.startDate} to {activeCampaign.endDate}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
        <StatCard label="Deliverables" value={`${stats.delivered}/${stats.total}`} />
        <StatCard label="Markets" value={activeCampaign.markets.length.toString()} />
        <StatCard label="Tokens Left" value={stats.tokensRemaining.toString()} />
      </div>

      <div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)', marginBottom: 10, fontStyle: 'italic' }}>
        {activeCampaign.brief.length > 150 ? `${activeCampaign.brief.slice(0, 150)}...` : activeCampaign.brief}
      </div>

      <SectionHeader title="Deliverables" count={activeCampaign.deliverables.length} />
      {activeCampaign.deliverables.map((d) => (
        <div key={d.id} style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, fontWeight: 600 }}>{d.name}</div>
            <StatusBadge status={d.status} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            {d.type} {d.platform ? `\u2022 ${d.platform}` : ''} {d.aspectRatio ? `\u2022 ${d.aspectRatio}` : ''} {d.duration ? `\u2022 ${d.duration}s` : ''}
          </div>
          {d.assignedEditor && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              Editor: {d.assignedEditor}
            </div>
          )}
          {d.approvalChain.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
              {d.approvalChain.map((step) => (
                <span key={step.id} style={{
                  padding: '1px 5px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 9,
                  background: step.status === 'approved' ? 'rgba(34,197,94,0.1)' : step.status === 'rejected' ? 'rgba(239,68,68,0.1)' : 'var(--bg-hover)',
                  color: step.status === 'approved' ? 'var(--success, #22c55e)' : step.status === 'rejected' ? 'var(--error, #ef4444)' : 'var(--text-muted)',
                }}>
                  {step.reviewer}: {step.status}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AdValidatorPanel() {
  const { adValidationResults, isValidatingAds, validateForAllPlatforms, clearValidationResults } = useBrandStore();

  const handleValidate = () => {
    // Demo video metadata
    const demoVideo = {
      fileSize: 250 * 1024 * 1024,
      duration: 30,
      width: 1920,
      height: 1080,
      codec: 'h264',
      bitrate: 12000,
      audioLoudness: -14,
      hasAudio: true,
    };
    validateForAllPlatforms(demoVideo);
  };

  return (
    <div style={{ padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <SectionHeader title="Ad Unit Validation" count={adValidationResults.length} />
        <div style={{ display: 'flex', gap: 4 }}>
          {adValidationResults.length > 0 && (
            <button onClick={clearValidationResults} style={secondaryBtnStyle}>Clear</button>
          )}
          <button onClick={handleValidate} disabled={isValidatingAds} style={primaryBtnStyle(isValidatingAds)}>
            {isValidatingAds ? 'Validating...' : 'Validate All'}
          </button>
        </div>
      </div>
      {adValidationResults.map((result, i) => (
        <div key={i} style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, fontWeight: 600 }}>{result.specName}</div>
            <span style={{
              padding: '2px 6px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 9,
              fontWeight: 700,
              background: result.status === 'PASS' ? 'rgba(34,197,94,0.15)' : result.status === 'FAIL' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
              color: result.status === 'PASS' ? 'var(--success, #22c55e)' : result.status === 'FAIL' ? 'var(--error, #ef4444)' : 'var(--warning, #f59e0b)',
            }}>
              {result.status}
            </span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{result.platform}</div>
          {result.checks.filter((c) => c.status !== 'PASS').slice(0, 3).map((check, j) => (
            <div key={j} style={{
              marginTop: 3,
              fontSize: 9,
              color: check.status === 'FAIL' ? 'var(--error, #ef4444)' : 'var(--warning, #f59e0b)',
            }}>
              {check.name}: {check.message}
            </div>
          ))}
        </div>
      ))}
      {adValidationResults.length === 0 && <EmptyState text="Click 'Validate All' to check against platform specs." />}
    </div>
  );
}

function LocalizationPanel() {
  const { localizationRequests, isLocalizing } = useBrandStore();
  return (
    <div style={{ padding: 8 }}>
      <SectionHeader title="Localization Jobs" count={localizationRequests.length} />
      {localizationRequests.map((req) => (
        <div key={req.id} style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, fontWeight: 600 }}>{req.targetLanguages.length} languages</div>
            <StatusBadge status={req.status} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            From {req.sourceLanguage} &middot; Progress: {req.progress}%
          </div>
          <div style={{
            marginTop: 4, height: 3, borderRadius: 2,
            background: 'var(--bg-void)', overflow: 'hidden',
          }}>
            <div style={{
              width: `${req.progress}%`, height: '100%',
              borderRadius: 2, background: BRAND_ACCENT,
              transition: 'width 300ms',
            }} />
          </div>
        </div>
      ))}
      {localizationRequests.length === 0 && <EmptyState text="No localization jobs running." />}
    </div>
  );
}

function CreativePanel() {
  const { creativeJobs, isCreativeRunning } = useBrandStore();
  return (
    <div style={{ padding: 8 }}>
      <SectionHeader title="Creative Agent Jobs" count={creativeJobs.length} />
      {creativeJobs.map((job) => (
        <div key={job.id} style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, fontWeight: 600 }}>Brief: {job.briefId.slice(0, 8)}</div>
            <StatusBadge status={job.status} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Progress: {job.progress}%</div>
          <div style={{
            marginTop: 4, height: 3, borderRadius: 2,
            background: 'var(--bg-void)', overflow: 'hidden',
          }}>
            <div style={{
              width: `${job.progress}%`, height: '100%',
              borderRadius: 2, background: BRAND_ACCENT,
              transition: 'width 300ms',
            }} />
          </div>
          {job.error && (
            <div style={{ fontSize: 10, color: 'var(--error, #ef4444)', marginTop: 4 }}>{job.error}</div>
          )}
        </div>
      ))}
      {creativeJobs.length === 0 && <EmptyState text="No creative agent jobs. Start from a campaign brief." />}
    </div>
  );
}

function AnalyticsPanel() {
  const { performanceData, performanceInsights, isFetchingAnalytics, fetchPerformanceData } = useBrandStore();

  return (
    <div style={{ padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <SectionHeader title="Performance" count={performanceData.length} />
        <button
          onClick={() => fetchPerformanceData('video-hero-60', ['YOUTUBE', 'META'])}
          disabled={isFetchingAnalytics}
          style={primaryBtnStyle(isFetchingAnalytics)}
        >
          {isFetchingAnalytics ? 'Fetching...' : 'Refresh'}
        </button>
      </div>
      {performanceData.map((d) => (
        <div key={d.id} style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, fontWeight: 600 }}>{d.videoId}</div>
            <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: BRAND_ACCENT }}>{d.platform}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, marginTop: 6 }}>
            <MiniStat label="Views" value={d.views.toLocaleString()} />
            <MiniStat label="Completion" value={`${(d.completionRate * 100).toFixed(0)}%`} />
            <MiniStat label="CTR" value={`${(d.ctr * 100).toFixed(2)}%`} />
            <MiniStat label="Engagement" value={`${(d.engagementRate * 100).toFixed(1)}%`} />
          </div>
        </div>
      ))}
      {performanceInsights.length > 0 && (
        <>
          <SectionHeader title="Insights" count={performanceInsights.length} />
          {performanceInsights.slice(0, 5).map((insight) => (
            <div key={insight.id} style={{
              ...cardStyle,
              borderLeft: `3px solid ${insight.type === 'strength' ? 'var(--success, #22c55e)' : insight.type === 'weakness' ? 'var(--error, #ef4444)' : 'var(--warning, #f59e0b)'}`,
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)' }}>
                {insight.type === 'strength' ? '\u2191' : insight.type === 'weakness' ? '\u2193' : '\u2192'} {insight.description}
              </div>
              {insight.recommendation && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>
                  {insight.recommendation}
                </div>
              )}
            </div>
          ))}
        </>
      )}
      {performanceData.length === 0 && !isFetchingAnalytics && (
        <EmptyState text="No analytics data. Click Refresh to fetch performance metrics." />
      )}
    </div>
  );
}

// ─── Shared mini-components ──────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.06em', color: 'var(--text-secondary)',
      marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4,
    }}>
      {title}
      {count !== undefined && (
        <span style={{
          fontSize: 9, padding: '1px 5px', borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-hover)', color: 'var(--text-muted)',
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: '8px', borderRadius: 'var(--radius-md)',
      background: 'var(--bg-raised)', border: '1px solid var(--border-default)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, { bg: string; color: string }> = {
    pass: { bg: 'rgba(34,197,94,0.15)', color: 'var(--success, #22c55e)' },
    generated: { bg: 'rgba(34,197,94,0.15)', color: 'var(--success, #22c55e)' },
    approved: { bg: 'rgba(34,197,94,0.15)', color: 'var(--success, #22c55e)' },
    completed: { bg: 'rgba(34,197,94,0.15)', color: 'var(--success, #22c55e)' },
    complete: { bg: 'rgba(34,197,94,0.15)', color: 'var(--success, #22c55e)' },
    delivered: { bg: 'rgba(34,197,94,0.15)', color: 'var(--success, #22c55e)' },
    active: { bg: 'rgba(59,130,246,0.15)', color: 'var(--info, #3b82f6)' },
    'in-production': { bg: 'rgba(59,130,246,0.15)', color: 'var(--info, #3b82f6)' },
    processing: { bg: 'rgba(59,130,246,0.15)', color: 'var(--info, #3b82f6)' },
    generating: { bg: 'rgba(59,130,246,0.15)', color: 'var(--info, #3b82f6)' },
    review: { bg: 'rgba(245,158,11,0.15)', color: 'var(--warning, #f59e0b)' },
    warning: { bg: 'rgba(245,158,11,0.15)', color: 'var(--warning, #f59e0b)' },
    pending: { bg: 'var(--bg-hover)', color: 'var(--text-muted)' },
    brief: { bg: 'var(--bg-hover)', color: 'var(--text-muted)' },
    planning: { bg: 'var(--bg-hover)', color: 'var(--text-muted)' },
    fail: { bg: 'rgba(239,68,68,0.15)', color: 'var(--error, #ef4444)' },
    failed: { bg: 'rgba(239,68,68,0.15)', color: 'var(--error, #ef4444)' },
    rejected: { bg: 'rgba(239,68,68,0.15)', color: 'var(--error, #ef4444)' },
  };
  const c = colorMap[status] ?? colorMap.pending;
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, padding: '2px 6px',
      borderRadius: 'var(--radius-sm)', background: c.bg, color: c.color,
      textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 4,
      display: 'inline-block',
    }}>
      {status}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      textAlign: 'center', padding: 24, color: 'var(--text-muted)',
      fontSize: 11, lineHeight: 1.6,
    }}>
      {text}
    </div>
  );
}

// ─── Shared styles ───────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-raised)',
  border: '1px solid var(--border-default)',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '6px 10px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-default)',
  background: 'var(--bg-void)',
  color: 'var(--text-primary)',
  fontSize: 11,
  fontFamily: 'var(--font-ui)',
  outline: 'none',
};

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '5px 12px',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    background: disabled ? 'var(--bg-elevated)' : BRAND_ACCENT,
    color: disabled ? 'var(--text-muted)' : '#fff',
    fontSize: 10,
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    flexShrink: 0,
  };
}

const secondaryBtnStyle: React.CSSProperties = {
  padding: '5px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-default)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  fontSize: 10,
  fontWeight: 600,
  cursor: 'pointer',
  flexShrink: 0,
};

// ─── Main Panel ──────────────────────────────────────────────────────────────

export function BrandPanel() {
  const {
    activeBrandPanel,
    setActiveBrandPanel,
    toggleBrandPanel,
    showBrandPanel,
    seedAllDemoData,
    brandKits,
  } = useBrandStore();

  // Seed demo data on first render if empty
  useEffect(() => {
    if (brandKits.length === 0) {
      seedAllDemoData('demo-org');
    }
  }, [brandKits.length, seedAllDemoData]);

  const renderBody = () => {
    switch (activeBrandPanel) {
      case 'brand-kit': return <BrandKitPanel />;
      case 'templates': return <TemplatesPanel />;
      case 'variants': return <VariantsPanel />;
      case 'compliance': return <CompliancePanel />;
      case 'dam': return <DAMPanel />;
      case 'campaigns': return <CampaignsPanel />;
      case 'ad-validator': return <AdValidatorPanel />;
      case 'localization': return <LocalizationPanel />;
      case 'creative': return <CreativePanel />;
      case 'analytics': return <AnalyticsPanel />;
      default: return <BrandKitPanel />;
    }
  };

  return (
    <div style={S.panel}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.headerIcon}>{'\u25C6'}</span>
        <span style={S.title}>Brand & Marketing</span>
        <button onClick={toggleBrandPanel} style={S.closeBtn}>{'\u2715'}</button>
      </div>

      {/* Tab bar */}
      <div style={S.tabScroller}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveBrandPanel(tab.key)}
            style={S.tab(activeBrandPanel === tab.key)}
            title={tab.label}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={S.body}>
        {renderBody()}
      </div>

      {/* Seed bar */}
      <div style={S.seedBar}>
        <button
          onClick={() => seedAllDemoData('demo-org')}
          style={{
            padding: '4px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-default)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 9,
            cursor: 'pointer',
          }}
        >
          Reset Demo Data
        </button>
      </div>
    </div>
  );
}
