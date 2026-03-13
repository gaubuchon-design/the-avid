import { afterEach, describe, expect, it, vi } from 'vitest';
import { JobQueue } from '../JobQueue.js';
import type { WorkerJob } from '../index.js';

function makeJob(id: string, priority = 0): WorkerJob {
  return {
    id,
    type: 'render',
    inputUrl: `file:///tmp/${id}.mov`,
    priority,
    params: {},
  };
}

describe('JobQueue', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('dequeues higher-priority jobs first while preserving FIFO within a priority band', () => {
    const queue = new JobQueue({ fairScheduleIntervalMs: 0 });

    try {
      queue.enqueue(makeJob('low', 1));
      queue.enqueue(makeJob('high-1', 5));
      queue.enqueue(makeJob('high-2', 5));

      expect(queue.dequeue()?.job.id).toBe('high-1');
      expect(queue.dequeue()?.job.id).toBe('high-2');
      expect(queue.dequeue()?.job.id).toBe('low');
      expect(queue.dequeue()).toBeNull();
    } finally {
      queue.dispose();
    }
  });

  it('requeues transient failures but stops retrying on non-retryable errors', () => {
    const queue = new JobQueue({
      fairScheduleIntervalMs: 0,
      defaultMaxRetries: 2,
    });

    try {
      queue.enqueue(makeJob('render-1'));

      expect(queue.dequeue()?.status).toBe('running');
      expect(queue.markFailed('render-1', 'Temporary socket reset')).toBe(true);
      expect(queue.pendingCount).toBe(1);
      expect(queue.runningCount).toBe(0);

      expect(queue.dequeue()?.status).toBe('running');
      expect(queue.markFailed('render-1', 'No space left on device')).toBe(false);

      const history = queue.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0]?.status).toBe('failed');
      expect(history[0]?.error).toContain('Non-retryable failure');
    } finally {
      queue.dispose();
    }
  });

  it('times out running jobs and notifies the timeout handler', () => {
    vi.useFakeTimers();
    const timeoutHandler = vi.fn<(jobId: string) => void>();
    const queue = new JobQueue({
      fairScheduleIntervalMs: 0,
      defaultMaxRetries: 0,
      defaultMaxDurationMs: 100,
    });
    queue.setTimeoutHandler(timeoutHandler);

    try {
      queue.enqueue(makeJob('timeout-job'));
      expect(queue.dequeue()?.status).toBe('running');

      vi.advanceTimersByTime(100);

      expect(timeoutHandler).toHaveBeenCalledWith('timeout-job');
      expect(queue.getStats().timedOut).toBe(1);
      expect(queue.getHistory()[0]?.status).toBe('failed');
      expect(queue.getHistory()[0]?.error).toContain('timed out');
    } finally {
      queue.dispose();
    }
  });

  it('drain cancels queued jobs and resolves once running work completes', async () => {
    const queue = new JobQueue({ fairScheduleIntervalMs: 0 });

    try {
      queue.enqueue(makeJob('running-job'));
      queue.enqueue(makeJob('queued-job'));
      expect(queue.dequeue()?.job.id).toBe('running-job');

      const drainPromise = queue.drain(1_000);

      expect(queue.isDraining).toBe(true);
      expect(queue.pendingCount).toBe(0);
      expect(queue.getHistory().find((entry) => entry.job.id === 'queued-job')?.status).toBe('cancelled');

      queue.markCompleted('running-job');
      await expect(drainPromise).resolves.toBeUndefined();
      expect(queue.runningCount).toBe(0);
    } finally {
      queue.dispose();
    }
  });
});
