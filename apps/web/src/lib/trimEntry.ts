import { TrimSide, trimEngine } from '../engine/TrimEngine';
import { resolveEditorialFocusTrackIds } from './editorialTrackFocus';
import type {
  ProjectSettings,
  SequenceSettings,
  TrimEditPointSelection,
  Track,
} from '../store/editor.store';

const TIME_EPSILON = 1e-6;

export interface TrimEntryState {
  tracks: Track[];
  selectedTrackId: string | null;
  selectedTrimEditPoints?: TrimEditPointSelection[];
  enabledTrackIds: string[];
  videoMonitorTrackId: string | null;
  sequenceSettings: Pick<SequenceSettings, 'fps'>;
  projectSettings: Pick<ProjectSettings, 'frameRate'>;
  playheadTime: number;
}

export interface TrimEntryTarget {
  anchorTrackId: string;
  editPointTime: number;
  trackIds: string[];
  side: TrimSide;
  rollerSelections: Array<{
    trackId: string;
    editPointTime: number;
    side: TrimSide;
  }>;
}

interface ResolveTrimEntryOptions {
  anchorTrackId?: string | null;
  editPointTime?: number;
  side?: TrimSide;
}

interface TrackCandidate {
  trackId: string;
  editPointTime: number;
  distance: number;
  priority: number;
}

function mapSelectionSide(side: TrimEditPointSelection['side']): TrimSide {
  switch (side) {
    case 'A_SIDE':
      return TrimSide.A_SIDE;
    case 'B_SIDE':
      return TrimSide.B_SIDE;
    default:
      return TrimSide.BOTH;
  }
}

function deriveGroupSide(selections: TrimEditPointSelection[]): TrimSide {
  if (selections.length === 0) {
    return TrimSide.BOTH;
  }

  const firstSide = selections[0]!.side;
  if (selections.every((selection) => selection.side === firstSide)) {
    return mapSelectionSide(firstSide);
  }

  return TrimSide.BOTH;
}

function getFrameTolerance(state: TrimEntryState): number {
  const fps = state.sequenceSettings.fps || state.projectSettings.frameRate || 24;
  return 0.5 / Math.max(fps, 1);
}

function findTrackById(tracks: Track[], trackId: string): Track | null {
  return tracks.find((track) => track.id === trackId) ?? null;
}

function getNearestEditPoint(track: Track, time: number): number | null {
  let bestTime: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const clip of track.clips) {
    for (const edge of [clip.startTime, clip.endTime]) {
      const distance = Math.abs(edge - time);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTime = edge;
      }
    }
  }

  return bestTime;
}

function trackHasEditPointAtTime(track: Track, editPointTime: number, tolerance: number): boolean {
  return track.clips.some((clip) => (
    Math.abs(clip.startTime - editPointTime) <= tolerance + TIME_EPSILON
      || Math.abs(clip.endTime - editPointTime) <= tolerance + TIME_EPSILON
  ));
}

function normalizeExplicitSelections(
  state: TrimEntryState,
  selections: TrimEditPointSelection[],
  anchorTrackId: string | null,
  tolerance: number,
): TrimEditPointSelection[] {
  const validSelections = selections.filter((selection) => {
    const track = findTrackById(state.tracks, selection.trackId);
    return Boolean(
      track
        && !track.locked
        && trackHasEditPointAtTime(track, selection.editPointTime, tolerance),
    );
  });

  if (validSelections.length === 0) {
    return [];
  }

  const trailingSelections = validSelections.filter((selection) => selection.trackId !== anchorTrackId);
  const anchorSelection = anchorTrackId
    ? validSelections.find((selection) => selection.trackId === anchorTrackId) ?? null
    : validSelections[validSelections.length - 1] ?? null;

  return anchorSelection
    ? [anchorSelection, ...trailingSelections]
    : trailingSelections;
}

function normalizeFocusedTrackIds(state: TrimEntryState, anchorTrackId: string | null): string[] {
  if (anchorTrackId) {
    const enabledTrackIds = state.enabledTrackIds.filter((trackId) => trackId !== anchorTrackId);
    const fallbackTrackIds = resolveEditorialFocusTrackIds({
      tracks: state.tracks,
      selectedTrackId: null,
      enabledTrackIds: state.enabledTrackIds,
      videoMonitorTrackId: state.videoMonitorTrackId,
    }).filter((trackId) => trackId !== anchorTrackId && !enabledTrackIds.includes(trackId));

    return [anchorTrackId, ...enabledTrackIds, ...fallbackTrackIds];
  }

  const focusedTrackIds = resolveEditorialFocusTrackIds({
    tracks: state.tracks,
    selectedTrackId: state.selectedTrackId,
    enabledTrackIds: state.enabledTrackIds,
    videoMonitorTrackId: state.videoMonitorTrackId,
  });
  return focusedTrackIds;
}

export function resolveTrimEntryTarget(
  state: TrimEntryState,
  options: ResolveTrimEntryOptions = {},
): TrimEntryTarget | null {
  const anchorTrackId = options.anchorTrackId ?? state.selectedTrackId;
  const explicitSelections = state.selectedTrimEditPoints ?? [];
  const requestedEditPointTime = options.editPointTime
    ?? explicitSelections[explicitSelections.length - 1]?.editPointTime
    ?? state.playheadTime;
  const focusedTrackIds = normalizeFocusedTrackIds(state, anchorTrackId);
  const tolerance = getFrameTolerance(state);

  if (explicitSelections.length > 0) {
    const explicitSelectionsByTrackId = new Map(
      normalizeExplicitSelections(state, explicitSelections, anchorTrackId, tolerance)
        .map((selection) => [selection.trackId, selection] as const),
    );
    const orderedSelections = [
      ...explicitSelectionsByTrackId.values(),
      ...focusedTrackIds
        .map((trackId) => explicitSelectionsByTrackId.get(trackId) ?? null)
        .filter((selection): selection is TrimEditPointSelection => selection !== null),
    ].filter((selection, index, selections) => (
      selections.findIndex((candidate) => candidate.trackId === selection.trackId) === index
    ));

    if (orderedSelections.length > 0) {
      const explicitAnchorSelection = orderedSelections[0]!;

      return {
        anchorTrackId: explicitAnchorSelection.trackId,
        editPointTime: explicitAnchorSelection.editPointTime,
        trackIds: orderedSelections.map((selection) => selection.trackId),
        side: options.side ?? deriveGroupSide(orderedSelections),
        rollerSelections: orderedSelections.map((selection) => ({
          trackId: selection.trackId,
          editPointTime: selection.editPointTime,
          side: mapSelectionSide(selection.side),
        })),
      };
    }
  }

  const side = options.side ?? TrimSide.BOTH;

  const candidates: TrackCandidate[] = focusedTrackIds.flatMap((trackId, index) => {
    const track = findTrackById(state.tracks, trackId);
    if (!track || track.locked || track.clips.length === 0) {
      return [];
    }

    const editPointTime = getNearestEditPoint(track, requestedEditPointTime);
    if (editPointTime === null) {
      return [];
    }

    return [{
      trackId,
      editPointTime,
      distance: Math.abs(editPointTime - requestedEditPointTime),
      priority: index,
    }];
  });

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    if (left.distance !== right.distance) {
      return left.distance - right.distance;
    }
    return left.priority - right.priority;
  });

  const chosen = candidates[0]!;
  const trackIds = focusedTrackIds.filter((trackId) => {
    const track = findTrackById(state.tracks, trackId);
    return track ? trackHasEditPointAtTime(track, chosen.editPointTime, tolerance) : false;
  });

  return {
    anchorTrackId: chosen.trackId,
    editPointTime: chosen.editPointTime,
    trackIds: trackIds.length > 0 ? trackIds : [chosen.trackId],
    side,
    rollerSelections: (trackIds.length > 0 ? trackIds : [chosen.trackId]).map((trackId) => ({
      trackId,
      editPointTime: chosen.editPointTime,
      side,
    })),
  };
}

export function enterTrimModeFromContext(
  state: TrimEntryState,
  options: ResolveTrimEntryOptions = {},
): TrimEntryTarget | null {
  const target = resolveTrimEntryTarget(state, options);
  if (!target) {
    return null;
  }

  trimEngine.enterTrimModeWithSelections(target.rollerSelections);

  return target;
}
