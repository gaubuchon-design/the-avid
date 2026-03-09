/**
 * @module split-shard
 *
 * CLI command that splits a shard by moving assets whose IDs match a
 * glob-like pattern into a new shard.
 *
 * Usage:
 * ```
 * tsx src/cli.ts split-shard \
 *   --shard-id <id> --pattern "interview-*" --data-dir ./data
 * ```
 *
 * The pattern uses simple wildcard matching (`*` matches any sequence
 * of characters). Assets whose IDs or names match the pattern are
 * migrated to the new shard.
 */

import { ShardManager } from '../shard/ShardManager.js';

/**
 * Convert a simple glob pattern to a RegExp.
 *
 * Supports `*` (matches any characters) and `?` (matches a single
 * character). All other regex-special characters are escaped.
 *
 * @param pattern - The glob pattern string.
 * @returns A compiled RegExp.
 */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Split a shard by moving matching assets to a new shard.
 *
 * @param shardId      - The source shard ID.
 * @param assetPattern - A glob pattern to match asset IDs/names.
 * @param dataDir      - Root directory where shards are stored.
 * @returns An object containing the two resulting shard IDs.
 */
export function splitShard(
  shardId: string,
  assetPattern: string,
  dataDir: string,
): { shardA: string; shardB: string } {
  const manager = new ShardManager(dataDir);
  const regex = globToRegExp(assetPattern);

  // We need to read the asset names to match against the pattern,
  // since the predicate only receives the asset ID. Pre-load the
  // asset list to build a lookup.
  const { db } = manager.openShard(shardId);
  const assets = db.listAssets();
  db.close();

  const matchingIds = new Set(
    assets.filter((a) => regex.test(a.id) || regex.test(a.name)).map((a) => a.id),
  );

  if (matchingIds.size === 0) {
    throw new Error(`No assets matched pattern "${assetPattern}"`);
  }

  console.log(
    `[split-shard] ${matchingIds.size} of ${assets.length} assets match pattern "${assetPattern}"`,
  );

  const result = manager.splitShard(shardId, (id) => matchingIds.has(id));

  console.log(`[split-shard] Source shard (remaining): ${result.shardA}`);
  console.log(`[split-shard] New shard (migrated):     ${result.shardB}`);

  return result;
}
