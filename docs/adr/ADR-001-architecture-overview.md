# ADR-001: Agentic Editing Architecture Overview

**Status:** Accepted
**Date:** 2026-03-08
**Authors:** Platform Architecture Team

---

## Context

We are adding agentic editing capabilities to Media Composer. The design
specification calls for a comprehensive set of AI-powered subsystems:

- **Gemini-powered Agent Orchestration** -- a planning engine that decomposes
  high-level editorial intents into sequences of tool calls, subject to
  configurable human-approval policies.
- **Project Knowledge DB** -- an embedded, per-project database with semantic
  search (ANN indexes) and a mesh networking protocol so that multiple editors
  sharing a project can synchronize knowledge in real time.
- **Local AI Runtime** -- an on-device inference service supporting multiple
  backends (Whisper for transcription, LLaMA-class models for local text
  generation, ONNX Runtime for lightweight classifiers) with graceful fallback
  to cloud APIs.
- **Content Core Federation** -- adapter layer for Avid's shared-storage
  ecosystem, enabling agents to browse, check out, and manage bins across
  production storage.
- **Pro Tools Bridge** -- bidirectional AAF/OMF interchange plus real-time
  transport sync via Avid EUCON, allowing agents to coordinate audio mixing
  sessions alongside picture edits.
- **Token Wallet** -- a per-user, per-project budget that tracks API token
  consumption across cloud providers, enforces spending limits, and surfaces
  cost-per-action in the UX.
- **Analytics Pipeline** -- captures agent actions, edit outcomes, and
  performance telemetry for both product improvement and editorial review.

The existing codebase is a TypeScript monorepo (`npm workspaces` + Turbo) with:

| Layer | Technology |
|-------|-----------|
| Web frontend | React 18, Zustand, Vite |
| Desktop shell | Electron (apps/desktop) |
| API server | Express (apps/api) |
| Core library | `@mcua/core` -- types, collab CRDT, vertical agents |
| Edit engine | Command-pattern `EditEngine` with full undo/redo |
| Agent engine | `AgentEngine` class with Gemini client |

The design specification originally proposed **Rust** for the Knowledge Node
(performance-critical ANN search) and **Python** for the local AI runtime
(ecosystem compatibility with ML frameworks). This ADR captures why we chose
a different approach.

---

## Decision

### 1. All new services will be TypeScript / Node.js

We choose a single-language stack for the entire monorepo.

- The **Rust Knowledge Node** is replaced with a TypeScript service backed by
  `better-sqlite3` (synchronous, zero-config embedded SQL) and `hnswlib-node`
  (native N-API binding for Hierarchical Navigable Small World graphs).
- The **Python AI Runtime** is replaced with a TypeScript service that wraps
  native inference backends via FFI / child-process when available, and provides
  **full mock implementations** for CI and development without GPU hardware.

### 2. Shared contract types in `@mcua/contracts`

All inter-service message schemas, database row types, agent protocol
definitions, token wallet schemas, and analytics event shapes live in a single
`libs/contracts` package. Every service and app depends on contracts; no service
depends on another service directly.

### 3. Adapter interfaces in `@mcua/adapters`

External-system integrations -- Media Composer OAMP, Content Core SOAP/REST,
Pro Tools EUCON, publish destinations -- are defined as TypeScript interfaces
with **mock implementations** that ship alongside the real ones. The mock
adapters allow the entire platform to run without any Avid hardware or
third-party installations.

### 4. Agent Orchestrator as a standalone service

The existing `AgentEngine` class in `@mcua/core` becomes a **thin client** that
forwards planning requests to the new `@mcua/agent-orchestrator` service over
WebSocket. The orchestrator owns:

- Gemini session management and prompt construction
- Approval-policy enforcement (auto / confirm / deny)
- Tool-call routing to adapters
- Plan caching and replay

### 5. All agent actions flow through EditEngine

No agent bypasses the existing command-pattern edit pipeline. Every mutating
action the orchestrator executes on the timeline is issued as an `EditCommand`,
preserving full undo/redo and collaborative conflict resolution.

### 6. New packages follow existing monorepo conventions

- npm workspaces with Turbo task orchestration
- Vitest for unit and integration tests
- Shared `tsconfig.base.json` with project-reference paths
- Consistent `scripts` block (`build`, `dev`, `type-check`, `test`, `clean`)

---

## Architecture Layers

```
+-------------------------------------------------------------+
|                        UI Layer                              |
|  React panels (apps/web + apps/desktop)                     |
|  @mcua/ui-components (shared agentic editing components)    |
+-------------------------------------------------------------+
         |               |                |
         v               v                v
+------------------+ +------------------+ +-------------------+
| Agent            | | Knowledge        | | Local AI          |
| Orchestrator     | | Node             | | Runtime           |
| :4100            | | :4200            | | :4300             |
| (Gemini planning,| | (SQLite shards,  | | (model runner,    |
|  approval policy,| |  ANN indexes,    | |  pluggable        |
|  tool routing)   | |  mesh protocol)  | |  backends)        |
+------------------+ +------------------+ +-------------------+
         |               |                |
         v               v                v
+-------------------------------------------------------------+
|                     Adapter Layer                            |
|  @mcua/adapters                                             |
|  MC | Content Core | Pro Tools | Publish (+ mock impls)     |
+-------------------------------------------------------------+
         |
         v
+-------------------------------------------------------------+
|                    Contract Layer                            |
|  @mcua/contracts                                            |
|  Shared types, schemas, protocols, events                   |
+-------------------------------------------------------------+
         |
         v
+-------------------------------------------------------------+
|                      Core Layer                              |
|  @mcua/core                                                 |
|  Existing: types, collab CRDT, vertical agents, EditEngine  |
+-------------------------------------------------------------+
```

### Service Ports

| Service | Default Port | Protocol |
|---------|-------------|----------|
| agent-orchestrator | 4100 | HTTP + WebSocket |
| knowledge-node | 4200 | HTTP + WebSocket (mesh) |
| local-ai-runtime | 4300 | HTTP |
| web app (Vite) | 5173 | HTTP |

---

## Consequences

### Positive

- **Single language across the stack** simplifies onboarding, enables shared
  tooling (linters, formatters, test runner), and allows developers to trace a
  request from the UI through the orchestrator to the adapter layer without
  switching language contexts.
- **Mock-first adapter pattern** means the full platform can be developed and
  tested without actual Avid Media Composer, Pro Tools, or Content Core
  installations. CI pipelines run entirely against mocks.
- **Contract-driven design** prevents accidental coupling between services and
  makes schema evolution explicit and reviewable.
- **EditEngine integration** preserves the existing undo/redo guarantee for all
  agent actions, which is critical for editor trust.

### Negative / Risks

- **Performance-critical paths** (ANN search over large knowledge bases, real-
  time audio analysis) may eventually require native modules or a move to Rust/
  C++ for hot paths. The adapter pattern makes this migration local -- consumers
  call the same TypeScript interface regardless of the backing implementation.
- **ML ecosystem access** is narrower in Node.js than Python. The local AI
  runtime mitigates this by shelling out to native binaries (whisper.cpp,
  llama.cpp) and parsing their output, rather than loading models in-process.
- **Three additional Node.js processes** increases the desktop application's
  memory footprint. In production builds, the services may be consolidated into
  a single process with in-memory message passing.

### Migration Path

The adapter-interface pattern explicitly supports swapping TypeScript service
implementations with Rust or Python equivalents without changing any consumer
code. If profiling reveals that `better-sqlite3` or `hnswlib-node` cannot meet
latency requirements at scale, we can rewrite the Knowledge Node internals in
Rust behind the same HTTP+WebSocket contract. The rest of the system is
unaffected.

---

## References

- Design specification: internal document (sections 2-8)
- Existing architecture: `packages/core/src/`, `apps/web/src/`, `apps/api/`
- npm workspaces: https://docs.npmjs.com/cli/using-npm/workspaces
- better-sqlite3: https://github.com/WiseLibs/better-sqlite3
- hnswlib-node: https://github.com/yoshoku/hnswlib-node
