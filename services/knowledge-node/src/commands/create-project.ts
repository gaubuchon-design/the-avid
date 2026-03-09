/**
 * @module create-project
 *
 * CLI command that creates a new project shard with an empty Knowledge
 * DB and a populated shard_meta row.
 *
 * Usage:
 * ```
 * tsx src/cli.ts create-project --name "My Project" --data-dir ./data
 * ```
 */

import { ShardManager } from '../shard/ShardManager.js';

/**
 * Create a new project shard.
 *
 * @param name    - Human-readable project name (stored as the project ID).
 * @param dataDir - Filesystem directory where shards are stored.
 * @returns The shard ID of the newly created project.
 */
export function createProject(name: string, dataDir: string): string {
  const manager = new ShardManager(dataDir);
  const { db, manifest } = manager.createShard(name);

  try {
    console.log(`[create-project] Created shard "${manifest.shardId}" for project "${name}"`);
    console.log(`[create-project] Database: ${dataDir}/${manifest.shardId}/knowledge.db`);
    console.log(`[create-project] Manifest: ${dataDir}/${manifest.shardId}/manifest.json`);
    return manifest.shardId;
  } finally {
    db.close();
  }
}
