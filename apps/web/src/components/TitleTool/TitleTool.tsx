// =============================================================================
//  THE AVID — WYSIWYG Title Editor Panel
// =============================================================================
//
//  A dockable panel for authoring, previewing, and applying title overlays.
//  Features: templates, quick titles, crawl/roll, auto-subtitling,
//  safe zones, live canvas preview, text/style/position/animation controls.
// =============================================================================

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react';
import {
  useTitleStore,
  QUICK_TITLE_TEMPLATES,
  type TitleType,
  type CrawlDirection,
} from '../../store/title.store';
import { useEditorStore, type TitleClipData } from '../../store/editor.store';
import { renderTitle, type TitleData } from '../../engine/TitleRenderer';
import { Timecode } from '../../lib/timecode';

// --- Helpers ----------------------------------------------------------------

function uid(prefix = 'ttl'): string {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// --- Constants --------------------------------------------------------------

const FONT_FAMILIES = [
  'system-ui',
  'Arial',
  'Helvetica Neue',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Impact',
  'Trebuchet MS',
  'Verdana',
  'Futura',
  'Gill Sans',
  'Optima',
  'Palatino',
  'Rockwell',
  'Century Gothic',
  'Franklin Gothic',
  'DIN',
  'Avenir',
  'Montserrat',
  'Roboto',
];

const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800, 900];

const ANIMATION_TYPES: Array<TitleClipData['animation'] extends infer T
  ? T extends { type: infer U } ? U : never
  : never> = ['none', 'fade-in', 'slide-up', 'typewriter', 'scale-in'];

const ALIGN_OPTIONS: Array<{ value: 'left' | 'center' | 'right'; icon: string }> = [
  { value: 'left', icon: '\u2261' },
  { value: 'center', icon: '\u2630' },
  { value: 'right', icon: '\u2261' },
];

// 3x3 alignment grid positions (normalized x, y)
const GRID_POSITIONS: Array<{ x: number; y: number }> = [
  { x: 0.1, y: 0.1 },  { x: 0.5, y: 0.1 },  { x: 0.9, y: 0.1 },
  { x: 0.1, y: 0.5 },  { x: 0.5, y: 0.5 },  { x: 0.9, y: 0.5 },
  { x: 0.1, y: 0.9 },  { x: 0.5, y: 0.9 },  { x: 0.9, y: 0.9 },
];

const TITLE_TYPES: Array<{ value: TitleType; label: string }> = [
  { value: 'static', label: 'Static' },
  { value: 'roll', label: 'Roll' },
  { value: 'crawl', label: 'Crawl' },
];

const CRAWL_DIRECTIONS: Array<{ value: CrawlDirection; label: string }> = [
  { value: 'left-to-right', label: 'L \u2192 R' },
  { value: 'right-to-left', label: 'R \u2192 L' },
];

type TabId = 'editor' | 'quick' | 'subtitles';

const TAB_ITEMS: Array<{ id: TabId; label: string }> = [
  { id: 'editor', label: 'Editor' },
  { id: 'quick', label: 'Quick Title' },
  { id: 'subtitles', label: 'Auto-Subtitle' },
];

// Quick title style presets
const QUICK_STYLES: Record<string, {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  bgColor: string;
  bgOpacity: number;
  position: { x: number; y: number; width: number; height: number };
  textAlign: 'left' | 'center' | 'right';
}> = {
  'name-title': {
    fontFamily: 'Helvetica Neue',
    fontSize: 26,
    fontWeight: 600,
    color: '#FFFFFF',
    bgColor: '#000000',
    bgOpacity: 0.75,
    position: { x: 0.05, y: 0.80, width: 0.42, height: 0.10 },
    textAlign: 'left',
  },
  location: {
    fontFamily: 'Futura',
    fontSize: 22,
    fontWeight: 500,
    color: '#FFFFFF',
    bgColor: '#1a1a1a',
    bgOpacity: 0.70,
    position: { x: 0.04, y: 0.84, width: 0.36, height: 0.08 },
    textAlign: 'left',
  },
  quote: {
    fontFamily: 'Georgia',
    fontSize: 32,
    fontWeight: 400,
    color: '#F0F0F0',
    bgColor: '#000000',
    bgOpacity: 0.50,
    position: { x: 0.10, y: 0.35, width: 0.80, height: 0.30 },
    textAlign: 'center',
  },
  date: {
    fontFamily: 'Courier New',
    fontSize: 20,
    fontWeight: 700,
    color: '#FFFFFF',
    bgColor: '#222222',
    bgOpacity: 0.65,
    position: { x: 0.04, y: 0.86, width: 0.30, height: 0.06 },
    textAlign: 'left',
  },
};

// Subtitle language options
const LANGUAGES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es-ES', label: 'Spanish' },
  { value: 'fr-FR', label: 'French' },
  { value: 'de-DE', label: 'German' },
  { value: 'ja-JP', label: 'Japanese' },
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
  { value: 'pt-BR', label: 'Portuguese (BR)' },
  { value: 'ko-KR', label: 'Korean' },
  { value: 'it-IT', label: 'Italian' },
];

// --- Inline styles (design-system vars) ------------------------------------

const S = {
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-ui)',
    fontSize: 12,
    overflow: 'hidden',
    minWidth: 0,
  },

  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 12px',
    height: 32,
    background: 'var(--bg-raised)',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  },
  headerTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: '1.2px',
    textTransform: 'uppercase' as const,
    color: 'var(--text-tertiary)',
  },
  headerSpacer: { flex: 1 },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
    padding: '2px 4px',
  },

  // Tab bar
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
    background: 'var(--bg-raised)',
  },
  tab: (active: boolean) => ({
    flex: 1,
    padding: '6px 8px',
    fontSize: 10,
    fontWeight: active ? 700 : 500,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    color: active ? 'var(--brand-bright)' : 'var(--text-muted)',
    border: 'none',
    background: active ? 'var(--bg-hover)' : 'transparent',
    borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
    cursor: 'pointer',
    transition: 'all 100ms',
    textAlign: 'center' as const,
    lineHeight: 1,
  }),

  // Scrollable body
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
    padding: 0,
  },

  // Section
  section: {
    borderBottom: '1px solid var(--border-subtle)',
    padding: '10px 12px',
  },
  sectionLabel: {
    fontFamily: 'var(--font-display)',
    fontSize: 8.5,
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
    marginBottom: 8,
  },

  // Template gallery
  templateGallery: {
    display: 'flex',
    gap: 8,
    overflowX: 'auto' as const,
    overflowY: 'hidden' as const,
    paddingBottom: 4,
  },
  templateThumb: (isActive: boolean) => ({
    flexShrink: 0,
    width: 72,
    cursor: 'pointer',
    textAlign: 'center' as const,
    borderRadius: 'var(--radius-md)',
    border: isActive ? '1px solid var(--brand)' : '1px solid var(--border-subtle)',
    background: isActive ? 'var(--accent-muted)' : 'var(--bg-elevated)',
    padding: 4,
    transition: 'border-color 100ms, background 100ms',
  }),
  templateCanvas: {
    width: 64,
    height: 36,
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-void)',
    display: 'block',
    margin: '0 auto 4px',
  },
  templateName: {
    fontSize: 9,
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },

  // Preview canvas
  previewWrap: {
    background: 'var(--bg-void)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    position: 'relative' as const,
  },
  previewCanvas: {
    width: '100%',
    display: 'block',
  },
  safeZoneToggle: {
    position: 'absolute' as const,
    top: 4,
    right: 4,
    padding: '2px 6px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 9,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    background: 'rgba(0,0,0,0.6)',
    color: 'var(--text-secondary)',
    transition: 'all 100ms',
    zIndex: 2,
  },

  // Text area
  textArea: {
    width: '100%',
    minHeight: 64,
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    padding: '8px 10px',
    resize: 'vertical' as const,
    outline: 'none',
    lineHeight: 1.5,
  },

  // Control rows
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  label: {
    fontSize: 10,
    color: 'var(--text-tertiary)',
    minWidth: 62,
    flexShrink: 0,
  },
  value: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--text-secondary)',
    minWidth: 36,
    textAlign: 'right' as const,
    flexShrink: 0,
  },
  slider: {
    flex: 1,
    height: 3,
    cursor: 'pointer',
  },
  select: {
    flex: 1,
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontSize: 10,
    padding: '3px 6px',
    outline: 'none',
    cursor: 'pointer',
  },
  colorInput: {
    width: 24,
    height: 18,
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-xs)',
    padding: 0,
    cursor: 'pointer',
    background: 'none',
  },
  toggleBtn: (active: boolean) => ({
    padding: '3px 8px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 10,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    background: active ? 'var(--brand-dim)' : 'var(--bg-elevated)',
    color: active ? 'var(--brand-bright)' : 'var(--text-tertiary)',
    transition: 'all 100ms',
    lineHeight: 1.2,
  }),
  checkToggle: (on: boolean) => ({
    width: 22,
    height: 12,
    borderRadius: 6,
    background: on ? 'var(--brand)' : 'var(--bg-overlay)',
    border: `1px solid ${on ? 'var(--brand)' : 'var(--border-default)'}`,
    cursor: 'pointer',
    position: 'relative' as const,
    flexShrink: 0,
    transition: 'all 150ms',
    display: 'inline-block',
  }),
  checkDot: (on: boolean) => ({
    position: 'absolute' as const,
    top: 1,
    left: on ? 11 : 1,
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: on ? '#fff' : 'var(--text-muted)',
    transition: 'all 150ms',
  }),

  // 3x3 alignment grid
  alignGrid: {
    display: 'inline-grid',
    gridTemplateColumns: 'repeat(3, 18px)',
    gridTemplateRows: 'repeat(3, 18px)',
    gap: 2,
  },
  alignDot: (active: boolean) => ({
    width: 18,
    height: 18,
    borderRadius: 'var(--radius-xs)',
    border: 'none',
    cursor: 'pointer',
    background: active ? 'var(--brand)' : 'var(--bg-elevated)',
    transition: 'background 100ms',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  alignDotInner: (active: boolean) => ({
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: active ? '#fff' : 'var(--text-muted)',
  }),

  // Footer
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderTop: '1px solid var(--border-default)',
    background: 'var(--bg-raised)',
    flexShrink: 0,
  },
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 12px',
    borderRadius: 'var(--radius-md)',
    fontSize: 11,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    background: 'var(--brand)',
    color: '#fff',
    transition: 'all 150ms',
    lineHeight: 1,
    whiteSpace: 'nowrap' as const,
  },
  btnSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 10px',
    borderRadius: 'var(--radius-md)',
    fontSize: 11,
    fontWeight: 500,
    border: '1px solid var(--border-default)',
    cursor: 'pointer',
    background: 'var(--bg-elevated)',
    color: 'var(--text-secondary)',
    transition: 'all 150ms',
    lineHeight: 1,
    whiteSpace: 'nowrap' as const,
  },
  btnDisabled: {
    opacity: 0.45,
    pointerEvents: 'none' as const,
  },

  // Quick Title styles
  quickCard: (active: boolean) => ({
    padding: '8px 10px',
    borderRadius: 'var(--radius-md)',
    border: active ? '1px solid var(--brand)' : '1px solid var(--border-subtle)',
    background: active ? 'var(--accent-muted)' : 'var(--bg-elevated)',
    cursor: 'pointer',
    transition: 'all 100ms',
    marginBottom: 6,
  }),
  quickCardName: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: 4,
  },
  quickCardDesc: {
    fontSize: 9,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  quickInput: {
    width: '100%',
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-ui)',
    fontSize: 11,
    padding: '6px 8px',
    outline: 'none',
    marginBottom: 6,
  },

  // Auto-subtitle styles
  subtitleGenSection: {
    padding: '12px',
    borderBottom: '1px solid var(--border-subtle)',
  },
  subtitleSettingsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  subtitleLabel: {
    fontSize: 10,
    color: 'var(--text-tertiary)',
    minWidth: 80,
    flexShrink: 0,
  },
  progressBar: {
    height: 3,
    background: 'var(--bg-elevated)',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressFill: {
    height: '100%',
    background: 'var(--brand-bright)',
    transition: 'width 200ms ease-out',
  },
  aiLabel: {
    fontSize: 9,
    color: 'var(--ai-accent)',
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    marginTop: 6,
  },
  subtitleList: {
    maxHeight: 200,
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
  },
  subtitleRow: (isHovered: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 12px',
    borderBottom: '1px solid var(--border-subtle)',
    background: isHovered ? 'var(--bg-hover)' : 'transparent',
    cursor: 'pointer',
    transition: 'background 80ms',
    minHeight: 30,
  }),
  subtitleTC: {
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    color: 'var(--text-muted)',
    width: 75,
    flexShrink: 0,
  },
  subtitleText: {
    flex: 1,
    fontSize: 11,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  subtitleEditInput: {
    flex: 1,
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontSize: 11,
    padding: '2px 6px',
    outline: 'none',
  },
  subtitleDeleteBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 11,
    padding: '2px 4px',
    borderRadius: 'var(--radius-sm)',
    transition: 'color 100ms',
    lineHeight: 1,
  },
};

// =============================================================================
//  Sub-components
// =============================================================================

/** Labeled row with a range slider, optional numeric readout. */
function SliderRow({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  displayValue,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  displayValue?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={S.row}>
      <span style={S.label}>{label}</span>
      <input
        type="range"
        style={S.slider}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span style={S.value}>{displayValue ?? String(value)}</span>
    </div>
  );
}

/** Toggle switch (on/off). */
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={S.row}>
      <span style={S.label}>{label}</span>
      <button
        style={{ ...S.checkToggle(value), padding: 0 }}
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        aria-label={label}
      >
        <div style={S.checkDot(value)} />
      </button>
    </div>
  );
}

// =============================================================================
//  Helper: Draw safe zones on canvas
// =============================================================================

function drawSafeZones(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  // Action safe (90%)
  const actionInset = 0.05;
  ctx.strokeRect(
    w * actionInset,
    h * actionInset,
    w * (1 - 2 * actionInset),
    h * (1 - 2 * actionInset),
  );

  // Title safe (80%)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.setLineDash([2, 4]);
  const titleInset = 0.10;
  ctx.strokeRect(
    w * titleInset,
    h * titleInset,
    w * (1 - 2 * titleInset),
    h * (1 - 2 * titleInset),
  );

  // Labels
  ctx.setLineDash([]);
  ctx.font = `${Math.max(8, w * 0.018)}px var(--font-mono), monospace`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fillText('ACTION SAFE 90%', w * actionInset + 4, h * actionInset + 12);
  ctx.fillText('TITLE SAFE 80%', w * titleInset + 4, h * titleInset + 12);

  ctx.restore();
}

// =============================================================================
//  TitleTool Component
// =============================================================================

export function TitleTool() {
  // --- Stores ---------------------------------------------------------------

  const {
    currentTitle,
    templates,
    isEditing,
    titleType,
    rollSpeed,
    crawlDirection,
    showSafeZones,
    setCurrentTitle,
    updateCurrentTitle,
    updateCurrentStyle,
    updateCurrentPosition,
    loadTemplate,
    saveAsTemplate,
    setEditing,
    setTitleType,
    setRollSpeed,
    setCrawlDirection,
    setShowSafeZones,
  } = useTitleStore();

  const {
    showTitleTool,
    toggleTitleTool,
    addTitleClip,
    sequenceSettings,
    playheadTime,
  } = useEditorStore();

  // --- Local state ----------------------------------------------------------

  const [activeTab, setActiveTab] = useState<TabId>('editor');
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [outlineEnabled, setOutlineEnabled] = useState(false);
  const [shadowEnabled, setShadowEnabled] = useState(false);

  // Background controls
  const [bgType, setBgType] = useState<'none' | 'solid' | 'gradient'>('none');
  const [bgColor, setBgColor] = useState('#000000');
  const [bgGradientEnd, setBgGradientEnd] = useState('#333333');
  const [bgOpacity, setBgOpacity] = useState(80);

  // Animation controls
  const [animationType, setAnimationType] = useState<
    'none' | 'fade-in' | 'slide-up' | 'typewriter' | 'scale-in'
  >('none');
  const [animDuration, setAnimDuration] = useState(15);

  // Quick title state
  const [quickStyleId, setQuickStyleId] = useState('name-title');
  const [quickPrimary, setQuickPrimary] = useState('');
  const [quickSecondary, setQuickSecondary] = useState('');

  // Auto-subtitle state
  const [subLanguage, setSubLanguage] = useState('en-US');
  const [subMaxChars, setSubMaxChars] = useState(42);
  const [subPosition, setSubPosition] = useState<'top' | 'center' | 'bottom'>('bottom');
  const [subGenerating, setSubGenerating] = useState(false);
  const [subProgress, setSubProgress] = useState(0);
  const [subProgressLabel, setSubProgressLabel] = useState('');
  const [subtitleEntries, setSubtitleEntries] = useState<Array<{ id: string; start: number; end: number; text: string }>>([]);
  const [subEditingId, setSubEditingId] = useState<string | null>(null);
  const [subHoveredId, setSubHoveredId] = useState<string | null>(null);

  // Refs
  const previewRef = useRef<HTMLCanvasElement>(null);
  const templateCanvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // --- Derived --------------------------------------------------------------

  const style = currentTitle?.style ?? {
    fontFamily: 'system-ui',
    fontSize: 64,
    fontWeight: 700,
    color: '#ffffff',
    opacity: 1,
    textAlign: 'center' as const,
  };

  const position = currentTitle?.position ?? {
    x: 0.5,
    y: 0.5,
    width: 0.8,
    height: 0.2,
  };

  const text = currentTitle?.text ?? 'Title Text';

  const seqWidth = sequenceSettings?.width ?? 1920;
  const seqHeight = sequenceSettings?.height ?? 1080;
  const aspectRatio = seqWidth / seqHeight;
  const fps = sequenceSettings?.fps ?? 24;

  const activeQuickTemplate = QUICK_TITLE_TEMPLATES.find((t) => t.style === quickStyleId);

  // Timecode helper for subtitle display
  const tc = useMemo(
    () =>
      new Timecode({
        fps: sequenceSettings?.fps ?? 24,
        dropFrame: sequenceSettings?.dropFrame ?? false,
        startOffset: sequenceSettings?.startTC ?? 0,
      }),
    [sequenceSettings?.fps, sequenceSettings?.dropFrame, sequenceSettings?.startTC],
  );

  // Build the TitleData object for the renderer
  const titleData: TitleData = useMemo(() => ({
    text,
    style: {
      ...style,
      outlineColor: outlineEnabled ? (style.outlineColor ?? '#000000') : undefined,
      outlineWidth: outlineEnabled ? (style.outlineWidth ?? 2) : undefined,
      shadowColor: shadowEnabled ? (style.shadowColor ?? '#000000') : undefined,
      shadowBlur: shadowEnabled ? (style.shadowBlur ?? 8) : undefined,
    },
    position,
    background: bgType !== 'none'
      ? {
          type: bgType,
          color: bgColor,
          gradientColors: bgType === 'gradient' ? [bgColor, bgGradientEnd] : undefined,
          opacity: bgOpacity / 100,
        }
      : { type: 'none' },
    animation: animationType !== 'none'
      ? { type: animationType, duration: animDuration }
      : undefined,
  }), [
    text, style, position, outlineEnabled, shadowEnabled,
    bgType, bgColor, bgGradientEnd, bgOpacity,
    animationType, animDuration,
  ]);

  // --- Preview rendering ----------------------------------------------------

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;

    let rafId: number;

    const draw = () => {
      canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1);
      canvas.height = canvas.width / aspectRatio;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      renderTitle(ctx, titleData, canvas.width, canvas.height, 0, fps);

      // Draw safe zones overlay
      if (showSafeZones) {
        drawSafeZones(ctx, canvas.width, canvas.height);
      }
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [titleData, seqWidth, seqHeight, aspectRatio, showSafeZones]);

  // --- Template thumbnail rendering -----------------------------------------

  useEffect(() => {
    templates.forEach((tmpl) => {
      const canvas = templateCanvasRefs.current.get(tmpl.id ?? tmpl.name);
      if (!canvas) return;
      canvas.width = 128;
      canvas.height = 72;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, 128, 72);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, 128, 72);
      renderTitle(ctx, tmpl.data, 128, 72, 0, fps);
    });
  }, [templates, fps]);

  // --- Callbacks ------------------------------------------------------------

  const handleLoadTemplate = useCallback(
    (tmpl: (typeof templates)[number]) => {
      setActiveTemplateId(tmpl.id ?? tmpl.name);
      loadTemplate(tmpl.id ?? tmpl.name);
    },
    [loadTemplate],
  );

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateCurrentTitle({ text: e.target.value });
    },
    [updateCurrentTitle],
  );

  const handleStyleChange = useCallback(
    <K extends keyof typeof style>(key: K, value: (typeof style)[K]) => {
      updateCurrentStyle({ [key]: value });
    },
    [updateCurrentStyle],
  );

  const handlePositionChange = useCallback(
    <K extends keyof typeof position>(key: K, value: number) => {
      updateCurrentPosition({ [key]: value });
    },
    [updateCurrentPosition],
  );

  const handleGridClick = useCallback(
    (pos: { x: number; y: number }) => {
      updateCurrentPosition({ x: pos.x, y: pos.y });
    },
    [updateCurrentPosition],
  );

  const handleApply = useCallback(() => {
    const clip: TitleClipData = {
      id: uid(),
      text,
      style: { ...style },
      position: { ...position },
      background: bgType !== 'none'
        ? {
            type: bgType,
            color: bgColor,
            gradientColors: bgType === 'gradient' ? [bgColor, bgGradientEnd] : undefined,
            opacity: bgOpacity / 100,
          }
        : { type: 'none' },
      animation: animationType !== 'none'
        ? { type: animationType, duration: animDuration }
        : undefined,
    };
    addTitleClip(clip);
  }, [
    text, style, position, bgType, bgColor, bgGradientEnd, bgOpacity,
    animationType, animDuration, addTitleClip,
  ]);

  const handleSaveTemplate = useCallback(() => {
    const name = text.slice(0, 30) || 'Custom Title';
    saveAsTemplate(name, 'custom');
  }, [saveAsTemplate, text]);

  // Quick title apply
  const handleQuickApply = useCallback(() => {
    const preset = QUICK_STYLES[quickStyleId];
    if (!preset) return;
    const primaryText = quickPrimary || (activeQuickTemplate?.primaryPlaceholder ?? 'Title');
    const secondaryText = quickSecondary;
    const fullText = secondaryText ? `${primaryText}\n${secondaryText}` : primaryText;

    const clip: TitleClipData = {
      id: uid(),
      text: fullText,
      style: {
        fontFamily: preset.fontFamily,
        fontSize: preset.fontSize,
        fontWeight: preset.fontWeight,
        color: preset.color,
        opacity: 1,
        textAlign: preset.textAlign,
      },
      position: { ...preset.position },
      background: {
        type: 'solid',
        color: preset.bgColor,
        opacity: preset.bgOpacity,
      },
      animation: {
        type: 'slide-up',
        duration: 12,
      },
    };
    addTitleClip(clip);
  }, [quickStyleId, quickPrimary, quickSecondary, activeQuickTemplate, addTitleClip]);

  // Auto-subtitle generate (simulated)
  const handleSubtitleGenerate = useCallback(async () => {
    setSubGenerating(true);
    setSubProgress(0);
    setSubProgressLabel('Analyzing audio...');
    setSubtitleEntries([]);

    // Simulate generation progress
    const steps = [
      { progress: 15, label: 'Extracting audio waveform...' },
      { progress: 35, label: 'Running AI transcription model...' },
      { progress: 60, label: 'Segmenting into cues...' },
      { progress: 80, label: 'Aligning timestamps...' },
      { progress: 95, label: 'Finalizing subtitles...' },
    ];

    for (const step of steps) {
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 300));
      setSubProgress(step.progress);
      setSubProgressLabel(step.label);
    }

    // Generate demo subtitle entries based on playhead
    const baseTime = playheadTime ?? 0;
    const demoEntries = [
      { id: uid('sub'), start: baseTime, end: baseTime + 2.5, text: 'Welcome to today\'s broadcast.' },
      { id: uid('sub'), start: baseTime + 2.8, end: baseTime + 5.2, text: 'We have an exciting program ahead.' },
      { id: uid('sub'), start: baseTime + 5.5, end: baseTime + 8.0, text: 'Let\'s begin with the latest updates.' },
      { id: uid('sub'), start: baseTime + 8.3, end: baseTime + 11.1, text: 'Our correspondents are standing by.' },
      { id: uid('sub'), start: baseTime + 11.4, end: baseTime + 14.0, text: 'Stay tuned for more details.' },
    ];

    setSubProgress(100);
    setSubProgressLabel('Complete');
    setSubtitleEntries(demoEntries);

    await new Promise((r) => setTimeout(r, 500));
    setSubGenerating(false);
  }, [playheadTime]);

  const handleSubtitleTextChange = useCallback((id: string, newText: string) => {
    setSubtitleEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, text: newText } : e)),
    );
  }, []);

  const handleSubtitleDelete = useCallback((id: string) => {
    setSubtitleEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // --- Guard: don't render if hidden ----------------------------------------

  if (!showTitleTool) return null;

  // --- Render ---------------------------------------------------------------

  return (
    <div style={S.panel}>
      {/* -- Header --------------------------------------------------------- */}
      <div style={S.header}>
        <span style={S.headerTitle}>Title Tool</span>
        <div style={S.headerSpacer} />
        <button style={S.closeBtn} onClick={toggleTitleTool} title="Close">
          &#x2715;
        </button>
      </div>

      {/* -- Tab Bar -------------------------------------------------------- */}
      <div style={S.tabBar}>
        {TAB_ITEMS.map((tab) => (
          <button
            key={tab.id}
            style={S.tab(activeTab === tab.id)}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* -- Tab: Editor ---------------------------------------------------- */}
      {activeTab === 'editor' && (
        <>
          <div style={S.body}>
            {/* Template Gallery */}
            <div style={S.section}>
              <div style={S.sectionLabel}>Templates &amp; Presets</div>
              <div style={S.templateGallery}>
                {templates.map((tmpl) => {
                  const key = tmpl.id ?? tmpl.name;
                  return (
                    <div
                      key={key}
                      style={S.templateThumb(activeTemplateId === key)}
                      onClick={() => handleLoadTemplate(tmpl)}
                    >
                      <canvas
                        ref={(el) => {
                          if (el) templateCanvasRefs.current.set(key, el);
                        }}
                        style={S.templateCanvas}
                        width={128}
                        height={72}
                      />
                      <div style={S.templateName}>{tmpl.name}</div>
                    </div>
                  );
                })}
                {templates.length === 0 && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '8px 0' }}>
                    No templates yet
                  </div>
                )}
              </div>
            </div>

            {/* Preview Canvas */}
            <div style={S.section}>
              <div style={S.sectionLabel}>Preview</div>
              <div style={S.previewWrap}>
                <canvas
                  ref={previewRef}
                  style={{
                    ...S.previewCanvas,
                    aspectRatio: `${seqWidth} / ${seqHeight}`,
                  }}
                />
                <button
                  style={{
                    ...S.safeZoneToggle,
                    color: showSafeZones ? 'var(--brand-bright)' : 'var(--text-muted)',
                  }}
                  onClick={() => setShowSafeZones(!showSafeZones)}
                  title={showSafeZones ? 'Hide Safe Zones' : 'Show Safe Zones'}
                >
                  {showSafeZones ? 'SAFE ON' : 'SAFE'}
                </button>
              </div>
            </div>

            {/* Title Type (Static / Roll / Crawl) */}
            <div style={S.section}>
              <div style={S.sectionLabel}>Title Type</div>
              <div style={S.row}>
                <span style={S.label}>Mode</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {TITLE_TYPES.map((t) => (
                    <button
                      key={t.value}
                      style={S.toggleBtn(titleType === t.value)}
                      onClick={() => setTitleType(t.value)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {(titleType === 'roll' || titleType === 'crawl') && (
                <SliderRow
                  label="Speed"
                  value={rollSpeed}
                  min={0.5}
                  max={10}
                  step={0.5}
                  displayValue={`${rollSpeed} px/f`}
                  onChange={setRollSpeed}
                />
              )}

              {titleType === 'crawl' && (
                <div style={S.row}>
                  <span style={S.label}>Direction</span>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {CRAWL_DIRECTIONS.map((d) => (
                      <button
                        key={d.value}
                        style={S.toggleBtn(crawlDirection === d.value)}
                        onClick={() => setCrawlDirection(d.value)}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Text Editor */}
            <div style={S.section}>
              <div style={S.sectionLabel}>Text</div>
              <textarea
                style={S.textArea}
                value={text}
                onChange={handleTextChange}
                placeholder="Enter title text..."
                spellCheck={false}
              />
            </div>

            {/* Style Controls */}
            <div style={S.section}>
              <div style={S.sectionLabel}>Style</div>

              {/* Font Family */}
              <div style={S.row}>
                <span style={S.label}>Font</span>
                <select
                  style={S.select}
                  value={style.fontFamily}
                  onChange={(e) => handleStyleChange('fontFamily', e.target.value)}
                >
                  {FONT_FAMILIES.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              {/* Font Size */}
              <SliderRow
                label="Size"
                value={style.fontSize}
                min={12}
                max={200}
                step={1}
                displayValue={`${style.fontSize}px`}
                onChange={(v) => handleStyleChange('fontSize', v)}
              />

              {/* Font Weight */}
              <div style={S.row}>
                <span style={S.label}>Weight</span>
                <select
                  style={S.select}
                  value={style.fontWeight}
                  onChange={(e) => handleStyleChange('fontWeight', Number(e.target.value))}
                >
                  {FONT_WEIGHTS.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>

              {/* Color */}
              <div style={S.row}>
                <span style={S.label}>Color</span>
                <input
                  type="color"
                  style={S.colorInput}
                  value={style.color}
                  onChange={(e) => handleStyleChange('color', e.target.value)}
                />
                <span style={{ ...S.value, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                  {style.color}
                </span>
              </div>

              {/* Text Align */}
              <div style={S.row}>
                <span style={S.label}>Align</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {ALIGN_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      style={S.toggleBtn(style.textAlign === opt.value)}
                      onClick={() => handleStyleChange('textAlign', opt.value)}
                      title={opt.value}
                    >
                      {opt.value === 'left' ? 'L' : opt.value === 'center' ? 'C' : 'R'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Opacity */}
              <SliderRow
                label="Opacity"
                value={Math.round(style.opacity * 100)}
                min={0}
                max={100}
                step={1}
                displayValue={`${Math.round(style.opacity * 100)}%`}
                onChange={(v) => handleStyleChange('opacity', v / 100)}
              />

              {/* Outline */}
              <Toggle label="Outline" value={outlineEnabled} onChange={setOutlineEnabled} />
              {outlineEnabled && (
                <>
                  <div style={S.row}>
                    <span style={{ ...S.label, minWidth: 62, paddingLeft: 8 }}>Color</span>
                    <input
                      type="color"
                      style={S.colorInput}
                      value={style.outlineColor ?? '#000000'}
                      onChange={(e) => handleStyleChange('outlineColor', e.target.value)}
                    />
                  </div>
                  <SliderRow
                    label="  Width"
                    value={style.outlineWidth ?? 2}
                    min={1}
                    max={20}
                    step={1}
                    displayValue={`${style.outlineWidth ?? 2}px`}
                    onChange={(v) => handleStyleChange('outlineWidth', v)}
                  />
                </>
              )}

              {/* Shadow */}
              <Toggle label="Shadow" value={shadowEnabled} onChange={setShadowEnabled} />
              {shadowEnabled && (
                <>
                  <div style={S.row}>
                    <span style={{ ...S.label, minWidth: 62, paddingLeft: 8 }}>Color</span>
                    <input
                      type="color"
                      style={S.colorInput}
                      value={style.shadowColor ?? '#000000'}
                      onChange={(e) => handleStyleChange('shadowColor', e.target.value)}
                    />
                  </div>
                  <SliderRow
                    label="  Blur"
                    value={style.shadowBlur ?? 8}
                    min={0}
                    max={50}
                    step={1}
                    displayValue={`${style.shadowBlur ?? 8}px`}
                    onChange={(v) => handleStyleChange('shadowBlur', v)}
                  />
                </>
              )}
            </div>

            {/* Position Controls */}
            <div style={S.section}>
              <div style={S.sectionLabel}>Position</div>

              <SliderRow
                label="X"
                value={position.x}
                min={0}
                max={1}
                step={0.01}
                displayValue={`${Math.round(position.x * 100)}%`}
                onChange={(v) => handlePositionChange('x', v)}
              />
              <SliderRow
                label="Y"
                value={position.y}
                min={0}
                max={1}
                step={0.01}
                displayValue={`${Math.round(position.y * 100)}%`}
                onChange={(v) => handlePositionChange('y', v)}
              />
              <SliderRow
                label="Width"
                value={position.width}
                min={0.05}
                max={1}
                step={0.01}
                displayValue={`${Math.round(position.width * 100)}%`}
                onChange={(v) => handlePositionChange('width', v)}
              />
              <SliderRow
                label="Height"
                value={position.height}
                min={0.05}
                max={1}
                step={0.01}
                displayValue={`${Math.round(position.height * 100)}%`}
                onChange={(v) => handlePositionChange('height', v)}
              />

              {/* 9-point alignment grid */}
              <div style={{ ...S.row, marginTop: 4 }}>
                <span style={S.label}>Snap</span>
                <div style={S.alignGrid}>
                  {GRID_POSITIONS.map((pos, i) => {
                    const isActive =
                      Math.abs(position.x - pos.x) < 0.02 &&
                      Math.abs(position.y - pos.y) < 0.02;
                    return (
                      <button
                        key={i}
                        style={S.alignDot(isActive)}
                        onClick={() => handleGridClick(pos)}
                        title={`${Math.round(pos.x * 100)}%, ${Math.round(pos.y * 100)}%`}
                      >
                        <div style={S.alignDotInner(isActive)} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Background Controls */}
            <div style={S.section}>
              <div style={S.sectionLabel}>Background</div>

              <div style={S.row}>
                <span style={S.label}>Type</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {(['none', 'solid', 'gradient'] as const).map((t) => (
                    <button
                      key={t}
                      style={S.toggleBtn(bgType === t)}
                      onClick={() => setBgType(t)}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {bgType !== 'none' && (
                <>
                  <div style={S.row}>
                    <span style={S.label}>Color</span>
                    <input
                      type="color"
                      style={S.colorInput}
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                    />
                  </div>
                  {bgType === 'gradient' && (
                    <div style={S.row}>
                      <span style={S.label}>End Color</span>
                      <input
                        type="color"
                        style={S.colorInput}
                        value={bgGradientEnd}
                        onChange={(e) => setBgGradientEnd(e.target.value)}
                      />
                    </div>
                  )}
                  <SliderRow
                    label="Opacity"
                    value={bgOpacity}
                    min={0}
                    max={100}
                    step={1}
                    displayValue={`${bgOpacity}%`}
                    onChange={setBgOpacity}
                  />
                </>
              )}
            </div>

            {/* Animation Controls */}
            <div style={S.section}>
              <div style={S.sectionLabel}>Animation</div>

              <div style={S.row}>
                <span style={S.label}>Type</span>
                <select
                  style={S.select}
                  value={animationType}
                  onChange={(e) =>
                    setAnimationType(
                      e.target.value as typeof animationType,
                    )
                  }
                >
                  {ANIMATION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t === 'none'
                        ? 'None'
                        : t
                            .split('-')
                            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                            .join(' ')}
                    </option>
                  ))}
                </select>
              </div>

              {animationType !== 'none' && (
                <SliderRow
                  label="Duration"
                  value={animDuration}
                  min={1}
                  max={120}
                  step={1}
                  displayValue={`${animDuration}f`}
                  onChange={setAnimDuration}
                />
              )}
            </div>
          </div>

          {/* -- Footer actions (Editor tab) -------------------------------- */}
          <div style={S.footer}>
            <button style={S.btnPrimary} onClick={handleApply}>
              Apply to Timeline
            </button>
            <button style={S.btnSecondary} onClick={handleSaveTemplate}>
              Save as Template
            </button>
          </div>
        </>
      )}

      {/* -- Tab: Quick Title ----------------------------------------------- */}
      {activeTab === 'quick' && (
        <>
          <div style={S.body}>
            <div style={S.section}>
              <div style={S.sectionLabel}>Quick Title Style</div>
              {QUICK_TITLE_TEMPLATES.map((qt) => (
                <div
                  key={qt.id}
                  style={S.quickCard(quickStyleId === qt.style)}
                  onClick={() => setQuickStyleId(qt.style)}
                >
                  <div style={S.quickCardName}>{qt.name}</div>
                  <div style={S.quickCardDesc}>{qt.style.replace('-', ' ')}</div>
                </div>
              ))}
            </div>

            <div style={S.section}>
              <div style={S.sectionLabel}>Text</div>
              <input
                type="text"
                style={S.quickInput}
                value={quickPrimary}
                onChange={(e) => setQuickPrimary(e.target.value)}
                placeholder={activeQuickTemplate?.primaryPlaceholder ?? 'Primary text'}
              />
              {activeQuickTemplate?.secondaryPlaceholder && (
                <input
                  type="text"
                  style={S.quickInput}
                  value={quickSecondary}
                  onChange={(e) => setQuickSecondary(e.target.value)}
                  placeholder={activeQuickTemplate.secondaryPlaceholder}
                />
              )}
            </div>
          </div>

          <div style={S.footer}>
            <button style={S.btnPrimary} onClick={handleQuickApply}>
              Apply Quick Title
            </button>
          </div>
        </>
      )}

      {/* -- Tab: Auto-Subtitle -------------------------------------------- */}
      {activeTab === 'subtitles' && (
        <>
          <div style={S.body}>
            {/* Generation settings */}
            <div style={S.subtitleGenSection}>
              <div style={S.sectionLabel}>Auto-Subtitle Generation</div>

              <div style={S.subtitleSettingsRow}>
                <span style={S.subtitleLabel}>Language</span>
                <select
                  style={{ ...S.select, flex: 1 }}
                  value={subLanguage}
                  onChange={(e) => setSubLanguage(e.target.value)}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>

              <div style={S.subtitleSettingsRow}>
                <span style={S.subtitleLabel}>Max chars/line</span>
                <input
                  type="number"
                  style={{
                    ...S.select,
                    width: 56,
                    flex: 'unset',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                  }}
                  value={subMaxChars}
                  min={20}
                  max={80}
                  onChange={(e) => setSubMaxChars(Number(e.target.value))}
                />
              </div>

              <div style={S.subtitleSettingsRow}>
                <span style={S.subtitleLabel}>Position</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {(['top', 'center', 'bottom'] as const).map((p) => (
                    <button
                      key={p}
                      style={S.toggleBtn(subPosition === p)}
                      onClick={() => setSubPosition(p)}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <button
                style={{
                  ...S.btnPrimary,
                  width: '100%',
                  justifyContent: 'center',
                  marginTop: 4,
                  ...(subGenerating ? S.btnDisabled : {}),
                }}
                onClick={handleSubtitleGenerate}
                disabled={subGenerating}
              >
                {subGenerating ? 'Generating...' : 'Generate Subtitles from Audio'}
              </button>

              {/* Progress indicator */}
              {subGenerating && (
                <>
                  <div style={S.progressBar}>
                    <div style={{ ...S.progressFill, width: `${subProgress}%` }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {subProgressLabel}
                  </div>
                </>
              )}

              <div style={S.aiLabel}>AI-powered transcription</div>
            </div>

            {/* Subtitle track list */}
            {subtitleEntries.length > 0 && (
              <div style={S.section}>
                <div style={S.sectionLabel}>
                  Subtitle Cues ({subtitleEntries.length})
                </div>
                <div style={S.subtitleList}>
                  {subtitleEntries.map((entry) => {
                    const isEditing = subEditingId === entry.id;
                    const isHovered = subHoveredId === entry.id;
                    return (
                      <div
                        key={entry.id}
                        style={S.subtitleRow(isHovered)}
                        onMouseEnter={() => setSubHoveredId(entry.id)}
                        onMouseLeave={() => setSubHoveredId(null)}
                      >
                        <div style={S.subtitleTC}>
                          {tc.secondsToTC(entry.start)}
                          {' '}
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                          {' '}
                          {tc.secondsToTC(entry.end)}
                        </div>
                        {isEditing ? (
                          <input
                            style={S.subtitleEditInput}
                            value={entry.text}
                            onChange={(e) => handleSubtitleTextChange(entry.id, e.target.value)}
                            onBlur={() => setSubEditingId(null)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'Escape') {
                                setSubEditingId(null);
                              }
                            }}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span
                            style={S.subtitleText}
                            onDoubleClick={() => setSubEditingId(entry.id)}
                            title="Double-click to edit"
                          >
                            {entry.text}
                          </span>
                        )}
                        {isHovered && (
                          <button
                            style={S.subtitleDeleteBtn}
                            onClick={() => handleSubtitleDelete(entry.id)}
                            title="Delete cue"
                          >
                            &#x2715;
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty state */}
            {subtitleEntries.length === 0 && !subGenerating && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: 32,
                color: 'var(--text-muted)',
                textAlign: 'center',
                fontSize: 11,
              }}>
                <div style={{ fontSize: 24, opacity: 0.4 }}>CC</div>
                <div>No subtitle cues yet.</div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                  Click Generate to create subtitles from timeline audio.
                </div>
              </div>
            )}
          </div>

          {/* Footer for subtitle tab */}
          {subtitleEntries.length > 0 && (
            <div style={S.footer}>
              <button
                style={S.btnPrimary}
                onClick={() => {
                  // Add subtitle entries to timeline (same pattern as SubtitleEditor)
                  subtitleEntries.forEach((entry) => {
                    const clip: TitleClipData = {
                      id: uid('sub-ttl'),
                      text: entry.text,
                      style: {
                        fontFamily: 'system-ui',
                        fontSize: 24,
                        fontWeight: 400,
                        color: '#ffffff',
                        opacity: 1,
                        textAlign: 'center',
                      },
                      position: {
                        x: 0.1,
                        y: subPosition === 'top' ? 0.05 : subPosition === 'center' ? 0.45 : 0.85,
                        width: 0.8,
                        height: 0.08,
                      },
                      background: { type: 'solid', color: '#000000', opacity: 0.6 },
                    };
                    addTitleClip(clip);
                  });
                }}
              >
                Add All to Timeline
              </button>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {subtitleEntries.length} cues
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
