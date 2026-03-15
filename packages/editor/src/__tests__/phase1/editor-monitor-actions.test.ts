import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playbackEngine } from '../../engine/PlaybackEngine';
import {
  activateRecordMonitor,
  activateSourceMonitor,
  clearInForActiveMonitor,
  clearMarksForActiveMonitor,
  clearOutForActiveMonitor,
  goToEndForActiveMonitor,
  goToInForActiveMonitor,
  goToStartForActiveMonitor,
  goToOutForActiveMonitor,
  markClipForActiveMonitor,
  markInForActiveMonitor,
  markOutForActiveMonitor,
  matchFrameAtPlayhead,
  playForwardForActiveMonitor,
  playReverseForActiveMonitor,
  resetSourceMonitorShuttleState,
  stepFramesForActiveMonitor,
  stopActiveMonitorPlayback,
  toggleMonitorFocus,
  togglePlayForActiveMonitor,
} from '../../lib/editorMonitorActions';
import { makeClip, useEditorStore } from '../../store/editor.store';
import { usePlayerStore } from '../../store/player.store';

const initialEditorState = useEditorStore.getState();
const initialPlayerState = usePlayerStore.getState();

describe('phase 1 editor monitor keyboard actions', () => {
  beforeEach(() => {
    useEditorStore.setState(initialEditorState, true);
    usePlayerStore.setState(initialPlayerState, true);
    resetSourceMonitorShuttleState();
    vi.restoreAllMocks();
  });

  it('marks source in and out when the source monitor is active', () => {
    usePlayerStore.setState({ activeMonitor: 'source' });
    useEditorStore.setState({
      sourcePlayhead: 12.5,
      inPoint: null,
      outPoint: null,
      sourceInPoint: null,
      sourceOutPoint: null,
    });

    markInForActiveMonitor();
    markOutForActiveMonitor();

    const state = useEditorStore.getState();
    expect(state.sourceInPoint).toBe(12.5);
    expect(state.sourceOutPoint).toBe(12.5);
    expect(state.inPoint).toBeNull();
    expect(state.outPoint).toBeNull();
  });

  it('marks record in and out when the record monitor is active', () => {
    usePlayerStore.setState({ activeMonitor: 'record' });
    useEditorStore.setState({
      playheadTime: 8.25,
      inPoint: null,
      outPoint: null,
      sourceInPoint: null,
      sourceOutPoint: null,
    });

    markInForActiveMonitor();
    markOutForActiveMonitor();

    const state = useEditorStore.getState();
    expect(state.inPoint).toBe(8.25);
    expect(state.outPoint).toBe(8.25);
    expect(state.sourceInPoint).toBeNull();
    expect(state.sourceOutPoint).toBeNull();
  });

  it('clears and recalls source marks when the source monitor is active', () => {
    usePlayerStore.setState({ activeMonitor: 'source' });
    useEditorStore.setState({
      sourcePlayhead: 2,
      playheadTime: 9,
      sourceInPoint: 3,
      sourceOutPoint: 7,
      inPoint: 10,
      outPoint: 14,
    });

    goToInForActiveMonitor();
    expect(useEditorStore.getState().sourcePlayhead).toBe(3);
    expect(useEditorStore.getState().playheadTime).toBe(9);

    goToOutForActiveMonitor();
    expect(useEditorStore.getState().sourcePlayhead).toBe(7);

    clearInForActiveMonitor();
    expect(useEditorStore.getState().sourceInPoint).toBeNull();
    expect(useEditorStore.getState().inPoint).toBe(10);

    clearOutForActiveMonitor();
    expect(useEditorStore.getState().sourceOutPoint).toBeNull();
    expect(useEditorStore.getState().outPoint).toBe(14);

    useEditorStore.setState({ sourceInPoint: 1, sourceOutPoint: 5 });
    clearMarksForActiveMonitor();
    expect(useEditorStore.getState().sourceInPoint).toBeNull();
    expect(useEditorStore.getState().sourceOutPoint).toBeNull();
    expect(useEditorStore.getState().inPoint).toBe(10);
    expect(useEditorStore.getState().outPoint).toBe(14);
  });

  it('clears and recalls record marks when the record monitor is active', () => {
    usePlayerStore.setState({ activeMonitor: 'record' });
    useEditorStore.setState({
      sourcePlayhead: 4,
      playheadTime: 9,
      duration: 20,
      sourceInPoint: 2,
      sourceOutPoint: 6,
      inPoint: 10,
      outPoint: 14,
    });

    goToInForActiveMonitor();
    expect(useEditorStore.getState().playheadTime).toBe(10);
    expect(useEditorStore.getState().sourcePlayhead).toBe(4);

    goToOutForActiveMonitor();
    expect(useEditorStore.getState().playheadTime).toBe(14);

    clearInForActiveMonitor();
    expect(useEditorStore.getState().inPoint).toBeNull();
    expect(useEditorStore.getState().sourceInPoint).toBe(2);

    clearOutForActiveMonitor();
    expect(useEditorStore.getState().outPoint).toBeNull();
    expect(useEditorStore.getState().sourceOutPoint).toBe(6);

    useEditorStore.setState({ inPoint: 1, outPoint: 5 });
    clearMarksForActiveMonitor();
    expect(useEditorStore.getState().inPoint).toBeNull();
    expect(useEditorStore.getState().outPoint).toBeNull();
    expect(useEditorStore.getState().sourceInPoint).toBe(2);
    expect(useEditorStore.getState().sourceOutPoint).toBe(6);
  });

  it('marks the full loaded source clip when the source monitor is active', () => {
    usePlayerStore.setState({ activeMonitor: 'source' });
    useEditorStore.setState({
      sourceAsset: {
        id: 'asset-source',
        name: 'Source',
        type: 'VIDEO',
        status: 'READY',
        duration: 18,
        tags: [],
        isFavorite: false,
      },
      sourceInPoint: null,
      sourceOutPoint: null,
      inPoint: 2,
      outPoint: 6,
    });

    expect(markClipForActiveMonitor()).toBe(true);

    const state = useEditorStore.getState();
    expect(state.sourceInPoint).toBe(0);
    expect(state.sourceOutPoint).toBe(18);
    expect(state.inPoint).toBe(2);
    expect(state.outPoint).toBe(6);
  });

  it('marks the active timeline clip when the record monitor is active', () => {
    usePlayerStore.setState({ activeMonitor: 'record' });
    useEditorStore.setState({
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
              name: 'Timeline Clip',
              startTime: 4,
              endTime: 9,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
      ],
      enabledTrackIds: ['v1'],
      selectedTrackId: null,
      playheadTime: 6,
      inPoint: null,
      outPoint: null,
    });

    expect(markClipForActiveMonitor()).toBe(true);

    const state = useEditorStore.getState();
    expect(state.inPoint).toBe(4);
    expect(state.outPoint).toBe(9);
  });

  it('routes transport actions to the active monitor', () => {
    usePlayerStore.setState({ activeMonitor: 'source', isPlaying: false, speed: 1 });
    useEditorStore.setState({ isPlaying: false });

    togglePlayForActiveMonitor();

    expect(usePlayerStore.getState().isPlaying).toBe(true);
    expect(useEditorStore.getState().isPlaying).toBe(false);

    stopActiveMonitorPlayback();

    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(usePlayerStore.getState().speed).toBe(1);

    const shuttleSpy = vi.spyOn(playbackEngine, 'jklShuttle');
    usePlayerStore.setState({ activeMonitor: 'record' });

    playForwardForActiveMonitor();
    playReverseForActiveMonitor();

    expect(shuttleSpy).toHaveBeenNthCalledWith(1, 'l');
    expect(shuttleSpy).toHaveBeenNthCalledWith(2, 'j');
  });

  it('toggles monitor focus and routes start/end and frame stepping to the visible monitor', () => {
    usePlayerStore.setState({ activeMonitor: 'record' });
    useEditorStore.setState({
      sourceAsset: {
        id: 'asset-source',
        name: 'Source',
        type: 'VIDEO',
        status: 'READY',
        duration: 12,
        tags: [],
        isFavorite: false,
      },
      sourcePlayhead: 3,
      playheadTime: 9,
      duration: 30,
      sequenceSettings: {
        ...useEditorStore.getState().sequenceSettings,
        fps: 24,
      },
    });

    toggleMonitorFocus();
    expect(usePlayerStore.getState().activeMonitor).toBe('source');

    stepFramesForActiveMonitor(1);
    expect(useEditorStore.getState().sourcePlayhead).toBeCloseTo(3 + (1 / 24), 5);
    expect(useEditorStore.getState().playheadTime).toBe(9);

    goToStartForActiveMonitor();
    expect(useEditorStore.getState().sourcePlayhead).toBe(0);

    goToEndForActiveMonitor();
    expect(useEditorStore.getState().sourcePlayhead).toBe(12);

    activateRecordMonitor();
    expect(usePlayerStore.getState().activeMonitor).toBe('record');

    stepFramesForActiveMonitor(-1);
    expect(useEditorStore.getState().playheadTime).toBeCloseTo(9 - (1 / 24), 5);

    activateSourceMonitor();
    expect(usePlayerStore.getState().activeMonitor).toBe('source');
  });

  it('loads the record clip into the source monitor for match frame', () => {
    const baseAsset = {
      id: 'asset-video-1',
      name: 'Interview',
      type: 'VIDEO' as const,
      status: 'READY' as const,
      tags: [],
      isFavorite: false,
    };
    const overlayAsset = {
      id: 'asset-video-2',
      name: 'B-roll',
      type: 'VIDEO' as const,
      status: 'READY' as const,
      tags: [],
      isFavorite: false,
    };

    usePlayerStore.setState({ activeMonitor: 'record' });
    useEditorStore.setState({
      bins: [
        {
          id: 'b-master',
          name: 'Master',
          color: '#5b6af5',
          children: [],
          assets: [baseAsset, overlayAsset],
          isOpen: true,
          sequences: [],
        },
      ],
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
              assetId: baseAsset.id,
              trackId: 'v1',
              name: 'Timeline Clip',
              startTime: 10,
              endTime: 14,
              trimStart: 3,
              trimEnd: 0,
              type: 'video',
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
              assetId: overlayAsset.id,
              trackId: 'v2',
              name: 'Overlay Clip',
              startTime: 10,
              endTime: 14,
              trimStart: 7,
              trimEnd: 0,
              type: 'video',
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
              assetId: 'title-1',
              trackId: 'g1',
              name: 'Title Overlay',
              startTime: 10,
              endTime: 14,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
      ],
      playheadTime: 11.5,
      sourceAsset: null,
      sourcePlayhead: 0,
      inspectedClipId: null,
    });

    expect(matchFrameAtPlayhead()).toBe(true);

    const state = useEditorStore.getState();
    expect(state.sourceAsset?.id).toBe(overlayAsset.id);
    expect(state.sourcePlayhead).toBe(8.5);
    expect(state.inspectedClipId).toBe('clip-v2');
    expect(usePlayerStore.getState().activeMonitor).toBe('source');
  });
});
