/**
 * @module workflows/audio-cleanup-temp-music
 * @description Audio vertical — interview cleanup with temp music suggestions.
 *
 * This workflow models an audio engineer's common task: cleaning up a location
 * interview recording that has HVAC background noise, removing dead air,
 * normalising to broadcast loudness, and then finding suitable temp music
 * options from the project library.
 *
 * Failure strategy:
 * - `analyze_audio` is the diagnostic foundation; failure aborts.
 * - `remove_silence` is destructive but important; retries once.
 * - `normalize_audio` is critical for deliverable quality; failure aborts.
 * - `suggest_cuts` for temp music is a creative suggestion; failure skips.
 * - The final music application step is advisory and always skippable.
 */

import type { WorkflowDefinition } from './types';

/**
 * Audio Cleanup with Temp Music workflow.
 *
 * Prompt: "Clean up the interview audio, remove background noise, normalize loudness,
 *          and suggest three temp music options"
 *
 * Pipeline:
 * 1. Analyse the raw interview audio for loudness, peaks, and silence regions.
 * 2. Remove silence segments to tighten pacing.
 * 3. Normalise dialogue levels to broadcast standard (-23 LUFS).
 * 4. Suggest temp music cuts from the Music & SFX bin.
 * 5. Apply the top-ranked temp music to the underscore track.
 */
export const AUDIO_CLEANUP_TEMP_MUSIC: WorkflowDefinition = {
  id: 'audio-cleanup-temp-music',
  name: 'Audio Cleanup — Interview + Temp Music',
  description:
    'Clean up a noisy location interview, remove dead air, normalise to broadcast ' +
    'loudness, and suggest three temp music options from the project library.',
  vertical: 'audio',
  demoPrompt:
    'Clean up the interview audio, remove background noise, normalize loudness, ' +
    'and suggest three temp music options',
  seedDataId: 'audio-cleanup',
  estimatedDurationMs: 10_000,
  estimatedTokenCost: 75,
  steps: [
    {
      toolName: 'analyze_audio',
      description: 'Analyse the raw interview for loudness, peaks, and silence regions',
      expectedResult:
        'A diagnostic report showing: integrated loudness at -18.5 LUFS, peak at -3.2 dB, ' +
        '12 silence segments totalling 45 seconds, and a noise floor at -48 dB (HVAC).',
      failureHandler: 'abort',
    },
    {
      toolName: 'remove_silence',
      description: 'Remove dead-air segments below -40 dB lasting more than 800ms',
      expectedResult:
        '12 silence regions removed, reducing the interview from 10:00 to 9:15. ' +
        'Markers placed at each edit point for manual review.',
      failureHandler: 'retry',
    },
    {
      toolName: 'normalize_audio',
      description: 'Normalise dialogue levels to broadcast standard (-23 LUFS)',
      expectedResult:
        'Integrated loudness adjusted from -18.5 LUFS to -23 LUFS with true-peak ' +
        'limiting at -1 dB TP, ensuring broadcast compliance.',
      failureHandler: 'abort',
    },
    {
      toolName: 'suggest_cuts',
      description: 'Suggest three temp music options from the Music & SFX bin',
      expectedResult:
        'Three ranked music suggestions: (1) ambient piano underscore at -28 LUFS, ' +
        '(2) light acoustic guitar loop, (3) minimal electronic pad — all royalty-free.',
      failureHandler: 'skip',
    },
    {
      toolName: 'splice_in',
      description: 'Place the top-ranked temp music on the underscore track',
      expectedResult:
        'Ambient piano music bed placed on track A2, ducked to -12 dB under dialogue, ' +
        'with 2-second fade-in at the head and 3-second fade-out at the tail.',
      failureHandler: 'skip',
    },
  ],
};
