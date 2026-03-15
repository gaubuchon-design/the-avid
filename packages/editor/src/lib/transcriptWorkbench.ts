import type {
  ScriptDocument,
  ScriptDocumentLine,
  TranscriptCue,
  TranscriptSpeaker,
} from '../store/editor.store';

export interface PhraseFindResult {
  id: string;
  kind: 'transcript' | 'script';
  text: string;
  speaker?: string;
  startTime?: number;
  endTime?: number;
  score: number;
  linkedCueIds: string[];
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function uniqueTokens(value: string): Set<string> {
  return new Set(tokenize(value));
}

function overlapScore(left: string, right: string): number {
  const leftTokens = uniqueTokens(left);
  const rightTokens = uniqueTokens(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let matches = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      matches += 1;
    }
  }

  return matches / Math.max(leftTokens.size, rightTokens.size);
}

export function serializeScriptDocumentLines(lines: ScriptDocumentLine[]): string {
  return lines.map((line) => {
    return line.speaker ? `${line.speaker}: ${line.text}` : line.text;
  }).join('\n\n');
}

export function buildScriptDocumentFromText(
  text: string,
  existing?: ScriptDocument | null,
): ScriptDocument {
  const rawLines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const lines = rawLines.map((line, index) => {
    const speakerMatch = line.match(/^([A-Z][A-Z0-9 .'-]{1,32}):\s*(.+)$/);
    const existingLine = existing?.lines[index];
    const nextSpeaker = speakerMatch?.[1] ?? existingLine?.speaker;
    const nextText = speakerMatch?.[2] ?? line;
    return {
      id: existingLine?.id ?? `script-line-${index + 1}`,
      lineNumber: index + 1,
      speaker: nextSpeaker,
      text: nextText,
      linkedCueIds: existingLine?.linkedCueIds ?? [],
    } satisfies ScriptDocumentLine;
  });

  return {
    id: existing?.id ?? 'script-document',
    title: existing?.title ?? 'Script',
    source: existing?.source ?? 'MANUAL',
    language: existing?.language ?? 'en',
    text: serializeScriptDocumentLines(lines),
    lines,
    updatedAt: new Date().toISOString(),
  };
}

export function buildScriptDocumentFromTranscript(
  transcript: TranscriptCue[],
  existing?: ScriptDocument | null,
): ScriptDocument {
  const lines = transcript.map((cue, index) => ({
    id: existing?.lines[index]?.id ?? `script-line-${index + 1}`,
    lineNumber: index + 1,
    speaker: cue.speaker,
    text: cue.text,
    linkedCueIds: [cue.id],
  }));

  return {
    id: existing?.id ?? 'script-document',
    title: existing?.title ?? 'Transcript Script',
    source: 'GENERATED',
    language: existing?.language ?? transcript[0]?.language ?? 'en',
    text: serializeScriptDocumentLines(lines),
    lines,
    updatedAt: new Date().toISOString(),
  };
}

export function deriveTranscriptSpeakers(transcript: TranscriptCue[]): TranscriptSpeaker[] {
  const speakers = new Map<string, TranscriptSpeaker>();

  for (const cue of transcript) {
    const speakerId = cue.speakerId ?? cue.speaker.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (!speakers.has(speakerId)) {
      speakers.set(speakerId, {
        id: speakerId,
        label: cue.speaker,
        confidence: cue.confidence,
        color: undefined,
        identified: false,
      });
    }
  }

  return [...speakers.values()];
}

export function syncScriptDocumentToTranscript(
  scriptDocument: ScriptDocument | null,
  transcript: TranscriptCue[],
): {
  scriptDocument: ScriptDocument | null;
  transcript: TranscriptCue[];
} {
  if (!scriptDocument) {
    return { scriptDocument: null, transcript };
  }

  const nextTranscript: TranscriptCue[] = transcript.map((cue) => ({
    ...cue,
    linkedScriptLineIds: [],
  }));

  const nextLines = scriptDocument.lines.map((line) => {
    const sortedMatches = nextTranscript
      .map((cue) => ({
        cueId: cue.id,
        score: Math.max(
          overlapScore(line.text, cue.text),
          overlapScore(`${line.speaker ?? ''} ${line.text}`, `${cue.speaker} ${cue.text}`),
        ),
      }))
      .sort((left, right) => right.score - left.score);

    const linkedCueIds = sortedMatches
      .filter((candidate, index) => candidate.score >= 0.33 || (index === 0 && candidate.score >= 0.18))
      .slice(0, 3)
      .map((candidate) => candidate.cueId);

    for (const cueId of linkedCueIds) {
      const cue = nextTranscript.find((entry) => entry.id === cueId);
      if (cue) {
        cue.linkedScriptLineIds = [...(cue.linkedScriptLineIds ?? []), line.id];
      }
    }

    return {
      ...line,
      linkedCueIds,
    };
  });

  return {
    transcript: nextTranscript,
    scriptDocument: {
      ...scriptDocument,
      lines: nextLines,
      text: serializeScriptDocumentLines(nextLines),
      updatedAt: new Date().toISOString(),
    },
  };
}

export function phraseFindTranscriptWorkbench(
  query: string,
  transcript: TranscriptCue[],
  scriptDocument: ScriptDocument | null,
): PhraseFindResult[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [];
  }

  const normalizedQuery = trimmedQuery.toLowerCase();
  const results: PhraseFindResult[] = [];

  for (const cue of transcript) {
    const cueText = [cue.speaker, cue.text, cue.translation ?? '']
      .join(' ')
      .toLowerCase();
    const score = cueText.includes(normalizedQuery)
      ? 1
      : Math.max(
          overlapScore(trimmedQuery, cue.text),
          overlapScore(trimmedQuery, cue.translation ?? ''),
          overlapScore(trimmedQuery, `${cue.speaker} ${cue.text}`),
        );

    if (score > 0) {
      results.push({
        id: `transcript-${cue.id}`,
        kind: 'transcript',
        text: cue.text,
        speaker: cue.speaker,
        startTime: cue.startTime,
        endTime: cue.endTime,
        score,
        linkedCueIds: [cue.id],
      });
    }
  }

  for (const line of scriptDocument?.lines ?? []) {
    const lineText = `${line.speaker ?? ''} ${line.text}`.toLowerCase();
    const score = lineText.includes(normalizedQuery)
      ? 1
      : Math.max(
          overlapScore(trimmedQuery, line.text),
          overlapScore(trimmedQuery, `${line.speaker ?? ''} ${line.text}`),
        );

    if (score > 0) {
      results.push({
        id: `script-${line.id}`,
        kind: 'script',
        text: line.text,
        speaker: line.speaker,
        score,
        linkedCueIds: [...(line.linkedCueIds ?? [])],
      });
    }
  }

  return results.sort((left, right) => right.score - left.score);
}
