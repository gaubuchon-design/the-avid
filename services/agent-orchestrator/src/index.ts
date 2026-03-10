/**
 * @module @mcua/agent-orchestrator
 * @description Gemini Agent Orchestrator — plan-preview-approve-execute pipeline
 * for safe, observable AI tool calling in a professional video editing environment.
 *
 * ## Architecture
 *
 * ```
 *  User Intent
 *       |
 *  PlanGenerator  (Gemini API or template fallback)
 *       |
 *  AgentPlan [preview]
 *       |
 *  ApprovalPolicyEngine  (manual / auto-approve / dry-run)
 *       |
 *  ToolCallRouter  (adapters: media-composer, pro-tools, local-ai, ...)
 *       |
 *  CompensationManager  (undo tracking)
 *       |
 *  AnalyticsLogger  (observability)
 * ```
 */

// ---------------------------------------------------------------------------
// Service metadata
// ---------------------------------------------------------------------------

export const SERVICE_NAME = 'agent-orchestrator';
export const SERVICE_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  PlanStatus,
  StepStatus,
  ExecutionMode,
  ApprovalMode,
  AgentPlan,
  AgentStep,
  ApprovalPolicy,
  AgentContext,
  ToolDefinition,
  ToolParameter,
  ToolCallResult,
  OrchestratorConfig,
} from './types';

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

export { PlanGenerator } from './planning/PlanGenerator';
export type { PlanGeneratorOptions } from './planning/PlanGenerator';

export { ContextAssembler } from './planning/ContextAssembler';

export {
  SYSTEM_PROMPT,
  PLAN_TEMPLATES,
  matchTemplate,
} from './planning/PromptTemplates';
export type { PlanTemplate, PlanTemplateStep } from './planning/PromptTemplates';

// ---------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------

export { ApprovalPolicyEngine } from './approval/ApprovalPolicyEngine';

export { DEFAULT_RULES } from './approval/PolicyRules';
export type { PolicyRule } from './approval/PolicyRules';

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export { ToolCallRouter } from './execution/ToolCallRouter';
export type { ToolHandler } from './execution/ToolCallRouter';

export { ToolCallLogger } from './execution/ToolCallLogger';
export type {
  LogEntry,
  LogEventType,
  ToolCallTrace,
  PlanLogEvent,
} from './execution/ToolCallLogger';

export { CompensationManager } from './execution/CompensationManager';
export type { CompensationEntry } from './execution/CompensationManager';

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------

export { ContextCache } from './caching/ContextCache';
export type { CacheStats } from './caching/ContextCache';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export { AnalyticsLogger } from './logging/AnalyticsLogger';
export type {
  AnalyticsEntry,
  AnalyticsEventType,
  AnalyticsFilter,
  SessionSummary,
} from './logging/AnalyticsLogger';

// ---------------------------------------------------------------------------
// Wallet & Monetisation (Phase 9)
// ---------------------------------------------------------------------------

export {
  TokenWallet,
  JobQuoter,
  MeteringService,
  EntitlementChecker,
  AdminView,
  CATEGORY_DEFINITIONS,
  getAllCategories,
  getCategoryDefinition,
  isTierSufficient,
  getDefaultPricingMap,
} from './wallet';

export type {
  WalletTier,
  TransactionType,
  WalletState,
  Transaction,
  TokenCategory,
  CategoryDefinition,
  QuoteParams,
  JobQuote,
  JobStatus,
  ActiveJob,
  CompletedJob,
  CategoryUsageStats,
  UsageSummary,
  FeatureType,
  Feature,
  WalletSummary,
  UsageReport,
  CategoryUsage,
  AuditEntry,
} from './wallet';

// ---------------------------------------------------------------------------
// Analytics Feedback Loop (Phase 10)
// ---------------------------------------------------------------------------

export { createEvent } from './analytics/EventSchema';
export type {
  AnalyticsEventType as AnalyticsEventTypeV2,
  PrivacyLevel,
  AnalyticsEvent,
  PromptPayload,
  PlanPayload,
  FailurePayload,
  OverridePayload,
  MissingEndpointPayload,
  ManualFixPayload,
  TimeSavedPayload,
  PublishOutcomePayload,
  TokenConsumedPayload,
  LatencyReportPayload,
  CreateEventOptions,
} from './analytics/EventSchema';

export { PrivacyFilter } from './analytics/PrivacyFilter';

export { EventQueue } from './analytics/EventQueue';
export type {
  EventQueueOptions,
  FlushResult,
} from './analytics/EventQueue';

export { EventExporter } from './analytics/EventExporter';
export type { DashboardExport } from './analytics/EventExporter';

export { DashboardData } from './analytics/DashboardData';
export type {
  AutomationPattern,
  OverrideEntry,
  MissingEndpointEntry,
  FailureClusterEntry,
  TokenUsageStats,
  TimeSavedSummary,
  LatencyStats,
  PublishSuccessRate,
} from './analytics/DashboardData';

// ---------------------------------------------------------------------------
// Orchestrator Service
// ---------------------------------------------------------------------------

export { OrchestratorService } from './OrchestratorService';
export type { PlanUpdateSubscriber } from './OrchestratorService';

// ---------------------------------------------------------------------------
// Exemplar Workflows (Phase 11)
// ---------------------------------------------------------------------------

export {
  WORKFLOW_REGISTRY,
  getWorkflow,
  listWorkflows,
  WorkflowRunner,
  SEED_DATASETS,
  CREATOR_SOCIAL_FAST_PATH,
  SPORTS_LIVE_PULL,
  MULTILINGUAL_LOCALIZATION,
  AUDIO_CLEANUP_TEMP_MUSIC,
  CONTEXTUAL_ARCHIVE_EDIT,
  GENERATIVE_MOTION_CLEANUP,
} from './workflows';

export type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowResult,
  WorkflowOutput,
  SeedData,
  SeedAsset,
  SeedBin,
  SeedTranscriptSegment,
  LatencyReport,
  TokenReport,
  WorkflowRunnerOptions,
} from './workflows';
