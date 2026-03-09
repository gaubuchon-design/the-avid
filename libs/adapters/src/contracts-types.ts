/**
 * @fileoverview Local mirrors of types from @mcua/contracts.
 *
 * These definitions duplicate the canonical shapes declared in the
 * `@mcua/contracts` package so that `@mcua/adapters` can compile
 * stand-alone while the contracts source files are being authored.
 *
 * Once `@mcua/contracts` exports are fully wired up, every type here
 * should be replaced with a re-export:
 *
 *   export type { DeliverySpec, PublishVariant, ... } from '@mcua/contracts';
 *
 * Until then each type is annotated with its canonical module path.
 */

// ---------------------------------------------------------------------------
// project-assets  (@mcua/contracts  project-assets)
// ---------------------------------------------------------------------------

/** Unique reference to a piece of media (clip, graphic, still, etc.). */
export interface MediaRef {
  id: string;
  name: string;
  /** MIME type, e.g. "video/mxf" */
  mimeType: string;
  /** Duration in seconds (NaN for stills). */
  duration: number;
  /** Path or URI to the underlying essence. */
  uri: string;
  metadata?: Record<string, unknown>;
}

/** Approval workflow status for an asset. */
export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'needs_review';

/** Rights / licensing information attached to an asset. */
export interface RightsInfo {
  holder: string;
  licenseType: string;
  territory: string[];
  validFrom: string;
  validTo: string;
  restrictions: string[];
}

/** A knowledge-enriched asset envelope used across the platform. */
export interface KnowledgeAsset {
  id: string;
  mediaRef: MediaRef;
  approvalStatus: ApprovalStatus;
  rights?: RightsInfo;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** A bin (folder) inside the project. */
export interface KnowledgeBin {
  id: string;
  name: string;
  parentId?: string;
  assetIds: string[];
  createdAt: string;
}

/** A sequence in the project timeline. */
export interface KnowledgeSequence {
  id: string;
  name: string;
  duration: number;
  trackCount: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// transcripts  (@mcua/contracts  transcripts)
// ---------------------------------------------------------------------------

export interface Word {
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface Speaker {
  id: string;
  label: string;
}

export type Language = string; // BCP-47

export interface TranscriptSegment {
  id: string;
  speaker?: Speaker;
  language: Language;
  words: Word[];
  startTime: number;
  endTime: number;
}

// ---------------------------------------------------------------------------
// embeddings  (@mcua/contracts  embeddings)
// ---------------------------------------------------------------------------

export type EmbeddingModel = 'clip-vit-l14' | 'whisper-large-v3' | 'bge-m3';

export interface EmbeddingChunk {
  id: string;
  assetId: string;
  model: EmbeddingModel;
  vector: number[];
  startTime?: number;
  endTime?: number;
}

// ---------------------------------------------------------------------------
// tool-traces  (@mcua/contracts  tool-traces)
// ---------------------------------------------------------------------------

export interface ToolInvocation {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  durationMs: number;
  timestamp: string;
}

export interface ToolTrace {
  traceId: string;
  agentId: string;
  invocations: ToolInvocation[];
}

// ---------------------------------------------------------------------------
// publish-variants  (@mcua/contracts  publish-variants)
// ---------------------------------------------------------------------------

export type PublishPlatform =
  | 'youtube'
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'x'
  | 'linkedin'
  | 'broadcast'
  | 'ott'
  | 'custom';

export type PublishStatus =
  | 'draft'
  | 'rendering'
  | 'ready'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'revoked';

export interface DeliverySpec {
  format: string;
  codec: string;
  resolution: { width: number; height: number };
  frameRate: number;
  bitrate?: number;
  audioCodec?: string;
  audioSampleRate?: number;
  loudnessTarget?: number;
  captionsFormat?: string;
}

export interface PublishVariant {
  id: string;
  sequenceId: string;
  platform: PublishPlatform;
  title: string;
  description?: string;
  tags?: string[];
  deliverySpec: DeliverySpec;
  scheduledAt?: string;
  status: PublishStatus;
}

// ---------------------------------------------------------------------------
// knowledge-query  (@mcua/contracts  knowledge-query)
// ---------------------------------------------------------------------------

export type Modality = 'video' | 'audio' | 'text' | 'image';

export interface SemanticQuery {
  text: string;
  modalities?: Modality[];
  limit?: number;
  threshold?: number;
  filters?: Record<string, unknown>;
}

export interface ResultProvenance {
  source: string;
  retrievedAt: string;
  confidence: number;
}

export interface TimelineJump {
  sequenceId: string;
  time: number;
}

export interface SearchResult {
  assetId: string;
  score: number;
  provenance: ResultProvenance;
  timelineJump?: TimelineJump;
}

// ---------------------------------------------------------------------------
// federation  (@mcua/contracts  federation)
// ---------------------------------------------------------------------------

export type RightsStatus = 'cleared' | 'restricted' | 'expired' | 'unknown';

export type HydrationLevel = 'summary' | 'standard' | 'full';

export interface ArchiveResult {
  id: string;
  name: string;
  description?: string;
  mediaRef: MediaRef;
  rights: RightsInfo;
  rightsStatus: RightsStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface ContentCoreQuery {
  text: string;
  filters?: Record<string, unknown>;
}

export interface FederatedResult {
  results: ArchiveResult[];
  totalCount: number;
  sources: string[];
}

/** Record of when / where an asset was used. */
export interface UsageRecord {
  assetId: string;
  sequenceId: string;
  sequenceName: string;
  usedAt: string;
  usedBy: string;
}

// ---------------------------------------------------------------------------
// agent-protocol  (@mcua/contracts  agent-protocol)
// ---------------------------------------------------------------------------

export interface AgentStep {
  id: string;
  action: string;
  params: Record<string, unknown>;
  status: 'pending' | 'running' | 'done' | 'failed';
  result?: unknown;
  error?: string;
}

export interface AgentContext {
  sessionId: string;
  userId: string;
  projectId: string;
  sequenceId?: string;
  selectedClipIds?: string[];
}

export interface AgentPlan {
  id: string;
  goal: string;
  steps: AgentStep[];
  context: AgentContext;
  createdAt: string;
}
