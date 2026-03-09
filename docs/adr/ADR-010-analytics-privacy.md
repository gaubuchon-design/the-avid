# ADR-010: Analytics Feedback Loop and Privacy Model

**Status:** Accepted
**Date:** 2026-03-08
**Authors:** Agent Orchestrator Team
**Supersedes:** None
**Related:** ADR-005 (Orchestration Safety)

## Context

Phase 5 introduced basic analytics via `AnalyticsLogger` -- an in-memory log
of prompt submissions, plan lifecycle events, approvals, and token usage.
While sufficient for debugging, it does not support:

1. **Product signal extraction** -- understanding which automations users
   request most, which tools fail or get overridden, and where API gaps exist.
2. **Privacy-aware data handling** -- a consistent model for what data can be
   aggregated externally vs. what must stay within a user's session.
3. **Offline resilience** -- editors working without network access still
   generate valuable analytics that should be captured and flushed later.
4. **Dashboard-ready exports** -- pre-aggregated data structures that
   dashboards and reporting tools can consume without re-processing raw events.

## Decision

### Four-Tier Privacy Model

Every analytics event carries a `privacyLevel` tag:

| Level              | Audience                          | Example data                                          |
|--------------------|-----------------------------------|-------------------------------------------------------|
| `public-aggregate` | External dashboards, benchmarks   | Event type counts, tool usage frequency, latency p50  |
| `org-internal`     | Organization members only         | Project-level stats, team token budgets, failure logs  |
| `user-private`     | Originating user only             | Full prompt text, sequence IDs, user overrides         |
| `do-not-log`       | Never stored or transmitted       | Raw media content references, file paths, credentials  |

The `PrivacyFilter` enforces these levels:

- Events at a more restrictive level than the consumer's access are filtered
  out (returned as `null`).
- All events have PII stripped from payloads before storage or export.
- The `anonymize()` method replaces `userId` with a SHA-256 hash and removes
  `projectId` and `sequenceId` for external sharing.

### PII Detection and Stripping

The `PrivacyFilter.stripPII()` method detects and redacts:

- **Email addresses** via regex pattern matching.
- **IPv4 addresses** via numeric pattern matching.
- **File paths** (Unix `/Users/...` and Windows `C:\...` patterns).
- **Known PII field names** (e.g. `userName`, `email`, `phone`, `password`,
  `apiKey`) are redacted regardless of content.

Redacted values are replaced with the sentinel string `[REDACTED]`.

### Event Schema

All events share a common `AnalyticsEvent` interface with:

- `id` (UUIDv4), `type`, `sessionId`, `timestamp`, `privacyLevel`
- Optional: `userId`, `projectId`, `sequenceId`
- `payload` -- type-specific data (e.g. `PromptPayload`, `FailurePayload`)

The schema supports 13 event types that cover the full agent lifecycle:

| Event Type                | Product Signal                                        |
|---------------------------|-------------------------------------------------------|
| `prompt`                  | Most-requested automations                            |
| `plan-generated`          | Plan complexity, tool composition                     |
| `plan-approved`           | Approval throughput                                   |
| `plan-rejected`           | User trust / plan quality                             |
| `step-override`           | Where AI suggestions diverge from user expectations   |
| `step-failure`            | Bug fix priorities                                    |
| `missing-endpoint`        | API gaps that block automation                        |
| `manual-fix-after-agent`  | Where agent output needs human correction             |
| `time-saved-estimate`     | ROI / value demonstration                             |
| `publish-outcome`         | Platform integration reliability                      |
| `token-consumed`          | Cost optimization targets                             |
| `model-fallback`          | Model availability / cost management                  |
| `latency-report`          | Performance regression detection                      |

### Local-First Event Queue

The `EventQueue` accumulates events in-memory regardless of network state:

- **Max size:** Configurable (default 10,000 events). FIFO eviction when full
  (oldest 10% evicted per batch to amortize cost).
- **Auto-flush:** Configurable interval (default 30 seconds). Paused when
  offline; triggers immediately on online transition.
- **Failure resilience:** If the `onFlush` callback rejects, events are
  returned to the front of the queue for retry on the next flush cycle.
- **Re-entrancy guard:** Concurrent flush calls are rejected to prevent
  duplicate transmission.

### Dashboard Aggregation

`DashboardData` provides eight query methods that map directly to product
insights:

1. `getCommonAutomations()` -- most-requested prompts by frequency. Feeds
   feature request prioritization and template creation.
2. `getTopOverrides()` -- steps users skip, modify, or replace most often.
   Indicates where model prompts or tool definitions need improvement.
3. `getMissingEndpoints()` -- tools the agent tried to use but that do not
   exist. Directly ranks API implementation priorities.
4. `getFailureClusters()` -- failures grouped by (tool, error) with recency
   tracking. Identifies systematic bugs vs. transient issues.
5. `getTokenUsageByWorkflow()` -- cost breakdown by category with per-job
   averages. Targets prompt optimization and context caching.
6. `getTimeSavedSummary()` -- total and per-plan time savings with confidence
   levels. Primary ROI metric for the agent platform.
7. `getLatencyStats()` -- percentile latencies per operation. Detects tail
   latency and performance regressions.
8. `getPublishSuccessRate()` -- success/partial/failed breakdown for publish
   operations. Measures platform integration reliability.

### Cross-Application Consistency

The same `AnalyticsEvent` schema is used for both Media Composer and Pro Tools
workflows. Event payloads may reference tool names from either adapter set,
but the schema is unified. This allows:

- Single dashboard showing all agent activity across editing applications.
- Cross-application comparison of automation patterns and failure modes.
- Consolidated token budgets and time-saved metrics.

### No Private Media Content in Events

By default, analytics events never contain:

- Raw media file contents or references to specific media files.
- Thumbnail data, waveform data, or frame captures.
- Transcript text beyond short context summaries.

File paths that appear in error messages or context summaries are stripped
by `PrivacyFilter.stripPII()`.

## Consequences

**Positive:**

- Product team has quantitative data to prioritize features, fix bugs, and
  measure ROI without manually surveying users.
- Privacy is enforced at the schema level, not as an afterthought.
- Offline editing sessions still generate analytics that sync when connected.
- Dashboard data is pre-aggregated, reducing frontend computation.
- Same schema across Media Composer and Pro Tools simplifies reporting.

**Negative / Trade-offs:**

- In-memory queue does not persist across process restarts. A persistent
  store (IndexedDB for desktop, SQLite for server) should be added for
  production. Acceptable for MVP.
- PII detection is pattern-based and may miss edge cases (e.g. names embedded
  in tool arguments that do not match known field names). Future work can
  integrate a more sophisticated NER-based scrubber.
- The `do-not-log` level means some debugging information is irrecoverably
  lost. This is intentional -- user privacy takes precedence over debuggability.

## Alternatives Considered

1. **Server-side-only analytics** -- Rejected because desktop editors may
   operate offline for extended periods. Local-first with sync is more
   reliable.
2. **Third-party analytics SDK (Mixpanel, Amplitude)** -- Rejected for MVP
   because it introduces a vendor dependency and complicates the privacy
   model. Can be added as an `onFlush` consumer later.
3. **Separate schemas for Media Composer and Pro Tools** -- Rejected because
   cross-application aggregation is a key product requirement. A unified
   schema with adapter-specific tool names is simpler.
4. **Opt-out model instead of privacy levels** -- Rejected because a
   level-based model provides finer-grained control and is easier to audit.
