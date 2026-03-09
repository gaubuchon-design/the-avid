/**
 * @module workflows/contextual-archive-edit
 * @description Archive vertical — contextual brand reel from multi-year library.
 *
 * This workflow models a corporate communications editor's brief: mining three
 * years of archived footage for every approved CEO bite and product close-up,
 * then assembling a polished 2-minute brand reel. The pipeline leverages
 * semantic search across bins, auto-organisation, rough-cut assembly, colour
 * matching, and audio normalisation.
 *
 * Failure strategy:
 * - Both `find_similar_clips` calls are critical discovery steps; failure aborts.
 * - `auto_organize_bins` is helpful but non-essential; failure skips.
 * - `generate_rough_cut` is the core assembly; failure aborts.
 * - `auto_color_match` and `normalize_audio` are finishing steps; failures skip.
 */

import type { WorkflowDefinition } from './types';

/**
 * Contextual Archive Edit workflow.
 *
 * Prompt: "Find every approved CEO bite and product close-up from the last three
 *          campaigns and build a 2-minute brand reel"
 *
 * Pipeline:
 * 1. Search the archive for approved CEO bites across all campaigns.
 * 2. Search the archive for product close-up shots across all campaigns.
 * 3. Auto-organise discovered clips into a structured bin hierarchy.
 * 4. Generate a 2-minute rough-cut brand reel from the organised footage.
 * 5. Colour-match all clips to the most recent CEO keynote as reference.
 * 6. Normalise the mixed audio to broadcast loudness.
 */
export const CONTEXTUAL_ARCHIVE_EDIT: WorkflowDefinition = {
  id: 'contextual-archive-edit',
  name: 'Contextual Archive — 2min Brand Reel',
  description:
    'Mine three years of corporate archives for approved CEO bites and product close-ups, ' +
    'then assemble a colour-matched, audio-normalised 2-minute brand reel.',
  vertical: 'archive',
  demoPrompt:
    'Find every approved CEO bite and product close-up from the last three campaigns ' +
    'and build a 2-minute brand reel',
  seedDataId: 'archive-corporate',
  estimatedDurationMs: 20_000,
  estimatedTokenCost: 150,
  steps: [
    {
      toolName: 'find_similar_clips',
      description: 'Search the archive for approved CEO bites across all campaigns',
      expectedResult:
        'Returns 3-5 CEO clips from the Executives bin: the 2024 annual keynote opener, ' +
        'a customer testimonial co-appearance, and key soundbites tagged as approved.',
      failureHandler: 'abort',
    },
    {
      toolName: 'find_similar_clips',
      description: 'Search the archive for product close-up shots across all campaigns',
      expectedResult:
        'Returns 4-6 product clips from the Products bin: the v3 launch demo, quarterly ' +
        'results chart animation, and select b-roll from the factory tour.',
      failureHandler: 'abort',
    },
    {
      toolName: 'auto_organize_bins',
      description: 'Organise discovered clips into a structured bin hierarchy by scene',
      expectedResult:
        'Creates a "Brand Reel Selects" parent bin with sub-bins: "CEO Bites", ' +
        '"Product Shots", "B-Roll", each containing the relevant matched clips.',
      failureHandler: 'skip',
    },
    {
      toolName: 'generate_rough_cut',
      description: 'Generate a 2-minute rough-cut brand reel from the organised footage',
      expectedResult:
        'A 120-second timeline assembly following a corporate narrative arc: ' +
        'aerial establishing (0-10s), CEO vision (10-50s), product showcase (50-90s), ' +
        'team/testimonial (90-110s), logo resolve (110-120s).',
      failureHandler: 'abort',
    },
    {
      toolName: 'auto_color_match',
      description: 'Colour-match all clips to the 2024 CEO keynote as the reference grade',
      expectedResult:
        'All clips matched to the warm, high-contrast look of the keynote footage, ' +
        'ensuring visual consistency across three years of source material.',
      failureHandler: 'skip',
    },
    {
      toolName: 'normalize_audio',
      description: 'Normalise the mixed audio to broadcast loudness (-23 LUFS)',
      expectedResult:
        'Integrated loudness normalised to -23 LUFS with dialogue-priority ducking, ' +
        'ensuring consistent levels across interview bites and ambient b-roll.',
      failureHandler: 'skip',
    },
  ],
};
