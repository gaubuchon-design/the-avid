/**
 * @module tool-routing.test
 * @description Tests for tool registration, routing, logging, and compensation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolCallRouter, type ToolHandler } from '../execution/ToolCallRouter';
import { ToolCallLogger } from '../execution/ToolCallLogger';
import { CompensationManager } from '../execution/CompensationManager';
import { ContextCache } from '../caching/ContextCache';
import { AnalyticsLogger } from '../logging/AnalyticsLogger';
import type { AgentPlan, ToolCallResult } from '../types';

// ---------------------------------------------------------------------------
// ToolCallRouter tests
// ---------------------------------------------------------------------------

describe('ToolCallRouter', () => {
  let router: ToolCallRouter;

  beforeEach(() => {
    router = new ToolCallRouter();
  });

  describe('getRegisteredTools()', () => {
    it('should return all 24 tools with default mock handlers', () => {
      const tools = router.getRegisteredTools();
      expect(tools.length).toBe(24);
    });

    it('should include core editing tools', () => {
      const tools = router.getRegisteredTools();
      expect(tools).toContain('splice_in');
      expect(tools).toContain('overwrite');
      expect(tools).toContain('lift');
      expect(tools).toContain('extract');
      expect(tools).toContain('split_clip');
    });

    it('should include audio tools', () => {
      const tools = router.getRegisteredTools();
      expect(tools).toContain('analyze_audio');
      expect(tools).toContain('remove_silence');
      expect(tools).toContain('normalize_audio');
    });

    it('should include AI analysis tools', () => {
      const tools = router.getRegisteredTools();
      expect(tools).toContain('suggest_cuts');
      expect(tools).toContain('detect_scene_changes');
      expect(tools).toContain('generate_captions');
      expect(tools).toContain('auto_reframe');
    });

    it('should return tools in sorted order', () => {
      const tools = router.getRegisteredTools();
      const sorted = [...tools].sort();
      expect(tools).toEqual(sorted);
    });
  });

  describe('route()', () => {
    it('should route a known tool to its mock handler', async () => {
      const result = await router.route('detect_scene_changes', {
        clipId: 'c1',
        sensitivity: 0.5,
      });

      expect(result.success).toBe(true);
      expect(result.toolName).toBe('detect_scene_changes');
      expect(result.traceId).toBeTruthy();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.tokensConsumed).toBeGreaterThan(0);
      expect(result.result).toBeDefined();
    });

    it('should return an error for an unknown tool', async () => {
      const result = await router.route('nonexistent_tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('No adapter mapping found');
    });

    it('should produce unique trace IDs', async () => {
      const r1 = await router.route('splice_in', { trackId: 't1', clipId: 'c1', frame: 0 });
      const r2 = await router.route('splice_in', { trackId: 't1', clipId: 'c1', frame: 0 });
      expect(r1.traceId).not.toBe(r2.traceId);
    });
  });

  describe('registerAdapter()', () => {
    it('should allow registering a custom handler', async () => {
      const customHandler: ToolHandler = async (toolName, args) => {
        return { custom: true, tool: toolName, processed: Object.keys(args) };
      };

      router.registerAdapter('local-ai', customHandler);

      const result = await router.route('suggest_cuts', { clipId: 'c1', style: 'narrative' });

      expect(result.success).toBe(true);
      expect((result.result as any).custom).toBe(true);
    });

    it('should handle handler errors gracefully', async () => {
      const failingHandler: ToolHandler = async () => {
        throw new Error('Adapter connection failed');
      };

      router.registerAdapter('media-composer', failingHandler);

      const result = await router.route('splice_in', { trackId: 't1', clipId: 'c1', frame: 0 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Adapter connection failed');
    });
  });
});

// ---------------------------------------------------------------------------
// ToolCallLogger tests
// ---------------------------------------------------------------------------

describe('ToolCallLogger', () => {
  let logger: ToolCallLogger;

  beforeEach(() => {
    logger = new ToolCallLogger();
  });

  describe('logToolCall()', () => {
    it('should log a successful tool call', () => {
      logger.logToolCall({
        traceId: 'trace-001',
        planId: 'plan-001',
        stepId: 'step-001',
        toolName: 'detect_scene_changes',
        durationMs: 42,
        success: true,
      });

      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]!.type).toBe('tool-complete');
      expect(logs[0]!.toolName).toBe('detect_scene_changes');
      expect(logs[0]!.success).toBe(true);
    });

    it('should log a failed tool call', () => {
      logger.logToolCall({
        traceId: 'trace-002',
        planId: 'plan-001',
        stepId: 'step-002',
        toolName: 'extract',
        durationMs: 5,
        success: false,
        error: 'Clip not found',
      });

      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]!.type).toBe('tool-error');
      expect(logs[0]!.error).toBe('Clip not found');
    });
  });

  describe('logPlanEvent()', () => {
    it('should log plan lifecycle events', () => {
      logger.logPlanEvent({ type: 'plan-created', planId: 'plan-001' });
      logger.logPlanEvent({ type: 'plan-approved', planId: 'plan-001' });
      logger.logPlanEvent({ type: 'plan-completed', planId: 'plan-001' });

      const logs = logger.getLogsForPlan('plan-001');
      expect(logs).toHaveLength(3);
      expect(logs.map((l) => l.type)).toEqual([
        'plan-created',
        'plan-approved',
        'plan-completed',
      ]);
    });
  });

  describe('getRecentLogs()', () => {
    it('should return logs in reverse chronological order', () => {
      logger.logPlanEvent({ type: 'plan-created', planId: 'p1' });
      logger.logPlanEvent({ type: 'plan-approved', planId: 'p1' });

      const logs = logger.getRecentLogs();
      expect(logs[0]!.type).toBe('plan-approved');
      expect(logs[1]!.type).toBe('plan-created');
    });

    it('should respect the limit parameter', () => {
      for (let i = 0; i < 50; i++) {
        logger.logPlanEvent({ type: 'plan-created', planId: `p${i}` });
      }

      expect(logger.getRecentLogs(10)).toHaveLength(10);
      expect(logger.getRecentLogs(100)).toHaveLength(50);
    });
  });

  describe('getLogsForPlan()', () => {
    it('should filter by plan ID', () => {
      logger.logPlanEvent({ type: 'plan-created', planId: 'p1' });
      logger.logPlanEvent({ type: 'plan-created', planId: 'p2' });
      logger.logToolCall({
        traceId: 't1',
        planId: 'p1',
        stepId: 's1',
        toolName: 'test',
        durationMs: 10,
        success: true,
      });

      const p1Logs = logger.getLogsForPlan('p1');
      expect(p1Logs).toHaveLength(2);
      expect(p1Logs.every((l) => l.planId === 'p1')).toBe(true);
    });
  });

  describe('eviction', () => {
    it('should evict oldest entries when max is reached', () => {
      const smallLogger = new ToolCallLogger(10);

      for (let i = 0; i < 20; i++) {
        smallLogger.logPlanEvent({ type: 'plan-created', planId: `p${i}` });
      }

      expect(smallLogger.size).toBeLessThanOrEqual(20);
    });
  });
});

// ---------------------------------------------------------------------------
// CompensationManager tests
// ---------------------------------------------------------------------------

describe('CompensationManager', () => {
  let manager: CompensationManager;

  beforeEach(() => {
    manager = new CompensationManager();
  });

  describe('registerCompensation()', () => {
    it('should register a compensation action', () => {
      manager.registerCompensation(
        'step-001',
        async () => {},
        'Undo extract clip c1',
        'plan-001',
      );

      expect(manager.hasCompensation('step-001')).toBe(true);
    });
  });

  describe('compensateStep()', () => {
    it('should execute the compensation function', async () => {
      const compensate = vi.fn().mockResolvedValue(undefined);

      manager.registerCompensation('step-001', compensate, 'Undo', 'plan-001');

      const success = await manager.compensateStep('step-001');
      expect(success).toBe(true);
      expect(compensate).toHaveBeenCalledOnce();
    });

    it('should return false for unregistered steps', async () => {
      const success = await manager.compensateStep('nonexistent');
      expect(success).toBe(false);
    });

    it('should handle compensation function errors', async () => {
      manager.registerCompensation(
        'step-001',
        async () => {
          throw new Error('Undo failed');
        },
        'Undo',
        'plan-001',
      );

      const success = await manager.compensateStep('step-001');
      expect(success).toBe(false);
    });

    it('should not re-execute an already-compensated step', async () => {
      const compensate = vi.fn().mockResolvedValue(undefined);
      manager.registerCompensation('step-001', compensate, 'Undo', 'plan-001');

      await manager.compensateStep('step-001');
      await manager.compensateStep('step-001');

      expect(compensate).toHaveBeenCalledOnce();
    });
  });

  describe('compensatePlan()', () => {
    it('should compensate all executed steps in reverse order', async () => {
      const order: string[] = [];

      manager.registerCompensation(
        's1',
        async () => { order.push('s1'); },
        'Undo s1',
        'p1',
      );
      manager.registerCompensation(
        's2',
        async () => { order.push('s2'); },
        'Undo s2',
        'p1',
      );
      manager.registerCompensation(
        's3',
        async () => { order.push('s3'); },
        'Undo s3',
        'p1',
      );

      const steps = [
        { id: 's1', status: 'completed' },
        { id: 's2', status: 'completed' },
        { id: 's3', status: 'completed' },
      ];

      const result = await manager.compensatePlan('p1', steps);

      expect(result.compensated).toBe(3);
      expect(result.failed).toBe(0);
      // Reverse order (LIFO)
      expect(order).toEqual(['s3', 's2', 's1']);
    });

    it('should only compensate completed or failed steps', async () => {
      const compensate = vi.fn().mockResolvedValue(undefined);

      manager.registerCompensation('s1', compensate, 'Undo', 'p1');
      manager.registerCompensation('s2', compensate, 'Undo', 'p1');

      const steps = [
        { id: 's1', status: 'completed' },
        { id: 's2', status: 'pending' }, // Should be skipped
      ];

      const result = await manager.compensatePlan('p1', steps);
      expect(result.compensated).toBe(1);
    });

    it('should report failures', async () => {
      manager.registerCompensation(
        's1',
        async () => { throw new Error('fail'); },
        'Undo s1',
        'p1',
      );
      manager.registerCompensation(
        's2',
        async () => {},
        'Undo s2',
        'p1',
      );

      const steps = [
        { id: 's1', status: 'completed' },
        { id: 's2', status: 'completed' },
      ];

      const result = await manager.compensatePlan('p1', steps);
      expect(result.compensated).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  describe('getCompensations()', () => {
    it('should return compensation entries for a plan', () => {
      manager.registerCompensation('s1', async () => {}, 'Undo s1', 'p1');
      manager.registerCompensation('s2', async () => {}, 'Undo s2', 'p1');
      manager.registerCompensation('s3', async () => {}, 'Undo s3', 'p2');

      const comps = manager.getCompensations('p1');
      expect(comps).toHaveLength(2);
      expect(comps.every((c) => c.planId === 'p1')).toBe(true);
    });

    it('should not expose the internal compensation function', () => {
      manager.registerCompensation('s1', async () => {}, 'Undo', 'p1');

      const comps = manager.getCompensations('p1');
      expect(comps[0]).not.toHaveProperty('compensate');
    });
  });
});

// ---------------------------------------------------------------------------
// ContextCache tests
// ---------------------------------------------------------------------------

describe('ContextCache', () => {
  let cache: ContextCache;

  beforeEach(() => {
    cache = new ContextCache();
  });

  it('should store and retrieve values', () => {
    cache.set('key1', { data: 'value1' });
    expect(cache.get<{ data: string }>('key1')).toEqual({ data: 'value1' });
  });

  it('should return undefined for missing keys', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('should respect TTL', async () => {
    cache.set('short-lived', 'data', 50); // 50ms TTL
    expect(cache.has('short-lived')).toBe(true);

    await new Promise((r) => setTimeout(r, 60));
    expect(cache.has('short-lived')).toBe(false);
    expect(cache.get('short-lived')).toBeUndefined();
  });

  it('should invalidate specific keys', () => {
    cache.set('key1', 'data1');
    cache.set('key2', 'data2');

    cache.invalidate('key1');
    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(true);
  });

  it('should clear all entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();

    expect(cache.getStats().size).toBe(0);
    expect(cache.getStats().hits).toBe(0);
    expect(cache.getStats().misses).toBe(0);
  });

  it('should track hits and misses', () => {
    cache.set('key', 'value');
    cache.get('key');       // hit
    cache.get('key');       // hit
    cache.get('missing');   // miss

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// AnalyticsLogger tests
// ---------------------------------------------------------------------------

describe('AnalyticsLogger', () => {
  let analytics: AnalyticsLogger;

  beforeEach(() => {
    analytics = new AnalyticsLogger();
  });

  it('should log prompts', () => {
    analytics.logPrompt('session-1', 'remove silence', 'Project: test');

    const entries = analytics.getEntries({ type: 'prompt' });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.data['prompt']).toBe('remove silence');
  });

  it('should log plans', () => {
    const plan: AgentPlan = {
      id: 'plan-001',
      intent: 'test',
      steps: [],
      status: 'preview',
      tokensEstimated: 50,
      tokensUsed: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      approvalPolicy: { mode: 'manual', allowedAutoTools: [], requireApprovalFor: [], maxAutoTokens: 100 },
    };

    analytics.logPlan('session-1', plan);
    const entries = analytics.getEntries({ type: 'plan' });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.planId).toBe('plan-001');
  });

  it('should log approvals', () => {
    analytics.logApproval('session-1', 'plan-001', true);
    analytics.logApproval('session-1', 'plan-001', false, 'step-002');

    const entries = analytics.getEntries({ type: 'approval' });
    expect(entries).toHaveLength(2);
    expect((entries[0]!.data as any).approved).toBe(true);
    expect((entries[1]!.data as any).approved).toBe(false);
    expect((entries[1]!.data as any).stepId).toBe('step-002');
  });

  it('should log executions', () => {
    const result: ToolCallResult = {
      traceId: 'trace-001',
      toolName: 'detect_scene_changes',
      success: true,
      durationMs: 42,
      tokensConsumed: 12,
    };

    analytics.logExecution('session-1', 'plan-001', result);
    const entries = analytics.getEntries({ type: 'execution' });
    expect(entries).toHaveLength(1);
    expect((entries[0]!.data as any).toolName).toBe('detect_scene_changes');
  });

  it('should log token usage', () => {
    analytics.logTokenUsage('session-1', 'plan-001', 42, 'planning');
    const entries = analytics.getEntries({ type: 'token-usage' });
    expect(entries).toHaveLength(1);
    expect((entries[0]!.data as any).tokens).toBe(42);
    expect((entries[0]!.data as any).category).toBe('planning');
  });

  it('should filter entries by session, plan, and type', () => {
    analytics.logPrompt('s1', 'prompt1', 'ctx');
    analytics.logPrompt('s2', 'prompt2', 'ctx');
    analytics.logApproval('s1', 'p1', true);

    expect(analytics.getEntries({ sessionId: 's1' })).toHaveLength(2);
    expect(analytics.getEntries({ sessionId: 's2' })).toHaveLength(1);
    expect(analytics.getEntries({ planId: 'p1' })).toHaveLength(1);
    expect(analytics.getEntries({ type: 'prompt' })).toHaveLength(2);
  });

  it('should export as JSON', () => {
    analytics.logPrompt('s1', 'test', 'ctx');
    const json = analytics.exportJSON();
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
  });
});
