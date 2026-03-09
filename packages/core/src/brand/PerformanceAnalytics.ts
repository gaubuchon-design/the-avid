// ─── Performance Analytics ───────────────────────────────────────────────────
// Post-delivery data ingestion: YouTube Analytics, Meta Graph, Google Campaign
// Manager, LinkedIn APIs. View count, completion rate, CTR, engagement,
// AI analysis of high vs low performers, and creative loop feedback.

import { generateId } from '../utils';
import type {
  PerformanceData,
  PerformanceInsight,
  PerformanceComparison,
  AnalyticsPlatform,
} from './types';

// ─── In-memory stores ────────────────────────────────────────────────────────

const dataStore = new Map<string, PerformanceData>();
const insightStore = new Map<string, PerformanceInsight>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ─── Platform API Adapters (simulated) ───────────────────────────────────────

const PLATFORM_BENCHMARKS: Record<AnalyticsPlatform, {
  avgCompletionRate: number;
  avgCtr: number;
  avgEngagementRate: number;
}> = {
  YOUTUBE: { avgCompletionRate: 0.50, avgCtr: 0.02, avgEngagementRate: 0.04 },
  META: { avgCompletionRate: 0.25, avgCtr: 0.015, avgEngagementRate: 0.06 },
  GOOGLE_CAMPAIGN_MANAGER: { avgCompletionRate: 0.35, avgCtr: 0.008, avgEngagementRate: 0.02 },
  LINKEDIN: { avgCompletionRate: 0.40, avgCtr: 0.012, avgEngagementRate: 0.035 },
};

export function getPlatformBenchmarks(platform: AnalyticsPlatform) {
  return PLATFORM_BENCHMARKS[platform];
}

/**
 * Fetch performance data from a platform API.
 * In production this calls the real YouTube Analytics / Meta Graph / etc. APIs.
 */
export async function fetchPerformanceData(
  videoId: string,
  platform: AnalyticsPlatform,
  dateRange: { start: string; end: string },
): Promise<PerformanceData> {
  // Simulate API call
  await new Promise<void>((resolve) => setTimeout(resolve, 300 + Math.random() * 400));

  const benchmarks = PLATFORM_BENCHMARKS[platform];

  // Generate realistic-looking performance data
  const views = Math.floor(1000 + Math.random() * 50000);
  const completionRate = Math.max(0.05, Math.min(0.95, benchmarks.avgCompletionRate + (Math.random() - 0.5) * 0.3));
  const ctr = Math.max(0.001, Math.min(0.1, benchmarks.avgCtr + (Math.random() - 0.5) * 0.02));
  const engagementRate = Math.max(0.005, Math.min(0.15, benchmarks.avgEngagementRate + (Math.random() - 0.5) * 0.04));

  const data: PerformanceData = {
    id: generateId(),
    videoId,
    platform,
    views,
    completionRate,
    ctr,
    engagementRate,
    dateRange: clone(dateRange),
    fetchedAt: now(),
  };

  dataStore.set(data.id, clone(data));
  return clone(data);
}

/**
 * Fetch performance data from all connected platforms for a video.
 */
export async function fetchAllPlatformData(
  videoId: string,
  platforms: AnalyticsPlatform[],
  dateRange: { start: string; end: string },
): Promise<PerformanceData[]> {
  const results: PerformanceData[] = [];
  for (const platform of platforms) {
    const data = await fetchPerformanceData(videoId, platform, dateRange);
    results.push(data);
  }
  return results;
}

// ─── Data Access ─────────────────────────────────────────────────────────────

export function getPerformanceData(id: string): PerformanceData | null {
  const data = dataStore.get(id);
  return data ? clone(data) : null;
}

export function listPerformanceData(videoId?: string): PerformanceData[] {
  const all = Array.from(dataStore.values());
  const filtered = videoId ? all.filter((d) => d.videoId === videoId) : all;
  return filtered.map(clone).sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
}

// ─── AI Analysis ─────────────────────────────────────────────────────────────

/**
 * Analyze a single video's performance and generate insights.
 * In production this would use an LLM for deeper analysis.
 */
export function analyzePerformance(data: PerformanceData): PerformanceInsight[] {
  const benchmarks = PLATFORM_BENCHMARKS[data.platform];
  const insights: PerformanceInsight[] = [];

  // Completion rate analysis
  const completionDiff = data.completionRate - benchmarks.avgCompletionRate;
  if (completionDiff > 0.1) {
    insights.push({
      id: generateId(),
      videoId: data.videoId,
      type: 'strength',
      description: `Completion rate is ${(completionDiff * 100).toFixed(1)}% above platform average. Strong hook and sustained engagement.`,
      metric: 'completionRate',
      value: data.completionRate,
      benchmark: benchmarks.avgCompletionRate,
      recommendation: 'Analyze the opening sequence pattern for reuse in future content.',
    });
  } else if (completionDiff < -0.1) {
    insights.push({
      id: generateId(),
      videoId: data.videoId,
      type: 'weakness',
      description: `Completion rate is ${(Math.abs(completionDiff) * 100).toFixed(1)}% below platform average. Viewers are dropping off early.`,
      metric: 'completionRate',
      value: data.completionRate,
      benchmark: benchmarks.avgCompletionRate,
      recommendation: 'Strengthen the first 3 seconds with a more compelling hook. Consider shorter format.',
    });
  }

  // CTR analysis
  const ctrDiff = data.ctr - benchmarks.avgCtr;
  if (ctrDiff > 0.005) {
    insights.push({
      id: generateId(),
      videoId: data.videoId,
      type: 'strength',
      description: `CTR of ${(data.ctr * 100).toFixed(2)}% outperforms the ${(benchmarks.avgCtr * 100).toFixed(2)}% platform benchmark.`,
      metric: 'ctr',
      value: data.ctr,
      benchmark: benchmarks.avgCtr,
      recommendation: 'The CTA is effective. Maintain this placement and messaging pattern.',
    });
  } else if (ctrDiff < -0.005) {
    insights.push({
      id: generateId(),
      videoId: data.videoId,
      type: 'weakness',
      description: `CTR of ${(data.ctr * 100).toFixed(2)}% is below the ${(benchmarks.avgCtr * 100).toFixed(2)}% platform benchmark.`,
      metric: 'ctr',
      value: data.ctr,
      benchmark: benchmarks.avgCtr,
      recommendation: 'Experiment with CTA placement, timing, and copy. Try adding an earlier CTA.',
    });
  }

  // Engagement analysis
  const engDiff = data.engagementRate - benchmarks.avgEngagementRate;
  if (engDiff > 0.02) {
    insights.push({
      id: generateId(),
      videoId: data.videoId,
      type: 'strength',
      description: `Engagement rate of ${(data.engagementRate * 100).toFixed(1)}% is well above average.`,
      metric: 'engagementRate',
      value: data.engagementRate,
      benchmark: benchmarks.avgEngagementRate,
    });
  } else if (engDiff < -0.02) {
    insights.push({
      id: generateId(),
      videoId: data.videoId,
      type: 'opportunity',
      description: `Engagement rate has room to improve at ${(data.engagementRate * 100).toFixed(1)}% vs ${(benchmarks.avgEngagementRate * 100).toFixed(1)}% average.`,
      metric: 'engagementRate',
      value: data.engagementRate,
      benchmark: benchmarks.avgEngagementRate,
      recommendation: 'Add questions, polls, or interactive elements to drive engagement.',
    });
  }

  // Views-based opportunity
  if (data.views > 10000 && data.completionRate > benchmarks.avgCompletionRate) {
    insights.push({
      id: generateId(),
      videoId: data.videoId,
      type: 'opportunity',
      description: `High-performing content with ${data.views.toLocaleString()} views and above-average retention. Consider creating a series.`,
      metric: 'views',
      value: data.views,
      benchmark: 5000,
      recommendation: 'Create follow-up content using similar creative elements and structure.',
    });
  }

  // Store insights
  for (const insight of insights) {
    insightStore.set(insight.id, clone(insight));
  }

  return insights;
}

// ─── Comparative Analysis ────────────────────────────────────────────────────

/**
 * Compare performance across multiple videos and identify top/bottom performers.
 */
export function comparePerformance(videoIds: string[]): PerformanceComparison {
  const allData = Array.from(dataStore.values());
  const relevantData = allData.filter((d) => videoIds.includes(d.videoId));

  if (relevantData.length === 0) {
    return {
      videoIds,
      topPerformer: videoIds[0] ?? '',
      bottomPerformer: videoIds[videoIds.length - 1] ?? '',
      insights: [],
      generatedAt: now(),
    };
  }

  // Score each video (weighted composite)
  const scores = new Map<string, number>();
  for (const data of relevantData) {
    const existing = scores.get(data.videoId) ?? 0;
    const score = data.completionRate * 0.4 + data.ctr * 10 + data.engagementRate * 0.3;
    scores.set(data.videoId, Math.max(existing, score));
  }

  const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
  const topPerformer = sorted[0]?.[0] ?? '';
  const bottomPerformer = sorted[sorted.length - 1]?.[0] ?? '';

  // Generate comparative insights
  const insights: PerformanceInsight[] = [];

  if (topPerformer && bottomPerformer && topPerformer !== bottomPerformer) {
    const topData = relevantData.find((d) => d.videoId === topPerformer);
    const bottomData = relevantData.find((d) => d.videoId === bottomPerformer);

    if (topData && bottomData) {
      if (topData.completionRate > bottomData.completionRate * 1.5) {
        insights.push({
          id: generateId(),
          videoId: topPerformer,
          type: 'strength',
          description: `Top performer has ${((topData.completionRate / bottomData.completionRate - 1) * 100).toFixed(0)}% higher completion rate. Analyze its hook and pacing.`,
          metric: 'completionRate',
          value: topData.completionRate,
          benchmark: bottomData.completionRate,
          recommendation: 'Apply the top performer\'s opening structure to underperforming content.',
        });
      }
    }
  }

  const comparison: PerformanceComparison = {
    videoIds,
    topPerformer,
    bottomPerformer,
    insights,
    generatedAt: now(),
  };

  return comparison;
}

// ─── Creative Loop Feedback ──────────────────────────────────────────────────

export interface CreativeLoopFeedback {
  videoId: string;
  platform: AnalyticsPlatform;
  topStrengths: string[];
  topWeaknesses: string[];
  actionItems: string[];
}

/**
 * Generate actionable creative loop feedback from performance data.
 */
export function getCreativeLoopFeedback(videoId: string): CreativeLoopFeedback[] {
  const allData = Array.from(dataStore.values()).filter((d) => d.videoId === videoId);
  const allInsights = Array.from(insightStore.values()).filter((i) => i.videoId === videoId);

  const feedbackByPlatform = new Map<AnalyticsPlatform, CreativeLoopFeedback>();

  for (const data of allData) {
    const platformInsights = allInsights.filter(
      (i) => i.videoId === videoId,
    );

    const strengths = platformInsights
      .filter((i) => i.type === 'strength')
      .map((i) => i.description);

    const weaknesses = platformInsights
      .filter((i) => i.type === 'weakness')
      .map((i) => i.description);

    const actionItems = platformInsights
      .filter((i) => i.recommendation)
      .map((i) => i.recommendation!);

    feedbackByPlatform.set(data.platform, {
      videoId,
      platform: data.platform,
      topStrengths: strengths.slice(0, 3),
      topWeaknesses: weaknesses.slice(0, 3),
      actionItems: actionItems.slice(0, 5),
    });
  }

  return Array.from(feedbackByPlatform.values());
}

// ─── Insight Access ──────────────────────────────────────────────────────────

export function listInsights(videoId?: string): PerformanceInsight[] {
  const all = Array.from(insightStore.values());
  const filtered = videoId ? all.filter((i) => i.videoId === videoId) : all;
  return filtered.map(clone);
}

// ─── Seed data ───────────────────────────────────────────────────────────────

export async function seedDemoPerformanceData(): Promise<PerformanceData[]> {
  const dateRange = { start: '2026-01-01', end: '2026-03-01' };

  const results = [
    await fetchPerformanceData('video-hero-60', 'YOUTUBE', dateRange),
    await fetchPerformanceData('video-hero-60', 'META', dateRange),
    await fetchPerformanceData('video-cutdown-30', 'META', dateRange),
    await fetchPerformanceData('video-cutdown-30', 'LINKEDIN', dateRange),
    await fetchPerformanceData('video-social-15', 'META', dateRange),
  ];

  // Generate insights for each
  for (const data of results) {
    analyzePerformance(data);
  }

  return results;
}

// ─── Reset (for tests) ──────────────────────────────────────────────────────

export function _resetAnalyticsStore(): void {
  dataStore.clear();
  insightStore.clear();
}
