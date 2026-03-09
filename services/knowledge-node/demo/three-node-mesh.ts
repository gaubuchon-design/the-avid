/**
 * @module three-node-mesh
 *
 * Demonstration script that creates a 3-node knowledge mesh on
 * localhost, distributes shards across nodes, and executes a
 * scatter/gather search query.
 *
 * Usage:
 * ```bash
 * npx tsx demo/three-node-mesh.ts
 * ```
 *
 * What it does:
 * 1. Creates 3 MeshService instances on ports 4201, 4202, 4203.
 * 2. Creates a project with 2 shards containing test assets and
 *    transcript segments.
 * 3. Distributes shard-A to node-1, shard-B to node-2.
 * 4. Connects all nodes in a mesh.
 * 5. Runs a search query from node-3 that returns results from
 *    both node-1 and node-2.
 * 6. Logs the merged results and shuts everything down.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ShardManager } from '../src/shard/ShardManager.js';
import { MeshService, type MeshConfig } from '../src/mesh/MeshService.js';
import { vectorToBuffer, type AssetRow, type TranscriptSegmentRow } from '../src/db/KnowledgeDB.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAsset(overrides: Partial<AssetRow>): AssetRow {
  const now = new Date().toISOString();
  return {
    id: 'asset-default',
    name: 'Default Asset',
    type: 'video',
    shardId: 'shard-default',
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
    approvalStatus: 'approved',
    rightsJson: null,
    tagsJson: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeSegment(overrides: Partial<TranscriptSegmentRow>): TranscriptSegmentRow {
  return {
    id: 'seg-default',
    assetId: 'asset-default',
    startTimeMs: 0,
    endTimeMs: 1000,
    text: 'Default segment text',
    confidence: 0.95,
    speakerId: null,
    speakerName: null,
    languageCode: 'en',
    wordsJson: null,
    ...overrides,
  };
}

function log(msg: string): void {
  console.log(`[demo] ${msg}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log('=== Three-Node Mesh Demo ===');
  log('');

  // Create temp directories for each node.
  const tmpDirs = Array.from({ length: 3 }, (_, i) =>
    mkdtempSync(join(tmpdir(), `mesh-node-${i + 1}-`)),
  );

  const configs: MeshConfig[] = [
    {
      nodeId: 'node-1',
      hostname: '127.0.0.1',
      port: 4201,
      dataDir: tmpDirs[0],
      heartbeatIntervalMs: 2000,
      searchTimeoutMs: 3000,
    },
    {
      nodeId: 'node-2',
      hostname: '127.0.0.1',
      port: 4202,
      dataDir: tmpDirs[1],
      peers: [{ hostname: '127.0.0.1', port: 4201 }],
      heartbeatIntervalMs: 2000,
      searchTimeoutMs: 3000,
    },
    {
      nodeId: 'node-3',
      hostname: '127.0.0.1',
      port: 4203,
      dataDir: tmpDirs[2],
      peers: [
        { hostname: '127.0.0.1', port: 4201 },
        { hostname: '127.0.0.1', port: 4202 },
      ],
      heartbeatIntervalMs: 2000,
      searchTimeoutMs: 3000,
    },
  ];

  const managers = configs.map((c) => new ShardManager(c.dataDir));
  const meshes = configs.map((c, i) => new MeshService(c, managers[i]));

  try {
    // Step 1: Start all nodes.
    log('Step 1: Starting 3 mesh nodes...');
    for (const mesh of meshes) {
      await mesh.start();
    }
    log(`  Node-1 listening on :${configs[0].port}`);
    log(`  Node-2 listening on :${configs[1].port}`);
    log(`  Node-3 listening on :${configs[2].port}`);
    log('');

    // Wait for peer connections to establish.
    await new Promise((r) => setTimeout(r, 1000));

    // Step 2: Create project shards and populate with data.
    log('Step 2: Creating project with 2 shards...');

    // Shard A on node-1: interview clips.
    const shardA = managers[0].createShard('demo-project', {
      shardId: 'shard-interviews',
    });
    shardA.db.insertAsset(
      makeAsset({
        id: 'asset-interview-1',
        name: 'CEO Interview',
        shardId: 'shard-interviews',
      }),
    );
    shardA.db.insertAsset(
      makeAsset({
        id: 'asset-interview-2',
        name: 'CTO Interview',
        shardId: 'shard-interviews',
      }),
    );
    shardA.db.insertTranscriptSegment(
      makeSegment({
        id: 'seg-ceo-1',
        assetId: 'asset-interview-1',
        startTimeMs: 0,
        endTimeMs: 5000,
        text: 'Our revenue grew thirty percent this quarter thanks to the new product launch.',
      }),
    );
    shardA.db.insertTranscriptSegment(
      makeSegment({
        id: 'seg-ceo-2',
        assetId: 'asset-interview-1',
        startTimeMs: 5000,
        endTimeMs: 10000,
        text: 'We plan to expand into the European market next year.',
      }),
    );
    shardA.db.insertTranscriptSegment(
      makeSegment({
        id: 'seg-cto-1',
        assetId: 'asset-interview-2',
        startTimeMs: 0,
        endTimeMs: 5000,
        text: 'The AI platform processes ten million frames per day with real-time inference.',
      }),
    );

    // Add some embedding chunks for ANN search.
    shardA.db.insertEmbeddingChunk({
      id: 'emb-ceo-revenue',
      sourceId: 'asset-interview-1',
      sourceType: 'transcript',
      shardId: 'shard-interviews',
      vector: vectorToBuffer([0.9, 0.1, 0.0, 0.2]),
      modelId: 'demo-model',
      dimensions: 4,
      startTimeMs: 0,
      endTimeMs: 5000,
      text: 'revenue growth product launch',
      createdAt: new Date().toISOString(),
    });

    shardA.db.close();
    log('  Shard A (interviews) created on node-1 with 2 assets, 3 transcript segments');

    // Shard B on node-2: b-roll footage.
    const shardB = managers[1].createShard('demo-project', {
      shardId: 'shard-broll',
    });
    shardB.db.insertAsset(
      makeAsset({
        id: 'asset-broll-office',
        name: 'Office B-Roll',
        shardId: 'shard-broll',
        type: 'video',
      }),
    );
    shardB.db.insertAsset(
      makeAsset({
        id: 'asset-broll-product',
        name: 'Product Demo B-Roll',
        shardId: 'shard-broll',
        type: 'video',
      }),
    );
    shardB.db.insertTranscriptSegment(
      makeSegment({
        id: 'seg-product-vo',
        assetId: 'asset-broll-product',
        startTimeMs: 0,
        endTimeMs: 8000,
        text: 'The new product features advanced AI capabilities for real-time video analysis.',
      }),
    );
    shardB.db.close();
    log('  Shard B (b-roll) created on node-2 with 2 assets, 1 transcript segment');
    log('');

    // Step 3: Verify peer connections.
    log('Step 3: Checking mesh connectivity...');
    for (let i = 0; i < meshes.length; i++) {
      const info = meshes[i].getNodeInfo();
      const peers = meshes[i].getPeers();
      log(`  ${info.nodeId}: ${info.shardCount} shards, ${peers.length} peers`);
    }
    log('');

    // Step 4: Run a search from node-3.
    log('Step 4: Searching for "product" across the mesh from node-3...');
    const results = await meshes[2].search({
      text: 'product',
      topK: 10,
      includeProvenance: true,
    });

    log(`  Query time: ${results.queryTimeMs}ms`);
    log(`  Nodes queried: ${results.nodesQueried}`);
    log(`  Nodes responded: ${results.nodesResponded}`);
    log(`  Total raw hits: ${results.totalHits}`);
    log(`  Merged hits: ${results.hits.length}`);
    log('');

    if (results.hits.length > 0) {
      log('  Results:');
      for (const hit of results.hits) {
        log(`    [${hit.score.toFixed(3)}] ${hit.sourceType}:${hit.sourceId} ` +
            `(shard=${hit.shardId}, node=${hit.nodeId})`);
        if (hit.text) {
          const truncated = hit.text.length > 60
            ? hit.text.slice(0, 60) + '...'
            : hit.text;
          log(`           "${truncated}"`);
        }
      }
    } else {
      log('  No results found.');
    }
    log('');

    // Step 5: Demonstrate lease management.
    log('Step 5: Demonstrating shard lease management...');
    const lease1 = meshes[0].leaseManager.acquireLease(
      'shard-interviews',
      'node-1',
      10000,
    );
    log(`  node-1 acquired lease on shard-interviews: ${lease1 ? 'YES' : 'NO'}`);

    const lease2 = meshes[1].leaseManager.acquireLease(
      'shard-interviews',
      'node-2',
      10000,
    );
    log(`  node-2 attempted lease on shard-interviews: ${lease2 ? 'YES (conflict!)' : 'BLOCKED (expected)'}`);

    meshes[0].leaseManager.releaseLease('shard-interviews', 'node-1');
    log('  node-1 released lease on shard-interviews');

    const lease3 = meshes[1].leaseManager.acquireLease(
      'shard-interviews',
      'node-2',
      10000,
    );
    log(`  node-2 re-attempted lease on shard-interviews: ${lease3 ? 'YES' : 'NO'}`);
    log('');

    // Step 6: Demonstrate replication events.
    log('Step 6: Demonstrating replication event log...');
    meshes[0].replicationManager.appendEvent({
      shardId: 'shard-interviews',
      operation: 'insert',
      table: 'assets',
      rowId: 'asset-interview-3',
      data: { name: 'New Interview' },
    });
    meshes[0].replicationManager.appendEvent({
      shardId: 'shard-interviews',
      operation: 'insert',
      table: 'transcript_segments',
      rowId: 'seg-new-1',
      data: { text: 'This is a new segment.' },
    });

    const latestSeq = meshes[0].replicationManager.getLatestSequence('shard-interviews');
    log(`  Latest sequence for shard-interviews: ${latestSeq}`);

    const events = meshes[0].replicationManager.getEventsSince('shard-interviews', 0);
    log(`  Events since seq 0: ${events.length}`);
    for (const evt of events) {
      log(`    seq=${evt.sequence} ${evt.operation} ${evt.table}/${evt.rowId}`);
    }
    log('');

    log('=== Demo Complete ===');
  } finally {
    // Cleanup: stop all nodes and remove temp directories.
    log('Shutting down...');
    for (const mesh of meshes) {
      await mesh.stop();
    }
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    log('Done.');
  }
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
