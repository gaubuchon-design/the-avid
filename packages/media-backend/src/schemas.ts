import { z } from 'zod';

const metadataRecordSchema = z.record(z.unknown());

export const isoTimestampSchema = z.string().min(1);

export const mediaWorkerKindValues = [
  'ingest',
  'probe',
  'transcode',
  'transcription',
  'render',
  'encode',
  'effects',
] as const;
export const mediaWorkerKindSchema = z.enum(mediaWorkerKindValues);
export type MediaWorkerKind = z.infer<typeof mediaWorkerKindSchema>;

export const mediaAssetClassSchema = z.enum([
  'video',
  'audio',
  'subtitle',
  'bitmap',
  'vector',
  'layered-graphic',
  'document',
]);
export type MediaAssetClass = z.infer<typeof mediaAssetClassSchema>;

export const mediaSupportTierSchema = z.enum(['native', 'normalized', 'adapter', 'unsupported']);
export type MediaSupportTier = z.infer<typeof mediaSupportTierSchema>;

export const capabilitySurfaceSchema = z.enum(['desktop', 'web', 'mobile', 'worker']);
export type CapabilitySurface = z.infer<typeof capabilitySurfaceSchema>;

export const capabilityDispositionSchema = z.enum([
  'native',
  'proxy-only',
  'mezzanine-required',
  'adapter-required',
  'unsupported',
]);
export type CapabilityDisposition = z.infer<typeof capabilityDispositionSchema>;

export const mediaAlphaModeSchema = z.enum(['none', 'straight', 'premultiplied', 'unknown']);
export type MediaAlphaMode = z.infer<typeof mediaAlphaModeSchema>;

export const captionKindSchema = z.enum([
  'embedded-608',
  'embedded-708',
  'subtitle-stream',
  'sidecar',
  'teletext',
  'dvb-subtitle',
  'unknown',
]);
export type CaptionKind = z.infer<typeof captionKindSchema>;

export const legacyMediaWorkerKindValues = ['metadata', 'transcribe'] as const;
export const legacyMediaWorkerKindSchema = z.enum(legacyMediaWorkerKindValues);
export type LegacyMediaWorkerKind = z.infer<typeof legacyMediaWorkerKindSchema>;
export const mediaWorkerKindInputSchema = z.union([mediaWorkerKindSchema, legacyMediaWorkerKindSchema]);
export type MediaWorkerKindInput = z.infer<typeof mediaWorkerKindInputSchema>;

export const workerLifecycleStatusSchema = z.enum(['idle', 'busy', 'offline', 'error', 'draining']);
export type WorkerLifecycleStatus = z.infer<typeof workerLifecycleStatusSchema>;

export const jobPrioritySchema = z.enum(['critical', 'high', 'normal', 'low', 'background']);
export type JobPriority = z.infer<typeof jobPrioritySchema>;

export const artifactKindSchema = z.enum([
  'source',
  'proxy',
  'mezzanine',
  'render',
  'delivery',
  'metadata',
  'waveform',
  'thumbnail',
  'transcript',
  'captions',
  'qc',
]);
export type ArtifactKind = z.infer<typeof artifactKindSchema>;

export const artifactChecksumSchema = z.object({
  algorithm: z.enum(['sha1', 'sha256', 'md5']),
  digest: z.string().min(1),
});
export type ArtifactChecksum = z.infer<typeof artifactChecksumSchema>;

export const artifactDescriptorSchema = z.object({
  id: z.string().min(1),
  kind: artifactKindSchema,
  uri: z.string().min(1),
  container: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
  sizeBytes: z.number().nonnegative().optional(),
  createdAt: isoTimestampSchema,
  checksum: artifactChecksumSchema.optional(),
  derivedFromArtifactIds: z.array(z.string().min(1)).default([]),
  variantKey: z.string().min(1).optional(),
  metadata: metadataRecordSchema.default({}),
});
export type ArtifactDescriptor = z.infer<typeof artifactDescriptorSchema>;

export const artifactManifestSchema = z.object({
  manifestId: z.string().min(1),
  jobId: z.string().min(1),
  createdAt: isoTimestampSchema,
  projectId: z.string().min(1).optional(),
  assetId: z.string().min(1).optional(),
  artifacts: z.array(artifactDescriptorSchema).default([]),
  metadata: metadataRecordSchema.default({}),
});
export type ArtifactManifest = z.infer<typeof artifactManifestSchema>;

export const variantPurposeSchema = z.enum([
  'source',
  'proxy',
  'mezzanine',
  'playback',
  'render',
  'delivery',
  'transcript',
  'captions',
]);
export type VariantPurpose = z.infer<typeof variantPurposeSchema>;

export const variantDescriptorSchema = z.object({
  variantId: z.string().min(1),
  purpose: variantPurposeSchema,
  artifactId: z.string().min(1),
  container: z.string().min(1).optional(),
  videoCodec: z.string().min(1).optional(),
  audioCodec: z.string().min(1).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  frameRate: z.number().positive().optional(),
  metadata: metadataRecordSchema.default({}),
});
export type VariantDescriptor = z.infer<typeof variantDescriptorSchema>;

export const variantManifestSchema = z.object({
  manifestId: z.string().min(1),
  assetId: z.string().min(1).optional(),
  canonicalArtifactId: z.string().min(1).optional(),
  variants: z.array(variantDescriptorSchema).default([]),
  createdAt: isoTimestampSchema,
  metadata: metadataRecordSchema.default({}),
});
export type VariantManifest = z.infer<typeof variantManifestSchema>;

export const capabilityRequirementSchema = z.object({
  workerKinds: z.array(mediaWorkerKindSchema).default([]),
  codecs: z.array(z.string().min(1)).default([]),
  hwAccel: z.array(z.string().min(1)).default([]),
  minCpuCores: z.number().int().nonnegative().optional(),
  minMemoryGB: z.number().nonnegative().optional(),
  minVramMB: z.number().nonnegative().optional(),
});
export type CapabilityRequirement = z.infer<typeof capabilityRequirementSchema>;

export const workerCapabilityReportSchema = z.object({
  gpuVendor: z.string().min(1),
  gpuName: z.string().min(1),
  vramMB: z.number().nonnegative(),
  cpuCores: z.number().int().nonnegative(),
  memoryGB: z.number().nonnegative(),
  availableCodecs: z.array(z.string().min(1)).default([]),
  supportedContainers: z.array(z.string().min(1)).default([]),
  ffmpegVersion: z.string().min(1),
  maxConcurrentJobs: z.number().int().positive(),
  hwAccel: z.array(z.string().min(1)).default([]),
  workerKinds: z.array(mediaWorkerKindSchema).default([]),
  features: z.array(z.string().min(1)).default([]),
  artifactRoots: z.array(z.string().min(1)).default([]),
});
export type WorkerCapabilityReport = z.infer<typeof workerCapabilityReportSchema>;

export const rationalTimebaseSchema = z.object({
  numerator: z.number().int(),
  denominator: z.number().int().refine((value) => value !== 0, {
    message: 'denominator must not be zero',
  }),
  framesPerSecond: z.number().positive().optional(),
  displayString: z.string().min(1).optional(),
  dropFrame: z.boolean().optional(),
});
export type RationalTimebase = z.infer<typeof rationalTimebaseSchema>;

export const colorDescriptorSchema = z.object({
  colorSpace: z.string().min(1).optional(),
  primaries: z.string().min(1).optional(),
  transfer: z.string().min(1).optional(),
  matrix: z.string().min(1).optional(),
  range: z.enum(['full', 'limited', 'unknown']).optional(),
  bitDepth: z.number().int().positive().optional(),
  chromaSubsampling: z.string().min(1).optional(),
  alphaMode: mediaAlphaModeSchema.optional(),
  hdrMode: z.enum(['sdr', 'hlg', 'pq', 'dolby-vision', 'unknown']).optional(),
  iccProfileName: z.string().min(1).optional(),
  masteringDisplayMetadata: z.string().min(1).optional(),
  contentLightLevelMetadata: z.string().min(1).optional(),
});
export type ColorDescriptor = z.infer<typeof colorDescriptorSchema>;

export const graphicDescriptorSchema = z.object({
  kind: z.enum(['bitmap', 'vector', 'layered-graphic']),
  sourceFormat: z.string().min(1).optional(),
  canvasWidth: z.number().int().positive().optional(),
  canvasHeight: z.number().int().positive().optional(),
  pageCount: z.number().int().positive().optional(),
  layerCount: z.number().int().positive().optional(),
  hasAlpha: z.boolean().optional(),
  orientation: z.number().int().optional(),
  flatteningRequired: z.boolean().optional(),
  renderStrategy: z.enum(['direct', 'rasterize', 'flatten']).optional(),
});
export type GraphicDescriptor = z.infer<typeof graphicDescriptorSchema>;

export const probeSideDataDescriptorSchema = z.object({
  type: z.string().min(1),
  metadata: metadataRecordSchema.default({}),
});
export type ProbeSideDataDescriptor = z.infer<typeof probeSideDataDescriptorSchema>;

export const captionDescriptorSchema = z.object({
  kind: captionKindSchema,
  codec: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  streamIndex: z.number().int().nonnegative().optional(),
  serviceName: z.string().min(1).optional(),
});
export type CaptionDescriptor = z.infer<typeof captionDescriptorSchema>;

export const probeStreamDescriptorSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  kind: z.enum(['video', 'audio', 'subtitle', 'data', 'attachment']),
  codec: z.string().min(1).optional(),
  codecLongName: z.string().min(1).optional(),
  codecTag: z.string().min(1).optional(),
  codecProfile: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  disposition: z.array(z.string().min(1)).default([]),
  durationSeconds: z.number().nonnegative().optional(),
  bitRate: z.number().nonnegative().optional(),
  timebase: rationalTimebaseSchema.optional(),
  frameRate: rationalTimebaseSchema.optional(),
  averageFrameRate: rationalTimebaseSchema.optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  sampleAspectRatio: z.string().min(1).optional(),
  displayAspectRatio: z.string().min(1).optional(),
  fieldOrder: z.string().min(1).optional(),
  pixelFormat: z.string().min(1).optional(),
  audioChannels: z.number().int().positive().optional(),
  audioChannelLayout: z.string().min(1).optional(),
  sampleRate: z.number().positive().optional(),
  sampleFormat: z.string().min(1).optional(),
  reelName: z.string().min(1).optional(),
  timecodeStart: z.string().min(1).optional(),
  colorDescriptor: colorDescriptorSchema.optional(),
  sideData: z.array(probeSideDataDescriptorSchema).default([]),
  captions: z.array(captionDescriptorSchema).default([]),
});
export type ProbeStreamDescriptor = z.infer<typeof probeStreamDescriptorSchema>;

export const assetVariantCapabilityInputSchema = z.object({
  id: z.string().min(1),
  purpose: z.string().min(1),
  availability: z.enum(['ready', 'pending', 'failed', 'missing']).optional(),
  supportTier: mediaSupportTierSchema.optional(),
  container: z.string().min(1).optional(),
  videoCodec: z.string().min(1).optional(),
  audioCodec: z.string().min(1).optional(),
});
export type AssetVariantCapabilityInput = z.infer<typeof assetVariantCapabilityInputSchema>;

export const assetCapabilityInputSchema = z.object({
  assetId: z.string().min(1).optional(),
  assetName: z.string().min(1).optional(),
  assetClass: mediaAssetClassSchema,
  supportTier: mediaSupportTierSchema.optional(),
  fileExtension: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
  container: z.string().min(1).optional(),
  containerLongName: z.string().min(1).optional(),
  videoCodec: z.string().min(1).optional(),
  audioCodec: z.string().min(1).optional(),
  subtitleCodec: z.string().min(1).optional(),
  audioChannels: z.number().int().positive().optional(),
  audioChannelLayout: z.string().min(1).optional(),
  timebase: rationalTimebaseSchema.optional(),
  averageFrameRate: rationalTimebaseSchema.optional(),
  colorDescriptor: colorDescriptorSchema.optional(),
  graphicDescriptor: graphicDescriptorSchema.optional(),
  streams: z.array(probeStreamDescriptorSchema).default([]),
  variants: z.array(assetVariantCapabilityInputSchema).default([]),
});
export type AssetCapabilityInput = z.infer<typeof assetCapabilityInputSchema>;

export const capabilitySurfaceReportSchema = z.object({
  surface: capabilitySurfaceSchema,
  disposition: capabilityDispositionSchema,
  supportTier: mediaSupportTierSchema,
  preferredVariantId: z.string().min(1).optional(),
  reasons: z.array(z.string().min(1)).default([]),
});
export type CapabilitySurfaceReport = z.infer<typeof capabilitySurfaceReportSchema>;

export const assetCapabilityReportSchema = z.object({
  primarySurface: capabilitySurfaceSchema,
  primaryDisposition: capabilityDispositionSchema,
  sourceSupportTier: mediaSupportTierSchema,
  preferredVariantId: z.string().min(1).optional(),
  surfaces: z.array(capabilitySurfaceReportSchema).default([]),
  issues: z.array(z.string().min(1)).default([]),
  updatedAt: isoTimestampSchema.optional(),
});
export type AssetCapabilityReport = z.infer<typeof assetCapabilityReportSchema>;

export const jobLineageEntrySchema = z.object({
  jobId: z.string().min(1),
  stage: mediaWorkerKindSchema,
  parentJobIds: z.array(z.string().min(1)).default([]),
  inputArtifactIds: z.array(z.string().min(1)).default([]),
  outputArtifactIds: z.array(z.string().min(1)).default([]),
  createdAt: isoTimestampSchema,
  attempt: z.number().int().positive().default(1),
  metadata: metadataRecordSchema.default({}),
});
export type JobLineageEntry = z.infer<typeof jobLineageEntrySchema>;

export const jobLineageSchema = z.object({
  rootJobId: z.string().min(1),
  entries: z.array(jobLineageEntrySchema).default([]),
});
export type JobLineage = z.infer<typeof jobLineageSchema>;

export const executionJobBaseSchema = z.object({
  id: z.string().min(1),
  type: mediaWorkerKindSchema,
  inputUrl: z.string().min(1),
  outputPath: z.string().min(1).optional(),
  outputFormat: z.string().min(1).optional(),
  codec: z.string().min(1).optional(),
  startFrame: z.number().int().min(0).optional(),
  endFrame: z.number().int().min(0).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  params: metadataRecordSchema.default({}),
  artifactManifest: artifactManifestSchema.optional(),
  lineage: jobLineageSchema.optional(),
  capabilityRequirements: capabilityRequirementSchema.optional(),
});

export const probeJobParamsSchema = z.object({
  sceneThreshold: z.number().min(0).max(1).default(0.3),
  skipSceneDetection: z.boolean().default(false),
  includeStreams: z.boolean().default(true),
  includeFrameHashes: z.boolean().default(false),
});
export type ProbeJobParams = z.infer<typeof probeJobParamsSchema>;

export const transcodeJobParamsSchema = z.object({
  targetContainer: z.string().min(1),
  targetVideoCodec: z.string().min(1).optional(),
  targetAudioCodec: z.string().min(1).optional(),
  fps: z.number().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  threads: z.number().int().nonnegative().optional(),
});
export type TranscodeJobParams = z.infer<typeof transcodeJobParamsSchema>;

export const renderJobParamsSchema = z.object({
  presetId: z.string().min(1),
  sourceTimelineId: z.string().min(1),
  totalFrames: z.number().int().positive(),
  templateId: z.string().min(1).optional(),
  exportSettings: metadataRecordSchema.default({}),
  fps: z.number().positive().optional(),
  threads: z.number().int().nonnegative().optional(),
});
export type RenderJobParams = z.infer<typeof renderJobParamsSchema>;

export const transcriptionJobParamsSchema = z.object({
  captionFormat: z.enum(['srt', 'vtt', 'json']).default('srt'),
  language: z.string().min(1).default('auto'),
  task: z.enum(['transcribe', 'translate']).default('transcribe'),
  diarize: z.boolean().default(false),
  transcriptionProvider: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
});
export type TranscriptionJobParams = z.infer<typeof transcriptionJobParamsSchema>;

export const ingestJobSchema = executionJobBaseSchema.extend({
  type: z.literal('ingest'),
});
export type IngestJob = z.infer<typeof ingestJobSchema>;

export const probeJobSchema = executionJobBaseSchema.extend({
  type: z.literal('probe'),
  params: probeJobParamsSchema,
});
export type ProbeJob = z.infer<typeof probeJobSchema>;

export const transcodeJobSchema = executionJobBaseSchema.extend({
  type: z.literal('transcode'),
  params: transcodeJobParamsSchema,
});
export type TranscodeJob = z.infer<typeof transcodeJobSchema>;

export const renderJobSchema = executionJobBaseSchema.extend({
  type: z.literal('render'),
  params: renderJobParamsSchema,
});
export type RenderJob = z.infer<typeof renderJobSchema>;

export const transcriptionJobSchema = executionJobBaseSchema.extend({
  type: z.literal('transcription'),
  params: transcriptionJobParamsSchema,
});
export type TranscriptionJob = z.infer<typeof transcriptionJobSchema>;

export const encodeJobSchema = executionJobBaseSchema.extend({
  type: z.literal('encode'),
});
export type EncodeJob = z.infer<typeof encodeJobSchema>;

export const effectsJobSchema = executionJobBaseSchema.extend({
  type: z.literal('effects'),
});
export type EffectsJob = z.infer<typeof effectsJobSchema>;

export const mediaJobSchema = z.discriminatedUnion('type', [
  ingestJobSchema,
  probeJobSchema,
  transcodeJobSchema,
  renderJobSchema,
  transcriptionJobSchema,
  encodeJobSchema,
  effectsJobSchema,
]);
export type MediaJob = z.infer<typeof mediaJobSchema>;

export const renderJobSubmissionSchema = z.object({
  name: z.string().min(1).max(200),
  presetId: z.string().min(1).max(200),
  sourceTimelineId: z.string().min(1),
  totalFrames: z.number().int().positive(),
  priority: jobPrioritySchema.optional(),
  templateId: z.string().max(200).optional(),
  exportSettings: metadataRecordSchema.optional(),
  segmentCount: z.number().int().positive().optional(),
  inputUrl: z.string().min(1).optional(),
  outputPath: z.string().min(1).optional(),
  codec: z.string().min(1).optional(),
  artifactManifest: artifactManifestSchema.optional(),
  capabilityRequirements: capabilityRequirementSchema.optional(),
  lineage: jobLineageSchema.optional(),
});
export type RenderJobSubmission = z.infer<typeof renderJobSubmissionSchema>;

export const workerRegistrationSchema = z.object({
  hostname: z.string().min(1).max(500),
  ip: z.string().max(50).optional(),
  port: z.number().int().min(0).max(65535).optional(),
  workerTypes: z.array(mediaWorkerKindInputSchema).default(['render']),
  capabilities: workerCapabilityReportSchema.partial().optional(),
});
export type WorkerRegistration = z.infer<typeof workerRegistrationSchema>;

export const graphNodeKindSchema = z.enum([
  'probe',
  'transcode',
  'render',
  'transcription',
  'merge',
  'qc',
  'publish',
]);
export type GraphNodeKind = z.infer<typeof graphNodeKindSchema>;

export const graphNodeSchema = z.object({
  id: z.string().min(1),
  kind: graphNodeKindSchema,
  dependsOn: z.array(z.string().min(1)).default([]),
  job: z.union([probeJobSchema, transcodeJobSchema, renderJobSchema, transcriptionJobSchema]).optional(),
  config: metadataRecordSchema.default({}),
  outputArtifactIds: z.array(z.string().min(1)).default([]),
});
export type GraphNode = z.infer<typeof graphNodeSchema>;

export const graphEvaluationRequestSchema = z.object({
  graphId: z.string().min(1),
  rootNodeIds: z.array(z.string().min(1)).min(1),
  nodes: z.array(graphNodeSchema).min(1),
  artifactManifest: artifactManifestSchema.optional(),
  variantManifest: variantManifestSchema.optional(),
  lineage: jobLineageSchema.optional(),
  metadata: metadataRecordSchema.default({}),
});
export type GraphEvaluationRequest = z.infer<typeof graphEvaluationRequestSchema>;

export const coordinatorToWorkerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('job:assign'),
    job: mediaJobSchema,
  }),
  z.object({
    type: z.literal('job:cancel'),
    jobId: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('ping'),
  }),
]);
export type CoordinatorToWorkerMessage = z.infer<typeof coordinatorToWorkerMessageSchema>;

export const workerRuntimeSnapshotSchema = z.object({
  hostname: z.string().min(1),
  gpuVendor: z.string().min(1),
  gpuName: z.string().min(1),
  vramMB: z.number().nonnegative(),
  cpuCores: z.number().int().nonnegative(),
  memoryGB: z.number().nonnegative(),
  status: workerLifecycleStatusSchema,
  currentJobId: z.string().min(1).nullable(),
  progress: z.number().min(0).max(100),
  enabledWorkerTypes: z.array(mediaWorkerKindSchema),
  queueDepth: z.number().int().nonnegative(),
});
export type WorkerRuntimeSnapshot = z.infer<typeof workerRuntimeSnapshotSchema>;

export const queueStatsSchema = z.object({
  pending: z.number().int().nonnegative(),
  running: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  timedOut: z.number().int().nonnegative(),
  retriesExhausted: z.number().int().nonnegative(),
  totalEnqueued: z.number().int().nonnegative(),
  avgWaitTimeMs: z.number().nonnegative(),
});
export type QueueStats = z.infer<typeof queueStatsSchema>;

export const resourceUsageSchema = z.object({
  cpuPercent: z.number().min(0).max(100),
  memoryPercent: z.number().min(0).max(100),
  freeMemoryMB: z.number().nonnegative(),
  freeDiskBytes: z.number().nonnegative(),
  loadAverage: z.number().nonnegative(),
  timestamp: isoTimestampSchema,
});
export type ResourceUsage = z.infer<typeof resourceUsageSchema>;

export const workerToCoordinatorMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('register'),
    node: workerRuntimeSnapshotSchema,
    queueStats: queueStatsSchema.optional(),
  }),
  z.object({
    type: z.literal('unregister'),
    hostname: z.string().min(1),
  }),
  z.object({
    type: z.literal('health'),
    hostname: z.string().min(1),
    healthy: z.boolean(),
    resources: resourceUsageSchema.optional(),
    warnings: z.array(z.string()).default([]),
    queueStats: queueStatsSchema.optional(),
  }),
  z.object({
    type: z.literal('pong'),
    status: workerLifecycleStatusSchema,
    progress: z.number().min(0).max(100).optional(),
    currentJobId: z.string().min(1).nullable().optional(),
    hostname: z.string().min(1),
    queueDepth: z.number().int().nonnegative(),
    activeJobCount: z.number().int().nonnegative(),
    resources: resourceUsageSchema.nullish(),
  }),
  z.object({
    type: z.literal('job:started'),
    jobId: z.string().min(1),
  }),
  z.object({
    type: z.literal('job:queued'),
    jobId: z.string().min(1),
    queuePosition: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('job:reject'),
    jobId: z.string().min(1),
    reason: z.string().min(1),
  }),
  z.object({
    type: z.literal('job:retrying'),
    jobId: z.string().min(1),
    error: z.string().min(1),
  }),
  z.object({
    type: z.literal('job:progress'),
    jobId: z.string().min(1),
    progress: z.number().min(0).max(100),
    detail: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('job:complete'),
    jobId: z.string().min(1),
    result: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('job:failed'),
    jobId: z.string().min(1),
    error: z.string().min(1),
    errorCategory: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('job:cancelled'),
    jobId: z.string().min(1),
    reason: z.string().min(1),
  }),
]);
export type WorkerToCoordinatorMessage = z.infer<typeof workerToCoordinatorMessageSchema>;
