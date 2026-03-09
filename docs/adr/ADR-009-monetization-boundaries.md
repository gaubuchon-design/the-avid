# ADR-009: Token Wallet and Monetisation Boundaries

**Status:** Accepted
**Date:** 2026-03-08
**Authors:** Agent Orchestrator Team
**Supersedes:** None

## Context

The MCUA agent orchestrator can invoke premium, cloud-backed capabilities
such as neural translation, reference dubbing, generative motion graphics,
and cloud-based speech-to-text.  These capabilities have a marginal cost
per invocation (API calls, GPU inference, bandwidth) that cannot be
absorbed into a flat seat licence without either raising prices for all
users or subsidising heavy users at the expense of light users.

At the same time, users must never be surprised by unexpected charges.
Professional editors need confidence that an AI-suggested action will not
silently drain their budget, and organisations need audit trails for
finance and compliance.

### Requirements

1. **No surprise charges** -- users must see the estimated cost and
   explicitly approve before tokens are consumed.
2. **Graceful degradation** -- when the balance is insufficient, the
   system must fall back to free-tier alternatives (e.g. local STT
   instead of cloud STT) rather than blocking the workflow.
3. **Seat + token hybrid** -- core editing features are included in
   every seat; premium AI features are metered on a per-use token basis.
4. **Monthly allocation** -- each tier includes a monthly token
   allowance that resets on the billing date.
5. **Audit trail** -- every balance-affecting event must be recorded
   with timestamps, amounts, and job references.
6. **Admin visibility** -- organisation administrators must be able to
   view usage reports, audit logs, and top consumption categories.

## Decision

### Quote-Hold-Settle Pattern

All token-consuming operations follow a three-phase transaction model
inspired by credit card authorisation flows:

```
  User Intent
       |
  JobQuoter.quote()         -- estimate cost, produce a JobQuote
       |
  TokenWallet.hold()        -- reserve tokens (reduces available balance)
       |
  [Execute premium operation]
       |
  TokenWallet.settle()      -- convert hold to debit for actual amount
       |                       refund any overestimate automatically
  (or)
  TokenWallet.release()     -- cancel hold without charging (on failure)
```

**Rationale:**  The hold ensures the user's balance is sufficient before
execution starts.  If the actual cost is lower than estimated, the
difference is automatically refunded during settlement.  If the job
fails, the hold is released in full.  This guarantees that users are
never charged for work that was not completed.

### Token Categories

Nine billable categories are defined, each mapping to a premium
capability:

| Category              | Base Rate  | Unit           | Min Tier    |
|-----------------------|-----------|----------------|-------------|
| `archive-reasoning`   | 50        | per query      | Pro         |
| `premium-translation` | 100       | per language   | Pro         |
| `reference-dubbing`   | 200       | per language   | Enterprise  |
| `temp-music-gen`      | 150       | per generation | Pro         |
| `generative-motion`   | 300       | per clip       | Enterprise  |
| `generative-effects`  | 250       | per clip       | Enterprise  |
| `premium-publish`     | 75        | per platform   | Pro         |
| `cloud-stt`           | 25        | per minute     | Pro         |
| `cloud-analysis`      | 40        | per analysis   | Pro         |

Categories are defined in `ConsumptionCategories.ts` and referenced by
the `JobQuoter`, `MeteringService`, and `EntitlementChecker`.

### Seat vs. Token Entitlement Model

Features are classified into two entitlement models:

**Seat features** (included with subscription):
- Basic editing (timeline, trimming, transitions)
- AI assistant (on-device suggestions)
- Local speech-to-text (Whisper-based)
- Local embedding (on-device vector search)

**Token features** (per-use metering):
- All nine categories listed above

The `EntitlementChecker` evaluates access based on the user's
subscription tier.  A user must be on a sufficient tier **and** have
enough tokens to use a token feature.  The checker is read-only; actual
spending is handled by the `MeteringService`.

### Tier Hierarchy

```
free < pro < enterprise
```

- **Free:** 4 seat features, no token features, no monthly allocation.
- **Pro:** All free features + 6 token features (archive-reasoning,
  premium-translation, temp-music-gen, premium-publish, cloud-stt,
  cloud-analysis).
- **Enterprise:** All pro features + 3 additional token features
  (reference-dubbing, generative-motion, generative-effects).

### Graceful Degradation

When the wallet balance is insufficient to hold the quoted amount:

1. The `MeteringService.startJob()` returns a `null` holdTransaction.
2. The UI displays a degradation notice rather than an error.
3. Where possible, the system suggests a free-tier alternative:
   - Cloud STT -> Local STT (Whisper)
   - Cloud analysis -> Local embedding search
   - Premium translation -> Manual subtitle editing
4. The user can purchase additional tokens or wait for the monthly reset.

This approach keeps workflows unblocked while making the cost/quality
trade-off visible and opt-in.

### Monthly Allocation Resets

Each wallet tracks:
- `monthlyAllocation` -- tokens allocated per billing cycle.
- `usedThisMonth` -- tokens consumed since the last reset.
- `resetDate` -- ISO-8601 date of the next reset.

When `usedThisMonth >= monthlyAllocation`, the wallet reports
`isMonthlyLimitReached() === true`.  The UI can display a warning but
the system does not hard-block if the user has purchased additional
tokens beyond the allocation.

### Admin Audit Capabilities

The `AdminView` class provides:

- **Wallet summary** -- balance, held, tier, monthly usage, feature
  counts.
- **Usage reports** -- per-category consumption over a date range.
- **Audit log** -- every wallet transaction with type, amount, job
  reference, and timestamp.
- **Top categories** -- ranked list of categories by total consumption.
- **JSON export** -- machine-readable report for external billing and
  analytics systems.

All admin operations are read-only and never mutate wallet state.

## Consequences

### Positive

- Users always see the cost before execution (no surprise charges).
- The hold/settle pattern ensures atomicity: users are never charged
  for incomplete work.
- The tiered seat + token model avoids penalising light users with
  higher seat prices.
- Audit logs provide full traceability for finance and compliance.
- Graceful degradation keeps workflows running even when the budget is
  exhausted.

### Negative

- The hold mechanism temporarily reduces available balance, which could
  be confusing if multiple large jobs are queued concurrently.
- In-memory storage means all wallet state is lost on service restart.
  A future ADR should address persistent storage (database-backed
  wallets).
- Pricing is currently hard-coded; a configuration-driven pricing
  service would be needed for A/B testing or dynamic pricing.

### Risks

- **Clock skew** -- quote expiration and monthly reset depend on
  accurate timestamps.  NTP drift could cause edge cases.
- **Race conditions** -- the current in-memory implementation is
  single-threaded.  A multi-process deployment would require
  distributed locking or database-level transactions.
- **Estimation accuracy** -- some quotes are upper-bound estimates.
  Consistently high overestimates could frustrate users with excessive
  holds.

## Implementation

All code resides in `services/agent-orchestrator/src/wallet/`:

- `ConsumptionCategories.ts` -- category definitions and helpers.
- `TokenWallet.ts` -- balance management with hold/settle semantics.
- `JobQuoter.ts` -- pre-execution cost estimation.
- `MeteringService.ts` -- job lifecycle orchestration.
- `EntitlementChecker.ts` -- tier-based feature gating.
- `AdminView.ts` -- read-only admin/audit views.
- `index.ts` -- barrel re-export.

Tests: `services/agent-orchestrator/src/__tests__/wallet.test.ts`
