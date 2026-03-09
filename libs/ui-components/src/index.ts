// @mcua/ui-components — Shared agentic editing UI components
// Phase 6: Desktop and Web UX for Agentic Editing
// v0.2.0

export const UI_COMPONENTS_VERSION = '0.2.0';

// ── Components ───────────────────────────────────────────────────────────────
export { PromptBar } from './PromptBar/PromptBar';
export type { PromptBarProps } from './PromptBar/PromptBar';

export { ContextPill } from './ContextPill/ContextPill';
export type { ContextPillProps, ContextPillType } from './ContextPill/ContextPill';

export { PlanPreview } from './PlanPreview/PlanPreview';
export type {
  PlanPreviewProps,
  PlanSummary,
  PlanStepSummary,
} from './PlanPreview/PlanPreview';

export { ResultsPanel } from './ResultsPanel/ResultsPanel';
export type {
  ResultsPanelProps,
  ResultItem,
} from './ResultsPanel/ResultsPanel';

export { PlaybookBuilder } from './PlaybookBuilder/PlaybookBuilder';
export type { PlaybookBuilderProps, PlaybookStep } from './PlaybookBuilder/PlaybookBuilder';

export { TokenBadge } from './TokenBadge/TokenBadge';
export type { TokenBadgeProps } from './TokenBadge/TokenBadge';

export { ExecutionHistory } from './ExecutionHistory/ExecutionHistory';
export type {
  ExecutionHistoryProps,
  HistoryEntry,
} from './ExecutionHistory/ExecutionHistory';
