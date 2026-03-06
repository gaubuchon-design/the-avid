import React, { useCallback, useEffect } from 'react';
import { useEditorStore, WorkspaceMode } from '../../store/editorStore';
import { toTimecode } from '../../lib/timecode';

const WORKSPACES: { id: WorkspaceMode; label: string }[] = [
  { id: 'edit',    label: 'Edit' },
  { id: 'color',   label: 'Color' },
  { id: 'effects', label: 'Effects' },
  { id: 'audio',   label: 'Audio' },
  { id: 'publish', label: 'Publish' },
];

export default function Toolbar() {
  const {
    workspace, setWorkspace,
    playhead, isPlaying, setIsPlaying, setPlayhead,
    showSafeZones, toggleSafeZones,
    showWaveforms, toggleWaveforms,
    snapToGrid, toggleSnap,
    zoom, setZoom,
    projectName,
    timeline,
  } = useEditorStore();

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          setIsPlaying(!isPlaying);
          break;
        case 'j': setIsPlaying(false); break;
        case 'k': setIsPlaying(!isPlaying); break;
        case 'l': setIsPlaying(true); break;
        case 'Home': setPlayhead(0); break;
        case 'End':  setPlayhead(timeline?.duration ?? 0); break;
        case '+': case '=': setZoom(zoom * 1.5); break;
        case '-': setZoom(zoom / 1.5); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPlaying, zoom, timeline]);

  return (
    <header className="avid-toolbar">
      {/* Logo */}
      <div className="toolbar-logo">
        The <span>Avid</span>
      </div>

      {/* Edit tools */}
      <div className="toolbar-group">
        <button className="toolbar-btn active" title="Selection (A)">▲</button>
        <button className="toolbar-btn" title="Trim (T)">◂▸</button>
        <button className="toolbar-btn" title="Razor (C)">✂</button>
        <button className="toolbar-btn" title="Slip (Y)">⇆</button>
        <button className="toolbar-btn" title="Slide">⟺</button>
      </div>

      {/* Playback controls */}
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          title="Go to Start (Home)"
          onClick={() => setPlayhead(0)}
        >⏮</button>
        <button
          className="toolbar-btn"
          title="Step Back"
          onClick={() => setPlayhead(Math.max(0, playhead - 1/24))}
        >◁</button>
        <button
          className={`toolbar-btn ${isPlaying ? 'accent-active' : ''}`}
          title="Play/Pause (Space)"
          style={{ fontSize: 16 }}
          onClick={() => setIsPlaying(!isPlaying)}
        >{isPlaying ? '⏸' : '▶'}</button>
        <button
          className="toolbar-btn"
          title="Step Forward"
          onClick={() => setPlayhead(playhead + 1/24)}
        >▷</button>
        <button
          className="toolbar-btn"
          title="Go to End (End)"
          onClick={() => setPlayhead(timeline?.duration ?? 0)}
        >⏭</button>
      </div>

      {/* Timecode */}
      <div className="timecode-display" title="Current Timecode">
        {toTimecode(playhead)}
      </div>

      {/* View controls */}
      <div className="toolbar-group" style={{ marginLeft: 8 }}>
        <button
          className={`toolbar-btn ${showSafeZones ? 'active' : ''}`}
          title="Safe Zones"
          onClick={toggleSafeZones}
        >⊡</button>
        <button
          className={`toolbar-btn ${showWaveforms ? 'active' : ''}`}
          title="Waveforms"
          onClick={toggleWaveforms}
        >〜</button>
        <button
          className={`toolbar-btn ${snapToGrid ? 'active' : ''}`}
          title="Snap to Grid"
          onClick={toggleSnap}
        >⊞</button>
      </div>

      {/* Workspace switcher */}
      <div className="toolbar-spacer" />

      <div className="workspace-tabs" role="tablist" aria-label="Workspace">
        {WORKSPACES.map((ws) => (
          <button
            key={ws.id}
            role="tab"
            aria-selected={workspace === ws.id}
            className={`workspace-tab ${workspace === ws.id ? 'active' : ''}`}
            onClick={() => setWorkspace(ws.id)}
          >
            {ws.label}
          </button>
        ))}
      </div>

      <div className="toolbar-spacer" />

      {/* Project name + actions */}
      <span style={{
        fontSize: 11, color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-mono)', marginRight: 8,
        maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {projectName}
      </span>

      <button className="toolbar-btn" title="Export">⬆</button>
      <button className="toolbar-btn" title="Share">⤷</button>
      <button
        className="toolbar-btn"
        title="Settings"
        style={{ marginLeft: 4, color: 'var(--brand-bright)' }}
      >⚙</button>
    </header>
  );
}
