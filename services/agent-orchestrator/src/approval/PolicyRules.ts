/**
 * @module PolicyRules
 * @description Configurable approval policy rules that determine whether a
 * given step should be auto-approved, require manual approval, or be blocked.
 *
 * Rules are evaluated in order; the first matching rule wins.
 */

import type { AgentStep } from '../types';

// ---------------------------------------------------------------------------
// PolicyRule interface
// ---------------------------------------------------------------------------

/**
 * A single approval policy rule.
 *
 * Rules are evaluated against a step to produce an action:
 * - `approve`           — the step may execute without user confirmation.
 * - `require-approval`  — the step must be explicitly approved.
 * - `block`             — the step is rejected outright.
 */
export interface PolicyRule {
  /** Unique rule identifier. */
  readonly name: string;
  /** Human-readable description of what this rule checks. */
  readonly description: string;
  /** Predicate that determines whether this rule applies to a given step. */
  readonly condition: (step: AgentStep) => boolean;
  /** Action to take when the rule matches. */
  readonly action: 'approve' | 'require-approval' | 'block';
  /** Human-readable reason logged when the rule fires. */
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Tool classification helpers
// ---------------------------------------------------------------------------

/** Tools that modify or remove timeline content irreversibly. */
const DESTRUCTIVE_TOOLS: ReadonlySet<string> = new Set([
  'extract',
  'lift',
  'split_clip',
  'overwrite',
  'ripple_trim',
]);

/** Tools that publish or export content externally. */
const PUBLISH_TOOLS: ReadonlySet<string> = new Set([
  'export_sequence',
  'publish_social',
  'render_final',
]);

/** Tools that perform read-only search or analysis. */
const SEARCH_TOOLS: ReadonlySet<string> = new Set([
  'find_similar_clips',
  'suggest_cuts',
  'detect_scene_changes',
]);

/** Tools that perform non-destructive audio analysis. */
const AUDIO_ANALYSIS_TOOLS: ReadonlySet<string> = new Set([
  'analyze_audio',
]);

/** Tools that add metadata or markers without modifying media. */
const METADATA_TOOLS: ReadonlySet<string> = new Set([
  'add_marker',
  'set_clip_metadata',
  'create_bin',
]);

// ---------------------------------------------------------------------------
// Default rules
// ---------------------------------------------------------------------------

/**
 * Default policy rules applied in order.
 * The first matching rule determines the action for a step.
 */
export const DEFAULT_RULES: PolicyRule[] = [
  // --- Block rules --------------------------------------------------------

  // (none currently — reserved for future dangerous operations)

  // --- Require-approval rules ---------------------------------------------

  {
    name: 'destructive-operations',
    description: 'Require approval for tools that modify or remove timeline content.',
    condition: (step) => DESTRUCTIVE_TOOLS.has(step.toolName),
    action: 'require-approval',
    reason: 'Tool performs a destructive timeline modification.',
  },

  {
    name: 'external-publish',
    description: 'Require approval for any publish or export operation.',
    condition: (step) => PUBLISH_TOOLS.has(step.toolName),
    action: 'require-approval',
    reason: 'Tool publishes or exports content externally.',
  },

  {
    name: 'cost-threshold',
    description: 'Require approval if estimated token cost exceeds 50.',
    condition: (step) => {
      // Use a heuristic based on argument complexity
      const argString = JSON.stringify(step.toolArgs);
      const estimatedCost = Math.ceil(argString.length / 4);
      return estimatedCost > 50;
    },
    action: 'require-approval',
    reason: 'Estimated token cost exceeds the auto-approve threshold.',
  },

  {
    name: 'batch-operations',
    description: 'Require approval for operations targeting multiple clips.',
    condition: (step) => {
      const args = step.toolArgs;
      const clipIds = args.targetClipIds ?? args.clipIds;
      return Array.isArray(clipIds) && clipIds.length > 3;
    },
    action: 'require-approval',
    reason: 'Operation targets more than 3 clips at once.',
  },

  // --- Auto-approve rules -------------------------------------------------

  {
    name: 'search-operations',
    description: 'Auto-approve read-only search and analysis tools.',
    condition: (step) => SEARCH_TOOLS.has(step.toolName),
    action: 'approve',
    reason: 'Tool is read-only and does not modify the timeline.',
  },

  {
    name: 'audio-analysis',
    description: 'Auto-approve non-destructive audio analysis.',
    condition: (step) => AUDIO_ANALYSIS_TOOLS.has(step.toolName),
    action: 'approve',
    reason: 'Audio analysis is non-destructive.',
  },

  {
    name: 'metadata-operations',
    description: 'Auto-approve marker and metadata operations.',
    condition: (step) => METADATA_TOOLS.has(step.toolName),
    action: 'approve',
    reason: 'Markers and metadata do not modify media content.',
  },
];
