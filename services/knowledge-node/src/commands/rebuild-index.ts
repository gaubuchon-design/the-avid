/**
 * @module rebuild-index
 *
 * CLI command that rebuilds the ANN index for a shard from its
 * embedding chunks. The resulting index is saved as a JSON sidecar
 * file alongside the shard database.
 *
 * Usage:
 * ```
 * tsx src/cli.ts rebuild-index --shard-id <id> --data-dir ./data
 * ```
 */

import { join } from 'node:path';
import { ShardManager } from '../shard/ShardManager.js';
import { IndexBuilder } from '../index/IndexBuilder.js';

/** Filename for the serialised ANN index within a shard directory. */
const INDEX_FILENAME = 'ann-index.json';

/**
 * Rebuild the ANN index for a shard.
 *
 * Reads all embedding chunks from the shard's Knowledge DB and builds
 * a brute-force ANN index, then saves it to disk.
 *
 * @param shardId - The shard ID to rebuild the index for.
 * @param dataDir - Root directory where shards are stored.
 * @returns The number of vectors in the rebuilt index.
 */
export function rebuildIndex(shardId: string, dataDir: string): number {
  const manager = new ShardManager(dataDir);
  const { db } = manager.openShard(shardId);

  try {
    const builder = new IndexBuilder();
    const index = builder.buildIndex(db);
    const indexPath = join(dataDir, shardId, INDEX_FILENAME);

    index.save(indexPath);

    const vectorCount = index.size();
    console.log(`[rebuild-index] Built index with ${vectorCount} vectors`);
    console.log(`[rebuild-index] Saved to: ${indexPath}`);
    return vectorCount;
  } finally {
    db.close();
  }
}
