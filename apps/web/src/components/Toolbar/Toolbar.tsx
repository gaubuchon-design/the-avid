import React, { useEffect, useRef } from 'react';
import { useEditorStore } from '../../store/editor.store';

function formatTimecode(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const f = Math.floor((sec % 1) * 24);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(f).padStart(2,'0')}`;
}

interface ToolbarBtnProps {
  label: string;
  icon: string;
  shortcut?: string;
  active?: boolean;
  danger?: boolean;
  wide?: boolean;
  onClick?: () => void;
}
function TBtn({ label, icon, shortcut, active, danger, wide, onClick }: ToolbarBtnProps) {
  return (
    <div className="tooltip-wrap">
      <button
        className={`toolbar-btn${wide ? ' toolbar-btn-wide' : ''}${active ? ' active' : ''}${danger ? ' danger' : ''}`}
        onClick={onClick}
        title={label}
      >
        <span>{icon}</span>
        {wide && <span style={{ fontSize: 11 }}>{label}</span>}
      </button>
      <div className="tooltip">{label}{shortcut ? ` (${shortcut})` : ''}</div>
    </div>
  );
}

type ToolMode = 'select' | 'trim' | 'razor' | 'slip' | 'slide' | 'hand';

export function Toolbar() {
  const {
    isPlaying, togglePlay, playheadTime, showAIPanel, toggleAIPanel,
    showCollabPanel, toggleCollabPanel, collabUsers, tokenBalance, activePanel, setActivePanel,
  } = useEditorStore();

  const [toolMode, setToolMode] = React.useState<ToolMode>('select');
  const [showWorkspaceMenu, setShowWorkspaceMenu] = React.useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (['INPUT','TEXTAREA'].includes((e.target as Element)?.tagName)) return;
      switch (e.key) {
        case ' ': e.preventDefault(); togglePlay(); break;
        case 'v': case 'V': setToolMode('select'); break;
        case 't': case 'T': setToolMode('trim'); break;
        case 'b': case 'B': setToolMode('razor'); break;
        case 'y': case 'Y': setToolMode('slip'); break;
        case 'u': case 'U': setToolMode('slide'); break;
        case 'h': case 'H': setToolMode('hand'); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlay]);

  const tools: Array<{ mode: ToolMode; icon: string; label: string; shortcut: string }> = [
    { mode: 'select', icon: '↖', label: 'Select', shortcut: 'V' },
    { mode: 'trim',   icon: '⊣', label: 'Trim', shortcut: 'T' },
    { mode: 'razor',  icon: '✂', label: 'Razor / Cut', shortcut: 'B' },
    { mode: 'slip',   icon: '⇄', label: 'Slip', shortcut: 'Y' },
    { mode: 'slide',  icon: '⟺', label: 'Slide', shortcut: 'U' },
    { mode: 'hand',   icon: '✋', label: 'Hand', shortcut: 'H' },
  ];

  const workspaces: PanelType[] = ['edit', 'color', 'audio', 'effects', 'publish'];
  type PanelType = 'edit' | 'color' | 'audio' | 'effects' | 'publish';

  return (
    <div className="toolbar">
      {/* Logo */}
      <div className="toolbar-label" style={{ marginRight: 8 }}>
        The<span> Avid</span>
      </div>

      {/* Workspace tabs */}
      <div className="toolbar-group" style={{ gap: 1 }}>
        {workspaces.map(w => (
          <button
            key={w}
            className={`toolbar-btn toolbar-btn-wide${activePanel === w ? ' active' : ''}`}
            onClick={() => setActivePanel(w as any)}
            style={{ textTransform: 'capitalize', fontSize: 11 }}
          >
            {w}
          </button>
        ))}
      </div>

      {/* Tool modes */}
      <div className="toolbar-group">
        {tools.map(t => (
          <TBtn
            key={t.mode}
            label={t.label}
            icon={t.icon}
            shortcut={t.shortcut}
            active={toolMode === t.mode}
            onClick={() => setToolMode(t.mode)}
          />
        ))}
      </div>

      {/* Edit operations */}
      <div className="toolbar-group">
        <TBtn label="Undo" icon="↩" shortcut="⌘Z" />
        <TBtn label="Redo" icon="↪" shortcut="⌘⇧Z" />
      </div>

      <div className="toolbar-group">
        <TBtn label="Lift" icon="↑" shortcut="Z" />
        <TBtn label="Extract" icon="⇥" shortcut="X" />
        <TBtn label="Overwrite" icon="▼" shortcut="B" />
        <TBtn label="Splice-in" icon="▶" shortcut="V" />
      </div>

      {/* Spacer */}
      <div className="toolbar-spacer" />

      {/* Timecode */}
      <div className="timecode-display">{formatTimecode(playheadTime)}</div>

      <div className="toolbar-spacer" />

      {/* Collab avatars */}
      <div className="toolbar-group" style={{ gap: 0, paddingRight: 8 }}>
        <div className="collab-avatars">
          {collabUsers.map((u, i) => (
            <div
              key={u.id}
              className="collab-avatar collab-avatar-online"
              style={{ background: u.color, zIndex: collabUsers.length - i }}
              title={u.displayName}
            >
              {u.displayName[0]}
            </div>
          ))}
        </div>
        <div style={{ width: 8 }} />
        <button
          className={`toolbar-btn toolbar-btn-wide${showCollabPanel ? ' active' : ''}`}
          onClick={toggleCollabPanel}
          style={{ fontSize: 11 }}
        >
          💬 Collab
        </button>
      </div>

      {/* AI Panel toggle */}
      <div className="toolbar-group">
        <button
          className={`toolbar-btn toolbar-btn-wide${showAIPanel ? ' active' : ''}`}
          onClick={toggleAIPanel}
          style={{ fontSize: 11 }}
        >
          ✦ AI
          <span style={{
            fontSize: 9, background: 'var(--accent-muted)',
            color: 'var(--text-accent)', borderRadius: 3,
            padding: '1px 4px', marginLeft: 2, fontFamily: 'var(--font-mono)',
          }}>
            {tokenBalance}
          </span>
        </button>
      </div>

      {/* Settings */}
      <div className="toolbar-group">
        <TBtn label="Settings" icon="⚙" />
        <TBtn label="Export" icon="⬆" wide label="Export" />
      </div>
    </div>
  );
}
