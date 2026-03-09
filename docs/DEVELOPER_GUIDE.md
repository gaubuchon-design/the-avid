# Developer Guide -- Media Composer Agentic Editing

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0
- **Git**
- **Python 3.10+** (optional, for notebook tooling)

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/gaubuchon-design/the-avid.git
cd the-avid

# 2. Install dependencies
#    Use --ignore-scripts to avoid electron-builder post-install issues
#    on machines without the full Electron build toolchain.
npm install --ignore-scripts

# 3. Build all packages
npx turbo build

# 4. Run all tests
npx turbo test
```

## Repository Layout

```
the-avid/
  apps/
    api/             # Express backend for the web application
    desktop/         # Electron desktop shell (media pipeline, GPU)
    web/             # React frontend (Vite)
  libs/
    contracts/       # @mcua/contracts  -- shared TypeScript types
    adapters/        # @mcua/adapters   -- adapter interfaces + mocks
    ui-components/   # @mcua/ui-components -- shared React components
  services/
    agent-orchestrator/   # @mcua/agent-orchestrator
    knowledge-node/       # @mcua/knowledge-node
    local-ai-runtime/     # @mcua/local-ai-runtime
  docs/
    adr/             # Architecture Decision Records
    spec/            # Specification documents
    notebooks/       # Jupyter exploration notebooks
  package.json       # Workspace root (npm workspaces + Turborepo)
```

## Architecture Overview

The system follows a three-service architecture with shared libraries:

1. **Agent Orchestrator** receives natural-language prompts, generates multi-step plans via Gemini, and executes tool calls through a plan-preview-approve-execute lifecycle.

2. **Knowledge Node** stores project metadata (assets, transcripts, vision events, embeddings) in SQLite shards. Nodes form a peer-to-peer mesh for scatter/gather search and shard replication.

3. **Local AI Runtime** provides pluggable model inference (embedding, STT, translation, vision, text generation) with backends for ONNX, TensorRT, llama.cpp, MLX, CTranslate2, and a MockBackend for development.

All three services communicate over HTTP REST. Shared types live in `@mcua/contracts` so every package agrees on the wire format.

## Package Guide

### libs/contracts -- @mcua/contracts

Shared TypeScript type definitions used across all packages. Includes:

- `agent-protocol.ts` -- Plan, step, approval, and execution types
- `knowledge-query.ts` -- Search query and result types
- `mesh-protocol.ts` -- Peer discovery and replication event types
- `token-metering.ts` -- Token wallet quote/hold/settle types
- `analytics-events.ts` -- Telemetry event types with privacy controls
- `transcripts.ts`, `project-assets.ts`, `embeddings.ts` -- Domain types

**Usage:** Import types from `@mcua/contracts` in any workspace package.

### libs/adapters -- @mcua/adapters

Adapter interfaces for external systems and their mock implementations:

| Interface | Mock | Purpose |
|-----------|------|---------|
| `IMediaComposerAdapter` | `MockMediaComposerAdapter` | Avid Media Composer timeline/bin operations |
| `IContentCoreAdapter` | `MockContentCoreAdapter` | Federated content core (lazy hydration) |
| `IProToolsAdapter` | `MockProToolsAdapter` | Pro Tools shared-session automation |
| `IPublishConnector` | `MockPublishConnector` | Multi-platform publish workflows |

Plus:
- `federation/` -- Content Core federation client with hydration cache
- `protools/` -- Pro Tools bridge with shared automation commands

**Adding a new adapter:** Create an `I<Name>Adapter.ts` interface and a `Mock<Name>Adapter.ts` implementation. Export both from `index.ts`.

### libs/ui-components -- @mcua/ui-components

Seven shared React components for the agentic editing UX:

| Component | Purpose |
|-----------|---------|
| `PromptBar` | Natural-language input with slash-command support |
| `PlanPreview` | Interactive plan visualization before execution |
| `ContextPill` | Compact context indicators (model, shard, tokens) |
| `TokenBadge` | Real-time token balance display |
| `ExecutionHistory` | Audit log of executed tool calls |
| `ResultsPanel` | Search results with provenance metadata |
| `PlaybookBuilder` | Visual playbook authoring tool |

All components use the design tokens in `agentic-ui.css`.

### services/agent-orchestrator -- @mcua/agent-orchestrator

Gemini-based agent orchestration service. Key modules:

- `OrchestratorService.ts` -- Main service coordinating planning, approval, and execution
- `planning/` -- Plan generation from user prompts
- `approval/` -- Policy-based approval with human-in-the-loop gates
- `execution/` -- Tool call routing and execution engine
- `wallet/` -- Token wallet with quote-hold-settle lifecycle
- `analytics/` -- Event emission with privacy controls
- `caching/` -- LRU plan cache for repeated queries
- `logging/` -- Structured logging with correlation IDs
- `workflows/` -- Six exemplar workflow scripts

### services/knowledge-node -- @mcua/knowledge-node

SQLite-based metadata store with mesh networking. Key modules:

- `db/KnowledgeDB.ts` -- Typed wrapper around better-sqlite3
- `db/migrations/` -- Schema migration scripts
- `shard/ShardManager.ts` -- Shard lifecycle (create, open, split, verify)
- `shard/ShardManifest.ts` -- Shard manifest serialization
- `index/ANNIndex.ts` -- ANN interface + BruteForceIndex implementation
- `index/IndexBuilder.ts` -- Builds ANN indices from DB embeddings
- `mesh/MeshService.ts` -- Top-level mesh coordinator
- `mesh/PeerDiscovery.ts` -- WebSocket peer management
- `mesh/ShardLeaseManager.ts` -- Single-writer lease protocol
- `mesh/ReplicationManager.ts` -- Append-only event log for replication
- `mesh/ScatterGatherSearch.ts` -- Distributed search fan-out
- `mesh/ResultRanker.ts` -- Multi-source result merging
- `mesh/ConflictHandler.ts` -- Conflict detection and tracking

### services/local-ai-runtime -- @mcua/local-ai-runtime

Pluggable model backend service. Key modules:

- `ModelRunner.ts` -- `IModelBackend` interface and types
- `ModelRegistry.ts` -- In-memory model catalog with capability queries
- `registry-seed.ts` -- Pre-seeded model entries
- `health.ts` -- Health check and quick benchmark endpoint
- `capabilities/` -- Shorthand pipelines (embedding, stt, translation)
- `backends/` -- Backend implementations:
  - `ONNXBackend.ts` -- ONNX Runtime (CPU/CUDA)
  - `TensorRTBackend.ts` -- NVIDIA TensorRT-LLM
  - `LlamaCppBackend.ts` -- llama.cpp (GGUF models)
  - `MLXBackend.ts` -- Apple MLX (Apple Silicon)
  - `CTranslate2Backend.ts` -- CTranslate2 (translation)
  - `MockBackend.ts` -- Development/CI fallback

## Running Services

```bash
# Start all three services (from repo root)
npm run dev

# Start individual services
cd services/agent-orchestrator && npx tsx src/server.ts
cd services/knowledge-node && npx tsx src/server.ts
cd services/local-ai-runtime && npx tsx src/server.ts
```

## Service Ports

| Service | Default Port | Environment Variable |
|---------|-------------|---------------------|
| Web App (Vite) | 5173 | `VITE_PORT` |
| API Server | 3000 | `PORT` |
| Agent Orchestrator | 4100 | `PORT` |
| Knowledge Node | 4200 | `PORT` |
| Local AI Runtime | 4300 | `PORT` |

## Testing

```bash
# Run all unit tests
npx turbo test

# Run tests for a specific service
cd services/knowledge-node && npx vitest run

# Run benchmarks
cd services/knowledge-node && npx vitest run src/__tests__/bench/
cd services/local-ai-runtime && npx vitest run src/__tests__/bench/

# Run reliability tests
cd services/knowledge-node && npx vitest run src/__tests__/reliability/
cd services/local-ai-runtime && npx vitest run src/__tests__/reliability/

# Run a single test file
npx vitest run path/to/test.ts

# Watch mode
npx vitest --watch
```

## Adding a New Tool

Tools are the atomic operations that the orchestrator executes. To add a new tool:

1. **Define the tool schema** in `services/agent-orchestrator/src/execution/`. Create a function that accepts typed parameters and returns a result object.

2. **Register in the tool router.** Add the tool name and handler to the `ToolCallRouter` in `execution/`.

3. **Add an approval rule** in `services/agent-orchestrator/src/approval/`. Specify whether the tool requires explicit human approval, auto-approves, or follows a policy gate.

4. **Register in Gemini tool definitions.** Update the tool list passed to the Gemini API so the planner can include the tool in generated plans.

5. **Update workflow templates** if the tool should appear in existing exemplar workflows.

6. **Add contract types** in `libs/contracts/src/tool-traces.ts` if the tool introduces new input/output shapes.

## Adding a New AI Backend

1. **Create the backend class** in `services/local-ai-runtime/src/backends/`. Implement the `IModelBackend` interface:
   ```typescript
   export class MyBackend implements IModelBackend {
     readonly name = 'my-backend';
     readonly supportedCapabilities: readonly ModelCapability[] = ['embedding', 'stt'];
     readonly supportedHardware: readonly HardwarePreference[] = ['cpu', 'cuda'];

     async isAvailable(): Promise<boolean> { /* probe native deps */ }
     async initialize(): Promise<void> { /* load shared libs */ }
     async shutdown(): Promise<void> { /* release resources */ }
     async execute(request: ModelRequest): Promise<ModelResult> { /* run inference */ }
     getLoadedModels(): string[] { /* return loaded model IDs */ }
   }
   ```

2. **Register in the backend resolution chain** in `services/local-ai-runtime/src/server.ts`. Add your backend to the `allBackends` array. Position it before `MockBackend` (which is always last as the fallback). Backends are tried in order; the first available one that supports the requested capability wins.

3. **Add model entries** to `services/local-ai-runtime/src/registry-seed.ts`. Each model entry specifies the backend name, capabilities, supported languages, quantization level, and hardware preference.

4. **Write tests** in `services/local-ai-runtime/src/__tests__/`. At minimum, test `isAvailable()`, `initialize()`/`shutdown()` lifecycle, and `execute()` for each supported capability.

## Adding a New Adapter

1. **Define the interface** in `libs/adapters/src/I<Name>Adapter.ts` with async methods for each operation.

2. **Create the mock** in `libs/adapters/src/Mock<Name>Adapter.ts` with realistic stub data.

3. **Export from `index.ts`** in `libs/adapters/src/`.

4. **Wire into the orchestrator** by injecting the adapter into the relevant tool handler in `services/agent-orchestrator/src/execution/`.

## Mesh Networking

The knowledge-node mesh uses WebSocket connections between peers:

- **Peer Discovery:** Static peer addresses or dynamic discovery via heartbeat
- **Shard Leases:** Single-writer model prevents concurrent write conflicts
- **Replication:** Append-only event log with sequence-based delta sync
- **Search:** Scatter/gather pattern with configurable timeout
- **Conflicts:** Tracked in-memory with resolution annotations

To add a node to the mesh, configure `peers` in `MeshConfig` with the addresses of existing nodes. The new node will connect, exchange identity, and participate in search and replication.

## Workflow Development

Exemplar workflows live in `services/agent-orchestrator/src/workflows/`. Each workflow:

1. Constructs a `WorkflowConfig` with prompt, tool list, and expected plan shape
2. Calls the orchestrator service to generate a plan
3. Presents the plan for approval
4. Executes approved steps
5. Reports results and token usage

Run a workflow:
```bash
cd services/agent-orchestrator
npx tsx src/workflows/sports-live-pull.ts
```

## ADR Index

| ADR | Title |
|-----|-------|
| [ADR-001](adr/ADR-001-architecture-overview.md) | Architecture Overview |
| [ADR-002](adr/ADR-002-knowledge-db-canonical.md) | Knowledge DB as Canonical Store |
| [ADR-003](adr/ADR-003-mesh-protocol.md) | Mesh Protocol Design |
| [ADR-004](adr/ADR-004-model-runner-abstraction.md) | Model Runner Abstraction |
| [ADR-005](adr/ADR-005-orchestration-safety.md) | Orchestration Safety Model |
| [ADR-006](adr/ADR-006-ux-safety-affordances.md) | UX Safety Affordances |
| [ADR-007](adr/ADR-007-federated-search.md) | Federated Search Design |
| [ADR-008](adr/ADR-008-cross-app-automation.md) | Cross-App Automation (Pro Tools) |
| [ADR-009](adr/ADR-009-monetization-boundaries.md) | Monetization Boundaries |
| [ADR-010](adr/ADR-010-analytics-privacy.md) | Analytics and Privacy |
| [ADR-011](adr/ADR-011-productionization-gaps.md) | Productionization Gaps |

## Troubleshooting

### `better-sqlite3` native module errors

If you see errors about native modules when running knowledge-node tests:

```bash
cd services/knowledge-node
npm rebuild better-sqlite3
```

For Electron builds, the native module must be rebuilt for the Electron Node version:

```bash
npx electron-rebuild -f -w better-sqlite3
```

### Port conflicts

If a service fails to start due to `EADDRINUSE`, another process is using the port. Either stop the conflicting process or override the port:

```bash
PORT=4201 npx tsx src/server.ts
```

### TypeScript build errors

After pulling new changes:

```bash
npx turbo build --force
```

This rebuilds all packages in dependency order, ensuring type declarations are up to date.

### WebSocket connection failures in tests

Mesh reliability tests use randomized ports. If tests fail intermittently, increase the connection timeout or sleep duration in the test setup.
