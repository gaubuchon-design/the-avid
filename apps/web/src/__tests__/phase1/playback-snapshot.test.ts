import { describe, expect, it } from 'vitest';
import { effectsEngine } from '../../engine/EffectsEngine';
import { buildPlaybackSnapshot } from '../../engine/PlaybackSnapshot';
import { makeClip } from '../../store/editor.store';

describe('phase 1 playback snapshot contract', () => {
  const baseSource = {
    tracks: [
      {
        id: 't-v1',
        name: 'V1',
        type: 'VIDEO' as const,
        sortOrder: 0,
        muted: false,
        locked: false,
        solo: false,
        volume: 1,
        color: '#5b6af5',
        clips: [
          makeClip({
            id: 'clip-v1',
            trackId: 't-v1',
            name: 'Interview',
            startTime: 0,
            endTime: 10,
            trimStart: 2,
            trimEnd: 0,
            type: 'video',
            assetId: 'asset-video',
          }),
        ],
      },
    ],
    subtitleTracks: [],
    titleClips: [],
    duration: 10,
    isPlaying: false,
    showSafeZones: false,
    activeMonitor: 'record' as const,
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
  };

  it('keeps sequence revision stable while frame keys change with playhead position', () => {
    const startSnapshot = buildPlaybackSnapshot({
      ...baseSource,
      playheadTime: 1,
    }, 'record-monitor');
    const laterSnapshot = buildPlaybackSnapshot({
      ...baseSource,
      playheadTime: 2,
    }, 'record-monitor');

    expect(startSnapshot.sequenceRevision).toBe(laterSnapshot.sequenceRevision);
    expect(startSnapshot.frameKey).not.toBe(laterSnapshot.frameKey);
    expect(startSnapshot.primaryVideoLayer?.sourceTime).toBe(3);
    expect(laterSnapshot.primaryVideoLayer?.sourceTime).toBe(4);
  });

  it('evaluates active layers for monitor, title, and subtitle consumers from the same contract', () => {
    const snapshot = buildPlaybackSnapshot({
      ...baseSource,
      playheadTime: 2,
      tracks: [
        {
          ...baseSource.tracks[0]!,
          clips: [
            makeClip({
              id: 'clip-v1',
              trackId: 't-v1',
              name: 'Program',
              startTime: 0,
              endTime: 8,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
              assetId: 'asset-video',
            }),
          ],
        },
        {
          id: 't-v2',
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
              trackId: 't-v2',
              name: 'Overlay',
              startTime: 0,
              endTime: 8,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
              assetId: 'asset-overlay',
            }),
          ],
        },
        {
          id: 't-g1',
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
              trackId: 't-g1',
              name: 'Title',
              startTime: 1,
              endTime: 5,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
              assetId: 'title-1',
            }),
          ],
        },
        {
          id: 't-s1',
          name: 'Sub1',
          type: 'SUBTITLE',
          sortOrder: 3,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#22c55e',
          clips: [
            makeClip({
              id: 'clip-subtitle',
              trackId: 't-s1',
              name: 'Subtitle Bed',
              startTime: 0,
              endTime: 8,
              trimStart: 0,
              trimEnd: 0,
              type: 'subtitle',
            }),
          ],
        },
      ],
      titleClips: [
        {
          id: 'title-1',
          text: 'OPEN',
          style: {
            fontFamily: 'Helvetica',
            fontSize: 64,
            fontWeight: 700,
            color: '#ffffff',
            opacity: 1,
            textAlign: 'center',
          },
          position: { x: 0.5, y: 0.2, width: 0.8, height: 0.2 },
        },
      ],
      subtitleTracks: [
        {
          id: 'sub-track-1',
          name: 'English',
          language: 'en',
          cues: [
            { id: 'cue-1', start: 1, end: 4, text: 'Hello world' },
          ],
        },
      ],
      activeScope: 'waveform',
      showSafeZones: true,
    }, 'scope');

    expect(snapshot.primaryVideoLayer?.clip.id).toBe('clip-v2');
    expect(snapshot.videoLayers.map((layer) => layer.clip.id)).toEqual(['clip-v1', 'clip-v2', 'clip-title']);
    expect(snapshot.titleLayers).toHaveLength(1);
    expect(snapshot.titleLayers[0]?.titleId).toBe('title-1');
    expect(snapshot.subtitleCues).toHaveLength(1);
    expect(snapshot.subtitleCues[0]?.cue.id).toBe('cue-1');
    expect(snapshot.frameKey).toContain(':waveform:1');
  });

  it('resolves time-remapped source positions inside the shared playback snapshot', () => {
    const remappedClip = makeClip({
      id: 'clip-remap',
      trackId: 't-v1',
      name: 'Speed Ramped',
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
        { timelineTime: 0, sourceTime: 2, interpolation: 'linear' },
        { timelineTime: 4, sourceTime: 8, interpolation: 'linear' },
      ],
    };

    const snapshot = buildPlaybackSnapshot({
      ...baseSource,
      playheadTime: 2,
      tracks: [
        {
          ...baseSource.tracks[0]!,
          clips: [remappedClip],
        },
      ],
    }, 'record-monitor');

    expect(snapshot.primaryVideoLayer?.sourceTime).toBe(5);
  });

  it('changes sequence revision when time-remap data changes', () => {
    const linearClip = makeClip({
      id: 'clip-linear',
      trackId: 't-v1',
      name: 'Linear',
      startTime: 0,
      endTime: 4,
      trimStart: 0,
      trimEnd: 0,
      type: 'video',
      assetId: 'asset-linear',
    });
    const remappedClip = makeClip({
      id: 'clip-remapped',
      trackId: 't-v1',
      name: 'Remapped',
      startTime: 0,
      endTime: 4,
      trimStart: 0,
      trimEnd: 0,
      type: 'video',
      assetId: 'asset-linear',
    });

    remappedClip.timeRemap = {
      enabled: true,
      frameBlending: 'frame-mix',
      pitchCorrection: true,
      keyframes: [
        { timelineTime: 0, sourceTime: 0, interpolation: 'linear' },
        { timelineTime: 4, sourceTime: 7, interpolation: 'linear' },
      ],
    };

    const linearSnapshot = buildPlaybackSnapshot({
      ...baseSource,
      playheadTime: 2,
      tracks: [
        {
          ...baseSource.tracks[0]!,
          clips: [linearClip],
        },
      ],
    }, 'record-monitor');
    const remappedSnapshot = buildPlaybackSnapshot({
      ...baseSource,
      playheadTime: 2,
      tracks: [
        {
          ...baseSource.tracks[0]!,
          clips: [remappedClip],
        },
      ],
    }, 'record-monitor');

    expect(remappedSnapshot.sequenceRevision).not.toBe(linearSnapshot.sequenceRevision);
  });

  it('surfaces active effect layers for adjustment-style clips', () => {
    const effectClipId = `fx-layer-${Date.now()}`;
    const instance = effectsEngine.createInstance('blur-gaussian');
    if (!instance) {
      throw new Error('Failed to create effect instance for snapshot test.');
    }

    effectsEngine.addEffectToClip(effectClipId, instance.id);

    const snapshot = buildPlaybackSnapshot({
      ...baseSource,
      playheadTime: 2,
      tracks: [
        ...baseSource.tracks,
        {
          id: 't-fx1',
          name: 'FX1',
          type: 'EFFECT',
          sortOrder: 1,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#8f87a8',
          clips: [
            makeClip({
              id: effectClipId,
              trackId: 't-fx1',
              name: 'Adjustment Layer',
              startTime: 1,
              endTime: 5,
              trimStart: 0,
              trimEnd: 0,
              type: 'effect',
            }),
          ],
        },
      ],
    }, 'record-monitor');

    expect(snapshot.effectLayers).toHaveLength(1);
    expect(snapshot.effectLayers[0]?.clip.id).toBe(effectClipId);
    expect(snapshot.effectsRevision).toContain(effectClipId);

    effectsEngine.removeInstance(instance.id);
  });
});
