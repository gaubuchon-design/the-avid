/**
 * @module publish-variants
 *
 * Types for multi-platform publish variants. A `PublishVariant` links a
 * sequence to a target platform with a concrete `DeliverySpec` that
 * describes the required output format, codec, resolution, and audio
 * settings.
 */

// ─── Platform & Status ────────────────────────────────────────────────────────

/**
 * Supported publish target platforms.
 */
export type PublishPlatform =
  | 'youtube'
  | 'vimeo'
  | 'tiktok'
  | 'instagram'
  | 'twitter'
  | 'facebook'
  | 'linkedin'
  | 'custom';

/**
 * Lifecycle status of a publish variant.
 * - `draft`     — variant created but not yet queued for render
 * - `rendering` — encode/transcode in progress
 * - `ready`     — render complete, awaiting publish
 * - `published` — successfully published to target platform
 * - `failed`    — render or publish failed
 * - `revoked`   — previously published content has been taken down
 */
export type PublishStatus =
  | 'draft'
  | 'rendering'
  | 'ready'
  | 'published'
  | 'failed'
  | 'revoked';

// ─── Delivery Spec ────────────────────────────────────────────────────────────

/**
 * Technical delivery specification for a published output.
 *
 * Describes the container format, codecs, resolution, frame rate,
 * bitrates, and optional constraints required by the target platform.
 */
export interface DeliverySpec {
  /** Container format (e.g. `mp4`, `mov`, `webm`). */
  readonly format: string;
  /** Video codec (e.g. `h264`, `h265`, `vp9`, `av1`). */
  readonly codec: string;
  /** Output frame dimensions. */
  readonly resolution: { readonly width: number; readonly height: number };
  /** Output frame rate in fps. */
  readonly frameRate: number;
  /** Target video bitrate (e.g. `"8M"`, `"50000k"`). */
  readonly bitrate: string;
  /** Audio codec (e.g. `aac`, `opus`). */
  readonly audioCodec: string;
  /** Target audio bitrate (e.g. `"320k"`, `"128k"`). */
  readonly audioBitrate: string;
  /** Maximum allowed duration in seconds, or `null` if unconstrained. */
  readonly maxDuration: number | null;
  /** Caption/subtitle format to embed or sidecar, or `null` if none. */
  readonly captionFormat: string | null;
  /** Whether the platform requires a thumbnail image. */
  readonly thumbnailRequired: boolean;
  /** Output color space (e.g. 'rec709', 'rec2020'). Defaults to project working space. */
  readonly outputColorSpace?: string;
  /** Output HDR mode. Null/undefined means inherit from project. */
  readonly hdrMode?: 'sdr' | 'hlg' | 'pq' | null;
  /** Output transfer function (e.g. 'srgb', 'pq', 'hlg'). */
  readonly transferFunction?: string;
}

// ─── Publish Variant ──────────────────────────────────────────────────────────

/**
 * A renderable/publishable variant of a sequence targeted at a specific
 * platform with a concrete delivery specification.
 */
export interface PublishVariant {
  /** Unique variant identifier. */
  readonly id: string;
  /** Source sequence this variant is derived from. */
  readonly sequenceId: string;
  /** Target publish platform. */
  readonly platform: PublishPlatform;
  /** Technical output specification. */
  readonly deliverySpec: DeliverySpec;
  /** Current lifecycle status. */
  readonly status: PublishStatus;
  /** Public URL of the published content, or `null` if not yet published. */
  readonly publishedUrl: string | null;
  /** ISO 8601 timestamp of publication, or `null` if not yet published. */
  readonly publishedAt: string | null;
  /** Platform-specific metadata (e.g. video ID, title, tags). */
  readonly metadata: Readonly<Record<string, unknown>>;
}
