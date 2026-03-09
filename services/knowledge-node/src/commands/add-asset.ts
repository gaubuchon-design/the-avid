/**
 * @module add-asset
 *
 * CLI command that adds a media asset entry to an existing shard.
 * The command reads basic file metadata (name, size) from the
 * filesystem and inserts an asset row into the Knowledge DB.
 *
 * Usage:
 * ```
 * tsx src/cli.ts add-asset --shard-id <id> --path /path/to/clip.mxf --data-dir ./data
 * ```
 */

import { statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { v4 as uuid } from 'uuid';
import { ShardManager } from '../shard/ShardManager.js';
import type { AssetRow } from '../db/KnowledgeDB.js';

/**
 * Infer a basic media type from a file extension.
 *
 * @param ext - The file extension (e.g. `.mxf`, `.wav`, `.jpg`).
 * @returns A media type string.
 */
function inferMediaType(ext: string): string {
  const lower = ext.toLowerCase().replace('.', '');
  const videoExts = ['mxf', 'mov', 'mp4', 'mkv', 'avi', 'webm', 'prores', 'dnxhd'];
  const audioExts = ['wav', 'mp3', 'aac', 'flac', 'ogg', 'aiff', 'm4a'];
  const imageExts = ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'bmp', 'webp', 'gif', 'svg'];

  if (videoExts.includes(lower)) return 'video';
  if (audioExts.includes(lower)) return 'audio';
  if (imageExts.includes(lower)) return 'image';
  return 'document';
}

/**
 * Add an asset to an existing shard.
 *
 * @param shardId   - The target shard ID.
 * @param assetPath - Filesystem path to the media file.
 * @param dataDir   - Root directory where shards are stored.
 * @returns The newly created asset ID.
 */
export function addAsset(shardId: string, assetPath: string, dataDir: string): string {
  const manager = new ShardManager(dataDir);
  const { db } = manager.openShard(shardId);

  try {
    const stat = statSync(assetPath);
    const name = basename(assetPath);
    const ext = extname(assetPath);
    const type = inferMediaType(ext);
    const assetId = uuid();
    const now = new Date().toISOString();

    const asset: AssetRow = {
      id: assetId,
      name,
      type,
      shardId,
      durationMs: null,
      fileSize: stat.size,
      mediaRoot: null,
      relativePath: assetPath,
      format: ext.replace('.', '').toLowerCase() || null,
      codec: null,
      resolutionW: null,
      resolutionH: null,
      frameRate: null,
      sampleRate: null,
      channels: null,
      checksum: null,
      approvalStatus: 'pending',
      rightsJson: null,
      tagsJson: null,
      createdAt: now,
      updatedAt: now,
    };

    db.insertAsset(asset);

    console.log(`[add-asset] Added asset "${name}" (${type}) as ${assetId}`);
    console.log(`[add-asset] File size: ${stat.size} bytes`);
    return assetId;
  } finally {
    db.close();
  }
}
