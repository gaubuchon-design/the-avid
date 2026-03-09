# Architecture Diagram

## System Overview

```mermaid
graph TB
    subgraph "Client Layer"
        WEB["Web App<br/>(React + Vite)<br/>:5173"]
        DESKTOP["Desktop Shell<br/>(Electron)<br/>GPU / Media Pipeline"]
    end

    subgraph "API Layer"
        API["API Server<br/>(Express)<br/>:3000"]
    end

    subgraph "Service Layer"
        ORCH["Agent Orchestrator<br/>@mcua/agent-orchestrator<br/>:4100"]
        KN["Knowledge Node<br/>@mcua/knowledge-node<br/>:4200"]
        AIR["Local AI Runtime<br/>@mcua/local-ai-runtime<br/>:4300"]
    end

    subgraph "Shared Libraries"
        CONTRACTS["@mcua/contracts<br/>TypeScript Types"]
        ADAPTERS["@mcua/adapters<br/>Adapter Interfaces + Mocks"]
        UICOMP["@mcua/ui-components<br/>Agentic UI Components"]
    end

    subgraph "External Systems (via Adapters)"
        MC["Avid Media Composer"]
        PT["Pro Tools"]
        CC["Content Core"]
        PUB["Publish Targets<br/>(YouTube, Social, etc.)"]
    end

    WEB --> API
    DESKTOP --> API
    WEB -.->|shared components| UICOMP
    API --> ORCH
    ORCH --> KN
    ORCH --> AIR
    ORCH -->|mock adapters| ADAPTERS
    ADAPTERS -.->|production| MC
    ADAPTERS -.->|production| PT
    ADAPTERS -.->|production| CC
    ADAPTERS -.->|production| PUB
    ORCH --> CONTRACTS
    KN --> CONTRACTS
    AIR --> CONTRACTS
```

## User Prompt Lifecycle

```mermaid
sequenceDiagram
    participant U as User
    participant PB as PromptBar
    participant O as Orchestrator
    participant P as Planner
    participant A as Approval Engine
    participant E as Executor
    participant TW as Token Wallet
    participant KN as Knowledge Node
    participant AI as Local AI Runtime

    U->>PB: "Find all interviews with the mayor and create a highlight reel"
    PB->>O: Submit prompt

    O->>TW: Quote tokens for plan generation
    TW-->>O: Quote (estimated cost)

    O->>P: Generate plan
    P->>AI: Rewrite query (semantic expansion)
    AI-->>P: Expanded query terms
    P-->>O: Multi-step plan

    O->>U: Present plan preview (PlanPreview component)
    U->>O: Approve plan

    O->>TW: Hold tokens
    TW-->>O: Hold confirmed

    loop For each step
        O->>A: Check approval policy
        A-->>O: Auto-approve / require human gate

        alt Requires human approval
            O->>U: Request step approval
            U->>O: Approve step
        end

        O->>E: Execute tool call
        E->>KN: Search transcripts / assets
        KN-->>E: Search results
        E->>AI: Generate embeddings / transcribe
        AI-->>E: AI results
        E-->>O: Step result
        O->>TW: Settle tokens for step
    end

    O->>U: Display results (ResultsPanel + ExecutionHistory)
    O->>TW: Finalize wallet settlement
```

## Knowledge Node Mesh Topology

```mermaid
graph LR
    subgraph "Workstation A"
        KN_A["Knowledge Node A<br/>:4200"]
        DB_A1["Shard A1<br/>(SQLite)"]
        DB_A2["Shard A2<br/>(SQLite)"]
        IDX_A["ANN Index<br/>(BruteForce)"]
        KN_A --- DB_A1
        KN_A --- DB_A2
        KN_A --- IDX_A
    end

    subgraph "Workstation B"
        KN_B["Knowledge Node B<br/>:4200"]
        DB_B1["Shard B1<br/>(SQLite)"]
        IDX_B["ANN Index<br/>(BruteForce)"]
        KN_B --- DB_B1
        KN_B --- IDX_B
    end

    subgraph "Workstation C"
        KN_C["Knowledge Node C<br/>:4200"]
        DB_C1["Shard C1<br/>(SQLite)"]
        DB_C2["Shard C2<br/>(SQLite)"]
        IDX_C["ANN Index<br/>(BruteForce)"]
        KN_C --- DB_C1
        KN_C --- DB_C2
        KN_C --- IDX_C
    end

    KN_A <-->|WebSocket<br/>Peer Discovery<br/>Heartbeat| KN_B
    KN_B <-->|WebSocket<br/>Replication<br/>Search Fan-out| KN_C
    KN_A <-->|WebSocket<br/>Lease Coordination| KN_C
```

### Mesh Operations

```mermaid
graph TD
    QUERY["Search Query"] --> SCATTER["Scatter Phase"]
    SCATTER --> LOCAL["Search Local Shards"]
    SCATTER --> FAN["Fan Out to Peers"]

    LOCAL --> TEXT["Text Search<br/>(SQLite LIKE)"]
    LOCAL --> ANN["ANN Vector Search<br/>(BruteForceIndex)"]

    FAN --> PEER_A["Peer A Response"]
    FAN --> PEER_B["Peer B Response"]
    FAN --> TIMEOUT["Timeout<br/>(5s default)"]

    TEXT --> GATHER["Gather Phase"]
    ANN --> GATHER
    PEER_A --> GATHER
    PEER_B --> GATHER
    TIMEOUT -.->|partial results| GATHER

    GATHER --> RANK["ResultRanker<br/>Merge + Deduplicate"]
    RANK --> RESULTS["MergedSearchResults<br/>hits, timing, node counts"]
```

## AI Runtime Backend Resolution

```mermaid
graph TD
    REQ["Model Request<br/>(capability + modelId)"]
    REQ --> CHECK_ONNX{"ONNX Runtime<br/>available?"}

    CHECK_ONNX -->|Yes| ONNX["ONNX Backend<br/>(CPU / CUDA / CoreML)"]
    CHECK_ONNX -->|No| CHECK_TRT{"TensorRT-LLM<br/>available?"}

    CHECK_TRT -->|Yes| TRT["TensorRT Backend<br/>(NVIDIA GPU)"]
    CHECK_TRT -->|No| CHECK_LLAMA{"llama.cpp<br/>available?"}

    CHECK_LLAMA -->|Yes| LLAMA["llama.cpp Backend<br/>(GGUF models)"]
    CHECK_LLAMA -->|No| CHECK_MLX{"MLX<br/>available?"}

    CHECK_MLX -->|Yes| MLX["MLX Backend<br/>(Apple Silicon)"]
    CHECK_MLX -->|No| CHECK_CT2{"CTranslate2<br/>available?"}

    CHECK_CT2 -->|Yes| CT2["CTranslate2 Backend<br/>(Translation)"]
    CHECK_CT2 -->|No| MOCK["MockBackend<br/>(Always Available)"]

    ONNX --> RESULT["ModelResult"]
    TRT --> RESULT
    LLAMA --> RESULT
    MLX --> RESULT
    CT2 --> RESULT
    MOCK --> RESULT
```

## Data Flow: Asset Ingestion

```mermaid
graph LR
    FILE["Media File<br/>(MXF, MOV, WAV)"]
    FILE --> INGEST["Ingest Tool"]

    INGEST --> META["Extract Metadata<br/>(format, codec, duration)"]
    INGEST --> TRANSCODE["Proxy Transcode<br/>(via FFmpeg)"]

    META --> DB_INSERT["Insert Asset Row<br/>(KnowledgeDB)"]

    INGEST --> STT["Transcribe Audio<br/>(Local AI Runtime)"]
    STT --> SEG_INSERT["Insert Transcript<br/>Segments"]

    INGEST --> VISION["Analyze Frames<br/>(Local AI Runtime)"]
    VISION --> VIS_INSERT["Insert Vision<br/>Events"]

    SEG_INSERT --> EMBED["Generate Embeddings<br/>(Local AI Runtime)"]
    VIS_INSERT --> EMBED
    EMBED --> EMB_INSERT["Insert Embedding<br/>Chunks"]

    EMB_INSERT --> INDEX["Rebuild ANN Index"]

    DB_INSERT --> REPLICATE["Replicate Event<br/>(ReplicationManager)"]
    SEG_INSERT --> REPLICATE
    VIS_INSERT --> REPLICATE
    EMB_INSERT --> REPLICATE

    REPLICATE --> PEERS["Broadcast to<br/>Mesh Peers"]
```

## Token Wallet Flow

```mermaid
sequenceDiagram
    participant O as Orchestrator
    participant W as Token Wallet
    participant U as User

    O->>W: quote(planId, estimatedTokens)
    W-->>O: QuoteResponse (quoteId, price)

    O->>U: Show estimated cost
    U->>O: Approve

    O->>W: hold(quoteId)
    W-->>O: HoldResponse (holdId, reserved)

    loop Each Tool Execution
        O->>W: settle(holdId, actualTokens)
        W-->>O: SettleResponse (remaining)
    end

    O->>W: finalize(holdId)
    W-->>O: Release unused hold
```
