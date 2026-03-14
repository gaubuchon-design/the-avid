import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '../../store/editor.store';
import { Timecode } from '../../lib/timecode';
import { UserAvatarMenu } from '../UserAvatarMenu';

export function Toolbar() {
  const navigate = useNavigate();
  const {
    isPlaying, togglePlay, playheadTime, showInspector, toggleInspector,
    toggleExportPanel, toggleSettingsPanel, toolbarTab, setToolbarTab, projectName,
    selectedClipIds, splitClip, showAIPanel, toggleAIPanel, tokenBalance,
    showTranscriptPanel, toggleTranscriptPanel,
    tracks, projectSettings,
  } = useEditorStore();

  const tc = new Timecode({ fps: projectSettings?.frameRate || 24 });

  // Get selected clip info for sub-bar
  const selectedClip = selectedClipIds.length > 0
    ? tracks.flatMap(t => t.clips).find(c => c.id === selectedClipIds[0])
    : null;

  // Undo/Redo now handled by global KeyboardEngine via EditorPage registrations

  return (
    <div className="toolbar-wrapper" role="banner">
      {/* Main toolbar row */}
      <div className="toolbar" role="toolbar" aria-label="Main toolbar">
        {/* Mac-style window dots */}
        <div className="toolbar-window-dots" aria-hidden="true">
          <span className="dot dot-close" />
          <span className="dot dot-minimize" />
          <span className="dot dot-maximize" />
        </div>

        {/* Home + Folder icons */}
        <button className="toolbar-icon-btn" onClick={() => navigate('/')} title="Home" aria-label="Home">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </button>
        <button className="toolbar-icon-btn" title="Open Project" aria-label="Open Project">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>
        </button>

        <div className="toolbar-divider" />

        {/* Undo / Redo */}
        <button className="toolbar-icon-btn" title="Undo (Cmd+Z)" aria-label="Undo"
          onClick={() => { import('../../engine/EditEngine').then(m => m.editEngine.undo()); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </button>
        <button className="toolbar-icon-btn" title="Redo (Cmd+Shift+Z)" aria-label="Redo"
          onClick={() => { import('../../engine/EditEngine').then(m => m.editEngine.redo()); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
          </svg>
        </button>

        <div className="toolbar-divider" />

        {/* Media / Effects tabs -- Figma style */}
        <div className="toolbar-nav-tabs" role="tablist" aria-label="Content tabs">
          <button
            className={`toolbar-nav-tab${toolbarTab === 'media' ? ' active' : ''}`}
            onClick={() => setToolbarTab('media')}
            role="tab"
            aria-selected={toolbarTab === 'media'}
            aria-label="Media tab"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="2" width="20" height="20" rx="2" /><circle cx="12" cy="12" r="3" />
            </svg>
            Media
          </button>
          <button
            className={`toolbar-nav-tab${toolbarTab === 'effects' ? ' active' : ''}`}
            onClick={() => setToolbarTab('effects')}
            role="tab"
            aria-selected={toolbarTab === 'effects'}
            aria-label="Effects tab"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Effects
          </button>
        </div>

        <div className="toolbar-spacer" />

        {/* Center: Project Name */}
        <div className="toolbar-project-name">{projectName || 'Project Name'}</div>

        <div className="toolbar-spacer" />

        {/* AI Toggle */}
        <button
          className={`toolbar-icon-btn toolbar-ai-btn${showAIPanel ? ' active' : ''}`}
          onClick={toggleAIPanel}
          title="AI Assistant"
          aria-label="AI Assistant"
        >
          <span>✦</span>
          <span className="toolbar-ai-label">AI</span>
          <span className="toolbar-ai-tokens">{tokenBalance}</span>
        </button>

        {/* Transcript toggle */}
        <button
          className={`toolbar-icon-btn${showTranscriptPanel ? ' active' : ''}`}
          onClick={toggleTranscriptPanel}
          title={showTranscriptPanel ? 'Hide Transcript' : 'Show Transcript'}
          aria-label={showTranscriptPanel ? 'Hide Transcript' : 'Show Transcript'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" />
          </svg>
        </button>

        {/* Export */}
        <button
          className="toolbar-icon-btn"
          onClick={toggleExportPanel}
          title="Export"
          aria-label="Export"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </button>

        {/* Inspector toggle — purple when active */}
        <button
          className={`toolbar-inspector-toggle${showInspector ? ' active' : ''}`}
          onClick={toggleInspector}
          title={showInspector ? 'Hide Inspector' : 'Show Inspector'}
          aria-label={showInspector ? 'Hide Inspector' : 'Show Inspector'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" />
          </svg>
          Inspector
        </button>

        {/* Settings */}
        <button
          className="toolbar-icon-btn"
          onClick={toggleSettingsPanel}
          title="Settings"
          aria-label="Settings"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>

        {/* User avatar menu */}
        <UserAvatarMenu />
      </div>

      {/* Sub-bar: Timecode | Sequence Name | Clip name + TC */}
      <div className="toolbar-sub-bar" role="status" aria-label="Playback status">
        <div className="toolbar-sub-timecode" aria-live="polite" aria-label="Playhead timecode">{tc.secondsToTC(playheadTime)}</div>
        <div className="toolbar-sub-spacer" />
        <div className="toolbar-sub-sequence">{projectName ? `${projectName} – edit` : 'Untitled Sequence'}</div>
        <span className="toolbar-sub-diamond">✦</span>
        {selectedClip ? (
          <>
            <span className="toolbar-sub-clip-name">{selectedClip.name}</span>
            <span className="toolbar-sub-clip-tc">{tc.secondsToTC(selectedClip.endTime - selectedClip.startTime)}</span>
          </>
        ) : (
          <span className="toolbar-sub-clip-name" style={{ opacity: 0.4 }}>No clip selected</span>
        )}
      </div>
    </div>
  );
}
