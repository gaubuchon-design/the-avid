/**
 * @module 001-initial
 *
 * Initial migration for the Project Knowledge DB schema.
 * Reads the canonical `schema.sql` file and executes it within a
 * single transaction, then records the migration in the `_migrations`
 * table.
 */

import type Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Migration name used for idempotency tracking. */
const MIGRATION_NAME = '001-initial';

/**
 * Resolve the path to `schema.sql` relative to this migration file.
 *
 * Works in both compiled (dist/) and source (src/) layouts because the
 * schema file is always one directory above the migrations folder.
 */
function resolveSchemaPath(): string {
  // In ESM context we derive __dirname from import.meta.url.
  // In CJS / tsx context, __dirname is available globally.
  let dir: string;
  try {
    dir = dirname(fileURLToPath(import.meta.url));
  } catch {
    // Fallback for CJS environments where import.meta is not available.
    dir = __dirname;
  }
  return resolve(dir, '..', 'schema.sql');
}

/**
 * Run the initial database migration.
 *
 * This function is **idempotent**: if the migration has already been
 * applied (tracked in the `_migrations` table), it returns immediately.
 *
 * @param db - An open `better-sqlite3` Database instance.
 * @returns `true` if the migration was applied, `false` if it was skipped.
 */
export function migrate(db: Database.Database): boolean {
  // Ensure the _migrations table exists before checking for prior runs.
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      applied_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Check if this migration has already been applied.
  const existing = db
    .prepare('SELECT id FROM _migrations WHERE name = ?')
    .get(MIGRATION_NAME);

  if (existing) {
    return false;
  }

  // Read and execute the schema SQL.
  const schemaPath = resolveSchemaPath();
  const schemaSql = readFileSync(schemaPath, 'utf-8');

  const applyMigration = db.transaction(() => {
    db.exec(schemaSql);
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(MIGRATION_NAME);
  });

  applyMigration();
  return true;
}
