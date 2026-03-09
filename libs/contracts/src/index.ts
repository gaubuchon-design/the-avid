/**
 * @mcua/contracts
 *
 * Shared TypeScript contracts for the Media Composer agentic editing
 * platform. All types are serialisable (no class instances, no functions,
 * ISO 8601 strings for timestamps) and designed for use across the web
 * app, desktop app, API server, and mesh network nodes.
 *
 * @packageDocumentation
 */

// ─── Project Assets & Knowledge DB ────────────────────────────────────────────
export type {
  ApprovalStatus,
  KnowledgeAsset,
  KnowledgeBin,
  KnowledgeSequence,
  MediaRef,
  MediaType,
  RightsInfo,
} from './project-assets';

// ─── Transcripts ──────────────────────────────────────────────────────────────
export type {
  Language,
  Speaker,
  TranscriptFormat,
  TranscriptSegment,
  Word,
} from './transcripts';

// ─── Embeddings ───────────────────────────────────────────────────────────────
export type {
  ANNIndexMeta,
  EmbeddingBackend,
  EmbeddingChunk,
  EmbeddingModel,
} from './embeddings';

// ─── Tool Traces ──────────────────────────────────────────────────────────────
export type {
  CompensationRecord,
  ToolInvocation,
  ToolTrace,
  TraceStatus,
} from './tool-traces';

// ─── Publish Variants ─────────────────────────────────────────────────────────
export type {
  DeliverySpec,
  PublishPlatform,
  PublishStatus,
  PublishVariant,
} from './publish-variants';

// ─── Token Metering ───────────────────────────────────────────────────────────
export type {
  Entitlement,
  JobQuote,
  MeteringRecord,
  TokenCategory,
  TokenWallet,
} from './token-metering';

// ─── Analytics Events ─────────────────────────────────────────────────────────
export type {
  AnalyticsEvent,
  EventType,
  FailureEvent,
  LatencyReport,
  PlanEvent,
  PrivacyLevel,
  PromptEvent,
} from './analytics-events';

// ─── Agent Protocol ───────────────────────────────────────────────────────────
export type {
  AgentContext,
  AgentPlan,
  AgentStep,
  ApprovalPolicy,
  ExecutionMode,
  PlanStatus,
  StepStatus,
} from './agent-protocol';

// ─── Knowledge Query ──────────────────────────────────────────────────────────
export type {
  Modality,
  QueryFilter,
  ResultProvenance,
  SearchResult,
  SemanticQuery,
  TimelineJump,
} from './knowledge-query';

// ─── Mesh Protocol ────────────────────────────────────────────────────────────
export type {
  LeaseInfo,
  MeshEvent,
  MeshEventType,
  PeerInfo,
  ReplicationState,
  ShardManifest,
} from './mesh-protocol';

// ─── Federation ───────────────────────────────────────────────────────────────
export type {
  ArchiveResult,
  ContentCoreQuery,
  FederatedResult,
  FederationFilter,
  HydrationLevel,
  RightsStatus,
  UsageRecord,
} from './federation';
