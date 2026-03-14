import React, { useState, useMemo, useCallback } from 'react';
import { keyboardEngine, type KeyBinding, type KeyCategory, type KeyboardLayout } from '../../engine/KeyboardEngine';
import { useUserSettingsStore, type SerializedKeyBinding } from '../../store/userSettings.store';
import { KeyCaptureBadge } from './KeyCaptureBadge';
import { useKeyCaptureMode } from './useKeyCaptureMode';

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<KeyCategory, string> = {
  transport: 'Transport (JKL)',
  marking: 'Marking',
  editing: 'Editing',
  trim: 'Trim',
  smartTool: 'Smart Tool',
  navigation: 'Navigation',
  multicam: 'Multicam',
  audio: 'Audio',
  view: 'View',
  file: 'File',
  tools: 'Tools',
  other: 'Other',
};

const CATEGORY_ORDER: KeyCategory[] = [
  'transport', 'marking', 'editing', 'trim', 'smartTool',
  'navigation', 'multicam', 'audio', 'view', 'file', 'tools', 'other',
];

// ─── Component ──────────────────────────────────────────────────────────────

export function KeyboardSettingsPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<KeyCategory>>(new Set(['transport', 'editing']));
  const [editingBindingId, setEditingBindingId] = useState<string | null>(null);
  const [conflictInfo, setConflictInfo] = useState<{ action: string; description: string } | null>(null);

  const { settings, updateSetting, updateSettings } = useUserSettingsStore();
  const { isCapturing, capturedKey, startCapture, cancelCapture } = useKeyCaptureMode();

  // Get current layout bindings
  const layout = keyboardEngine.getLayout();
  const availableLayouts = useMemo(() => keyboardEngine.getAvailableLayouts(), []);

  // Filter bindings by search
  const filteredBindings = useMemo(() => {
    if (!searchQuery.trim()) return layout.bindings;
    const q = searchQuery.toLowerCase();
    return layout.bindings.filter(
      (b) =>
        b.action.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q) ||
        b.key.toLowerCase().includes(q)
    );
  }, [layout.bindings, searchQuery]);

  // Group by category
  const groupedBindings = useMemo(() => {
    const groups = new Map<KeyCategory, KeyBinding[]>();
    for (const b of filteredBindings) {
      const list = groups.get(b.category) || [];
      list.push(b);
      groups.set(b.category, list);
    }
    return groups;
  }, [filteredBindings]);

  const toggleCategory = (cat: KeyCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Save custom bindings to settings store
  const persistBindings = useCallback(() => {
    const currentLayout = keyboardEngine.getLayout();
    const custom: SerializedKeyBinding[] = currentLayout.bindings
      .filter((b) => b.isCustom)
      .map((b) => ({ key: b.key, modifiers: [...b.modifiers], action: b.action }));
    updateSettings({
      keyboardLayoutId: currentLayout.id,
      customKeyBindings: custom,
    });
  }, [updateSettings]);

  // Handle edit key binding
  const handleEditBinding = (binding: KeyBinding) => {
    setEditingBindingId(binding.id);
    setConflictInfo(null);
    // Temporarily disable the engine to prevent actions while capturing
    keyboardEngine.disable();
    startCapture();
  };

  // Handle captured key assignment
  React.useEffect(() => {
    if (!capturedKey || !editingBindingId) return;

    const binding = layout.bindings.find((b) => b.id === editingBindingId);
    if (!binding) {
      setEditingBindingId(null);
      keyboardEngine.enable();
      return;
    }

    // Check for conflicts
    const existingAction = keyboardEngine.getActionForKey(capturedKey.key, capturedKey.modifiers);
    if (existingAction && existingAction !== binding.action) {
      if (settings.keyboardConflictPolicy === 'warn') {
        const conflicting = layout.bindings.find((b) => b.action === existingAction);
        setConflictInfo({
          action: existingAction,
          description: conflicting?.description || existingAction,
        });
      }
    }

    // Apply the new binding
    keyboardEngine.setBinding(capturedKey.key, capturedKey.modifiers, binding.action);
    persistBindings();
    setEditingBindingId(null);
    keyboardEngine.enable();
  }, [capturedKey, editingBindingId, layout.bindings, persistBindings, settings.keyboardConflictPolicy]);

  // Handle reset individual binding
  const handleResetBinding = (binding: KeyBinding) => {
    keyboardEngine.removeBinding(binding.key, binding.modifiers);
    persistBindings();
  };

  // Handle layout preset change
  const handleLayoutChange = (layoutId: string) => {
    const preset = availableLayouts.find((l) => l.id === layoutId);
    if (preset) {
      keyboardEngine.loadLayout(preset);
      updateSettings({
        keyboardLayoutId: layoutId,
        customKeyBindings: [],
      });
    }
  };

  // Handle reset all to defaults
  const handleResetAll = () => {
    keyboardEngine.resetToDefaults();
    updateSettings({ customKeyBindings: [] });
  };

  // Import/Export
  const handleExport = () => {
    const json = keyboardEngine.exportLayout();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `avid-keyboard-${layout.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          keyboardEngine.importLayout(reader.result as string);
          persistBindings();
        } catch (err) {
          console.error('Failed to import keyboard layout:', err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Conflicts list
  const conflicts = keyboardEngine.getConflicts();

  return (
    <div>
      {/* Top controls */}
      <div style={styles['topBar']}>
        <input
          type="text"
          placeholder="Search shortcuts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={styles['searchInput']}
        />
        <select
          value={settings.keyboardLayoutId}
          onChange={(e) => handleLayoutChange(e.target.value)}
          style={styles['layoutSelect']}
        >
          {availableLayouts.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>

      <div style={styles['preferenceGrid']}>
        <label style={styles['preferenceCard']}>
          <span style={styles['preferenceLabel']}>Conflict Handling</span>
          <select
            value={settings.keyboardConflictPolicy}
            onChange={(event) => updateSetting('keyboardConflictPolicy', event.target.value as typeof settings.keyboardConflictPolicy)}
            style={styles['layoutSelect']}
          >
            <option value="warn">Warn Before Replace</option>
            <option value="replace">Replace Directly</option>
          </select>
        </label>
        <label style={styles['preferenceCard']}>
          <span style={styles['preferenceLabel']}>Button Mapping Mode</span>
          <select
            value={settings.buttonAssignmentMode}
            onChange={(event) => updateSetting('buttonAssignmentMode', event.target.value as typeof settings.buttonAssignmentMode)}
            style={styles['layoutSelect']}
          >
            <option value="button-to-button">Button-To-Button</option>
            <option value="menu-to-button">Menu-To-Button</option>
          </select>
        </label>
      </div>

      {/* Action buttons */}
      <div style={styles['actionBar']}>
        <button style={styles['actionBtn']} onClick={handleResetAll} title="Reset all to defaults">
          Reset All
        </button>
        <button style={styles['actionBtn']} onClick={handleImport} title="Import keyboard layout">
          Import
        </button>
        <button style={styles['actionBtn']} onClick={handleExport} title="Export keyboard layout">
          Export
        </button>
      </div>

      {/* Conflicts banner */}
      {conflicts.length > 0 && (
        <div style={styles['conflictBanner']}>
          {conflicts.length} conflicting binding{conflicts.length > 1 ? 's' : ''} detected
        </div>
      )}

      {conflictInfo && (
        <div style={styles['conflictBanner']}>
          Key reassigned from: {conflictInfo.description}
        </div>
      )}

      {/* Category accordion list */}
      <div style={styles['list']}>
        {CATEGORY_ORDER.map((cat) => {
          const bindings = groupedBindings.get(cat);
          if (!bindings || bindings.length === 0) return null;
          const isExpanded = expandedCategories.has(cat);

          return (
            <div key={cat} style={styles['category']}>
              <button
                style={styles['categoryHeader']}
                onClick={() => toggleCategory(cat)}
              >
                <span style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 100ms', display: 'inline-block' }}>
                  ▸
                </span>
                <span style={styles['categoryLabel']}>{CATEGORY_LABELS[cat]}</span>
                <span style={styles['categoryCount']}>{bindings.length}</span>
              </button>

              {isExpanded && (
                <div style={styles['categoryBody']}>
                  {bindings.map((binding) => (
                    <div key={binding.id} style={styles['bindingRow']}>
                      <div style={styles['bindingDescription']}>
                        {binding.description}
                        {binding.isCustom && <span style={styles['customBadge']}>custom</span>}
                      </div>
                      <div style={styles['bindingActions']}>
                        {editingBindingId === binding.id && isCapturing ? (
                          <span style={styles['captureHint']}>Press a key...</span>
                        ) : (
                          <KeyCaptureBadge keyName={binding.key} modifiers={binding.modifiers} />
                        )}
                        <button
                          style={styles['editBtn']}
                          onClick={() => handleEditBinding(binding)}
                          title="Edit binding"
                        >
                          Edit
                        </button>
                        {binding.isCustom && (
                          <button
                            style={styles['resetBtn']}
                            onClick={() => handleResetBinding(binding)}
                            title="Reset to default"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  topBar: {
    display: 'flex',
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    padding: '7px 10px',
    borderRadius: 'var(--radius-md, 6px)',
    border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
    background: 'var(--bg-void, #0a0a0f)',
    color: 'var(--text-primary, #e0e6ef)',
    fontSize: 12,
    fontFamily: 'inherit',
    outline: 'none',
  },
  layoutSelect: {
    padding: '7px 10px',
    borderRadius: 'var(--radius-md, 6px)',
    border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
    background: 'var(--bg-void, #0a0a0f)',
    color: 'var(--text-primary, #e0e6ef)',
    fontSize: 12,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  actionBar: {
    display: 'flex',
    gap: 6,
    marginBottom: 12,
  },
  preferenceGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 8,
    marginBottom: 12,
  },
  preferenceCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 10,
    borderRadius: 'var(--radius-md, 6px)',
    border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
    background: 'rgba(255,255,255,0.02)',
  },
  preferenceLabel: {
    fontSize: 11,
    color: 'var(--text-muted, #6a6a7a)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  actionBtn: {
    padding: '5px 10px',
    borderRadius: 'var(--radius-sm, 4px)',
    border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
    background: 'transparent',
    color: 'var(--text-secondary, #8a9cb5)',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  conflictBanner: {
    padding: '8px 12px',
    borderRadius: 'var(--radius-md, 6px)',
    background: 'rgba(245, 158, 11, 0.1)',
    border: '1px solid rgba(245, 158, 11, 0.25)',
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: 500,
    marginBottom: 12,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  category: {
    borderRadius: 'var(--radius-md, 6px)',
    overflow: 'hidden',
  },
  categoryHeader: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    border: 'none',
    borderRadius: 'var(--radius-md, 6px)',
    background: 'var(--bg-raised, #141420)',
    color: 'var(--text-primary, #e0e6ef)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
  },
  categoryLabel: {
    flex: 1,
  },
  categoryCount: {
    fontSize: 10,
    color: 'var(--text-muted, #384a5e)',
    fontWeight: 400,
  },
  categoryBody: {
    padding: '4px 0',
  },
  bindingRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px 6px 28px',
    fontSize: 12,
    borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.04))',
  },
  bindingDescription: {
    color: 'var(--text-secondary, #8a9cb5)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  customBadge: {
    fontSize: 9,
    padding: '1px 5px',
    borderRadius: 3,
    background: 'rgba(0, 200, 150, 0.2)',
    color: 'var(--brand-bright, #00d4aa)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  bindingActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  captureHint: {
    fontSize: 11,
    color: 'var(--brand-bright, #00d4aa)',
    fontStyle: 'italic',
    animation: 'pulse 1.5s infinite',
  },
  editBtn: {
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm, 4px)',
    border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
    background: 'transparent',
    color: 'var(--text-muted, #384a5e)',
    fontSize: 10,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  resetBtn: {
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm, 4px)',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted, #384a5e)',
    fontSize: 10,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textDecoration: 'underline',
  },
};
