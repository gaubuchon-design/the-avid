import type {
  ScriptDocument,
  TranscriptCue,
  TranscriptSpeaker,
} from '../store/editor.store';
import { buildScriptDocumentFromText, deriveTranscriptSpeakers } from './transcriptWorkbench';

interface TranscriptImportPayload {
  fileName: string;
  text: string;
  assetId?: string;
  defaultLanguage?: string;
  provider?: string;
}

interface ImportedTranscriptResult {
  cues: TranscriptCue[];
  speakers: TranscriptSpeaker[];
  language: string;
}

interface ImportedSegmentLike {
  id?: string;
  text?: string;
  startTime?: number;
  endTime?: number;
  start?: number;
  end?: number;
  speaker?: string;
  speakerId?: string;
  speakerName?: string;
  confidence?: number;
  language?: string;
  translation?: string;
  words?: TranscriptCue['words'];
}

function basenameWithoutExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || 'Imported Script';
}

function parseTimestamp(value: string): number {
  const cleaned = value.trim().replace(',', '.');
  const parts = cleaned.split(':').map((segment) => Number(segment));
  if (parts.some((part) => Number.isNaN(part))) {
    return 0;
  }

  while (parts.length < 3) {
    parts.unshift(0);
  }

  const [hours, minutes, seconds] = parts;
  return (hours ?? 0) * 3600 + (minutes ?? 0) * 60 + (seconds ?? 0);
}

function parseSpeakerPrefixedText(text: string): { speaker: string; text: string } {
  const trimmed = text.trim();
  const match = trimmed.match(/^([A-Z][A-Z0-9 .'-]{1,32}):\s*(.+)$/);
  if (!match) {
    return {
      speaker: 'Speaker 1',
      text: trimmed,
    };
  }

  return {
    speaker: match[1] ?? 'Speaker 1',
    text: match[2] ?? trimmed,
  };
}

function normalizeImportedSegment(
  segment: ImportedSegmentLike,
  index: number,
  payload: TranscriptImportPayload,
): TranscriptCue {
  const speakerPrefixed = parseSpeakerPrefixedText(segment.text ?? '');
  return {
    id: segment.id ?? `imported-cue-${index + 1}`,
    assetId: payload.assetId,
    speaker: segment.speaker ?? segment.speakerName ?? speakerPrefixed.speaker,
    speakerId: segment.speakerId,
    text: speakerPrefixed.text,
    startTime: segment.startTime ?? segment.start ?? 0,
    endTime: segment.endTime ?? segment.end ?? Math.max((segment.startTime ?? segment.start ?? 0) + 1, 1),
    confidence: segment.confidence,
    source: 'TRANSCRIPT',
    language: segment.language ?? payload.defaultLanguage ?? 'und',
    translation: segment.translation,
    provider: payload.provider,
    linkedScriptLineIds: [],
    words: segment.words,
  };
}

function parseJsonTranscript(payload: TranscriptImportPayload): ImportedTranscriptResult {
  const parsed = JSON.parse(payload.text) as
    | ImportedSegmentLike[]
    | {
        transcript?: ImportedSegmentLike[];
        cues?: ImportedSegmentLike[];
        segments?: ImportedSegmentLike[];
        speakers?: TranscriptSpeaker[];
        language?: string;
      };

  const segments = Array.isArray(parsed)
    ? parsed
    : parsed.transcript ?? parsed.cues ?? parsed.segments ?? [];
  const cues = segments.map((segment, index) => normalizeImportedSegment(segment, index, payload));
  const speakers = Array.isArray(parsed) || !parsed.speakers?.length
    ? deriveTranscriptSpeakers(cues)
    : parsed.speakers;

  return {
    cues,
    speakers,
    language: (!Array.isArray(parsed) ? parsed.language : undefined) ?? payload.defaultLanguage ?? cues[0]?.language ?? 'und',
  };
}

function parseTimedTextTranscript(payload: TranscriptImportPayload, format: 'srt' | 'vtt'): ImportedTranscriptResult {
  const blocks = payload.text
    .replace(/\r/g, '')
    .replace(/^WEBVTT\s*\n+/i, '')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const cues: TranscriptCue[] = [];
  for (const [index, block] of blocks.entries()) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) {
      continue;
    }

    const timingLineIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingLineIndex === -1) {
      continue;
    }

    const timingLine = lines[timingLineIndex] ?? '';
    const [rawStart, rawEnd] = timingLine.split('-->').map((part) => part.trim());
    const speakerPrefixed = parseSpeakerPrefixedText(lines.slice(timingLineIndex + 1).join(' '));

    cues.push({
      id: `${format}-cue-${index + 1}`,
      assetId: payload.assetId,
      speaker: speakerPrefixed.speaker,
      text: speakerPrefixed.text,
      startTime: parseTimestamp(rawStart ?? '0'),
      endTime: parseTimestamp((rawEnd ?? '0').split(/\s+/)[0] ?? '0'),
      source: 'TRANSCRIPT',
      language: payload.defaultLanguage ?? 'und',
      provider: payload.provider,
      linkedScriptLineIds: [],
    });
  }

  return {
    cues,
    speakers: deriveTranscriptSpeakers(cues),
    language: payload.defaultLanguage ?? 'und',
  };
}

function detectTranscriptFormat(payload: TranscriptImportPayload): 'json' | 'srt' | 'vtt' {
  const loweredName = payload.fileName.toLowerCase();
  const trimmed = payload.text.trim();

  if (loweredName.endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'json';
  }

  if (loweredName.endsWith('.vtt') || trimmed.startsWith('WEBVTT')) {
    return 'vtt';
  }

  return 'srt';
}

export function importTranscriptDocument(payload: TranscriptImportPayload): ImportedTranscriptResult {
  switch (detectTranscriptFormat(payload)) {
    case 'json':
      return parseJsonTranscript(payload);
    case 'vtt':
      return parseTimedTextTranscript(payload, 'vtt');
    case 'srt':
    default:
      return parseTimedTextTranscript(payload, 'srt');
  }
}

export function importScriptDocument(fileName: string, text: string, existing?: ScriptDocument | null): ScriptDocument {
  const document = buildScriptDocumentFromText(text, existing);
  return {
    ...document,
    title: basenameWithoutExtension(fileName),
    source: 'IMPORTED',
    updatedAt: new Date().toISOString(),
  };
}
