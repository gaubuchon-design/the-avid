/**
 * @module EntitlementChecker
 * @description Tier-based feature gating with seat vs. token entitlement model.
 *
 * The MCUA platform uses two entitlement models:
 *
 * - **Seat features** are included in the subscription tier at no additional
 *   token cost. They are available as long as the user has a valid seat at
 *   the required tier or above.
 *
 * - **Token features** require a per-use token payment in addition to the
 *   tier requirement. The user must both (a) be on a sufficient tier and
 *   (b) have enough tokens in their wallet to use the feature.
 *
 * The {@link EntitlementChecker} is a stateless, read-only evaluator. It does
 * not modify the wallet or enforce spending -- that is the responsibility of
 * the {@link MeteringService}.
 */

import type { WalletTier } from './TokenWallet';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Discriminator for the two entitlement models. */
export type FeatureType = 'seat' | 'token';

/**
 * A single feature registration in the entitlement registry.
 */
export interface Feature {
  /** Unique feature identifier (kebab-case). */
  readonly id: string;
  /** Human-readable feature name. */
  readonly name: string;
  /** Whether this feature is seat-included or token-gated. */
  readonly type: FeatureType;
  /** Minimum subscription tier required to access this feature. */
  readonly tier: WalletTier;
  /** Token cost per use (only meaningful for `token` features). */
  readonly tokenCostPerUse?: number;
  /** Human-readable description. */
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Default feature registry
// ---------------------------------------------------------------------------

/**
 * Pre-registered features covering the full MCUA feature set.
 *
 * Seat features (free tier):
 *   basic-editing, ai-assistant, local-stt, local-embedding
 *
 * Token features (pro tier):
 *   archive-reasoning, premium-translation, temp-music-gen,
 *   premium-publish, cloud-stt, cloud-analysis
 *
 * Token features (enterprise tier):
 *   reference-dubbing, generative-motion, generative-effects
 */
const DEFAULT_FEATURES: readonly Feature[] = [
  // -- Seat features (free) -----------------------------------------------
  {
    id: 'basic-editing',
    name: 'Basic Editing',
    type: 'seat',
    tier: 'free',
    description:
      'Core timeline editing, trimming, transitions, and media management ' +
      'included with every seat.',
  },
  {
    id: 'ai-assistant',
    name: 'AI Assistant',
    type: 'seat',
    tier: 'free',
    description:
      'On-device AI assistant for editing suggestions, cut recommendations, ' +
      'and natural-language timeline queries.',
  },
  {
    id: 'local-stt',
    name: 'Local Speech-to-Text',
    type: 'seat',
    tier: 'free',
    description:
      'On-device Whisper-based speech-to-text transcription with word-level ' +
      'timestamps. No cloud round-trip required.',
  },
  {
    id: 'local-embedding',
    name: 'Local Embedding',
    type: 'seat',
    tier: 'free',
    description:
      'On-device vector embedding for semantic search of clips, bins, and ' +
      'metadata. Runs entirely on the local GPU.',
  },

  // -- Token features (pro) -----------------------------------------------
  {
    id: 'archive-reasoning',
    name: 'Archive Reasoning',
    type: 'token',
    tier: 'pro',
    tokenCostPerUse: 50,
    description:
      'AI reasoning over archived project data for cross-project analysis ' +
      'and intelligent retrieval.',
  },
  {
    id: 'premium-translation',
    name: 'Premium Translation',
    type: 'token',
    tier: 'pro',
    tokenCostPerUse: 100,
    description:
      'Cloud-based neural translation of captions and subtitles with ' +
      'broadcast-grade accuracy.',
  },
  {
    id: 'temp-music-gen',
    name: 'Temporary Music Generation',
    type: 'token',
    tier: 'pro',
    tokenCostPerUse: 150,
    description:
      'AI-generated royalty-free temporary music beds for rough-cut review.',
  },
  {
    id: 'premium-publish',
    name: 'Premium Publishing',
    type: 'token',
    tier: 'pro',
    tokenCostPerUse: 75,
    description:
      'Direct publishing to premium platforms with format conversion and ' +
      'delivery confirmation.',
  },
  {
    id: 'cloud-stt',
    name: 'Cloud Speech-to-Text',
    type: 'token',
    tier: 'pro',
    tokenCostPerUse: 25,
    description:
      'High-accuracy cloud STT with speaker diarisation. Falls back to ' +
      'local STT on free tier.',
  },
  {
    id: 'cloud-analysis',
    name: 'Cloud Media Analysis',
    type: 'token',
    tier: 'pro',
    tokenCostPerUse: 40,
    description:
      'Cloud-based content moderation, visual classification, and scene ' +
      'understanding.',
  },

  // -- Token features (enterprise) ----------------------------------------
  {
    id: 'reference-dubbing',
    name: 'Reference Dubbing',
    type: 'token',
    tier: 'enterprise',
    tokenCostPerUse: 200,
    description:
      'AI voice cloning and reference-quality dubbing for editorial review.',
  },
  {
    id: 'generative-motion',
    name: 'Generative Motion Graphics',
    type: 'token',
    tier: 'enterprise',
    tokenCostPerUse: 300,
    description:
      'AI-generated motion graphics, lower thirds, and title animations.',
  },
  {
    id: 'generative-effects',
    name: 'Generative Visual Effects',
    type: 'token',
    tier: 'enterprise',
    tokenCostPerUse: 250,
    description:
      'AI VFX including background replacement, object removal, and ' +
      'generative fill.',
  },
];

// ---------------------------------------------------------------------------
// Tier ranking
// ---------------------------------------------------------------------------

/** Numeric rank for tier comparison. Higher = more permissive. */
const TIER_RANK: Readonly<Record<WalletTier, number>> = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

// ---------------------------------------------------------------------------
// EntitlementChecker
// ---------------------------------------------------------------------------

/**
 * Evaluates feature access based on subscription tier and entitlement model.
 *
 * @example
 * ```ts
 * const checker = new EntitlementChecker('pro');
 *
 * checker.isEntitled('basic-editing');      // true  (seat, free)
 * checker.isEntitled('premium-translation'); // true  (token, pro)
 * checker.isEntitled('generative-motion');   // false (token, enterprise)
 *
 * checker.requiresTokens('premium-translation'); // true
 * checker.getTokenCost('premium-translation');    // 100
 * ```
 */
export class EntitlementChecker {
  /** Current subscription tier. */
  private readonly tier: WalletTier;

  /** Feature registry keyed by feature ID. */
  private readonly features: Map<string, Feature>;

  /**
   * Create a new EntitlementChecker.
   *
   * @param tier            - The subscription tier to evaluate against.
   * @param customFeatures  - Optional custom feature list (overrides defaults).
   */
  constructor(tier: WalletTier, customFeatures?: readonly Feature[]) {
    this.tier = tier;
    this.features = new Map();

    const source = customFeatures ?? DEFAULT_FEATURES;
    for (const feature of source) {
      this.features.set(feature.id, feature);
    }
  }

  // -----------------------------------------------------------------------
  // Access checks
  // -----------------------------------------------------------------------

  /**
   * Check whether the current tier is entitled to use a feature.
   *
   * A user is entitled if their tier rank is >= the feature's minimum tier
   * rank. Token features additionally require a balance check (not done
   * here -- see {@link MeteringService}).
   *
   * @param featureId - Feature identifier.
   * @returns `true` if the user's tier grants access to the feature.
   */
  isEntitled(featureId: string): boolean {
    const feature = this.features.get(featureId);
    if (!feature) return false;

    return TIER_RANK[this.tier] >= TIER_RANK[feature.tier];
  }

  /**
   * Look up a feature by its identifier.
   *
   * @param featureId - Feature identifier.
   * @returns The {@link Feature} definition, or `undefined` if not found.
   */
  getFeature(featureId: string): Feature | undefined {
    return this.features.get(featureId);
  }

  /**
   * List all registered features regardless of tier.
   *
   * @returns Array of all features.
   */
  listFeatures(): Feature[] {
    return Array.from(this.features.values());
  }

  /**
   * List features available to the current tier.
   *
   * @returns Array of features the user is entitled to use.
   */
  listAvailableFeatures(): Feature[] {
    return Array.from(this.features.values()).filter(
      (f) => TIER_RANK[this.tier] >= TIER_RANK[f.tier],
    );
  }

  // -----------------------------------------------------------------------
  // Token cost helpers
  // -----------------------------------------------------------------------

  /**
   * Check whether a feature requires token payment in addition to the
   * tier entitlement.
   *
   * @param featureId - Feature identifier.
   * @returns `true` if the feature is token-gated.
   */
  requiresTokens(featureId: string): boolean {
    const feature = this.features.get(featureId);
    return feature?.type === 'token';
  }

  /**
   * Get the per-use token cost of a feature.
   *
   * @param featureId - Feature identifier.
   * @returns The token cost, or `null` if the feature is seat-included or
   *          not found.
   */
  getTokenCost(featureId: string): number | null {
    const feature = this.features.get(featureId);
    if (!feature || feature.type !== 'token') return null;
    return feature.tokenCostPerUse ?? null;
  }
}
