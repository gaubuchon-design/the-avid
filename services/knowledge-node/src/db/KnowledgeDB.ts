/**
 * @module KnowledgeDB
 *
 * Typed wrapper around a `better-sqlite3` database for the Project
 * Knowledge DB. Provides CRUD operations for every table defined in the
 * canonical schema, with prepared statements cached for performance.
 *
 * All public methods use local row-type interfaces that map directly to
 * SQL column names (snake_case in SQL, camelCase in TypeScript).
 * This module intentionally does **not** import from `@mcua/contracts`
 * to keep the DB layer self-contained.
 */

import Database from 'better-sqlite3';
import { migrate } from './migrations/001-initial.js';

// ─── Row Types ──────────────────────────────────────────────────────────────

/** Row representation for the `assets` table. */
export interface AssetRow {
  id: string;
  name: string;
  type: string;
  shardId: string;
  durationMs: number | null;
  fileSize: number;
  mediaRoot: string | null;
  relativePath: string | null;
  format: string | null;
  codec: string | null;
  resolutionW: number | null;
  resolutionH: number | null;
  frameRate: number | null;
  sampleRate: number | null;
  channels: number | null;
  checksum: string | null;
  approvalStatus: string;
  rightsJson: string | null;
  tagsJson: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Row representation for the `transcript_segments` table. */
export interface TranscriptSegmentRow {
  id: string;
  assetId: string;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
  confidence: number | null;
  speakerId: string | null;
  speakerName: string | null;
  languageCode: string | null;
  wordsJson: string | null;
}

/** Row representation for the `vision_events` table. */
export interface VisionEventRow {
  id: string;
  assetId: string;
  startTimeMs: number;
  endTimeMs: number;
  eventType: string;
  label: string | null;
  confidence: number | null;
  bboxJson: string | null;
  metadataJson: string | null;
}

/** Row representation for the `embedding_chunks` table. */
export interface EmbeddingChunkRow {
  id: string;
  sourceId: string;
  sourceType: string;
  shardId: string;
  /** Raw bytes of a Float32Array when reading; Float32Array.buffer or Buffer when writing. */
  vector: Buffer;
  modelId: string;
  dimensions: number;
  startTimeMs: number | null;
  endTimeMs: number | null;
  text: string | null;
  createdAt: string;
}

/** Row representation for the `markers_notes` table. */
export interface MarkerRow {
  id: string;
  assetId: string | null;
  sequenceId: string | null;
  timeMs: number | null;
  durationMs: number | null;
  label: string | null;
  color: string | null;
  category: string | null;
  userId: string | null;
  createdAt: string;
}

/** Row representation for the `playbooks` table. */
export interface PlaybookRow {
  id: string;
  name: string;
  description: string | null;
  stepsJson: string | null;
  triggerPattern: string | null;
  vertical: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Row representation for the `tool_traces` table. */
export interface ToolTraceRow {
  id: string;
  planId: string;
  stepIndex: number;
  toolName: string;
  toolArgsJson: string | null;
  status: string;
  resultJson: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  tokensCost: number;
}

/** Row representation for the `publish_variants` table. */
export interface PublishVariantRow {
  id: string;
  sequenceId: string;
  platform: string;
  deliverySpecJson: string | null;
  status: string;
  publishedUrl: string | null;
  publishedAt: string | null;
  metadataJson: string | null;
}

/** Row representation for the `shard_meta` table. */
export interface ShardMetaRow {
  shardId: string;
  projectId: string;
  schemaVersion: number;
  checksum: string;
  createdAt: string;
}

/** Aggregate row counts returned by {@link KnowledgeDB.getStats}. */
export interface DBStats {
  assets: number;
  transcriptSegments: number;
  visionEvents: number;
  embeddingChunks: number;
  markersNotes: number;
  playbooks: number;
  toolTraces: number;
  publishVariants: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convert a snake_case SQLite row into a camelCase TypeScript object.
 * Only handles one level of nesting (flat row objects).
 */
function snakeToCamel<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    out[camel] = value;
  }
  return out as T;
}

/**
 * Convert a camelCase TypeScript object into a snake_case mapping
 * suitable for SQL parameterised queries.
 */
function camelToSnake(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snake = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    out[snake] = value;
  }
  return out;
}

// ─── KnowledgeDB ────────────────────────────────────────────────────────────

/**
 * High-level wrapper around a `better-sqlite3` database that implements
 * all CRUD operations for the Knowledge DB schema.
 *
 * Usage:
 * ```ts
 * const db = new KnowledgeDB('/path/to/knowledge.db');
 * db.insertAsset({ id: 'a1', name: 'Clip', type: 'video', ... });
 * const asset = db.getAsset('a1');
 * db.close();
 * ```
 */
export class KnowledgeDB {
  /** The underlying `better-sqlite3` database handle. */
  readonly db: Database.Database;

  /** Whether the database connection has been closed. */
  private _closed = false;

  // ── Prepared statement cache ────────────────────────────────────────────

  // Assets
  private readonly stmtInsertAsset: Database.Statement;
  private readonly stmtGetAsset: Database.Statement;
  private readonly stmtListAssets: Database.Statement;
  private readonly stmtListAssetsByShard: Database.Statement;
  private readonly stmtDeleteAsset: Database.Statement;
  private readonly stmtSearchAssets: Database.Statement;

  // Transcript segments
  private readonly stmtInsertSegment: Database.Statement;
  private readonly stmtGetTranscriptForAsset: Database.Statement;
  private readonly stmtSearchTranscripts: Database.Statement;

  // Vision events
  private readonly stmtInsertVisionEvent: Database.Statement;
  private readonly stmtGetVisionEventsForAsset: Database.Statement;

  // Embedding chunks
  private readonly stmtInsertEmbedding: Database.Statement;
  private readonly stmtGetEmbeddingsForSource: Database.Statement;
  private readonly stmtGetAllEmbeddings: Database.Statement;
  private readonly stmtGetAllEmbeddingsByShard: Database.Statement;

  // Markers
  private readonly stmtInsertMarker: Database.Statement;
  private readonly stmtGetMarkersForAsset: Database.Statement;
  private readonly stmtGetMarkersForSequence: Database.Statement;

  // Playbooks
  private readonly stmtInsertPlaybook: Database.Statement;
  private readonly stmtGetPlaybook: Database.Statement;
  private readonly stmtListPlaybooks: Database.Statement;

  // Tool traces
  private readonly stmtInsertToolTrace: Database.Statement;
  private readonly stmtGetTracesForPlan: Database.Statement;

  // Publish variants
  private readonly stmtInsertPublishVariant: Database.Statement;
  private readonly stmtGetVariantsForSequence: Database.Statement;

  // Shard meta
  private readonly stmtGetShardMeta: Database.Statement;
  private readonly stmtInsertShardMeta: Database.Statement;
  private readonly stmtUpdateShardMeta: Database.Statement;

  // Table counts (prepared with hard-coded table names for SQL injection safety)
  private readonly stmtCountAssets: Database.Statement;
  private readonly stmtCountTranscripts: Database.Statement;
  private readonly stmtCountVisionEvents: Database.Statement;
  private readonly stmtCountEmbeddings: Database.Statement;
  private readonly stmtCountMarkers: Database.Statement;
  private readonly stmtCountPlaybooks: Database.Statement;
  private readonly stmtCountToolTraces: Database.Statement;
  private readonly stmtCountPublishVariants: Database.Statement;

  /**
   * Open (or create) a Knowledge DB at the given path and run
   * outstanding migrations.
   *
   * @param dbPath - Filesystem path to the SQLite database file.
   */
  constructor(dbPath: string) {
    this.db = new Database(dbPath);

    // Performance and reliability pragmas
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('cache_size = -8000'); // 8 MB page cache

    // Run migrations
    migrate(this.db);

    // ── Prepare statements ────────────────────────────────────────────

    // Assets
    this.stmtInsertAsset = this.db.prepare(`
      INSERT INTO assets (
        id, name, type, shard_id, duration_ms, file_size,
        media_root, relative_path, format, codec,
        resolution_w, resolution_h, frame_rate, sample_rate, channels,
        checksum, approval_status, rights_json, tags_json,
        created_at, updated_at
      ) VALUES (
        @id, @name, @type, @shard_id, @duration_ms, @file_size,
        @media_root, @relative_path, @format, @codec,
        @resolution_w, @resolution_h, @frame_rate, @sample_rate, @channels,
        @checksum, @approval_status, @rights_json, @tags_json,
        @created_at, @updated_at
      )
    `);

    this.stmtGetAsset = this.db.prepare('SELECT * FROM assets WHERE id = ?');

    this.stmtListAssets = this.db.prepare(
      'SELECT * FROM assets ORDER BY created_at DESC',
    );

    this.stmtListAssetsByShard = this.db.prepare(
      'SELECT * FROM assets WHERE shard_id = ? ORDER BY created_at DESC',
    );

    this.stmtDeleteAsset = this.db.prepare('DELETE FROM assets WHERE id = ?');

    this.stmtSearchAssets = this.db.prepare(
      'SELECT * FROM assets WHERE name LIKE ? OR id LIKE ? ORDER BY created_at DESC',
    );

    // Transcript segments
    this.stmtInsertSegment = this.db.prepare(`
      INSERT INTO transcript_segments (
        id, asset_id, start_time_ms, end_time_ms, text,
        confidence, speaker_id, speaker_name, language_code, words_json
      ) VALUES (
        @id, @asset_id, @start_time_ms, @end_time_ms, @text,
        @confidence, @speaker_id, @speaker_name, @language_code, @words_json
      )
    `);

    this.stmtGetTranscriptForAsset = this.db.prepare(
      'SELECT * FROM transcript_segments WHERE asset_id = ? ORDER BY start_time_ms ASC',
    );

    this.stmtSearchTranscripts = this.db.prepare(
      'SELECT * FROM transcript_segments WHERE text LIKE ? ORDER BY start_time_ms ASC LIMIT ?',
    );

    // Vision events
    this.stmtInsertVisionEvent = this.db.prepare(`
      INSERT INTO vision_events (
        id, asset_id, start_time_ms, end_time_ms, event_type,
        label, confidence, bbox_json, metadata_json
      ) VALUES (
        @id, @asset_id, @start_time_ms, @end_time_ms, @event_type,
        @label, @confidence, @bbox_json, @metadata_json
      )
    `);

    this.stmtGetVisionEventsForAsset = this.db.prepare(
      'SELECT * FROM vision_events WHERE asset_id = ? ORDER BY start_time_ms ASC',
    );

    // Embedding chunks
    this.stmtInsertEmbedding = this.db.prepare(`
      INSERT INTO embedding_chunks (
        id, source_id, source_type, shard_id, vector,
        model_id, dimensions, start_time_ms, end_time_ms, text, created_at
      ) VALUES (
        @id, @source_id, @source_type, @shard_id, @vector,
        @model_id, @dimensions, @start_time_ms, @end_time_ms, @text, @created_at
      )
    `);

    this.stmtGetEmbeddingsForSource = this.db.prepare(
      'SELECT * FROM embedding_chunks WHERE source_id = ? ORDER BY start_time_ms ASC',
    );

    this.stmtGetAllEmbeddings = this.db.prepare(
      'SELECT * FROM embedding_chunks ORDER BY created_at ASC',
    );

    this.stmtGetAllEmbeddingsByShard = this.db.prepare(
      'SELECT * FROM embedding_chunks WHERE shard_id = ? ORDER BY created_at ASC',
    );

    // Markers
    this.stmtInsertMarker = this.db.prepare(`
      INSERT INTO markers_notes (
        id, asset_id, sequence_id, time_ms, duration_ms,
        label, color, category, user_id, created_at
      ) VALUES (
        @id, @asset_id, @sequence_id, @time_ms, @duration_ms,
        @label, @color, @category, @user_id, @created_at
      )
    `);

    this.stmtGetMarkersForAsset = this.db.prepare(
      'SELECT * FROM markers_notes WHERE asset_id = ? ORDER BY time_ms ASC',
    );

    this.stmtGetMarkersForSequence = this.db.prepare(
      'SELECT * FROM markers_notes WHERE sequence_id = ? ORDER BY time_ms ASC',
    );

    // Playbooks
    this.stmtInsertPlaybook = this.db.prepare(`
      INSERT INTO playbooks (
        id, name, description, steps_json, trigger_pattern,
        vertical, created_by, created_at, updated_at
      ) VALUES (
        @id, @name, @description, @steps_json, @trigger_pattern,
        @vertical, @created_by, @created_at, @updated_at
      )
    `);

    this.stmtGetPlaybook = this.db.prepare('SELECT * FROM playbooks WHERE id = ?');

    this.stmtListPlaybooks = this.db.prepare(
      'SELECT * FROM playbooks ORDER BY created_at DESC',
    );

    // Tool traces
    this.stmtInsertToolTrace = this.db.prepare(`
      INSERT INTO tool_traces (
        id, plan_id, step_index, tool_name, tool_args_json,
        status, result_json, error, started_at, completed_at,
        duration_ms, tokens_cost
      ) VALUES (
        @id, @plan_id, @step_index, @tool_name, @tool_args_json,
        @status, @result_json, @error, @started_at, @completed_at,
        @duration_ms, @tokens_cost
      )
    `);

    this.stmtGetTracesForPlan = this.db.prepare(
      'SELECT * FROM tool_traces WHERE plan_id = ? ORDER BY step_index ASC',
    );

    // Publish variants
    this.stmtInsertPublishVariant = this.db.prepare(`
      INSERT INTO publish_variants (
        id, sequence_id, platform, delivery_spec_json,
        status, published_url, published_at, metadata_json
      ) VALUES (
        @id, @sequence_id, @platform, @delivery_spec_json,
        @status, @published_url, @published_at, @metadata_json
      )
    `);

    this.stmtGetVariantsForSequence = this.db.prepare(
      'SELECT * FROM publish_variants WHERE sequence_id = ? ORDER BY platform ASC',
    );

    // Shard meta
    this.stmtGetShardMeta = this.db.prepare(
      'SELECT * FROM shard_meta LIMIT 1',
    );

    this.stmtInsertShardMeta = this.db.prepare(`
      INSERT INTO shard_meta (shard_id, project_id, schema_version, checksum, created_at)
      VALUES (@shard_id, @project_id, @schema_version, @checksum, @created_at)
    `);

    this.stmtUpdateShardMeta = this.db.prepare(`
      UPDATE shard_meta SET checksum = @checksum WHERE shard_id = @shard_id
    `);

    // Count statements — prepared with hard-coded table names
    this.stmtCountAssets = this.db.prepare('SELECT COUNT(*) AS cnt FROM assets');
    this.stmtCountTranscripts = this.db.prepare('SELECT COUNT(*) AS cnt FROM transcript_segments');
    this.stmtCountVisionEvents = this.db.prepare('SELECT COUNT(*) AS cnt FROM vision_events');
    this.stmtCountEmbeddings = this.db.prepare('SELECT COUNT(*) AS cnt FROM embedding_chunks');
    this.stmtCountMarkers = this.db.prepare('SELECT COUNT(*) AS cnt FROM markers_notes');
    this.stmtCountPlaybooks = this.db.prepare('SELECT COUNT(*) AS cnt FROM playbooks');
    this.stmtCountToolTraces = this.db.prepare('SELECT COUNT(*) AS cnt FROM tool_traces');
    this.stmtCountPublishVariants = this.db.prepare('SELECT COUNT(*) AS cnt FROM publish_variants');
  }

  // ── Close ───────────────────────────────────────────────────────────────

  /** Close the database connection and release all resources. */
  close(): void {
    if (this._closed) return;
    this._closed = true;
    this.db.close();
  }

  /** Whether the database connection has been closed. */
  get isClosed(): boolean {
    return this._closed;
  }

  /**
   * Ensure the database is open before performing operations.
   * @throws {Error} if the database has been closed.
   */
  private ensureOpen(): void {
    if (this._closed) {
      throw new Error('Database connection has been closed.');
    }
  }

  // ── Assets ──────────────────────────────────────────────────────────────

  /**
   * Insert a new asset into the database.
   *
   * @param asset - The asset row to insert. All camelCase fields are
   *   automatically converted to snake_case for SQL.
   */
  insertAsset(asset: AssetRow): void {
    this.ensureOpen();
    const now = new Date().toISOString();
    this.stmtInsertAsset.run(
      camelToSnake({
        ...asset,
        createdAt: asset.createdAt || now,
        updatedAt: asset.updatedAt || now,
      }),
    );
  }

  /**
   * Retrieve a single asset by ID.
   *
   * @param id - The unique asset identifier.
   * @returns The asset row, or `undefined` if not found.
   */
  getAsset(id: string): AssetRow | undefined {
    this.ensureOpen();
    const row = this.stmtGetAsset.get(id) as Record<string, unknown> | undefined;
    return row ? snakeToCamel<AssetRow>(row) : undefined;
  }

  /**
   * List all assets, optionally filtered by shard ID.
   *
   * @param shardId - If provided, only return assets in this shard.
   */
  listAssets(shardId?: string): AssetRow[] {
    const rows = shardId
      ? (this.stmtListAssetsByShard.all(shardId) as Record<string, unknown>[])
      : (this.stmtListAssets.all() as Record<string, unknown>[]);
    return rows.map((r) => snakeToCamel<AssetRow>(r));
  }

  /** Allow-listed column names for the assets table to prevent SQL injection. */
  private static readonly ALLOWED_ASSET_COLUMNS: ReadonlySet<string> = new Set([
    'name', 'type', 'shard_id', 'duration_ms', 'file_size',
    'media_root', 'relative_path', 'format', 'codec',
    'resolution_w', 'resolution_h', 'frame_rate', 'sample_rate', 'channels',
    'checksum', 'approval_status', 'rights_json', 'tags_json',
    'created_at', 'updated_at',
  ]);

  /**
   * Update specific fields of an existing asset.
   *
   * Column names are validated against an allow-list to prevent SQL
   * injection through dynamic field keys.
   *
   * @param id - The asset ID to update.
   * @param fields - Partial asset data with only the fields to change.
   */
  updateAsset(id: string, fields: Partial<AssetRow>): void {
    const snakeFields = camelToSnake(fields as Record<string, unknown>);
    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(snakeFields)) {
      if (key === 'id') continue;
      // Validate column name against allow-list to prevent SQL injection
      if (!KnowledgeDB.ALLOWED_ASSET_COLUMNS.has(key)) {
        continue; // Skip unknown column names silently
      }
      setClauses.push(`${key} = ?`);
      values.push(value);
    }

    if (setClauses.length === 0) return;

    // Always update the updated_at timestamp.
    setClauses.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    this.db
      .prepare(`UPDATE assets SET ${setClauses.join(', ')} WHERE id = ?`)
      .run(...values);
  }

  /**
   * Delete an asset and all cascade-linked child records.
   *
   * @param id - The asset ID to delete.
   */
  deleteAsset(id: string): void {
    this.stmtDeleteAsset.run(id);
  }

  /**
   * Search assets by name or ID using a LIKE pattern.
   *
   * @param query - The search query string. Wildcards are added
   *   automatically around the query.
   */
  searchAssets(query: string): AssetRow[] {
    const pattern = `%${query}%`;
    const rows = this.stmtSearchAssets.all(pattern, pattern) as Record<string, unknown>[];
    return rows.map((r) => snakeToCamel<AssetRow>(r));
  }

  // ── Transcript Segments ─────────────────────────────────────────────────

  /**
   * Insert a transcript segment.
   *
   * @param seg - The transcript segment row data.
   */
  insertTranscriptSegment(seg: TranscriptSegmentRow): void {
    this.stmtInsertSegment.run(camelToSnake(seg as unknown as Record<string, unknown>));
  }

  /**
   * Get all transcript segments for an asset, ordered by start time.
   *
   * @param assetId - The asset ID to query.
   */
  getTranscriptForAsset(assetId: string): TranscriptSegmentRow[] {
    const rows = this.stmtGetTranscriptForAsset.all(assetId) as Record<string, unknown>[];
    return rows.map((r) => snakeToCamel<TranscriptSegmentRow>(r));
  }

  /**
   * Full-text search over transcript segment text.
   *
   * @param text - The search text. Wildcards are added automatically.
   * @param limit - Maximum number of results (default: 100).
   */
  searchTranscripts(text: string, limit: number = 100): TranscriptSegmentRow[] {
    const pattern = `%${text}%`;
    const rows = this.stmtSearchTranscripts.all(pattern, limit) as Record<string, unknown>[];
    return rows.map((r) => snakeToCamel<TranscriptSegmentRow>(r));
  }

  // ── Vision Events ───────────────────────────────────────────────────────

  /**
   * Insert a vision event.
   *
   * @param evt - The vision event row data.
   */
  insertVisionEvent(evt: VisionEventRow): void {
    this.stmtInsertVisionEvent.run(camelToSnake(evt as unknown as Record<string, unknown>));
  }

  /**
   * Get all vision events for an asset, ordered by start time.
   *
   * @param assetId - The asset ID to query.
   */
  getVisionEventsForAsset(assetId: string): VisionEventRow[] {
    const rows = this.stmtGetVisionEventsForAsset.all(assetId) as Record<string, unknown>[];
    return rows.map((r) => snakeToCamel<VisionEventRow>(r));
  }

  // ── Embedding Chunks ────────────────────────────────────────────────────

  /**
   * Insert an embedding chunk.
   *
   * The `vector` field should be a `Buffer` containing raw Float32 bytes.
   * Use {@link vectorToBuffer} to convert a `number[]` or `Float32Array`.
   *
   * @param chunk - The embedding chunk row data.
   */
  insertEmbeddingChunk(chunk: EmbeddingChunkRow): void {
    const now = new Date().toISOString();
    this.stmtInsertEmbedding.run(
      camelToSnake({
        ...(chunk as unknown as Record<string, unknown>),
        createdAt: chunk.createdAt || now,
      }),
    );
  }

  /**
   * Get all embedding chunks for a given source record.
   *
   * @param sourceId - The source record ID.
   */
  getEmbeddingsForSource(sourceId: string): EmbeddingChunkRow[] {
    const rows = this.stmtGetEmbeddingsForSource.all(sourceId) as Record<string, unknown>[];
    return rows.map((r) => snakeToCamel<EmbeddingChunkRow>(r));
  }

  /**
   * Get all embedding chunks, optionally filtered by shard ID.
   *
   * @param shardId - If provided, only return chunks in this shard.
   */
  getAllEmbeddings(shardId?: string): EmbeddingChunkRow[] {
    const rows = shardId
      ? (this.stmtGetAllEmbeddingsByShard.all(shardId) as Record<string, unknown>[])
      : (this.stmtGetAllEmbeddings.all() as Record<string, unknown>[]);
    return rows.map((r) => snakeToCamel<EmbeddingChunkRow>(r));
  }

  // ── Markers ─────────────────────────────────────────────────────────────

  /**
   * Insert a marker or note.
   *
   * @param marker - The marker row data.
   */
  insertMarker(marker: MarkerRow): void {
    const now = new Date().toISOString();
    this.stmtInsertMarker.run(
      camelToSnake({
        ...(marker as unknown as Record<string, unknown>),
        createdAt: marker.createdAt || now,
      }),
    );
  }

  /**
   * Get all markers for an asset, ordered by time.
   *
   * @param assetId - The asset ID to query.
   */
  getMarkersForAsset(assetId: string): MarkerRow[] {
    const rows = this.stmtGetMarkersForAsset.all(assetId) as Record<string, unknown>[];
    return rows.map((r) => snakeToCamel<MarkerRow>(r));
  }

  /**
   * Get all markers for a sequence, ordered by time.
   *
   * @param seqId - The sequence ID to query.
   */
  getMarkersForSequence(seqId: string): MarkerRow[] {
    const rows = this.stmtGetMarkersForSequence.all(seqId) as Record<string, unknown>[];
    return rows.map((r) => snakeToCamel<MarkerRow>(r));
  }

  // ── Playbooks ───────────────────────────────────────────────────────────

  /**
   * Insert a playbook.
   *
   * @param pb - The playbook row data.
   */
  insertPlaybook(pb: PlaybookRow): void {
    const now = new Date().toISOString();
    this.stmtInsertPlaybook.run(
      camelToSnake({
        ...(pb as unknown as Record<string, unknown>),
        createdAt: pb.createdAt || now,
        updatedAt: pb.updatedAt || now,
      }),
    );
  }

  /**
   * Retrieve a playbook by ID.
   *
   * @param id - The playbook ID.
   * @returns The playbook row, or `undefined` if not found.
   */
  getPlaybook(id: string): PlaybookRow | undefined {
    const row = this.stmtGetPlaybook.get(id) as Record<string, unknown> | undefined;
    return row ? snakeToCamel<PlaybookRow>(row) : undefined;
  }

  /**
   * List all playbooks, ordered by creation date (newest first).
   */
  listPlaybooks(): PlaybookRow[] {
    const rows = this.stmtListPlaybooks.all() as Record<string, unknown>[];
    return rows.map((r) => snakeToCamel<PlaybookRow>(r));
  }

  // ── Tool Traces ─────────────────────────────────────────────────────────

  /**
   * Insert a tool trace record.
   *
   * @param trace - The tool trace row data.
   */
  insertToolTrace(trace: ToolTraceRow): void {
    this.stmtInsertToolTrace.run(camelToSnake(trace as unknown as Record<string, unknown>));
  }

  /**
   * Get all tool traces for a plan, ordered by step index.
   *
   * @param planId - The plan ID to query.
   */
  getTracesForPlan(planId: string): ToolTraceRow[] {
    const rows = this.stmtGetTracesForPlan.all(planId) as Record<string, unknown>[];
    return rows.map((r) => snakeToCamel<ToolTraceRow>(r));
  }

  // ── Publish Variants ────────────────────────────────────────────────────

  /**
   * Insert a publish variant.
   *
   * @param v - The publish variant row data.
   */
  insertPublishVariant(v: PublishVariantRow): void {
    this.stmtInsertPublishVariant.run(camelToSnake(v as unknown as Record<string, unknown>));
  }

  /**
   * Get all publish variants for a sequence, ordered by platform.
   *
   * @param seqId - The sequence ID to query.
   */
  getVariantsForSequence(seqId: string): PublishVariantRow[] {
    const rows = this.stmtGetVariantsForSequence.all(seqId) as Record<string, unknown>[];
    return rows.map((r) => snakeToCamel<PublishVariantRow>(r));
  }

  // ── Shard Meta ──────────────────────────────────────────────────────────

  /**
   * Get the shard metadata row.
   *
   * @returns The shard meta row, or `undefined` if not set.
   */
  getShardMeta(): ShardMetaRow | undefined {
    const row = this.stmtGetShardMeta.get() as Record<string, unknown> | undefined;
    return row ? snakeToCamel<ShardMetaRow>(row) : undefined;
  }

  /**
   * Insert shard metadata. Should be called once when a shard is created.
   *
   * @param meta - The shard metadata row.
   */
  insertShardMeta(meta: ShardMetaRow): void {
    this.stmtInsertShardMeta.run(camelToSnake(meta as unknown as Record<string, unknown>));
  }

  /**
   * Update the shard checksum.
   *
   * @param shardId - The shard ID.
   * @param checksum - The new checksum value.
   */
  updateShardChecksum(shardId: string, checksum: string): void {
    this.stmtUpdateShardMeta.run({ shard_id: shardId, checksum });
  }

  // ── Utility ─────────────────────────────────────────────────────────────

  /**
   * Get row counts for every data table.
   *
   * Uses prepared statements with hard-coded table names to prevent
   * any possibility of SQL injection.
   *
   * @returns An object with counts per table.
   */
  getStats(): DBStats {
    this.ensureOpen();
    const getCount = (stmt: Database.Statement): number => {
      const row = stmt.get() as { cnt: number };
      return row.cnt;
    };

    return {
      assets: getCount(this.stmtCountAssets),
      transcriptSegments: getCount(this.stmtCountTranscripts),
      visionEvents: getCount(this.stmtCountVisionEvents),
      embeddingChunks: getCount(this.stmtCountEmbeddings),
      markersNotes: getCount(this.stmtCountMarkers),
      playbooks: getCount(this.stmtCountPlaybooks),
      toolTraces: getCount(this.stmtCountToolTraces),
      publishVariants: getCount(this.stmtCountPublishVariants),
    };
  }

  /**
   * Run SQLite VACUUM to reclaim unused space and compact the database.
   */
  vacuum(): void {
    this.ensureOpen();
    this.db.exec('VACUUM');
  }
}

// ─── Vector Helpers ─────────────────────────────────────────────────────────

/**
 * Convert a number array to a Buffer for BLOB storage.
 *
 * @param vector - The vector as `number[]` or `Float32Array`.
 * @returns A Node.js Buffer wrapping the Float32 bytes.
 */
export function vectorToBuffer(vector: number[] | Float32Array): Buffer {
  const f32 = vector instanceof Float32Array ? vector : new Float32Array(vector);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

/**
 * Convert a BLOB Buffer back to a Float32Array.
 *
 * @param buf - The raw buffer read from the database.
 * @returns The reconstructed Float32Array.
 */
export function bufferToVector(buf: Buffer): Float32Array {
  // Create a copy to avoid issues with shared ArrayBuffer slices.
  const copy = new ArrayBuffer(buf.byteLength);
  const view = new Uint8Array(copy);
  view.set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  return new Float32Array(copy);
}
