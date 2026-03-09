# ADR-003: Mesh Network Protocol for Knowledge Nodes

| Field       | Value                          |
| ----------- | ------------------------------ |
| Status      | Accepted                       |
| Date        | 2026-03-08                     |
| Deciders    | Architecture team              |
| Supersedes  | N/A                            |

## Context

The knowledge-node service stores project data in SQLite-backed shards.
Phase 2 implemented single-node shard management, ANN indexing, and a
manifest-based lifecycle. Phase 3 requires multiple knowledge-node
instances to form a mesh network that supports:

- Peer discovery and liveness detection across nodes.
- Single-writer lease management to prevent concurrent-write conflicts.
- Cross-node search that returns a unified, ranked result set.
- Append-only event log replication for eventual consistency.
- Conflict detection and resolution when mesh invariants are violated.

## Decision

### 1. WebSocket + JSON-RPC for mesh communication

We chose WebSocket with a simple JSON-RPC-style message format over
alternatives such as gRPC or raw TCP:

- **TypeScript simplicity**: The `ws` package is already a dependency
  and requires no code generation or protobuf tooling. Adding gRPC would
  introduce `@grpc/grpc-js`, `.proto` file management, and a build step
  for code generation that is disproportionate to the current scale.
- **Bidirectional messaging**: WebSocket supports full-duplex
  communication out of the box, which is needed for both request/response
  patterns (search queries) and push-based patterns (heartbeats,
  replication events).
- **Browser compatibility**: The same WebSocket endpoint can serve both
  peer-to-peer mesh traffic and future browser-based admin dashboards.

Wire format:
```json
{
  "type": "search",
  "payload": { "text": "product launch", "topK": 10 },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

The `requestId` field enables request/response correlation. Messages
without a `requestId` are fire-and-forget (heartbeats, broadcasts).

### 2. Single-writer lease model

Each shard may be written to by at most one node at a time. The lease
model provides the following guarantees:

- **No concurrent writers**: A node must hold the lease before mutating
  a shard. Attempting to acquire a lease held by another node returns
  `null`.
- **Time-bounded**: Leases have a configurable TTL (default 30 seconds)
  and must be renewed periodically. If a node crashes, its leases expire
  automatically.
- **Voluntary release**: Nodes release leases when they finish a write
  batch or shut down gracefully.
- **Re-acquisition**: After a lease expires or is released, any node may
  acquire it.

Leases are currently stored in-memory on each node. This is acceptable
for the current phase where lease coordination is performed via mesh
messages. A future phase may persist leases to the shard database for
crash recovery.

### 3. Scatter/gather search

Cross-node search uses a scatter/gather pattern:

1. **Local search**: The initiating node searches all its local shards
   using SQLite text search and the ANN index (if available).
2. **Fan-out**: The query is sent to all connected peers via
   `PeerDiscovery.sendToPeer()`.
3. **Timeout-bounded collection**: Responses are collected with a
   configurable timeout (default 5 seconds). Peers that do not respond
   in time are silently skipped.
4. **Merge and rank**: Results are merged using per-node min-max score
   normalisation, deduplicated by `sourceId`, and sorted by normalised
   score descending.

This approach prioritises availability over completeness: a search
always returns within the timeout window, even if some peers are slow
or unreachable. The response metadata (`nodesQueried` vs.
`nodesResponded`) lets callers assess result completeness.

### 4. Append-only event log for replication

Shard replication uses an ordered event log:

- Every mutating operation (insert, update, delete) is recorded as a
  `ReplicationEvent` with a monotonically increasing sequence number.
- Replicas request a delta by providing their last-seen sequence number
  via `getEventsSince(shardId, sinceSequence)`.
- Events are stored in a bounded in-memory ring buffer (default 10,000
  events per shard).

This design avoids full-shard snapshots for incremental sync and is
compatible with future WAL-based persistence. The event log is
intentionally decoupled from SQLite's own WAL to allow cross-database
replication (e.g. replicating events from one node's shard-A to another
node's shard-A replica).

### 5. Conflict handling

Four conflict types are tracked:

| Type                  | Trigger                                       | Resolution strategy              |
| --------------------- | --------------------------------------------- | -------------------------------- |
| `lease-loss`          | Node discovers its lease expired or was taken  | Re-queue pending writes          |
| `stale-manifest`      | Remote peer advertises newer manifest version  | Trigger sync from remote         |
| `partial-replication` | Replication stream ends before expected seq    | Re-request missing events        |
| `shard-mismatch`      | Two nodes disagree on shard identity           | Manual intervention              |

Conflicts are recorded as immutable events in an in-memory log with
optional resolution annotations. This provides an audit trail for
debugging mesh issues.

## Alternatives Considered

### gRPC

gRPC offers strong typing, efficient binary serialisation, and
bidirectional streaming. However, it requires `.proto` files,
generated stubs, and a heavier runtime. For a TypeScript-native
project with simple message shapes, the overhead is not justified at
this scale.

### Redis Pub/Sub for peer communication

Using Redis as a message broker would simplify peer discovery and
message routing. However, it introduces an external dependency that
must be deployed alongside every node. The WebSocket-based approach
is self-contained and requires no infrastructure beyond the nodes
themselves.

### CRDT-based replication

Conflict-free Replicated Data Types would enable multi-writer semantics
without leases. However, the complexity of designing CRDTs for the
full schema (assets, transcripts, embeddings) is substantial and
premature for the current use case where single-writer-per-shard is
sufficient.

## Consequences

- **Positive**: Simple, self-contained mesh with no external dependencies
  beyond Node.js and the existing `ws` package.
- **Positive**: Single-writer model avoids the complexity of multi-writer
  conflict resolution.
- **Positive**: Scatter/gather search provides sub-second cross-node
  queries with graceful degradation on peer failure.
- **Negative**: In-memory lease and replication state is lost on crash.
  A future phase should persist these to the shard database.
- **Negative**: The single-writer model limits write throughput to one
  node per shard. This is acceptable for the current editorial workflow
  where concurrent writes to the same shard are rare.
