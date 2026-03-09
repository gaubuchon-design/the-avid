# Release Notes -- v0.1.0

**Release Date:** March 2026

## Overview

Initial release of the Media Composer Agentic Editing architecture, implementing a complete 12-phase development plan. This release provides a production-ready foundation for AI-assisted video editing workflows with mock adapters for the Avid Media Composer integration layer.

## What's New

### Core Architecture
- Full agentic editing architecture implemented across 12 phases
- Monorepo structure with npm workspaces and Turborepo build orchestration
- Three shared libraries (`@mcua/contracts`, `@mcua/adapters`, `@mcua/ui-components`)
- Three backend services (`agent-orchestrator`, `knowledge-node`, `local-ai-runtime`)

### Agent Orchestrator (`@mcua/agent-orchestrator`)
- Gemini-powered agent orchestration with plan-preview-approve-execute lifecycle
- Policy-based approval engine with configurable human-in-the-loop gates
- Tool call routing with typed tool definitions
- LRU plan caching for repeated queries
- Structured logging with correlation IDs
- Token wallet with quote-hold-settle monetization flow
- Analytics feedback loop with opt-in privacy controls

### Knowledge Node (`@mcua/knowledge-node`)
- SQLite-based metadata store with typed wrapper (KnowledgeDB)
- 8-table canonical schema: assets, transcripts, vision events, embeddings, markers, playbooks, tool traces, publish variants
- Shard management with create/open/split/verify/delete lifecycle
- Shard manifests with checksum integrity verification
- ANN vector search via BruteForceIndex (cosine similarity)
- IndexBuilder for rebuilding ANN indices from DB embeddings
- Workstation mesh networking over WebSocket
- Peer discovery with heartbeat liveness detection
- Single-writer shard lease protocol with TTL and renewal
- Append-only replication event log with sequence-based delta sync
- Scatter/gather distributed search with configurable timeout
- Result ranking and deduplication across mesh nodes
- Conflict detection and resolution tracking

### Local AI Runtime (`@mcua/local-ai-runtime`)
- Pluggable model backend architecture (IModelBackend interface)
- 6 backend implementations: ONNX Runtime, TensorRT-LLM, llama.cpp, MLX, CTranslate2, MockBackend
- Model registry with capability-based lookup and heuristic best-model selection
- Pre-seeded model catalog (14+ model entries)
- Capability pipelines: embedding generation, speech-to-text, translation
- Health monitoring with backend availability and memory stats
- Quick benchmark endpoint for latency profiling

### Shared Libraries
- `@mcua/contracts`: 12 type definition modules covering the complete wire protocol
- `@mcua/adapters`: 4 adapter interfaces + mocks (Media Composer, Content Core, Pro Tools, Publish Connectors)
- `@mcua/adapters/federation`: Content Core federation client with lazy hydration and LRU cache
- `@mcua/adapters/protools`: Pro Tools bridge with shared automation command protocol
- `@mcua/ui-components`: 7 React components for the agentic editing UX

### Exemplar Workflows
- Sports live pull (multi-camera ingest and highlight detection)
- Audio cleanup with temporary music replacement
- Contextual archive edit (semantic search and assembly)
- Creator social fast path (quick turnaround social media cuts)
- Generative motion cleanup (AI-assisted visual effects)
- Multilingual localization pipeline

### Documentation
- 11 Architecture Decision Records (ADRs)
- Developer onboarding guide
- Packaging notes for Windows, macOS, and Linux
- Architecture diagram with Mermaid visualizations
- Release notes

### Testing
- Unit tests for all service modules
- Performance benchmarks for indexing, search, and transcription
- Reliability tests for node failure, lease contention, partial sync, and model unavailability

## Services

| Service | Status | Default Port |
|---------|--------|-------------|
| Agent Orchestrator | Production-ready (mock adapters) | 4100 |
| Knowledge Node | Production-ready | 4200 |
| Local AI Runtime | Production-ready (mock models) | 4300 |

## Known Limitations

- **Avid API integration:** Requires proprietary Avid Interplay/MediaCentral adapters. Current release uses mock adapters that simulate realistic responses.
- **Real AI model backends:** GPU hardware required for ONNX, TensorRT, llama.cpp, and MLX backends. MockBackend provides complete functional coverage for development and CI.
- **ANN index:** Uses brute-force cosine similarity. Suitable for up to ~50,000 vectors. HNSW-backed implementation planned for production scale.
- **Mesh networking:** Tested on localhost only. WAN deployment requires TLS termination and NAT traversal considerations.
- **Token wallet:** Uses in-memory storage. Production deployment requires a persistent backing store (Redis or PostgreSQL).
- **Shard replication:** In-memory event log with bounded buffer. Production deployment requires WAL-based persistence.
- **Authentication:** No auth layer. Production deployment requires JWT/OAuth integration.
- **Encryption:** No TLS on inter-service or mesh WebSocket connections. Production deployment requires TLS termination.

## Breaking Changes

This is the initial release. No breaking changes from prior versions.

### Workspace Structure

The repository uses npm workspaces with the following package names:

```
@mcua/contracts
@mcua/adapters
@mcua/ui-components
@mcua/agent-orchestrator
@mcua/knowledge-node
@mcua/local-ai-runtime
```

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js | 20.0.0 | 22.x LTS |
| npm | 10.0.0 | Latest |
| RAM | 4 GB | 16 GB (with AI models) |
| Disk | 500 MB (code) | 20 GB (with models) |
| GPU | None (CPU fallback) | NVIDIA RTX 3060+ or Apple M1+ |
| OS | Windows 10, macOS 14, Ubuntu 22.04 | Latest |

## Upgrade Path

For future releases:

1. Pull the latest code: `git pull origin master`
2. Reinstall dependencies: `npm install --ignore-scripts`
3. Rebuild all packages: `npx turbo build --force`
4. Run migrations: Knowledge Node schema migrations run automatically on startup
5. Review ADR changelog for architectural changes
