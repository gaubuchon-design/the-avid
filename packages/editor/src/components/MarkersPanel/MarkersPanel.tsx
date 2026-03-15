// =============================================================================
//  THE AVID -- Markers Panel
//  Full-featured timeline marker management: list, add, edit, delete, color,
//  search/filter, sort, CSV import/export, click-to-navigate.
// =============================================================================

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useEditorStore, type Marker } from '../../store/editor.store';
import { Timecode } from '../../lib/timecode';

// ── Constants ────────────────────────────────────────────────────────────────

const MARKER_COLORS = [
  { value: '#ef4444', label: 'Red' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#22c55e', label: 'Green' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#f97316', label: 'Orange' },
  { value: '#a855f7', label: 'Purple' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#ffffff', label: 'White' },
] as const;

type SortField = 'time' | 'name';
type SortDir = 'asc' | 'desc';

// Extended marker with notes/duration for panel-level editing
interface MarkerEntry extends Marker {
  notes: string;
  duration: number; // seconds
}

// ── Styles ───────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  backgroundColor: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 13,
  overflow: 'hidden',
  borderLeft: '1px solid var(--border-default)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 12px',
  borderBottom: '1px solid var(--border-default)',
  backgroundColor: 'var(--bg-raised)',
  flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: '0.01em',
};

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 12px',
  borderBottom: '1px solid var(--border-default)',
  backgroundColor: 'var(--bg-raised)',
  flexShrink: 0,
};

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  padding: '5px 8px',
  borderRadius: 4,
  border: '1px solid var(--border-default)',
  backgroundColor: 'var(--bg-void)',
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none',
};

const btnStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 4,
  border: '1px solid var(--border-default)',
  backgroundColor: 'var(--bg-raised)',
  color: 'var(--text-primary)',
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'background-color 0.15s ease',
};

const btnPrimaryStyle: React.CSSProperties = {
  ...btnStyle,
  backgroundColor: 'var(--brand)',
  color: '#fff',
  border: '1px solid var(--brand)',
};

const btnDangerStyle: React.CSSProperties = {
  ...btnStyle,
  backgroundColor: 'var(--error)',
  color: '#fff',
  border: '1px solid var(--error)',
};

const tableHeaderStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '32px 1fr 90px 60px 1fr 32px',
  gap: 4,
  padding: '6px 12px',
  borderBottom: '1px solid var(--border-default)',
  backgroundColor: 'var(--bg-void)',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  flexShrink: 0,
  userSelect: 'none',
};

const tableRowStyle = (isSelected: boolean): React.CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: '32px 1fr 90px 60px 1fr 32px',
  gap: 4,
  padding: '5px 12px',
  borderBottom: '1px solid var(--border-default)',
  backgroundColor: isSelected ? 'var(--brand)' : 'transparent',
  color: isSelected ? '#fff' : 'var(--text-primary)',
  cursor: 'pointer',
  alignItems: 'center',
  fontSize: 12,
  transition: 'background-color 0.1s ease',
});

const listContainerStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  borderTop: '1px solid var(--border-default)',
  backgroundColor: 'var(--bg-raised)',
  fontSize: 11,
  color: 'var(--text-muted)',
  flexShrink: 0,
};

const colorSwatchStyle = (color: string, size = 14): React.CSSProperties => ({
  width: size,
  height: size,
  borderRadius: 3,
  backgroundColor: color,
  border: color === '#ffffff' ? '1px solid var(--border-default)' : '1px solid transparent',
  cursor: 'pointer',
  flexShrink: 0,
});

const colorPickerDropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  zIndex: 100,
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 4,
  padding: 6,
  borderRadius: 6,
  backgroundColor: 'var(--bg-raised)',
  border: '1px solid var(--border-default)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
};

const inlineInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '2px 4px',
  borderRadius: 3,
  border: '1px solid var(--brand)',
  backgroundColor: 'var(--bg-void)',
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none',
};

const emptyStateStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: 32,
  color: 'var(--text-muted)',
  fontSize: 13,
  textAlign: 'center',
};

const sortBtnStyle = (active: boolean): React.CSSProperties => ({
  ...btnStyle,
  fontSize: 10,
  padding: '3px 8px',
  backgroundColor: active ? 'var(--brand)' : 'var(--bg-raised)',
  color: active ? '#fff' : 'var(--text-secondary)',
  border: active ? '1px solid var(--brand)' : '1px solid var(--border-default)',
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function createTimecodeHelper(fps = 24): Timecode {
  return new Timecode({ fps, dropFrame: false });
}

function markerToEntry(m: Marker): MarkerEntry {
  return { ...m, notes: '', duration: 0 };
}

function entriesToCSV(entries: MarkerEntry[], tc: Timecode): string {
  const header = 'Color,Name,Timecode,Duration,Notes';
  const rows = entries.map((e) => {
    const timecodeStr = tc.secondsToTC(e.time);
    const durStr = tc.secondsToTC(e.duration);
    const escapedLabel = `"${e.label.replace(/"/g, '""')}"`;
    const escapedNotes = `"${e.notes.replace(/"/g, '""')}"`;
    return `${e.color},${escapedLabel},${timecodeStr},${durStr},${escapedNotes}`;
  });
  return [header, ...rows].join('\n');
}

function csvToEntries(csv: string, tc: Timecode): Partial<MarkerEntry>[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  // skip header
  return lines.slice(1).map((line) => {
    // Handle quoted fields
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current);

    const [color = '#f59e0b', label = 'Marker', timecodeStr = '00:00:00:00', durationStr = '00:00:00:00', notes = ''] = fields;
    return {
      color,
      label,
      time: tc.tcToSeconds(timecodeStr),
      duration: tc.tcToSeconds(durationStr),
      notes,
    };
  });
}

// ── Color Picker ─────────────────────────────────────────────────────────────

function ColorPickerInline({
  currentColor,
  onSelect,
  onClose,
}: {
  currentColor: string;
  onSelect: (color: string) => void;
  onClose: () => void;
}) {
  return (
    <div style={colorPickerDropdownStyle} onMouseLeave={onClose}>
      {MARKER_COLORS.map((c) => (
        <div
          key={c.value}
          title={c.label}
          style={{
            ...colorSwatchStyle(c.value, 20),
            outline: c.value === currentColor ? '2px solid var(--brand-bright)' : 'none',
            outlineOffset: 1,
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(c.value);
          }}
        />
      ))}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function MarkersPanel() {
  const storeMarkers = useEditorStore((s) => s.markers);
  const playheadTime = useEditorStore((s) => s.playheadTime);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const addMarkerAtPlayhead = useEditorStore((s) => s.addMarkerAtPlayhead);
  const sequenceSettings = useEditorStore((s) => s.sequenceSettings);

  const tc = useMemo(
    () => createTimecodeHelper(sequenceSettings.fps),
    [sequenceSettings.fps],
  );

  // Local extended state (notes + duration live in panel until store supports them)
  const [localExtensions, setLocalExtensions] = useState<Record<string, { notes: string; duration: number }>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('time');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'label' | 'notes' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Merge store markers with local extensions
  const entries: MarkerEntry[] = useMemo(() => {
    return storeMarkers.map((m) => {
      const ext = localExtensions[m.id];
      return {
        ...m,
        notes: ext?.notes ?? '',
        duration: ext?.duration ?? 0,
      };
    });
  }, [storeMarkers, localExtensions]);

  // Filter
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.notes.toLowerCase().includes(q) ||
        tc.secondsToTC(e.time).includes(q),
    );
  }, [entries, searchQuery, tc]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp: number;
      if (sortField === 'time') {
        cmp = a.time - b.time;
      } else {
        cmp = a.label.localeCompare(b.label);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleAddMarker = useCallback(() => {
    addMarkerAtPlayhead();
  }, [addMarkerAtPlayhead]);

  const handleDeleteMarker = useCallback(
    (id: string) => {
      // Use immer-based store update via getState/setState
      const state = useEditorStore.getState();
      useEditorStore.setState({
        markers: state.markers.filter((m) => m.id !== id),
      });
      setLocalExtensions((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (selectedId === id) setSelectedId(null);
    },
    [selectedId],
  );

  const handleUpdateMarkerColor = useCallback((id: string, color: string) => {
    const state = useEditorStore.getState();
    useEditorStore.setState({
      markers: state.markers.map((m) => (m.id === id ? { ...m, color } : m)),
    });
    setColorPickerOpen(null);
  }, []);

  const handleUpdateMarkerLabel = useCallback((id: string, label: string) => {
    const state = useEditorStore.getState();
    useEditorStore.setState({
      markers: state.markers.map((m) => (m.id === id ? { ...m, label } : m)),
    });
  }, []);

  const handleUpdateNotes = useCallback((id: string, notes: string) => {
    setLocalExtensions((prev) => ({
      ...prev,
      [id]: { notes, duration: prev[id]?.duration ?? 0 },
    }));
  }, []);

  const handleClickMarker = useCallback(
    (marker: MarkerEntry) => {
      setSelectedId(marker.id);
      setPlayhead(marker.time);
    },
    [setPlayhead],
  );

  const handleStartEdit = useCallback(
    (id: string, field: 'label' | 'notes', currentValue: string) => {
      setEditingId(id);
      setEditingField(field);
      setEditValue(currentValue);
    },
    [],
  );

  const handleCommitEdit = useCallback(() => {
    if (!editingId || !editingField) return;
    if (editingField === 'label') {
      handleUpdateMarkerLabel(editingId, editValue);
    } else {
      handleUpdateNotes(editingId, editValue);
    }
    setEditingId(null);
    setEditingField(null);
    setEditValue('');
  }, [editingId, editingField, editValue, handleUpdateMarkerLabel, handleUpdateNotes]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleCommitEdit();
      } else if (e.key === 'Escape') {
        setEditingId(null);
        setEditingField(null);
      }
    },
    [handleCommitEdit],
  );

  const handleSortToggle = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir('asc');
      }
    },
    [sortField],
  );

  // ── CSV Import/Export ────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    const csvContent = entriesToCSV(entries, tc);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'markers.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [entries, tc]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result;
        if (typeof text !== 'string') return;
        const parsed = csvToEntries(text, tc);
        const state = useEditorStore.getState();
        const newMarkers = [...state.markers];
        const newExts = { ...localExtensions };
        parsed.forEach((p) => {
          const id = `marker-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          newMarkers.push({
            id,
            time: p.time ?? 0,
            label: p.label ?? 'Imported',
            color: p.color ?? '#f59e0b',
          });
          newExts[id] = {
            notes: p.notes ?? '',
            duration: p.duration ?? 0,
          };
        });
        useEditorStore.setState({ markers: newMarkers });
        setLocalExtensions(newExts);
      };
      reader.readAsText(file);
      // Reset input so re-selecting same file triggers change
      e.target.value = '';
    },
    [tc, localExtensions],
  );

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={titleStyle}>Markers</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={btnPrimaryStyle} onClick={handleAddMarker} title="Add marker at playhead">
            + Add
          </button>
        </div>
      </div>

      {/* Toolbar: search + sort + import/export */}
      <div style={toolbarStyle}>
        <input
          type="text"
          placeholder="Search markers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={searchInputStyle}
        />
        <button
          style={sortBtnStyle(sortField === 'time')}
          onClick={() => handleSortToggle('time')}
          title={`Sort by time ${sortField === 'time' ? (sortDir === 'asc' ? '(asc)' : '(desc)') : ''}`}
        >
          Time {sortField === 'time' ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : ''}
        </button>
        <button
          style={sortBtnStyle(sortField === 'name')}
          onClick={() => handleSortToggle('name')}
          title={`Sort by name ${sortField === 'name' ? (sortDir === 'asc' ? '(asc)' : '(desc)') : ''}`}
        >
          Name {sortField === 'name' ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : ''}
        </button>
      </div>

      {/* Table header */}
      <div style={tableHeaderStyle}>
        <span>Color</span>
        <span>Name</span>
        <span>Timecode</span>
        <span>Dur</span>
        <span>Notes</span>
        <span></span>
      </div>

      {/* Marker list */}
      <div style={listContainerStyle}>
        {sorted.length === 0 ? (
          <div style={emptyStateStyle}>
            <span style={{ fontSize: 24 }}>M</span>
            <span>No markers yet</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Click "+ Add" to create a marker at the current playhead position
            </span>
          </div>
        ) : (
          sorted.map((entry) => (
            <div
              key={entry.id}
              style={tableRowStyle(selectedId === entry.id)}
              onClick={() => handleClickMarker(entry)}
              role="row"
              aria-selected={selectedId === entry.id}
            >
              {/* Color swatch with picker */}
              <div style={{ position: 'relative' }}>
                <div
                  style={colorSwatchStyle(entry.color)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setColorPickerOpen(colorPickerOpen === entry.id ? null : entry.id);
                  }}
                  title="Change color"
                />
                {colorPickerOpen === entry.id && (
                  <ColorPickerInline
                    currentColor={entry.color}
                    onSelect={(c) => handleUpdateMarkerColor(entry.id, c)}
                    onClose={() => setColorPickerOpen(null)}
                  />
                )}
              </div>

              {/* Name (editable) */}
              <div
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleStartEdit(entry.id, 'label', entry.label);
                }}
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {editingId === entry.id && editingField === 'label' ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleCommitEdit}
                    onKeyDown={handleEditKeyDown}
                    style={inlineInputStyle}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  entry.label
                )}
              </div>

              {/* Timecode */}
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: selectedId === entry.id ? '#fff' : 'var(--text-secondary)' }}>
                {tc.secondsToTC(entry.time)}
              </span>

              {/* Duration */}
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: selectedId === entry.id ? '#fff' : 'var(--text-muted)' }}>
                {tc.secondsToTC(entry.duration)}
              </span>

              {/* Notes (editable) */}
              <div
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleStartEdit(entry.id, 'notes', entry.notes);
                }}
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: selectedId === entry.id ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)',
                  fontStyle: entry.notes ? 'normal' : 'italic',
                }}
              >
                {editingId === entry.id && editingField === 'notes' ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleCommitEdit}
                    onKeyDown={handleEditKeyDown}
                    style={inlineInputStyle}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  entry.notes || 'Double-click to add'
                )}
              </div>

              {/* Delete button */}
              <button
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: selectedId === entry.id ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 14,
                  lineHeight: 1,
                  padding: 0,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteMarker(entry.id);
                }}
                title="Delete marker"
                aria-label={`Delete marker ${entry.label}`}
              >
                &#x2715;
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer: count + CSV actions */}
      <div style={footerStyle}>
        <span>
          {sorted.length} marker{sorted.length !== 1 ? 's' : ''}
          {searchQuery && ` (filtered from ${entries.length})`}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={btnStyle} onClick={handleImport} title="Import markers from CSV">
            Import CSV
          </button>
          <button
            style={btnStyle}
            onClick={handleExport}
            title="Export markers as CSV"
            disabled={entries.length === 0}
          >
            Export CSV
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
