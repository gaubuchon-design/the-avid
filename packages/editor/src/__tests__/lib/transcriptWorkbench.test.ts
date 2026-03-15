import { describe, expect, it } from 'vitest';
import {
  buildScriptDocumentFromText,
  buildScriptDocumentFromTranscript,
  deriveTranscriptSpeakers,
  phraseFindTranscriptWorkbench,
  syncScriptDocumentToTranscript,
} from '../../lib/transcriptWorkbench';
import type { TranscriptCue } from '../../store/editor.store';

const transcript: TranscriptCue[] = [
  {
    id: 'cue-1',
    assetId: 'asset-1',
    speaker: 'Sarah',
    text: 'We need to talk about the project deadline.',
    startTime: 0,
    endTime: 2.5,
    source: 'TRANSCRIPT',
  },
  {
    id: 'cue-2',
    assetId: 'asset-2',
    speaker: 'Marcus',
    text: "If we work together, absolutely. Let's start with the opening.",
    startTime: 3,
    endTime: 6.4,
    source: 'TRANSCRIPT',
  },
];

describe('transcriptWorkbench', () => {
  it('builds a script document from plain text', () => {
    const document = buildScriptDocumentFromText('SARAH: Hello there.\n\nMARCUS: Copy that.');

    expect(document.lines).toHaveLength(2);
    expect(document.lines[0]?.speaker).toBe('SARAH');
    expect(document.lines[1]?.text).toBe('Copy that.');
  });

  it('derives unique transcript speakers', () => {
    const speakers = deriveTranscriptSpeakers(transcript);

    expect(speakers).toHaveLength(2);
    expect(speakers.map((speaker) => speaker.label)).toEqual(['Sarah', 'Marcus']);
  });

  it('builds a generated script document from transcript cues', () => {
    const document = buildScriptDocumentFromTranscript(transcript);

    expect(document.source).toBe('GENERATED');
    expect(document.lines).toHaveLength(2);
    expect(document.lines[0]).toMatchObject({
      speaker: 'Sarah',
      text: 'We need to talk about the project deadline.',
      linkedCueIds: ['cue-1'],
    });
  });

  it('links script lines to transcript cues by text overlap', () => {
    const document = buildScriptDocumentFromText(
      'SARAH: We need to talk about the project deadline.\n\nMARCUS: Let us start with the opening.',
    );

    const synced = syncScriptDocumentToTranscript(document, transcript);

    expect(synced.scriptDocument?.lines[0]?.linkedCueIds).toEqual(['cue-1']);
    expect(synced.scriptDocument?.lines[1]?.linkedCueIds).toEqual(['cue-2']);
    expect(synced.transcript[0]?.linkedScriptLineIds).toContain(synced.scriptDocument?.lines[0]?.id);
  });

  it('finds phrase matches across transcript and script', () => {
    const document = buildScriptDocumentFromText('SARAH: We need to talk about the project deadline.');
    const results = phraseFindTranscriptWorkbench('project deadline', transcript, document);

    expect(results.length).toBeGreaterThan(1);
    expect(results[0]?.score).toBeGreaterThan(0);
    expect(results.some((result) => result.kind === 'transcript')).toBe(true);
    expect(results.some((result) => result.kind === 'script')).toBe(true);
  });

  it('matches against translated transcript text as well', () => {
    const translatedTranscript: TranscriptCue[] = [
      {
        ...transcript[0]!,
        translation: 'Nous devons parler de la date limite du projet.',
      },
    ];

    const results = phraseFindTranscriptWorkbench('date limite', translatedTranscript, null);

    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe('transcript');
  });
});
