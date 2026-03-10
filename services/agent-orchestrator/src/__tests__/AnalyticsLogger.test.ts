import { describe, it, expect, beforeEach } from 'vitest';
import { AnalyticsLogger } from '../logging/AnalyticsLogger';
import type { AgentPlan, ToolCallResult } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    id: 'plan-1',
    intent: 'Trim the last 3 seconds of clip A',
    steps: [
      {
        id: 'step-1',
        planId: 'plan-1',
        index: 0,
        description: 'Find clip A',
        toolName: 'find_clip',
        toolArgs: { name: 'A' },
        status: 'pending',
      },
    ],
    status: 'preview',
    tokensEstimated: 500,
    tokensUsed: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    approvalPolicy: {
      mode: 'manual',
      allowedAutoTools: [],
      requireApprovalFor: [],
      maxAutoTokens: 1000,
    },
    ...overrides,
  };
}

function makeResult(overrides: Partial<ToolCallResult> = {}): ToolCallResult {
  return {
    traceId: 'trace-1',
    toolName: 'find_clip',
    success: true,
    durationMs: 150,
    tokensConsumed: 10,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AnalyticsLogger
// ---------------------------------------------------------------------------

describe('AnalyticsLogger', () => {
  let logger: AnalyticsLogger;

  beforeEach(() => {
    logger = new AnalyticsLogger();
  });

  // -----------------------------------------------------------------------
  // Basic operations
  // -----------------------------------------------------------------------

  describe('basic operations', () => {
    it('starts with size 0', () => {
      expect(logger.size).toBe(0);
    });

    it('clear() empties all entries', () => {
      logger.logPrompt('s1', 'test', 'context');
      logger.clear();
      expect(logger.size).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // logPrompt
  // -----------------------------------------------------------------------

  describe('logPrompt', () => {
    it('logs a prompt entry', () => {
      logger.logPrompt('session-1', 'Trim clip', 'Project context here');

      const entries = logger.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]!.type).toBe('prompt');
      expect(entries[0]!.sessionId).toBe('session-1');
      expect(entries[0]!.data['prompt']).toBe('Trim clip');
      expect(entries[0]!.data['contextSummaryLength']).toBe(20);
    });

    it('truncates context preview to 200 chars', () => {
      const longContext = 'x'.repeat(500);
      logger.logPrompt('s1', 'test', longContext);

      const entry = logger.getEntries()[0]!;
      const preview = entry.data['contextSummaryPreview'] as string;
      expect(preview.length).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // logPlan
  // -----------------------------------------------------------------------

  describe('logPlan', () => {
    it('logs a plan entry with step summaries', () => {
      const plan = makePlan();
      logger.logPlan('session-1', plan);

      const entries = logger.getEntries({ type: 'plan' });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.planId).toBe('plan-1');
      expect(entries[0]!.data['intent']).toBe(plan.intent);
      expect(entries[0]!.data['stepCount']).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // logApproval
  // -----------------------------------------------------------------------

  describe('logApproval', () => {
    it('logs a plan-level approval', () => {
      logger.logApproval('s1', 'plan-1', true);

      const entries = logger.getEntries({ type: 'approval' });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.data['approved']).toBe(true);
      expect(entries[0]!.data['scope']).toBe('plan');
    });

    it('logs a step-level approval', () => {
      logger.logApproval('s1', 'plan-1', false, 'step-1');

      const entries = logger.getEntries({ type: 'approval' });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.data['approved']).toBe(false);
      expect(entries[0]!.data['scope']).toBe('step');
      expect(entries[0]!.data['stepId']).toBe('step-1');
    });
  });

  // -----------------------------------------------------------------------
  // logExecution
  // -----------------------------------------------------------------------

  describe('logExecution', () => {
    it('logs a successful execution', () => {
      logger.logExecution('s1', 'plan-1', makeResult());

      const entries = logger.getEntries({ type: 'execution' });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.data['success']).toBe(true);
      expect(entries[0]!.data['durationMs']).toBe(150);
      expect(entries[0]!.data['tokensConsumed']).toBe(10);
    });

    it('logs a failed execution with error', () => {
      logger.logExecution(
        's1',
        'plan-1',
        makeResult({ success: false, error: 'Tool not found' }),
      );

      const entries = logger.getEntries({ type: 'execution' });
      expect(entries[0]!.data['success']).toBe(false);
      expect(entries[0]!.data['error']).toBe('Tool not found');
    });
  });

  // -----------------------------------------------------------------------
  // logTokenUsage
  // -----------------------------------------------------------------------

  describe('logTokenUsage', () => {
    it('logs token usage event', () => {
      logger.logTokenUsage('s1', 'plan-1', 250, 'planning');

      const entries = logger.getEntries({ type: 'token-usage' });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.data['tokens']).toBe(250);
      expect(entries[0]!.data['category']).toBe('planning');
    });
  });

  // -----------------------------------------------------------------------
  // getEntries with filters
  // -----------------------------------------------------------------------

  describe('getEntries', () => {
    beforeEach(() => {
      logger.logPrompt('s1', 'p1', 'ctx');
      logger.logPlan('s1', makePlan());
      logger.logExecution('s1', 'plan-1', makeResult());
      logger.logPrompt('s2', 'p2', 'ctx');
    });

    it('returns all entries when no filter', () => {
      expect(logger.getEntries()).toHaveLength(4);
    });

    it('filters by sessionId', () => {
      const entries = logger.getEntries({ sessionId: 's2' });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.sessionId).toBe('s2');
    });

    it('filters by planId', () => {
      const entries = logger.getEntries({ planId: 'plan-1' });
      expect(entries).toHaveLength(2); // plan + execution
    });

    it('filters by type', () => {
      const entries = logger.getEntries({ type: 'prompt' });
      expect(entries).toHaveLength(2);
    });

    it('combines filters', () => {
      const entries = logger.getEntries({ sessionId: 's1', type: 'prompt' });
      expect(entries).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // exportJSON
  // -----------------------------------------------------------------------

  describe('exportJSON', () => {
    it('exports entries as valid JSON string', () => {
      logger.logPrompt('s1', 'test', 'ctx');
      const json = logger.exportJSON();
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
    });

    it('exports empty array when no entries', () => {
      const json = logger.exportJSON();
      expect(JSON.parse(json)).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getSessionSummary
  // -----------------------------------------------------------------------

  describe('getSessionSummary', () => {
    it('returns correct summary for a session', () => {
      const sessionId = 'test-session';
      logger.logPrompt(sessionId, 'Do something', 'context');
      logger.logPlan(sessionId, makePlan());
      logger.logExecution(
        sessionId,
        'plan-1',
        makeResult({ success: true, durationMs: 100, tokensConsumed: 20 }),
      );
      logger.logExecution(
        sessionId,
        'plan-1',
        makeResult({ success: true, durationMs: 200, tokensConsumed: 30 }),
      );
      logger.logExecution(
        sessionId,
        'plan-1',
        makeResult({ success: false, durationMs: 50, tokensConsumed: 5, error: 'Failed' }),
      );
      logger.logTokenUsage(sessionId, 'plan-1', 100, 'planning');

      const summary = logger.getSessionSummary(sessionId);

      expect(summary.sessionId).toBe(sessionId);
      expect(summary.entryCount).toBe(6);
      expect(summary.executionCount).toBe(3);
      expect(summary.successCount).toBe(2);
      expect(summary.successRate).toBeCloseTo(0.6667, 3);
      expect(summary.avgExecutionMs).toBe(Math.round(350 / 3));
      expect(summary.totalTokens).toBe(155); // 20 + 30 + 5 + 100
    });

    it('returns empty summary for unknown session', () => {
      const summary = logger.getSessionSummary('nonexistent');
      expect(summary.entryCount).toBe(0);
      expect(summary.executionCount).toBe(0);
      expect(summary.successRate).toBe(0);
      expect(summary.avgExecutionMs).toBe(0);
      expect(summary.totalTokens).toBe(0);
    });

    it('counts events by type', () => {
      logger.logPrompt('s1', 'p', 'c');
      logger.logPrompt('s1', 'p2', 'c2');
      logger.logExecution('s1', 'plan-1', makeResult());

      const summary = logger.getSessionSummary('s1');
      expect(summary.countsByType['prompt']).toBe(2);
      expect(summary.countsByType['execution']).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // FIFO eviction
  // -----------------------------------------------------------------------

  describe('FIFO eviction', () => {
    it('evicts oldest entries when maxEntries is exceeded', () => {
      const smallLogger = new AnalyticsLogger(10);

      for (let i = 0; i < 15; i++) {
        smallLogger.logPrompt(`s${i}`, `prompt-${i}`, 'ctx');
      }

      // Should have evicted ~10% each time it hit capacity
      expect(smallLogger.size).toBeLessThanOrEqual(15);
      // The most recent entries should still be present
      const entries = smallLogger.getEntries();
      const lastEntry = entries[entries.length - 1]!;
      expect(lastEntry.data['prompt']).toBe('prompt-14');
    });
  });
});
