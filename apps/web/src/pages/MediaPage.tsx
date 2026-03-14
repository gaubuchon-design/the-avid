// =============================================================================
//  THE AVID -- Media Page (DaVinci Resolve / Avid Media Composer Parity)
//  Full-width bin browser with metadata columns, source preview, inspector,
//  smart bins, drag-and-drop, color labels, waveforms, batch ops, proxy status,
//  filmstrip view, and editable metadata inspector.
// =============================================================================

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  useEditorStore,
  type MediaAsset,
  type Bin,
  type SmartBin,
  type SmartBinRule,
  type SmartBinRuleField,
  type SmartBinOperator,
} from '../store/editor.store';
import { usePlayerStore } from '../store/player.store';
import { useDebounce } from '../hooks/useDebounce';
import { Timecode } from '../lib/timecode';

// ─── Constants ──────────────────────────────────────────────────────────────

const COLOR_LABELS: { id: string; name: string; color: string }[] = [
  { id: 'none', name: 'None', color: 'transparent' },
  { id: 'red', name: 'Red', color: '#ef4444' },
  { id: 'orange', name: 'Orange', color: '#f97316' },
  { id: 'yellow', name: 'Yellow', color: '#eab308' },
  { id: 'green', name: 'Green', color: '#22c55e' },
  { id: 'blue', name: 'Blue', color: '#3b82f6' },
  { id: 'purple', name: 'Purple', color: '#a855f7' },
  { id: 'pink', name: 'Pink', color: '#ec4899' },
  { id: 'cyan', name: 'Cyan', color: '#06b6d4' },
];

const PROXY_STATUSES = ['Original', 'Proxy', 'Offline'] as const;
type ProxyStatus = (typeof PROXY_STATUSES)[number];

type ViewMode = 'list' | 'thumbnail' | 'filmstrip';
type SortKey = 'name' | 'duration' | 'fps' | 'width' | 'codec' | 'fileSize' | 'type';

const SMART_BIN_FIELDS: { value: SmartBinRuleField; label: string }[] = [
  { value: 'type', label: 'Type' },
  { value: 'name', label: 'Name' },
  { value: 'tag', label: 'Tag' },
  { value: 'duration', label: 'Duration' },
  { value: 'favorite', label: 'Favorite' },
  { value: 'status', label: 'Status' },
];

const SMART_BIN_OPERATORS: { value: SmartBinOperator; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'contains', label: 'contains' },
  { value: 'greaterThan', label: '>' },
  { value: 'lessThan', label: '<' },
  { value: 'is', label: 'is' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

const tc24 = new Timecode({ fps: 24 });

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '--:--:--:--';
  return tc24.secondsToTC(sec);
}

function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes) || bytes <= 0) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function collectAllMediaAssets(bins: Bin[]): MediaAsset[] {
  const result: MediaAsset[] = [];
  const walk = (b: Bin) => {
    result.push(...b.assets);
    b.children.forEach(walk);
  };
  bins.forEach(walk);
  return result;
}

/** Deterministic pseudo-random waveform for an asset based on its id. */
function generateWaveformData(assetId: string, sampleCount: number = 64): number[] {
  let hash = 0;
  for (let i = 0; i < assetId.length; i++) {
    hash = ((hash << 5) - hash + assetId.charCodeAt(i)) | 0;
  }
  const data: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    hash = ((hash * 1103515245 + 12345) & 0x7fffffff);
    data.push(0.15 + (hash % 1000) / 1000 * 0.85);
  }
  return data;
}

/** Simulated proxy status based on asset properties. */
function getProxyStatus(asset: MediaAsset): ProxyStatus {
  if (asset.status === 'OFFLINE') return 'Offline';
  // Simulate: assets with fileSize > 500MB use proxy, else original
  if (asset.fileSize && asset.fileSize > 500 * 1024 * 1024) return 'Proxy';
  return 'Original';
}

function getColorLabelColor(label?: string): string {
  if (!label) return 'transparent';
  const found = COLOR_LABELS.find((c) => c.id === label);
  return found ? found.color : 'transparent';
}

// ─── SVG Icons (inline, no dependencies) ────────────────────────────────────

function IconGrid() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1" y="1" width="5" height="5" rx="0.5" />
      <rect x="8" y="1" width="5" height="5" rx="0.5" />
      <rect x="1" y="8" width="5" height="5" rx="0.5" />
      <rect x="8" y="8" width="5" height="5" rx="0.5" />
    </svg>
  );
}

function IconList() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
      <line x1="1" y1="3" x2="13" y2="3" />
      <line x1="1" y1="7" x2="13" y2="7" />
      <line x1="1" y1="11" x2="13" y2="11" />
    </svg>
  );
}

function IconFilmstrip() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1" y="2" width="12" height="10" rx="1" />
      <line x1="4" y1="2" x2="4" y2="12" />
      <line x1="7" y1="2" x2="7" y2="12" />
      <line x1="10" y1="2" x2="10" y2="12" />
    </svg>
  );
}

function IconSmartBin() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
      <circle cx="6" cy="6" r="5" />
      <path d="M4 6.5L5.5 8L8 4.5" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="5" y1="1" x2="5" y2="9" />
      <line x1="1" y1="5" x2="9" y2="5" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M2 3h8M4.5 3V2a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M3.5 3v7a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V3" />
    </svg>
  );
}

function IconStar({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1">
      <path d="M7 1.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6L7 9.7 3.8 11.4l.6-3.6-2.6-2.5 3.6-.5L7 1.5z" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="2" y1="2" x2="8" y2="8" />
      <line x1="8" y1="2" x2="2" y2="8" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M1 3a1 1 0 0 1 1-1h2.5l1.5 1.5H10a1 1 0 0 1 1 1V9a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3z" />
    </svg>
  );
}

// ─── Waveform Thumbnail Component ───────────────────────────────────────────

function WaveformThumbnail({ assetId, width = 64, height = 24 }: { assetId: string; width?: number; height?: number }) {
  const data = useMemo(() => generateWaveformData(assetId, width), [assetId, width]);
  const barWidth = width / data.length;
  const mid = height / 2;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ borderRadius: 2, background: 'var(--bg-void)', flexShrink: 0 }}
      aria-label="Audio waveform"
    >
      {data.map((v, i) => {
        const barH = v * (height - 2);
        return (
          <rect
            key={i}
            x={i * barWidth}
            y={mid - barH / 2}
            width={Math.max(barWidth - 0.3, 0.5)}
            height={barH}
            fill="#22c896"
            opacity={0.8}
          />
        );
      })}
    </svg>
  );
}

// ─── Proxy Status Badge ─────────────────────────────────────────────────────

function ProxyBadge({ status }: { status: ProxyStatus }) {
  const colors: Record<ProxyStatus, { bg: string; text: string }> = {
    Original: { bg: 'rgba(34,200,150,0.15)', text: '#22c896' },
    Proxy: { bg: 'rgba(234,179,8,0.15)', text: '#eab308' },
    Offline: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' },
  };
  const c = colors[status];
  return (
    <span
      style={{
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        padding: '1px 4px',
        borderRadius: 3,
        background: c.bg,
        color: c.text,
        flexShrink: 0,
        lineHeight: '14px',
      }}
      title={`Media status: ${status}`}
    >
      {status === 'Original' ? 'OG' : status === 'Proxy' ? 'PX' : 'OFF'}
    </span>
  );
}

// ─── Color Label Dot ────────────────────────────────────────────────────────

function ColorLabelDot({ color, size = 8 }: { color: string; size?: number }) {
  if (color === 'transparent') return null;
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        boxShadow: `0 0 3px ${color}44`,
      }}
      aria-label={`Color label`}
    />
  );
}

// ─── Star Rating ────────────────────────────────────────────────────────────

function StarRating({ value, onChange, size = 14 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1, cursor: onChange ? 'pointer' : 'default' }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          onClick={(e) => { e.stopPropagation(); onChange?.(value === star ? 0 : star); }}
          style={{ color: star <= value ? '#f59e0b' : 'var(--text-muted)', display: 'flex' }}
          title={`${star} star${star > 1 ? 's' : ''}`}
        >
          <IconStar filled={star <= value} />
        </span>
      ))}
    </span>
  );
}

// ─── Context Menu ───────────────────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  assetId: string;
}

function ContextMenu({
  state,
  onClose,
  onSetColorLabel,
  onSetRating,
  onAddToBin,
  onDelete,
}: {
  state: ContextMenuState;
  onClose: () => void;
  onSetColorLabel: (assetId: string, label: string) => void;
  onSetRating: (assetId: string, rating: number) => void;
  onAddToBin: (assetId: string) => void;
  onDelete: (assetId: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const menuItemStyle: React.CSSProperties = {
    padding: '5px 12px',
    fontSize: 11,
    cursor: 'pointer',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  const [showColorSub, setShowColorSub] = useState(false);
  const [showRatingSub, setShowRatingSub] = useState(false);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: state.x,
        top: state.y,
        background: 'var(--bg-raised)',
        border: '1px solid var(--border-default)',
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        zIndex: 9999,
        minWidth: 180,
        padding: '4px 0',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Color Label submenu */}
      <div
        style={{ ...menuItemStyle, justifyContent: 'space-between' }}
        onMouseEnter={() => { setShowColorSub(true); setShowRatingSub(false); }}
        onMouseLeave={() => setShowColorSub(false)}
      >
        <span>Color Label</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>&#9654;</span>
        {showColorSub && (
          <div
            style={{
              position: 'absolute',
              left: '100%',
              top: 0,
              background: 'var(--bg-raised)',
              border: '1px solid var(--border-default)',
              borderRadius: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              padding: '4px 0',
              minWidth: 140,
            }}
          >
            {COLOR_LABELS.map((cl) => (
              <div
                key={cl.id}
                style={{ ...menuItemStyle }}
                onClick={() => { onSetColorLabel(state.assetId, cl.id); onClose(); }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-active)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: cl.color === 'transparent' ? 'var(--text-muted)' : cl.color,
                    border: cl.color === 'transparent' ? '1px dashed var(--text-muted)' : 'none',
                    flexShrink: 0,
                  }}
                />
                {cl.name}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rating submenu */}
      <div
        style={{ ...menuItemStyle, justifyContent: 'space-between' }}
        onMouseEnter={() => { setShowRatingSub(true); setShowColorSub(false); }}
        onMouseLeave={() => setShowRatingSub(false)}
      >
        <span>Set Rating</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>&#9654;</span>
        {showRatingSub && (
          <div
            style={{
              position: 'absolute',
              left: '100%',
              top: 30,
              background: 'var(--bg-raised)',
              border: '1px solid var(--border-default)',
              borderRadius: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              padding: '8px 12px',
              minWidth: 100,
            }}
          >
            <StarRating
              value={0}
              onChange={(v) => { onSetRating(state.assetId, v); onClose(); }}
            />
          </div>
        )}
      </div>

      <div style={{ height: 1, background: 'var(--border-default)', margin: '4px 0' }} />

      <div
        style={menuItemStyle}
        onClick={() => { onAddToBin(state.assetId); onClose(); }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-active)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <IconFolder /> Add to Bin...
      </div>

      <div style={{ height: 1, background: 'var(--border-default)', margin: '4px 0' }} />

      <div
        style={{ ...menuItemStyle, color: 'var(--error)' }}
        onClick={() => { onDelete(state.assetId); onClose(); }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-active)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <IconTrash /> Delete
      </div>
    </div>
  );
}

// ─── Smart Bin Creator Dialog ───────────────────────────────────────────────

function SmartBinCreator({ onClose, onSave }: {
  onClose: () => void;
  onSave: (name: string, rules: SmartBinRule[], matchAll: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [matchAll, setMatchAll] = useState(true);
  const [rules, setRules] = useState<SmartBinRule[]>([
    { field: 'type', operator: 'equals', value: '' },
  ]);

  const addRule = () => {
    setRules([...rules, { field: 'type', operator: 'equals', value: '' }]);
  };

  const updateRule = (index: number, patch: Partial<SmartBinRule>) => {
    setRules(rules.map((r, i) => i === index ? { ...r, ...patch } : r));
  };

  const removeRule = (index: number) => {
    if (rules.length > 1) {
      setRules(rules.filter((_, i) => i !== index));
    }
  };

  const inputStyle: React.CSSProperties = {
    padding: '4px 6px',
    fontSize: 11,
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 4,
    color: 'var(--text-primary)',
    outline: 'none',
    flex: 1,
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    flex: 'unset',
    minWidth: 80,
    appearance: 'none' as const,
    paddingRight: 16,
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='8' viewBox='0 0 8 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 3l3 3 3-3' stroke='%23999' stroke-width='1.2'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 4px center',
  };

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-raised)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: 20,
        width: 440,
        maxHeight: '80vh',
        overflowY: 'auto',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
          Create Smart Bin
        </div>

        {/* Name */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Smart Bin name..."
            style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
            autoFocus
          />
        </div>

        {/* Match mode */}
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Match
          </label>
          <select
            value={matchAll ? 'all' : 'any'}
            onChange={(e) => setMatchAll(e.target.value === 'all')}
            style={selectStyle}
          >
            <option value="all">All rules (AND)</option>
            <option value="any">Any rule (OR)</option>
          </select>
        </div>

        {/* Rules */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {rules.map((rule, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <select
                value={rule.field}
                onChange={(e) => updateRule(i, { field: e.target.value as SmartBinRuleField })}
                style={{ ...selectStyle, minWidth: 90 }}
              >
                {SMART_BIN_FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              <select
                value={rule.operator}
                onChange={(e) => updateRule(i, { operator: e.target.value as SmartBinOperator })}
                style={{ ...selectStyle, minWidth: 80 }}
              >
                {SMART_BIN_OPERATORS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                type="text"
                value={rule.value}
                onChange={(e) => updateRule(i, { value: e.target.value })}
                placeholder="Value..."
                style={inputStyle}
              />
              <button
                onClick={() => removeRule(i)}
                disabled={rules.length <= 1}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: rules.length > 1 ? 'pointer' : 'default',
                  color: rules.length > 1 ? 'var(--text-muted)' : 'var(--border-default)',
                  padding: 2,
                  display: 'flex',
                }}
                title="Remove rule"
              >
                <IconClose />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={addRule}
          style={{
            background: 'none',
            border: '1px dashed var(--border-default)',
            borderRadius: 4,
            color: 'var(--text-secondary)',
            fontSize: 10,
            padding: '4px 10px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginBottom: 16,
          }}
        >
          <IconPlus /> Add Rule
        </button>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: '5px 14px',
              fontSize: 11,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (name.trim() && rules.some((r) => r.value.trim())) {
                onSave(name.trim(), rules.filter((r) => r.value.trim()), matchAll);
              }
            }}
            disabled={!name.trim() || !rules.some((r) => r.value.trim())}
            style={{
              padding: '5px 14px',
              fontSize: 11,
              background: 'var(--brand)',
              border: 'none',
              borderRadius: 4,
              color: '#fff',
              cursor: name.trim() && rules.some((r) => r.value.trim()) ? 'pointer' : 'default',
              opacity: name.trim() && rules.some((r) => r.value.trim()) ? 1 : 0.4,
              fontWeight: 600,
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Batch Operations Toolbar ───────────────────────────────────────────────

function BatchToolbar({
  selectedCount,
  onSetColorLabel,
  onSetRating,
  onAddToBin,
  onDelete,
  onClearSelection,
}: {
  selectedCount: number;
  onSetColorLabel: (label: string) => void;
  onSetRating: (rating: number) => void;
  onAddToBin: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
}) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showRating, setShowRating] = useState(false);

  const btnStyle: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: 10,
    fontWeight: 600,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-default)',
    borderRadius: 4,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    position: 'relative',
  };

  return (
    <div
      style={{
        padding: '6px 10px',
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--bg-raised)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        animation: 'slideDown 0.15s ease-out',
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand)', marginRight: 4 }}>
        {selectedCount} selected
      </span>

      {/* Color Label */}
      <div style={{ position: 'relative' }}>
        <button style={btnStyle} onClick={() => { setShowColorPicker(!showColorPicker); setShowRating(false); }}>
          Color Label
        </button>
        {showColorPicker && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            background: 'var(--bg-raised)',
            border: '1px solid var(--border-default)',
            borderRadius: 6,
            padding: 8,
            display: 'flex',
            gap: 4,
            flexWrap: 'wrap',
            width: 120,
            zIndex: 100,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}>
            {COLOR_LABELS.map((cl) => (
              <button
                key={cl.id}
                title={cl.name}
                onClick={() => { onSetColorLabel(cl.id); setShowColorPicker(false); }}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: cl.color === 'transparent' ? 'var(--bg-void)' : cl.color,
                  border: cl.color === 'transparent' ? '1px dashed var(--text-muted)' : '2px solid transparent',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Rating */}
      <div style={{ position: 'relative' }}>
        <button style={btnStyle} onClick={() => { setShowRating(!showRating); setShowColorPicker(false); }}>
          Set Rating
        </button>
        {showRating && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            background: 'var(--bg-raised)',
            border: '1px solid var(--border-default)',
            borderRadius: 6,
            padding: '8px 12px',
            zIndex: 100,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}>
            <StarRating value={0} onChange={(v) => { onSetRating(v); setShowRating(false); }} />
          </div>
        )}
      </div>

      {/* Add to Bin */}
      <button style={btnStyle} onClick={onAddToBin}>
        <IconFolder /> Add to Bin
      </button>

      {/* Delete */}
      <button style={{ ...btnStyle, color: 'var(--error)', borderColor: 'rgba(239,68,68,0.3)' }} onClick={onDelete}>
        <IconTrash /> Delete
      </button>

      <div style={{ flex: 1 }} />

      <button
        onClick={onClearSelection}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          fontSize: 10,
          cursor: 'pointer',
          padding: '2px 6px',
        }}
      >
        Clear selection
      </button>
    </div>
  );
}

// ─── Editable Metadata Inspector ────────────────────────────────────────────

function MetadataInspector({
  asset,
  onUpdateName,
  onUpdateComment,
  onUpdateKeywords,
  onUpdateColorLabel,
  onUpdateRating,
}: {
  asset: MediaAsset;
  onUpdateName: (name: string) => void;
  onUpdateComment: (comment: string) => void;
  onUpdateKeywords: (keywords: string[]) => void;
  onUpdateColorLabel: (label: string) => void;
  onUpdateRating: (rating: number) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(asset.name);
  const [editingComment, setEditingComment] = useState(false);
  const [commentValue, setCommentValue] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  // Re-sync name value when asset changes
  useEffect(() => { setNameValue(asset.name); setEditingName(false); }, [asset.id, asset.name]);
  useEffect(() => { setCommentValue(''); setEditingComment(false); }, [asset.id]);

  useEffect(() => { if (editingName && nameInputRef.current) nameInputRef.current.focus(); }, [editingName]);
  useEffect(() => { if (editingComment && commentInputRef.current) commentInputRef.current.focus(); }, [editingComment]);

  const commitName = () => {
    if (nameValue.trim() && nameValue.trim() !== asset.name) {
      onUpdateName(nameValue.trim());
    } else {
      setNameValue(asset.name);
    }
    setEditingName(false);
  };

  const commitComment = () => {
    onUpdateComment(commentValue);
    setEditingComment(false);
  };

  const addKeyword = () => {
    if (newKeyword.trim() && !asset.tags.includes(newKeyword.trim().toLowerCase())) {
      onUpdateKeywords([...asset.tags, newKeyword.trim().toLowerCase()]);
      setNewKeyword('');
    }
  };

  const removeKeyword = (tag: string) => {
    onUpdateKeywords(asset.tags.filter((t) => t !== tag));
  };

  const proxyStatus = getProxyStatus(asset);
  const colorLabelColor = getColorLabelColor(asset.colorLabel);

  const editableFieldStyle: React.CSSProperties = {
    padding: '3px 6px',
    fontSize: 11,
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 3,
    color: 'var(--text-primary)',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Thumbnail / waveform */}
      {asset.type === 'AUDIO' ? (
        <div style={{ padding: 8, background: 'var(--bg-void)', borderRadius: 4, display: 'flex', justifyContent: 'center' }}>
          <WaveformThumbnail assetId={asset.id} width={220} height={60} />
        </div>
      ) : asset.thumbnailUrl ? (
        <img src={asset.thumbnailUrl} alt="" style={{ width: '100%', borderRadius: 4, marginBottom: 4 }} />
      ) : (
        <div style={{ width: '100%', height: 120, background: 'var(--bg-void)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>No Preview</span>
        </div>
      )}

      {/* Proxy & color label badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ProxyBadge status={proxyStatus} />
        {colorLabelColor !== 'transparent' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ColorLabelDot color={colorLabelColor} size={10} />
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
              {COLOR_LABELS.find((c) => c.id === asset.colorLabel)?.name}
            </span>
          </span>
        )}
      </div>

      {/* Editable Name */}
      <div>
        <label style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 2 }}>
          Name
        </label>
        {editingName ? (
          <input
            ref={nameInputRef}
            type="text"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameValue(asset.name); setEditingName(false); } }}
            style={editableFieldStyle}
          />
        ) : (
          <div
            onClick={() => setEditingName(true)}
            style={{
              fontSize: 11,
              color: 'var(--text-primary)',
              padding: '3px 6px',
              borderRadius: 3,
              cursor: 'text',
              border: '1px solid transparent',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}
            title="Click to edit"
          >
            {asset.name}
          </div>
        )}
      </div>

      {/* Comments */}
      <div>
        <label style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 2 }}>
          Comments
        </label>
        {editingComment ? (
          <textarea
            ref={commentInputRef}
            value={commentValue}
            onChange={(e) => setCommentValue(e.target.value)}
            onBlur={commitComment}
            onKeyDown={(e) => { if (e.key === 'Escape') { setEditingComment(false); } }}
            rows={3}
            style={{ ...editableFieldStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        ) : (
          <div
            onClick={() => setEditingComment(true)}
            style={{
              fontSize: 11,
              color: commentValue ? 'var(--text-primary)' : 'var(--text-muted)',
              padding: '3px 6px',
              borderRadius: 3,
              cursor: 'text',
              border: '1px solid transparent',
              minHeight: 22,
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}
            title="Click to add comments"
          >
            {commentValue || 'Click to add comments...'}
          </div>
        )}
      </div>

      {/* Keywords (tags) */}
      <div>
        <label style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
          Keywords
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
          {asset.tags.map((tag) => (
            <span
              key={tag}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px',
                fontSize: 10,
                background: 'var(--bg-void)',
                border: '1px solid var(--border-default)',
                borderRadius: 10,
                color: 'var(--text-secondary)',
              }}
            >
              {tag}
              <span
                onClick={() => removeKeyword(tag)}
                style={{ cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', fontSize: 8 }}
                title="Remove keyword"
              >
                <IconClose />
              </span>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addKeyword(); }}
            placeholder="Add keyword..."
            style={{ ...editableFieldStyle, flex: 1 }}
          />
          <button
            onClick={addKeyword}
            disabled={!newKeyword.trim()}
            style={{
              padding: '2px 8px',
              fontSize: 10,
              background: newKeyword.trim() ? 'var(--brand)' : 'var(--bg-surface)',
              border: 'none',
              borderRadius: 3,
              color: newKeyword.trim() ? '#fff' : 'var(--text-muted)',
              cursor: newKeyword.trim() ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <IconPlus />
          </button>
        </div>
      </div>

      {/* Color Label Picker */}
      <div>
        <label style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
          Color Label
        </label>
        <div style={{ display: 'flex', gap: 4 }}>
          {COLOR_LABELS.map((cl) => (
            <button
              key={cl.id}
              title={cl.name}
              onClick={() => onUpdateColorLabel(cl.id)}
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: cl.color === 'transparent' ? 'var(--bg-void)' : cl.color,
                border: asset.colorLabel === cl.id
                  ? '2px solid var(--text-primary)'
                  : cl.color === 'transparent'
                    ? '1px dashed var(--text-muted)'
                    : '2px solid transparent',
                cursor: 'pointer',
                padding: 0,
                transition: 'transform 0.1s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.2)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            />
          ))}
        </div>
      </div>

      {/* Rating */}
      <div>
        <label style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
          Rating
        </label>
        <StarRating
          value={asset.rating ?? 0}
          onChange={onUpdateRating}
        />
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border-default)', margin: '4px 0' }} />

      {/* Read-only technical metadata */}
      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: -4 }}>
        Technical
      </div>
      <MetaRow label="Type" value={asset.type} />
      <MetaRow label="Duration" value={formatDuration(asset.duration ?? 0)} mono />
      <MetaRow label="Resolution" value={asset.width && asset.height ? `${asset.width} x ${asset.height}` : '--'} />
      <MetaRow label="Frame Rate" value={asset.fps ? `${asset.fps.toFixed(3)} fps` : '--'} />
      <MetaRow label="Codec" value={asset.codec ?? '--'} />
      <MetaRow label="Color Space" value={asset.colorSpace ?? '--'} />
      <MetaRow label="Audio" value={asset.audioChannels ? `${asset.audioChannels}ch / ${(asset.sampleRate ?? 0) / 1000}kHz` : '--'} />
      <MetaRow label="Bit Depth" value={asset.bitDepth ? `${asset.bitDepth}-bit` : '--'} />
      <MetaRow label="File Size" value={formatFileSize(asset.fileSize)} />
      <MetaRow label="Alpha" value={asset.hasAlpha ? 'Yes' : 'No'} />
      <MetaRow label="Start TC" value={asset.startTimecode ?? '00:00:00:00'} mono />
      <MetaRow label="Proxy" value={getProxyStatus(asset)} />
    </div>
  );
}

// ─── Main Media Page ────────────────────────────────────────────────────────

export function MediaPage() {
  const bins = useEditorStore((s) => s.bins);
  const activeBin = useEditorStore((s) => s.selectedBinId);
  const selectBin = useEditorStore((s) => s.selectBin);
  const activeBinAssets = useEditorStore((s) => s.activeBinAssets);
  const smartBins = useEditorStore((s) => s.smartBins);
  const selectedSmartBinId = useEditorStore((s) => s.selectedSmartBinId);
  const addSmartBin = useEditorStore((s) => s.addSmartBin);
  const removeSmartBin = useEditorStore((s) => s.removeSmartBin);
  const selectSmartBin = useEditorStore((s) => s.selectSmartBin);
  const { setSourceClip } = usePlayerStore();

  // Local state
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 250);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showSmartBinCreator, setShowSmartBinCreator] = useState(false);
  const [draggedAssetId, setDraggedAssetId] = useState<string | null>(null);
  const [smartBinsExpanded, setSmartBinsExpanded] = useState(true);

  // Local metadata overrides (client-side editable state)
  // In a production app these would be persisted to the store/backend
  const [metadataOverrides, setMetadataOverrides] = useState<Record<string, Partial<MediaAsset>>>({});

  // Simulate initial data load
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  const allAssets = useMemo(() => collectAllMediaAssets(bins), [bins]);

  // Apply local metadata overrides to assets
  const enrichedAssets = useMemo(() => {
    return allAssets.map((a) => {
      const overrides = metadataOverrides[a.id];
      if (overrides) {
        return { ...a, ...overrides };
      }
      return a;
    });
  }, [allAssets, metadataOverrides]);

  const filteredAssets = useMemo(() => {
    let list = activeBin
      ? activeBinAssets.map((a) => {
          const overrides = metadataOverrides[a.id];
          return overrides ? { ...a, ...overrides } : a;
        })
      : enrichedAssets;

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((a: MediaAsset) =>
        a.name.toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q)) ||
        (a.codec ?? '').toLowerCase().includes(q)
      );
    }

    return [...list].sort((a: MediaAsset, b: MediaAsset) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'duration': cmp = (a.duration ?? 0) - (b.duration ?? 0); break;
        case 'fps': cmp = (a.fps ?? 0) - (b.fps ?? 0); break;
        case 'width': cmp = (a.width ?? 0) - (b.width ?? 0); break;
        case 'codec': cmp = (a.codec ?? '').localeCompare(b.codec ?? ''); break;
        case 'fileSize': cmp = (a.fileSize ?? 0) - (b.fileSize ?? 0); break;
        case 'type': cmp = a.type.localeCompare(b.type); break;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [enrichedAssets, activeBinAssets, activeBin, sortKey, sortAsc, debouncedSearch, metadataOverrides]);

  const selectedAssetId = selectedAssetIds.size === 1 ? Array.from(selectedAssetIds)[0]! : null;
  const selectedAsset = enrichedAssets.find((a: MediaAsset) => a.id === selectedAssetId) ?? null;

  // ── Selection handlers ────────────────────────────────────────────────────

  const handleAssetClick = useCallback((e: React.MouseEvent, assetId: string) => {
    if (e.ctrlKey || e.metaKey) {
      // Toggle individual selection
      setSelectedAssetIds((prev) => {
        const next = new Set(prev);
        if (next.has(assetId)) next.delete(assetId);
        else next.add(assetId);
        return next;
      });
    } else if (e.shiftKey && lastSelectedId) {
      // Range selection
      const startIdx = filteredAssets.findIndex((a) => a.id === lastSelectedId);
      const endIdx = filteredAssets.findIndex((a) => a.id === assetId);
      if (startIdx >= 0 && endIdx >= 0) {
        const lo = Math.min(startIdx, endIdx);
        const hi = Math.max(startIdx, endIdx);
        const rangeIds = filteredAssets.slice(lo, hi + 1).map((a) => a.id);
        setSelectedAssetIds(new Set(rangeIds));
      }
    } else {
      setSelectedAssetIds(new Set([assetId]));
      setSourceClip(assetId);
    }
    setLastSelectedId(assetId);
  }, [filteredAssets, lastSelectedId, setSourceClip]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortAsc ? ' \u25B2' : ' \u25BC') : '';

  // ── Keyboard navigation ───────────────────────────────────────────────────

  const handleAssetKeyDown = useCallback((e: React.KeyboardEvent, assetId: string, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = filteredAssets[index + 1];
      if (next) { setSelectedAssetIds(new Set([next.id])); setLastSelectedId(next.id); setSourceClip(next.id); }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = filteredAssets[index - 1];
      if (prev) { setSelectedAssetIds(new Set([prev.id])); setLastSelectedId(prev.id); setSourceClip(prev.id); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setSourceClip(assetId);
    } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setSelectedAssetIds(new Set(filteredAssets.map((a) => a.id)));
    }
  }, [filteredAssets, setSourceClip]);

  // ── Context menu handlers ─────────────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent, assetId: string) => {
    e.preventDefault();
    if (!selectedAssetIds.has(assetId)) {
      setSelectedAssetIds(new Set([assetId]));
      setLastSelectedId(assetId);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, assetId });
  }, [selectedAssetIds]);

  // ── Metadata update handlers ──────────────────────────────────────────────

  const updateAssetMetadata = useCallback((assetId: string, patch: Partial<MediaAsset>) => {
    setMetadataOverrides((prev) => ({
      ...prev,
      [assetId]: { ...prev[assetId], ...patch },
    }));
  }, []);

  const handleSetColorLabel = useCallback((assetId: string, label: string) => {
    updateAssetMetadata(assetId, { colorLabel: label === 'none' ? undefined : label });
  }, [updateAssetMetadata]);

  const handleSetRating = useCallback((assetId: string, rating: number) => {
    updateAssetMetadata(assetId, { rating });
  }, [updateAssetMetadata]);

  const handleBatchColorLabel = useCallback((label: string) => {
    selectedAssetIds.forEach((id) => {
      updateAssetMetadata(id, { colorLabel: label === 'none' ? undefined : label });
    });
  }, [selectedAssetIds, updateAssetMetadata]);

  const handleBatchRating = useCallback((rating: number) => {
    selectedAssetIds.forEach((id) => {
      updateAssetMetadata(id, { rating });
    });
  }, [selectedAssetIds, updateAssetMetadata]);

  const handleBatchDelete = useCallback(() => {
    // In production, this would call the store's delete method
    // For now, we clear the selection as feedback
    setSelectedAssetIds(new Set());
  }, []);

  const handleBatchAddToBin = useCallback(() => {
    // In production, this would open a bin picker dialog
    // For now, visual feedback only
  }, []);

  // ── Drag handlers ─────────────────────────────────────────────────────────

  const handleDragStart = useCallback((e: React.DragEvent, asset: MediaAsset) => {
    setDraggedAssetId(asset.id);
    const dragIds = selectedAssetIds.has(asset.id) ? Array.from(selectedAssetIds) : [asset.id];
    e.dataTransfer.setData('application/x-avid-media', JSON.stringify(dragIds));
    e.dataTransfer.setData('text/plain', asset.name);
    e.dataTransfer.effectAllowed = 'copyMove';

    // Create a drag ghost
    const ghost = document.createElement('div');
    ghost.textContent = dragIds.length > 1 ? `${dragIds.length} clips` : asset.name;
    ghost.style.cssText = 'position:fixed;top:-9999px;padding:4px 10px;background:#5b6ef4;color:#fff;border-radius:4px;font-size:11px;font-weight:600;white-space:nowrap;pointer-events:none;z-index:99999;';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    requestAnimationFrame(() => document.body.removeChild(ghost));
  }, [selectedAssetIds]);

  const handleDragEnd = useCallback(() => {
    setDraggedAssetId(null);
  }, []);

  // ── Smart Bin handlers ────────────────────────────────────────────────────

  const handleCreateSmartBin = useCallback((name: string, rules: SmartBinRule[], matchAll: boolean) => {
    addSmartBin(name, rules, matchAll);
    setShowSmartBinCreator(false);
  }, [addSmartBin]);

  const handleSelectSmartBin = useCallback((id: string) => {
    selectSmartBin(id);
    setSelectedAssetIds(new Set());
  }, [selectSmartBin]);

  const handleSelectRegularBin = useCallback((id: string | null) => {
    selectBin(id as any);
    setSelectedAssetIds(new Set());
  }, [selectBin]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderAssetRow = (asset: MediaAsset, index: number) => {
    const isSelected = selectedAssetIds.has(asset.id);
    const isDragged = draggedAssetId === asset.id;
    const labelColor = getColorLabelColor(asset.colorLabel);
    const proxyStatus = getProxyStatus(asset);

    return (
      <div
        key={asset.id}
        role="row"
        aria-selected={isSelected}
        aria-label={`${asset.name}, ${asset.type}, ${formatDuration(asset.duration ?? 0)}`}
        tabIndex={isSelected ? 0 : -1}
        draggable
        onDragStart={(e) => handleDragStart(e, asset)}
        onDragEnd={handleDragEnd}
        style={{
          display: 'grid',
          gridTemplateColumns: '20px 2fr 100px 60px 120px 100px 80px 60px 90px',
          padding: '4px 10px',
          fontSize: 11,
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          background: isSelected
            ? 'var(--bg-active)'
            : isDragged
              ? 'rgba(91,110,244,0.08)'
              : 'transparent',
          borderBottom: '1px solid var(--border-subtle)',
          outline: 'none',
          opacity: isDragged ? 0.5 : 1,
          transition: 'background 0.1s',
        }}
        onClick={(e) => handleAssetClick(e, asset.id)}
        onDoubleClick={() => setSourceClip(asset.id)}
        onKeyDown={(e) => handleAssetKeyDown(e, asset.id, index)}
        onContextMenu={(e) => handleContextMenu(e, asset.id)}
      >
        {/* Color label dot */}
        <div role="gridcell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ColorLabelDot color={labelColor} size={7} />
        </div>

        {/* Name with thumbnail/waveform */}
        <div role="gridcell" style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
          {asset.type === 'AUDIO' ? (
            <WaveformThumbnail assetId={asset.id} width={32} height={18} />
          ) : asset.thumbnailUrl ? (
            <img src={asset.thumbnailUrl} alt="" style={{ width: 32, height: 18, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />
          ) : (
            <div style={{ width: 32, height: 18, borderRadius: 2, background: 'var(--bg-void)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 7, color: 'var(--text-muted)' }}>{asset.type.charAt(0)}</span>
            </div>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
            {asset.name}
          </span>
          {asset.hasAlpha && <span style={{ fontSize: 8, color: '#22c896', fontWeight: 700, flexShrink: 0 }} aria-label="Has alpha channel">A</span>}
          <ProxyBadge status={proxyStatus} />
        </div>

        <div role="gridcell" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, display: 'flex', alignItems: 'center' }}>{formatDuration(asset.duration ?? 0)}</div>
        <div role="gridcell" style={{ display: 'flex', alignItems: 'center' }}>{asset.fps?.toFixed(2) ?? '--'}</div>
        <div role="gridcell" style={{ display: 'flex', alignItems: 'center' }}>{asset.width && asset.height ? `${asset.width}x${asset.height}` : '--'}</div>
        <div role="gridcell" style={{ display: 'flex', alignItems: 'center' }}>{asset.codec ?? '--'}</div>
        <div role="gridcell" style={{ fontSize: 10, fontWeight: 500, display: 'flex', alignItems: 'center' }}>{asset.type}</div>
        <div role="gridcell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <StarRating value={asset.rating ?? 0} onChange={(v) => handleSetRating(asset.id, v)} size={10} />
        </div>
        <div role="gridcell" style={{ display: 'flex', alignItems: 'center' }}>{formatFileSize(asset.fileSize)}</div>
      </div>
    );
  };

  const renderThumbnailCard = (asset: MediaAsset) => {
    const isSelected = selectedAssetIds.has(asset.id);
    const isDragged = draggedAssetId === asset.id;
    const labelColor = getColorLabelColor(asset.colorLabel);
    const proxyStatus = getProxyStatus(asset);

    return (
      <div
        key={asset.id}
        draggable
        onDragStart={(e) => handleDragStart(e, asset)}
        onDragEnd={handleDragEnd}
        onClick={(e) => handleAssetClick(e, asset.id)}
        onDoubleClick={() => setSourceClip(asset.id)}
        onContextMenu={(e) => handleContextMenu(e, asset.id)}
        style={{
          width: 140,
          background: isSelected ? 'var(--bg-active)' : 'var(--bg-surface)',
          border: isSelected ? '1px solid var(--brand)' : '1px solid var(--border-default)',
          borderRadius: 6,
          overflow: 'hidden',
          cursor: 'pointer',
          opacity: isDragged ? 0.5 : 1,
          transition: 'border-color 0.15s, box-shadow 0.15s',
          boxShadow: isSelected ? '0 0 0 1px var(--brand)' : 'none',
        }}
      >
        {/* Thumbnail */}
        <div style={{ position: 'relative', height: 80, background: 'var(--bg-void)', overflow: 'hidden' }}>
          {asset.type === 'AUDIO' ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <WaveformThumbnail assetId={asset.id} width={130} height={50} />
            </div>
          ) : asset.thumbnailUrl ? (
            <img src={asset.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <span style={{ fontSize: 20, color: 'var(--text-muted)' }}>{asset.type.charAt(0)}</span>
            </div>
          )}
          {/* Proxy badge overlay */}
          <div style={{ position: 'absolute', top: 4, right: 4 }}>
            <ProxyBadge status={proxyStatus} />
          </div>
          {/* Color label strip */}
          {labelColor !== 'transparent' && (
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: labelColor }} />
          )}
          {/* Duration badge */}
          {asset.duration && (
            <div style={{
              position: 'absolute', bottom: 4, left: 4,
              fontSize: 8, fontFamily: 'var(--font-mono)',
              background: 'rgba(0,0,0,0.7)', color: '#fff',
              padding: '1px 4px', borderRadius: 2,
            }}>
              {formatDuration(asset.duration)}
            </div>
          )}
        </div>
        {/* Info */}
        <div style={{ padding: '6px 8px' }}>
          <div style={{
            fontSize: 10, fontWeight: 500, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginBottom: 2,
          }}>
            {asset.name}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{asset.type}</span>
            <StarRating value={asset.rating ?? 0} onChange={(v) => handleSetRating(asset.id, v)} size={9} />
          </div>
        </div>
      </div>
    );
  };

  const renderFilmstripCard = (asset: MediaAsset) => {
    const isSelected = selectedAssetIds.has(asset.id);
    const isDragged = draggedAssetId === asset.id;
    const labelColor = getColorLabelColor(asset.colorLabel);
    const proxyStatus = getProxyStatus(asset);
    const frameCount = 6;

    return (
      <div
        key={asset.id}
        draggable
        onDragStart={(e) => handleDragStart(e, asset)}
        onDragEnd={handleDragEnd}
        onClick={(e) => handleAssetClick(e, asset.id)}
        onDoubleClick={() => setSourceClip(asset.id)}
        onContextMenu={(e) => handleContextMenu(e, asset.id)}
        style={{
          background: isSelected ? 'var(--bg-active)' : 'var(--bg-surface)',
          border: isSelected ? '1px solid var(--brand)' : '1px solid var(--border-default)',
          borderRadius: 6,
          overflow: 'hidden',
          cursor: 'pointer',
          opacity: isDragged ? 0.5 : 1,
          marginBottom: 4,
        }}
      >
        {/* Color label strip on left */}
        <div style={{ display: 'flex' }}>
          {labelColor !== 'transparent' && (
            <div style={{ width: 3, background: labelColor, flexShrink: 0 }} />
          )}
          <div style={{ flex: 1 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
              <ColorLabelDot color={labelColor} size={7} />
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {asset.name}
              </span>
              <ProxyBadge status={proxyStatus} />
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {formatDuration(asset.duration ?? 0)}
              </span>
              <StarRating value={asset.rating ?? 0} onChange={(v) => handleSetRating(asset.id, v)} size={10} />
            </div>
            {/* Filmstrip frames */}
            <div style={{ display: 'flex', height: 48, background: 'var(--bg-void)' }}>
              {asset.type === 'AUDIO' ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px' }}>
                  <WaveformThumbnail assetId={asset.id} width={300} height={36} />
                </div>
              ) : (
                Array.from({ length: frameCount }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      borderRight: i < frameCount - 1 ? '1px solid var(--border-subtle)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {asset.thumbnailUrl ? (
                      <img
                        src={asset.thumbnailUrl}
                        alt=""
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          filter: `brightness(${0.85 + i * 0.05})`,
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>F{i + 1}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }} role="region" aria-label="Media Browser">
      {/* ── Bin sidebar ──────────────────────────────────────────────────── */}
      <nav style={{
        width: 210, flexShrink: 0, borderRight: '1px solid var(--border-default)',
        background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column',
      }} aria-label="Media bins">
        {/* Regular Bins header */}
        <div style={{
          padding: '8px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 1,
          textTransform: 'uppercase', color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border-default)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>Bins</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }} role="listbox" aria-label="Bin list">
          {/* All Media */}
          <div
            role="option"
            aria-selected={!activeBin && !selectedSmartBinId}
            tabIndex={0}
            style={{
              padding: '6px 10px', fontSize: 11, cursor: 'pointer',
              color: !activeBin && !selectedSmartBinId ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: !activeBin && !selectedSmartBinId ? 'var(--bg-active)' : 'transparent',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
            onClick={() => handleSelectRegularBin(null)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectRegularBin(null); } }}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.background = 'rgba(91,110,244,0.12)'; }}
            onDragLeave={(e) => { e.currentTarget.style.background = !activeBin && !selectedSmartBinId ? 'var(--bg-active)' : 'transparent'; }}
            onDrop={(e) => { e.preventDefault(); e.currentTarget.style.background = !activeBin && !selectedSmartBinId ? 'var(--bg-active)' : 'transparent'; }}
          >
            <IconFolder />
            All Media
          </div>

          {/* Regular bins */}
          {bins.map((bin) => (
            <BinItem
              key={bin.id}
              bin={bin}
              depth={0}
              activeBin={activeBin}
              selectedSmartBinId={selectedSmartBinId}
              onSelect={handleSelectRegularBin}
            />
          ))}

          {/* Smart Bins section */}
          <div
            style={{
              padding: '8px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 1,
              textTransform: 'uppercase', color: 'var(--text-muted)',
              borderTop: '1px solid var(--border-default)',
              borderBottom: '1px solid var(--border-default)',
              marginTop: 8,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onClick={() => setSmartBinsExpanded(!smartBinsExpanded)}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 8, transition: 'transform 0.15s', transform: smartBinsExpanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>&#9654;</span>
              Smart Bins
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setShowSmartBinCreator(true); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', display: 'flex', padding: 2,
              }}
              title="Create Smart Bin"
            >
              <IconPlus />
            </button>
          </div>

          {smartBinsExpanded && smartBins.map((sb) => (
            <div
              key={sb.id}
              role="option"
              aria-selected={selectedSmartBinId === sb.id}
              tabIndex={0}
              style={{
                padding: '5px 10px', fontSize: 11, cursor: 'pointer',
                color: selectedSmartBinId === sb.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: selectedSmartBinId === sb.id ? 'var(--bg-active)' : 'transparent',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              onClick={() => handleSelectSmartBin(sb.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectSmartBin(sb.id); } }}
            >
              <span style={{ color: sb.color, display: 'flex' }}>
                <IconSmartBin />
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {sb.name}
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                {sb.rules.length}r
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); removeSmartBin(sb.id); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', display: 'flex', padding: 1,
                  opacity: 0.5,
                }}
                title="Remove Smart Bin"
              >
                <IconClose />
              </button>
            </div>
          ))}
        </div>
      </nav>

      {/* ── Main media area ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Search & view mode bar */}
        <div style={{
          padding: '6px 10px', borderBottom: '1px solid var(--border-default)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search media..."
            aria-label="Search media assets"
            style={{
              flex: 1, padding: '4px 8px', fontSize: 11,
              background: 'var(--bg-void)', border: '1px solid var(--border-default)',
              borderRadius: 4, color: 'var(--text-primary)', outline: 'none',
            }}
          />
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {filteredAssets.length} items
          </span>

          {/* View mode toggles */}
          <div style={{ display: 'flex', gap: 1, background: 'var(--bg-void)', borderRadius: 4, padding: 1 }}>
            {([
              { mode: 'list' as ViewMode, icon: <IconList />, label: 'List view' },
              { mode: 'thumbnail' as ViewMode, icon: <IconGrid />, label: 'Thumbnail view' },
              { mode: 'filmstrip' as ViewMode, icon: <IconFilmstrip />, label: 'Filmstrip view' },
            ]).map(({ mode, icon, label }) => (
              <button
                key={mode}
                title={label}
                aria-label={label}
                aria-pressed={viewMode === mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '3px 6px',
                  background: viewMode === mode ? 'var(--bg-raised)' : 'transparent',
                  border: 'none',
                  borderRadius: 3,
                  color: viewMode === mode ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        {/* Batch operations toolbar */}
        {selectedAssetIds.size > 1 && (
          <BatchToolbar
            selectedCount={selectedAssetIds.size}
            onSetColorLabel={handleBatchColorLabel}
            onSetRating={handleBatchRating}
            onAddToBin={handleBatchAddToBin}
            onDelete={handleBatchDelete}
            onClearSelection={() => setSelectedAssetIds(new Set())}
          />
        )}

        {/* ── List View ──────────────────────────────────────────────────── */}
        {viewMode === 'list' && (
          <>
            {/* Table header */}
            <div
              role="row"
              aria-label="Column headers"
              style={{
                display: 'grid',
                gridTemplateColumns: '20px 2fr 100px 60px 120px 100px 80px 60px 90px',
                padding: '4px 10px', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
                textTransform: 'uppercase', color: 'var(--text-muted)',
                borderBottom: '1px solid var(--border-default)', cursor: 'pointer',
                background: 'var(--bg-raised)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Color Label">
                <span style={{ width: 7, height: 7, borderRadius: '50%', border: '1px solid var(--text-muted)' }} />
              </div>
              <div role="columnheader" tabIndex={0} onClick={() => handleSort('name')} onKeyDown={(e) => { if (e.key === 'Enter') handleSort('name'); }} aria-sort={sortKey === 'name' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>Name{sortIndicator('name')}</div>
              <div role="columnheader" tabIndex={0} onClick={() => handleSort('duration')} onKeyDown={(e) => { if (e.key === 'Enter') handleSort('duration'); }} aria-sort={sortKey === 'duration' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>Duration{sortIndicator('duration')}</div>
              <div role="columnheader" tabIndex={0} onClick={() => handleSort('fps')} onKeyDown={(e) => { if (e.key === 'Enter') handleSort('fps'); }} aria-sort={sortKey === 'fps' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>FPS{sortIndicator('fps')}</div>
              <div role="columnheader" tabIndex={0} onClick={() => handleSort('width')} onKeyDown={(e) => { if (e.key === 'Enter') handleSort('width'); }} aria-sort={sortKey === 'width' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>Resolution{sortIndicator('width')}</div>
              <div role="columnheader" tabIndex={0} onClick={() => handleSort('codec')} onKeyDown={(e) => { if (e.key === 'Enter') handleSort('codec'); }} aria-sort={sortKey === 'codec' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>Codec{sortIndicator('codec')}</div>
              <div role="columnheader" tabIndex={0} onClick={() => handleSort('type')} onKeyDown={(e) => { if (e.key === 'Enter') handleSort('type'); }} aria-sort={sortKey === 'type' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>Type{sortIndicator('type')}</div>
              <div style={{ fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Rating</div>
              <div role="columnheader" tabIndex={0} onClick={() => handleSort('fileSize')} onKeyDown={(e) => { if (e.key === 'Enter') handleSort('fileSize'); }} aria-sort={sortKey === 'fileSize' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>Size{sortIndicator('fileSize')}</div>
            </div>

            {/* Table body */}
            <div style={{ flex: 1, overflowY: 'auto' }} role="rowgroup" aria-label="Media assets">
              {/* Loading skeleton */}
              {isLoading && filteredAssets.length === 0 && (
                <>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={`skeleton-${i}`} aria-hidden="true" style={{
                      display: 'grid',
                      gridTemplateColumns: '20px 2fr 100px 60px 120px 100px 80px 60px 90px',
                      padding: '5px 10px', borderBottom: '1px solid var(--border-subtle)',
                    }}>
                      <div />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 32, height: 18, borderRadius: 2, background: 'var(--bg-raised)' }} />
                        <div style={{ width: '60%', height: 10, borderRadius: 3, background: 'var(--bg-raised)' }} />
                      </div>
                      <div style={{ height: 10, width: '70%', borderRadius: 3, background: 'var(--bg-raised)', alignSelf: 'center' }} />
                      <div style={{ height: 10, width: '50%', borderRadius: 3, background: 'var(--bg-raised)', alignSelf: 'center' }} />
                      <div style={{ height: 10, width: '80%', borderRadius: 3, background: 'var(--bg-raised)', alignSelf: 'center' }} />
                      <div style={{ height: 10, width: '60%', borderRadius: 3, background: 'var(--bg-raised)', alignSelf: 'center' }} />
                      <div style={{ height: 10, width: '50%', borderRadius: 3, background: 'var(--bg-raised)', alignSelf: 'center' }} />
                      <div style={{ height: 10, width: '40%', borderRadius: 3, background: 'var(--bg-raised)', alignSelf: 'center' }} />
                      <div style={{ height: 10, width: '60%', borderRadius: 3, background: 'var(--bg-raised)', alignSelf: 'center' }} />
                    </div>
                  ))}
                </>
              )}

              {filteredAssets.map((asset, index) => renderAssetRow(asset, index))}

              {/* Empty state */}
              {!isLoading && filteredAssets.length === 0 && (
                <EmptyState hasSearch={!!debouncedSearch} />
              )}
            </div>
          </>
        )}

        {/* ── Thumbnail Grid View ────────────────────────────────────────── */}
        {viewMode === 'thumbnail' && (
          <div style={{
            flex: 1, overflowY: 'auto', padding: 12,
            display: 'flex', flexWrap: 'wrap', gap: 10,
            alignContent: 'flex-start',
          }}>
            {isLoading && filteredAssets.length === 0 && (
              Array.from({ length: 8 }).map((_, i) => (
                <div key={`skel-${i}`} style={{
                  width: 140, height: 120, borderRadius: 6,
                  background: 'var(--bg-raised)',
                }} />
              ))
            )}
            {filteredAssets.map((asset) => renderThumbnailCard(asset))}
            {!isLoading && filteredAssets.length === 0 && (
              <EmptyState hasSearch={!!debouncedSearch} />
            )}
          </div>
        )}

        {/* ── Filmstrip View ─────────────────────────────────────────────── */}
        {viewMode === 'filmstrip' && (
          <div style={{
            flex: 1, overflowY: 'auto', padding: 8,
          }}>
            {isLoading && filteredAssets.length === 0 && (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={`skel-${i}`} style={{
                  height: 70, borderRadius: 6,
                  background: 'var(--bg-raised)',
                  marginBottom: 4,
                }} />
              ))
            )}
            {filteredAssets.map((asset) => renderFilmstripCard(asset))}
            {!isLoading && filteredAssets.length === 0 && (
              <EmptyState hasSearch={!!debouncedSearch} />
            )}
          </div>
        )}
      </div>

      {/* ── Metadata inspector sidebar ───────────────────────────────────── */}
      <aside style={{
        width: 270, flexShrink: 0, borderLeft: '1px solid var(--border-default)',
        background: 'var(--bg-surface)', overflowY: 'auto',
      }} aria-label="Media metadata inspector">
        <div style={{
          padding: '8px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 1,
          textTransform: 'uppercase', color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border-default)',
        }}>
          Metadata
        </div>
        {selectedAsset ? (
          <MetadataInspector
            asset={selectedAsset}
            onUpdateName={(name) => updateAssetMetadata(selectedAsset.id, { name })}
            onUpdateComment={() => { /* stored locally in MetadataInspector */ }}
            onUpdateKeywords={(tags) => updateAssetMetadata(selectedAsset.id, { tags })}
            onUpdateColorLabel={(label) => handleSetColorLabel(selectedAsset.id, label)}
            onUpdateRating={(rating) => handleSetRating(selectedAsset.id, rating)}
          />
        ) : selectedAssetIds.size > 1 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
            {selectedAssetIds.size} items selected
            <div style={{ marginTop: 8, fontSize: 10 }}>
              Use the batch toolbar above to edit multiple items
            </div>
          </div>
        ) : (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
            Select a clip to view metadata
          </div>
        )}
      </aside>

      {/* ── Context Menu ─────────────────────────────────────────────────── */}
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onSetColorLabel={handleSetColorLabel}
          onSetRating={handleSetRating}
          onAddToBin={handleBatchAddToBin}
          onDelete={handleBatchDelete}
        />
      )}

      {/* ── Smart Bin Creator ────────────────────────────────────────────── */}
      {showSmartBinCreator && (
        <SmartBinCreator
          onClose={() => setShowSmartBinCreator(false)}
          onSave={handleCreateSmartBin}
        />
      )}
    </div>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

/** Recursive bin tree item for the sidebar. */
function BinItem({
  bin,
  depth,
  activeBin,
  selectedSmartBinId,
  onSelect,
}: {
  bin: Bin;
  depth: number;
  activeBin: string | null;
  selectedSmartBinId: string | null;
  onSelect: (id: string) => void;
}) {
  const isActive = activeBin === bin.id && !selectedSmartBinId;
  const hasChildren = bin.children.length > 0;
  const [expanded, setExpanded] = useState(bin.isOpen);

  return (
    <>
      <div
        role="option"
        aria-selected={isActive}
        tabIndex={0}
        style={{
          padding: '5px 10px',
          paddingLeft: 10 + depth * 14,
          fontSize: 11,
          cursor: 'pointer',
          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
          background: isActive ? 'var(--bg-active)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
        onClick={() => {
          if (hasChildren) setExpanded(!expanded);
          onSelect(bin.id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(bin.id); }
        }}
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.background = 'rgba(91,110,244,0.12)'; }}
        onDragLeave={(e) => { e.currentTarget.style.background = isActive ? 'var(--bg-active)' : 'transparent'; }}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.style.background = isActive ? 'var(--bg-active)' : 'transparent';
          // In production, handle adding dragged assets to this bin
        }}
      >
        {hasChildren && (
          <span style={{
            fontSize: 7, display: 'inline-block',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
            color: 'var(--text-muted)',
          }}>
            &#9654;
          </span>
        )}
        <span style={{ width: 8, height: 8, borderRadius: 2, background: bin.color, flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {bin.name}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {bin.assets.length > 0 ? bin.assets.length : ''}
        </span>
      </div>
      {hasChildren && expanded && bin.children.map((child) => (
        <BinItem
          key={child.id}
          bin={child}
          depth={depth + 1}
          activeBin={activeBin}
          selectedSmartBinId={selectedSmartBinId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

/** Empty state display. */
function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div style={{ padding: 40, textAlign: 'center' }} role="status">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)', marginBottom: 12 }} aria-hidden="true">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <polyline points="13 2 13 9 20 9" />
      </svg>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
        {hasSearch ? 'No matching media found' : 'No media imported yet'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {hasSearch ? 'Try adjusting your search query' : 'Import files to get started with your project'}
      </div>
    </div>
  );
}

/** Read-only metadata row. */
function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '1px 0' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{
        color: 'var(--text-primary)',
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        fontSize: mono ? 10 : undefined,
      }}>
        {value}
      </span>
    </div>
  );
}
