// ─── Live Stats Data Bridge ───────────────────────────────────────────────────
// SP-05: Connect to sports data providers (SportRadar, Stats Inc, ESPN Stats,
// Opta) via REST APIs. Real-time data cache with configurable refresh.
// Data exposed to graphics templates and AI engines. Timeline markers
// on score changes. GraphicsDataBinding with _LIVE suffix auto-populate.

import type {
  StatsDataPoint,
  StatsEvent,
  StatsProviderConfig,
  StatsProvider,
  StatsConnectionStatus,
  SportEventType,
  GraphicsDataBinding,
} from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createId(prefix: string): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Events ───────────────────────────────────────────────────────────────────

export type StatsEvent_Bridge =
  | { type: 'CONNECTION_CHANGED'; status: StatsConnectionStatus; provider: StatsProvider }
  | { type: 'DATA_UPDATE'; dataPoint: StatsDataPoint }
  | { type: 'SCORE_CHANGE'; homeScore: number; awayScore: number; timestamp: number }
  | { type: 'GAME_EVENT'; event: StatsEvent }
  | { type: 'PERIOD_CHANGE'; period: number; timestamp: number }
  | { type: 'CACHE_REFRESHED'; entryCount: number }
  | { type: 'ERROR'; provider: StatsProvider; error: string };

export type StatsListener = (event: StatsEvent_Bridge) => void;

// ─── Live Data Cache ──────────────────────────────────────────────────────────

export interface LiveDataEntry {
  key: string;
  value: string | number;
  updatedAt: number;
  source: StatsProvider;
}

// ─── Data Bridge ──────────────────────────────────────────────────────────────

export class StatsDataBridge {
  private providers: Map<StatsProvider, StatsProviderConfig> = new Map();
  private listeners: Set<StatsListener> = new Set();
  private connectionStatus: Map<StatsProvider, StatsConnectionStatus> = new Map();
  private dataHistory: StatsDataPoint[] = [];
  private liveCache: Map<string, LiveDataEntry> = new Map();
  private pollTimers: Map<StatsProvider, ReturnType<typeof setInterval>> = new Map();
  private latestData: StatsDataPoint | null = null;
  private graphicsBindings: Map<string, GraphicsDataBinding> = new Map();

  constructor() {
    // Initialize with default empty state
  }

  // ─── Provider Management ────────────────────────────────────────────────────

  addProvider(config: StatsProviderConfig): void {
    this.providers.set(config.provider, config);
    this.connectionStatus.set(config.provider, 'DISCONNECTED');
  }

  removeProvider(provider: StatsProvider): void {
    this.disconnectProvider(provider);
    this.providers.delete(provider);
    this.connectionStatus.delete(provider);
  }

  getProviders(): StatsProviderConfig[] {
    return Array.from(this.providers.values());
  }

  getProviderStatus(provider: StatsProvider): StatsConnectionStatus {
    return this.connectionStatus.get(provider) ?? 'DISCONNECTED';
  }

  // ─── Connection Lifecycle ───────────────────────────────────────────────────

  async connectProvider(provider: StatsProvider): Promise<void> {
    const config = this.providers.get(provider);
    if (!config) {
      throw new Error(`Provider not configured: ${provider}`);
    }

    this.setStatus(provider, 'CONNECTING');

    try {
      // In production, validate API key and test connectivity
      await this.simulateConnection(provider);
      this.setStatus(provider, 'CONNECTED');

      if (config.enabled) {
        this.startPolling(provider);
      }

      // Seed initial demo data
      this.seedDemoData(provider, config);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      this.setStatus(provider, 'ERROR');
      this.emit({ type: 'ERROR', provider, error: message });
    }
  }

  disconnectProvider(provider: StatsProvider): void {
    this.stopPolling(provider);
    this.setStatus(provider, 'DISCONNECTED');
  }

  async connectAll(): Promise<void> {
    const promises = Array.from(this.providers.keys()).map((provider) =>
      this.connectProvider(provider),
    );
    await Promise.allSettled(promises);
  }

  disconnectAll(): void {
    for (const provider of this.providers.keys()) {
      this.disconnectProvider(provider);
    }
  }

  destroy(): void {
    this.disconnectAll();
    this.listeners.clear();
    this.liveCache.clear();
    this.dataHistory = [];
    this.graphicsBindings.clear();
  }

  // ─── Data Access ────────────────────────────────────────────────────────────

  getLatestData(): StatsDataPoint | null {
    return this.latestData;
  }

  getDataHistory(limit?: number): StatsDataPoint[] {
    if (limit) {
      return this.dataHistory.slice(-limit);
    }
    return [...this.dataHistory];
  }

  getScoreEvents(): StatsDataPoint[] {
    return this.dataHistory.filter((dp, idx) => {
      if (idx === 0) return false;
      const prev = this.dataHistory[idx - 1]!;
      return dp.homeScore !== prev.homeScore || dp.awayScore !== prev.awayScore;
    });
  }

  getAllEvents(): StatsEvent[] {
    return this.dataHistory.flatMap((dp) => dp.events);
  }

  getEventsByType(type: SportEventType): StatsEvent[] {
    return this.getAllEvents().filter((e) => e.type === type);
  }

  // ─── Live Data Cache ────────────────────────────────────────────────────────

  getLiveValue(key: string): string | number | null {
    return this.liveCache.get(key)?.value ?? null;
  }

  getAllLiveData(): Record<string, string | number> {
    const result: Record<string, string | number> = {};
    for (const [key, entry] of this.liveCache) {
      result[key] = entry.value;
    }
    return result;
  }

  /**
   * Resolve a graphics data binding to its current value.
   * Fields suffixed with _LIVE are auto-resolved from the live cache.
   */
  resolveLiveBinding(binding: GraphicsDataBinding): string {
    if (binding.source === 'STATS_LIVE') {
      const value = this.getLiveValue(binding.key);
      if (value !== null) {
        return binding.format
          ? this.formatValue(value, binding.format)
          : String(value);
      }
      return binding.fallback;
    }
    return binding.fallback;
  }

  /**
   * Register a graphics data binding for live updates.
   */
  registerBinding(binding: GraphicsDataBinding): void {
    this.graphicsBindings.set(binding.fieldId, binding);
  }

  /**
   * Resolve all registered bindings to current values.
   */
  resolveAllBindings(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [fieldId, binding] of this.graphicsBindings) {
      result[fieldId] = this.resolveLiveBinding(binding);
    }
    return result;
  }

  /**
   * Get timeline marker data for score changes (for automatic marker insertion).
   */
  getScoreChangeMarkers(): Array<{ time: number; label: string; color: string }> {
    return this.getScoreEvents().map((dp) => ({
      time: dp.timestamp / 1000,
      label: `Score: ${dp.homeScore} - ${dp.awayScore}`,
      color: '#ef4444',
    }));
  }

  // ─── Events ─────────────────────────────────────────────────────────────────

  on(listener: StatsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  off(listener: StatsListener): void {
    this.listeners.delete(listener);
  }

  // ─── Feed Data (from external sources or simulation) ────────────────────────

  /**
   * Push a data point into the bridge (called by poll or external feed).
   */
  pushDataPoint(dataPoint: StatsDataPoint): void {
    const prev = this.latestData;
    this.latestData = dataPoint;
    this.dataHistory.push(dataPoint);

    // Keep history manageable
    if (this.dataHistory.length > 5000) {
      this.dataHistory = this.dataHistory.slice(-2500);
    }

    // Update live cache
    this.updateLiveCache(dataPoint);

    this.emit({ type: 'DATA_UPDATE', dataPoint });

    // Detect score changes
    if (prev && (dataPoint.homeScore !== prev.homeScore || dataPoint.awayScore !== prev.awayScore)) {
      this.emit({
        type: 'SCORE_CHANGE',
        homeScore: dataPoint.homeScore,
        awayScore: dataPoint.awayScore,
        timestamp: dataPoint.timestamp,
      });
    }

    // Detect period changes
    if (prev && dataPoint.period !== prev.period) {
      this.emit({
        type: 'PERIOD_CHANGE',
        period: dataPoint.period,
        timestamp: dataPoint.timestamp,
      });
    }

    // Emit individual events
    for (const event of dataPoint.events) {
      this.emit({ type: 'GAME_EVENT', event });
    }
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private emit(event: StatsEvent_Bridge): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Swallow listener errors
      }
    }
  }

  private setStatus(provider: StatsProvider, status: StatsConnectionStatus): void {
    this.connectionStatus.set(provider, status);
    this.emit({ type: 'CONNECTION_CHANGED', status, provider });
  }

  private startPolling(provider: StatsProvider): void {
    const config = this.providers.get(provider);
    if (!config || this.pollTimers.has(provider)) return;

    const timer = setInterval(() => {
      this.pollProvider(provider).catch(() => {
        this.setStatus(provider, 'STALE');
      });
    }, config.refreshIntervalMs);

    this.pollTimers.set(provider, timer);
  }

  private stopPolling(provider: StatsProvider): void {
    const timer = this.pollTimers.get(provider);
    if (timer) {
      clearInterval(timer);
      this.pollTimers.delete(provider);
    }
  }

  private async pollProvider(_provider: StatsProvider): Promise<void> {
    // In production, this would make HTTP requests to the stats provider API:
    // - SportRadar: GET /v7/{sport}/{league}/games/{gameId}/timeline.json
    // - Stats Inc: GET /stats/v1/live/{gameId}
    // - ESPN Stats: GET /v1/sports/{sport}/events/{eventId}
    // - Opta: GET /competition/{compId}/match/{matchId}/events
    //
    // For the demo, data is fed via pushDataPoint().
  }

  private async simulateConnection(_provider: StatsProvider): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 100));
  }

  private updateLiveCache(dataPoint: StatsDataPoint): void {
    const now = Date.now();
    const source: StatsProvider = 'SPORTRADAR'; // Default; in production mapped from actual source

    const entries: Array<[string, string | number]> = [
      ['HOME_SCORE_LIVE', dataPoint.homeScore],
      ['AWAY_SCORE_LIVE', dataPoint.awayScore],
      ['PERIOD_LIVE', dataPoint.period],
      ['GAME_CLOCK_LIVE', this.formatGameClock(dataPoint.gameClockMs)],
      ['GAME_STATE_LIVE', dataPoint.gameState],
      ['GAME_CLOCK_MS_LIVE', dataPoint.gameClockMs],
    ];

    for (const [key, value] of entries) {
      this.liveCache.set(key, { key, value, updatedAt: now, source });
    }

    this.emit({ type: 'CACHE_REFRESHED', entryCount: this.liveCache.size });
  }

  private formatGameClock(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  private formatValue(value: string | number, format: string): string {
    if (format === 'CLOCK' && typeof value === 'number') {
      return this.formatGameClock(value);
    }
    if (format === 'ORDINAL' && typeof value === 'number') {
      const suffixes = ['th', 'st', 'nd', 'rd'];
      const v = value % 100;
      return value + (suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0] ?? 'th');
    }
    return String(value);
  }

  private seedDemoData(provider: StatsProvider, _config: StatsProviderConfig): void {
    const now = Date.now();
    const baseTime = now - 45 * 60 * 1000; // 45 minutes ago

    const dataPoints: StatsDataPoint[] = [
      {
        timestamp: baseTime,
        gameState: 'IN_PLAY',
        homeScore: 0,
        awayScore: 0,
        period: 1,
        gameClockMs: 0,
        events: [],
      },
      {
        timestamp: baseTime + 15 * 60 * 1000,
        gameState: 'IN_PLAY',
        homeScore: 1,
        awayScore: 0,
        period: 1,
        gameClockMs: 15 * 60 * 1000,
        events: [
          {
            id: createId('evt'),
            type: 'GOAL',
            timestamp: baseTime + 15 * 60 * 1000,
            playerName: 'M. Salah',
            teamId: 'home',
            description: 'Goal by M. Salah (assisted by T. Alexander-Arnold)',
            gameClockMs: 15 * 60 * 1000,
            period: 1,
          },
        ],
      },
      {
        timestamp: baseTime + 32 * 60 * 1000,
        gameState: 'IN_PLAY',
        homeScore: 1,
        awayScore: 1,
        period: 1,
        gameClockMs: 32 * 60 * 1000,
        events: [
          {
            id: createId('evt'),
            type: 'GOAL',
            timestamp: baseTime + 32 * 60 * 1000,
            playerName: 'E. Haaland',
            teamId: 'away',
            description: 'Goal by E. Haaland (assisted by K. De Bruyne)',
            gameClockMs: 32 * 60 * 1000,
            period: 1,
          },
        ],
      },
      {
        timestamp: baseTime + 38 * 60 * 1000,
        gameState: 'IN_PLAY',
        homeScore: 1,
        awayScore: 1,
        period: 1,
        gameClockMs: 38 * 60 * 1000,
        events: [
          {
            id: createId('evt'),
            type: 'YELLOW_CARD',
            timestamp: baseTime + 38 * 60 * 1000,
            playerName: 'R. Dias',
            teamId: 'away',
            description: 'Yellow card to R. Dias for dangerous tackle',
            gameClockMs: 38 * 60 * 1000,
            period: 1,
          },
        ],
      },
      {
        timestamp: now,
        gameState: 'HALFTIME',
        homeScore: 1,
        awayScore: 1,
        period: 1,
        gameClockMs: 45 * 60 * 1000,
        events: [],
      },
    ];

    for (const dp of dataPoints) {
      this.pushDataPoint(dp);
    }
  }
}

/**
 * Create a pre-configured StatsDataBridge for sports production.
 */
export function createStatsDataBridge(
  providers: StatsProviderConfig[] = [],
): StatsDataBridge {
  const bridge = new StatsDataBridge();
  for (const config of providers) {
    bridge.addProvider(config);
  }
  return bridge;
}
