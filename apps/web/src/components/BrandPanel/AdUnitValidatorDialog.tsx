// ─── Ad Unit Validator Dialog ────────────────────────────────────────────────
// Standalone ad-unit validation panel: select/upload video, validate against
// all platform specs (Meta, Google DV360, YouTube, LinkedIn, TikTok, Twitter),
// display per-spec pass/warn/fail results with detailed check breakdowns.

import React, { useState } from 'react';
import { useBrandStore } from '../../store/brand.store';

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
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.02em',
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
  card: {
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-raised)',
    border: '1px solid var(--border-default)',
  },
  inputRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  input: {
    padding: '6px 8px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-void)',
    color: 'var(--text-primary)',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    outline: 'none',
  } as React.CSSProperties,
  btnPrimary: (disabled: boolean): React.CSSProperties => ({
    padding: '10px 20px',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    background: disabled ? 'var(--bg-elevated)' : BRAND_ACCENT,
    color: disabled ? 'var(--text-muted)' : '#fff',
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    width: '100%',
  }),
  emptyState: {
    textAlign: 'center' as const,
    padding: 24,
    color: 'var(--text-muted)',
    fontSize: 11,
    lineHeight: 1.6,
  },
};

// ─── Status helpers ─────────────────────────────────────────────────────────

function resultColor(status: string) {
  switch (status) {
    case 'PASS': return { bg: 'rgba(34,197,94,0.15)', fg: 'var(--success, #22c55e)' };
    case 'FAIL': return { bg: 'rgba(239,68,68,0.15)', fg: 'var(--error, #ef4444)' };
    case 'WARN': return { bg: 'rgba(245,158,11,0.15)', fg: 'var(--warning, #f59e0b)' };
    default: return { bg: 'var(--bg-hover)', fg: 'var(--text-muted)' };
  }
}

function resultIcon(status: string) {
  switch (status) {
    case 'PASS': return '\u2705';
    case 'FAIL': return '\u274C';
    case 'WARN': return '\u26A0\uFE0F';
    default: return '\u2022';
  }
}

// ─── Video Metadata Form ────────────────────────────────────────────────────

interface VideoForm {
  fileSize: number;
  duration: number;
  width: number;
  height: number;
  codec: string;
  bitrate: number;
  audioLoudness: number;
  hasAudio: boolean;
}

const DEFAULT_VIDEO: VideoForm = {
  fileSize: 250 * 1024 * 1024, // 250MB
  duration: 30,
  width: 1920,
  height: 1080,
  codec: 'h264',
  bitrate: 12000,
  audioLoudness: -14,
  hasAudio: true,
};

function VideoMetadataForm({
  video,
  onChange,
}: {
  video: VideoForm;
  onChange: (v: VideoForm) => void;
}) {
  const update = (key: keyof VideoForm, value: string | boolean) => {
    const next = { ...video };
    if (typeof value === 'boolean') {
      (next as any)[key] = value;
    } else {
      const num = parseFloat(value);
      (next as any)[key] = isNaN(num) ? value : num;
    }
    onChange(next);
  };

  return (
    <div>
      <div style={S.sectionTitle}>Video Metadata</div>
      <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={S.inputRow}>
          <div style={S.inputGroup}>
            <label style={S.label}>File Size (MB)</label>
            <input
              type="number"
              value={Math.round(video.fileSize / (1024 * 1024))}
              onChange={(e) => update('fileSize', String(parseFloat(e.target.value) * 1024 * 1024))}
              style={S.input}
            />
          </div>
          <div style={S.inputGroup}>
            <label style={S.label}>Duration (s)</label>
            <input
              type="number"
              value={video.duration}
              onChange={(e) => update('duration', e.target.value)}
              style={S.input}
            />
          </div>
        </div>
        <div style={S.inputRow}>
          <div style={S.inputGroup}>
            <label style={S.label}>Width (px)</label>
            <input
              type="number"
              value={video.width}
              onChange={(e) => update('width', e.target.value)}
              style={S.input}
            />
          </div>
          <div style={S.inputGroup}>
            <label style={S.label}>Height (px)</label>
            <input
              type="number"
              value={video.height}
              onChange={(e) => update('height', e.target.value)}
              style={S.input}
            />
          </div>
        </div>
        <div style={S.inputRow}>
          <div style={S.inputGroup}>
            <label style={S.label}>Codec</label>
            <select
              value={video.codec}
              onChange={(e) => update('codec', e.target.value)}
              style={{ ...S.input, cursor: 'pointer' }}
            >
              <option value="h264">H.264</option>
              <option value="h265">H.265 / HEVC</option>
              <option value="vp9">VP9</option>
              <option value="av1">AV1</option>
            </select>
          </div>
          <div style={S.inputGroup}>
            <label style={S.label}>Bitrate (kbps)</label>
            <input
              type="number"
              value={video.bitrate}
              onChange={(e) => update('bitrate', e.target.value)}
              style={S.input}
            />
          </div>
        </div>
        <div style={S.inputRow}>
          <div style={S.inputGroup}>
            <label style={S.label}>Audio Loudness (LUFS)</label>
            <input
              type="number"
              value={video.audioLoudness}
              onChange={(e) => update('audioLoudness', e.target.value)}
              style={S.input}
            />
          </div>
          <div style={S.inputGroup}>
            <label style={S.label}>Has Audio</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0' }}>
              <input
                type="checkbox"
                checked={video.hasAudio}
                onChange={(e) => update('hasAudio', e.target.checked)}
                style={{ accentColor: BRAND_ACCENT }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-primary)' }}>
                {video.hasAudio ? 'Yes' : 'No'}
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Validation Result Card ─────────────────────────────────────────────────

function ValidationResultCard({ result }: { result: import('@mcua/core').AdValidationResult }) {
  const [expanded, setExpanded] = useState(false);
  const rc = resultColor(result.status);
  const failedChecks = result.checks.filter((c) => c.status !== 'PASS');
  const passedChecks = result.checks.filter((c) => c.status === 'PASS');

  return (
    <div style={{
      ...S.card,
      borderLeft: `3px solid ${rc.fg}`,
      cursor: 'pointer',
    }} onClick={() => setExpanded(!expanded)}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>{resultIcon(result.status)}</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
              {result.specName}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {result.platform}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{
            padding: '2px 8px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 10,
            fontWeight: 700,
            background: rc.bg,
            color: rc.fg,
          }}>
            {result.status}
          </span>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
            {passedChecks.length}/{result.checks.length} passed
          </div>
        </div>
      </div>

      {/* Summary of failures */}
      {failedChecks.length > 0 && !expanded && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {failedChecks.slice(0, 2).map((check, i) => {
            const cc = resultColor(check.status);
            return (
              <div key={i} style={{ fontSize: 10, color: cc.fg }}>
                {check.name}: {check.message}
              </div>
            );
          })}
          {failedChecks.length > 2 && (
            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              +{failedChecks.length - 2} more issues
            </div>
          )}
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: 8, borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {result.checks.map((check, i) => {
              const cc = resultColor(check.status);
              return (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 6px',
                  borderRadius: 'var(--radius-sm)',
                  background: cc.bg,
                }}>
                  <span style={{ fontSize: 10, color: 'var(--text-primary)' }}>
                    {check.name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {check.message && (
                      <span style={{ fontSize: 9, color: cc.fg }}>
                        {check.message}
                      </span>
                    )}
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: cc.fg,
                      minWidth: 30, textAlign: 'right',
                    }}>
                      {check.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function AdUnitValidatorDialog() {
  const {
    adValidationResults,
    isValidatingAds,
    validateForAllPlatforms,
    clearValidationResults,
  } = useBrandStore();

  const [video, setVideo] = useState<VideoForm>(DEFAULT_VIDEO);

  const handleValidate = () => {
    validateForAllPlatforms(video);
  };

  const passCount = adValidationResults.filter((r) => r.status === 'PASS').length;
  const failCount = adValidationResults.filter((r) => r.status === 'FAIL').length;
  const warnCount = adValidationResults.filter((r) => r.status === 'WARNING').length;

  return (
    <div style={S.panel}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.title}>{'\u2611'} Ad Unit Validator</span>
        {adValidationResults.length > 0 && (
          <button
            onClick={clearValidationResults}
            style={{
              padding: '4px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 10,
              cursor: 'pointer',
            }}
          >
            Clear Results
          </button>
        )}
      </div>

      <div style={S.body}>
        {/* Video metadata form */}
        <VideoMetadataForm video={video} onChange={setVideo} />

        {/* Validate button */}
        <button
          onClick={handleValidate}
          disabled={isValidatingAds}
          style={S.btnPrimary(isValidatingAds)}
        >
          {isValidatingAds ? 'Validating...' : 'Validate Against All Platforms'}
        </button>

        {/* Summary bar */}
        {adValidationResults.length > 0 && (
          <div style={{
            display: 'flex',
            gap: 12,
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-void)',
            border: '1px solid var(--border-subtle)',
            justifyContent: 'center',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--success, #22c55e)' }}>{passCount}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pass</div>
            </div>
            <div style={{ width: 1, background: 'var(--border-subtle)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--warning, #f59e0b)' }}>{warnCount}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Warn</div>
            </div>
            <div style={{ width: 1, background: 'var(--border-subtle)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--error, #ef4444)' }}>{failCount}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Fail</div>
            </div>
          </div>
        )}

        {/* Results */}
        {adValidationResults.length > 0 && (
          <div>
            <div style={S.sectionTitle}>
              Results ({adValidationResults.length} specs)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {adValidationResults.map((result, i) => (
                <ValidationResultCard key={i} result={result} />
              ))}
            </div>
          </div>
        )}

        {adValidationResults.length === 0 && (
          <div style={S.emptyState}>
            Configure your video metadata above and click validate to check against all platform ad specs.
          </div>
        )}
      </div>
    </div>
  );
}
