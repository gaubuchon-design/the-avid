// ─── Localization Agent ──────────────────────────────────────────────────────
// Batch localization: translate captions to N languages, synthetic voice-over
// generation, subtitle timing adjustment for linguistic expansion, on-screen
// text replacement, round-trip consistency check.

import { generateId } from '../utils';
import type {
  LocalizationRequest,
  LocalizationResult,
  OnScreenTextReplacement,
} from './types';

// ─── In-memory store ─────────────────────────────────────────────────────────

const requestStore = new Map<string, LocalizationRequest>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ─── Language Metadata ───────────────────────────────────────────────────────

const LANGUAGE_EXPANSION_FACTORS: Record<string, number> = {
  'en': 1.0,
  'fr': 1.15,
  'de': 1.30,
  'es': 1.25,
  'it': 1.15,
  'pt': 1.20,
  'ja': 0.80,
  'ko': 0.85,
  'zh': 0.70,
  'ar': 1.10,
  'ru': 1.25,
  'hi': 1.20,
  'nl': 1.20,
  'sv': 1.10,
  'pl': 1.25,
  'tr': 1.15,
};

export function getExpansionFactor(languageCode: string): number {
  const base = languageCode.split('-')[0].toLowerCase();
  return LANGUAGE_EXPANSION_FACTORS[base] ?? 1.15;
}

const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  'en': 'English',
  'fr': 'French',
  'de': 'German',
  'es': 'Spanish',
  'it': 'Italian',
  'pt': 'Portuguese',
  'ja': 'Japanese',
  'ko': 'Korean',
  'zh': 'Chinese',
  'ar': 'Arabic',
  'ru': 'Russian',
  'hi': 'Hindi',
  'nl': 'Dutch',
  'sv': 'Swedish',
  'pl': 'Polish',
  'tr': 'Turkish',
};

export function getLanguageName(code: string): string {
  const base = code.split('-')[0].toLowerCase();
  return LANGUAGE_DISPLAY_NAMES[base] ?? code;
}

export function getSupportedLanguages(): { code: string; name: string }[] {
  return Object.entries(LANGUAGE_DISPLAY_NAMES).map(([code, name]) => ({ code, name }));
}

// ─── Subtitle Timing Adjustment ──────────────────────────────────────────────

export interface SubtitleCue {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
}

/**
 * Adjust subtitle timings to account for linguistic expansion.
 * Longer translations need more display time.
 */
export function adjustSubtitleTimings(
  cues: SubtitleCue[],
  targetLanguage: string,
): SubtitleCue[] {
  const factor = getExpansionFactor(targetLanguage);
  const maxReadingSpeedCPS = 18; // characters per second

  return cues.map((cue) => {
    const originalDuration = cue.endTime - cue.startTime;
    const expandedTextLength = Math.ceil(cue.text.length * factor);
    const minDuration = expandedTextLength / maxReadingSpeedCPS;
    const adjustedDuration = Math.max(originalDuration, minDuration);

    return {
      ...cue,
      endTime: cue.startTime + adjustedDuration,
    };
  });
}

// ─── Translation (simulated) ─────────────────────────────────────────────────

/**
 * Simulate caption translation. In production this would call a translation API
 * (DeepL, Google Translate, etc.).
 */
async function translateCaptions(
  captions: SubtitleCue[],
  sourceLanguage: string,
  targetLanguage: string,
): Promise<SubtitleCue[]> {
  // Simulate API latency
  await new Promise<void>((resolve) => setTimeout(resolve, 200 + Math.random() * 300));

  const factor = getExpansionFactor(targetLanguage);
  const langName = getLanguageName(targetLanguage);

  return captions.map((cue) => ({
    ...cue,
    id: generateId(),
    text: `[${langName}] ${cue.text}`, // Simulated translation
  }));
}

// ─── Synthetic Voice-Over (simulated) ────────────────────────────────────────

interface VoiceOverResult {
  trackId: string;
  language: string;
  duration: number;
}

async function generateVoiceOver(
  captions: SubtitleCue[],
  targetLanguage: string,
): Promise<VoiceOverResult> {
  // Simulate TTS generation
  await new Promise<void>((resolve) => setTimeout(resolve, 500 + Math.random() * 500));

  const totalDuration = captions.reduce(
    (sum, cue) => Math.max(sum, cue.endTime),
    0,
  );

  return {
    trackId: generateId(),
    language: targetLanguage,
    duration: totalDuration,
  };
}

// ─── On-Screen Text Replacement (simulated) ──────────────────────────────────

async function detectAndReplaceOnScreenText(
  targetLanguage: string,
  durationSeconds: number,
): Promise<OnScreenTextReplacement[]> {
  // Simulate OCR + translation
  await new Promise<void>((resolve) => setTimeout(resolve, 300));

  const langName = getLanguageName(targetLanguage);

  // Simulate detecting 1-3 on-screen text instances
  const count = 1 + Math.floor(Math.random() * 3);
  const replacements: OnScreenTextReplacement[] = [];

  for (let i = 0; i < count; i++) {
    const frameStart = Math.random() * (durationSeconds * 0.8);
    replacements.push({
      frameStart,
      frameEnd: frameStart + 2 + Math.random() * 3,
      originalText: `On-screen text ${i + 1}`,
      translatedText: `[${langName}] On-screen text ${i + 1}`,
      position: {
        x: 100 + Math.random() * 200,
        y: 400 + Math.random() * 200,
        width: 400,
        height: 60,
      },
    });
  }

  return replacements;
}

// ─── Consistency Check ───────────────────────────────────────────────────────

/**
 * Perform a round-trip consistency check: translate source -> target -> source
 * and compare to original. Returns a 0-1 score.
 */
export async function roundTripConsistencyCheck(
  original: string,
  translated: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<number> {
  // Simulate round-trip translation
  await new Promise<void>((resolve) => setTimeout(resolve, 100));

  // Simulate a consistency score (higher for shorter, simpler text)
  const lengthPenalty = Math.max(0, 1 - original.length / 500);
  const baseScore = 0.75 + Math.random() * 0.2;
  return Math.min(1, baseScore + lengthPenalty * 0.05);
}

// ─── Main Localization Pipeline ──────────────────────────────────────────────

export interface LocalizationOptions {
  sourceLanguage: string;
  targetLanguages: string[];
  captions: SubtitleCue[];
  durationSeconds: number;
  includeVoiceover?: boolean;
  includeSubtitles?: boolean;
  includeOnScreenText?: boolean;
}

/**
 * Run the full localization pipeline for all target languages.
 */
export async function localize(
  options: LocalizationOptions,
): Promise<LocalizationRequest> {
  const {
    sourceLanguage,
    targetLanguages,
    captions,
    durationSeconds,
    includeVoiceover = false,
    includeSubtitles = true,
    includeOnScreenText = false,
  } = options;

  const request: LocalizationRequest = {
    id: generateId(),
    sourceLanguage,
    targetLanguages: [...targetLanguages],
    includeVoiceover,
    includeSubtitles,
    includeOnScreenText,
    status: 'processing',
    progress: 0,
    results: [],
  };
  requestStore.set(request.id, clone(request));

  try {
    const totalSteps = targetLanguages.length;
    let completed = 0;

    for (const lang of targetLanguages) {
      const result: LocalizationResult = {
        language: lang,
        onScreenTextReplacements: [],
        consistencyScore: 0,
        warnings: [],
      };

      // Subtitle translation
      if (includeSubtitles && captions.length > 0) {
        const translated = await translateCaptions(captions, sourceLanguage, lang);
        const adjusted = adjustSubtitleTimings(translated, lang);
        result.subtitleTrackId = generateId();

        // Consistency check on a sample
        if (translated.length > 0) {
          result.consistencyScore = await roundTripConsistencyCheck(
            captions[0].text,
            translated[0].text,
            sourceLanguage,
            lang,
          );
        }

        // Warn if expansion is significant
        const factor = getExpansionFactor(lang);
        if (factor > 1.2) {
          result.warnings.push(
            `${getLanguageName(lang)} text is ~${Math.round((factor - 1) * 100)}% longer than source. Review subtitle timing.`,
          );
        }
      }

      // Voice-over generation
      if (includeVoiceover) {
        const vo = await generateVoiceOver(captions, lang);
        result.voiceoverTrackId = vo.trackId;
      }

      // On-screen text replacement
      if (includeOnScreenText) {
        result.onScreenTextReplacements = await detectAndReplaceOnScreenText(
          lang,
          durationSeconds,
        );
      }

      request.results.push(result);
      completed++;
      request.progress = Math.round((completed / totalSteps) * 100);
      requestStore.set(request.id, clone(request));
    }

    request.status = 'completed';
    request.progress = 100;
    requestStore.set(request.id, clone(request));
  } catch (err) {
    request.status = 'failed';
    requestStore.set(request.id, clone(request));
  }

  return clone(request);
}

// ─── Request access ──────────────────────────────────────────────────────────

export function getLocalizationRequest(id: string): LocalizationRequest | null {
  const req = requestStore.get(id);
  return req ? clone(req) : null;
}

export function listLocalizationRequests(): LocalizationRequest[] {
  return Array.from(requestStore.values()).map(clone);
}

// ─── Reset (for tests) ──────────────────────────────────────────────────────

export function _resetLocalizationStore(): void {
  requestStore.clear();
}
