import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { exportProject } from '@mcua/core';
import { useEditorStore } from '../../store/editor.store';
import type { PanelType } from '../../store/editor.store';

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

export function Toolbar() {
  const navigate = useNavigate();
  const { togglePlay, playheadTime, showAIPanel, toggleAIPanel,
    collabUsers, tokenBalance, activePanel, setActivePanel, projectName,
    saveStatus, lastSavedAt, saveProject, setInToPlayhead, setOutToPlayhead,
    addMarkerAtPlayhead, matchFrame, liftSelection, extractSelection, toggleCommandPalette } = useEditorStore();
  const [toolMode, setToolMode] = React.useState<ToolMode>('select');
  const saveLabel = saveStatus === 'saving'
    ? 'Autosaving'
    : saveStatus === 'error'
    ? 'Save failed'
    : lastSavedAt
    ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : 'Unsaved';

  const handleExport = async () => {
    const project = await saveProject();
    if (!project) {
      return;
    }

    if (window.electronAPI) {
      await window.electronAPI.startExportJob(project);
      return;
    }

    const blob = new Blob([exportProject(project)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}.export.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (['INPUT','TEXTAREA'].includes((e.target as Element)?.tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleCommandPalette(true);
        return;
      }
      switch (e.key) {
        case ' ': e.preventDefault(); togglePlay(); break;
        case 'i': case 'I': setInToPlayhead(); break;
        case 'o': case 'O': setOutToPlayhead(); break;
        case 'm': case 'M': addMarkerAtPlayhead(); break;
        case 'f': case 'F': matchFrame(); break;
        case 'x': case 'X': extractSelection(); break;
        case 'z': case 'Z': liftSelection(); break;
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
  }, [addMarkerAtPlayhead, extractSelection, liftSelection, matchFrame, setInToPlayhead, setOutToPlayhead, toggleCommandPalette, togglePlay]);

  const tools: Array<{ mode: ToolMode; icon: string; label: string; shortcut: string }> = [
    { mode: 'select', icon: '↖', label: 'Select', shortcut: 'V' },
    { mode: 'trim',   icon: '⊣', label: 'Trim',   shortcut: 'T' },
    { mode: 'razor',  icon: '✂', label: 'Cut',    shortcut: 'B' },
    { mode: 'slip',   icon: '⇄', label: 'Slip',   shortcut: 'Y' },
    { mode: 'slide',  icon: '⟺', label: 'Slide',  shortcut: 'U' },
    { mode: 'hand',   icon: '✋', label: 'Hand',   shortcut: 'H' },
  ];

  const workspaces: PanelType[] = ['edit', 'script', 'review', 'ingest', 'color', 'audio', 'effects', 'publish'];
  const workspaceLabels: Record<PanelType, string> = {
    edit: 'Editorial',
    script: 'Script',
    review: 'Review',
    ingest: 'Ingest',
    color: 'Color',
    audio: 'Audio',
    effects: 'Effects',
    publish: 'Publish',
  };

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
            onClick={() => setActivePanel(w)}
          >{workspaceLabels[w]}</button>
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
        <TBtn label="Lift" icon="↑" shortcut="Z" onClick={liftSelection} />
        <TBtn label="Extract" icon="⇥" shortcut="X" onClick={extractSelection} />
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
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          minWidth: 170,
          padding: '0 10px',
          gap: 1,
        }}>
          <span className="truncate" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)' }}>
            {projectName}
          </span>
          <span style={{ fontSize: 9.5, color: saveStatus === 'error' ? 'var(--error)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {saveLabel}
          </span>
        </div>
      </div>

      <div className="toolbar-group">
        <button
          className="toolbar-btn toolbar-btn-wide"
          onClick={() => { void saveProject(); }}
        >
          <span>Save</span>
        </button>
        <TBtn label="Project Settings" icon="⚙" />
        <button className="toolbar-btn toolbar-btn-wide btn-primary"
          style={{ background: 'var(--brand)', color: '#fff', padding: '0 12px' }}
          onClick={handleExport}>
          <span>⬆</span><span>Export</span>
        </button>
      </div>
    </div>
  );
}
