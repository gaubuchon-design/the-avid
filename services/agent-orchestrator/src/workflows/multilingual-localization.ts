/**
 * @module workflows/multilingual-localization
 * @description Localization vertical — multi-language caption generation.
 *
 * This workflow models a localisation coordinator's task: taking an English
 * interview and producing caption variants for Spanish, French, and Japanese
 * markets. The pipeline starts with English baseline captions, then generates
 * each language variant in parallel-capable steps.
 *
 * Failure strategy:
 * - English caption generation is the baseline; failure aborts.
 * - Each language variant is independent; a single failure skips that language
 *   but does not block the others.
 * - The final publish step is advisory and always skippable.
 */

import type { WorkflowDefinition } from './types';

/**
 * Multilingual Localization workflow.
 *
 * Prompt: "Create Spanish, French, and Japanese caption versions of this interview"
 *
 * Pipeline:
 * 1. Generate word-level English captions as the source baseline.
 * 2. Generate Spanish (es) caption variant from the audio track.
 * 3. Generate French (fr) caption variant from the audio track.
 * 4. Generate Japanese (ja) caption variant from the audio track.
 * 5. Splice all caption tracks into the timeline for review.
 */
export const MULTILINGUAL_LOCALIZATION: WorkflowDefinition = {
  id: 'multilingual-localization',
  name: 'Multilingual Localization — ES/FR/JA Captions',
  description:
    'Generate Spanish, French, and Japanese caption versions of a CEO interview, ' +
    'starting from an English baseline with word-level timestamps.',
  vertical: 'localization',
  demoPrompt:
    'Create Spanish, French, and Japanese caption versions of this interview',
  seedDataId: 'multilingual-interview',
  estimatedDurationMs: 15_000,
  estimatedTokenCost: 300,
  steps: [
    {
      toolName: 'generate_captions',
      description: 'Generate word-level English captions as the source baseline',
      expectedResult:
        'English captions with per-word timestamps covering the full 8-minute interview, ' +
        'formatted in broadcast style with speaker identification.',
      failureHandler: 'abort',
    },
    {
      toolName: 'generate_captions',
      description: 'Generate Spanish (es) caption variant',
      expectedResult:
        'Spanish captions aligned to the same timecodes as the English baseline, ' +
        'with natural phrasing adapted for Latin American Spanish conventions.',
      failureHandler: 'skip',
    },
    {
      toolName: 'generate_captions',
      description: 'Generate French (fr) caption variant',
      expectedResult:
        'French captions aligned to the same timecodes as the English baseline, ' +
        'with Metropolitan French spelling and grammar conventions.',
      failureHandler: 'skip',
    },
    {
      toolName: 'generate_captions',
      description: 'Generate Japanese (ja) caption variant',
      expectedResult:
        'Japanese captions with appropriate kanji/hiragana mix, aligned to the English ' +
        'baseline timecodes, with honourifics matching the corporate interview register.',
      failureHandler: 'skip',
    },
    {
      toolName: 'splice_in',
      description: 'Place all caption variants onto separate subtitle tracks for review',
      expectedResult:
        'Four subtitle tracks (EN on S1, ES on S2, FR on S3, JA on S4) all starting ' +
        'at frame 0, enabling side-by-side QC review of all language variants.',
      failureHandler: 'skip',
    },
  ],
};
