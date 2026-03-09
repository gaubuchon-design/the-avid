/**
 * @module MeteringService
 * @description Records token consumption across the quote-hold-settle lifecycle.
 *
 * The metering service sits between the {@link JobQuoter} and the
 * {@link TokenWallet}, orchestrating the full billing flow:
 *
 * 1. **startJob**    -- Obtain a quote, place a hold on the wallet.
 * 2. **completeJob** -- Settle the hold with the actual token count.
 * 3. **failJob**     -- Release the hold without charging.
 *
 * It also maintains aggregate usage statistics by category for dashboards
 * and admin views.
 */

import type { TokenCategory } from './ConsumptionCategories';
import type { Transaction } from './TokenWallet';
import type { JobQuote, QuoteParams } from './JobQuoter';
import { TokenWallet } from './TokenWallet';
import { JobQuoter } from './JobQuoter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Status of a metered job. */
export type JobStatus = 'active' | 'completed' | 'failed';

/**
 * A job that is currently in-flight (hold placed, execution in progress).
 */
export interface ActiveJob {
  /** Unique job identifier (matches the quote jobId). */
  readonly jobId: string;
  /** Token consumption category. */
  readonly category: TokenCategory;
  /** The quote that was issued for this job. */
  readonly quote: JobQuote;
  /** ISO-8601 timestamp when the job was started. */
  readonly startedAt: string;
}

/**
 * A job that has reached a terminal state (completed or failed).
 */
export interface CompletedJob {
  /** Unique job identifier. */
  readonly jobId: string;
  /** Token consumption category. */
  readonly category: TokenCategory;
  /** The original quote. */
  readonly quote: JobQuote;
  /** Final status. */
  readonly status: 'completed' | 'failed';
  /** Actual tokens consumed (0 for failed jobs). */
  readonly actualTokens: number;
  /** ISO-8601 timestamp when the job was started. */
  readonly startedAt: string;
  /** ISO-8601 timestamp when the job reached a terminal state. */
  readonly completedAt: string;
}

/**
 * Aggregate usage statistics for a single category.
 */
export interface CategoryUsageStats {
  /** Total tokens consumed in this category. */
  readonly total: number;
  /** Number of completed jobs in this category. */
  readonly count: number;
}

/**
 * High-level usage summary across all categories.
 */
export interface UsageSummary {
  /** Total tokens consumed (debited) across all completed jobs. */
  readonly totalConsumed: number;
  /** Total tokens currently held for active jobs. */
  readonly totalHeld: number;
  /** Total number of jobs (active + completed). */
  readonly jobCount: number;
  /** Per-category token totals. */
  readonly categoryBreakdown: Readonly<Record<string, number>>;
}

// ---------------------------------------------------------------------------
// MeteringService
// ---------------------------------------------------------------------------

/**
 * Coordinates token metering across the quote-hold-settle lifecycle.
 *
 * @example
 * ```ts
 * const metering = new MeteringService(wallet, quoter);
 *
 * const { quote, holdTransaction } = metering.startJob('cloud-stt', {
 *   durationSeconds: 180,
 * });
 *
 * // ... run the STT job ...
 *
 * metering.completeJob(quote.jobId, 70); // actual usage
 * ```
 */
export class MeteringService {
  private readonly wallet: TokenWallet;
  private readonly quoter: JobQuoter;

  /** Active (in-flight) jobs keyed by jobId. */
  private readonly activeJobs: Map<string, ActiveJob> = new Map();

  /** Completed/failed jobs in chronological order. */
  private readonly completedJobs: CompletedJob[] = [];

  /**
   * Create a new MeteringService.
   *
   * @param wallet - The token wallet to hold/settle against.
   * @param quoter - The quoter used to generate cost estimates.
   */
  constructor(wallet: TokenWallet, quoter: JobQuoter) {
    this.wallet = wallet;
    this.quoter = quoter;
  }

  // -----------------------------------------------------------------------
  // Job lifecycle
  // -----------------------------------------------------------------------

  /**
   * Start a new metered job.
   *
   * Generates a quote for the given category and parameters, then places a
   * hold on the wallet for the estimated amount.
   *
   * @param category - Token consumption category.
   * @param params   - Job parameters influencing the quote.
   * @returns The quote and the hold transaction (null if balance insufficient).
   */
  startJob(
    category: TokenCategory,
    params: QuoteParams = {},
  ): { quote: JobQuote; holdTransaction: Transaction | null } {
    const quote = this.quoter.quote(category, params);
    const holdTransaction = this.wallet.hold(
      quote.estimatedTokens,
      quote.jobId,
      category,
    );

    if (holdTransaction) {
      this.activeJobs.set(quote.jobId, {
        jobId: quote.jobId,
        category,
        quote,
        startedAt: new Date().toISOString(),
      });
    }

    return { quote, holdTransaction };
  }

  /**
   * Complete a metered job, settling the hold.
   *
   * @param jobId        - The job identifier (from the quote).
   * @param actualTokens - Actual tokens consumed. If omitted, the full
   *                       quoted amount is charged.
   * @returns The settlement transaction.
   * @throws Error if the job is not found or not active.
   */
  completeJob(jobId: string, actualTokens?: number): Transaction {
    const active = this.activeJobs.get(jobId);
    if (!active) {
      throw new Error(`No active job with id "${jobId}".`);
    }

    const tx = this.wallet.settle(jobId, actualTokens);

    this.completedJobs.push({
      jobId,
      category: active.category,
      quote: active.quote,
      status: 'completed',
      actualTokens: actualTokens ?? active.quote.estimatedTokens,
      startedAt: active.startedAt,
      completedAt: new Date().toISOString(),
    });

    this.activeJobs.delete(jobId);
    return tx;
  }

  /**
   * Fail a metered job, releasing the hold without charging.
   *
   * @param jobId - The job identifier.
   * @returns The release transaction.
   * @throws Error if the job is not found or not active.
   */
  failJob(jobId: string): Transaction {
    const active = this.activeJobs.get(jobId);
    if (!active) {
      throw new Error(`No active job with id "${jobId}".`);
    }

    const tx = this.wallet.release(jobId);

    this.completedJobs.push({
      jobId,
      category: active.category,
      quote: active.quote,
      status: 'failed',
      actualTokens: 0,
      startedAt: active.startedAt,
      completedAt: new Date().toISOString(),
    });

    this.activeJobs.delete(jobId);
    return tx;
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  /**
   * Get all currently active (in-flight) jobs.
   *
   * @returns Array of active jobs.
   */
  getActiveJobs(): ActiveJob[] {
    return Array.from(this.activeJobs.values());
  }

  /**
   * Get all completed or failed jobs.
   *
   * @returns Array of completed jobs in chronological order.
   */
  getCompletedJobs(): CompletedJob[] {
    return [...this.completedJobs];
  }

  /**
   * Get aggregate usage statistics grouped by category.
   *
   * Only includes completed (non-failed) jobs.
   *
   * @returns A record mapping each category to its usage stats.
   */
  getUsageByCategory(): Record<TokenCategory, CategoryUsageStats> {
    const result = {} as Record<TokenCategory, CategoryUsageStats>;

    for (const job of this.completedJobs) {
      if (job.status !== 'completed') continue;

      const existing = result[job.category];
      if (existing) {
        (result as Record<string, CategoryUsageStats>)[job.category] = {
          total: existing.total + job.actualTokens,
          count: existing.count + 1,
        };
      } else {
        result[job.category] = {
          total: job.actualTokens,
          count: 1,
        };
      }
    }

    return result;
  }

  /**
   * Get a high-level usage summary spanning all jobs and categories.
   *
   * @returns An immutable {@link UsageSummary}.
   */
  getUsageSummary(): UsageSummary {
    let totalConsumed = 0;
    const categoryBreakdown: Record<string, number> = {};

    for (const job of this.completedJobs) {
      if (job.status !== 'completed') continue;
      totalConsumed += job.actualTokens;
      categoryBreakdown[job.category] = (categoryBreakdown[job.category] ?? 0) + job.actualTokens;
    }

    const walletState = this.wallet.getState();

    return {
      totalConsumed,
      totalHeld: walletState.held,
      jobCount: this.activeJobs.size + this.completedJobs.length,
      categoryBreakdown,
    };
  }
}
