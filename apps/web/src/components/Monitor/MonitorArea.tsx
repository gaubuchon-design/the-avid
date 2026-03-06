import React, { useRef, useEffect, useState } from 'react';
import { useEditorStore } from '../../store/editor.store';

function formatTC(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60),
        s = Math.floor(sec % 60), f = Math.floor((sec % 1) * 24);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(f).padStart(2,'0')}`;
}

function TransportControls({ isPlaying, onToggle }: { isPlaying: boolean; onToggle: () => void }) {
  return (
    <div className="transport-controls">
      <button className="transport-btn" title="Go to start (Home)">⏮</button>
      <button className="transport-btn" title="Back 1 frame (←)">◀</button>
      <button className="transport-btn" title="Rewind (J)">⏪</button>
      <button className="transport-btn play-btn" onClick={onToggle} title="Play/Pause (Space)">
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button className="transport-btn" title="Fast Forward (L)">⏩</button>
      <button className="transport-btn" title="Forward 1 frame (→)">▶</button>
      <button className="transport-btn" title="Go to end (End)">⏭</button>
    </div>
  );
}

interface MonitorProps {
  label: string;
  timecode: string;
  isPlaying?: boolean;
  onToggle?: () => void;
  showSafeZones?: boolean;
  content?: React.ReactNode;
}

function Monitor({ label, timecode, isPlaying = false, onToggle, showSafeZones, content }: MonitorProps) {
  const [vol, setVol] = useState(0.8);

  return (
    <div className="monitor">
      <div className="monitor-label">{label}</div>

      <div className="monitor-canvas">
        {content ?? (
          <div className="monitor-placeholder">
            <div className="monitor-placeholder-icon">▶</div>
            <div className="monitor-placeholder-text">No media loaded</div>
          </div>
        )}

        {showSafeZones && (
          <div className="safe-zone">
            <div className="safe-zone-action" />
            <div className="safe-zone-title" />
          </div>
        )}
      </div>

      <div className="monitor-footer">
        <div className="monitor-tc">{timecode}</div>

        {onToggle && (
          <TransportControls isPlaying={isPlaying} onToggle={onToggle} />
        )}

        <div className="monitor-vol">
          <span className="vol-icon">🔊</span>
          <input
            type="range" min={0} max={1} step={0.01} value={vol}
            className="vol-slider"
            onChange={e => setVol(parseFloat(e.target.value))}
          />
        </div>
      </div>
    </div>
  );
}

export function MonitorArea() {
  const { isPlaying, togglePlay, playheadTime, sourceAsset, inPoint, outPoint,
          setInPoint, setOutPoint, showSafeZones, toggleSafeZones } = useEditorStore();
  const [sourceTime, setSourceTime] = useState(0);

  // Source monitor scrub bar
  const scrubRef = useRef<HTMLDivElement>(null);

  const ScrubBar = ({ time, duration = 30, isSource }: { time: number; duration?: number; isSource?: boolean }) => (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: 4,
      background: 'var(--bg-raised)', cursor: 'pointer',
    }}>
      {/* In/Out region */}
      {inPoint !== null && outPoint !== null && (
        <div style={{
          position: 'absolute',
          left: `${(inPoint / duration) * 100}%`,
          width: `${((outPoint - inPoint) / duration) * 100}%`,
          height: '100%',
          background: 'rgba(124,92,252,0.35)',
        }} />
      )}
      {/* Progress */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: `${(time / duration) * 100}%`,
        background: isSource ? 'var(--track-video)' : 'var(--playhead)',
        transition: 'width 0.05s linear',
      }} />
    </div>
  );

  return (
    <div className="monitors">
      {/* Source Monitor */}
      <Monitor
        label="SOURCE"
        timecode={formatTC(sourceTime)}
        showSafeZones={showSafeZones}
        content={
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', background: '#0a0c10' }}>
            {sourceAsset ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 8, opacity: 0.4 }}>
                  {sourceAsset.type === 'VIDEO' ? '🎬' : sourceAsset.type === 'AUDIO' ? '🎵' : '🖼'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sourceAsset.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                  {sourceAsset.duration ? formatTC(sourceAsset.duration) : '--'}
                </div>
              </div>
            ) : (
              <div className="monitor-placeholder">
                <div className="monitor-placeholder-icon">⬛</div>
                <div className="monitor-placeholder-text">Double-click asset to load</div>
              </div>
            )}
            {/* Source scrub indicator */}
            {sourceAsset?.duration && <ScrubBar time={sourceTime} duration={sourceAsset.duration} isSource />}
          </div>
        }
      />

      {/* Program Monitor */}
      <Monitor
        label="PROGRAM"
        timecode={formatTC(playheadTime)}
        isPlaying={isPlaying}
        onToggle={togglePlay}
        showSafeZones={showSafeZones}
        content={
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', background: '#070810' }}>
            {/* Simulated program output */}
            <div style={{ textAlign: 'center', opacity: 0.35 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🎬</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                TC: {formatTC(playheadTime)}
              </div>
            </div>

            {/* Playing indicator */}
            {isPlaying && (
              <div style={{
                position: 'absolute', top: 8, right: 10,
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 9, color: 'var(--playhead)',
                fontFamily: 'var(--font-mono)', fontWeight: 600,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--playhead)', animation: 'blink 1s infinite' }} />
                PLAY
              </div>
            )}

            <ScrubBar time={playheadTime} duration={30} />
          </div>
        }
      />
    </div>
  );
}
