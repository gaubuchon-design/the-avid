/**
 * @module workflows/creator-social-fast-path
 * @description Creator vertical — 60-second social reel fast path.
 *
 * This workflow models a content creator's most common task: turning raw
 * smartphone footage into a polished vertical reel with trending music,
 * captions, and broadcast-ready audio. The six-step pipeline prioritises
 * speed, targeting under 8 seconds for the full demo cycle.
 *
 * Failure strategy:
 * - `find_similar_clips` and `generate_rough_cut` are critical; failure aborts.
 * - `remove_silence` and `generate_captions` are valuable but non-blocking; failures skip.
 * - `normalize_audio` retries once (common transient failure on overloaded audio bus).
 * - The final social publish step is advisory and skippable.
 */

import type { WorkflowDefinition } from './types';

/**
 * Creator Social Reel — fast-path workflow.
 *
 * Prompt: "Create a 60-second social reel from today's shoot with trending music and captions"
 *
 * Pipeline:
 * 1. Search selects bin for the best clips matching a reel aesthetic.
 * 2. Assemble a 60-second rough cut from the matched footage.
 * 3. Strip silence from the dialogue track to tighten pacing.
 * 4. Generate word-level captions for accessibility and engagement.
 * 5. Normalise audio to social-optimised loudness (-16 LUFS).
 * 6. Reframe to 9:16 vertical for Instagram Reels / TikTok / YouTube Shorts.
 */
export const CREATOR_SOCIAL_FAST_PATH: WorkflowDefinition = {
  id: 'creator-social-fast-path',
  name: 'Creator Social Reel — 60s Fast Path',
  description:
    'Turn raw smartphone footage into a 60-second vertical reel with trending music, ' +
    'auto-generated captions, and broadcast-ready audio.',
  vertical: 'creator',
  demoPrompt:
    'Create a 60-second social reel from today\'s shoot with trending music and captions',
  seedDataId: 'creator-social',
  estimatedDurationMs: 8_000,
  estimatedTokenCost: 50,
  steps: [
    {
      toolName: 'find_similar_clips',
      description: 'Search the Selects bin for clips matching a social-reel aesthetic',
      expectedResult:
        'Returns 4-6 clips ranked by visual energy and relevance — product close-ups, ' +
        'b-roll montage, and the best selfie intro take.',
      failureHandler: 'abort',
    },
    {
      toolName: 'generate_rough_cut',
      description: 'Assemble a 60-second rough cut from the matched footage',
      expectedResult:
        'A timeline assembly with clips arranged by narrative arc: hook (0-5s), ' +
        'intro (5-15s), body (15-50s), CTA (50-60s).',
      failureHandler: 'abort',
    },
    {
      toolName: 'remove_silence',
      description: 'Strip dead air and pauses from the dialogue track',
      expectedResult:
        'Silence segments below -40 dB and longer than 600ms are removed, ' +
        'tightening pacing by approximately 10-15%.',
      failureHandler: 'skip',
    },
    {
      toolName: 'generate_captions',
      description: 'Generate word-level captions for accessibility and engagement',
      expectedResult:
        'English captions with word-level timestamps synced to the dialogue track, ' +
        'formatted in a trending animated style.',
      failureHandler: 'skip',
    },
    {
      toolName: 'normalize_audio',
      description: 'Normalise audio to social-optimised loudness (-16 LUFS)',
      expectedResult:
        'Audio normalised to -16 LUFS with peak limiting, optimised for mobile speaker playback.',
      failureHandler: 'retry',
    },
    {
      toolName: 'auto_reframe',
      description: 'Reframe the sequence to 9:16 vertical for social platforms',
      expectedResult:
        'All clips reframed to 9:16 with smart subject tracking, keeping talent ' +
        'and product centered throughout.',
      failureHandler: 'skip',
    },
  ],
};
