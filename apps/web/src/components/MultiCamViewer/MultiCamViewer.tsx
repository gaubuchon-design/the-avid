import React, { useCallback, useMemo } from 'react';
import { useMediaStore } from '../../store/media.store';

// =============================================================================
//  Multi-Camera Viewer (FT-04)
// =============================================================================
//
//  Grid-based multi-camera monitoring panel that shows all angles in a group,
//  highlights the active angle, and supports live angle switching.
// =============================================================================

// ─── Styles ─────────────────────────────────────────────────────────────────

const panel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: 'var(--bg-surface, #1a1a2e)',
  color: 'var(--text-primary, #e0e0e0)',
  fontFamily: 'var(--font-display, system-ui), system-ui, sans-serif',
  fontSize: 12,
  overflow: 'hidden',
};

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 16px',
  borderBottom: '1px solid var(--border-default, #2a2a40)',
  fontWeight: 700,
  fontSize: 13,
  flexShrink: 0,
};

const toolbar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 16px',
  borderBottom: '1px solid var(--border-default, #2a2a40)',
  flexShrink: 0,
};

const toolbarBtn: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid var(--border-default, #2a2a40)',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--text-primary, #e0e0e0)',
  fontSize: 11,
  cursor: 'pointer',
  transition: 'background 0.15s',
};

const toolbarBtnActive: React.CSSProperties = {
  ...toolbarBtn,
  background: 'var(--accent-primary, #4f63f5)',
  borderColor: 'var(--accent-primary, #4f63f5)',
  color: '#fff',
};

const gridContainer: React.CSSProperties = {
  flex: 1,
  display: 'grid',
  gap: 4,
  padding: 8,
  overflow: 'auto',
};

const angleCell: React.CSSProperties = {
  position: 'relative',
  background: '#111122',
  borderRadius: 4,
  overflow: 'hidden',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'box-shadow 0.15s, border-color 0.15s',
  border: '2px solid transparent',
  minHeight: 80,
};

const angleCellActive: React.CSSProperties = {
  ...angleCell,
  boxShadow: '0 0 0 2px var(--accent-primary, #4f63f5)',
};

const angleLabel: React.CSSProperties = {
  position: 'absolute',
  bottom: 4,
  left: 6,
  fontSize: 10,
  fontWeight: 600,
  padding: '2px 6px',
  borderRadius: 3,
  background: 'rgba(0,0,0,0.7)',
  color: '#fff',
};

const angleBadge: React.CSSProperties = {
  position: 'absolute',
  top: 4,
  right: 6,
  fontSize: 9,
  fontWeight: 700,
  padding: '1px 5px',
  borderRadius: 3,
  textTransform: 'uppercase',
};

const emptyState: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  color: 'var(--text-secondary, #888)',
  fontSize: 13,
};

const statusBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 16px',
  borderTop: '1px solid var(--border-default, #2a2a40)',
  fontSize: 10,
  color: 'var(--text-secondary, #888)',
  flexShrink: 0,
};

const liveBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px',
  borderRadius: 3,
  background: '#e53e3e',
  color: '#fff',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.5,
};

// ─── Demo angles ────────────────────────────────────────────────────────────

interface DemoAngle {
  id: string;
  label: string;
  color: string;
  assetName: string;
}

const DEMO_ANGLES: DemoAngle[] = [
  { id: 'a1', label: 'Camera A', color: '#4f63f5', assetName: 'Wide Master' },
  { id: 'a2', label: 'Camera B', color: '#25a865', assetName: 'Close-Up A' },
  { id: 'a3', label: 'Camera C', color: '#e05b8e', assetName: 'Close-Up B' },
  { id: 'a4', label: 'Camera D', color: '#e8943a', assetName: 'Over Shoulder' },
];

// ─── Component ──────────────────────────────────────────────────────────────

export const MultiCamViewer: React.FC = () => {
  const viewMode = useMediaStore((s) => s.multiCamViewMode);
  const audioFollows = useMediaStore((s) => s.multiCamAudioFollowsVideo);
  const setViewMode = useMediaStore((s) => s.setMultiCamViewMode);
  const toggleAudioFollows = useMediaStore((s) => s.toggleMultiCamAudioFollowsVideo);
  const groups = useMediaStore((s) => s.multiCamGroups);
  const activeGroupId = useMediaStore((s) => s.activeMultiCamGroupId);

  const [activeAngle, setActiveAngle] = React.useState(0);
  const [isLive, setIsLive] = React.useState(false);

  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const angles = DEMO_ANGLES;

  const gridCols = useMemo(() => {
    const count = angles.length;
    if (count <= 1) return 1;
    if (count <= 4) return 2;
    if (count <= 9) return 3;
    return 4;
  }, [angles.length]);

  const handleAngleClick = useCallback((index: number) => {
    setActiveAngle(index);
  }, []);

  const handleToggleLive = useCallback(() => {
    setIsLive((prev) => !prev);
  }, []);

  return (
    <div style={panel}>
      {/* Header */}
      <div style={header}>
        <span>Multi-Camera Viewer</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {isLive && <span style={liveBadge}>LIVE</span>}
          <span style={{ fontSize: 11, color: 'var(--text-secondary, #888)' }}>
            {activeGroup?.name ?? 'Scene 1 Multicam'}
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div style={toolbar}>
        <button
          type="button"
          style={viewMode === 'grid' ? toolbarBtnActive : toolbarBtn}
          onClick={() => setViewMode('grid')}
        >
          Grid
        </button>
        <button
          type="button"
          style={viewMode === 'single' ? toolbarBtnActive : toolbarBtn}
          onClick={() => setViewMode('single')}
        >
          Single
        </button>
        <button
          type="button"
          style={viewMode === 'split' ? toolbarBtnActive : toolbarBtn}
          onClick={() => setViewMode('split')}
        >
          Split
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          style={audioFollows ? toolbarBtnActive : toolbarBtn}
          onClick={toggleAudioFollows}
          title="Audio follows active video angle"
        >
          Audio Follow
        </button>
        <button
          type="button"
          style={isLive ? { ...toolbarBtn, background: '#e53e3e', borderColor: '#e53e3e', color: '#fff' } : toolbarBtn}
          onClick={handleToggleLive}
        >
          {isLive ? 'Stop Live Switch' : 'Live Switch'}
        </button>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div
          style={{
            ...gridContainer,
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          }}
        >
          {angles.map((angle, idx) => (
            <div
              key={angle.id}
              style={{
                ...(idx === activeAngle ? angleCellActive : angleCell),
                borderColor: idx === activeAngle ? angle.color : 'transparent',
              }}
              onClick={() => handleAngleClick(idx)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleAngleClick(idx); }}
            >
              {/* Placeholder for video thumbnail */}
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: 80,
                  background: `linear-gradient(135deg, ${angle.color}22, ${angle.color}08)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  color: 'var(--text-secondary, #888)',
                }}
              >
                {angle.assetName}
              </div>

              {/* Label */}
              <span style={{ ...angleLabel, background: `${angle.color}cc` }}>
                {angle.label}
              </span>

              {/* Active badge */}
              {idx === activeAngle && (
                <span style={{ ...angleBadge, background: angle.color }}>
                  Active
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Single view */}
      {viewMode === 'single' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 8 }}>
          <div
            style={{
              flex: 1,
              background: '#111122',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              border: `2px solid ${angles[activeAngle]?.color ?? '#333'}`,
            }}
          >
            <span style={{ color: 'var(--text-secondary, #888)', fontSize: 14 }}>
              {angles[activeAngle]?.assetName ?? 'No angle selected'}
            </span>
            <span style={{ ...angleLabel, background: `${angles[activeAngle]?.color ?? '#333'}cc` }}>
              {angles[activeAngle]?.label ?? ''}
            </span>
          </div>
          {/* Angle selector strip */}
          <div style={{ display: 'flex', gap: 4, marginTop: 8, justifyContent: 'center' }}>
            {angles.map((angle, idx) => (
              <button
                key={angle.id}
                type="button"
                style={{
                  width: 32,
                  height: 24,
                  borderRadius: 3,
                  border: idx === activeAngle ? `2px solid ${angle.color}` : '1px solid #333',
                  background: idx === activeAngle ? `${angle.color}33` : '#111122',
                  color: '#fff',
                  fontSize: 9,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
                onClick={() => handleAngleClick(idx)}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Split view */}
      {viewMode === 'split' && (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 8 }}>
          {angles.slice(0, 2).map((angle, idx) => (
            <div
              key={angle.id}
              style={{
                ...(idx === activeAngle ? angleCellActive : angleCell),
                borderColor: idx === activeAngle ? angle.color : 'transparent',
              }}
              onClick={() => handleAngleClick(idx)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleAngleClick(idx); }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: 120,
                  background: `linear-gradient(135deg, ${angle.color}22, ${angle.color}08)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-secondary, #888)',
                }}
              >
                {angle.assetName}
              </div>
              <span style={{ ...angleLabel, background: `${angle.color}cc` }}>
                {angle.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Status bar */}
      <div style={statusBar}>
        <span>{angles.length} angles</span>
        <span>Active: {angles[activeAngle]?.label ?? 'None'}</span>
        <span>Audio: {audioFollows ? 'Follows Video' : 'Locked'}</span>
      </div>
    </div>
  );
};

export default MultiCamViewer;
