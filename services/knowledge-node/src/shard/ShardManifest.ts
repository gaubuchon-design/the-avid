/**
 * @module ShardManifest
 *
 * Types and pure functions for creating, validating, serialising, and
 * deserialising shard manifests. A shard manifest is a JSON sidecar
 * file that lives alongside the SQLite database and describes the
 * shard's identity, schema version, ownership, and replication state.
 *
 * The {@link ShardManifestData} interface mirrors the shape of
 * `ShardManifest` in `@mcua/contracts` but is defined locally to keep
 * the DB layer independent of the contracts package.
 */

import { createHash } from 'node:crypto';
import { v4 as uuid } from 'uuid';
import type { KnowledgeDB } from '../db/KnowledgeDB.js';

// ─── Nested Types ───────────────────────────────────────────────────────────

/** Local lease info — mirrors `LeaseInfo` in contracts. */
export interface LeaseInfoData {
  shardId: string;
  holderId: string;
  acquiredAt: string;
  expiresAt: string;
  renewalCount: number;
}

/** Local replication state — mirrors `ReplicationState` in contracts. */
export interface ReplicationStateData {
  shardId: string;
  sourceNodeId: string;
  targetNodeId: string;
  lastSequence: number;
  lag: number;
  status: 'synced' | 'catching-up' | 'stale' | 'error';
}

// ─── Manifest Data ──────────────────────────────────────────────────────────

/**
 * Shard manifest data structure.
 *
 * This is a plain data object (no class methods) that is directly
 * JSON-serialisable.
 */
export interface ShardManifestData {
  /** Unique shard identifier (UUID v4). */
  shardId: string;
  /** Project this shard belongs to. */
  projectId: string;
  /** Role in the replication topology. */
  type: 'primary' | 'replica' | 'archive';
  /** User or service account that owns this shard. */
  ownerId: string;
  /** Schema version of the shard's internal data model. */
  schemaVersion: number;
  /** Content-addressable checksum of the shard data. */
  checksum: string;
  /** Current writer lease, or `null` if no writer is active. */
  writerLease: LeaseInfoData | null;
  /** Current replication state, or `null` for standalone shards. */
  replicationState: ReplicationStateData | null;
  /** Media root paths linked to assets within this shard. */
  linkedMediaRoots: string[];
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-update timestamp. */
  updatedAt: string;
}

/** Options for {@link createManifest}. */
export interface CreateManifestOptions {
  /** Shard role. Defaults to `'primary'`. */
  type?: 'primary' | 'replica' | 'archive';
  /** Owner identifier. Defaults to `'local'`. */
  ownerId?: string;
  /** Schema version. Defaults to `1`. */
  schemaVersion?: number;
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Create a new shard manifest with sensible defaults.
 *
 * @param projectId - The project this shard belongs to.
 * @param shardId   - Optional shard ID. A UUID v4 is generated if omitted.
 * @param options   - Optional configuration overrides.
 * @returns A new {@link ShardManifestData} instance.
 */
export function createManifest(
  projectId: string,
  shardId?: string,
  options?: CreateManifestOptions,
): ShardManifestData {
  const now = new Date().toISOString();
  return {
    shardId: shardId ?? uuid(),
    projectId,
    type: options?.type ?? 'primary',
    ownerId: options?.ownerId ?? 'local',
    schemaVersion: options?.schemaVersion ?? 1,
    checksum: '',
    writerLease: null,
    replicationState: null,
    linkedMediaRoots: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate a manifest for structural correctness.
 *
 * Checks that all required fields are present and have reasonable types.
 * This is a shallow validation — it does not verify checksums or
 * cross-reference the database.
 *
 * @param manifest - The manifest to validate.
 * @returns `true` if valid, `false` otherwise.
 */
export function validateManifest(manifest: unknown): manifest is ShardManifestData {
  if (manifest === null || typeof manifest !== 'object') return false;

  const m = manifest as Record<string, unknown>;

  // Required string fields
  const requiredStrings: string[] = [
    'shardId',
    'projectId',
    'type',
    'ownerId',
    'createdAt',
    'updatedAt',
  ];
  for (const field of requiredStrings) {
    if (typeof m[field] !== 'string' || (m[field] as string).length === 0) {
      return false;
    }
  }

  // Type must be one of the allowed values
  if (!['primary', 'replica', 'archive'].includes(m['type'] as string)) {
    return false;
  }

  // Schema version must be a positive integer
  if (typeof m['schemaVersion'] !== 'number' || m['schemaVersion'] < 1) {
    return false;
  }

  // Checksum must be a string (may be empty for new manifests)
  if (typeof m['checksum'] !== 'string') {
    return false;
  }

  // linkedMediaRoots must be an array
  if (!Array.isArray(m['linkedMediaRoots'])) {
    return false;
  }

  return true;
}

// ─── Checksum ───────────────────────────────────────────────────────────────

/**
 * Compute a SHA-256 checksum over the shard metadata.
 *
 * The checksum is derived from the shard_meta row's `shard_id`,
 * `project_id`, and `schema_version` fields concatenated with a pipe
 * separator. This provides a lightweight integrity fingerprint for the
 * shard without hashing the entire database.
 *
 * @param db - An open {@link KnowledgeDB} instance.
 * @returns A hex-encoded SHA-256 digest string.
 */
export function computeChecksum(db: KnowledgeDB): string {
  const meta = db.getShardMeta();
  if (!meta) {
    return createHash('sha256').update('empty').digest('hex');
  }

  const payload = [
    meta.shardId,
    meta.projectId,
    String(meta.schemaVersion),
    meta.createdAt,
  ].join('|');

  return createHash('sha256').update(payload).digest('hex');
}

// ─── Serialisation ──────────────────────────────────────────────────────────

/**
 * Serialise a manifest to a pretty-printed JSON string.
 *
 * @param manifest - The manifest to serialise.
 * @returns A JSON string with 2-space indentation.
 */
export function serializeManifest(manifest: ShardManifestData): string {
  return JSON.stringify(manifest, null, 2);
}

/**
 * Deserialise a JSON string into a {@link ShardManifestData} object.
 *
 * @param json - The JSON string to parse.
 * @returns The parsed manifest data.
 * @throws {Error} If the JSON is invalid or the manifest fails validation.
 */
export function deserializeManifest(json: string): ShardManifestData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(
      `Failed to parse manifest JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!validateManifest(parsed)) {
    throw new Error('Invalid manifest: structural validation failed');
  }

  return parsed;
}
