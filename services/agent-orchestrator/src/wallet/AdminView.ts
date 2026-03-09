/**
 * @module AdminView
 * @description Read-only administrative and audit views over the wallet,
 * metering, and entitlement subsystems.
 *
 * The AdminView aggregates data from multiple sources into cohesive
 * summaries suitable for:
 *
 * - Admin dashboards (wallet health, active holds, top categories).
 * - Audit logs (every balance-affecting transaction with timestamps).
 * - Usage reports (per-category consumption over a date range).
 * - JSON export for external analytics/billing systems.
 *
 * This module is strictly read-only and never mutates wallet or metering
 * state.
 */

import type { WalletTier, WalletState, Transaction } from './TokenWallet';
import type { TokenCategory } from './ConsumptionCategories';
import type { CompletedJob } from './MeteringService';
import { TokenWallet } from './TokenWallet';
import { MeteringService } from './MeteringService';
import { EntitlementChecker } from './EntitlementChecker';

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

/**
 * High-level wallet summary for admin dashboards.
 */
export interface WalletSummary {
  /** Wallet identifier. */
  readonly walletId: string;
  /** User identifier. */
  readonly userId: string;
  /** Organisation identifier (if applicable). */
  readonly orgId?: string;
  /** Current subscription tier. */
  readonly tier: WalletTier;
  /** Absolute token balance. */
  readonly balance: number;
  /** Available (spendable) balance. */
  readonly available: number;
  /** Tokens currently held for active jobs. */
  readonly held: number;
  /** Monthly allocation. */
  readonly monthlyAllocation: number;
  /** Tokens consumed this billing cycle. */
  readonly usedThisMonth: number;
  /** Remaining monthly allowance. */
  readonly remainingAllowance: number;
  /** Whether the monthly limit has been reached. */
  readonly monthlyLimitReached: boolean;
  /** ISO-8601 date of the next allocation reset. */
  readonly resetDate: string;
  /** Number of currently active (in-flight) jobs. */
  readonly activeJobCount: number;
  /** Number of completed jobs (all time). */
  readonly completedJobCount: number;
  /** Total number of features available at this tier. */
  readonly availableFeatureCount: number;
}

/**
 * Usage report over a date range.
 */
export interface UsageReport {
  /** ISO-8601 start of the report range (inclusive). */
  readonly startDate: string;
  /** ISO-8601 end of the report range (inclusive). */
  readonly endDate: string;
  /** Total tokens consumed in the range. */
  readonly totalTokens: number;
  /** Number of completed jobs in the range. */
  readonly jobCount: number;
  /** Per-category breakdown. */
  readonly categories: Readonly<Record<string, CategoryUsage>>;
  /** All completed jobs in the range. */
  readonly jobs: readonly CompletedJob[];
}

/**
 * Per-category usage within a report.
 */
export interface CategoryUsage {
  /** Category identifier. */
  readonly category: string;
  /** Total tokens consumed. */
  readonly totalTokens: number;
  /** Number of jobs. */
  readonly jobCount: number;
  /** Average tokens per job. */
  readonly averageTokensPerJob: number;
}

/**
 * A single audit log entry derived from a wallet transaction.
 */
export interface AuditEntry {
  /** Transaction identifier. */
  readonly transactionId: string;
  /** Transaction type. */
  readonly type: string;
  /** Token amount. */
  readonly amount: number;
  /** Balance after the transaction. */
  readonly balanceAfter: number;
  /** Associated job identifier. */
  readonly jobId?: string;
  /** Token category. */
  readonly category?: string;
  /** Human-readable description. */
  readonly description: string;
  /** ISO-8601 timestamp. */
  readonly timestamp: string;
}

// ---------------------------------------------------------------------------
// AdminView
// ---------------------------------------------------------------------------

/**
 * Provides read-only administrative views and reports.
 *
 * @example
 * ```ts
 * const admin = new AdminView(wallet, metering, entitlements);
 *
 * const summary = admin.getWalletSummary();
 * const report  = admin.getUsageReport('2026-03-01', '2026-03-31');
 * const json    = admin.exportReport();
 * ```
 */
export class AdminView {
  private readonly wallet: TokenWallet;
  private readonly metering: MeteringService;
  private readonly entitlements: EntitlementChecker;

  /**
   * Create a new AdminView.
   *
   * @param wallet       - The token wallet to inspect.
   * @param metering     - The metering service for job data.
   * @param entitlements - The entitlement checker for feature counts.
   */
  constructor(
    wallet: TokenWallet,
    metering: MeteringService,
    entitlements: EntitlementChecker,
  ) {
    this.wallet = wallet;
    this.metering = metering;
    this.entitlements = entitlements;
  }

  // -----------------------------------------------------------------------
  // Summaries
  // -----------------------------------------------------------------------

  /**
   * Get a high-level wallet summary for admin dashboards.
   *
   * @returns An immutable {@link WalletSummary}.
   */
  getWalletSummary(): WalletSummary {
    const state = this.wallet.getState();
    const activeJobs = this.metering.getActiveJobs();
    const completedJobs = this.metering.getCompletedJobs();
    const availableFeatures = this.entitlements.listAvailableFeatures();

    return {
      walletId: state.id,
      userId: state.userId,
      orgId: state.orgId,
      tier: state.tier,
      balance: state.balance,
      available: this.wallet.getBalance(),
      held: state.held,
      monthlyAllocation: state.monthlyAllocation,
      usedThisMonth: state.usedThisMonth,
      remainingAllowance: this.wallet.getRemainingMonthlyAllowance(),
      monthlyLimitReached: this.wallet.isMonthlyLimitReached(),
      resetDate: state.resetDate,
      activeJobCount: activeJobs.length,
      completedJobCount: completedJobs.length,
      availableFeatureCount: availableFeatures.length,
    };
  }

  // -----------------------------------------------------------------------
  // Usage reports
  // -----------------------------------------------------------------------

  /**
   * Generate a usage report for a date range.
   *
   * If no dates are provided the report covers all time.
   *
   * @param startDate - ISO-8601 start date (inclusive). Defaults to epoch.
   * @param endDate   - ISO-8601 end date (inclusive). Defaults to now.
   * @returns An immutable {@link UsageReport}.
   */
  getUsageReport(startDate?: string, endDate?: string): UsageReport {
    const start = startDate ?? '1970-01-01T00:00:00Z';
    const end = endDate ?? new Date().toISOString();

    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();

    const allJobs = this.metering.getCompletedJobs();
    const filtered = allJobs.filter((job) => {
      const ts = new Date(job.completedAt).getTime();
      return ts >= startMs && ts <= endMs && job.status === 'completed';
    });

    // Build category breakdown
    const catMap: Record<string, { totalTokens: number; jobCount: number }> = {};
    let totalTokens = 0;

    for (const job of filtered) {
      totalTokens += job.actualTokens;
      if (!catMap[job.category]) {
        catMap[job.category] = { totalTokens: 0, jobCount: 0 };
      }
      const cat = catMap[job.category]!;
      cat.totalTokens += job.actualTokens;
      cat.jobCount += 1;
    }

    const categories: Record<string, CategoryUsage> = {};
    for (const [cat, data] of Object.entries(catMap)) {
      categories[cat] = {
        category: cat,
        totalTokens: data.totalTokens,
        jobCount: data.jobCount,
        averageTokensPerJob: data.jobCount > 0 ? Math.round(data.totalTokens / data.jobCount) : 0,
      };
    }

    return {
      startDate: start,
      endDate: end,
      totalTokens,
      jobCount: filtered.length,
      categories,
      jobs: filtered,
    };
  }

  // -----------------------------------------------------------------------
  // Audit log
  // -----------------------------------------------------------------------

  /**
   * Get a full audit log of all wallet transactions.
   *
   * @returns Array of {@link AuditEntry} in chronological order.
   */
  getAuditLog(): AuditEntry[] {
    return this.wallet.getTransactions().map((tx) => ({
      transactionId: tx.id,
      type: tx.type,
      amount: tx.amount,
      balanceAfter: tx.balanceAfter,
      jobId: tx.jobId,
      category: tx.category,
      description: tx.description,
      timestamp: tx.timestamp,
    }));
  }

  // -----------------------------------------------------------------------
  // Category analysis
  // -----------------------------------------------------------------------

  /**
   * Get the top token-consuming categories ranked by total consumption.
   *
   * @param limit - Maximum number of categories to return (default: 5).
   * @returns Array of {@link CategoryUsage} sorted by total tokens descending.
   */
  getTopCategories(limit: number = 5): CategoryUsage[] {
    const usage = this.metering.getUsageByCategory();

    const entries: CategoryUsage[] = Object.entries(usage).map(([cat, stats]) => ({
      category: cat,
      totalTokens: stats.total,
      jobCount: stats.count,
      averageTokensPerJob: stats.count > 0 ? Math.round(stats.total / stats.count) : 0,
    }));

    return entries
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------

  /**
   * Export a complete JSON report containing the wallet summary, usage
   * report, audit log, and top categories.
   *
   * Suitable for feeding into external analytics or billing systems.
   *
   * @returns A JSON string.
   */
  exportReport(): string {
    const report = {
      exportedAt: new Date().toISOString(),
      walletSummary: this.getWalletSummary(),
      usageReport: this.getUsageReport(),
      auditLog: this.getAuditLog(),
      topCategories: this.getTopCategories(10),
    };

    return JSON.stringify(report, null, 2);
  }
}
