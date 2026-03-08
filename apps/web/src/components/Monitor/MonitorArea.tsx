import React, { useState } from 'react';
import { getMediaAssetPlaybackUrl, getMediaAssetTechnicalSummary } from '@mcua/core';
import { useEditorStore } from '../../store/editor.store';

function formatTC(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60),
        s = Math.floor(sec % 60), f = Math.floor((sec % 1) * 24);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(f).padStart(2,'0')}`;
}

function Monitor({ label, labelClass, timecode, isPlaying, onToggle, showSafeZones, children }: {
  label: string; labelClass: string; timecode: string;
  isPlaying?: boolean; onToggle?: () => void;
  showSafeZones?: boolean; children?: React.ReactNode;
}) {
  const [vol, setVol] = useState(0.8);

  return (
    <div className="monitor">
      <div className="monitor-header">
        <span className={`monitor-label ${labelClass}`}>{label}</span>
        <span className="monitor-tc">{timecode}</span>
      </div>

      <div className="monitor-canvas">
        {children ?? (
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
        <div className="transport-controls">
          {[
            { icon: '⏮', label: 'Go to Start (Home)' },
            { icon: '◀', label: 'Prev Frame (←)' },
            { icon: '⏪', label: 'Rewind (J)' },
          ].map(btn => (
            <button key={btn.icon} className="transport-btn" title={btn.label}>{btn.icon}</button>
          ))}
          <button className="transport-btn play-btn" onClick={onToggle} title="Play/Pause (Space)">
            {isPlaying ? '⏸' : '▶'}
          </button>
          {[
            { icon: '⏩', label: 'Fast Forward (L)' },
            { icon: '▶', label: 'Next Frame (→)' },
            { icon: '⏭', label: 'Go to End (End)' },
          ].map(btn => (
            <button key={btn.icon + btn.label} className="transport-btn" title={btn.label}>{btn.icon}</button>
          ))}
        </div>

        <div className="monitor-vol">
          <span className="monitor-vol-icon" title="Volume">🔊</span>
          <input type="range" className="range-slider monitor-vol" min={0} max={1} step={0.01}
            value={vol} onChange={e => setVol(+e.target.value)} />
        </div>
      </div>
    </div>
  );
}

export function MonitorArea() {
  const { isPlaying, togglePlay, playheadTime, showSafeZones, sourceAsset, inPoint, outPoint } = useEditorStore();
  const sourceTC = inPoint !== null ? formatTC(inPoint) : '00:00:00:00';
  const playbackUrl = sourceAsset ? getMediaAssetPlaybackUrl(sourceAsset) : undefined;
  const technicalSummary = sourceAsset ? getMediaAssetTechnicalSummary(sourceAsset) : [];

  return (
    <div className="monitors-row" style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
      <Monitor
        label="Source"
        labelClass="source"
        timecode={sourceTC}
        showSafeZones={false}
      >
        {sourceAsset ? (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, padding: 12 }}>
            {playbackUrl && sourceAsset.type === 'VIDEO' ? (
              <video
                key={playbackUrl}
                src={playbackUrl}
                controls
                preload="metadata"
                style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 10, background: '#05070d' }}
              />
            ) : playbackUrl && sourceAsset.type === 'AUDIO' ? (
              <div style={{ display: 'grid', placeItems: 'center', gap: 12, height: '100%' }}>
                <div style={{ fontSize: 42, opacity: 0.45, color: 'var(--text-secondary)' }}>♪</div>
                <audio key={playbackUrl} src={playbackUrl} controls preload="metadata" style={{ width: '100%' }} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: 36, opacity: 0.4 }}>
                  {sourceAsset.type === 'AUDIO' ? '♪' : sourceAsset.type === 'IMAGE' ? '⬛' : '▶'}
                </div>
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                  {sourceAsset.name}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                {sourceAsset.name}
              </div>
              {sourceAsset.duration && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {formatTC(sourceAsset.duration)}
                </div>
              )}
              {technicalSummary.map((item) => (
                <span key={item} className="badge badge-muted">{item}</span>
              ))}
              {sourceAsset.proxyMetadata?.status === 'READY' && <span className="badge badge-accent">Proxy</span>}
              {sourceAsset.indexStatus && <span className="badge badge-muted">{sourceAsset.indexStatus.toLowerCase()}</span>}
            </div>
          </div>
        ) : undefined}
      </Monitor>

      <Monitor
        label="Record"
        labelClass="record"
        timecode={formatTC(playheadTime)}
        isPlaying={isPlaying}
        onToggle={togglePlay}
        showSafeZones={showSafeZones}
      />
    </div>
  );
}
