import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'path';
import { pathToFileURL } from 'node:url';
import {
  AAFExporter,
  type AudioDecodeRequest,
  createReferenceNLEParityRuntime,
  type DecodedAudioSlice,
  type DecodedVideoFrame,
  flattenAssets,
  getMediaAssetPlaybackUrl,
  getMediaAssetPrimaryPath,
  type ChangeEvent,
  type ChangeListPort,
  type ChangeListArtifact,
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
  type MotionEffectsPort,
  type MulticamPort,
  type NativeResourceHandle,
  type PlaybackSessionDescriptor,
  type ProfessionalAudioMixPort,
  type ProfessionalMediaDecodePort,
  type RealtimePlaybackPort,
  type ReferenceNLEParityRuntime,
  type ReferenceNLEParityRuntimeOptions,
  type ReferenceSequenceRevision,
  type SequenceDiffRequest,
  type SequenceRevisionId,
  type TimelineRenderSnapshot,
  type TranscodeRequest,
  type ConsolidateRequest,
  type VideoCompositingPort,
  type FrameRange,
  type MediaDecodeRequest,
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

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
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
  if (!filePath) {
    return false;
  }
  try {
    await fsBindings.stat(filePath);
    return true;
  } catch {
    return false;
  }
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
    const artifactPaths = await this.writeFormatArtifacts(project, exportDir, snapshot, format);
    const pkg: InterchangePackage = {
      format,
      sequenceId: snapshot.sequenceId,
      revisionId: snapshot.revisionId,
      assets,
      artifactPaths,
    };

    const manifestPath = path.join(exportDir, 'desktop-interchange.package.json');
    await this.fsBindings.writeFile(manifestPath, JSON.stringify(pkg, null, 2), 'utf8');
    this.packages.set(manifestPath, cloneValue(pkg));
    for (const artifactPath of artifactPaths) {
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
    const serialized = await this.fsBindings.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(serialized) as InterchangePackage;
    this.packages.set(sourcePath, cloneValue(parsed));
    this.packages.set(manifestPath, cloneValue(parsed));
    return parsed;
  }

  async validatePackage(pkg: InterchangePackage): Promise<InterchangeValidationResult> {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (pkg.assets.length === 0) {
      warnings.push('Package contains no media references.');
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
      if (!await fileExists(this.fsBindings, path.join(packageDir, 'media-index.json'))) {
        warnings.push('Missing media index.');
      }
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors,
    };
  }

  private requireBinding(projectId: string): BoundDesktopProject {
    const binding = this.bindings.get(projectId);
    if (!binding) {
      throw new Error(`No desktop project binding registered for ${projectId}`);
    }
    return binding;
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
        const xml = [
          `<sequence id="${snapshot.sequenceId}" revision="${snapshot.revisionId}">`,
          `  <project id="${project.id}" name="${project.name}" />`,
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
        return [aafPath];
      }
      case 'OMF': {
        const omfPath = path.join(exportDir, 'timeline.omf.json');
        const omf = new AAFExporter(project).export({ format: 'omf', includeMarkers: false });
        await this.fsBindings.writeFile(omfPath, JSON.stringify(omf, null, 2), 'utf8');
        return [omfPath];
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
    const sourcePath = getMediaAssetPrimaryPath(asset);
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
    const sourcePath = getMediaAssetPrimaryPath(asset) ?? getMediaAssetPlaybackUrl(asset);
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
      videoLayerCount: project.tracks.filter((track) => track.type === 'VIDEO').length,
      audioTrackCount: project.tracks.filter((track) => track.type === 'AUDIO').length,
      output: {
        width: project.settings.width,
        height: project.settings.height,
        colorSpace: 'Rec.709',
      },
    };
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
  private readonly mediaAdapter: DesktopNativeMediaManagementAdapter;
  private readonly interchangeAdapter: DesktopNativeInterchangeAdapter;
  private readonly changeListAdapter: DesktopNativeChangeListAdapter;

  constructor(options: DesktopNativeParityRuntimeOptions = {}) {
    this.referenceRuntime = options.referenceRuntime ?? createReferenceNLEParityRuntime({
      sequenceRevisions: options.sequenceRevisions,
      motionTemplates: options.motionTemplates,
    });
    this.decodeAdapter = new DesktopNativeDecodeAdapter(options.mediaAdapterOptions);
    this.mediaAdapter = new DesktopNativeMediaManagementAdapter(options.mediaAdapterOptions);
    this.interchangeAdapter = new DesktopNativeInterchangeAdapter(options.mediaAdapterOptions);
    this.changeListAdapter = new DesktopNativeChangeListAdapter(
      this.interchangeAdapter,
      options.mediaAdapterOptions,
      options.sequenceRevisions ?? [],
    );

    this.mediaDecode = {
      createSession: async (snapshot, descriptor) => this.decodeAdapter.createSession(snapshot, descriptor),
      preroll: async (sessionHandle, range) => this.decodeAdapter.preroll(sessionHandle, range),
      decodeVideoFrame: async (sessionHandle, request) => this.decodeAdapter.decodeVideoFrame(sessionHandle, request),
      decodeAudioSlice: async (sessionHandle, request) => this.decodeAdapter.decodeAudioSlice(sessionHandle, request),
      releaseSession: async (sessionHandle) => this.decodeAdapter.releaseSession(sessionHandle),
    };
    this.videoCompositing = this.referenceRuntime.videoCompositing;
    this.interchange = {
      exportPackage: async (snapshot, format) => this.interchangeAdapter.exportPackage(snapshot, format),
      importPackage: async (sourcePath) => this.interchangeAdapter.importPackage(sourcePath),
      validatePackage: async (pkg) => this.interchangeAdapter.validatePackage(pkg),
    };
    this.realtimePlayback = this.referenceRuntime.realtimePlayback;
    this.professionalAudioMix = this.referenceRuntime.professionalAudioMix;
    this.motionEffects = this.referenceRuntime.motionEffects;
    this.changeLists = {
      diffSequence: async (request) => this.changeListAdapter.diffSequence(request),
      exportEDL: async (request) => this.changeListAdapter.exportEDL(request),
      exportChangeList: async (request) => this.changeListAdapter.exportChangeList(request),
    };
    this.multicam = this.referenceRuntime.multicam;
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
    await this.mediaAdapter.bindProject(binding);
    await this.interchangeAdapter.bindProject(binding);
    await this.changeListAdapter.bindProject(binding);
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
      void this.interchangeAdapter.bindProject(binding);
      void this.changeListAdapter.bindProject(binding);
      this.referenceRuntime.registerProject(binding.project);
    }
  }
}

export function createDesktopNativeParityRuntime(
  options: DesktopNativeParityRuntimeOptions = {},
): DesktopNativeParityRuntime {
  return new DesktopNativeParityRuntime(options);
}
