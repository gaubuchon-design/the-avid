import React, { useCallback, useEffect } from 'react';
import { useEditorStore, PanelType } from '../../store/editor.store';
import { toTimecode } from '../../lib/timecode';

const WORKSPACES: { id: PanelType; label: string }[] = [
  { id: 'edit',    label: 'Edit' },
  { id: 'color',   label: 'Color' },
  { id: 'effects', label: 'Effects' },
  { id: 'audio',   label: 'Audio' },
  { id: 'publish', label: 'Publish' },
];

export default function Toolbar() {
  const {
    activePanel, setActivePanel,
    playheadTime, isPlaying, togglePlay, setPlayhead,
    showSafeZones, toggleSafeZones,
    showWaveforms, toggleWaveforms,
    snapToGrid, toggleSnap,
    zoom, setZoom,
    projectName,
    duration,
  } = useEditorStore();

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'j': if (isPlaying) togglePlay(); break;
        case 'k': togglePlay(); break;
        case 'l': if (!isPlaying) togglePlay(); break;
        case 'Home': setPlayhead(0); break;
        case 'End':  setPlayhead(duration); break;
        case '+': case '=': setZoom(zoom * 1.5); break;
        case '-': setZoom(zoom / 1.5); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPlaying, zoom, duration, togglePlay, setPlayhead, setZoom]);

  return (
    <header className="avid-toolbar">
      {/* Logo */}
      <div className="toolbar-logo">
        The <span>Avid</span>
      </div>

      {/* Edit tools */}
      <div className="toolbar-group">
        <button className="toolbar-btn active" title="Selection (A)">&#9650;</button>
        <button className="toolbar-btn" title="Trim (T)">&#9666;&#9656;</button>
        <button className="toolbar-btn" title="Razor (C)">&#9986;</button>
        <button className="toolbar-btn" title="Slip (Y)">&#8646;</button>
        <button className="toolbar-btn" title="Slide">&#10234;</button>
      </div>

      {/* Playback controls */}
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          title="Go to Start (Home)"
          onClick={() => setPlayhead(0)}
        >&#9198;</button>
        <button
          className="toolbar-btn"
          title="Step Back"
          onClick={() => setPlayhead(Math.max(0, playheadTime - 1/24))}
        >&#9665;</button>
        <button
          className={`toolbar-btn ${isPlaying ? 'accent-active' : ''}`}
          title="Play/Pause (Space)"
          style={{ fontSize: 16 }}
          onClick={() => togglePlay()}
        >{isPlaying ? '\u23F8' : '\u25B6'}</button>
        <button
          className="toolbar-btn"
          title="Step Forward"
          onClick={() => setPlayhead(playheadTime + 1/24)}
        >&#9655;</button>
        <button
          className="toolbar-btn"
          title="Go to End (End)"
          onClick={() => setPlayhead(duration)}
        >&#9197;</button>
      </div>

      {/* Timecode */}
      <div className="timecode-display" title="Current Timecode">
        {toTimecode(playheadTime)}
      </div>

      {/* View controls */}
      <div className="toolbar-group" style={{ marginLeft: 8 }}>
        <button
          className={`toolbar-btn ${showSafeZones ? 'active' : ''}`}
          title="Safe Zones"
          onClick={toggleSafeZones}
        >&#8865;</button>
        <button
          className={`toolbar-btn ${showWaveforms ? 'active' : ''}`}
          title="Waveforms"
          onClick={toggleWaveforms}
        >&#12316;</button>
        <button
          className={`toolbar-btn ${snapToGrid ? 'active' : ''}`}
          title="Snap to Grid"
          onClick={toggleSnap}
        >&#8862;</button>
      </div>

      {/* Workspace switcher */}
      <div className="toolbar-spacer" />

      <div className="workspace-tabs" role="tablist" aria-label="Workspace">
        {WORKSPACES.map((ws) => (
          <button
            key={ws.id}
            role="tab"
            aria-selected={activePanel === ws.id}
            className={`workspace-tab ${activePanel === ws.id ? 'active' : ''}`}
            onClick={() => setActivePanel(ws.id)}
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

      <button className="toolbar-btn" title="Export">&#11014;</button>
      <button className="toolbar-btn" title="Share">&#10551;</button>
      <button
        className="toolbar-btn"
        title="Settings"
        style={{ marginLeft: 4, color: 'var(--brand-bright)' }}
      >&#9881;</button>
    </header>
  );
}
