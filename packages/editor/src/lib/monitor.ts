// =============================================================================
//  THE AVID — Performance Monitor
// =============================================================================

/** Snapshot of current performance metrics. */
export interface PerfStats {
  fps: number;
  avgFrameTime: number;
  memoryMB: number;
  effectTimes: Record<string, number>;
}

type PerfListener = (stats: PerfStats) => void;

const ROLLING_WINDOW = 60;

class PerformanceMonitor {
  private frameTimes: number[] = [];
  private effectTimesMap: Map<string, number[]> = new Map();
  private listeners = new Set<PerfListener>();
  private notifyTimer: ReturnType<typeof setInterval> | null = null;

  // ---------------------------------------------------------------------------
  //  Recording
  // ---------------------------------------------------------------------------

  /**
   * Record a single frame render duration.
   * @param ms Time in milliseconds to render the frame.
   */
  recordFrameTime(ms: number): void {
    this.frameTimes.push(ms);
    if (this.frameTimes.length > ROLLING_WINDOW) {
      this.frameTimes.shift();
    }
  }

  /**
   * Record the processing time for a specific effect.
   * @param effectId A unique identifier for the effect.
   * @param ms Processing duration in milliseconds.
   */
  recordEffectTime(effectId: string, ms: number): void {
    let times = this.effectTimesMap.get(effectId);
    if (!times) {
      times = [];
      this.effectTimesMap.set(effectId, times);
    }
    times.push(ms);
    if (times.length > ROLLING_WINDOW) {
      times.shift();
    }
  }

  // ---------------------------------------------------------------------------
  //  Stats
  // ---------------------------------------------------------------------------

  /**
   * Compute a snapshot of current performance stats.
   */
  getStats(): PerfStats {
    const avgFrameTime = this.average(this.frameTimes);
    const fps = avgFrameTime > 0 ? Math.round(1000 / avgFrameTime) : 0;

    const effectTimes: Record<string, number> = {};
    this.effectTimesMap.forEach((times, id) => {
      effectTimes[id] = this.average(times);
    });

    return {
      fps,
      avgFrameTime: Math.round(avgFrameTime * 100) / 100,
      memoryMB: this.getMemoryMB(),
      effectTimes,
    };
  }

  // ---------------------------------------------------------------------------
  //  Subscriptions (for StatusBar / overlay integration)
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to periodic performance stat updates (emitted ~1/s).
   * @returns An unsubscribe function.
   */
  subscribe(cb: PerfListener): () => void {
    this.listeners.add(cb);

    // Start the notification interval on first subscriber
    if (this.listeners.size === 1 && !this.notifyTimer) {
      this.notifyTimer = setInterval(() => this.notify(), 1000);
    }

    return () => {
      this.listeners.delete(cb);
      if (this.listeners.size === 0 && this.notifyTimer) {
        clearInterval(this.notifyTimer);
        this.notifyTimer = null;
      }
    };
  }

  // ---------------------------------------------------------------------------
  //  Internals
  // ---------------------------------------------------------------------------

  private notify(): void {
    const stats = this.getStats();
    this.listeners.forEach((fn) => {
      try {
        fn(stats);
      } catch {
        // Listener errors must not break the monitor
      }
    });
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    let sum = 0;
    for (const v of values) sum += v;
    return sum / values.length;
  }

  private getMemoryMB(): number {
    // Chrome-only API; gracefully returns 0 elsewhere
    const perf = performance as Performance & {
      memory?: { usedJSHeapSize: number };
    };
    if (perf.memory) {
      return Math.round(perf.memory.usedJSHeapSize / (1024 * 1024));
    }
    return 0;
  }
}

/** Singleton performance monitor instance. */
export const performanceMonitor = new PerformanceMonitor();
