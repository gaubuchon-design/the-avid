import type {
  MediaAsset,
  TranscriptCue,
  TranscriptSpeaker,
} from '../store/editor.store';
import type { UserSettings } from '../store/userSettings.store';

interface RuntimeTranscriptWord {
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  speakerId?: string;
}

interface RuntimeTranscriptSegment {
  startTime: number;
  endTime: number;
  text: string;
  confidence?: number;
  speakerId?: string;
  speakerName?: string;
  translatedText?: string | null;
  words?: RuntimeTranscriptWord[];
}

interface RuntimeTranscriptSpeaker {
  id: string;
  name?: string;
  label?: string;
  confidence?: number;
  identified?: boolean;
  color?: string;
}

interface RuntimeTranscriptionResponse {
  segments?: RuntimeTranscriptSegment[];
  speakers?: RuntimeTranscriptSpeaker[];
  language?: string;
  languageMetadata?: {
    code?: string;
    confidence?: number;
  } | null;
  warnings?: string[];
  modelId?: string;
  text?: string;
  words?: RuntimeTranscriptWord[];
}

interface RuntimeTranslationResponse {
  translatedText?: string;
  text?: string;
}

export interface TranscriptionExecutionSettings {
  transcriptionProvider: UserSettings['transcriptionProvider'];
  translationProvider: UserSettings['translationProvider'];
  transcriptionLanguageMode: UserSettings['transcriptionLanguageMode'];
  transcriptionLanguage: UserSettings['transcriptionLanguage'];
  transcriptionTargetLanguage: UserSettings['transcriptionTargetLanguage'];
  enableTranscriptionDiarization: UserSettings['enableTranscriptionDiarization'];
  enableSpeakerIdentification: UserSettings['enableSpeakerIdentification'];
}

export interface AssetTranscriptionResult {
  asset: MediaAsset;
  cues: TranscriptCue[];
  speakers: TranscriptSpeaker[];
  detectedLanguage: string;
  warnings: string[];
  provider: UserSettings['transcriptionProvider'];
  modelId?: string;
}

const LOCAL_AI_RUNTIME_URL = ((import.meta as { env?: Record<string, string | undefined> }).env?.['VITE_LOCAL_AI_RUNTIME_URL'])
  || 'http://127.0.0.1:4300';
const CLOUD_TRANSCRIPTION_URL = (import.meta as { env?: Record<string, string | undefined> }).env?.['VITE_CLOUD_TRANSCRIPTION_URL'];
const CLOUD_TRANSCRIPTION_API_KEY = (import.meta as { env?: Record<string, string | undefined> }).env?.['VITE_CLOUD_TRANSCRIPTION_API_KEY'];
const CLOUD_TRANSCRIPTION_MODEL = (import.meta as { env?: Record<string, string | undefined> }).env?.['VITE_CLOUD_TRANSCRIPTION_MODEL']
  || 'whisper-1';
const CLOUD_TRANSLATION_URL = (import.meta as { env?: Record<string, string | undefined> }).env?.['VITE_CLOUD_TRANSLATION_URL'];
const CLOUD_TRANSLATION_API_KEY = (import.meta as { env?: Record<string, string | undefined> }).env?.['VITE_CLOUD_TRANSLATION_API_KEY'];

function normalizeLanguage(language: string | undefined): string | undefined {
  const trimmed = language?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveLanguageHint(settings: TranscriptionExecutionSettings): string | undefined {
  return settings.transcriptionLanguageMode === 'manual'
    ? normalizeLanguage(settings.transcriptionLanguage)
    : undefined;
}

function resolveTargetLanguage(settings: TranscriptionExecutionSettings): string | undefined {
  return normalizeLanguage(settings.transcriptionTargetLanguage);
}

function resolveSpeakerLabel(
  segment: RuntimeTranscriptSegment,
  speakersById: Map<string, RuntimeTranscriptSpeaker>,
): string {
  if (segment.speakerName) {
    return segment.speakerName;
  }

  if (segment.speakerId) {
    const speaker = speakersById.get(segment.speakerId);
    if (speaker?.name) {
      return speaker.name;
    }
    if (speaker?.label) {
      return speaker.label;
    }
  }

  return 'Speaker 1';
}

function buildTranscriptResult(
  asset: MediaAsset,
  response: RuntimeTranscriptionResponse,
  settings: TranscriptionExecutionSettings,
): AssetTranscriptionResult {
  const segments = response.segments ?? [];
  const detectedLanguage = response.languageMetadata?.code ?? response.language ?? resolveLanguageHint(settings) ?? 'und';
  const speakers = response.speakers ?? [];
  const speakersById = new Map(speakers.map((speaker) => [speaker.id, speaker] as const));

  const cues: TranscriptCue[] = segments.map((segment, index) => ({
    id: `${asset.id}-cue-${index + 1}`,
    assetId: asset.id,
    speaker: resolveSpeakerLabel(segment, speakersById),
    text: segment.text.trim(),
    startTime: segment.startTime,
    endTime: segment.endTime,
    confidence: segment.confidence,
    source: 'TRANSCRIPT',
    speakerId: segment.speakerId,
    language: detectedLanguage,
    translation: segment.translatedText ?? undefined,
    provider: settings.transcriptionProvider,
    linkedScriptLineIds: [],
    words: segment.words?.map((word) => ({
      text: word.text,
      startTime: word.startTime,
      endTime: word.endTime,
      confidence: word.confidence,
      speakerId: word.speakerId,
    })),
  }));

  const transcriptSpeakers: TranscriptSpeaker[] = speakers.map((speaker) => ({
    id: speaker.id,
    label: speaker.name ?? speaker.label ?? speaker.id,
    confidence: speaker.confidence,
    color: speaker.color,
    identified: speaker.identified ?? settings.enableSpeakerIdentification,
  }));

  return {
    asset,
    cues,
    speakers: transcriptSpeakers,
    detectedLanguage,
    warnings: [...(response.warnings ?? [])],
    provider: settings.transcriptionProvider,
    modelId: response.modelId,
  };
}

async function readAssetBinary(asset: MediaAsset): Promise<{ bytes: ArrayBuffer; filename: string; mimeType?: string }> {
  if (asset.fileHandle) {
    return {
      bytes: await asset.fileHandle.arrayBuffer(),
      filename: asset.fileHandle.name || `${asset.name}.wav`,
      mimeType: asset.fileHandle.type || asset.mimeType,
    };
  }

  if (!asset.playbackUrl) {
    throw new Error(`Asset "${asset.name}" is missing a playable file reference.`);
  }

  const response = await fetch(asset.playbackUrl);
  if (!response.ok) {
    throw new Error(`Unable to fetch media for "${asset.name}" (${response.status}).`);
  }

  const blob = await response.blob();
  return {
    bytes: await blob.arrayBuffer(),
    filename: `${asset.name}${guessAssetExtension(asset)}`,
    mimeType: blob.type || asset.mimeType,
  };
}

function guessAssetExtension(asset: MediaAsset): string {
  if (asset.fileHandle?.name?.includes('.')) {
    return asset.fileHandle.name.slice(asset.fileHandle.name.lastIndexOf('.'));
  }

  const mimeType = asset.mimeType?.toLowerCase();
  if (!mimeType) {
    return asset.type === 'AUDIO' ? '.wav' : '.mp4';
  }

  if (mimeType.includes('wav')) return '.wav';
  if (mimeType.includes('aiff')) return '.aiff';
  if (mimeType.includes('mpeg')) return '.mp3';
  if (mimeType.includes('mp4')) return '.mp4';
  if (mimeType.includes('quicktime')) return '.mov';

  return asset.type === 'AUDIO' ? '.wav' : '.mp4';
}

function resolveAssetPath(asset: MediaAsset): string | null {
  if (!asset.playbackUrl) {
    return null;
  }

  if (asset.playbackUrl.startsWith('file://') || asset.playbackUrl.startsWith('/')) {
    return asset.playbackUrl;
  }

  return null;
}

async function requestLocalRuntimeTranscription(
  asset: MediaAsset,
  settings: TranscriptionExecutionSettings,
): Promise<RuntimeTranscriptionResponse> {
  const baseUrl = LOCAL_AI_RUNTIME_URL.replace(/\/$/, '');
  const language = resolveLanguageHint(settings);
  const audioPath = resolveAssetPath(asset);

  if (audioPath) {
    const response = await fetch(`${baseUrl}/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioPath,
        language,
        diarize: settings.enableTranscriptionDiarization,
        task: 'transcribe',
      }),
    });

    if (!response.ok) {
      throw new Error(`Local transcription failed with ${response.status}.`);
    }

    return response.json() as Promise<RuntimeTranscriptionResponse>;
  }

  const binary = await readAssetBinary(asset);
  const response = await fetch(`${baseUrl}/transcribe-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Audio-Filename': binary.filename,
      'X-Transcription-Language': language ?? '',
      'X-Transcription-Diarize': String(settings.enableTranscriptionDiarization),
      'X-Transcription-Task': 'transcribe',
    },
    body: binary.bytes,
  });

  if (!response.ok) {
    throw new Error(`Local transcription upload failed with ${response.status}.`);
  }

  return response.json() as Promise<RuntimeTranscriptionResponse>;
}

async function requestCloudTranscription(
  asset: MediaAsset,
  settings: TranscriptionExecutionSettings,
): Promise<RuntimeTranscriptionResponse> {
  if (!CLOUD_TRANSCRIPTION_URL) {
    throw new Error('Cloud transcription is selected, but VITE_CLOUD_TRANSCRIPTION_URL is not configured.');
  }

  const binary = await readAssetBinary(asset);
  const form = new FormData();
  form.append(
    'file',
    new File([binary.bytes], binary.filename, {
      type: binary.mimeType || 'application/octet-stream',
    }),
  );
  form.append('model', CLOUD_TRANSCRIPTION_MODEL);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');
  form.append('timestamp_granularities[]', 'word');

  const language = resolveLanguageHint(settings);
  if (language) {
    form.append('language', language);
  }

  const response = await fetch(CLOUD_TRANSCRIPTION_URL, {
    method: 'POST',
    headers: CLOUD_TRANSCRIPTION_API_KEY
      ? {
          Authorization: `Bearer ${CLOUD_TRANSCRIPTION_API_KEY}`,
        }
      : undefined,
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Cloud transcription failed with ${response.status}.`);
  }

  const result = await response.json() as RuntimeTranscriptionResponse;
  if (!result.segments && result.text) {
    return {
      ...result,
      segments: [
        {
          startTime: 0,
          endTime: asset.duration ?? 0,
          text: result.text,
          words: result.words,
        },
      ],
    };
  }

  return result;
}

async function translateCueText(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  settings: TranscriptionExecutionSettings,
): Promise<string> {
  if (settings.translationProvider === 'local-runtime') {
    const response = await fetch(`${LOCAL_AI_RUNTIME_URL.replace(/\/$/, '')}/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        sourceLanguage,
        targetLanguage,
      }),
    });

    if (!response.ok) {
      throw new Error(`Local translation failed with ${response.status}.`);
    }

    const result = await response.json() as RuntimeTranslationResponse;
    return result.translatedText ?? result.text ?? text;
  }

  if (!CLOUD_TRANSLATION_URL) {
    throw new Error('Cloud translation is selected, but VITE_CLOUD_TRANSLATION_URL is not configured.');
  }

  const response = await fetch(CLOUD_TRANSLATION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(CLOUD_TRANSLATION_API_KEY ? { Authorization: `Bearer ${CLOUD_TRANSLATION_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      text,
      sourceLanguage,
      targetLanguage,
    }),
  });

  if (!response.ok) {
    throw new Error(`Cloud translation failed with ${response.status}.`);
  }

  const result = await response.json() as RuntimeTranslationResponse;
  return result.translatedText ?? result.text ?? text;
}

async function applyCueTranslations(
  result: AssetTranscriptionResult,
  settings: TranscriptionExecutionSettings,
): Promise<AssetTranscriptionResult> {
  const targetLanguage = resolveTargetLanguage(settings);
  const sourceLanguage = normalizeLanguage(result.detectedLanguage);
  if (!targetLanguage || !sourceLanguage || targetLanguage === sourceLanguage) {
    return result;
  }

  const translatedCues = await Promise.all(
    result.cues.map(async (cue) => ({
      ...cue,
      translation: await translateCueText(cue.text, sourceLanguage, targetLanguage, settings),
    })),
  );

  return {
    ...result,
    cues: translatedCues,
  };
}

export async function transcribeMediaAsset(
  asset: MediaAsset,
  settings: TranscriptionExecutionSettings,
): Promise<AssetTranscriptionResult> {
  const response = settings.transcriptionProvider === 'local-faster-whisper'
    ? await requestLocalRuntimeTranscription(asset, settings)
    : await requestCloudTranscription(asset, settings);

  const baseResult = buildTranscriptResult(asset, response, settings);

  try {
    return await applyCueTranslations(baseResult, settings);
  } catch (error) {
    return {
      ...baseResult,
      warnings: [
        ...baseResult.warnings,
        `Translation skipped: ${(error as Error).message}`,
      ],
    };
  }
}
