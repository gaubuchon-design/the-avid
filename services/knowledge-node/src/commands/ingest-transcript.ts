/**
 * @module ingest-transcript
 *
 * CLI command that ingests a transcript file (JSON or SRT format)
 * and inserts the parsed segments into the Knowledge DB for a
 * specified asset.
 *
 * Usage:
 * ```
 * tsx src/cli.ts ingest-transcript \
 *   --shard-id <id> --asset-id <id> \
 *   --path /path/to/transcript.json \
 *   --data-dir ./data
 * ```
 *
 * ## Supported Formats
 *
 * ### JSON
 * An array of segment objects:
 * ```json
 * [
 *   {
 *     "startTimeMs": 0,
 *     "endTimeMs": 3500,
 *     "text": "Hello world",
 *     "confidence": 0.95,
 *     "speakerId": "spk-1",
 *     "speakerName": "Host",
 *     "languageCode": "en",
 *     "words": [
 *       { "text": "Hello", "startTime": 0, "endTime": 0.5, "confidence": 0.99 }
 *     ]
 *   }
 * ]
 * ```
 *
 * ### SRT
 * Standard SubRip format. Timestamps are converted to milliseconds.
 */

import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { v4 as uuid } from 'uuid';
import { ShardManager } from '../shard/ShardManager.js';
import type { TranscriptSegmentRow } from '../db/KnowledgeDB.js';

// ─── SRT Parsing ────────────────────────────────────────────────────────────

/**
 * Parse an SRT timestamp string into milliseconds.
 *
 * @param ts - A timestamp in the format `HH:MM:SS,mmm`.
 * @returns The equivalent time in milliseconds.
 */
function parseSrtTimestamp(ts: string): number {
  const [time, ms] = ts.trim().split(',');
  const [hours, minutes, seconds] = time.split(':').map(Number);
  return hours * 3600000 + minutes * 60000 + seconds * 1000 + Number(ms || 0);
}

/**
 * Parse an SRT file into transcript segment rows.
 *
 * @param content - The raw SRT file content.
 * @param assetId - The asset ID to associate segments with.
 * @returns An array of transcript segment rows.
 */
function parseSrt(content: string, assetId: string): TranscriptSegmentRow[] {
  const segments: TranscriptSegmentRow[] = [];
  const blocks = content.trim().split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;

    // Line 0: sequence number (ignored)
    // Line 1: timestamps
    // Lines 2+: text content
    const timeLine = lines[1];
    const match = timeLine.match(
      /(\d{2}:\d{2}:\d{2}[,.]?\d{0,3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]?\d{0,3})/,
    );
    if (!match) continue;

    const startTimeMs = parseSrtTimestamp(match[1].replace('.', ','));
    const endTimeMs = parseSrtTimestamp(match[2].replace('.', ','));
    const text = lines.slice(2).join(' ').trim();

    segments.push({
      id: uuid(),
      assetId,
      startTimeMs,
      endTimeMs,
      text,
      confidence: null,
      speakerId: null,
      speakerName: null,
      languageCode: null,
      wordsJson: null,
    });
  }

  return segments;
}

// ─── JSON Parsing ───────────────────────────────────────────────────────────

/** Shape of a single segment in the JSON transcript format. */
interface JsonSegment {
  startTimeMs: number;
  endTimeMs: number;
  text: string;
  confidence?: number;
  speakerId?: string;
  speakerName?: string;
  languageCode?: string;
  words?: Array<{
    text: string;
    startTime: number;
    endTime: number;
    confidence: number;
  }>;
}

/**
 * Parse a JSON transcript file into transcript segment rows.
 *
 * @param content - The raw JSON file content.
 * @param assetId - The asset ID to associate segments with.
 * @returns An array of transcript segment rows.
 */
function parseJson(content: string, assetId: string): TranscriptSegmentRow[] {
  const data = JSON.parse(content) as JsonSegment[];

  if (!Array.isArray(data)) {
    throw new Error('JSON transcript must be an array of segment objects');
  }

  return data.map((seg) => ({
    id: uuid(),
    assetId,
    startTimeMs: seg.startTimeMs,
    endTimeMs: seg.endTimeMs,
    text: seg.text,
    confidence: seg.confidence ?? null,
    speakerId: seg.speakerId ?? null,
    speakerName: seg.speakerName ?? null,
    languageCode: seg.languageCode ?? null,
    wordsJson: seg.words ? JSON.stringify(seg.words) : null,
  }));
}

// ─── Command ────────────────────────────────────────────────────────────────

/**
 * Ingest a transcript file and insert its segments into the Knowledge DB.
 *
 * @param shardId        - The target shard ID.
 * @param assetId        - The asset ID this transcript belongs to.
 * @param transcriptPath - Filesystem path to the transcript file.
 * @param dataDir        - Root directory where shards are stored.
 * @returns The number of segments inserted.
 */
export function ingestTranscript(
  shardId: string,
  assetId: string,
  transcriptPath: string,
  dataDir: string,
): number {
  const manager = new ShardManager(dataDir);
  const { db } = manager.openShard(shardId);

  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    const ext = extname(transcriptPath).toLowerCase();

    let segments: TranscriptSegmentRow[];
    if (ext === '.srt') {
      segments = parseSrt(content, assetId);
    } else if (ext === '.json') {
      segments = parseJson(content, assetId);
    } else {
      throw new Error(
        `Unsupported transcript format: "${ext}". Supported: .json, .srt`,
      );
    }

    // Insert all segments in a single transaction.
    const insertAll = db.db.transaction(() => {
      for (const seg of segments) {
        db.insertTranscriptSegment(seg);
      }
    });
    insertAll();

    console.log(
      `[ingest-transcript] Inserted ${segments.length} segments for asset ${assetId}`,
    );
    return segments.length;
  } finally {
    db.close();
  }
}
