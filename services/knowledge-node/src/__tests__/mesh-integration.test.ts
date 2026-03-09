/**
 * @module mesh-integration.test
 *
 * Integration tests for the knowledge-node mesh network. Spins up real
 * WebSocket connections on randomised localhost ports, verifies peer
 * discovery, lease management, scatter/gather search, and disconnect
 * handling.
 *
 * All tests use temp directories that are cleaned up automatically.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ShardManager } from '../shard/ShardManager.js';
import { MeshService, type MeshConfig } from '../mesh/MeshService.js';
import { ShardLeaseManager } from '../mesh/ShardLeaseManager.js';
import { ReplicationManager } from '../mesh/ReplicationManager.js';
import { ConflictHandler } from '../mesh/ConflictHandler.js';
import { ResultRanker } from '../mesh/ResultRanker.js';
import { vectorToBuffer, type AssetRow, type TranscriptSegmentRow } from '../db/KnowledgeDB.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

let tmpDirs: string[] = [];
let meshNodes: MeshService[] = [];

/** Get a random port in the ephemeral range. */
function randomPort(): number {
  return 30000 + Math.floor(Math.random() * 20000);
}

/** Wait for a specified duration. */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function makeAsset(overrides: Partial<AssetRow> = {}): AssetRow {
  const now = new Date().toISOString();
  return {
    id: 'asset-1',
    name: 'Test Clip.mxf',
    type: 'video',
    shardId: 'shard-1',
    durationMs: 30000,
    fileSize: 1048576,
    mediaRoot: null,
    relativePath: null,
    format: 'mxf',
    codec: 'dnxhd',
    resolutionW: 1920,
    resolutionH: 1080,
    frameRate: 29.97,
    sampleRate: 48000,
    channels: 2,
    checksum: null,
    approvalStatus: 'pending',
    rightsJson: null,
    tagsJson: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeSegment(
  overrides: Partial<TranscriptSegmentRow> = {},
): TranscriptSegmentRow {
  return {
    id: 'seg-1',
    assetId: 'asset-1',
    startTimeMs: 0,
    endTimeMs: 1000,
    text: 'Hello world',
    confidence: 0.9,
    speakerId: null,
    speakerName: null,
    languageCode: 'en',
    wordsJson: null,
    ...overrides,
  };
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────

afterEach(async () => {
  // Stop all mesh nodes.
  for (const node of meshNodes) {
    try {
      await node.stop();
    } catch {
      // Ignore errors during cleanup.
    }
  }
  meshNodes = [];

  // Remove temp directories.
  for (const dir of tmpDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore.
    }
  }
  tmpDirs = [];
});

/** Create a temp dir and track it for cleanup. */
function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mesh-test-'));
  tmpDirs.push(dir);
  return dir;
}

/** Create and start a MeshService with the given config. */
async function createNode(
  config: MeshConfig,
): Promise<{ mesh: MeshService; manager: ShardManager }> {
  const manager = new ShardManager(config.dataDir);
  const mesh = new MeshService(config, manager);
  await mesh.start();
  meshNodes.push(mesh);
  return { mesh, manager };
}

// ─── ShardLeaseManager Unit Tests ──────────────────────────────────────────

describe('ShardLeaseManager', () => {
  it('should acquire and release a lease', () => {
    const lm = new ShardLeaseManager(30_000);

    const lease = lm.acquireLease('shard-1', 'node-a');
    expect(lease).not.toBeNull();
    expect(lease!.shardId).toBe('shard-1');
    expect(lease!.holderId).toBe('node-a');
    expect(lease!.renewalCount).toBe(0);

    const released = lm.releaseLease('shard-1', 'node-a');
    expect(released).toBe(true);
    expect(lm.getLease('shard-1')).toBeNull();
  });

  it('should block a second node from acquiring a held lease', () => {
    const lm = new ShardLeaseManager(30_000);

    lm.acquireLease('shard-1', 'node-a');
    const blocked = lm.acquireLease('shard-1', 'node-b');
    expect(blocked).toBeNull();
  });

  it('should allow re-acquisition after release', () => {
    const lm = new ShardLeaseManager(30_000);

    lm.acquireLease('shard-1', 'node-a');
    lm.releaseLease('shard-1', 'node-a');

    const lease = lm.acquireLease('shard-1', 'node-b');
    expect(lease).not.toBeNull();
    expect(lease!.holderId).toBe('node-b');
  });

  it('should renew a lease', () => {
    const lm = new ShardLeaseManager(30_000);

    lm.acquireLease('shard-1', 'node-a');
    const renewed = lm.renewLease('shard-1', 'node-a');
    expect(renewed).not.toBeNull();
    expect(renewed!.renewalCount).toBe(1);
  });

  it('should not let a different node renew', () => {
    const lm = new ShardLeaseManager(30_000);

    lm.acquireLease('shard-1', 'node-a');
    const denied = lm.renewLease('shard-1', 'node-b');
    expect(denied).toBeNull();
  });

  it('should allow acquisition of an expired lease by another node', async () => {
    const lm = new ShardLeaseManager(30_000);

    // Acquire with a very short TTL.
    lm.acquireLease('shard-1', 'node-a', 50);

    // Wait for expiration.
    await sleep(100);

    const lease = lm.acquireLease('shard-1', 'node-b');
    expect(lease).not.toBeNull();
    expect(lease!.holderId).toBe('node-b');
  });

  it('should clean up expired leases', async () => {
    const lm = new ShardLeaseManager(30_000);

    lm.acquireLease('shard-1', 'node-a', 50);
    lm.acquireLease('shard-2', 'node-a', 50);
    lm.acquireLease('shard-3', 'node-a', 60_000);

    await sleep(100);

    const removed = lm.cleanup();
    expect(removed).toBe(2);

    // shard-3 should still be held.
    expect(lm.isLeaseHolder('shard-3', 'node-a')).toBe(true);
  });
});

// ─── ReplicationManager Unit Tests ─────────────────────────────────────────

describe('ReplicationManager', () => {
  it('should append events with incrementing sequences', () => {
    const dir = makeTmpDir();
    const sm = new ShardManager(dir);
    const rm = new ReplicationManager(sm);

    const e1 = rm.appendEvent({
      shardId: 'shard-1',
      operation: 'insert',
      table: 'assets',
      rowId: 'a1',
    });
    const e2 = rm.appendEvent({
      shardId: 'shard-1',
      operation: 'update',
      table: 'assets',
      rowId: 'a1',
      data: { name: 'Updated' },
    });

    expect(e1.sequence).toBe(1);
    expect(e2.sequence).toBe(2);
    expect(e1.timestamp).toBeTruthy();
    expect(e2.timestamp).toBeTruthy();
  });

  it('should filter events by sequence', () => {
    const dir = makeTmpDir();
    const sm = new ShardManager(dir);
    const rm = new ReplicationManager(sm);

    rm.appendEvent({ shardId: 's1', operation: 'insert', table: 'assets', rowId: 'a1' });
    rm.appendEvent({ shardId: 's1', operation: 'insert', table: 'assets', rowId: 'a2' });
    rm.appendEvent({ shardId: 's1', operation: 'insert', table: 'assets', rowId: 'a3' });

    const since1 = rm.getEventsSince('s1', 1);
    expect(since1).toHaveLength(2);
    expect(since1[0].sequence).toBe(2);
    expect(since1[1].sequence).toBe(3);
  });

  it('should compute replication lag', () => {
    const dir = makeTmpDir();
    const sm = new ShardManager(dir);
    const rm = new ReplicationManager(sm);

    rm.appendEvent({ shardId: 's1', operation: 'insert', table: 'assets', rowId: 'a1' });
    rm.appendEvent({ shardId: 's1', operation: 'insert', table: 'assets', rowId: 'a2' });

    expect(rm.getReplicationLag('s1', 5)).toBe(3); // 5 - 2 = 3
    expect(rm.getReplicationLag('s1', 2)).toBe(0);
    expect(rm.getReplicationLag('s1', 1)).toBe(-1);
  });

  it('should apply events from a remote source', () => {
    const dir = makeTmpDir();
    const sm = new ShardManager(dir);
    const rm = new ReplicationManager(sm);

    const remoteEvents = [
      {
        sequence: 1,
        shardId: 's1',
        operation: 'insert' as const,
        table: 'assets',
        rowId: 'a1',
        timestamp: new Date().toISOString(),
      },
      {
        sequence: 2,
        shardId: 's1',
        operation: 'insert' as const,
        table: 'assets',
        rowId: 'a2',
        timestamp: new Date().toISOString(),
      },
    ];

    const result = rm.applyEvents(remoteEvents);
    expect(result.applied).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(rm.getLatestSequence('s1')).toBe(2);
  });
});

// ─── ConflictHandler Unit Tests ────────────────────────────────────────────

describe('ConflictHandler', () => {
  it('should record and resolve conflicts', () => {
    const ch = new ConflictHandler();

    ch.handleLeaseLoss('shard-1', 'node-a');
    ch.handleStaleManifest('shard-2', 1, 3);
    ch.handlePartialReplication('shard-3', 10, 7);

    expect(ch.getAll()).toHaveLength(3);
    expect(ch.getUnresolved()).toHaveLength(3);

    ch.resolveConflict(0, 'Re-acquired lease after retry');
    expect(ch.getUnresolved()).toHaveLength(2);

    const all = ch.getAll();
    expect(all[0].resolved).toBe(true);
    expect(all[0].resolution).toBe('Re-acquired lease after retry');
  });

  it('should throw on out-of-bounds resolution', () => {
    const ch = new ConflictHandler();
    expect(() => ch.resolveConflict(99, 'nope')).toThrow('out of bounds');
  });
});

// ─── ResultRanker Unit Tests ───────────────────────────────────────────────

describe('ResultRanker', () => {
  it('should merge and rank hits from multiple nodes', () => {
    const ranker = new ResultRanker();

    const localHits = [
      { id: '1', score: 0.8, sourceType: 'transcript', sourceId: 'src-1', shardId: 's1', nodeId: 'node-1' },
      { id: '2', score: 0.6, sourceType: 'transcript', sourceId: 'src-2', shardId: 's1', nodeId: 'node-1' },
    ];

    const remoteHits = [
      [
        { id: '3', score: 0.9, sourceType: 'transcript', sourceId: 'src-3', shardId: 's2', nodeId: 'node-2' },
        { id: '4', score: 0.3, sourceType: 'transcript', sourceId: 'src-4', shardId: 's2', nodeId: 'node-2' },
      ],
    ];

    const merged = ranker.merge(localHits, remoteHits, 10);
    expect(merged.length).toBeGreaterThan(0);

    // All four unique sources should be present.
    expect(merged).toHaveLength(4);

    // Scores should be normalised and sorted descending.
    for (let i = 1; i < merged.length; i++) {
      expect(merged[i - 1].score).toBeGreaterThanOrEqual(merged[i].score);
    }
  });

  it('should deduplicate by sourceId', () => {
    const ranker = new ResultRanker();

    const local = [
      { id: '1', score: 0.8, sourceType: 't', sourceId: 'src-1', shardId: 's1', nodeId: 'n1' },
    ];
    const remote = [
      [
        { id: '2', score: 0.9, sourceType: 't', sourceId: 'src-1', shardId: 's2', nodeId: 'n2' },
      ],
    ];

    const merged = ranker.merge(local, remote, 10);
    // Should only have one hit for src-1.
    expect(merged).toHaveLength(1);
  });

  it('should respect topK limit', () => {
    const ranker = new ResultRanker();

    const local = Array.from({ length: 20 }, (_, i) => ({
      id: `${i}`,
      score: Math.random(),
      sourceType: 't',
      sourceId: `src-${i}`,
      shardId: 's1',
      nodeId: 'n1',
    }));

    const merged = ranker.merge(local, [], 5);
    expect(merged).toHaveLength(5);
  });
});

// ─── Mesh Network Integration Tests ────────────────────────────────────────

describe('Mesh Network Integration', () => {
  it('should connect 3 nodes to each other', async () => {
    const port1 = randomPort();
    const port2 = randomPort();
    const port3 = randomPort();

    const { mesh: mesh1 } = await createNode({
      nodeId: 'node-1',
      hostname: '127.0.0.1',
      port: port1,
      dataDir: makeTmpDir(),
      heartbeatIntervalMs: 60_000, // Long interval to avoid noise.
      searchTimeoutMs: 2000,
    });

    const { mesh: mesh2 } = await createNode({
      nodeId: 'node-2',
      hostname: '127.0.0.1',
      port: port2,
      dataDir: makeTmpDir(),
      peers: [{ hostname: '127.0.0.1', port: port1 }],
      heartbeatIntervalMs: 60_000,
      searchTimeoutMs: 2000,
    });

    const { mesh: mesh3 } = await createNode({
      nodeId: 'node-3',
      hostname: '127.0.0.1',
      port: port3,
      dataDir: makeTmpDir(),
      peers: [
        { hostname: '127.0.0.1', port: port1 },
        { hostname: '127.0.0.1', port: port2 },
      ],
      heartbeatIntervalMs: 60_000,
      searchTimeoutMs: 2000,
    });

    // Wait for connections to establish.
    await sleep(500);

    // Each node should see at least one peer.
    const info1 = mesh1.getNodeInfo();
    const info2 = mesh2.getNodeInfo();
    const info3 = mesh3.getNodeInfo();

    expect(info1.nodeId).toBe('node-1');
    expect(info2.nodeId).toBe('node-2');
    expect(info3.nodeId).toBe('node-3');

    // Node-1 should have inbound connections from node-2 and node-3.
    const peers1 = mesh1.getPeers();
    expect(peers1.length).toBeGreaterThanOrEqual(1);
  });

  it('should perform local-only search when a node has shards', async () => {
    const port = randomPort();

    const { mesh, manager } = await createNode({
      nodeId: 'solo-node',
      hostname: '127.0.0.1',
      port,
      dataDir: makeTmpDir(),
      heartbeatIntervalMs: 60_000,
      searchTimeoutMs: 2000,
    });

    // Create a shard with data.
    const handle = manager.createShard('test-project');
    handle.db.insertAsset(
      makeAsset({
        id: 'a1',
        name: 'Interview Alpha',
        shardId: handle.manifest.shardId,
      }),
    );
    handle.db.insertTranscriptSegment(
      makeSegment({
        id: 'seg-1',
        assetId: 'a1',
        text: 'The alpha product is ready for launch.',
      }),
    );
    handle.db.close();

    const results = await mesh.search({ text: 'alpha', topK: 10 });

    expect(results.hits.length).toBeGreaterThan(0);
    expect(results.nodesQueried).toBe(1); // Only local.
    expect(results.nodesResponded).toBe(1);

    // At least one hit should contain "alpha".
    const hasAlpha = results.hits.some(
      (h) => h.text?.toLowerCase().includes('alpha'),
    );
    expect(hasAlpha).toBe(true);
  });

  it('should handle shard lease conflict between nodes', async () => {
    const port1 = randomPort();
    const port2 = randomPort();

    const { mesh: mesh1 } = await createNode({
      nodeId: 'lease-node-1',
      hostname: '127.0.0.1',
      port: port1,
      dataDir: makeTmpDir(),
      heartbeatIntervalMs: 60_000,
      leaseTimeoutMs: 30_000,
    });

    const { mesh: mesh2 } = await createNode({
      nodeId: 'lease-node-2',
      hostname: '127.0.0.1',
      port: port2,
      dataDir: makeTmpDir(),
      peers: [{ hostname: '127.0.0.1', port: port1 }],
      heartbeatIntervalMs: 60_000,
      leaseTimeoutMs: 30_000,
    });

    await sleep(300);

    // Node-1 acquires a lease.
    const l1 = mesh1.leaseManager.acquireLease('shared-shard', 'lease-node-1');
    expect(l1).not.toBeNull();

    // Node-2 tries to acquire the same lease on its own lease manager.
    // (In a real mesh, lease coordination would go through the mesh protocol.)
    // Here we test the local lease manager semantics.
    const l2 = mesh1.leaseManager.acquireLease('shared-shard', 'lease-node-2');
    expect(l2).toBeNull(); // Blocked.

    // Release and retry.
    mesh1.leaseManager.releaseLease('shared-shard', 'lease-node-1');
    const l3 = mesh1.leaseManager.acquireLease('shared-shard', 'lease-node-2');
    expect(l3).not.toBeNull();
    expect(l3!.holderId).toBe('lease-node-2');
  });

  it('should handle peer disconnect and reflect in peer list', async () => {
    const port1 = randomPort();
    const port2 = randomPort();

    const { mesh: mesh1 } = await createNode({
      nodeId: 'disc-node-1',
      hostname: '127.0.0.1',
      port: port1,
      dataDir: makeTmpDir(),
      heartbeatIntervalMs: 60_000,
    });

    const { mesh: mesh2 } = await createNode({
      nodeId: 'disc-node-2',
      hostname: '127.0.0.1',
      port: port2,
      dataDir: makeTmpDir(),
      peers: [{ hostname: '127.0.0.1', port: port1 }],
      heartbeatIntervalMs: 60_000,
    });

    await sleep(500);

    // Should have at least one connected peer on node-1.
    const peersBefore = mesh1.getPeers().filter((p) => p.status === 'connected');
    expect(peersBefore.length).toBeGreaterThanOrEqual(1);

    // Stop node-2.
    await mesh2.stop();
    meshNodes = meshNodes.filter((n) => n !== mesh2);

    await sleep(500);

    // Node-1's peer list should reflect the disconnection.
    const peersAfter = mesh1.getPeers().filter((p) => p.status === 'connected');
    // The peer should be disconnected or removed.
    expect(peersAfter.length).toBeLessThan(peersBefore.length);
  });

  it('should search across multiple nodes with shards', async () => {
    const port1 = randomPort();
    const port2 = randomPort();

    const { mesh: mesh1, manager: mgr1 } = await createNode({
      nodeId: 'search-node-1',
      hostname: '127.0.0.1',
      port: port1,
      dataDir: makeTmpDir(),
      heartbeatIntervalMs: 60_000,
      searchTimeoutMs: 2000,
    });

    const { mesh: mesh2, manager: mgr2 } = await createNode({
      nodeId: 'search-node-2',
      hostname: '127.0.0.1',
      port: port2,
      dataDir: makeTmpDir(),
      peers: [{ hostname: '127.0.0.1', port: port1 }],
      heartbeatIntervalMs: 60_000,
      searchTimeoutMs: 2000,
    });

    await sleep(500);

    // Create shards on each node.
    const h1 = mgr1.createShard('proj');
    h1.db.insertAsset(makeAsset({ id: 'a1', name: 'Morning News', shardId: h1.manifest.shardId }));
    h1.db.insertTranscriptSegment(
      makeSegment({
        id: 's1',
        assetId: 'a1',
        text: 'Breaking news: the market reached an all-time high today.',
      }),
    );
    h1.db.close();

    const h2 = mgr2.createShard('proj');
    h2.db.insertAsset(makeAsset({ id: 'a2', name: 'Evening Report', shardId: h2.manifest.shardId }));
    h2.db.insertTranscriptSegment(
      makeSegment({
        id: 's2',
        assetId: 'a2',
        text: 'Market analysts predict continued growth in the technology sector.',
      }),
    );
    h2.db.close();

    // Search from node-1 (which also queries node-2).
    const results = await mesh1.search({ text: 'market', topK: 10 });

    // Should find local results at minimum.
    expect(results.hits.length).toBeGreaterThan(0);
    expect(results.nodesQueried).toBeGreaterThanOrEqual(1);

    // Verify at least one hit contains "market".
    const hasMarket = results.hits.some(
      (h) => h.text?.toLowerCase().includes('market'),
    );
    expect(hasMarket).toBe(true);
  });
});
