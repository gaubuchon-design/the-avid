/**
 * @module type-guards
 *
 * Runtime type guard functions, assertion functions, and branded ID factory
 * functions for the MCUA contracts package.
 *
 * Type guards narrow unknown values to specific contract types at runtime,
 * enabling safe deserialization and validation at system boundaries.
 *
 * Assertion functions throw a `TypeError` if the value does not match,
 * providing a fail-fast alternative to conditional narrowing.
 *
 * Branded ID factory functions create nominally-typed identifiers with
 * optional format validation.
 *
 * @example
 * ```ts
 * import { isMediaType, assertPlanStatus, createProjectId } from '@mcua/contracts/type-guards';
 *
 * if (isMediaType(input)) {
 *   // input is narrowed to MediaType
 * }
 *
 * assertPlanStatus(status); // throws if not a valid PlanStatus
 *
 * const pid = createProjectId('proj_abc123'); // typed as ProjectId
 * ```
 */

import type { Branded } from './utility-types';

// ─── String Literal Union Values ─────────────────────────────────────────────
// These arrays serve as the single source of truth for both type guards and
// assertion functions. They must stay in sync with the corresponding type
// aliases in their respective modules.

/** All valid {@link MediaType} values. */
const MEDIA_TYPE_VALUES: readonly string[] = ['audio', 'video', 'image', 'document'] as const;

/** All valid {@link ApprovalStatus} values. */
const APPROVAL_STATUS_VALUES: readonly string[] = ['pending', 'approved', 'rejected', 'review'] as const;

/** All valid {@link TranscriptFormat} values. */
const TRANSCRIPT_FORMAT_VALUES: readonly string[] = ['srt', 'vtt', 'json', 'ttml'] as const;

/** All valid {@link EmbeddingBackend} values. */
const EMBEDDING_BACKEND_VALUES: readonly string[] = ['bge-m3', 'nvidia-embed', 'custom'] as const;

/** All valid {@link TraceStatus} values. */
const TRACE_STATUS_VALUES: readonly string[] = ['pending', 'executing', 'completed', 'failed', 'compensated'] as const;

/** All valid {@link PublishPlatform} values. */
const PUBLISH_PLATFORM_VALUES: readonly string[] = [
  'youtube', 'vimeo', 'tiktok', 'instagram',
  'twitter', 'facebook', 'linkedin', 'custom',
] as const;

/** All valid {@link PublishStatus} values. */
const PUBLISH_STATUS_VALUES: readonly string[] = [
  'draft', 'rendering', 'ready', 'published', 'failed', 'revoked',
] as const;

/** All valid {@link TokenCategory} values. */
const TOKEN_CATEGORY_VALUES: readonly string[] = [
  'archive-reasoning', 'premium-translation', 'reference-dubbing',
  'temp-music-gen', 'generative-motion', 'generative-effects',
  'premium-publish', 'cloud-stt', 'cloud-analysis',
] as const;

/** All valid {@link PlanStatus} values. */
const PLAN_STATUS_VALUES: readonly string[] = [
  'planning', 'preview', 'approved', 'executing',
  'completed', 'failed', 'cancelled',
] as const;

/** All valid {@link StepStatus} values. */
const STEP_STATUS_VALUES: readonly string[] = [
  'pending', 'approved', 'executing', 'completed',
  'failed', 'cancelled', 'compensated',
] as const;

/** All valid {@link ExecutionMode} values. */
const EXECUTION_MODE_VALUES: readonly string[] = ['sequential', 'parallel', 'conditional'] as const;

/** All valid {@link Modality} values. */
const MODALITY_VALUES: readonly string[] = ['transcript', 'visual', 'marker', 'metadata', 'embedding'] as const;

/** All valid {@link HydrationLevel} values. */
const HYDRATION_LEVEL_VALUES: readonly string[] = ['stub', 'summary', 'full'] as const;

/** All valid {@link MeshEventType} values. */
const MESH_EVENT_TYPE_VALUES: readonly string[] = [
  'peer-joined', 'peer-left', 'shard-created', 'shard-replicated',
  'lease-acquired', 'lease-released', 'lease-expired',
  'conflict-detected', 'search-request', 'search-response',
] as const;

/** All valid {@link RenderJobType} values. */
const RENDER_JOB_TYPE_VALUES: readonly string[] = ['encode', 'transcode', 'effects', 'composite'] as const;

/** All valid {@link RenderJobStatus} values. */
const RENDER_JOB_STATUS_VALUES: readonly string[] = [
  'queued', 'assigned', 'rendering', 'completed', 'failed', 'cancelled',
] as const;

/** All valid {@link EventType} values. */
const EVENT_TYPE_VALUES: readonly string[] = [
  'prompt', 'plan-generated', 'plan-approved', 'plan-rejected',
  'step-override', 'step-failure', 'missing-endpoint',
  'manual-fix-after-agent', 'time-saved-estimate', 'publish-outcome',
  'token-consumed', 'model-fallback', 'latency-report',
] as const;

/** All valid {@link PrivacyLevel} values. */
const PRIVACY_LEVEL_VALUES: readonly string[] = [
  'public-aggregate', 'org-internal', 'user-private', 'do-not-log',
] as const;

/** All valid {@link PlatformEventKind} values. */
const PLATFORM_EVENT_KIND_VALUES: readonly string[] = [
  'agent.plan.created', 'agent.plan.approved', 'agent.plan.rejected',
  'agent.step.started', 'agent.step.completed', 'agent.step.failed',
  'render.job.queued', 'render.job.progress', 'render.job.completed', 'render.job.failed',
  'mesh.peer.joined', 'mesh.peer.left', 'mesh.shard.replicated',
  'publish.started', 'publish.completed', 'publish.failed',
  'tokens.consumed', 'tokens.insufficient',
] as const;

// ─── Import types for narrowing ──────────────────────────────────────────────

import type { MediaType } from './project-assets';
import type { ApprovalStatus } from './project-assets';
import type { TranscriptFormat } from './transcripts';
import type { EmbeddingBackend } from './embeddings';
import type { TraceStatus } from './tool-traces';
import type { PublishPlatform, PublishStatus } from './publish-variants';
import type { TokenCategory } from './token-metering';
import type { PlanStatus, StepStatus, ExecutionMode } from './agent-protocol';
import type { Modality } from './knowledge-query';
import type { HydrationLevel } from './federation';
import type { MeshEventType } from './mesh-protocol';
import type { RenderJobType, RenderJobStatus } from './render-pipeline';
import type { EventType, PrivacyLevel } from './analytics-events';
import type { PlatformEventKind } from './events';

// ─── Type Guards ─────────────────────────────────────────────────────────────

/**
 * Type guard: checks whether the given value is a valid {@link MediaType}.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is one of `'audio' | 'video' | 'image' | 'document'`.
 */
export function isMediaType(value: unknown): value is MediaType {
  return typeof value === 'string' && MEDIA_TYPE_VALUES.includes(value);
}

/**
 * Type guard: checks whether the given value is a valid {@link ApprovalStatus}.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is one of `'pending' | 'approved' | 'rejected' | 'review'`.
 */
export function isApprovalStatus(value: unknown): value is ApprovalStatus {
  return typeof value === 'string' && APPROVAL_STATUS_VALUES.includes(value);
}

/**
 * Type guard: checks whether the given value is a valid {@link TranscriptFormat}.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is one of `'srt' | 'vtt' | 'json' | 'ttml'`.
 */
export function isTranscriptFormat(value: unknown): value is TranscriptFormat {
  return typeof value === 'string' && TRANSCRIPT_FORMAT_VALUES.includes(value);
}

/**
 * Type guard: checks whether the given value is a valid {@link EmbeddingBackend}.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is one of `'bge-m3' | 'nvidia-embed' | 'custom'`.
 */
export function isEmbeddingBackend(value: unknown): value is EmbeddingBackend {
  return typeof value === 'string' && EMBEDDING_BACKEND_VALUES.includes(value);
}

/**
 * Type guard: checks whether the given value is a valid {@link TraceStatus}.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is one of the valid trace status strings.
 */
export function isTraceStatus(value: unknown): value is TraceStatus {
  return typeof value === 'string' && TRACE_STATUS_VALUES.includes(value);
}

/**
 * Type guard: checks whether the given value is a valid {@link PublishPlatform}.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is a supported publish platform string.
 */
export function isPublishPlatform(value: unknown): value is PublishPlatform {
  return typeof value === 'string' && PUBLISH_PLATFORM_VALUES.includes(value);
}

/**
 * Type guard: checks whether the given value is a valid {@link PublishStatus}.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is a valid publish status string.
 */
export function isPublishStatus(value: unknown): value is PublishStatus {
  return typeof value === 'string' && PUBLISH_STATUS_VALUES.includes(value);
}

/**
 * Type guard: checks whether the given value is a valid {@link TokenCategory}.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is a valid token category string.
 */
export function isTokenCategory(value: unknown): value is TokenCategory {
  return typeof value === 'string' && TOKEN_CATEGORY_VALUES.includes(value);
}

/**
 * Type guard: checks whether the given value is a valid {@link PlanStatus}.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is a valid plan status string.
 */
export function isPlanStatus(value: unknown): value is PlanStatus {
  return typeof value === 'string' && PLAN_STATUS_VALUES.includes(value);
}

/**
 * Type guard: checks whether the given value is a valid {@link StepStatus}.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is a valid step status string.
 */
export function isStepStatus(value: unknown): value is StepStatus {
  return typeof value === 'string' && STEP_STATUS_VALUES.includes(value);
}

/**
 * Type guard: checks whether the given value is a valid {@link ExecutionMode}.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is one of `'sequential' | 'parallel' | 'conditional'`.
 */
export function isExecutionMode(value: unknown): value is ExecutionMode {
  return typeof value === 'string' && EXECUTION_MODE_VALUES.includes(value);
}

/**
 * Type guard: checks whether the given value is a valid {@link Modality}.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is a valid search modality string.
 */
export function isModality(value: unknown): value is Modality {
  return typeof value === 'string' && MODALITY_VALUES.includes(value);
}

/**
 * Type guard: checks whether the given value is a valid {@link HydrationLevel}.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is one of `'stub' | 'summary' | 'full'`.
 */
export function isHydrationLevel(value: unknown): value is HydrationLevel {
  return typeof value === 'string' && HYDRATION_LEVEL_VALUES.includes(value);
}

/**
 * Type guard: checks whether the given value is a valid {@link MeshEventType}.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is a valid mesh event type string.
 */
export function isMeshEventType(value: unknown): value is MeshEventType {
  return typeof value === 'string' && MESH_EVENT_TYPE_VALUES.includes(value);
}

/**
 * Type guard: checks whether the given value is a valid {@link RenderJobType}.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is one of `'encode' | 'transcode' | 'effects' | 'composite'`.
 */
export function isRenderJobType(value: unknown): value is RenderJobType {
  return typeof value === 'string' && RENDER_JOB_TYPE_VALUES.includes(value);
}

/**
 * Type guard: checks whether the given value is a valid {@link RenderJobStatus}.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is a valid render job status string.
 */
export function isRenderJobStatus(value: unknown): value is RenderJobStatus {
  return typeof value === 'string' && RENDER_JOB_STATUS_VALUES.includes(value);
}

/**
 * Type guard: checks whether the given value is a valid {@link EventType}.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is a valid analytics event type string.
 */
export function isEventType(value: unknown): value is EventType {
  return typeof value === 'string' && EVENT_TYPE_VALUES.includes(value);
}

/**
 * Type guard: checks whether the given value is a valid {@link PrivacyLevel}.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is a valid privacy level string.
 */
export function isPrivacyLevel(value: unknown): value is PrivacyLevel {
  return typeof value === 'string' && PRIVACY_LEVEL_VALUES.includes(value);
}

/**
 * Type guard: checks whether the given value is a valid {@link PlatformEventKind}.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is a valid platform event kind string.
 */
export function isPlatformEventKind(value: unknown): value is PlatformEventKind {
  return typeof value === 'string' && PLATFORM_EVENT_KIND_VALUES.includes(value);
}

// ─── Assertion Functions ─────────────────────────────────────────────────────

/**
 * Asserts that the given value is a valid {@link MediaType}.
 *
 * @param value - The value to check.
 * @throws {TypeError} If `value` is not a valid media type.
 */
export function assertMediaType(value: unknown): asserts value is MediaType {
  if (!isMediaType(value)) {
    throw new TypeError(`Expected a valid MediaType, got: ${JSON.stringify(value)}`);
  }
}

/**
 * Asserts that the given value is a valid {@link ApprovalStatus}.
 *
 * @param value - The value to check.
 * @throws {TypeError} If `value` is not a valid approval status.
 */
export function assertApprovalStatus(value: unknown): asserts value is ApprovalStatus {
  if (!isApprovalStatus(value)) {
    throw new TypeError(`Expected a valid ApprovalStatus, got: ${JSON.stringify(value)}`);
  }
}

/**
 * Asserts that the given value is a valid {@link TranscriptFormat}.
 *
 * @param value - The value to check.
 * @throws {TypeError} If `value` is not a valid transcript format.
 */
export function assertTranscriptFormat(value: unknown): asserts value is TranscriptFormat {
  if (!isTranscriptFormat(value)) {
    throw new TypeError(`Expected a valid TranscriptFormat, got: ${JSON.stringify(value)}`);
  }
}

/**
 * Asserts that the given value is a valid {@link EmbeddingBackend}.
 *
 * @param value - The value to check.
 * @throws {TypeError} If `value` is not a valid embedding backend.
 */
export function assertEmbeddingBackend(value: unknown): asserts value is EmbeddingBackend {
  if (!isEmbeddingBackend(value)) {
    throw new TypeError(`Expected a valid EmbeddingBackend, got: ${JSON.stringify(value)}`);
  }
}

/**
 * Asserts that the given value is a valid {@link TraceStatus}.
 *
 * @param value - The value to check.
 * @throws {TypeError} If `value` is not a valid trace status.
 */
export function assertTraceStatus(value: unknown): asserts value is TraceStatus {
  if (!isTraceStatus(value)) {
    throw new TypeError(`Expected a valid TraceStatus, got: ${JSON.stringify(value)}`);
  }
}

/**
 * Asserts that the given value is a valid {@link PublishPlatform}.
 *
 * @param value - The value to check.
 * @throws {TypeError} If `value` is not a valid publish platform.
 */
export function assertPublishPlatform(value: unknown): asserts value is PublishPlatform {
  if (!isPublishPlatform(value)) {
    throw new TypeError(`Expected a valid PublishPlatform, got: ${JSON.stringify(value)}`);
  }
}

/**
 * Asserts that the given value is a valid {@link PublishStatus}.
 *
 * @param value - The value to check.
 * @throws {TypeError} If `value` is not a valid publish status.
 */
export function assertPublishStatus(value: unknown): asserts value is PublishStatus {
  if (!isPublishStatus(value)) {
    throw new TypeError(`Expected a valid PublishStatus, got: ${JSON.stringify(value)}`);
  }
}

/**
 * Asserts that the given value is a valid {@link TokenCategory}.
 *
 * @param value - The value to check.
 * @throws {TypeError} If `value` is not a valid token category.
 */
export function assertTokenCategory(value: unknown): asserts value is TokenCategory {
  if (!isTokenCategory(value)) {
    throw new TypeError(`Expected a valid TokenCategory, got: ${JSON.stringify(value)}`);
  }
}

/**
 * Asserts that the given value is a valid {@link PlanStatus}.
 *
 * @param value - The value to check.
 * @throws {TypeError} If `value` is not a valid plan status.
 */
export function assertPlanStatus(value: unknown): asserts value is PlanStatus {
  if (!isPlanStatus(value)) {
    throw new TypeError(`Expected a valid PlanStatus, got: ${JSON.stringify(value)}`);
  }
}

/**
 * Asserts that the given value is a valid {@link StepStatus}.
 *
 * @param value - The value to check.
 * @throws {TypeError} If `value` is not a valid step status.
 */
export function assertStepStatus(value: unknown): asserts value is StepStatus {
  if (!isStepStatus(value)) {
    throw new TypeError(`Expected a valid StepStatus, got: ${JSON.stringify(value)}`);
  }
}

/**
 * Asserts that the given value is a valid {@link ExecutionMode}.
 *
 * @param value - The value to check.
 * @throws {TypeError} If `value` is not a valid execution mode.
 */
export function assertExecutionMode(value: unknown): asserts value is ExecutionMode {
  if (!isExecutionMode(value)) {
    throw new TypeError(`Expected a valid ExecutionMode, got: ${JSON.stringify(value)}`);
  }
}

/**
 * Asserts that the given value is a valid {@link Modality}.
 *
 * @param value - The value to check.
 * @throws {TypeError} If `value` is not a valid modality.
 */
export function assertModality(value: unknown): asserts value is Modality {
  if (!isModality(value)) {
    throw new TypeError(`Expected a valid Modality, got: ${JSON.stringify(value)}`);
  }
}

/**
 * Asserts that the given value is a valid {@link HydrationLevel}.
 *
 * @param value - The value to check.
 * @throws {TypeError} If `value` is not a valid hydration level.
 */
export function assertHydrationLevel(value: unknown): asserts value is HydrationLevel {
  if (!isHydrationLevel(value)) {
    throw new TypeError(`Expected a valid HydrationLevel, got: ${JSON.stringify(value)}`);
  }
}

/**
 * Asserts that the given value is a valid {@link MeshEventType}.
 *
 * @param value - The value to check.
 * @throws {TypeError} If `value` is not a valid mesh event type.
 */
export function assertMeshEventType(value: unknown): asserts value is MeshEventType {
  if (!isMeshEventType(value)) {
    throw new TypeError(`Expected a valid MeshEventType, got: ${JSON.stringify(value)}`);
  }
}

/**
 * Asserts that the given value is a valid {@link RenderJobType}.
 *
 * @param value - The value to check.
 * @throws {TypeError} If `value` is not a valid render job type.
 */
export function assertRenderJobType(value: unknown): asserts value is RenderJobType {
  if (!isRenderJobType(value)) {
    throw new TypeError(`Expected a valid RenderJobType, got: ${JSON.stringify(value)}`);
  }
}

/**
 * Asserts that the given value is a valid {@link RenderJobStatus}.
 *
 * @param value - The value to check.
 * @throws {TypeError} If `value` is not a valid render job status.
 */
export function assertRenderJobStatus(value: unknown): asserts value is RenderJobStatus {
  if (!isRenderJobStatus(value)) {
    throw new TypeError(`Expected a valid RenderJobStatus, got: ${JSON.stringify(value)}`);
  }
}

/**
 * Asserts that the given value is a valid {@link EventType}.
 *
 * @param value - The value to check.
 * @throws {TypeError} If `value` is not a valid event type.
 */
export function assertEventType(value: unknown): asserts value is EventType {
  if (!isEventType(value)) {
    throw new TypeError(`Expected a valid EventType, got: ${JSON.stringify(value)}`);
  }
}

/**
 * Asserts that the given value is a valid {@link PrivacyLevel}.
 *
 * @param value - The value to check.
 * @throws {TypeError} If `value` is not a valid privacy level.
 */
export function assertPrivacyLevel(value: unknown): asserts value is PrivacyLevel {
  if (!isPrivacyLevel(value)) {
    throw new TypeError(`Expected a valid PrivacyLevel, got: ${JSON.stringify(value)}`);
  }
}

/**
 * Asserts that the given value is a valid {@link PlatformEventKind}.
 *
 * @param value - The value to check.
 * @throws {TypeError} If `value` is not a valid platform event kind.
 */
export function assertPlatformEventKind(value: unknown): asserts value is PlatformEventKind {
  if (!isPlatformEventKind(value)) {
    throw new TypeError(`Expected a valid PlatformEventKind, got: ${JSON.stringify(value)}`);
  }
}

// ─── Branded ID Types ────────────────────────────────────────────────────────

/**
 * Branded type for clip instance identifiers.
 *
 * Use {@link createClipId} to construct validated instances.
 */
export type ClipId = Branded<string, 'ClipId'>;

/**
 * Branded type for track identifiers.
 *
 * Use {@link createTrackId} to construct validated instances.
 */
export type TrackId = Branded<string, 'TrackId'>;

/**
 * Branded type for effect instance identifiers.
 *
 * Use {@link createEffectId} to construct validated instances.
 */
export type EffectId = Branded<string, 'EffectId'>;

/**
 * Branded type for bin identifiers.
 *
 * Use {@link createBinId} to construct validated instances.
 */
export type BinId = Branded<string, 'BinId'>;

/**
 * Branded type for wallet identifiers.
 *
 * Use {@link createWalletId} to construct validated instances.
 */
export type WalletId = Branded<string, 'WalletId'>;

/**
 * Branded type for node identifiers in the mesh network.
 *
 * Use {@link createNodeId} to construct validated instances.
 */
export type NodeId = Branded<string, 'NodeId'>;

/**
 * Branded type for correlation identifiers used in event tracing.
 *
 * Use {@link createCorrelationId} to construct validated instances.
 */
export type CorrelationId = Branded<string, 'CorrelationId'>;

// ─── Branded ID Factory Functions ────────────────────────────────────────────

/**
 * Validates that a raw string is non-empty and returns it as a branded type.
 *
 * @param raw - The raw string to validate.
 * @param typeName - Name of the branded type for error messages.
 * @returns The validated branded string.
 * @throws {TypeError} If the raw string is empty or not a string.
 */
function validateBrandedId<B extends string>(raw: string, typeName: B): Branded<string, B> {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new TypeError(`${typeName} must be a non-empty string, got: ${JSON.stringify(raw)}`);
  }
  return raw as Branded<string, B>;
}

/**
 * Creates a validated {@link ClipId} from a raw string.
 *
 * @param raw - The raw clip identifier string. Must be non-empty.
 * @returns A branded `ClipId`.
 * @throws {TypeError} If `raw` is empty or not a string.
 */
export function createClipId(raw: string): ClipId {
  return validateBrandedId(raw, 'ClipId');
}

/**
 * Creates a validated {@link TrackId} from a raw string.
 *
 * @param raw - The raw track identifier string. Must be non-empty.
 * @returns A branded `TrackId`.
 * @throws {TypeError} If `raw` is empty or not a string.
 */
export function createTrackId(raw: string): TrackId {
  return validateBrandedId(raw, 'TrackId');
}

/**
 * Creates a validated {@link EffectId} from a raw string.
 *
 * @param raw - The raw effect identifier string. Must be non-empty.
 * @returns A branded `EffectId`.
 * @throws {TypeError} If `raw` is empty or not a string.
 */
export function createEffectId(raw: string): EffectId {
  return validateBrandedId(raw, 'EffectId');
}

/**
 * Creates a validated {@link BinId} from a raw string.
 *
 * @param raw - The raw bin identifier string. Must be non-empty.
 * @returns A branded `BinId`.
 * @throws {TypeError} If `raw` is empty or not a string.
 */
export function createBinId(raw: string): BinId {
  return validateBrandedId(raw, 'BinId');
}

/**
 * Creates a validated {@link WalletId} from a raw string.
 *
 * @param raw - The raw wallet identifier string. Must be non-empty.
 * @returns A branded `WalletId`.
 * @throws {TypeError} If `raw` is empty or not a string.
 */
export function createWalletId(raw: string): WalletId {
  return validateBrandedId(raw, 'WalletId');
}

/**
 * Creates a validated {@link NodeId} from a raw string.
 *
 * @param raw - The raw node identifier string. Must be non-empty.
 * @returns A branded `NodeId`.
 * @throws {TypeError} If `raw` is empty or not a string.
 */
export function createNodeId(raw: string): NodeId {
  return validateBrandedId(raw, 'NodeId');
}

/**
 * Creates a validated {@link CorrelationId} from a raw string.
 *
 * @param raw - The raw correlation identifier string. Must be non-empty.
 * @returns A branded `CorrelationId`.
 * @throws {TypeError} If `raw` is empty or not a string.
 */
export function createCorrelationId(raw: string): CorrelationId {
  return validateBrandedId(raw, 'CorrelationId');
}

// Re-export factory functions for the IDs already defined in utility-types.ts.
// These use the same validation logic.

import type { ProjectId, SequenceId, AssetId, ShardId, PlanId, JobId } from './utility-types';

/**
 * Creates a validated {@link ProjectId} from a raw string.
 *
 * @param raw - The raw project identifier string. Must be non-empty.
 * @returns A branded `ProjectId`.
 * @throws {TypeError} If `raw` is empty or not a string.
 */
export function createProjectId(raw: string): ProjectId {
  return validateBrandedId(raw, 'ProjectId');
}

/**
 * Creates a validated {@link SequenceId} from a raw string.
 *
 * @param raw - The raw sequence identifier string. Must be non-empty.
 * @returns A branded `SequenceId`.
 * @throws {TypeError} If `raw` is empty or not a string.
 */
export function createSequenceId(raw: string): SequenceId {
  return validateBrandedId(raw, 'SequenceId');
}

/**
 * Creates a validated {@link AssetId} from a raw string.
 *
 * @param raw - The raw asset identifier string. Must be non-empty.
 * @returns A branded `AssetId`.
 * @throws {TypeError} If `raw` is empty or not a string.
 */
export function createAssetId(raw: string): AssetId {
  return validateBrandedId(raw, 'AssetId');
}

/**
 * Creates a validated {@link ShardId} from a raw string.
 *
 * @param raw - The raw shard identifier string. Must be non-empty.
 * @returns A branded `ShardId`.
 * @throws {TypeError} If `raw` is empty or not a string.
 */
export function createShardId(raw: string): ShardId {
  return validateBrandedId(raw, 'ShardId');
}

/**
 * Creates a validated {@link PlanId} from a raw string.
 *
 * @param raw - The raw plan identifier string. Must be non-empty.
 * @returns A branded `PlanId`.
 * @throws {TypeError} If `raw` is empty or not a string.
 */
export function createPlanId(raw: string): PlanId {
  return validateBrandedId(raw, 'PlanId');
}

/**
 * Creates a validated {@link JobId} from a raw string.
 *
 * @param raw - The raw job identifier string. Must be non-empty.
 * @returns A branded `JobId`.
 * @throws {TypeError} If `raw` is empty or not a string.
 */
export function createJobId(raw: string): JobId {
  return validateBrandedId(raw, 'JobId');
}
