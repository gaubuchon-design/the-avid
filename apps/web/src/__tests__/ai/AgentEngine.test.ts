import { describe, expect, it } from 'vitest';

import { AgentEngine } from '../../ai/AgentEngine';

describe('AgentEngine', () => {
  it('prefers built-in VFX intent templates before generic fallback planning', async () => {
    const engine = new AgentEngine();

    const plan = await engine.executeUserIntent('Remove the boom mic from the selected shot.');

    expect(plan.status).toBe('preview');
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps[0]?.toolName).toBe('ai_rotoscope');
    expect(plan.steps[1]?.toolName).toBe('ai_object_removal');
  });
});
