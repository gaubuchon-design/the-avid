import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ScriptPanel } from '../../components/ScriptPanel/ScriptPanel';
import { useEditorStore } from '../../store/editor.store';

const initialState = useEditorStore.getState();

describe('ScriptPanel', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    useEditorStore.setState(initialState, true);
    useEditorStore.setState({
      bins: [
        {
          id: 'b1',
          name: 'Master',
          color: '#5b6af5',
          isOpen: true,
          children: [],
          assets: [
            {
              id: 'asset-1',
              name: 'Interview Clip',
              type: 'VIDEO',
              duration: 12,
              status: 'READY',
              playbackUrl: 'file:///tmp/interview.mov',
              tags: [],
              isFavorite: false,
            },
          ],
        },
      ],
      transcript: [
        {
          id: 'cue-1',
          assetId: 'asset-1',
          speaker: 'Sarah',
          text: 'We need to talk about the project deadline.',
          startTime: 0.5,
          endTime: 2.2,
          source: 'TRANSCRIPT',
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    useEditorStore.setState(initialState, true);
  });

  it('builds a persisted script document from the script workbench', () => {
    render(<ScriptPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Demo Script' }));

    expect(screen.getByDisplayValue(/SARAH:/)).toBeInTheDocument();
    expect(useEditorStore.getState().scriptDocument?.lines.length).toBeGreaterThan(0);
  });

  it('filters transcript content through PhraseFind search', () => {
    render(<ScriptPanel />);

    fireEvent.change(
      screen.getByPlaceholderText('PhraseFind across transcript and script...'),
      { target: { value: 'deadline' } },
    );

    expect(screen.getByDisplayValue('We need to talk about the project deadline.')).toBeInTheDocument();
  });

  it('transcribes the current source candidate and builds generated script lines', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        segments: [
          {
            startTime: 0,
            endTime: 1.4,
            text: 'First transcript line.',
            speakerId: 'speaker-1',
            speakerName: 'Sarah',
          },
          {
            startTime: 1.5,
            endTime: 3.2,
            text: 'Second transcript line.',
            speakerId: 'speaker-2',
            speakerName: 'Marcus',
          },
        ],
        speakers: [
          { id: 'speaker-1', name: 'Sarah', identified: false },
          { id: 'speaker-2', name: 'Marcus', identified: false },
        ],
        language: 'en',
        warnings: [],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ScriptPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Transcribe Source' }));

    await waitFor(() => {
      expect(useEditorStore.getState().transcript).toHaveLength(2);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:4300/transcribe',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(useEditorStore.getState().scriptDocument?.source).toBe('GENERATED');
    expect(useEditorStore.getState().scriptDocument?.lines).toHaveLength(2);
    expect(screen.getByText(/Transcribed Interview Clip into 2 cues/)).toBeInTheDocument();
  });

  it('loads and inserts a transcript cue onto the timeline using the cue range', async () => {
    render(<ScriptPanel />);

    const cueTextarea = screen.getByDisplayValue('We need to talk about the project deadline.');
    const cueCard = cueTextarea.closest('.scriptsync-cue-card');
    expect(cueCard).not.toBeNull();

    fireEvent.click(within(cueCard as HTMLElement).getByRole('button', { name: 'Insert' }));

    await waitFor(() => {
      const clips = useEditorStore.getState().tracks.flatMap((track) => track.clips);
      expect(clips.some((clip) => clip.assetId === 'asset-1')).toBe(true);
    });

    const insertedClip = useEditorStore.getState().tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.assetId === 'asset-1');
    expect(insertedClip?.trimStart).toBe(0.5);
    expect(insertedClip?.trimEnd).toBeCloseTo(9.8, 3);
    expect(useEditorStore.getState().sourceInPoint).toBe(0.5);
    expect(useEditorStore.getState().sourceOutPoint).toBe(2.2);
  });
});
