// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Effects, Titles & Compositing Panel
// ═══════════════════════════════════════════════════════════════════════════

import React, { useMemo, useCallback, useRef, useState } from 'react';
import { useEffectsStore } from '../../store/effects.store';
import { useEditorStore } from '../../store/editor.store';
import { effectsEngine, EffectDefinition, EffectInstance, EffectParamDef } from '../../engine/EffectsEngine';

// ─── Styles ────────────────────────────────────────────────────────────────

const S = {
  root: {
    display: 'flex',
    height: '100%',
    background: 'var(--bg-surface)',
    overflow: 'hidden',
    minHeight: 0,
  },
  browser: {
    width: 200,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    borderRight: '1px solid var(--border-default)',
    overflow: 'hidden',
    minHeight: 0,
  },
  browserHeader: {
    padding: '8px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  searchInput: {
    width: '100%',
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontSize: '11px',
    padding: '5px 8px',
    outline: 'none',
  },
  filterPills: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '3px',
    padding: '6px 8px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  pill: (active: boolean) => ({
    padding: '2px 7px',
    borderRadius: '10px',
    fontSize: '9px',
    fontWeight: 600,
    letterSpacing: '0.03em',
    border: 'none',
    cursor: 'pointer',
    background: active ? 'var(--brand-dim)' : 'var(--bg-elevated)',
    color: active ? 'var(--brand-bright)' : 'var(--text-tertiary)',
    transition: 'all 100ms',
  }),
  effectList: {
    flex: 1,
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
  },
  effectItem: (isSelected: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 8px',
    cursor: 'pointer',
    background: isSelected ? 'var(--brand-dim)' : 'transparent',
    borderLeft: isSelected ? '2px solid var(--brand)' : '2px solid transparent',
    transition: 'background 75ms',
  }),
  effectName: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  catBadge: (cat: string) => {
    const colors: Record<string, string> = {
      Blur: '#3b82f6',
      Color: '#f59e0b',
      Composite: '#22c55e',
      Stylize: '#a855f7',
      Transform: '#ef4444',
    };
    const c = colors[cat] || 'var(--text-muted)';
    return {
      fontSize: '7.5px',
      fontWeight: 700,
      letterSpacing: '0.05em',
      textTransform: 'uppercase' as const,
      padding: '1px 4px',
      borderRadius: '3px',
      background: `${c}22`,
      color: c,
      flexShrink: 0,
    };
  },
  starBtn: (isFav: boolean) => ({
    fontSize: '10px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: isFav ? '#fbbf24' : 'var(--text-muted)',
    flexShrink: 0,
    padding: 0,
    lineHeight: 1,
    transition: 'color 100ms',
  }),
  // Right panel
  controls: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    minHeight: 0,
    minWidth: 0,
  },
  controlsHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '0 12px',
    height: '32px',
    background: 'var(--bg-raised)',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  },
  controlsTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '9.5px',
    fontWeight: 700,
    letterSpacing: '1.2px',
    textTransform: 'uppercase' as const,
    color: 'var(--text-tertiary)',
  },
  appliedList: {
    borderBottom: '1px solid var(--border-default)',
    maxHeight: 180,
    overflowY: 'auto' as const,
    flexShrink: 0,
  },
  appliedItem: (isSelected: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 10px',
    cursor: 'pointer',
    background: isSelected ? 'var(--brand-dim)' : 'transparent',
    borderBottom: '1px solid var(--border-subtle)',
    transition: 'background 75ms',
  }),
  dragHandle: {
    fontSize: '9px',
    color: 'var(--text-muted)',
    cursor: 'grab',
    userSelect: 'none' as const,
  },
  toggleSwitch: (enabled: boolean) => ({
    width: 22,
    height: 12,
    borderRadius: 6,
    background: enabled ? 'var(--brand)' : 'var(--bg-overlay)',
    border: `1px solid ${enabled ? 'var(--brand)' : 'var(--border-default)'}`,
    cursor: 'pointer',
    position: 'relative' as const,
    flexShrink: 0,
    transition: 'all 150ms',
  }),
  toggleDot: (enabled: boolean) => ({
    position: 'absolute' as const,
    top: 1,
    left: enabled ? 11 : 1,
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: enabled ? '#fff' : 'var(--text-muted)',
    transition: 'all 150ms',
  }),
  appliedName: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  deleteBtn: {
    fontSize: '10px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    padding: '0 2px',
    transition: 'color 100ms',
  },
  paramSection: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '10px 12px',
  },
  paramRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '6px',
  },
  paramLabel: {
    fontSize: '10px',
    color: 'var(--text-tertiary)',
    minWidth: 65,
    flexShrink: 0,
  },
  paramValue: {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    color: 'var(--text-secondary)',
    minWidth: 40,
    textAlign: 'right' as const,
    flexShrink: 0,
  },
  paramSlider: {
    flex: 1,
    height: 3,
    cursor: 'pointer',
  },
  paramInput: {
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-xs)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    padding: '2px 5px',
    outline: 'none',
    width: 50,
    textAlign: 'right' as const,
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
  keyframeDiamond: (active: boolean) => ({
    width: 14,
    height: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: active ? 'var(--warning)' : 'var(--text-muted)',
    flexShrink: 0,
    padding: 0,
    transition: 'color 100ms',
  }),
  // Keyframe bar
  kfBar: {
    height: 32,
    background: 'var(--bg-raised)',
    borderTop: '1px solid var(--border-default)',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '0 8px',
    flexShrink: 0,
  },
  kfTimeline: {
    flex: 1,
    height: 14,
    background: 'var(--bg-void)',
    borderRadius: 'var(--radius-xs)',
    border: '1px solid var(--border-default)',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  kfDiamond: (position: number) => ({
    position: 'absolute' as const,
    top: '50%',
    left: `${position}%`,
    transform: 'translate(-50%, -50%) rotate(45deg)',
    width: 6,
    height: 6,
    background: 'var(--warning)',
    borderRadius: 1,
  }),
  kfNavBtn: {
    width: 18,
    height: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'var(--bg-elevated)',
    color: 'var(--text-secondary)',
    borderRadius: 'var(--radius-xs)',
    fontSize: '8px',
    cursor: 'pointer',
  },
  emptyMessage: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-muted)',
    fontSize: '11px',
    fontStyle: 'italic' as const,
    padding: 20,
    textAlign: 'center' as const,
  },
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '9.5px',
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    color: 'var(--text-tertiary)',
    marginBottom: '8px',
  },
} as const;

// ─── Effect Browser ────────────────────────────────────────────────────────

function EffectBrowser() {
  const {
    searchQuery,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    favorites,
    toggleFavorite,
    selectedClipId,
    addEffect,
  } = useEffectsStore();

  const definitions = useMemo(() => effectsEngine.getDefinitions(), []);
  const categories = useMemo(() => effectsEngine.getCategories(), []);

  const filtered = useMemo(() => {
    let list = definitions;
    if (categoryFilter) {
      list = list.filter((d) => d.category === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q)
      );
    }
    return list;
  }, [definitions, categoryFilter, searchQuery]);

  const handleDoubleClick = useCallback(
    (defId: string) => {
      if (selectedClipId) {
        addEffect(selectedClipId, defId);
      }
    },
    [selectedClipId, addEffect]
  );

  return (
    <div style={S.browser}>
      <div style={S.browserHeader}>
        <input
          type="text"
          placeholder="Search effects..."
          value={searchQuery}
          onChange={(e) => setSearch(e.target.value)}
          style={S.searchInput}
        />
      </div>
      <div style={S.filterPills}>
        <button
          style={S.pill(categoryFilter === null)}
          onClick={() => setCategoryFilter(null)}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            style={S.pill(categoryFilter === cat)}
            onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
          >
            {cat}
          </button>
        ))}
      </div>
      <div style={S.effectList}>
        {filtered.map((def) => (
          <div
            key={def.id}
            style={S.effectItem(false)}
            onDoubleClick={() => handleDoubleClick(def.id)}
            title={selectedClipId ? 'Double-click to apply' : 'Select a clip first'}
          >
            <span style={S.effectName}>{def.name}</span>
            <span style={S.catBadge(def.category)}>{def.category}</span>
            <button
              style={S.starBtn(favorites.includes(def.id))}
              onClick={(e) => { e.stopPropagation(); toggleFavorite(def.id); }}
              title={favorites.includes(def.id) ? 'Remove from favorites' : 'Add to favorites'}
            >
              {favorites.includes(def.id) ? '\u2605' : '\u2606'}
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: '12px 8px', fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center' }}>
            No effects found
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Applied Effects List ──────────────────────────────────────────────────

function AppliedEffectsList() {
  const {
    clipEffects,
    selectedClipId,
    selectedEffectId,
    selectEffect,
    toggleEffect,
    removeEffect,
    reorderEffects,
  } = useEffectsStore();

  const effects = selectedClipId ? (clipEffects[selectedClipId] || []) : [];

  const dragIdx = useRef<number | null>(null);

  const handleDragStart = useCallback((idx: number) => {
    dragIdx.current = idx;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;

    if (selectedClipId) {
      const newOrder = effects.map((e) => e.id);
      const [moved] = newOrder.splice(dragIdx.current, 1);
      newOrder.splice(idx, 0, moved);
      reorderEffects(selectedClipId, newOrder);
      dragIdx.current = idx;
    }
  }, [effects, selectedClipId, reorderEffects]);

  if (effects.length === 0) {
    return (
      <div style={{ ...S.appliedList, padding: '10px', textAlign: 'center' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          {selectedClipId ? 'No effects applied' : ''}
        </div>
      </div>
    );
  }

  return (
    <div style={S.appliedList}>
      {effects.map((fx, idx) => {
        const def = effectsEngine.getDefinition(fx.definitionId);
        return (
          <div
            key={fx.id}
            style={S.appliedItem(selectedEffectId === fx.id)}
            onClick={() => selectEffect(fx.id)}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
          >
            <span style={S.dragHandle} title="Drag to reorder">{'\u2630'}</span>
            <div
              style={S.toggleSwitch(fx.enabled)}
              onClick={(e) => {
                e.stopPropagation();
                if (selectedClipId) toggleEffect(selectedClipId, fx.id);
              }}
            >
              <div style={S.toggleDot(fx.enabled)} />
            </div>
            <span style={S.appliedName}>{def?.name || fx.definitionId}</span>
            <button
              style={S.deleteBtn}
              onClick={(e) => {
                e.stopPropagation();
                if (selectedClipId) removeEffect(selectedClipId, fx.id);
              }}
              title="Remove effect"
            >
              {'\u2715'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Parameter Controls ────────────────────────────────────────────────────

function NumberParam({
  paramDef,
  value,
  onChange,
  hasKeyframe,
  onToggleKeyframe,
}: {
  paramDef: EffectParamDef;
  value: number;
  onChange: (v: number) => void;
  hasKeyframe: boolean;
  onToggleKeyframe: () => void;
}) {
  return (
    <div style={S.paramRow}>
      <span style={S.paramLabel}>{paramDef.name}</span>
      <input
        type="range"
        className="range-slider"
        min={paramDef.min ?? 0}
        max={paramDef.max ?? 100}
        step={paramDef.step ?? 1}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        style={S.paramSlider}
      />
      <span style={S.paramValue}>
        {typeof value === 'number' ? value.toFixed(paramDef.step && paramDef.step < 1 ? 1 : 0) : value}
        {paramDef.unit ? paramDef.unit : ''}
      </span>
      <button
        style={S.keyframeDiamond(hasKeyframe)}
        onClick={onToggleKeyframe}
        title={hasKeyframe ? 'Remove keyframe' : 'Add keyframe'}
      >
        {hasKeyframe ? '\u25C6' : '\u25C7'}
      </button>
    </div>
  );
}

function ColorParam({
  paramDef,
  value,
  onChange,
  hasKeyframe,
  onToggleKeyframe,
}: {
  paramDef: EffectParamDef;
  value: string;
  onChange: (v: string) => void;
  hasKeyframe: boolean;
  onToggleKeyframe: () => void;
}) {
  return (
    <div style={S.paramRow}>
      <span style={S.paramLabel}>{paramDef.name}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={S.colorInput}
      />
      <span style={S.paramValue}>{value}</span>
      <button
        style={S.keyframeDiamond(hasKeyframe)}
        onClick={onToggleKeyframe}
        title={hasKeyframe ? 'Remove keyframe' : 'Add keyframe'}
      >
        {hasKeyframe ? '\u25C6' : '\u25C7'}
      </button>
    </div>
  );
}

function BooleanParam({
  paramDef,
  value,
  onChange,
  hasKeyframe,
  onToggleKeyframe,
}: {
  paramDef: EffectParamDef;
  value: boolean;
  onChange: (v: boolean) => void;
  hasKeyframe: boolean;
  onToggleKeyframe: () => void;
}) {
  return (
    <div style={S.paramRow}>
      <span style={S.paramLabel}>{paramDef.name}</span>
      <div
        style={S.toggleSwitch(value)}
        onClick={() => onChange(!value)}
      >
        <div style={S.toggleDot(value)} />
      </div>
      <span style={{ ...S.paramValue, flex: 1 }}>{value ? 'On' : 'Off'}</span>
      <button
        style={S.keyframeDiamond(hasKeyframe)}
        onClick={onToggleKeyframe}
        title={hasKeyframe ? 'Remove keyframe' : 'Add keyframe'}
      >
        {hasKeyframe ? '\u25C6' : '\u25C7'}
      </button>
    </div>
  );
}

function SelectParam({
  paramDef,
  value,
  onChange,
  hasKeyframe,
  onToggleKeyframe,
}: {
  paramDef: EffectParamDef;
  value: string;
  onChange: (v: string) => void;
  hasKeyframe: boolean;
  onToggleKeyframe: () => void;
}) {
  return (
    <div style={S.paramRow}>
      <span style={S.paramLabel}>{paramDef.name}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          background: 'var(--bg-void)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-xs)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          padding: '2px 4px',
          outline: 'none',
        }}
      >
        {(paramDef.options || []).map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <button
        style={S.keyframeDiamond(hasKeyframe)}
        onClick={onToggleKeyframe}
        title={hasKeyframe ? 'Remove keyframe' : 'Add keyframe'}
      >
        {hasKeyframe ? '\u25C6' : '\u25C7'}
      </button>
    </div>
  );
}

function ParameterControls() {
  const {
    clipEffects,
    selectedClipId,
    selectedEffectId,
    updateParam,
    addKeyframe,
    removeKeyframe,
    currentFrame,
  } = useEffectsStore();

  if (!selectedClipId || !selectedEffectId) {
    return null;
  }

  const effects = clipEffects[selectedClipId] || [];
  const effect = effects.find((e) => e.id === selectedEffectId);
  if (!effect) return null;

  const def = effectsEngine.getDefinition(effect.definitionId);
  if (!def) return null;

  const handleToggleKeyframe = (paramName: string, currentValue: number | string | boolean) => {
    if (!selectedClipId || !selectedEffectId) return;
    const hasKf = effect.keyframes.some(
      (kf) => kf.frame === currentFrame && kf.paramName === paramName
    );
    if (hasKf) {
      removeKeyframe(selectedClipId, selectedEffectId, currentFrame, paramName);
    } else {
      addKeyframe(selectedClipId, selectedEffectId, {
        frame: currentFrame,
        paramName,
        value: currentValue,
        interpolation: 'linear',
      });
    }
  };

  return (
    <div style={S.paramSection}>
      <div style={S.sectionTitle}>{def.name} Parameters</div>
      {def.params.map((paramDef) => {
        const value = effect.params[paramDef.name] ?? paramDef.default;
        const hasKf = effect.keyframes.some(
          (kf) => kf.frame === currentFrame && kf.paramName === paramDef.name
        );

        const onUpdate = (v: number | string | boolean) => {
          if (selectedClipId && selectedEffectId) {
            updateParam(selectedClipId, selectedEffectId, paramDef.name, v);
          }
        };

        const onToggleKf = () => handleToggleKeyframe(paramDef.name, value);

        switch (paramDef.type) {
          case 'number':
            return (
              <NumberParam
                key={paramDef.name}
                paramDef={paramDef}
                value={value as number}
                onChange={onUpdate}
                hasKeyframe={hasKf}
                onToggleKeyframe={onToggleKf}
              />
            );
          case 'color':
            return (
              <ColorParam
                key={paramDef.name}
                paramDef={paramDef}
                value={value as string}
                onChange={onUpdate}
                hasKeyframe={hasKf}
                onToggleKeyframe={onToggleKf}
              />
            );
          case 'boolean':
            return (
              <BooleanParam
                key={paramDef.name}
                paramDef={paramDef}
                value={value as boolean}
                onChange={onUpdate}
                hasKeyframe={hasKf}
                onToggleKeyframe={onToggleKf}
              />
            );
          case 'select':
            return (
              <SelectParam
                key={paramDef.name}
                paramDef={paramDef}
                value={value as string}
                onChange={onUpdate}
                hasKeyframe={hasKf}
                onToggleKeyframe={onToggleKf}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

// ─── Keyframe Bar ──────────────────────────────────────────────────────────

function KeyframeBar() {
  const {
    clipEffects,
    selectedClipId,
    selectedEffectId,
    showKeyframes,
    currentFrame,
    setCurrentFrame,
  } = useEffectsStore();

  if (!showKeyframes || !selectedClipId || !selectedEffectId) return null;

  const effects = clipEffects[selectedClipId] || [];
  const effect = effects.find((e) => e.id === selectedEffectId);
  if (!effect || effect.keyframes.length === 0) return null;

  const keyframes = effect.keyframes;
  const maxFrame = Math.max(...keyframes.map((kf) => kf.frame), 100);

  // Navigate between keyframes
  const sortedFrames = [...new Set(keyframes.map((kf) => kf.frame))].sort((a, b) => a - b);

  const goPrev = () => {
    const prev = sortedFrames.filter((f) => f < currentFrame);
    if (prev.length > 0) setCurrentFrame(prev[prev.length - 1]);
  };

  const goNext = () => {
    const next = sortedFrames.filter((f) => f > currentFrame);
    if (next.length > 0) setCurrentFrame(next[0]);
  };

  return (
    <div style={S.kfBar}>
      <button style={S.kfNavBtn} onClick={goPrev} title="Previous keyframe">
        {'\u25C0'}
      </button>
      <div style={S.kfTimeline}>
        {keyframes.map((kf, i) => (
          <div
            key={`${kf.frame}-${kf.paramName}-${i}`}
            style={S.kfDiamond((kf.frame / maxFrame) * 100)}
            title={`Frame ${kf.frame}: ${kf.paramName}`}
          />
        ))}
        {/* Current frame indicator */}
        <div style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${(currentFrame / maxFrame) * 100}%`,
          width: 1,
          background: 'var(--playhead)',
          pointerEvents: 'none',
        }} />
      </div>
      <button style={S.kfNavBtn} onClick={goNext} title="Next keyframe">
        {'\u25B6'}
      </button>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '9px',
        color: 'var(--text-tertiary)',
        minWidth: 30,
        textAlign: 'right',
      }}>
        F{currentFrame}
      </span>
    </div>
  );
}

// ─── Main EffectsPanel Component ───────────────────────────────────────────

export function EffectsPanel() {
  const { selectedClipId, selectClip, showKeyframes, setShowKeyframes } = useEffectsStore();
  const { selectedClipIds, tracks } = useEditorStore();

  // Sync selected clip from editor store
  const editorSelectedClipId = selectedClipIds.length > 0 ? selectedClipIds[0] : null;

  // Keep effects store in sync with editor selection
  React.useEffect(() => {
    if (editorSelectedClipId !== selectedClipId) {
      selectClip(editorSelectedClipId);
    }
  }, [editorSelectedClipId, selectedClipId, selectClip]);

  // Get clip info
  const clip = editorSelectedClipId
    ? tracks.flatMap((t) => t.clips).find((c) => c.id === editorSelectedClipId)
    : null;

  if (!clip) {
    return (
      <div style={S.root}>
        <EffectBrowser />
        <div style={S.controls}>
          <div style={S.controlsHeader}>
            <span style={S.controlsTitle}>Effects</span>
          </div>
          <div style={S.emptyMessage}>
            Select a clip to edit effects
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.root}>
      <EffectBrowser />
      <div style={S.controls}>
        <div style={S.controlsHeader}>
          <span style={S.controlsTitle}>Effects</span>
          <span style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {clip.name}
          </span>
          <button
            style={{
              ...S.kfNavBtn,
              background: showKeyframes ? 'var(--brand-dim)' : 'var(--bg-elevated)',
              color: showKeyframes ? 'var(--brand-bright)' : 'var(--text-secondary)',
              fontSize: '9px',
              width: 22,
              height: 18,
            }}
            onClick={() => setShowKeyframes(!showKeyframes)}
            title="Toggle keyframe bar"
          >
            {'\u25C6'}
          </button>
        </div>

        <AppliedEffectsList />
        <ParameterControls />
        <KeyframeBar />
      </div>
    </div>
  );
}
