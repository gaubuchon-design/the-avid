/**
 * @module federation
 *
 * Types for Content Core federation: querying external archive systems,
 * lazy-hydrating results, and tracking rights and usage history.
 * Federated results can originate from local Knowledge DB shards,
 * mesh peers, or an upstream Content Core archive service.
 */

import type { QueryFilter, SearchResult } from './knowledge-query';

// ─── Hydration Level ──────────────────────────────────────────────────────────

/**
 * Controls how much data is materialised for a federated result.
 * - `stub`    — ID and minimal metadata only (cheapest)
 * - `summary` — title, thumbnail, duration, rights summary
 * - `full`    — complete metadata, transcript refs, embeddings
 */
export type HydrationLevel = 'stub' | 'summary' | 'full';

// ─── Federation Filter ────────────────────────────────────────────────────────

/**
 * A filter predicate for Content Core federation queries.
 * Structurally identical to `QueryFilter` from the knowledge-query module.
 */
export type FederationFilter = QueryFilter;

// ─── Rights Status ────────────────────────────────────────────────────────────

/**
 * Rights clearance status for an archive asset.
 */
export interface RightsStatus {
  /** Overall clearance status. */
  readonly status: 'cleared' | 'restricted' | 'expired' | 'unknown';
  /** License identifier or description, or `null` if unknown. */
  readonly license: string | null;
  /** Human-readable restriction descriptions. */
  readonly restrictions: readonly string[];
  /** Rights holder / copyright owner, or `null` if unknown. */
  readonly owner: string | null;
  /** ISO 8601 expiration timestamp, or `null` if perpetual or unknown. */
  readonly expiresAt: string | null;
}

// ─── Usage Record ─────────────────────────────────────────────────────────────

/**
 * A historical record of an archive asset being used in a project.
 */
export interface UsageRecord {
  /** Project the asset was used in. */
  readonly projectId: string;
  /** ISO 8601 timestamp when the asset was used. */
  readonly usedAt: string;
  /** User who incorporated the asset. */
  readonly usedBy: string;
  /** Brief description of how the asset was used. */
  readonly context: string;
}

// ─── Content Core Query ───────────────────────────────────────────────────────

/**
 * A query dispatched to the Content Core archive federation layer.
 *
 * Supports rights-aware search with optional lazy hydration to minimise
 * network and compute cost for large result sets.
 */
export interface ContentCoreQuery {
  /** Natural-language query text. */
  readonly text: string;
  /** Optional filter predicates. */
  readonly filters: readonly FederationFilter[];
  /** Maximum number of results to return. */
  readonly topK: number;
  /** Whether to include rights clearance information. */
  readonly includeRights: boolean;
  /** Whether to defer full metadata resolution until explicitly requested. */
  readonly lazyHydrate: boolean;
}

// ─── Archive Result ───────────────────────────────────────────────────────────

/**
 * A single result from a Content Core archive query, enriched with
 * rights and usage history metadata.
 */
export interface ArchiveResult {
  /** Unique result identifier within the archive. */
  readonly id: string;
  /** Display title of the asset. */
  readonly title: string;
  /** Brief description or synopsis. */
  readonly description: string;
  /** High-level asset type (e.g. `"video"`, `"audio"`, `"image"`). */
  readonly assetType: string;
  /** Thumbnail preview URL, or `null` if unavailable. */
  readonly thumbnailUrl: string | null;
  /** Duration in seconds, or `null` for non-temporal assets. */
  readonly duration: number | null;
  /** Rights clearance information. */
  readonly rights: RightsStatus;
  /** Historical usage records for this asset. */
  readonly usageHistory: readonly UsageRecord[];
  /** Source system or service that provided this result. */
  readonly provenance: string;
  /** ISO 8601 timestamp when this result was last cached, or `null`. */
  readonly cachedAt: string | null;
  /** ISO 8601 timestamp when the cached result expires, or `null`. */
  readonly expiryAt: string | null;
}

// ─── Federated Result ─────────────────────────────────────────────────────────

/**
 * A unified result envelope that wraps either a local `SearchResult`
 * or an upstream `ArchiveResult`, tagged with its origin and the
 * current hydration level.
 */
export interface FederatedResult {
  /** Origin of the result. */
  readonly source: 'local' | 'content-core' | 'mesh';
  /** The underlying result payload. */
  readonly result: SearchResult | ArchiveResult;
  /** How much data has been materialised for this result. */
  readonly hydrationLevel: HydrationLevel;
}
