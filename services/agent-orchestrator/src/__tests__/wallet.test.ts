/**
 * @module wallet.test
 * @description Comprehensive tests for the Phase 9 token wallet and
 * monetisation subsystem.
 *
 * Coverage:
 * - TokenWallet: balance, hold, settle, release, refund, insufficient balance, monthly limit
 * - JobQuoter: quote by category, plan estimation, pricing overrides
 * - MeteringService: start/complete/fail job, usage by category, summary
 * - EntitlementChecker: tier-based access, token cost lookup
 * - Integration: full quote -> hold -> execute -> settle flow
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { TokenWallet } from '../wallet/TokenWallet';
import type { WalletState, Transaction } from '../wallet/TokenWallet';
import { JobQuoter } from '../wallet/JobQuoter';
import type { JobQuote } from '../wallet/JobQuoter';
import { MeteringService } from '../wallet/MeteringService';
import { EntitlementChecker } from '../wallet/EntitlementChecker';
import { AdminView } from '../wallet/AdminView';
import {
  CATEGORY_DEFINITIONS,
  getAllCategories,
  getCategoryDefinition,
  isTierSufficient,
  getDefaultPricingMap,
} from '../wallet/ConsumptionCategories';
import type { TokenCategory } from '../wallet/ConsumptionCategories';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default wallet state factory for tests. */
function createWallet(overrides?: Partial<Omit<WalletState, 'held'>>): TokenWallet {
  return new TokenWallet({
    id: 'w-test',
    userId: 'u-test',
    balance: 1000,
    tier: 'pro',
    monthlyAllocation: 5000,
    usedThisMonth: 0,
    resetDate: '2026-04-01T00:00:00Z',
    ...overrides,
  });
}

// ===========================================================================
// TokenWallet
// ===========================================================================

describe('TokenWallet', () => {
  let wallet: TokenWallet;

  beforeEach(() => {
    wallet = createWallet();
  });

  // -----------------------------------------------------------------------
  // Constructor & state
  // -----------------------------------------------------------------------

  describe('getState()', () => {
    it('should return the initial state with held = 0', () => {
      const state = wallet.getState();
      expect(state.id).toBe('w-test');
      expect(state.userId).toBe('u-test');
      expect(state.balance).toBe(1000);
      expect(state.held).toBe(0);
      expect(state.tier).toBe('pro');
      expect(state.monthlyAllocation).toBe(5000);
      expect(state.usedThisMonth).toBe(0);
    });

    it('should include orgId when provided', () => {
      const orgWallet = createWallet({ orgId: 'org-1' });
      expect(orgWallet.getState().orgId).toBe('org-1');
    });
  });

  describe('getBalance()', () => {
    it('should return full balance when nothing is held', () => {
      expect(wallet.getBalance()).toBe(1000);
    });

    it('should subtract held tokens from available balance', () => {
      wallet.hold(200, 'job-1', 'cloud-stt');
      expect(wallet.getBalance()).toBe(800);
    });
  });

  // -----------------------------------------------------------------------
  // Hold
  // -----------------------------------------------------------------------

  describe('hold()', () => {
    it('should place a hold and return a transaction', () => {
      const tx = wallet.hold(100, 'job-1', 'cloud-stt');
      expect(tx).not.toBeNull();
      expect(tx!.type).toBe('hold');
      expect(tx!.amount).toBe(100);
      expect(tx!.jobId).toBe('job-1');
      expect(tx!.category).toBe('cloud-stt');
    });

    it('should increase the held amount', () => {
      wallet.hold(100, 'job-1', 'cloud-stt');
      expect(wallet.getState().held).toBe(100);

      wallet.hold(200, 'job-2', 'cloud-analysis');
      expect(wallet.getState().held).toBe(300);
    });

    it('should return null when balance is insufficient', () => {
      const tx = wallet.hold(1500, 'job-1', 'cloud-stt');
      expect(tx).toBeNull();
      expect(wallet.getState().held).toBe(0);
    });

    it('should return null when available balance (balance - held) is insufficient', () => {
      wallet.hold(800, 'job-1', 'cloud-stt');
      const tx = wallet.hold(300, 'job-2', 'cloud-analysis');
      expect(tx).toBeNull();
    });

    it('should throw for duplicate jobId', () => {
      wallet.hold(100, 'job-1', 'cloud-stt');
      expect(() => wallet.hold(100, 'job-1', 'cloud-stt')).toThrow(
        'A hold already exists for job "job-1"',
      );
    });

    it('should throw for non-positive amount', () => {
      expect(() => wallet.hold(0, 'job-1', 'cloud-stt')).toThrow('positive');
      expect(() => wallet.hold(-10, 'job-2', 'cloud-stt')).toThrow('positive');
    });
  });

  // -----------------------------------------------------------------------
  // Settle
  // -----------------------------------------------------------------------

  describe('settle()', () => {
    it('should settle for the full held amount by default', () => {
      wallet.hold(100, 'job-1', 'cloud-stt');
      const tx = wallet.settle('job-1');

      expect(tx.type).toBe('debit');
      expect(tx.amount).toBe(100);
      expect(wallet.getState().balance).toBe(900);
      expect(wallet.getState().held).toBe(0);
      expect(wallet.getState().usedThisMonth).toBe(100);
    });

    it('should settle for a partial amount and refund the difference', () => {
      wallet.hold(200, 'job-1', 'cloud-stt');
      const tx = wallet.settle('job-1', 150);

      expect(tx.type).toBe('debit');
      expect(tx.amount).toBe(150);
      expect(wallet.getState().balance).toBe(850);
      expect(wallet.getState().held).toBe(0);

      // Should have a refund transaction
      const refunds = wallet.getTransactions({ type: 'refund' });
      expect(refunds.length).toBe(1);
      expect(refunds[0].amount).toBe(50);
    });

    it('should settle for zero and refund the entire hold', () => {
      wallet.hold(100, 'job-1', 'cloud-stt');
      const tx = wallet.settle('job-1', 0);

      expect(tx.amount).toBe(0);
      expect(wallet.getState().balance).toBe(1000);
      expect(wallet.getState().held).toBe(0);
    });

    it('should throw when no hold exists', () => {
      expect(() => wallet.settle('nonexistent')).toThrow('No active hold');
    });

    it('should throw for negative actual amount', () => {
      wallet.hold(100, 'job-1', 'cloud-stt');
      expect(() => wallet.settle('job-1', -10)).toThrow('negative');
    });
  });

  // -----------------------------------------------------------------------
  // Release
  // -----------------------------------------------------------------------

  describe('release()', () => {
    it('should release the hold without charging', () => {
      wallet.hold(200, 'job-1', 'cloud-stt');
      const tx = wallet.release('job-1');

      expect(tx.type).toBe('release');
      expect(tx.amount).toBe(200);
      expect(wallet.getState().balance).toBe(1000);
      expect(wallet.getState().held).toBe(0);
      expect(wallet.getState().usedThisMonth).toBe(0);
    });

    it('should throw when no hold exists', () => {
      expect(() => wallet.release('nonexistent')).toThrow('No active hold');
    });
  });

  // -----------------------------------------------------------------------
  // Refund
  // -----------------------------------------------------------------------

  describe('refund()', () => {
    it('should add tokens back to balance', () => {
      wallet.hold(100, 'job-1', 'cloud-stt');
      wallet.settle('job-1');
      // Balance is now 900, usedThisMonth = 100

      const tx = wallet.refund(50, 'job-1', 'Partial refund');
      expect(tx.type).toBe('refund');
      expect(tx.amount).toBe(50);
      expect(wallet.getState().balance).toBe(950);
      expect(wallet.getState().usedThisMonth).toBe(50);
    });

    it('should not let usedThisMonth go below zero', () => {
      const tx = wallet.refund(100, 'job-1', 'Overage refund');
      expect(wallet.getState().usedThisMonth).toBe(0);
    });

    it('should throw for non-positive amount', () => {
      expect(() => wallet.refund(0, 'job-1', 'bad')).toThrow('positive');
    });
  });

  // -----------------------------------------------------------------------
  // Credit
  // -----------------------------------------------------------------------

  describe('credit()', () => {
    it('should add tokens to the balance', () => {
      const tx = wallet.credit(500, 'Monthly top-up');
      expect(tx.type).toBe('credit');
      expect(tx.amount).toBe(500);
      expect(wallet.getState().balance).toBe(1500);
    });

    it('should throw for non-positive amount', () => {
      expect(() => wallet.credit(0, 'bad')).toThrow('positive');
    });
  });

  // -----------------------------------------------------------------------
  // Transaction queries
  // -----------------------------------------------------------------------

  describe('getTransactions()', () => {
    it('should return all transactions without filter', () => {
      wallet.hold(100, 'job-1', 'cloud-stt');
      wallet.settle('job-1');
      wallet.credit(50, 'bonus');

      const all = wallet.getTransactions();
      expect(all.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter by jobId', () => {
      wallet.hold(100, 'job-1', 'cloud-stt');
      wallet.hold(200, 'job-2', 'cloud-analysis');
      wallet.settle('job-1');

      const job1Txs = wallet.getTransactions({ jobId: 'job-1' });
      expect(job1Txs.every((tx) => tx.jobId === 'job-1')).toBe(true);
    });

    it('should filter by type', () => {
      wallet.hold(100, 'job-1', 'cloud-stt');
      wallet.settle('job-1');
      wallet.credit(50, 'bonus');

      const debits = wallet.getTransactions({ type: 'debit' });
      expect(debits.every((tx) => tx.type === 'debit')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Monthly limits
  // -----------------------------------------------------------------------

  describe('monthly limits', () => {
    it('should report monthly limit not reached initially', () => {
      expect(wallet.isMonthlyLimitReached()).toBe(false);
    });

    it('should report monthly limit reached when used equals allocation', () => {
      const fullWallet = createWallet({ usedThisMonth: 5000 });
      expect(fullWallet.isMonthlyLimitReached()).toBe(true);
    });

    it('should return correct remaining allowance', () => {
      expect(wallet.getRemainingMonthlyAllowance()).toBe(5000);

      wallet.hold(100, 'job-1', 'cloud-stt');
      wallet.settle('job-1');
      expect(wallet.getRemainingMonthlyAllowance()).toBe(4900);
    });

    it('should never return negative remaining allowance', () => {
      const overWallet = createWallet({ usedThisMonth: 6000 });
      expect(overWallet.getRemainingMonthlyAllowance()).toBe(0);
    });
  });
});

// ===========================================================================
// JobQuoter
// ===========================================================================

describe('JobQuoter', () => {
  let quoter: JobQuoter;

  beforeEach(() => {
    quoter = new JobQuoter();
  });

  // -----------------------------------------------------------------------
  // Quote by category
  // -----------------------------------------------------------------------

  describe('quote()', () => {
    it('should quote archive-reasoning at flat rate', () => {
      const q = quoter.quote('archive-reasoning');
      expect(q.estimatedTokens).toBe(50);
      expect(q.confidence).toBe('exact');
      expect(q.category).toBe('archive-reasoning');
    });

    it('should quote premium-translation per language', () => {
      const q = quoter.quote('premium-translation', {
        targetLanguages: ['fr', 'de', 'es'],
      });
      expect(q.estimatedTokens).toBe(300); // 100 * 3
      expect(q.breakdown['language_count']).toBe(3);
    });

    it('should quote premium-translation with long document surcharge', () => {
      const q = quoter.quote('premium-translation', {
        targetLanguages: ['fr'],
        wordCount: 25000,
      });
      // Base: 100 + surcharge: ceil(25000/10000)*20 = 3*20 = 60
      expect(q.estimatedTokens).toBe(160);
      expect(q.warnings.length).toBeGreaterThan(0);
    });

    it('should quote reference-dubbing per language', () => {
      const q = quoter.quote('reference-dubbing', {
        targetLanguages: ['fr', 'de'],
      });
      expect(q.estimatedTokens).toBe(400); // 200 * 2
    });

    it('should quote reference-dubbing with long duration surcharge', () => {
      const q = quoter.quote('reference-dubbing', {
        targetLanguages: ['fr'],
        durationSeconds: 900, // 15 minutes
      });
      // Base: 200 + surcharge: (15 - 10) * 15 = 75
      expect(q.estimatedTokens).toBe(275);
    });

    it('should quote cloud-stt per minute', () => {
      const q = quoter.quote('cloud-stt', { durationSeconds: 180 });
      expect(q.estimatedTokens).toBe(75); // 25 * 3 minutes
      expect(q.confidence).toBe('exact');
    });

    it('should quote cloud-stt with upper-bound when no duration', () => {
      const q = quoter.quote('cloud-stt');
      expect(q.estimatedTokens).toBe(125); // 25 * 5 assumed minutes
      expect(q.confidence).toBe('upper-bound');
    });

    it('should quote generative-motion per clip', () => {
      const q = quoter.quote('generative-motion', { clipCount: 3 });
      expect(q.estimatedTokens).toBe(900); // 300 * 3
    });

    it('should apply resolution multiplier for generative effects', () => {
      const q = quoter.quote('generative-effects', {
        clipCount: 2,
        resolution: '4K',
      });
      // 250 * 2 * 2.0 = 1000
      expect(q.estimatedTokens).toBe(1000);
    });

    it('should quote premium-publish per platform', () => {
      const q = quoter.quote('premium-publish', {
        targetLanguages: ['youtube', 'vimeo', 'tiktok'],
      });
      expect(q.estimatedTokens).toBe(225); // 75 * 3
    });

    it('should quote temp-music-gen at flat rate', () => {
      const q = quoter.quote('temp-music-gen');
      expect(q.estimatedTokens).toBe(150);
    });

    it('should quote cloud-analysis at flat rate', () => {
      const q = quoter.quote('cloud-analysis');
      expect(q.estimatedTokens).toBe(40);
    });

    it('should include a valid expiration timestamp', () => {
      const q = quoter.quote('archive-reasoning');
      const expiresAt = new Date(q.expiresAt).getTime();
      expect(expiresAt).toBeGreaterThan(Date.now());
    });

    it('should generate unique jobIds', () => {
      const q1 = quoter.quote('archive-reasoning');
      const q2 = quoter.quote('archive-reasoning');
      expect(q1.jobId).not.toBe(q2.jobId);
    });
  });

  // -----------------------------------------------------------------------
  // Pricing overrides
  // -----------------------------------------------------------------------

  describe('pricing overrides', () => {
    it('should use custom pricing when provided', () => {
      const custom = new JobQuoter({ 'cloud-stt': 50 });
      const q = custom.quote('cloud-stt', { durationSeconds: 60 });
      expect(q.estimatedTokens).toBe(50); // 50 * 1 minute
    });

    it('should fall back to defaults for unoverridden categories', () => {
      const custom = new JobQuoter({ 'cloud-stt': 50 });
      const q = custom.quote('archive-reasoning');
      expect(q.estimatedTokens).toBe(50); // default unchanged
    });
  });

  // -----------------------------------------------------------------------
  // Default pricing
  // -----------------------------------------------------------------------

  describe('getDefaultPricing()', () => {
    it('should return all categories', () => {
      const pricing = quoter.getDefaultPricing();
      const categories = getAllCategories();
      for (const cat of categories) {
        expect(pricing[cat]).toBeDefined();
      }
    });
  });

  // -----------------------------------------------------------------------
  // Plan estimation
  // -----------------------------------------------------------------------

  describe('estimateForPlan()', () => {
    it('should sum costs for token-consuming tools', () => {
      const q = quoter.estimateForPlan({
        steps: [
          { toolName: 'cloud_transcribe' },
          { toolName: 'premium_translate' },
          { toolName: 'splice_in' }, // free tool
        ],
      });
      // cloud_transcribe -> cloud-stt (25) + premium_translate -> premium-translation (100)
      expect(q.estimatedTokens).toBe(125);
    });

    it('should return zero for plans with only free tools', () => {
      const q = quoter.estimateForPlan({
        steps: [
          { toolName: 'splice_in' },
          { toolName: 'lift' },
          { toolName: 'add_marker' },
        ],
      });
      expect(q.estimatedTokens).toBe(0);
      expect(q.warnings.length).toBeGreaterThan(0);
    });

    it('should handle empty plans', () => {
      const q = quoter.estimateForPlan({ steps: [] });
      expect(q.estimatedTokens).toBe(0);
    });
  });
});

// ===========================================================================
// MeteringService
// ===========================================================================

describe('MeteringService', () => {
  let wallet: TokenWallet;
  let quoter: JobQuoter;
  let metering: MeteringService;

  beforeEach(() => {
    wallet = createWallet();
    quoter = new JobQuoter();
    metering = new MeteringService(wallet, quoter);
  });

  // -----------------------------------------------------------------------
  // Start job
  // -----------------------------------------------------------------------

  describe('startJob()', () => {
    it('should create a quote and hold tokens', () => {
      const { quote, holdTransaction } = metering.startJob('cloud-stt', {
        durationSeconds: 120,
      });

      expect(quote.category).toBe('cloud-stt');
      expect(quote.estimatedTokens).toBe(50); // 25 * 2 minutes
      expect(holdTransaction).not.toBeNull();
      expect(holdTransaction!.type).toBe('hold');
      expect(wallet.getState().held).toBe(50);
    });

    it('should return null holdTransaction when balance is insufficient', () => {
      const lowWallet = createWallet({ balance: 10 });
      const lowMetering = new MeteringService(lowWallet, quoter);

      const { quote, holdTransaction } = lowMetering.startJob('generative-motion', {
        clipCount: 5,
      });

      expect(quote.estimatedTokens).toBeGreaterThan(10);
      expect(holdTransaction).toBeNull();
    });

    it('should track the job as active', () => {
      metering.startJob('cloud-stt', { durationSeconds: 60 });
      expect(metering.getActiveJobs().length).toBe(1);
    });

    it('should not track jobs that failed to hold', () => {
      const lowWallet = createWallet({ balance: 10 });
      const lowMetering = new MeteringService(lowWallet, quoter);
      lowMetering.startJob('generative-motion', { clipCount: 5 });
      expect(lowMetering.getActiveJobs().length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Complete job
  // -----------------------------------------------------------------------

  describe('completeJob()', () => {
    it('should settle the hold and record completion', () => {
      const { quote } = metering.startJob('cloud-stt', { durationSeconds: 60 });
      const tx = metering.completeJob(quote.jobId, 20);

      expect(tx.type).toBe('debit');
      expect(tx.amount).toBe(20);
      expect(metering.getActiveJobs().length).toBe(0);
      expect(metering.getCompletedJobs().length).toBe(1);
      expect(metering.getCompletedJobs()[0].status).toBe('completed');
      expect(metering.getCompletedJobs()[0].actualTokens).toBe(20);
    });

    it('should use estimated amount when actual is not provided', () => {
      const { quote } = metering.startJob('archive-reasoning');
      metering.completeJob(quote.jobId);

      expect(metering.getCompletedJobs()[0].actualTokens).toBe(50);
    });

    it('should throw for unknown job', () => {
      expect(() => metering.completeJob('nonexistent')).toThrow('No active job');
    });
  });

  // -----------------------------------------------------------------------
  // Fail job
  // -----------------------------------------------------------------------

  describe('failJob()', () => {
    it('should release the hold and record failure', () => {
      const { quote } = metering.startJob('cloud-stt', { durationSeconds: 60 });
      const balanceBefore = wallet.getBalance();

      // Hold has reduced available balance
      expect(wallet.getBalance()).toBeLessThan(1000);

      const tx = metering.failJob(quote.jobId);

      expect(tx.type).toBe('release');
      expect(wallet.getState().held).toBe(0);
      expect(wallet.getBalance()).toBe(1000); // fully restored
      expect(metering.getCompletedJobs()[0].status).toBe('failed');
      expect(metering.getCompletedJobs()[0].actualTokens).toBe(0);
    });

    it('should throw for unknown job', () => {
      expect(() => metering.failJob('nonexistent')).toThrow('No active job');
    });
  });

  // -----------------------------------------------------------------------
  // Usage queries
  // -----------------------------------------------------------------------

  describe('getUsageByCategory()', () => {
    it('should aggregate usage by category', () => {
      const { quote: q1 } = metering.startJob('cloud-stt', { durationSeconds: 60 });
      metering.completeJob(q1.jobId, 20);

      const { quote: q2 } = metering.startJob('cloud-stt', { durationSeconds: 120 });
      metering.completeJob(q2.jobId, 30);

      const { quote: q3 } = metering.startJob('archive-reasoning');
      metering.completeJob(q3.jobId, 50);

      const usage = metering.getUsageByCategory();
      expect(usage['cloud-stt'].total).toBe(50);
      expect(usage['cloud-stt'].count).toBe(2);
      expect(usage['archive-reasoning'].total).toBe(50);
      expect(usage['archive-reasoning'].count).toBe(1);
    });

    it('should exclude failed jobs from category usage', () => {
      const { quote } = metering.startJob('cloud-stt', { durationSeconds: 60 });
      metering.failJob(quote.jobId);

      const usage = metering.getUsageByCategory();
      expect(usage['cloud-stt']).toBeUndefined();
    });
  });

  describe('getUsageSummary()', () => {
    it('should produce a correct summary', () => {
      const { quote: q1 } = metering.startJob('cloud-stt', { durationSeconds: 60 });
      metering.completeJob(q1.jobId, 20);

      const { quote: q2 } = metering.startJob('archive-reasoning');
      // q2 is still active

      const summary = metering.getUsageSummary();
      expect(summary.totalConsumed).toBe(20);
      expect(summary.totalHeld).toBeGreaterThan(0);
      expect(summary.jobCount).toBe(2); // 1 completed + 1 active
      expect(summary.categoryBreakdown['cloud-stt']).toBe(20);
    });
  });
});

// ===========================================================================
// EntitlementChecker
// ===========================================================================

describe('EntitlementChecker', () => {
  // -----------------------------------------------------------------------
  // Free tier
  // -----------------------------------------------------------------------

  describe('free tier', () => {
    const checker = new EntitlementChecker('free');

    it('should be entitled to seat features', () => {
      expect(checker.isEntitled('basic-editing')).toBe(true);
      expect(checker.isEntitled('ai-assistant')).toBe(true);
      expect(checker.isEntitled('local-stt')).toBe(true);
      expect(checker.isEntitled('local-embedding')).toBe(true);
    });

    it('should not be entitled to pro features', () => {
      expect(checker.isEntitled('archive-reasoning')).toBe(false);
      expect(checker.isEntitled('premium-translation')).toBe(false);
      expect(checker.isEntitled('cloud-stt')).toBe(false);
    });

    it('should not be entitled to enterprise features', () => {
      expect(checker.isEntitled('reference-dubbing')).toBe(false);
      expect(checker.isEntitled('generative-motion')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Pro tier
  // -----------------------------------------------------------------------

  describe('pro tier', () => {
    const checker = new EntitlementChecker('pro');

    it('should be entitled to free and pro features', () => {
      expect(checker.isEntitled('basic-editing')).toBe(true);
      expect(checker.isEntitled('archive-reasoning')).toBe(true);
      expect(checker.isEntitled('premium-translation')).toBe(true);
      expect(checker.isEntitled('cloud-stt')).toBe(true);
      expect(checker.isEntitled('premium-publish')).toBe(true);
    });

    it('should not be entitled to enterprise features', () => {
      expect(checker.isEntitled('reference-dubbing')).toBe(false);
      expect(checker.isEntitled('generative-motion')).toBe(false);
      expect(checker.isEntitled('generative-effects')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Enterprise tier
  // -----------------------------------------------------------------------

  describe('enterprise tier', () => {
    const checker = new EntitlementChecker('enterprise');

    it('should be entitled to all features', () => {
      const allFeatures = checker.listFeatures();
      for (const feature of allFeatures) {
        expect(checker.isEntitled(feature.id)).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Token cost lookup
  // -----------------------------------------------------------------------

  describe('requiresTokens()', () => {
    const checker = new EntitlementChecker('pro');

    it('should return true for token features', () => {
      expect(checker.requiresTokens('archive-reasoning')).toBe(true);
      expect(checker.requiresTokens('premium-translation')).toBe(true);
      expect(checker.requiresTokens('cloud-stt')).toBe(true);
    });

    it('should return false for seat features', () => {
      expect(checker.requiresTokens('basic-editing')).toBe(false);
      expect(checker.requiresTokens('ai-assistant')).toBe(false);
      expect(checker.requiresTokens('local-stt')).toBe(false);
    });

    it('should return false for unknown features', () => {
      expect(checker.requiresTokens('nonexistent')).toBe(false);
    });
  });

  describe('getTokenCost()', () => {
    const checker = new EntitlementChecker('pro');

    it('should return the per-use cost for token features', () => {
      expect(checker.getTokenCost('archive-reasoning')).toBe(50);
      expect(checker.getTokenCost('premium-translation')).toBe(100);
      expect(checker.getTokenCost('cloud-stt')).toBe(25);
    });

    it('should return null for seat features', () => {
      expect(checker.getTokenCost('basic-editing')).toBeNull();
    });

    it('should return null for unknown features', () => {
      expect(checker.getTokenCost('nonexistent')).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Feature listing
  // -----------------------------------------------------------------------

  describe('listFeatures()', () => {
    it('should return all 13 pre-registered features', () => {
      const checker = new EntitlementChecker('free');
      expect(checker.listFeatures().length).toBe(13);
    });
  });

  describe('listAvailableFeatures()', () => {
    it('should return only free features for free tier', () => {
      const checker = new EntitlementChecker('free');
      const available = checker.listAvailableFeatures();
      expect(available.length).toBe(4); // 4 seat features
      expect(available.every((f) => f.tier === 'free')).toBe(true);
    });

    it('should return free + pro features for pro tier', () => {
      const checker = new EntitlementChecker('pro');
      const available = checker.listAvailableFeatures();
      expect(available.length).toBe(10); // 4 free + 6 pro
    });

    it('should return all features for enterprise tier', () => {
      const checker = new EntitlementChecker('enterprise');
      const available = checker.listAvailableFeatures();
      expect(available.length).toBe(13);
    });
  });

  describe('getFeature()', () => {
    it('should return the feature definition', () => {
      const checker = new EntitlementChecker('pro');
      const feature = checker.getFeature('cloud-stt');
      expect(feature).toBeDefined();
      expect(feature!.name).toBe('Cloud Speech-to-Text');
      expect(feature!.type).toBe('token');
    });

    it('should return undefined for unknown features', () => {
      const checker = new EntitlementChecker('pro');
      expect(checker.getFeature('nonexistent')).toBeUndefined();
    });
  });
});

// ===========================================================================
// ConsumptionCategories
// ===========================================================================

describe('ConsumptionCategories', () => {
  describe('CATEGORY_DEFINITIONS', () => {
    it('should define all 9 categories', () => {
      expect(Object.keys(CATEGORY_DEFINITIONS).length).toBe(9);
    });

    it('should have valid baseRate for every category', () => {
      for (const def of Object.values(CATEGORY_DEFINITIONS)) {
        expect(def.baseRate).toBeGreaterThan(0);
      }
    });
  });

  describe('getAllCategories()', () => {
    it('should return 9 category identifiers', () => {
      expect(getAllCategories().length).toBe(9);
    });
  });

  describe('getCategoryDefinition()', () => {
    it('should return a definition for a valid category', () => {
      const def = getCategoryDefinition('cloud-stt');
      expect(def).toBeDefined();
      expect(def!.baseRate).toBe(25);
    });
  });

  describe('isTierSufficient()', () => {
    it('should return true when tier is >= minTier', () => {
      expect(isTierSufficient('archive-reasoning', 'pro')).toBe(true);
      expect(isTierSufficient('archive-reasoning', 'enterprise')).toBe(true);
    });

    it('should return false when tier is < minTier', () => {
      expect(isTierSufficient('archive-reasoning', 'free')).toBe(false);
      expect(isTierSufficient('generative-motion', 'pro')).toBe(false);
    });
  });

  describe('getDefaultPricingMap()', () => {
    it('should return a pricing entry for every category', () => {
      const pricing = getDefaultPricingMap();
      const categories = getAllCategories();
      for (const cat of categories) {
        expect(typeof pricing[cat]).toBe('number');
      }
    });
  });
});

// ===========================================================================
// AdminView
// ===========================================================================

describe('AdminView', () => {
  let wallet: TokenWallet;
  let quoter: JobQuoter;
  let metering: MeteringService;
  let entitlements: EntitlementChecker;
  let admin: AdminView;

  beforeEach(() => {
    wallet = createWallet();
    quoter = new JobQuoter();
    metering = new MeteringService(wallet, quoter);
    entitlements = new EntitlementChecker('pro');
    admin = new AdminView(wallet, metering, entitlements);
  });

  describe('getWalletSummary()', () => {
    it('should produce a complete summary', () => {
      const { quote } = metering.startJob('cloud-stt', { durationSeconds: 60 });
      metering.completeJob(quote.jobId, 20);

      const summary = admin.getWalletSummary();
      expect(summary.walletId).toBe('w-test');
      expect(summary.tier).toBe('pro');
      expect(summary.balance).toBe(980);
      expect(summary.usedThisMonth).toBe(20);
      expect(summary.completedJobCount).toBe(1);
      expect(summary.availableFeatureCount).toBe(10);
    });
  });

  describe('getUsageReport()', () => {
    it('should return a usage report for all time', () => {
      const { quote: q1 } = metering.startJob('cloud-stt', { durationSeconds: 60 });
      metering.completeJob(q1.jobId, 25);

      const report = admin.getUsageReport();
      expect(report.totalTokens).toBe(25);
      expect(report.jobCount).toBe(1);
      expect(report.categories['cloud-stt']).toBeDefined();
      expect(report.categories['cloud-stt'].totalTokens).toBe(25);
    });
  });

  describe('getAuditLog()', () => {
    it('should return all wallet transactions as audit entries', () => {
      const { quote } = metering.startJob('cloud-stt', { durationSeconds: 60 });
      metering.completeJob(quote.jobId, 20);

      const log = admin.getAuditLog();
      expect(log.length).toBeGreaterThanOrEqual(2); // hold + debit (+ possible refund)
      expect(log[0].transactionId).toBeDefined();
      expect(log[0].timestamp).toBeDefined();
    });
  });

  describe('getTopCategories()', () => {
    it('should return categories sorted by consumption descending', () => {
      const { quote: q1 } = metering.startJob('cloud-stt', { durationSeconds: 60 });
      metering.completeJob(q1.jobId, 20);

      const { quote: q2 } = metering.startJob('archive-reasoning');
      metering.completeJob(q2.jobId, 50);

      const top = admin.getTopCategories(5);
      expect(top.length).toBe(2);
      expect(top[0].category).toBe('archive-reasoning');
      expect(top[0].totalTokens).toBe(50);
      expect(top[1].category).toBe('cloud-stt');
      expect(top[1].totalTokens).toBe(20);
    });
  });

  describe('exportReport()', () => {
    it('should return valid JSON', () => {
      const json = admin.exportReport();
      const parsed = JSON.parse(json);
      expect(parsed.exportedAt).toBeDefined();
      expect(parsed.walletSummary).toBeDefined();
      expect(parsed.usageReport).toBeDefined();
      expect(parsed.auditLog).toBeDefined();
      expect(parsed.topCategories).toBeDefined();
    });
  });
});

// ===========================================================================
// Integration: full quote -> hold -> execute -> settle
// ===========================================================================

describe('Integration: quote-hold-settle flow', () => {
  it('should complete the full lifecycle successfully', () => {
    // Setup
    const wallet = createWallet({ balance: 500, tier: 'enterprise' });
    const quoter = new JobQuoter();
    const metering = new MeteringService(wallet, quoter);
    const entitlements = new EntitlementChecker('enterprise');

    // 1. Check entitlement
    expect(entitlements.isEntitled('reference-dubbing')).toBe(true);
    expect(entitlements.requiresTokens('reference-dubbing')).toBe(true);

    // 2. Start job (quote + hold)
    const { quote, holdTransaction } = metering.startJob('reference-dubbing', {
      targetLanguages: ['fr'],
      durationSeconds: 300, // 5 minutes
    });

    expect(holdTransaction).not.toBeNull();
    expect(quote.estimatedTokens).toBe(200); // 200 base for 1 language, <= 10 min
    expect(wallet.getBalance()).toBe(300); // 500 - 200 held
    expect(metering.getActiveJobs().length).toBe(1);

    // 3. Complete job with actual usage
    const tx = metering.completeJob(quote.jobId, 180);
    expect(tx.type).toBe('debit');
    expect(tx.amount).toBe(180);

    // 4. Verify final state
    expect(wallet.getState().balance).toBe(320); // 500 - 180
    expect(wallet.getState().held).toBe(0);
    expect(wallet.getState().usedThisMonth).toBe(180);
    expect(wallet.getBalance()).toBe(320);
    expect(metering.getActiveJobs().length).toBe(0);
    expect(metering.getCompletedJobs().length).toBe(1);

    // 5. Verify admin view
    const admin = new AdminView(wallet, metering, entitlements);
    const summary = admin.getWalletSummary();
    expect(summary.balance).toBe(320);
    expect(summary.usedThisMonth).toBe(180);
    expect(summary.completedJobCount).toBe(1);
  });

  it('should handle insufficient balance gracefully', () => {
    const wallet = createWallet({ balance: 30 });
    const quoter = new JobQuoter();
    const metering = new MeteringService(wallet, quoter);

    // Try to start a job that costs more than available
    const { quote, holdTransaction } = metering.startJob('generative-motion', {
      clipCount: 2,
    });

    // Quote is generated but hold fails
    expect(quote.estimatedTokens).toBe(600); // 300 * 2
    expect(holdTransaction).toBeNull();
    expect(wallet.getState().held).toBe(0);
    expect(wallet.getBalance()).toBe(30); // unchanged
    expect(metering.getActiveJobs().length).toBe(0);
  });

  it('should handle job failure with full hold release', () => {
    const wallet = createWallet({ balance: 500 });
    const quoter = new JobQuoter();
    const metering = new MeteringService(wallet, quoter);

    const { quote, holdTransaction } = metering.startJob('temp-music-gen');
    expect(holdTransaction).not.toBeNull();
    expect(wallet.getBalance()).toBe(350); // 500 - 150

    // Job fails
    metering.failJob(quote.jobId);

    // Full balance restored
    expect(wallet.getBalance()).toBe(500);
    expect(wallet.getState().held).toBe(0);
    expect(wallet.getState().usedThisMonth).toBe(0);
  });

  it('should handle multiple concurrent jobs', () => {
    const wallet = createWallet({ balance: 1000 });
    const quoter = new JobQuoter();
    const metering = new MeteringService(wallet, quoter);

    // Start 3 jobs
    const { quote: q1 } = metering.startJob('cloud-stt', { durationSeconds: 120 });
    const { quote: q2 } = metering.startJob('archive-reasoning');
    const { quote: q3 } = metering.startJob('cloud-analysis');

    expect(metering.getActiveJobs().length).toBe(3);

    // Complete them in different order
    metering.completeJob(q2.jobId, 40);
    metering.failJob(q3.jobId);
    metering.completeJob(q1.jobId, 45);

    expect(metering.getActiveJobs().length).toBe(0);
    expect(metering.getCompletedJobs().length).toBe(3);

    // Usage should only count completed jobs
    const usage = metering.getUsageByCategory();
    expect(usage['cloud-stt'].total).toBe(45);
    expect(usage['archive-reasoning'].total).toBe(40);
    expect(usage['cloud-analysis']).toBeUndefined(); // failed job
  });

  it('should support post-completion refund', () => {
    const wallet = createWallet({ balance: 500 });
    const quoter = new JobQuoter();
    const metering = new MeteringService(wallet, quoter);

    const { quote } = metering.startJob('premium-translation', {
      targetLanguages: ['fr'],
    });
    metering.completeJob(quote.jobId, 100);

    expect(wallet.getState().balance).toBe(400);
    expect(wallet.getState().usedThisMonth).toBe(100);

    // Issue a manual refund
    wallet.refund(50, quote.jobId, 'Quality issue');

    expect(wallet.getState().balance).toBe(450);
    expect(wallet.getState().usedThisMonth).toBe(50);
  });
});
