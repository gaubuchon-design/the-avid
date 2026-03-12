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

function sourceChipStyle(options: {
  selected: boolean;
  patched: boolean;
  sourceType: 'VIDEO' | 'AUDIO';
}): React.CSSProperties {
  const accent = options.sourceType === 'VIDEO' ? 'var(--info)' : '#4ade80';
  return {
    minWidth: 30,
    height: 18,
    padding: '0 7px',
    borderRadius: 999,
    border: `1px solid ${options.selected ? accent : `${accent}88`}`,
    background: options.selected
      ? accent
      : options.patched
        ? `${accent}20`
        : 'transparent',
    color: options.selected ? '#08111c' : accent,
    fontSize: 8,
    fontWeight: 700,
    fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    opacity: options.selected || options.patched ? 1 : 0.9,
  };
}

function routeButtonStyle(active: boolean, tone: 'record' | 'sync', disabled = false): React.CSSProperties {
  const accent = tone === 'record' ? 'var(--brand)' : '#f59e0b';
  return {
    width: 28,
    height: 20,
    borderRadius: 8,
    border: `1px solid ${active ? accent : 'rgba(138, 156, 181, 0.14)'}`,
    background: active ? `${accent}22` : 'transparent',
    color: active ? accent : 'var(--text-tertiary)',
    fontSize: 8,
    fontWeight: 700,
    fontFamily: 'var(--font-mono)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    padding: 0,
  };
}

export function TrackPatchPanel() {
  const tracks = useEditorStore((state) => state.tracks);
  const sourceAsset = useEditorStore((state) => state.sourceAsset);
  const [revision, setRevision] = useState(0);
  const [activeSourceTrackId, setActiveSourceTrackId] = useState<string | null>(null);
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
      setActiveSourceTrackId(null);
      setDragSourceTrackId(null);
      setDropTargetTrackId(null);
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

    setActiveSourceTrackId(null);
    setDragSourceTrackId(null);
    setDropTargetTrackId(null);
  }, [sourceAsset?.id, trackSignature, tracks, sourceAsset]);

  const patches = trackPatchingEngine.getPatches();
  const sourceTracks = trackPatchingEngine.getSourceTracks();
  const patchByRecord = new Map<string, TrackPatch>();
  const patchBySource = new Map<string, TrackPatch>();
  for (const patch of patches) {
    patchByRecord.set(patch.recordTrackId, patch);
    patchBySource.set(patch.sourceTrackId, patch);
  }

  const sourceTrackById = new Map(sourceTracks.map((track) => [track.id, track]));
  const routingSourceTrackId = dragSourceTrackId ?? activeSourceTrackId;
  const routingSourceTrack = routingSourceTrackId ? sourceTrackById.get(routingSourceTrackId) ?? null : null;

  const clearRoutingState = useCallback(() => {
    setActiveSourceTrackId(null);
    setDragSourceTrackId(null);
    setDropTargetTrackId(null);
  }, []);

  const routeSourceToTrack = useCallback((sourceTrackId: string, recordTrackId: string) => {
    const descriptor = sourceTrackById.get(sourceTrackId);
    const recordTrack = tracks.find((track) => track.id === recordTrackId);
    if (!descriptor || !recordTrack || recordTrack.locked || !isCompatibleTrack(recordTrack, descriptor.type)) {
      clearRoutingState();
      return;
    }

    trackPatchingEngine.patchSourceToRecord(sourceTrackId, recordTrackId);
    trackPatchingEngine.enableRecordTrack(recordTrackId);
    clearRoutingState();
  }, [clearRoutingState, sourceTrackById, tracks]);

  const handleSourceSelect = useCallback((descriptor: SourceTrackDescriptor) => {
    setDragSourceTrackId(null);
    setDropTargetTrackId(null);

    if (activeSourceTrackId === descriptor.id) {
      setActiveSourceTrackId(null);
      return;
    }

    setActiveSourceTrackId(descriptor.id);
  }, [activeSourceTrackId]);

  const handleStartDrag = useCallback((sourceTrackId: string) => {
    setDragSourceTrackId(sourceTrackId);
    setDropTargetTrackId(null);
  }, []);

  const handleRecordToggle = useCallback((trackId: string) => {
    trackPatchingEngine.toggleRecordTrack(trackId);
  }, []);

  const handleSyncLockToggle = useCallback((trackId: string) => {
    trackPatchingEngine.toggleSyncLock(trackId);
  }, []);

  const handleAutoPatch = useCallback(() => {
    trackPatchingEngine.autoPatch(tracks);
    for (const track of tracks) {
      if (!track.locked) {
        trackPatchingEngine.enableRecordTrack(track.id);
      }
    }
    clearRoutingState();
  }, [clearRoutingState, tracks]);

  const handleRowDragOver = useCallback((recordTrackId: string) => {
    if (!routingSourceTrack) {
      return false;
    }

    const recordTrack = tracks.find((track) => track.id === recordTrackId);
    if (!recordTrack || recordTrack.locked || !isCompatibleTrack(recordTrack, routingSourceTrack.type)) {
      setDropTargetTrackId(null);
      return false;
    }

    setDropTargetTrackId(recordTrackId);
    return true;
  }, [routingSourceTrack, tracks]);

  void revision;

  if (!sourceAsset) {
    return (
      <div
        className="track-patch-panel"
        style={{
          width: 132,
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
        width: 132,
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
          Patch
        </span>

        {sourceTracks.map((descriptor) => {
          const patch = patchBySource.get(descriptor.id);
          const selected = activeSourceTrackId === descriptor.id || dragSourceTrackId === descriptor.id;

          return (
            <button
              key={descriptor.id}
              type="button"
              draggable
              onClick={() => handleSourceSelect(descriptor)}
              onMouseDown={() => handleStartDrag(descriptor.id)}
              onDragStart={() => handleStartDrag(descriptor.id)}
              onDragEnd={() => {
                setDragSourceTrackId(null);
                setDropTargetTrackId(null);
              }}
              aria-label={selected
                ? `Source ${trackLabel(descriptor.type, descriptor.index)} is selected for routing`
                : `Select source ${trackLabel(descriptor.type, descriptor.index)} for patching`}
              title={patch
                ? `${trackLabel(descriptor.type, descriptor.index)} is patched to ${tracks.find((track) => track.id === patch.recordTrackId)?.name ?? patch.recordTrackId}. Select to reroute or drag to move.`
                : `Select ${trackLabel(descriptor.type, descriptor.index)}, then click a record slot.`}
              style={sourceChipStyle({
                selected,
                patched: Boolean(patch),
                sourceType: descriptor.type,
              })}
            >
              {trackLabel(descriptor.type, descriptor.index)}
            </button>
          );
        })}

        <button
          type="button"
          onClick={handleAutoPatch}
          aria-label="Restore default track patching"
          title="Restore default track patching"
          style={{
            ...routeButtonStyle(false, 'record'),
            width: 32,
            flexShrink: 0,
          }}
        >
          Auto
        </button>
      </div>

      {tracks.map((track) => {
        const patch = patchByRecord.get(track.id);
        const isEnabled = trackPatchingEngine.isRecordTrackEnabled(track.id);
        const isSyncLocked = trackPatchingEngine.isSyncLocked(track.id);
        const canRouteHere = Boolean(routingSourceTrack && !track.locked && isCompatibleTrack(track, routingSourceTrack.type));
        const isDropTarget = dropTargetTrackId === track.id && canRouteHere;
        const patchLabel = patch ? trackLabel(patch.sourceTrackType, patch.sourceTrackIndex) : '--';

        return (
          <div
            key={track.id}
            style={{
              height: 'var(--track-h)',
              display: 'grid',
              gridTemplateColumns: '1fr 28px 28px',
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
              onClick={() => {
                if (routingSourceTrackId) {
                  routeSourceToTrack(routingSourceTrackId, track.id);
                }
              }}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && routingSourceTrackId) {
                  event.preventDefault();
                  routeSourceToTrack(routingSourceTrackId, track.id);
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
                if (dragSourceTrackId) {
                  routeSourceToTrack(dragSourceTrackId, track.id);
                }
              }}
              onMouseEnter={() => {
                if (routingSourceTrackId) {
                  handleRowDragOver(track.id);
                }
              }}
              onMouseUp={() => {
                if (dragSourceTrackId) {
                  routeSourceToTrack(dragSourceTrackId, track.id);
                }
              }}
              style={{
                height: 22,
                borderRadius: 11,
                border: `1px dashed ${isDropTarget ? 'var(--brand)' : 'rgba(138, 156, 181, 0.18)'}`,
                background: isDropTarget
                  ? 'rgba(91, 106, 245, 0.18)'
                  : patch
                    ? 'rgba(255, 255, 255, 0.04)'
                    : canRouteHere
                      ? 'rgba(255, 255, 255, 0.02)'
                      : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
              title={routingSourceTrack
                ? `Route ${trackLabel(routingSourceTrack.type, routingSourceTrack.index)} to ${track.name}`
                : patch
                  ? `${patchLabel} is patched to ${track.name}`
                  : `Select a source above, then click to route it to ${track.name}`}
            >
              {patch ? (
                <button
                  type="button"
                  draggable
                  onClick={(event) => {
                    event.stopPropagation();
                    trackPatchingEngine.unpatchSource(patch.sourceTrackId);
                    if (activeSourceTrackId === patch.sourceTrackId) {
                      setActiveSourceTrackId(null);
                    }
                  }}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                    handleStartDrag(patch.sourceTrackId);
                  }}
                  onDragStart={() => handleStartDrag(patch.sourceTrackId)}
                  onDragEnd={() => {
                    setDragSourceTrackId(null);
                    setDropTargetTrackId(null);
                  }}
                  aria-label={`Unpatch ${patchLabel} from ${track.name}`}
                  title={`Drag ${patchLabel} to another record track or click to clear it from ${track.name}`}
                  style={sourceChipStyle({
                    selected: dragSourceTrackId === patch.sourceTrackId || activeSourceTrackId === patch.sourceTrackId,
                    patched: true,
                    sourceType: patch.sourceTrackType,
                  })}
                >
                  {patchLabel}
                </button>
              ) : (
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: canRouteHere ? 'var(--brand-bright)' : 'var(--text-tertiary)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {canRouteHere ? 'Route' : '--'}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleRecordToggle(track.id)}
              aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${track.name}`}
              title={`${isEnabled ? 'Disable' : 'Enable'} ${track.name} for edits`}
              style={routeButtonStyle(isEnabled, 'record', track.locked)}
              disabled={track.locked}
            >
              REC
            </button>

            <button
              type="button"
              onClick={() => handleSyncLockToggle(track.id)}
              aria-label={`Toggle sync lock for ${track.name}`}
              title={`${isSyncLocked ? 'Disable' : 'Enable'} sync lock for ${track.name}`}
              style={routeButtonStyle(isSyncLocked, 'sync', track.locked)}
              disabled={track.locked}
            >
              SY
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default TrackPatchPanel;
