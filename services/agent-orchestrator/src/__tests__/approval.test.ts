/**
 * @module approval.test
 * @description Tests for approval policy rules, auto-approve logic, and
 * destructive operation blocking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ApprovalPolicyEngine } from '../approval/ApprovalPolicyEngine';
import { DEFAULT_RULES, type PolicyRule } from '../approval/PolicyRules';
import type { AgentPlan, AgentStep, ApprovalPolicy } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeStep(overrides: Partial<AgentStep> = {}): AgentStep {
  return {
    id: 'step-001',
    planId: 'plan-001',
    index: 0,
    description: 'Test step',
    toolName: 'detect_scene_changes',
    toolArgs: { clipId: 'c1', sensitivity: 0.5 },
    status: 'pending',
    ...overrides,
  };
}

function makePlan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    id: 'plan-001',
    intent: 'test intent',
    steps: [],
    status: 'preview',
    tokensEstimated: 50,
    tokensUsed: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    approvalPolicy: {
      mode: 'manual',
      allowedAutoTools: [],
      requireApprovalFor: ['extract', 'lift', 'split_clip', 'overwrite', 'ripple_trim'],
      maxAutoTokens: 100,
    },
    ...overrides,
  };
}

function makeAutoApprovePlan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return makePlan({
    approvalPolicy: {
      mode: 'auto-approve',
      allowedAutoTools: ['detect_scene_changes', 'suggest_cuts', 'analyze_audio', 'add_marker'],
      requireApprovalFor: ['extract', 'lift', 'split_clip', 'overwrite', 'ripple_trim'],
      maxAutoTokens: 100,
    },
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Default rules tests
// ---------------------------------------------------------------------------

describe('PolicyRules', () => {
  it('should export at least 5 default rules', () => {
    expect(DEFAULT_RULES.length).toBeGreaterThanOrEqual(5);
  });

  it('should have unique rule names', () => {
    const names = DEFAULT_RULES.map((r) => r.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('should have valid actions for all rules', () => {
    const validActions = ['approve', 'require-approval', 'block'];
    for (const rule of DEFAULT_RULES) {
      expect(validActions).toContain(rule.action);
      expect(rule.name).toBeTruthy();
      expect(rule.description).toBeTruthy();
      expect(rule.reason).toBeTruthy();
      expect(typeof rule.condition).toBe('function');
    }
  });

  describe('destructive-operations rule', () => {
    const rule = DEFAULT_RULES.find((r) => r.name === 'destructive-operations')!;

    it('should require approval for extract', () => {
      const step = makeStep({ toolName: 'extract' });
      expect(rule.condition(step)).toBe(true);
      expect(rule.action).toBe('require-approval');
    });

    it('should require approval for lift', () => {
      const step = makeStep({ toolName: 'lift' });
      expect(rule.condition(step)).toBe(true);
    });

    it('should require approval for split_clip', () => {
      const step = makeStep({ toolName: 'split_clip' });
      expect(rule.condition(step)).toBe(true);
    });

    it('should require approval for overwrite', () => {
      const step = makeStep({ toolName: 'overwrite' });
      expect(rule.condition(step)).toBe(true);
    });

    it('should require approval for ripple_trim', () => {
      const step = makeStep({ toolName: 'ripple_trim' });
      expect(rule.condition(step)).toBe(true);
    });

    it('should NOT require approval for detect_scene_changes', () => {
      const step = makeStep({ toolName: 'detect_scene_changes' });
      expect(rule.condition(step)).toBe(false);
    });
  });

  describe('search-operations rule', () => {
    const rule = DEFAULT_RULES.find((r) => r.name === 'search-operations')!;

    it('should auto-approve find_similar_clips', () => {
      const step = makeStep({ toolName: 'find_similar_clips' });
      expect(rule.condition(step)).toBe(true);
      expect(rule.action).toBe('approve');
    });

    it('should auto-approve suggest_cuts', () => {
      const step = makeStep({ toolName: 'suggest_cuts' });
      expect(rule.condition(step)).toBe(true);
    });

    it('should auto-approve detect_scene_changes', () => {
      const step = makeStep({ toolName: 'detect_scene_changes' });
      expect(rule.condition(step)).toBe(true);
    });
  });

  describe('audio-analysis rule', () => {
    const rule = DEFAULT_RULES.find((r) => r.name === 'audio-analysis')!;

    it('should auto-approve analyze_audio', () => {
      const step = makeStep({ toolName: 'analyze_audio' });
      expect(rule.condition(step)).toBe(true);
      expect(rule.action).toBe('approve');
    });

    it('should NOT auto-approve remove_silence', () => {
      const step = makeStep({ toolName: 'remove_silence' });
      expect(rule.condition(step)).toBe(false);
    });
  });

  describe('metadata-operations rule', () => {
    const rule = DEFAULT_RULES.find((r) => r.name === 'metadata-operations')!;

    it('should auto-approve add_marker', () => {
      const step = makeStep({ toolName: 'add_marker' });
      expect(rule.condition(step)).toBe(true);
      expect(rule.action).toBe('approve');
    });

    it('should auto-approve set_clip_metadata', () => {
      const step = makeStep({ toolName: 'set_clip_metadata' });
      expect(rule.condition(step)).toBe(true);
    });

    it('should auto-approve create_bin', () => {
      const step = makeStep({ toolName: 'create_bin' });
      expect(rule.condition(step)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// ApprovalPolicyEngine tests
// ---------------------------------------------------------------------------

describe('ApprovalPolicyEngine', () => {
  let engine: ApprovalPolicyEngine;

  beforeEach(() => {
    engine = new ApprovalPolicyEngine();
  });

  describe('getDefaultPolicy()', () => {
    it('should return a valid default policy', () => {
      const policy = engine.getDefaultPolicy();
      expect(policy.mode).toBe('manual');
      expect(policy.maxAutoTokens).toBeGreaterThan(0);
      expect(policy.requireApprovalFor.length).toBeGreaterThan(0);
      expect(policy.requireApprovalFor).toContain('extract');
    });
  });

  describe('validatePolicy()', () => {
    it('should accept a valid policy', () => {
      const result = engine.validatePolicy({
        mode: 'auto-approve',
        allowedAutoTools: ['detect_scene_changes'],
        requireApprovalFor: ['extract'],
        maxAutoTokens: 50,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid mode', () => {
      const result = engine.validatePolicy({
        mode: 'yolo' as any,
        allowedAutoTools: [],
        requireApprovalFor: [],
        maxAutoTokens: 50,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid approval mode');
    });

    it('should reject negative maxAutoTokens', () => {
      const result = engine.validatePolicy({
        mode: 'manual',
        allowedAutoTools: [],
        requireApprovalFor: [],
        maxAutoTokens: -10,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('non-negative');
    });

    it('should reject overlapping auto and require-approval lists', () => {
      const result = engine.validatePolicy({
        mode: 'auto-approve',
        allowedAutoTools: ['extract'],
        requireApprovalFor: ['extract'],
        maxAutoTokens: 50,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('extract');
    });
  });

  describe('shouldAutoApprove()', () => {
    it('should never auto-approve in manual mode', () => {
      const step = makeStep({ toolName: 'detect_scene_changes' });
      const plan = makePlan();
      expect(engine.shouldAutoApprove(step, plan)).toBe(false);
    });

    it('should never auto-approve in dry-run mode', () => {
      const step = makeStep({ toolName: 'detect_scene_changes' });
      const plan = makePlan({
        approvalPolicy: {
          mode: 'dry-run',
          allowedAutoTools: ['detect_scene_changes'],
          requireApprovalFor: [],
          maxAutoTokens: 100,
        },
      });
      expect(engine.shouldAutoApprove(step, plan)).toBe(false);
    });

    it('should auto-approve an allowed tool in auto-approve mode', () => {
      const step = makeStep({ toolName: 'detect_scene_changes' });
      const plan = makeAutoApprovePlan();
      expect(engine.shouldAutoApprove(step, plan)).toBe(true);
    });

    it('should NOT auto-approve a destructive tool even in auto-approve mode', () => {
      const step = makeStep({ toolName: 'extract' });
      const plan = makeAutoApprovePlan();
      expect(engine.shouldAutoApprove(step, plan)).toBe(false);
    });

    it('should NOT auto-approve when token budget is exceeded', () => {
      const step = makeStep({ toolName: 'detect_scene_changes' });
      const plan = makeAutoApprovePlan({ tokensUsed: 200 });
      expect(engine.shouldAutoApprove(step, plan)).toBe(false);
    });

    it('should auto-approve a rule-approved tool not on the explicit list', () => {
      // find_similar_clips is matched by the search-operations rule
      const step = makeStep({ toolName: 'find_similar_clips' });
      const plan = makeAutoApprovePlan();
      // find_similar_clips is not on allowedAutoTools, but the search-operations
      // rule approves it
      expect(engine.shouldAutoApprove(step, plan)).toBe(true);
    });
  });

  describe('requiresApproval()', () => {
    it('should require approval for destructive tools', () => {
      const step = makeStep({ toolName: 'extract' });
      expect(engine.requiresApproval(step)).toBe(true);
    });

    it('should NOT require approval for search tools', () => {
      const step = makeStep({ toolName: 'find_similar_clips' });
      expect(engine.requiresApproval(step)).toBe(false);
    });

    it('should NOT require approval for marker tools', () => {
      const step = makeStep({ toolName: 'add_marker' });
      expect(engine.requiresApproval(step)).toBe(false);
    });

    it('should require approval for unknown tools', () => {
      const step = makeStep({ toolName: 'some_new_tool' });
      expect(engine.requiresApproval(step)).toBe(true);
    });
  });

  describe('custom rules', () => {
    it('should support custom rules', () => {
      const customRule: PolicyRule = {
        name: 'block-all-audio',
        description: 'Block all audio tools for testing.',
        condition: (step) => step.toolName.startsWith('audio') || step.toolName === 'normalize_audio',
        action: 'block',
        reason: 'Audio tools are disabled.',
      };

      const customEngine = new ApprovalPolicyEngine(undefined, [customRule]);
      const step = makeStep({ toolName: 'normalize_audio' });
      expect(customEngine.requiresApproval(step)).toBe(true);
    });
  });
});
