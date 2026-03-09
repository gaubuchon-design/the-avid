/**
 * @module schemas
 *
 * Zod runtime validation schemas that mirror the TypeScript types defined
 * in the contracts package. Use these at API boundaries, message bus
 * consumers, and anywhere untrusted data enters the system.
 *
 * Each schema is named with a `Schema` suffix and mirrors the
 * corresponding TypeScript interface or type alias.
 *
 * @example
 * ```ts
 * import { AgentPlanSchema } from '@mcua/contracts/schemas';
 *
 * const parsed = AgentPlanSchema.safeParse(untrustedData);
 * if (!parsed.success) {
 *   console.error(parsed.error.flatten());
 * }
 * ```
 */

import { z } from 'zod';

// -- Reusable primitives -----------------------------------------------------

/** ISO 8601 date-time string. */
const isoTimestamp = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T/));

/** Non-empty trimmed string. */
const nonEmpty = z.string().min(1).trim();

/** Score in [0, 1]. */
const score01 = z.number().min(0).max(1);

// -- project-assets ----------------------------------------------------------

export const MediaTypeSchema = z.enum(['audio', 'video', 'image', 'document']);

export const ApprovalStatusSchema = z.enum(['pending', 'approved', 'rejected', 'review']);

export const RightsInfoSchema = z.object({
  license: z.string(),
  expiresAt: z.string().nullable(),
  restrictions: z.array(z.string()).readonly(),
  owner: z.string(),
}).readonly();

export const MediaRefSchema = z.object({
  id: nonEmpty,
  assetId: nonEmpty,
  mediaRoot: z.string(),
  relativePath: z.string(),
  format: z.string(),
  codec: z.string(),
  resolution: z.object({ width: z.number(), height: z.number() }).nullable(),
  frameRate: z.number().nullable(),
  sampleRate: z.number().nullable(),
  channels: z.number().nullable(),
  fileSize: z.number().nonnegative(),
  checksum: z.string(),
}).readonly();

export const KnowledgeAssetSchema = z.object({
  id: nonEmpty,
  name: nonEmpty,
  type: MediaTypeSchema,
  url: z.string(),
  duration: z.number().nullable(),
  size: z.number().nonnegative(),
  shardId: nonEmpty,
  embeddingsRef: z.array(z.string()).readonly(),
  transcriptRef: z.string().nullable(),
  visionEventsRef: z.array(z.string()).readonly(),
  markers: z.array(z.string()).readonly(),
  tags: z.array(z.string()).readonly(),
  approvalStatus: ApprovalStatusSchema,
  rights: RightsInfoSchema.nullable(),
  metadata: z.record(z.unknown()).readonly(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
}).readonly();

// -- transcripts -------------------------------------------------------------

export const WordSchema = z.object({
  text: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  confidence: score01,
}).readonly();

export const SpeakerSchema = z.object({
  id: nonEmpty,
  name: z.string(),
  confidence: score01,
}).readonly();

export const LanguageSchema = z.object({
  code: z.string().length(2),
  name: z.string(),
  confidence: score01,
}).readonly();

export const TranscriptSegmentSchema = z.object({
  id: nonEmpty,
  assetId: nonEmpty,
  startTime: z.number(),
  endTime: z.number(),
  text: z.string(),
  confidence: score01,
  speaker: SpeakerSchema.nullable(),
  language: LanguageSchema,
  words: z.array(WordSchema).readonly(),
}).readonly();

// -- agent-protocol ----------------------------------------------------------

export const PlanStatusSchema = z.enum([
  'planning', 'preview', 'approved', 'executing',
  'completed', 'failed', 'cancelled',
]);

export const StepStatusSchema = z.enum([
  'pending', 'approved', 'executing', 'completed',
  'failed', 'cancelled', 'compensated',
]);

export const ExecutionModeSchema = z.enum(['sequential', 'parallel', 'conditional']);

export const ApprovalPolicySchema = z.object({
  mode: z.enum(['manual', 'auto-approve', 'dry-run']),
  allowedAutoTools: z.array(z.string()).readonly(),
  requireApprovalFor: z.array(z.string()).readonly(),
  maxAutoTokens: z.number().nonnegative(),
}).readonly();

export const AgentStepSchema = z.object({
  id: nonEmpty,
  planId: nonEmpty,
  index: z.number().int().nonnegative(),
  description: z.string(),
  toolName: nonEmpty,
  toolArgs: z.record(z.unknown()).readonly(),
  status: StepStatusSchema,
  result: z.unknown().nullable(),
  error: z.unknown().nullable(),
  compensation: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
}).readonly();

export const AgentPlanSchema = z.object({
  id: nonEmpty,
  intent: nonEmpty,
  steps: z.array(AgentStepSchema).readonly(),
  status: PlanStatusSchema,
  tokensEstimated: z.number().nonnegative(),
  tokensUsed: z.number().nonnegative(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  approvalPolicy: ApprovalPolicySchema,
}).readonly();

export const AgentContextSchema = z.object({
  projectId: nonEmpty,
  sequenceId: nonEmpty,
  binIds: z.array(z.string()).readonly(),
  selectedClipIds: z.array(z.string()).readonly(),
  playheadTime: z.number(),
  searchQuery: z.string().nullable(),
  searchResults: z.array(z.string()).readonly().nullable(),
  transcriptContext: z.array(z.string()).readonly().nullable(),
  meshNodes: z.array(z.string()).readonly().nullable(),
}).readonly();

// -- publish-variants --------------------------------------------------------

export const PublishPlatformSchema = z.enum([
  'youtube', 'vimeo', 'tiktok', 'instagram',
  'twitter', 'facebook', 'linkedin', 'custom',
]);

export const PublishStatusSchema = z.enum([
  'draft', 'rendering', 'ready', 'published', 'failed', 'revoked',
]);

export const DeliverySpecSchema = z.object({
  format: nonEmpty,
  codec: nonEmpty,
  resolution: z.object({ width: z.number().positive(), height: z.number().positive() }),
  frameRate: z.number().positive(),
  bitrate: z.string(),
  audioCodec: z.string(),
  audioBitrate: z.string(),
  maxDuration: z.number().positive().nullable(),
  captionFormat: z.string().nullable(),
  thumbnailRequired: z.boolean(),
}).readonly();

export const PublishVariantSchema = z.object({
  id: nonEmpty,
  sequenceId: nonEmpty,
  platform: PublishPlatformSchema,
  deliverySpec: DeliverySpecSchema,
  status: PublishStatusSchema,
  publishedUrl: z.string().nullable(),
  publishedAt: z.string().nullable(),
  metadata: z.record(z.unknown()).readonly(),
}).readonly();

// -- token-metering ----------------------------------------------------------

export const TokenCategorySchema = z.enum([
  'archive-reasoning', 'premium-translation', 'reference-dubbing',
  'temp-music-gen', 'generative-motion', 'generative-effects',
  'premium-publish', 'cloud-stt', 'cloud-analysis',
]);

export const TokenWalletSchema = z.object({
  id: nonEmpty,
  userId: nonEmpty,
  orgId: z.string().nullable(),
  balance: z.number(),
  currency: z.literal('tokens'),
  tier: z.enum(['free', 'pro', 'enterprise']),
  monthlyAllocation: z.number().nonnegative(),
  usedThisMonth: z.number().nonnegative(),
  resetDate: z.string(),
}).readonly();

export const MeteringRecordSchema = z.object({
  id: nonEmpty,
  walletId: nonEmpty,
  jobId: nonEmpty,
  category: TokenCategorySchema,
  tokensConsumed: z.number().nonnegative(),
  quotedCost: z.number().nonnegative(),
  actualCost: z.number().nonnegative(),
  status: z.enum(['quoted', 'held', 'settled', 'refunded']),
  createdAt: isoTimestamp,
  settledAt: z.string().nullable(),
}).readonly();

export const JobQuoteSchema = z.object({
  jobId: nonEmpty,
  category: TokenCategorySchema,
  estimatedTokens: z.number().nonnegative(),
  breakdown: z.record(z.number()).readonly(),
  expiresAt: isoTimestamp,
  confidence: z.enum(['exact', 'estimated', 'upper-bound']),
}).readonly();

// -- knowledge-query ---------------------------------------------------------

export const ModalitySchema = z.enum([
  'transcript', 'visual', 'marker', 'metadata', 'embedding',
]);

export const QueryFilterSchema = z.object({
  field: nonEmpty,
  operator: z.enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'in']),
  value: z.unknown(),
}).readonly();

export const SemanticQuerySchema = z.object({
  text: nonEmpty,
  modalities: z.array(ModalitySchema).readonly(),
  filters: z.array(QueryFilterSchema).readonly(),
  topK: z.number().int().positive(),
  threshold: score01,
  includeProvenance: z.boolean(),
}).readonly();

// -- mesh-protocol -----------------------------------------------------------

export const MeshEventTypeSchema = z.enum([
  'peer-joined', 'peer-left', 'shard-created', 'shard-replicated',
  'lease-acquired', 'lease-released', 'lease-expired',
  'conflict-detected', 'search-request', 'search-response',
]);

export const PeerInfoSchema = z.object({
  nodeId: nonEmpty,
  hostname: z.string(),
  port: z.number().int().positive(),
  status: z.enum(['online', 'offline', 'syncing']),
  lastSeen: isoTimestamp,
  shardIds: z.array(z.string()).readonly(),
  capabilities: z.array(z.string()).readonly(),
}).readonly();

// -- render-pipeline ---------------------------------------------------------

export const RenderJobStatusSchema = z.enum([
  'queued', 'assigned', 'rendering', 'completed', 'failed', 'cancelled',
]);

export const RenderJobTypeSchema = z.enum([
  'encode', 'transcode', 'effects', 'composite',
]);

export const RenderJobSchema = z.object({
  id: nonEmpty,
  sequenceId: nonEmpty,
  type: RenderJobTypeSchema,
  priority: z.number().int().min(0).max(100),
  status: RenderJobStatusSchema,
  deliverySpec: DeliverySpecSchema.nullable(),
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().nonnegative(),
  assignedNodeId: z.string().nullable(),
  progress: z.number().min(0).max(100),
  createdAt: isoTimestamp,
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  outputUri: z.string().nullable(),
  error: z.string().nullable(),
  retryCount: z.number().int().nonnegative(),
  maxRetries: z.number().int().nonnegative(),
}).readonly();

export const RenderProgressSchema = z.object({
  jobId: nonEmpty,
  nodeId: nonEmpty,
  progress: z.number().min(0).max(100),
  currentFrame: z.number().int().nonnegative(),
  totalFrames: z.number().int().nonnegative(),
  fps: z.number().nonnegative(),
  eta: z.string().nullable(),
  timestamp: isoTimestamp,
}).readonly();

export const RenderQueueStatsSchema = z.object({
  queued: z.number().int().nonnegative(),
  rendering: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  nodesOnline: z.number().int().nonnegative(),
  nodesBusy: z.number().int().nonnegative(),
  avgFps: z.number().nonnegative(),
  estimatedDrainTimeSec: z.number().nonnegative().nullable(),
}).readonly();

// -- API version -------------------------------------------------------------

export const ApiVersionSchema = z.object({
  major: z.number().int().nonnegative(),
  minor: z.number().int().nonnegative(),
  patch: z.number().int().nonnegative(),
}).readonly();

// -- Event schemas -----------------------------------------------------------

const EventEnvelopeBase = z.object({
  id: nonEmpty,
  timestamp: isoTimestamp,
  correlationId: nonEmpty,
  source: nonEmpty,
});

export const EventEnvelopeSchema = EventEnvelopeBase.readonly();

export const PlatformEventSchema = z.discriminatedUnion('kind', [
  EventEnvelopeBase.extend({
    kind: z.literal('agent.plan.created'),
    payload: z.object({
      planId: nonEmpty,
      intent: nonEmpty,
      stepCount: z.number().int().nonnegative(),
      tokensEstimated: z.number().nonnegative(),
    }),
  }),
  EventEnvelopeBase.extend({
    kind: z.literal('agent.plan.approved'),
    payload: z.object({ planId: nonEmpty, approvedBy: nonEmpty }),
  }),
  EventEnvelopeBase.extend({
    kind: z.literal('agent.plan.rejected'),
    payload: z.object({ planId: nonEmpty, rejectedBy: nonEmpty, reason: z.string().optional() }),
  }),
  EventEnvelopeBase.extend({
    kind: z.literal('agent.step.started'),
    payload: z.object({ planId: nonEmpty, stepId: nonEmpty, stepIndex: z.number().int(), toolName: nonEmpty }),
  }),
  EventEnvelopeBase.extend({
    kind: z.literal('agent.step.completed'),
    payload: z.object({ planId: nonEmpty, stepId: nonEmpty, stepIndex: z.number().int(), toolName: nonEmpty, durationMs: z.number(), tokensCost: z.number() }),
  }),
  EventEnvelopeBase.extend({
    kind: z.literal('agent.step.failed'),
    payload: z.object({ planId: nonEmpty, stepId: nonEmpty, stepIndex: z.number().int(), toolName: nonEmpty, error: z.string(), recoverable: z.boolean() }),
  }),
  EventEnvelopeBase.extend({
    kind: z.literal('render.job.queued'),
    payload: z.object({ jobId: nonEmpty, sequenceId: nonEmpty, priority: z.number(), estimatedFrames: z.number() }),
  }),
  EventEnvelopeBase.extend({
    kind: z.literal('render.job.progress'),
    payload: z.object({ jobId: nonEmpty, progress: z.number(), currentFrame: z.number(), totalFrames: z.number(), fps: z.number(), eta: z.string().nullable() }),
  }),
  EventEnvelopeBase.extend({
    kind: z.literal('render.job.completed'),
    payload: z.object({ jobId: nonEmpty, outputUri: nonEmpty, durationMs: z.number(), fileSizeBytes: z.number() }),
  }),
  EventEnvelopeBase.extend({
    kind: z.literal('render.job.failed'),
    payload: z.object({ jobId: nonEmpty, error: z.string(), retryable: z.boolean(), attemptNumber: z.number() }),
  }),
  EventEnvelopeBase.extend({
    kind: z.literal('mesh.peer.joined'),
    payload: z.object({ nodeId: nonEmpty, hostname: z.string(), capabilities: z.array(z.string()) }),
  }),
  EventEnvelopeBase.extend({
    kind: z.literal('mesh.peer.left'),
    payload: z.object({ nodeId: nonEmpty, reason: z.enum(['graceful', 'timeout', 'error']) }),
  }),
  EventEnvelopeBase.extend({
    kind: z.literal('mesh.shard.replicated'),
    payload: z.object({ shardId: nonEmpty, sourceNodeId: nonEmpty, targetNodeId: nonEmpty, vectorCount: z.number() }),
  }),
  EventEnvelopeBase.extend({
    kind: z.literal('publish.started'),
    payload: z.object({ jobId: nonEmpty, platform: z.string(), sequenceId: nonEmpty }),
  }),
  EventEnvelopeBase.extend({
    kind: z.literal('publish.completed'),
    payload: z.object({ jobId: nonEmpty, platform: z.string(), publicUrl: z.string() }),
  }),
  EventEnvelopeBase.extend({
    kind: z.literal('publish.failed'),
    payload: z.object({ jobId: nonEmpty, platform: z.string(), error: z.string() }),
  }),
  EventEnvelopeBase.extend({
    kind: z.literal('tokens.consumed'),
    payload: z.object({ walletId: nonEmpty, jobId: nonEmpty, category: z.string(), amount: z.number(), remainingBalance: z.number() }),
  }),
  EventEnvelopeBase.extend({
    kind: z.literal('tokens.insufficient'),
    payload: z.object({ walletId: nonEmpty, requiredAmount: z.number(), currentBalance: z.number(), category: z.string() }),
  }),
]);
