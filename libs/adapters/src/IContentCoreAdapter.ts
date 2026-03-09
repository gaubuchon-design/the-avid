/**
 * @fileoverview Adapter interface for Avid Content Core / MediaCentral |
 * Asset Management (formerly Avid Interplay | MAM).
 *
 * `IContentCoreAdapter` provides a unified search-and-retrieve surface over
 * managed media archives.  The real implementation calls the MediaCentral
 * Platform Services REST API; the mock keeps a small in-memory catalogue.
 */

import type {
  ArchiveResult,
  HydrationLevel,
  RightsStatus,
  SemanticQuery,
  UsageRecord,
} from './contracts-types';

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/**
 * Adapter for Avid Content Core / MediaCentral Asset Management.
 *
 * Covers metadata search, semantic (vector) search, rights look-ups, and
 * usage-history queries.
 */
export interface IContentCoreAdapter {
  /**
   * Full-text metadata search across the managed archive.
   *
   * @param query   - Free-text search string.
   * @param filters - Optional key/value filters (e.g. `{ format: "MXF" }`).
   * @returns Matching {@link ArchiveResult} records.
   */
  searchMetadata(
    query: string,
    filters?: Record<string, unknown>,
  ): Promise<ArchiveResult[]>;

  /**
   * Vector / semantic search powered by embedding models.
   *
   * @param query - A {@link SemanticQuery} containing the natural-language
   *                query, optional modality filters, and relevance threshold.
   * @returns Matching {@link ArchiveResult} records sorted by relevance.
   */
  semanticSearch(query: SemanticQuery): Promise<ArchiveResult[]>;

  /**
   * Retrieve detailed information about a single asset.
   *
   * @param assetId        - The asset identifier.
   * @param hydrationLevel - How much detail to include (`'summary'`,
   *                         `'standard'`, or `'full'`).  Defaults to
   *                         `'standard'`.
   * @returns A fully hydrated {@link ArchiveResult}.
   */
  getAssetDetail(
    assetId: string,
    hydrationLevel?: HydrationLevel,
  ): Promise<ArchiveResult>;

  /**
   * Look up the current rights / clearance status for an asset.
   *
   * @param assetId - The asset to check.
   * @returns One of the canonical {@link RightsStatus} values.
   */
  getRightsStatus(assetId: string): Promise<RightsStatus>;

  /**
   * Retrieve the usage history for an asset -- every sequence that has
   * referenced it.
   *
   * @param assetId - The asset to query.
   * @returns An array of {@link UsageRecord} entries, newest first.
   */
  getUsageHistory(assetId: string): Promise<UsageRecord[]>;

  /**
   * Batch-check whether a set of assets are currently online and available
   * for editing (not archived to nearline/tape).
   *
   * @param assetIds - One or more asset IDs.
   * @returns A map from asset ID to availability boolean.
   */
  checkAvailability(assetIds: string[]): Promise<Map<string, boolean>>;
}
