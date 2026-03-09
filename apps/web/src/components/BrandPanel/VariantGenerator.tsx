// ─── Variant Generator Panel ──────────────────────────────────────────────
// Content variant generator: master project selector, target platforms checklist,
// language/market selector, generate-all button with progress, and variant preview cards.

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useBrandStore } from '../../store/brand.store';

// ─── Types ────────────────────────────────────────────────────────────────

interface Platform {
  id: string;
  name: string;
  icon: string;
  aspectHint: string;
}

interface LanguageMarket {
  code: string;
  label: string;
}

interface VariantPreview {
  id: string;
  platform: string;
  language: string;
  status: 'pending' | 'generating' | 'ready' | 'failed';
  progress: number;
}

// ─── Constants ────────────────────────────────────────────────────────────

const PLATFORMS: Platform[] = [
  { id: 'youtube', name: 'YouTube', icon: '\u25B6', aspectHint: '16:9' },
  { id: 'instagram', name: 'Instagram', icon: '\u25A3', aspectHint: '1:1, 9:16' },
  { id: 'tiktok', name: 'TikTok', icon: '\u266B', aspectHint: '9:16' },
  { id: 'facebook', name: 'Facebook', icon: 'f', aspectHint: '16:9, 1:1' },
  { id: 'twitter', name: 'Twitter', icon: '\u2709', aspectHint: '16:9' },
];

const LANGUAGES: LanguageMarket[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'ja', label: 'Japanese' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ko', label: 'Korean' },
];

const MARKETS: LanguageMarket[] = [
  { code: 'US', label: 'United States' },
  { code: 'EU', label: 'Europe' },
  { code: 'LATAM', label: 'Latin America' },
  { code: 'APAC', label: 'Asia Pacific' },
  { code: 'MEA', label: 'Middle East & Africa' },
];

// ─── Styles ────────────────────────────────────────────────────────────────

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
  },
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: 12,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-muted)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    marginBottom: 8,
  },
};

// ─── Master Project Selector ──────────────────────────────────────────────

function MasterProjectSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Master Project</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-void)',
          color: 'var(--text-primary)',
          fontSize: 12,
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        <option value="">Select master project...</option>
        <option value="proj-hero-60">Hero Video - 60s</option>
        <option value="proj-brand-overview">Brand Overview</option>
        <option value="proj-product-launch">Product Launch</option>
        <option value="proj-testimonial">Customer Testimonial</option>
      </select>
    </div>
  );
}

// ─── Target Platforms Checklist ────────────────────────────────────────────

function PlatformChecklist({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Target Platforms</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {PLATFORMS.map((platform) => {
          const isSelected = selected.includes(platform.id);
          return (
            <label
              key={platform.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                background: isSelected ? 'rgba(99,102,241,0.06)' : 'transparent',
                cursor: 'pointer',
                transition: 'all 100ms',
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(platform.id)}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span style={{ fontSize: 14, width: 20, textAlign: 'center' }}>{platform.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {platform.name}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                  {platform.aspectHint}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ─── Language/Market Selector ─────────────────────────────────────────────

function LanguageMarketSelector({
  selectedLanguages,
  selectedMarkets,
  onToggleLanguage,
  onToggleMarket,
}: {
  selectedLanguages: string[];
  selectedMarkets: string[];
  onToggleLanguage: (code: string) => void;
  onToggleMarket: (code: string) => void;
}) {
  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Languages</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
        {LANGUAGES.map((lang) => {
          const isSelected = selectedLanguages.includes(lang.code);
          return (
            <button
              key={lang.code}
              onClick={() => onToggleLanguage(lang.code)}
              className="tl-btn"
              style={{
                padding: '5px 10px',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                background: isSelected ? 'rgba(99,102,241,0.1)' : 'transparent',
                color: isSelected ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 80ms',
              }}
            >
              {lang.code.toUpperCase()} {lang.label}
            </button>
          );
        })}
      </div>

      <div style={S.sectionTitle}>Markets</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {MARKETS.map((market) => {
          const isSelected = selectedMarkets.includes(market.code);
          return (
            <button
              key={market.code}
              onClick={() => onToggleMarket(market.code)}
              className="tl-btn"
              style={{
                padding: '5px 10px',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                background: isSelected ? 'rgba(99,102,241,0.1)' : 'transparent',
                color: isSelected ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 80ms',
              }}
            >
              {market.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Generate All Button ──────────────────────────────────────────────────

function GenerateButton({
  generating,
  progress,
  totalVariants,
  onGenerate,
}: {
  generating: boolean;
  progress: number;
  totalVariants: number;
  onGenerate: () => void;
}) {
  return (
    <div style={S.section}>
      <button
        onClick={onGenerate}
        disabled={generating || totalVariants === 0}
        className="tl-btn"
        style={{
          width: '100%',
          padding: '12px 0',
          borderRadius: 'var(--radius-sm)',
          border: 'none',
          background: generating || totalVariants === 0 ? 'var(--bg-void)' : 'var(--accent)',
          color: generating || totalVariants === 0 ? 'var(--text-muted)' : '#fff',
          fontSize: 12,
          fontWeight: 700,
          cursor: generating || totalVariants === 0 ? 'default' : 'pointer',
          transition: 'all 100ms',
        }}
      >
        {generating
          ? `Generating... ${Math.round(progress)}%`
          : `Generate All (${totalVariants} variant${totalVariants !== 1 ? 's' : ''})`}
      </button>
      {generating && (
        <div
          style={{
            marginTop: 8,
            height: 4,
            borderRadius: 2,
            background: 'var(--bg-void)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: 'var(--accent)',
              borderRadius: 2,
              transition: 'width 200ms linear',
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Variant Preview Cards ────────────────────────────────────────────────

function VariantPreviewCards({ variants }: { variants: VariantPreview[] }) {
  if (variants.length === 0) return null;

  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Variants ({variants.length})</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {variants.map((variant) => {
          const statusColor =
            variant.status === 'ready'
              ? 'var(--success)'
              : variant.status === 'failed'
                ? 'var(--error)'
                : variant.status === 'generating'
                  ? 'var(--accent)'
                  : 'var(--text-muted)';

          return (
            <div
              key={variant.id}
              style={{
                padding: '10px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-void)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {/* Preview area */}
              <div
                style={{
                  width: '100%',
                  height: 60,
                  borderRadius: 3,
                  background: 'var(--bg-surface)',
                  marginBottom: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {variant.platform}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {variant.platform}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                    {variant.language}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 9,
                    padding: '2px 6px',
                    borderRadius: 3,
                    background: `${statusColor}22`,
                    color: statusColor,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  {variant.status}
                </span>
              </div>
              {variant.status === 'generating' && (
                <div
                  style={{
                    marginTop: 6,
                    height: 3,
                    borderRadius: 2,
                    background: 'var(--bg-surface)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${variant.progress}%`,
                      background: 'var(--accent)',
                      borderRadius: 2,
                      transition: 'width 150ms linear',
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Variant Generator ───────────────────────────────────────────────

export function VariantGenerator() {
  const [masterProject, setMasterProject] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(['en']);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>(['US']);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [variants, setVariants] = useState<VariantPreview[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up interval on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const togglePlatform = useCallback((id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }, []);

  const toggleLanguage = useCallback((code: string) => {
    setSelectedLanguages((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code],
    );
  }, []);

  const toggleMarket = useCallback((code: string) => {
    setSelectedMarkets((prev) =>
      prev.includes(code) ? prev.filter((m) => m !== code) : [...prev, code],
    );
  }, []);

  const totalVariants = selectedPlatforms.length * selectedLanguages.length;

  const handleGenerate = useCallback(() => {
    if (totalVariants === 0 || !masterProject) return;
    setGenerating(true);
    setProgress(0);

    // Build variant previews
    const newVariants: VariantPreview[] = [];
    let counter = 0;
    for (const platform of selectedPlatforms) {
      for (const language of selectedLanguages) {
        counter++;
        newVariants.push({
          id: `var-${counter}`,
          platform,
          language,
          status: 'pending',
          progress: 0,
        });
      }
    }
    setVariants(newVariants);

    // Simulate generation progress
    let current = 0;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(() => {
      current += 5;
      setProgress(Math.min(current, 100));
      setVariants((prev) =>
        prev.map((v) => ({
          ...v,
          status: current >= 100 ? 'ready' : current > 20 ? 'generating' : 'pending',
          progress: Math.min(current, 100),
        })),
      );
      if (current >= 100) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setGenerating(false);
      }
    }, 300);
  }, [totalVariants, masterProject, selectedPlatforms, selectedLanguages]);

  return (
    <div style={S.panel}>
      <div className="panel-header" style={S.header}>
        <span className="panel-title" style={S.title}>Variant Generator</span>
      </div>

      <div className="panel-body" style={S.body}>
        <MasterProjectSelector value={masterProject} onChange={setMasterProject} />
        <PlatformChecklist selected={selectedPlatforms} onToggle={togglePlatform} />
        <LanguageMarketSelector
          selectedLanguages={selectedLanguages}
          selectedMarkets={selectedMarkets}
          onToggleLanguage={toggleLanguage}
          onToggleMarket={toggleMarket}
        />
        <GenerateButton
          generating={generating}
          progress={progress}
          totalVariants={totalVariants}
          onGenerate={handleGenerate}
        />
        <VariantPreviewCards variants={variants} />
      </div>
    </div>
  );
}
