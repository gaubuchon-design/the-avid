/**
 * @module lease-loss.test
 *
 * Reliability tests for shard lease lifecycle scenarios. Verifies that
 * lease acquisition, expiration, renewal, and contention behave
 * correctly under various failure conditions.
 *
 * Uses the ShardLeaseManager directly with short TTLs to simulate
 * lease expiration without excessive wall-clock waits.
 */

import { describe, it, expect } from 'vitest';
import { ShardLeaseManager } from '../../mesh/ShardLeaseManager.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Wait for a specified number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Lease Loss Reliability', () => {

  // ── Lease Expires While Holder Is Offline ──────────────────────────────

  it('should allow another node to acquire after lease expiration', async () => {
    // Use a very short lease TTL (100ms) to test expiration quickly
    const leaseManager = new ShardLeaseManager(100);

    // Node A acquires the lease
    const leaseA = leaseManager.acquireLease('shard-1', 'node-a');
    expect(leaseA).not.toBeNull();
    expect(leaseA!.holderId).toBe('node-a');
    expect(leaseA!.shardId).toBe('shard-1');

    // Node B tries immediately — should be rejected
    const attemptB1 = leaseManager.acquireLease('shard-1', 'node-b');
    expect(attemptB1).toBeNull();

    // Verify node A is still the holder
    expect(leaseManager.isLeaseHolder('shard-1', 'node-a')).toBe(true);
    expect(leaseManager.isLeaseHolder('shard-1', 'node-b')).toBe(false);

    // Wait for the lease to expire (simulates node A going offline)
    await sleep(150);

    // Node A's lease should now be expired
    expect(leaseManager.isLeaseHolder('shard-1', 'node-a')).toBe(false);

    // Node B should now be able to acquire
    const leaseB = leaseManager.acquireLease('shard-1', 'node-b');
    expect(leaseB).not.toBeNull();
    expect(leaseB!.holderId).toBe('node-b');

    // Verify the old lease is gone
    expect(leaseManager.isLeaseHolder('shard-1', 'node-a')).toBe(false);
    expect(leaseManager.isLeaseHolder('shard-1', 'node-b')).toBe(true);
  });

  // ── Multiple Nodes Race for the Same Lease ────────────────────────────

  it('should grant exactly one winner when multiple nodes race for a lease', () => {
    const leaseManager = new ShardLeaseManager(30_000); // Long TTL, no expiration during test

    const nodeIds = ['racer-1', 'racer-2', 'racer-3', 'racer-4', 'racer-5'];
    const results: Array<{ nodeId: string; success: boolean }> = [];

    // All nodes try to acquire the same shard simultaneously
    for (const nodeId of nodeIds) {
      const lease = leaseManager.acquireLease('contested-shard', nodeId);
      results.push({ nodeId, success: lease !== null });
    }

    // Exactly one node should have won
    const winners = results.filter((r) => r.success);
    const losers = results.filter((r) => !r.success);

    expect(winners.length).toBe(1);
    expect(losers.length).toBe(4);

    // The winner should be the first one (racer-1) since Node.js is single-threaded
    expect(winners[0]!.nodeId).toBe('racer-1');

    // Verify that the winner is indeed the lease holder
    const currentLease = leaseManager.getLease('contested-shard');
    expect(currentLease).not.toBeNull();
    expect(currentLease!.holderId).toBe(winners[0]!.nodeId);

    // None of the losers should be the holder
    for (const loser of losers) {
      expect(leaseManager.isLeaseHolder('contested-shard', loser.nodeId)).toBe(false);
    }
  });

  // ── Multiple Shards, Multiple Nodes ───────────────────────────────────

  it('should handle concurrent leases across multiple shards', () => {
    const leaseManager = new ShardLeaseManager(30_000);
    const shardIds = ['shard-a', 'shard-b', 'shard-c', 'shard-d'];
    const nodeIds = ['node-x', 'node-y', 'node-z'];

    // Each node acquires a different shard
    const leaseX = leaseManager.acquireLease('shard-a', 'node-x');
    const leaseY = leaseManager.acquireLease('shard-b', 'node-y');
    const leaseZ = leaseManager.acquireLease('shard-c', 'node-z');

    expect(leaseX).not.toBeNull();
    expect(leaseY).not.toBeNull();
    expect(leaseZ).not.toBeNull();

    // Each node holds exactly the shard it acquired
    expect(leaseManager.isLeaseHolder('shard-a', 'node-x')).toBe(true);
    expect(leaseManager.isLeaseHolder('shard-b', 'node-y')).toBe(true);
    expect(leaseManager.isLeaseHolder('shard-c', 'node-z')).toBe(true);

    // Cross-checks: nodes do not hold each other's shards
    expect(leaseManager.isLeaseHolder('shard-a', 'node-y')).toBe(false);
    expect(leaseManager.isLeaseHolder('shard-b', 'node-x')).toBe(false);

    // Uncontested shard is available to anyone
    const leaseD = leaseManager.acquireLease('shard-d', 'node-x');
    expect(leaseD).not.toBeNull();
    expect(leaseManager.isLeaseHolder('shard-d', 'node-x')).toBe(true);
  });

  // ── Lease Renewal Keeps the Lease Alive ───────────────────────────────

  it('should keep lease alive through timely renewals', async () => {
    const leaseManager = new ShardLeaseManager(200); // 200ms TTL

    // Acquire
    const initial = leaseManager.acquireLease('renew-shard', 'node-renewer');
    expect(initial).not.toBeNull();
    expect(initial!.renewalCount).toBe(0);

    // Renew before expiration (at 100ms)
    await sleep(100);
    const renewed1 = leaseManager.renewLease('renew-shard', 'node-renewer');
    expect(renewed1).not.toBeNull();
    expect(renewed1!.renewalCount).toBe(1);
    expect(leaseManager.isLeaseHolder('renew-shard', 'node-renewer')).toBe(true);

    // Renew again (at 200ms from start, but within renewal window)
    await sleep(100);
    const renewed2 = leaseManager.renewLease('renew-shard', 'node-renewer');
    expect(renewed2).not.toBeNull();
    expect(renewed2!.renewalCount).toBe(2);

    // The original acquire time should be preserved
    expect(renewed2!.acquiredAt).toBe(initial!.acquiredAt);

    // But the expiry should have been extended
    expect(new Date(renewed2!.expiresAt).getTime())
      .toBeGreaterThan(new Date(initial!.expiresAt).getTime());

    // A competing node still cannot acquire
    const competitor = leaseManager.acquireLease('renew-shard', 'node-intruder');
    expect(competitor).toBeNull();

    // Wait for the renewed lease to expire without further renewal
    await sleep(250);

    // Now the lease should be expired
    expect(leaseManager.isLeaseHolder('renew-shard', 'node-renewer')).toBe(false);

    // And a new node can acquire
    const newHolder = leaseManager.acquireLease('renew-shard', 'node-intruder');
    expect(newHolder).not.toBeNull();
    expect(newHolder!.holderId).toBe('node-intruder');
  });

  // ── Only Holder Can Renew ─────────────────────────────────────────────

  it('should reject renewal from non-holders', () => {
    const leaseManager = new ShardLeaseManager(30_000);

    leaseManager.acquireLease('holder-shard', 'real-holder');

    // Non-holder cannot renew
    const fake = leaseManager.renewLease('holder-shard', 'impersonator');
    expect(fake).toBeNull();

    // Real holder can still renew
    const legit = leaseManager.renewLease('holder-shard', 'real-holder');
    expect(legit).not.toBeNull();
    expect(legit!.holderId).toBe('real-holder');
  });

  // ── Release and Reacquire ─────────────────────────────────────────────

  it('should allow immediate reacquire after voluntary release', () => {
    const leaseManager = new ShardLeaseManager(30_000);

    // Acquire
    leaseManager.acquireLease('release-shard', 'holder-a');
    expect(leaseManager.isLeaseHolder('release-shard', 'holder-a')).toBe(true);

    // Another node cannot acquire
    expect(leaseManager.acquireLease('release-shard', 'holder-b')).toBeNull();

    // Release
    const released = leaseManager.releaseLease('release-shard', 'holder-a');
    expect(released).toBe(true);

    // Now another node can immediately acquire
    const newLease = leaseManager.acquireLease('release-shard', 'holder-b');
    expect(newLease).not.toBeNull();
    expect(newLease!.holderId).toBe('holder-b');
  });

  // ── Cleanup Removes Expired Leases ────────────────────────────────────

  it('should remove expired leases during cleanup sweep', async () => {
    const leaseManager = new ShardLeaseManager(50); // Very short TTL

    // Acquire multiple leases
    leaseManager.acquireLease('cleanup-1', 'node-1');
    leaseManager.acquireLease('cleanup-2', 'node-2');
    leaseManager.acquireLease('cleanup-3', 'node-3');

    // Wait for all to expire
    await sleep(100);

    // All should be expired
    const expired = leaseManager.getExpiredLeases();
    expect(expired.length).toBe(3);

    // Run cleanup
    const removed = leaseManager.cleanup();
    expect(removed).toBe(3);

    // No more expired leases
    expect(leaseManager.getExpiredLeases().length).toBe(0);

    // All shards are now available
    expect(leaseManager.getLease('cleanup-1')).toBeNull();
    expect(leaseManager.getLease('cleanup-2')).toBeNull();
    expect(leaseManager.getLease('cleanup-3')).toBeNull();
  });

  // ── Re-acquisition by Same Node (Idempotent) ─────────────────────────

  it('should treat re-acquisition by the same node as a renewal', () => {
    const leaseManager = new ShardLeaseManager(30_000);

    const first = leaseManager.acquireLease('idem-shard', 'node-idem');
    expect(first).not.toBeNull();

    // Same node acquires again — should behave like renewal
    const second = leaseManager.acquireLease('idem-shard', 'node-idem');
    expect(second).not.toBeNull();
    expect(second!.holderId).toBe('node-idem');
    expect(second!.renewalCount).toBe(1); // Incremented because it renewed
  });
});
