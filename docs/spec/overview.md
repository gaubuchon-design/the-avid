# Module-to-Spec Mapping

This document maps each package and service in the MCUA monorepo to the
corresponding section of the agentic editing design specification. Use it as a
cross-reference when implementing features to ensure every spec requirement has
a home in the codebase.

---

## Contract Layer

### `@mcua/contracts` (`libs/contracts`)

| Spec Section | What It Covers | Contract Area |
|-------------|---------------|---------------|
| Section 2 | Project Knowledge DB schema -- document types, embedding records, shard metadata, peer manifests | `types/knowledge.ts` |
| Section 4 | Agent protocol -- plan schemas, tool-call envelopes, approval-request/response, agent session lifecycle | `types/agent.ts` |
| Section 6 | Token wallet schema -- budget records, usage events, provider rate tables, spending-limit policies | `types/wallet.ts` |
| Section 7 | Analytics schema -- agent action events, edit outcome tracking, performance telemetry, session summaries | `types/analytics.ts` |

---

## Adapter Layer

### `@mcua/adapters` (`libs/adapters`)

| Spec Section | What It Covers | Adapter Interface |
|-------------|---------------|-------------------|
| Section 3 | External system interfaces -- Media Composer OAMP connection, bin read/write, timeline mutation, media management | `mc-adapter.ts` |
| Section 5 | Content Core federation -- workspace browsing, asset check-out/check-in, metadata sync, shared storage access | `content-core-adapter.ts` |
| Section 8 | Pro Tools bridge -- AAF/OMF export/import, EUCON transport sync, session file interchange, mix automation relay | `protools-adapter.ts` |
| Section 8 | Publish destinations -- social media, MAM ingest, file-based delivery, template-driven output | `publish-adapter.ts` |

Each adapter interface ships with a corresponding `mock-*.ts` implementation
that returns realistic test data without requiring external software.

---

## Services

### `@mcua/agent-orchestrator` (`services/agent-orchestrator`)

| Spec Section | What It Covers |
|-------------|---------------|
| Section 4.1 | Gemini session management -- model selection, context window packing, conversation history |
| Section 4.2 | Plan decomposition -- intent parsing, step generation, dependency graph construction |
| Section 4.3 | Approval policies -- auto-approve thresholds, confirm-before-execute rules, deny lists |
| Section 4.4 | Tool calling -- adapter dispatch, result aggregation, error recovery, retry policies |
| Section 4.5 | Plan caching and replay -- deterministic re-execution, plan templates, macro recording |

### `@mcua/knowledge-node` (`services/knowledge-node`)

| Spec Section | What It Covers |
|-------------|---------------|
| Section 2.1 | SQLite shard management -- per-project databases, schema migrations, backup/restore |
| Section 2.2 | Semantic search -- HNSW index construction, embedding storage, nearest-neighbor queries |
| Section 2.3 | Mesh networking -- peer discovery (mDNS), state synchronization, conflict resolution, shard replication |
| Section 2.4 | Document ingestion -- script import, metadata extraction, transcript alignment, embedding generation |

### `@mcua/local-ai-runtime` (`services/local-ai-runtime`)

| Spec Section | What It Covers |
|-------------|---------------|
| Section 3.1 | Model runner -- backend detection, model loading/unloading, memory management |
| Section 3.2 | Whisper backend -- audio transcription, language detection, timestamp alignment |
| Section 3.3 | LLaMA backend -- local text generation, prompt formatting, streaming output |
| Section 3.4 | ONNX backend -- classifier inference, feature extraction, scene detection |
| Section 3.5 | Cloud fallback -- API routing when local backends are unavailable or too slow |

---

## UI Layer

### `@mcua/ui-components` (`libs/ui-components`)

| Spec Section | What It Covers |
|-------------|---------------|
| Section 5.1 | Prompt bar -- natural language input, autocomplete, context chips, history |
| Section 5.2 | Plan preview panel -- step visualization, approval buttons, progress tracking |
| Section 5.3 | Agent activity feed -- action log, undo triggers, cost display |
| Section 5.4 | Knowledge browser -- search interface, document cards, relationship graph |
| Section 5.5 | Token wallet widget -- budget gauge, spending breakdown, limit warnings |

---

## Applications

### `apps/web`

Integration host for all agentic editing features. Connects to the three
services via HTTP and WebSocket. Renders `@mcua/ui-components` panels alongside
the existing timeline, bins, and monitor areas.

| Spec Section | Integration Point |
|-------------|-------------------|
| Section 4 | `AgentEngine` client connecting to agent-orchestrator WebSocket |
| Section 2 | Knowledge queries routed through knowledge-node HTTP API |
| Section 3 | Transcription and local inference via local-ai-runtime HTTP API |
| Section 5 | Agentic editing UX panels rendered in the editor layout |

### `apps/desktop`

Electron shell that manages the lifecycle of all three services as child
processes. Handles native GPU detection for the local AI runtime, file-system
access for project knowledge databases, and mDNS advertisement for mesh
networking.

| Spec Section | Integration Point |
|-------------|-------------------|
| Section 2.3 | mDNS peer discovery for knowledge-node mesh |
| Section 3.1 | GPU detection and backend selection for local-ai-runtime |
| Section 8 | Native Pro Tools bridge via EUCON SDK |

---

## Dependency Graph

```
apps/web ──────────> @mcua/ui-components ──> @mcua/contracts
    |                                             ^
    |                                             |
    +──> @mcua/core <─────────────────────────────+
    |                                             |
    +──> agent-orchestrator ──> @mcua/adapters ───+
    |                                 |
    +──> knowledge-node ──────────────+
    |
    +──> local-ai-runtime ────────────+
```

All arrows point toward `@mcua/contracts` at the bottom of the dependency
graph. No service depends on another service; communication is exclusively
over the network via the contracts defined in the shared types package.
