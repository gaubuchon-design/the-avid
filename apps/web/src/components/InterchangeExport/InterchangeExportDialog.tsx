import React, { useState, useCallback } from 'react';
import { useMediaStore } from '../../store/media.store';

// =============================================================================
//  Interchange Export Dialog (FT-01, FT-02, FT-08)
// =============================================================================
//
//  Unified export dialog for AAF, EDL/ALE/CSV, and Audio Stem exports.
//  Tabbed interface with format-specific options.
// =============================================================================

// ─── Styles ─────────────────────────────────────────────────────────────────

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const dialog: React.CSSProperties = {
  width: 640,
  maxHeight: '80vh',
  background: 'var(--bg-surface, #1a1a2e)',
  color: 'var(--text-primary, #e0e0e0)',
  borderRadius: 8,
  border: '1px solid var(--border-default, #2a2a40)',
  fontFamily: 'var(--font-display, system-ui), system-ui, sans-serif',
  fontSize: 12,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
};

const dialogHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 20px',
  borderBottom: '1px solid var(--border-default, #2a2a40)',
  fontWeight: 700,
  fontSize: 14,
};

const tabs: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--border-default, #2a2a40)',
};

const tab: React.CSSProperties = {
  flex: 1,
  padding: '10px 16px',
  textAlign: 'center',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
  background: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  color: 'var(--text-secondary, #888)',
  transition: 'color 0.15s, border-color 0.15s',
};

const tabActive: React.CSSProperties = {
  ...tab,
  color: 'var(--accent-primary, #4f63f5)',
  borderBottomColor: 'var(--accent-primary, #4f63f5)',
};

const body: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: 20,
};

const section: React.CSSProperties = {
  marginBottom: 20,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 8,
  color: 'var(--text-primary, #e0e0e0)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 0',
  gap: 12,
};

const label: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary, #aaa)',
  minWidth: 120,
};

const select: React.CSSProperties = {
  flex: 1,
  padding: '6px 10px',
  border: '1px solid var(--border-default, #2a2a40)',
  borderRadius: 4,
  background: '#111122',
  color: 'var(--text-primary, #e0e0e0)',
  fontSize: 12,
};

const checkbox: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
  fontSize: 12,
};

const footer: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  padding: '12px 20px',
  borderTop: '1px solid var(--border-default, #2a2a40)',
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 20px',
  borderRadius: 4,
  border: 'none',
  background: 'var(--accent-primary, #4f63f5)',
  color: '#fff',
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '8px 20px',
  borderRadius: 4,
  border: '1px solid var(--border-default, #2a2a40)',
  background: 'transparent',
  color: 'var(--text-primary, #e0e0e0)',
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer',
};

const stemRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  borderRadius: 4,
  background: '#111122',
  marginBottom: 4,
};

const stemDot: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  flexShrink: 0,
};

const progressBar: React.CSSProperties = {
  width: '100%',
  height: 4,
  borderRadius: 2,
  background: '#2a2a40',
  overflow: 'hidden',
  marginTop: 8,
};

// ─── Component ──────────────────────────────────────────────────────────────

export const InterchangeExportDialog: React.FC = () => {
  const activeTab = useMediaStore((s) => s.activeExportTab);
  const setActiveTab = useMediaStore((s) => s.setActiveExportTab);
  const showExportDialog = useMediaStore((s) => s.showExportDialog);
  const toggleExportDialog = useMediaStore((s) => s.toggleExportDialog);

  // AAF state
  const aafFormat = useMediaStore((s) => s.aafExportFormat);
  const setAafFormat = useMediaStore((s) => s.setAAFExportFormat);
  const aafIncludeMarkers = useMediaStore((s) => s.aafIncludeMarkers);
  const toggleMarkers = useMediaStore((s) => s.toggleAAFMarkers);
  const aafIncludeEffects = useMediaStore((s) => s.aafIncludeEffects);
  const toggleEffects = useMediaStore((s) => s.toggleAAFEffects);
  const aafEmbedMedia = useMediaStore((s) => s.aafEmbedMedia);
  const toggleEmbed = useMediaStore((s) => s.toggleAAFEmbedMedia);
  const aafStatus = useMediaStore((s) => s.aafExportStatus);
  const aafProgress = useMediaStore((s) => s.aafExportProgress);

  // EDL state
  const edlFormat = useMediaStore((s) => s.interchangeFormat);
  const setEdlFormat = useMediaStore((s) => s.setInterchangeFormat);
  const tcMode = useMediaStore((s) => s.interchangeTimecodeMode);
  const setTcMode = useMediaStore((s) => s.setInterchangeTimecodeMode);

  // Stem state
  const stems = useMediaStore((s) => s.stems);
  const stemFormat = useMediaStore((s) => s.stemFormat);
  const setStemFormat = useMediaStore((s) => s.setStemFormat);
  const stemBitDepth = useMediaStore((s) => s.stemBitDepth);
  const setStemBitDepth = useMediaStore((s) => s.setStemBitDepth);
  const stemPreset = useMediaStore((s) => s.stemPresetName);
  const setStemPreset = useMediaStore((s) => s.setStemPresetName);
  const toggleStemEnabled = useMediaStore((s) => s.toggleStemEnabled);

  const [exportStarted, setExportStarted] = useState(false);

  const handleExport = useCallback(() => {
    setExportStarted(true);
    // In production, this would call the appropriate engine
  }, []);

  if (!showExportDialog) return null;

  return (
    <div style={overlay} onClick={toggleExportDialog} role="presentation">
      <div style={dialog} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Export Dialog">
        {/* Header */}
        <div style={dialogHeader}>
          <span>Interchange Export</span>
          <button type="button" style={{ ...btnSecondary, padding: '4px 10px' }} onClick={toggleExportDialog}>
            Close
          </button>
        </div>

        {/* Tabs */}
        <div style={tabs}>
          <button
            type="button"
            style={activeTab === 'aaf' ? tabActive : tab}
            onClick={() => setActiveTab('aaf')}
          >
            AAF / OMF
          </button>
          <button
            type="button"
            style={activeTab === 'edl' ? tabActive : tab}
            onClick={() => setActiveTab('edl')}
          >
            EDL / ALE
          </button>
          <button
            type="button"
            style={activeTab === 'stems' ? tabActive : tab}
            onClick={() => setActiveTab('stems')}
          >
            Audio Stems
          </button>
        </div>

        {/* Body */}
        <div style={body}>
          {/* AAF Tab */}
          {activeTab === 'aaf' && (
            <>
              <div style={section}>
                <div style={sectionTitle}>Format</div>
                <div style={row}>
                  <span style={label}>Export Format</span>
                  <select
                    style={select}
                    value={aafFormat}
                    onChange={(e) => setAafFormat(e.target.value as 'aaf' | 'omf')}
                  >
                    <option value="aaf">AAF (Advanced Authoring Format)</option>
                    <option value="omf">OMF (Open Media Framework)</option>
                  </select>
                </div>
              </div>

              <div style={section}>
                <div style={sectionTitle}>Options</div>
                <div style={row}>
                  <label style={checkbox}>
                    <input type="checkbox" checked={aafIncludeMarkers} onChange={toggleMarkers} />
                    Include markers
                  </label>
                </div>
                <div style={row}>
                  <label style={checkbox}>
                    <input type="checkbox" checked={aafIncludeEffects} onChange={toggleEffects} />
                    Include effect parameters
                  </label>
                </div>
                <div style={row}>
                  <label style={checkbox}>
                    <input type="checkbox" checked={aafEmbedMedia} onChange={toggleEmbed} />
                    Embed media (increases file size)
                  </label>
                </div>
              </div>

              {aafStatus === 'exporting' && (
                <div style={section}>
                  <div style={sectionTitle}>Progress</div>
                  <div style={progressBar}>
                    <div style={{ width: `${aafProgress}%`, height: '100%', background: 'var(--accent-primary, #4f63f5)', borderRadius: 2, transition: 'width 0.2s' }} />
                  </div>
                  <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-secondary, #888)' }}>
                    {aafProgress}% complete
                  </div>
                </div>
              )}
            </>
          )}

          {/* EDL Tab */}
          {activeTab === 'edl' && (
            <>
              <div style={section}>
                <div style={sectionTitle}>Format</div>
                <div style={row}>
                  <span style={label}>Export Format</span>
                  <select
                    style={select}
                    value={edlFormat}
                    onChange={(e) => setEdlFormat(e.target.value as 'edl' | 'ale' | 'csv')}
                  >
                    <option value="edl">CMX 3600 EDL</option>
                    <option value="ale">Avid Log Exchange (ALE)</option>
                    <option value="csv">CSV (Comma Separated)</option>
                  </select>
                </div>
                <div style={row}>
                  <span style={label}>Timecode Mode</span>
                  <select
                    style={select}
                    value={tcMode}
                    onChange={(e) => setTcMode(e.target.value as 'non-drop' | 'drop-frame')}
                  >
                    <option value="non-drop">Non-Drop Frame</option>
                    <option value="drop-frame">Drop Frame</option>
                  </select>
                </div>
              </div>

              <div style={section}>
                <div style={sectionTitle}>Include</div>
                <div style={row}>
                  <label style={checkbox}>
                    <input type="checkbox" defaultChecked />
                    Comments / Clip Names
                  </label>
                </div>
                <div style={row}>
                  <label style={checkbox}>
                    <input type="checkbox" defaultChecked />
                    Speed Change Annotations
                  </label>
                </div>
              </div>
            </>
          )}

          {/* Stems Tab */}
          {activeTab === 'stems' && (
            <>
              <div style={section}>
                <div style={sectionTitle}>Preset</div>
                <div style={row}>
                  <span style={label}>Stem Preset</span>
                  <select
                    style={select}
                    value={stemPreset}
                    onChange={(e) => setStemPreset(e.target.value)}
                  >
                    <option value="Film/TV Standard">Film/TV Standard</option>
                    <option value="Broadcast DE/ME">Broadcast DE/ME</option>
                    <option value="Podcast Simple">Podcast Simple</option>
                    <option value="Music Video">Music Video</option>
                  </select>
                </div>
              </div>

              <div style={section}>
                <div style={sectionTitle}>Audio Format</div>
                <div style={row}>
                  <span style={label}>Format</span>
                  <select
                    style={select}
                    value={stemFormat}
                    onChange={(e) => setStemFormat(e.target.value as 'wav' | 'aiff')}
                  >
                    <option value="wav">WAV (Broadcast Wave)</option>
                    <option value="aiff">AIFF</option>
                  </select>
                </div>
                <div style={row}>
                  <span style={label}>Bit Depth</span>
                  <select
                    style={select}
                    value={stemBitDepth}
                    onChange={(e) => setStemBitDepth(Number(e.target.value) as 16 | 24 | 32)}
                  >
                    <option value={16}>16-bit</option>
                    <option value={24}>24-bit (Recommended)</option>
                    <option value={32}>32-bit float</option>
                  </select>
                </div>
                <div style={row}>
                  <span style={label}>Sample Rate</span>
                  <select style={select} defaultValue="48000">
                    <option value="44100">44.1 kHz</option>
                    <option value="48000">48 kHz (Broadcast Standard)</option>
                    <option value="96000">96 kHz</option>
                  </select>
                </div>
              </div>

              <div style={section}>
                <div style={sectionTitle}>Stems</div>
                {stems.length > 0 ? (
                  stems.map((stem) => (
                    <div key={stem.id} style={stemRow}>
                      <div style={{ ...stemDot, background: stem.color }} />
                      <span style={{ flex: 1, fontWeight: 600 }}>{stem.name}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary, #888)' }}>
                        {stem.trackIds.length} track{stem.trackIds.length !== 1 ? 's' : ''}
                      </span>
                      <label style={{ ...checkbox, fontSize: 11 }}>
                        <input
                          type="checkbox"
                          checked={stem.enabled}
                          onChange={() => toggleStemEnabled(stem.id)}
                        />
                        Export
                      </label>
                    </div>
                  ))
                ) : (
                  <div style={{ color: 'var(--text-secondary, #888)', fontSize: 12, padding: '16px 0', textAlign: 'center' }}>
                    Select a preset to configure stems, or add custom stems.
                  </div>
                )}
              </div>

              <div style={section}>
                <div style={sectionTitle}>Options</div>
                <div style={row}>
                  <label style={checkbox}>
                    <input type="checkbox" defaultChecked />
                    Embed timecode
                  </label>
                </div>
                <div style={row}>
                  <label style={checkbox}>
                    <input type="checkbox" />
                    Include full mix stem
                  </label>
                </div>
                <div style={row}>
                  <label style={checkbox}>
                    <input type="checkbox" />
                    Normalize peak levels
                  </label>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={footer}>
          <button type="button" style={btnSecondary} onClick={toggleExportDialog}>
            Cancel
          </button>
          <button type="button" style={btnPrimary} onClick={handleExport}>
            {activeTab === 'aaf' ? `Export ${aafFormat.toUpperCase()}` :
             activeTab === 'edl' ? `Export ${edlFormat.toUpperCase()}` :
             'Export Stems'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InterchangeExportDialog;
