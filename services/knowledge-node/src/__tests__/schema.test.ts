/**
 * @module schema.test
 *
 * Tests for the Knowledge DB schema, migration system, and CRUD
 * operations on every table.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  KnowledgeDB,
  vectorToBuffer,
  bufferToVector,
  type AssetRow,
  type TranscriptSegmentRow,
  type VisionEventRow,
  type EmbeddingChunkRow,
  type MarkerRow,
  type PlaybookRow,
  type ToolTraceRow,
  type PublishVariantRow,
} from '../db/KnowledgeDB.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

let tmpDir: string;
let db: KnowledgeDB;

function makeDbPath(): string {
  return join(tmpDir, 'test.db');
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
    mediaRoot: '/Volumes/Media',
    relativePath: 'project/clips/TestClip.mxf',
    format: 'mxf',
    codec: 'dnxhd',
    resolutionW: 1920,
    resolutionH: 1080,
    frameRate: 29.97,
    sampleRate: 48000,
    channels: 2,
    checksum: 'abc123',
    approvalStatus: 'pending',
    rightsJson: JSON.stringify({ license: 'MIT', owner: 'Test' }),
    tagsJson: JSON.stringify(['interview', 'b-roll']),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'kdb-test-'));
  db = new KnowledgeDB(makeDbPath());
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Migration Tests ────────────────────────────────────────────────────────

describe('Migration', () => {
  it('should create all expected tables', () => {
    const tables = db.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('assets');
    expect(tableNames).toContain('transcript_segments');
    expect(tableNames).toContain('vision_events');
    expect(tableNames).toContain('embedding_chunks');
    expect(tableNames).toContain('markers_notes');
    expect(tableNames).toContain('playbooks');
    expect(tableNames).toContain('tool_traces');
    expect(tableNames).toContain('publish_variants');
    expect(tableNames).toContain('shard_meta');
    expect(tableNames).toContain('_migrations');
  });

  it('should record the migration in _migrations', () => {
    const rows = db.db
      .prepare('SELECT name FROM _migrations')
      .all() as Array<{ name: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('001-initial');
  });

  it('should be idempotent — re-opening does not fail', () => {
    db.close();
    const db2 = new KnowledgeDB(makeDbPath());
    const rows = db2.db
      .prepare('SELECT name FROM _migrations')
      .all() as Array<{ name: string }>;
    expect(rows).toHaveLength(1);
    db2.close();
  });
});

// ─── Assets ─────────────────────────────────────────────────────────────────

describe('Assets', () => {
  it('should insert and retrieve an asset', () => {
    const asset = makeAsset();
    db.insertAsset(asset);

    const retrieved = db.getAsset('asset-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe('asset-1');
    expect(retrieved!.name).toBe('Test Clip.mxf');
    expect(retrieved!.type).toBe('video');
    expect(retrieved!.shardId).toBe('shard-1');
    expect(retrieved!.durationMs).toBe(30000);
    expect(retrieved!.fileSize).toBe(1048576);
    expect(retrieved!.frameRate).toBeCloseTo(29.97);
  });

  it('should list all assets', () => {
    db.insertAsset(makeAsset({ id: 'a1', name: 'Clip A' }));
    db.insertAsset(makeAsset({ id: 'a2', name: 'Clip B' }));
    const all = db.listAssets();
    expect(all).toHaveLength(2);
  });

  it('should list assets filtered by shard', () => {
    db.insertAsset(makeAsset({ id: 'a1', shardId: 'shard-1' }));
    db.insertAsset(makeAsset({ id: 'a2', shardId: 'shard-2' }));
    const filtered = db.listAssets('shard-1');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.id).toBe('a1');
  });

  it('should update asset fields', () => {
    db.insertAsset(makeAsset());
    db.updateAsset('asset-1', { approvalStatus: 'approved', name: 'Renamed' });
    const updated = db.getAsset('asset-1');
    expect(updated!.approvalStatus).toBe('approved');
    expect(updated!.name).toBe('Renamed');
  });

  it('should delete an asset', () => {
    db.insertAsset(makeAsset());
    db.deleteAsset('asset-1');
    expect(db.getAsset('asset-1')).toBeUndefined();
  });

  it('should search assets by name', () => {
    db.insertAsset(makeAsset({ id: 'a1', name: 'Interview Day1' }));
    db.insertAsset(makeAsset({ id: 'a2', name: 'B-Roll Park' }));
    const results = db.searchAssets('Interview');
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('Interview Day1');
  });
});

// ─── Transcript Segments ────────────────────────────────────────────────────

describe('Transcript Segments', () => {
  beforeEach(() => {
    db.insertAsset(makeAsset());
  });

  it('should insert and retrieve transcript segments', () => {
    const seg: TranscriptSegmentRow = {
      id: 'seg-1',
      assetId: 'asset-1',
      startTimeMs: 0,
      endTimeMs: 3500,
      text: 'Hello world',
      confidence: 0.95,
      speakerId: 'spk-1',
      speakerName: 'Host',
      languageCode: 'en',
      wordsJson: JSON.stringify([
        { text: 'Hello', startTime: 0, endTime: 0.5, confidence: 0.99 },
        { text: 'world', startTime: 0.5, endTime: 1.0, confidence: 0.92 },
      ]),
    };
    db.insertTranscriptSegment(seg);

    const segments = db.getTranscriptForAsset('asset-1');
    expect(segments).toHaveLength(1);
    expect(segments[0]!.text).toBe('Hello world');
    expect(segments[0]!.confidence).toBeCloseTo(0.95);
    expect(segments[0]!.speakerName).toBe('Host');
  });

  it('should search transcript text', () => {
    db.insertTranscriptSegment({
      id: 'seg-1',
      assetId: 'asset-1',
      startTimeMs: 0,
      endTimeMs: 1000,
      text: 'The quick brown fox',
      confidence: 0.9,
      speakerId: null,
      speakerName: null,
      languageCode: 'en',
      wordsJson: null,
    });
    db.insertTranscriptSegment({
      id: 'seg-2',
      assetId: 'asset-1',
      startTimeMs: 1000,
      endTimeMs: 2000,
      text: 'jumps over the lazy dog',
      confidence: 0.88,
      speakerId: null,
      speakerName: null,
      languageCode: 'en',
      wordsJson: null,
    });

    const results = db.searchTranscripts('quick');
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('seg-1');
  });

  it('should cascade delete segments when asset is deleted', () => {
    db.insertTranscriptSegment({
      id: 'seg-1',
      assetId: 'asset-1',
      startTimeMs: 0,
      endTimeMs: 1000,
      text: 'Test segment',
      confidence: null,
      speakerId: null,
      speakerName: null,
      languageCode: null,
      wordsJson: null,
    });

    db.deleteAsset('asset-1');
    const segments = db.getTranscriptForAsset('asset-1');
    expect(segments).toHaveLength(0);
  });
});

// ─── Vision Events ──────────────────────────────────────────────────────────

describe('Vision Events', () => {
  beforeEach(() => {
    db.insertAsset(makeAsset());
  });

  it('should insert and retrieve vision events', () => {
    const evt: VisionEventRow = {
      id: 'vis-1',
      assetId: 'asset-1',
      startTimeMs: 5000,
      endTimeMs: 5500,
      eventType: 'scene-change',
      label: 'Cut to wide shot',
      confidence: 0.87,
      bboxJson: null,
      metadataJson: JSON.stringify({ detector: 'scenedetect-v2' }),
    };
    db.insertVisionEvent(evt);

    const events = db.getVisionEventsForAsset('asset-1');
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe('scene-change');
    expect(events[0]!.label).toBe('Cut to wide shot');
  });
});

// ─── Embedding Chunks ───────────────────────────────────────────────────────

describe('Embedding Chunks', () => {
  it('should insert and retrieve embedding chunks with vector BLOBs', () => {
    const vector = [0.1, 0.2, 0.3, 0.4];
    const chunk: EmbeddingChunkRow = {
      id: 'emb-1',
      sourceId: 'seg-1',
      sourceType: 'transcript',
      shardId: 'shard-1',
      vector: vectorToBuffer(vector),
      modelId: 'bge-m3',
      dimensions: 4,
      startTimeMs: 0,
      endTimeMs: 1000,
      text: 'Hello world',
      createdAt: new Date().toISOString(),
    };
    db.insertEmbeddingChunk(chunk);

    const retrieved = db.getEmbeddingsForSource('seg-1');
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0]!.modelId).toBe('bge-m3');
    expect(retrieved[0]!.dimensions).toBe(4);

    // Verify the vector round-trips correctly.
    const roundTripped = bufferToVector(retrieved[0]!.vector);
    expect(roundTripped.length).toBe(4);
    expect(roundTripped[0]).toBeCloseTo(0.1);
    expect(roundTripped[1]).toBeCloseTo(0.2);
    expect(roundTripped[2]).toBeCloseTo(0.3);
    expect(roundTripped[3]).toBeCloseTo(0.4);
  });

  it('should list all embeddings and filter by shard', () => {
    const buf = vectorToBuffer([1, 2, 3]);
    const now = new Date().toISOString();

    db.insertEmbeddingChunk({
      id: 'e1',
      sourceId: 's1',
      sourceType: 'transcript',
      shardId: 'shard-1',
      vector: buf,
      modelId: 'test',
      dimensions: 3,
      startTimeMs: null,
      endTimeMs: null,
      text: null,
      createdAt: now,
    });
    db.insertEmbeddingChunk({
      id: 'e2',
      sourceId: 's2',
      sourceType: 'vision',
      shardId: 'shard-2',
      vector: buf,
      modelId: 'test',
      dimensions: 3,
      startTimeMs: null,
      endTimeMs: null,
      text: null,
      createdAt: now,
    });

    expect(db.getAllEmbeddings()).toHaveLength(2);
    expect(db.getAllEmbeddings('shard-1')).toHaveLength(1);
  });
});

// ─── Markers ────────────────────────────────────────────────────────────────

describe('Markers', () => {
  it('should insert and retrieve markers for an asset', () => {
    db.insertAsset(makeAsset());
    const marker: MarkerRow = {
      id: 'marker-1',
      assetId: 'asset-1',
      sequenceId: null,
      timeMs: 15000,
      durationMs: 500,
      label: 'Good take',
      color: '#00ff00',
      category: 'selects',
      userId: 'user-1',
      createdAt: new Date().toISOString(),
    };
    db.insertMarker(marker);

    const markers = db.getMarkersForAsset('asset-1');
    expect(markers).toHaveLength(1);
    expect(markers[0]!.label).toBe('Good take');
    expect(markers[0]!.color).toBe('#00ff00');
  });

  it('should retrieve markers for a sequence', () => {
    const marker: MarkerRow = {
      id: 'marker-seq-1',
      assetId: null,
      sequenceId: 'seq-1',
      timeMs: 5000,
      durationMs: null,
      label: 'Chapter 1',
      color: '#ff0000',
      category: 'chapter',
      userId: 'user-1',
      createdAt: new Date().toISOString(),
    };
    db.insertMarker(marker);

    const markers = db.getMarkersForSequence('seq-1');
    expect(markers).toHaveLength(1);
    expect(markers[0]!.label).toBe('Chapter 1');
  });
});

// ─── Playbooks ──────────────────────────────────────────────────────────────

describe('Playbooks', () => {
  it('should insert, retrieve, and list playbooks', () => {
    const now = new Date().toISOString();
    const pb: PlaybookRow = {
      id: 'pb-1',
      name: 'Social Highlight',
      description: 'Auto-generate social media highlight clips',
      stepsJson: JSON.stringify([
        { action: 'find-highlights', params: { minDuration: 15 } },
        { action: 'add-lower-third', params: { template: 'default' } },
      ]),
      triggerPattern: 'highlight*',
      vertical: 'sports',
      createdBy: 'user-1',
      createdAt: now,
      updatedAt: now,
    };
    db.insertPlaybook(pb);

    const retrieved = db.getPlaybook('pb-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe('Social Highlight');
    expect(retrieved!.vertical).toBe('sports');

    const all = db.listPlaybooks();
    expect(all).toHaveLength(1);
  });
});

// ─── Tool Traces ────────────────────────────────────────────────────────────

describe('Tool Traces', () => {
  it('should insert and retrieve tool traces by plan', () => {
    const trace: ToolTraceRow = {
      id: 'trace-1',
      planId: 'plan-1',
      stepIndex: 0,
      toolName: 'transcribe',
      toolArgsJson: JSON.stringify({ assetId: 'a1', language: 'en' }),
      status: 'completed',
      resultJson: JSON.stringify({ segmentCount: 42 }),
      error: null,
      startedAt: '2024-01-01T00:00:00Z',
      completedAt: '2024-01-01T00:00:05Z',
      durationMs: 5000,
      tokensCost: 150.5,
    };
    db.insertToolTrace(trace);

    const traces = db.getTracesForPlan('plan-1');
    expect(traces).toHaveLength(1);
    expect(traces[0]!.toolName).toBe('transcribe');
    expect(traces[0]!.status).toBe('completed');
    expect(traces[0]!.tokensCost).toBeCloseTo(150.5);
  });
});

// ─── Publish Variants ───────────────────────────────────────────────────────

describe('Publish Variants', () => {
  it('should insert and retrieve publish variants by sequence', () => {
    const variant: PublishVariantRow = {
      id: 'pv-1',
      sequenceId: 'seq-1',
      platform: 'youtube',
      deliverySpecJson: JSON.stringify({
        format: 'mp4',
        codec: 'h264',
        resolution: { width: 1920, height: 1080 },
      }),
      status: 'draft',
      publishedUrl: null,
      publishedAt: null,
      metadataJson: JSON.stringify({ title: 'My Video' }),
    };
    db.insertPublishVariant(variant);

    const variants = db.getVariantsForSequence('seq-1');
    expect(variants).toHaveLength(1);
    expect(variants[0]!.platform).toBe('youtube');
    expect(variants[0]!.status).toBe('draft');
  });
});

// ─── Shard Meta ─────────────────────────────────────────────────────────────

describe('Shard Meta', () => {
  it('should insert and retrieve shard metadata', () => {
    db.insertShardMeta({
      shardId: 'shard-test',
      projectId: 'project-1',
      schemaVersion: 1,
      checksum: 'deadbeef',
      createdAt: new Date().toISOString(),
    });

    const meta = db.getShardMeta();
    expect(meta).toBeDefined();
    expect(meta!.shardId).toBe('shard-test');
    expect(meta!.projectId).toBe('project-1');
    expect(meta!.checksum).toBe('deadbeef');
  });

  it('should update the shard checksum', () => {
    db.insertShardMeta({
      shardId: 'shard-test',
      projectId: 'project-1',
      schemaVersion: 1,
      checksum: 'old',
      createdAt: new Date().toISOString(),
    });
    db.updateShardChecksum('shard-test', 'new-checksum');

    const meta = db.getShardMeta();
    expect(meta!.checksum).toBe('new-checksum');
  });
});

// ─── Stats & Utility ────────────────────────────────────────────────────────

describe('Utility', () => {
  it('should return correct stats', () => {
    db.insertAsset(makeAsset());
    db.insertAsset(makeAsset({ id: 'asset-2', name: 'Clip 2' }));

    const stats = db.getStats();
    expect(stats.assets).toBe(2);
    expect(stats.transcriptSegments).toBe(0);
    expect(stats.visionEvents).toBe(0);
    expect(stats.embeddingChunks).toBe(0);
    expect(stats.markersNotes).toBe(0);
    expect(stats.playbooks).toBe(0);
    expect(stats.toolTraces).toBe(0);
    expect(stats.publishVariants).toBe(0);
  });

  it('should vacuum without error', () => {
    expect(() => db.vacuum()).not.toThrow();
  });
});

// ─── Vector Helpers ─────────────────────────────────────────────────────────

describe('Vector Helpers', () => {
  it('should round-trip vectors through Buffer', () => {
    const original = [0.123, -0.456, 0.789, 1.0, 0.0];
    const buf = vectorToBuffer(original);
    const restored = bufferToVector(buf);

    expect(restored.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(restored[i]).toBeCloseTo(original[i]!, 5);
    }
  });

  it('should handle Float32Array input', () => {
    const f32 = new Float32Array([1.1, 2.2, 3.3]);
    const buf = vectorToBuffer(f32);
    const restored = bufferToVector(buf);
    expect(restored.length).toBe(3);
    expect(restored[0]).toBeCloseTo(1.1, 5);
  });
});
