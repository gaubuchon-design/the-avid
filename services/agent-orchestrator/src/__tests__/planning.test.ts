/**
 * @module planning.test
 * @description Tests for plan generation, template matching, and context assembly.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PlanGenerator } from '../planning/PlanGenerator';
import { ContextAssembler } from '../planning/ContextAssembler';
import { PLAN_TEMPLATES, matchTemplate, SYSTEM_PROMPT } from '../planning/PromptTemplates';
import type { AgentContext, ToolDefinition } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_CONTEXT: AgentContext = {
  projectId: 'proj-001',
  sequenceId: 'seq-001',
  binIds: ['bin-rushes', 'bin-selects'],
  selectedClipIds: ['c1', 'c2'],
  playheadTime: 12.5,
  searchQuery: 'interview',
  transcriptContext: 'The mayor said the project will complete by year end.',
};

const TEST_TOOLS: ToolDefinition[] = [
  {
    name: 'detect_scene_changes',
    description: 'Detect scene changes.',
    parameters: {
      clipId: { type: 'string', description: 'Clip to analyse.', required: true },
      sensitivity: { type: 'number', description: 'Sensitivity (0-1).' },
    },
    requiresConfirmation: false,
    tokenCost: 12,
    adapter: 'local-ai',
  },
  {
    name: 'suggest_cuts',
    description: 'Suggest cut points.',
    parameters: {
      clipId: { type: 'string', description: 'Clip to analyse.', required: true },
      style: { type: 'string', description: 'Editing style.', enum: ['narrative', 'action'] },
    },
    requiresConfirmation: false,
    tokenCost: 15,
    adapter: 'local-ai',
  },
  {
    name: 'remove_silence',
    description: 'Remove silence segments.',
    parameters: {
      trackId: { type: 'string', description: 'Track to process.', required: true },
      thresholdDb: { type: 'number', description: 'Threshold in dB.' },
    },
    requiresConfirmation: true,
    tokenCost: 12,
    adapter: 'pro-tools',
  },
];

// ---------------------------------------------------------------------------
// Template matching tests
// ---------------------------------------------------------------------------

describe('PromptTemplates', () => {
  it('should export at least 8 templates', () => {
    expect(PLAN_TEMPLATES.length).toBeGreaterThanOrEqual(8);
  });

  it('should have a non-empty SYSTEM_PROMPT', () => {
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('should match "remove all silence" to the remove-silence template', () => {
    const template = matchTemplate('remove all silence from the interview');
    expect(template).toBeDefined();
    expect(template!.id).toBe('remove-silence');
  });

  it('should match "rough cut" to the rough-cut template', () => {
    const template = matchTemplate('generate a rough cut from the rushes');
    expect(template).toBeDefined();
    expect(template!.id).toBe('rough-cut');
  });

  it('should match "color match" to the color-match template', () => {
    const template = matchTemplate('auto color match all clips');
    expect(template).toBeDefined();
    expect(template!.id).toBe('color-match');
  });

  it('should match "organize bins" to the organize-bins template', () => {
    const template = matchTemplate('organize bins by scene');
    expect(template).toBeDefined();
    expect(template!.id).toBe('organize-bins');
  });

  it('should match social export variants', () => {
    const variants = [
      'export for instagram',
      'publish to social media',
      'render for tiktok and youtube',
      'export for social',
    ];

    for (const intent of variants) {
      const template = matchTemplate(intent);
      expect(template).toBeDefined();
      expect(template!.id).toBe('social-export');
    }
  });

  it('should match caption versions', () => {
    const template = matchTemplate('create Spanish and French caption versions');
    expect(template).toBeDefined();
    expect(template!.id).toBe('caption-versions');
  });

  it('should match hero-shot teaser', () => {
    const template = matchTemplate('find every approved hero shot and build a 30-second teaser');
    expect(template).toBeDefined();
    expect(template!.id).toBe('hero-shot-teaser');
  });

  it('should match interview cleanup', () => {
    const template = matchTemplate('clean this interview and propose three temp music options');
    expect(template).toBeDefined();
    expect(template!.id).toBe('interview-cleanup');
  });

  it('should return undefined for unrecognised intents', () => {
    const template = matchTemplate('what is the meaning of life');
    expect(template).toBeUndefined();
  });

  it('should have valid steps in every template', () => {
    for (const template of PLAN_TEMPLATES) {
      expect(template.id).toBeTruthy();
      expect(template.name).toBeTruthy();
      expect(template.steps.length).toBeGreaterThan(0);
      expect(template.estimatedTokens).toBeGreaterThan(0);

      for (const step of template.steps) {
        expect(step.toolName).toBeTruthy();
        expect(step.description).toBeTruthy();
        expect(step.toolArgs).toBeDefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// ContextAssembler tests
// ---------------------------------------------------------------------------

describe('ContextAssembler', () => {
  let assembler: ContextAssembler;

  beforeEach(() => {
    assembler = new ContextAssembler();
  });

  describe('assemble()', () => {
    it('should include the project ID', () => {
      const result = assembler.assemble(TEST_CONTEXT);
      expect(result).toContain('Project: proj-001');
    });

    it('should include the sequence ID', () => {
      const result = assembler.assemble(TEST_CONTEXT);
      expect(result).toContain('Active sequence: seq-001');
    });

    it('should include bin IDs', () => {
      const result = assembler.assemble(TEST_CONTEXT);
      expect(result).toContain('bin-rushes');
      expect(result).toContain('bin-selects');
    });

    it('should include selected clip IDs', () => {
      const result = assembler.assemble(TEST_CONTEXT);
      expect(result).toContain('c1');
      expect(result).toContain('c2');
    });

    it('should include a formatted playhead position', () => {
      const result = assembler.assemble(TEST_CONTEXT);
      expect(result).toContain('Playhead position:');
      expect(result).toContain('00:00:12');
    });

    it('should include the search query', () => {
      const result = assembler.assemble(TEST_CONTEXT);
      expect(result).toContain('Active search: "interview"');
    });

    it('should include transcript context', () => {
      const result = assembler.assemble(TEST_CONTEXT);
      expect(result).toContain('Transcript context:');
      expect(result).toContain('mayor');
    });

    it('should handle minimal context', () => {
      const result = assembler.assemble({ projectId: 'minimal' });
      expect(result).toBe('Project: minimal');
    });
  });

  describe('assembleToolContext()', () => {
    it('should format tool definitions', () => {
      const result = assembler.assembleToolContext(TEST_TOOLS);
      expect(result).toContain('Available tools (3)');
      expect(result).toContain('detect_scene_changes');
      expect(result).toContain('suggest_cuts');
      expect(result).toContain('remove_silence');
    });

    it('should indicate required parameters', () => {
      const result = assembler.assembleToolContext(TEST_TOOLS);
      expect(result).toContain('(required)');
    });

    it('should handle empty tool list', () => {
      const result = assembler.assembleToolContext([]);
      expect(result).toBe('No tools available.');
    });
  });

  describe('estimateTokens()', () => {
    it('should estimate tokens from word count', () => {
      const text = 'one two three four five six seven eight nine ten';
      const estimate = assembler.estimateTokens(text);
      // 10 words / 0.75 = ~13.3, ceil = 14
      expect(estimate).toBe(14);
    });

    it('should return 0 for empty string', () => {
      expect(assembler.estimateTokens('')).toBe(0);
    });
  });

  describe('truncateToFit()', () => {
    it('should return the full text if under budget', () => {
      const text = 'short text';
      expect(assembler.truncateToFit(text, 100)).toBe(text);
    });

    it('should truncate text exceeding the budget', () => {
      const words = Array.from({ length: 200 }, (_, i) => `word${i}`);
      const text = words.join(' ');
      const result = assembler.truncateToFit(text, 10);
      expect(result).toContain('[...]');
      expect(result.split(' ').length).toBeLessThan(20);
    });

    it('should return empty string for empty input', () => {
      expect(assembler.truncateToFit('', 100)).toBe('');
    });
  });
});

// ---------------------------------------------------------------------------
// PlanGenerator tests (template fallback — no API key)
// ---------------------------------------------------------------------------

describe('PlanGenerator', () => {
  let generator: PlanGenerator;

  beforeEach(() => {
    // No API key → template fallback
    generator = new PlanGenerator({ apiKey: '' });
  });

  it('should generate a plan from a matching template', async () => {
    const plan = await generator.generatePlan(
      'remove all silence from the interview',
      TEST_CONTEXT,
      TEST_TOOLS,
    );

    expect(plan).toBeDefined();
    expect(plan.id).toBeTruthy();
    expect(plan.status).toBe('preview');
    expect(plan.intent).toBe('remove all silence from the interview');
    expect(plan.steps.length).toBeGreaterThan(0);

    // All steps should be pending
    for (const step of plan.steps) {
      expect(step.status).toBe('pending');
      expect(step.planId).toBe(plan.id);
      expect(step.toolName).toBeTruthy();
    }
  });

  it('should produce a generic fallback plan for unrecognised intents', async () => {
    const plan = await generator.generatePlan(
      'do something unexpected',
      TEST_CONTEXT,
      TEST_TOOLS,
    );

    expect(plan.steps.length).toBe(2);
    expect(plan.steps[0].toolName).toBe('detect_scene_changes');
    expect(plan.steps[1].toolName).toBe('suggest_cuts');
  });

  it('should assign sequential indices to steps', async () => {
    const plan = await generator.generatePlan(
      'generate a rough cut',
      TEST_CONTEXT,
      TEST_TOOLS,
    );

    plan.steps.forEach((step, i) => {
      expect(step.index).toBe(i);
    });
  });

  it('should set timestamps on the plan', async () => {
    const plan = await generator.generatePlan(
      'color match all clips',
      TEST_CONTEXT,
      TEST_TOOLS,
    );

    expect(plan.createdAt).toBeTruthy();
    expect(plan.updatedAt).toBeTruthy();
    expect(new Date(plan.createdAt).getTime()).toBeGreaterThan(0);
  });

  it('should include an approval policy', async () => {
    const plan = await generator.generatePlan(
      'organize bins by scene',
      TEST_CONTEXT,
      TEST_TOOLS,
    );

    expect(plan.approvalPolicy).toBeDefined();
    expect(plan.approvalPolicy.mode).toBe('manual');
  });

  it('should generate unique plan IDs', async () => {
    const plan1 = await generator.generatePlan('silence removal', TEST_CONTEXT, TEST_TOOLS);
    const plan2 = await generator.generatePlan('silence removal', TEST_CONTEXT, TEST_TOOLS);
    expect(plan1.id).not.toBe(plan2.id);
  });
});
