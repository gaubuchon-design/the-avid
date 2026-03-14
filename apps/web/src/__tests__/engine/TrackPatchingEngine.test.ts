import { beforeEach, describe, expect, it } from 'vitest';

import { trackPatchingEngine } from '../../engine/TrackPatchingEngine';

import type { Track } from '../../store/editor.store';

function makeTrack(
  id: string,
  name: string,
  type: Track['type'],
  sortOrder: number,
): Track {
  return {
    id,
    name,
    type,
    sortOrder,
    muted: false,
    locked: false,
    solo: false,
    volume: 1,
    color: '#5b6af5',
    clips: [],
  };
}

describe('TrackPatchingEngine', () => {
  beforeEach(() => {
    trackPatchingEngine.reset();
  });

  it('previews and applies order-preserving sound-bank moves', () => {
    const recordTracks = [
      makeTrack('t-a1', 'A1', 'AUDIO', 0),
      makeTrack('t-a2', 'A2', 'AUDIO', 1),
      makeTrack('t-a3', 'A3', 'AUDIO', 2),
      makeTrack('t-a4', 'A4', 'AUDIO', 3),
      makeTrack('t-a5', 'A5', 'AUDIO', 4),
    ];

    trackPatchingEngine.setSourceTracks([
      { id: 'src-a1', type: 'AUDIO', index: 1 },
      { id: 'src-a2', type: 'AUDIO', index: 2 },
      { id: 'src-a3', type: 'AUDIO', index: 3 },
    ]);
    trackPatchingEngine.autoPatch(recordTracks);

    const preview = trackPatchingEngine.getOrderedPatchMovePreview('src-a2', 't-a3', recordTracks);

    expect(preview).toEqual([
      {
        sourceTrackId: 'src-a1',
        sourceTrackType: 'AUDIO',
        sourceTrackIndex: 1,
        recordTrackId: 't-a2',
        enabled: true,
      },
      {
        sourceTrackId: 'src-a2',
        sourceTrackType: 'AUDIO',
        sourceTrackIndex: 2,
        recordTrackId: 't-a3',
        enabled: true,
      },
      {
        sourceTrackId: 'src-a3',
        sourceTrackType: 'AUDIO',
        sourceTrackIndex: 3,
        recordTrackId: 't-a4',
        enabled: true,
      },
    ]);

    expect(trackPatchingEngine.patchSourceToRecordPreservingOrder('src-a2', 't-a3', recordTracks)).toBe(true);
    expect(trackPatchingEngine.getPatches().sort((left, right) => left.sourceTrackIndex - right.sourceTrackIndex)).toEqual(preview);
  });

  it('falls back when an ordered move would run out of compatible tracks', () => {
    const recordTracks = [
      makeTrack('t-a1', 'A1', 'AUDIO', 0),
      makeTrack('t-a2', 'A2', 'AUDIO', 1),
      makeTrack('t-a3', 'A3', 'AUDIO', 2),
    ];

    trackPatchingEngine.setSourceTracks([
      { id: 'src-a1', type: 'AUDIO', index: 1 },
      { id: 'src-a2', type: 'AUDIO', index: 2 },
      { id: 'src-a3', type: 'AUDIO', index: 3 },
    ]);
    trackPatchingEngine.autoPatch(recordTracks);

    expect(trackPatchingEngine.getOrderedPatchMovePreview('src-a1', 't-a2', recordTracks)).toBeNull();
    expect(trackPatchingEngine.patchSourceToRecordPreservingOrder('src-a1', 't-a2', recordTracks)).toBe(false);
    expect(trackPatchingEngine.getRecordTrackForSource('src-a1')).toBe('t-a1');
  });

  it('can disable a patch without removing its mapping', () => {
    const recordTracks = [
      makeTrack('t-v1', 'V1', 'VIDEO', 0),
    ];

    trackPatchingEngine.setSourceTracks([
      { id: 'src-v1', type: 'VIDEO', index: 1 },
    ]);
    trackPatchingEngine.autoPatch(recordTracks);

    trackPatchingEngine.setPatchEnabled('src-v1', false);

    expect(trackPatchingEngine.getRecordTrackForSource('src-v1')).toBe('t-v1');
    expect(trackPatchingEngine.isPatchEnabled('src-v1')).toBe(false);
    expect(trackPatchingEngine.getPatches()).toEqual([
      {
        sourceTrackId: 'src-v1',
        sourceTrackType: 'VIDEO',
        sourceTrackIndex: 1,
        recordTrackId: 't-v1',
        enabled: false,
      },
    ]);
  });
});
