import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeClip } from '../../store/editor.store';

const effectsEngineMocks = vi.hoisted(() => ({
  processFrame: vi.fn(),
  getClipEffects: vi.fn(),
}));

vi.mock('../../engine/EffectsEngine', () => ({
  effectsEngine: effectsEngineMocks,
}));

describe('PlaybackSnapshot compatibility', () => {
  beforeEach(() => {
    effectsEngineMocks.processFrame.mockReset();
    effectsEngineMocks.getClipEffects.mockReset();
    delete (effectsEngineMocks as Record<string, unknown>)['getRenderRevision'];
    delete (effectsEngineMocks as Record<string, unknown>)['getClipRenderRevision'];
  });

  it('falls back to a stable effects revision when legacy engine mocks omit revision helpers', async () => {
    const { buildPlaybackSnapshot } = await import('../../engine/PlaybackSnapshot');

    const snapshot = buildPlaybackSnapshot(
      {
        tracks: [
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
                name: 'Interview',
                startTime: 0,
                endTime: 5,
                trimStart: 0,
                trimEnd: 0,
                type: 'video',
                assetId: 'asset-video',
              }),
            ],
          },
        ],
        subtitleTracks: [],
        titleClips: [],
        playheadTime: 1,
        duration: 5,
        isPlaying: false,
        showSafeZones: false,
        activeMonitor: 'record',
        activeScope: null,
        sequenceSettings: {
          fps: 24,
          width: 1920,
          height: 1080,
        },
        projectSettings: {
          frameRate: 24,
          width: 1920,
          height: 1080,
        },
      },
      'record-monitor'
    );

    expect(snapshot.effectsRevision).toBe('clip-v1:0');
  });
});
