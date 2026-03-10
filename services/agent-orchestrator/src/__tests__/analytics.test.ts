/**
 * @module analytics.test
 * @description Comprehensive tests for the Phase 10 analytics feedback loop:
 *
 * - EventSchema: event creation, all payload types, validation
 * - PrivacyFilter: PII stripping, level filtering, anonymization
 * - EventQueue: enqueue, flush, offline/online transition, max size eviction
 * - DashboardData: aggregation queries with representative sample data
 * - EventExporter: JSON and CSV export formats
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createEvent,
  type AnalyticsEvent,
  type AnalyticsEventType,
  type PrivacyLevel,
} from '../analytics/EventSchema';
import { PrivacyFilter } from '../analytics/PrivacyFilter';
import { EventQueue } from '../analytics/EventQueue';
import { DashboardData } from '../analytics/DashboardData';
import { EventExporter } from '../analytics/EventExporter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal valid event for testing purposes.
 */
function makeEvent(
  overrides: Partial<AnalyticsEvent> & { type?: AnalyticsEventType } = {},
): AnalyticsEvent {
  return {
    id: overrides.id ?? 'evt-001',
    type: overrides.type ?? 'prompt',
    sessionId: overrides.sessionId ?? 'session-abc',
    userId: overrides.userId,
    timestamp: overrides.timestamp ?? '2026-03-08T10:00:00.000Z',
    privacyLevel: overrides.privacyLevel ?? 'org-internal',
    projectId: overrides.projectId,
    sequenceId: overrides.sequenceId,
    payload: overrides.payload ?? {},
  };
}

/**
 * Build a diverse set of sample events for dashboard aggregation tests.
 */
function buildSampleEvents(): AnalyticsEvent[] {
  return [
    // Prompt events
    makeEvent({
      id: 'p1',
      type: 'prompt',
      timestamp: '2026-03-08T10:00:00.000Z',
      payload: { promptText: 'remove all silence', contextSummary: 'ctx', responsePreview: 'ok', tokenCount: 100 },
    }),
    makeEvent({
      id: 'p2',
      type: 'prompt',
      timestamp: '2026-03-08T10:01:00.000Z',
      payload: { promptText: 'remove all silence', contextSummary: 'ctx', responsePreview: 'ok', tokenCount: 110 },
    }),
    makeEvent({
      id: 'p3',
      type: 'prompt',
      timestamp: '2026-03-08T10:02:00.000Z',
      payload: { promptText: 'generate rough cut', contextSummary: 'ctx', responsePreview: 'ok', tokenCount: 200 },
    }),

    // Plan generated
    makeEvent({
      id: 'pg1',
      type: 'plan-generated',
      timestamp: '2026-03-08T10:00:05.000Z',
      payload: { planId: 'plan-1', stepCount: 3, toolNames: ['remove_silence', 'normalize_audio', 'export_sequence'], estimatedTokens: 150 },
    }),

    // Step overrides
    makeEvent({
      id: 'so1',
      type: 'step-override',
      timestamp: '2026-03-08T10:01:05.000Z',
      payload: { planId: 'plan-1', stepId: 'step-2', toolName: 'normalize_audio', reason: 'wrong level', userAction: 'modify' },
    }),
    makeEvent({
      id: 'so2',
      type: 'step-override',
      timestamp: '2026-03-08T10:02:05.000Z',
      payload: { planId: 'plan-2', stepId: 'step-1', toolName: 'normalize_audio', reason: 'wrong level', userAction: 'skip' },
    }),
    makeEvent({
      id: 'so3',
      type: 'step-override',
      timestamp: '2026-03-08T10:03:05.000Z',
      payload: { planId: 'plan-3', stepId: 'step-1', toolName: 'suggest_cuts', reason: 'irrelevant', userAction: 'replace' },
    }),

    // Step failures
    makeEvent({
      id: 'sf1',
      type: 'step-failure',
      timestamp: '2026-03-08T10:04:00.000Z',
      payload: { planId: 'plan-1', toolName: 'export_sequence', errorMessage: 'timeout', errorCode: 'TIMEOUT', recoverable: true },
    }),
    makeEvent({
      id: 'sf2',
      type: 'step-failure',
      timestamp: '2026-03-08T10:05:00.000Z',
      payload: { planId: 'plan-2', toolName: 'export_sequence', errorMessage: 'timeout', errorCode: 'TIMEOUT', recoverable: true },
    }),
    makeEvent({
      id: 'sf3',
      type: 'step-failure',
      timestamp: '2026-03-08T10:06:00.000Z',
      payload: { planId: 'plan-3', toolName: 'apply_color_grade', errorMessage: 'invalid LUT', recoverable: false },
    }),

    // Missing endpoints
    makeEvent({
      id: 'me1',
      type: 'missing-endpoint',
      timestamp: '2026-03-08T10:07:00.000Z',
      payload: { requestedTool: 'auto_subtitle', context: 'user wanted subtitles', frequency: 3 },
    }),
    makeEvent({
      id: 'me2',
      type: 'missing-endpoint',
      timestamp: '2026-03-08T10:08:00.000Z',
      payload: { requestedTool: 'auto_subtitle', context: 'subtitle request again', frequency: 4 },
    }),

    // Token consumed
    makeEvent({
      id: 'tc1',
      type: 'token-consumed',
      timestamp: '2026-03-08T10:09:00.000Z',
      payload: { planId: 'plan-1', category: 'planning', tokensConsumed: 500, quotedTokens: 450, variance: 50 },
    }),
    makeEvent({
      id: 'tc2',
      type: 'token-consumed',
      timestamp: '2026-03-08T10:10:00.000Z',
      payload: { planId: 'plan-1', category: 'execution', tokensConsumed: 1200, quotedTokens: 1000, variance: 200 },
    }),
    makeEvent({
      id: 'tc3',
      type: 'token-consumed',
      timestamp: '2026-03-08T10:11:00.000Z',
      payload: { planId: 'plan-2', category: 'planning', tokensConsumed: 600, quotedTokens: 550, variance: 50 },
    }),

    // Time saved
    makeEvent({
      id: 'ts1',
      type: 'time-saved-estimate',
      timestamp: '2026-03-08T10:12:00.000Z',
      payload: { planId: 'plan-1', estimatedManualMs: 300000, actualAgentMs: 45000, savingsMs: 255000, confidence: 'high' },
    }),
    makeEvent({
      id: 'ts2',
      type: 'time-saved-estimate',
      timestamp: '2026-03-08T10:13:00.000Z',
      payload: { planId: 'plan-2', estimatedManualMs: 120000, actualAgentMs: 30000, savingsMs: 90000, confidence: 'medium' },
    }),

    // Publish outcomes
    makeEvent({
      id: 'po1',
      type: 'publish-outcome',
      timestamp: '2026-03-08T10:14:00.000Z',
      payload: { planId: 'plan-1', platform: 'youtube', status: 'success', publishedUrl: 'https://youtube.com/v/abc' },
    }),
    makeEvent({
      id: 'po2',
      type: 'publish-outcome',
      timestamp: '2026-03-08T10:15:00.000Z',
      payload: { planId: 'plan-2', platform: 'instagram', status: 'failed', errorMessage: 'auth expired' },
    }),
    makeEvent({
      id: 'po3',
      type: 'publish-outcome',
      timestamp: '2026-03-08T10:16:00.000Z',
      payload: { planId: 'plan-3', platform: 'frame.io', status: 'partial', errorMessage: 'some assets missing' },
    }),

    // Latency reports
    makeEvent({
      id: 'lr1',
      type: 'latency-report',
      timestamp: '2026-03-08T10:17:00.000Z',
      payload: { operation: 'plan-generation', durationMs: 250, p50: 200, p95: 400, p99: 600, sampleCount: 100 },
    }),
    makeEvent({
      id: 'lr2',
      type: 'latency-report',
      timestamp: '2026-03-08T10:18:00.000Z',
      payload: { operation: 'tool-execution', durationMs: 1500, p50: 1200, p95: 2500, p99: 3500, sampleCount: 50 },
    }),
  ];
}

// ===========================================================================
// EventSchema tests
// ===========================================================================

describe('EventSchema', () => {
  describe('createEvent()', () => {
    it('should create an event with a unique UUID id', () => {
      const event = createEvent('prompt', 'session-1', { promptText: 'test' });
      expect(event.id).toBeTruthy();
      expect(event.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should set the type correctly', () => {
      const event = createEvent('plan-generated', 'session-1', { planId: 'p1' });
      expect(event.type).toBe('plan-generated');
    });

    it('should set the sessionId correctly', () => {
      const event = createEvent('prompt', 'my-session', {});
      expect(event.sessionId).toBe('my-session');
    });

    it('should generate an ISO-8601 timestamp', () => {
      const event = createEvent('prompt', 'session-1', {});
      expect(new Date(event.timestamp).getTime()).toBeGreaterThan(0);
      expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should default privacyLevel to org-internal', () => {
      const event = createEvent('prompt', 'session-1', {});
      expect(event.privacyLevel).toBe('org-internal');
    });

    it('should accept optional userId, privacyLevel, projectId, sequenceId', () => {
      const event = createEvent('prompt', 'session-1', { text: 'hello' }, {
        userId: 'user-42',
        privacyLevel: 'user-private',
        projectId: 'proj-99',
        sequenceId: 'seq-7',
      });
      expect(event.userId).toBe('user-42');
      expect(event.privacyLevel).toBe('user-private');
      expect(event.projectId).toBe('proj-99');
      expect(event.sequenceId).toBe('seq-7');
    });

    it('should freeze the returned event object', () => {
      const event = createEvent('prompt', 'session-1', { key: 'value' });
      expect(Object.isFrozen(event)).toBe(true);
    });

    it('should freeze the payload', () => {
      const event = createEvent('prompt', 'session-1', { key: 'value' });
      expect(Object.isFrozen(event.payload)).toBe(true);
    });

    it('should generate unique IDs for each call', () => {
      const a = createEvent('prompt', 'session-1', {});
      const b = createEvent('prompt', 'session-1', {});
      expect(a.id).not.toBe(b.id);
    });

    it('should throw if type is empty', () => {
      expect(() => createEvent('' as AnalyticsEventType, 'session-1', {})).toThrow(
        'type is required',
      );
    });

    it('should throw if sessionId is empty', () => {
      expect(() => createEvent('prompt', '', {})).toThrow('sessionId is required');
    });
  });

  describe('all event types can be created', () => {
    const eventTypes: AnalyticsEventType[] = [
      'prompt',
      'plan-generated',
      'plan-approved',
      'plan-rejected',
      'step-override',
      'step-failure',
      'missing-endpoint',
      'manual-fix-after-agent',
      'time-saved-estimate',
      'publish-outcome',
      'token-consumed',
      'model-fallback',
      'latency-report',
    ];

    for (const type of eventTypes) {
      it(`should create a '${type}' event`, () => {
        const event = createEvent(type, 'session-1', { data: true });
        expect(event.type).toBe(type);
        expect(event.payload['data']).toBe(true);
      });
    }
  });
});

// ===========================================================================
// PrivacyFilter tests
// ===========================================================================

describe('PrivacyFilter', () => {
  let filter: PrivacyFilter;

  beforeEach(() => {
    filter = new PrivacyFilter();
  });

  // -----------------------------------------------------------------------
  // PII stripping
  // -----------------------------------------------------------------------

  describe('stripPII()', () => {
    it('should redact email addresses in string values', () => {
      const result = filter.stripPII({ msg: 'Contact jane@example.com for details' });
      expect(result['msg']).toBe('Contact [REDACTED] for details');
    });

    it('should redact multiple email addresses', () => {
      const result = filter.stripPII({ msg: 'From a@b.co to c@d.org' });
      expect(result['msg']).toBe('From [REDACTED] to [REDACTED]');
    });

    it('should redact IPv4 addresses', () => {
      const result = filter.stripPII({ msg: 'Server at 192.168.1.100' });
      expect(result['msg']).toBe('Server at [REDACTED]');
    });

    it('should redact Unix file paths', () => {
      const result = filter.stripPII({ msg: 'File at /Users/jane/project/video.mov' });
      expect(result['msg']).toBe('File at [REDACTED]');
    });

    it('should redact Windows file paths', () => {
      const result = filter.stripPII({ msg: 'File at C:\\Users\\jane\\Desktop\\file.mov' });
      expect(result['msg']).toBe('File at [REDACTED]');
    });

    it('should redact known PII field names regardless of value', () => {
      const result = filter.stripPII({
        email: 'not-an-email',
        userName: 'jdoe',
        displayName: 'Jane Doe',
        phone: '555-1234',
        password: 'secret123',
        apiKey: 'sk-abc123',
        toolName: 'splice_in', // should NOT be redacted
      });
      expect(result['email']).toBe('[REDACTED]');
      expect(result['userName']).toBe('[REDACTED]');
      expect(result['displayName']).toBe('[REDACTED]');
      expect(result['phone']).toBe('[REDACTED]');
      expect(result['password']).toBe('[REDACTED]');
      expect(result['apiKey']).toBe('[REDACTED]');
      expect(result['toolName']).toBe('splice_in');
    });

    it('should recurse into nested objects', () => {
      const result = filter.stripPII({
        user: { email: 'test@test.com', role: 'admin' },
      });
      const nested = result['user'] as Record<string, unknown>;
      expect(nested['email']).toBe('[REDACTED]');
      expect(nested['role']).toBe('admin');
    });

    it('should handle arrays with objects', () => {
      const result = filter.stripPII({
        users: [
          { email: 'a@b.com', name: 'safe' },
          { email: 'c@d.com', name: 'also-safe' },
        ],
      });
      const users = result['users'] as Array<Record<string, unknown>>;
      expect(users[0]!['email']).toBe('[REDACTED]');
      expect(users[1]!['email']).toBe('[REDACTED]');
      expect(users[0]!['name']).toBe('safe');
    });

    it('should handle arrays with strings', () => {
      const result = filter.stripPII({
        logs: ['Error from 10.0.0.1', 'OK from /Users/home/test'],
      });
      const logs = result['logs'] as string[];
      expect(logs[0]).toContain('[REDACTED]');
    });

    it('should pass through numbers and booleans unchanged', () => {
      const result = filter.stripPII({ count: 42, active: true });
      expect(result['count']).toBe(42);
      expect(result['active']).toBe(true);
    });

    it('should handle null values', () => {
      const result = filter.stripPII({ val: null });
      expect(result['val']).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Privacy level filtering
  // -----------------------------------------------------------------------

  describe('isAllowed()', () => {
    it('should allow public-aggregate events at public-aggregate level', () => {
      expect(filter.isAllowed('public-aggregate', 'public-aggregate')).toBe(true);
    });

    it('should allow public-aggregate events at org-internal level', () => {
      expect(filter.isAllowed('public-aggregate', 'org-internal')).toBe(true);
    });

    it('should NOT allow org-internal events at public-aggregate level', () => {
      expect(filter.isAllowed('org-internal', 'public-aggregate')).toBe(false);
    });

    it('should allow org-internal events at org-internal level', () => {
      expect(filter.isAllowed('org-internal', 'org-internal')).toBe(true);
    });

    it('should allow org-internal events at user-private level', () => {
      expect(filter.isAllowed('org-internal', 'user-private')).toBe(true);
    });

    it('should NOT allow user-private events at org-internal level', () => {
      expect(filter.isAllowed('user-private', 'org-internal')).toBe(false);
    });

    it('should NOT allow do-not-log events at any level', () => {
      expect(filter.isAllowed('do-not-log', 'public-aggregate')).toBe(false);
      expect(filter.isAllowed('do-not-log', 'org-internal')).toBe(false);
      expect(filter.isAllowed('do-not-log', 'user-private')).toBe(false);
      expect(filter.isAllowed('do-not-log', 'do-not-log')).toBe(true);
    });
  });

  describe('filter()', () => {
    it('should return the event when privacy level is compatible', () => {
      const event = makeEvent({ privacyLevel: 'public-aggregate' });
      const result = filter.filter(event, 'org-internal');
      expect(result).not.toBeNull();
      expect(result!.id).toBe(event.id);
    });

    it('should return null when event is more restrictive than requested', () => {
      const event = makeEvent({ privacyLevel: 'user-private' });
      const result = filter.filter(event, 'public-aggregate');
      expect(result).toBeNull();
    });

    it('should always return null for do-not-log events', () => {
      const event = makeEvent({ privacyLevel: 'do-not-log' });
      expect(filter.filter(event, 'do-not-log')).toBeNull();
      expect(filter.filter(event, 'user-private')).toBeNull();
    });

    it('should strip PII from the payload of returned events', () => {
      const event = makeEvent({
        privacyLevel: 'org-internal',
        payload: { email: 'test@example.com', tool: 'splice_in' },
      });
      const result = filter.filter(event, 'org-internal');
      expect(result).not.toBeNull();
      expect(result!.payload['email']).toBe('[REDACTED]');
      expect(result!.payload['tool']).toBe('splice_in');
    });
  });

  // -----------------------------------------------------------------------
  // Anonymization
  // -----------------------------------------------------------------------

  describe('anonymize()', () => {
    it('should hash the userId', () => {
      const event = makeEvent({ userId: 'user-42', projectId: 'proj-1', sequenceId: 'seq-1' });
      const anon = filter.anonymize(event);
      expect(anon.userId).not.toBe('user-42');
      expect(anon.userId).toBeTruthy();
      expect(anon.userId!.length).toBe(16);
    });

    it('should produce consistent hashes for the same userId', () => {
      const event1 = makeEvent({ userId: 'user-42' });
      const event2 = makeEvent({ userId: 'user-42' });
      expect(filter.anonymize(event1).userId).toBe(filter.anonymize(event2).userId);
    });

    it('should produce different hashes for different userIds', () => {
      const event1 = makeEvent({ userId: 'user-42' });
      const event2 = makeEvent({ userId: 'user-99' });
      expect(filter.anonymize(event1).userId).not.toBe(filter.anonymize(event2).userId);
    });

    it('should remove projectId and sequenceId', () => {
      const event = makeEvent({ projectId: 'proj-1', sequenceId: 'seq-1' });
      const anon = filter.anonymize(event);
      expect(anon.projectId).toBeUndefined();
      expect(anon.sequenceId).toBeUndefined();
    });

    it('should handle events without userId', () => {
      const event = makeEvent({});
      const anon = filter.anonymize(event);
      expect(anon.userId).toBeUndefined();
    });

    it('should strip PII from the payload', () => {
      const event = makeEvent({
        userId: 'user-1',
        payload: { email: 'me@test.com' },
      });
      const anon = filter.anonymize(event);
      expect(anon.payload['email']).toBe('[REDACTED]');
    });
  });
});

// ===========================================================================
// EventQueue tests
// ===========================================================================

describe('EventQueue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('enqueue()', () => {
    it('should add events to the queue', () => {
      const queue = new EventQueue();
      queue.enqueue(makeEvent({ id: 'e1' }));
      queue.enqueue(makeEvent({ id: 'e2' }));
      expect(queue.getQueueSize()).toBe(2);
    });

    it('should accept events when offline', () => {
      const queue = new EventQueue();
      queue.setOnline(false);
      queue.enqueue(makeEvent({ id: 'e1' }));
      expect(queue.getQueueSize()).toBe(1);
    });
  });

  describe('flush()', () => {
    it('should flush all events to the onFlush callback', async () => {
      const flushed: AnalyticsEvent[] = [];
      const queue = new EventQueue({
        onFlush: async (events) => {
          flushed.push(...events);
        },
      });

      queue.enqueue(makeEvent({ id: 'e1' }));
      queue.enqueue(makeEvent({ id: 'e2' }));

      const result = await queue.flush();
      expect(result.flushed).toBe(2);
      expect(result.failed).toBe(0);
      expect(flushed).toHaveLength(2);
      expect(queue.getQueueSize()).toBe(0);
    });

    it('should return events to queue on flush failure', async () => {
      const queue = new EventQueue({
        onFlush: async () => {
          throw new Error('network error');
        },
      });

      queue.enqueue(makeEvent({ id: 'e1' }));
      queue.enqueue(makeEvent({ id: 'e2' }));

      const result = await queue.flush();
      expect(result.flushed).toBe(0);
      expect(result.failed).toBe(2);
      expect(queue.getQueueSize()).toBe(2);
    });

    it('should clear queue when no onFlush callback is provided', async () => {
      const queue = new EventQueue();
      queue.enqueue(makeEvent({ id: 'e1' }));

      const result = await queue.flush();
      expect(result.flushed).toBe(1);
      expect(queue.getQueueSize()).toBe(0);
    });

    it('should return zero counts when queue is empty', async () => {
      const queue = new EventQueue();
      const result = await queue.flush();
      expect(result.flushed).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should not re-enter flush while already flushing', async () => {
      let flushCount = 0;
      const queue = new EventQueue({
        onFlush: async () => {
          flushCount += 1;
          // Simulate slow flush
          await new Promise((resolve) => setTimeout(resolve, 50));
        },
      });

      queue.enqueue(makeEvent({ id: 'e1' }));

      // Start two flushes concurrently
      const [result1, result2] = await Promise.all([queue.flush(), queue.flush()]);

      // Only the first should have flushed; the second should be a no-op
      expect(result1.flushed + result2.flushed).toBe(1);
      expect(flushCount).toBe(1);
    });
  });

  describe('max size eviction', () => {
    it('should evict oldest events when queue is full', () => {
      const queue = new EventQueue({ maxSize: 10 });

      // Fill the queue
      for (let i = 0; i < 10; i++) {
        queue.enqueue(makeEvent({ id: `e${i}` }));
      }
      expect(queue.getQueueSize()).toBe(10);

      // Add one more -- should evict oldest 10% (1 event)
      queue.enqueue(makeEvent({ id: 'e10' }));

      // After eviction of 1 (10% of 10) + adding 1, we should have 10
      expect(queue.getQueueSize()).toBe(10);

      // The oldest event (e0) should be gone
      const pending = queue.getPending();
      const ids = pending.map((e) => e.id);
      expect(ids).not.toContain('e0');
      expect(ids).toContain('e10');
    });

    it('should handle maxSize of 1', () => {
      const queue = new EventQueue({ maxSize: 1 });
      queue.enqueue(makeEvent({ id: 'e1' }));
      queue.enqueue(makeEvent({ id: 'e2' }));
      expect(queue.getQueueSize()).toBe(1);
      expect(queue.getPending()[0]!.id).toBe('e2');
    });
  });

  describe('offline/online transition', () => {
    it('should auto-flush when transitioning from offline to online', async () => {
      const flushed: AnalyticsEvent[] = [];
      const queue = new EventQueue({
        onFlush: async (events) => {
          flushed.push(...events);
        },
      });

      queue.setOnline(false);
      queue.enqueue(makeEvent({ id: 'e1' }));
      queue.enqueue(makeEvent({ id: 'e2' }));

      expect(flushed).toHaveLength(0);

      // Transition to online -- should trigger flush
      queue.setOnline(true);

      // Wait for the async flush to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(flushed).toHaveLength(2);
      expect(queue.getQueueSize()).toBe(0);
    });

    it('should not flush when already online and setOnline(true) is called', async () => {
      let flushCount = 0;
      const queue = new EventQueue({
        onFlush: async () => {
          flushCount += 1;
        },
      });

      queue.enqueue(makeEvent({ id: 'e1' }));

      // Already online by default; setting online again should not trigger flush
      queue.setOnline(true);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(flushCount).toBe(0);
    });
  });

  describe('getPending()', () => {
    it('should return a copy of queued events', () => {
      const queue = new EventQueue();
      queue.enqueue(makeEvent({ id: 'e1' }));

      const pending = queue.getPending();
      expect(pending).toHaveLength(1);

      // Modifying the returned array should not affect the queue
      pending.pop();
      expect(queue.getQueueSize()).toBe(1);
    });
  });

  describe('auto-flush', () => {
    it('should start and stop the auto-flush timer', async () => {
      vi.useFakeTimers();
      let flushCount = 0;
      const queue = new EventQueue({
        flushIntervalMs: 100,
        onFlush: async () => {
          flushCount += 1;
        },
      });

      queue.enqueue(makeEvent({ id: 'e1' }));
      queue.startAutoFlush();

      // Advance timer and allow the flush promise to resolve
      await vi.advanceTimersByTimeAsync(100);
      expect(flushCount).toBe(1);

      queue.enqueue(makeEvent({ id: 'e2' }));
      await vi.advanceTimersByTimeAsync(100);
      expect(flushCount).toBe(2);

      queue.stopAutoFlush();
      queue.enqueue(makeEvent({ id: 'e3' }));
      await vi.advanceTimersByTimeAsync(200);
      // Should not have flushed again after stopping
      expect(flushCount).toBe(2);

      vi.useRealTimers();
    });

    it('should not flush during auto-flush when offline', async () => {
      vi.useFakeTimers();
      let flushCount = 0;
      const queue = new EventQueue({
        flushIntervalMs: 100,
        onFlush: async () => {
          flushCount += 1;
        },
      });

      queue.enqueue(makeEvent({ id: 'e1' }));
      queue.setOnline(false);
      queue.startAutoFlush();

      await vi.advanceTimersByTimeAsync(300);
      expect(flushCount).toBe(0);

      queue.stopAutoFlush();
      vi.useRealTimers();
    });

    it('should be idempotent when called multiple times', () => {
      const queue = new EventQueue({ flushIntervalMs: 1000 });
      queue.startAutoFlush();
      queue.startAutoFlush(); // should be a no-op
      queue.stopAutoFlush();
    });
  });
});

// ===========================================================================
// DashboardData tests
// ===========================================================================

describe('DashboardData', () => {
  let dashboard: DashboardData;
  let sampleEvents: AnalyticsEvent[];

  beforeEach(() => {
    sampleEvents = buildSampleEvents();
    dashboard = new DashboardData(sampleEvents);
  });

  describe('getCommonAutomations()', () => {
    it('should return the most frequent prompt patterns', () => {
      const automations = dashboard.getCommonAutomations();
      expect(automations.length).toBeGreaterThan(0);
      expect(automations[0]!.pattern).toBe('remove all silence');
      expect(automations[0]!.count).toBe(2);
    });

    it('should respect the limit parameter', () => {
      const automations = dashboard.getCommonAutomations(1);
      expect(automations).toHaveLength(1);
    });

    it('should return empty array when no prompt events exist', () => {
      const dash = new DashboardData([
        makeEvent({ type: 'plan-generated', payload: {} }),
      ]);
      expect(dash.getCommonAutomations()).toHaveLength(0);
    });
  });

  describe('getTopOverrides()', () => {
    it('should return overrides ranked by frequency', () => {
      const overrides = dashboard.getTopOverrides();
      expect(overrides.length).toBeGreaterThan(0);
      // normalize_audio / wrong level appears twice
      expect(overrides[0]!.toolName).toBe('normalize_audio');
      expect(overrides[0]!.reason).toBe('wrong level');
      expect(overrides[0]!.count).toBe(2);
    });

    it('should include all unique (tool, reason) combinations', () => {
      const overrides = dashboard.getTopOverrides();
      expect(overrides).toHaveLength(2); // normalize_audio/wrong level and suggest_cuts/irrelevant
    });
  });

  describe('getMissingEndpoints()', () => {
    it('should return missing endpoints ranked by frequency', () => {
      const missing = dashboard.getMissingEndpoints();
      expect(missing).toHaveLength(1);
      expect(missing[0]!.tool).toBe('auto_subtitle');
      expect(missing[0]!.frequency).toBe(2); // two events
    });

    it('should keep the most recent context', () => {
      const missing = dashboard.getMissingEndpoints();
      expect(missing[0]!.context).toBe('subtitle request again');
    });
  });

  describe('getFailureClusters()', () => {
    it('should cluster failures by (tool, error) pairs', () => {
      const clusters = dashboard.getFailureClusters();
      expect(clusters.length).toBeGreaterThan(0);
      // export_sequence/timeout appears twice
      expect(clusters[0]!.toolName).toBe('export_sequence');
      expect(clusters[0]!.errorMessage).toBe('timeout');
      expect(clusters[0]!.count).toBe(2);
    });

    it('should track the last occurrence timestamp', () => {
      const clusters = dashboard.getFailureClusters();
      const exportCluster = clusters.find((c) => c.toolName === 'export_sequence');
      expect(exportCluster).toBeDefined();
      expect(exportCluster!.lastOccurrence).toBe('2026-03-08T10:05:00.000Z');
    });

    it('should include single-occurrence failures', () => {
      const clusters = dashboard.getFailureClusters();
      const colorCluster = clusters.find((c) => c.toolName === 'apply_color_grade');
      expect(colorCluster).toBeDefined();
      expect(colorCluster!.count).toBe(1);
    });
  });

  describe('getTokenUsageByWorkflow()', () => {
    it('should aggregate tokens by category', () => {
      const usage = dashboard.getTokenUsageByWorkflow();
      expect(usage['planning']).toBeDefined();
      expect(usage['planning']!.total).toBe(1100); // 500 + 600
      expect(usage['planning']!.count).toBe(2);
      expect(usage['planning']!.avgPerJob).toBe(550);
    });

    it('should include all categories', () => {
      const usage = dashboard.getTokenUsageByWorkflow();
      expect(Object.keys(usage)).toContain('planning');
      expect(Object.keys(usage)).toContain('execution');
    });

    it('should compute correct averages', () => {
      const usage = dashboard.getTokenUsageByWorkflow();
      expect(usage['execution']!.total).toBe(1200);
      expect(usage['execution']!.count).toBe(1);
      expect(usage['execution']!.avgPerJob).toBe(1200);
    });
  });

  describe('getTimeSavedSummary()', () => {
    it('should compute total savings', () => {
      const summary = dashboard.getTimeSavedSummary();
      expect(summary.totalSavedMs).toBe(345000); // 255000 + 90000
    });

    it('should count plans', () => {
      const summary = dashboard.getTimeSavedSummary();
      expect(summary.planCount).toBe(2);
    });

    it('should compute average savings per plan', () => {
      const summary = dashboard.getTimeSavedSummary();
      expect(summary.avgSavedPerPlan).toBe(172500);
    });

    it('should track confidence distribution', () => {
      const summary = dashboard.getTimeSavedSummary();
      expect(summary.confidence['high']).toBe(1);
      expect(summary.confidence['medium']).toBe(1);
      expect(summary.confidence['low']).toBe(0);
    });

    it('should return zeros when no time-saved events exist', () => {
      const dash = new DashboardData([]);
      const summary = dash.getTimeSavedSummary();
      expect(summary.totalSavedMs).toBe(0);
      expect(summary.planCount).toBe(0);
      expect(summary.avgSavedPerPlan).toBe(0);
    });
  });

  describe('getLatencyStats()', () => {
    it('should return stats per operation', () => {
      const stats = dashboard.getLatencyStats();
      expect(stats['plan-generation']).toBeDefined();
      expect(stats['tool-execution']).toBeDefined();
    });

    it('should include percentile values', () => {
      const stats = dashboard.getLatencyStats();
      expect(stats['plan-generation']!.p50).toBe(200);
      expect(stats['plan-generation']!.p95).toBe(400);
      expect(stats['plan-generation']!.p99).toBe(600);
      expect(stats['plan-generation']!.sampleCount).toBe(100);
    });
  });

  describe('getPublishSuccessRate()', () => {
    it('should compute the overall success rate', () => {
      const rate = dashboard.getPublishSuccessRate();
      expect(rate.total).toBe(3);
      expect(rate.success).toBe(1);
      expect(rate.partial).toBe(1);
      expect(rate.failed).toBe(1);
      expect(rate.rate).toBeCloseTo(1 / 3, 4);
    });

    it('should return zero rate when no publish events exist', () => {
      const dash = new DashboardData([]);
      const rate = dash.getPublishSuccessRate();
      expect(rate.total).toBe(0);
      expect(rate.rate).toBe(0);
    });
  });
});

// ===========================================================================
// EventExporter tests
// ===========================================================================

describe('EventExporter', () => {
  let exporter: EventExporter;

  beforeEach(() => {
    exporter = new EventExporter();
  });

  describe('exportJSON()', () => {
    it('should return valid JSON', () => {
      const events = [makeEvent({ id: 'e1' }), makeEvent({ id: 'e2' })];
      const json = exporter.exportJSON(events);
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBe('e1');
    });

    it('should be pretty-printed', () => {
      const events = [makeEvent()];
      const json = exporter.exportJSON(events);
      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });

    it('should handle empty array', () => {
      const json = exporter.exportJSON([]);
      expect(JSON.parse(json)).toEqual([]);
    });
  });

  describe('exportCSV()', () => {
    it('should include a header row', () => {
      const csv = exporter.exportCSV([]);
      const headers = csv.split('\n')[0];
      expect(headers).toBe('id,type,sessionId,userId,timestamp,privacyLevel,projectId,sequenceId,payload');
    });

    it('should include one data row per event', () => {
      const events = [makeEvent({ id: 'e1' }), makeEvent({ id: 'e2' })];
      const csv = exporter.exportCSV(events);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(3); // header + 2 data rows
    });

    it('should escape commas in values', () => {
      const event = makeEvent({
        payload: { msg: 'hello, world' },
      });
      const csv = exporter.exportCSV([event]);
      // The payload column should be properly quoted
      expect(csv).toContain('"');
    });

    it('should JSON-encode the payload column', () => {
      const event = makeEvent({ payload: { key: 'value' } });
      const csv = exporter.exportCSV([event]);
      const lines = csv.split('\n');
      const dataRow = lines[1];
      // The last column should contain JSON
      expect(dataRow).toContain('key');
      expect(dataRow).toContain('value');
    });

    it('should handle missing optional fields', () => {
      const event = makeEvent({});
      const csv = exporter.exportCSV([event]);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(2);
    });
  });

  describe('exportForDashboard()', () => {
    it('should return an empty dashboard for no events', () => {
      const dash = exporter.exportForDashboard([]);
      expect(dash.totalEvents).toBe(0);
      expect(dash.period.start).toBe('');
      expect(dash.period.end).toBe('');
    });

    it('should include totalEvents count', () => {
      const events = buildSampleEvents();
      const dash = exporter.exportForDashboard(events);
      expect(dash.totalEvents).toBe(events.length);
    });

    it('should include eventsByType breakdown', () => {
      const events = buildSampleEvents();
      const dash = exporter.exportForDashboard(events);
      expect(dash.eventsByType['prompt']).toBe(3);
      expect(dash.eventsByType['step-failure']).toBe(3);
    });

    it('should compute the time period', () => {
      const events = buildSampleEvents();
      const dash = exporter.exportForDashboard(events);
      expect(dash.period.start).toBeTruthy();
      expect(dash.period.end).toBeTruthy();
      expect(dash.period.start <= dash.period.end).toBe(true);
    });

    it('should include topTools', () => {
      const events = buildSampleEvents();
      const dash = exporter.exportForDashboard(events);
      expect(dash.topTools.length).toBeGreaterThan(0);
    });

    it('should include topOverrides', () => {
      const events = buildSampleEvents();
      const dash = exporter.exportForDashboard(events);
      expect(dash.topOverrides.length).toBeGreaterThan(0);
    });

    it('should include failureClusters', () => {
      const events = buildSampleEvents();
      const dash = exporter.exportForDashboard(events);
      expect(dash.failureClusters.length).toBeGreaterThan(0);
    });

    it('should include tokenUsage', () => {
      const events = buildSampleEvents();
      const dash = exporter.exportForDashboard(events);
      expect(dash.tokenUsage.length).toBeGreaterThan(0);
    });

    it('should include timeSaved', () => {
      const events = buildSampleEvents();
      const dash = exporter.exportForDashboard(events);
      expect(dash.timeSaved.totalMs).toBeGreaterThan(0);
      expect(dash.timeSaved.planCount).toBe(2);
    });
  });
});
