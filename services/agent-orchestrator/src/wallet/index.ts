/**
 * @module wallet
 * @description Token wallet and monetisation hooks for the MCUA agent
 * orchestrator.
 *
 * This barrel re-exports every public type and class from the wallet
 * subsystem so consumers can import from a single entry point:
 *
 * ```ts
 * import {
 *   TokenWallet,
 *   JobQuoter,
 *   MeteringService,
 *   EntitlementChecker,
 *   AdminView,
 *   CATEGORY_DEFINITIONS,
 * } from './wallet';
 * ```
 */

// ---------------------------------------------------------------------------
// Consumption categories
// ---------------------------------------------------------------------------

export {
  CATEGORY_DEFINITIONS,
  getAllCategories,
  getCategoryDefinition,
  isTierSufficient,
  getDefaultPricingMap,
} from './ConsumptionCategories';

export type {
  TokenCategory,
  CategoryDefinition,
} from './ConsumptionCategories';

// ---------------------------------------------------------------------------
// Token wallet
// ---------------------------------------------------------------------------

export { TokenWallet } from './TokenWallet';

export type {
  WalletTier,
  TransactionType,
  WalletState,
  Transaction,
} from './TokenWallet';

// ---------------------------------------------------------------------------
// Job quoter
// ---------------------------------------------------------------------------

export { JobQuoter } from './JobQuoter';

export type {
  QuoteParams,
  JobQuote,
} from './JobQuoter';

// ---------------------------------------------------------------------------
// Metering service
// ---------------------------------------------------------------------------

export { MeteringService } from './MeteringService';

export type {
  JobStatus,
  ActiveJob,
  CompletedJob,
  CategoryUsageStats,
  UsageSummary,
} from './MeteringService';

// ---------------------------------------------------------------------------
// Entitlement checker
// ---------------------------------------------------------------------------

export { EntitlementChecker } from './EntitlementChecker';

export type {
  FeatureType,
  Feature,
} from './EntitlementChecker';

// ---------------------------------------------------------------------------
// Admin view
// ---------------------------------------------------------------------------

export { AdminView } from './AdminView';

export type {
  WalletSummary,
  UsageReport,
  CategoryUsage,
  AuditEntry,
} from './AdminView';
