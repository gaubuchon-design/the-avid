/**
 * @module utility-types
 *
 * Shared utility types used throughout the MCUA platform.
 * Includes recursive type transformers, branded/nominal types for
 * type-safe identifiers, a Result union for error handling, and
 * pagination primitives.
 *
 * All types are JSON-serialisable and safe for cross-process use.
 */

// -- Recursive transformers ---------------------------------------------------

/**
 * Recursively makes every property in `T` optional.
 *
 * Unlike the built-in `Partial<T>`, this descends into nested objects
 * and arrays so that deeply-nested config objects can be partially
 * constructed for testing or patch operations.
 */
export type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/**
 * Recursively makes every property in `T` required (non-optional).
 */
export type DeepRequired<T> = T extends (infer U)[]
  ? DeepRequired<U>[]
  : T extends object
    ? { [K in keyof T]-?: DeepRequired<T[K]> }
    : T;

/**
 * Recursively makes every property in `T` readonly.
 */
export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

// -- Branded / nominal types --------------------------------------------------

/**
 * Nominal (branded) type pattern.
 *
 * Creates a type that is structurally identical to `T` but carries a
 * unique phantom brand `B` that prevents accidental assignment between
 * semantically distinct identifiers (e.g. `ProjectId` vs `SequenceId`).
 *
 * @example
 * ```ts
 * type UserId = Branded<string, 'UserId'>;
 * const id: UserId = 'u-123' as UserId;
 * ```
 */
export type Branded<T, B extends string> = T & { readonly __brand: B };

/** Type-safe project identifier. */
export type ProjectId = Branded<string, 'ProjectId'>;
/** Type-safe sequence identifier. */
export type SequenceId = Branded<string, 'SequenceId'>;
/** Type-safe asset identifier. */
export type AssetId = Branded<string, 'AssetId'>;
/** Type-safe shard identifier. */
export type ShardId = Branded<string, 'ShardId'>;
/** Type-safe plan identifier. */
export type PlanId = Branded<string, 'PlanId'>;
/** Type-safe job identifier. */
export type JobId = Branded<string, 'JobId'>;

// -- Result union -------------------------------------------------------------

/**
 * Discriminated union for operations that can succeed or fail.
 *
 * Modelled after Rust's `Result<T, E>` — consumers must check the `ok`
 * discriminator before accessing `value` or `error`.
 *
 * @example
 * ```ts
 * function parse(input: string): Result<Config, string> {
 *   try {
 *     return { ok: true, value: JSON.parse(input) };
 *   } catch {
 *     return { ok: false, error: 'Invalid JSON' };
 *   }
 * }
 * ```
 */
export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

// -- ISO Timestamp alias ------------------------------------------------------

/**
 * Alias for an ISO 8601 date-time string.
 *
 * Used throughout contract interfaces to indicate that a `string` field
 * must contain a valid ISO 8601 timestamp (e.g. `"2024-06-15T12:30:00Z"`).
 */
export type ISOTimestamp = string;

// -- Object helper types ------------------------------------------------------

/**
 * Like `Pick<T, K>` but enforces that picked keys exist on `T`.
 */
export type StrictPick<T, K extends keyof T> = Pick<T, K>;

/**
 * Makes the specified keys `K` of `T` optional while keeping the rest
 * required.
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Makes the specified keys `K` of `T` required while keeping the rest
 * as-is.
 */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

// -- Serialisation constraint -------------------------------------------------

/**
 * Constrains `T` to types that are safe for `JSON.stringify` / `JSON.parse`
 * round-tripping. Prevents functions, symbols, undefined, and class
 * instances from leaking into contract types.
 */
export type JsonSerializable =
  | string
  | number
  | boolean
  | null
  | readonly JsonSerializable[]
  | { readonly [key: string]: JsonSerializable };

// -- Pagination ---------------------------------------------------------------

/**
 * Standard pagination request parameters.
 */
export interface PaginationRequest {
  /** Maximum number of items to return. */
  readonly limit: number;
  /** Opaque cursor for the next page, or `null` for the first page. */
  readonly cursor: string | null;
}

/**
 * Standard paginated response envelope.
 */
export interface PaginatedResponse<T> {
  /** The page of items. */
  readonly items: readonly T[];
  /** Cursor for the next page, or `null` if this is the last page. */
  readonly nextCursor: string | null;
  /** Total number of items across all pages, or `null` if unknown. */
  readonly totalCount: number | null;
}
