// ─── Sports Highlights AI Engine ──────────────────────────────────────────────
// SP-04: AI-powered highlight detection combining crowd noise analysis,
// scoreboard OCR, player action classification, commentary NLP,
// replay marker detection, and external stats API events.

import type {
  HighlightEvent,
  HighlightDetectionSource,
  HighlightReelConfig,
  HighlightConfidenceLevel,
  SportEventType,
  StatsDataPoint,
} from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createId(prefix: string): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function classifyConfidence(score: number): HighlightConfidenceLevel {
  if (score >= 0.8) return 'HIGH';
  if (score >= 0.5) return 'MEDIUM';
  return 'LOW';
}

// ─── Commentary Excitement Phrases ────────────────────────────────────────────

const EXCITEMENT_PHRASES = [
  'goal!', 'scores!', 'touchdown!', 'incredible!', 'amazing!', 'unbelievable!',
  'what a play!', 'he shoots, he scores!', 'slam dunk!', 'home run!',
  'hat trick!', 'what a save!', 'out of the park!', 'nothing but net!',
  'three pointer!', 'interception!', 'sack!', 'first down!', 'field goal!',
  'penalty!', 'red card!', 'off the post!', 'brilliant!', 'stunning!',
];

// ─── Events ───────────────────────────────────────────────────────────────────

export type HighlightsEvent =
  | { type: 'HIGHLIGHT_DETECTED'; highlight: HighlightEvent }
  | { type: 'HIGHLIGHT_UPDATED'; highlight: HighlightEvent }
  | { type: 'REEL_ASSEMBLED'; reelId: string; clipIds: string[]; duration: number }
  | { type: 'DETECTION_STARTED'; method: string }
  | { type: 'DETECTION_COMPLETE'; method: string; eventCount: number }
  | { type: 'ERROR'; error: string };

export type HighlightsListener = (event: HighlightsEvent) => void;

// ─── Engine Configuration ─────────────────────────────────────────────────────

export interface HighlightsEngineConfig {
  crowdNoiseThreshold: number;
  commentaryExcitementThreshold: number;
  minHighlightDuration: number;
  maxHighlightDuration: number;
  mergeWindowMs: number;
  autoDetect: boolean;
  detectionIntervalMs: number;
}

const DEFAULT_CONFIG: HighlightsEngineConfig = {
  crowdNoiseThreshold: 0.7,
  commentaryExcitementThreshold: 0.6,
  minHighlightDuration: 3,
  maxHighlightDuration: 30,
  mergeWindowMs: 5000,
  autoDetect: true,
  detectionIntervalMs: 1000,
};

// ─── Engine ───────────────────────────────────────────────────────────────────

export class SportsHighlightsEngine {
  private config: HighlightsEngineConfig;
  private highlights: Map<string, HighlightEvent> = new Map();
  private listeners: Set<HighlightsListener> = new Set();
  private detectionTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private statsBuffer: StatsDataPoint[] = [];

  constructor(config: Partial<HighlightsEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    if (this.config.autoDetect) {
      this.detectionTimer = setInterval(() => {
        this.runDetectionCycle();
      }, this.config.detectionIntervalMs);
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.detectionTimer) {
      clearInterval(this.detectionTimer);
      this.detectionTimer = null;
    }
  }

  destroy(): void {
    this.stop();
    this.highlights.clear();
    this.listeners.clear();
    this.statsBuffer = [];
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  getAllHighlights(): HighlightEvent[] {
    return Array.from(this.highlights.values()).sort((a, b) => b.confidence - a.confidence);
  }

  getHighlight(id: string): HighlightEvent | null {
    return this.highlights.get(id) ?? null;
  }

  getHighlightsByType(type: SportEventType): HighlightEvent[] {
    return this.getAllHighlights().filter((h) => h.type === type);
  }

  getHighlightsByConfidence(minConfidence: number): HighlightEvent[] {
    return this.getAllHighlights().filter((h) => h.confidence >= minConfidence);
  }

  getHighlightsInRange(startTime: number, endTime: number): HighlightEvent[] {
    return this.getAllHighlights().filter(
      (h) => h.timestamp >= startTime && h.timestamp <= endTime,
    );
  }

  /**
   * Feed crowd noise audio intensity data for detection.
   * Values should be normalized 0-1.
   */
  feedCrowdNoiseData(timestamp: number, intensity: number): void {
    if (intensity >= this.config.crowdNoiseThreshold) {
      this.addDetection(timestamp, 'OTHER', intensity, {
        method: 'CROWD_NOISE',
        confidence: intensity,
        rawData: { intensity },
      });
    }
  }

  /**
   * Feed commentary text for NLP excitement detection.
   */
  feedCommentaryText(timestamp: number, text: string): void {
    const lowerText = text.toLowerCase();
    let maxScore = 0;
    let matchedPhrase = '';

    for (const phrase of EXCITEMENT_PHRASES) {
      if (lowerText.includes(phrase)) {
        const score = 0.6 + (phrase.endsWith('!') ? 0.2 : 0) + (phrase.split(' ').length > 2 ? 0.1 : 0);
        if (score > maxScore) {
          maxScore = score;
          matchedPhrase = phrase;
        }
      }
    }

    if (maxScore >= this.config.commentaryExcitementThreshold) {
      const eventType = this.classifyFromCommentary(matchedPhrase);
      this.addDetection(timestamp, eventType, maxScore, {
        method: 'COMMENTARY_NLP',
        confidence: maxScore,
        rawData: { text, matchedPhrase },
      });
    }
  }

  /**
   * Feed stats API data points for score change detection.
   */
  feedStatsData(dataPoint: StatsDataPoint): void {
    const prevPoint = this.statsBuffer[this.statsBuffer.length - 1];
    this.statsBuffer.push(dataPoint);

    // Keep buffer manageable
    if (this.statsBuffer.length > 1000) {
      this.statsBuffer = this.statsBuffer.slice(-500);
    }

    if (prevPoint) {
      // Detect score changes
      if (
        dataPoint.homeScore !== prevPoint.homeScore ||
        dataPoint.awayScore !== prevPoint.awayScore
      ) {
        this.addDetection(dataPoint.timestamp, 'GOAL', 0.95, {
          method: 'STATS_API',
          confidence: 0.95,
          rawData: {
            homeScore: dataPoint.homeScore,
            awayScore: dataPoint.awayScore,
            prevHomeScore: prevPoint.homeScore,
            prevAwayScore: prevPoint.awayScore,
          },
        });
      }

      // Detect period changes
      if (dataPoint.period !== prevPoint.period) {
        this.addDetection(dataPoint.timestamp, 'OTHER', 0.8, {
          method: 'STATS_API',
          confidence: 0.8,
          rawData: { period: dataPoint.period, prevPeriod: prevPoint.period },
        });
      }
    }

    // Process stats events
    for (const event of dataPoint.events) {
      this.addDetection(event.timestamp, event.type, 0.9, {
        method: 'STATS_API',
        confidence: 0.9,
        rawData: { statsEvent: event },
      });
    }
  }

  /**
   * Feed replay marker detection (from video analysis).
   */
  feedReplayMarker(timestamp: number, confidence: number): void {
    this.addDetection(timestamp, 'OTHER', confidence * 0.85, {
      method: 'REPLAY_MARKER',
      confidence,
    });
  }

  /**
   * Feed scoreboard OCR detection result.
   */
  feedScoreboardOCR(
    timestamp: number,
    homeScore: number,
    awayScore: number,
    gameClock: string,
    confidence: number,
  ): void {
    const prevScoreHighlights = this.getAllHighlights().filter(
      (h) => h.sourceDetections.some((d) => d.method === 'SCOREBOARD_OCR'),
    );

    const lastScore = prevScoreHighlights[0];
    if (lastScore) {
      const lastData = lastScore.sourceDetections.find((d) => d.method === 'SCOREBOARD_OCR')?.rawData;
      if (lastData && (lastData['homeScore'] !== homeScore || lastData['awayScore'] !== awayScore)) {
        this.addDetection(timestamp, 'GOAL', confidence, {
          method: 'SCOREBOARD_OCR',
          confidence,
          rawData: { homeScore, awayScore, gameClock },
        });
      }
    }
  }

  /**
   * Feed player action classification result.
   */
  feedPlayerAction(
    timestamp: number,
    eventType: SportEventType,
    players: string[],
    confidence: number,
  ): void {
    this.addDetection(timestamp, eventType, confidence, {
      method: 'PLAYER_TRACKING',
      confidence,
      rawData: { players },
    });
  }

  /**
   * Manually add a highlight event.
   */
  addManualHighlight(
    timestamp: number,
    type: SportEventType,
    description: string,
    players: string[] = [],
  ): string {
    const highlight: HighlightEvent = {
      id: createId('hl'),
      timestamp,
      type,
      confidence: 1.0,
      confidenceLevel: 'HIGH',
      players,
      description,
      duration: 8,
      clipIds: [],
      audioIntensity: 0,
      crowdReactionScore: 0,
      commentaryExcitement: 0,
      isReplay: false,
      sourceDetections: [],
    };

    this.highlights.set(highlight.id, highlight);
    this.emit({ type: 'HIGHLIGHT_DETECTED', highlight });
    return highlight.id;
  }

  /**
   * Remove a highlight event.
   */
  removeHighlight(id: string): void {
    this.highlights.delete(id);
  }

  /**
   * Auto-assemble a highlight reel from detected events.
   */
  assembleHighlightReel(config: HighlightReelConfig): {
    reelId: string;
    highlights: HighlightEvent[];
    totalDuration: number;
  } {
    const reelId = createId('reel');

    // Filter highlights by config criteria
    let candidates = this.getAllHighlights().filter((h) => {
      if (h.confidence < config.minConfidence) return false;
      if (!config.includeReplays && h.isReplay) return false;
      if (config.eventTypes.length > 0 && !config.eventTypes.includes(h.type)) return false;
      return true;
    });

    // Sort by timestamp for chronological ordering
    candidates.sort((a, b) => a.timestamp - b.timestamp);

    // Fit to target duration
    let totalDuration = 0;
    const selected: HighlightEvent[] = [];

    for (const highlight of candidates) {
      const clipDuration = Math.min(highlight.duration, this.config.maxHighlightDuration);
      const withTransition = clipDuration + config.transitionDuration;

      if (totalDuration + withTransition <= config.targetDuration) {
        selected.push(highlight);
        totalDuration += withTransition;
      }
    }

    this.emit({
      type: 'REEL_ASSEMBLED',
      reelId,
      clipIds: selected.map((h) => h.id),
      duration: totalDuration,
    });

    return { reelId, highlights: selected, totalDuration };
  }

  // ─── Events ─────────────────────────────────────────────────────────────────

  on(listener: HighlightsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  off(listener: HighlightsListener): void {
    this.listeners.delete(listener);
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private emit(event: HighlightsEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Swallow listener errors
      }
    }
  }

  private addDetection(
    timestamp: number,
    eventType: SportEventType,
    confidence: number,
    source: HighlightDetectionSource,
  ): void {
    // Check if there is an existing highlight within the merge window
    const mergeCandidate = this.findMergeCandidate(timestamp);

    if (mergeCandidate) {
      // Merge into existing highlight, boost confidence
      mergeCandidate.sourceDetections.push(source);
      mergeCandidate.confidence = Math.min(
        1.0,
        mergeCandidate.confidence + confidence * 0.2,
      );
      mergeCandidate.confidenceLevel = classifyConfidence(mergeCandidate.confidence);

      // Update scores based on detection method
      if (source.method === 'CROWD_NOISE') {
        mergeCandidate.crowdReactionScore = Math.max(
          mergeCandidate.crowdReactionScore,
          confidence,
        );
        mergeCandidate.audioIntensity = Math.max(
          mergeCandidate.audioIntensity,
          confidence,
        );
      }
      if (source.method === 'COMMENTARY_NLP') {
        mergeCandidate.commentaryExcitement = Math.max(
          mergeCandidate.commentaryExcitement,
          confidence,
        );
      }
      if (source.method === 'REPLAY_MARKER') {
        mergeCandidate.isReplay = true;
      }

      // Upgrade event type if we get a more specific detection
      if (eventType !== 'OTHER' && mergeCandidate.type === 'OTHER') {
        mergeCandidate.type = eventType;
      }

      this.emit({ type: 'HIGHLIGHT_UPDATED', highlight: mergeCandidate });
    } else {
      // Create new highlight
      const highlight: HighlightEvent = {
        id: createId('hl'),
        timestamp,
        type: eventType,
        confidence,
        confidenceLevel: classifyConfidence(confidence),
        players: source.rawData?.['players'] as string[] ?? [],
        description: this.generateDescription(eventType, source),
        duration: this.config.minHighlightDuration,
        clipIds: [],
        audioIntensity: source.method === 'CROWD_NOISE' ? confidence : 0,
        crowdReactionScore: source.method === 'CROWD_NOISE' ? confidence : 0,
        commentaryExcitement: source.method === 'COMMENTARY_NLP' ? confidence : 0,
        isReplay: source.method === 'REPLAY_MARKER',
        sourceDetections: [source],
      };

      this.highlights.set(highlight.id, highlight);
      this.emit({ type: 'HIGHLIGHT_DETECTED', highlight });
    }
  }

  private findMergeCandidate(timestamp: number): HighlightEvent | null {
    const windowMs = this.config.mergeWindowMs;
    for (const highlight of this.highlights.values()) {
      if (Math.abs(highlight.timestamp - timestamp) <= windowMs) {
        return highlight;
      }
    }
    return null;
  }

  private classifyFromCommentary(phrase: string): SportEventType {
    const lower = phrase.toLowerCase();
    if (lower.includes('goal') || lower.includes('scores')) return 'GOAL';
    if (lower.includes('touchdown')) return 'TOUCHDOWN';
    if (lower.includes('dunk') || lower.includes('slam')) return 'DUNK';
    if (lower.includes('home run') || lower.includes('out of the park')) return 'HOME_RUN';
    if (lower.includes('three pointer') || lower.includes('nothing but net')) return 'THREE_POINTER';
    if (lower.includes('save')) return 'SAVE';
    if (lower.includes('interception')) return 'INTERCEPTION';
    if (lower.includes('sack')) return 'SACK';
    if (lower.includes('penalty')) return 'PENALTY';
    if (lower.includes('red card')) return 'RED_CARD';
    if (lower.includes('field goal')) return 'FIELD_GOAL';
    if (lower.includes('hat trick')) return 'HAT_TRICK';
    return 'OTHER';
  }

  private generateDescription(eventType: SportEventType, source: HighlightDetectionSource): string {
    const method = source.method.replace(/_/g, ' ').toLowerCase();
    const type = eventType.replace(/_/g, ' ').toLowerCase();
    return `${type} detected via ${method}`;
  }

  private runDetectionCycle(): void {
    // In production, this would trigger audio analysis, video analysis,
    // and NLP pipelines. For the demo, detection is event-driven via
    // the feed* methods.
  }
}

/**
 * Create a pre-configured SportsHighlightsEngine.
 */
export function createSportsHighlightsEngine(
  config: Partial<HighlightsEngineConfig> = {},
): SportsHighlightsEngine {
  return new SportsHighlightsEngine(config);
}
