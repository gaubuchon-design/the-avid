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

// ─── Render Pipeline ──────────────────────────────────────────────────────────
export type {
  RenderJob,
  RenderJobStatus,
  RenderJobType,
  RenderNodeInfo,
  RenderProgress,
  RenderQueueStats,
} from './render-pipeline';

// ─── Discriminated Events ─────────────────────────────────────────────────────
export type {
  AgentPlanApprovedEvent,
  AgentPlanCreatedEvent,
  AgentPlanRejectedEvent,
  AgentStepCompletedEvent,
  AgentStepFailedEvent,
  AgentStepStartedEvent,
  EventByKind,
  EventEnvelope,
  MeshPeerJoinedEvent,
  MeshPeerLeftEvent,
  MeshShardReplicatedEvent,
  PlatformEvent,
  PlatformEventKind,
  PublishCompletedEvent,
  PublishFailedEvent,
  PublishStartedEvent,
  RenderJobCompletedEvent,
  RenderJobFailedEvent,
  RenderJobProgressEvent,
  RenderJobQueuedEvent,
  TokensConsumedEvent,
  TokensInsufficientEvent,
} from './events';

// ─── Utility Types ────────────────────────────────────────────────────────────
export type {
  AssetId,
  Branded,
  DeepPartial,
  DeepReadonly,
  DeepRequired,
  ISOTimestamp,
  JobId,
  JsonSerializable,
  PaginatedResponse,
  PaginationRequest,
  PartialBy,
  PlanId,
  ProjectId,
  RequiredBy,
  Result,
  SequenceId,
  ShardId,
  StrictPick,
} from './utility-types';

// ─── API Versioning ───────────────────────────────────────────────────────────
export type {
  ApiVersion,
  VersionedRequest,
  VersionedResponse,
} from './api-version';

export {
  API_VERSION_STRING,
  CURRENT_API_VERSION,
  compareVersions,
  isCompatible,
  parseVersion,
} from './api-version';

// ─── Type Guards & Assertion Functions ────────────────────────────────────────
export {
  // Type guards
  isMediaType,
  isApprovalStatus,
  isTranscriptFormat,
  isEmbeddingBackend,
  isTraceStatus,
  isPublishPlatform,
  isPublishStatus,
  isTokenCategory,
  isPlanStatus,
  isStepStatus,
  isExecutionMode,
  isModality,
  isHydrationLevel,
  isMeshEventType,
  isRenderJobType,
  isRenderJobStatus,
  isEventType,
  isPrivacyLevel,
  isPlatformEventKind,
  // Assertion functions
  assertMediaType,
  assertApprovalStatus,
  assertTranscriptFormat,
  assertEmbeddingBackend,
  assertTraceStatus,
  assertPublishPlatform,
  assertPublishStatus,
  assertTokenCategory,
  assertPlanStatus,
  assertStepStatus,
  assertExecutionMode,
  assertModality,
  assertHydrationLevel,
  assertMeshEventType,
  assertRenderJobType,
  assertRenderJobStatus,
  assertEventType,
  assertPrivacyLevel,
  assertPlatformEventKind,
  // Branded ID factory functions
  createClipId,
  createTrackId,
  createEffectId,
  createBinId,
  createWalletId,
  createNodeId,
  createCorrelationId,
  createProjectId,
  createSequenceId,
  createAssetId,
  createShardId,
  createPlanId,
  createJobId,
} from './type-guards';

export type {
  ClipId,
  TrackId,
  EffectId,
  BinId,
  WalletId,
  NodeId,
  CorrelationId,
} from './type-guards';

// ─── Zod Runtime Schemas ──────────────────────────────────────────────────────
// Re-exported from a separate entry point so that consumers who do not
// need runtime validation can tree-shake Zod out of their bundle:
//
//   import { AgentPlanSchema } from '@mcua/contracts/schemas';
//
// We intentionally do NOT re-export schemas from the barrel to keep the
// default import lightweight. Consumers opt in via the sub-path export.
