import { describe, it, expect, beforeEach } from 'vitest';
import { TokenWallet } from '../wallet/TokenWallet';
import type { WalletState } from '../wallet/TokenWallet';

function createWallet(overrides: Partial<Omit<WalletState, 'held'>> = {}): TokenWallet {
  return new TokenWallet({
    id: 'w-1',
    userId: 'u-1',
    balance: 1000,
    tier: 'pro',
    monthlyAllocation: 50000,
    usedThisMonth: 0,
    resetDate: '2026-04-01T00:00:00Z',
    ...overrides,
  });
}

describe('TokenWallet', () => {
  let wallet: TokenWallet;

  beforeEach(() => {
    wallet = createWallet();
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  describe('initial state', () => {
    it('starts with held=0', () => {
      const state = wallet.getState();
      expect(state.held).toBe(0);
    });

    it('returns correct initial balance', () => {
      expect(wallet.getBalance()).toBe(1000);
    });

    it('returns correct state snapshot', () => {
      const state = wallet.getState();
      expect(state.id).toBe('w-1');
      expect(state.userId).toBe('u-1');
      expect(state.balance).toBe(1000);
      expect(state.tier).toBe('pro');
    });
  });

  // -----------------------------------------------------------------------
  // credit
  // -----------------------------------------------------------------------

  describe('credit', () => {
    it('adds tokens to balance', () => {
      const tx = wallet.credit(500, 'Monthly allocation');
      expect(wallet.getBalance()).toBe(1500);
      expect(tx.type).toBe('credit');
      expect(tx.amount).toBe(500);
    });

    it('throws on non-positive amount', () => {
      expect(() => wallet.credit(0, 'invalid')).toThrow('positive');
      expect(() => wallet.credit(-10, 'invalid')).toThrow('positive');
    });

    it('records the transaction', () => {
      wallet.credit(100, 'bonus');
      const transactions = wallet.getTransactions({ type: 'credit' });
      expect(transactions).toHaveLength(1);
      expect(transactions[0]!.description).toContain('bonus');
    });
  });

  // -----------------------------------------------------------------------
  // hold
  // -----------------------------------------------------------------------

  describe('hold', () => {
    it('reserves tokens from available balance', () => {
      const tx = wallet.hold(200, 'job-1', 'cloud-stt');
      expect(tx).not.toBeNull();
      expect(wallet.getBalance()).toBe(800); // 1000 - 200 held
      expect(wallet.getState().held).toBe(200);
    });

    it('returns null when balance is insufficient', () => {
      const tx = wallet.hold(2000, 'job-1', 'cloud-stt');
      expect(tx).toBeNull();
      expect(wallet.getBalance()).toBe(1000); // unchanged
    });

    it('throws on non-positive amount', () => {
      expect(() => wallet.hold(0, 'job-1', 'cat')).toThrow('positive');
      expect(() => wallet.hold(-5, 'job-1', 'cat')).toThrow('positive');
    });

    it('throws when a hold already exists for the same jobId', () => {
      wallet.hold(100, 'job-1', 'cat');
      expect(() => wallet.hold(50, 'job-1', 'cat')).toThrow('already exists');
    });

    it('supports multiple concurrent holds', () => {
      wallet.hold(100, 'job-1', 'a');
      wallet.hold(200, 'job-2', 'b');
      expect(wallet.getBalance()).toBe(700);
      expect(wallet.getActiveHoldCount()).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // settle
  // -----------------------------------------------------------------------

  describe('settle', () => {
    beforeEach(() => {
      wallet.hold(200, 'job-1', 'cloud-stt');
    });

    it('settles full held amount by default', () => {
      const tx = wallet.settle('job-1');
      expect(tx.type).toBe('debit');
      expect(tx.amount).toBe(200);
      expect(wallet.getState().held).toBe(0);
      expect(wallet.getState().balance).toBe(800);
      expect(wallet.getState().usedThisMonth).toBe(200);
    });

    it('settles partial amount and refunds the difference', () => {
      wallet.settle('job-1', 150);
      expect(wallet.getState().balance).toBe(850);
      expect(wallet.getState().held).toBe(0);
      expect(wallet.getState().usedThisMonth).toBe(150);

      // Check that a refund transaction was created
      const refunds = wallet.getTransactions({ type: 'refund' });
      expect(refunds).toHaveLength(1);
      expect(refunds[0]!.amount).toBe(50);
    });

    it('throws when no hold exists for the job', () => {
      expect(() => wallet.settle('nonexistent')).toThrow('No active hold');
    });

    it('throws on negative actual amount', () => {
      expect(() => wallet.settle('job-1', -10)).toThrow('negative');
    });

    it('settles with 0 actual amount (full refund of hold)', () => {
      wallet.settle('job-1', 0);
      expect(wallet.getState().balance).toBe(1000);
      expect(wallet.getState().held).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // release
  // -----------------------------------------------------------------------

  describe('release', () => {
    it('releases a hold without charging', () => {
      wallet.hold(300, 'job-1', 'cloud-stt');
      const tx = wallet.release('job-1');

      expect(tx.type).toBe('release');
      expect(tx.amount).toBe(300);
      expect(wallet.getBalance()).toBe(1000); // unchanged
      expect(wallet.getState().held).toBe(0);
    });

    it('throws when no hold exists', () => {
      expect(() => wallet.release('nonexistent')).toThrow('No active hold');
    });
  });

  // -----------------------------------------------------------------------
  // refund
  // -----------------------------------------------------------------------

  describe('refund', () => {
    it('adds tokens back and decrements monthly usage', () => {
      // Simulate a debit first
      wallet.hold(100, 'job-1', 'cat');
      wallet.settle('job-1');
      expect(wallet.getState().usedThisMonth).toBe(100);

      wallet.refund(50, 'job-1', 'partial refund');
      expect(wallet.getState().balance).toBe(950);
      expect(wallet.getState().usedThisMonth).toBe(50);
    });

    it('throws on non-positive amount', () => {
      expect(() => wallet.refund(0, 'j1', 'r')).toThrow('positive');
    });

    it('does not go below 0 for usedThisMonth', () => {
      wallet.refund(100, 'j1', 'overrefund');
      expect(wallet.getState().usedThisMonth).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Monthly limits
  // -----------------------------------------------------------------------

  describe('monthly limits', () => {
    it('isMonthlyLimitReached returns false initially', () => {
      expect(wallet.isMonthlyLimitReached()).toBe(false);
    });

    it('isMonthlyLimitReached returns true when used exceeds allocation', () => {
      const w = createWallet({
        usedThisMonth: 50000,
        monthlyAllocation: 50000,
      });
      expect(w.isMonthlyLimitReached()).toBe(true);
    });

    it('getRemainingMonthlyAllowance returns correct value', () => {
      const w = createWallet({
        usedThisMonth: 10000,
        monthlyAllocation: 50000,
      });
      expect(w.getRemainingMonthlyAllowance()).toBe(40000);
    });

    it('getRemainingMonthlyAllowance returns 0 when exceeded', () => {
      const w = createWallet({
        usedThisMonth: 60000,
        monthlyAllocation: 50000,
      });
      expect(w.getRemainingMonthlyAllowance()).toBe(0);
    });

    it('resetMonthly resets usage and updates allocation', () => {
      const w = createWallet({ usedThisMonth: 30000 });
      w.resetMonthly('2026-05-01T00:00:00Z');
      expect(w.getState().usedThisMonth).toBe(0);
      expect(w.getState().resetDate).toBe('2026-05-01T00:00:00Z');
    });

    it('resetMonthly with allocationOverride', () => {
      wallet.resetMonthly('2026-05-01T00:00:00Z', 100000);
      expect(wallet.getState().monthlyAllocation).toBe(100000);
    });
  });

  // -----------------------------------------------------------------------
  // Tier management
  // -----------------------------------------------------------------------

  describe('setTier', () => {
    it('updates tier and monthly allocation', () => {
      wallet.setTier('enterprise');
      expect(wallet.getState().tier).toBe('enterprise');
      expect(wallet.getState().monthlyAllocation).toBe(500000);
    });

    it('downgrades to free tier', () => {
      wallet.setTier('free');
      expect(wallet.getState().tier).toBe('free');
      expect(wallet.getState().monthlyAllocation).toBe(1000);
    });
  });

  // -----------------------------------------------------------------------
  // Transaction queries
  // -----------------------------------------------------------------------

  describe('getTransactions', () => {
    it('returns all transactions when no filter', () => {
      wallet.credit(100, 'bonus');
      wallet.hold(50, 'job-1', 'stt');
      expect(wallet.getTransactions().length).toBe(2);
    });

    it('filters by type', () => {
      wallet.credit(100, 'bonus');
      wallet.hold(50, 'job-1', 'stt');
      const holds = wallet.getTransactions({ type: 'hold' });
      expect(holds).toHaveLength(1);
      expect(holds[0]!.type).toBe('hold');
    });

    it('filters by jobId', () => {
      wallet.hold(50, 'job-1', 'stt');
      wallet.hold(30, 'job-2', 'embed');
      const filtered = wallet.getTransactions({ jobId: 'job-1' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.jobId).toBe('job-1');
    });
  });

  // -----------------------------------------------------------------------
  // releaseStaleHolds
  // -----------------------------------------------------------------------

  describe('releaseStaleHolds', () => {
    it('does not release holds that are not older than the threshold', () => {
      wallet.hold(100, 'recent-job', 'cat');

      // With threshold of 60s, a just-created hold is not stale
      const released = wallet.releaseStaleHolds(60000);
      expect(released).toHaveLength(0);
      expect(wallet.getActiveHoldCount()).toBe(1);
    });

    it('does not release when age is exactly equal to threshold', () => {
      // The check is strictly greater-than: now - createdAt > maxAgeMs
      // When created at the same instant, age is 0, which is not > 0
      wallet.hold(100, 'same-instant', 'cat');
      const released = wallet.releaseStaleHolds(0);
      expect(released).toHaveLength(0);
      expect(wallet.getActiveHoldCount()).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Transaction count
  // -----------------------------------------------------------------------

  describe('getTransactionCount', () => {
    it('starts at 0', () => {
      expect(wallet.getTransactionCount()).toBe(0);
    });

    it('increments with each operation', () => {
      wallet.credit(100, 'bonus');
      wallet.hold(50, 'j1', 'c');
      wallet.settle('j1');
      expect(wallet.getTransactionCount()).toBeGreaterThanOrEqual(3);
    });
  });
});
