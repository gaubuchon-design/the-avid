/**
 * @module ConsumptionCategories
 * @description Canonical definitions for every token-consuming category in the
 * MCUA monetisation system.
 *
 * Each category maps to a premium feature that incurs a per-use token cost.
 * Categories are referenced by the {@link JobQuoter}, {@link MeteringService},
 * and {@link EntitlementChecker} to ensure consistent pricing, labelling, and
 * tier gating across the entire billing pipeline.
 */

import type { WalletTier } from './TokenWallet';

// ---------------------------------------------------------------------------
// Token category union
// ---------------------------------------------------------------------------

/**
 * Exhaustive union of every billable token category.
 *
 * Each member corresponds to a premium capability that consumes tokens on
 * use rather than being included in the base seat licence.
 */
export type TokenCategory =
  | 'archive-reasoning'
  | 'premium-translation'
  | 'reference-dubbing'
  | 'temp-music-gen'
  | 'generative-motion'
  | 'generative-effects'
  | 'premium-publish'
  | 'cloud-stt'
  | 'cloud-analysis';

// ---------------------------------------------------------------------------
// Category definition interface
// ---------------------------------------------------------------------------

/**
 * Metadata and pricing information for a single token category.
 */
export interface CategoryDefinition {
  /** Unique identifier matching the {@link TokenCategory} union. */
  readonly id: TokenCategory;
  /** Human-readable display name. */
  readonly name: string;
  /** Longer description of what this category covers. */
  readonly description: string;
  /** Unit label for billing display (e.g. "per language", "per minute"). */
  readonly unitLabel: string;
  /** Base token cost per unit. */
  readonly baseRate: number;
  /** Minimum subscription tier required to access this category. */
  readonly minTier: WalletTier;
}

// ---------------------------------------------------------------------------
// Category registry
// ---------------------------------------------------------------------------

/**
 * Canonical registry of all token consumption categories.
 *
 * This is the single source of truth for category metadata, pricing, and
 * tier requirements.  All other modules import from here rather than
 * defining their own copies.
 *
 * @example
 * ```ts
 * const def = CATEGORY_DEFINITIONS['premium-translation'];
 * console.log(def.baseRate); // 100
 * console.log(def.unitLabel); // "per language"
 * ```
 */
export const CATEGORY_DEFINITIONS: Readonly<Record<TokenCategory, CategoryDefinition>> = {
  'archive-reasoning': {
    id: 'archive-reasoning',
    name: 'Archive Reasoning',
    description:
      'AI-powered reasoning over archived project data, including semantic search, ' +
      'cross-project analysis, and intelligent retrieval of historical edits.',
    unitLabel: 'per query',
    baseRate: 50,
    minTier: 'pro',
  },

  'premium-translation': {
    id: 'premium-translation',
    name: 'Premium Translation',
    description:
      'Cloud-based neural translation of captions, subtitles, and metadata ' +
      'into target languages with broadcast-grade accuracy.',
    unitLabel: 'per language',
    baseRate: 100,
    minTier: 'pro',
  },

  'reference-dubbing': {
    id: 'reference-dubbing',
    name: 'Reference Dubbing',
    description:
      'AI voice cloning and reference-quality dubbing for review purposes. ' +
      'Not intended for final broadcast but sufficient for editorial review.',
    unitLabel: 'per language',
    baseRate: 200,
    minTier: 'enterprise',
  },

  'temp-music-gen': {
    id: 'temp-music-gen',
    name: 'Temporary Music Generation',
    description:
      'Generate royalty-free temporary music beds for rough-cut review. ' +
      'Music is watermarked and intended for internal use only.',
    unitLabel: 'per generation',
    baseRate: 150,
    minTier: 'pro',
  },

  'generative-motion': {
    id: 'generative-motion',
    name: 'Generative Motion Graphics',
    description:
      'AI-generated motion graphics, lower thirds, and title animations ' +
      'based on brand guidelines and editorial context.',
    unitLabel: 'per clip',
    baseRate: 300,
    minTier: 'enterprise',
  },

  'generative-effects': {
    id: 'generative-effects',
    name: 'Generative Visual Effects',
    description:
      'AI-powered visual effects including background replacement, object ' +
      'removal, and generative fill for video content.',
    unitLabel: 'per clip',
    baseRate: 250,
    minTier: 'enterprise',
  },

  'premium-publish': {
    id: 'premium-publish',
    name: 'Premium Publishing',
    description:
      'Direct publishing to premium distribution platforms with format ' +
      'conversion, metadata packaging, and delivery confirmation.',
    unitLabel: 'per platform',
    baseRate: 75,
    minTier: 'pro',
  },

  'cloud-stt': {
    id: 'cloud-stt',
    name: 'Cloud Speech-to-Text',
    description:
      'High-accuracy cloud-based speech-to-text transcription with speaker ' +
      'diarisation and punctuation. Falls back to local STT on free tier.',
    unitLabel: 'per minute',
    baseRate: 25,
    minTier: 'pro',
  },

  'cloud-analysis': {
    id: 'cloud-analysis',
    name: 'Cloud Media Analysis',
    description:
      'Cloud-based media analysis including content moderation, visual ' +
      'classification, and advanced scene understanding.',
    unitLabel: 'per analysis',
    baseRate: 40,
    minTier: 'pro',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * All valid token category identifiers.
 *
 * @returns An array of every {@link TokenCategory} value.
 */
export function getAllCategories(): TokenCategory[] {
  return Object.keys(CATEGORY_DEFINITIONS) as TokenCategory[];
}

/**
 * Look up a category definition by its identifier.
 *
 * @param category - The category to look up.
 * @returns The matching {@link CategoryDefinition}, or `undefined` if the
 *          category is not registered.
 */
export function getCategoryDefinition(category: TokenCategory): CategoryDefinition | undefined {
  return CATEGORY_DEFINITIONS[category];
}

/**
 * Check whether a given wallet tier satisfies the minimum tier requirement
 * for a category.
 *
 * @param category - The category to check.
 * @param tier     - The wallet tier to evaluate.
 * @returns `true` if the tier is sufficient to access the category.
 */
export function isTierSufficient(category: TokenCategory, tier: WalletTier): boolean {
  const def = CATEGORY_DEFINITIONS[category];
  if (!def) return false;

  const tierRank: Record<WalletTier, number> = { free: 0, pro: 1, enterprise: 2 };
  return tierRank[tier] >= tierRank[def.minTier];
}

/**
 * Get default pricing as a flat map of category to base rate.
 *
 * @returns A record mapping each {@link TokenCategory} to its base token rate.
 */
export function getDefaultPricingMap(): Record<TokenCategory, number> {
  const pricing = {} as Record<TokenCategory, number>;
  for (const [key, def] of Object.entries(CATEGORY_DEFINITIONS)) {
    pricing[key as TokenCategory] = def.baseRate;
  }
  return pricing;
}
