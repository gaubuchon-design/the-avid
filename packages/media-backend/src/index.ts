import {
  assetCapabilityInputSchema,
  assetCapabilityReportSchema,
  artifactManifestSchema,
  capabilityRequirementSchema,
  capabilitySurfaceReportSchema,
  capabilityDispositionSchema,
  capabilitySurfaceSchema,
  colorDescriptorSchema,
  coordinatorToWorkerMessageSchema,
  graphEvaluationRequestSchema,
  jobLineageSchema,
  jobPrioritySchema,
  legacyMediaWorkerKindSchema,
  mediaJobSchema,
  mediaAssetClassSchema,
  mediaSupportTierSchema,
  mediaWorkerKindSchema,
  renderJobSchema,
  renderJobSubmissionSchema,
  transcriptionJobSchema,
  transcodeJobSchema,
  graphicDescriptorSchema,
  probeStreamDescriptorSchema,
  rationalTimebaseSchema,
  probeJobSchema,
  variantManifestSchema,
  workerCapabilityReportSchema,
  workerRegistrationSchema,
  workerToCoordinatorMessageSchema,
  type AssetCapabilityInput,
  type AssetCapabilityReport,
  type ArtifactDescriptor,
  type ArtifactKind,
  type ArtifactManifest,
  type CapabilityDisposition,
  type CapabilityRequirement,
  type CapabilitySurface,
  type CapabilitySurfaceReport,
  type ColorDescriptor,
  type CoordinatorToWorkerMessage,
  type EffectsJob,
  type EncodeJob,
  type GraphicDescriptor,
  type GraphEvaluationRequest,
  type GraphNode,
  type GraphNodeKind,
  type IngestJob,
  type JobLineage,
  type JobLineageEntry,
  type JobPriority,
  type LegacyMediaWorkerKind,
  type MediaJob,
  type MediaAssetClass,
  type MediaSupportTier,
  type MediaWorkerKind,
  type MediaWorkerKindInput,
  type ProbeStreamDescriptor,
  type ProbeJob,
  type ProbeJobParams,
  type QueueStats,
  type RationalTimebase,
  type RenderJob,
  type RenderJobParams,
  type RenderJobSubmission,
  type ResourceUsage,
  type TranscodeJob,
  type TranscodeJobParams,
  type TranscriptionJob,
  type TranscriptionJobParams,
  type VariantDescriptor,
  type VariantManifest,
  type WorkerCapabilityReport,
  type WorkerLifecycleStatus,
  type WorkerRegistration,
  type WorkerRuntimeSnapshot,
  type WorkerToCoordinatorMessage,
} from './schemas';

export * from './schemas';

export const JOB_PRIORITY_WEIGHT: Record<JobPriority, number> = {
  critical: 100,
  high: 75,
  normal: 50,
  low: 25,
  background: 0,
};

const RAW_VIDEO_EXTENSIONS = new Set([
  'ari',
  'arx',
  'braw',
  'cr3',
  'crm',
  'dng',
  'r3d',
  'raf',
]);

const RAW_VIDEO_CODECS = new Set([
  'arriraw',
  'braw',
  'cineformraw',
  'proresraw',
  'redcoderaw',
]);

const PROTECTED_MEDIA_EXTENSIONS = new Set([
  'cpl',
  'ismv',
  'isma',
  'm4p',
]);

const PROTECTED_MEDIA_TOKENS = new Set([
  'cenc',
  'drm',
  'fairplay',
  'playready',
  'widevine',
]);

const WEB_NATIVE_VIDEO_EXTENSIONS = new Set(['m4v', 'mp4', 'ogv', 'webm']);
const WEB_NATIVE_VIDEO_CONTAINERS = new Set(['m4v', 'mp4', 'mov', 'ogg', 'ogv', 'webm']);
const WEB_NATIVE_VIDEO_CODECS = new Set(['av1', 'avc1', 'h263', 'h264', 'hevc', 'mpeg4', 'theora', 'vp8', 'vp9']);
const WEB_NATIVE_AUDIO_EXTENSIONS = new Set(['aac', 'm4a', 'mp3', 'oga', 'ogg', 'wav']);
const WEB_NATIVE_AUDIO_CONTAINERS = new Set(['aac', 'm4a', 'mp3', 'ogg', 'oga', 'wav']);
const WEB_NATIVE_AUDIO_CODECS = new Set([
  'aac',
  'alac',
  'flac',
  'mp3',
  'opus',
  'pcms16le',
  'pcms24le',
  'vorbis',
]);
const WEB_NATIVE_BITMAP_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'jpg', 'jpeg', 'png', 'webp']);

const MOBILE_NATIVE_VIDEO_EXTENSIONS = new Set(['m4v', 'mov', 'mp4']);
const MOBILE_NATIVE_VIDEO_CONTAINERS = new Set(['m4v', 'mov', 'mp4']);
const MOBILE_NATIVE_VIDEO_CODECS = new Set(['avc1', 'h264', 'hevc']);
const MOBILE_NATIVE_AUDIO_EXTENSIONS = new Set(['aac', 'm4a', 'mp3', 'wav']);
const MOBILE_NATIVE_AUDIO_CONTAINERS = new Set(['aac', 'm4a', 'mp3', 'wav']);
const MOBILE_NATIVE_AUDIO_CODECS = new Set(['aac', 'alac', 'mp3', 'pcms16le', 'pcms24le']);
const MOBILE_NATIVE_BITMAP_EXTENSIONS = new Set(['gif', 'jpg', 'jpeg', 'png', 'webp']);

const HIGH_BIT_DEPTH_BITMAP_EXTENSIONS = new Set(['dpx', 'exr', 'tga', 'tif', 'tiff']);

const SURFACE_ORDER: CapabilitySurface[] = ['desktop', 'web', 'mobile', 'worker'];

function normalizeCapabilityToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function tokenizeCapabilityValue(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/[,\s/()+-]+/)
    .map((token) => normalizeCapabilityToken(token))
    .filter(Boolean);
}

function collectCapabilityTokens(...values: Array<string | undefined>): Set<string> {
  return new Set(values.flatMap((value) => tokenizeCapabilityValue(value)));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function getVideoStream(streams: readonly ProbeStreamDescriptor[]): ProbeStreamDescriptor | undefined {
  return streams.find((stream) => stream.kind === 'video');
}

function getAudioStream(streams: readonly ProbeStreamDescriptor[]): ProbeStreamDescriptor | undefined {
  return streams.find((stream) => stream.kind === 'audio');
}

function getPrimaryAudioChannels(input: AssetCapabilityInput): number {
  return input.audioChannels
    ?? getAudioStream(input.streams)?.audioChannels
    ?? 0;
}

function getPrimaryAudioLayout(input: AssetCapabilityInput): string | undefined {
  return input.audioChannelLayout
    ?? getAudioStream(input.streams)?.audioChannelLayout;
}

function hasHdrMetadata(input: AssetCapabilityInput): boolean {
  const descriptor = input.colorDescriptor ?? getVideoStream(input.streams)?.colorDescriptor;
  return descriptor?.hdrMode === 'pq' || descriptor?.hdrMode === 'hlg' || descriptor?.hdrMode === 'dolby-vision';
}

function hasAlpha(input: AssetCapabilityInput): boolean {
  const descriptor = input.colorDescriptor ?? getVideoStream(input.streams)?.colorDescriptor;
  if (descriptor?.alphaMode && descriptor.alphaMode !== 'none' && descriptor.alphaMode !== 'unknown') {
    return true;
  }
  return Boolean(input.graphicDescriptor?.hasAlpha);
}

function isVariableFrameRate(input: AssetCapabilityInput): boolean {
  const videoStream = getVideoStream(input.streams);
  const nominal = videoStream?.frameRate?.framesPerSecond ?? videoStream?.frameRate?.numerator;
  const average = videoStream?.averageFrameRate?.framesPerSecond ?? videoStream?.averageFrameRate?.numerator;
  if (!nominal || !average) {
    return false;
  }
  return Math.abs(nominal - average) > 0.01;
}

function hasReadyVariant(
  input: AssetCapabilityInput,
  purposes: readonly string[],
): AssetCapabilityInput['variants'][number] | undefined {
  return input.variants.find((variant) => purposes.includes(variant.purpose) && variant.availability === 'ready');
}

function getPreferredVariantId(input: AssetCapabilityInput): string | undefined {
  return hasReadyVariant(input, ['playback', 'proxy', 'graphic-render', 'managed', 'source'])?.id
    ?? input.variants[0]?.id;
}

function getFileExtensionToken(input: AssetCapabilityInput): string | undefined {
  const tokens = tokenizeCapabilityValue(input.fileExtension);
  return tokens[0];
}

function getContainerTokens(input: AssetCapabilityInput): Set<string> {
  return collectCapabilityTokens(
    input.container,
    input.containerLongName,
    ...input.variants.map((variant) => variant.container),
  );
}

function getVideoCodecTokens(input: AssetCapabilityInput): Set<string> {
  return collectCapabilityTokens(
    input.videoCodec,
    ...input.variants.map((variant) => variant.videoCodec),
    ...input.streams.filter((stream) => stream.kind === 'video').map((stream) => stream.codec),
  );
}

function getAudioCodecTokens(input: AssetCapabilityInput): Set<string> {
  return collectCapabilityTokens(
    input.audioCodec,
    ...input.variants.map((variant) => variant.audioCodec),
    ...input.streams.filter((stream) => stream.kind === 'audio').map((stream) => stream.codec),
  );
}

function isProtectedOrUnsupported(input: AssetCapabilityInput): boolean {
  const extension = getFileExtensionToken(input);
  if (extension && PROTECTED_MEDIA_EXTENSIONS.has(extension)) {
    return true;
  }

  const tokens = new Set([
    ...getContainerTokens(input),
    ...getVideoCodecTokens(input),
    ...getAudioCodecTokens(input),
  ]);
  return Array.from(tokens).some((token) => PROTECTED_MEDIA_TOKENS.has(token));
}

function isWebNativeBitmap(input: AssetCapabilityInput): boolean {
  const extension = getFileExtensionToken(input);
  return Boolean(extension && WEB_NATIVE_BITMAP_EXTENSIONS.has(extension));
}

function isMobileNativeBitmap(input: AssetCapabilityInput): boolean {
  const extension = getFileExtensionToken(input);
  return Boolean(extension && MOBILE_NATIVE_BITMAP_EXTENSIONS.has(extension));
}

function hasSetIntersection(actual: Set<string>, expected: Set<string>): boolean {
  return Array.from(actual).some((value) => expected.has(value));
}

function isWebNativeVideo(input: AssetCapabilityInput): boolean {
  const extension = getFileExtensionToken(input);
  const containerTokens = getContainerTokens(input);
  const videoCodecTokens = getVideoCodecTokens(input);
  const audioCodecTokens = getAudioCodecTokens(input);

  const hasContainer = (extension && WEB_NATIVE_VIDEO_EXTENSIONS.has(extension))
    || hasSetIntersection(containerTokens, WEB_NATIVE_VIDEO_CONTAINERS);
  const hasVideoCodec = videoCodecTokens.size === 0 || hasSetIntersection(videoCodecTokens, WEB_NATIVE_VIDEO_CODECS);
  const hasAudioCodec = audioCodecTokens.size === 0 || hasSetIntersection(audioCodecTokens, WEB_NATIVE_AUDIO_CODECS);

  return Boolean(hasContainer && hasVideoCodec && hasAudioCodec);
}

function isMobileNativeVideo(input: AssetCapabilityInput): boolean {
  const extension = getFileExtensionToken(input);
  const containerTokens = getContainerTokens(input);
  const videoCodecTokens = getVideoCodecTokens(input);
  const audioCodecTokens = getAudioCodecTokens(input);

  const hasContainer = (extension && MOBILE_NATIVE_VIDEO_EXTENSIONS.has(extension))
    || hasSetIntersection(containerTokens, MOBILE_NATIVE_VIDEO_CONTAINERS);
  const hasVideoCodec = videoCodecTokens.size === 0 || hasSetIntersection(videoCodecTokens, MOBILE_NATIVE_VIDEO_CODECS);
  const hasAudioCodec = audioCodecTokens.size === 0 || hasSetIntersection(audioCodecTokens, MOBILE_NATIVE_AUDIO_CODECS);

  return Boolean(hasContainer && hasVideoCodec && hasAudioCodec);
}

function isWebNativeAudio(input: AssetCapabilityInput): boolean {
  const extension = getFileExtensionToken(input);
  const containerTokens = getContainerTokens(input);
  const audioCodecTokens = getAudioCodecTokens(input);
  return Boolean(
    ((extension && WEB_NATIVE_AUDIO_EXTENSIONS.has(extension)) || hasSetIntersection(containerTokens, WEB_NATIVE_AUDIO_CONTAINERS))
    && (audioCodecTokens.size === 0 || hasSetIntersection(audioCodecTokens, WEB_NATIVE_AUDIO_CODECS)),
  );
}

function isMobileNativeAudio(input: AssetCapabilityInput): boolean {
  const extension = getFileExtensionToken(input);
  const containerTokens = getContainerTokens(input);
  const audioCodecTokens = getAudioCodecTokens(input);
  return Boolean(
    ((extension && MOBILE_NATIVE_AUDIO_EXTENSIONS.has(extension)) || hasSetIntersection(containerTokens, MOBILE_NATIVE_AUDIO_CONTAINERS))
    && (audioCodecTokens.size === 0 || hasSetIntersection(audioCodecTokens, MOBILE_NATIVE_AUDIO_CODECS)),
  );
}

function isHighBitDepthBitmap(input: AssetCapabilityInput): boolean {
  const extension = getFileExtensionToken(input);
  const bitDepth = input.colorDescriptor?.bitDepth ?? input.streams.find((stream) => stream.kind === 'video')?.colorDescriptor?.bitDepth;
  return Boolean((extension && HIGH_BIT_DEPTH_BITMAP_EXTENSIONS.has(extension)) || (bitDepth && bitDepth > 8));
}

function buildUnsupportedReasons(input: AssetCapabilityInput): string[] {
  const extension = input.fileExtension ? `.${input.fileExtension}` : 'this asset';
  if (input.assetClass === 'document') {
    return [
      'Document assets are preserved for relink and audit history, but no editable media path is defined.',
    ];
  }
  if (isProtectedOrUnsupported(input)) {
    return [
      `${extension} is a protected or proprietary media format without a configured backend adapter.`,
    ];
  }
  return [
    'No supported decode, adapter, or normalization path is currently defined for this asset.',
  ];
}

function buildNormalizedDisposition(
  surface: CapabilitySurface,
  preferredVariantId: string | undefined,
): CapabilitySurfaceReport {
  const disposition: CapabilityDisposition = surface === 'worker'
    ? 'mezzanine-required'
    : preferredVariantId
    ? 'proxy-only'
    : 'mezzanine-required';
  return capabilitySurfaceReportSchema.parse({
    surface,
    disposition,
    supportTier: 'normalized',
    preferredVariantId,
    reasons: uniqueStrings([
      'The canonical source is preserved, but editorial work should run against a normalized derivative.',
      preferredVariantId
        ? 'A ready playback or proxy variant is already available for this surface.'
        : 'No ready playback variant exists yet, so a proxy or mezzanine must be generated first.',
    ]),
  });
}

function buildAdapterDisposition(
  surface: CapabilitySurface,
  preferredVariantId: string | undefined,
  assetClass: MediaAssetClass,
): CapabilitySurfaceReport {
  const canUseDerivative = Boolean(preferredVariantId) && assetClass !== 'subtitle';
  const disposition: CapabilityDisposition = canUseDerivative ? 'proxy-only' : surface === 'worker' && assetClass === 'subtitle' ? 'native' : 'adapter-required';
  const reasons = canUseDerivative
    ? [
        'The original source requires an adapter or flattening step before it can be edited directly.',
        'A ready render-safe companion variant is available for playback and render routing.',
      ]
    : surface === 'worker' && assetClass === 'subtitle'
    ? [
        'Structured subtitle sidecars can be parsed on worker surfaces without media decoding.',
      ]
    : [
        'This asset class needs an adapter, parser, or rendered companion before it can participate in timeline playback.',
      ];

  return capabilitySurfaceReportSchema.parse({
    surface,
    disposition,
    supportTier: 'adapter',
    preferredVariantId,
    reasons,
  });
}

function buildNativeOrSurfaceBoundDisposition(
  surface: CapabilitySurface,
  input: AssetCapabilityInput,
  supportTier: Exclude<MediaSupportTier, 'adapter' | 'normalized' | 'unsupported'>,
  preferredVariantId: string | undefined,
): CapabilitySurfaceReport {
  const reasons: string[] = [];
  const audioChannels = getPrimaryAudioChannels(input);
  const audioLayout = normalizeCapabilityToken(getPrimaryAudioLayout(input) ?? '');
  const hdr = hasHdrMetadata(input);
  const alpha = hasAlpha(input);
  const variableFrameRate = isVariableFrameRate(input);
  const nativeProxyDisposition = preferredVariantId ? 'proxy-only' : 'mezzanine-required';

  if (surface === 'worker') {
    return capabilitySurfaceReportSchema.parse({
      surface,
      disposition: 'native',
      supportTier,
      preferredVariantId,
      reasons: [
        'Distributed workers can operate on the canonical source without a browser-safe playback restriction.',
      ],
    });
  }

  if (surface === 'desktop') {
    return capabilitySurfaceReportSchema.parse({
      surface,
      disposition: 'native',
      supportTier,
      preferredVariantId,
      reasons: [
        'The canonical source can be used directly on the desktop workstation path.',
      ],
    });
  }

  if (input.assetClass === 'video') {
    const webSafe = surface === 'web' ? isWebNativeVideo(input) : isMobileNativeVideo(input);
    if (!webSafe) {
      reasons.push(`${surface === 'web' ? 'Browser' : 'Mobile'} playback requires a more constrained video container and codec set.`);
    }
    if (hdr) {
      reasons.push('HDR or wide-gamut video should be tone-mapped or normalized for this surface.');
    }
    if (alpha) {
      reasons.push('Video assets with alpha need a rendered companion for consistent playback on this surface.');
    }
    if (variableFrameRate) {
      reasons.push('Variable or mixed frame-rate video should be conformed before interactive playback on this surface.');
    }
    if (reasons.length > 0) {
      return capabilitySurfaceReportSchema.parse({
        surface,
        disposition: nativeProxyDisposition,
        supportTier,
        preferredVariantId,
        reasons: uniqueStrings([
          ...reasons,
          preferredVariantId
            ? 'A ready playback or proxy variant is already available for this surface.'
            : 'No ready playback variant exists yet, so a mezzanine or proxy is required.',
        ]),
      });
    }
  }

  if (input.assetClass === 'audio') {
    const webSafe = surface === 'web' ? isWebNativeAudio(input) : isMobileNativeAudio(input);
    if (!webSafe) {
      reasons.push(`${surface === 'web' ? 'Browser' : 'Mobile'} playback requires a more constrained audio container or codec set.`);
    }
    if (audioChannels > 2 || (audioLayout && !['20', 'mono', 'stereo'].includes(audioLayout))) {
      reasons.push('Multichannel audio should be normalized or downmixed for this surface.');
    }
    if (reasons.length > 0) {
      return capabilitySurfaceReportSchema.parse({
        surface,
        disposition: nativeProxyDisposition,
        supportTier,
        preferredVariantId,
        reasons: uniqueStrings([
          ...reasons,
          preferredVariantId
            ? 'A ready playback or proxy variant is already available for this surface.'
            : 'No ready playback variant exists yet, so a mezzanine or proxy is required.',
        ]),
      });
    }
  }

  if (input.assetClass === 'bitmap') {
    const safeBitmap = surface === 'web' ? isWebNativeBitmap(input) : isMobileNativeBitmap(input);
    if (!safeBitmap) {
      reasons.push(`${surface === 'web' ? 'Browser' : 'Mobile'} review uses a narrower still-image format set than desktop.`);
    }
    if (isHighBitDepthBitmap(input)) {
      reasons.push('High-bit-depth stills should be normalized before review on this surface.');
    }
    if (reasons.length > 0) {
      return capabilitySurfaceReportSchema.parse({
        surface,
        disposition: nativeProxyDisposition,
        supportTier,
        preferredVariantId,
        reasons: uniqueStrings([
          ...reasons,
          preferredVariantId
            ? 'A ready playback or proxy variant is already available for this surface.'
            : 'No ready playback variant exists yet, so a mezzanine or proxy is required.',
        ]),
      });
    }
  }

  return capabilitySurfaceReportSchema.parse({
    surface,
    disposition: 'native',
    supportTier,
    preferredVariantId,
    reasons: [
      'The canonical source can be used directly on this surface.',
    ],
  });
}

export function normalizeMediaWorkerKind(kind: MediaWorkerKindInput): MediaWorkerKind {
  switch (kind) {
    case 'metadata':
      return 'probe';
    case 'transcribe':
      return 'transcription';
    default:
      return kind;
  }
}

export function normalizeWorkerKindList(kinds: readonly MediaWorkerKindInput[]): MediaWorkerKind[] {
  return Array.from(new Set(kinds.map((kind) => normalizeMediaWorkerKind(kind))));
}

export function normalizeWorkerCapabilityReport(
  report: Partial<WorkerCapabilityReport>,
  workerKinds: readonly MediaWorkerKindInput[] = [],
): WorkerCapabilityReport {
  return workerCapabilityReportSchema.parse({
    gpuVendor: report.gpuVendor ?? 'unknown',
    gpuName: report.gpuName ?? 'unknown',
    vramMB: report.vramMB ?? 0,
    cpuCores: report.cpuCores ?? 0,
    memoryGB: report.memoryGB ?? 0,
    availableCodecs: report.availableCodecs ?? [],
    supportedContainers: report.supportedContainers ?? [],
    ffmpegVersion: report.ffmpegVersion ?? 'unknown',
    maxConcurrentJobs: report.maxConcurrentJobs ?? 1,
    hwAccel: report.hwAccel ?? [],
    workerKinds: normalizeWorkerKindList([
      ...workerKinds,
      ...(report.workerKinds ?? []),
    ]),
    features: report.features ?? [],
    artifactRoots: report.artifactRoots ?? [],
  });
}

export function inferMediaSupportTier(input: AssetCapabilityInput): MediaSupportTier {
  const parsed = assetCapabilityInputSchema.parse(input);
  if (parsed.supportTier) {
    return parsed.supportTier;
  }

  if (parsed.assetClass === 'document') {
    return 'unsupported';
  }
  if (parsed.assetClass === 'subtitle' || parsed.assetClass === 'vector' || parsed.assetClass === 'layered-graphic') {
    return 'adapter';
  }
  if (isProtectedOrUnsupported(parsed)) {
    return 'unsupported';
  }

  const extension = getFileExtensionToken(parsed);
  const videoCodecTokens = getVideoCodecTokens(parsed);
  if ((extension && RAW_VIDEO_EXTENSIONS.has(extension)) || hasSetIntersection(videoCodecTokens, RAW_VIDEO_CODECS)) {
    return 'normalized';
  }

  return 'native';
}

export function createAssetCapabilityReport(
  input: AssetCapabilityInput,
  options: {
    primarySurface?: CapabilitySurface;
    updatedAt?: string;
  } = {},
): AssetCapabilityReport {
  const parsed = assetCapabilityInputSchema.parse(input);
  const supportTier = inferMediaSupportTier(parsed);
  const primarySurface = options.primarySurface ?? 'desktop';
  const preferredVariantId = getPreferredVariantId(parsed);

  const surfaces = SURFACE_ORDER.map((surface) => {
    if (supportTier === 'unsupported') {
      return capabilitySurfaceReportSchema.parse({
        surface,
        disposition: 'unsupported',
        supportTier,
        preferredVariantId,
        reasons: buildUnsupportedReasons(parsed),
      });
    }

    if (supportTier === 'normalized') {
      return buildNormalizedDisposition(surface, preferredVariantId);
    }

    if (supportTier === 'adapter') {
      return buildAdapterDisposition(surface, preferredVariantId, parsed.assetClass);
    }

    return buildNativeOrSurfaceBoundDisposition(surface, parsed, supportTier, preferredVariantId);
  });

  const primaryDisposition = surfaces.find((surface) => surface.surface === primarySurface)?.disposition ?? 'unsupported';
  const issues = uniqueStrings(
    surfaces
      .filter((surface) => surface.disposition !== 'native')
      .flatMap((surface) => surface.reasons),
  );

  return assetCapabilityReportSchema.parse({
    primarySurface,
    primaryDisposition,
    sourceSupportTier: supportTier,
    preferredVariantId,
    surfaces,
    issues,
    updatedAt: options.updatedAt,
  });
}

export function jobPriorityToWorkerScore(priority: JobPriority): number {
  return JOB_PRIORITY_WEIGHT[priority];
}

export function workerScoreToJobPriority(score: number): JobPriority {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'normal';
  if (score >= 10) return 'low';
  return 'background';
}

export function inferCapabilityRequirements(job: MediaJob): CapabilityRequirement {
  const explicit = capabilityRequirementSchema.parse(job.capabilityRequirements ?? {});
  const workerKinds = explicit.workerKinds.length > 0
    ? explicit.workerKinds
    : [job.type];
  const params = job.params as Record<string, unknown>;
  const codecs = explicit.codecs.length > 0
    ? explicit.codecs
    : [
        job.codec,
        typeof params['targetVideoCodec'] === 'string' ? params['targetVideoCodec'] : undefined,
        typeof params['targetAudioCodec'] === 'string' ? params['targetAudioCodec'] : undefined,
      ].filter((value): value is string => Boolean(value));

  return capabilityRequirementSchema.parse({
    ...explicit,
    workerKinds,
    codecs,
  });
}

export function matchesCapabilityRequirements(
  report: WorkerCapabilityReport,
  requirements?: CapabilityRequirement,
): boolean {
  if (!requirements) {
    return true;
  }

  if (requirements.workerKinds.length > 0) {
    const workerKinds = report.workerKinds.length > 0
      ? report.workerKinds
      : [];
    const supportsKind = requirements.workerKinds.some((kind) => workerKinds.includes(kind));
    if (!supportsKind) {
      return false;
    }
  }

  if (requirements.codecs.length > 0) {
    const codecSet = new Set(report.availableCodecs.map((codec) => codec.toLowerCase()));
    const supportsCodec = requirements.codecs.every((codec) => codecSet.has(codec.toLowerCase()));
    if (!supportsCodec) {
      return false;
    }
  }

  if (requirements.hwAccel.length > 0) {
    const accelSet = new Set(report.hwAccel.map((value) => value.toLowerCase()));
    const supportsAccel = requirements.hwAccel.every((accel) => accelSet.has(accel.toLowerCase()));
    if (!supportsAccel) {
      return false;
    }
  }

  if ((requirements.minCpuCores ?? 0) > report.cpuCores) {
    return false;
  }
  if ((requirements.minMemoryGB ?? 0) > report.memoryGB) {
    return false;
  }
  if ((requirements.minVramMB ?? 0) > report.vramMB) {
    return false;
  }

  return true;
}

export function matchesWorkerToJob(report: WorkerCapabilityReport, job: MediaJob): boolean {
  return matchesCapabilityRequirements(report, inferCapabilityRequirements(job));
}

export function appendJobLineage(lineage: JobLineage, entry: JobLineageEntry): JobLineage {
  return jobLineageSchema.parse({
    rootJobId: lineage.rootJobId,
    entries: [...lineage.entries, entry],
  });
}

export function createArtifactManifest(input: {
  manifestId: string;
  jobId: string;
  createdAt: string;
  projectId?: string;
  assetId?: string;
  artifacts?: ArtifactDescriptor[];
  metadata?: Record<string, unknown>;
}): ArtifactManifest {
  return artifactManifestSchema.parse({
    manifestId: input.manifestId,
    jobId: input.jobId,
    createdAt: input.createdAt,
    projectId: input.projectId,
    assetId: input.assetId,
    artifacts: input.artifacts ?? [],
    metadata: input.metadata ?? {},
  });
}

export function createVariantManifest(input: {
  manifestId: string;
  createdAt: string;
  assetId?: string;
  canonicalArtifactId?: string;
  variants?: VariantDescriptor[];
  metadata?: Record<string, unknown>;
}): VariantManifest {
  return variantManifestSchema.parse({
    manifestId: input.manifestId,
    assetId: input.assetId,
    canonicalArtifactId: input.canonicalArtifactId,
    variants: input.variants ?? [],
    createdAt: input.createdAt,
    metadata: input.metadata ?? {},
  });
}

export function pickVariant(manifest: VariantManifest, purposes: readonly string[]): VariantDescriptor | undefined {
  return manifest.variants.find((variant) => purposes.includes(variant.purpose));
}

export function createGraphEvaluationRequest(input: GraphEvaluationRequest): GraphEvaluationRequest {
  return graphEvaluationRequestSchema.parse(input);
}

export function createRenderExecutionJob(
  jobId: string,
  submission: RenderJobSubmission,
  overrides: Partial<RenderJob> = {},
): RenderJob {
  const parsedSubmission = renderJobSubmissionSchema.parse(submission);
  const priority = overrides.priority ?? jobPriorityToWorkerScore(parsedSubmission.priority ?? 'normal');
  return renderJobSchema.parse({
    id: jobId,
    type: 'render',
    inputUrl: overrides.inputUrl ?? parsedSubmission.inputUrl ?? `timeline://${parsedSubmission.sourceTimelineId}`,
    outputPath: overrides.outputPath ?? parsedSubmission.outputPath,
    outputFormat: overrides.outputFormat ?? 'mov',
    codec: overrides.codec ?? parsedSubmission.codec,
    startFrame: overrides.startFrame,
    endFrame: overrides.endFrame,
    priority,
    params: {
      presetId: parsedSubmission.presetId,
      sourceTimelineId: parsedSubmission.sourceTimelineId,
      totalFrames: parsedSubmission.totalFrames,
      templateId: parsedSubmission.templateId,
      exportSettings: parsedSubmission.exportSettings ?? {},
      ...(overrides.params ?? {}),
    },
    artifactManifest: overrides.artifactManifest ?? parsedSubmission.artifactManifest,
    lineage: overrides.lineage ?? parsedSubmission.lineage,
    capabilityRequirements: overrides.capabilityRequirements ?? parsedSubmission.capabilityRequirements,
  });
}

export function normalizeMediaJob(job: MediaJob | (Omit<MediaJob, 'type'> & { type: MediaWorkerKindInput })): MediaJob {
  return mediaJobSchema.parse({
    ...job,
    type: normalizeMediaWorkerKind(job.type),
  });
}

export function parseCoordinatorToWorkerMessage(payload: unknown): CoordinatorToWorkerMessage {
  const raw = payload as Record<string, unknown>;
  if (raw?.['type'] === 'job:assign' && raw['job']) {
    return coordinatorToWorkerMessageSchema.parse({
      ...raw,
      job: normalizeMediaJob(raw['job'] as MediaJob | (Omit<MediaJob, 'type'> & { type: MediaWorkerKindInput })),
    });
  }
  return coordinatorToWorkerMessageSchema.parse(payload);
}

export function parseWorkerToCoordinatorMessage(payload: unknown): WorkerToCoordinatorMessage {
  return workerToCoordinatorMessageSchema.parse(payload);
}

export {
  assetCapabilityInputSchema,
  assetCapabilityReportSchema,
  artifactManifestSchema,
  capabilityRequirementSchema,
  capabilityDispositionSchema,
  capabilitySurfaceReportSchema,
  capabilitySurfaceSchema,
  colorDescriptorSchema,
  coordinatorToWorkerMessageSchema,
  graphicDescriptorSchema,
  graphEvaluationRequestSchema,
  jobLineageSchema,
  jobPrioritySchema,
  legacyMediaWorkerKindSchema,
  mediaAssetClassSchema,
  mediaJobSchema,
  mediaSupportTierSchema,
  mediaWorkerKindSchema,
  probeStreamDescriptorSchema,
  probeJobSchema,
  rationalTimebaseSchema,
  renderJobSchema,
  renderJobSubmissionSchema,
  transcriptionJobSchema,
  transcodeJobSchema,
  variantManifestSchema,
  workerCapabilityReportSchema,
  workerRegistrationSchema,
  workerToCoordinatorMessageSchema,
};
