import { describe, expect, it } from 'vitest';
import {
  resolveSegmentGraph,
  getActiveVideoSegments,
  getActiveAudioSegments,
  segmentSourceTime,
  timeToFrame,
  frameToTime,
  totalFrames,
} from '../../engine/SegmentGraph';
import { makeClip } from '../../store/editor.store';
import type { Track, SequenceSettings } from '../../store/editor.store';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTrack(overrides: Partial<Track> & { id: string; type: Track['type'] }): Track {
  return {
    name: overrides.id,
    sortOrder: 0,
    muted: false,
    locked: false,
    solo: false,
    volume: 1,
    clips: [],
    color: '#5b6af5',
    ...overrides,
  };
}

const defaultSettings: SequenceSettings = {
  name: 'Test Sequence',
  fps: 24,
  dropFrame: false,
  startTC: 0,
  width: 1920,
  height: 1080,
  sampleRate: 48000,
  colorSpace: 'rec709',
  displayTransform: 'sdr-rec709',
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SegmentGraph', () => {
  it('resolves an empty timeline to an empty graph', () => {
    const graph = resolveSegmentGraph([], defaultSettings);
    expect(graph.videoSegments).toHaveLength(0);
    expect(graph.audioSegments).toHaveLength(0);
    expect(graph.duration).toBe(0);
    expect(graph.segmentCount).toBe(0);
  });

  it('resolves a single video clip to one video segment + one audio segment', () => {
    const tracks: Track[] = [
      makeTrack({
        id: 'v1',
        type: 'VIDEO',
        clips: [
          makeClip({
            id: 'clip-1',
            trackId: 'v1',
            name: 'Scene 1',
            startTime: 0,
            endTime: 10,
            trimStart: 2,
            trimEnd: 0,
            type: 'video',
            assetId: 'asset-1',
          }),
        ],
      }),
    ];

    const graph = resolveSegmentGraph(tracks, defaultSettings);

    expect(graph.videoSegments).toHaveLength(1);
    expect(graph.audioSegments).toHaveLength(1);
    expect(graph.duration).toBe(10);
    expect(graph.fps).toBe(24);
    expect(graph.referencedAssetIds.has('asset-1')).toBe(true);

    const seg = graph.videoSegments[0]!;
    expect(seg.clipId).toBe('clip-1');
    expect(seg.assetId).toBe('asset-1');
    expect(seg.timelineStart).toBe(0);
    expect(seg.timelineEnd).toBe(10);
    expect(seg.sourceStart).toBe(2); // trimStart
    expect(seg.blendMode).toBe('source-over');
    expect(seg.transitionIn).toBeNull();
    expect(seg.transitionOut).toBeNull();
  });

  it('excludes muted tracks from the segment graph', () => {
    const tracks: Track[] = [
      makeTrack({
        id: 'v1',
        type: 'VIDEO',
        muted: true,
        clips: [
          makeClip({
            id: 'clip-1',
            trackId: 'v1',
            name: 'Muted',
            startTime: 0,
            endTime: 5,
            trimStart: 0,
            trimEnd: 0,
            type: 'video',
            assetId: 'asset-1',
          }),
        ],
      }),
    ];

    const graph = resolveSegmentGraph(tracks, defaultSettings);
    expect(graph.videoSegments).toHaveLength(0);
    expect(graph.audioSegments).toHaveLength(0);
  });

  it('handles solo tracks — only soloed tracks appear', () => {
    const tracks: Track[] = [
      makeTrack({
        id: 'v1',
        type: 'VIDEO',
        solo: true,
        clips: [
          makeClip({
            id: 'clip-solo',
            trackId: 'v1',
            name: 'Soloed',
            startTime: 0,
            endTime: 5,
            trimStart: 0,
            trimEnd: 0,
            type: 'video',
            assetId: 'asset-solo',
          }),
        ],
      }),
      makeTrack({
        id: 'v2',
        type: 'VIDEO',
        sortOrder: 1,
        clips: [
          makeClip({
            id: 'clip-other',
            trackId: 'v2',
            name: 'Other',
            startTime: 0,
            endTime: 5,
            trimStart: 0,
            trimEnd: 0,
            type: 'video',
            assetId: 'asset-other',
          }),
        ],
      }),
    ];

    const graph = resolveSegmentGraph(tracks, defaultSettings);
    expect(graph.videoSegments).toHaveLength(1);
    expect(graph.videoSegments[0]!.clipId).toBe('clip-solo');
  });

  it('detects transition overlap between consecutive clips', () => {
    const tracks: Track[] = [
      makeTrack({
        id: 'v1',
        type: 'VIDEO',
        clips: [
          makeClip({
            id: 'clip-a',
            trackId: 'v1',
            name: 'A',
            startTime: 0,
            endTime: 6,
            trimStart: 0,
            trimEnd: 0,
            type: 'video',
            assetId: 'asset-a',
          }),
          makeClip({
            id: 'clip-b',
            trackId: 'v1',
            name: 'B',
            startTime: 4, // overlaps clip-a by 2 seconds
            endTime: 10,
            trimStart: 0,
            trimEnd: 0,
            type: 'video',
            assetId: 'asset-b',
          }),
        ],
      }),
    ];

    const graph = resolveSegmentGraph(tracks, defaultSettings);
    expect(graph.videoSegments).toHaveLength(2);

    const segA = graph.videoSegments.find((s) => s.clipId === 'clip-a')!;
    const segB = graph.videoSegments.find((s) => s.clipId === 'clip-b')!;

    // A should have a transition out
    expect(segA.transitionOut).not.toBeNull();
    expect(segA.transitionOut!.startTime).toBe(4);
    expect(segA.transitionOut!.endTime).toBe(6);
    expect(segA.transitionOut!.outgoingClipId).toBe('clip-a');
    expect(segA.transitionOut!.incomingClipId).toBe('clip-b');

    // B should have a transition in
    expect(segB.transitionIn).not.toBeNull();
    expect(segB.transitionIn!.startTime).toBe(4);
    expect(segB.transitionIn!.endTime).toBe(6);
  });

  it('produces audio segments from audio tracks', () => {
    const tracks: Track[] = [
      makeTrack({
        id: 'a1',
        type: 'AUDIO',
        volume: -6,
        clips: [
          makeClip({
            id: 'clip-audio',
            trackId: 'a1',
            name: 'Narration',
            startTime: 0,
            endTime: 30,
            trimStart: 1,
            trimEnd: 0,
            type: 'audio',
            assetId: 'asset-narration',
          }),
        ],
      }),
    ];

    const graph = resolveSegmentGraph(tracks, defaultSettings);
    expect(graph.videoSegments).toHaveLength(0);
    expect(graph.audioSegments).toHaveLength(1);

    const seg = graph.audioSegments[0]!;
    expect(seg.assetId).toBe('asset-narration');
    expect(seg.trackVolume).toBe(-6);
  });

  it('sorts video segments by timeline time then track sort order', () => {
    const tracks: Track[] = [
      makeTrack({
        id: 'v1',
        type: 'VIDEO',
        sortOrder: 0,
        clips: [
          makeClip({
            id: 'clip-v1',
            trackId: 'v1',
            name: 'BG',
            startTime: 0,
            endTime: 10,
            trimStart: 0,
            trimEnd: 0,
            type: 'video',
            assetId: 'asset-bg',
          }),
        ],
      }),
      makeTrack({
        id: 'v2',
        type: 'VIDEO',
        sortOrder: 1,
        clips: [
          makeClip({
            id: 'clip-v2',
            trackId: 'v2',
            name: 'Overlay',
            startTime: 0,
            endTime: 10,
            trimStart: 0,
            trimEnd: 0,
            type: 'video',
            assetId: 'asset-overlay',
          }),
        ],
      }),
    ];

    const graph = resolveSegmentGraph(tracks, defaultSettings);
    expect(graph.videoSegments[0]!.trackSortOrder).toBe(0);
    expect(graph.videoSegments[1]!.trackSortOrder).toBe(1);
  });
});

describe('SegmentGraph query helpers', () => {
  const tracks: Track[] = [
    makeTrack({
      id: 'v1',
      type: 'VIDEO',
      sortOrder: 0,
      clips: [
        makeClip({
          id: 'clip-1',
          trackId: 'v1',
          name: 'Scene 1',
          startTime: 0,
          endTime: 5,
          trimStart: 0,
          trimEnd: 0,
          type: 'video',
          assetId: 'asset-1',
        }),
        makeClip({
          id: 'clip-2',
          trackId: 'v1',
          name: 'Scene 2',
          startTime: 5,
          endTime: 10,
          trimStart: 0,
          trimEnd: 0,
          type: 'video',
          assetId: 'asset-2',
        }),
      ],
    }),
  ];

  const graph = resolveSegmentGraph(tracks, defaultSettings);

  it('getActiveVideoSegments returns the correct segment for a given time', () => {
    const at2 = getActiveVideoSegments(graph, 2);
    expect(at2).toHaveLength(1);
    expect(at2[0]!.clipId).toBe('clip-1');

    const at7 = getActiveVideoSegments(graph, 7);
    expect(at7).toHaveLength(1);
    expect(at7[0]!.clipId).toBe('clip-2');

    // At the cut point (5.0), clip-2 starts
    const at5 = getActiveVideoSegments(graph, 5);
    expect(at5).toHaveLength(1);
    expect(at5[0]!.clipId).toBe('clip-2');
  });

  it('getActiveVideoSegments returns empty for time outside all segments', () => {
    const atEnd = getActiveVideoSegments(graph, 15);
    expect(atEnd).toHaveLength(0);
  });

  it('timeToFrame and frameToTime are inverse operations', () => {
    const fps = 24;
    for (const t of [0, 1.5, 10, 99.999]) {
      const frame = timeToFrame(t, fps);
      const roundTrip = frameToTime(frame, fps);
      // Round-trip loses sub-frame precision, but frame number is consistent
      expect(timeToFrame(roundTrip, fps)).toBe(frame);
    }
  });

  it('totalFrames returns the correct count', () => {
    expect(totalFrames(graph)).toBe(Math.ceil(10 * 24));
  });
});

describe('SegmentGraph source time mapping', () => {
  it('maps timeline time to source time with trim offset', () => {
    const tracks: Track[] = [
      makeTrack({
        id: 'v1',
        type: 'VIDEO',
        clips: [
          makeClip({
            id: 'clip-trimmed',
            trackId: 'v1',
            name: 'Trimmed',
            startTime: 0,
            endTime: 5,
            trimStart: 10, // source starts at 10s
            trimEnd: 0,
            type: 'video',
            assetId: 'asset-trimmed',
          }),
        ],
      }),
    ];

    const graph = resolveSegmentGraph(tracks, defaultSettings);
    const seg = graph.videoSegments[0]!;

    // At timeline time 2, source should be 10 + 2 = 12
    const sourceTime = segmentSourceTime(seg, 2);
    expect(sourceTime).toBe(12);
  });
});
