import { describe, expect, it } from 'vitest';

import { importScriptDocument, importTranscriptDocument } from '../../lib/transcriptImport';

describe('transcriptImport', () => {
  it('imports SRT transcript cues with speaker-prefixed text', () => {
    const result = importTranscriptDocument({
      fileName: 'interview.srt',
      text: `1
00:00:00,000 --> 00:00:02,500
SARAH: We need to talk.

2
00:00:02,500 --> 00:00:05,000
MARCUS: We can start with the opening.`,
      assetId: 'asset-1',
      defaultLanguage: 'en',
      provider: 'local-faster-whisper',
    });

    expect(result.cues).toHaveLength(2);
    expect(result.cues[0]).toMatchObject({
      assetId: 'asset-1',
      speaker: 'SARAH',
      text: 'We need to talk.',
      startTime: 0,
      endTime: 2.5,
      provider: 'local-faster-whisper',
    });
    expect(result.speakers.map((speaker) => speaker.label)).toContain('SARAH');
  });

  it('imports JSON transcript segments and preserves speaker ids', () => {
    const result = importTranscriptDocument({
      fileName: 'interview.json',
      text: JSON.stringify({
        language: 'fr',
        segments: [
          {
            id: 'cue-1',
            startTime: 0.5,
            endTime: 2.25,
            speakerId: 'speaker-a',
            speakerName: 'Claire',
            text: 'Bonjour tout le monde.',
          },
        ],
      }),
      assetId: 'asset-2',
    });

    expect(result.language).toBe('fr');
    expect(result.cues[0]).toMatchObject({
      id: 'cue-1',
      assetId: 'asset-2',
      speakerId: 'speaker-a',
      speaker: 'Claire',
      text: 'Bonjour tout le monde.',
    });
  });

  it('imports a script document from plain text', () => {
    const result = importScriptDocument('paper-edit.txt', 'HOST: Welcome back.\n\nGUEST: Thanks for having me.');
    expect(result.title).toBe('paper-edit');
    expect(result.source).toBe('IMPORTED');
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]?.speaker).toBe('HOST');
  });
});
