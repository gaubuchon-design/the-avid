/**
 * @module TokenWallet
 * @description In-memory token wallet with balance management, hold/settle
 * semantics, and transaction history.
 *
 * The wallet implements the **quote-hold-settle** pattern:
 *
 * 1. **Hold** -- Reserve tokens before a job starts. The held amount is
 *    deducted from the available balance but not yet consumed.
 * 2. **Settle** -- When the job completes, convert the hold into a debit
 *    for the actual amount consumed. Any difference is refunded.
 * 3. **Release** -- If the job is cancelled or fails, release the hold
 *    without charging the user.
 *
 * This ensures users are never surprised by unexpected charges and the
 * system degrades gracefully when the balance is insufficient.
 */

import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Subscription tier governing monthly allocations and feature access. */
export type WalletTier = 'free' | 'pro' | 'enterprise';

/** Discriminated transaction types. */
export type TransactionType = 'credit' | 'debit' | 'hold' | 'release' | 'refund';

/**
 * Immutable snapshot of the wallet's current state.
 */
export interface WalletState {
  /** Unique wallet identifier. */
  readonly id: string;
  /** Owning user identifier. */
  readonly userId: string;
  /** Optional organisation scope. */
  readonly orgId?: string;
  /** Current absolute token balance (includes held tokens). */
  readonly balance: number;
  /** Tokens currently held (reserved) for pending jobs. */
  readonly held: number;
  /** Subscription tier. */
  readonly tier: WalletTier;
  /** Monthly token allocation for the current billing cycle. */
  readonly monthlyAllocation: number;
  /** Tokens consumed so far in the current billing cycle. */
  readonly usedThisMonth: number;
  /** ISO-8601 date when the monthly allocation resets. */
  readonly resetDate: string;
}

/**
 * A single ledger entry recording a balance-affecting event.
 */
export interface Transaction {
  /** Unique transaction identifier. */
  readonly id: string;
  /** Wallet this transaction belongs to. */
  readonly walletId: string;
  /** Transaction type discriminator. */
  readonly type: TransactionType;
  /** Positive token amount involved in this transaction. */
  readonly amount: number;
  /** Associated job identifier (for hold/settle/release/refund). */
  readonly jobId?: string;
  /** Token consumption category label. */
  readonly category?: string;
  /** Human-readable description. */
  readonly description: string;
  /** ISO-8601 timestamp. */
  readonly timestamp: string;
  /** Wallet balance after this transaction was applied. */
  readonly balanceAfter: number;
}

// ---------------------------------------------------------------------------
// Internal hold tracking
// ---------------------------------------------------------------------------

/** Active hold keyed by jobId. */
interface ActiveHold {
  readonly jobId: string;
  readonly amount: number;
  readonly category: string;
  readonly transactionId: string;
}

// ---------------------------------------------------------------------------
// TokenWallet
// ---------------------------------------------------------------------------

/**
 * In-memory token wallet providing balance management with hold/settle
 * semantics.
 *
 * @example
 * ```ts
 * const wallet = new TokenWallet({
 *   id: 'w-1',
 *   userId: 'u-1',
 *   balance: 1000,
 *   tier: 'pro',
 *   monthlyAllocation: 5000,
 *   usedThisMonth: 200,
 *   resetDate: '2026-04-01T00:00:00Z',
 * });
 *
 * const holdTx = wallet.hold(100, 'job-1', 'cloud-stt');
 * // ... job executes ...
 * const settleTx = wallet.settle('job-1', 80); // refunds 20
 * ```
 */
export class TokenWallet {
  private _id: string;
  private _userId: string;
  private _orgId?: string;
  private _balance: number;
  private _held: number;
  private _tier: WalletTier;
  private _monthlyAllocation: number;
  private _usedThisMonth: number;
  private _resetDate: string;

  /** Ordered list of all transactions. */
  private readonly _transactions: Transaction[] = [];

  /** Active holds keyed by jobId. */
  private readonly _holds: Map<string, ActiveHold> = new Map();

  /**
   * Create a new TokenWallet.
   *
   * @param initialState - Initial wallet state. The `held` field is always
   *                       initialised to zero; any pre-existing holds must
   *                       be re-established via {@link hold}.
   */
  constructor(initialState: Omit<WalletState, 'held'>) {
    this._id = initialState.id;
    this._userId = initialState.userId;
    this._orgId = initialState.orgId;
    this._balance = initialState.balance;
    this._held = 0;
    this._tier = initialState.tier;
    this._monthlyAllocation = initialState.monthlyAllocation;
    this._usedThisMonth = initialState.usedThisMonth;
    this._resetDate = initialState.resetDate;
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /**
   * Get an immutable snapshot of the current wallet state.
   *
   * @returns The current {@link WalletState}.
   */
  getState(): WalletState {
    return {
      id: this._id,
      userId: this._userId,
      orgId: this._orgId,
      balance: this._balance,
      held: this._held,
      tier: this._tier,
      monthlyAllocation: this._monthlyAllocation,
      usedThisMonth: this._usedThisMonth,
      resetDate: this._resetDate,
    };
  }

  /**
   * Get the available (spendable) balance.
   *
   * Available = balance - held tokens.
   *
   * @returns Available token balance.
   */
  getBalance(): number {
    return this._balance - this._held;
  }

  // -----------------------------------------------------------------------
  // Hold / Settle / Release
  // -----------------------------------------------------------------------

  /**
   * Place a hold on tokens for a pending job.
   *
   * The held amount is subtracted from the available balance but remains
   * in the wallet until either {@link settle} or {@link release} is called.
   *
   * @param amount   - Number of tokens to hold.
   * @param jobId    - Unique job identifier.
   * @param category - Token category label.
   * @returns A hold {@link Transaction}, or `null` if the available balance
   *          is insufficient.
   */
  hold(amount: number, jobId: string, category: string): Transaction | null {
    if (amount <= 0) {
      throw new Error('Hold amount must be positive.');
    }

    if (this._holds.has(jobId)) {
      throw new Error(`A hold already exists for job "${jobId}".`);
    }

    if (this.getBalance() < amount) {
      return null;
    }

    this._held += amount;

    const tx = this.recordTransaction({
      type: 'hold',
      amount,
      jobId,
      category,
      description: `Hold ${amount} tokens for job ${jobId} (${category})`,
    });

    this._holds.set(jobId, {
      jobId,
      amount,
      category,
      transactionId: tx.id,
    });

    return tx;
  }

  /**
   * Settle a held amount, converting it to a debit.
   *
   * If `actualAmount` is less than the held amount, the difference is
   * automatically refunded. If `actualAmount` is omitted, the full held
   * amount is charged.
   *
   * @param jobId        - Job whose hold should be settled.
   * @param actualAmount - Actual tokens consumed (defaults to held amount).
   * @returns A debit {@link Transaction}.
   * @throws Error if no hold exists for the given jobId.
   */
  settle(jobId: string, actualAmount?: number): Transaction {
    const hold = this._holds.get(jobId);
    if (!hold) {
      throw new Error(`No active hold for job "${jobId}".`);
    }

    const consumed = actualAmount ?? hold.amount;
    if (consumed < 0) {
      throw new Error('Actual amount cannot be negative.');
    }

    // Release the hold
    this._held -= hold.amount;

    // Debit the actual amount
    this._balance -= consumed;
    this._usedThisMonth += consumed;

    const tx = this.recordTransaction({
      type: 'debit',
      amount: consumed,
      jobId,
      category: hold.category,
      description: `Settled job ${jobId}: consumed ${consumed} tokens (held ${hold.amount})`,
    });

    // Refund the difference if any
    if (consumed < hold.amount) {
      // No additional balance change needed -- the hold already reserved
      // more than was consumed, and we only debited `consumed` from
      // balance. The leftover simply returns to available.
      this.recordTransaction({
        type: 'refund',
        amount: hold.amount - consumed,
        jobId,
        category: hold.category,
        description: `Refund ${hold.amount - consumed} tokens for job ${jobId} (overestimate)`,
      });
    }

    this._holds.delete(jobId);
    return tx;
  }

  /**
   * Release a hold without charging the user.
   *
   * Used when a job is cancelled or fails before consuming any tokens.
   *
   * @param jobId - Job whose hold should be released.
   * @returns A release {@link Transaction}.
   * @throws Error if no hold exists for the given jobId.
   */
  release(jobId: string): Transaction {
    const hold = this._holds.get(jobId);
    if (!hold) {
      throw new Error(`No active hold for job "${jobId}".`);
    }

    this._held -= hold.amount;
    this._holds.delete(jobId);

    return this.recordTransaction({
      type: 'release',
      amount: hold.amount,
      jobId,
      category: hold.category,
      description: `Released hold of ${hold.amount} tokens for job ${jobId}`,
    });
  }

  // -----------------------------------------------------------------------
  // Refund / Credit
  // -----------------------------------------------------------------------

  /**
   * Issue a refund for a completed job.
   *
   * Adds tokens back to the balance and decrements the monthly usage
   * counter.
   *
   * @param amount  - Number of tokens to refund.
   * @param jobId   - Job that is being refunded.
   * @param reason  - Human-readable refund reason.
   * @returns A refund {@link Transaction}.
   */
  refund(amount: number, jobId: string, reason: string): Transaction {
    if (amount <= 0) {
      throw new Error('Refund amount must be positive.');
    }

    this._balance += amount;
    this._usedThisMonth = Math.max(0, this._usedThisMonth - amount);

    return this.recordTransaction({
      type: 'refund',
      amount,
      jobId,
      description: `Refund ${amount} tokens for job ${jobId}: ${reason}`,
    });
  }

  /**
   * Credit tokens to the wallet (e.g. monthly allocation top-up, purchase).
   *
   * @param amount      - Number of tokens to credit.
   * @param description - Human-readable reason for the credit.
   * @returns A credit {@link Transaction}.
   */
  credit(amount: number, description: string): Transaction {
    if (amount <= 0) {
      throw new Error('Credit amount must be positive.');
    }

    this._balance += amount;

    return this.recordTransaction({
      type: 'credit',
      amount,
      description,
    });
  }

  // -----------------------------------------------------------------------
  // Transaction queries
  // -----------------------------------------------------------------------

  /**
   * Retrieve transactions with optional filtering.
   *
   * @param filter - Optional filter criteria.
   * @returns Array of matching transactions in chronological order.
   */
  getTransactions(filter?: { jobId?: string; type?: TransactionType }): Transaction[] {
    if (!filter) {
      return [...this._transactions];
    }

    return this._transactions.filter((tx) => {
      if (filter.jobId && tx.jobId !== filter.jobId) return false;
      if (filter.type && tx.type !== filter.type) return false;
      return true;
    });
  }

  // -----------------------------------------------------------------------
  // Monthly limit helpers
  // -----------------------------------------------------------------------

  /**
   * Check whether the monthly token allocation has been exhausted.
   *
   * @returns `true` if the monthly limit has been reached or exceeded.
   */
  isMonthlyLimitReached(): boolean {
    return this._usedThisMonth >= this._monthlyAllocation;
  }

  /**
   * Get the number of tokens remaining in the monthly allocation.
   *
   * @returns Non-negative number of remaining tokens.
   */
  getRemainingMonthlyAllowance(): number {
    return Math.max(0, this._monthlyAllocation - this._usedThisMonth);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Create and append a transaction to the ledger.
   */
  private recordTransaction(params: {
    type: TransactionType;
    amount: number;
    jobId?: string;
    category?: string;
    description: string;
  }): Transaction {
    const tx: Transaction = {
      id: uuidv4(),
      walletId: this._id,
      type: params.type,
      amount: params.amount,
      jobId: params.jobId,
      category: params.category,
      description: params.description,
      timestamp: new Date().toISOString(),
      balanceAfter: this._balance,
    };

    this._transactions.push(tx);
    return tx;
  }
}
