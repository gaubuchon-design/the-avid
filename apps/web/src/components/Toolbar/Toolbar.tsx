import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '../../store/editor.store';

function formatTC(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60),
        s = Math.floor(sec % 60), f = Math.floor((sec % 1) * 24);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(f).padStart(2,'0')}`;
}

interface TBtnProps {
  label: string; icon: string; shortcut?: string;
  active?: boolean; danger?: boolean; wide?: boolean; onClick?: () => void;
}
function TBtn({ label, icon, shortcut, active, danger, wide, onClick }: TBtnProps) {
  return (
    <div className="tooltip-wrap">
      <button
        className={`toolbar-btn${wide ? ' toolbar-btn-wide' : ''}${active ? ' active' : ''}${danger ? ' danger' : ''}`}
        onClick={onClick}
      >
        <span>{icon}</span>
        {wide && <span>{label}</span>}
      </button>
      <div className="tooltip">{label}{shortcut ? ` · ${shortcut}` : ''}</div>
    </div>
  );
}

type ToolMode = 'select' | 'trim' | 'razor' | 'slip' | 'slide' | 'hand';
type PanelType = 'edit' | 'color' | 'audio' | 'effects' | 'publish';

export function Toolbar() {
  const navigate = useNavigate();
  const { isPlaying, togglePlay, playheadTime, showAIPanel, toggleAIPanel,
    collabUsers, tokenBalance, activePanel, setActivePanel } = useEditorStore();
  const [toolMode, setToolMode] = React.useState<ToolMode>('select');

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
    { mode: 'trim',   icon: '⊣', label: 'Trim',   shortcut: 'T' },
    { mode: 'razor',  icon: '✂', label: 'Cut',    shortcut: 'B' },
    { mode: 'slip',   icon: '⇄', label: 'Slip',   shortcut: 'Y' },
    { mode: 'slide',  icon: '⟺', label: 'Slide',  shortcut: 'U' },
    { mode: 'hand',   icon: '✋', label: 'Hand',   shortcut: 'H' },
  ];

  const workspaces: PanelType[] = ['edit', 'color', 'audio', 'effects', 'publish'];

  return (
    <div className="toolbar">
      {/* Logo */}
      <div className="toolbar-label" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
        The<span> Avid</span>
      </div>

      {/* Workspace tabs */}
      <div className="toolbar-group">
        {workspaces.map(w => (
          <button key={w}
            className={`toolbar-btn toolbar-btn-wide${activePanel === w ? ' active' : ''}`}
            onClick={() => setActivePanel(w as any)}
            style={{ textTransform: 'capitalize' }}
          >{w}</button>
        ))}
      </div>

      <div className="divider" />

      {/* Tool modes */}
      <div className="toolbar-group">
        {tools.map(t => (
          <TBtn key={t.mode} label={t.label} icon={t.icon} shortcut={t.shortcut}
            active={toolMode === t.mode} onClick={() => setToolMode(t.mode)} />
        ))}
      </div>

      <div className="toolbar-group">
        <TBtn label="Undo" icon="↩" shortcut="⌘Z" />
        <TBtn label="Redo" icon="↪" shortcut="⌘⇧Z" />
      </div>

      <div className="toolbar-group">
        <TBtn label="Lift" icon="↑" shortcut="Z" />
        <TBtn label="Extract" icon="⇥" shortcut="X" />
        <TBtn label="Overwrite" icon="▼" wide shortcut="B" />
        <TBtn label="Splice-in" icon="▶" wide shortcut="V" />
      </div>

      <div className="toolbar-spacer" />

      {/* Timecode */}
      <div className="timecode-display">{formatTC(playheadTime)}</div>

      <div className="toolbar-spacer" />

      {/* Collaborators */}
      <div className="toolbar-group" style={{ gap: 6, paddingRight: 10 }}>
        <div className="collab-avatars">
          {collabUsers.map((u, i) => (
            <div key={u.id} className="collab-avatar"
              style={{ background: u.color, zIndex: collabUsers.length - i }}
              title={u.displayName}
            >{u.displayName[0]}</div>
          ))}
        </div>
      </div>

      {/* AI toggle */}
      <div className="toolbar-group">
        <button
          className={`toolbar-btn toolbar-btn-wide${showAIPanel ? ' active' : ''}`}
          onClick={toggleAIPanel}
        >
          <span>✦</span>
          <span>AI</span>
          <span style={{
            fontSize: 9, background: 'var(--accent-muted)',
            color: 'var(--text-accent)', borderRadius: 3,
            padding: '1px 4px', fontFamily: 'var(--font-mono)',
          }}>{tokenBalance}</span>
        </button>
      </div>

      <div className="toolbar-group">
        <TBtn label="Project Settings" icon="⚙" />
        <button className="toolbar-btn toolbar-btn-wide btn-primary"
          style={{ background: 'var(--brand)', color: '#fff', padding: '0 12px' }}>
          <span>⬆</span><span>Export</span>
        </button>
      </div>
    </div>
  );
}
