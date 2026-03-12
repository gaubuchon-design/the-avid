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

function resolveTrackSignature(tracks: Track[]): string {
  return tracks
    .map((track) => `${track.id}:${track.type}:${track.sortOrder}:${track.locked ? 1 : 0}`)
    .join('|');
}

function getSourceChipClass(options: {
  selected: boolean;
  patched: boolean;
  sourceType: 'VIDEO' | 'AUDIO';
}): string {
  return [
    'track-patch-chip',
    options.sourceType === 'VIDEO' ? 'video' : 'audio',
    options.selected ? 'is-selected' : '',
    options.patched ? 'is-patched' : '',
  ].filter(Boolean).join(' ');
}

function getRouteButtonClass(options: {
  tone: 'record' | 'sync';
  active: boolean;
}): string {
  return [
    'track-patch-route-btn',
    options.tone,
    options.active ? 'is-active' : '',
  ].filter(Boolean).join(' ');
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
  const sourceTrackGroups = useMemo(() => ({
    video: sourceTracks.filter((track) => track.type === 'VIDEO'),
    audio: sourceTracks.filter((track) => track.type === 'AUDIO'),
  }), [sourceTracks]);
  const routingSourceTrackId = dragSourceTrackId ?? activeSourceTrackId;
  const routingSourceTrack = routingSourceTrackId
    ? sourceTrackById.get(routingSourceTrackId) ?? null
    : null;

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
      <div className="track-patch-panel track-patch-panel-empty">
        <div className="track-patch-panel-header">
          <span className="track-patch-panel-title">Track Patch</span>
        </div>
        <div className="track-patch-panel-empty-state">Load a source clip to patch tracks.</div>
      </div>
    );
  }

  return (
    <div className="track-patch-panel">
      <div className="track-patch-panel-header">
        <div className="track-patch-panel-header-copy">
          <span className="track-patch-panel-title">Track Patch</span>
          <span className="track-patch-panel-subtitle" title={sourceAsset.name}>
            {sourceAsset.name}
          </span>
        </div>
        <button
          type="button"
          className="track-patch-panel-auto"
          onClick={handleAutoPatch}
          aria-label="Restore default track patching"
          title="Restore default track patching"
        >
          Reset
        </button>
      </div>

      <div className={`track-patch-panel-status${routingSourceTrack ? ' is-routing' : ''}`} aria-live="polite">
        {routingSourceTrack
          ? `Routing ${trackLabel(routingSourceTrack.type, routingSourceTrack.index)} to a compatible record lane`
          : 'Select or drag a source lane, then drop it on a record lane.'}
      </div>

      <div className="track-patch-panel-source-bank">
        <div className="track-patch-panel-section-header">
          <span className="track-patch-panel-section-label">Source Lanes</span>
          <span className="track-patch-panel-section-note">Click to arm, drag to reroute</span>
        </div>
        {([
          { key: 'video', label: 'Picture', tracks: sourceTrackGroups.video },
          { key: 'audio', label: 'Sound', tracks: sourceTrackGroups.audio },
        ] as const).map((group) => {
          if (group.tracks.length === 0) {
            return null;
          }

          return (
            <div key={group.key} className="track-patch-source-group">
              <span className="track-patch-source-group-label">{group.label}</span>
              <div className="track-patch-panel-source-list">
                {group.tracks.map((descriptor) => {
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
                      className={getSourceChipClass({
                        selected,
                        patched: Boolean(patch),
                        sourceType: descriptor.type,
                      })}
                    >
                      {trackLabel(descriptor.type, descriptor.index)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="track-patch-panel-grid-head" aria-hidden="true">
        <span>Record</span>
        <span>Patch</span>
        <span>Edit</span>
        <span>Sync</span>
      </div>

      <div className="track-patch-panel-rows">
        {tracks.map((track) => {
          const patch = patchByRecord.get(track.id);
          const isEnabled = trackPatchingEngine.isRecordTrackEnabled(track.id);
          const isSyncLocked = trackPatchingEngine.isSyncLocked(track.id);
          const canRouteHere = Boolean(
            routingSourceTrack
            && !track.locked
            && isCompatibleTrack(track, routingSourceTrack.type),
          );
          const isDropTarget = dropTargetTrackId === track.id && canRouteHere;
          const patchLabel = patch ? trackLabel(patch.sourceTrackType, patch.sourceTrackIndex) : '--';

          return (
            <div
              key={track.id}
              className={`track-patch-row${track.locked ? ' is-locked' : ''}`}
            >
              <div className="track-patch-track">
                <span className="track-patch-track-name">{track.name}</span>
                <span className="track-patch-track-kind">
                  {track.type === 'GRAPHIC'
                    ? 'Graphic'
                    : track.type === 'VIDEO'
                      ? 'Picture'
                      : track.type === 'AUDIO'
                        ? 'Sound'
                        : track.type}
                </span>
              </div>

              <div
                role="button"
                tabIndex={0}
                aria-label={`Patch target ${track.name}`}
                className={[
                  'track-patch-slot',
                  isDropTarget ? 'is-drop-target' : '',
                  canRouteHere ? 'can-route' : '',
                  patch ? 'is-patched' : '',
                ].filter(Boolean).join(' ')}
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
                title={routingSourceTrack
                  ? `Route ${trackLabel(routingSourceTrack.type, routingSourceTrack.index)} to ${track.name}`
                  : patch
                    ? `${patchLabel} is patched to ${track.name}`
                    : `Select a source above, then click to route it to ${track.name}`}
              >
                <div className="track-patch-slot-copy">
                  <span className="track-patch-slot-track">{track.name}</span>
                  <span className="track-patch-slot-hint">
                    {patch
                      ? `${patchLabel} armed`
                      : track.locked
                        ? 'Locked'
                        : canRouteHere
                          ? 'Click or drop to route'
                          : 'Awaiting compatible source'}
                  </span>
                </div>
                <div className="track-patch-slot-chip">
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
                      className={getSourceChipClass({
                        selected: dragSourceTrackId === patch.sourceTrackId || activeSourceTrackId === patch.sourceTrackId,
                        patched: true,
                        sourceType: patch.sourceTrackType,
                      })}
                    >
                      {patchLabel}
                    </button>
                  ) : (
                    <span className="track-patch-slot-empty">
                      {canRouteHere ? 'Patch' : '--'}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleRecordToggle(track.id)}
                aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${track.name}`}
                title={`${isEnabled ? 'Disable' : 'Enable'} ${track.name} for edits`}
                className={getRouteButtonClass({ tone: 'record', active: isEnabled })}
                disabled={track.locked}
              >
                REC
              </button>

              <button
                type="button"
                onClick={() => handleSyncLockToggle(track.id)}
                aria-label={`Toggle sync lock for ${track.name}`}
                title={`${isSyncLocked ? 'Disable' : 'Enable'} sync lock for ${track.name}`}
                className={getRouteButtonClass({ tone: 'sync', active: isSyncLocked })}
                disabled={track.locked}
              >
                SYNC
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TrackPatchPanel;
