/**
 * @module workflows/sports-live-pull
 * @description Sports vertical — live highlight reel pull.
 *
 * This workflow models a broadcast editor's post-game task: identifying the
 * five best moments from multi-camera ISO recordings and assembling a
 * 90-second highlight recap. The pipeline emphasises scene detection and
 * smart clip matching across four camera angles, then finishes with audio
 * normalisation and a social-ready reframe.
 *
 * Failure strategy:
 * - `detect_scene_changes` is the foundation; failure aborts the entire workflow.
 * - `find_similar_clips` for key moments is critical; failure aborts.
 * - `splice_in` and `add_marker` are important but recoverable; failures retry once.
 * - `normalize_audio` and `auto_reframe` are finishing steps; failures skip gracefully.
 */

import type { WorkflowDefinition } from './types';

/**
 * Sports Live Highlight Pull workflow.
 *
 * Prompt: "Pull the best 5 highlight moments from today's game and cut a 90-second recap"
 *
 * Pipeline:
 * 1. Detect scene changes across all camera ISOs to identify action peaks.
 * 2. Find the top 5 key-moment clips by cross-referencing visual intensity.
 * 3. Splice highlights into the recap timeline in chronological order.
 * 4. Mark each highlight with a labelled marker for review.
 * 5. Normalise the mixed audio (commentary + ambient) to broadcast standard.
 * 6. Auto-reframe the final recap for a 9:16 social cut.
 */
export const SPORTS_LIVE_PULL: WorkflowDefinition = {
  id: 'sports-live-pull',
  name: 'Sports Live — 90s Highlight Recap',
  description:
    'Identify the five best moments from multi-camera game coverage and assemble ' +
    'a 90-second broadcast-ready highlight reel with social reframe.',
  vertical: 'sports',
  demoPrompt:
    'Pull the best 5 highlight moments from today\'s game and cut a 90-second recap',
  seedDataId: 'sports-live',
  estimatedDurationMs: 12_000,
  estimatedTokenCost: 80,
  steps: [
    {
      toolName: 'detect_scene_changes',
      description: 'Analyse all camera ISOs for scene changes and action peaks',
      expectedResult:
        'A timestamped list of 40-60 scene-change events across four camera angles, ' +
        'with confidence scores indicating action intensity.',
      failureHandler: 'abort',
    },
    {
      toolName: 'find_similar_clips',
      description: 'Cross-reference scene changes to find the top 5 key moments',
      expectedResult:
        'Five highlight segments ranked by visual intensity: the buzzer-beater dunk, ' +
        'a fast-break layup, a blocked shot, a three-pointer, and the crowd celebration.',
      failureHandler: 'abort',
    },
    {
      toolName: 'splice_in',
      description: 'Splice the 5 highlight clips into the recap timeline in game order',
      expectedResult:
        'A 90-second timeline assembly with highlights placed chronologically, each ' +
        'padded with 2-second handles for transition flexibility.',
      failureHandler: 'retry',
    },
    {
      toolName: 'add_marker',
      description: 'Add labelled markers at each highlight point for editorial review',
      expectedResult:
        'Five colour-coded markers (amber) placed at the start of each highlight ' +
        'with descriptive labels: "Dunk Q3 4:22", "Fast Break Q2 8:15", etc.',
      failureHandler: 'retry',
    },
    {
      toolName: 'normalize_audio',
      description: 'Normalise the mixed commentary and ambient audio to broadcast levels',
      expectedResult:
        'Audio normalised to -23 LUFS with commentary duck on ambient track, ' +
        'ensuring clear play-by-play over crowd noise.',
      failureHandler: 'skip',
    },
    {
      toolName: 'auto_reframe',
      description: 'Reframe the recap to 9:16 vertical for social media distribution',
      expectedResult:
        'All clips reframed to 9:16 with subject tracking focused on the ball handler ' +
        'and scorer, maintaining action in the vertical safe zone.',
      failureHandler: 'skip',
    },
  ],
};
