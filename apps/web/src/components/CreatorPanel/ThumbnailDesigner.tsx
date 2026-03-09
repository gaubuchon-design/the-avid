// ─── Thumbnail Designer Panel ──────────────────────────────────────────────
// Canvas preview, template gallery, text overlay controls, color boost presets,
// and export controls for thumbnail creation.

import React, { useState, useCallback } from 'react';
import { useCreatorStore } from '../../store/creator.store';

// ─── Types ────────────────────────────────────────────────────────────────

type ExportFormat = 'PNG' | 'JPEG';

interface TemplatePreset {
  id: string;
  name: string;
  style: string;
}

interface ColorBoost {
  id: string;
  name: string;
  preview: string;
}

// ─── Constants ────────────────────────────────────────────────────────────

const TEMPLATE_PRESETS: TemplatePreset[] = [
  { id: 'tpl-1', name: 'Bold Text', style: 'Large white text on dark overlay' },
  { id: 'tpl-2', name: 'Gradient Split', style: 'Side-by-side with gradient divider' },
  { id: 'tpl-3', name: 'Minimal', style: 'Clean with subtle lower text' },
  { id: 'tpl-4', name: 'Dramatic', style: 'High contrast with color accent' },
  { id: 'tpl-5', name: 'Listicle', style: 'Number overlay with title card' },
  { id: 'tpl-6', name: 'Reaction', style: 'Face cutout with emotive background' },
];

const COLOR_BOOSTS: ColorBoost[] = [
  { id: 'cb-1', name: 'Vivid', preview: 'linear-gradient(135deg, #ff6b6b, #ffa07a)' },
  { id: 'cb-2', name: 'Cool', preview: 'linear-gradient(135deg, #667eea, #764ba2)' },
  { id: 'cb-3', name: 'Warm', preview: 'linear-gradient(135deg, #f093fb, #f5576c)' },
  { id: 'cb-4', name: 'Neon', preview: 'linear-gradient(135deg, #4facfe, #00f2fe)' },
  { id: 'cb-5', name: 'Earth', preview: 'linear-gradient(135deg, #c79081, #dfa579)' },
  { id: 'cb-6', name: 'None', preview: 'linear-gradient(135deg, #333, #555)' },
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

// ─── Canvas Preview ───────────────────────────────────────────────────────

function CanvasPreview({
  titleText,
  subtitleText,
  colorBoost,
}: {
  titleText: string;
  subtitleText: string;
  colorBoost: ColorBoost | null;
}) {
  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Preview</div>
      <div
        style={{
          width: '100%',
          maxWidth: 300,
          height: 170,
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
          background: colorBoost ? colorBoost.preview : 'var(--bg-void)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          margin: '0 auto',
        }}
      >
        {/* Overlay for text readability */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
          }}
        />
        {/* Title */}
        <div
          style={{
            position: 'relative',
            fontSize: 18,
            fontWeight: 800,
            color: '#fff',
            textAlign: 'center',
            padding: '0 16px',
            lineHeight: 1.2,
            textShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          {titleText || 'Title Text'}
        </div>
        {/* Subtitle */}
        {subtitleText && (
          <div
            style={{
              position: 'relative',
              fontSize: 11,
              fontWeight: 500,
              color: 'rgba(255,255,255,0.85)',
              textAlign: 'center',
              marginTop: 6,
              padding: '0 16px',
              textShadow: '0 1px 4px rgba(0,0,0,0.4)',
            }}
          >
            {subtitleText}
          </div>
        )}
        {/* Size indicator */}
        <div
          style={{
            position: 'absolute',
            bottom: 6,
            right: 8,
            fontSize: 8,
            color: 'rgba(255,255,255,0.4)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          1280 x 720
        </div>
      </div>
    </div>
  );
}

// ─── Template Gallery ─────────────────────────────────────────────────────

function TemplateGallery({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Templates</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {TEMPLATE_PRESETS.map((tpl) => (
          <div
            key={tpl.id}
            onClick={() => onSelect(tpl.id)}
            style={{
              padding: '10px 6px',
              borderRadius: 'var(--radius-sm)',
              border: `1.5px solid ${selectedId === tpl.id ? 'var(--accent)' : 'var(--border-subtle)'}`,
              background: selectedId === tpl.id ? 'rgba(99,102,241,0.08)' : 'var(--bg-void)',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 100ms',
            }}
          >
            <div
              style={{
                width: '100%',
                height: 40,
                borderRadius: 3,
                background: 'var(--bg-surface)',
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 8,
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {tpl.name[0]}
            </div>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-primary)' }}>{tpl.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Text Overlay Controls ────────────────────────────────────────────────

function TextOverlayControls({
  titleText,
  subtitleText,
  fontSize,
  onTitleChange,
  onSubtitleChange,
  onFontSizeChange,
}: {
  titleText: string;
  subtitleText: string;
  fontSize: number;
  onTitleChange: (v: string) => void;
  onSubtitleChange: (v: string) => void;
  onFontSizeChange: (v: number) => void;
}) {
  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Text Overlay</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            Title
          </label>
          <input
            type="text"
            value={titleText}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Enter title..."
            style={{
              width: '100%',
              padding: '7px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-void)',
              color: 'var(--text-primary)',
              fontSize: 12,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            Subtitle
          </label>
          <input
            type="text"
            value={subtitleText}
            onChange={(e) => onSubtitleChange(e.target.value)}
            placeholder="Enter subtitle..."
            style={{
              width: '100%',
              padding: '7px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-void)',
              color: 'var(--text-primary)',
              fontSize: 12,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Font Size</label>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              {fontSize}px
            </span>
          </div>
          <input
            type="range"
            min={12}
            max={48}
            value={fontSize}
            onChange={(e) => onFontSizeChange(parseInt(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Color Boost Presets ──────────────────────────────────────────────────

function ColorBoostPresets({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (boost: ColorBoost) => void;
}) {
  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Color Boost</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {COLOR_BOOSTS.map((boost) => (
          <div
            key={boost.id}
            onClick={() => onSelect(boost)}
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-sm)',
              background: boost.preview,
              border: `2px solid ${selectedId === boost.id ? 'var(--accent)' : 'transparent'}`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              paddingBottom: 3,
              transition: 'border-color 100ms',
            }}
          >
            <span style={{ fontSize: 7, color: '#fff', fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
              {boost.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Export Controls ──────────────────────────────────────────────────────

function ExportControls() {
  const [format, setFormat] = useState<ExportFormat>('PNG');

  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Export</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {(['PNG', 'JPEG'] as ExportFormat[]).map((f) => (
          <button
            key={f}
            onClick={() => setFormat(f)}
            className="tl-btn"
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${format === f ? 'var(--accent)' : 'var(--border-subtle)'}`,
              background: format === f ? 'rgba(99,102,241,0.1)' : 'transparent',
              color: format === f ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 80ms',
            }}
          >
            {f}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          className="tl-btn"
          style={{
            padding: '8px 20px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 80ms',
          }}
        >
          Export {format}
        </button>
      </div>
    </div>
  );
}

// ─── Main Thumbnail Designer ──────────────────────────────────────────────

export function ThumbnailDesigner() {
  const [titleText, setTitleText] = useState('');
  const [subtitleText, setSubtitleText] = useState('');
  const [fontSize, setFontSize] = useState(24);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedBoost, setSelectedBoost] = useState<ColorBoost | null>(null);

  return (
    <div style={S.panel}>
      <div className="panel-header" style={S.header}>
        <span className="panel-title" style={S.title}>Thumbnail Designer</span>
      </div>

      <div className="panel-body" style={S.body}>
        <CanvasPreview
          titleText={titleText}
          subtitleText={subtitleText}
          colorBoost={selectedBoost}
        />
        <TemplateGallery
          selectedId={selectedTemplate}
          onSelect={setSelectedTemplate}
        />
        <TextOverlayControls
          titleText={titleText}
          subtitleText={subtitleText}
          fontSize={fontSize}
          onTitleChange={setTitleText}
          onSubtitleChange={setSubtitleText}
          onFontSizeChange={setFontSize}
        />
        <ColorBoostPresets
          selectedId={selectedBoost?.id ?? null}
          onSelect={setSelectedBoost}
        />
        <ExportControls />
      </div>
    </div>
  );
}
