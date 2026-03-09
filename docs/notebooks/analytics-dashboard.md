# Analytics Dashboard Recipes

Sample queries and recipes for the agent orchestrator analytics feedback loop.
These examples demonstrate how to use `DashboardData` and `EventExporter` to
extract product signals from analytics events.

All examples assume events have been collected via `EventQueue` and are
available as an `AnalyticsEvent[]` array.

---

## Setup

```typescript
import { DashboardData } from '@mcua/agent-orchestrator/analytics/DashboardData';
import { EventExporter } from '@mcua/agent-orchestrator/analytics/EventExporter';
import { PrivacyFilter } from '@mcua/agent-orchestrator/analytics/PrivacyFilter';
import type { AnalyticsEvent } from '@mcua/agent-orchestrator/analytics/EventSchema';

// Assume `rawEvents` is your collected event array
const filter = new PrivacyFilter();
const events: AnalyticsEvent[] = rawEvents
  .map((e) => filter.filter(e, 'org-internal'))
  .filter((e): e is AnalyticsEvent => e !== null);

const dashboard = new DashboardData(events);
const exporter = new EventExporter();
```

---

## Recipe 1: Top 10 Most Requested Automations This Week

**Product signal:** Identifies the most-wanted automation workflows. Use this
to prioritize template creation and feature development.

```typescript
const topAutomations = dashboard.getCommonAutomations(10);

console.table(topAutomations);
// Example output:
// | pattern                        | count |
// |--------------------------------|-------|
// | remove all silence             | 142   |
// | generate rough cut             | 98    |
// | color match all clips          | 87    |
// | export for instagram           | 76    |
// | organize bins by scene         | 65    |
// | create spanish captions        | 52    |
// | find hero shots                | 48    |
// | clean interview audio          | 41    |
// | add lower thirds               | 37    |
// | sync multicam                  | 29    |
```

---

## Recipe 2: Tools Users Override Most Frequently

**Product signal:** Steps that users frequently skip, modify, or replace
indicate where the AI's suggestions diverge from user expectations. Use this
to improve prompt engineering and tool defaults.

```typescript
const overrides = dashboard.getTopOverrides(10);

console.table(overrides);
// Example output:
// | toolName          | reason                      | count |
// |-------------------|-----------------------------|-------|
// | normalize_audio   | wrong target level          | 34    |
// | suggest_cuts      | irrelevant to narrative     | 28    |
// | auto_color_match  | wrong reference clip        | 22    |
// | apply_color_grade | LUT not matching show style | 15    |
// | auto_reframe      | cropping important content  | 12    |
```

---

## Recipe 3: Missing API Endpoints Ranked by Frequency

**Product signal:** When the agent tries to use a tool that does not exist,
it signals an API gap. Ranking these by frequency directly prioritizes which
endpoints to implement next.

```typescript
const missingEndpoints = dashboard.getMissingEndpoints(10);

console.table(missingEndpoints);
// Example output:
// | tool                  | frequency | context                              |
// |-----------------------|-----------|--------------------------------------|
// | auto_subtitle         | 89        | user requested burned-in subtitles   |
// | smart_reframe_portrait| 67        | vertical export for TikTok           |
// | voice_isolation       | 45        | remove background noise from interview|
// | auto_b_roll           | 38        | insert b-roll over interview gaps    |
// | music_ducking         | 31        | auto-duck music under dialogue       |
```

---

## Recipe 4: Token Usage Breakdown by Workflow Category

**Product signal:** Categories with high average token usage per job are
candidates for prompt optimization or context caching improvements.

```typescript
const tokenUsage = dashboard.getTokenUsageByWorkflow();

const rows = Object.entries(tokenUsage).map(([category, stats]) => ({
  category,
  totalTokens: stats.total,
  jobCount: stats.count,
  avgPerJob: stats.avgPerJob,
}));

// Sort by total usage descending
rows.sort((a, b) => b.totalTokens - a.totalTokens);
console.table(rows);
// Example output:
// | category    | totalTokens | jobCount | avgPerJob |
// |-------------|-------------|----------|-----------|
// | execution   | 1,245,000   | 830      | 1,500     |
// | planning    | 892,000     | 1,200    | 743       |
// | context     | 456,000     | 1,200    | 380       |
// | fallback    | 123,000     | 85       | 1,447     |
```

---

## Recipe 5: Time Saved by Agentic Editing per User

**Product signal:** Total and per-plan time savings demonstrate ROI. Low
confidence estimates indicate areas where the estimation model needs
calibration.

```typescript
const timeSaved = dashboard.getTimeSavedSummary();

console.log(`Total time saved: ${(timeSaved.totalSavedMs / 3600000).toFixed(1)} hours`);
console.log(`Plans executed: ${timeSaved.planCount}`);
console.log(`Average saved per plan: ${(timeSaved.avgSavedPerPlan / 60000).toFixed(1)} minutes`);
console.log('Confidence breakdown:');
console.table(timeSaved.confidence);
// Example output:
// Total time saved: 47.2 hours
// Plans executed: 412
// Average saved per plan: 6.9 minutes
// Confidence breakdown:
// | level  | count |
// |--------|-------|
// | high   | 198   |
// | medium | 156   |
// | low    | 58    |
```

---

## Recipe 6: Publish Success Rate by Platform

**Product signal:** Low success rates for specific platforms indicate
integration reliability problems that should be prioritized for fixes.

```typescript
const publishRate = dashboard.getPublishSuccessRate();

console.log(`Total publishes: ${publishRate.total}`);
console.log(`Success: ${publishRate.success} (${(publishRate.rate * 100).toFixed(1)}%)`);
console.log(`Partial: ${publishRate.partial}`);
console.log(`Failed: ${publishRate.failed}`);
// Example output:
// Total publishes: 156
// Success: 128 (82.1%)
// Partial: 15
// Failed: 13
```

For per-platform breakdown, filter events before constructing DashboardData:

```typescript
const platforms = ['youtube', 'instagram', 'frame.io', 'tiktok'];

for (const platform of platforms) {
  const platformEvents = events.filter(
    (e) => e.type === 'publish-outcome' && e.payload.platform === platform,
  );
  const platformDash = new DashboardData(platformEvents);
  const rate = platformDash.getPublishSuccessRate();
  console.log(`${platform}: ${rate.total} publishes, ${(rate.rate * 100).toFixed(1)}% success`);
}
// Example output:
// youtube: 45 publishes, 91.1% success
// instagram: 38 publishes, 78.9% success
// frame.io: 52 publishes, 84.6% success
// tiktok: 21 publishes, 66.7% success
```

---

## Recipe 7: Failure Clusters for Bug Triage

**Product signal:** Large and growing failure clusters indicate systematic
bugs. Recent clusters (by `lastOccurrence`) may indicate regressions.

```typescript
const failures = dashboard.getFailureClusters(10);

console.table(failures);
// Example output:
// | toolName         | errorMessage            | count | lastOccurrence           |
// |------------------|-------------------------|-------|--------------------------|
// | export_sequence  | timeout                 | 47    | 2026-03-08T15:42:00.000Z |
// | apply_color_grade| invalid LUT path        | 23    | 2026-03-08T14:30:00.000Z |
// | remove_silence   | audio track not found   | 18    | 2026-03-08T12:15:00.000Z |
// | auto_reframe     | no face detected        | 12    | 2026-03-07T22:10:00.000Z |
// | splice_in        | insufficient media      | 8     | 2026-03-08T09:45:00.000Z |
```

---

## Recipe 8: Latency Performance Report

**Product signal:** Operations with p95 or p99 significantly above p50
indicate tail-latency problems. Compare over time to detect regressions.

```typescript
const latency = dashboard.getLatencyStats();

const rows = Object.entries(latency).map(([operation, stats]) => ({
  operation,
  avg: `${stats.avg}ms`,
  p50: `${stats.p50}ms`,
  p95: `${stats.p95}ms`,
  p99: `${stats.p99}ms`,
  samples: stats.sampleCount,
}));

console.table(rows);
// Example output:
// | operation         | avg    | p50    | p95     | p99     | samples |
// |-------------------|--------|--------|---------|---------|---------|
// | plan-generation   | 250ms  | 200ms  | 400ms   | 600ms   | 1200    |
// | tool-execution    | 1500ms | 1200ms | 2500ms  | 3500ms  | 830     |
// | context-assembly  | 45ms   | 35ms   | 80ms    | 120ms   | 1200    |
// | approval-roundtrip| 8200ms | 5000ms | 25000ms | 45000ms | 412     |
```

---

## Recipe 9: Full Dashboard Export

Export all data in a single call for the dashboard UI:

```typescript
const dashboardExport = exporter.exportForDashboard(events);

// The DashboardExport object contains all pre-aggregated data:
console.log(`Period: ${dashboardExport.period.start} to ${dashboardExport.period.end}`);
console.log(`Total events: ${dashboardExport.totalEvents}`);
console.log(`Event types:`, dashboardExport.eventsByType);
console.log(`Top tools:`, dashboardExport.topTools.slice(0, 5));
console.log(`Time saved: ${dashboardExport.timeSaved.totalMs}ms across ${dashboardExport.timeSaved.planCount} plans`);
```

---

## Recipe 10: CSV Export for Spreadsheet Analysis

Export raw events as CSV for import into Google Sheets, Excel, or data
pipelines:

```typescript
const csv = exporter.exportCSV(events);

// Write to file or send to a data pipeline
// fs.writeFileSync('analytics-export.csv', csv);
console.log(`Exported ${events.length} events as CSV (${csv.length} bytes)`);
```

---

## Recipe 11: Privacy-Filtered Export for External Sharing

When sharing analytics with external stakeholders, use the privacy filter
to ensure only public-aggregate data is included:

```typescript
const publicFilter = new PrivacyFilter();

const publicEvents = events
  .map((e) => publicFilter.anonymize(e))
  .map((e) => publicFilter.filter(e, 'public-aggregate'))
  .filter((e): e is AnalyticsEvent => e !== null);

const publicDashboard = new DashboardData(publicEvents);
const publicExport = exporter.exportForDashboard(publicEvents);

console.log(`${publicEvents.length} events suitable for external sharing`);
```
