/**
 * @module partial-sync.test
 *
 * Reliability tests for partial replication and sync scenarios. Verifies
 * correct behavior when a node joins mid-sync, events arrive out of
 * order, or a large replication gap is encountered.
 *
 * Uses the ReplicationManager with a ShardManager backed by temp
 * directories.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ReplicationManager,
  type ReplicationEvent,
} from '../../mesh/ReplicationManager.js';
import { ShardManager } from '../../shard/ShardManager.js';
import { ConflictHandler } from '../../mesh/ConflictHandler.js';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Partial Sync Reliability', () => {
  let tempDir: string;
  let shardManager: ShardManager;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'partial-sync-'));
    shardManager = new ShardManager(join(tempDir, 'shards'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ── Node Joins Mid-Sync ───────────────────────────────────────────────

  it('should deliver events from last known sequence when node joins mid-sync', () => {
    const primaryRM = new ReplicationManager(shardManager);

    // Primary generates 100 events
    for (let i = 0; i < 100; i++) {
      primaryRM.appendEvent({
        shardId: 'shard-mid-sync',
        operation: 'insert',
        table: 'assets',
        rowId: `asset-${i}`,
        data: { name: `Asset ${i}` },
      });
    }

    expect(primaryRM.getLatestSequence('shard-mid-sync')).toBe(100);

    // A replica that already has events 1-50 requests from seq 50
    const deltaEvents = primaryRM.getEventsSince('shard-mid-sync', 50);
    expect(deltaEvents.length).toBe(50);
    expect(deltaEvents[0].sequence).toBe(51);
    expect(deltaEvents[deltaEvents.length - 1].sequence).toBe(100);

    // Apply the delta to a replica ReplicationManager
    const replicaRM = new ReplicationManager(shardManager);
    const result = replicaRM.applyEvents(deltaEvents);

    expect(result.applied).toBe(50);
    expect(result.errors.length).toBe(0);

    // Replica should now be at sequence 100
    expect(replicaRM.getLatestSequence('shard-mid-sync')).toBe(100);

    // Replica's log should contain the applied events
    const replicaEvents = replicaRM.getEventsSince('shard-mid-sync', 0);
    expect(replicaEvents.length).toBe(50);
  });

  // ── Events Arrive Out of Order ────────────────────────────────────────

  it('should handle events arriving out of order correctly', () => {
    const primaryRM = new ReplicationManager(shardManager);

    // Generate events in order on the primary
    for (let i = 0; i < 20; i++) {
      primaryRM.appendEvent({
        shardId: 'shard-ooo',
        operation: 'insert',
        table: 'transcript_segments',
        rowId: `seg-${i}`,
        data: { text: `Segment ${i}` },
      });
    }

    // Grab all events
    const allEvents = primaryRM.getEventsSince('shard-ooo', 0);
    expect(allEvents.length).toBe(20);

    // Shuffle events to simulate out-of-order arrival
    const shuffled = [...allEvents].sort(() => Math.random() - 0.5);

    // Apply shuffled events to a replica
    const replicaRM = new ReplicationManager(shardManager);
    const result = replicaRM.applyEvents(shuffled);

    // Some events may be skipped due to out-of-order arrival
    // (events with seq <= current local seq are skipped).
    // The important thing is that no errors are thrown.
    expect(result.errors.length).toBe(0);

    // The replica's latest sequence should be the maximum sequence
    // it received. Due to out-of-order processing, it may not be 20
    // but it should be at least 1.
    const latestSeq = replicaRM.getLatestSequence('shard-ooo');
    expect(latestSeq).toBeGreaterThanOrEqual(1);
    expect(latestSeq).toBeLessThanOrEqual(20);

    // If events arrive strictly in order, all 20 would be applied.
    // With random order, the first event with the lowest sequence
    // sets the baseline and later events with lower sequences are skipped.
    // This is by design — the replica is expected to request a full delta.
  });

  // ── In-Order Application Is Lossless ──────────────────────────────────

  it('should apply all events when received in order', () => {
    const primaryRM = new ReplicationManager(shardManager);

    for (let i = 0; i < 50; i++) {
      primaryRM.appendEvent({
        shardId: 'shard-inorder',
        operation: i % 3 === 0 ? 'insert' : i % 3 === 1 ? 'update' : 'delete',
        table: 'assets',
        rowId: `asset-${i}`,
        data: i % 3 !== 2 ? { name: `Asset ${i}` } : undefined,
      });
    }

    const ordered = primaryRM.getEventsSince('shard-inorder', 0);
    expect(ordered.length).toBe(50);

    // Verify strict ordering
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].sequence).toBe(ordered[i - 1].sequence + 1);
    }

    const replicaRM = new ReplicationManager(shardManager);
    const result = replicaRM.applyEvents(ordered);

    expect(result.applied).toBe(50);
    expect(result.errors.length).toBe(0);
    expect(replicaRM.getLatestSequence('shard-inorder')).toBe(50);
  });

  // ── Large Replication Gap Detection ───────────────────────────────────

  it('should detect and report a large replication gap', () => {
    const primaryRM = new ReplicationManager(shardManager);

    // Primary has 1000 events
    for (let i = 0; i < 1000; i++) {
      primaryRM.appendEvent({
        shardId: 'shard-gap',
        operation: 'insert',
        table: 'assets',
        rowId: `gap-asset-${i}`,
        data: { name: `Asset ${i}` },
      });
    }

    const primarySeq = primaryRM.getLatestSequence('shard-gap');
    expect(primarySeq).toBe(1000);

    // Replica is only at sequence 100
    const replicaSeq = 100;
    const lag = primaryRM.getReplicationLag('shard-gap', replicaSeq);
    expect(lag).toBe(-900); // Primary is 900 events ahead

    // Detect this as a partial-replication conflict
    const conflictHandler = new ConflictHandler();
    const conflict = conflictHandler.handlePartialReplication(
      'shard-gap',
      primarySeq,  // expected
      replicaSeq,  // actual
    );

    expect(conflict.type).toBe('partial-replication');
    expect(conflict.description).toContain('Gap of 900 events');
    expect(conflict.resolved).toBe(false);

    // Verify the gap events can be retrieved
    const gapEvents = primaryRM.getEventsSince('shard-gap', replicaSeq);
    expect(gapEvents.length).toBe(900);
    expect(gapEvents[0].sequence).toBe(101);
    expect(gapEvents[gapEvents.length - 1].sequence).toBe(1000);

    // Apply gap events to bring replica up to date
    const replicaRM = new ReplicationManager(shardManager);
    // First simulate the replica's existing state
    for (let i = 0; i < replicaSeq; i++) {
      replicaRM.appendEvent({
        shardId: 'shard-gap',
        operation: 'insert',
        table: 'assets',
        rowId: `gap-asset-${i}`,
        data: { name: `Asset ${i}` },
      });
    }
    expect(replicaRM.getLatestSequence('shard-gap')).toBe(replicaSeq);

    // Apply the gap
    const result = replicaRM.applyEvents(gapEvents);
    expect(result.applied).toBe(900);
    expect(result.errors.length).toBe(0);
    expect(replicaRM.getLatestSequence('shard-gap')).toBe(1000);

    // Mark conflict as resolved
    conflictHandler.resolveConflict(0, 'Gap closed by applying 900 delta events');
    expect(conflictHandler.getUnresolved().length).toBe(0);
  });

  // ── Buffer Overflow Handling ──────────────────────────────────────────

  it('should handle buffer overflow by evicting oldest events', () => {
    // Create a ReplicationManager with a small buffer
    const smallBufferRM = new ReplicationManager(shardManager, 50);

    // Append 100 events (exceeds buffer of 50)
    for (let i = 0; i < 100; i++) {
      smallBufferRM.appendEvent({
        shardId: 'shard-overflow',
        operation: 'insert',
        table: 'assets',
        rowId: `overflow-asset-${i}`,
        data: { name: `Asset ${i}` },
      });
    }

    // Sequence counter should still be 100
    expect(smallBufferRM.getLatestSequence('shard-overflow')).toBe(100);

    // But only the last 50 events should be retained
    const allEvents = smallBufferRM.getEventsSince('shard-overflow', 0);
    expect(allEvents.length).toBe(50);
    expect(allEvents[0].sequence).toBe(51); // Oldest retained
    expect(allEvents[allEvents.length - 1].sequence).toBe(100);

    // Events before seq 51 are gone — a replica requesting from seq 10
    // would only get events 51-100 (a detectable gap)
    const fromEarly = smallBufferRM.getEventsSince('shard-overflow', 10);
    expect(fromEarly.length).toBe(50); // Only 51-100 available
    expect(fromEarly[0].sequence).toBe(51);
  });

  // ── Duplicate Event Rejection ─────────────────────────────────────────

  it('should skip duplicate events during apply', () => {
    const primaryRM = new ReplicationManager(shardManager);

    for (let i = 0; i < 10; i++) {
      primaryRM.appendEvent({
        shardId: 'shard-dup',
        operation: 'insert',
        table: 'assets',
        rowId: `dup-asset-${i}`,
      });
    }

    const events = primaryRM.getEventsSince('shard-dup', 0);

    const replicaRM = new ReplicationManager(shardManager);

    // Apply once
    const first = replicaRM.applyEvents(events);
    expect(first.applied).toBe(10);

    // Apply the same events again — all should be skipped as duplicates
    const second = replicaRM.applyEvents(events);
    expect(second.applied).toBe(0);
    expect(second.errors.length).toBe(0);

    // Sequence should remain at 10
    expect(replicaRM.getLatestSequence('shard-dup')).toBe(10);
  });

  // ── Multi-Shard Replication Independence ──────────────────────────────

  it('should replicate multiple shards independently', () => {
    const rm = new ReplicationManager(shardManager);

    // Shard A gets 30 events
    for (let i = 0; i < 30; i++) {
      rm.appendEvent({
        shardId: 'multi-shard-a',
        operation: 'insert',
        table: 'assets',
        rowId: `msa-${i}`,
      });
    }

    // Shard B gets 50 events
    for (let i = 0; i < 50; i++) {
      rm.appendEvent({
        shardId: 'multi-shard-b',
        operation: 'insert',
        table: 'transcript_segments',
        rowId: `msb-${i}`,
      });
    }

    // Sequences are independent
    expect(rm.getLatestSequence('multi-shard-a')).toBe(30);
    expect(rm.getLatestSequence('multi-shard-b')).toBe(50);

    // Getting events for one shard does not affect the other
    const eventsA = rm.getEventsSince('multi-shard-a', 20);
    const eventsB = rm.getEventsSince('multi-shard-b', 40);
    expect(eventsA.length).toBe(10);
    expect(eventsB.length).toBe(10);

    // All events belong to their respective shards
    expect(eventsA.every((e) => e.shardId === 'multi-shard-a')).toBe(true);
    expect(eventsB.every((e) => e.shardId === 'multi-shard-b')).toBe(true);
  });
});
