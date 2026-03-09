/**
 * @module api-version
 *
 * Contract versioning for the MCUA platform APIs. Every API request and
 * response envelope should carry the contract version to enable
 * forward-compatible evolution and graceful degradation when clients
 * and servers run different versions.
 */

// -- Version type ------------------------------------------------------------

/**
 * Semantic version of the API contract.
 *
 * - `major` -- breaking changes that require client updates
 * - `minor` -- backwards-compatible additions (new fields, endpoints)
 * - `patch` -- bug fixes in contract documentation or validation
 */
export interface ApiVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

// -- Current version ---------------------------------------------------------

/**
 * The current contract version. Bump this when the contract shapes change.
 *
 * Changelog:
 * - 0.3.0 -- Added render-pipeline types, discriminated events, Zod schemas
 * - 0.2.0 -- Added federation, mesh-protocol, analytics events
 * - 0.1.0 -- Initial contract definitions
 */
export const CURRENT_API_VERSION: ApiVersion = {
  major: 0,
  minor: 3,
  patch: 0,
} as const;

/**
 * String representation of the current API version (e.g. "0.3.0").
 */
export const API_VERSION_STRING: string =
  `${CURRENT_API_VERSION.major}.${CURRENT_API_VERSION.minor}.${CURRENT_API_VERSION.patch}`;

// -- Version comparison ------------------------------------------------------

/**
 * Compare two API versions.
 *
 * @returns Negative if `a < b`, zero if equal, positive if `a > b`.
 */
export function compareVersions(a: ApiVersion, b: ApiVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/**
 * Check whether a client version is compatible with a server version.
 *
 * Compatibility rules:
 * - Major versions must match.
 * - The client minor version must be less than or equal to the server
 *   minor version (the server may have added fields the client
 *   does not know about, but the client's expectations are a subset).
 */
export function isCompatible(client: ApiVersion, server: ApiVersion): boolean {
  if (client.major !== server.major) return false;
  return client.minor <= server.minor;
}

/**
 * Parse a semver string (e.g. "0.3.0") into an {@link ApiVersion}.
 *
 * @throws If the string is not a valid semver.
 */
export function parseVersion(version: string): ApiVersion {
  const parts = version.split('.');
  if (parts.length !== 3) {
    throw new Error(`Invalid version string: "${version}" (expected "major.minor.patch")`);
  }
  const [major, minor, patch] = parts.map(Number);
  if ([major, minor, patch].some((n) => !Number.isInteger(n!) || n! < 0)) {
    throw new Error(`Invalid version components in "${version}"`);
  }
  return { major: major!, minor: minor!, patch: patch! };
}

// -- Envelope ----------------------------------------------------------------

/**
 * Standard API request envelope that carries the contract version.
 */
export interface VersionedRequest<T> {
  /** Contract version the client was built against. */
  readonly apiVersion: string;
  /** Request payload. */
  readonly payload: T;
  /** Correlation ID for request tracing. */
  readonly correlationId: string;
  /** ISO 8601 timestamp of the request. */
  readonly timestamp: string;
}

/**
 * Standard API response envelope that carries the contract version.
 */
export interface VersionedResponse<T> {
  /** Contract version the server implements. */
  readonly apiVersion: string;
  /** Whether the request succeeded. */
  readonly ok: boolean;
  /** Response payload (present when `ok` is `true`). */
  readonly data: T | null;
  /** Error information (present when `ok` is `false`). */
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  } | null;
  /** Correlation ID echoed from the request. */
  readonly correlationId: string;
  /** ISO 8601 timestamp of the response. */
  readonly timestamp: string;
}
