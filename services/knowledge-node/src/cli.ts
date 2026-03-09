#!/usr/bin/env tsx
/**
 * @module cli
 *
 * CLI entry point for the knowledge-node service.
 *
 * Usage:
 * ```
 * tsx src/cli.ts <command> [options]
 *
 * Commands:
 *   create-project     Create a new project shard
 *   add-asset          Add a media asset to a shard
 *   ingest-transcript  Ingest a transcript file into a shard
 *   rebuild-index      Rebuild the ANN index for a shard
 *   split-shard        Split a shard by moving matching assets
 *
 * Global Options:
 *   --data-dir <path>  Root directory for shard storage (default: ./data)
 *   --help             Show usage information
 * ```
 */

import { createProject } from './commands/create-project.js';
import { addAsset } from './commands/add-asset.js';
import { ingestTranscript } from './commands/ingest-transcript.js';
import { rebuildIndex } from './commands/rebuild-index.js';
import { splitShard } from './commands/split-shard.js';

// ─── Arg Parsing ────────────────────────────────────────────────────────────

/**
 * Parse CLI arguments into a command name and a key-value options map.
 *
 * Supports `--key value` and `--key=value` forms. Positional arguments
 * are ignored. Boolean flags (e.g. `--help`) are set to `"true"`.
 *
 * @param argv - Raw process.argv (includes node and script path).
 * @returns Parsed command and options.
 */
function parseArgs(argv: string[]): {
  command: string | undefined;
  options: Record<string, string>;
} {
  const args = argv.slice(2); // Remove node + script path.
  const command = args[0] && !args[0].startsWith('--') ? args[0] : undefined;
  const options: Record<string, string> = {};

  for (let i = command ? 1 : 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;

    if (arg.includes('=')) {
      const [key, ...rest] = arg.slice(2).split('=');
      options[key] = rest.join('=');
    } else {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        options[key] = next;
        i++;
      } else {
        options[key] = 'true';
      }
    }
  }

  return { command, options };
}

// ─── Usage ──────────────────────────────────────────────────────────────────

const USAGE = `
Usage: tsx src/cli.ts <command> [options]

Commands:
  create-project      Create a new project shard
    --name <name>       Project name (required)
    --data-dir <path>   Shard storage directory (default: ./data)

  add-asset            Add a media asset to a shard
    --shard-id <id>     Target shard ID (required)
    --path <filepath>   Path to the media file (required)
    --data-dir <path>   Shard storage directory (default: ./data)

  ingest-transcript    Ingest a transcript file (.json or .srt)
    --shard-id <id>     Target shard ID (required)
    --asset-id <id>     Asset ID to associate (required)
    --path <filepath>   Path to the transcript file (required)
    --data-dir <path>   Shard storage directory (default: ./data)

  rebuild-index        Rebuild the ANN index for a shard
    --shard-id <id>     Target shard ID (required)
    --data-dir <path>   Shard storage directory (default: ./data)

  split-shard          Split a shard by asset name/ID pattern
    --shard-id <id>     Source shard ID (required)
    --pattern <glob>    Asset ID/name pattern (required)
    --data-dir <path>   Shard storage directory (default: ./data)

Global Options:
  --help               Show this usage information
`.trim();

/**
 * Require a named option from the options map, or exit with an error.
 *
 * @param options - The parsed options map.
 * @param key     - The option key to look up.
 * @param label   - Human-readable label for error messages.
 * @returns The option value.
 */
function requireOption(
  options: Record<string, string>,
  key: string,
  label: string,
): string {
  const value = options[key];
  if (!value || value === 'true') {
    console.error(`Error: missing required option --${key} (${label})`);
    process.exit(1);
  }
  return value;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  const { command, options } = parseArgs(process.argv);

  if (options['help'] || !command) {
    console.log(USAGE);
    process.exit(command ? 0 : 1);
  }

  const dataDir = options['data-dir'] || './data';

  try {
    switch (command) {
      case 'create-project': {
        const name = requireOption(options, 'name', 'project name');
        createProject(name, dataDir);
        break;
      }

      case 'add-asset': {
        const shardId = requireOption(options, 'shard-id', 'shard ID');
        const path = requireOption(options, 'path', 'asset file path');
        addAsset(shardId, path, dataDir);
        break;
      }

      case 'ingest-transcript': {
        const shardId = requireOption(options, 'shard-id', 'shard ID');
        const assetId = requireOption(options, 'asset-id', 'asset ID');
        const path = requireOption(options, 'path', 'transcript file path');
        ingestTranscript(shardId, assetId, path, dataDir);
        break;
      }

      case 'rebuild-index': {
        const shardId = requireOption(options, 'shard-id', 'shard ID');
        rebuildIndex(shardId, dataDir);
        break;
      }

      case 'split-shard': {
        const shardId = requireOption(options, 'shard-id', 'shard ID');
        const pattern = requireOption(options, 'pattern', 'asset pattern');
        splitShard(shardId, pattern, dataDir);
        break;
      }

      default:
        console.error(`Unknown command: "${command}"`);
        console.log(USAGE);
        process.exit(1);
    }
  } catch (err) {
    console.error(
      `Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

main();
