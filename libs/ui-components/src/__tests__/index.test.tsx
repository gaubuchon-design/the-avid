import React from 'react';
import { describe, expect, it } from 'vitest';

import {
  ContextPill,
  ExecutionHistory,
  PlanPreview,
  PlaybookBuilder,
  PromptBar,
  ResultsPanel,
  TokenBadge,
  UI_COMPONENTS_VERSION,
} from '../index';

describe('@mcua/ui-components barrel', () => {
  it('exports a stable public surface', () => {
    expect(UI_COMPONENTS_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(PromptBar).toBeDefined();
    expect(ContextPill).toBeDefined();
    expect(PlanPreview).toBeDefined();
    expect(ResultsPanel).toBeDefined();
    expect(PlaybookBuilder).toBeDefined();
    expect(TokenBadge).toBeDefined();
    expect(ExecutionHistory).toBeDefined();
  });

  it('can build representative React elements from the barrel', () => {
    const contextPill = React.createElement(ContextPill, {
      type: 'project',
      label: 'Daily Rundown',
    });
    const tokenBadge = React.createElement(TokenBadge, {
      estimatedTokens: 1200,
      currentBalance: 3600,
      category: 'Transcribe',
    });

    expect(contextPill.type).toBe(ContextPill);
    expect(tokenBadge.type).toBe(TokenBadge);
  });
});
