import React, { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { TrackPatchPanel } from '../../components/TimelinePanel/TrackPatchPanel';
import { trackPatchingEngine } from '../../engine/TrackPatchingEngine';
import { useEditorStore } from '../../store/editor.store';

const initialEditorState = useEditorStore.getState();

describe('phase 1 track patch panel', () => {
  beforeEach(() => {
    useEditorStore.setState(initialEditorState, true);
    trackPatchingEngine.reset();
  });

  it('repatches a source track by dragging it onto a new record track', async () => {
    useEditorStore.setState({
      tracks: [
        {
          id: 't-v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [],
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
          clips: [],
        },
        {
          id: 't-a1',
          name: 'A1',
          type: 'AUDIO',
          sortOrder: 2,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#22c55e',
          clips: [],
        },
        {
          id: 't-a2',
          name: 'A2',
          type: 'AUDIO',
          sortOrder: 3,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#4ade80',
          clips: [],
        },
      ],
      sourceAsset: {
        id: 'asset-source',
        name: 'Source Clip',
        type: 'VIDEO',
        status: 'READY',
        tags: [],
        isFavorite: false,
        audioChannels: 2,
      },
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<TrackPatchPanel />);
    });

    const sourcePatch = container.querySelector('[aria-label="Unpatch V1 from V1"]');
    const target = container.querySelector('[aria-label="Patch target V2"]');

    expect(sourcePatch).toBeInstanceOf(HTMLButtonElement);
    expect(target).toBeInstanceOf(HTMLDivElement);
    expect(trackPatchingEngine.getRecordTrackForSource('src-v1')).toBe('t-v1');

    await act(async () => {
      sourcePatch?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    await act(async () => {
      target?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });

    await act(async () => {
      target?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expect(trackPatchingEngine.getRecordTrackForSource('src-v1')).toBe('t-v2');
    expect(trackPatchingEngine.getSourceTrackForRecord('t-v1')).toBeNull();
    expect(trackPatchingEngine.isRecordTrackEnabled('t-v2')).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  it('quick-patches an unpatched source chip to the next compatible record track', async () => {
    useEditorStore.setState({
      tracks: [
        {
          id: 't-v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [],
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
          clips: [],
        },
      ],
      sourceAsset: {
        id: 'asset-stills',
        name: 'Graphic',
        type: 'IMAGE',
        status: 'READY',
        tags: [],
        isFavorite: false,
      },
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<TrackPatchPanel />);
    });

    expect(trackPatchingEngine.getRecordTrackForSource('src-v1')).toBe('t-v1');

    await act(async () => {
      trackPatchingEngine.unpatchSource('src-v1');
    });

    const sourceChip = container.querySelector('[aria-label="Patch source V1"]');
    expect(sourceChip).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      sourceChip?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(trackPatchingEngine.getRecordTrackForSource('src-v1')).toBe('t-v1');
    expect(trackPatchingEngine.isRecordTrackEnabled('t-v1')).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });
});
