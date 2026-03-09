-- ---------------------------------------------------------------------------
-- Project Knowledge DB — Canonical Schema
-- ---------------------------------------------------------------------------
-- This is the source-of-truth schema for a single Knowledge DB shard.
-- Each shard is a self-contained SQLite database that stores all project
-- metadata: assets, transcripts, vision events, embeddings, markers,
-- playbooks, tool traces, and publish variants.
--
-- Schema version: 1
-- ---------------------------------------------------------------------------

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Migrations tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS _migrations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  applied_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Shard metadata (single-row table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shard_meta (
  shard_id        TEXT    NOT NULL PRIMARY KEY,
  project_id      TEXT    NOT NULL,
  schema_version  INTEGER NOT NULL DEFAULT 1,
  checksum        TEXT    NOT NULL DEFAULT '',
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Assets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assets (
  id              TEXT    NOT NULL PRIMARY KEY,
  name            TEXT    NOT NULL,
  type            TEXT    NOT NULL,   -- 'audio' | 'video' | 'image' | 'document'
  shard_id        TEXT    NOT NULL,
  duration_ms     INTEGER,
  file_size       INTEGER NOT NULL DEFAULT 0,
  media_root      TEXT,
  relative_path   TEXT,
  format          TEXT,
  codec           TEXT,
  resolution_w    INTEGER,
  resolution_h    INTEGER,
  frame_rate      REAL,
  sample_rate     INTEGER,
  channels        INTEGER,
  checksum        TEXT,
  approval_status TEXT    NOT NULL DEFAULT 'pending',
  rights_json     TEXT,               -- JSON-serialised RightsInfo
  tags_json       TEXT,               -- JSON array of strings
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_assets_shard_id       ON assets (shard_id);
CREATE INDEX IF NOT EXISTS idx_assets_type           ON assets (type);
CREATE INDEX IF NOT EXISTS idx_assets_approval       ON assets (approval_status);
CREATE INDEX IF NOT EXISTS idx_assets_created_at     ON assets (created_at);
CREATE INDEX IF NOT EXISTS idx_assets_name           ON assets (name);

-- ---------------------------------------------------------------------------
-- Transcript segments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transcript_segments (
  id              TEXT    NOT NULL PRIMARY KEY,
  asset_id        TEXT    NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  start_time_ms   INTEGER NOT NULL,
  end_time_ms     INTEGER NOT NULL,
  text            TEXT    NOT NULL DEFAULT '',
  confidence      REAL,
  speaker_id      TEXT,
  speaker_name    TEXT,
  language_code   TEXT,
  words_json      TEXT,               -- JSON array of Word objects
  CONSTRAINT chk_time CHECK (end_time_ms >= start_time_ms)
);

CREATE INDEX IF NOT EXISTS idx_transcript_asset_id   ON transcript_segments (asset_id);
CREATE INDEX IF NOT EXISTS idx_transcript_start_ms   ON transcript_segments (start_time_ms);
CREATE INDEX IF NOT EXISTS idx_transcript_end_ms     ON transcript_segments (end_time_ms);
CREATE INDEX IF NOT EXISTS idx_transcript_speaker    ON transcript_segments (speaker_id);

-- ---------------------------------------------------------------------------
-- Vision events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vision_events (
  id              TEXT    NOT NULL PRIMARY KEY,
  asset_id        TEXT    NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  start_time_ms   INTEGER NOT NULL,
  end_time_ms     INTEGER NOT NULL,
  event_type      TEXT    NOT NULL,   -- 'scene-change' | 'face-detect' | 'object-detect' | 'text-ocr'
  label           TEXT,
  confidence      REAL,
  bbox_json       TEXT,               -- JSON bounding box { x, y, w, h }
  metadata_json   TEXT,               -- JSON arbitrary metadata
  CONSTRAINT chk_vision_time CHECK (end_time_ms >= start_time_ms)
);

CREATE INDEX IF NOT EXISTS idx_vision_asset_id       ON vision_events (asset_id);
CREATE INDEX IF NOT EXISTS idx_vision_event_type     ON vision_events (event_type);
CREATE INDEX IF NOT EXISTS idx_vision_start_ms       ON vision_events (start_time_ms);
CREATE INDEX IF NOT EXISTS idx_vision_end_ms         ON vision_events (end_time_ms);

-- ---------------------------------------------------------------------------
-- Embedding chunks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS embedding_chunks (
  id              TEXT    NOT NULL PRIMARY KEY,
  source_id       TEXT    NOT NULL,
  source_type     TEXT    NOT NULL,   -- 'transcript' | 'vision' | 'marker' | 'metadata'
  shard_id        TEXT    NOT NULL,
  vector          BLOB    NOT NULL,   -- Float32Array serialised as raw bytes
  model_id        TEXT    NOT NULL,
  dimensions      INTEGER NOT NULL,
  start_time_ms   INTEGER,
  end_time_ms     INTEGER,
  text            TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_embedding_source_id   ON embedding_chunks (source_id);
CREATE INDEX IF NOT EXISTS idx_embedding_source_type ON embedding_chunks (source_type);
CREATE INDEX IF NOT EXISTS idx_embedding_shard_id    ON embedding_chunks (shard_id);
CREATE INDEX IF NOT EXISTS idx_embedding_model_id    ON embedding_chunks (model_id);
CREATE INDEX IF NOT EXISTS idx_embedding_start_ms    ON embedding_chunks (start_time_ms);

-- ---------------------------------------------------------------------------
-- Markers and notes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS markers_notes (
  id              TEXT    NOT NULL PRIMARY KEY,
  asset_id        TEXT,
  sequence_id     TEXT,
  time_ms         INTEGER,
  duration_ms     INTEGER,
  label           TEXT,
  color           TEXT,
  category        TEXT,
  user_id         TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_markers_asset_id      ON markers_notes (asset_id);
CREATE INDEX IF NOT EXISTS idx_markers_sequence_id   ON markers_notes (sequence_id);
CREATE INDEX IF NOT EXISTS idx_markers_time_ms       ON markers_notes (time_ms);
CREATE INDEX IF NOT EXISTS idx_markers_category      ON markers_notes (category);

-- ---------------------------------------------------------------------------
-- Playbooks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS playbooks (
  id              TEXT    NOT NULL PRIMARY KEY,
  name            TEXT    NOT NULL,
  description     TEXT,
  steps_json      TEXT,               -- JSON array of playbook steps
  trigger_pattern TEXT,
  vertical        TEXT,
  created_by      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_playbooks_vertical    ON playbooks (vertical);
CREATE INDEX IF NOT EXISTS idx_playbooks_created_by  ON playbooks (created_by);

-- ---------------------------------------------------------------------------
-- Tool traces
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tool_traces (
  id              TEXT    NOT NULL PRIMARY KEY,
  plan_id         TEXT    NOT NULL,
  step_index      INTEGER NOT NULL,
  tool_name       TEXT    NOT NULL,
  tool_args_json  TEXT,               -- JSON serialised tool arguments
  status          TEXT    NOT NULL DEFAULT 'pending',
  result_json     TEXT,               -- JSON serialised result
  error           TEXT,
  started_at      TEXT,
  completed_at    TEXT,
  duration_ms     INTEGER,
  tokens_cost     REAL    NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_traces_plan_id        ON tool_traces (plan_id);
CREATE INDEX IF NOT EXISTS idx_traces_tool_name      ON tool_traces (tool_name);
CREATE INDEX IF NOT EXISTS idx_traces_status         ON tool_traces (status);
CREATE INDEX IF NOT EXISTS idx_traces_started_at     ON tool_traces (started_at);

-- ---------------------------------------------------------------------------
-- Publish variants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS publish_variants (
  id                TEXT    NOT NULL PRIMARY KEY,
  sequence_id       TEXT    NOT NULL,
  platform          TEXT    NOT NULL,
  delivery_spec_json TEXT,            -- JSON serialised DeliverySpec
  status            TEXT    NOT NULL DEFAULT 'draft',
  published_url     TEXT,
  published_at      TEXT,
  metadata_json     TEXT              -- JSON arbitrary metadata
);

CREATE INDEX IF NOT EXISTS idx_variants_sequence_id  ON publish_variants (sequence_id);
CREATE INDEX IF NOT EXISTS idx_variants_platform     ON publish_variants (platform);
CREATE INDEX IF NOT EXISTS idx_variants_status       ON publish_variants (status);
