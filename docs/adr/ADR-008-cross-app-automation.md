# ADR-008: Cross-App Automation -- Pro Tools Shared Bridge

**Status:** Accepted
**Date:** 2026-03-08
**Authors:** Agent Orchestrator Team
**Supersedes:** None

## Context

Professional post-production workflows routinely span Media Composer (MC)
and Pro Tools (PT).  A typical pipeline looks like:

1. Editor rough-cuts a sequence in MC.
2. Audio tracks are handed off to PT via AAF/OMF.
3. Audio mixer runs dialogue cleanup, loudness normalization, and temp
   music placement.
4. Finished audio is received back into MC for the final online edit.

Today these steps are manual, involving file exports, re-imports, and ad
hoc communication between the picture editor and the audio engineer.

The MCUA agent orchestrator should be able to plan and execute operations
that span both applications in a single plan.  For example:

> "Clean up the dialogue on A1 and A2, normalize to -24 LUFS, then bring
> it back into the timeline."

This requires a shared interface, shared job tracking, and a mock-first
development model so that the agent can be tested without a running Pro
Tools instance.

## Decision

### Shared IProToolsAdapter Interface

All Pro Tools operations are abstracted behind `IProToolsAdapter` (defined
in `@mcua/adapters`).  This interface covers:

- **Session management**: `openSession`, `getSessionInfo`.
- **Audio processing**: `runDialogueCleanup`, `runLoudnessPrep`,
  `placeTempMusic`.
- **Export**: `exportMix`.
- **Handoff**: `handoffToProTools`, `receiveFromProTools`.

The `MockProToolsAdapter` provides a fully functional in-memory
implementation with simulated delays and broadcast-realistic metrics.

### ProToolsBridge -- Coordinating Adapter

The `ProToolsBridge` class implements `IProToolsAdapter` and adds:

1. **Session state tracking** -- Caches the current `SessionInfo` so that
   callers can inspect it without a round-trip.
2. **Job history** -- Every operation is recorded in a `SharedJobHistory`
   ledger with type, status, timing, and arbitrary metrics.
3. **Workflow coordination** -- Each adapter method also runs the
   corresponding standalone workflow function (e.g.
   `runDialogueCleanup()`) to collect extended before/after metrics.
4. **Handoff management** -- Delegates to a `HandoffManager` that tracks
   bi-directional MC <-> PT transfers.

### Workflow Modules

Individual processing steps are implemented as standalone async functions:

| Module                     | Responsibility                              |
|----------------------------|---------------------------------------------|
| `DialogueCleanupWorkflow`  | Denoise, normalize, silence removal         |
| `LoudnessPrepWorkflow`     | EBU R128 / ATSC A/85 loudness compliance    |
| `TempMusicWorkflow`        | Library search + timeline placement         |

Each module is stateless and returns a result object with before/after
metrics.  This makes them easy to unit-test and to compose into larger
pipelines.

### Shared Job History

The `SharedJobHistory` class provides a single ledger that both MC and PT
sides write to.  Features:

- **Record / update**: Upsert by job ID (write `running`, then update to
  `completed`).
- **Filter**: By type (`dialogue-cleanup`, `loudness-prep`, `temp-music`,
  `export`, `handoff`) and/or status (`pending`, `running`, `completed`,
  `failed`).
- **Stats**: Total count, breakdown by type/status, average duration.
- **Export**: Serializable to JSON for dashboards and audit trails.

### Handoff Round-Trip Model

```
Media Composer                     Pro Tools
     |                                |
     |--- handoffToProTools(seq, tracks) --->|
     |       AAF/OMF + media files         |
     |                                |  [cleanup, loudness, temp music]
     |<-- receiveFromProTools(session) ---|
     |       updated AAF + bounced audio   |
```

The `HandoffManager` records every transfer as a `HandoffHistoryEntry`
with direction, status, track/clip counts, and timestamps.  This enables
the orchestrator to:

- Show pending handoffs in the UI.
- Retry failed transfers.
- Correlate outbound and inbound transfers for audit.

### Mock-First Development

All implementations use `MockProToolsAdapter` as the inner adapter.  The
bridge, workflows, and handoff manager are fully functional without a
running Pro Tools instance.  This enables:

- Agent plan testing in CI/CD.
- Local development / demos without Pro Tools licenses.
- Deterministic integration tests (no real audio processing latency).

In production, `MockProToolsAdapter` is swapped for a real adapter that
communicates with Pro Tools via EUCON, the Pro Tools scripting API, or a
custom bridge daemon.

### Agent Plan Integration

A single agent plan can now span both MC and PT actions.  Example plan:

```json
{
  "goal": "Clean dialogue and normalize loudness",
  "steps": [
    { "action": "handoffToProTools", "params": { "sequenceId": "seq_001", "tracks": ["A1","A2"] } },
    { "action": "runDialogueCleanup", "params": { "trackIds": ["A1","A2"], "aggressiveness": 0.6 } },
    { "action": "runLoudnessPrep", "params": { "trackIds": ["A1","A2"], "targetLUFS": -24 } },
    { "action": "receiveFromProTools", "params": { "sessionId": "{{handoff.resultId}}" } }
  ]
}
```

## Consequences

### Positive

- Editors can express cross-application workflows in natural language.
- The agent orchestrator has a unified interface regardless of whether
  Pro Tools is local, remote, or mocked.
- Shared job history provides a single source of truth for all audio
  processing operations across both applications.
- Mock-first approach enables full CI testing without Pro Tools.

### Negative

- The mock adapter cannot surface real-world issues (e.g. AAF
  compatibility bugs, plug-in latency variance).
- The handoff model assumes AAF/OMF file exchange; newer Pro Tools
  versions may support different interchange formats.
- The shared job history is in-memory only; persistence would need an
  external store.

### Risks

- Pro Tools API stability: The EUCON / scripting API may change between
  Pro Tools versions, requiring adapter updates.
- Latency mismatch: Real Pro Tools operations can take minutes (e.g.
  AudioSuite rendering on long timelines), while the mock returns in
  milliseconds.  The orchestrator must handle long-running jobs gracefully.
- Session locking: In production, two users should not drive the same
  Pro Tools session simultaneously.  The adapter layer does not enforce
  session locks; that responsibility belongs to the bridge daemon.
