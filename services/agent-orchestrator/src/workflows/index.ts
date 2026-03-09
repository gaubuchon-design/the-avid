/**
 * @module workflows
 * @description Barrel export and registry for end-to-end exemplar workflows.
 *
 * Provides a central {@link WORKFLOW_REGISTRY} mapping workflow IDs to their
 * definitions, plus convenience functions for lookup and enumeration. Each
 * workflow is a polished vertical slice exercising the full orchestrator
 * pipeline from intent through tool execution.
 *
 * ## Available Workflows
 *
 * | ID                           | Vertical      | Est. Duration | Est. Tokens |
 * |------------------------------|---------------|---------------|-------------|
 * | `creator-social-fast-path`   | Creator       | 8 s           | 50          |
 * | `sports-live-pull`           | Sports        | 12 s          | 80          |
 * | `multilingual-localization`  | Localization  | 15 s          | 300         |
 * | `audio-cleanup-temp-music`   | Audio         | 10 s          | 75          |
 * | `contextual-archive-edit`    | Archive       | 20 s          | 150         |
 * | `generative-motion-cleanup`  | Generative    | 25 s          | 350         |
 */

import type { WorkflowDefinition } from './types';

// ---------------------------------------------------------------------------
// Workflow definitions
// ---------------------------------------------------------------------------

import { CREATOR_SOCIAL_FAST_PATH } from './creator-social-fast-path';
import { SPORTS_LIVE_PULL } from './sports-live-pull';
import { MULTILINGUAL_LOCALIZATION } from './multilingual-localization';
import { AUDIO_CLEANUP_TEMP_MUSIC } from './audio-cleanup-temp-music';
import { CONTEXTUAL_ARCHIVE_EDIT } from './contextual-archive-edit';
import { GENERATIVE_MOTION_CLEANUP } from './generative-motion-cleanup';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Central registry of all exemplar workflow definitions, keyed by ID.
 *
 * Used by the {@link WorkflowRunner} to resolve workflows by identifier and
 * by API routes to enumerate available demos.
 */
export const WORKFLOW_REGISTRY: Readonly<Record<string, WorkflowDefinition>> = {
  'creator-social-fast-path': CREATOR_SOCIAL_FAST_PATH,
  'sports-live-pull': SPORTS_LIVE_PULL,
  'multilingual-localization': MULTILINGUAL_LOCALIZATION,
  'audio-cleanup-temp-music': AUDIO_CLEANUP_TEMP_MUSIC,
  'contextual-archive-edit': CONTEXTUAL_ARCHIVE_EDIT,
  'generative-motion-cleanup': GENERATIVE_MOTION_CLEANUP,
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Retrieve a workflow definition by its unique identifier.
 *
 * @param id - The workflow ID (e.g., `'creator-social-fast-path'`).
 * @returns The workflow definition, or `undefined` if not registered.
 */
export function getWorkflow(id: string): WorkflowDefinition | undefined {
  return WORKFLOW_REGISTRY[id];
}

/**
 * List all registered workflow definitions.
 *
 * @returns An array of all workflow definitions in registration order.
 */
export function listWorkflows(): WorkflowDefinition[] {
  return Object.values(WORKFLOW_REGISTRY);
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

// Types
export type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowResult,
  WorkflowOutput,
  SeedData,
  SeedAsset,
  SeedBin,
  SeedTranscriptSegment,
  LatencyReport,
  TokenReport,
} from './types';

// Runner
export { WorkflowRunner } from './WorkflowRunner';
export type { WorkflowRunnerOptions } from './WorkflowRunner';

// Seed data
export { SEED_DATASETS } from './data/seed-data';

// Individual workflow definitions
export { CREATOR_SOCIAL_FAST_PATH } from './creator-social-fast-path';
export { SPORTS_LIVE_PULL } from './sports-live-pull';
export { MULTILINGUAL_LOCALIZATION } from './multilingual-localization';
export { AUDIO_CLEANUP_TEMP_MUSIC } from './audio-cleanup-temp-music';
export { CONTEXTUAL_ARCHIVE_EDIT } from './contextual-archive-edit';
export { GENERATIVE_MOTION_CLEANUP } from './generative-motion-cleanup';
