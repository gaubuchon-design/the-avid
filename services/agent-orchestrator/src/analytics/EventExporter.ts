/**
 * @module EventExporter
 * @description Exports analytics events in multiple formats for dashboards,
 * spreadsheets, and downstream consumers.
 *
 * Supported export formats:
 *
 * | Format     | Method                | Use case                             |
 * |------------|-----------------------|--------------------------------------|
 * | JSON       | {@link exportJSON}    | API responses, log archives          |
 * | CSV        | {@link exportCSV}     | Spreadsheet import, data pipelines   |
 * | Dashboard  | {@link exportForDashboard} | Pre-aggregated data for UI      |
 *
 * @see DashboardData for aggregation queries.
 * @see ADR-010-analytics-privacy
 */

import type { AnalyticsEvent } from './EventSchema';
import { DashboardData } from './DashboardData';

// ---------------------------------------------------------------------------
// Dashboard export shape
// ---------------------------------------------------------------------------

/**
 * Pre-aggregated data structure optimized for dashboard rendering.
 * Contains summary statistics and ranked lists derived from raw events.
 */
export interface DashboardExport {
  /** Time period covered by this export. */
  readonly period: { readonly start: string; readonly end: string };
  /** Total number of events in the export. */
  readonly totalEvents: number;
  /** Event count broken down by type. */
  readonly eventsByType: Record<string, number>;
  /** Most frequently used tools, ranked by invocation count. */
  readonly topTools: Array<{ readonly tool: string; readonly count: number }>;
  /** Most frequently overridden steps, ranked by occurrence count. */
  readonly topOverrides: Array<{
    readonly tool: string;
    readonly reason: string;
    readonly count: number;
  }>;
  /** Clustered failures grouped by tool and error message. */
  readonly failureClusters: Array<{
    readonly tool: string;
    readonly error: string;
    readonly count: number;
  }>;
  /** Token consumption broken down by workflow category. */
  readonly tokenUsage: Array<{
    readonly category: string;
    readonly total: number;
    readonly count: number;
  }>;
  /** Average latency per operation in milliseconds. */
  readonly averageLatency: Record<string, number>;
  /** Total time saved by agentic editing. */
  readonly timeSaved: { readonly totalMs: number; readonly planCount: number };
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/**
 * Escape a value for inclusion in a CSV cell.
 * Wraps the value in double quotes if it contains commas, double quotes,
 * or newlines. Internal double quotes are doubled per RFC 4180.
 *
 * @param value - The raw cell value.
 * @returns The escaped CSV cell string.
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ---------------------------------------------------------------------------
// EventExporter
// ---------------------------------------------------------------------------

/**
 * Exports analytics events in JSON, CSV, and pre-aggregated dashboard formats.
 *
 * @example
 * ```ts
 * const exporter = new EventExporter();
 * const json = exporter.exportJSON(events);
 * const csv  = exporter.exportCSV(events);
 * const dash = exporter.exportForDashboard(events);
 * ```
 */
export class EventExporter {
  // -----------------------------------------------------------------------
  // JSON export
  // -----------------------------------------------------------------------

  /**
   * Export events as a pretty-printed JSON string.
   *
   * @param events - The analytics events to export.
   * @returns A JSON string representation of the events array.
   */
  exportJSON(events: AnalyticsEvent[]): string {
    return JSON.stringify(events, null, 2);
  }

  // -----------------------------------------------------------------------
  // CSV export
  // -----------------------------------------------------------------------

  /**
   * Export events as a flat CSV string.
   *
   * Common fields are written as individual columns. The event payload is
   * serialized as a JSON string in a dedicated `payload` column so that
   * all event types can share a single table shape.
   *
   * @param events - The analytics events to export.
   * @returns A CSV string with a header row followed by one row per event.
   */
  exportCSV(events: AnalyticsEvent[]): string {
    const headers = [
      'id',
      'type',
      'sessionId',
      'userId',
      'timestamp',
      'privacyLevel',
      'projectId',
      'sequenceId',
      'payload',
    ];

    const rows: string[] = [headers.join(',')];

    for (const event of events) {
      const row = [
        escapeCSV(event.id),
        escapeCSV(event.type),
        escapeCSV(event.sessionId),
        escapeCSV(event.userId ?? ''),
        escapeCSV(event.timestamp),
        escapeCSV(event.privacyLevel),
        escapeCSV(event.projectId ?? ''),
        escapeCSV(event.sequenceId ?? ''),
        escapeCSV(JSON.stringify(event.payload)),
      ];
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  // -----------------------------------------------------------------------
  // Dashboard export
  // -----------------------------------------------------------------------

  /**
   * Export events as a pre-aggregated {@link DashboardExport} object
   * optimized for dashboard UI rendering.
   *
   * Delegates heavy aggregation to {@link DashboardData} and assembles
   * the final shape expected by the dashboard frontend.
   *
   * @param events - The analytics events to aggregate and export.
   * @returns A pre-aggregated dashboard data object.
   */
  exportForDashboard(events: AnalyticsEvent[]): DashboardExport {
    if (events.length === 0) {
      return {
        period: { start: '', end: '' },
        totalEvents: 0,
        eventsByType: {},
        topTools: [],
        topOverrides: [],
        failureClusters: [],
        tokenUsage: [],
        averageLatency: {},
        timeSaved: { totalMs: 0, planCount: 0 },
      };
    }

    const dashboard = new DashboardData(events);

    // Compute time period from event timestamps
    const timestamps = events.map((e) => e.timestamp).sort();
    const period = {
      start: timestamps[0] ?? '',
      end: timestamps[timestamps.length - 1] ?? '',
    };

    // Count events by type
    const eventsByType: Record<string, number> = {};
    for (const event of events) {
      eventsByType[event.type] = (eventsByType[event.type] ?? 0) + 1;
    }

    // Extract top tools from plan-generated events
    const toolCounts = new Map<string, number>();
    for (const event of events) {
      if (event.type === 'plan-generated' || event.type === 'plan-approved') {
        const toolNames = event.payload['toolNames'] as string[] | undefined;
        if (toolNames) {
          for (const tool of toolNames) {
            toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1);
          }
        }
      }
      if (event.type === 'step-failure' || event.type === 'step-override') {
        const toolName = event.payload['toolName'] as string | undefined;
        if (toolName) {
          toolCounts.set(toolName, (toolCounts.get(toolName) ?? 0) + 1);
        }
      }
    }
    const topTools = Array.from(toolCounts.entries())
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Delegate detailed aggregations to DashboardData
    const topOverrides = dashboard.getTopOverrides(20).map((o) => ({
      tool: o.toolName,
      reason: o.reason,
      count: o.count,
    }));
    const failureClusters = dashboard.getFailureClusters(20).map((c) => ({
      tool: c.toolName,
      error: c.errorMessage,
      count: c.count,
    }));

    // Token usage by category
    const tokenUsageMap = dashboard.getTokenUsageByWorkflow();
    const tokenUsage = Object.entries(tokenUsageMap).map(([category, data]) => ({
      category,
      total: data.total,
      count: data.count,
    }));

    // Average latency per operation
    const latencyStats = dashboard.getLatencyStats();
    const averageLatency: Record<string, number> = {};
    for (const [operation, stats] of Object.entries(latencyStats)) {
      averageLatency[operation] = stats.avg;
    }

    // Time saved summary
    const timeSavedSummary = dashboard.getTimeSavedSummary();
    const timeSaved = {
      totalMs: timeSavedSummary.totalSavedMs,
      planCount: timeSavedSummary.planCount,
    };

    return {
      period,
      totalEvents: events.length,
      eventsByType,
      topTools,
      topOverrides,
      failureClusters,
      tokenUsage,
      averageLatency,
      timeSaved,
    };
  }
}
