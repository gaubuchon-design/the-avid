import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  AAFExporter,
  ProToolsAAFExporter,
  type AudioAutomationWrite,
  type AudioChannelLayout,
  type AudioDecodeRequest,
  type AudioMixCompilation,
  type CompositeFrameRequest,
  type CompositedVideoFrame,
  createReferenceNLEParityRuntime,
  type DecodedAudioSlice,
  type DecodedVideoFrame,
  flattenAssets,
  getMediaAssetPlaybackUrl,
  getMediaAssetPrimaryPath,
  type ChangeEvent,
  type ChangeListPort,
  type ChangeListArtifact,
  type LoudnessMeasurement,
  type EditorMediaAsset,
  type EditorProject,
  type InterchangeAssetReference,
  type InterchangeFormat,
  type InterchangePackage,
  type InterchangeValidationResult,
  type InterchangePort,
  type ManagedMediaRelinkRequest,
  type ManagedMediaRelinkResult,
  type MediaLocator,
  type MediaManagementPort,
  type MotionFrameRequest,
  type MotionEffectsPort,
  type MotionRenderResult,
  type MotionTemplateDescriptor,
  type MulticamCutEvent,
  type MulticamGroupRequest,
  type MulticamGroupResult,
  type MulticamPort,
  type NativeResourceHandle,
  type PlaybackCacheStrategy,
  type PlaybackQualityLevel,
  type PlaybackSessionDescriptor,
  type PlaybackStreamPressure,
  type PlaybackStreamDescriptor,
  type PlaybackTelemetry,
  type ProfessionalAudioMixPort,
  type ProfessionalMediaDecodePort,
  type RealtimePlaybackPort,
  type ReferenceNLEParityRuntime,
  type ReferenceNLEParityRuntimeOptions,
  type ReferenceSequenceRevision,
  type RenderGraphCompilation,
  type RenderGraphNode,
  type SequenceDiffRequest,
  type SequenceRevisionId,
  type TimeRange,
  type TimelineRenderSnapshot,
  type TranscodeRequest,
  type ConsolidateRequest,
  type VideoCompositingPort,
  type FrameRange,
  type MediaDecodeRequest,
  getAudioChannelCountForLayout,
  buildAudioMixTopology,
  normalizeAudioChannelLayoutLabel,
  pickDominantAudioChannelLayout,
  resolveAudioBusProcessingChain,
  summarizeAudioBusProcessingPolicy,
  type AudioTrackRoutingDescriptor,
  MultiCamEngine,
  createMultiCamSyncEngine,
} from '@mcua/core';
import {
  composeFrameArtifact,
  createProjectMediaPaths,
  ensureProjectMediaPaths,
  extractAudioSliceArtifact,
  extractVideoFrameArtifact,
  relinkProjectMedia,
  transcodeExportArtifact,
  writeConformExportPackage,
  writeMediaIndexManifest,
  type ExportTranscodeRequest,
  type ProjectMediaPaths,
} from '../mediaPipeline';
import { FrameTransport, createFrameTransport } from '../videoIO/FrameTransport';
import type { PlaybackConfig } from '../videoIO/types';

export interface DesktopProjectBinding {
  project: EditorProject;
  projectPackagePath: string;
}

export interface DesktopMediaPipelineBindings {
  createProjectMediaPaths: typeof createProjectMediaPaths;
  ensureProjectMediaPaths: typeof ensureProjectMediaPaths;
  relinkProjectMedia: typeof relinkProjectMedia;
  writeMediaIndexManifest: typeof writeMediaIndexManifest;
  transcodeExportArtifact: typeof transcodeExportArtifact;
  writeConformExportPackage: typeof writeConformExportPackage;
  extractVideoFrameArtifact: typeof extractVideoFrameArtifact;
  extractAudioSliceArtifact: typeof extractAudioSliceArtifact;
  composeFrameArtifact: typeof composeFrameArtifact;
}

export interface DesktopFsBindings {
  copyFile: typeof copyFile;
  mkdir: typeof mkdir;
  readFile: typeof readFile;
  rm: typeof rm;
  stat: typeof stat;
  writeFile: typeof writeFile;
}

export interface DesktopPlaybackOutputBindings {
  startPlayback(config: PlaybackConfig): Promise<void> | void;
  stopPlayback(deviceId: string): Promise<void> | void;
  sendFrame(deviceId: string, frameData: Buffer): Promise<void> | void;
}

export interface DesktopNativeMediaManagementAdapterOptions {
  pipeline?: Partial<DesktopMediaPipelineBindings>;
  fs?: Partial<DesktopFsBindings>;
  playbackOutput?: Partial<DesktopPlaybackOutputBindings>;
}

export interface DesktopNativeParityRuntimeOptions extends ReferenceNLEParityRuntimeOptions {
  projectBindings?: DesktopProjectBinding[];
  mediaAdapterOptions?: DesktopNativeMediaManagementAdapterOptions;
  referenceRuntime?: ReferenceNLEParityRuntime;
}

export interface DesktopPlaybackTransportView {
  buffer: SharedArrayBuffer;
  width: number;
  height: number;
  bytesPerPixel: number;
  slots: number;
}

interface BoundDesktopProject {
  project: EditorProject;
  packagePath: string;
  mediaPaths: ProjectMediaPaths;
}

const DEFAULT_PIPELINE_BINDINGS: DesktopMediaPipelineBindings = {
  createProjectMediaPaths,
  ensureProjectMediaPaths,
  relinkProjectMedia,
  writeMediaIndexManifest,
  transcodeExportArtifact,
  writeConformExportPackage,
  extractVideoFrameArtifact,
  extractAudioSliceArtifact,
  composeFrameArtifact,
};

const DEFAULT_FS_BINDINGS: DesktopFsBindings = {
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
};

const DEFAULT_MOTION_TEMPLATES: MotionTemplateDescriptor[] = [
  { templateId: 'title-lower-third', kind: 'lower-third', version: '1.0.0' },
  { templateId: 'title-center', kind: 'title', version: '1.0.0' },
  { templateId: 'motion-push-blur', kind: 'effect-stack', version: '1.0.0' },
];

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeFilesystemPath(filePath: string | undefined): string | undefined {
  if (!filePath) {
    return undefined;
  }
  if (filePath.startsWith('file://')) {
    try {
      return fileURLToPath(filePath);
    } catch {
      return filePath;
    }
  }
  return filePath;
}

function normalizeCodec(codec: string): string {
  return codec.trim().toLowerCase();
}

function inferTargetContainer(codec: string, sourceContainer: string): string {
  const normalized = normalizeCodec(codec);
  if (normalized.includes('prores')) {
    return 'mov';
  }
  if (normalized.includes('dnx')) {
    return 'mxf';
  }
  if (normalized.includes('av1') || normalized.includes('vp9')) {
    return 'webm';
  }
  if (normalized.includes('wav') || normalized.includes('pcm')) {
    return 'wav';
  }
  if (normalized === 'original') {
    return sourceContainer;
  }
  return 'mp4';
}

function isProxyTarget(codec: string): boolean {
  const normalized = normalizeCodec(codec);
  return normalized.includes('proxy') || normalized.includes('lb');
}

function safeExtension(asset: EditorMediaAsset): string {
  return (asset.fileExtension ?? 'mov').replace(/^\./, '') || 'mov';
}

function formatTimecodeFromFrame(frame: number, fps: number): string {
  const safeFps = Math.max(1, Math.round(fps || 24));
  const totalFrames = Math.max(0, Math.round(frame));
  const frames = totalFrames % safeFps;
  const totalSeconds = Math.floor(totalFrames / safeFps);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return [hours, minutes, seconds, frames]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
}

function createSolidBgraFrame(width: number, height: number, seedText: string): Buffer {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const digest = Buffer.from(seedText, 'utf8');
  const buffer = Buffer.alloc(safeWidth * safeHeight * 4);
  for (let index = 0; index < safeWidth * safeHeight; index += 1) {
    const offset = index * 4;
    const seed = digest[index % Math.max(digest.length, 1)] ?? 0x42;
    buffer[offset] = seed;
    buffer[offset + 1] = (seed + 41) % 256;
    buffer[offset + 2] = (seed + 83) % 256;
    buffer[offset + 3] = 255;
  }
  return buffer;
}

function parsePpmHeader(data: Uint8Array): { width: number; height: number; maxValue: number; pixelOffset: number } | null {
  if (data[0] !== 0x50 || data[1] !== 0x36) {
    return null;
  }

  let cursor = 2;
  const tokens: string[] = [];
  while (cursor < data.length && tokens.length < 3) {
    while (cursor < data.length && /\s/.test(String.fromCharCode(data[cursor]!))) {
      cursor += 1;
    }
    if (cursor >= data.length) {
      break;
    }
    if (data[cursor] === 0x23) {
      while (cursor < data.length && data[cursor] !== 0x0a) {
        cursor += 1;
      }
      continue;
    }

    const start = cursor;
    while (cursor < data.length && !/\s/.test(String.fromCharCode(data[cursor]!))) {
      cursor += 1;
    }
    tokens.push(Buffer.from(data.subarray(start, cursor)).toString('ascii'));
  }

  while (cursor < data.length && /\s/.test(String.fromCharCode(data[cursor]!))) {
    cursor += 1;
  }

  if (tokens.length < 3) {
    return null;
  }

  const width = Number(tokens[0]);
  const height = Number(tokens[1]);
  const maxValue = Number(tokens[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(maxValue) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    width,
    height,
    maxValue,
    pixelOffset: cursor,
  };
}

function convertPpmToBgra(data: Uint8Array, fallbackWidth: number, fallbackHeight: number): { width: number; height: number; pixelData: Buffer } {
  const header = parsePpmHeader(data);
  if (!header) {
    return {
      width: fallbackWidth,
      height: fallbackHeight,
      pixelData: createSolidBgraFrame(fallbackWidth, fallbackHeight, 'invalid-ppm'),
    };
  }

  const { width, height, pixelOffset } = header;
  const expectedBytes = width * height * 3;
  const rgb = data.subarray(pixelOffset, pixelOffset + expectedBytes);
  if (rgb.length < expectedBytes) {
    return {
      width: fallbackWidth,
      height: fallbackHeight,
      pixelData: createSolidBgraFrame(fallbackWidth, fallbackHeight, 'short-ppm'),
    };
  }

  const bgra = Buffer.alloc(width * height * 4);
  for (let rgbOffset = 0, bgraOffset = 0; rgbOffset < expectedBytes; rgbOffset += 3, bgraOffset += 4) {
    bgra[bgraOffset] = rgb[rgbOffset + 2] ?? 0;
    bgra[bgraOffset + 1] = rgb[rgbOffset + 1] ?? 0;
    bgra[bgraOffset + 2] = rgb[rgbOffset] ?? 0;
    bgra[bgraOffset + 3] = 255;
  }

  return { width, height, pixelData: bgra };
}

function createHandle(prefix: string, projectId: string, sequence = Date.now()): string {
  return `${prefix}-${projectId}-${sequence.toString(36)}`;
}

async function fileExists(fsBindings: DesktopFsBindings, filePath: string | undefined): Promise<boolean> {
  const resolvedPath = normalizeFilesystemPath(filePath);
  if (!resolvedPath) {
    return false;
  }
  try {
    await fsBindings.stat(resolvedPath);
    return true;
  } catch {
    return false;
  }
}

function countTracks(project: EditorProject, type: 'VIDEO' | 'AUDIO'): number {
  return project.tracks.filter((track) => track.type === type).length;
}

function buildProjectSnapshot(
  project: EditorProject,
  sequenceId: string,
  revisionId: SequenceRevisionId,
): TimelineRenderSnapshot {
  return {
    projectId: project.id,
    sequenceId,
    revisionId,
    fps: project.settings.frameRate,
    sampleRate: project.settings.sampleRate,
    durationSeconds: Math.max(
      ...project.tracks.flatMap((track) => track.clips.map((clip) => clip.endTime)),
      0,
    ),
    videoLayerCount: countTracks(project, 'VIDEO'),
    audioTrackCount: countTracks(project, 'AUDIO'),
    output: {
      width: project.settings.width,
      height: project.settings.height,
      colorSpace: 'Rec.709',
    },
  };
}

function incrementPatchVersion(version: string): string {
  const [major = '1', minor = '0', patch = '0'] = version.split('.');
  const nextPatch = Number.isFinite(Number(patch)) ? Number(patch) + 1 : 1;
  return `${major}.${minor}.${nextPatch}`;
}

function inferPlaybackTarget(streams: PlaybackStreamDescriptor[]): CompositeFrameRequest['target'] {
  if (streams.some((stream) => stream.role === 'multicam-angle')) {
    return 'multicam';
  }
  if (streams.some((stream) => stream.role === 'source-monitor')) {
    return 'source-monitor';
  }
  return 'record-monitor';
}

function createPlaybackTelemetry(frameBudgetMs: number): PlaybackTelemetry {
  return {
    activeStreamCount: 0,
    droppedVideoFrames: 0,
    audioUnderruns: 0,
    maxDecodeLatencyMs: 0,
    maxCompositeLatencyMs: 0,
    currentQuality: 'full',
    cacheStrategy: 'source-only',
    streamPressure: 'single',
    frameBudgetMs,
    lastFrameRenderLatencyMs: 0,
    lastFrameCacheHitRate: 0,
    promotedFrameCount: 0,
  };
}

function createPlaybackPolicyState(frameBudgetMs: number): DesktopPlaybackPolicyState {
  return {
    currentQuality: 'full',
    cacheStrategy: 'source-only',
    streamPressure: 'single',
    frameBudgetMs,
    lastFrameRenderLatencyMs: 0,
    lastFrameCacheHitRate: 0,
    promotedFrameCount: 0,
    promotionLookaheadFrames: 0,
    overBudgetWindow: 0,
    pendingPromotionKeys: new Set<string>(),
  };
}

function demotePlaybackQuality(quality: PlaybackQualityLevel): PlaybackQualityLevel {
  switch (quality) {
    case 'full':
      return 'preview';
    case 'preview':
      return 'draft';
    default:
      return 'draft';
  }
}

function promotePlaybackQuality(quality: PlaybackQualityLevel): PlaybackQualityLevel {
  switch (quality) {
    case 'draft':
      return 'preview';
    case 'preview':
      return 'full';
    default:
      return 'full';
  }
}

function determineStreamPressure(
  videoStreamCount: number,
  audioStreamCount: number,
  snapshot: TimelineRenderSnapshot,
): PlaybackStreamPressure {
  const weightedPressure = videoStreamCount
    + (Math.max(0, audioStreamCount - 1) * 0.35)
    + (Math.max(0, snapshot.videoLayerCount - 1) * 0.5);
  if (weightedPressure >= 5) {
    return 'heavy';
  }
  if (weightedPressure >= 2) {
    return 'multi';
  }
  return 'single';
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

interface ResolvedAudioTrackLayout {
  trackId: string;
  trackName: string;
  layout: AudioChannelLayout;
  channelCount: number;
  clipLayouts: AudioChannelLayout[];
}

interface AudioSignalSummary {
  averagePeak: number;
  peakHold: number;
}

function resolveAudioTrackLayouts(project: EditorProject): ResolvedAudioTrackLayout[] {
  const assetMap = new Map(flattenAssets(project.bins).map((asset) => [asset.id, asset] as const));

  return project.tracks
    .filter((track) => track.type === 'AUDIO')
    .map((track) => {
      const clipLayouts = track.clips.map((clip) => {
        const asset = clip.assetId ? assetMap.get(clip.assetId) : undefined;
        return normalizeAudioChannelLayoutLabel(
          asset?.technicalMetadata?.audioChannelLayout,
          asset?.technicalMetadata?.audioChannels,
        );
      });
      const layout = pickDominantAudioChannelLayout(clipLayouts);
      return {
        trackId: track.id,
        trackName: track.name,
        layout,
        channelCount: getAudioChannelCountForLayout(layout),
        clipLayouts: uniqueStrings(clipLayouts) as AudioChannelLayout[],
      };
    });
}

function summarizeAudioSignal(project: EditorProject): AudioSignalSummary {
  const peaks = flattenAssets(project.bins)
    .filter((asset) => asset.type === 'AUDIO' || (asset.technicalMetadata?.audioChannels ?? 0) > 0)
    .flatMap((asset) => asset.waveformMetadata?.peaks ?? asset.waveformData ?? []);

  if (peaks.length === 0) {
    return {
      averagePeak: 0.35,
      peakHold: 0.5,
    };
  }

  return {
    averagePeak: peaks.reduce((sum, value) => sum + value, 0) / peaks.length,
    peakHold: peaks.reduce((max, value) => Math.max(max, value), 0),
  };
}

function createDefaultAutomationModes(trackLayouts: ResolvedAudioTrackLayout[]): NonNullable<AudioMixCompilation['automationModes']> {
  return trackLayouts.map((track) => ({
    trackId: track.trackId,
    mode: 'read',
    touchedParameters: [],
  }));
}

function applyAutomationWriteToCompilation(
  compilation: AudioMixCompilation,
  automation: AudioAutomationWrite,
): AudioMixCompilation {
  const existing = compilation.automationModes ?? [];
  const nextEntry = existing.find((entry) => entry.trackId === automation.trackId);
  const nextMode = automation.mode ?? 'write';
  const touchedParameters = uniqueStrings([
    ...(nextEntry?.touchedParameters ?? []),
    automation.parameter,
  ]) as NonNullable<AudioMixCompilation['automationModes']>[number]['touchedParameters'];

  const automationModes = nextEntry
    ? existing.map((entry) => entry.trackId === automation.trackId
      ? { ...entry, mode: nextMode, touchedParameters }
      : entry)
    : [
      ...existing,
      {
        trackId: automation.trackId,
        mode: nextMode,
        touchedParameters: [automation.parameter],
      },
    ];

  return {
    ...compilation,
    automationModes,
  };
}

function deriveMediaLocators(project: EditorProject): MediaLocator[] {
  const locators: MediaLocator[] = [];

  for (const asset of flattenAssets(project.bins)) {
    if (asset.locations?.originalPath) {
      locators.push({
        assetId: asset.id,
        path: asset.locations.originalPath,
        role: 'original',
        online: false,
      });
    }

    if (asset.locations?.managedPath) {
      locators.push({
        assetId: asset.id,
        path: asset.locations.managedPath,
        role: 'managed',
        online: false,
      });
    }

    if (asset.proxyMetadata?.filePath) {
      locators.push({
        assetId: asset.id,
        path: asset.proxyMetadata.filePath,
        role: 'proxy',
        online: false,
      });
    }
  }

  return locators;
}

function sanitizeArtifactBase(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'artifact';
}

function buildInterchangeAssets(project: EditorProject): InterchangeAssetReference[] {
  return flattenAssets(project.bins).map((asset) => ({
    assetId: asset.id,
    sourcePath: asset.locations?.managedPath ?? asset.locations?.originalPath ?? asset.playbackUrl,
    reel: asset.technicalMetadata?.reelName ?? asset.relinkIdentity?.reelName,
    timecode: asset.technicalMetadata?.timecodeStart ?? asset.relinkIdentity?.sourceTimecodeStart,
    durationSeconds: asset.duration ?? asset.technicalMetadata?.durationSeconds,
  }));
}

function timelineSecondsForFrame(frame: number, fps: number): number {
  return Math.max(0, frame / Math.max(fps, 0.001));
}

function resolveClipSourceFrame(
  clip: EditorProject['tracks'][number]['clips'][number],
  timelineFrame: number,
  fps: number,
): number {
  const clipStartFrame = Math.round(clip.startTime * fps);
  const timelineOffsetFrames = Math.max(0, timelineFrame - clipStartFrame);
  const trimStartFrames = Math.round((clip.trimStart ?? 0) * fps);
  return trimStartFrames + timelineOffsetFrames;
}

function buildDecodeCacheKey(
  snapshot: TimelineRenderSnapshot,
  assetId: string,
  frame: number,
  variant: string,
  pixelFormat: string | undefined,
  width: number,
  height: number,
): string {
  return [
    snapshot.projectId,
    snapshot.sequenceId,
    snapshot.revisionId,
    assetId,
    frame,
    variant,
    pixelFormat ?? 'default',
    width,
    height,
  ].join('::');
}

function buildAudioCacheKey(
  snapshot: TimelineRenderSnapshot,
  assetId: string,
  request: AudioDecodeRequest,
  channelCount: number,
  sampleRate: number,
): string {
  return [
    snapshot.projectId,
    snapshot.sequenceId,
    snapshot.revisionId,
    assetId,
    request.timeRange.startSeconds.toFixed(6),
    request.timeRange.endSeconds.toFixed(6),
    request.variant,
    channelCount,
    sampleRate,
  ].join('::');
}

function buildCompositeCacheKey(
  state: DesktopCompositorGraphState,
  request: CompositeFrameRequest,
  layers: ActiveVideoLayer[],
): string {
  return [
    state.snapshot.projectId,
    state.snapshot.sequenceId,
    state.snapshot.revisionId,
    request.target,
    request.quality,
    request.frame,
    ...layers.map((layer) => `${layer.trackId}:${layer.assetId}:${layer.timelineFrame}:${layer.sourcePath}`),
  ].join('::');
}

function activeVideoLayersForFrame(
  project: EditorProject,
  snapshot: TimelineRenderSnapshot,
  frame: number,
): ActiveVideoLayer[] {
  const timelineSeconds = timelineSecondsForFrame(frame, snapshot.fps);
  const assets = new Map(flattenAssets(project.bins).map((asset) => [asset.id, asset] as const));

  return project.tracks
    .filter((track) => track.type === 'VIDEO')
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .flatMap((track) => {
      const clip = track.clips
        .filter((entry) => entry.type === 'video')
        .find((entry) => timelineSeconds >= entry.startTime && timelineSeconds < entry.endTime);
      if (!clip?.assetId) {
        return [];
      }

      const asset = assets.get(clip.assetId);
      const sourcePath = normalizeFilesystemPath(asset ? getMediaAssetPrimaryPath(asset) : undefined);
      if (!sourcePath) {
        return [];
      }

      return [{
        trackId: track.id,
        assetId: clip.assetId,
        sourcePath,
        timelineFrame: resolveClipSourceFrame(clip, frame, snapshot.fps),
      }];
    });
}

interface DesktopDecodeSessionState {
  handle: NativeResourceHandle;
  projectId: string;
  manifestPath: string;
  snapshot: TimelineRenderSnapshot;
  descriptor: PlaybackSessionDescriptor;
  prerollRanges: FrameRange[];
  videoArtifacts: Record<string, DesktopDecodedVideoArtifact>;
  audioArtifacts: Record<string, DesktopDecodedAudioArtifact>;
  releasedAt?: string;
}

interface DesktopCompositorGraphState {
  projectId: string;
  manifestPath: string;
  snapshot: TimelineRenderSnapshot;
  compilation: RenderGraphCompilation;
  renderedFrames: number[];
  renderedArtifacts: Record<string, DesktopRenderedCompositeArtifact>;
}

interface DesktopPlaybackTransportState {
  handle: NativeResourceHandle;
  projectId: string;
  manifestPath: string;
  snapshot: TimelineRenderSnapshot;
  streams: PlaybackStreamDescriptor[];
  prerollRange: FrameRange | null;
  activeFrame: number;
  playing: boolean;
  decodeSessionHandle: NativeResourceHandle;
  graphId: string;
  telemetry: PlaybackTelemetry;
  lastCompositeHandle?: NativeResourceHandle;
  lastCompositeArtifactPath?: string;
  decodedVideoArtifacts: DesktopDecodedVideoArtifact[];
  decodedAudioArtifacts: DesktopDecodedAudioArtifact[];
  frameTransport: FrameTransport;
  frameTransportView: DesktopPlaybackTransportView;
  attachedOutputConfigs: PlaybackConfig[];
  activeOutputDeviceIds: string[];
  inFlightTasks: Set<Promise<void>>;
  policy: DesktopPlaybackPolicyState;
  scheduler: {
    loopToken: number;
    timer: ReturnType<typeof setTimeout> | null;
    startedAtMs: number;
    startFrame: number;
    playbackRate: number;
    lastRenderedFrame: number;
    running: boolean;
  } | null;
}

interface DesktopPlaybackPolicyState {
  currentQuality: PlaybackQualityLevel;
  cacheStrategy: PlaybackCacheStrategy;
  streamPressure: PlaybackStreamPressure;
  frameBudgetMs: number;
  lastFrameRenderLatencyMs: number;
  lastFrameCacheHitRate: number;
  promotedFrameCount: number;
  promotionLookaheadFrames: number;
  overBudgetWindow: number;
  pendingPromotionKeys: Set<string>;
}

interface DesktopDecodedVideoArtifact extends DecodedVideoFrame {
  artifactPath: string;
  sourcePath: string;
  cacheHit: boolean;
  decodeLatencyMs: number;
}

interface DesktopDecodedAudioArtifact extends DecodedAudioSlice {
  artifactPath: string;
  sourcePath: string;
  cacheHit: boolean;
  decodeLatencyMs: number;
}

interface DesktopRenderedCompositeArtifact extends CompositedVideoFrame {
  artifactPath: string;
  layerAssetIds: string[];
  layerSourcePaths: string[];
  layerTrackIds: string[];
  cacheHit: boolean;
  compositeLatencyMs: number;
}

interface ActiveVideoLayer {
  trackId: string;
  assetId: string;
  sourcePath: string;
  timelineFrame: number;
}

interface DesktopAudioMixState {
  mixId: string;
  projectId: string;
  manifestPath: string;
  snapshot: TimelineRenderSnapshot;
  compilation: AudioMixCompilation;
  trackLayouts: ResolvedAudioTrackLayout[];
  automationWrites: AudioAutomationWrite[];
  previewHandles: NativeResourceHandle[];
  lastLoudness?: LoudnessMeasurement;
}

interface DesktopMulticamState {
  projectId: string;
  request: MulticamGroupRequest;
  groupResult: MulticamGroupResult;
  coreGroupId: string;
  syncGroupId: string;
  manifestPath: string;
  transportHandle?: NativeResourceHandle;
  multiviewHandle?: NativeResourceHandle;
  preparedRange?: FrameRange;
  recordedCuts: MulticamCutEvent[];
  commitHandle?: NativeResourceHandle;
}

export class DesktopNativeMediaManagementAdapter implements MediaManagementPort {
  private readonly pipeline: DesktopMediaPipelineBindings;
  private readonly fsBindings: DesktopFsBindings;
  private readonly bindings = new Map<string, BoundDesktopProject>();

  constructor(options: DesktopNativeMediaManagementAdapterOptions = {}) {
    this.pipeline = {
      ...DEFAULT_PIPELINE_BINDINGS,
      ...options.pipeline,
    };
    this.fsBindings = {
      ...DEFAULT_FS_BINDINGS,
      ...options.fs,
    };
  }

  async bindProject(binding: DesktopProjectBinding): Promise<void> {
    const mediaPaths = this.pipeline.createProjectMediaPaths(binding.projectPackagePath);
    await this.pipeline.ensureProjectMediaPaths(mediaPaths);
    await this.pipeline.writeMediaIndexManifest(
      binding.project.id,
      flattenAssets(binding.project.bins),
      mediaPaths,
    );

    this.bindings.set(binding.project.id, {
      project: cloneValue(binding.project),
      packagePath: binding.projectPackagePath,
      mediaPaths,
    });
  }

  getBoundProject(projectId: string): EditorProject | undefined {
    const binding = this.bindings.get(projectId);
    return binding ? cloneValue(binding.project) : undefined;
  }

  getProjectBinding(projectId: string): DesktopProjectBinding | undefined {
    const binding = this.bindings.get(projectId);
    if (!binding) {
      return undefined;
    }
    return {
      project: cloneValue(binding.project),
      projectPackagePath: binding.packagePath,
    };
  }

  async auditAssetLocations(projectId: string): Promise<MediaLocator[]> {
    const binding = this.requireBinding(projectId);
    const locators = deriveMediaLocators(binding.project);

    return Promise.all(locators.map(async (locator) => ({
      ...locator,
      online: await fileExists(this.fsBindings, locator.path),
    })));
  }

  async relink(request: ManagedMediaRelinkRequest): Promise<ManagedMediaRelinkResult> {
    const binding = this.requireBinding(request.projectId);
    const before = new Map(
      flattenAssets(binding.project.bins).map((asset) => [asset.id, asset.status] as const),
    );

    const { project } = await this.pipeline.relinkProjectMedia(
      cloneValue(binding.project),
      binding.mediaPaths,
      request.searchRoots,
    );

    binding.project = project;
    await this.pipeline.writeMediaIndexManifest(
      project.id,
      flattenAssets(project.bins),
      binding.mediaPaths,
    );

    const relinkedAssetIds: string[] = [];
    const unresolvedAssetIds: string[] = [];
    for (const assetId of request.assetIds) {
      const asset = flattenAssets(project.bins).find((entry) => entry.id === assetId);
      const priorStatus = before.get(assetId);
      if (asset && asset.status === 'READY' && priorStatus !== 'READY') {
        relinkedAssetIds.push(assetId);
      } else {
        unresolvedAssetIds.push(assetId);
      }
    }

    return {
      relinkedAssetIds,
      unresolvedAssetIds,
      candidatesReviewed: request.searchRoots.length,
    };
  }

  async consolidate(request: ConsolidateRequest): Promise<NativeResourceHandle> {
    const binding = this.requireBinding(request.projectId);
    await this.fsBindings.mkdir(request.targetRoot, { recursive: true });

    for (const assetId of request.assetIds) {
      const asset = flattenAssets(binding.project.bins).find((entry) => entry.id === assetId);
      const sourcePath = asset ? getMediaAssetPrimaryPath(asset) : undefined;
      if (!asset || !sourcePath) {
        continue;
      }

      const targetPath = path.join(request.targetRoot, `${asset.name}.${safeExtension(asset)}`);
      await this.fsBindings.copyFile(sourcePath, targetPath);
      this.updateAsset(binding, assetId, (current) => ({
        ...current,
        status: 'READY',
        indexStatus: 'READY',
        locations: {
          ...(current.locations ?? { pathHistory: [] }),
          managedPath: targetPath,
          relativeManagedPath: path.relative(binding.packagePath, targetPath),
          playbackUrl: current.locations?.playbackUrl ?? current.playbackUrl,
          pathHistory: Array.from(new Set([...(current.locations?.pathHistory ?? []), targetPath])),
        },
      }));
    }

    await this.pipeline.writeMediaIndexManifest(
      binding.project.id,
      flattenAssets(binding.project.bins),
      binding.mediaPaths,
    );

    return createHandle('desktop-consolidate', request.projectId);
  }

  async transcode(request: TranscodeRequest): Promise<NativeResourceHandle> {
    const binding = this.requireBinding(request.projectId);
    await this.fsBindings.mkdir(request.targetRoot, { recursive: true });

    for (const assetId of request.assetIds) {
      const asset = flattenAssets(binding.project.bins).find((entry) => entry.id === assetId);
      const sourcePath = asset ? getMediaAssetPrimaryPath(asset) : undefined;
      if (!asset || !sourcePath) {
        continue;
      }

      const sourceArtifact = await this.fsBindings.readFile(sourcePath);
      const sourceContainer = safeExtension(asset);
      const targetContainer = inferTargetContainer(request.targetCodec, sourceContainer);
      const jobId = `${binding.project.id}-${asset.id}-${normalizeCodec(request.targetCodec).replace(/[^a-z0-9]+/g, '-')}`;

      const result = await this.pipeline.transcodeExportArtifact({
        jobId,
        sourceArtifact,
        sourceContainer,
        targetContainer,
        targetVideoCodec: request.targetCodec,
        targetAudioCodec: asset.type === 'AUDIO' ? request.targetCodec : undefined,
        fps: asset.technicalMetadata?.frameRate ?? binding.project.settings.frameRate,
        width: request.resolution?.width ?? asset.technicalMetadata?.width,
        height: request.resolution?.height ?? asset.technicalMetadata?.height,
      }, request.targetRoot);

      const outputPlaybackUrl = pathToFileURL(result.outputPath).toString();
      this.updateAsset(binding, assetId, (current) => ({
        ...current,
        status: 'READY',
        indexStatus: 'READY',
        proxyMetadata: isProxyTarget(request.targetCodec)
          ? {
              status: 'READY',
              filePath: result.outputPath,
              playbackUrl: outputPlaybackUrl,
              codec: result.outputVideoCodec,
              width: request.resolution?.width,
              height: request.resolution?.height,
              updatedAt: new Date().toISOString(),
            }
          : current.proxyMetadata,
        locations: isProxyTarget(request.targetCodec)
          ? {
              ...(current.locations ?? { pathHistory: [] }),
              playbackUrl: outputPlaybackUrl,
              pathHistory: Array.from(new Set([...(current.locations?.pathHistory ?? []), result.outputPath])),
            }
          : {
              ...(current.locations ?? { pathHistory: [] }),
              managedPath: result.outputPath,
              relativeManagedPath: path.relative(binding.packagePath, result.outputPath),
              playbackUrl: outputPlaybackUrl,
              pathHistory: Array.from(new Set([...(current.locations?.pathHistory ?? []), result.outputPath])),
            },
      }));
    }

    await this.pipeline.writeMediaIndexManifest(
      binding.project.id,
      flattenAssets(binding.project.bins),
      binding.mediaPaths,
    );

    return createHandle('desktop-transcode', request.projectId);
  }

  private requireBinding(projectId: string): BoundDesktopProject {
    const binding = this.bindings.get(projectId);
    if (!binding) {
      throw new Error(`No desktop project binding registered for ${projectId}`);
    }
    return binding;
  }

  private updateAsset(
    binding: BoundDesktopProject,
    assetId: string,
    mutate: (asset: EditorMediaAsset) => EditorMediaAsset,
  ): void {
    binding.project = {
      ...binding.project,
      bins: binding.project.bins.map((bin) => this.updateBinAsset(bin, assetId, mutate)),
    };
  }

  private updateBinAsset(
    bin: EditorProject['bins'][number],
    assetId: string,
    mutate: (asset: EditorMediaAsset) => EditorMediaAsset,
  ): EditorProject['bins'][number] {
    return {
      ...bin,
      assets: bin.assets.map((asset) => (asset.id === assetId ? mutate(asset) : cloneValue(asset))),
      children: bin.children.map((child) => this.updateBinAsset(child, assetId, mutate)),
    };
  }
}

export class DesktopNativeInterchangeAdapter implements InterchangePort {
  private readonly pipeline: DesktopMediaPipelineBindings;
  private readonly fsBindings: DesktopFsBindings;
  private readonly bindings = new Map<string, BoundDesktopProject>();
  private readonly packages = new Map<string, InterchangePackage>();

  constructor(options: DesktopNativeMediaManagementAdapterOptions = {}) {
    this.pipeline = {
      ...DEFAULT_PIPELINE_BINDINGS,
      ...options.pipeline,
    };
    this.fsBindings = {
      ...DEFAULT_FS_BINDINGS,
      ...options.fs,
    };
  }

  async bindProject(binding: DesktopProjectBinding): Promise<void> {
    const mediaPaths = this.pipeline.createProjectMediaPaths(binding.projectPackagePath);
    await this.pipeline.ensureProjectMediaPaths(mediaPaths);
    this.bindings.set(binding.project.id, {
      project: cloneValue(binding.project),
      packagePath: binding.projectPackagePath,
      mediaPaths,
    });
  }

  getBoundProject(projectId: string): EditorProject | undefined {
    const binding = this.bindings.get(projectId);
    return binding ? cloneValue(binding.project) : undefined;
  }

  getProjectBinding(projectId: string): DesktopProjectBinding | undefined {
    const binding = this.bindings.get(projectId);
    if (!binding) {
      return undefined;
    }
    return {
      project: cloneValue(binding.project),
      projectPackagePath: binding.packagePath,
    };
  }

  async exportPackage(snapshot: TimelineRenderSnapshot, format: InterchangeFormat): Promise<InterchangePackage> {
    const binding = this.requireBinding(snapshot.projectId);
    const project = cloneValue(binding.project);
    const exportBaseName = `${sanitizeArtifactBase(snapshot.sequenceId)}-${sanitizeArtifactBase(snapshot.revisionId)}-${format.toLowerCase()}`;
    const exportDir = await this.pipeline.writeConformExportPackage(project, binding.mediaPaths, exportBaseName);
    const assets = buildInterchangeAssets(project);
    const primaryArtifacts = await this.writeFormatArtifacts(project, exportDir, snapshot, format);
    let pkg: InterchangePackage = {
      format,
      sequenceId: snapshot.sequenceId,
      revisionId: snapshot.revisionId,
      assets,
      artifactPaths: primaryArtifacts,
    };
    const validation = await this.validatePackage(pkg);
    const auditPath = path.join(exportDir, 'desktop-interchange.audit.json');
    await this.fsBindings.writeFile(auditPath, JSON.stringify({
      exportedAt: new Date().toISOString(),
      format,
      snapshot,
      assets,
      primaryArtifacts,
      validation,
    }, null, 2), 'utf8');
    pkg = {
      ...pkg,
      artifactPaths: [...primaryArtifacts, auditPath],
    };

    const manifestPath = path.join(exportDir, 'desktop-interchange.package.json');
    await this.fsBindings.writeFile(manifestPath, JSON.stringify(pkg, null, 2), 'utf8');
    this.packages.set(manifestPath, cloneValue(pkg));
    for (const artifactPath of pkg.artifactPaths) {
      this.packages.set(artifactPath, cloneValue(pkg));
    }

    return pkg;
  }

  async importPackage(sourcePath: string): Promise<InterchangePackage> {
    const existing = this.packages.get(sourcePath);
    if (existing) {
      return cloneValue(existing);
    }

    const manifestPath = path.join(path.dirname(sourcePath), 'desktop-interchange.package.json');
    if (await fileExists(this.fsBindings, manifestPath)) {
      const serialized = await this.fsBindings.readFile(manifestPath, 'utf8');
      const parsed = JSON.parse(serialized) as InterchangePackage;
      this.packages.set(sourcePath, cloneValue(parsed));
      this.packages.set(manifestPath, cloneValue(parsed));
      return parsed;
    }

    const parsed = await this.importStandaloneArtifact(sourcePath);
    this.packages.set(sourcePath, cloneValue(parsed));
    return parsed;
  }

  async validatePackage(pkg: InterchangePackage): Promise<InterchangeValidationResult> {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (pkg.assets.length === 0) {
      warnings.push('Package contains no media references.');
    }

    for (const asset of pkg.assets) {
      if (!asset.sourcePath) {
        errors.push(`Missing source path for asset ${asset.assetId}.`);
        continue;
      }
      if (!await fileExists(this.fsBindings, asset.sourcePath)) {
        warnings.push(`Referenced media is offline for asset ${asset.assetId}: ${asset.sourcePath}`);
      }
      if (!asset.reel) {
        warnings.push(`Missing reel metadata for asset ${asset.assetId}.`);
      }
      if (!asset.timecode) {
        warnings.push(`Missing source timecode for asset ${asset.assetId}.`);
      }
      if (!asset.durationSeconds || asset.durationSeconds <= 0) {
        warnings.push(`Missing or invalid duration for asset ${asset.assetId}.`);
      }
    }

    for (const artifactPath of pkg.artifactPaths) {
      if (!await fileExists(this.fsBindings, artifactPath)) {
        errors.push(`Missing artifact: ${artifactPath}`);
      }
    }

    const packageDir = pkg.artifactPaths[0] ? path.dirname(pkg.artifactPaths[0]) : null;
    if (packageDir) {
      if (!await fileExists(this.fsBindings, path.join(packageDir, 'project.avid.export.json'))) {
        errors.push('Missing project export manifest.');
      }
      const mediaIndexPath = path.join(packageDir, 'media-index.json');
      if (!await fileExists(this.fsBindings, mediaIndexPath)) {
        warnings.push('Missing media index.');
      } else {
        const mediaIndex = JSON.parse(await this.fsBindings.readFile(mediaIndexPath, 'utf8')) as { assets?: EditorMediaAsset[] };
        if ((mediaIndex.assets?.length ?? 0) !== pkg.assets.length) {
          warnings.push(`Media index asset count (${mediaIndex.assets?.length ?? 0}) does not match interchange asset count (${pkg.assets.length}).`);
        }
      }
    }

    await this.validateFormatArtifacts(pkg, warnings, errors);

    return {
      valid: errors.length === 0,
      warnings: uniqueStrings(warnings),
      errors: uniqueStrings(errors),
    };
  }

  private requireBinding(projectId: string): BoundDesktopProject {
    const binding = this.bindings.get(projectId);
    if (!binding) {
      throw new Error(`No desktop project binding registered for ${projectId}`);
    }
    return binding;
  }

  private async importStandaloneArtifact(sourcePath: string): Promise<InterchangePackage> {
    const format = this.inferFormatFromSourcePath(sourcePath);
    const fallbackSequenceId = sanitizeArtifactBase(path.basename(sourcePath).replace(/\.[^.]+$/g, '')) || 'imported-sequence';

    switch (format) {
      case 'AAF':
      case 'OMF': {
        const composition = JSON.parse(await this.fsBindings.readFile(sourcePath, 'utf8')) as {
          name?: string;
          frameRate?: number;
          clips?: Array<{
            uid?: string;
            clipName?: string;
            reelName?: string;
            sourceMediaRef?: string;
            sourceDurationFrames?: number;
            sourceTimecode?: {
              hours: number;
              minutes: number;
              seconds: number;
              frames: number;
            };
          }>;
        };
        const assets = Array.from(new Map(
          (composition.clips ?? []).map((clip) => {
            const assetId = clip.uid ?? clip.sourceMediaRef ?? clip.clipName ?? 'imported-asset';
            return [assetId, {
              assetId,
              sourcePath: clip.sourceMediaRef,
              reel: clip.reelName,
              timecode: clip.sourceTimecode
                ? [
                    clip.sourceTimecode.hours,
                    clip.sourceTimecode.minutes,
                    clip.sourceTimecode.seconds,
                    clip.sourceTimecode.frames,
                  ].map((value) => String(value).padStart(2, '0')).join(':')
                : undefined,
              durationSeconds: composition.frameRate && clip.sourceDurationFrames != null
                ? clip.sourceDurationFrames / composition.frameRate
                : undefined,
            } satisfies InterchangeAssetReference];
          }),
        ).values());
        return {
          format,
          sequenceId: sanitizeArtifactBase(composition.name ?? fallbackSequenceId),
          revisionId: `${sanitizeArtifactBase(composition.name ?? fallbackSequenceId)}-imported`,
          assets,
          artifactPaths: [sourcePath],
        };
      }
      case 'OTIO': {
        const otio = JSON.parse(await this.fsBindings.readFile(sourcePath, 'utf8')) as {
          name?: string;
          tracks?: {
            children?: Array<{
              children?: Array<{
                name?: string;
                media_reference?: {
                  target_url?: string;
                  metadata?: {
                    technicalMetadata?: { reelName?: string; timecodeStart?: string; durationSeconds?: number };
                  };
                };
              }>;
            }>;
          };
        };
        const assets = Array.from(new Map(
          (otio.tracks?.children ?? [])
            .flatMap((track) => track.children ?? [])
            .map((clip) => {
              const assetId = clip.name ?? clip.media_reference?.target_url ?? 'imported-asset';
              return [assetId, {
                assetId,
                sourcePath: clip.media_reference?.target_url,
                reel: clip.media_reference?.metadata?.technicalMetadata?.reelName,
                timecode: clip.media_reference?.metadata?.technicalMetadata?.timecodeStart,
                durationSeconds: clip.media_reference?.metadata?.technicalMetadata?.durationSeconds,
              } satisfies InterchangeAssetReference];
            }),
        ).values());
        return {
          format,
          sequenceId: sanitizeArtifactBase(otio.name ?? fallbackSequenceId),
          revisionId: `${sanitizeArtifactBase(otio.name ?? fallbackSequenceId)}-imported`,
          assets,
          artifactPaths: [sourcePath],
        };
      }
      case 'XML': {
        const xml = await this.fsBindings.readFile(sourcePath, 'utf8');
        const sequenceMatch = xml.match(/<sequence id="([^"]+)" revision="([^"]+)"/);
        const assets = Array.from(xml.matchAll(/<asset\s+([^>]+?)\s*\/>/g)).map((match) => {
          const attributes = this.parseXmlAttributes(match[1] ?? '');
          return {
            assetId: attributes['id'] ?? 'imported-asset',
            sourcePath: attributes['sourcePath'],
            reel: attributes['reel'],
            timecode: attributes['timecode'],
            durationSeconds: attributes['durationSeconds'] ? Number(attributes['durationSeconds']) : undefined,
          } satisfies InterchangeAssetReference;
        });
        return {
          format,
          sequenceId: sanitizeArtifactBase(sequenceMatch?.[1] ?? fallbackSequenceId),
          revisionId: sanitizeArtifactBase(sequenceMatch?.[2] ?? `${fallbackSequenceId}-imported`),
          assets,
          artifactPaths: [sourcePath],
        };
      }
      case 'EDL': {
        const edl = await this.fsBindings.readFile(sourcePath, 'utf8');
        const title = edl.match(/^TITLE:\s*(.+)$/m)?.[1]?.trim() ?? fallbackSequenceId;
        return {
          format,
          sequenceId: sanitizeArtifactBase(title),
          revisionId: `${sanitizeArtifactBase(title)}-imported`,
          assets: [],
          artifactPaths: [sourcePath],
        };
      }
      default:
        throw new Error(`Unsupported interchange artifact import: ${sourcePath}`);
    }
  }

  private async validateFormatArtifacts(
    pkg: InterchangePackage,
    warnings: string[],
    errors: string[],
  ): Promise<void> {
    const primaryArtifact = pkg.artifactPaths.find((artifactPath) => {
      try {
        return this.inferFormatFromSourcePath(artifactPath) === pkg.format;
      } catch {
        return false;
      }
    });

    if (!primaryArtifact) {
      errors.push(`Missing primary ${pkg.format} artifact.`);
      return;
    }

    try {
      switch (pkg.format) {
        case 'AAF':
        case 'OMF': {
          const composition = JSON.parse(await this.fsBindings.readFile(primaryArtifact, 'utf8')) as {
            clips?: unknown[];
            sampleRate?: number;
          };
          AAFExporter.importFromComposition(composition as never);
          if ((composition.clips?.length ?? 0) === 0) {
            warnings.push(`${pkg.format} artifact contains no clips.`);
          }
          if (composition.sampleRate && ![44100, 48000, 96000].includes(composition.sampleRate)) {
            warnings.push(`${pkg.format} artifact uses non-standard sample rate ${composition.sampleRate}Hz.`);
          }
          break;
        }
        case 'OTIO': {
          const otio = JSON.parse(await this.fsBindings.readFile(primaryArtifact, 'utf8')) as {
            OTIO_SCHEMA?: string;
            tracks?: { children?: unknown[] };
          };
          if (otio.OTIO_SCHEMA !== 'Timeline.1') {
            warnings.push('OTIO artifact uses an unexpected schema root.');
          }
          if ((otio.tracks?.children?.length ?? 0) === 0) {
            warnings.push('OTIO artifact contains no tracks.');
          }
          break;
        }
        case 'XML': {
          const xml = await this.fsBindings.readFile(primaryArtifact, 'utf8');
          if (!xml.includes('<sequence ')) {
            errors.push('XML artifact missing sequence root.');
          }
          if (!xml.includes(`<sequence id="${escapeXmlAttribute(pkg.sequenceId)}"`)) {
            warnings.push('XML artifact sequence id does not match the interchange package.');
          }
          if (!xml.includes(`revision="${escapeXmlAttribute(pkg.revisionId)}"`)) {
            warnings.push('XML artifact revision id does not match the interchange package.');
          }
          if (!xml.includes('<mediaIndex ')) {
            warnings.push('XML artifact is missing a media index reference.');
          }
          break;
        }
        case 'EDL': {
          const edl = await this.fsBindings.readFile(primaryArtifact, 'utf8');
          if (!edl.includes('TITLE:')) {
            errors.push('EDL artifact missing TITLE header.');
          }
          const eventLines = edl.split('\n').filter((line) => /^\d{3}\s/.test(line));
          if (eventLines.length === 0) {
            warnings.push('EDL artifact contains no edit events.');
          }
          break;
        }
      }
    } catch (error) {
      errors.push(`Failed to parse ${pkg.format} artifact: ${error instanceof Error ? error.message : String(error)}`);
    }

    const protoolsValidationPath = pkg.artifactPaths.find((artifactPath) => artifactPath.endsWith('protools-turnover.validation.json'));
    if (protoolsValidationPath && await fileExists(this.fsBindings, protoolsValidationPath)) {
      try {
        const validation = JSON.parse(await this.fsBindings.readFile(protoolsValidationPath, 'utf8')) as {
          valid?: boolean;
          issues?: string[];
        };
        if (validation.valid === false) {
          errors.push(...(validation.issues ?? []).map((issue) => `Pro Tools turnover validation: ${issue}`));
        }
      } catch (error) {
        errors.push(`Failed to parse Pro Tools turnover validation report: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const handoffPath = pkg.artifactPaths.find((artifactPath) => artifactPath.endsWith('assistant-editor.handoff.json'));
    if (handoffPath && await fileExists(this.fsBindings, handoffPath)) {
      try {
        const handoff = JSON.parse(await this.fsBindings.readFile(handoffPath, 'utf8')) as {
          signOffStatus?: 'ready' | 'needs-review' | 'blocked';
          blockers?: string[];
          notes?: string[];
        };
        if (handoff.signOffStatus === 'blocked') {
          errors.push(...(handoff.blockers ?? []).map((issue) => `Assistant-editor handoff: ${issue}`));
        } else if (handoff.signOffStatus === 'needs-review') {
          warnings.push(...(handoff.notes ?? []).map((note) => `Assistant-editor handoff: ${note}`));
        }
      } catch (error) {
        errors.push(`Failed to parse assistant-editor handoff report: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private inferFormatFromSourcePath(sourcePath: string): InterchangeFormat {
    const normalized = sourcePath.toLowerCase();
    if (normalized.endsWith('.aaf.json')) {
      return 'AAF';
    }
    if (normalized.endsWith('.omf.json')) {
      return 'OMF';
    }
    if (normalized.endsWith('.otio.json')) {
      return 'OTIO';
    }
    if (normalized.endsWith('.xml')) {
      return 'XML';
    }
    if (normalized.endsWith('.edl')) {
      return 'EDL';
    }
    throw new Error(`Unsupported interchange artifact path: ${sourcePath}`);
  }

  private parseXmlAttributes(attributeBlock: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    for (const match of attributeBlock.matchAll(/([a-zA-Z0-9:_-]+)="([^"]*)"/g)) {
      const key = match[1];
      if (key) {
        attributes[key] = match[2] ?? '';
      }
    }
    return attributes;
  }

  private async evaluateAudioTurnoverPolicy(audioTurnoverPath: string): Promise<{
    issues: string[];
    warnings: string[];
    facilityPolicy: {
      printMasterConfigured: boolean;
      foldDownConfigured: boolean;
      printMasterProcessingComplete: boolean;
      foldDownProcessingComplete: boolean;
      previewPrintSeparationValid: boolean;
      stemRolesAssigned: boolean;
      assistantChecklistComplete: boolean;
    };
  } | null> {
    if (!await fileExists(this.fsBindings, audioTurnoverPath)) {
      return null;
    }

    const parsed = JSON.parse(await this.fsBindings.readFile(audioTurnoverPath, 'utf8')) as {
      audioChannels?: number;
      printMasterBusId?: string;
      monitoringBusId?: string;
      processingWarnings?: string[];
      assistantEditorChecklist?: Array<{
        id: string;
        label?: string;
        status?: 'complete' | 'needs-attention' | 'not-applicable';
      }>;
      buses?: Array<{
        id: string;
        role?: string;
        stemRole?: string;
        processingChain?: Array<{ kind?: string }>;
        previewProcessingChain?: Array<{ kind?: string }>;
        printProcessingChain?: Array<{ kind?: string }>;
      }>;
    };

    const issues: string[] = [];
    const warnings: string[] = [...(parsed.processingWarnings ?? [])];
    const buses = parsed.buses ?? [];
    const printMasterBus = buses.find((bus) => bus.id === parsed.printMasterBusId || bus.role === 'printmaster');
    const foldDownBus = buses.find((bus) => bus.role === 'fold-down' || (parsed.monitoringBusId === 'fold-down' && bus.id === parsed.monitoringBusId));
    const stemRolesAssigned = buses.filter((bus) => bus.role !== 'master').every((bus) => Boolean(bus.stemRole));
    const printMasterProcessingComplete = Boolean(
      printMasterBus?.printProcessingChain?.some((stage) => stage.kind === 'meter')
      && printMasterBus.printProcessingChain.some((stage) => stage.kind === 'limiter'),
    );
    const foldDownProcessingComplete = Boolean(
      !parsed.audioChannels || parsed.audioChannels <= 2 || (
        foldDownBus?.printProcessingChain?.some((stage) => stage.kind === 'fold-down-matrix')
        && foldDownBus.printProcessingChain.some((stage) => stage.kind === 'limiter')
      )
    );
    const previewPrintSeparationValid = Boolean(
      !printMasterBus?.previewProcessingChain?.some((stage) => stage.kind === 'meter' || stage.kind === 'limiter')
      && !foldDownBus?.previewProcessingChain?.some((stage) => stage.kind === 'limiter')
    );
    const assistantChecklistComplete = (parsed.assistantEditorChecklist ?? []).every((item) => (
      item.status === 'complete' || item.status === 'not-applicable'
    ));

    if (!parsed.printMasterBusId || !printMasterBus) {
      issues.push('Audio turnover is missing a configured printmaster bus.');
    } else if (printMasterBus.stemRole !== 'PRINTMASTER') {
      issues.push('Printmaster bus is missing the PRINTMASTER stem role.');
    } else if (!printMasterProcessingComplete) {
      issues.push('Printmaster bus is missing required meter/limiter processing stages.');
    }

    if ((parsed.audioChannels ?? 2) > 2) {
      if (parsed.monitoringBusId !== 'fold-down' || !foldDownBus) {
        issues.push('Multichannel turnover is missing a configured fold-down monitoring bus.');
      } else if (foldDownBus.stemRole !== 'FOLDDOWN') {
        issues.push('Fold-down monitoring bus is missing the FOLDDOWN stem role.');
      } else if (!foldDownProcessingComplete) {
        issues.push('Fold-down monitoring bus is missing required matrix/limiter processing stages.');
      }
    }
    if (!stemRolesAssigned) {
      issues.push('One or more turnover buses are missing assistant-editor stem-role assignments.');
    }
    if (!previewPrintSeparationValid) {
      issues.push('Turnover processing policy leaks print-only stages into the preview path.');
    }
    for (const item of parsed.assistantEditorChecklist ?? []) {
      if (item.status === 'needs-attention') {
        warnings.push(`Assistant-editor checklist: ${item.label ?? item.id} needs attention.`);
      }
    }

    return {
      issues,
      warnings: uniqueStrings(warnings),
      facilityPolicy: {
        printMasterConfigured: Boolean(parsed.printMasterBusId && printMasterBus),
        foldDownConfigured: (parsed.audioChannels ?? 2) <= 2 ? false : Boolean(parsed.monitoringBusId === 'fold-down' && foldDownBus),
        printMasterProcessingComplete,
        foldDownProcessingComplete,
        previewPrintSeparationValid,
        stemRolesAssigned,
        assistantChecklistComplete,
      },
    };
  }

  private async buildAssistantEditorHandoff(
    audioTurnoverPath: string,
    validation: {
      valid: boolean;
      issues: string[];
      warnings: string[];
      facilityPolicy?: {
        printMasterConfigured: boolean;
        foldDownConfigured: boolean;
        printMasterProcessingComplete: boolean;
        foldDownProcessingComplete: boolean;
        previewPrintSeparationValid: boolean;
        stemRolesAssigned: boolean;
        assistantChecklistComplete: boolean;
      };
    },
  ): Promise<{
    generatedAt: string;
    signOffStatus: 'ready' | 'needs-review' | 'blocked';
    readyForTurnover: boolean;
    blockers: string[];
    notes: string[];
    recommendedActions: Array<{
      severity: 'blocker' | 'review' | 'info';
      category: 'validation' | 'checklist' | 'processing';
      message: string;
    }>;
    facilityPolicy?: typeof validation.facilityPolicy;
    processingIntent: {
      previewContext: 'preview';
      printContext: 'print';
      requiresDedicatedPreviewRender: boolean;
      requiresDedicatedPrintRender: boolean;
      buses: Array<{
        busId: string;
        role?: string;
        stemRole?: string;
        previewProcessingKinds: string[];
        printProcessingKinds: string[];
        previewBypassedKinds: string[];
        printBypassedKinds: string[];
      }>;
    };
    signOffSummary: {
      blockerCount: number;
      reviewCount: number;
      infoCount: number;
    };
    assistantEditorChecklist: Array<{
      id: string;
      label?: string;
      status?: 'complete' | 'needs-attention' | 'not-applicable';
    }>;
  } | null> {
    if (!await fileExists(this.fsBindings, audioTurnoverPath)) {
      return null;
    }

    const parsed = JSON.parse(await this.fsBindings.readFile(audioTurnoverPath, 'utf8')) as {
      assistantEditorChecklist?: Array<{
        id: string;
        label?: string;
        status?: 'complete' | 'needs-attention' | 'not-applicable';
      }>;
      buses?: Array<{
        id: string;
        role?: string;
        stemRole?: string;
        previewProcessingChain?: Array<{ kind?: string }>;
        printProcessingChain?: Array<{ kind?: string }>;
        processingPolicy?: {
          previewBypassedProcessingChain?: Array<{ kind?: string }>;
          printBypassedProcessingChain?: Array<{ kind?: string }>;
          requiresDedicatedPreviewRender?: boolean;
          requiresDedicatedPrintRender?: boolean;
        };
      }>;
    };

    const recommendedActions = [
      ...validation.issues.map((message) => ({
        severity: 'blocker' as const,
        category: 'validation' as const,
        message,
      })),
      ...validation.warnings.map((message) => ({
        severity: 'review' as const,
        category: 'validation' as const,
        message,
      })),
      ...(parsed.assistantEditorChecklist ?? [])
        .filter((item) => item.status === 'needs-attention')
        .map((item) => ({
          severity: 'review' as const,
          category: 'checklist' as const,
          message: `${item.label ?? item.id} needs attention before turnover sign-off.`,
        })),
      ...((parsed.buses ?? []).flatMap((bus) => {
        const previewBypassedKinds = (bus.processingPolicy?.previewBypassedProcessingChain ?? [])
          .flatMap((stage) => stage.kind ? [stage.kind] : []);
        if (previewBypassedKinds.length === 0) {
          return [];
        }
        return [{
          severity: 'info' as const,
          category: 'processing' as const,
          message: `${bus.id} previews without ${previewBypassedKinds.join(', ')}; verify the print render before turnover.`,
        }];
      })),
    ];

    const signOffStatus = validation.issues.length > 0
      ? 'blocked'
      : validation.warnings.length > 0 || (parsed.assistantEditorChecklist ?? []).some((item) => item.status === 'needs-attention')
        ? 'needs-review'
        : 'ready';

    return {
      generatedAt: new Date().toISOString(),
      signOffStatus,
      readyForTurnover: signOffStatus !== 'blocked',
      blockers: validation.issues,
      notes: validation.warnings,
      recommendedActions,
      facilityPolicy: validation.facilityPolicy,
      processingIntent: {
        previewContext: 'preview',
        printContext: 'print',
        requiresDedicatedPreviewRender: (parsed.buses ?? []).some((bus) => bus.processingPolicy?.requiresDedicatedPreviewRender),
        requiresDedicatedPrintRender: (parsed.buses ?? []).some((bus) => bus.processingPolicy?.requiresDedicatedPrintRender),
        buses: (parsed.buses ?? []).map((bus) => ({
          busId: bus.id,
          role: bus.role,
          stemRole: bus.stemRole,
          previewProcessingKinds: (bus.previewProcessingChain ?? []).flatMap((stage) => stage.kind ? [stage.kind] : []),
          printProcessingKinds: (bus.printProcessingChain ?? []).flatMap((stage) => stage.kind ? [stage.kind] : []),
          previewBypassedKinds: (bus.processingPolicy?.previewBypassedProcessingChain ?? [])
            .flatMap((stage) => stage.kind ? [stage.kind] : []),
          printBypassedKinds: (bus.processingPolicy?.printBypassedProcessingChain ?? [])
            .flatMap((stage) => stage.kind ? [stage.kind] : []),
        })),
      },
      signOffSummary: {
        blockerCount: recommendedActions.filter((action) => action.severity === 'blocker').length,
        reviewCount: recommendedActions.filter((action) => action.severity === 'review').length,
        infoCount: recommendedActions.filter((action) => action.severity === 'info').length,
      },
      assistantEditorChecklist: parsed.assistantEditorChecklist ?? [],
    };
  }

  private async writeProToolsArtifacts(
    project: EditorProject,
    exportDir: string,
    includeTurnoverExport: boolean,
  ): Promise<string[]> {
    const companionPaths: string[] = [];
    const audioTurnoverPath = path.join(exportDir, 'audio-turnover.json');
    if (await fileExists(this.fsBindings, audioTurnoverPath)) {
      companionPaths.push(audioTurnoverPath);
    }

    const dominantLayout = pickDominantAudioChannelLayout(
      resolveAudioTrackLayouts(project).map((track) => track.layout),
    );
    const exporter = new ProToolsAAFExporter(project, {
      outputPath: path.join(exportDir, 'protools-turnover.aaf'),
      includeAutomation: true,
      includeRenderedEffects: true,
      channelAssignment: dominantLayout,
    });
    const validation = exporter.validate();
    const facilityPolicy = await this.evaluateAudioTurnoverPolicy(audioTurnoverPath);
    const mergedValidation = {
      ...validation,
      valid: validation.valid && (facilityPolicy?.issues.length ?? 0) === 0,
      issues: uniqueStrings([
        ...validation.issues,
        ...(facilityPolicy?.issues ?? []),
      ]),
      warnings: uniqueStrings([
        ...validation.warnings,
        ...(facilityPolicy?.warnings ?? []),
      ]),
      facilityPolicy: facilityPolicy?.facilityPolicy,
    };
    const validationPath = path.join(exportDir, 'protools-turnover.validation.json');
    await this.fsBindings.writeFile(validationPath, JSON.stringify(mergedValidation, null, 2), 'utf8');
    companionPaths.push(validationPath);
    const handoffSummary = await this.buildAssistantEditorHandoff(audioTurnoverPath, mergedValidation);
    if (handoffSummary) {
      const handoffPath = path.join(exportDir, 'assistant-editor.handoff.json');
      await this.fsBindings.writeFile(handoffPath, JSON.stringify(handoffSummary, null, 2), 'utf8');
      companionPaths.push(handoffPath);
    }

    if (includeTurnoverExport) {
      const turnoverPath = path.join(exportDir, 'protools-turnover.aaf.json');
      await this.fsBindings.writeFile(turnoverPath, JSON.stringify(exporter.export(), null, 2), 'utf8');
      companionPaths.push(turnoverPath);
    }

    return companionPaths;
  }

  private async writeFormatArtifacts(
    project: EditorProject,
    exportDir: string,
    snapshot: TimelineRenderSnapshot,
    format: InterchangeFormat,
  ): Promise<string[]> {
    switch (format) {
      case 'EDL':
        return [path.join(exportDir, 'timeline.edl')];
      case 'OTIO':
        return [path.join(exportDir, 'timeline.otio.json')];
      case 'XML': {
        const xmlPath = path.join(exportDir, 'timeline.xml');
        const assetLines = buildInterchangeAssets(project).map((asset) => (
          `    <asset id="${escapeXmlAttribute(asset.assetId)}" sourcePath="${escapeXmlAttribute(asset.sourcePath ?? '')}" reel="${escapeXmlAttribute(asset.reel ?? '')}" timecode="${escapeXmlAttribute(asset.timecode ?? '')}" durationSeconds="${escapeXmlAttribute(String(asset.durationSeconds ?? ''))}" />`
        ));
        const trackLines = project.tracks.map((track) => ([
          `    <track id="${escapeXmlAttribute(track.id)}" name="${escapeXmlAttribute(track.name)}" type="${escapeXmlAttribute(track.type)}">`,
          ...track.clips
            .slice()
            .sort((left, right) => left.startTime - right.startTime)
            .map((clip) => (
              `      <clip id="${escapeXmlAttribute(clip.id)}" name="${escapeXmlAttribute(clip.name)}" assetId="${escapeXmlAttribute(clip.assetId ?? '')}" start="${escapeXmlAttribute(String(clip.startTime))}" end="${escapeXmlAttribute(String(clip.endTime))}" trimStart="${escapeXmlAttribute(String(clip.trimStart ?? 0))}" trimEnd="${escapeXmlAttribute(String(clip.trimEnd ?? 0))}" type="${escapeXmlAttribute(clip.type)}" />`
            )),
          '    </track>',
        ].join('\n')));
        const xml = [
          `<sequence id="${snapshot.sequenceId}" revision="${snapshot.revisionId}">`,
          `  <project id="${project.id}" name="${escapeXmlAttribute(project.name)}" frameRate="${project.settings.frameRate}" width="${project.settings.width}" height="${project.settings.height}" sampleRate="${project.settings.sampleRate}" />`,
          '  <assets>',
          ...assetLines,
          '  </assets>',
          '  <timeline>',
          ...trackLines,
          '  </timeline>',
          `  <exports edl="timeline.edl" otio="timeline.otio.json" />`,
          `  <mediaIndex path="media-index.json" />`,
          '</sequence>',
        ].join('\n');
        await this.fsBindings.writeFile(xmlPath, xml, 'utf8');
        return [xmlPath];
      }
      case 'AAF': {
        const aafPath = path.join(exportDir, 'timeline.aaf.json');
        const aaf = new AAFExporter(project).export({ format: 'aaf', includeMarkers: true });
        await this.fsBindings.writeFile(aafPath, JSON.stringify(aaf, null, 2), 'utf8');
        return [
          aafPath,
          ...await this.writeProToolsArtifacts(project, exportDir, true),
        ];
      }
      case 'OMF': {
        const omfPath = path.join(exportDir, 'timeline.omf.json');
        const omf = new AAFExporter(project).export({ format: 'omf', includeMarkers: false });
        await this.fsBindings.writeFile(omfPath, JSON.stringify(omf, null, 2), 'utf8');
        return [
          omfPath,
          ...await this.writeProToolsArtifacts(project, exportDir, false),
        ];
      }
      default:
        throw new Error(`Unsupported interchange format: ${String(format)}`);
    }
  }
}

export class DesktopNativeDecodeAdapter implements ProfessionalMediaDecodePort {
  private readonly pipeline: DesktopMediaPipelineBindings;
  private readonly fsBindings: DesktopFsBindings;
  private readonly bindings = new Map<string, BoundDesktopProject>();
  private readonly sessions = new Map<string, DesktopDecodeSessionState>();
  private sequence = 0;

  constructor(options: DesktopNativeMediaManagementAdapterOptions = {}) {
    this.pipeline = {
      ...DEFAULT_PIPELINE_BINDINGS,
      ...options.pipeline,
    };
    this.fsBindings = {
      ...DEFAULT_FS_BINDINGS,
      ...options.fs,
    };
  }

  async bindProject(binding: DesktopProjectBinding): Promise<void> {
    const mediaPaths = this.pipeline.createProjectMediaPaths(binding.projectPackagePath);
    await this.pipeline.ensureProjectMediaPaths(mediaPaths);
    this.bindings.set(binding.project.id, {
      project: cloneValue(binding.project),
      packagePath: binding.projectPackagePath,
      mediaPaths,
    });
  }

  async createSession(
    snapshot: TimelineRenderSnapshot,
    descriptor: PlaybackSessionDescriptor,
  ): Promise<NativeResourceHandle> {
    const binding = this.requireBinding(snapshot.projectId);
    const sessionDir = path.join(binding.mediaPaths.indexPath, 'decode-sessions');
    await this.fsBindings.mkdir(sessionDir, { recursive: true });

    this.sequence += 1;
    const handle = `desktop-decode-${snapshot.projectId}-${this.sequence.toString(36)}`;
    const manifestPath = path.join(
      sessionDir,
      `${sanitizeArtifactBase(snapshot.sequenceId)}-${sanitizeArtifactBase(snapshot.revisionId)}-${this.sequence.toString(36)}.json`,
    );

    const state: DesktopDecodeSessionState = {
      handle,
      projectId: snapshot.projectId,
      manifestPath,
      snapshot: cloneValue(snapshot),
      descriptor: cloneValue(descriptor),
      prerollRanges: [],
      videoArtifacts: {},
      audioArtifacts: {},
    };

    this.sessions.set(handle, state);
    await this.writeSessionManifest(state);
    return handle;
  }

  async preroll(sessionHandle: NativeResourceHandle, range: FrameRange): Promise<void> {
    const session = this.requireSession(sessionHandle);
    session.prerollRanges.push(cloneValue(range));
    await this.writeSessionManifest(session);
  }

  async decodeVideoFrame(
    sessionHandle: NativeResourceHandle,
    request: MediaDecodeRequest,
  ): Promise<DecodedVideoFrame | null> {
    const decoded = await this.materializeVideoArtifact(sessionHandle, request);
    if (!decoded) {
      return null;
    }

    return {
      assetId: decoded.assetId,
      frame: decoded.frame,
      ptsSeconds: decoded.ptsSeconds,
      width: decoded.width,
      height: decoded.height,
      pixelFormat: decoded.pixelFormat,
      colorSpace: decoded.colorSpace,
      storage: decoded.storage,
      handle: decoded.handle,
    };
  }

  async materializeVideoArtifact(
    sessionHandle: NativeResourceHandle,
    request: MediaDecodeRequest,
  ): Promise<DesktopDecodedVideoArtifact | null> {
    const session = this.requireSession(sessionHandle);
    const binding = this.requireBinding(session.projectId);
    const asset = this.requireProjectAsset(session.projectId, request.assetId);
    const sourcePath = normalizeFilesystemPath(getMediaAssetPrimaryPath(asset));
    if (!sourcePath || !await fileExists(this.fsBindings, sourcePath)) {
      return null;
    }

    const cacheKey = buildDecodeCacheKey(
      session.snapshot,
      request.assetId,
      request.frame,
      request.variant,
      request.pixelFormat,
      asset.technicalMetadata?.width ?? session.snapshot.output.width,
      asset.technicalMetadata?.height ?? session.snapshot.output.height,
    );
    const existing = session.videoArtifacts[cacheKey];
    if (existing && await fileExists(this.fsBindings, existing.artifactPath)) {
      return cloneValue({
        ...existing,
        cacheHit: true,
        decodeLatencyMs: 0,
      });
    }

    this.sequence += 1;
    const artifact = await this.pipeline.extractVideoFrameArtifact({
      sourcePath,
      outputDirectory: path.join(binding.mediaPaths.indexPath, 'decode-cache', 'video', sanitizeArtifactBase(request.assetId)),
      cacheKey,
      frame: request.frame,
      fps: session.snapshot.fps,
      width: asset.technicalMetadata?.width ?? session.snapshot.output.width,
      height: asset.technicalMetadata?.height ?? session.snapshot.output.height,
      pixelFormat: request.pixelFormat ?? 'rgb24',
      preferHardware: request.priority === 'interactive',
    });

    const decoded: DesktopDecodedVideoArtifact = {
      assetId: request.assetId,
      frame: request.frame,
      ptsSeconds: request.frame / session.snapshot.fps,
      width: artifact.width,
      height: artifact.height,
      pixelFormat: artifact.pixelFormat,
      colorSpace: session.snapshot.output.colorSpace,
      storage: artifact.storage,
      handle: `desktop-frame-${sanitizeArtifactBase(request.assetId)}-${request.frame.toString(36)}-${this.sequence.toString(36)}`,
      artifactPath: artifact.outputPath,
      sourcePath,
      cacheHit: artifact.cacheHit,
      decodeLatencyMs: artifact.decodeLatencyMs,
    };
    session.videoArtifacts[cacheKey] = decoded;
    await this.writeSessionManifest(session, {
      lastVideoRequest: request,
      lastVideoResolvedPath: sourcePath,
      lastVideoArtifactPath: decoded.artifactPath,
    });
    return cloneValue(decoded);
  }

  async decodeAudioSlice(
    sessionHandle: NativeResourceHandle,
    request: AudioDecodeRequest,
  ): Promise<DecodedAudioSlice | null> {
    const decoded = await this.materializeAudioArtifact(sessionHandle, request);
    if (!decoded) {
      return null;
    }

    return {
      assetId: decoded.assetId,
      timeRange: cloneValue(decoded.timeRange),
      sampleRate: decoded.sampleRate,
      channelCount: decoded.channelCount,
      handle: decoded.handle,
    };
  }

  async materializeAudioArtifact(
    sessionHandle: NativeResourceHandle,
    request: AudioDecodeRequest,
  ): Promise<DesktopDecodedAudioArtifact | null> {
    const session = this.requireSession(sessionHandle);
    const binding = this.requireBinding(session.projectId);
    const asset = this.requireProjectAsset(session.projectId, request.assetId);
    const sourcePath = normalizeFilesystemPath(getMediaAssetPrimaryPath(asset) ?? getMediaAssetPlaybackUrl(asset));
    if (!sourcePath || !await fileExists(this.fsBindings, sourcePath)) {
      return null;
    }

    const sampleRate = request.sampleRate ?? asset.technicalMetadata?.sampleRate ?? session.snapshot.sampleRate;
    const channelCount = request.channels?.length ?? asset.technicalMetadata?.audioChannels ?? 2;
    const cacheKey = buildAudioCacheKey(session.snapshot, request.assetId, request, channelCount, sampleRate);
    const existing = session.audioArtifacts[cacheKey];
    if (existing && await fileExists(this.fsBindings, existing.artifactPath)) {
      return cloneValue({
        ...existing,
        cacheHit: true,
        decodeLatencyMs: 0,
      });
    }

    this.sequence += 1;
    const artifact = await this.pipeline.extractAudioSliceArtifact({
      sourcePath,
      outputDirectory: path.join(binding.mediaPaths.indexPath, 'decode-cache', 'audio', sanitizeArtifactBase(request.assetId)),
      cacheKey,
      timeRange: cloneValue(request.timeRange),
      sampleRate,
      channelCount,
    });

    const decoded: DesktopDecodedAudioArtifact = {
      assetId: request.assetId,
      timeRange: cloneValue(request.timeRange),
      sampleRate: artifact.sampleRate,
      channelCount: artifact.channelCount,
      handle: `desktop-audio-${sanitizeArtifactBase(request.assetId)}-${this.sequence.toString(36)}`,
      artifactPath: artifact.outputPath,
      sourcePath,
      cacheHit: artifact.cacheHit,
      decodeLatencyMs: artifact.decodeLatencyMs,
    };
    session.audioArtifacts[cacheKey] = decoded;
    await this.writeSessionManifest(session, {
      lastAudioRequest: request,
      lastAudioResolvedPath: sourcePath,
      lastAudioArtifactPath: decoded.artifactPath,
    });
    return cloneValue(decoded);
  }

  async releaseSession(sessionHandle: NativeResourceHandle): Promise<void> {
    const session = this.requireSession(sessionHandle);
    session.releasedAt = new Date().toISOString();
    await this.writeSessionManifest(session);
    this.sessions.delete(sessionHandle);
  }

  async invalidateProjectCache(projectId: string): Promise<void> {
    const binding = this.requireBinding(projectId);
    await this.fsBindings.rm(path.join(binding.mediaPaths.indexPath, 'decode-cache'), { recursive: true, force: true });

    for (const session of this.sessions.values()) {
      if (session.projectId !== projectId) {
        continue;
      }
      session.videoArtifacts = {};
      session.audioArtifacts = {};
      await this.writeSessionManifest(session, {
        cacheInvalidatedAt: new Date().toISOString(),
      });
    }
  }

  private requireBinding(projectId: string): BoundDesktopProject {
    const binding = this.bindings.get(projectId);
    if (!binding) {
      throw new Error(`No desktop project binding registered for ${projectId}`);
    }
    return binding;
  }

  private requireSession(sessionHandle: NativeResourceHandle): DesktopDecodeSessionState {
    const session = this.sessions.get(sessionHandle);
    if (!session) {
      throw new Error(`Unknown desktop decode session: ${sessionHandle}`);
    }
    return session;
  }

  private requireProjectAsset(projectId: string, assetId: string): EditorMediaAsset {
    const binding = this.requireBinding(projectId);
    const asset = flattenAssets(binding.project.bins).find((entry) => entry.id === assetId);
    if (!asset) {
      throw new Error(`Unknown asset ${assetId} for project ${projectId}`);
    }
    return asset;
  }

  private async writeSessionManifest(
    session: DesktopDecodeSessionState,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await this.fsBindings.writeFile(session.manifestPath, JSON.stringify({
      handle: session.handle,
      projectId: session.projectId,
      snapshot: session.snapshot,
      descriptor: session.descriptor,
      prerollRanges: session.prerollRanges,
      videoArtifacts: Object.values(session.videoArtifacts),
      audioArtifacts: Object.values(session.audioArtifacts),
      releasedAt: session.releasedAt,
      ...extra,
    }, null, 2), 'utf8');
  }
}

export class DesktopNativeChangeListAdapter implements ChangeListPort {
  private readonly fsBindings: DesktopFsBindings;
  private readonly interchangeAdapter: DesktopNativeInterchangeAdapter;
  private readonly bindings = new Map<string, BoundDesktopProject>();
  private readonly sequenceRevisions = new Map<string, ReferenceSequenceRevision>();

  constructor(
    interchangeAdapter: DesktopNativeInterchangeAdapter,
    options: DesktopNativeMediaManagementAdapterOptions = {},
    sequenceRevisions: ReferenceSequenceRevision[] = [],
  ) {
    this.fsBindings = {
      ...DEFAULT_FS_BINDINGS,
      ...options.fs,
    };
    this.interchangeAdapter = interchangeAdapter;
    for (const revision of sequenceRevisions) {
      this.registerSequenceRevision(revision);
    }
  }

  async bindProject(binding: DesktopProjectBinding): Promise<void> {
    const mediaPaths = DEFAULT_PIPELINE_BINDINGS.createProjectMediaPaths(binding.projectPackagePath);
    await DEFAULT_PIPELINE_BINDINGS.ensureProjectMediaPaths(mediaPaths);
    this.bindings.set(binding.project.id, {
      project: cloneValue(binding.project),
      packagePath: binding.projectPackagePath,
      mediaPaths,
    });
  }

  registerSequenceRevision(revision: ReferenceSequenceRevision): void {
    this.sequenceRevisions.set(this.revisionKey(revision.sequenceId, revision.revisionId), cloneValue(revision));
  }

  async diffSequence(request: SequenceDiffRequest): Promise<ChangeEvent[]> {
    const base = this.sequenceRevisions.get(this.revisionKey(request.sequenceId, request.baseRevisionId));
    const target = this.sequenceRevisions.get(this.revisionKey(request.sequenceId, request.targetRevisionId));
    if (!target) {
      throw new Error(`Unknown target revision: ${request.targetRevisionId}`);
    }

    const baseFingerprints = new Set((base?.events ?? []).map((event) => JSON.stringify(event)));
    return cloneValue(target.events.filter((event) => !baseFingerprints.has(JSON.stringify(event))));
  }

  async exportEDL(request: SequenceDiffRequest): Promise<ChangeListArtifact> {
    const target = this.requireRevision(request.sequenceId, request.targetRevisionId);
    const binding = this.requireBinding(target.projectId);
    const snapshot = target.snapshot ?? this.buildSnapshot(binding.project, request.sequenceId, request.targetRevisionId);
    const pkg = await this.interchangeAdapter.exportPackage(snapshot, 'EDL');
    return {
      format: 'EDL',
      path: pkg.artifactPaths[0]!,
    };
  }

  async exportChangeList(request: SequenceDiffRequest): Promise<ChangeListArtifact> {
    const target = this.requireRevision(request.sequenceId, request.targetRevisionId);
    const binding = this.requireBinding(target.projectId);
    const diff = await this.diffSequence(request);
    const outputDir = path.join(binding.mediaPaths.exportsPath, 'change-lists', sanitizeArtifactBase(request.sequenceId));
    await this.fsBindings.mkdir(outputDir, { recursive: true });

    const outputPath = path.join(
      outputDir,
      `${sanitizeArtifactBase(request.baseRevisionId)}-to-${sanitizeArtifactBase(request.targetRevisionId)}.txt`,
    );
    const contents = diff.map((event) => (
      `${event.type.toUpperCase()} ${event.trackId} @ ${event.frame}: ${event.detail}`
    )).join('\n');
    await this.fsBindings.writeFile(outputPath, contents, 'utf8');

    return {
      format: 'ChangeList',
      path: outputPath,
    };
  }

  private requireBinding(projectId: string): BoundDesktopProject {
    const binding = this.bindings.get(projectId);
    if (!binding) {
      throw new Error(`No desktop project binding registered for ${projectId}`);
    }
    return binding;
  }

  private requireRevision(sequenceId: string, revisionId: string): ReferenceSequenceRevision {
    const revision = this.sequenceRevisions.get(this.revisionKey(sequenceId, revisionId));
    if (!revision) {
      throw new Error(`Unknown revision: ${revisionId}`);
    }
    return revision;
  }

  private revisionKey(sequenceId: string, revisionId: string): string {
    return `${sequenceId}::${revisionId}`;
  }

  private buildSnapshot(
    project: EditorProject,
    sequenceId: string,
    revisionId: SequenceRevisionId,
  ): TimelineRenderSnapshot {
    return buildProjectSnapshot(project, sequenceId, revisionId);
  }
}

export class DesktopNativeVideoCompositingAdapter implements VideoCompositingPort {
  private readonly pipeline: DesktopMediaPipelineBindings;
  private readonly fsBindings: DesktopFsBindings;
  private readonly bindings = new Map<string, BoundDesktopProject>();
  private readonly graphs = new Map<string, DesktopCompositorGraphState>();
  private sequence = 0;

  constructor(options: DesktopNativeMediaManagementAdapterOptions = {}) {
    this.pipeline = {
      ...DEFAULT_PIPELINE_BINDINGS,
      ...options.pipeline,
    };
    this.fsBindings = {
      ...DEFAULT_FS_BINDINGS,
      ...options.fs,
    };
  }

  async bindProject(binding: DesktopProjectBinding): Promise<void> {
    const mediaPaths = this.pipeline.createProjectMediaPaths(binding.projectPackagePath);
    await this.pipeline.ensureProjectMediaPaths(mediaPaths);
    this.bindings.set(binding.project.id, {
      project: cloneValue(binding.project),
      packagePath: binding.projectPackagePath,
      mediaPaths,
    });
  }

  async compileGraph(snapshot: TimelineRenderSnapshot): Promise<RenderGraphCompilation> {
    const binding = this.requireBinding(snapshot.projectId);
    const graphDir = path.join(binding.mediaPaths.indexPath, 'render-graphs');
    await this.fsBindings.mkdir(graphDir, { recursive: true });

    this.sequence += 1;
    const graphId = `desktop-graph-${snapshot.projectId}-${this.sequence.toString(36)}`;
    const nodes: RenderGraphNode[] = [];
    const project = binding.project;

    for (const track of project.tracks.filter((entry) => entry.type === 'VIDEO')) {
      for (const clip of track.clips.filter((entry) => entry.type === 'video')) {
        nodes.push({
          id: `clip-${track.id}-${clip.id}`,
          kind: 'clip',
          inputs: [],
          metadata: {
            assetId: clip.assetId ?? '',
            trackId: track.id,
            startTime: clip.startTime,
            endTime: clip.endTime,
          },
        });
      }
    }

    for (const titleClip of project.workstationState?.titleClips ?? []) {
      nodes.push({
        id: `title-${titleClip.id}`,
        kind: 'title',
        inputs: [],
        metadata: {
          clipId: titleClip.id,
          templateId: titleClip.templateId ?? 'custom',
          textLength: titleClip.text.length,
          animation: titleClip.animation?.type ?? 'none',
        },
      });
    }

    if (snapshot.audioTrackCount > 0) {
      nodes.push({
        id: 'audio-mix',
        kind: 'mix',
        inputs: [],
        metadata: { tracks: snapshot.audioTrackCount },
      });
    }

    if (nodes.length === 0) {
      nodes.push({
        id: 'empty-program',
        kind: 'overlay',
        inputs: [],
        metadata: { reason: 'no-video-clips' },
      });
    }

    const outputInputs = nodes.map((node) => node.id);
    nodes.push({
      id: 'program-output',
      kind: 'overlay',
      inputs: outputInputs,
      metadata: {
        width: snapshot.output.width,
        height: snapshot.output.height,
        colorSpace: snapshot.output.colorSpace ?? 'Rec.709',
      },
    });

    const compilation: RenderGraphCompilation = {
      graphId,
      revisionId: snapshot.revisionId,
      nodes,
      quality: snapshot.videoLayerCount > 1 ? 'full' : 'preview',
    };

    const state: DesktopCompositorGraphState = {
      projectId: snapshot.projectId,
      manifestPath: path.join(
        graphDir,
        `${sanitizeArtifactBase(snapshot.sequenceId)}-${sanitizeArtifactBase(snapshot.revisionId)}-${this.sequence.toString(36)}.json`,
      ),
      snapshot: cloneValue(snapshot),
      compilation: cloneValue(compilation),
      renderedFrames: [],
      renderedArtifacts: {},
    };

    this.graphs.set(graphId, state);
    await this.writeGraphManifest(state);
    return compilation;
  }

  async renderFrame(request: CompositeFrameRequest): Promise<CompositedVideoFrame> {
    const rendered = await this.materializeCompositeArtifact(request);
    return {
      graphId: rendered.graphId,
      frame: rendered.frame,
      width: rendered.width,
      height: rendered.height,
      colorSpace: rendered.colorSpace,
      handle: rendered.handle,
    };
  }

  async materializeCompositeArtifact(
    request: CompositeFrameRequest,
  ): Promise<DesktopRenderedCompositeArtifact> {
    const state = this.requireGraph(request.graphId);
    const binding = this.requireBinding(state.projectId);
    const activeLayers = activeVideoLayersForFrame(binding.project, state.snapshot, request.frame);
    const cacheKey = buildCompositeCacheKey(state, request, activeLayers);
    const existing = state.renderedArtifacts[cacheKey];
    if (existing && await fileExists(this.fsBindings, existing.artifactPath)) {
      return cloneValue({
        ...existing,
        cacheHit: true,
        compositeLatencyMs: 0,
      });
    }

    const decodedLayers = await Promise.all(activeLayers.map(async (layer) => ({
      layer,
      artifact: await this.pipeline.extractVideoFrameArtifact({
        sourcePath: layer.sourcePath,
        outputDirectory: path.join(binding.mediaPaths.indexPath, 'decode-cache', 'video', sanitizeArtifactBase(layer.assetId)),
        cacheKey: buildDecodeCacheKey(
          state.snapshot,
          layer.assetId,
          layer.timelineFrame,
          'source',
          'rgb24',
          state.snapshot.output.width,
          state.snapshot.output.height,
        ),
        frame: layer.timelineFrame,
        fps: state.snapshot.fps,
        width: state.snapshot.output.width,
        height: state.snapshot.output.height,
        pixelFormat: 'rgb24',
        preferHardware: request.quality !== 'draft',
      }),
    })));

    const artifact = await this.pipeline.composeFrameArtifact({
      outputDirectory: path.join(binding.mediaPaths.indexPath, 'render-cache', sanitizeArtifactBase(request.target)),
      cacheKey,
      width: state.snapshot.output.width,
      height: state.snapshot.output.height,
      colorSpace: state.snapshot.output.colorSpace,
      layers: decodedLayers.map(({ artifact: layerArtifact }) => ({
        sourcePath: layerArtifact.outputPath,
        opacity: 1,
      })),
    });

    this.sequence += 1;
    const handle = `desktop-composite-${request.target}-${request.frame.toString(36)}-${this.sequence.toString(36)}`;
    const rendered: DesktopRenderedCompositeArtifact = {
      graphId: request.graphId,
      frame: request.frame,
      width: artifact.width,
      height: artifact.height,
      colorSpace: artifact.colorSpace,
      handle,
      artifactPath: artifact.outputPath,
      layerAssetIds: activeLayers.map((layer) => layer.assetId),
      layerSourcePaths: decodedLayers.map(({ artifact: layerArtifact }) => layerArtifact.outputPath),
      layerTrackIds: activeLayers.map((layer) => layer.trackId),
      cacheHit: artifact.cacheHit,
      compositeLatencyMs: artifact.compositeLatencyMs,
    };
    state.renderedArtifacts[cacheKey] = rendered;
    state.renderedFrames.push(request.frame);
    await this.writeGraphManifest(state, {
      lastRenderRequest: request,
      lastCompositeHandle: handle,
      lastCompositeArtifactPath: rendered.artifactPath,
    });

    return cloneValue(rendered);
  }

  async invalidateGraph(graphId: string): Promise<void> {
    const state = this.graphs.get(graphId);
    if (!state) {
      return;
    }
    await Promise.all(Object.values(state.renderedArtifacts).map(async (artifact) => {
      await this.fsBindings.rm(artifact.artifactPath, { force: true });
    }));
    await this.writeGraphManifest(state, {
      invalidatedAt: new Date().toISOString(),
    });
    this.graphs.delete(graphId);
  }

  async invalidateProjectCache(projectId: string): Promise<void> {
    const binding = this.requireBinding(projectId);
    await this.fsBindings.rm(path.join(binding.mediaPaths.indexPath, 'render-cache'), { recursive: true, force: true });
    for (const state of this.graphs.values()) {
      if (state.projectId !== projectId) {
        continue;
      }
      state.renderedArtifacts = {};
      state.renderedFrames = [];
      await this.writeGraphManifest(state, {
        cacheInvalidatedAt: new Date().toISOString(),
      });
    }
  }

  private requireBinding(projectId: string): BoundDesktopProject {
    const binding = this.bindings.get(projectId);
    if (!binding) {
      throw new Error(`No desktop project binding registered for ${projectId}`);
    }
    return binding;
  }

  private requireGraph(graphId: string): DesktopCompositorGraphState {
    const state = this.graphs.get(graphId);
    if (!state) {
      throw new Error(`Unknown desktop compositor graph: ${graphId}`);
    }
    return state;
  }

  private async writeGraphManifest(
    state: DesktopCompositorGraphState,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await this.fsBindings.writeFile(state.manifestPath, JSON.stringify({
      projectId: state.projectId,
      snapshot: state.snapshot,
      compilation: state.compilation,
      renderedFrames: state.renderedFrames,
      renderedArtifacts: Object.values(state.renderedArtifacts),
      ...extra,
    }, null, 2), 'utf8');
  }
}

export class DesktopNativeRealtimePlaybackAdapter implements RealtimePlaybackPort {
  private readonly pipeline: DesktopMediaPipelineBindings;
  private readonly outputBindings: Partial<DesktopPlaybackOutputBindings>;
  private readonly fsBindings: DesktopFsBindings;
  private readonly decodeAdapter: DesktopNativeDecodeAdapter;
  private readonly compositorAdapter: DesktopNativeVideoCompositingAdapter;
  private readonly bindings = new Map<string, BoundDesktopProject>();
  private readonly transports = new Map<string, DesktopPlaybackTransportState>();
  private sequence = 0;

  constructor(
    decodeAdapter: DesktopNativeDecodeAdapter,
    compositorAdapter: DesktopNativeVideoCompositingAdapter,
    options: DesktopNativeMediaManagementAdapterOptions = {},
  ) {
    this.pipeline = {
      ...DEFAULT_PIPELINE_BINDINGS,
      ...options.pipeline,
    };
    this.outputBindings = {
      ...options.playbackOutput,
    };
    this.fsBindings = {
      ...DEFAULT_FS_BINDINGS,
      ...options.fs,
    };
    this.decodeAdapter = decodeAdapter;
    this.compositorAdapter = compositorAdapter;
  }

  async bindProject(binding: DesktopProjectBinding): Promise<void> {
    const mediaPaths = this.pipeline.createProjectMediaPaths(binding.projectPackagePath);
    await this.pipeline.ensureProjectMediaPaths(mediaPaths);
    this.bindings.set(binding.project.id, {
      project: cloneValue(binding.project),
      packagePath: binding.projectPackagePath,
      mediaPaths,
    });
  }

  getTransportView(transportHandle: NativeResourceHandle): DesktopPlaybackTransportView {
    const state = this.requireTransport(transportHandle);
    return {
      buffer: state.frameTransportView.buffer,
      width: state.frameTransportView.width,
      height: state.frameTransportView.height,
      bytesPerPixel: state.frameTransportView.bytesPerPixel,
      slots: state.frameTransportView.slots,
    };
  }

  async attachOutputDevice(
    transportHandle: NativeResourceHandle,
    config: PlaybackConfig,
  ): Promise<void> {
    const state = this.requireTransport(transportHandle);
    if (!state.attachedOutputConfigs.some((entry) => entry.deviceId === config.deviceId)) {
      state.attachedOutputConfigs.push(cloneValue(config));
      await this.writeTransportManifest(state, {
        attachedOutputDevices: state.attachedOutputConfigs.map((entry) => entry.deviceId),
      });
    }
  }

  async detachOutputDevice(
    transportHandle: NativeResourceHandle,
    deviceId?: string,
  ): Promise<void> {
    const state = this.requireTransport(transportHandle);
    const targetIds = deviceId
      ? [deviceId]
      : state.attachedOutputConfigs.map((config) => config.deviceId);

    for (const targetId of targetIds) {
      if (state.activeOutputDeviceIds.includes(targetId)) {
        await this.outputBindings.stopPlayback?.(targetId);
      }
    }

    state.activeOutputDeviceIds = state.activeOutputDeviceIds.filter((entry) => !targetIds.includes(entry));
    state.attachedOutputConfigs = deviceId
      ? state.attachedOutputConfigs.filter((entry) => entry.deviceId !== deviceId)
      : [];
    await this.writeTransportManifest(state, {
      attachedOutputDevices: state.attachedOutputConfigs.map((entry) => entry.deviceId),
      activeOutputDevices: state.activeOutputDeviceIds,
    });
  }

  async invalidateProjectCache(projectId: string): Promise<void> {
    const binding = this.requireBinding(projectId);
    await this.fsBindings.rm(path.join(binding.mediaPaths.indexPath, 'render-cache'), { recursive: true, force: true });
    await this.fsBindings.rm(path.join(binding.mediaPaths.indexPath, 'decode-cache'), { recursive: true, force: true });

    for (const [handle, state] of this.transports.entries()) {
      if (state.projectId !== projectId) {
        continue;
      }
      state.lastCompositeHandle = undefined;
      state.lastCompositeArtifactPath = undefined;
      state.decodedVideoArtifacts = [];
      state.decodedAudioArtifacts = [];
      state.policy.promotedFrameCount = 0;
      state.policy.lastFrameCacheHitRate = 0;
      state.policy.lastFrameRenderLatencyMs = 0;
      state.policy.overBudgetWindow = 0;
      state.policy.pendingPromotionKeys.clear();
      state.frameTransport.reset();
      state.telemetry = {
        ...createPlaybackTelemetry(state.policy.frameBudgetMs),
        activeStreamCount: state.streams.length,
      };
      await this.writeTransportManifest(state, {
        cacheInvalidatedAt: new Date().toISOString(),
      });
      this.transports.set(handle, state);
    }
  }

  async createTransport(snapshot: TimelineRenderSnapshot): Promise<NativeResourceHandle> {
    const binding = this.requireBinding(snapshot.projectId);
    const transportDir = path.join(binding.mediaPaths.indexPath, 'playback-transports');
    await this.fsBindings.mkdir(transportDir, { recursive: true });

    this.sequence += 1;
    const handle = `desktop-transport-${snapshot.projectId}-${this.sequence.toString(36)}`;
    const decodeSessionHandle = await this.decodeAdapter.createSession(snapshot, {
      purpose: 'record-monitor',
      quality: 'full',
      prerollFrames: 0,
    });
    const graph = await this.compositorAdapter.compileGraph(snapshot);
    const frameTransportSlots = 3;
    const frameTransport = createFrameTransport(
      snapshot.output.width,
      snapshot.output.height,
      4,
      frameTransportSlots,
    );
    const initialFrameBudgetMs = Math.round(1000 / Math.max(1, snapshot.fps || 24));

    const state: DesktopPlaybackTransportState = {
      handle,
      projectId: snapshot.projectId,
      manifestPath: path.join(
        transportDir,
        `${sanitizeArtifactBase(snapshot.sequenceId)}-${sanitizeArtifactBase(snapshot.revisionId)}-${this.sequence.toString(36)}.json`,
      ),
      snapshot: cloneValue(snapshot),
      streams: [],
      prerollRange: null,
      activeFrame: 0,
      playing: false,
      decodeSessionHandle,
      graphId: graph.graphId,
      telemetry: createPlaybackTelemetry(initialFrameBudgetMs),
      decodedVideoArtifacts: [],
      decodedAudioArtifacts: [],
      frameTransport,
      frameTransportView: {
        buffer: frameTransport.getBuffer(),
        width: snapshot.output.width,
        height: snapshot.output.height,
        bytesPerPixel: 4,
        slots: frameTransportSlots,
      },
      attachedOutputConfigs: [],
      activeOutputDeviceIds: [],
      inFlightTasks: new Set<Promise<void>>(),
      policy: createPlaybackPolicyState(initialFrameBudgetMs),
      scheduler: null,
    };

    this.transports.set(handle, state);
    await this.writeTransportManifest(state);
    return handle;
  }

  async attachStreams(
    transportHandle: NativeResourceHandle,
    streams: PlaybackStreamDescriptor[],
  ): Promise<void> {
    const state = this.requireTransport(transportHandle);
    for (const stream of streams) {
      this.requireProjectAsset(state.projectId, stream.assetId);
    }
    state.streams = cloneValue(streams);
    state.telemetry.activeStreamCount = streams.length;
    state.policy.pendingPromotionKeys.clear();
    await this.writeTransportManifest(state, {
      attachedStreams: state.streams,
    });
  }

  async preroll(transportHandle: NativeResourceHandle, range: FrameRange): Promise<void> {
    const state = this.requireTransport(transportHandle);
    state.prerollRange = cloneValue(range);
    await this.decodeAdapter.preroll(state.decodeSessionHandle, range);
    state.telemetry.maxDecodeLatencyMs = Math.max(
      state.telemetry.maxDecodeLatencyMs,
      Math.round((range.endFrame - range.startFrame) * 0.75) + Math.max(4, state.streams.length * 5),
    );
    await this.writeTransportManifest(state, {
      prerollRange: state.prerollRange,
    });
  }

  async start(transportHandle: NativeResourceHandle, frame: number): Promise<void> {
    const state = this.requireTransport(transportHandle);
    await this.renderTransportFrame(state, frame);
  }

  async play(
    transportHandle: NativeResourceHandle,
    frame: number,
    playbackRate = 1,
  ): Promise<void> {
    const state = this.requireTransport(transportHandle);
    this.clearScheduler(state);
    const loopToken = (state.scheduler?.loopToken ?? 0) + 1;
    state.scheduler = {
      loopToken,
      timer: null,
      startedAtMs: Date.now(),
      startFrame: frame,
      playbackRate: Math.max(0.125, playbackRate),
      lastRenderedFrame: frame - 1,
      running: true,
    };
    await this.writeTransportManifest(state, {
      continuousPlayback: {
        running: true,
        startFrame: frame,
        playbackRate: state.scheduler.playbackRate,
      },
    });
    await this.tickPlaybackLoop(transportHandle, loopToken);
  }

  async syncPlaybackFrame(
    transportHandle: NativeResourceHandle,
    frame: number,
  ): Promise<void> {
    const state = this.requireTransport(transportHandle);
    if (!state.scheduler?.running) {
      await this.renderTransportFrame(state, frame);
      return;
    }

    state.scheduler.startFrame = frame;
    state.scheduler.startedAtMs = Date.now();
    state.scheduler.lastRenderedFrame = frame - 1;
    await this.writeTransportManifest(state, {
      continuousPlayback: {
        running: true,
        startFrame: frame,
        playbackRate: state.scheduler.playbackRate,
        resyncedAt: new Date().toISOString(),
      },
    });
    await this.tickPlaybackLoop(transportHandle, state.scheduler.loopToken);
  }

  private async renderTransportFrame(
    state: DesktopPlaybackTransportState,
    frame: number,
  ): Promise<void> {
    const renderStartedAt = Date.now();
    const target = inferPlaybackTarget(state.streams);
    const fps = state.snapshot.fps || 24;
    const prerollFrames = state.prerollRange
      ? Math.max(0, state.prerollRange.endFrame - state.prerollRange.startFrame)
      : 0;
    const videoStreams = state.streams.filter((stream) => stream.mediaType === 'video');
    const audioStreams = state.streams.filter((stream) => stream.mediaType === 'audio');
    const policy = this.resolveAdaptivePolicy(state, videoStreams.length, audioStreams.length);

    const decodedVideo = await Promise.all(
      Array.from(new Set(videoStreams.map((stream) => stream.assetId))).map(async (assetId) => (
        this.decodeAdapter.materializeVideoArtifact(state.decodeSessionHandle, {
          assetId,
          frame,
          variant: 'source',
          priority: state.scheduler?.running ? 'interactive' : 'preroll',
        })
      )),
    );
    const decodedAudio = await Promise.all(
      Array.from(new Set(audioStreams.map((stream) => stream.assetId))).map(async (assetId) => (
        this.decodeAdapter.materializeAudioArtifact(state.decodeSessionHandle, {
          assetId,
          timeRange: {
            startSeconds: frame / fps,
            endSeconds: (frame + Math.max(1, prerollFrames || fps)) / fps,
          },
          variant: 'source',
        })
      )),
    );
    const composite = await this.compositorAdapter.materializeCompositeArtifact({
      graphId: state.graphId,
      frame,
      target,
      quality: policy.currentQuality,
    });
    const compositePixels = await this.loadCompositePixels(composite, state.snapshot.output.width, state.snapshot.output.height);
    state.frameTransport.writeFrame(compositePixels.pixelData, {
      width: compositePixels.width,
      height: compositePixels.height,
      frameNumber: frame,
      timestamp: Date.now(),
      timecode: formatTimecodeFromFrame(frame, state.snapshot.fps),
    });

    for (const outputConfig of state.attachedOutputConfigs) {
      if (!state.activeOutputDeviceIds.includes(outputConfig.deviceId)) {
        await this.outputBindings.startPlayback?.(outputConfig);
        state.activeOutputDeviceIds.push(outputConfig.deviceId);
      }
      await this.outputBindings.sendFrame?.(outputConfig.deviceId, compositePixels.pixelData);
    }

    state.playing = true;
    state.activeFrame = frame;
    state.lastCompositeHandle = composite.handle;
    state.lastCompositeArtifactPath = composite.artifactPath;
    state.decodedVideoArtifacts = decodedVideo.filter((item): item is DesktopDecodedVideoArtifact => item != null);
    state.decodedAudioArtifacts = decodedAudio.filter((item): item is DesktopDecodedAudioArtifact => item != null);
    const renderLatencyMs = Date.now() - renderStartedAt;
    const decodeLatencyCandidates = [
      ...state.decodedVideoArtifacts.map((item) => item.decodeLatencyMs),
      ...state.decodedAudioArtifacts.map((item) => item.decodeLatencyMs),
    ];
    const cachedArtifactCount = state.decodedVideoArtifacts.filter((item) => item.cacheHit).length
      + state.decodedAudioArtifacts.filter((item) => item.cacheHit).length
      + (composite.cacheHit ? 1 : 0);
    const totalArtifactCount = state.decodedVideoArtifacts.length + state.decodedAudioArtifacts.length + 1;
    const cacheHitRate = totalArtifactCount > 0
      ? Number((cachedArtifactCount / totalArtifactCount).toFixed(2))
      : 0;
    const droppedVideoFrames = state.telemetry.droppedVideoFrames + decodedVideo.filter((item) => item == null).length;
    const audioUnderrunDelta = decodedAudio.filter((item) => item == null).length
      + (audioStreams.length > 0 && renderLatencyMs > policy.frameBudgetMs * 1.25 ? 1 : 0);
    const audioUnderruns = state.telemetry.audioUnderruns + audioUnderrunDelta;
    state.policy.currentQuality = policy.currentQuality;
    state.policy.cacheStrategy = policy.cacheStrategy;
    state.policy.streamPressure = policy.streamPressure;
    state.policy.frameBudgetMs = policy.frameBudgetMs;
    state.policy.lastFrameRenderLatencyMs = renderLatencyMs;
    state.policy.lastFrameCacheHitRate = cacheHitRate;
    state.policy.promotionLookaheadFrames = policy.promotionLookaheadFrames;
    state.policy.overBudgetWindow = renderLatencyMs > policy.frameBudgetMs
      ? Math.min(6, state.policy.overBudgetWindow + 1)
      : Math.max(0, state.policy.overBudgetWindow - 1);
    state.telemetry = {
      activeStreamCount: state.streams.length,
      droppedVideoFrames,
      audioUnderruns,
      maxDecodeLatencyMs: Math.max(state.telemetry.maxDecodeLatencyMs, 0, ...decodeLatencyCandidates),
      maxCompositeLatencyMs: Math.max(state.telemetry.maxCompositeLatencyMs, composite.compositeLatencyMs),
      currentQuality: state.policy.currentQuality,
      cacheStrategy: state.policy.cacheStrategy,
      streamPressure: state.policy.streamPressure,
      frameBudgetMs: state.policy.frameBudgetMs,
      lastFrameRenderLatencyMs: state.policy.lastFrameRenderLatencyMs,
      lastFrameCacheHitRate: state.policy.lastFrameCacheHitRate,
      promotedFrameCount: state.policy.promotedFrameCount,
    };

    await this.writeTransportManifest(state, {
      lastStartFrame: frame,
      lastCompositeHandle: composite.handle,
      lastCompositeArtifactPath: composite.artifactPath,
    });

    this.queueLookaheadPromotion(state, frame, target, policy);
  }

  async stop(transportHandle: NativeResourceHandle): Promise<void> {
    const state = this.requireTransport(transportHandle);
    this.clearScheduler(state);
    await this.waitForInFlightTasks(state);
    state.playing = false;
    for (const deviceId of state.activeOutputDeviceIds) {
      await this.outputBindings.stopPlayback?.(deviceId);
    }
    state.activeOutputDeviceIds = [];
    await this.writeTransportManifest(state, {
      stoppedAt: new Date().toISOString(),
      activeOutputDevices: state.activeOutputDeviceIds,
      continuousPlayback: {
        running: false,
      },
    });
  }

  async releaseTransport(transportHandle: NativeResourceHandle): Promise<void> {
    const state = this.requireTransport(transportHandle);
    await this.stop(transportHandle);
    state.frameTransport.reset();
    await this.decodeAdapter.releaseSession(state.decodeSessionHandle);
    await this.compositorAdapter.invalidateGraph(state.graphId);
    await this.writeTransportManifest(state, {
      releasedAt: new Date().toISOString(),
      activeOutputDevices: [],
    });
    this.transports.delete(transportHandle);
  }

  async getTelemetry(transportHandle: NativeResourceHandle): Promise<PlaybackTelemetry> {
    return cloneValue(this.requireTransport(transportHandle).telemetry);
  }

  private resolveAdaptivePolicy(
    state: DesktopPlaybackTransportState,
    videoStreamCount: number,
    audioStreamCount: number,
  ): Omit<DesktopPlaybackPolicyState, 'lastFrameRenderLatencyMs' | 'lastFrameCacheHitRate' | 'promotedFrameCount' | 'overBudgetWindow' | 'pendingPromotionKeys'> {
    const playbackRate = state.scheduler?.playbackRate ?? 1;
    const frameBudgetMs = Math.max(1, Math.round(1000 / (Math.max(1, state.snapshot.fps || 24) * playbackRate)));
    const streamPressure = determineStreamPressure(videoStreamCount, audioStreamCount, state.snapshot);
    let currentQuality: PlaybackQualityLevel = streamPressure === 'heavy'
      ? 'draft'
      : streamPressure === 'multi'
        ? 'preview'
        : 'full';

    if (state.policy.overBudgetWindow >= 2) {
      currentQuality = demotePlaybackQuality(currentQuality);
    }
    if (
      state.policy.lastFrameCacheHitRate >= 0.9
      && state.policy.lastFrameRenderLatencyMs > 0
      && state.policy.lastFrameRenderLatencyMs < frameBudgetMs * 0.6
      && streamPressure !== 'heavy'
    ) {
      currentQuality = promotePlaybackQuality(currentQuality);
    }

    let cacheStrategy: PlaybackCacheStrategy = 'source-only';
    let promotionLookaheadFrames = 0;
    if (streamPressure === 'heavy' || state.policy.overBudgetWindow >= 3) {
      cacheStrategy = 'prefer-promoted-cache';
      promotionLookaheadFrames = 4;
    } else if (streamPressure === 'multi' || state.policy.overBudgetWindow >= 1) {
      cacheStrategy = 'promote-next-frames';
      promotionLookaheadFrames = 2;
    }

    return {
      currentQuality,
      cacheStrategy,
      streamPressure,
      frameBudgetMs,
      promotionLookaheadFrames,
    };
  }

  private requireBinding(projectId: string): BoundDesktopProject {
    const binding = this.bindings.get(projectId);
    if (!binding) {
      throw new Error(`No desktop project binding registered for ${projectId}`);
    }
    return binding;
  }

  private requireProjectAsset(projectId: string, assetId: string): EditorMediaAsset {
    const binding = this.requireBinding(projectId);
    const asset = flattenAssets(binding.project.bins).find((entry) => entry.id === assetId);
    if (!asset) {
      throw new Error(`Unknown asset ${assetId} for project ${projectId}`);
    }
    return asset;
  }

  private requireTransport(transportHandle: NativeResourceHandle): DesktopPlaybackTransportState {
    const state = this.transports.get(transportHandle);
    if (!state) {
      throw new Error(`Unknown desktop playback transport: ${transportHandle}`);
    }
    return state;
  }

  private clearScheduler(state: DesktopPlaybackTransportState): void {
    if (state.scheduler?.timer) {
      clearTimeout(state.scheduler.timer);
    }
    state.policy.pendingPromotionKeys.clear();
    state.scheduler = null;
  }

  private launchTrackedTask(
    state: DesktopPlaybackTransportState,
    task: Promise<void>,
  ): void {
    state.inFlightTasks.add(task);
    void task.finally(() => {
      state.inFlightTasks.delete(task);
    });
  }

  private async waitForInFlightTasks(state: DesktopPlaybackTransportState): Promise<void> {
    if (state.inFlightTasks.size === 0) {
      return;
    }
    await Promise.allSettled(Array.from(state.inFlightTasks));
  }

  private queueLookaheadPromotion(
    state: DesktopPlaybackTransportState,
    frame: number,
    target: CompositeFrameRequest['target'],
    policy: Pick<DesktopPlaybackPolicyState, 'currentQuality' | 'cacheStrategy' | 'promotionLookaheadFrames'>,
  ): void {
    if (!state.scheduler?.running || policy.promotionLookaheadFrames <= 0) {
      return;
    }

    const videoAssetIds = Array.from(new Set(
      state.streams
        .filter((stream) => stream.mediaType === 'video')
        .map((stream) => stream.assetId),
    ));
    if (videoAssetIds.length === 0) {
      return;
    }

    for (let offset = 1; offset <= policy.promotionLookaheadFrames; offset += 1) {
      const targetFrame = frame + offset;
      const promotionKey = [
        state.handle,
        targetFrame,
        target,
        policy.currentQuality,
        policy.cacheStrategy,
      ].join(':');
      if (state.policy.pendingPromotionKeys.has(promotionKey)) {
        continue;
      }
      state.policy.pendingPromotionKeys.add(promotionKey);
      this.launchTrackedTask(
        state,
        this.promoteLookaheadFrame(state.handle, targetFrame, target, policy.currentQuality, videoAssetIds, promotionKey),
      );
    }
  }

  private async promoteLookaheadFrame(
    transportHandle: NativeResourceHandle,
    frame: number,
    target: CompositeFrameRequest['target'],
    quality: PlaybackQualityLevel,
    videoAssetIds: string[],
    promotionKey: string,
  ): Promise<void> {
    const state = this.transports.get(transportHandle);
    if (!state) {
      return;
    }

    try {
      await Promise.all(videoAssetIds.map(async (assetId) => (
        this.decodeAdapter.materializeVideoArtifact(state.decodeSessionHandle, {
          assetId,
          frame,
          variant: 'source',
          priority: 'background',
        })
      )));
      await this.compositorAdapter.materializeCompositeArtifact({
        graphId: state.graphId,
        frame,
        target,
        quality,
      });

      const currentState = this.transports.get(transportHandle);
      if (!currentState) {
        return;
      }
      currentState.policy.promotedFrameCount += 1;
      currentState.telemetry.promotedFrameCount = currentState.policy.promotedFrameCount;
      await this.writeTransportManifest(currentState, {
        playbackPolicy: this.serializePlaybackPolicy(currentState),
      });
    } catch {
      // Promotion is opportunistic; the realtime path remains authoritative.
    } finally {
      const currentState = this.transports.get(transportHandle);
      currentState?.policy.pendingPromotionKeys.delete(promotionKey);
    }
  }

  private async tickPlaybackLoop(
    transportHandle: NativeResourceHandle,
    loopToken: number,
  ): Promise<void> {
    const state = this.requireTransport(transportHandle);
    const scheduler = state.scheduler;
    if (!scheduler || !scheduler.running || scheduler.loopToken !== loopToken) {
      return;
    }

    const fps = Math.max(1, state.snapshot.fps || 24);
    const elapsedFrames = Math.max(
      0,
      Math.floor(((Date.now() - scheduler.startedAtMs) * fps * scheduler.playbackRate) / 1000),
    );
    const nextFrame = scheduler.startFrame + elapsedFrames;
    if (nextFrame > scheduler.lastRenderedFrame + 1) {
      state.telemetry.droppedVideoFrames += nextFrame - scheduler.lastRenderedFrame - 1;
    }

    await this.renderTransportFrame(state, nextFrame);
    const latestState = this.requireTransport(transportHandle);
    if (!latestState.scheduler || latestState.scheduler.loopToken !== loopToken || !latestState.scheduler.running) {
      return;
    }
    latestState.scheduler.lastRenderedFrame = nextFrame;
    const nextFrameNumber = nextFrame + 1;
    const nextFrameAtMs = latestState.scheduler.startedAtMs
      + (((nextFrameNumber - latestState.scheduler.startFrame) / (fps * latestState.scheduler.playbackRate)) * 1000);
    const delayMs = Math.max(0, Math.round(nextFrameAtMs - Date.now()));
    latestState.scheduler.timer = setTimeout(() => {
      const activeState = this.transports.get(transportHandle);
      if (!activeState) {
        return;
      }
      const task = this.tickPlaybackLoop(transportHandle, loopToken);
      this.launchTrackedTask(activeState, task);
    }, delayMs);
  }

  private async writeTransportManifest(
    state: DesktopPlaybackTransportState,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await this.fsBindings.writeFile(state.manifestPath, JSON.stringify({
      handle: state.handle,
      projectId: state.projectId,
      snapshot: state.snapshot,
      decodeSessionHandle: state.decodeSessionHandle,
      graphId: state.graphId,
      streams: state.streams,
      prerollRange: state.prerollRange,
      activeFrame: state.activeFrame,
      playing: state.playing,
      telemetry: state.telemetry,
      lastCompositeHandle: state.lastCompositeHandle,
      lastCompositeArtifactPath: state.lastCompositeArtifactPath,
      decodedVideoArtifacts: state.decodedVideoArtifacts,
      decodedAudioArtifacts: state.decodedAudioArtifacts,
      frameTransport: {
        width: state.frameTransportView.width,
        height: state.frameTransportView.height,
        bytesPerPixel: state.frameTransportView.bytesPerPixel,
        slots: state.frameTransportView.slots,
        byteLength: state.frameTransportView.buffer.byteLength,
      },
      playbackPolicy: this.serializePlaybackPolicy(state),
      attachedOutputDevices: state.attachedOutputConfigs.map((entry) => entry.deviceId),
      activeOutputDevices: state.activeOutputDeviceIds,
      continuousPlayback: state.scheduler
        ? {
            running: state.scheduler.running,
            startFrame: state.scheduler.startFrame,
            lastRenderedFrame: state.scheduler.lastRenderedFrame,
            playbackRate: state.scheduler.playbackRate,
          }
        : { running: false },
      ...extra,
    }, null, 2), 'utf8');
  }

  private serializePlaybackPolicy(
    state: DesktopPlaybackTransportState,
  ): Omit<DesktopPlaybackPolicyState, 'pendingPromotionKeys'> & { pendingPromotionCount: number } {
    return {
      currentQuality: state.policy.currentQuality,
      cacheStrategy: state.policy.cacheStrategy,
      streamPressure: state.policy.streamPressure,
      frameBudgetMs: state.policy.frameBudgetMs,
      lastFrameRenderLatencyMs: state.policy.lastFrameRenderLatencyMs,
      lastFrameCacheHitRate: state.policy.lastFrameCacheHitRate,
      promotedFrameCount: state.policy.promotedFrameCount,
      promotionLookaheadFrames: state.policy.promotionLookaheadFrames,
      overBudgetWindow: state.policy.overBudgetWindow,
      pendingPromotionCount: state.policy.pendingPromotionKeys.size,
    };
  }

  private async loadCompositePixels(
    composite: DesktopRenderedCompositeArtifact,
    fallbackWidth: number,
    fallbackHeight: number,
  ): Promise<{ width: number; height: number; pixelData: Buffer }> {
    try {
      const encoded = await this.fsBindings.readFile(composite.artifactPath);
      return convertPpmToBgra(encoded, fallbackWidth, fallbackHeight);
    } catch {
      return {
        width: fallbackWidth,
        height: fallbackHeight,
        pixelData: createSolidBgraFrame(fallbackWidth, fallbackHeight, composite.handle),
      };
    }
  }
}

export class DesktopNativeAudioMixAdapter implements ProfessionalAudioMixPort {
  private readonly fsBindings: DesktopFsBindings;
  private readonly bindings = new Map<string, BoundDesktopProject>();
  private readonly mixes = new Map<string, DesktopAudioMixState>();
  private sequence = 0;

  constructor(options: DesktopNativeMediaManagementAdapterOptions = {}) {
    this.fsBindings = {
      ...DEFAULT_FS_BINDINGS,
      ...options.fs,
    };
  }

  async bindProject(binding: DesktopProjectBinding): Promise<void> {
    const mediaPaths = DEFAULT_PIPELINE_BINDINGS.createProjectMediaPaths(binding.projectPackagePath);
    await DEFAULT_PIPELINE_BINDINGS.ensureProjectMediaPaths(mediaPaths);
    this.bindings.set(binding.project.id, {
      project: cloneValue(binding.project),
      packagePath: binding.projectPackagePath,
      mediaPaths,
    });
  }

  async compileMix(snapshot: TimelineRenderSnapshot): Promise<AudioMixCompilation> {
    const binding = this.requireBinding(snapshot.projectId);
    const mixDir = path.join(binding.mediaPaths.indexPath, 'audio-mixes');
    await this.fsBindings.mkdir(mixDir, { recursive: true });

    this.sequence += 1;
    const trackLayouts = resolveAudioTrackLayouts(binding.project);
    const topology = buildAudioMixTopology(trackLayouts as AudioTrackRoutingDescriptor[]);
    const buses = topology.buses.map((bus) => {
      const sourceTrackIds = bus.sourceTrackIds ?? trackLayouts
        .filter((track) => (
          bus.role === 'master'
          || bus.role === 'printmaster'
          || (bus.role === 'dialogue' && track.layout === 'mono')
          || (bus.role === 'music-effects' && track.layout === 'stereo')
          || (bus.role === 'surround' && (track.layout === '5.1' || track.layout === '7.1'))
          || (bus.role === 'fold-down' && (track.layout === '5.1' || track.layout === '7.1'))
        ))
        .map((track) => track.trackId);
      const sourceLayouts = bus.sourceLayouts ?? uniqueStrings(
        trackLayouts
          .filter((track) => sourceTrackIds.includes(track.trackId))
          .flatMap((track) => track.clipLayouts),
      ) as AudioChannelLayout[];

      return {
        ...bus,
        sourceTrackIds,
        sourceLayouts,
      };
    });

    const compilation: AudioMixCompilation = {
      mixId: `desktop-mix-${snapshot.projectId}-${this.sequence.toString(36)}`,
      revisionId: snapshot.revisionId,
      buses,
      trackCount: snapshot.audioTrackCount,
      dominantLayout: topology.dominantLayout,
      sourceLayouts: topology.sourceLayouts,
      containsContainerizedAudio: topology.containsContainerizedAudio,
      printMasterBusId: topology.printMasterBusId,
      monitoringBusId: topology.monitoringBusId,
      routingWarnings: topology.routingWarnings,
      processingWarnings: topology.processingWarnings,
      automationModes: createDefaultAutomationModes(trackLayouts),
    };

    const state: DesktopAudioMixState = {
      mixId: compilation.mixId,
      projectId: snapshot.projectId,
      manifestPath: path.join(
        mixDir,
        `${sanitizeArtifactBase(snapshot.sequenceId)}-${sanitizeArtifactBase(snapshot.revisionId)}-${this.sequence.toString(36)}.json`,
      ),
      snapshot: cloneValue(snapshot),
      compilation: cloneValue(compilation),
      trackLayouts,
      automationWrites: [],
      previewHandles: [],
    };

    this.mixes.set(compilation.mixId, state);
    await this.writeMixManifest(state);
    return compilation;
  }

  async writeAutomation(
    mixId: string,
    automation: AudioAutomationWrite,
  ): Promise<AudioMixCompilation> {
    const state = this.requireMix(mixId);
    state.automationWrites.push(cloneValue(automation));
    state.compilation = applyAutomationWriteToCompilation(state.compilation, automation);
    await this.writeMixManifest(state, {
      lastAutomationWrite: automation,
    });
    return cloneValue(state.compilation);
  }

  async renderPreview(
    mixId: string,
    timeRange: TimeRange,
  ): Promise<NativeResourceHandle> {
    const state = this.requireMix(mixId);
    const binding = this.requireBinding(state.projectId);
    const previewDir = path.join(binding.mediaPaths.exportsPath, 'audio-previews');
    await this.fsBindings.mkdir(previewDir, { recursive: true });

    this.sequence += 1;
    const handle = `desktop-mix-preview-${sanitizeArtifactBase(mixId)}-${this.sequence.toString(36)}`;
    state.previewHandles.push(handle);
    const previewBusMeasurements = this.buildBusMeasurements(state, timeRange, 'preview');
    const printReferenceBusMeasurements = this.buildBusMeasurements(state, timeRange, 'print');
    const stemPolicies = state.compilation.buses.map((bus) => {
      const policy = summarizeAudioBusProcessingPolicy(bus);
      return {
        busId: bus.id,
        requiresDedicatedPreviewRender: policy.requiresDedicatedPreviewRender,
        requiresDedicatedPrintRender: policy.requiresDedicatedPrintRender,
        previewBypassedProcessingChain: policy.preview.bypassedStages,
        printBypassedProcessingChain: policy.print.bypassedStages,
      };
    });

    const previewPath = path.join(previewDir, `${sanitizeArtifactBase(mixId)}-${this.sequence.toString(36)}.json`);
    await this.fsBindings.writeFile(previewPath, JSON.stringify({
      mixId,
      timeRange,
      handle,
      dominantLayout: state.compilation.dominantLayout,
      containsContainerizedAudio: state.compilation.containsContainerizedAudio ?? false,
      stems: state.compilation.buses.map((bus) => {
        const policy = stemPolicies.find((entry) => entry.busId === bus.id);
        return {
          busId: bus.id,
          name: bus.name,
          role: bus.role,
          stemRole: bus.stemRole,
          layout: bus.layout,
          meteringMode: bus.meteringMode,
          channelCount: bus.channelCount ?? getAudioChannelCountForLayout(bus.layout),
          sourceTrackIds: bus.sourceTrackIds ?? [],
          sendTargets: bus.sendTargets ?? [],
          processingChain: bus.processingChain ?? [],
          previewProcessingChain: resolveAudioBusProcessingChain(bus, 'preview'),
          printProcessingChain: resolveAudioBusProcessingChain(bus, 'print'),
          processingPolicy: policy,
        };
      }),
      routingPlan: {
        printMasterBusId: state.compilation.printMasterBusId,
        monitoringBusId: state.compilation.monitoringBusId,
        warnings: state.compilation.routingWarnings ?? [],
      },
      processing: {
        previewContext: 'preview',
        printContext: 'print',
        requiresDedicatedPreviewRender: stemPolicies.some((stem) => stem.requiresDedicatedPreviewRender),
        requiresDedicatedPrintRender: stemPolicies.some((stem) => stem.requiresDedicatedPrintRender),
        warnings: state.compilation.processingWarnings ?? [],
      },
      metering: {
        context: 'preview',
        standard: 'EBU R128',
        buses: previewBusMeasurements,
        printReferenceBuses: printReferenceBusMeasurements,
      },
      automationModes: state.compilation.automationModes ?? [],
      automationWrites: state.automationWrites,
    }, null, 2), 'utf8');
    await this.writeMixManifest(state, {
      lastPreviewHandle: handle,
      lastPreviewPath: previewPath,
    });
    return handle;
  }

  async analyzeLoudness(mixId: string, timeRange: TimeRange): Promise<LoudnessMeasurement> {
    const state = this.requireMix(mixId);
    const busMeasurements = this.buildBusMeasurements(state, timeRange, 'print');
    const primaryMeasurement = busMeasurements.find((bus) => bus.busId === state.compilation.printMasterBusId)
      ?? busMeasurements.find((bus) => bus.busId === 'master')
      ?? busMeasurements[0];
    const analyzedLayout = primaryMeasurement?.layout ?? state.compilation.dominantLayout ?? 'stereo';
    const analyzedChannelCount = getAudioChannelCountForLayout(analyzedLayout);
    const warnings = uniqueStrings([
      ...(state.compilation.containsContainerizedAudio
        ? ['Containerized multichannel audio detected; verify stem routing before turnover.']
        : []),
      ...(state.compilation.routingWarnings ?? []),
      ...(state.compilation.processingWarnings ?? []),
      ...busMeasurements.flatMap((bus) => bus.warnings ?? []),
    ]);

    const result: LoudnessMeasurement = {
      integratedLufs: primaryMeasurement?.integratedLufs ?? -24,
      shortTermLufs: primaryMeasurement?.shortTermLufs ?? -22.5,
      truePeakDbtp: primaryMeasurement?.truePeakDbtp ?? -1.5,
      analyzedLayout,
      analyzedChannelCount,
      warnings,
      diagnostics: [
        ...(state.compilation.routingWarnings ?? []),
        ...(state.compilation.processingWarnings ?? []),
      ],
      busMeasurements,
    };

    state.lastLoudness = result;
    await this.writeMixManifest(state, {
      lastLoudnessRange: timeRange,
    });
    return result;
  }

  private requireBinding(projectId: string): BoundDesktopProject {
    const binding = this.bindings.get(projectId);
    if (!binding) {
      throw new Error(`No desktop project binding registered for ${projectId}`);
    }
    return binding;
  }

  private requireMix(mixId: string): DesktopAudioMixState {
    const state = this.mixes.get(mixId);
    if (!state) {
      throw new Error(`Unknown desktop audio mix: ${mixId}`);
    }
    return state;
  }

  private buildBusMeasurements(
    state: DesktopAudioMixState,
    timeRange: TimeRange,
    context: 'preview' | 'print',
  ): NonNullable<LoudnessMeasurement['busMeasurements']> {
    const binding = this.requireBinding(state.projectId);
    const signalSummary = summarizeAudioSignal(binding.project);
    const duration = Math.max(0.1, timeRange.endSeconds - timeRange.startSeconds);
    const automationDensity = state.automationWrites.reduce((sum, write) => sum + write.points.length, 0);

    return state.compilation.buses.map((bus, index) => {
      const channelCount = bus.channelCount ?? getAudioChannelCountForLayout(bus.layout);
      const policy = summarizeAudioBusProcessingPolicy(bus);
      const activeStages = policy[context].activeStages;
      const bypassedStages = policy[context].bypassedStages;
      const limiterActive = activeStages.some((stage) => stage.kind === 'limiter');
      const dynamicsActive = activeStages.some((stage) => stage.kind === 'dynamics');
      const matrixActive = activeStages.some((stage) => stage.kind === 'fold-down-matrix');
      let integratedLufs = -24
        + Math.min(4.5, (bus.sourceTrackIds?.length ?? state.compilation.trackCount) * 0.35)
        + Math.min(2.5, signalSummary.averagePeak * 2.5)
        + Math.min(2, automationDensity * 0.12)
        + Math.min(1.5, (channelCount - 2) * 0.22)
        - index * 0.14
        + Math.min(0.3, activeStages.length * 0.08)
        + (limiterActive ? -0.22 : 0.12)
        + (dynamicsActive ? -0.08 : 0)
        + (matrixActive ? -0.1 : 0);

      if (bus.role === 'dialogue') {
        integratedLufs -= 0.5;
      } else if (bus.role === 'music-effects') {
        integratedLufs -= 0.25;
      } else if (bus.role === 'fold-down') {
        integratedLufs -= 0.85;
      } else if (bus.role === 'printmaster') {
        integratedLufs += 0.1;
      }

      const warnings: string[] = [];
      if (bus.role === 'fold-down' && state.compilation.containsContainerizedAudio) {
        warnings.push('Stereo fold-down is derived from multichannel source material; verify downmix coefficients.');
      }
      if (bus.role === 'printmaster' && (state.compilation.routingWarnings?.length ?? 0) > 0) {
        warnings.push(...(state.compilation.routingWarnings ?? []));
      }
      if (context === 'preview' && bypassedStages.length > 0) {
        warnings.push(`Preview bypasses ${bypassedStages.map((stage) => stage.kind).join(', ')} on ${bus.id}.`);
      }

      return {
        busId: bus.id,
        layout: bus.layout,
        integratedLufs: Number(integratedLufs.toFixed(2)),
        shortTermLufs: Number((integratedLufs + Math.min(1.5, duration / 4)).toFixed(2)),
        truePeakDbtp: Number((
          -2
          + Math.min(0.95, signalSummary.peakHold * 0.75)
          - (bus.role === 'fold-down' ? 0.2 : 0)
          - (limiterActive ? 0.45 : 0)
          - (matrixActive ? 0.12 : 0)
        ).toFixed(2)),
        meteringMode: bus.meteringMode,
        warnings: warnings.length > 0 ? uniqueStrings(warnings) : undefined,
      };
    });
  }

  private async writeMixManifest(
    state: DesktopAudioMixState,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await this.fsBindings.writeFile(state.manifestPath, JSON.stringify({
      mixId: state.mixId,
      projectId: state.projectId,
      snapshot: state.snapshot,
      compilation: state.compilation,
      trackLayouts: state.trackLayouts,
      automationWrites: state.automationWrites,
      previewHandles: state.previewHandles,
      lastLoudness: state.lastLoudness,
      ...extra,
    }, null, 2), 'utf8');
  }
}

export class DesktopNativeMotionEffectsAdapter implements MotionEffectsPort {
  private readonly fsBindings: DesktopFsBindings;
  private readonly bindings = new Map<string, BoundDesktopProject>();
  private readonly templates = new Map<string, MotionTemplateDescriptor>();
  private defaultProjectId: string | null = null;
  private sequence = 0;

  constructor(
    motionTemplates: MotionTemplateDescriptor[] = DEFAULT_MOTION_TEMPLATES,
    options: DesktopNativeMediaManagementAdapterOptions = {},
  ) {
    this.fsBindings = {
      ...DEFAULT_FS_BINDINGS,
      ...options.fs,
    };
    for (const descriptor of motionTemplates) {
      this.templates.set(descriptor.templateId, cloneValue(descriptor));
    }
  }

  async bindProject(binding: DesktopProjectBinding): Promise<void> {
    const mediaPaths = DEFAULT_PIPELINE_BINDINGS.createProjectMediaPaths(binding.projectPackagePath);
    await DEFAULT_PIPELINE_BINDINGS.ensureProjectMediaPaths(mediaPaths);
    this.bindings.set(binding.project.id, {
      project: cloneValue(binding.project),
      packagePath: binding.projectPackagePath,
      mediaPaths,
    });
    this.defaultProjectId = binding.project.id;
  }

  async listTemplates(): Promise<MotionTemplateDescriptor[]> {
    return Array.from(this.templates.values()).map(cloneValue);
  }

  async renderMotionFrame(request: MotionFrameRequest): Promise<MotionRenderResult> {
    const template = this.requireTemplate(request.templateId);
    const binding = this.requireDefaultBinding();
    const renderDir = path.join(binding.mediaPaths.indexPath, 'motion-renders', sanitizeArtifactBase(request.templateId));
    await this.fsBindings.mkdir(renderDir, { recursive: true });

    this.sequence += 1;
    const handle = `desktop-motion-${sanitizeArtifactBase(request.templateId)}-${this.sequence.toString(36)}`;
    const renderPath = path.join(renderDir, `${request.frame.toString(36)}-${this.sequence.toString(36)}.json`);
    await this.fsBindings.writeFile(renderPath, JSON.stringify({
      template,
      request,
      handle,
      projectId: binding.project.id,
    }, null, 2), 'utf8');

    return {
      templateId: template.templateId,
      frame: request.frame,
      handle,
    };
  }

  async invalidateTemplate(templateId: string): Promise<void> {
    const template = this.templates.get(templateId);
    if (!template) {
      return;
    }
    template.version = incrementPatchVersion(template.version);

    const binding = this.defaultProjectId ? this.bindings.get(this.defaultProjectId) : undefined;
    if (binding) {
      const templateDir = path.join(binding.mediaPaths.indexPath, 'motion-templates');
      await this.fsBindings.mkdir(templateDir, { recursive: true });
      const manifestPath = path.join(templateDir, `${sanitizeArtifactBase(templateId)}.json`);
      await this.fsBindings.writeFile(manifestPath, JSON.stringify(template, null, 2), 'utf8');
    }
  }

  private requireTemplate(templateId: string): MotionTemplateDescriptor {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Unknown motion template: ${templateId}`);
    }
    return cloneValue(template);
  }

  private requireDefaultBinding(): BoundDesktopProject {
    if (!this.defaultProjectId) {
      throw new Error('No desktop project binding registered for motion effects.');
    }
    const binding = this.bindings.get(this.defaultProjectId);
    if (!binding) {
      throw new Error(`No desktop project binding registered for ${this.defaultProjectId}`);
    }
    return binding;
  }
}

export class DesktopNativeMulticamAdapter implements MulticamPort {
  private readonly fsBindings: DesktopFsBindings;
  private readonly playbackAdapter: DesktopNativeRealtimePlaybackAdapter;
  private readonly bindings = new Map<string, BoundDesktopProject>();
  private readonly states = new Map<string, DesktopMulticamState>();
  private readonly multicamEngine = new MultiCamEngine();
  private readonly multicamSyncEngine = createMultiCamSyncEngine();
  private sequence = 0;

  constructor(
    playbackAdapter: DesktopNativeRealtimePlaybackAdapter,
    options: DesktopNativeMediaManagementAdapterOptions = {},
  ) {
    this.fsBindings = {
      ...DEFAULT_FS_BINDINGS,
      ...options.fs,
    };
    this.playbackAdapter = playbackAdapter;
  }

  async bindProject(binding: DesktopProjectBinding): Promise<void> {
    const mediaPaths = DEFAULT_PIPELINE_BINDINGS.createProjectMediaPaths(binding.projectPackagePath);
    await DEFAULT_PIPELINE_BINDINGS.ensureProjectMediaPaths(mediaPaths);
    this.bindings.set(binding.project.id, {
      project: cloneValue(binding.project),
      packagePath: binding.projectPackagePath,
      mediaPaths,
    });
  }

  async createGroup(request: MulticamGroupRequest): Promise<MulticamGroupResult> {
    if (request.angles.length === 0) {
      throw new Error('Cannot create a multicam group without angles.');
    }

    const binding = this.requireBinding(request.projectId);
    const groupDir = path.join(binding.mediaPaths.indexPath, 'multicam', sanitizeArtifactBase(request.groupId));
    await this.fsBindings.mkdir(groupDir, { recursive: true });

    const firstAngle = request.angles[0]!;
    const syncMethod = firstAngle.syncSource === 'waveform'
      ? 'waveform'
      : firstAngle.syncSource === 'manual'
        ? 'manual_slate'
        : firstAngle.syncSource === 'marker'
          ? 'marker'
          : 'timecode';

    const coreGroup = this.multicamEngine.createGroup({
      name: request.groupId,
      syncMethod,
      assets: request.angles.map((angle) => {
        const asset = this.requireProjectAsset(request.projectId, angle.assetId);
        return {
          assetId: angle.assetId,
          assetName: asset.name,
          label: angle.label,
          durationSeconds: asset.duration ?? asset.technicalMetadata?.durationSeconds,
          timecodeStart: asset.technicalMetadata?.timecodeStart,
          waveformPeaks: asset.waveformMetadata?.peaks,
          thumbnailUrl: asset.thumbnailUrl,
        };
      }),
    });

    const syncGroup = this.multicamSyncEngine.createGroup(
      request.groupId,
      this.buildSyncAngle(binding.project, firstAngle),
      request.angles.slice(1).map((angle) => this.buildSyncAngle(binding.project, angle)),
    );

    if (firstAngle.syncSource === 'waveform') {
      this.multicamSyncEngine.syncByAudioWaveform(syncGroup.id);
    } else if (firstAngle.syncSource === 'manual') {
      const slateTimes = new Map<string, number>();
      request.angles.forEach((angle, index) => {
        slateTimes.set(angle.angleId, index * 0.1);
      });
      this.multicamSyncEngine.syncBySlateClap(syncGroup.id, slateTimes);
    } else {
      this.multicamSyncEngine.syncByTimecode(syncGroup.id);
    }

    const result: MulticamGroupResult = {
      groupId: request.groupId,
      angleCount: request.angles.length,
      synced: true,
    };

    const state: DesktopMulticamState = {
      projectId: request.projectId,
      request: cloneValue(request),
      groupResult: cloneValue(result),
      coreGroupId: coreGroup.id,
      syncGroupId: syncGroup.id,
      manifestPath: path.join(groupDir, 'group.json'),
      recordedCuts: [],
    };

    this.states.set(request.groupId, state);
    await this.writeStateManifest(state);
    return result;
  }

  async prepareMultiview(groupId: string, frameRange: FrameRange): Promise<NativeResourceHandle> {
    const state = this.requireState(groupId);
    const binding = this.requireBinding(state.projectId);
    const snapshot = buildProjectSnapshot(
      binding.project,
      state.request.sequenceId,
      `${state.request.sequenceId}-multicam`,
    );
    const transportHandle = state.transportHandle ?? await this.playbackAdapter.createTransport(snapshot);
    const streams = state.request.angles.flatMap((angle, index) => {
      const descriptors: PlaybackStreamDescriptor[] = [
        {
          streamId: `${angle.angleId}-video`,
          assetId: angle.assetId,
          mediaType: 'video',
          role: 'multicam-angle',
        },
      ];
      if (index === 0) {
        descriptors.push({
          streamId: `${angle.angleId}-audio`,
          assetId: angle.assetId,
          mediaType: 'audio',
          role: 'program',
        });
      }
      return descriptors;
    });

    await this.playbackAdapter.attachStreams(transportHandle, streams);
    await this.playbackAdapter.preroll(transportHandle, frameRange);

    this.sequence += 1;
    state.transportHandle = transportHandle;
    state.preparedRange = cloneValue(frameRange);
    state.multiviewHandle = `desktop-multiview-${groupId}-${this.sequence.toString(36)}`;

    await this.writeStateManifest(state, {
      multiviewTelemetry: await this.playbackAdapter.getTelemetry(transportHandle),
    });
    return state.multiviewHandle;
  }

  async recordCuts(groupId: string, cuts: MulticamCutEvent[]): Promise<NativeResourceHandle> {
    const state = this.requireState(groupId);
    const binding = this.requireBinding(state.projectId);
    const fps = binding.project.settings.frameRate || 24;
    if (!state.transportHandle) {
      await this.prepareMultiview(groupId, {
        startFrame: cuts[0]?.frame ?? 0,
        endFrame: cuts[cuts.length - 1]?.frame ?? fps,
      });
    }

    const group = this.multicamEngine.getGroup(state.coreGroupId);
    if (!group) {
      throw new Error(`Core multicam group missing for: ${groupId}`);
    }

    const startFrame = cuts[0]?.frame ?? state.preparedRange?.startFrame ?? 0;
    if (state.transportHandle) {
      await this.playbackAdapter.start(state.transportHandle, startFrame);
    }

    this.multicamEngine.setPlayhead(state.coreGroupId, 0);
    this.multicamEngine.startLiveSwitch(state.coreGroupId);

    for (const cut of cuts) {
      const angleIndex = state.request.angles.findIndex((angle) => angle.angleId === cut.angleId);
      if (angleIndex < 0) {
        continue;
      }
      const seconds = cut.frame / fps;
      this.multicamEngine.setPlayhead(state.coreGroupId, seconds);
      this.multicamEngine.switchAngle(state.coreGroupId, angleIndex);
      this.multicamSyncEngine.switchAngle(state.syncGroupId, cut.angleId, seconds);
    }

    const endFrame = cuts.length > 0 ? cuts[cuts.length - 1]!.frame + fps : startFrame + fps;
    this.multicamEngine.setPlayhead(state.coreGroupId, endFrame / fps);
    const edit = this.multicamEngine.stopLiveSwitch(state.coreGroupId);
    this.multicamEngine.commitToTimeline(edit);

    state.recordedCuts = cloneValue(cuts);
    if (state.transportHandle) {
      await this.playbackAdapter.stop(state.transportHandle);
    }

    this.sequence += 1;
    const handle = `desktop-multicam-cuts-${groupId}-${this.sequence.toString(36)}`;
    const outputDir = path.join(binding.mediaPaths.exportsPath, 'multicam', sanitizeArtifactBase(groupId));
    await this.fsBindings.mkdir(outputDir, { recursive: true });
    await this.fsBindings.writeFile(path.join(outputDir, 'cuts.json'), JSON.stringify({
      groupId,
      cuts,
      fps,
    }, null, 2), 'utf8');
    await this.writeStateManifest(state, {
      lastCutHandle: handle,
    });
    return handle;
  }

  async commitProgramTrack(groupId: string, targetTrackId: string): Promise<NativeResourceHandle> {
    const state = this.requireState(groupId);
    const binding = this.requireBinding(state.projectId);
    const outputDir = path.join(binding.mediaPaths.exportsPath, 'multicam', sanitizeArtifactBase(groupId));
    await this.fsBindings.mkdir(outputDir, { recursive: true });

    this.sequence += 1;
    const handle = `desktop-multicam-commit-${groupId}-${this.sequence.toString(36)}`;
    const programTrack = state.recordedCuts.map((cut, index) => ({
      targetTrackId,
      cutIndex: index,
      frame: cut.frame,
      angleId: cut.angleId,
      assetId: state.request.angles.find((angle) => angle.angleId === cut.angleId)?.assetId,
      durationFrames: state.recordedCuts[index + 1]
        ? state.recordedCuts[index + 1]!.frame - cut.frame
        : Math.max(1, (state.preparedRange?.endFrame ?? cut.frame + binding.project.settings.frameRate) - cut.frame),
    }));
    const telemetry = state.transportHandle
      ? await this.playbackAdapter.getTelemetry(state.transportHandle)
      : null;

    await this.fsBindings.writeFile(path.join(outputDir, `${sanitizeArtifactBase(targetTrackId)}.program-track.json`), JSON.stringify({
      groupId,
      targetTrackId,
      cuts: state.recordedCuts,
      programTrack,
      telemetry,
    }, null, 2), 'utf8');

    state.commitHandle = handle;
    await this.writeStateManifest(state, {
      commitHandle: handle,
      targetTrackId,
      telemetry,
    });
    return handle;
  }

  private requireBinding(projectId: string): BoundDesktopProject {
    const binding = this.bindings.get(projectId);
    if (!binding) {
      throw new Error(`No desktop project binding registered for ${projectId}`);
    }
    return binding;
  }

  private requireProjectAsset(projectId: string, assetId: string): EditorMediaAsset {
    const binding = this.requireBinding(projectId);
    const asset = flattenAssets(binding.project.bins).find((entry) => entry.id === assetId);
    if (!asset) {
      throw new Error(`Unknown asset ${assetId} for project ${projectId}`);
    }
    return asset;
  }

  private requireState(groupId: string): DesktopMulticamState {
    const state = this.states.get(groupId);
    if (!state) {
      throw new Error(`Unknown multicam group: ${groupId}`);
    }
    return state;
  }

  private buildSyncAngle(
    project: EditorProject,
    angle: MulticamGroupRequest['angles'][number],
  ): Parameters<ReturnType<typeof createMultiCamSyncEngine>['createGroup']>[1] {
    const asset = flattenAssets(project.bins).find((entry) => entry.id === angle.assetId);
    return {
      id: angle.angleId,
      label: angle.label,
      assetId: angle.assetId,
      fileName: angle.label,
      durationSeconds: asset?.duration ?? asset?.technicalMetadata?.durationSeconds ?? 60,
      frameRate: project.settings.frameRate,
      timecodeStart: asset?.technicalMetadata?.timecodeStart ?? '00:00:00:00',
      timecodeStartSeconds: 0,
      audioChannels: asset?.technicalMetadata?.audioChannels ?? 2,
      sampleRate: asset?.technicalMetadata?.sampleRate ?? project.settings.sampleRate,
      waveformPeaks: asset?.waveformMetadata?.peaks,
    };
  }

  private async writeStateManifest(
    state: DesktopMulticamState,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await this.fsBindings.writeFile(state.manifestPath, JSON.stringify({
      projectId: state.projectId,
      request: state.request,
      groupResult: state.groupResult,
      coreGroupId: state.coreGroupId,
      syncGroupId: state.syncGroupId,
      transportHandle: state.transportHandle,
      multiviewHandle: state.multiviewHandle,
      preparedRange: state.preparedRange,
      recordedCuts: state.recordedCuts,
      commitHandle: state.commitHandle,
      ...extra,
    }, null, 2), 'utf8');
  }
}

export class DesktopNativeParityRuntime {
  readonly mediaDecode: ProfessionalMediaDecodePort;
  readonly videoCompositing: VideoCompositingPort;
  readonly interchange: InterchangePort;
  readonly realtimePlayback: RealtimePlaybackPort;
  readonly professionalAudioMix: ProfessionalAudioMixPort;
  readonly motionEffects: MotionEffectsPort;
  readonly changeLists: ChangeListPort;
  readonly multicam: MulticamPort;
  readonly mediaManagement: MediaManagementPort;

  private readonly referenceRuntime: ReferenceNLEParityRuntime;
  private readonly decodeAdapter: DesktopNativeDecodeAdapter;
  private readonly compositorAdapter: DesktopNativeVideoCompositingAdapter;
  private readonly playbackAdapter: DesktopNativeRealtimePlaybackAdapter;
  private readonly audioMixAdapter: DesktopNativeAudioMixAdapter;
  private readonly motionEffectsAdapter: DesktopNativeMotionEffectsAdapter;
  private readonly mediaAdapter: DesktopNativeMediaManagementAdapter;
  private readonly interchangeAdapter: DesktopNativeInterchangeAdapter;
  private readonly changeListAdapter: DesktopNativeChangeListAdapter;
  private readonly multicamAdapter: DesktopNativeMulticamAdapter;

  constructor(options: DesktopNativeParityRuntimeOptions = {}) {
    this.referenceRuntime = options.referenceRuntime ?? createReferenceNLEParityRuntime({
      sequenceRevisions: options.sequenceRevisions,
      motionTemplates: options.motionTemplates,
    });
    this.decodeAdapter = new DesktopNativeDecodeAdapter(options.mediaAdapterOptions);
    this.compositorAdapter = new DesktopNativeVideoCompositingAdapter(options.mediaAdapterOptions);
    this.playbackAdapter = new DesktopNativeRealtimePlaybackAdapter(
      this.decodeAdapter,
      this.compositorAdapter,
      options.mediaAdapterOptions,
    );
    this.audioMixAdapter = new DesktopNativeAudioMixAdapter(options.mediaAdapterOptions);
    this.motionEffectsAdapter = new DesktopNativeMotionEffectsAdapter(
      options.motionTemplates ?? DEFAULT_MOTION_TEMPLATES,
      options.mediaAdapterOptions,
    );
    this.mediaAdapter = new DesktopNativeMediaManagementAdapter(options.mediaAdapterOptions);
    this.interchangeAdapter = new DesktopNativeInterchangeAdapter(options.mediaAdapterOptions);
    this.changeListAdapter = new DesktopNativeChangeListAdapter(
      this.interchangeAdapter,
      options.mediaAdapterOptions,
      options.sequenceRevisions ?? [],
    );
    this.multicamAdapter = new DesktopNativeMulticamAdapter(
      this.playbackAdapter,
      options.mediaAdapterOptions,
    );

    this.mediaDecode = {
      createSession: async (snapshot, descriptor) => this.decodeAdapter.createSession(snapshot, descriptor),
      preroll: async (sessionHandle, range) => this.decodeAdapter.preroll(sessionHandle, range),
      decodeVideoFrame: async (sessionHandle, request) => this.decodeAdapter.decodeVideoFrame(sessionHandle, request),
      decodeAudioSlice: async (sessionHandle, request) => this.decodeAdapter.decodeAudioSlice(sessionHandle, request),
      releaseSession: async (sessionHandle) => this.decodeAdapter.releaseSession(sessionHandle),
    };
    this.videoCompositing = {
      compileGraph: async (snapshot) => this.compositorAdapter.compileGraph(snapshot),
      renderFrame: async (request) => this.compositorAdapter.renderFrame(request),
      invalidateGraph: async (graphId) => this.compositorAdapter.invalidateGraph(graphId),
    };
    this.interchange = {
      exportPackage: async (snapshot, format) => this.interchangeAdapter.exportPackage(snapshot, format),
      importPackage: async (sourcePath) => this.interchangeAdapter.importPackage(sourcePath),
      validatePackage: async (pkg) => this.interchangeAdapter.validatePackage(pkg),
    };
    this.realtimePlayback = {
      createTransport: async (snapshot) => this.playbackAdapter.createTransport(snapshot),
      attachStreams: async (handle, streams) => this.playbackAdapter.attachStreams(handle, streams),
      preroll: async (handle, range) => this.playbackAdapter.preroll(handle, range),
      start: async (handle, frame) => this.playbackAdapter.start(handle, frame),
      stop: async (handle) => this.playbackAdapter.stop(handle),
      getTelemetry: async (handle) => this.playbackAdapter.getTelemetry(handle),
    };
    this.professionalAudioMix = {
      compileMix: async (snapshot) => this.audioMixAdapter.compileMix(snapshot),
      writeAutomation: async (mixId, automation) => this.audioMixAdapter.writeAutomation(mixId, automation),
      renderPreview: async (mixId, timeRange) => this.audioMixAdapter.renderPreview(mixId, timeRange),
      analyzeLoudness: async (mixId, timeRange) => this.audioMixAdapter.analyzeLoudness(mixId, timeRange),
    };
    this.motionEffects = {
      listTemplates: async () => this.motionEffectsAdapter.listTemplates(),
      renderMotionFrame: async (request) => this.motionEffectsAdapter.renderMotionFrame(request),
      invalidateTemplate: async (templateId) => this.motionEffectsAdapter.invalidateTemplate(templateId),
    };
    this.changeLists = {
      diffSequence: async (request) => this.changeListAdapter.diffSequence(request),
      exportEDL: async (request) => this.changeListAdapter.exportEDL(request),
      exportChangeList: async (request) => this.changeListAdapter.exportChangeList(request),
    };
    this.multicam = {
      createGroup: async (request) => this.multicamAdapter.createGroup(request),
      prepareMultiview: async (groupId, frameRange) => this.multicamAdapter.prepareMultiview(groupId, frameRange),
      recordCuts: async (groupId, cuts) => this.multicamAdapter.recordCuts(groupId, cuts),
      commitProgramTrack: async (groupId, targetTrackId) => this.multicamAdapter.commitProgramTrack(groupId, targetTrackId),
    };
    this.mediaManagement = {
      auditAssetLocations: async (projectId) => this.mediaAdapter.auditAssetLocations(projectId),
      relink: async (request) => {
        const result = await this.mediaAdapter.relink(request);
        this.syncReferenceProject(request.projectId);
        return result;
      },
      consolidate: async (request) => {
        const handle = await this.mediaAdapter.consolidate(request);
        this.syncReferenceProject(request.projectId);
        return handle;
      },
      transcode: async (request) => {
        const handle = await this.mediaAdapter.transcode(request);
        this.syncReferenceProject(request.projectId);
        return handle;
      },
    };

    for (const binding of options.projectBindings ?? []) {
      void this.bindProject(binding);
    }
  }

  async bindProject(binding: DesktopProjectBinding): Promise<void> {
    await this.decodeAdapter.bindProject(binding);
    await this.compositorAdapter.bindProject(binding);
    await this.playbackAdapter.bindProject(binding);
    await this.audioMixAdapter.bindProject(binding);
    await this.motionEffectsAdapter.bindProject(binding);
    await this.mediaAdapter.bindProject(binding);
    await this.interchangeAdapter.bindProject(binding);
    await this.changeListAdapter.bindProject(binding);
    await this.multicamAdapter.bindProject(binding);
    this.referenceRuntime.registerProject(binding.project);
  }

  getProject(projectId: string): EditorProject | undefined {
    return this.mediaAdapter.getBoundProject(projectId) ?? this.referenceRuntime.getProject(projectId);
  }

  buildSnapshotForProject(
    projectId: string,
    sequenceId = projectId,
    revisionId: SequenceRevisionId = `${sequenceId}-rev-1`,
  ): TimelineRenderSnapshot {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error(`Unknown project: ${projectId}`);
    }

    this.referenceRuntime.registerProject(project);
    return this.referenceRuntime.buildSnapshotForProject(projectId, sequenceId, revisionId);
  }

  getPlaybackTransportView(transportHandle: NativeResourceHandle): DesktopPlaybackTransportView {
    return this.playbackAdapter.getTransportView(transportHandle);
  }

  async attachPlaybackOutputDevice(
    transportHandle: NativeResourceHandle,
    config: PlaybackConfig,
  ): Promise<void> {
    await this.playbackAdapter.attachOutputDevice(transportHandle, config);
  }

  async playPlaybackTransport(
    transportHandle: NativeResourceHandle,
    frame: number,
    playbackRate?: number,
  ): Promise<void> {
    await this.playbackAdapter.play(transportHandle, frame, playbackRate);
  }

  async syncPlaybackTransportFrame(
    transportHandle: NativeResourceHandle,
    frame: number,
  ): Promise<void> {
    await this.playbackAdapter.syncPlaybackFrame(transportHandle, frame);
  }

  async detachPlaybackOutputDevice(
    transportHandle: NativeResourceHandle,
    deviceId?: string,
  ): Promise<void> {
    await this.playbackAdapter.detachOutputDevice(transportHandle, deviceId);
  }

  async releasePlaybackTransport(transportHandle: NativeResourceHandle): Promise<void> {
    await this.playbackAdapter.releaseTransport(transportHandle);
  }

  async invalidatePlaybackCaches(projectId: string): Promise<void> {
    await this.decodeAdapter.invalidateProjectCache(projectId);
    await this.compositorAdapter.invalidateProjectCache(projectId);
    await this.playbackAdapter.invalidateProjectCache(projectId);
  }

  private syncReferenceProject(projectId: string): void {
    const binding = this.mediaAdapter.getProjectBinding(projectId);
    if (binding) {
      void this.decodeAdapter.bindProject(binding);
      void this.compositorAdapter.bindProject(binding);
      void this.playbackAdapter.bindProject(binding);
      void this.audioMixAdapter.bindProject(binding);
      void this.motionEffectsAdapter.bindProject(binding);
      void this.interchangeAdapter.bindProject(binding);
      void this.changeListAdapter.bindProject(binding);
      void this.multicamAdapter.bindProject(binding);
      this.referenceRuntime.registerProject(binding.project);
    }
  }
}

export function createDesktopNativeParityRuntime(
  options: DesktopNativeParityRuntimeOptions = {},
): DesktopNativeParityRuntime {
  return new DesktopNativeParityRuntime(options);
}
