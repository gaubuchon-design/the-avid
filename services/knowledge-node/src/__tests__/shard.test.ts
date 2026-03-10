/**
 * @module shard.test
 *
 * Tests for ShardManifest functions and ShardManager lifecycle
 * operations: create, open, list, split, verify, and delete.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ShardManager } from '../shard/ShardManager.js';
import {
  createManifest,
  validateManifest,
  serializeManifest,
  deserializeManifest,
  computeChecksum,
} from '../shard/ShardManifest.js';
import { KnowledgeDB, vectorToBuffer, type AssetRow } from '../db/KnowledgeDB.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

let tmpDir: string;

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
    relativePath: 'clips/TestClip.mxf',
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

// ─── Setup / Teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shard-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─── ShardManifest Functions ────────────────────────────────────────────────

describe('ShardManifest', () => {
  describe('createManifest', () => {
    it('should create a manifest with default values', () => {
      const m = createManifest('project-1');
      expect(m.projectId).toBe('project-1');
      expect(m.shardId).toBeTruthy();
      expect(m.type).toBe('primary');
      expect(m.ownerId).toBe('local');
      expect(m.schemaVersion).toBe(1);
      expect(m.checksum).toBe('');
      expect(m.writerLease).toBeNull();
      expect(m.replicationState).toBeNull();
      expect(m.linkedMediaRoots).toEqual([]);
      expect(m.createdAt).toBeTruthy();
      expect(m.updatedAt).toBeTruthy();
    });

    it('should accept a custom shard ID and options', () => {
      const m = createManifest('proj', 'custom-shard', {
        type: 'archive',
        ownerId: 'admin',
        schemaVersion: 2,
      });
      expect(m.shardId).toBe('custom-shard');
      expect(m.type).toBe('archive');
      expect(m.ownerId).toBe('admin');
      expect(m.schemaVersion).toBe(2);
    });
  });

  describe('validateManifest', () => {
    it('should accept a valid manifest', () => {
      const m = createManifest('project-1');
      expect(validateManifest(m)).toBe(true);
    });

    it('should reject null', () => {
      expect(validateManifest(null)).toBe(false);
    });

    it('should reject an object missing required fields', () => {
      expect(validateManifest({ shardId: 'x' })).toBe(false);
    });

    it('should reject invalid type values', () => {
      const m = { ...createManifest('p'), type: 'invalid' };
      expect(validateManifest(m)).toBe(false);
    });

    it('should reject non-positive schema versions', () => {
      const m = { ...createManifest('p'), schemaVersion: 0 };
      expect(validateManifest(m)).toBe(false);
    });
  });

  describe('serialize / deserialize', () => {
    it('should round-trip a manifest through JSON', () => {
      const original = createManifest('project-1', 'shard-abc');
      const json = serializeManifest(original);
      const restored = deserializeManifest(json);

      expect(restored.shardId).toBe(original.shardId);
      expect(restored.projectId).toBe(original.projectId);
      expect(restored.type).toBe(original.type);
    });

    it('should throw on invalid JSON', () => {
      expect(() => deserializeManifest('not-json')).toThrow('Failed to parse');
    });

    it('should throw on structurally invalid manifest', () => {
      expect(() => deserializeManifest('{"foo":"bar"}')).toThrow(
        'structural validation failed',
      );
    });
  });

  describe('computeChecksum', () => {
    it('should return a hex string', () => {
      const dbPath = join(tmpDir, 'checksum-test.db');
      const db = new KnowledgeDB(dbPath);
      db.insertShardMeta({
        shardId: 's1',
        projectId: 'p1',
        schemaVersion: 1,
        checksum: '',
        createdAt: new Date().toISOString(),
      });

      const checksum = computeChecksum(db);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
      db.close();
    });

    it('should return a consistent checksum for the same data', () => {
      const dbPath = join(tmpDir, 'checksum-test2.db');
      const db = new KnowledgeDB(dbPath);
      db.insertShardMeta({
        shardId: 's1',
        projectId: 'p1',
        schemaVersion: 1,
        checksum: '',
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const c1 = computeChecksum(db);
      const c2 = computeChecksum(db);
      expect(c1).toBe(c2);
      db.close();
    });
  });
});

// ─── ShardManager ───────────────────────────────────────────────────────────

describe('ShardManager', () => {
  let manager: ShardManager;

  beforeEach(() => {
    manager = new ShardManager(tmpDir);
  });

  describe('createShard', () => {
    it('should create a shard directory with db and manifest', () => {
      const { db, manifest } = manager.createShard('test-project');
      expect(manifest.projectId).toBe('test-project');
      expect(manifest.shardId).toBeTruthy();
      expect(manifest.type).toBe('primary');

      // Files should exist on disk.
      const shardDir = join(tmpDir, manifest.shardId);
      expect(existsSync(join(shardDir, 'knowledge.db'))).toBe(true);
      expect(existsSync(join(shardDir, 'manifest.json'))).toBe(true);

      // DB should have shard_meta.
      const meta = db.getShardMeta();
      expect(meta).toBeDefined();
      expect(meta!.projectId).toBe('test-project');

      // Checksum should be populated.
      expect(manifest.checksum).toMatch(/^[a-f0-9]{64}$/);

      db.close();
    });

    it('should accept a custom shard ID', () => {
      const { db, manifest } = manager.createShard('proj', {
        shardId: 'my-custom-shard',
      });
      expect(manifest.shardId).toBe('my-custom-shard');
      expect(existsSync(join(tmpDir, 'my-custom-shard', 'knowledge.db'))).toBe(
        true,
      );
      db.close();
    });

    it('should throw if the shard already exists', () => {
      const { db } = manager.createShard('proj', { shardId: 'duplicate' });
      db.close();
      expect(() =>
        manager.createShard('proj', { shardId: 'duplicate' }),
      ).toThrow('already exists');
    });
  });

  describe('openShard', () => {
    it('should open an existing shard', () => {
      const { db: db1, manifest: m1 } = manager.createShard('proj');
      db1.close();

      const { db: db2, manifest: m2 } = manager.openShard(m1.shardId);
      expect(m2.shardId).toBe(m1.shardId);
      expect(m2.projectId).toBe('proj');
      db2.close();
    });

    it('should throw if the shard does not exist', () => {
      expect(() => manager.openShard('nonexistent')).toThrow('not found');
    });
  });

  describe('listShards', () => {
    it('should list all shards', () => {
      const { db: d1 } = manager.createShard('proj-a');
      const { db: d2 } = manager.createShard('proj-b');
      d1.close();
      d2.close();

      const shards = manager.listShards();
      expect(shards).toHaveLength(2);
      const projectIds = shards.map((s) => s.projectId).sort();
      expect(projectIds).toEqual(['proj-a', 'proj-b']);
    });

    it('should return empty array when no shards exist', () => {
      const emptyManager = new ShardManager(join(tmpDir, 'empty'));
      expect(emptyManager.listShards()).toEqual([]);
    });
  });

  describe('splitShard', () => {
    it('should split assets between two shards', () => {
      const { db, manifest } = manager.createShard('proj');
      const shardId = manifest.shardId;

      // Insert some assets.
      db.insertAsset(makeAsset({ id: 'interview-1', name: 'Interview 1', shardId }));
      db.insertAsset(makeAsset({ id: 'interview-2', name: 'Interview 2', shardId }));
      db.insertAsset(makeAsset({ id: 'broll-1', name: 'B-Roll 1', shardId }));

      // Add a transcript to one of the assets to test migration.
      db.insertTranscriptSegment({
        id: 'seg-1',
        assetId: 'interview-1',
        startTimeMs: 0,
        endTimeMs: 1000,
        text: 'Hello',
        confidence: 0.9,
        speakerId: null,
        speakerName: null,
        languageCode: 'en',
        wordsJson: null,
      });

      db.close();

      // Split: move interview-* to a new shard.
      const result = manager.splitShard(shardId, (id) =>
        id.startsWith('interview-'),
      );

      expect(result.shardA).toBe(shardId);
      expect(result.shardB).toBeTruthy();
      expect(result.shardB).not.toBe(shardId);

      // Verify source shard has only b-roll.
      const source = manager.openShard(result.shardA);
      const sourceAssets = source.db.listAssets();
      expect(sourceAssets).toHaveLength(1);
      expect(sourceAssets[0]!.id).toBe('broll-1');
      source.db.close();

      // Verify target shard has both interviews.
      const target = manager.openShard(result.shardB);
      const targetAssets = target.db.listAssets();
      expect(targetAssets).toHaveLength(2);
      const targetIds = targetAssets.map((a) => a.id).sort();
      expect(targetIds).toEqual(['interview-1', 'interview-2']);

      // Verify transcript was migrated.
      const segments = target.db.getTranscriptForAsset('interview-1');
      expect(segments).toHaveLength(1);
      expect(segments[0]!.text).toBe('Hello');
      target.db.close();
    });

    it('should throw if no assets match the predicate', () => {
      const { db, manifest } = manager.createShard('proj');
      db.insertAsset(makeAsset({ id: 'a1', shardId: manifest.shardId }));
      db.close();

      expect(() =>
        manager.splitShard(manifest.shardId, () => false),
      ).toThrow('No assets matched');
    });

    it('should throw if all assets match the predicate', () => {
      const { db, manifest } = manager.createShard('proj');
      db.insertAsset(makeAsset({ id: 'a1', shardId: manifest.shardId }));
      db.close();

      expect(() =>
        manager.splitShard(manifest.shardId, () => true),
      ).toThrow('All assets matched');
    });
  });

  describe('deleteShard', () => {
    it('should remove the shard directory', () => {
      const { db, manifest } = manager.createShard('proj');
      db.close();

      manager.deleteShard(manifest.shardId);
      expect(existsSync(join(tmpDir, manifest.shardId))).toBe(false);
    });

    it('should throw if the shard does not exist', () => {
      expect(() => manager.deleteShard('nonexistent')).toThrow('not found');
    });
  });

  describe('verifyIntegrity', () => {
    it('should report valid for a correctly created shard', () => {
      const { db, manifest } = manager.createShard('proj');
      db.close();

      const result = manager.verifyIntegrity(manifest.shardId);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report errors for a nonexistent shard', () => {
      const result = manager.verifyIntegrity('nonexistent');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should report errors if manifest is corrupted', () => {
      const { db, manifest } = manager.createShard('proj');
      db.close();

      // Corrupt the manifest.
      const manifestPath = join(tmpDir, manifest.shardId, 'manifest.json');
      const { writeFileSync } = require('node:fs');
      writeFileSync(manifestPath, 'INVALID JSON', 'utf-8');

      const result = manager.verifyIntegrity(manifest.shardId);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('manifest') || e.includes('Manifest'))).toBe(true);
    });
  });
});

// ─── Integration: ANN Index with Shard ──────────────────────────────────────

describe('ANN Index integration', () => {
  it('should build an index from shard embeddings', async () => {
    const manager = new ShardManager(tmpDir);
    const { db, manifest } = manager.createShard('proj');

    // Insert some embedding chunks.
    const { vectorToBuffer: v2b } = await import('../db/KnowledgeDB.js');
    const now = new Date().toISOString();
    db.insertEmbeddingChunk({
      id: 'emb-1',
      sourceId: 'src-1',
      sourceType: 'transcript',
      shardId: manifest.shardId,
      vector: v2b([1.0, 0.0, 0.0]),
      modelId: 'test-model',
      dimensions: 3,
      startTimeMs: null,
      endTimeMs: null,
      text: 'Hello',
      createdAt: now,
    });
    db.insertEmbeddingChunk({
      id: 'emb-2',
      sourceId: 'src-2',
      sourceType: 'vision',
      shardId: manifest.shardId,
      vector: v2b([0.0, 1.0, 0.0]),
      modelId: 'test-model',
      dimensions: 3,
      startTimeMs: null,
      endTimeMs: null,
      text: 'World',
      createdAt: now,
    });

    // Build index.
    const { IndexBuilder } = await import('../index/IndexBuilder.js');
    const builder = new IndexBuilder();
    const { index } = builder.buildIndex(db);

    expect(index.size()).toBe(2);

    // Search for something similar to the first vector.
    const results = index.search([0.9, 0.1, 0.0], 2);
    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe('emb-1'); // Should be the closest match.
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);

    db.close();
  });
});
