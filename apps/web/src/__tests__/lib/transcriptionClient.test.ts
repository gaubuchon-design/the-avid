import { afterEach, describe, expect, it, vi } from 'vitest';

import { transcribeMediaAsset } from '../../lib/transcriptionClient';

describe('transcriptionClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('routes local file-backed assets through the path-based transcribe endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        segments: [
          {
            startTime: 0,
            endTime: 1.5,
            text: 'We need to talk.',
            speakerId: 'speaker-1',
            speakerName: 'Sarah',
          },
        ],
        speakers: [
          {
            id: 'speaker-1',
            name: 'Sarah',
            identified: true,
          },
        ],
        language: 'en',
        warnings: [],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await transcribeMediaAsset(
      {
        id: 'asset-1',
        name: 'Interview',
        type: 'AUDIO',
        status: 'READY',
        playbackUrl: 'file:///tmp/interview.wav',
        tags: [],
        isFavorite: false,
      },
      {
        transcriptionProvider: 'local-faster-whisper',
        translationProvider: 'local-runtime',
        transcriptionLanguageMode: 'manual',
        transcriptionLanguage: 'en',
        transcriptionTargetLanguage: 'en',
        enableTranscriptionDiarization: true,
        enableSpeakerIdentification: true,
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:4300/transcribe',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      audioPath: 'file:///tmp/interview.wav',
      language: 'en',
      diarize: true,
      task: 'transcribe',
    });
    expect(result.cues[0]).toMatchObject({
      assetId: 'asset-1',
      speaker: 'Sarah',
      text: 'We need to talk.',
    });
    expect(result.speakers[0]?.identified).toBe(true);
  });

  it('uploads in-memory assets to the local runtime and applies translation', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          segments: [
            {
              startTime: 0,
              endTime: 2,
              text: 'Hola equipo.',
              speakerId: 'speaker-a',
              speakerName: 'Ana',
            },
          ],
          speakers: [
            {
              id: 'speaker-a',
              name: 'Ana',
            },
          ],
          language: 'es',
          warnings: ['diarization unavailable'],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          translatedText: 'Hello team.',
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const assetFile = new File(['fake audio'], 'interview.wav', { type: 'audio/wav' });
    const result = await transcribeMediaAsset(
      {
        id: 'asset-2',
        name: 'Spanish Interview',
        type: 'AUDIO',
        status: 'READY',
        fileHandle: assetFile,
        tags: [],
        isFavorite: false,
      },
      {
        transcriptionProvider: 'local-faster-whisper',
        translationProvider: 'local-runtime',
        transcriptionLanguageMode: 'auto',
        transcriptionLanguage: 'en',
        transcriptionTargetLanguage: 'en',
        enableTranscriptionDiarization: false,
        enableSpeakerIdentification: false,
      },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:4300/transcribe-upload');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/octet-stream',
        'X-Audio-Filename': 'interview.wav',
      }),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://127.0.0.1:4300/translate');
    expect(result.cues[0]?.translation).toBe('Hello team.');
    expect(result.warnings).toContain('diarization unavailable');
  });

  it('fails clearly when cloud transcription is selected without configuration', async () => {
    await expect(
      transcribeMediaAsset(
        {
          id: 'asset-3',
          name: 'Cloud Interview',
          type: 'AUDIO',
          status: 'READY',
          fileHandle: new File(['audio'], 'cloud.wav', { type: 'audio/wav' }),
          tags: [],
          isFavorite: false,
        },
        {
          transcriptionProvider: 'cloud-openai-compatible',
          translationProvider: 'cloud-openai-compatible',
          transcriptionLanguageMode: 'auto',
          transcriptionLanguage: 'en',
          transcriptionTargetLanguage: 'en',
          enableTranscriptionDiarization: false,
          enableSpeakerIdentification: false,
        },
      ),
    ).rejects.toThrow('VITE_CLOUD_TRANSCRIPTION_URL');
  });
});
