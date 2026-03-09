# ADR-005: Orchestration Safety -- Plan-Preview-Approve-Execute Pipeline

**Status:** Accepted
**Date:** 2026-03-08
**Authors:** Agent Orchestrator Team
**Supersedes:** None

## Context

The MCUA platform integrates a Gemini-powered AI agent that can decompose
natural-language editing intents into sequences of tool calls against the
media editing engine. Because these tool calls can mutate timelines, delete
clips, publish content, and consume token budgets, we need a safety model
that:

1. Prevents unintended destructive edits.
2. Gives editors a preview of what the AI will do before it acts.
3. Provides undo (compensation) when things go wrong.
4. Tracks every action for observability and cost control.
5. Works offline without an API key for demos and local development.

## Decision

### Plan-Preview-Approve-Execute Lifecycle

Every user intent flows through a strict four-phase lifecycle:

```
planning --> preview --> approved --> executing --> completed | failed
                  \                                      |
                   \--> cancelled                   compensated
```

- **Planning** -- The `PlanGenerator` decomposes the intent into an ordered
  list of `AgentStep` objects, each targeting exactly one tool.
- **Preview** -- The plan is presented to the user. No side effects have
  occurred.
- **Approved** -- The user (or an auto-approve policy) approves the plan or
  individual steps.
- **Executing** -- Steps are run sequentially through the `ToolCallRouter`.
- **Completed / Failed** -- Terminal states. Failed plans can be compensated.
- **Cancelled** -- The user rejected the plan before or during execution.
- **Compensated** -- A completed step has been undone via its registered
  compensation function.

### Approval Policy Modes

The `ApprovalPolicyEngine` supports three modes:

| Mode           | Behaviour                                                  |
|----------------|------------------------------------------------------------|
| `manual`       | Every step requires explicit user approval.                |
| `auto-approve` | Read-only and low-cost tools execute automatically; destructive and publish tools still require approval. |
| `dry-run`      | No tools execute. Plan is generated and previewed only.    |

Policies also support:
- **allowedAutoTools** -- explicit whitelist of auto-approvable tool names.
- **requireApprovalFor** -- explicit blacklist that overrides all auto-approve
  logic (e.g. `extract`, `overwrite`, `export_sequence`).
- **maxAutoTokens** -- token budget cap for automatic execution.

Configurable `PolicyRule` objects are evaluated in order; the first matching
rule determines the action (`approve`, `require-approval`, or `block`).

### Template Fallback

When the Gemini API key is not configured:

1. The `PlanGenerator` matches the user intent against a library of 8+
   regex-based `PlanTemplate` objects.
2. Each template contains a static list of steps with pre-defined tool names
   and arguments.
3. If no template matches, a generic two-step fallback (analyse then suggest)
   is returned.

This ensures the orchestrator is fully functional for demos, integration
tests, and environments without network access.

### Tool Call Routing

The `ToolCallRouter` dispatches each tool call to a registered adapter:

| Adapter          | Tools                                                   |
|------------------|---------------------------------------------------------|
| `media-composer` | splice_in, overwrite, lift, extract, ripple_trim, split_clip, set_clip_speed, add_marker, apply_color_grade, auto_color_match |
| `content-core`   | move_clip_to_bin, set_clip_metadata, create_bin, auto_organize_bins, find_similar_clips |
| `pro-tools`      | adjust_audio_level, analyze_audio, remove_silence, normalize_audio |
| `local-ai`       | suggest_cuts, detect_scene_changes, generate_captions, generate_rough_cut, auto_reframe |

Default mock handlers are registered on startup so the system operates
end-to-end without live back-end services. Production adapters are
registered via `registerAdapter()`.

### Compensation (Undo) Model

The `CompensationManager` tracks undo functions for destructive tool calls:

1. After a destructive step executes successfully, a compensation function
   is registered with `registerCompensation()`.
2. If the user requests a rollback (`compensatePlan`), compensations are
   executed in reverse order (LIFO) to unwind changes correctly.
3. Each compensation records success/failure status for observability.
4. Non-destructive steps (analysis, markers, metadata) do not register
   compensations.

### Structured Logging

Two logging systems provide full observability:

- **ToolCallLogger** -- captures every tool invocation (start, complete,
  error) and plan lifecycle event with trace IDs, durations, and error
  details.
- **AnalyticsLogger** -- captures higher-level events (prompt submissions,
  plan creation, approvals, token usage) for dashboards and cost analysis.

All logs are in-memory with FIFO eviction. In production these would feed
into OpenTelemetry or a persistent store.

## Consequences

**Positive:**
- Editors always see what the AI will do before it acts.
- Destructive operations are gated by policy regardless of approval mode.
- The system works fully offline via template fallback.
- Every action is logged for audit and cost tracking.
- Failed plans can be partially or fully rolled back.

**Negative / Trade-offs:**
- The preview step adds latency to the user experience (mitigated by
  caching).
- Template fallback produces less creative plans than the Gemini API.
- In-memory logging does not persist across restarts (acceptable for MVP;
  production will use persistent storage).
- Compensation functions are mocks in the current implementation;
  production adapters must supply real undo operations.

## Alternatives Considered

1. **Direct execution without preview** -- Rejected because destructive edits
   cannot be safely undone in all cases.
2. **Client-side-only orchestration** -- Rejected because the plan generator
   and policy engine should be authoritative on the server to prevent
   client-side tampering.
3. **Synchronous approval for every tool call** -- Rejected in favour of
   plan-level approval to reduce interaction overhead.
