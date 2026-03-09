/**
 * @module token-metering
 *
 * Types for the token wallet, metering, quoting, and entitlement system.
 * Every AI-powered operation is metered against a user or org wallet.
 * Jobs are quoted before execution, tokens are held during processing,
 * and settled (or refunded) on completion.
 */

// ─── Token Category ───────────────────────────────────────────────────────────

/**
 * Billable categories of AI-powered operations.
 * Each category maps to a specific model or service tier with its own
 * per-token cost.
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

// ─── Token Wallet ─────────────────────────────────────────────────────────────

/**
 * A token balance associated with a user or organisation.
 *
 * Wallets track the current balance, monthly allocation, and usage
 * within the current billing period.
 */
export interface TokenWallet {
  /** Unique wallet identifier. */
  readonly id: string;
  /** Owning user ID. */
  readonly userId: string;
  /** Owning organisation ID, or `null` for personal wallets. */
  readonly orgId: string | null;
  /** Current available token balance. */
  readonly balance: number;
  /** Currency unit (always `'tokens'`). */
  readonly currency: 'tokens';
  /** Subscription tier governing allocation and pricing. */
  readonly tier: 'free' | 'pro' | 'enterprise';
  /** Total tokens allocated per billing period. */
  readonly monthlyAllocation: number;
  /** Tokens consumed in the current billing period. */
  readonly usedThisMonth: number;
  /** ISO 8601 date when `usedThisMonth` resets to zero. */
  readonly resetDate: string;
}

// ─── Metering Record ──────────────────────────────────────────────────────────

/**
 * An immutable ledger entry recording token consumption for a single job.
 *
 * The lifecycle is: `quoted` -> `held` -> `settled` | `refunded`.
 */
export interface MeteringRecord {
  /** Unique metering record identifier. */
  readonly id: string;
  /** Wallet this record debits from. */
  readonly walletId: string;
  /** Job that triggered this metering event. */
  readonly jobId: string;
  /** Billable operation category. */
  readonly category: TokenCategory;
  /** Actual tokens consumed (finalised on settlement). */
  readonly tokensConsumed: number;
  /** Tokens quoted before execution. */
  readonly quotedCost: number;
  /** Final cost after settlement (may differ from quote). */
  readonly actualCost: number;
  /** Lifecycle status of this metering record. */
  readonly status: 'quoted' | 'held' | 'settled' | 'refunded';
  /** ISO 8601 creation timestamp. */
  readonly createdAt: string;
  /** ISO 8601 settlement timestamp, or `null` if not yet settled. */
  readonly settledAt: string | null;
}

// ─── Job Quote ────────────────────────────────────────────────────────────────

/**
 * A pre-execution cost estimate for an AI job.
 *
 * Quotes include a token breakdown by sub-operation and a confidence
 * level indicating how precise the estimate is.
 */
export interface JobQuote {
  /** Job identifier this quote applies to. */
  readonly jobId: string;
  /** Billable operation category. */
  readonly category: TokenCategory;
  /** Total estimated tokens. */
  readonly estimatedTokens: number;
  /** Per-sub-operation token breakdown (e.g. `{ "inference": 800, "embedding": 200 }`). */
  readonly breakdown: Readonly<Record<string, number>>;
  /** ISO 8601 timestamp after which this quote is no longer valid. */
  readonly expiresAt: string;
  /** Confidence level of the estimate. */
  readonly confidence: 'exact' | 'estimated' | 'upper-bound';
}

// ─── Entitlement ──────────────────────────────────────────────────────────────

/**
 * A feature-level entitlement governing access and token cost.
 *
 * Entitlements are evaluated at request time to determine whether a
 * user may invoke a given feature and what the per-use token cost is.
 */
export interface Entitlement {
  /** Feature identifier (e.g. `"generative-effects"`, `"cloud-stt"`). */
  readonly featureId: string;
  /** Entitlement type — seat-based or token-based. */
  readonly type: 'seat' | 'token';
  /** Minimum subscription tier required. */
  readonly tier: 'free' | 'pro' | 'enterprise';
  /** Whether this entitlement is currently active. */
  readonly enabled: boolean;
  /** Per-use token cost, or `null` for seat-only entitlements. */
  readonly tokenCostPerUse: number | null;
}
