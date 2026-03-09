// ─── AI Command Palette (⌘K) ────────────────────────────────────────────────
// A unified command interface that can be invoked from anywhere in the editor.
// Combines natural language AI commands with structured editing actions.
// This is the "agentic-forward" unified experience — AI as a co-editor.

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useEditorStore } from '../../store/editor.store';

// ─── Command definitions ────────────────────────────────────────────────────

interface PaletteCommand {
  id: string;
  label: string;
  description: string;
  category: 'ai' | 'edit' | 'navigate' | 'view' | 'export';
  icon: string;
  shortcut?: string;
  action: () => void;
}

function usePaletteCommands(): PaletteCommand[] {
  const {
    duration,
    playheadTime,
    zoom,
    toggleAIPanel,
    toggleTranscriptPanel,
    toggleInspector,
    toggleExportPanel,
    setActiveTool,
    setPlayhead,
    setInPoint,
    setOutPoint,
    setZoom,
  } = useEditorStore(s => ({
    duration: s.duration,
    playheadTime: s.playheadTime,
    zoom: s.zoom,
    toggleAIPanel: s.toggleAIPanel,
    toggleTranscriptPanel: s.toggleTranscriptPanel,
    toggleInspector: s.toggleInspector,
    toggleExportPanel: s.toggleExportPanel,
    setActiveTool: s.setActiveTool,
    setPlayhead: s.setPlayhead,
    setInPoint: s.setInPoint,
    setOutPoint: s.setOutPoint,
    setZoom: s.setZoom,
  }));

  return useMemo(() => [
    // AI Commands
    {
      id: 'ai-assembly', label: 'AI: Generate Rough Cut', description: 'AI assembles a first-pass edit from bins + transcript',
      category: 'ai', icon: '⚡', action: () => { toggleAIPanel(); },
    },
    {
      id: 'ai-transcribe', label: 'AI: Transcribe All Media', description: 'Run Whisper across all media in project',
      category: 'ai', icon: '📝', action: () => { toggleTranscriptPanel(); },
    },
    {
      id: 'ai-captions', label: 'AI: Generate Captions', description: 'Auto-generate word-level subtitles',
      category: 'ai', icon: '💬', action: () => { toggleAIPanel(); },
    },
    {
      id: 'ai-color-match', label: 'AI: Match Colors Across Scenes', description: 'Automatically match exposure and color between clips',
      category: 'ai', icon: '🎨', action: () => { toggleAIPanel(); },
    },
    {
      id: 'ai-audio-mix', label: 'AI: Auto Audio Mix', description: 'Level, EQ, denoise, and duck all audio tracks',
      category: 'ai', icon: '🎵', action: () => { toggleAIPanel(); },
    },
    {
      id: 'ai-highlights', label: 'AI: Detect Highlights', description: 'Find key moments — action, emotion, beats',
      category: 'ai', icon: '🎯', action: () => { toggleAIPanel(); },
    },
    {
      id: 'ai-cleanup', label: 'AI: Timeline Cleanup', description: 'Remove gaps, fix sync, consolidate tracks',
      category: 'ai', icon: '🧹', action: () => { toggleAIPanel(); },
    },
    {
      id: 'ai-social', label: 'AI: Social Media Package', description: 'Generate vertical/square cuts with captions',
      category: 'ai', icon: '📱', action: () => { toggleAIPanel(); },
    },
    {
      id: 'ai-compliance', label: 'AI: Compliance Scan', description: 'Check loudness, gamut, accessibility',
      category: 'ai', icon: '✅', action: () => { toggleAIPanel(); },
    },

    // Edit Commands
    {
      id: 'edit-split', label: 'Split at Playhead', description: 'Split selected clip at current playhead position',
      category: 'edit', icon: '✂', shortcut: 'S',
      action: () => {
        const s = useEditorStore.getState();
        if (s.selectedClipIds.length > 0) s.splitClip(s.selectedClipIds[0], s.playheadTime);
      },
    },
    {
      id: 'edit-delete', label: 'Delete Selected', description: 'Remove selected clips from timeline',
      category: 'edit', icon: '🗑', shortcut: '⌫',
      action: () => useEditorStore.getState().deleteSelectedClips(),
    },
    {
      id: 'edit-ripple-delete', label: 'Ripple Delete', description: 'Delete clip and close the gap',
      category: 'edit', icon: '⟵', shortcut: '⇧⌫',
      action: () => {
        const s = useEditorStore.getState();
        if (s.selectedClipIds.length > 0) s.rippleDelete(s.selectedClipIds[0]);
      },
    },
    {
      id: 'edit-duplicate', label: 'Duplicate Clip', description: 'Create a copy of the selected clip',
      category: 'edit', icon: '📋', shortcut: '⌘D',
      action: () => {
        const s = useEditorStore.getState();
        if (s.selectedClipIds.length > 0) s.duplicateClip(s.selectedClipIds[0]);
      },
    },
    {
      id: 'edit-select-all', label: 'Select All Clips', description: 'Select all clips on all tracks',
      category: 'edit', icon: '☐', shortcut: '⌘A',
      action: () => {
        const s = useEditorStore.getState();
        const allClips = s.tracks.flatMap(t => t.clips);
        allClips.forEach((c, i) => s.selectClip(c.id, i > 0));
      },
    },
    {
      id: 'edit-tool-select', label: 'Select Tool', description: 'Switch to selection/pointer tool',
      category: 'edit', icon: '↖', shortcut: 'V', action: () => setActiveTool('select'),
    },
    {
      id: 'edit-tool-trim', label: 'Trim Tool', description: 'Switch to trim/ripple tool',
      category: 'edit', icon: '⟷', shortcut: 'T', action: () => setActiveTool('trim'),
    },
    {
      id: 'edit-tool-razor', label: 'Razor Tool', description: 'Switch to razor/cut tool',
      category: 'edit', icon: '✂', shortcut: 'C', action: () => setActiveTool('razor'),
    },

    // Navigate Commands
    {
      id: 'nav-start', label: 'Go to Start', description: 'Jump to the beginning of the timeline',
      category: 'navigate', icon: '⏮', shortcut: 'Home', action: () => setPlayhead(0),
    },
    {
      id: 'nav-end', label: 'Go to End', description: 'Jump to the end of the timeline',
      category: 'navigate', icon: '⏭', shortcut: 'End', action: () => setPlayhead(duration),
    },
    {
      id: 'nav-mark-in', label: 'Mark In Point', description: 'Set in point at current playhead',
      category: 'navigate', icon: '⊏', shortcut: 'I', action: () => setInPoint(playheadTime),
    },
    {
      id: 'nav-mark-out', label: 'Mark Out Point', description: 'Set out point at current playhead',
      category: 'navigate', icon: '⊐', shortcut: 'O', action: () => setOutPoint(playheadTime),
    },

    // View Commands
    {
      id: 'view-inspector', label: 'Toggle Inspector', description: 'Show or hide the inspector panel',
      category: 'view', icon: '⊞', action: () => toggleInspector(),
    },
    {
      id: 'view-transcript', label: 'Toggle Transcript', description: 'Show or hide the transcript panel',
      category: 'view', icon: '📄', action: () => toggleTranscriptPanel(),
    },
    {
      id: 'view-ai', label: 'Toggle AI Panel', description: 'Show or hide the AI assistant',
      category: 'view', icon: '✦', action: () => toggleAIPanel(),
    },
    {
      id: 'view-zoom-in', label: 'Zoom In', description: 'Increase timeline zoom level',
      category: 'view', icon: '🔍', shortcut: '⌘+', action: () => setZoom(zoom * 1.25),
    },
    {
      id: 'view-zoom-out', label: 'Zoom Out', description: 'Decrease timeline zoom level',
      category: 'view', icon: '🔍', shortcut: '⌘-', action: () => setZoom(zoom / 1.25),
    },

    // Export
    {
      id: 'export-open', label: 'Export / Deliver', description: 'Open the export panel',
      category: 'export', icon: '📤', action: () => toggleExportPanel(),
    },
  ], [duration, playheadTime, zoom, toggleAIPanel, toggleTranscriptPanel, toggleInspector, toggleExportPanel, setActiveTool, setPlayhead, setInPoint, setOutPoint, setZoom]);
}

// ─── Category labels ────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  ai: '✦ AI Actions',
  edit: 'Edit',
  navigate: 'Navigate',
  view: 'View',
  export: 'Export',
};

// ─── Command Palette Component ──────────────────────────────────────────────

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const commands = usePaletteCommands();

  // Filter commands by query
  const filtered = useMemo(() => {
    if (!query) return commands;
    const lower = query.toLowerCase();
    return commands.filter(
      cmd =>
        cmd.label.toLowerCase().includes(lower) ||
        cmd.description.toLowerCase().includes(lower) ||
        cmd.category.includes(lower)
    );
  }, [commands, query]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, PaletteCommand[]> = {};
    for (const cmd of filtered) {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    }
    return groups;
  }, [filtered]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset selection on filter change
  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIdx(prev => Math.min(prev + 1, filtered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIdx(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filtered[selectedIdx]) {
            filtered[selectedIdx].action();
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filtered, selectedIdx, onClose]
  );

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  // Pre-compute flat list of commands with global indices and category info
  const indexedItems = useMemo(() => {
    const items: { cmd: PaletteCommand; globalIdx: number; category: string; isFirstInCategory: boolean }[] = [];
    let idx = 0;
    for (const [category, cmds] of Object.entries(grouped)) {
      cmds.forEach((cmd, i) => {
        items.push({ cmd, globalIdx: idx, category, isFirstInCategory: i === 0 });
        idx++;
      });
    }
    return items;
  }, [grouped]);

  return (
    <div className="command-palette-backdrop" onClick={handleBackdropClick}>
      <div className="command-palette" role="dialog" aria-modal="true" aria-label="Command Palette">
        {/* Search input */}
        <div className="command-palette-input-row">
          <span className="command-palette-icon">✦</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or ask AI anything…"
            className="command-palette-input"
            aria-label="Search commands"
          />
          <kbd className="command-palette-kbd">esc</kbd>
        </div>

        {/* Results */}
        <div className="command-palette-results" ref={listRef} role="listbox">
          {filtered.length === 0 ? (
            <div className="command-palette-empty">
              No commands found. Try a different search term.
            </div>
          ) : (
            indexedItems.map(({ cmd, globalIdx, category, isFirstInCategory }) => (
              <React.Fragment key={cmd.id}>
                {isFirstInCategory && (
                  <div className="command-palette-category">
                    {CATEGORY_LABELS[category] || category}
                  </div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={globalIdx === selectedIdx}
                  data-idx={globalIdx}
                  className={`command-palette-item${globalIdx === selectedIdx ? ' selected' : ''}`}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIdx(globalIdx)}
                >
                  <span className="command-palette-item-icon">{cmd.icon}</span>
                  <div className="command-palette-item-text">
                    <span className="command-palette-item-label">{cmd.label}</span>
                    <span className="command-palette-item-desc">{cmd.description}</span>
                  </div>
                  {cmd.shortcut && (
                    <kbd className="command-palette-item-shortcut">{cmd.shortcut}</kbd>
                  )}
                </button>
              </React.Fragment>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="command-palette-footer">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>esc Close</span>
        </div>
      </div>
    </div>
  );
}
