/**
 * @module project-assets
 *
 * Types for project assets within the Knowledge DB context.
 * Extends concepts from the core MediaAsset type with Knowledge-layer
 * metadata including embeddings references, transcripts, vision events,
 * approval workflows, and rights management.
 */

/**
 * Media type classification.
 * Mirrors the canonical `MediaType` in `@mcua/core` — defined locally
 * so that `@mcua/contracts` has zero cross-package dependencies.
 */
export type MediaType = 'audio' | 'video' | 'image' | 'document';

// ─── Approval & Rights ────────────────────────────────────────────────────────

/**
 * Approval status for assets in a review workflow.
 * - `pending`  — awaiting review
 * - `approved` — cleared for use
 * - `rejected` — blocked from use
 * - `review`   — flagged for secondary review
 */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'review';

/** Rights and licensing information attached to a knowledge asset. */
export interface RightsInfo {
  /** SPDX license identifier or freeform license description. */
  readonly license: string;
  /** ISO 8601 expiration timestamp, or `null` if perpetual. */
  readonly expiresAt: string | null;
  /** Human-readable usage restrictions (e.g. "no commercial use"). */
  readonly restrictions: readonly string[];
  /** Rights holder / copyright owner. */
  readonly owner: string;
}

// ─── Knowledge Asset ──────────────────────────────────────────────────────────

/**
 * A media asset enriched with Knowledge-layer metadata.
 *
 * Extends the concept of a core `MediaAsset` by adding references
 * to embedding indices, transcripts, vision analysis events,
 * editorial markers, tags, approval state, and rights information.
 */
export interface KnowledgeAsset {
  /** Unique asset identifier. */
  readonly id: string;
  /** Human-readable asset name. */
  readonly name: string;
  /** Core media type of the underlying file. */
  readonly type: MediaType;
  /** Resolvable URL to the asset source. */
  readonly url: string;
  /** Duration in seconds (audio/video only). */
  readonly duration: number | null;
  /** File size in bytes. */
  readonly size: number;
  /** Knowledge DB shard this asset belongs to. */
  readonly shardId: string;
  /** Reference IDs to embedding chunks derived from this asset. */
  readonly embeddingsRef: readonly string[];
  /** Reference ID to the primary transcript for this asset. */
  readonly transcriptRef: string | null;
  /** Reference IDs to vision-analysis event records. */
  readonly visionEventsRef: readonly string[];
  /** Editor-created markers (e.g. chapter points, notes). */
  readonly markers: readonly string[];
  /** Freeform tags for filtering and categorisation. */
  readonly tags: readonly string[];
  /** Current approval status in the editorial workflow. */
  readonly approvalStatus: ApprovalStatus;
  /** Licensing and rights information. */
  readonly rights: RightsInfo | null;
  /** Arbitrary asset metadata. */
  readonly metadata: Readonly<Record<string, unknown>>;
  /** ISO 8601 creation timestamp. */
  readonly createdAt: string;
  /** ISO 8601 last-update timestamp. */
  readonly updatedAt: string;
}

// ─── Knowledge Bin ────────────────────────────────────────────────────────────

/**
 * A logical grouping of knowledge assets, analogous to an Avid bin.
 *
 * Bins can be nested via `parentId` and optionally driven by a
 * smart filter that auto-populates the asset list.
 */
export interface KnowledgeBin {
  /** Unique bin identifier. */
  readonly id: string;
  /** Display name of the bin. */
  readonly name: string;
  /** Parent bin ID for hierarchical nesting, or `null` for root. */
  readonly parentId: string | null;
  /** Ordered list of asset IDs contained in this bin. */
  readonly assetIds: readonly string[];
  /** Optional smart filter expression that dynamically populates the bin. */
  readonly smartFilter: string | null;
  /** ISO 8601 creation timestamp. */
  readonly createdAt: string;
  /** ISO 8601 last-update timestamp. */
  readonly updatedAt: string;
}

// ─── Knowledge Sequence ───────────────────────────────────────────────────────

/**
 * A versioned sequence (timeline) stored in the Knowledge DB.
 *
 * Each sequence is shard-scoped and carries its own version counter
 * to support optimistic concurrency during collaborative editing.
 */
export interface KnowledgeSequence {
  /** Unique sequence identifier. */
  readonly id: string;
  /** Sequence display name. */
  readonly name: string;
  /** Ordered track IDs that compose this sequence. */
  readonly tracks: readonly string[];
  /** Total duration of the sequence in seconds. */
  readonly duration: number;
  /** Monotonically increasing version number. */
  readonly version: number;
  /** Knowledge DB shard this sequence resides in. */
  readonly shardId: string;
}

// ─── Media Reference ──────────────────────────────────────────────────────────

/**
 * A concrete reference to a media file on disk or network storage.
 *
 * `MediaRef` links a logical asset ID to its physical location and
 * technical properties, enabling offline resolve and format awareness.
 */
export interface MediaRef {
  /** Unique media reference identifier. */
  readonly id: string;
  /** The knowledge asset this reference points to. */
  readonly assetId: string;
  /** Root mount-point or volume path (e.g. `/Volumes/MediaDrive`). */
  readonly mediaRoot: string;
  /** Path relative to `mediaRoot` (e.g. `project/clips/A001.mxf`). */
  readonly relativePath: string;
  /** Container format (e.g. `mxf`, `mov`, `mp4`). */
  readonly format: string;
  /** Video or audio codec (e.g. `dnxhd`, `prores`, `aac`). */
  readonly codec: string;
  /** Frame dimensions, or `null` for audio-only media. */
  readonly resolution: { readonly width: number; readonly height: number } | null;
  /** Frame rate in fps, or `null` for audio-only media. */
  readonly frameRate: number | null;
  /** Audio sample rate in Hz, or `null` for video-only media. */
  readonly sampleRate: number | null;
  /** Number of audio channels, or `null` for video-only media. */
  readonly channels: number | null;
  /** File size in bytes. */
  readonly fileSize: number;
  /** Content-addressable checksum (e.g. SHA-256 hex digest). */
  readonly checksum: string;
}
