/**
 * @module PrivacyFilter
 * @description Enforces the four-tier privacy model and strips personally
 * identifiable information (PII) from analytics events before they are
 * queued, exported, or transmitted.
 *
 * ## Privacy levels (most permissive to most restrictive)
 *
 * 1. `public-aggregate` -- safe for external dashboards
 * 2. `org-internal`     -- visible within the org
 * 3. `user-private`     -- visible only to the originating user
 * 4. `do-not-log`       -- must never be stored
 *
 * Events with a privacy level more restrictive than the requested level
 * are filtered out (returned as `null`).
 *
 * @see ADR-010-analytics-privacy
 */

import { createHash } from 'crypto';
import type { AnalyticsEvent, PrivacyLevel } from './EventSchema';

// ---------------------------------------------------------------------------
// Privacy level ordering (lower index = more permissive)
// ---------------------------------------------------------------------------

/**
 * Ordered list of privacy levels from most permissive to most restrictive.
 * Used for comparisons in {@link PrivacyFilter.isAllowed}.
 */
const PRIVACY_LEVEL_ORDER: readonly PrivacyLevel[] = [
  'public-aggregate',
  'org-internal',
  'user-private',
  'do-not-log',
] as const;

// ---------------------------------------------------------------------------
// PII detection patterns
// ---------------------------------------------------------------------------

/**
 * Regex pattern matching most common email address formats.
 * RFC 5322 simplified -- sufficient for stripping, not for validation.
 */
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * IPv4 address pattern (e.g. `192.168.1.1`).
 */
const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

/**
 * Unix-style absolute file paths (e.g. `/Users/jane/project/file.mov`).
 */
const UNIX_PATH_PATTERN = /\/(?:Users|home|tmp|var|opt|etc|mnt|media)\/[^\s,"'}\]]+/g;

/**
 * Windows-style drive letter paths (e.g. `C:\Users\jane\Desktop\file.mov`).
 */
const WINDOWS_PATH_PATTERN = /[A-Z]:\\[^\s,"'}\]]+/g;

/**
 * Field names commonly containing PII. Values for these keys are always
 * redacted regardless of content.
 */
const PII_FIELD_NAMES: ReadonlySet<string> = new Set([
  'username',
  'userName',
  'displayName',
  'display_name',
  'email',
  'emailAddress',
  'email_address',
  'firstName',
  'first_name',
  'lastName',
  'last_name',
  'fullName',
  'full_name',
  'phone',
  'phoneNumber',
  'phone_number',
  'ipAddress',
  'ip_address',
  'ip',
  'ssn',
  'socialSecurityNumber',
  'password',
  'secret',
  'token',
  'apiKey',
  'api_key',
]);

/** Sentinel value used to replace redacted PII strings. */
const REDACTED = '[REDACTED]';

// ---------------------------------------------------------------------------
// PrivacyFilter
// ---------------------------------------------------------------------------

/**
 * Filters and sanitizes analytics events according to privacy policy.
 *
 * @example
 * ```ts
 * const filter = new PrivacyFilter('org-internal');
 *
 * // Strip PII from a payload
 * const clean = filter.stripPII({ email: 'jane@example.com', tool: 'splice_in' });
 * // => { email: '[REDACTED]', tool: 'splice_in' }
 *
 * // Filter event by privacy level
 * const result = filter.filter(event, 'public-aggregate');
 * // => null if event.privacyLevel is more restrictive than 'public-aggregate'
 * ```
 */
export class PrivacyFilter {
  /** Default privacy level applied when none is specified on the event. */
  private readonly defaultLevel: PrivacyLevel;

  /**
   * @param defaultLevel - Default privacy level for events without an explicit level.
   *                        Defaults to `org-internal`.
   */
  constructor(defaultLevel: PrivacyLevel = 'org-internal') {
    this.defaultLevel = defaultLevel;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Filter an event based on privacy level compatibility.
   *
   * Returns the event (with PII stripped from its payload) if the event's
   * privacy level is equal to or more permissive than {@link requestedLevel}.
   * Returns `null` if the event is too restrictive to be shared at the
   * requested level, or if the event is `do-not-log`.
   *
   * @param event          - The analytics event to filter.
   * @param requestedLevel - The maximum privacy level the consumer is allowed to see.
   * @returns The sanitized event, or `null` if it should be excluded.
   */
  filter(event: AnalyticsEvent, requestedLevel: PrivacyLevel): AnalyticsEvent | null {
    const eventLevel = event.privacyLevel ?? this.defaultLevel;

    // Events marked do-not-log are always suppressed
    if (eventLevel === 'do-not-log') {
      return null;
    }

    if (!this.isAllowed(eventLevel, requestedLevel)) {
      return null;
    }

    // Strip PII from the payload before returning
    return {
      ...event,
      payload: Object.freeze(this.stripPII({ ...event.payload })),
    };
  }

  /**
   * Remove personally identifiable information from a payload object.
   *
   * Handles:
   * - Fields whose keys match known PII field names
   * - Email addresses embedded in string values
   * - IPv4 addresses embedded in string values
   * - Unix and Windows file paths embedded in string values
   * - Nested objects (recursive)
   *
   * @param payload - The payload to sanitize (not mutated; a new object is returned).
   * @returns A new payload object with PII replaced by `[REDACTED]`.
   */
  stripPII(payload: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(payload)) {
      // Redact known PII field names entirely
      if (PII_FIELD_NAMES.has(key)) {
        result[key] = REDACTED;
        continue;
      }

      // Recurse into nested objects
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.stripPII(value as Record<string, unknown>);
        continue;
      }

      // Recurse into arrays
      if (Array.isArray(value)) {
        result[key] = value.map((item) => {
          if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
            return this.stripPII(item as Record<string, unknown>);
          }
          if (typeof item === 'string') {
            return this.scrubString(item);
          }
          return item;
        });
        continue;
      }

      // Scrub string values for embedded PII patterns
      if (typeof value === 'string') {
        result[key] = this.scrubString(value);
        continue;
      }

      // Non-string, non-object values pass through unchanged
      result[key] = value;
    }

    return result;
  }

  /**
   * Anonymize an event by hashing the userId and removing the projectId.
   *
   * The userId is replaced with a SHA-256 hash (first 16 hex chars) so that
   * events can still be correlated per-user without revealing identity.
   * The projectId is removed entirely since it may be linkable to an org.
   *
   * @param event - The event to anonymize.
   * @returns A new event with anonymized identifiers.
   */
  anonymize(event: AnalyticsEvent): AnalyticsEvent {
    const anonymizedUserId = event.userId
      ? this.hashIdentifier(event.userId)
      : undefined;

    return {
      ...event,
      userId: anonymizedUserId,
      projectId: undefined,
      sequenceId: undefined,
      payload: Object.freeze(this.stripPII({ ...event.payload })),
    };
  }

  /**
   * Check whether an event with {@link eventLevel} privacy is allowed to
   * be shared at the {@link requestedLevel}.
   *
   * An event is allowed if its privacy level is equal to or more permissive
   * than the requested level (i.e. its index in the ordering is <= the
   * requested level's index).
   *
   * @param eventLevel     - The event's privacy classification.
   * @param requestedLevel - The consumer's maximum allowed privacy level.
   * @returns `true` if the event may be shared at the requested level.
   */
  isAllowed(eventLevel: PrivacyLevel, requestedLevel: PrivacyLevel): boolean {
    const eventIndex = PRIVACY_LEVEL_ORDER.indexOf(eventLevel);
    const requestedIndex = PRIVACY_LEVEL_ORDER.indexOf(requestedLevel);

    // Unknown levels are treated as most restrictive
    if (eventIndex === -1 || requestedIndex === -1) {
      return false;
    }

    return eventIndex <= requestedIndex;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Scrub a string value by replacing embedded PII patterns with redaction
   * sentinels.
   *
   * @param value - The string to scrub.
   * @returns The scrubbed string.
   */
  private scrubString(value: string): string {
    let scrubbed = value;
    scrubbed = scrubbed.replace(EMAIL_PATTERN, REDACTED);
    scrubbed = scrubbed.replace(IPV4_PATTERN, REDACTED);
    scrubbed = scrubbed.replace(UNIX_PATH_PATTERN, REDACTED);
    scrubbed = scrubbed.replace(WINDOWS_PATH_PATTERN, REDACTED);
    return scrubbed;
  }

  /**
   * Produce a truncated SHA-256 hash of an identifier for anonymization.
   *
   * @param identifier - The raw identifier to hash.
   * @returns First 16 hex characters of the SHA-256 digest.
   */
  private hashIdentifier(identifier: string): string {
    return createHash('sha256').update(identifier).digest('hex').substring(0, 16);
  }
}
