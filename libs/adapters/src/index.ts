/**
 * @fileoverview Barrel export for the `@mcua/adapters` package.
 *
 * Re-exports every adapter interface, supporting type, and mock
 * implementation so that consumers can import from a single entry point:
 *
 * ```ts
 * import {
 *   type IMediaComposerAdapter,
 *   MockMediaComposerAdapter,
 * } from '@mcua/adapters';
 * ```
 */

// ---------------------------------------------------------------------------
// Adapter errors (consistent error handling across all adapters)
// ---------------------------------------------------------------------------
export {
  AdapterError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  InvalidArgumentError,
  NotFoundError,
  TimeoutError,
  UnavailableError,
} from './AdapterError';
export type { AdapterErrorCode } from './AdapterError';

// ---------------------------------------------------------------------------
// Contract type mirrors (will become re-exports from @mcua/contracts)
// ---------------------------------------------------------------------------
export type {
  AgentContext,
  AgentPlan,
  AgentStep,
  ApprovalStatus,
  ArchiveResult,
  ContentCoreQuery,
  DeliverySpec,
  EmbeddingChunk,
  EmbeddingModel,
  FederatedResult,
  HydrationLevel,
  KnowledgeAsset,
  KnowledgeBin,
  KnowledgeSequence,
  Language,
  MediaRef,
  Modality,
  PublishPlatform,
  PublishStatus,
  PublishVariant,
  ResultProvenance,
  RightsInfo,
  RightsStatus,
  SearchResult,
  SemanticQuery,
  Speaker,
  TimelineJump,
  ToolInvocation,
  ToolTrace,
  TranscriptSegment,
  UsageRecord,
  Word,
} from './contracts-types';

// ---------------------------------------------------------------------------
// Adapter interfaces
// ---------------------------------------------------------------------------
export type {
  IMediaComposerAdapter,
  TimelineSnapshot,
  TrackSnapshot,
  TrackKind,
  ClipResult,
  BinSnapshot,
  SelectionSnapshot,
  ExportJob,
  ExportJobStatus,
} from './IMediaComposerAdapter';

export type { IContentCoreAdapter } from './IContentCoreAdapter';

export type {
  IProToolsAdapter,
  SessionInfo,
  DialogueCleanupParams,
  AudioMetrics,
  AudioProcessResult,
  TempMusicOptions,
  ExportResult,
  HandoffResult,
} from './IProToolsAdapter';

export type {
  IPublishConnector,
  PublishResult,
  PublishStatusInfo,
  PlatformCapabilities,
  ValidationResult,
  ValidationIssue,
} from './IPublishConnector';

// ---------------------------------------------------------------------------
// Mock implementations
// ---------------------------------------------------------------------------
export { MockMediaComposerAdapter } from './MockMediaComposerAdapter';
export { MockContentCoreAdapter } from './MockContentCoreAdapter';
export { MockProToolsAdapter } from './MockProToolsAdapter';
export { MockPublishConnector } from './MockPublishConnector';

// ---------------------------------------------------------------------------
// Phase 7 -- Content Core Federation
// ---------------------------------------------------------------------------
export { CacheManager } from './federation/CacheManager';
export type {
  CacheEntry,
  CacheStats,
} from './federation/CacheManager';

export { ResultMerger } from './federation/ResultMerger';
export type {
  LocalSearchResult,
  FederatedResult as FederatedSearchResult,
} from './federation/ResultMerger';

export { ContentCoreClient } from './federation/ContentCoreClient';
export type { FederatedHydrationLevel } from './federation/ContentCoreClient';

export { FederatedSearchService } from './federation/FederatedSearchService';
export type {
  FederatedSearchConfig,
  FederatedSearchResults,
  FederatedSearchOptions,
} from './federation/FederatedSearchService';

// ---------------------------------------------------------------------------
// Phase 8 -- Pro Tools Shared Automation Bridge
// ---------------------------------------------------------------------------
export { ProToolsBridge } from './protools/ProToolsBridge';

export { SharedJobHistory } from './protools/SharedJobHistory';
export type {
  JobHistoryEntry,
  JobHistoryFilter,
  JobHistoryStats,
  JobType,
  JobStatus,
} from './protools/SharedJobHistory';

export { runDialogueCleanup } from './protools/DialogueCleanupWorkflow';
export type {
  DialogueCleanupResult,
  DialogueCleanupParams as DialogueCleanupWorkflowParams,
  AudioMetricsSnapshot,
} from './protools/DialogueCleanupWorkflow';

export { runLoudnessPrep } from './protools/LoudnessPrepWorkflow';
export type {
  LoudnessPrepResult,
  LoudnessMeasurement,
} from './protools/LoudnessPrepWorkflow';

export { placeTempMusic } from './protools/TempMusicWorkflow';
export type {
  TempMusicResult,
  TempMusicPlacementOptions,
} from './protools/TempMusicWorkflow';

export { HandoffManager } from './protools/HandoffManager';
export type {
  HandoffHistoryEntry,
  HandoffDirection,
  HandoffStatus,
  HandoffResult as HandoffManagerResult,
} from './protools/HandoffManager';
