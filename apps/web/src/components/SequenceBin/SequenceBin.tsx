import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useEditorStore, type Sequence } from '../../store/editor.store';
import { Timecode } from '../../lib/timecode';

// ─── Context Menu ────────────────────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  sequenceId: string;
}

function ContextMenu({
  state,
  onClose,
}: {
  state: ContextMenuState;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const loadSequenceInSource = useEditorStore((s) => s.loadSequenceInSource);
  const duplicateSequence = useEditorStore((s) => s.duplicateSequence);
  const deleteSequence = useEditorStore((s) => s.deleteSequence);
  const renameSequence = useEditorStore((s) => s.renameSequence);
  const sequences = useEditorStore((s) => s.sequences);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const seq = sequences.find((s) => s.id === state.sequenceId);

  const handleRename = () => {
    if (seq) {
      setRenameValue(seq.name);
      setIsRenaming(true);
    }
  };

  const commitRename = () => {
    if (renameValue.trim()) {
      renameSequence(state.sequenceId, renameValue.trim());
    }
    setIsRenaming(false);
    onClose();
  };

  const menuItemStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '6px 14px',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontSize: 12,
    textAlign: 'left',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  const menuItemHoverStyle = {
    backgroundColor: 'var(--brand)',
    color: '#fff',
  };

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: state.x,
        top: state.y,
        zIndex: 10000,
        minWidth: 180,
        backgroundColor: 'var(--bg-raised)',
        border: '1px solid var(--border-default)',
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        padding: '4px 0',
        overflow: 'hidden',
      }}
    >
      {isRenaming ? (
        <div style={{ padding: '6px 10px' }}>
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') onClose();
            }}
            onBlur={commitRename}
            style={{
              width: '100%',
              padding: '4px 6px',
              border: '1px solid var(--brand)',
              borderRadius: 4,
              backgroundColor: 'var(--bg-void)',
              color: 'var(--text-primary)',
              fontSize: 12,
              outline: 'none',
            }}
          />
        </div>
      ) : (
        <>
          <MenuItem
            label="Load in Source"
            onClick={() => {
              loadSequenceInSource(state.sequenceId);
              onClose();
            }}
            style={menuItemStyle}
            hoverStyle={menuItemHoverStyle}
          />
          <MenuItem
            label="Duplicate"
            onClick={() => {
              duplicateSequence(state.sequenceId);
              onClose();
            }}
            style={menuItemStyle}
            hoverStyle={menuItemHoverStyle}
          />
          <MenuItem
            label="Rename"
            onClick={handleRename}
            style={menuItemStyle}
            hoverStyle={menuItemHoverStyle}
          />
          <div style={{ height: 1, backgroundColor: 'var(--border-default)', margin: '4px 0' }} />
          <MenuItem
            label="Delete"
            onClick={() => {
              deleteSequence(state.sequenceId);
              onClose();
            }}
            style={{ ...menuItemStyle, color: '#f87171' }}
            hoverStyle={{ backgroundColor: '#f87171', color: '#fff' }}
          />
        </>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  style,
  hoverStyle,
}: {
  label: string;
  onClick: () => void;
  style: React.CSSProperties;
  hoverStyle: React.CSSProperties;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      style={{ ...style, ...(hovered ? hoverStyle : {}) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

// ─── Sequence Row ────────────────────────────────────────────────────────────

function SequenceRow({
  seq,
  isActive,
  isSource,
  onDoubleClick,
  onContextMenu,
  onDragStart,
}: {
  seq: Sequence;
  isActive: boolean;
  isSource: boolean;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const tc = new Timecode({ fps: seq.fps, dropFrame: seq.dropFrame });
  const durationTC = tc.secondsToTC(seq.duration);
  const trackCount = seq.tracks.length;
  const videoTracks = seq.tracks.filter((t) => t.type === 'VIDEO').length;
  const audioTracks = seq.tracks.filter((t) => t.type === 'AUDIO').length;
  const createdDate = new Date(seq.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  let borderColor = 'transparent';
  if (isActive) borderColor = 'var(--brand)';
  else if (isSource) borderColor = 'var(--brand-bright, #9cf)';
  else if (hovered) borderColor = 'var(--border-default)';

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto auto',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 6,
        border: `1px solid ${borderColor}`,
        backgroundColor: isActive
          ? 'rgba(91,110,244,0.12)'
          : isSource
            ? 'rgba(156,207,255,0.08)'
            : hovered
              ? 'var(--bg-raised)'
              : 'transparent',
        cursor: 'pointer',
        transition: 'background-color 0.15s, border-color 0.15s',
        userSelect: 'none',
      }}
    >
      {/* Name + badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: isActive ? 600 : 400,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {seq.name}
        </span>
        {isActive && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              color: 'var(--brand)',
              backgroundColor: 'rgba(91,110,244,0.15)',
              padding: '1px 5px',
              borderRadius: 3,
              flexShrink: 0,
            }}
          >
            REC
          </span>
        )}
        {isSource && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              color: 'var(--brand-bright, #9cf)',
              backgroundColor: 'rgba(156,207,255,0.12)',
              padding: '1px 5px',
              borderRadius: 3,
              flexShrink: 0,
            }}
          >
            SRC
          </span>
        )}
      </div>

      {/* Track count */}
      <span
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          whiteSpace: 'nowrap',
        }}
      >
        {videoTracks}V {audioTracks}A
      </span>

      {/* Duration timecode */}
      <span
        style={{
          fontSize: 11,
          color: 'var(--text-secondary)',
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
        }}
      >
        {durationTC}
      </span>

      {/* Created date */}
      <span
        style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          whiteSpace: 'nowrap',
        }}
      >
        {createdDate}
      </span>
    </div>
  );
}

// ─── SequenceBin Panel ──────────────────────────────────────────────────────

export function SequenceBin() {
  const sequences = useEditorStore((s) => s.sequences);
  const activeSequenceId = useEditorStore((s) => s.activeSequenceId);
  const sourceSequenceId = useEditorStore((s) => s.sourceSequenceId);
  const setActiveSequence = useEditorStore((s) => s.setActiveSequence);
  const loadSequenceInSource = useEditorStore((s) => s.loadSequenceInSource);
  const createSequence = useEditorStore((s) => s.createSequence);
  const toggleSequenceBin = useEditorStore((s) => s.toggleSequenceBin);

  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredSequences = searchQuery.trim()
    ? sequences.filter((s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sequences;

  const handleCreate = useCallback(() => {
    const nextNum = sequences.length + 1;
    createSequence(`Sequence ${nextNum}`);
  }, [sequences.length, createSequence]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, seqId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, sequenceId: seqId });
    },
    []
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, seqId: string) => {
      e.dataTransfer.setData('application/x-sequence-id', seqId);
      e.dataTransfer.effectAllowed = 'copy';
    },
    []
  );

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-default)',
        minWidth: 280,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-default)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: 0.3,
            textTransform: 'uppercase',
          }}
        >
          Sequences
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={handleCreate}
            title="New Sequence"
            style={{
              padding: '3px 10px',
              borderRadius: 4,
              border: '1px solid var(--border-default)',
              backgroundColor: 'var(--bg-raised)',
              color: 'var(--text-secondary)',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            + New
          </button>
          <button
            onClick={toggleSequenceBin}
            title="Close Sequence Bin"
            style={{
              padding: '3px 8px',
              borderRadius: 4,
              border: '1px solid var(--border-default)',
              backgroundColor: 'var(--bg-raised)',
              color: 'var(--text-muted)',
              fontSize: 13,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            &#x2715;
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '6px 12px', flexShrink: 0 }}>
        <input
          type="text"
          placeholder="Filter sequences..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '5px 8px',
            border: '1px solid var(--border-default)',
            borderRadius: 4,
            backgroundColor: 'var(--bg-void)',
            color: 'var(--text-primary)',
            fontSize: 11,
            outline: 'none',
          }}
        />
      </div>

      {/* Sequence List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 8px 8px',
        }}
      >
        {filteredSequences.length === 0 ? (
          <div
            style={{
              padding: '24px 12px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 12,
            }}
          >
            {searchQuery ? 'No sequences match the filter.' : 'No sequences in project.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {filteredSequences.map((seq) => (
              <SequenceRow
                key={seq.id}
                seq={seq}
                isActive={seq.id === activeSequenceId}
                isSource={seq.id === sourceSequenceId}
                onDoubleClick={() => setActiveSequence(seq.id)}
                onContextMenu={(e) => handleContextMenu(e, seq.id)}
                onDragStart={(e) => handleDragStart(e, seq.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer: source-to-record edit buttons */}
      {sourceSequenceId && (
        <SourceToRecordBar />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

// ─── Source-to-Record Bar ────────────────────────────────────────────────────

function SourceToRecordBar() {
  const editSourceToRecord = useEditorStore((s) => s.editSourceToRecord);
  const sourceSequenceId = useEditorStore((s) => s.sourceSequenceId);
  const sequences = useEditorStore((s) => s.sequences);

  const sourceSeq = sequences.find((s) => s.id === sourceSequenceId);
  if (!sourceSeq) return null;

  const btnStyle: React.CSSProperties = {
    flex: 1,
    padding: '6px 0',
    borderRadius: 4,
    border: '1px solid var(--border-default)',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  };

  return (
    <div
      style={{
        padding: '8px 12px',
        borderTop: '1px solid var(--border-default)',
        backgroundColor: 'var(--bg-raised)',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          marginBottom: 6,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        Source: {sourceSeq.name}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => editSourceToRecord('insert')}
          style={{
            ...btnStyle,
            backgroundColor: 'rgba(91,110,244,0.15)',
            color: 'var(--brand)',
          }}
          title="Insert edit: splice source into record at playhead (V)"
        >
          Insert
        </button>
        <button
          onClick={() => editSourceToRecord('overwrite')}
          style={{
            ...btnStyle,
            backgroundColor: 'rgba(244,91,110,0.15)',
            color: '#f45b6e',
          }}
          title="Overwrite edit: overwrite record with source at playhead (B)"
        >
          Overwrite
        </button>
      </div>
    </div>
  );
}
