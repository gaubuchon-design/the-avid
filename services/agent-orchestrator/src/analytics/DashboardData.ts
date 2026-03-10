/**
 * @module DashboardData
 * @description Aggregation engine for analytics events. Produces summary
 * statistics, ranked lists, and cluster analyses that feed dashboard UIs
 * and product prioritization workflows.
 *
 * ## Product Signal Mapping
 *
 * | Query                        | Product insight                          |
 * |------------------------------|------------------------------------------|
 * | {@link getCommonAutomations} | Feature requests / most-wanted workflows |
 * | {@link getTopOverrides}      | Steps the AI gets wrong most often       |
 * | {@link getMissingEndpoints}  | API gaps that block automation            |
 * | {@link getFailureClusters}   | Bug fix priorities                       |
 * | {@link getTokenUsageByWorkflow} | Cost optimization targets             |
 * | {@link getTimeSavedSummary}  | ROI / value demonstration                |
 * | {@link getLatencyStats}      | Performance regression detection         |
 * | {@link getPublishSuccessRate} | Platform reliability                    |
 *
 * @see ADR-010-analytics-privacy
 */

import type { AnalyticsEvent } from './EventSchema';

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

/** A ranked automation pattern with occurrence count. */
export interface AutomationPattern {
  readonly pattern: string;
  readonly count: number;
}

/** A ranked override with tool, reason, and occurrence count. */
export interface OverrideEntry {
  readonly toolName: string;
  readonly reason: string;
  readonly count: number;
}

/** A missing endpoint ranked by request frequency. */
export interface MissingEndpointEntry {
  readonly tool: string;
  readonly frequency: number;
  readonly context: string;
}

/** A clustered failure with tool, error, count, and last occurrence. */
export interface FailureClusterEntry {
  readonly toolName: string;
  readonly errorMessage: string;
  readonly count: number;
  readonly lastOccurrence: string;
}

/** Token usage statistics for a single workflow category. */
export interface TokenUsageStats {
  readonly total: number;
  readonly count: number;
  readonly avgPerJob: number;
}

/** Summary of time saved by agentic editing. */
export interface TimeSavedSummary {
  readonly totalSavedMs: number;
  readonly planCount: number;
  readonly avgSavedPerPlan: number;
  readonly confidence: Record<string, number>;
}

/** Latency statistics for a single operation. */
export interface LatencyStats {
  readonly avg: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly sampleCount: number;
}

/** Publish success rate breakdown. */
export interface PublishSuccessRate {
  readonly total: number;
  readonly success: number;
  readonly partial: number;
  readonly failed: number;
  readonly rate: number;
}

// ---------------------------------------------------------------------------
// DashboardData
// ---------------------------------------------------------------------------

/**
 * Aggregates raw analytics events into queryable dashboard summaries.
 *
 * Create an instance with a set of events, then call query methods to
 * extract specific insights. All queries are computed on demand from the
 * event array; for repeated queries, cache the DashboardData instance.
 *
 * @example
 * ```ts
 * const dashboard = new DashboardData(events);
 *
 * const top = dashboard.getCommonAutomations(10);
 * // => [{ pattern: 'remove silence', count: 42 }, ...]
 *
 * const failures = dashboard.getFailureClusters(5);
 * // => [{ toolName: 'export_sequence', errorMessage: 'timeout', count: 7, ... }]
 * ```
 */
export class DashboardData {
  private readonly events: readonly AnalyticsEvent[];

  /**
   * @param events - The raw analytics events to aggregate.
   */
  constructor(events: AnalyticsEvent[]) {
    this.events = Object.freeze([...events]);
  }

  // -----------------------------------------------------------------------
  // Automation patterns
  // -----------------------------------------------------------------------

  /**
   * Get the most frequently requested automation patterns.
   *
   * Extracts prompt text from `prompt` events and counts occurrences of
   * normalized patterns (lowercased, trimmed).
   *
   * **Product signal:** High-frequency patterns indicate the most-wanted
   * automations and should be prioritized for template creation.
   *
   * @param limit - Maximum number of patterns to return (default: 20).
   * @returns Ranked automation patterns by frequency.
   */
  getCommonAutomations(limit = 20): AutomationPattern[] {
    const counts = new Map<string, number>();

    for (const event of this.events) {
      if (event.type === 'prompt') {
        const text = (event.payload['promptText'] as string) ?? '';
        const normalized = text.toLowerCase().trim();
        if (normalized) {
          counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
        }
      }
    }

    return Array.from(counts.entries())
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Override analysis
  // -----------------------------------------------------------------------

  /**
   * Get the most frequently overridden steps.
   *
   * Extracts tool name and reason from `step-override` events and counts
   * unique (tool, reason) pairs.
   *
   * **Product signal:** Frequently overridden tools indicate where the AI
   * model's suggestions diverge from user expectations -- candidates for
   * prompt tuning or template improvements.
   *
   * @param limit - Maximum number of overrides to return (default: 20).
   * @returns Ranked overrides by frequency.
   */
  getTopOverrides(limit = 20): OverrideEntry[] {
    const counts = new Map<string, { toolName: string; reason: string; count: number }>();

    for (const event of this.events) {
      if (event.type === 'step-override') {
        const toolName = (event.payload['toolName'] as string) ?? 'unknown';
        const reason = (event.payload['reason'] as string) ?? 'unspecified';
        const key = `${toolName}::${reason}`;
        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(key, { toolName, reason, count: 1 });
        }
      }
    }

    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Missing endpoints
  // -----------------------------------------------------------------------

  /**
   * Get missing API endpoints ranked by request frequency.
   *
   * Extracts data from `missing-endpoint` events. Each unique requested
   * tool is counted, and the most recent context is preserved.
   *
   * **Product signal:** High-frequency missing endpoints represent API gaps
   * that should be prioritized for implementation.
   *
   * @param limit - Maximum number of entries to return (default: 20).
   * @returns Missing endpoints ranked by frequency.
   */
  getMissingEndpoints(limit = 20): MissingEndpointEntry[] {
    const map = new Map<string, { frequency: number; context: string }>();

    for (const event of this.events) {
      if (event.type === 'missing-endpoint') {
        const tool = (event.payload['requestedTool'] as string) ?? 'unknown';
        const context = (event.payload['context'] as string) ?? '';
        const existing = map.get(tool);
        if (existing) {
          existing.frequency += 1;
          existing.context = context; // keep most recent context
        } else {
          map.set(tool, { frequency: 1, context });
        }
      }
    }

    return Array.from(map.entries())
      .map(([tool, data]) => ({ tool, frequency: data.frequency, context: data.context }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Failure clusters
  // -----------------------------------------------------------------------

  /**
   * Get clustered failures grouped by tool and error message.
   *
   * Analyses `step-failure` events and groups them by (toolName, errorMessage)
   * pairs. Tracks the most recent occurrence timestamp for each cluster.
   *
   * **Product signal:** Large failure clusters indicate systematic bugs
   * that should be escalated. Clusters growing over time indicate regressions.
   *
   * @param limit - Maximum number of clusters to return (default: 20).
   * @returns Failure clusters ranked by count.
   */
  getFailureClusters(limit = 20): FailureClusterEntry[] {
    const clusters = new Map<
      string,
      { toolName: string; errorMessage: string; count: number; lastOccurrence: string }
    >();

    for (const event of this.events) {
      if (event.type === 'step-failure') {
        const toolName = (event.payload['toolName'] as string) ?? 'unknown';
        const errorMessage = (event.payload['errorMessage'] as string) ?? 'unknown';
        const key = `${toolName}::${errorMessage}`;
        const existing = clusters.get(key);
        if (existing) {
          existing.count += 1;
          if (event.timestamp > existing.lastOccurrence) {
            existing.lastOccurrence = event.timestamp;
          }
        } else {
          clusters.set(key, {
            toolName,
            errorMessage,
            count: 1,
            lastOccurrence: event.timestamp,
          });
        }
      }
    }

    return Array.from(clusters.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Token usage
  // -----------------------------------------------------------------------

  /**
   * Get token usage broken down by workflow category.
   *
   * Analyses `token-consumed` events and aggregates total tokens and
   * invocation count per category. Computes average tokens per job.
   *
   * **Product signal:** Categories with high average token usage are
   * candidates for prompt optimization or caching improvements.
   *
   * @returns Token usage statistics keyed by category name.
   */
  getTokenUsageByWorkflow(): Record<string, TokenUsageStats> {
    const usage = new Map<string, { total: number; count: number }>();

    for (const event of this.events) {
      if (event.type === 'token-consumed') {
        const category = (event.payload['category'] as string) ?? 'uncategorized';
        const tokens = (event.payload['tokensConsumed'] as number) ?? 0;
        const existing = usage.get(category);
        if (existing) {
          existing.total += tokens;
          existing.count += 1;
        } else {
          usage.set(category, { total: tokens, count: 1 });
        }
      }
    }

    const result: Record<string, TokenUsageStats> = {};
    for (const [category, data] of usage) {
      result[category] = {
        total: data.total,
        count: data.count,
        avgPerJob: data.count > 0 ? Math.round(data.total / data.count) : 0,
      };
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Time saved
  // -----------------------------------------------------------------------

  /**
   * Get a summary of time saved by agentic editing.
   *
   * Analyses `time-saved-estimate` events and computes total savings,
   * plan count, average savings per plan, and confidence distribution.
   *
   * **Product signal:** Total time saved is the primary ROI metric for
   * the agent platform. Low-confidence estimates should be reviewed
   * for calibration improvements.
   *
   * @returns Aggregated time-saved statistics.
   */
  getTimeSavedSummary(): TimeSavedSummary {
    let totalSavedMs = 0;
    let planCount = 0;
    const confidence: Record<string, number> = { high: 0, medium: 0, low: 0 };

    for (const event of this.events) {
      if (event.type === 'time-saved-estimate') {
        const savings = (event.payload['savingsMs'] as number) ?? 0;
        const conf = (event.payload['confidence'] as string) ?? 'low';
        totalSavedMs += savings;
        planCount += 1;
        confidence[conf] = (confidence[conf] ?? 0) + 1;
      }
    }

    return {
      totalSavedMs,
      planCount,
      avgSavedPerPlan: planCount > 0 ? Math.round(totalSavedMs / planCount) : 0,
      confidence,
    };
  }

  // -----------------------------------------------------------------------
  // Latency statistics
  // -----------------------------------------------------------------------

  /**
   * Get latency statistics grouped by operation.
   *
   * Analyses `latency-report` events and returns the most recent
   * percentile statistics for each operation. If multiple reports exist
   * for the same operation, the last one submitted is used (assumed to
   * be the most up-to-date aggregation).
   *
   * **Product signal:** Operations with p95 or p99 significantly above
   * their p50 indicate tail-latency problems. Regressions over time
   * should trigger performance investigations.
   *
   * @returns Latency statistics keyed by operation name.
   */
  getLatencyStats(): Record<string, LatencyStats> {
    const stats = new Map<string, LatencyStats>();

    for (const event of this.events) {
      if (event.type === 'latency-report') {
        const operation = (event.payload['operation'] as string) ?? 'unknown';
        const durationMs = (event.payload['durationMs'] as number) ?? 0;
        const p50 = (event.payload['p50'] as number) ?? 0;
        const p95 = (event.payload['p95'] as number) ?? 0;
        const p99 = (event.payload['p99'] as number) ?? 0;
        const sampleCount = (event.payload['sampleCount'] as number) ?? 0;

        // Aggregate: we compute running averages for avg, and keep latest percentiles
        const existing = stats.get(operation);
        if (existing) {
          const totalSamples = existing.sampleCount + sampleCount;
          const weightedAvg =
            totalSamples > 0
              ? (existing.avg * existing.sampleCount + durationMs * sampleCount) / totalSamples
              : 0;
          stats.set(operation, {
            avg: Math.round(weightedAvg),
            p50,
            p95,
            p99,
            sampleCount: totalSamples,
          });
        } else {
          stats.set(operation, {
            avg: durationMs,
            p50,
            p95,
            p99,
            sampleCount,
          });
        }
      }
    }

    const result: Record<string, LatencyStats> = {};
    for (const [operation, data] of stats) {
      result[operation] = data;
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Publish success rate
  // -----------------------------------------------------------------------

  /**
   * Get publish/export success rate broken down by outcome.
   *
   * Analyses `publish-outcome` events and computes the overall success
   * rate along with counts for each status category.
   *
   * **Product signal:** Low success rates for specific platforms indicate
   * integration reliability problems that should be prioritized.
   *
   * @returns Publish success rate breakdown.
   */
  getPublishSuccessRate(): PublishSuccessRate {
    let total = 0;
    let success = 0;
    let partial = 0;
    let failed = 0;

    for (const event of this.events) {
      if (event.type === 'publish-outcome') {
        total += 1;
        const status = event.payload['status'] as string;
        switch (status) {
          case 'success':
            success += 1;
            break;
          case 'partial':
            partial += 1;
            break;
          case 'failed':
            failed += 1;
            break;
        }
      }
    }

    return {
      total,
      success,
      partial,
      failed,
      rate: total > 0 ? Number((success / total).toFixed(4)) : 0,
    };
  }
}
