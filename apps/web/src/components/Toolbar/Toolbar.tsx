import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '../../store/editor.store';
import { Timecode } from '../../lib/timecode';
import { UserAvatarMenu } from '../UserAvatarMenu';

export function Toolbar() {
  const navigate = useNavigate();
  const {
    isPlaying, playheadTime, showInspector, toggleInspector,
    toggleExportPanel, toggleSettingsPanel, toolbarTab, setToolbarTab, projectName,
    selectedClipIds,
    tracks, projectSettings,
  } = useEditorStore();

  const tc = new Timecode({ fps: projectSettings?.frameRate || 24 });

  // Get selected clip info for sub-bar
  const selectedClip = selectedClipIds.length > 0
    ? tracks.flatMap(t => t.clips).find(c => c.id === selectedClipIds[0])
    : null;
  const formatLabel = projectSettings
    ? `${projectSettings.width}x${projectSettings.height} · ${projectSettings.frameRate}fps`
    : 'Project settings';
  const transportLabel = isPlaying ? 'Playing' : 'Parked';

  // Undo/Redo now handled by global KeyboardEngine via EditorPage registrations

  return (
    <div className="toolbar-wrapper" role="banner">
      {/* Main toolbar row */}
      <div className="toolbar" role="toolbar" aria-label="Main toolbar">
        <div className="toolbar-left">
          <div className="toolbar-brand" aria-label="Application identity">
            <div className="toolbar-brand-mark">A</div>
            <div className="toolbar-brand-copy">
              <span className="toolbar-brand-name">The Avid</span>
              <span className="toolbar-brand-mode">Editorial</span>
            </div>
          </div>

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
        </div>

        <div className="toolbar-center" aria-label="Project summary">
          <div className="toolbar-project-name">{projectName || 'Untitled Project'}</div>
        </div>

        <div className="toolbar-right">
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

          <UserAvatarMenu />
        </div>
      </div>

      {/* Sub-bar: Timecode | Sequence Name | Clip name + TC */}
      <div className="toolbar-sub-bar" role="status" aria-label="Playback status">
        <div className="toolbar-sub-group">
          <div className="toolbar-sub-timecode" aria-live="polite" aria-label="Playhead timecode">{tc.secondsToTC(playheadTime)}</div>
          <span className="toolbar-sub-chip">{transportLabel}</span>
          <span className="toolbar-sub-chip">{formatLabel}</span>
        </div>
        <div className="toolbar-sub-group toolbar-sub-group-end">
          {selectedClip ? (
            <>
              <span className="toolbar-sub-clip-name">{selectedClip.name}</span>
              <span className="toolbar-sub-clip-tc">{tc.secondsToTC(selectedClip.endTime - selectedClip.startTime)}</span>
            </>
          ) : (
            <span className="toolbar-sub-chip toolbar-sub-chip-muted">No clip selected</span>
          )}
        </div>
      </div>
    </div>
  );
}
