/**
 * @module utility-types
 *
 * Shared utility types used across the monorepo. These provide ergonomic
 * helpers for common TypeScript patterns: deep partial updates, branded
 * primitives for type-safe IDs, and result wrappers for error handling.
 *
 * @packageDocumentation
 */

// -- Deep structural types ---------------------------------------------------

/**
 * Recursively make all properties of `T` optional.
 *
 * Unlike the built-in `Partial<T>` this descends into nested objects
 * and readonly arrays, making it suitable for patch / merge operations.
 */
export type DeepPartial<T> = T extends readonly (infer U)[]
  ? DeepPartial<U>[]
  : T extends Record<string, unknown>
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/**
 * Recursively make all properties of `T` required and non-nullable.
 */
export type DeepRequired<T> = T extends readonly (infer U)[]
  ? DeepRequired<U>[]
  : T extends Record<string, unknown>
    ? { [K in keyof T]-?: DeepRequired<NonNullable<T[K]>> }
    : T;

/**
 * Recursively make all properties of `T` readonly.
 */
export type DeepReadonly<T> = T extends readonly (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends Record<string, unknown>
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

// -- Branded types -----------------------------------------------------------

/**
 * A branded type that attaches a phantom tag `B` to a base type `T`.
 *
 * Use this to create nominal ID types that are structurally identical
 * to `string` or `number` but cannot be accidentally interchanged:
 *
 * @example
 * ```ts
 * type ProjectId = Branded<string, 'ProjectId'>;
 * type SequenceId = Branded<string, 'SequenceId'>;
 *
 * const pid: ProjectId = 'proj_1' as ProjectId;
 * const sid: SequenceId = pid; // Type error!
 * ```
 */
export type Branded<T, B extends string> = T & { readonly __brand: B };

/** Branded string for project identifiers. */
export type ProjectId = Branded<string, 'ProjectId'>;

/** Branded string for sequence identifiers. */
export type SequenceId = Branded<string, 'SequenceId'>;

/** Branded string for asset identifiers. */
export type AssetId = Branded<string, 'AssetId'>;

/** Branded string for shard identifiers. */
export type ShardId = Branded<string, 'ShardId'>;

/** Branded string for plan identifiers. */
export type PlanId = Branded<string, 'PlanId'>;

/** Branded string for job identifiers. */
export type JobId = Branded<string, 'JobId'>;

// -- Result types ------------------------------------------------------------

/**
 * Discriminated union for success/failure return values.
 *
 * Prefer this over throwing exceptions for expected failure modes
 * (validation errors, not-found, permission denied, etc.).
 *
 * @example
 * ```ts
 * function findAsset(id: string): Result<KnowledgeAsset, 'not_found' | 'offline'> {
 *   if (!db.has(id)) return { ok: false, error: 'not_found' };
 *   return { ok: true, value: db.get(id) };
 * }
 * ```
 */
export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E; readonly message?: string };

// -- Timestamp type ----------------------------------------------------------

/** ISO 8601 date-time string. Alias for documentation clarity. */
export type ISOTimestamp = string;

// -- Pick helpers ------------------------------------------------------------

/**
 * Like `Pick` but requires at least one key to be selected.
 */
export type StrictPick<T, K extends keyof T> = { [P in K]: T[P] };

/**
 * Make specific keys of `T` optional, leaving the rest required.
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Make specific keys of `T` required, leaving the rest as-is.
 */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

// -- Serialisation guard -----------------------------------------------------

/**
 * Ensures a type is JSON-serialisable by excluding functions, symbols,
 * undefined, and other non-serialisable values.
 *
 * This is a best-effort compile-time guard; it cannot catch all cases
 * but prevents the most common mistakes.
 */
export type JsonSerializable =
  | string
  | number
  | boolean
  | null
  | readonly JsonSerializable[]
  | { readonly [key: string]: JsonSerializable };

// -- Pagination --------------------------------------------------------------

/** Standard cursor-based pagination request. */
export interface PaginationRequest {
  /** Opaque cursor from a previous response, or `null` for the first page. */
  readonly cursor: string | null;
  /** Maximum number of items to return. */
  readonly limit: number;
}

/** Standard cursor-based pagination response envelope. */
export interface PaginatedResponse<T> {
  /** The items for this page. */
  readonly items: readonly T[];
  /** Cursor to request the next page, or `null` if this is the last page. */
  readonly nextCursor: string | null;
  /** Total number of items across all pages, if known. */
  readonly totalCount: number | null;
}
