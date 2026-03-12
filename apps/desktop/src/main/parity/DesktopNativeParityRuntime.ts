import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  AAFExporter,
  ProToolsAAFExporter,
  type AudioAutomationWrite,
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
  type PlaybackSessionDescriptor,
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
  MultiCamEngine,
  createMultiCamSyncEngine,
} from '@mcua/core';
import {
  createProjectMediaPaths,
  ensureProjectMediaPaths,
  relinkProjectMedia,
  transcodeExportArtifact,
  writeConformExportPackage,
  writeMediaIndexManifest,
  type ExportTranscodeRequest,
  type ProjectMediaPaths,
} from '../mediaPipeline';

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
}

export interface DesktopFsBindings {
  copyFile: typeof copyFile;
  mkdir: typeof mkdir;
  readFile: typeof readFile;
  stat: typeof stat;
  writeFile: typeof writeFile;
}

export interface DesktopNativeMediaManagementAdapterOptions {
  pipeline?: Partial<DesktopMediaPipelineBindings>;
  fs?: Partial<DesktopFsBindings>;
}

export interface DesktopNativeParityRuntimeOptions extends ReferenceNLEParityRuntimeOptions {
  projectBindings?: DesktopProjectBinding[];
  mediaAdapterOptions?: DesktopNativeMediaManagementAdapterOptions;
  referenceRuntime?: ReferenceNLEParityRuntime;
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
};

const DEFAULT_FS_BINDINGS: DesktopFsBindings = {
  copyFile,
  mkdir,
  readFile,
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

interface DesktopDecodeSessionState {
  handle: NativeResourceHandle;
  projectId: string;
  manifestPath: string;
  snapshot: TimelineRenderSnapshot;
  descriptor: PlaybackSessionDescriptor;
  prerollRanges: FrameRange[];
  releasedAt?: string;
}

interface DesktopCompositorGraphState {
  projectId: string;
  manifestPath: string;
  snapshot: TimelineRenderSnapshot;
  compilation: RenderGraphCompilation;
  renderedFrames: number[];
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
}

interface DesktopAudioMixState {
  mixId: string;
  projectId: string;
  manifestPath: string;
  snapshot: TimelineRenderSnapshot;
  compilation: AudioMixCompilation;
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

    const exporter = new ProToolsAAFExporter(project, {
      outputPath: path.join(exportDir, 'protools-turnover.aaf'),
      includeAutomation: true,
      includeRenderedEffects: true,
    });
    const validation = exporter.validate();
    const validationPath = path.join(exportDir, 'protools-turnover.validation.json');
    await this.fsBindings.writeFile(validationPath, JSON.stringify(validation, null, 2), 'utf8');
    companionPaths.push(validationPath);

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
  private readonly fsBindings: DesktopFsBindings;
  private readonly bindings = new Map<string, BoundDesktopProject>();
  private readonly sessions = new Map<string, DesktopDecodeSessionState>();
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
    const session = this.requireSession(sessionHandle);
    const asset = this.requireProjectAsset(session.projectId, request.assetId);
    const sourcePath = normalizeFilesystemPath(getMediaAssetPrimaryPath(asset));
    if (!await fileExists(this.fsBindings, sourcePath)) {
      return null;
    }

    await this.writeSessionManifest(session, {
      lastVideoRequest: request,
      lastVideoResolvedPath: sourcePath,
    });

    return {
      assetId: request.assetId,
      frame: request.frame,
      ptsSeconds: request.frame / session.snapshot.fps,
      width: asset.technicalMetadata?.width ?? session.snapshot.output.width,
      height: asset.technicalMetadata?.height ?? session.snapshot.output.height,
      pixelFormat: request.pixelFormat ?? 'yuv420p',
      colorSpace: session.snapshot.output.colorSpace,
      storage: request.priority === 'interactive' ? 'gpu' : 'cpu',
      handle: `desktop-frame-${request.assetId}-${request.frame.toString(36)}`,
    };
  }

  async decodeAudioSlice(
    sessionHandle: NativeResourceHandle,
    request: AudioDecodeRequest,
  ): Promise<DecodedAudioSlice | null> {
    const session = this.requireSession(sessionHandle);
    const asset = this.requireProjectAsset(session.projectId, request.assetId);
    const sourcePath = normalizeFilesystemPath(getMediaAssetPrimaryPath(asset) ?? getMediaAssetPlaybackUrl(asset));
    if (!await fileExists(this.fsBindings, sourcePath)) {
      return null;
    }

    await this.writeSessionManifest(session, {
      lastAudioRequest: request,
      lastAudioResolvedPath: sourcePath,
    });

    return {
      assetId: request.assetId,
      timeRange: cloneValue(request.timeRange),
      sampleRate: request.sampleRate ?? asset.technicalMetadata?.sampleRate ?? session.snapshot.sampleRate,
      channelCount: request.channels?.length ?? asset.technicalMetadata?.audioChannels ?? 2,
      handle: `desktop-audio-${request.assetId}-${this.sequence.toString(36)}`,
    };
  }

  async releaseSession(sessionHandle: NativeResourceHandle): Promise<void> {
    const session = this.requireSession(sessionHandle);
    session.releasedAt = new Date().toISOString();
    await this.writeSessionManifest(session);
    this.sessions.delete(sessionHandle);
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
  private readonly fsBindings: DesktopFsBindings;
  private readonly bindings = new Map<string, BoundDesktopProject>();
  private readonly graphs = new Map<string, DesktopCompositorGraphState>();
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
    };

    this.graphs.set(graphId, state);
    await this.writeGraphManifest(state);
    return compilation;
  }

  async renderFrame(request: CompositeFrameRequest): Promise<CompositedVideoFrame> {
    const state = this.requireGraph(request.graphId);
    state.renderedFrames.push(request.frame);
    const handle = `desktop-composite-${request.target}-${request.frame.toString(36)}`;
    await this.writeGraphManifest(state, {
      lastRenderRequest: request,
      lastCompositeHandle: handle,
    });

    return {
      graphId: request.graphId,
      frame: request.frame,
      width: state.snapshot.output.width,
      height: state.snapshot.output.height,
      colorSpace: state.snapshot.output.colorSpace,
      handle,
    };
  }

  async invalidateGraph(graphId: string): Promise<void> {
    const state = this.graphs.get(graphId);
    if (!state) {
      return;
    }
    await this.writeGraphManifest(state, {
      invalidatedAt: new Date().toISOString(),
    });
    this.graphs.delete(graphId);
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
      ...extra,
    }, null, 2), 'utf8');
  }
}

export class DesktopNativeRealtimePlaybackAdapter implements RealtimePlaybackPort {
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
    this.fsBindings = {
      ...DEFAULT_FS_BINDINGS,
      ...options.fs,
    };
    this.decodeAdapter = decodeAdapter;
    this.compositorAdapter = compositorAdapter;
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
      telemetry: {
        activeStreamCount: 0,
        droppedVideoFrames: 0,
        audioUnderruns: 0,
        maxDecodeLatencyMs: Math.max(4, snapshot.videoLayerCount * 3),
        maxCompositeLatencyMs: Math.max(4, snapshot.videoLayerCount * 4),
      },
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
    const target = inferPlaybackTarget(state.streams);
    const fps = state.snapshot.fps || 24;
    const prerollFrames = state.prerollRange
      ? Math.max(0, state.prerollRange.endFrame - state.prerollRange.startFrame)
      : 0;
    const videoStreams = state.streams.filter((stream) => stream.mediaType === 'video');
    const audioStreams = state.streams.filter((stream) => stream.mediaType === 'audio');

    const decodedVideo = await Promise.all(
      Array.from(new Set(videoStreams.map((stream) => stream.assetId))).map(async (assetId) => (
        this.decodeAdapter.decodeVideoFrame(state.decodeSessionHandle, {
          assetId,
          frame,
          variant: 'source',
          priority: 'interactive',
        })
      )),
    );
    const decodedAudio = await Promise.all(
      Array.from(new Set(audioStreams.map((stream) => stream.assetId))).map(async (assetId) => (
        this.decodeAdapter.decodeAudioSlice(state.decodeSessionHandle, {
          assetId,
          timeRange: {
            startSeconds: frame / fps,
            endSeconds: (frame + Math.max(1, prerollFrames || fps)) / fps,
          },
          variant: 'source',
        })
      )),
    );
    const composite = await this.compositorAdapter.renderFrame({
      graphId: state.graphId,
      frame,
      target,
      quality: videoStreams.length > 2 ? 'preview' : 'full',
    });

    state.playing = true;
    state.activeFrame = frame;
    state.lastCompositeHandle = composite.handle;
    state.telemetry = {
      activeStreamCount: state.streams.length,
      droppedVideoFrames: decodedVideo.filter((item) => item == null).length + Math.max(0, videoStreams.length - 2),
      audioUnderruns: decodedAudio.filter((item) => item == null).length,
      maxDecodeLatencyMs: Math.max(
        4,
        videoStreams.length * 8 + audioStreams.length * 4 + Math.round(prerollFrames * 0.5),
      ),
      maxCompositeLatencyMs: Math.max(
        4,
        state.snapshot.videoLayerCount * 5 + (target === 'multicam' ? 12 : 6) + Math.round(prerollFrames * 0.25),
      ),
    };

    await this.writeTransportManifest(state, {
      lastStartFrame: frame,
      lastCompositeHandle: composite.handle,
    });
  }

  async stop(transportHandle: NativeResourceHandle): Promise<void> {
    const state = this.requireTransport(transportHandle);
    state.playing = false;
    await this.writeTransportManifest(state, {
      stoppedAt: new Date().toISOString(),
    });
  }

  async getTelemetry(transportHandle: NativeResourceHandle): Promise<PlaybackTelemetry> {
    return cloneValue(this.requireTransport(transportHandle).telemetry);
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
      ...extra,
    }, null, 2), 'utf8');
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
    const buses = [
      { id: 'master', name: 'Master', layout: 'stereo' as const },
      ...(snapshot.audioTrackCount >= 2 ? [
        { id: 'dialogue', name: 'Dialogue', layout: 'stereo' as const },
        { id: 'music-effects', name: 'Music+Effects', layout: 'stereo' as const },
      ] : []),
      ...(snapshot.audioTrackCount >= 6 ? [
        { id: 'surround', name: 'Surround', layout: '5.1' as const },
      ] : []),
    ];

    const compilation: AudioMixCompilation = {
      mixId: `desktop-mix-${snapshot.projectId}-${this.sequence.toString(36)}`,
      revisionId: snapshot.revisionId,
      buses,
      trackCount: snapshot.audioTrackCount,
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

    const previewPath = path.join(previewDir, `${sanitizeArtifactBase(mixId)}-${this.sequence.toString(36)}.json`);
    await this.fsBindings.writeFile(previewPath, JSON.stringify({
      mixId,
      timeRange,
      handle,
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
    const binding = this.requireBinding(state.projectId);
    const peaks = flattenAssets(binding.project.bins)
      .filter((asset) => asset.type === 'AUDIO' || (asset.technicalMetadata?.audioChannels ?? 0) > 0)
      .flatMap((asset) => asset.waveformMetadata?.peaks ?? asset.waveformData ?? []);
    const averagePeak = peaks.length > 0
      ? peaks.reduce((sum, value) => sum + value, 0) / peaks.length
      : 0.35;
    const duration = Math.max(0.1, timeRange.endSeconds - timeRange.startSeconds);
    const automationDensity = state.automationWrites.reduce((sum, write) => sum + write.points.length, 0);
    const integratedLufs = -24
      + Math.min(4.5, state.compilation.trackCount * 0.35)
      + Math.min(2.5, averagePeak * 2.5)
      + Math.min(2, automationDensity * 0.12);

    const result: LoudnessMeasurement = {
      integratedLufs: Number(integratedLufs.toFixed(2)),
      shortTermLufs: Number((integratedLufs + Math.min(1.5, duration / 4)).toFixed(2)),
      truePeakDbtp: Number((-2 + Math.min(0.95, averagePeak * 0.75)).toFixed(2)),
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

  private async writeMixManifest(
    state: DesktopAudioMixState,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await this.fsBindings.writeFile(state.manifestPath, JSON.stringify({
      mixId: state.mixId,
      projectId: state.projectId,
      snapshot: state.snapshot,
      compilation: state.compilation,
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
