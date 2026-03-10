/**
 * @module EventQueue
 * @description In-memory analytics event queue with offline support, batched
 * flushing, and configurable eviction. Events accumulate locally regardless
 * of network state and are flushed to a consumer callback when connectivity
 * is available.
 *
 * ## Design
 *
 * - **Local-first:** Events are always accepted into the queue, even offline.
 * - **FIFO eviction:** When the queue reaches its maximum size, the oldest
 *   events are evicted to make room.
 * - **Batched flush:** A configurable timer triggers periodic flushes. Each
 *   flush drains the queue into the `onFlush` callback.
 * - **Offline resilience:** When marked offline via {@link setOnline}(false),
 *   auto-flush is paused. When connectivity returns, the queue auto-flushes
 *   all accumulated events.
 *
 * @see ADR-010-analytics-privacy
 */

import type { AnalyticsEvent } from './EventSchema';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default maximum number of events the queue will hold. */
const DEFAULT_MAX_SIZE = 10_000;

/** Default auto-flush interval in milliseconds (30 seconds). */
const DEFAULT_FLUSH_INTERVAL_MS = 30_000;

/** Options for configuring the {@link EventQueue}. */
export interface EventQueueOptions {
  /** Maximum number of events before FIFO eviction (default: 10 000). */
  readonly maxSize?: number;
  /** Auto-flush interval in milliseconds (default: 30 000). */
  readonly flushIntervalMs?: number;
  /**
   * Callback invoked on each flush with the batch of events.
   * Should resolve when the downstream consumer has accepted the batch.
   * Rejections cause the events to remain in the queue for retry.
   */
  readonly onFlush?: (events: AnalyticsEvent[]) => Promise<void>;
}

/** Result of a flush operation. */
export interface FlushResult {
  /** Number of events successfully flushed. */
  readonly flushed: number;
  /** Number of events that failed to flush (returned to queue). */
  readonly failed: number;
}

// ---------------------------------------------------------------------------
// EventQueue
// ---------------------------------------------------------------------------

/**
 * Local analytics event queue with offline support and automatic batched flushing.
 *
 * @example
 * ```ts
 * const queue = new EventQueue({
 *   maxSize: 5000,
 *   flushIntervalMs: 10_000,
 *   onFlush: async (events) => {
 *     await fetch('/api/analytics', {
 *       method: 'POST',
 *       body: JSON.stringify(events),
 *     });
 *   },
 * });
 *
 * queue.startAutoFlush();
 * queue.enqueue(event);
 * ```
 */
export class EventQueue {
  private queue: AnalyticsEvent[] = [];
  private readonly maxSize: number;
  private readonly flushIntervalMs: number;
  private readonly onFlush: ((events: AnalyticsEvent[]) => Promise<void>) | undefined;

  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private online = true;
  private flushing = false;

  /**
   * @param options - Queue configuration options.
   */
  constructor(options?: EventQueueOptions) {
    this.maxSize = options?.maxSize ?? DEFAULT_MAX_SIZE;
    this.flushIntervalMs = options?.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.onFlush = options?.onFlush;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Add an event to the queue.
   *
   * If the queue is at capacity, the oldest events are evicted (FIFO) to
   * make room. Events are accepted regardless of online/offline state.
   *
   * @param event - The analytics event to enqueue.
   */
  enqueue(event: AnalyticsEvent): void {
    if (this.queue.length >= this.maxSize) {
      // Evict the oldest 10% to avoid per-event eviction overhead
      const evictCount = Math.max(1, Math.floor(this.maxSize * 0.1));
      this.queue.splice(0, evictCount);
    }

    this.queue.push(event);
  }

  /**
   * Flush all queued events to the consumer callback.
   *
   * If no `onFlush` callback is configured, the queue is simply cleared.
   * If the callback rejects, the events are returned to the front of the
   * queue so they can be retried on the next flush.
   *
   * @returns The number of events flushed and failed.
   */
  async flush(): Promise<FlushResult> {
    if (this.flushing) {
      return { flushed: 0, failed: 0 };
    }

    if (this.queue.length === 0) {
      return { flushed: 0, failed: 0 };
    }

    this.flushing = true;

    // Take a snapshot of the current queue and clear it
    const batch = [...this.queue];
    this.queue = [];

    try {
      if (this.onFlush) {
        await this.onFlush(batch);
      }
      this.flushing = false;
      return { flushed: batch.length, failed: 0 };
    } catch {
      // Return failed events to the front of the queue for retry
      this.queue.unshift(...batch);
      this.flushing = false;
      return { flushed: 0, failed: batch.length };
    }
  }

  /**
   * Get the current number of events waiting in the queue.
   *
   * @returns The queue depth.
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Get a shallow copy of all pending events without removing them.
   *
   * @returns Array of queued events in insertion order.
   */
  getPending(): AnalyticsEvent[] {
    return [...this.queue];
  }

  /**
   * Start the automatic flush timer. Events are flushed at the configured
   * interval as long as the queue is online.
   *
   * Calling this when a timer is already running is a no-op.
   */
  startAutoFlush(): void {
    if (this.flushTimer !== null) {
      return;
    }

    this.flushTimer = setInterval(() => {
      if (this.online && this.queue.length > 0) {
        void this.flush();
      }
    }, this.flushIntervalMs);

    // Unref the timer so it does not prevent process exit during shutdown
    if (typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
      this.flushTimer.unref();
    }
  }

  /**
   * Stop the automatic flush timer.
   *
   * Pending events remain in the queue and can be flushed manually or
   * when auto-flush is restarted.
   */
  stopAutoFlush(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Set the online/offline state of the queue.
   *
   * When transitioning from offline to online, a flush is triggered
   * immediately to drain accumulated events.
   *
   * @param online - `true` if connectivity is available; `false` otherwise.
   */
  setOnline(online: boolean): void {
    const wasOffline = !this.online;
    this.online = online;

    // Transitioning from offline to online: flush immediately
    if (wasOffline && online && this.queue.length > 0) {
      void this.flush();
    }
  }

  /**
   * Whether the queue is currently in online mode.
   *
   * @returns `true` if online.
   */
  isOnline(): boolean {
    return this.online;
  }

  /**
   * Destroy the queue: stop auto-flush and discard all pending events.
   *
   * Call this during graceful shutdown to release resources. After calling
   * `destroy()`, the queue should not be used again.
   */
  destroy(): void {
    this.stopAutoFlush();
    this.queue = [];
  }
}
