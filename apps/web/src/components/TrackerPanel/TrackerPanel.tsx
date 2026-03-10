// =============================================================================
//  Tracker Panel
//  UI panel for planar tracking: ROI drawing, forward/backward tracking,
//  progress display, and tracking data export.
// =============================================================================

import React, { useCallback, useMemo } from 'react';
import { useTrackingStore } from '../../store/tracking.store';
import { TrackingDataView } from './TrackingDataView';

// ─── Styles ─────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
  backgroundColor: '#1e1e2e',
  borderLeft: '1px solid #313244',
  width: 280,
  height: '100%',
  color: '#cdd6f4',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 13,
  overflow: 'auto',
};

const headerStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  paddingBottom: 8,
  borderBottom: '1px solid #313244',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#6c7086',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
};

const btnRow: React.CSSProperties = {
  display: 'flex',
  gap: 6,
};

const btnBase: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 6,
  border: '1px solid #313244',
  backgroundColor: '#313244',
  color: '#cdd6f4',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  flex: 1,
  textAlign: 'center' as const,
  transition: 'all 0.15s ease',
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  backgroundColor: '#89b4fa',
  color: '#1e1e2e',
  border: '1px solid #89b4fa',
};

const btnDanger: React.CSSProperties = {
  ...btnBase,
  backgroundColor: '#f38ba8',
  color: '#1e1e2e',
  border: '1px solid #f38ba8',
};

const progressContainer: React.CSSProperties = {
  height: 4,
  borderRadius: 2,
  backgroundColor: '#313244',
  overflow: 'hidden',
};

const progressBar = (pct: number): React.CSSProperties => ({
  height: '100%',
  width: `${pct * 100}%`,
  backgroundColor: '#a6e3a1',
  borderRadius: 2,
  transition: 'width 0.2s ease',
});

const statusText: React.CSSProperties = {
  fontSize: 12,
  color: '#a6adc8',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const regionChip: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid #313244',
  backgroundColor: 'rgba(137, 180, 250, 0.08)',
  fontSize: 12,
};

const noClipStyle: React.CSSProperties = {
  padding: 20,
  textAlign: 'center' as const,
  color: '#6c7086',
  fontSize: 13,
};

// ─── Component ──────────────────────────────────────────────────────────────

export const TrackerPanel: React.FC = () => {
  const mode = useTrackingStore((s) => s.mode);
  const sessions = useTrackingStore((s) => s.sessions);
  const activeRegionId = useTrackingStore((s) => s.activeRegionId);
  const activeClipId = useTrackingStore((s) => s.activeClipId);
  const showTrackingData = useTrackingStore((s) => s.showTrackingData);

  const startDrawing = useTrackingStore((s) => s.startDrawing);
  const cancelDrawing = useTrackingStore((s) => s.cancelDrawing);
  const deleteRegion = useTrackingStore((s) => s.deleteRegion);
  const trackForward = useTrackingStore((s) => s.trackForward);
  const trackBackward = useTrackingStore((s) => s.trackBackward);
  const cancelTracking = useTrackingStore((s) => s.cancelTracking);
  const setShowTrackingData = useTrackingStore((s) => s.setShowTrackingData);

  const activeSession = useMemo(() => {
    if (!activeRegionId) return null;
    return sessions[activeRegionId] ?? null;
  }, [sessions, activeRegionId]);

  const trackingProgress = activeSession?.data?.progress ?? 0;
  const trackingStatus = activeSession?.data?.status ?? 'idle';
  const frameCount = activeSession?.data?.frames.size ?? 0;

  // Placeholder frame provider — in practice wired to VideoSourceManager
  const dummyGetFrame = useCallback(async (_frame: number): Promise<ImageData> => {
    return new ImageData(1, 1);
  }, []);

  const handleTrackForward = useCallback(() => {
    if (!activeRegionId) return;
    // In practice: derive start/end from clip/playhead
    trackForward(activeRegionId, 0, 100, dummyGetFrame);
  }, [activeRegionId, trackForward, dummyGetFrame]);

  const handleTrackBackward = useCallback(() => {
    if (!activeRegionId) return;
    trackBackward(activeRegionId, 0, 100, dummyGetFrame);
  }, [activeRegionId, trackBackward, dummyGetFrame]);

  if (!activeClipId) {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>Planar Tracker</div>
        <div style={noClipStyle}>
          Select a clip in the timeline to begin tracking.
        </div>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        Planar Tracker
      </div>

      {/* ── Region Drawing ── */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Region of Interest</div>

        {mode === 'drawing' ? (
          <div style={btnRow}>
            <button style={btnDanger} onClick={cancelDrawing}>
              Cancel
            </button>
          </div>
        ) : (
          <div style={btnRow}>
            <button
              style={btnBase}
              onClick={() => startDrawing('rectangle')}
              disabled={mode === 'tracking'}
            >
              Rectangle
            </button>
            <button
              style={btnBase}
              onClick={() => startDrawing('polygon')}
              disabled={mode === 'tracking'}
            >
              Polygon
            </button>
          </div>
        )}

        {/* List existing regions */}
        {Object.entries(sessions).map(([id, session]) => (
          <div key={id} style={regionChip}>
            <span>
              {session.region.type === 'rectangle' ? '▭' : '⬡'}{' '}
              {session.region.id.slice(-4)} ({session.region.points.length} pts)
            </span>
            <button
              style={{
                background: 'none',
                border: 'none',
                color: '#f38ba8',
                cursor: 'pointer',
                fontSize: 14,
              }}
              onClick={() => deleteRegion(id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* ── Tracking Controls ── */}
      {activeRegionId && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Track</div>

          {mode === 'tracking' ? (
            <>
              <div style={progressContainer}>
                <div style={progressBar(trackingProgress)} />
              </div>
              <div style={statusText}>
                Tracking... {Math.round(trackingProgress * 100)}%
                ({frameCount} frames)
              </div>
              <button style={btnDanger} onClick={cancelTracking}>
                Cancel Tracking
              </button>
            </>
          ) : (
            <div style={btnRow}>
              <button style={btnBase} onClick={handleTrackBackward}>
                ◀ Backward
              </button>
              <button style={btnPrimary} onClick={handleTrackForward}>
                Forward ▶
              </button>
            </div>
          )}

          {trackingStatus === 'completed' && (
            <div style={{ ...statusText, color: '#a6e3a1' }}>
              Tracking complete — {frameCount} frames
            </div>
          )}

          {trackingStatus === 'failed' && (
            <div style={{ ...statusText, color: '#f38ba8' }}>
              Tracking failed: {activeSession?.data?.error}
            </div>
          )}
        </div>
      )}

      {/* ── Export / Apply ── */}
      {activeSession?.data?.status === 'completed' && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Apply Tracking Data</div>
          <button style={btnPrimary}>
            Apply to Corner Pin
          </button>
          <button style={btnBase}>
            Apply as Stabilizer
          </button>
          <button style={btnBase}>
            Export Keyframes
          </button>
        </div>
      )}

      {/* ── Tracking Data View ── */}
      {activeSession?.data && (
        <div style={sectionStyle}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#a6adc8', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showTrackingData}
              onChange={(e) => setShowTrackingData(e.target.checked)}
            />
            Show tracking data
          </label>
          {showTrackingData && <TrackingDataView data={activeSession.data} />}
        </div>
      )}
    </div>
  );
};
