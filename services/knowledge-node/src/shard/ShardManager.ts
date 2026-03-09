/**
 * @module ShardManager
 *
 * Manages the lifecycle of Knowledge DB shards on disk. Each shard is
 * stored as a directory containing:
 *
 * ```
 * {dataDir}/{shardId}/
 *   knowledge.db      — SQLite database
 *   manifest.json     — Shard manifest metadata
 * ```
 *
 * The ShardManager provides operations for creating, opening, listing,
 * splitting, deleting, and verifying shards.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { v4 as uuid } from 'uuid';
import { KnowledgeDB } from '../db/KnowledgeDB.js';
import {
  computeChecksum,
  createManifest,
  deserializeManifest,
  serializeManifest,
  validateManifest,
  type CreateManifestOptions,
  type ShardManifestData,
} from './ShardManifest.js';

/** The SQLite database filename within a shard directory. */
const DB_FILENAME = 'knowledge.db';
/** The manifest JSON filename within a shard directory. */
const MANIFEST_FILENAME = 'manifest.json';

/** Options passed when creating a new shard. */
export interface CreateShardOptions extends CreateManifestOptions {
  /** Pre-defined shard ID. A UUID v4 is generated if omitted. */
  shardId?: string;
}

/** Result of opening or creating a shard. */
export interface ShardHandle {
  /** The open database instance. Caller is responsible for closing. */
  db: KnowledgeDB;
  /** The shard manifest data. */
  manifest: ShardManifestData;
}

/** Result of a shard integrity verification. */
export interface IntegrityResult {
  /** `true` if the shard passes all checks. */
  valid: boolean;
  /** Human-readable error descriptions for any failed checks. */
  errors: string[];
}

/**
 * Manages Knowledge DB shards within a data directory.
 *
 * Usage:
 * ```ts
 * const mgr = new ShardManager('/data/shards');
 * const { db, manifest } = mgr.createShard('my-project');
 * db.insertAsset({ ... });
 * db.close();
 * ```
 */
export class ShardManager {
  /** Root directory where all shards are stored. */
  private readonly dataDir: string;

  /**
   * @param dataDir - Filesystem path to the shards root directory.
   *   Created automatically if it does not exist.
   */
  constructor(dataDir: string) {
    this.dataDir = dataDir;
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
  }

  // ── Paths ───────────────────────────────────────────────────────────────

  /** Get the directory path for a shard. */
  private shardDir(shardId: string): string {
    return join(this.dataDir, shardId);
  }

  /** Get the database file path for a shard. */
  private dbPath(shardId: string): string {
    return join(this.shardDir(shardId), DB_FILENAME);
  }

  /** Get the manifest file path for a shard. */
  private manifestPath(shardId: string): string {
    return join(this.shardDir(shardId), MANIFEST_FILENAME);
  }

  // ── Create ──────────────────────────────────────────────────────────────

  /**
   * Create a new shard with an empty database and a manifest sidecar.
   *
   * @param projectId - The project this shard belongs to.
   * @param options   - Optional creation overrides (shard ID, type, etc.).
   * @returns A handle containing the open database and manifest.
   * @throws {Error} If a shard with the given ID already exists.
   */
  createShard(projectId: string, options?: CreateShardOptions): ShardHandle {
    const shardId = options?.shardId ?? uuid();
    const dir = this.shardDir(shardId);

    if (existsSync(dir)) {
      throw new Error(`Shard directory already exists: ${dir}`);
    }

    mkdirSync(dir, { recursive: true });

    // Create the database and run migrations.
    const db = new KnowledgeDB(this.dbPath(shardId));

    // Insert shard metadata row.
    db.insertShardMeta({
      shardId,
      projectId,
      schemaVersion: options?.schemaVersion ?? 1,
      checksum: '',
      createdAt: new Date().toISOString(),
    });

    // Compute checksum and update.
    const checksum = computeChecksum(db);
    db.updateShardChecksum(shardId, checksum);

    // Create manifest.
    const manifest = createManifest(projectId, shardId, options);
    manifest.checksum = checksum;
    writeFileSync(this.manifestPath(shardId), serializeManifest(manifest), 'utf-8');

    return { db, manifest };
  }

  // ── Open ────────────────────────────────────────────────────────────────

  /**
   * Open an existing shard.
   *
   * @param shardId - The shard ID to open.
   * @returns A handle containing the open database and manifest.
   * @throws {Error} If the shard directory, database, or manifest is missing.
   */
  openShard(shardId: string): ShardHandle {
    const dir = this.shardDir(shardId);
    if (!existsSync(dir)) {
      throw new Error(`Shard not found: ${dir}`);
    }

    const dbFile = this.dbPath(shardId);
    if (!existsSync(dbFile)) {
      throw new Error(`Database file not found: ${dbFile}`);
    }

    const manifestFile = this.manifestPath(shardId);
    if (!existsSync(manifestFile)) {
      throw new Error(`Manifest file not found: ${manifestFile}`);
    }

    const db = new KnowledgeDB(dbFile);
    const manifestJson = readFileSync(manifestFile, 'utf-8');
    const manifest = deserializeManifest(manifestJson);

    return { db, manifest };
  }

  // ── List ────────────────────────────────────────────────────────────────

  /**
   * List all shards in the data directory.
   *
   * Reads the manifest.json from each shard directory. Directories
   * that lack a valid manifest are silently skipped.
   *
   * @returns An array of shard manifest data objects.
   */
  listShards(): ShardManifestData[] {
    if (!existsSync(this.dataDir)) return [];

    const entries = readdirSync(this.dataDir, { withFileTypes: true });
    const manifests: ShardManifestData[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const manifestFile = join(this.dataDir, entry.name, MANIFEST_FILENAME);
      if (!existsSync(manifestFile)) continue;

      try {
        const json = readFileSync(manifestFile, 'utf-8');
        const manifest = deserializeManifest(json);
        manifests.push(manifest);
      } catch {
        // Skip invalid manifests.
      }
    }

    return manifests;
  }

  // ── Split ───────────────────────────────────────────────────────────────

  /**
   * Split a shard by moving assets that match a predicate to a new shard.
   *
   * Assets matching the predicate are copied to the new shard and
   * deleted from the original. Related records (transcript segments,
   * vision events, embedding chunks, markers) are migrated along with
   * their parent assets because of CASCADE deletes on the original and
   * explicit re-insertion into the new shard.
   *
   * @param shardId   - The source shard to split.
   * @param predicate - A function that returns `true` for asset IDs
   *   that should be moved to the new shard.
   * @returns The IDs of the two resulting shards (original and new).
   * @throws {Error} If the source shard does not exist or has no assets
   *   matching the predicate.
   */
  splitShard(
    shardId: string,
    predicate: (assetId: string) => boolean,
  ): { shardA: string; shardB: string } {
    const source = this.openShard(shardId);
    const sourceAssets = source.db.listAssets();
    const movingAssets = sourceAssets.filter((a) => predicate(a.id));

    if (movingAssets.length === 0) {
      source.db.close();
      throw new Error('No assets matched the split predicate');
    }

    if (movingAssets.length === sourceAssets.length) {
      source.db.close();
      throw new Error('All assets matched the split predicate — nothing would remain in the source shard');
    }

    // Create the target shard.
    const target = this.createShard(source.manifest.projectId);

    try {
      // Migrate each asset and its dependent records.
      for (const asset of movingAssets) {
        // Re-home the asset into the new shard.
        const newAsset = { ...asset, shardId: target.manifest.shardId };
        target.db.insertAsset(newAsset);

        // Transcript segments
        const segments = source.db.getTranscriptForAsset(asset.id);
        for (const seg of segments) {
          target.db.insertTranscriptSegment(seg);
        }

        // Vision events
        const visionEvents = source.db.getVisionEventsForAsset(asset.id);
        for (const evt of visionEvents) {
          target.db.insertVisionEvent(evt);
        }

        // Embedding chunks (by source_id matching the asset ID)
        const embeddings = source.db.getEmbeddingsForSource(asset.id);
        for (const emb of embeddings) {
          const newEmb = { ...emb, shardId: target.manifest.shardId };
          target.db.insertEmbeddingChunk(newEmb);
        }

        // Markers
        const markers = source.db.getMarkersForAsset(asset.id);
        for (const marker of markers) {
          target.db.insertMarker(marker);
        }

        // Delete from source (CASCADE handles transcripts and vision events).
        source.db.deleteAsset(asset.id);
      }

      // Update checksums.
      const sourceChecksum = computeChecksum(source.db);
      source.db.updateShardChecksum(shardId, sourceChecksum);

      const targetChecksum = computeChecksum(target.db);
      target.db.updateShardChecksum(target.manifest.shardId, targetChecksum);

      // Update manifests on disk.
      source.manifest.checksum = sourceChecksum;
      source.manifest.updatedAt = new Date().toISOString();
      writeFileSync(
        this.manifestPath(shardId),
        serializeManifest(source.manifest),
        'utf-8',
      );

      target.manifest.checksum = targetChecksum;
      target.manifest.updatedAt = new Date().toISOString();
      writeFileSync(
        this.manifestPath(target.manifest.shardId),
        serializeManifest(target.manifest),
        'utf-8',
      );

      return {
        shardA: shardId,
        shardB: target.manifest.shardId,
      };
    } finally {
      source.db.close();
      target.db.close();
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────

  /**
   * Delete a shard and all its data from disk.
   *
   * @param shardId - The shard ID to delete.
   * @throws {Error} If the shard directory does not exist.
   */
  deleteShard(shardId: string): void {
    const dir = this.shardDir(shardId);
    if (!existsSync(dir)) {
      throw new Error(`Shard not found: ${dir}`);
    }
    rmSync(dir, { recursive: true, force: true });
  }

  // ── Compact ────────────────────────────────────────────────────────────

  /**
   * Compact a shard by vacuuming the underlying SQLite database and
   * recomputing the manifest checksum.
   *
   * This reclaims free pages left behind after DELETE operations and
   * defragments the database file on disk.
   *
   * @param shardId - The shard to compact.
   * @returns An object with the database page count before and after compaction.
   * @throws {Error} If the shard does not exist.
   */
  compactShard(shardId: string): { beforePages: number; afterPages: number } {
    const handle = this.openShard(shardId);
    let beforePages = 0;
    let afterPages = 0;

    try {
      // SQLite page_count gives us a size proxy
      const beforeResult = handle.db.db.pragma('page_count') as Array<{ page_count: number }>;
      beforePages = beforeResult[0]?.page_count ?? 0;

      handle.db.vacuum();

      const afterResult = handle.db.db.pragma('page_count') as Array<{ page_count: number }>;
      afterPages = afterResult[0]?.page_count ?? 0;

      // Recompute and persist checksum
      const checksum = computeChecksum(handle.db);
      handle.db.updateShardChecksum(shardId, checksum);

      handle.manifest.checksum = checksum;
      handle.manifest.updatedAt = new Date().toISOString();
      writeFileSync(
        this.manifestPath(shardId),
        serializeManifest(handle.manifest),
        'utf-8',
      );
    } finally {
      handle.db.close();
    }

    return { beforePages, afterPages };
  }

  // ── Exists ─────────────────────────────────────────────────────────────

  /**
   * Check whether a shard with the given ID exists on disk.
   *
   * @param shardId - The shard identifier to check.
   * @returns `true` if the shard directory exists.
   */
  shardExists(shardId: string): boolean {
    return existsSync(this.shardDir(shardId));
  }

  // ── Integrity ───────────────────────────────────────────────────────────

  /**
   * Verify the structural integrity of a shard.
   *
   * Checks:
   * 1. Shard directory exists
   * 2. Database file exists and is openable
   * 3. Manifest file exists and is valid JSON
   * 4. Shard meta row exists in the database
   * 5. Manifest shardId matches the database shard_meta.shard_id
   * 6. Schema version in manifest matches the database
   * 7. SQLite integrity check passes
   *
   * @param shardId - The shard ID to verify.
   * @returns An {@link IntegrityResult} with validity status and errors.
   */
  verifyIntegrity(shardId: string): IntegrityResult {
    const errors: string[] = [];

    // 1. Directory
    const dir = this.shardDir(shardId);
    if (!existsSync(dir)) {
      return { valid: false, errors: [`Shard directory not found: ${dir}`] };
    }

    // 2. Database file
    const dbFile = this.dbPath(shardId);
    if (!existsSync(dbFile)) {
      errors.push(`Database file not found: ${dbFile}`);
      return { valid: false, errors };
    }

    let db: KnowledgeDB | null = null;
    try {
      db = new KnowledgeDB(dbFile);
    } catch (err) {
      errors.push(
        `Failed to open database: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { valid: false, errors };
    }

    try {
      // 3. Manifest file
      const manifestFile = this.manifestPath(shardId);
      let manifest: ShardManifestData | null = null;

      if (!existsSync(manifestFile)) {
        errors.push(`Manifest file not found: ${manifestFile}`);
      } else {
        try {
          const json = readFileSync(manifestFile, 'utf-8');
          const parsed = JSON.parse(json);
          if (validateManifest(parsed)) {
            manifest = parsed;
          } else {
            errors.push('Manifest failed structural validation');
          }
        } catch (err) {
          errors.push(
            `Failed to read manifest: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // 4. Shard meta row
      const meta = db.getShardMeta();
      if (!meta) {
        errors.push('No shard_meta row found in database');
      }

      // 5. Shard ID consistency
      if (manifest && meta && manifest.shardId !== meta.shardId) {
        errors.push(
          `Shard ID mismatch: manifest="${manifest.shardId}" vs db="${meta.shardId}"`,
        );
      }

      // 6. Schema version consistency
      if (manifest && meta && manifest.schemaVersion !== meta.schemaVersion) {
        errors.push(
          `Schema version mismatch: manifest=${manifest.schemaVersion} vs db=${meta.schemaVersion}`,
        );
      }

      // 7. SQLite integrity check
      try {
        const result = db.db.pragma('integrity_check') as Array<{ integrity_check: string }>;
        const ok = result.length === 1 && result[0]?.integrity_check === 'ok';
        if (!ok) {
          errors.push(
            `SQLite integrity check failed: ${result.map((r) => r.integrity_check).join(', ')}`,
          );
        }
      } catch (err) {
        errors.push(
          `SQLite integrity check error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } finally {
      db.close();
    }

    return { valid: errors.length === 0, errors };
  }
}
