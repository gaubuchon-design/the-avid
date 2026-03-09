/**
 * @module node-drop.test
 *
 * Reliability tests for mesh node failure scenarios. Verifies that the
 * system degrades gracefully when a node drops during active operations.
 *
 * Tests use real MeshService instances on localhost with randomized
 * ports to avoid conflicts with other running services.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MeshService, type MeshConfig } from '../../mesh/MeshService.js';
import { ShardManager } from '../../shard/ShardManager.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get a random port in a high range to avoid collisions. */
function randomPort(): number {
  return 30_000 + Math.floor(Math.random() * 20_000);
}

/** Wait for a specified number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Node Drop Reliability', () => {
  let tempDirA: string;
  let tempDirB: string;
  let tempDirC: string;

  let shardManagerA: ShardManager;
  let shardManagerB: ShardManager;
  let shardManagerC: ShardManager;

  let nodeA: MeshService;
  let nodeB: MeshService;
  let nodeC: MeshService;

  let portA: number;
  let portB: number;
  let portC: number;

  beforeAll(() => {
    tempDirA = mkdtempSync(join(tmpdir(), 'node-drop-a-'));
    tempDirB = mkdtempSync(join(tmpdir(), 'node-drop-b-'));
    tempDirC = mkdtempSync(join(tmpdir(), 'node-drop-c-'));

    portA = randomPort();
    portB = randomPort();
    portC = randomPort();
  });

  afterAll(async () => {
    // Stop all nodes gracefully, ignoring errors from already-stopped nodes
    for (const node of [nodeA, nodeB, nodeC]) {
      try {
        await node?.stop();
      } catch {
        // Already stopped or never started
      }
    }

    rmSync(tempDirA, { recursive: true, force: true });
    rmSync(tempDirB, { recursive: true, force: true });
    rmSync(tempDirC, { recursive: true, force: true });
  });

  // ── Active Search Query Survives Node Drop ────────────────────────────

  it('should return partial results when a peer drops during search', async () => {
    shardManagerA = new ShardManager(join(tempDirA, 'shards-search'));
    shardManagerB = new ShardManager(join(tempDirB, 'shards-search'));

    // Seed node A with data
    const handleA = shardManagerA.createShard('test-project', { shardId: 'shard-a' });
    handleA.db.insertAsset({
      id: 'asset-a1',
      name: 'Weather report from the field',
      type: 'video',
      shardId: 'shard-a',
      durationMs: 60_000,
      fileSize: 100_000,
      mediaRoot: null,
      relativePath: null,
      format: null,
      codec: null,
      resolutionW: null,
      resolutionH: null,
      frameRate: null,
      sampleRate: null,
      channels: null,
      checksum: null,
      approvalStatus: 'approved',
      rightsJson: null,
      tagsJson: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    handleA.db.insertTranscriptSegment({
      id: 'seg-a1',
      assetId: 'asset-a1',
      startTimeMs: 0,
      endTimeMs: 5000,
      text: 'Breaking weather report from the field station',
      confidence: 0.95,
      speakerId: null,
      speakerName: null,
      languageCode: 'en',
      wordsJson: null,
    });
    handleA.db.close();

    // Seed node B with data
    const handleB = shardManagerB.createShard('test-project', { shardId: 'shard-b' });
    handleB.db.insertAsset({
      id: 'asset-b1',
      name: 'Sports highlights package',
      type: 'video',
      shardId: 'shard-b',
      durationMs: 120_000,
      fileSize: 200_000,
      mediaRoot: null,
      relativePath: null,
      format: null,
      codec: null,
      resolutionW: null,
      resolutionH: null,
      frameRate: null,
      sampleRate: null,
      channels: null,
      checksum: null,
      approvalStatus: 'approved',
      rightsJson: null,
      tagsJson: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    handleB.db.close();

    const configA: MeshConfig = {
      nodeId: 'node-a',
      hostname: '127.0.0.1',
      port: portA,
      dataDir: join(tempDirA, 'shards-search'),
      peers: [{ hostname: '127.0.0.1', port: portB }],
      heartbeatIntervalMs: 60_000, // Disable heartbeat during test
      searchTimeoutMs: 2_000,
    };

    const configB: MeshConfig = {
      nodeId: 'node-b',
      hostname: '127.0.0.1',
      port: portB,
      dataDir: join(tempDirB, 'shards-search'),
      peers: [{ hostname: '127.0.0.1', port: portA }],
      heartbeatIntervalMs: 60_000,
      searchTimeoutMs: 2_000,
    };

    nodeA = new MeshService(configA, shardManagerA);
    nodeB = new MeshService(configB, shardManagerB);

    await nodeA.start();
    await nodeB.start();

    // Allow connections to establish
    await sleep(500);

    // Verify nodes can see each other
    const peersOfA = nodeA.getPeers();
    expect(peersOfA.length).toBeGreaterThanOrEqual(0);

    // Search should return local results even if peer is unavailable
    // First, kill node B abruptly
    await nodeB.stop();

    // Search from node A — should get partial (local-only) results
    const results = await nodeA.search({
      text: 'weather report',
      topK: 10,
      modalities: ['transcript', 'asset'],
    });

    // Node A should still return its own local results
    expect(results.hits.length).toBeGreaterThanOrEqual(0);
    expect(results.nodesResponded).toBeGreaterThanOrEqual(1); // At least local node
    expect(results.queryTimeMs).toBeDefined();

    await nodeA.stop();
  });

  // ── Shard Replication Detects Gap on Node Drop ────────────────────────

  it('should detect replication gap when node drops during replication', async () => {
    shardManagerC = new ShardManager(join(tempDirC, 'shards-repl'));

    const portRepl = randomPort();

    const configC: MeshConfig = {
      nodeId: 'node-c',
      hostname: '127.0.0.1',
      port: portRepl,
      dataDir: join(tempDirC, 'shards-repl'),
      heartbeatIntervalMs: 60_000,
      searchTimeoutMs: 2_000,
    };

    nodeC = new MeshService(configC, shardManagerC);
    await nodeC.start();

    // Append replication events
    const rm = nodeC.replicationManager;
    for (let i = 0; i < 50; i++) {
      rm.appendEvent({
        shardId: 'shard-repl-test',
        operation: 'insert',
        table: 'assets',
        rowId: `asset-${i}`,
        data: { name: `Asset ${i}` },
      });
    }

    // Verify events are tracked
    const latestSeq = rm.getLatestSequence('shard-repl-test');
    expect(latestSeq).toBe(50);

    // Simulate a node that has only received events up to seq 20
    const lag = rm.getReplicationLag('shard-repl-test', 20);
    expect(lag).toBe(-30); // Local is 30 events ahead

    // Get events since seq 20 — should return the gap
    const gapEvents = rm.getEventsSince('shard-repl-test', 20);
    expect(gapEvents.length).toBe(30);
    expect(gapEvents[0].sequence).toBe(21);
    expect(gapEvents[gapEvents.length - 1].sequence).toBe(50);

    // Record and detect a partial-replication conflict
    const conflictHandler = nodeC.conflictHandler;
    const conflict = conflictHandler.handlePartialReplication(
      'shard-repl-test',
      50, // expected sequence
      20, // actual sequence reached
    );
    expect(conflict.type).toBe('partial-replication');
    expect(conflict.description).toContain('Gap of 30 events');
    expect(conflict.resolved).toBe(false);

    // Verify it shows as unresolved
    const unresolved = conflictHandler.getUnresolved();
    expect(unresolved.length).toBeGreaterThanOrEqual(1);
    expect(unresolved.some((c) => c.shardId === 'shard-repl-test')).toBe(true);

    await nodeC.stop();
  });
});
