// ─── Track Patch Panel ───────────────────────────────────────────────────────
//
// Narrow vertical strip between timeline track headers showing source→record
// track mappings, modeled after Avid Media Composer's track selector panel.
//
// - Left side: source track buttons (V1, A1, A2...) from loaded source asset
// - Right side: record track enable/disable indicators
// - Lines connecting patched pairs
// - Click source button to toggle patch on/off
// - Auto-patches when source asset loads via trackPatchingEngine.autoPatch()
//

import React, { useCallback, useEffect, useState } from 'react';
import { useEditorStore } from '../../store/editor.store';
import {
  trackPatchingEngine,
  type TrackPatch,
  type SourceTrackDescriptor,
} from '../../engine/TrackPatchingEngine';
import type { Track } from '../../store/editor.store';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function trackLabel(type: 'VIDEO' | 'AUDIO', index: number): string {
  return `${type === 'VIDEO' ? 'V' : 'A'}${index}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function TrackPatchPanel() {
  const tracks = useEditorStore((s) => s.tracks);
  const sourceAsset = useEditorStore((s) => s.sourceAsset);

  // Force re-render when trackPatchingEngine state changes
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const unsub = trackPatchingEngine.subscribe(() => forceUpdate((n) => n + 1));
    return unsub;
  }, []);

  // Auto-patch when source asset changes
  useEffect(() => {
    if (!sourceAsset) {
      trackPatchingEngine.setSourceTracks([]);
      return;
    }

    // Derive source tracks from the source asset.
    // Most video clips have 1 video track and 1-2 audio tracks.
    const sourceTracks: SourceTrackDescriptor[] = [
      { id: 'src-v1', type: 'VIDEO', index: 1 },
      { id: 'src-a1', type: 'AUDIO', index: 1 },
    ];

    trackPatchingEngine.setSourceTracks(sourceTracks);
    trackPatchingEngine.autoPatch(tracks);

    // Enable all record tracks by default
    for (const track of tracks) {
      trackPatchingEngine.enableRecordTrack(track.id);
    }
  }, [sourceAsset?.id, tracks.length]);

  // Handlers
  const handleTogglePatch = useCallback((sourceTrackId: string) => {
    const patch = trackPatchingEngine.getPatches().find((p) => p.sourceTrackId === sourceTrackId);
    if (patch) {
      trackPatchingEngine.unpatchSource(sourceTrackId);
    } else {
      // Re-patch to the default record track
      const sourceTracks = trackPatchingEngine.getPatches();
      const isVideo = sourceTrackId.includes('-v');
      const pool = tracks
        .filter((t) => t.type === (isVideo ? 'VIDEO' : 'AUDIO'))
        .sort((a, b) => a.sortOrder - b.sortOrder);
      if (pool.length > 0) {
        trackPatchingEngine.patchSourceToRecord(sourceTrackId, pool[0]!.id);
      }
    }
  }, [tracks]);

  const handleToggleRecordTrack = useCallback((trackId: string) => {
    trackPatchingEngine.toggleRecordTrack(trackId);
  }, []);

  const handleToggleSyncLock = useCallback((trackId: string) => {
    trackPatchingEngine.toggleSyncLock(trackId);
  }, []);

  // Get current state
  const patches = trackPatchingEngine.getPatches();
  const patchByRecord = new Map<string, TrackPatch>();
  for (const p of patches) {
    patchByRecord.set(p.recordTrackId, p);
  }

  const videoTracks = tracks
    .filter((t) => t.type === 'VIDEO')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const audioTracks = tracks
    .filter((t) => t.type === 'AUDIO')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (!sourceAsset) {
    return (
      <div className="track-patch-panel" style={{
        width: 48,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        borderRight: '1px solid var(--border-subtle)',
        background: 'var(--bg-void)',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        <div style={{
          padding: '4px 2px',
          fontSize: 8,
          color: 'var(--text-tertiary)',
          textAlign: 'center',
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          letterSpacing: 1,
        }}>
          PATCH
        </div>
      </div>
    );
  }

  return (
    <div className="track-patch-panel" style={{
      width: 48,
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      borderRight: '1px solid var(--border-subtle)',
      background: 'var(--bg-void)',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '3px 2px',
        fontSize: 7,
        fontWeight: 700,
        color: 'var(--text-tertiary)',
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        borderBottom: '1px solid var(--border-subtle)',
        height: 'var(--ruler-h, 24px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        SRC→REC
      </div>

      {/* Track rows — one per timeline track, matching track lane heights */}
      {tracks.map((track) => {
        const patch = patchByRecord.get(track.id);
        const isEnabled = trackPatchingEngine.isRecordTrackEnabled(track.id);
        const isSyncLocked = trackPatchingEngine.isSyncLocked(track.id);
        const isLocked = trackPatchingEngine.isTrackLocked(track.id);
        const isPatched = !!patch;

        return (
          <div
            key={track.id}
            style={{
              height: 'var(--track-h)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              padding: '0 2px',
              opacity: isLocked ? 0.4 : 1,
            }}
          >
            {/* Source patch indicator */}
            {isPatched ? (
              <button
                onClick={() => handleTogglePatch(patch.sourceTrackId)}
                title={`Unpatch ${trackLabel(patch.sourceTrackType, patch.sourceTrackIndex)} → ${track.name}`}
                style={{
                  width: 18,
                  height: 16,
                  border: '1px solid',
                  borderColor: patch.sourceTrackType === 'VIDEO' ? 'var(--info)' : '#4ade80',
                  borderRadius: 2,
                  background: patch.enabled
                    ? (patch.sourceTrackType === 'VIDEO' ? 'rgba(59,130,246,0.25)' : 'rgba(74,222,128,0.25)')
                    : 'transparent',
                  color: patch.sourceTrackType === 'VIDEO' ? 'var(--info)' : '#4ade80',
                  fontSize: 7,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {trackLabel(patch.sourceTrackType, patch.sourceTrackIndex)}
              </button>
            ) : (
              <div style={{ width: 18, height: 16 }} />
            )}

            {/* Connection line */}
            <div style={{
              width: 4,
              height: 1,
              background: isPatched ? 'rgba(255,255,255,0.3)' : 'transparent',
            }} />

            {/* Record track enable/sync */}
            <button
              onClick={() => handleToggleRecordTrack(track.id)}
              onContextMenu={(e) => { e.preventDefault(); handleToggleSyncLock(track.id); }}
              title={`${isEnabled ? 'Disable' : 'Enable'} ${track.name} (right-click: sync lock)`}
              style={{
                width: 16,
                height: 16,
                border: '1px solid',
                borderColor: isEnabled ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
                borderRadius: 2,
                background: isEnabled ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: isEnabled ? 'var(--text-primary)' : 'var(--text-tertiary)',
                fontSize: 6,
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                cursor: isLocked ? 'not-allowed' : 'pointer',
                padding: 0,
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              {isSyncLocked && (
                <div style={{
                  position: 'absolute',
                  top: -1,
                  right: -1,
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: '#f59e0b',
                }} />
              )}
              {track.name.substring(0, 2)}
            </button>
          </div>
        );
      })}
    </div>
  );
}
