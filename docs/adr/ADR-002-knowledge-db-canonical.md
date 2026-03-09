# ADR-002: Knowledge DB as Canonical Store

**Status:** Accepted
**Date:** 2024-12-15
**Authors:** Knowledge Platform Team

## Context

The Knowledge DB needs a persistent storage layer for project metadata including assets, transcripts, vision analysis events, embeddings, markers, playbooks, tool traces, and publish variants. This data must be:

1. Transactional (concurrent reads during writes, crash recovery)
2. Portable (shippable on a USB drive or network transfer)
3. Backup-friendly (single file per shard, no external dependencies)
4. Queryable (SQL for ad-hoc queries, indexed for performance)
5. Self-contained (no external database server required)

Additionally, semantic search requires an Approximate Nearest Neighbour (ANN) index over embedding vectors. The index must be rebuildable from source data at any time.

## Decision

### SQLite is the canonical store

Each Knowledge DB shard is a single SQLite database file (`knowledge.db`) that serves as the source of truth for all project metadata. We chose SQLite because:

- **Transactional:** WAL mode provides concurrent readers with a single writer, and automatic crash recovery via journaling.
- **Portable:** A single `.db` file can be copied, archived, or transferred between machines without any server process.
- **Backup-friendly:** Standard filesystem backup tools work. SQLite's `VACUUM` reclaims space.
- **Queryable:** Full SQL support with prepared statements for type-safe, performant access patterns.
- **Zero-dependency:** No database server to install, configure, or manage. SQLite is linked directly into the Node.js process via `better-sqlite3`.

### Embeddings are stored as BLOBs

Embedding vectors are serialised as raw Float32 byte arrays and stored in the `embedding_chunks` table's `vector` column (BLOB type). This means:

- The database is the single source of truth for both structured metadata and vector data.
- Vectors survive backup/restore and shard transfer without separate export steps.
- The schema enforces referential integrity between embeddings and their source records.

### The ANN index is a derived, rebuildable sidecar

The ANN index (`ann-index.json`) is **not** the canonical store for vector data. It is a derived artifact built from the `embedding_chunks` table:

- Rebuilt on demand via `IndexBuilder.buildIndex(db)`.
- Serialised alongside the shard as an optional performance cache.
- If the index file is lost or corrupted, it can be fully reconstructed from the database.
- Different ANN algorithms (brute-force, HNSW, IVF) can be swapped without changing the canonical schema.

This separation is intentional: ANN indices are inherently lossy approximations optimised for query speed. They should not be treated as primary storage.

### Schema versioning through migrations

The schema is versioned through a `_migrations` table that tracks which migrations have been applied. Each migration:

- Has a unique name (e.g. `001-initial`).
- Is idempotent: re-running a migration that has already been applied is a no-op.
- Runs within a transaction to ensure atomicity.
- Reads from a canonical `schema.sql` file to keep the full schema readable in one place.

### Shard model

The data model uses one SQLite file per shard:

- Each shard is a directory containing `knowledge.db` and `manifest.json`.
- The manifest is a JSON sidecar that describes the shard's identity, ownership, replication state, and schema version.
- Shards can be created, opened, listed, split, verified, and deleted via the `ShardManager` class.
- Splitting a shard moves assets (and their dependent records) to a new shard, maintaining referential integrity.

## Consequences

### Positive

- **Simplicity:** No external database server or cluster to manage.
- **Portability:** Shards are self-contained directories that can be moved between machines.
- **Reliability:** SQLite is one of the most tested pieces of software in existence, with comprehensive crash recovery.
- **Debuggability:** Any SQLite client can inspect the database directly.
- **Offline-first:** The entire Knowledge DB works without network access.

### Negative

- **Single-writer:** SQLite allows only one concurrent writer per database. This is mitigated by the shard model (one writer per shard) and the mesh protocol's writer lease system.
- **No built-in replication:** Replication must be handled at the application layer via the mesh protocol.
- **Large BLOBs:** Storing embedding vectors as BLOBs increases database file size. For 100K vectors of dimension 768, this adds approximately 300 MB. This is acceptable for local storage but may require compression for network transfer.
- **Brute-force ANN:** The initial BruteForceIndex implementation is O(n*d) per query. For production collections exceeding 50K vectors, an HNSW-backed implementation should be provided.

### Neutral

- The `better-sqlite3` library is a native Node.js addon, requiring a C++ build toolchain for installation. This is standard for Node.js projects using native addons.
- The manifest.json sidecar introduces a second file to manage alongside the database. This is a minimal overhead for the benefits of human-readable shard metadata.

## Alternatives Considered

1. **PostgreSQL/pgvector:** Would provide built-in ANN search but requires a running server, making the system non-portable and complex to deploy on editing workstations.
2. **LevelDB/RocksDB:** Key-value stores that lack SQL queryability and are harder to inspect and debug.
3. **Storing vectors only in the ANN index:** Would make the index the source of truth, complicating backup, transfer, and crash recovery.
4. **MongoDB:** Document store that requires a server process and is not single-file portable.
