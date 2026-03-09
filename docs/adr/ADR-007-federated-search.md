# ADR-007: Federated Search -- Content Core Federation

**Status:** Accepted
**Date:** 2026-03-08
**Authors:** Agent Orchestrator Team
**Supersedes:** None

## Context

The MCUA platform maintains two distinct search surfaces:

1. **Local mesh** -- A per-project vector database (embedding shards
   distributed across `@mcua/knowledge-db` nodes) that indexes transcripts,
   visual embeddings, and bin metadata.  Queries are fast (<50 ms) and
   always available offline.

2. **Avid Content Core / MediaCentral Asset Management** -- A centralized
   asset management system that holds the canonical catalogue of all media
   owned by the organisation.  Queries go over the network and may take
   100-500 ms.

Editors need to search across *both* sources in a single interaction (e.g.
"find me b-roll of the city skyline") without having to know which backend
holds the asset.  The results must be ranked on a common scale so that the
most relevant items appear first regardless of origin.

Key challenges:

- Different scoring schemes (cosine similarity for local embeddings vs.
  BM25-like text scores from Content Core).
- Vastly different latency profiles.
- Content Core results can be large; we want to avoid fetching full
  metadata for every hit.
- Editors often search the same phrase multiple times within a session.

## Decision

### Federated Search with Lazy Hydration

We introduce a `FederatedSearchService` in `@mcua/adapters` that:

1. **Executes searches in parallel** via `Promise.allSettled` so that the
   overall latency is bounded by the slowest backend (plus a configurable
   timeout).

2. **Normalizes scores** using per-source min-max normalization onto a
   common [0, 1] scale.  Local results receive a configurable *boost*
   multiplier (default 1.1x) to account for their inherent freshness and
   lower latency.

3. **Merges and deduplicates** results through a `ResultMerger`, keeping
   the higher-scored entry when the same asset appears in both sources.

4. **Returns stubs** for remote results -- id, normalized score, title,
   and rights status only.  Full metadata is loaded on demand via the
   `hydrate()` method (stub -> summary -> full progression).

5. **Caches remote results** through a `CacheManager` with a per-query
   TTL (default 5 minutes).  Subsequent identical queries within the TTL
   are served from memory.

### Architecture

```
                  +---------------------+
                  | FederatedSearchService|
                  +---------------------+
                   /        |          \
     Promise.allSettled     |     CacheManager
           /                |              \
  localSearchFn     ResultMerger     ContentCoreClient
   (mesh/vector)                    (IContentCoreAdapter)
                                    lazy hydration wrapper
```

### Score Normalization

- **Min-max normalization**: For each source, scores are mapped to
  `(score - min) / (max - min)` within the current result set.
- **Local boost**: After normalization, local scores are multiplied by
  `localBoost` (default 1.1), then clamped to [0, 1].
- **Rationale**: Local data is more likely to be fresh and contextually
  relevant to the current editing session, so a mild preference is
  appropriate.

### Lazy Hydration

Remote results pass through three hydration levels:

| Level     | What is loaded                         | When                      |
|-----------|----------------------------------------|---------------------------|
| `stub`    | id, score, source label                | Initial search return     |
| `summary` | + title, description, rights status    | Default detail fetch      |
| `full`    | + media reference, full rights, usage  | Explicit `hydrate()` call |

The `ContentCoreClient` decorator tracks the current level per asset and
avoids redundant calls to the inner adapter when the requested level is
already met.

### Cache Strategy

- **Key**: `query:<raw-query-string>` for search result sets;
  `asset:<assetId>` for individual hydrated results.
- **TTL**: Configurable, defaults to 5 minutes.
- **Invalidation**: By key, by source label, or full clear.  The
  `CacheManager` also supports `prune()` for batch removal of expired
  entries.
- **Statistics**: Hit/miss/eviction counters for observability.

## Consequences

### Positive

- Editors get a single, unified search experience across local and remote
  catalogues.
- Lazy hydration keeps initial results fast; full metadata is only loaded
  when the editor inspects a specific asset.
- TTL caching reduces redundant network calls during iterative search
  sessions.
- Graceful degradation: if one backend fails or times out, the other
  still returns results.

### Negative

- Score normalization is approximate; the 1.1x local boost is a heuristic
  that may need tuning in production.
- The in-memory cache is per-process; in a multi-node deployment a shared
  cache (Redis, etc.) would be needed.
- Lazy hydration adds a second round-trip when the editor opens an asset
  detail panel.

### Risks

- Cache staleness: a 5-minute TTL means an asset's rights status could
  change after caching.  For rights-critical workflows, callers should use
  `getRightsStatus()` directly rather than relying on cached data.
- Timeout too short for slow Content Core instances: the default 5-second
  timeout may need per-deployment tuning.
