import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import { useEditorStore } from '../../store/editor.store';
import type { Clip } from '../../store/editor.store';
import { editEngine } from '../../engine/EditEngine';
import { snapEngine } from '../../engine/SnapEngine';
import { smartToolEngine } from '../../engine/SmartToolEngine';
import { trimEngine, TrimSide } from '../../engine/TrimEngine';
import { enterTrimModeFromContext } from '../../lib/trimEntry';
import {
  MoveClipCommand,
  SegmentMoveCommand,
  TrimClipLeftCommand,
  TrimClipRightCommand,
} from '../../engine/commands';

// ─── Context Menu ──────────────────────────────────────────────────────────────

interface ClipContextMenuProps {
  x: number;
  y: number;
  clipId: string;
  onClose: () => void;
}

function ClipContextMenu({
  x, y, clipId, onClose,
}: ClipContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [onClose]);

  const state = useEditorStore.getState();

  const actions = [
    { label: 'Split at Playhead', shortcut: 'S', action: () => state.splitClip(clipId, state.playheadTime) },
    { label: 'Duplicate', shortcut: '⌘D', action: () => state.duplicateClip(clipId) },
    { label: '—', shortcut: '', action: () => {} },
    { label: 'Delete', shortcut: '⌫', action: () => { state.selectClip(clipId); state.deleteSelectedClips(); } },
    { label: 'Ripple Delete', shortcut: '⇧⌫', action: () => state.rippleDelete(clipId) },
    { label: '—', shortcut: '', action: () => {} },
    { label: 'Select All on Track', shortcut: '', action: () => {
      const track = state.tracks.find(t => t.clips.some(c => c.id === clipId));
      if (track) track.clips.forEach((c, i) => state.selectClip(c.id, i > 0));
    }},
  ];

  return (
    <div ref={menuRef} className="clip-context-menu" style={{ left: x, top: y }} role="menu" aria-label="Clip actions">
      {actions.map((a, i) => a.label === '—' ? (
        <div key={i} className="clip-context-divider" role="separator" />
      ) : (
        <button key={i} className="clip-context-item" role="menuitem"
          onClick={() => { a.action(); onClose(); }}>
          <span>{a.label}</span>
          {a.shortcut && <span className="clip-context-shortcut" aria-label={`Keyboard shortcut: ${a.shortcut}`}>{a.shortcut}</span>}
        </button>
      ))}
    </div>
  );
}

// ─── Waveform SVG ────────────────────────────────────────────────────────────

interface WaveformProps {
  data: number[];
  width: number;
  height: number;
  color: string;
}

const Waveform = memo(function Waveform({
  data,
  width,
  height,
  color,
}: WaveformProps) {
  if (!data.length) return null;
  const hw = height / 2;
  const step = width / data.length;
  const pathD = data
    .map((v, i) => {
      const x = i * step;
      const amp = v * hw * 0.85;
      return `M${x.toFixed(1)},${(hw - amp).toFixed(1)} L${x.toFixed(1)},${(hw + amp).toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      width={width}
      height={height}
      style={{ position: 'absolute', inset: 0 }}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={pathD} stroke={color} strokeWidth="1.2" opacity="0.55" fill="none" />
    </svg>
  );
});

// ─── ClipView ────────────────────────────────────────────────────────────────

interface ClipViewProps {
  clip: Clip;
  zoom: number;
  trackId: string;
  trackColor: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const ClipView = memo(function ClipView({ clip, zoom, trackId, trackColor }: ClipViewProps) {
  const { selectedClipIds, selectClip, tracks, markers, playheadTime } =
    useEditorStore();
  const activeTool = useEditorStore((s) => s.activeTool);
  const selectedTrimEditPoints = useEditorStore((s) => s.selectedTrimEditPoints);
  const trimRenderRevision = useEditorStore((s) => (
    `${s.trimActive}:${s.trimMode}:${s.trimSelectionLabel}:${s.trimCounterFrames}:${s.trimASideFrames}:${s.trimBSideFrames}`
  ));
  const isSelected = selectedClipIds.includes(clip.id);
  const width = Math.max(2, (clip.endTime - clip.startTime) * zoom);
  const left = clip.startTime * zoom;
  const typeClass = `clip-${clip.type}`;
  const trimActive = trimRenderRevision.startsWith('true:');
  const liveTrimState = trimActive ? trimEngine.getState() : null;

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    selectClip(clip.id);
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, [clip.id, selectClip]);

  const startTrimDrag = useCallback((
    event: React.MouseEvent,
    editPointTime: number,
    side: TrimSide,
    overwriteTrimMode: boolean | null = null,
  ) => {
    const startX = event.clientX;
    const previousOverwriteTrim = trimEngine.isOverwriteTrimEnabled();

    if (overwriteTrimMode !== null) {
      trimEngine.setOverwriteTrim(overwriteTrimMode);
    }

    useEditorStore.getState().selectTrack(trackId);

    const target = enterTrimModeFromContext({
      tracks: useEditorStore.getState().tracks,
      selectedTrackId: trackId,
      enabledTrackIds: useEditorStore.getState().enabledTrackIds,
      videoMonitorTrackId: useEditorStore.getState().videoMonitorTrackId,
      sequenceSettings: useEditorStore.getState().sequenceSettings,
      projectSettings: useEditorStore.getState().projectSettings,
      playheadTime: editPointTime,
    }, {
      anchorTrackId: trackId,
      editPointTime,
      side,
    });

    if (!target || !trimEngine.getState().active) {
      if (overwriteTrimMode !== null) {
        trimEngine.setOverwriteTrim(previousOverwriteTrim);
      }
      return false;
    }

    const trimEditPointTime = target.editPointTime;

    const restoreTrimMode = () => {
      if (overwriteTrimMode !== null) {
        trimEngine.setOverwriteTrim(previousOverwriteTrim);
      }
    };

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      trimEngine.trimToPosition(trimEditPointTime + dx / zoom);
    };

    const cleanup = (cancel: boolean) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKeyDown);

      if (trimEngine.getState().active) {
        if (cancel) {
          trimEngine.cancelTrim();
        } else {
          trimEngine.exitTrimMode();
        }
      }

      restoreTrimMode();
    };

    const onUp = () => {
      cleanup(false);
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        cleanup(true);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKeyDown);
    return true;
  }, [trackId, zoom]);

  const enterTrimSelection = useCallback((editPointTime: number, side: TrimSide) => {
    const editorState = useEditorStore.getState();
    editorState.selectTrack(trackId);
    editorState.setActiveTool('trim');
    editorState.selectTrimEditPoint({
      trackId,
      editPointTime,
      side,
    });

    const target = enterTrimModeFromContext({
      tracks: useEditorStore.getState().tracks,
      selectedTrackId: trackId,
      selectedTrimEditPoints: useEditorStore.getState().selectedTrimEditPoints,
      enabledTrackIds: useEditorStore.getState().enabledTrackIds,
      videoMonitorTrackId: useEditorStore.getState().videoMonitorTrackId,
      sequenceSettings: useEditorStore.getState().sequenceSettings,
      projectSettings: useEditorStore.getState().projectSettings,
      playheadTime: editPointTime,
    }, {
      anchorTrackId: trackId,
      editPointTime,
      side,
    });
    if (target) {
      useEditorStore.getState().clearTrimEditPoints();
    }
  }, [trackId]);

  const selectTrimEditPoint = useCallback((editPointTime: number, side: TrimSide, multi = false) => {
    const editorState = useEditorStore.getState();
    editorState.selectTrack(trackId);
    editorState.setActiveTool('trim');
    editorState.selectTrimEditPoint({
      trackId,
      editPointTime,
      side,
    }, multi);
  }, [trackId]);

  // ── Body drag (move) ──
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      selectClip(clip.id, true);
    } else {
      selectClip(clip.id);
    }

    const startX = e.clientX;
    const origStart = clip.startTime;
    const origTrackId = trackId;
    const currentSelectedClipIds = useEditorStore.getState().selectedClipIds;
    const clipIdsToMove = currentSelectedClipIds.includes(clip.id) ? currentSelectedClipIds : [clip.id];
    const bounds = e.currentTarget.getBoundingClientRect();
    const localX = clamp(e.clientX - bounds.left, 0, bounds.width);
    const localY = clamp(e.clientY - bounds.top, 0, bounds.height);
    const nearestEdge = localX <= bounds.width - localX
      ? { editPointTime: clip.startTime, distanceToEdit: localX }
      : { editPointTime: clip.endTime, distanceToEdit: bounds.width - localX };
    const smartToolZone = smartToolEngine.hitTest({
      x: e.clientX,
      y: e.clientY,
      timeAtX: clip.startTime + (localX / zoom),
      trackAtY: trackId,
      clipAtPos: clip.id,
      nearestEditPoint: nearestEdge.editPointTime,
      distanceToEdit: nearestEdge.distanceToEdit,
      relativeY: bounds.height > 0 ? (localY / bounds.height) : 0.5,
    });
    const segmentMoveMode = smartToolZone.mode === 'lift-overwrite-segment'
      ? 'overwrite'
      : (smartToolZone.mode === 'extract-splice-segment' ? 'splice' : null);
    const nearestTrimSide = nearestEdge.editPointTime === clip.startTime
      ? TrimSide.B_SIDE
      : TrimSide.A_SIDE;
    const smartToolTrimSide = smartToolZone.mode === 'roll-trim'
      ? TrimSide.BOTH
      : smartToolZone.mode === 'a-side-trim'
        ? TrimSide.A_SIDE
        : smartToolZone.mode === 'b-side-trim'
          ? TrimSide.B_SIDE
          : nearestTrimSide;
    const smartToolOverwriteTrimMode = smartToolZone.mode === 'overwrite-trim'
      ? true
      : (smartToolZone.mode === 'ripple-trim' ? false : null);

    if (
      smartToolZone.mode === 'roll-trim'
      || smartToolZone.mode === 'overwrite-trim'
      || smartToolZone.mode === 'ripple-trim'
      || smartToolZone.mode === 'a-side-trim'
      || smartToolZone.mode === 'b-side-trim'
    ) {
      if (
        startTrimDrag(
          e,
          nearestEdge.editPointTime,
          smartToolTrimSide,
          smartToolOverwriteTrimMode,
        )
      ) {
        return;
      }
    }

    let dragging = false;
    let lastStart = origStart;
    let lastTrack = origTrackId;

    const anchors = snapEngine.collectAnchors(tracks, playheadTime, markers, clip.id);

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      if (!dragging && Math.abs(dx) > 3) dragging = true;
      if (!dragging) return;

      let newStart = Math.max(0, origStart + dx / zoom);
      // Snap
      const sr = snapEngine.snap(newStart, zoom, anchors);
      if (sr) newStart = sr.time;
      const endSnap = snapEngine.snap(
        newStart + (clip.endTime - clip.startTime),
        zoom,
        anchors,
      );
      if (endSnap)
        newStart = endSnap.time - (clip.endTime - clip.startTime);

      const targetTrackEl = (ev.target as HTMLElement).closest('[data-track-id]');
      const newTrackId = targetTrackEl?.getAttribute('data-track-id') ?? trackId;

      // Live preview via store (not via engine – commit on mouseup)
      useEditorStore.getState().moveClip(clip.id, newTrackId, newStart);
      lastStart = newStart;
      lastTrack = newTrackId;
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (dragging && (lastStart !== origStart || lastTrack !== origTrackId)) {
        // Restore original position, then execute through engine for undo
        useEditorStore.getState().moveClip(clip.id, origTrackId, origStart);
        if (segmentMoveMode) {
          editEngine.execute(
            new SegmentMoveCommand(clipIdsToMove, lastTrack, lastStart, segmentMoveMode),
          );
        } else {
          editEngine.execute(
            new MoveClipCommand(clip.id, origTrackId, origStart, lastTrack, lastStart),
          );
        }
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const localX = clamp(event.clientX - bounds.left, 0, bounds.width);
    const editPointTime = localX <= bounds.width - localX ? clip.startTime : clip.endTime;
    const track = tracks.find((candidate) => candidate.id === trackId);
    const hasAdjacentCut = Boolean(track?.clips.some((candidate) => (
      candidate.id !== clip.id
        && (Math.abs(candidate.startTime - editPointTime) < 1e-6
          || Math.abs(candidate.endTime - editPointTime) < 1e-6)
    )));

    enterTrimSelection(
      editPointTime,
      hasAdjacentCut
        ? TrimSide.BOTH
        : (editPointTime === clip.startTime ? TrimSide.B_SIDE : TrimSide.A_SIDE),
    );
  }, [clip.id, clip.endTime, clip.startTime, enterTrimSelection, trackId, tracks]);

  const activeLeftTrimRoller = liveTrimState?.rollers.find((roller) => (
    roller.trackId === trackId
      && roller.clipBId === clip.id
      && Math.abs(roller.editPointTime - clip.startTime) < 1e-6
  )) ?? null;
  const activeRightTrimRoller = liveTrimState?.rollers.find((roller) => (
    roller.trackId === trackId
      && roller.clipAId === clip.id
      && Math.abs(roller.editPointTime - clip.endTime) < 1e-6
  )) ?? null;
  const leftTrimActive = Boolean(
    activeLeftTrimRoller
      && (activeLeftTrimRoller.side === TrimSide.B_SIDE || activeLeftTrimRoller.side === TrimSide.BOTH),
  );
  const rightTrimActive = Boolean(
    activeRightTrimRoller
      && (activeRightTrimRoller.side === TrimSide.A_SIDE || activeRightTrimRoller.side === TrimSide.BOTH),
  );
  const selectedLeftTrimEditPoint = selectedTrimEditPoints.find((selection) => (
    selection.trackId === trackId
      && Math.abs(selection.editPointTime - clip.startTime) < 1e-6
  )) ?? null;
  const selectedRightTrimEditPoint = selectedTrimEditPoints.find((selection) => (
    selection.trackId === trackId
      && Math.abs(selection.editPointTime - clip.endTime) < 1e-6
  )) ?? null;

  const getTrimSelectionBadge = useCallback((side: 'A_SIDE' | 'B_SIDE' | 'BOTH'): string => {
    switch (side) {
      case 'A_SIDE':
        return 'A';
      case 'B_SIDE':
        return 'B';
      default:
        return 'AB';
    }
  }, []);

  // ── Left trim ──
  const handleTrimLeft = (e: React.MouseEvent) => {
    e.stopPropagation();
    const isTrimTool = activeTool === 'trim';
    const isRipple = e.ctrlKey || e.metaKey;

    if (isTrimTool) {
      const side = isRipple ? TrimSide.B_SIDE : TrimSide.BOTH;
      startTrimDrag(e, clip.startTime, side);
    } else {
      // Default behavior — simple left trim with snap + undo
      const startX = e.clientX;
      const origStart = clip.startTime;
      let lastTime = origStart;
      const anchors = snapEngine.collectAnchors(tracks, playheadTime, markers, clip.id);

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        let newTime = origStart + dx / zoom;
        const sr = snapEngine.snap(newTime, zoom, anchors);
        if (sr) newTime = sr.time;
        useEditorStore.getState().trimClip(clip.id, 'left', newTime);
        lastTime = newTime;
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (lastTime !== origStart) {
          useEditorStore.getState().trimClip(clip.id, 'left', origStart);
          editEngine.execute(new TrimClipLeftCommand(clip.id, origStart, lastTime));
        }
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
  };

  // ── Right trim ──
  const handleTrimRight = (e: React.MouseEvent) => {
    e.stopPropagation();
    const isTrimTool = activeTool === 'trim';
    const isRipple = e.ctrlKey || e.metaKey;

    if (isTrimTool) {
      const side = isRipple ? TrimSide.A_SIDE : TrimSide.BOTH;
      startTrimDrag(e, clip.endTime, side);
    } else {
      // Default behavior — simple right trim with snap + undo
      const startX = e.clientX;
      const origEnd = clip.endTime;
      let lastTime = origEnd;
      const anchors = snapEngine.collectAnchors(tracks, playheadTime, markers, clip.id);

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        let newTime = origEnd + dx / zoom;
        const sr = snapEngine.snap(newTime, zoom, anchors);
        if (sr) newTime = sr.time;
        useEditorStore.getState().trimClip(clip.id, 'right', newTime);
        lastTime = newTime;
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (lastTime !== origEnd) {
          useEditorStore.getState().trimClip(clip.id, 'right', origEnd);
          editEngine.execute(new TrimClipRightCommand(clip.id, origEnd, lastTime));
        }
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
  };

  return (
    <>
      <div
        className={`clip ${typeClass}${isSelected ? ' selected' : ''}`}
        style={{
          left,
          width: Math.max(6, width),
          top: 3,
          bottom: 3,
          position: 'absolute',
        }}
        role="gridcell"
        aria-label={`${clip.name} (${clip.type}, ${(clip.endTime - clip.startTime).toFixed(2)}s)`}
        aria-selected={isSelected}
        tabIndex={0}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectClip(clip.id, e.ctrlKey || e.metaKey);
          }
        }}
      >
        {width > 18 && (
          <div
            className={`clip-trim-handle left${leftTrimActive ? ' is-trim-target active' : activeLeftTrimRoller ? ' is-trim-target' : ''}${selectedLeftTrimEditPoint ? ' is-cut-selected' : ''}`}
            onMouseDown={handleTrimLeft}
            onClick={(event) => {
              event.stopPropagation();
              selectTrimEditPoint(
                clip.startTime,
                activeLeftTrimRoller ? activeLeftTrimRoller.side : TrimSide.B_SIDE,
                event.shiftKey || event.metaKey || event.ctrlKey,
              );
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              enterTrimSelection(clip.startTime, activeLeftTrimRoller ? activeLeftTrimRoller.side : TrimSide.B_SIDE);
            }}
            role="separator"
            aria-label="Trim left edge"
          >
            {selectedLeftTrimEditPoint && (
              <span className="clip-trim-selection-badge" aria-hidden="true">
                {getTrimSelectionBadge(selectedLeftTrimEditPoint.side)}
              </span>
            )}
          </div>
        )}

        {clip.waveformData && clip.type === 'audio' && (
          <Waveform
            data={clip.waveformData}
            width={width}
            height={32}
            color={trackColor}
          />
        )}

        {width > 30 && <div className="clip-label">{clip.name}</div>}

        {width > 18 && (
          <div
            className={`clip-trim-handle right${rightTrimActive ? ' is-trim-target active' : activeRightTrimRoller ? ' is-trim-target' : ''}${selectedRightTrimEditPoint ? ' is-cut-selected' : ''}`}
            onMouseDown={handleTrimRight}
            onClick={(event) => {
              event.stopPropagation();
              selectTrimEditPoint(
                clip.endTime,
                activeRightTrimRoller ? activeRightTrimRoller.side : TrimSide.A_SIDE,
                event.shiftKey || event.metaKey || event.ctrlKey,
              );
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              enterTrimSelection(clip.endTime, activeRightTrimRoller ? activeRightTrimRoller.side : TrimSide.A_SIDE);
            }}
            role="separator"
            aria-label="Trim right edge"
          >
            {selectedRightTrimEditPoint && (
              <span className="clip-trim-selection-badge" aria-hidden="true">
                {getTrimSelectionBadge(selectedRightTrimEditPoint.side)}
              </span>
            )}
          </div>
        )}
      </div>

      {ctxMenu && (
        <ClipContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          clipId={clip.id}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  );
});
