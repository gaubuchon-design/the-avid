import { AAFExporter } from '../media/AAFExporter';
import { EDLExporter } from '../media/EDLExporter';
import { RelinkEngine } from '../media/RelinkEngine';
import { MultiCamEngine } from '../editing/MultiCamEngine';
import { createMultiCamSyncEngine } from '../editing/MultiCamSyncEngine';
import {
  getAudioChannelCountForLayout,
  normalizeAudioChannelLayoutLabel,
  pickDominantAudioChannelLayout,
} from '../audio/channelLayout';
import { flattenAssets } from '../project-library';
import type {
  EditorBin,
  EditorMediaAsset,
  EditorProject,
  EditorMediaTechnicalMetadata,
} from '../project-library';
import type {
  AudioAutomationWrite,
  AudioDecodeRequest,
  AudioMixCompilation,
  ChangeEvent,
  ChangeListArtifact,
  ChangeListPort,
  CompositeFrameRequest,
  CompositedVideoFrame,
  ConsolidateRequest,
  DecodedAudioSlice,
  DecodedVideoFrame,
  FrameRange,
  InterchangeAssetReference,
  InterchangeFormat,
  InterchangePackage,
  InterchangePort,
  InterchangeValidationResult,
  LoudnessMeasurement,
  ManagedMediaRelinkRequest,
  ManagedMediaRelinkResult,
  MediaDecodeRequest,
  MediaLocator,
  MediaManagementPort,
  MotionEffectsPort,
  MotionFrameRequest,
  MotionRenderResult,
  MotionTemplateDescriptor,
  MulticamCutEvent,
  MulticamGroupRequest,
  MulticamGroupResult,
  MulticamPort,
  NativeResourceHandle,
  PlaybackSessionDescriptor,
  PlaybackStreamDescriptor,
  PlaybackTelemetry,
  ProfessionalAudioMixPort,
  ProfessionalMediaDecodePort,
  RealtimePlaybackPort,
  RenderGraphCompilation,
  RenderGraphNode,
  SequenceDiffRequest,
  SequenceRevisionId,
  TimeRange,
  TimelineRenderSnapshot,
  TranscodeRequest,
  VideoCompositingPort,
} from './NLEPortContracts';
import {
  buildAudioMixTopology,
  resolveAudioBusProcessingChain,
  summarizeAudioBusExecutionPolicy,
  summarizeAudioBusProcessingPolicy,
  type AudioTrackRoutingDescriptor,
} from './audioMixTopology';

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function createHandle(prefix: string, sequence: number): string {
  return `${prefix}-${sequence.toString(36)}`;
}

function sanitizeSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'artifact';
}

function pathFileName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] ?? normalized;
}

function assetReference(asset: EditorMediaAsset): InterchangeAssetReference {
  return {
    assetId: asset.id,
    sourcePath: asset.locations?.managedPath ?? asset.locations?.originalPath ?? asset.playbackUrl,
    reel: asset.technicalMetadata?.reelName ?? asset.relinkIdentity?.reelName,
    timecode: asset.technicalMetadata?.timecodeStart ?? asset.relinkIdentity?.sourceTimecodeStart,
    durationSeconds: asset.duration ?? asset.technicalMetadata?.durationSeconds,
  };
}

function deriveAssetLocators(project: EditorProject): MediaLocator[] {
  const locators: MediaLocator[] = [];

  for (const asset of flattenAssets(project.bins)) {
    const originalPath = asset.locations?.originalPath ?? asset.playbackUrl;
    if (originalPath) {
      locators.push({
        assetId: asset.id,
        path: originalPath,
        role: 'original',
        online: asset.status !== 'OFFLINE' && asset.status !== 'ERROR',
      });
    }

    if (asset.locations?.managedPath) {
      locators.push({
        assetId: asset.id,
        path: asset.locations.managedPath,
        role: 'managed',
        online: true,
      });
    }

    if (asset.proxyMetadata?.filePath) {
      locators.push({
        assetId: asset.id,
        path: asset.proxyMetadata.filePath,
        role: 'proxy',
        online: asset.proxyMetadata.status === 'READY',
      });
    }
  }

  return locators;
}

function countTracks(project: EditorProject, type: 'VIDEO' | 'AUDIO'): number {
  return project.tracks.filter((track) => track.type === type).length;
}

function extensionForAsset(asset: EditorMediaAsset): string {
  const ext = asset.fileExtension?.replace(/^\./, '');
  if (ext) {
    return ext;
  }
  if (asset.type === 'AUDIO') {
    return 'wav';
  }
  return 'mov';
}

function proxyLikeCodec(codec: string): boolean {
  const normalized = codec.toLowerCase();
  return normalized.includes('proxy') || normalized.includes('lb');
}

function copyBinsWithAssetMutation(
  bins: EditorBin[],
  assetId: string,
  mutate: (asset: EditorMediaAsset) => EditorMediaAsset,
): EditorBin[] {
  return bins.map((bin) => ({
    ...bin,
    assets: bin.assets.map((asset) => (
      asset.id === assetId ? mutate(asset) : cloneValue(asset)
    )),
    children: copyBinsWithAssetMutation(bin.children, assetId, mutate),
  }));
}

function confidenceAsLatencyMs(activeStreams: number, prerollFrames: number): number {
  return Math.max(4, Math.round(activeStreams * 6 + prerollFrames * 0.75));
}

interface DecodeSessionState {
  snapshot: TimelineRenderSnapshot;
  descriptor: PlaybackSessionDescriptor;
  prerollRanges: FrameRange[];
}

interface CompositorGraphState {
  compilation: RenderGraphCompilation;
  snapshot: TimelineRenderSnapshot;
}

interface PlaybackTransportState {
  snapshot: TimelineRenderSnapshot;
  streams: PlaybackStreamDescriptor[];
  prerollRange: FrameRange | null;
  activeFrame: number;
  playing: boolean;
}

interface AudioMixState {
  snapshot: TimelineRenderSnapshot;
  compilation: AudioMixCompilation;
  automationWrites: AudioAutomationWrite[];
}

function uniqueLayouts(values: string[]): string[] {
  return Array.from(new Set(values));
}

function createDefaultAutomationModes(trackLayouts: AudioTrackRoutingDescriptor[]): NonNullable<AudioMixCompilation['automationModes']> {
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
  const nextParameters = uniqueLayouts([
    ...(nextEntry?.touchedParameters ?? []),
    automation.parameter,
  ]) as NonNullable<AudioMixCompilation['automationModes']>[number]['touchedParameters'];

  const automationModes = nextEntry
    ? existing.map((entry) => entry.trackId === automation.trackId
      ? { ...entry, mode: nextMode, touchedParameters: nextParameters }
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

function buildBusLoudnessMeasurements(
  mix: AudioMixCompilation,
  automationPointCount: number,
  durationSeconds: number,
  context: 'preview' | 'print',
): NonNullable<LoudnessMeasurement['busMeasurements']> {
  return mix.buses.map((bus, index) => {
    const channelCount = bus.channelCount ?? getAudioChannelCountForLayout(bus.layout);
    const policy = summarizeAudioBusProcessingPolicy(bus);
    const activeStages = policy[context].activeStages;
    const bypassedStages = policy[context].bypassedStages;
    const limiterActive = activeStages.some((stage) => stage.kind === 'limiter');
    const integratedLufs = -24
      + Math.min(3, mix.trackCount * 0.2)
      + Math.min(1.5, automationPointCount * 0.1)
      + Math.min(1.25, (channelCount - 2) * 0.2)
      - index * 0.18
      + Math.min(0.22, activeStages.length * 0.07)
      + (limiterActive ? -0.18 : 0.1);
    const warnings: string[] = [];
    if (bus.role === 'fold-down' && mix.containsContainerizedAudio) {
      warnings.push('Derived stereo fold-down should be verified against facility downmix coefficients.');
    }
    if (bus.role === 'printmaster' && (mix.routingWarnings?.length ?? 0) > 0) {
      warnings.push(...(mix.routingWarnings ?? []));
    }
    if (context === 'preview' && bypassedStages.length > 0) {
      warnings.push(`Preview bypasses ${bypassedStages.map((stage) => stage.kind).join(', ')} on ${bus.id}.`);
    }

    return {
      busId: bus.id,
      layout: bus.layout,
      integratedLufs: Number(integratedLufs.toFixed(2)),
      shortTermLufs: Number((integratedLufs + Math.min(1.5, durationSeconds / 10)).toFixed(2)),
      truePeakDbtp: Number((-2 + Math.min(0.75, channelCount * 0.08) - (limiterActive ? 0.4 : 0)).toFixed(2)),
      meteringMode: bus.meteringMode,
      warnings: warnings.length > 0 ? uniqueLayouts(warnings) : undefined,
    };
  });
}

interface ReferenceMulticamState {
  request: MulticamGroupRequest;
  groupResult: MulticamGroupResult;
  coreGroupId: string;
  syncGroupId: string;
  recordedCuts: MulticamCutEvent[];
}

export interface ReferenceNLEArtifact {
  path: string;
  format: string;
  contents: string;
}

export interface ReferenceSequenceRevision {
  projectId: string;
  sequenceId: string;
  revisionId: SequenceRevisionId;
  events: ChangeEvent[];
  snapshot?: TimelineRenderSnapshot;
}

export interface ReferenceNLEParityRuntimeOptions {
  projects?: EditorProject[];
  sequenceRevisions?: ReferenceSequenceRevision[];
  motionTemplates?: MotionTemplateDescriptor[];
}

export class ReferenceNLEParityRuntime {
  private nextHandle = 1;
  private readonly projects = new Map<string, EditorProject>();
  private readonly sequenceRevisions = new Map<string, ReferenceSequenceRevision>();
  private readonly locators = new Map<string, MediaLocator[]>();
  private readonly artifacts = new Map<string, ReferenceNLEArtifact>();
  private readonly exportedPackages = new Map<string, InterchangePackage>();
  private readonly decodeSessions = new Map<string, DecodeSessionState>();
  private readonly compositorGraphs = new Map<string, CompositorGraphState>();
  private readonly playbackTransports = new Map<string, PlaybackTransportState>();
  private readonly audioMixes = new Map<string, AudioMixState>();
  private readonly multicamStates = new Map<string, ReferenceMulticamState>();
  private readonly motionTemplates: MotionTemplateDescriptor[];
  private readonly relinkEngine = new RelinkEngine();
  private readonly multicamEngine = new MultiCamEngine();
  private readonly multicamSyncEngine = createMultiCamSyncEngine();

  readonly mediaDecode: ProfessionalMediaDecodePort;
  readonly videoCompositing: VideoCompositingPort;
  readonly interchange: InterchangePort;
  readonly realtimePlayback: RealtimePlaybackPort;
  readonly professionalAudioMix: ProfessionalAudioMixPort;
  readonly motionEffects: MotionEffectsPort;
  readonly mediaManagement: MediaManagementPort;
  readonly changeLists: ChangeListPort;
  readonly multicam: MulticamPort;

  constructor(options: ReferenceNLEParityRuntimeOptions = {}) {
    this.motionTemplates = cloneValue(options.motionTemplates ?? [
      { templateId: 'title-lower-third', kind: 'lower-third', version: '1.0.0' },
      { templateId: 'title-center', kind: 'title', version: '1.0.0' },
      { templateId: 'motion-push-blur', kind: 'effect-stack', version: '1.0.0' },
    ]);

    for (const project of options.projects ?? []) {
      this.registerProject(project);
    }

    for (const revision of options.sequenceRevisions ?? []) {
      this.registerSequenceRevision(revision);
    }

    this.mediaDecode = {
      createSession: async (snapshot, descriptor) => this.createDecodeSession(snapshot, descriptor),
      preroll: async (sessionHandle, range) => this.prerollDecodeSession(sessionHandle, range),
      decodeVideoFrame: async (sessionHandle, request) => this.decodeVideoFrame(sessionHandle, request),
      decodeAudioSlice: async (sessionHandle, request) => this.decodeAudioSlice(sessionHandle, request),
      releaseSession: async (sessionHandle) => this.releaseDecodeSession(sessionHandle),
    };

    this.videoCompositing = {
      compileGraph: async (snapshot) => this.compileGraph(snapshot),
      renderFrame: async (request) => this.renderCompositeFrame(request),
      invalidateGraph: async (graphId) => this.invalidateGraph(graphId),
    };

    this.interchange = {
      exportPackage: async (snapshot, format) => this.exportPackage(snapshot, format),
      importPackage: async (sourcePath) => this.importPackage(sourcePath),
      validatePackage: async (pkg) => this.validatePackage(pkg),
    };

    this.realtimePlayback = {
      createTransport: async (snapshot) => this.createTransport(snapshot),
      attachStreams: async (handle, streams) => this.attachStreams(handle, streams),
      preroll: async (handle, range) => this.prerollTransport(handle, range),
      start: async (handle, frame) => this.startTransport(handle, frame),
      stop: async (handle) => this.stopTransport(handle),
      getTelemetry: async (handle) => this.getPlaybackTelemetry(handle),
    };

    this.professionalAudioMix = {
      compileMix: async (snapshot) => this.compileMix(snapshot),
      writeAutomation: async (mixId, automation) => this.writeAutomation(mixId, automation),
      renderPreview: async (mixId, timeRange) => this.renderMixPreview(mixId, timeRange),
      analyzeLoudness: async (mixId, timeRange) => this.analyzeLoudness(mixId, timeRange),
    };

    this.motionEffects = {
      listTemplates: async () => cloneValue(this.motionTemplates),
      renderMotionFrame: async (request) => this.renderMotionFrame(request),
      invalidateTemplate: async (templateId) => this.invalidateTemplate(templateId),
    };

    this.mediaManagement = {
      auditAssetLocations: async (projectId) => this.auditAssetLocations(projectId),
      relink: async (request) => this.relinkAssets(request),
      consolidate: async (request) => this.consolidateAssets(request),
      transcode: async (request) => this.transcodeAssets(request),
    };

    this.changeLists = {
      diffSequence: async (request) => this.diffSequence(request),
      exportEDL: async (request) => this.exportSequenceEDL(request),
      exportChangeList: async (request) => this.exportSequenceChangeList(request),
    };

    this.multicam = {
      createGroup: async (request) => this.createMulticamGroup(request),
      prepareMultiview: async (groupId, frameRange) => this.prepareMultiview(groupId, frameRange),
      recordCuts: async (groupId, cuts) => this.recordMulticamCuts(groupId, cuts),
      commitProgramTrack: async (groupId, targetTrackId) => this.commitProgramTrack(groupId, targetTrackId),
    };
  }

  registerProject(project: EditorProject): void {
    const copy = cloneValue(project);
    this.projects.set(copy.id, copy);
    this.locators.set(copy.id, deriveAssetLocators(copy));
  }

  registerSequenceRevision(revision: ReferenceSequenceRevision): void {
    this.sequenceRevisions.set(this.revisionKey(revision.sequenceId, revision.revisionId), cloneValue(revision));
  }

  listArtifacts(): ReferenceNLEArtifact[] {
    return Array.from(this.artifacts.values()).map(cloneValue);
  }

  getProject(projectId: string): EditorProject | undefined {
    const project = this.projects.get(projectId);
    return project ? cloneValue(project) : undefined;
  }

  buildSnapshotForProject(
    projectId: string,
    sequenceId = projectId,
    revisionId = `${sequenceId}-rev-1`,
  ): TimelineRenderSnapshot {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Unknown project: ${projectId}`);
    }

    return {
      projectId,
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

  private revisionKey(sequenceId: string, revisionId: string): string {
    return `${sequenceId}::${revisionId}`;
  }

  private next(prefix: string): string {
    return createHandle(prefix, this.nextHandle++);
  }

  private storeArtifact(path: string, format: string, contents: string): void {
    this.artifacts.set(path, { path, format, contents });
  }

  private getProjectAsset(projectId: string, assetId: string): EditorMediaAsset | undefined {
    const project = this.projects.get(projectId);
    if (!project) {
      return undefined;
    }
    return flattenAssets(project.bins).find((asset) => asset.id === assetId);
  }

  private findProjectForAsset(assetId: string): { projectId: string; asset: EditorMediaAsset } | undefined {
    for (const [projectId, project] of this.projects) {
      const asset = flattenAssets(project.bins).find((item) => item.id === assetId);
      if (asset) {
        return { projectId, asset };
      }
    }
    return undefined;
  }

  private updateProjectAsset(projectId: string, assetId: string, mutate: (asset: EditorMediaAsset) => EditorMediaAsset): void {
    const project = this.projects.get(projectId);
    if (!project) {
      return;
    }

    const nextProject: EditorProject = {
      ...project,
      bins: copyBinsWithAssetMutation(project.bins, assetId, mutate),
    };

    this.projects.set(projectId, nextProject);
    this.locators.set(projectId, deriveAssetLocators(nextProject));
  }

  private createDecodeSession(
    snapshot: TimelineRenderSnapshot,
    descriptor: PlaybackSessionDescriptor,
  ): NativeResourceHandle {
    const handle = this.next('decode');
    this.decodeSessions.set(handle, {
      snapshot: cloneValue(snapshot),
      descriptor: cloneValue(descriptor),
      prerollRanges: [],
    });
    return handle;
  }

  private prerollDecodeSession(sessionHandle: string, range: FrameRange): void {
    const session = this.decodeSessions.get(sessionHandle);
    if (!session) {
      throw new Error(`Unknown decode session: ${sessionHandle}`);
    }
    session.prerollRanges.push(cloneValue(range));
  }

  private decodeVideoFrame(
    sessionHandle: string,
    request: MediaDecodeRequest,
  ): DecodedVideoFrame | null {
    const session = this.decodeSessions.get(sessionHandle);
    if (!session) {
      throw new Error(`Unknown decode session: ${sessionHandle}`);
    }

    const knownAsset = this.findProjectForAsset(request.assetId);
    if (!knownAsset) {
      return null;
    }

    return {
      assetId: request.assetId,
      frame: request.frame,
      ptsSeconds: request.frame / session.snapshot.fps,
      width: knownAsset.asset.technicalMetadata?.width ?? session.snapshot.output.width,
      height: knownAsset.asset.technicalMetadata?.height ?? session.snapshot.output.height,
      pixelFormat: request.pixelFormat ?? 'yuv420p',
      colorSpace: knownAsset.asset.technicalMetadata?.reelName ? 'Rec.709' : session.snapshot.output.colorSpace,
      storage: request.priority === 'interactive' ? 'gpu' : 'cpu',
      handle: this.next(`frame-${request.assetId}`),
    };
  }

  private decodeAudioSlice(
    sessionHandle: string,
    request: AudioDecodeRequest,
  ): DecodedAudioSlice | null {
    const session = this.decodeSessions.get(sessionHandle);
    if (!session) {
      throw new Error(`Unknown decode session: ${sessionHandle}`);
    }

    const knownAsset = this.findProjectForAsset(request.assetId);
    if (!knownAsset) {
      return null;
    }

    return {
      assetId: request.assetId,
      timeRange: cloneValue(request.timeRange),
      sampleRate: request.sampleRate ?? knownAsset.asset.technicalMetadata?.sampleRate ?? session.snapshot.sampleRate,
      channelCount: request.channels?.length ?? knownAsset.asset.technicalMetadata?.audioChannels ?? 2,
      handle: this.next(`audio-${request.assetId}`),
    };
  }

  private releaseDecodeSession(sessionHandle: string): void {
    this.decodeSessions.delete(sessionHandle);
  }

  private compileGraph(snapshot: TimelineRenderSnapshot): RenderGraphCompilation {
    const nodes: RenderGraphNode[] = [];

    for (let index = 0; index < snapshot.videoLayerCount; index += 1) {
      nodes.push({
        id: `video-layer-${index + 1}`,
        kind: 'clip',
        inputs: [],
        metadata: { layer: index + 1 },
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

    nodes.push({
      id: 'program-output',
      kind: 'overlay',
      inputs: nodes.map((node) => node.id),
      metadata: { width: snapshot.output.width, height: snapshot.output.height },
    });

    const compilation: RenderGraphCompilation = {
      graphId: this.next(`graph-${snapshot.sequenceId}`),
      revisionId: snapshot.revisionId,
      nodes,
      quality: 'full',
    };

    this.compositorGraphs.set(compilation.graphId, {
      compilation: cloneValue(compilation),
      snapshot: cloneValue(snapshot),
    });

    return compilation;
  }

  private renderCompositeFrame(request: CompositeFrameRequest): CompositedVideoFrame {
    const graphState = this.compositorGraphs.get(request.graphId);
    if (!graphState) {
      throw new Error(`Unknown graph: ${request.graphId}`);
    }

    return {
      graphId: request.graphId,
      frame: request.frame,
      width: graphState.snapshot.output.width,
      height: graphState.snapshot.output.height,
      colorSpace: graphState.snapshot.output.colorSpace,
      handle: this.next(`composite-${request.target}`),
    };
  }

  private invalidateGraph(graphId: string): void {
    this.compositorGraphs.delete(graphId);
  }

  private exportPackage(snapshot: TimelineRenderSnapshot, format: InterchangeFormat): InterchangePackage {
    const project = this.projects.get(snapshot.projectId);
    const assets = project ? flattenAssets(project.bins).map(assetReference) : [];
    const formatToken = format.toLowerCase();
    let artifactPath = `memory://interchange/${sanitizeSegment(snapshot.sequenceId)}/${sanitizeSegment(snapshot.revisionId)}.${formatToken}`;
    let contents = JSON.stringify({
      format,
      snapshot,
      assets,
    }, null, 2);

    if (project && format === 'AAF') {
      contents = JSON.stringify(
        new AAFExporter(project).export({ format: 'aaf', includeMarkers: true }),
        null,
        2,
      );
      artifactPath += '.json';
    } else if (project && format === 'OMF') {
      contents = JSON.stringify(
        new AAFExporter(project).export({ format: 'omf', includeMarkers: false }),
        null,
        2,
      );
      artifactPath += '.json';
    } else if (project && format === 'EDL') {
      contents = new EDLExporter(project).exportEDL({
        title: `${project.name} ${snapshot.revisionId}`,
        frameRate: snapshot.fps,
      });
      artifactPath += '.edl';
    } else if (format === 'XML') {
      contents = [
        `<sequence id="${snapshot.sequenceId}" revision="${snapshot.revisionId}">`,
        `  <project id="${snapshot.projectId}" />`,
        `  <videoLayers>${snapshot.videoLayerCount}</videoLayers>`,
        `  <audioTracks>${snapshot.audioTrackCount}</audioTracks>`,
        '</sequence>',
      ].join('\n');
      artifactPath += '.xml';
    } else if (format === 'OTIO') {
      artifactPath += '.otio.json';
    }

    const pkg: InterchangePackage = {
      format,
      sequenceId: snapshot.sequenceId,
      revisionId: snapshot.revisionId,
      assets,
      artifactPaths: [artifactPath],
    };

    this.storeArtifact(artifactPath, format, contents);
    this.exportedPackages.set(artifactPath, cloneValue(pkg));
    return pkg;
  }

  private importPackage(sourcePath: string): InterchangePackage {
    const pkg = this.exportedPackages.get(sourcePath);
    if (!pkg) {
      throw new Error(`Unknown interchange package: ${sourcePath}`);
    }
    return cloneValue(pkg);
  }

  private validatePackage(pkg: InterchangePackage): InterchangeValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (pkg.artifactPaths.length === 0) {
      errors.push('No artifacts were produced.');
    }

    for (const artifactPath of pkg.artifactPaths) {
      if (!this.artifacts.has(artifactPath)) {
        errors.push(`Missing artifact: ${artifactPath}`);
      }
    }

    if (pkg.assets.length === 0) {
      warnings.push('Package contains no media references.');
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors,
    };
  }

  private createTransport(snapshot: TimelineRenderSnapshot): NativeResourceHandle {
    const handle = this.next(`transport-${snapshot.sequenceId}`);
    this.playbackTransports.set(handle, {
      snapshot: cloneValue(snapshot),
      streams: [],
      prerollRange: null,
      activeFrame: 0,
      playing: false,
    });
    return handle;
  }

  private attachStreams(handle: string, streams: PlaybackStreamDescriptor[]): void {
    const transport = this.playbackTransports.get(handle);
    if (!transport) {
      throw new Error(`Unknown transport: ${handle}`);
    }
    transport.streams = cloneValue(streams);
  }

  private prerollTransport(handle: string, range: FrameRange): void {
    const transport = this.playbackTransports.get(handle);
    if (!transport) {
      throw new Error(`Unknown transport: ${handle}`);
    }
    transport.prerollRange = cloneValue(range);
  }

  private startTransport(handle: string, frame: number): void {
    const transport = this.playbackTransports.get(handle);
    if (!transport) {
      throw new Error(`Unknown transport: ${handle}`);
    }
    transport.playing = true;
    transport.activeFrame = frame;
  }

  private stopTransport(handle: string): void {
    const transport = this.playbackTransports.get(handle);
    if (!transport) {
      throw new Error(`Unknown transport: ${handle}`);
    }
    transport.playing = false;
  }

  private getPlaybackTelemetry(handle: string): PlaybackTelemetry {
    const transport = this.playbackTransports.get(handle);
    if (!transport) {
      throw new Error(`Unknown transport: ${handle}`);
    }

    const fps = Math.max(1, transport.snapshot.fps || 24);
    const prerollFrames = transport.prerollRange
      ? Math.max(0, transport.prerollRange.endFrame - transport.prerollRange.startFrame)
      : 0;
    const videoStreamCount = transport.streams.filter((stream) => stream.mediaType === 'video').length;
    const audioStreamCount = transport.streams.filter((stream) => stream.mediaType === 'audio').length;
    const weightedPressure = videoStreamCount + (audioStreamCount * 0.35);
    const streamPressure = weightedPressure >= 5
      ? 'heavy'
      : weightedPressure >= 2
        ? 'multi'
        : 'single';
    const currentQuality = streamPressure === 'heavy'
      ? 'draft'
      : streamPressure === 'multi'
        ? 'preview'
        : 'full';
    const cacheStrategy = streamPressure === 'heavy'
      ? 'prefer-promoted-cache'
      : streamPressure === 'multi'
        ? 'promote-next-frames'
        : 'source-only';

    return {
      activeStreamCount: transport.streams.length,
      droppedVideoFrames: transport.playing && transport.streams.length > 4 ? transport.streams.length - 4 : 0,
      audioUnderruns: transport.playing && transport.streams.some((stream) => stream.mediaType === 'audio') ? 0 : 0,
      maxDecodeLatencyMs: confidenceAsLatencyMs(transport.streams.length, prerollFrames),
      maxCompositeLatencyMs: confidenceAsLatencyMs(Math.max(1, transport.snapshot.videoLayerCount), prerollFrames / 2),
      currentQuality,
      cacheStrategy,
      streamPressure,
      frameBudgetMs: Math.round(1000 / fps),
      lastFrameRenderLatencyMs: 0,
      lastFrameCacheHitRate: 0,
      promotedFrameCount: streamPressure === 'single' ? 0 : Math.max(1, Math.round(prerollFrames / 6)),
    };
  }

  private compileMix(snapshot: TimelineRenderSnapshot): AudioMixCompilation {
    const project = this.projects.get(snapshot.projectId);
    const assetMap = new Map((project ? flattenAssets(project.bins) : []).map((asset) => [asset.id, asset] as const));
    const trackLayouts: AudioTrackRoutingDescriptor[] = project
      ? project.tracks
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
            clipLayouts: uniqueLayouts(clipLayouts) as AudioTrackRoutingDescriptor['clipLayouts'],
          };
        })
      : [];
    const topology = buildAudioMixTopology(trackLayouts);

    const compilation: AudioMixCompilation = {
      mixId: this.next(`mix-${snapshot.sequenceId}`),
      revisionId: snapshot.revisionId,
      buses: topology.buses,
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

    this.audioMixes.set(compilation.mixId, {
      snapshot: cloneValue(snapshot),
      compilation: cloneValue(compilation),
      automationWrites: [],
    });

    return compilation;
  }

  private writeAutomation(mixId: string, automation: AudioAutomationWrite): AudioMixCompilation {
    const mix = this.audioMixes.get(mixId);
    if (!mix) {
      throw new Error(`Unknown mix: ${mixId}`);
    }
    mix.automationWrites.push(cloneValue(automation));
    mix.compilation = applyAutomationWriteToCompilation(mix.compilation, automation);
    return cloneValue(mix.compilation);
  }

  private renderMixPreview(mixId: string, _timeRange: TimeRange): NativeResourceHandle {
    const mix = this.audioMixes.get(mixId);
    if (!mix) {
      throw new Error(`Unknown mix: ${mixId}`);
    }
    const handle = this.next(`mix-preview-${mixId}`);
    const previewBusMeasurements = buildBusLoudnessMeasurements(
      mix.compilation,
      mix.automationWrites.reduce((sum, write) => sum + write.points.length, 0),
      Math.max(0.1, _timeRange.endSeconds - _timeRange.startSeconds),
      'preview',
    );
    const printReferenceBusMeasurements = buildBusLoudnessMeasurements(
      mix.compilation,
      mix.automationWrites.reduce((sum, write) => sum + write.points.length, 0),
      Math.max(0.1, _timeRange.endSeconds - _timeRange.startSeconds),
      'print',
    );
    const busPolicies = mix.compilation.buses.map((bus) => {
      const policy = summarizeAudioBusProcessingPolicy(bus);
      const execution = summarizeAudioBusExecutionPolicy(bus);
      return {
        busId: bus.id,
        requiresDedicatedPreviewRender: policy.requiresDedicatedPreviewRender,
        requiresDedicatedPrintRender: policy.requiresDedicatedPrintRender,
        previewBypassedProcessingChain: policy.preview.bypassedStages,
        printBypassedProcessingChain: policy.print.bypassedStages,
        previewMode: execution.previewMode,
        printMode: execution.printMode,
        previewReasonKinds: execution.previewReasonKinds,
        printReasonKinds: execution.printReasonKinds,
      };
    });
    this.storeArtifact(
      `mix-preview/${sanitizeSegment(mixId)}.json`,
      'audio-preview',
      JSON.stringify({
        mixId,
        handle,
        meteringContext: 'preview',
        processingPolicy: {
          requiresDedicatedPreviewRender: busPolicies.some((bus) => bus.requiresDedicatedPreviewRender),
          requiresDedicatedPrintRender: busPolicies.some((bus) => bus.requiresDedicatedPrintRender),
          requiresBufferedPreviewCaches: busPolicies.some((bus) => bus.previewMode === 'buffered-preview-cache'),
          requiresOfflinePrintRenders: busPolicies.some((bus) => bus.printMode === 'offline-print-render'),
        },
        buses: mix.compilation.buses.map((bus) => ({
          ...bus,
          previewProcessingChain: resolveAudioBusProcessingChain(bus, 'preview'),
          printProcessingChain: resolveAudioBusProcessingChain(bus, 'print'),
          processingPolicy: busPolicies.find((policy) => policy.busId === bus.id),
        })),
        previewBusMeasurements,
        printReferenceBusMeasurements,
        routingWarnings: mix.compilation.routingWarnings ?? [],
        processingWarnings: mix.compilation.processingWarnings ?? [],
        automationModes: mix.compilation.automationModes ?? [],
      }, null, 2),
    );
    return handle;
  }

  private analyzeLoudness(mixId: string, timeRange: TimeRange): LoudnessMeasurement {
    const mix = this.audioMixes.get(mixId);
    if (!mix) {
      throw new Error(`Unknown mix: ${mixId}`);
    }

    const duration = Math.max(0.1, timeRange.endSeconds - timeRange.startSeconds);
    const automationPointCount = mix.automationWrites.reduce((sum, write) => sum + write.points.length, 0);
    const busMeasurements = buildBusLoudnessMeasurements(mix.compilation, automationPointCount, duration, 'print');
    const primaryBusMeasurement = busMeasurements.find((bus) => bus.busId === mix.compilation.printMasterBusId)
      ?? busMeasurements.find((bus) => bus.busId === 'master')
      ?? busMeasurements[0];
    const analyzedLayout = primaryBusMeasurement?.layout ?? mix.compilation.dominantLayout ?? 'stereo';
    const analyzedChannelCount = getAudioChannelCountForLayout(analyzedLayout);
    const warnings = uniqueLayouts([
      ...(mix.compilation.containsContainerizedAudio
        ? ['Containerized multichannel audio detected; verify bus layout before turnover.']
        : []),
      ...(mix.compilation.routingWarnings ?? []),
      ...(mix.compilation.processingWarnings ?? []),
      ...busMeasurements.flatMap((bus) => bus.warnings ?? []),
    ]);

    return {
      integratedLufs: primaryBusMeasurement?.integratedLufs ?? -24,
      shortTermLufs: primaryBusMeasurement?.shortTermLufs ?? -22.5,
      truePeakDbtp: primaryBusMeasurement?.truePeakDbtp ?? -1.5,
      analyzedLayout,
      analyzedChannelCount,
      warnings,
      diagnostics: [
        ...(mix.compilation.routingWarnings ?? []),
        ...(mix.compilation.processingWarnings ?? []),
      ],
      busMeasurements,
    };
  }

  private renderMotionFrame(request: MotionFrameRequest): MotionRenderResult {
    const template = this.motionTemplates.find((item) => item.templateId === request.templateId);
    if (!template) {
      throw new Error(`Unknown motion template: ${request.templateId}`);
    }

    return {
      templateId: template.templateId,
      frame: request.frame,
      handle: this.next(`motion-${template.templateId}`),
    };
  }

  private invalidateTemplate(templateId: string): void {
    const template = this.motionTemplates.find((item) => item.templateId === templateId);
    if (!template) {
      return;
    }
    template.version = `${template.version.split('.')[0]}.${template.version.split('.')[1]}.1`;
  }

  private auditAssetLocations(projectId: string): MediaLocator[] {
    return cloneValue(this.locators.get(projectId) ?? []);
  }

  private relinkAssets(request: ManagedMediaRelinkRequest): ManagedMediaRelinkResult {
    const project = this.projects.get(request.projectId);
    if (!project) {
      throw new Error(`Unknown project: ${request.projectId}`);
    }

    const offlineAssets = this.relinkEngine
      .getOfflineAssets(project)
      .filter((asset) => request.assetIds.includes(asset.id));
    const searchRoots = request.searchRoots.length > 0 ? request.searchRoots : ['/'];
    const candidateLocators = (this.locators.get(request.projectId) ?? []).filter((locator) => (
      searchRoots.some((root) => locator.path.startsWith(root))
    ));

    const candidateFiles = candidateLocators.map((locator) => {
      const asset = this.getProjectAsset(request.projectId, locator.assetId);
      return {
        filePath: locator.path,
        fileName: pathFileName(locator.path),
        fileSizeBytes: asset?.fileSizeBytes ?? 0,
        digest: asset?.fingerprint?.digest,
        technicalMetadata: asset?.technicalMetadata,
      };
    });

    const proposals = this.relinkEngine.generateProposals(offlineAssets, candidateFiles);
    const relinkedAssetIds: string[] = [];
    const unresolvedAssetIds: string[] = [];

    for (const proposal of proposals) {
      const candidate = proposal.candidates[0];
      if (!candidate) {
        unresolvedAssetIds.push(proposal.assetId);
        continue;
      }

      relinkedAssetIds.push(proposal.assetId);
      this.updateProjectAsset(request.projectId, proposal.assetId, (asset) => ({
        ...cloneValue(asset),
        status: 'READY',
        indexStatus: 'READY',
        playbackUrl: candidate.filePath,
        locations: {
          originalPath: candidate.filePath,
          managedPath: asset.locations?.managedPath,
          relativeManagedPath: asset.locations?.relativeManagedPath,
          playbackUrl: candidate.filePath,
          pathHistory: Array.from(new Set([...(asset.locations?.pathHistory ?? []), candidate.filePath])),
        },
      }));
    }

    for (const assetId of request.assetIds) {
      if (!relinkedAssetIds.includes(assetId) && !unresolvedAssetIds.includes(assetId)) {
        unresolvedAssetIds.push(assetId);
      }
    }

    return {
      relinkedAssetIds,
      unresolvedAssetIds,
      candidatesReviewed: proposals.reduce((sum, proposal) => sum + proposal.candidates.length, 0),
    };
  }

  private consolidateAssets(request: ConsolidateRequest): NativeResourceHandle {
    const project = this.projects.get(request.projectId);
    if (!project) {
      throw new Error(`Unknown project: ${request.projectId}`);
    }

    for (const assetId of request.assetIds) {
      const asset = this.getProjectAsset(request.projectId, assetId);
      if (!asset) {
        continue;
      }

      const targetPath = `${request.targetRoot}/${sanitizeSegment(asset.name)}.${extensionForAsset(asset)}`;
      this.updateProjectAsset(request.projectId, assetId, (current) => ({
        ...cloneValue(current),
        locations: {
          originalPath: current.locations?.originalPath ?? current.playbackUrl,
          managedPath: targetPath,
          relativeManagedPath: pathFileName(targetPath),
          playbackUrl: current.locations?.playbackUrl ?? current.playbackUrl,
          pathHistory: Array.from(new Set([...(current.locations?.pathHistory ?? []), targetPath])),
        },
      }));
    }

    return this.next(`consolidate-${project.id}`);
  }

  private transcodeAssets(request: TranscodeRequest): NativeResourceHandle {
    const project = this.projects.get(request.projectId);
    if (!project) {
      throw new Error(`Unknown project: ${request.projectId}`);
    }

    const isProxy = proxyLikeCodec(request.targetCodec);

    for (const assetId of request.assetIds) {
      const asset = this.getProjectAsset(request.projectId, assetId);
      if (!asset) {
        continue;
      }

      const targetPath = `${request.targetRoot}/${sanitizeSegment(asset.name)}-${sanitizeSegment(request.targetCodec)}.${extensionForAsset(asset)}`;
      this.updateProjectAsset(request.projectId, assetId, (current) => ({
        ...cloneValue(current),
        proxyMetadata: isProxy ? {
          status: 'READY',
          filePath: targetPath,
          codec: request.targetCodec,
          width: request.resolution?.width,
          height: request.resolution?.height,
          updatedAt: new Date(0).toISOString(),
        } : current.proxyMetadata,
        locations: isProxy ? current.locations : {
          originalPath: current.locations?.originalPath ?? current.playbackUrl,
          managedPath: current.locations?.managedPath,
          relativeManagedPath: current.locations?.relativeManagedPath,
          playbackUrl: current.locations?.playbackUrl ?? current.playbackUrl,
          pathHistory: Array.from(new Set([...(current.locations?.pathHistory ?? []), targetPath])),
        },
      }));
    }

    return this.next(`transcode-${project.id}`);
  }

  private diffSequence(request: SequenceDiffRequest): ChangeEvent[] {
    const base = this.sequenceRevisions.get(this.revisionKey(request.sequenceId, request.baseRevisionId));
    const target = this.sequenceRevisions.get(this.revisionKey(request.sequenceId, request.targetRevisionId));
    if (!target) {
      throw new Error(`Unknown target revision: ${request.targetRevisionId}`);
    }

    const baseFingerprints = new Set((base?.events ?? []).map((event) => JSON.stringify(event)));
    return cloneValue(target.events.filter((event) => !baseFingerprints.has(JSON.stringify(event))));
  }

  private exportSequenceEDL(request: SequenceDiffRequest): ChangeListArtifact {
    const target = this.sequenceRevisions.get(this.revisionKey(request.sequenceId, request.targetRevisionId));
    if (!target) {
      throw new Error(`Unknown target revision: ${request.targetRevisionId}`);
    }

    const project = this.projects.get(target.projectId);
    const path = `memory://changes/${sanitizeSegment(request.sequenceId)}/${sanitizeSegment(request.targetRevisionId)}.edl`;
    const contents = project
      ? new EDLExporter(project).exportEDL({
        title: `${project.name} ${request.targetRevisionId}`,
        frameRate: project.settings.frameRate,
      })
      : this.diffSequence(request).map((event, index) => (
        `${String(index + 1).padStart(3, '0')}  ${event.trackId} ${event.type} ${event.frame} ${event.detail}`
      )).join('\n');

    this.storeArtifact(path, 'EDL', contents);
    return { format: 'EDL', path };
  }

  private exportSequenceChangeList(request: SequenceDiffRequest): ChangeListArtifact {
    const diff = this.diffSequence(request);
    const path = `memory://changes/${sanitizeSegment(request.sequenceId)}/${sanitizeSegment(request.baseRevisionId)}-to-${sanitizeSegment(request.targetRevisionId)}.txt`;
    const contents = diff.map((event) => (
      `${event.type.toUpperCase()} ${event.trackId} @ ${event.frame}: ${event.detail}`
    )).join('\n');

    this.storeArtifact(path, 'ChangeList', contents);
    return { format: 'ChangeList', path };
  }

  private createMulticamGroup(request: MulticamGroupRequest): MulticamGroupResult {
    if (request.angles.length === 0) {
      throw new Error('Cannot create a multicam group without angles.');
    }

    const project = this.projects.get(request.projectId);
    if (!project) {
      throw new Error(`Unknown project: ${request.projectId}`);
    }

    const syncMethod = request.angles[0]?.syncSource === 'waveform'
      ? 'waveform'
      : request.angles[0]?.syncSource === 'manual'
        ? 'manual_slate'
        : request.angles[0]?.syncSource === 'marker'
          ? 'marker'
          : 'timecode';

    const coreGroup = this.multicamEngine.createGroup({
      name: request.groupId,
      syncMethod,
      assets: request.angles.map((angle) => {
        const asset = this.getProjectAsset(project.id, angle.assetId);
        return {
          assetId: angle.assetId,
          assetName: asset?.name ?? angle.label,
          label: angle.label,
          durationSeconds: asset?.duration ?? asset?.technicalMetadata?.durationSeconds,
          timecodeStart: asset?.technicalMetadata?.timecodeStart,
          waveformPeaks: asset?.waveformMetadata?.peaks,
          thumbnailUrl: asset?.thumbnailUrl,
        };
      }),
    });

    const syncReference = request.angles[0]!;
    const syncGroup = this.multicamSyncEngine.createGroup(
      request.groupId,
      {
        id: syncReference.angleId,
        label: syncReference.label,
        assetId: syncReference.assetId,
        fileName: syncReference.label,
        durationSeconds: this.getProjectAsset(project.id, syncReference.assetId)?.duration ?? 60,
        frameRate: project.settings.frameRate,
        timecodeStart: this.getProjectAsset(project.id, syncReference.assetId)?.technicalMetadata?.timecodeStart ?? '00:00:00:00',
        timecodeStartSeconds: 0,
        audioChannels: this.getProjectAsset(project.id, syncReference.assetId)?.technicalMetadata?.audioChannels ?? 2,
        sampleRate: this.getProjectAsset(project.id, syncReference.assetId)?.technicalMetadata?.sampleRate ?? project.settings.sampleRate,
        waveformPeaks: this.getProjectAsset(project.id, syncReference.assetId)?.waveformMetadata?.peaks,
      },
      request.angles.slice(1).map((angle) => ({
        id: angle.angleId,
        label: angle.label,
        assetId: angle.assetId,
        fileName: angle.label,
        durationSeconds: this.getProjectAsset(project.id, angle.assetId)?.duration ?? 60,
        frameRate: project.settings.frameRate,
        timecodeStart: this.getProjectAsset(project.id, angle.assetId)?.technicalMetadata?.timecodeStart ?? '00:00:00:00',
        timecodeStartSeconds: 0,
        audioChannels: this.getProjectAsset(project.id, angle.assetId)?.technicalMetadata?.audioChannels ?? 2,
        sampleRate: this.getProjectAsset(project.id, angle.assetId)?.technicalMetadata?.sampleRate ?? project.settings.sampleRate,
        waveformPeaks: this.getProjectAsset(project.id, angle.assetId)?.waveformMetadata?.peaks,
      })),
    );

    if (request.angles[0]?.syncSource === 'waveform') {
      this.multicamSyncEngine.syncByAudioWaveform(syncGroup.id);
    } else if (request.angles[0]?.syncSource === 'manual') {
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
      angleCount: coreGroup.angles.length,
      synced: true,
    };

    this.multicamStates.set(request.groupId, {
      request: cloneValue(request),
      groupResult: cloneValue(result),
      coreGroupId: coreGroup.id,
      syncGroupId: syncGroup.id,
      recordedCuts: [],
    });

    return result;
  }

  private prepareMultiview(groupId: string, _frameRange: FrameRange): NativeResourceHandle {
    if (!this.multicamStates.has(groupId)) {
      throw new Error(`Unknown multicam group: ${groupId}`);
    }
    return this.next(`multiview-${groupId}`);
  }

  private recordMulticamCuts(groupId: string, cuts: MulticamCutEvent[]): NativeResourceHandle {
    const state = this.multicamStates.get(groupId);
    if (!state) {
      throw new Error(`Unknown multicam group: ${groupId}`);
    }

    const group = this.multicamEngine.getGroup(state.coreGroupId);
    if (!group) {
      throw new Error(`Core multicam group missing for: ${groupId}`);
    }

    this.multicamEngine.setPlayhead(state.coreGroupId, 0);
    if (cuts.length > 0) {
      const firstAngleIndex = state.request.angles.findIndex((angle) => angle.angleId === cuts[0]!.angleId);
      if (firstAngleIndex >= 0) {
        this.multicamEngine.switchAngle(state.coreGroupId, firstAngleIndex);
      }
    }
    this.multicamEngine.startLiveSwitch(state.coreGroupId);

    for (const cut of cuts) {
      const angleIndex = state.request.angles.findIndex((angle) => angle.angleId === cut.angleId);
      if (angleIndex < 0) {
        continue;
      }
      const seconds = cut.frame / 30;
      this.multicamEngine.setPlayhead(state.coreGroupId, seconds);
      this.multicamEngine.switchAngle(state.coreGroupId, angleIndex);
      this.multicamSyncEngine.switchAngle(state.syncGroupId, cut.angleId, seconds);
    }

    const finalFrame = cuts.length > 0 ? cuts[cuts.length - 1]!.frame + 30 : 30;
    this.multicamEngine.setPlayhead(state.coreGroupId, finalFrame / 30);
    this.multicamEngine.stopLiveSwitch(state.coreGroupId);
    state.recordedCuts = cloneValue(cuts);

    return this.next(`multicam-cuts-${groupId}`);
  }

  private commitProgramTrack(groupId: string, _targetTrackId: string): NativeResourceHandle {
    const state = this.multicamStates.get(groupId);
    if (!state) {
      throw new Error(`Unknown multicam group: ${groupId}`);
    }

    const edit = this.multicamEngine.stopLiveSwitch(state.coreGroupId);
    this.multicamEngine.commitToTimeline(edit);
    return this.next(`multicam-commit-${groupId}`);
  }
}

export function createReferenceNLEParityRuntime(
  options: ReferenceNLEParityRuntimeOptions = {},
): ReferenceNLEParityRuntime {
  return new ReferenceNLEParityRuntime(options);
}
