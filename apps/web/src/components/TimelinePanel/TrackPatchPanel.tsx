import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { SourceTrackDescriptor, TrackPatch } from '../../engine/TrackPatchingEngine';
import { trackPatchingEngine } from '../../engine/TrackPatchingEngine';
import { deriveSourceTracksFromAsset } from '../../lib/sourceTrackDerivation';
import { useEditorStore } from '../../store/editor.store';
import type { Track } from '../../store/editor.store';

function trackLabel(type: 'VIDEO' | 'AUDIO', index: number): string {
  return `${type === 'VIDEO' ? 'V' : 'A'}${index}`;
}

function isCompatibleTrack(track: Track, sourceType: 'VIDEO' | 'AUDIO'): boolean {
  if (sourceType === 'VIDEO') {
    return track.type === 'VIDEO' || track.type === 'GRAPHIC';
  }
  return track.type === 'AUDIO';
}

function findBestRecordTrack(
  descriptor: SourceTrackDescriptor,
  tracks: Track[],
  patches: TrackPatch[],
): Track | null {
  const compatibleTracks = tracks
    .filter((track) => !track.locked && isCompatibleTrack(track, descriptor.type))
    .sort((left, right) => left.sortOrder - right.sortOrder);

  if (compatibleTracks.length === 0) {
    return null;
  }

  const occupiedTrackIds = new Set(patches.map((patch) => patch.recordTrackId));
  return compatibleTracks.find((track) => !occupiedTrackIds.has(track.id))
    ?? compatibleTracks[0]
    ?? null;
}

function resolveTrackSignature(tracks: Track[]): string {
  return tracks
    .map((track) => `${track.id}:${track.type}:${track.sortOrder}:${track.locked ? 1 : 0}`)
    .join('|');
}

function sourceChipStyle(active: boolean, sourceType: 'VIDEO' | 'AUDIO'): React.CSSProperties {
  const accent = sourceType === 'VIDEO' ? 'var(--info)' : '#4ade80';
  return {
    minWidth: 28,
    height: 16,
    padding: '0 6px',
    borderRadius: 999,
    border: `1px solid ${accent}`,
    background: active ? accent : 'transparent',
    color: active ? '#08111c' : accent,
    fontSize: 8,
    fontWeight: 700,
    fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    opacity: active ? 1 : 0.92,
  };
}

export function TrackPatchPanel() {
  const tracks = useEditorStore((state) => state.tracks);
  const sourceAsset = useEditorStore((state) => state.sourceAsset);
  const [revision, setRevision] = useState(0);
  const [dragSourceTrackId, setDragSourceTrackId] = useState<string | null>(null);
  const [dropTargetTrackId, setDropTargetTrackId] = useState<string | null>(null);

  useEffect(() => {
    return trackPatchingEngine.subscribe(() => {
      setRevision((current) => current + 1);
    });
  }, []);

  const trackSignature = useMemo(() => resolveTrackSignature(tracks), [tracks]);

  useEffect(() => {
    if (!sourceAsset) {
      trackPatchingEngine.setSourceContext(null, []);
      return;
    }

    if (
      trackPatchingEngine.getSourceAssetId() === sourceAsset.id
      && trackPatchingEngine.getSourceTracks().length > 0
    ) {
      return;
    }

    const sourceTracks = deriveSourceTracksFromAsset(sourceAsset);
    trackPatchingEngine.setSourceContext(sourceAsset.id, sourceTracks);
    trackPatchingEngine.autoPatch(tracks);

    for (const track of tracks) {
      if (!track.locked) {
        trackPatchingEngine.enableRecordTrack(track.id);
      }
    }
  }, [sourceAsset?.id, trackSignature, tracks, sourceAsset]);

  useEffect(() => {
    if (!dragSourceTrackId) {
      return;
    }

    const handleWindowDrop = () => {
      setDragSourceTrackId(null);
      setDropTargetTrackId(null);
    };

    window.addEventListener('dragend', handleWindowDrop);
    window.addEventListener('mouseup', handleWindowDrop);
    return () => {
      window.removeEventListener('dragend', handleWindowDrop);
      window.removeEventListener('mouseup', handleWindowDrop);
    };
  }, [dragSourceTrackId]);

  const patches = trackPatchingEngine.getPatches();
  const sourceTracks = trackPatchingEngine.getSourceTracks();
  const patchByRecord = new Map<string, TrackPatch>();
  const patchBySource = new Map<string, TrackPatch>();
  for (const patch of patches) {
    patchByRecord.set(patch.recordTrackId, patch);
    patchBySource.set(patch.sourceTrackId, patch);
  }

  const sourceTrackById = new Map(sourceTracks.map((track) => [track.id, track]));

  const handleSourceToggle = useCallback((descriptor: SourceTrackDescriptor) => {
    const existingPatch = trackPatchingEngine.getPatches().find((patch) => patch.sourceTrackId === descriptor.id);
    if (existingPatch) {
      trackPatchingEngine.unpatchSource(descriptor.id);
      return;
    }

    const recordTrack = findBestRecordTrack(descriptor, tracks, trackPatchingEngine.getPatches());
    if (!recordTrack) {
      return;
    }

    trackPatchingEngine.patchSourceToRecord(descriptor.id, recordTrack.id);
    trackPatchingEngine.enableRecordTrack(recordTrack.id);
  }, [tracks]);

  const handleRecordToggle = useCallback((trackId: string) => {
    trackPatchingEngine.toggleRecordTrack(trackId);
  }, []);

  const handleSyncLockToggle = useCallback((trackId: string) => {
    trackPatchingEngine.toggleSyncLock(trackId);
  }, []);

  const commitDrop = useCallback((recordTrackId: string) => {
    if (!dragSourceTrackId) {
      return;
    }

    const descriptor = sourceTrackById.get(dragSourceTrackId);
    const recordTrack = tracks.find((track) => track.id === recordTrackId);
    if (!descriptor || !recordTrack || recordTrack.locked || !isCompatibleTrack(recordTrack, descriptor.type)) {
      setDragSourceTrackId(null);
      setDropTargetTrackId(null);
      return;
    }

    trackPatchingEngine.patchSourceToRecord(descriptor.id, recordTrack.id);
    trackPatchingEngine.enableRecordTrack(recordTrack.id);
    setDragSourceTrackId(null);
    setDropTargetTrackId(null);
  }, [dragSourceTrackId, sourceTrackById, tracks]);

  const handleStartDrag = useCallback((sourceTrackId: string) => {
    setDragSourceTrackId(sourceTrackId);
    setDropTargetTrackId(null);
  }, []);

  const handleRowDragOver = useCallback((recordTrackId: string) => {
    if (!dragSourceTrackId) {
      return false;
    }

    const descriptor = sourceTrackById.get(dragSourceTrackId);
    const recordTrack = tracks.find((track) => track.id === recordTrackId);
    if (!descriptor || !recordTrack || recordTrack.locked || !isCompatibleTrack(recordTrack, descriptor.type)) {
      setDropTargetTrackId(null);
      return false;
    }

    setDropTargetTrackId(recordTrackId);
    return true;
  }, [dragSourceTrackId, sourceTrackById, tracks]);

  void revision;

  if (!sourceAsset) {
    return (
      <div
        className="track-patch-panel"
        style={{
          width: 96,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--border-subtle)',
          background: 'var(--bg-void)',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            height: 'var(--ruler-h, 24px)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-tertiary)',
          }}
        >
          Patch
        </div>
      </div>
    );
  }

  return (
    <div
      className="track-patch-panel"
      style={{
        width: 96,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid var(--border-subtle)',
        background: 'var(--bg-void)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          height: 'var(--ruler-h, 24px)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 4px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
      >
        <span
          style={{
            fontSize: 7,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-tertiary)',
            flexShrink: 0,
          }}
        >
          Src
        </span>
        {sourceTracks.map((descriptor) => {
          const isPatched = patchBySource.has(descriptor.id);
          return (
            <button
              key={descriptor.id}
              type="button"
              draggable
              onClick={() => handleSourceToggle(descriptor)}
              onMouseDown={() => handleStartDrag(descriptor.id)}
              onDragStart={() => handleStartDrag(descriptor.id)}
              onDragEnd={() => {
                setDragSourceTrackId(null);
                setDropTargetTrackId(null);
              }}
              aria-label={`Patch source ${trackLabel(descriptor.type, descriptor.index)}`}
              title={isPatched
                ? `Unpatch ${trackLabel(descriptor.type, descriptor.index)}`
                : `Patch ${trackLabel(descriptor.type, descriptor.index)} to the next compatible record track`}
              style={sourceChipStyle(isPatched || dragSourceTrackId === descriptor.id, descriptor.type)}
            >
              {trackLabel(descriptor.type, descriptor.index)}
            </button>
          );
        })}
      </div>

      {tracks.map((track) => {
        const patch = patchByRecord.get(track.id);
        const isEnabled = trackPatchingEngine.isRecordTrackEnabled(track.id);
        const isSyncLocked = trackPatchingEngine.isSyncLocked(track.id);
        const descriptor = dragSourceTrackId ? sourceTrackById.get(dragSourceTrackId) ?? null : null;
        const canDrop = Boolean(descriptor && !track.locked && isCompatibleTrack(track, descriptor.type));
        const isDropTarget = dropTargetTrackId === track.id && canDrop;
        const patchLabel = patch ? trackLabel(patch.sourceTrackType, patch.sourceTrackIndex) : '--';

        return (
          <div
            key={track.id}
            style={{
              height: 'var(--track-h)',
              display: 'grid',
              gridTemplateColumns: '1fr 22px',
              gap: 4,
              alignItems: 'center',
              padding: '0 4px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              opacity: track.locked ? 0.45 : 1,
            }}
          >
            <div
              role="button"
              tabIndex={0}
              aria-label={`Patch target ${track.name}`}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && dragSourceTrackId) {
                  event.preventDefault();
                  commitDrop(track.id);
                }
              }}
              onDragOver={(event) => {
                if (handleRowDragOver(track.id)) {
                  event.preventDefault();
                }
              }}
              onDragLeave={() => {
                if (dropTargetTrackId === track.id) {
                  setDropTargetTrackId(null);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                commitDrop(track.id);
              }}
              onMouseEnter={() => {
                if (dragSourceTrackId) {
                  handleRowDragOver(track.id);
                }
              }}
              onMouseOver={() => {
                if (dragSourceTrackId) {
                  handleRowDragOver(track.id);
                }
              }}
              onMouseUp={() => {
                if (dragSourceTrackId) {
                  commitDrop(track.id);
                }
              }}
              style={{
                height: 18,
                borderRadius: 10,
                border: `1px dashed ${isDropTarget ? 'var(--brand)' : 'rgba(138, 156, 181, 0.2)'}`,
                background: isDropTarget
                  ? 'rgba(91, 106, 245, 0.18)'
                  : patch
                    ? 'rgba(255, 255, 255, 0.04)'
                    : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              {patch ? (
                <button
                  type="button"
                  draggable
                  onClick={() => trackPatchingEngine.unpatchSource(patch.sourceTrackId)}
                  onMouseDown={() => handleStartDrag(patch.sourceTrackId)}
                  onDragStart={() => handleStartDrag(patch.sourceTrackId)}
                  onDragEnd={() => {
                    setDragSourceTrackId(null);
                    setDropTargetTrackId(null);
                  }}
                  aria-label={`Unpatch ${patchLabel} from ${track.name}`}
                  title={`Drag ${patchLabel} to another record track or click to unpatch`}
                  style={sourceChipStyle(dragSourceTrackId === patch.sourceTrackId, patch.sourceTrackType)}
                >
                  {patchLabel}
                </button>
              ) : (
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: isDropTarget ? 'var(--brand-bright)' : 'var(--text-tertiary)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {isDropTarget ? 'Drop' : '--'}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleRecordToggle(track.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                handleSyncLockToggle(track.id);
              }}
              aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${track.name}`}
              title={`${isEnabled ? 'Disable' : 'Enable'} ${track.name} (right click: sync lock)`}
              style={{
                width: 22,
                height: 18,
                border: '1px solid',
                borderColor: isEnabled ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.1)',
                borderRadius: 6,
                background: isEnabled ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: isEnabled ? 'var(--text-primary)' : 'var(--text-tertiary)',
                fontSize: 8,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                cursor: track.locked ? 'not-allowed' : 'pointer',
                position: 'relative',
                padding: 0,
              }}
            >
              {isSyncLocked && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: -1,
                    right: -1,
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: '#f59e0b',
                  }}
                />
              )}
              {track.name.slice(0, 2)}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default TrackPatchPanel;
