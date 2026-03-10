import { describe, expect, it } from 'vitest';
import { findTimelineMonitorMediaSource } from '../../lib/monitorPlayback';
import { makeClip } from '../../store/editor.store';

describe('monitorPlayback', () => {
  it('prefers active audio track media for timeline monitor audio', () => {
    const result = findTimelineMonitorMediaSource([
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
            id: 'clip-video',
            trackId: 'v1',
            assetId: 'asset-video',
            name: 'Video',
            startTime: 0,
            endTime: 10,
            trimStart: 1,
            trimEnd: 0,
            type: 'video',
          }),
        ],
      },
      {
        id: 'a1',
        name: 'A1',
        type: 'AUDIO',
        sortOrder: 1,
        muted: false,
        locked: false,
        solo: false,
        volume: 1,
        color: '#2bb672',
        clips: [
          makeClip({
            id: 'clip-audio',
            trackId: 'a1',
            assetId: 'asset-audio',
            name: 'Audio',
            startTime: 0,
            endTime: 10,
            trimStart: 4,
            trimEnd: 0,
            type: 'audio',
          }),
        ],
      },
    ], 3);

    expect(result?.assetId).toBe('asset-audio');
    expect(result?.sourceKind).toBe('audio');
    expect(result?.sourceTime).toBe(7);
  });

  it('falls back to active video media when no audio clip is available', () => {
    const result = findTimelineMonitorMediaSource([
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
            id: 'clip-video',
            trackId: 'v1',
            assetId: 'asset-video',
            name: 'Video',
            startTime: 5,
            endTime: 12,
            trimStart: 2,
            trimEnd: 0,
            type: 'video',
          }),
        ],
      },
    ], 6.5);

    expect(result?.assetId).toBe('asset-video');
    expect(result?.sourceKind).toBe('video');
    expect(result?.sourceTime).toBe(3.5);
  });
});
