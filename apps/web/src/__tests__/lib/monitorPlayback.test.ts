import { describe, expect, it } from 'vitest';
import { findTimelineMonitorMediaSource } from '../../lib/monitorPlayback';
import { makeClip } from '../../store/editor.store';

describe('monitor playback helpers', () => {
  it('prefers the topmost playable video source over graphic title overlays', () => {
    const candidate = findTimelineMonitorMediaSource([
      {
        id: 'v1',
        name: 'V1',
        type: 'VIDEO',
        sortOrder: 0,
        muted: false,
        locked: false,
        solo: false,
        volume: 1,
        color: '#5b6af5',
        clips: [
          makeClip({
            id: 'clip-v1',
            trackId: 'v1',
            name: 'Base Clip',
            startTime: 0,
            endTime: 5,
            trimStart: 0,
            trimEnd: 0,
            type: 'video',
            assetId: 'asset-base',
          }),
        ],
      },
      {
        id: 'v2',
        name: 'V2',
        type: 'VIDEO',
        sortOrder: 1,
        muted: false,
        locked: false,
        solo: false,
        volume: 1,
        color: '#818cf8',
        clips: [
          makeClip({
            id: 'clip-v2',
            trackId: 'v2',
            name: 'Overlay Clip',
            startTime: 0,
            endTime: 5,
            trimStart: 2,
            trimEnd: 0,
            type: 'video',
            assetId: 'asset-overlay',
          }),
        ],
      },
      {
        id: 'g1',
        name: 'G1',
        type: 'GRAPHIC',
        sortOrder: 2,
        muted: false,
        locked: false,
        solo: false,
        volume: 1,
        color: '#f59e0b',
        clips: [
          makeClip({
            id: 'clip-title',
            trackId: 'g1',
            name: 'Title Overlay',
            startTime: 0,
            endTime: 5,
            trimStart: 0,
            trimEnd: 0,
            type: 'video',
            assetId: 'title-overlay',
          }),
        ],
      },
    ], 1.5);

    expect(candidate?.assetId).toBe('asset-overlay');
    expect(candidate?.sourceTime).toBe(3.5);
    expect(candidate?.sourceKind).toBe('video');
  });

  it('uses clip time-remap data when resolving monitor source time', () => {
    const remappedClip = makeClip({
      id: 'clip-remap',
      trackId: 'v1',
      name: 'Remapped Clip',
      startTime: 0,
      endTime: 4,
      trimStart: 0,
      trimEnd: 0,
      type: 'video',
      assetId: 'asset-remap',
    });

    remappedClip.timeRemap = {
      enabled: true,
      frameBlending: 'frame-mix',
      pitchCorrection: true,
      keyframes: [
        { timelineTime: 0, sourceTime: 1, interpolation: 'linear' },
        { timelineTime: 4, sourceTime: 9, interpolation: 'linear' },
      ],
    };

    const candidate = findTimelineMonitorMediaSource([
      {
        id: 'v1',
        name: 'V1',
        type: 'VIDEO',
        sortOrder: 0,
        muted: false,
        locked: false,
        solo: false,
        volume: 1,
        color: '#5b6af5',
        clips: [remappedClip],
      },
    ], 2);

    expect(candidate?.sourceTime).toBe(5);
  });
});
