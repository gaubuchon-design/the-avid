// =============================================================================
//  THE AVID — WYSIWYG Title Editor Panel
// =============================================================================
//
//  A dockable panel for authoring, previewing, and applying title overlays.
//  Templates, live canvas preview, text/style/position/animation controls.
// =============================================================================

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react';
import { useTitleStore } from '../../store/title.store';
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
  'Georgia',
  'Arial',
  'Courier New',
  'Impact',
  'Trebuchet MS',
];

const FONT_WEIGHTS = [300, 400, 600, 700, 900];

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
//  TitleTool Component
// =============================================================================

interface TitleToolProps {
  embedded?: boolean;
}

export function TitleTool({ embedded = false }: TitleToolProps) {
  // --- Stores ---------------------------------------------------------------

  const {
    currentTitle,
    templates,
    isEditing,
    setCurrentTitle,
    updateCurrentTitle,
    updateCurrentStyle,
    updateCurrentPosition,
    loadTemplate,
    saveAsTemplate,
    setEditing,
  } = useTitleStore();

  const {
    showTitleTool,
    toggleTitleTool,
    addTitleClip,
    sequenceSettings,
    playheadTime,
  } = useEditorStore();

  // --- Local state ----------------------------------------------------------

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
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      renderTitle(ctx, titleData, canvas.width, canvas.height, 0, fps);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [titleData, seqWidth, seqHeight, aspectRatio]);

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
      ctx.fillStyle = '#1a1a2e';
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

  // --- Guard: don't render if hidden ----------------------------------------

  if (!embedded && !showTitleTool) return null;

  // --- Render ---------------------------------------------------------------

  return (
    <div style={S.panel}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={S.header}>
        <span style={S.headerTitle}>Title Tool</span>
        <div style={S.headerSpacer} />
        {!embedded ? (
          <button style={S.closeBtn} onClick={toggleTitleTool} title="Close">
            &#x2715;
          </button>
        ) : null}
      </div>

      {/* ── Scrollable body ─────────────────────────────────────── */}
      <div style={S.body}>
        {/* Template Gallery */}
        <div style={S.section}>
          <div style={S.sectionLabel}>Templates</div>
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
          </div>
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

      {/* ── Footer actions ──────────────────────────────────────── */}
      <div style={S.footer}>
        <button style={S.btnPrimary} onClick={handleApply}>
          Apply to Timeline
        </button>
        <button style={S.btnSecondary} onClick={handleSaveTemplate}>
          Save as Template
        </button>
      </div>
    </div>
  );
}
