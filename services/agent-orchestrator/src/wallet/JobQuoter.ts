/**
 * @module JobQuoter
 * @description Pre-execution cost estimation for token-consuming jobs.
 *
 * The quoter calculates an estimated token cost **before** execution begins
 * so the UI can display a confirmation dialog and the {@link TokenWallet}
 * can place a hold for exactly the quoted amount.
 *
 * Quotes include a confidence level:
 * - `exact`       -- deterministic cost (e.g. flat-rate operations).
 * - `estimated`   -- best-effort estimate based on input parameters.
 * - `upper-bound` -- worst-case ceiling; actual cost may be lower.
 *
 * Quotes expire after a configurable TTL (default: 5 minutes) to prevent
 * stale pricing from being used long after conditions have changed.
 */

import { v4 as uuidv4 } from 'uuid';

import type { TokenCategory } from './ConsumptionCategories';
import { CATEGORY_DEFINITIONS, getDefaultPricingMap } from './ConsumptionCategories';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Parameters that influence the token cost of a job.
 *
 * Not all fields are relevant to every category; unused fields are ignored.
 */
export interface QuoteParams {
  /** Duration of the media in seconds (relevant to STT, analysis). */
  readonly durationSeconds?: number;
  /** Word count of textual content (relevant to translation). */
  readonly wordCount?: number;
  /** Number of clips involved (relevant to generative effects/motion). */
  readonly clipCount?: number;
  /** Target languages for translation/dubbing. */
  readonly targetLanguages?: readonly string[];
  /** Output resolution (e.g. "1080p", "4K"). */
  readonly resolution?: string;
}

/**
 * An immutable cost estimate for a pending job.
 */
export interface JobQuote {
  /** Unique quote identifier (becomes the jobId for holds). */
  readonly jobId: string;
  /** Token consumption category. */
  readonly category: TokenCategory;
  /** Total estimated token cost. */
  readonly estimatedTokens: number;
  /** Line-item breakdown of the estimate. */
  readonly breakdown: Readonly<Record<string, number>>;
  /** Confidence level of the estimate. */
  readonly confidence: 'exact' | 'estimated' | 'upper-bound';
  /** ISO-8601 timestamp after which this quote should not be honoured. */
  readonly expiresAt: string;
  /** Non-fatal warnings (e.g. "estimate may vary with actual duration"). */
  readonly warnings: readonly string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default quote TTL in milliseconds (5 minutes). */
const DEFAULT_QUOTE_TTL_MS = 5 * 60 * 1000;

/** Resolution multipliers for generative categories. */
const RESOLUTION_MULTIPLIER: Readonly<Record<string, number>> = {
  '720p': 0.75,
  '1080p': 1.0,
  '2K': 1.5,
  '4K': 2.0,
  '8K': 4.0,
};

/**
 * Mapping from tool names to token categories for plan-level estimation.
 * Tools not in this map are assumed to be free (seat-included).
 */
const TOOL_TO_CATEGORY: Readonly<Record<string, TokenCategory>> = {
  generate_captions: 'cloud-stt',
  premium_translate: 'premium-translation',
  reference_dub: 'reference-dubbing',
  generate_temp_music: 'temp-music-gen',
  generate_motion_graphic: 'generative-motion',
  generate_vfx: 'generative-effects',
  publish_premium: 'premium-publish',
  cloud_transcribe: 'cloud-stt',
  cloud_analyze: 'cloud-analysis',
  archive_query: 'archive-reasoning',
};

// ---------------------------------------------------------------------------
// JobQuoter
// ---------------------------------------------------------------------------

/**
 * Estimates token costs for jobs before execution.
 *
 * @example
 * ```ts
 * const quoter = new JobQuoter();
 * const quote = quoter.quote('premium-translation', {
 *   targetLanguages: ['fr', 'de', 'es'],
 *   wordCount: 5000,
 * });
 * console.log(quote.estimatedTokens); // 300 (100 per language)
 * ```
 */
export class JobQuoter {
  /** Active pricing table (base rate per category). */
  private readonly pricing: Record<TokenCategory, number>;

  /** Quote TTL in milliseconds. */
  private readonly quoteTtlMs: number;

  /**
   * Create a new JobQuoter.
   *
   * @param pricing  - Optional pricing overrides. Missing categories fall
   *                   back to the defaults from {@link CATEGORY_DEFINITIONS}.
   * @param quoteTtl - Quote expiry in milliseconds (default: 5 minutes).
   */
  constructor(
    pricing?: Partial<Record<TokenCategory, number>>,
    quoteTtl: number = DEFAULT_QUOTE_TTL_MS,
  ) {
    this.pricing = { ...getDefaultPricingMap(), ...pricing };
    this.quoteTtlMs = quoteTtl;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Generate a cost quote for a specific category and parameter set.
   *
   * @param category - Token consumption category.
   * @param params   - Job parameters influencing the cost.
   * @returns An immutable {@link JobQuote}.
   */
  quote(category: TokenCategory, params: QuoteParams = {}): JobQuote {
    const baseRate = this.pricing[category];
    const def = CATEGORY_DEFINITIONS[category];
    const breakdown: Record<string, number> = {};
    const warnings: string[] = [];

    let total = 0;
    let confidence: JobQuote['confidence'] = 'exact';

    switch (category) {
      // -- Per-language categories ------------------------------------------
      case 'premium-translation': {
        const langCount = params.targetLanguages?.length ?? 1;
        const perLang = baseRate;
        breakdown['base_per_language'] = perLang;
        breakdown['language_count'] = langCount;
        total = perLang * langCount;

        if (params.wordCount && params.wordCount > 10_000) {
          const surcharge = Math.ceil(params.wordCount / 10_000) * 20;
          breakdown['long_document_surcharge'] = surcharge;
          total += surcharge;
          warnings.push('Long document surcharge applied (>10,000 words).');
          confidence = 'estimated';
        }
        break;
      }

      case 'reference-dubbing': {
        const langCount = params.targetLanguages?.length ?? 1;
        breakdown['base_per_language'] = baseRate;
        breakdown['language_count'] = langCount;
        total = baseRate * langCount;

        if (params.durationSeconds) {
          const minutes = Math.ceil(params.durationSeconds / 60);
          if (minutes > 10) {
            const surcharge = (minutes - 10) * 15;
            breakdown['long_duration_surcharge'] = surcharge;
            total += surcharge;
            warnings.push('Long duration surcharge applied (>10 minutes).');
          }
          confidence = 'estimated';
        } else {
          confidence = 'upper-bound';
          warnings.push('Duration not provided; quote is an upper-bound estimate.');
        }
        break;
      }

      // -- Per-minute categories -------------------------------------------
      case 'cloud-stt': {
        if (params.durationSeconds) {
          const minutes = Math.ceil(params.durationSeconds / 60);
          breakdown['base_per_minute'] = baseRate;
          breakdown['duration_minutes'] = minutes;
          total = baseRate * minutes;
          confidence = 'exact';
        } else {
          // Assume 5 minutes as upper-bound
          breakdown['base_per_minute'] = baseRate;
          breakdown['estimated_minutes'] = 5;
          total = baseRate * 5;
          confidence = 'upper-bound';
          warnings.push('Duration not provided; assuming 5-minute upper bound.');
        }
        break;
      }

      // -- Per-clip generative categories ----------------------------------
      case 'generative-motion':
      case 'generative-effects': {
        const clipCount = params.clipCount ?? 1;
        breakdown['base_per_clip'] = baseRate;
        breakdown['clip_count'] = clipCount;
        total = baseRate * clipCount;

        // Resolution multiplier
        if (params.resolution && RESOLUTION_MULTIPLIER[params.resolution]) {
          const mult = RESOLUTION_MULTIPLIER[params.resolution];
          if (mult !== 1.0) {
            breakdown['resolution_multiplier'] = mult;
            total = Math.ceil(total * mult);
          }
        }
        confidence = 'estimated';
        break;
      }

      // -- Flat-rate categories --------------------------------------------
      case 'archive-reasoning':
      case 'temp-music-gen':
      case 'cloud-analysis': {
        breakdown[`base_${def?.unitLabel.replace(/\s+/g, '_') ?? 'flat'}`] = baseRate;
        total = baseRate;
        confidence = 'exact';
        break;
      }

      // -- Per-platform publishing -----------------------------------------
      case 'premium-publish': {
        // targetLanguages doubles as "target platforms" for publishing
        const platformCount = params.targetLanguages?.length ?? 1;
        breakdown['base_per_platform'] = baseRate;
        breakdown['platform_count'] = platformCount;
        total = baseRate * platformCount;
        confidence = 'exact';
        break;
      }

      default: {
        breakdown['base'] = baseRate;
        total = baseRate;
        confidence = 'estimated';
      }
    }

    return Object.freeze({
      jobId: uuidv4(),
      category,
      estimatedTokens: total,
      breakdown: Object.freeze({ ...breakdown }),
      confidence,
      expiresAt: new Date(Date.now() + this.quoteTtlMs).toISOString(),
      warnings: Object.freeze([...warnings]),
    });
  }

  /**
   * Get the current pricing table.
   *
   * @returns A copy of the active pricing map.
   */
  getDefaultPricing(): Record<TokenCategory, number> {
    return { ...this.pricing };
  }

  /**
   * Estimate the total token cost for an execution plan by summing the
   * costs of all steps that map to a token-consuming category.
   *
   * Steps whose tool name does not map to a known category are treated as
   * free (seat-included).
   *
   * @param plan - A plan-like object with an array of steps.
   * @returns An aggregate {@link JobQuote} covering the entire plan.
   */
  estimateForPlan(plan: { steps: Array<{ toolName: string }> }): JobQuote {
    const breakdown: Record<string, number> = {};
    const warnings: string[] = [];
    let total = 0;
    let hasEstimate = false;

    for (const step of plan.steps) {
      const category = TOOL_TO_CATEGORY[step.toolName];
      if (!category) {
        // Free / seat-included tool
        continue;
      }

      const rate = this.pricing[category];
      const key = `${step.toolName} (${category})`;
      breakdown[key] = (breakdown[key] ?? 0) + rate;
      total += rate;
      hasEstimate = true;
    }

    if (!hasEstimate) {
      warnings.push('No token-consuming steps detected in this plan.');
    }

    return Object.freeze({
      jobId: uuidv4(),
      category: 'cloud-analysis' as TokenCategory, // aggregate; category is informational
      estimatedTokens: total,
      breakdown: Object.freeze({ ...breakdown }),
      confidence: hasEstimate ? 'estimated' : 'exact',
      expiresAt: new Date(Date.now() + this.quoteTtlMs).toISOString(),
      warnings: Object.freeze([...warnings]),
    });
  }
}
