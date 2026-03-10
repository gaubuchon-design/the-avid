import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playbackEngine } from '../../engine/PlaybackEngine';
import {
  markInForActiveMonitor,
  markOutForActiveMonitor,
  matchFrameAtPlayhead,
  playForwardForActiveMonitor,
  playReverseForActiveMonitor,
  resetSourceMonitorShuttleState,
  stopActiveMonitorPlayback,
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

  it('loads the record clip into the source monitor for match frame', () => {
    const asset = {
      id: 'asset-video-1',
      name: 'Interview',
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
          assets: [asset],
          isOpen: true,
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
              assetId: asset.id,
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
      ],
      playheadTime: 11.5,
      sourceAsset: null,
      sourcePlayhead: 0,
      inspectedClipId: null,
    });

    expect(matchFrameAtPlayhead()).toBe(true);

    const state = useEditorStore.getState();
    expect(state.sourceAsset?.id).toBe(asset.id);
    expect(state.sourcePlayhead).toBe(4.5);
    expect(state.inspectedClipId).toBe('clip-v1');
    expect(usePlayerStore.getState().activeMonitor).toBe('source');
  });
});
