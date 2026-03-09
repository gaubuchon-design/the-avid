/**
 * @module transcripts
 *
 * Types for speech-to-text transcripts and their constituent parts.
 * Transcript segments are time-aligned to their source asset and carry
 * per-word confidence, speaker diarisation, and language metadata.
 */

// ─── Primitives ───────────────────────────────────────────────────────────────

/** A single word within a transcript segment, with precise timing. */
export interface Word {
  /** The transcribed word text. */
  readonly text: string;
  /** Start time within the source asset, in seconds. */
  readonly startTime: number;
  /** End time within the source asset, in seconds. */
  readonly endTime: number;
  /** Model confidence score in the range [0, 1]. */
  readonly confidence: number;
}

/** An identified speaker in a transcript. */
export interface Speaker {
  /** Unique speaker identifier (stable within a transcript). */
  readonly id: string;
  /** Human-readable speaker label (e.g. "Speaker 1", "Jane Doe"). */
  readonly name: string;
  /** Diarisation confidence score in the range [0, 1]. */
  readonly confidence: number;
}

/** Language metadata for a transcript or segment. */
export interface Language {
  /** ISO 639-1 two-letter language code (e.g. `en`, `fr`, `ja`). */
  readonly code: string;
  /** Human-readable language name (e.g. "English"). */
  readonly name: string;
  /** Language-detection confidence score in the range [0, 1]. */
  readonly confidence: number;
}

// ─── Transcript Segment ───────────────────────────────────────────────────────

/**
 * A time-aligned segment of a transcript.
 *
 * Each segment corresponds to a contiguous utterance (typically one
 * sentence or phrase) and includes word-level detail, speaker identity,
 * and language metadata.
 */
export interface TranscriptSegment {
  /** Unique segment identifier. */
  readonly id: string;
  /** Asset this segment was transcribed from. */
  readonly assetId: string;
  /** Start time within the source asset, in seconds. */
  readonly startTime: number;
  /** End time within the source asset, in seconds. */
  readonly endTime: number;
  /** Full text of the segment (concatenation of `words`). */
  readonly text: string;
  /** Segment-level confidence score in the range [0, 1]. */
  readonly confidence: number;
  /** Identified speaker for this segment, or `null` if unknown. */
  readonly speaker: Speaker | null;
  /** Detected language for this segment. */
  readonly language: Language;
  /** Word-level timing and confidence data. */
  readonly words: readonly Word[];
}

// ─── Format ───────────────────────────────────────────────────────────────────

/**
 * Supported transcript interchange formats.
 * - `srt`  — SubRip subtitle format
 * - `vtt`  — WebVTT subtitle format
 * - `json` — Structured JSON (internal)
 * - `ttml` — Timed Text Markup Language
 */
export type TranscriptFormat = 'srt' | 'vtt' | 'json' | 'ttml';
