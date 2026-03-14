import { describe, expect, it } from 'vitest';

import { resolveEditorialFocusTrackIds } from '../../lib/editorialTrackFocus';

const tracks = [
  { id: 'v1', type: 'VIDEO' as const, locked: false, muted: false },
  { id: 'v2', type: 'VIDEO' as const, locked: false, muted: false },
  { id: 'a1', type: 'AUDIO' as const, locked: false, muted: false },
];

describe('editorial track focus resolution', () => {
  it('prefers the selected editable track over enabled targets', () => {
    expect(resolveEditorialFocusTrackIds({
      tracks,
      selectedTrackId: 'v2',
      enabledTrackIds: ['v1', 'a1'],
      videoMonitorTrackId: 'v1',
    })).toEqual(['v2']);
  });

  it('falls back to enabled editable targets when no selected track is active', () => {
    expect(resolveEditorialFocusTrackIds({
      tracks,
      selectedTrackId: null,
      enabledTrackIds: ['v1', 'a1'],
      videoMonitorTrackId: 'v2',
    })).toEqual(['v1', 'a1']);
  });

  it('falls back to the monitored video track when no selected or enabled tracks are available', () => {
    expect(resolveEditorialFocusTrackIds({
      tracks,
      selectedTrackId: null,
      enabledTrackIds: [],
      videoMonitorTrackId: 'v2',
    })).toEqual(['v2']);
  });

  it('falls back to every editable track when selection, targets, and monitor are unavailable', () => {
    expect(resolveEditorialFocusTrackIds({
      tracks: [
        { id: 'v1', type: 'VIDEO' as const, locked: true, muted: false },
        { id: 'v2', type: 'VIDEO' as const, locked: false, muted: false },
        { id: 'a1', type: 'AUDIO' as const, locked: false, muted: true },
      ],
      selectedTrackId: 'v1',
      enabledTrackIds: ['a1'],
      videoMonitorTrackId: 'v1',
    })).toEqual(['v2']);
  });
});
