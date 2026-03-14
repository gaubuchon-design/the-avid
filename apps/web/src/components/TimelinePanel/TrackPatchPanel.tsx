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
  active: boolean;
  sourceType: 'VIDEO' | 'AUDIO';
}): string {
  return [
    'track-patch-chip',
    options.sourceType === 'VIDEO' ? 'video' : 'audio',
    options.selected ? 'is-selected' : '',
    options.patched ? 'is-patched' : '',
    options.patched && !options.active ? 'is-disabled' : '',
  ].filter(Boolean).join(' ');
}

function getRouteButtonClass(options: {
  tone: 'monitor' | 'record' | 'sync' | 'lock';
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
  const toggleLock = useEditorStore((state) => state.toggleLock);
  const setVideoMonitorTrack = useEditorStore((state) => state.setVideoMonitorTrack);
  const videoMonitorTrackId = useEditorStore((state) => state.videoMonitorTrackId);
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

    const previousRecordTrackId = trackPatchingEngine.getRecordTrackForSource(sourceTrackId);
    const orderedMovePreview = trackPatchingEngine.getOrderedPatchMovePreview(sourceTrackId, recordTrackId, tracks);
    const appliedOrderedMove = trackPatchingEngine.patchSourceToRecordPreservingOrder(sourceTrackId, recordTrackId, tracks);

    if (!appliedOrderedMove) {
      trackPatchingEngine.patchSourceToRecord(sourceTrackId, recordTrackId);
    }

    const routedRecordTrackIds = orderedMovePreview && appliedOrderedMove
      ? orderedMovePreview.map((patch) => patch.recordTrackId)
      : [recordTrackId];
    for (const routedRecordTrackId of routedRecordTrackIds) {
      trackPatchingEngine.enableRecordTrack(routedRecordTrackId);
    }

    if (
      descriptor.type === 'VIDEO'
      && (trackPatchingEngine.getVideoMonitorTrack() === null
        || trackPatchingEngine.getVideoMonitorTrack() === previousRecordTrackId)
    ) {
      useEditorStore.getState().setVideoMonitorTrack(recordTrackId);
    }

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
          ? `Source ${trackLabel(routingSourceTrack.type, routingSourceTrack.index)} is armed. Route it to a compatible record lane${patchBySource.get(routingSourceTrack.id) ? ' and order-preserving bank shifts will be used when available.' : '.'}`
          : 'Select or drag a source lane, then route it onto the record side.'}
      </div>

      <div className="track-patch-panel-source-bank">
        <div className="track-patch-panel-section-header">
          <span className="track-patch-panel-section-label">Source Side</span>
          <span className="track-patch-panel-section-note">Click to arm, drag to repatch</span>
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
                  const patchEnabled = patch?.enabled ?? true;
                  const sourceLabel = trackLabel(descriptor.type, descriptor.index);

                  return (
                    <div key={descriptor.id} className="track-patch-source-item">
                      <button
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
                          ? `Source ${sourceLabel} is selected for routing`
                          : `Select source ${sourceLabel} for patching`}
                        title={patch
                          ? `${sourceLabel} is patched to ${tracks.find((track) => track.id === patch.recordTrackId)?.name ?? patch.recordTrackId}${patch.enabled ? '' : ' but currently disabled for edits'}. Select to reroute or drag to move.`
                          : `Select ${sourceLabel}, then click a record slot.`}
                        className={getSourceChipClass({
                          selected,
                          patched: Boolean(patch),
                          active: patchEnabled,
                          sourceType: descriptor.type,
                        })}
                      >
                        {sourceLabel}
                      </button>
                      {patch && (
                        <button
                          type="button"
                          className={`track-patch-activation-btn${patch.enabled ? ' active' : ''}`}
                          aria-label={`${patch.enabled ? 'Disable' : 'Enable'} source patch ${sourceLabel} to ${tracks.find((track) => track.id === patch.recordTrackId)?.name ?? patch.recordTrackId}`}
                          title={`${patch.enabled ? 'Disable' : 'Enable'} ${sourceLabel} without removing its patch`}
                          onClick={(event) => {
                            event.stopPropagation();
                            trackPatchingEngine.togglePatchEnabled(patch.sourceTrackId);
                          }}
                        >
                          {patch.enabled ? 'ON' : 'OFF'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="track-patch-panel-grid-head" aria-hidden="true">
        <span>Record Side</span>
        <span>Patch</span>
        <span>Mon</span>
        <span>Edit</span>
        <span>Sync</span>
        <span>Lock</span>
      </div>

      <div className="track-patch-panel-rows">
        {tracks.map((track) => {
          const patch = patchByRecord.get(track.id);
          const isEnabled = trackPatchingEngine.isRecordTrackEnabled(track.id);
          const isSyncLocked = trackPatchingEngine.isSyncLocked(track.id);
          const orderedMovePreview = routingSourceTrackId
            ? trackPatchingEngine.getOrderedPatchMovePreview(routingSourceTrackId, track.id, tracks)
            : null;
          const shiftsPatchBank = Boolean(orderedMovePreview && orderedMovePreview.length > 1);
          const isVisualTrack = track.type === 'VIDEO' || track.type === 'GRAPHIC';
          const isMonitored = videoMonitorTrackId === track.id;
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
                  shiftsPatchBank ? 'is-bank-shift' : '',
                  patch ? 'is-patched' : '',
                  patch && !patch.enabled ? 'is-patch-disabled' : '',
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
                  ? shiftsPatchBank
                    ? `Route ${trackLabel(routingSourceTrack.type, routingSourceTrack.index)} to ${track.name} and shift the patched ${routingSourceTrack.type === 'VIDEO' ? 'picture' : 'sound'} bank in order`
                    : `Route ${trackLabel(routingSourceTrack.type, routingSourceTrack.index)} to ${track.name}`
                  : patch
                    ? `${patchLabel} is patched to ${track.name}`
                    : `Select a source above, then click to route it to ${track.name}`}
              >
                <div className="track-patch-slot-copy">
                  <span className="track-patch-slot-track">{track.name}</span>
                  <span className="track-patch-slot-hint">
                    {patch
                      ? patch.enabled
                        ? `${patchLabel} armed`
                        : `${patchLabel} mapped · off`
                      : track.locked
                        ? 'Locked'
                        : shiftsPatchBank
                          ? 'Shift bank here'
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
                        active: patch.enabled,
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
                onClick={() => setVideoMonitorTrack(track.id)}
                aria-label={isVisualTrack
                  ? `${isMonitored ? 'Stop monitoring' : 'Monitor'} ${track.name}`
                  : `${track.name} is not a monitorable picture track`}
                title={isVisualTrack
                  ? `${isMonitored ? 'Monitored' : 'Set as monitored'} picture track`
                  : `${track.name} does not drive the record monitor picture`}
                className={getRouteButtonClass({ tone: 'monitor', active: isMonitored })}
                disabled={track.locked || !isVisualTrack}
              >
                MON
              </button>

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

              <button
                type="button"
                onClick={() => toggleLock(track.id)}
                aria-label={`${track.locked ? 'Unlock' : 'Lock'} ${track.name}`}
                title={`${track.locked ? 'Unlock' : 'Lock'} ${track.name}`}
                className={getRouteButtonClass({ tone: 'lock', active: track.locked })}
              >
                LOCK
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TrackPatchPanel;
