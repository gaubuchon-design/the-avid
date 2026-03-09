# ADR-011: Productionization Gaps

**Status:** Accepted
**Date:** 2026-03-08
**Deciders:** Engineering Team
**Context:** Phase 12 release readiness assessment

## Context

The v0.1.0 release implements the complete 12-phase agentic editing architecture with mock adapters, mock AI backends, and in-memory stores for several subsystems. This ADR catalogs the gaps between the current implementation and a production deployment, prioritizes them, and outlines a roadmap for closing each gap.

## Decision

We accept the current implementation as a functional prototype suitable for demonstration, integration testing, and development. Production deployment requires addressing the gaps enumerated below, in the prioritized order listed.

## Gap Analysis

### 1. Mock vs. Real Implementations

| Component | Current State | Production Requirement |
|-----------|--------------|----------------------|
| `IMediaComposerAdapter` | `MockMediaComposerAdapter` returns realistic stubs | Proprietary Avid Interplay/MediaCentral SDK integration |
| `IContentCoreAdapter` | `MockContentCoreAdapter` with simulated federation | Real Content Core REST API client with OAuth |
| `IProToolsAdapter` | `MockProToolsAdapter` with command stubs | AAX/EUCON bridge or Pro Tools scripting engine |
| `IPublishConnector` | `MockPublishConnector` returns fake URLs | Platform-specific APIs (YouTube Data API, social graph APIs) |
| AI Model Backends | `MockBackend` always available, returns stubs | Real ONNX/TensorRT/llama.cpp/MLX backends with GPU |
| Model Weights | Not bundled | Model download manager with integrity verification |
| Gemini Integration | Mock plan generation in workflows | Real Gemini API calls with API key management |

**Risk:** Without real adapters, no actual media operations occur. The orchestrator exercises the full lifecycle but produces synthetic results.

**Next Steps:**
1. Implement the Avid adapter using the Interplay Web Services API
2. Implement the Content Core adapter using the federated REST API
3. Partner with the Pro Tools team for AAX bridge specifications
4. Implement publish connectors for YouTube, Vimeo, and social platforms
5. Set up model weight distribution infrastructure (CDN + manifest)

### 2. Performance Gaps

| Component | Current Implementation | Limitation | Target |
|-----------|----------------------|------------|--------|
| ANN Index | `BruteForceIndex` (O(n*d) search) | Unusable above ~50K vectors | HNSW via `hnswlib-node` (O(log n) search) |
| Replication Log | In-memory ring buffer (10K events) | Lost on restart; bounded capacity | WAL table in shard SQLite DB |
| Text Search | SQLite `LIKE` with wildcards | No relevance ranking; full scan | FTS5 full-text index with BM25 ranking |
| Plan Cache | In-memory LRU | Lost on restart; single-node | Redis-backed cache with TTL |
| Token Wallet | In-memory Map | Lost on restart; no persistence | PostgreSQL or Redis with atomic operations |

**Risk:** Brute-force ANN search becomes impractical above 50K vectors (>1 second per query at 384 dimensions). In-memory stores lose all state on process restart.

**Next Steps:**
1. Integrate `hnswlib-node` as an HNSW backend behind the `IANNIndex` interface
2. Add a `replication_log` table to the shard schema for persistent event storage
3. Enable FTS5 on `transcript_segments.text` and `assets.name` columns
4. Move plan cache and token wallet to Redis (or PostgreSQL for durability)

### 3. Security Gaps

| Area | Current State | Production Requirement |
|------|--------------|----------------------|
| Authentication | None | JWT or OAuth 2.0 on all HTTP endpoints |
| Authorization | None | RBAC with role-based tool access (ADR-005 defines roles but no enforcement) |
| Inter-service TLS | Plain HTTP | mTLS or TLS termination at reverse proxy |
| Mesh WebSocket TLS | Plain WebSocket (`ws://`) | Secure WebSocket (`wss://`) with certificate pinning |
| API Key Management | Hardcoded or absent | Vault-based secret management (HashiCorp Vault, AWS Secrets Manager) |
| Input Validation | Minimal (Express `json()` parsing) | Schema validation (Zod or Joi) on all endpoints |
| Rate Limiting | None | Token bucket or sliding window rate limiter |
| Audit Logging | Structured logs only | Immutable audit log with tamper detection |

**Risk:** Without authentication, any network-reachable client can invoke tool calls, access project data, and modify shard state. This is the highest-priority gap for any deployment beyond localhost.

**Next Steps:**
1. Add JWT middleware to all Express routes (services share a signing key)
2. Implement RBAC enforcement in the approval engine (roles defined in ADR-005)
3. Enable TLS on all HTTP and WebSocket connections
4. Integrate a secrets manager for API keys (Gemini, publish connectors)
5. Add Zod schema validation to all request bodies
6. Implement rate limiting per authenticated user

### 4. Scalability Gaps

| Area | Current State | Limitation | Target |
|------|--------------|------------|--------|
| Knowledge Node | Single-process, single-disk | All shards on one machine | Distributed shard placement with consistent hashing |
| Token Wallet | Single-process, in-memory | Cannot scale horizontally | Distributed wallet with CAS or distributed locks |
| Model Registry | Single-process, in-memory | Cannot share across nodes | Shared registry (Redis or etcd) |
| Mesh Topology | Fully connected (all-to-all WebSocket) | O(n^2) connections | Gossip protocol or hierarchical routing |
| Shard Splitting | Manual trigger via `ShardManager.splitShard()` | No automatic balancing | Auto-split when shard exceeds size threshold |

**Risk:** The fully-connected mesh topology becomes impractical above ~10 nodes (90 WebSocket connections). Single-process services cannot scale horizontally without external coordination.

**Next Steps:**
1. Implement consistent hashing for shard placement
2. Replace all-to-all mesh with gossip-based protocol (e.g., SWIM)
3. Add auto-split triggers based on shard size and row count thresholds
4. Deploy token wallet on Redis with Lua scripts for atomic operations
5. Share model registry via Redis pub/sub for real-time updates

### 5. Observability Gaps

| Area | Current State | Production Requirement |
|------|--------------|----------------------|
| Metrics | None | Prometheus/OpenTelemetry metrics (latency, throughput, error rates) |
| Tracing | Correlation IDs in logs | Distributed tracing (OpenTelemetry + Jaeger/Zipkin) |
| Alerting | None | PagerDuty/OpsGenie integration for SLA breaches |
| Dashboards | None | Grafana dashboards for service health and mesh topology |
| Log Aggregation | Console output | ELK/Loki with structured JSON log shipping |

**Next Steps:**
1. Instrument all services with OpenTelemetry SDK
2. Export metrics to Prometheus and traces to Jaeger
3. Build Grafana dashboards for key SLIs
4. Configure alerts for error rate > 1%, p99 latency > 5s, mesh node loss

### 6. Data Integrity Gaps

| Area | Current State | Production Requirement |
|------|--------------|----------------------|
| Backup | None | Automated shard backup with point-in-time recovery |
| Migration Rollback | Forward-only migrations | Reversible migrations with rollback scripts |
| Checksum Verification | On-demand via `verifyIntegrity()` | Continuous background integrity checks |
| Shard Corruption Recovery | Manual re-create | Automatic recovery from replica or backup |

**Next Steps:**
1. Implement scheduled shard backup (SQLite `.backup()` API)
2. Add reverse migration scripts for each schema version
3. Run background integrity checks on a configurable schedule
4. Implement automatic recovery: detect corruption, fetch from replica, rebuild index

## Prioritized Roadmap

### P0 -- Critical for Any Deployment Beyond Localhost

1. **Authentication and Authorization** (Security Gap 3.1-3.2)
2. **TLS on All Connections** (Security Gap 3.3-3.4)
3. **Input Validation** (Security Gap 3.6)

### P1 -- Required for Multi-User / Multi-Workstation

4. **Persistent Replication Log** (Performance Gap 2.2)
5. **Persistent Token Wallet** (Performance Gap 2.5)
6. **HNSW ANN Index** (Performance Gap 2.1)
7. **FTS5 Text Search** (Performance Gap 2.3)

### P2 -- Required for Production Scale

8. **Real Avid Adapter** (Mock Gap 1.1)
9. **Real AI Backends + Model Distribution** (Mock Gap 1.5-1.6)
10. **Observability Stack** (Observability Gap 5)
11. **Automated Backup and Recovery** (Data Integrity Gap 6)

### P3 -- Required for Large-Scale Deployment

12. **Gossip-Based Mesh Protocol** (Scalability Gap 4.4)
13. **Distributed Shard Placement** (Scalability Gap 4.1)
14. **Auto-Split and Rebalancing** (Scalability Gap 4.5)
15. **Real Gemini Integration** (Mock Gap 1.7)

### P4 -- Nice to Have

16. **Real Pro Tools Bridge** (Mock Gap 1.3)
17. **Publish Connectors** (Mock Gap 1.4)
18. **Grafana Dashboards** (Observability Gap 5.4)
19. **Rate Limiting** (Security Gap 3.7)

## Consequences

### Positive

- Clear roadmap for productionization with measurable milestones
- Current implementation is fully functional for demonstration and development
- Mock adapters allow end-to-end workflow validation without proprietary dependencies
- All interfaces are designed for swappable implementations (adapter pattern)

### Negative

- Production deployment requires significant additional work (estimated 4-6 months at P0-P2)
- Real Avid adapter development is blocked on proprietary SDK access
- GPU backend testing requires dedicated hardware not available in CI

### Neutral

- The mock-first approach validates the architecture before investing in integration work
- Each gap can be addressed independently without redesigning the core system
- The IANNIndex, IModelBackend, and IAdapter interfaces ensure that production implementations are drop-in replacements

## Related ADRs

- [ADR-001](ADR-001-architecture-overview.md) -- Overall architecture
- [ADR-002](ADR-002-knowledge-db-canonical.md) -- Knowledge DB as canonical store
- [ADR-003](ADR-003-mesh-protocol.md) -- Mesh protocol (addresses scalability gaps)
- [ADR-004](ADR-004-model-runner-abstraction.md) -- Model runner abstraction (addresses backend gaps)
- [ADR-005](ADR-005-orchestration-safety.md) -- Safety model (addresses security gaps)
- [ADR-009](ADR-009-monetization-boundaries.md) -- Token wallet (addresses persistence gap)
- [ADR-010](ADR-010-analytics-privacy.md) -- Analytics privacy (addresses observability gaps)
