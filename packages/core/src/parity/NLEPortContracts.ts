export const NLE_PORT_CONTRACTS = [
  'ProfessionalMediaDecodePort',
  'VideoCompositingPort',
  'InterchangePort',
  'RealtimePlaybackPort',
  'ProfessionalAudioMixPort',
  'MotionEffectsPort',
  'MediaManagementPort',
  'ChangeListPort',
  'MulticamPort',
] as const;

export type NLEPortContractId = typeof NLE_PORT_CONTRACTS[number];

export type SequenceRevisionId = string;
export type NativeResourceHandle = string;

export interface FrameRange {
  startFrame: number;
  endFrame: number;
}

export interface TimeRange {
  startSeconds: number;
  endSeconds: number;
}

export interface TimelineRenderSnapshot {
  projectId: string;
  sequenceId: string;
  revisionId: SequenceRevisionId;
  fps: number;
  sampleRate: number;
  durationSeconds: number;
  videoLayerCount: number;
  audioTrackCount: number;
  output: {
    width: number;
    height: number;
    pixelAspectRatio?: string;
    colorSpace?: string;
  };
}

export interface PlaybackSessionDescriptor {
  purpose: 'source-monitor' | 'record-monitor' | 'multicam' | 'export' | 'background-cache';
  quality: 'draft' | 'proxy' | 'preview' | 'full';
  prerollFrames: number;
}

export interface MediaDecodeRequest {
  assetId: string;
  frame: number;
  variant: 'source' | 'managed' | 'proxy' | 'render-cache';
  priority: 'interactive' | 'preroll' | 'background';
  pixelFormat?: string;
}

export interface AudioDecodeRequest {
  assetId: string;
  timeRange: TimeRange;
  variant: 'source' | 'managed' | 'proxy' | 'render-cache';
  channels?: number[];
  sampleRate?: number;
}

export interface DecodedVideoFrame {
  assetId: string;
  frame: number;
  ptsSeconds: number;
  width: number;
  height: number;
  pixelFormat: string;
  colorSpace?: string;
  storage: 'cpu' | 'gpu';
  handle: NativeResourceHandle;
}

export interface DecodedAudioSlice {
  assetId: string;
  timeRange: TimeRange;
  sampleRate: number;
  channelCount: number;
  handle: NativeResourceHandle;
}

export interface ProfessionalMediaDecodePort {
  createSession(
    snapshot: TimelineRenderSnapshot,
    descriptor: PlaybackSessionDescriptor,
  ): Promise<NativeResourceHandle>;
  preroll(sessionHandle: NativeResourceHandle, range: FrameRange): Promise<void>;
  decodeVideoFrame(
    sessionHandle: NativeResourceHandle,
    request: MediaDecodeRequest,
  ): Promise<DecodedVideoFrame | null>;
  decodeAudioSlice(
    sessionHandle: NativeResourceHandle,
    request: AudioDecodeRequest,
  ): Promise<DecodedAudioSlice | null>;
  releaseSession(sessionHandle: NativeResourceHandle): Promise<void>;
}

export interface RenderGraphNode {
  id: string;
  kind: 'clip' | 'transition' | 'title' | 'effect' | 'color' | 'mix' | 'overlay';
  inputs: string[];
  metadata?: Record<string, string | number | boolean>;
}

export interface RenderGraphCompilation {
  graphId: string;
  revisionId: SequenceRevisionId;
  nodes: RenderGraphNode[];
  quality: 'draft' | 'preview' | 'full';
}

export interface CompositeFrameRequest {
  graphId: string;
  frame: number;
  target: 'source-monitor' | 'record-monitor' | 'multicam' | 'scopes' | 'export';
  quality: 'draft' | 'preview' | 'full';
}

export interface CompositedVideoFrame {
  graphId: string;
  frame: number;
  width: number;
  height: number;
  colorSpace?: string;
  handle: NativeResourceHandle;
}

export interface VideoCompositingPort {
  compileGraph(snapshot: TimelineRenderSnapshot): Promise<RenderGraphCompilation>;
  renderFrame(request: CompositeFrameRequest): Promise<CompositedVideoFrame>;
  invalidateGraph(graphId: string): Promise<void>;
}

export type InterchangeFormat = 'AAF' | 'OMF' | 'XML' | 'EDL' | 'OTIO';

export interface InterchangeAssetReference {
  assetId: string;
  sourcePath?: string;
  reel?: string;
  timecode?: string;
  durationSeconds?: number;
}

export interface InterchangePackage {
  format: InterchangeFormat;
  sequenceId: string;
  revisionId: SequenceRevisionId;
  assets: InterchangeAssetReference[];
  artifactPaths: string[];
}

export interface InterchangeValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export interface InterchangePort {
  exportPackage(
    snapshot: TimelineRenderSnapshot,
    format: InterchangeFormat,
  ): Promise<InterchangePackage>;
  importPackage(sourcePath: string): Promise<InterchangePackage>;
  validatePackage(pkg: InterchangePackage): Promise<InterchangeValidationResult>;
}

export interface PlaybackStreamDescriptor {
  streamId: string;
  assetId: string;
  mediaType: 'video' | 'audio';
  role: 'program' | 'source-monitor' | 'multicam-angle' | 'title' | 'effects-return';
}

export interface PlaybackTelemetry {
  activeStreamCount: number;
  droppedVideoFrames: number;
  audioUnderruns: number;
  maxDecodeLatencyMs: number;
  maxCompositeLatencyMs: number;
}

export interface RealtimePlaybackPort {
  createTransport(snapshot: TimelineRenderSnapshot): Promise<NativeResourceHandle>;
  attachStreams(
    transportHandle: NativeResourceHandle,
    streams: PlaybackStreamDescriptor[],
  ): Promise<void>;
  preroll(transportHandle: NativeResourceHandle, range: FrameRange): Promise<void>;
  start(transportHandle: NativeResourceHandle, frame: number): Promise<void>;
  stop(transportHandle: NativeResourceHandle): Promise<void>;
  getTelemetry(transportHandle: NativeResourceHandle): Promise<PlaybackTelemetry>;
}

export interface AudioBusDefinition {
  id: string;
  name: string;
  layout: 'mono' | 'stereo' | '5.1' | '7.1';
}

export interface AudioAutomationPoint {
  timeSeconds: number;
  value: number;
}

export interface AudioAutomationWrite {
  trackId: string;
  parameter: 'gain' | 'pan' | 'send' | 'mute';
  points: AudioAutomationPoint[];
}

export interface LoudnessMeasurement {
  integratedLufs: number;
  shortTermLufs: number;
  truePeakDbtp: number;
}

export interface AudioMixCompilation {
  mixId: string;
  revisionId: SequenceRevisionId;
  buses: AudioBusDefinition[];
  trackCount: number;
}

export interface ProfessionalAudioMixPort {
  compileMix(snapshot: TimelineRenderSnapshot): Promise<AudioMixCompilation>;
  writeAutomation(
    mixId: string,
    automation: AudioAutomationWrite,
  ): Promise<AudioMixCompilation>;
  renderPreview(
    mixId: string,
    timeRange: TimeRange,
  ): Promise<NativeResourceHandle>;
  analyzeLoudness(mixId: string, timeRange: TimeRange): Promise<LoudnessMeasurement>;
}

export interface MotionTemplateDescriptor {
  templateId: string;
  kind: 'title' | 'lower-third' | 'motion-graphic' | 'effect-stack';
  version: string;
}

export interface MotionFrameRequest {
  templateId: string;
  frame: number;
  width: number;
  height: number;
  revisionId: SequenceRevisionId;
}

export interface MotionRenderResult {
  templateId: string;
  frame: number;
  handle: NativeResourceHandle;
}

export interface MotionEffectsPort {
  listTemplates(): Promise<MotionTemplateDescriptor[]>;
  renderMotionFrame(request: MotionFrameRequest): Promise<MotionRenderResult>;
  invalidateTemplate(templateId: string): Promise<void>;
}

export interface MediaLocator {
  assetId: string;
  path: string;
  role: 'original' | 'managed' | 'proxy' | 'render-cache';
  online: boolean;
}

export interface ManagedMediaRelinkRequest {
  projectId: string;
  assetIds: string[];
  searchRoots: string[];
  strictKeys: ('hash' | 'reel' | 'timecode' | 'duration' | 'clip-name')[];
}

export interface ManagedMediaRelinkResult {
  relinkedAssetIds: string[];
  unresolvedAssetIds: string[];
  candidatesReviewed: number;
}

export interface ConsolidateRequest {
  projectId: string;
  assetIds: string[];
  targetRoot: string;
  handleFrames?: number;
}

export interface TranscodeRequest {
  projectId: string;
  assetIds: string[];
  targetCodec: string;
  targetRoot: string;
  resolution?: {
    width: number;
    height: number;
  };
}

export interface MediaManagementPort {
  auditAssetLocations(projectId: string): Promise<MediaLocator[]>;
  relink(request: ManagedMediaRelinkRequest): Promise<ManagedMediaRelinkResult>;
  consolidate(request: ConsolidateRequest): Promise<NativeResourceHandle>;
  transcode(request: TranscodeRequest): Promise<NativeResourceHandle>;
}

export interface SequenceDiffRequest {
  sequenceId: string;
  baseRevisionId: SequenceRevisionId;
  targetRevisionId: SequenceRevisionId;
}

export interface ChangeEvent {
  type: 'cut' | 'trim' | 'move' | 'add' | 'remove' | 'replace' | 'transition';
  trackId: string;
  frame: number;
  detail: string;
}

export interface ChangeListArtifact {
  format: 'EDL' | 'ChangeList' | 'CSV';
  path: string;
}

export interface ChangeListPort {
  diffSequence(request: SequenceDiffRequest): Promise<ChangeEvent[]>;
  exportEDL(request: SequenceDiffRequest): Promise<ChangeListArtifact>;
  exportChangeList(request: SequenceDiffRequest): Promise<ChangeListArtifact>;
}

export interface MulticamAngleDescriptor {
  angleId: string;
  assetId: string;
  label: string;
  syncSource: 'timecode' | 'waveform' | 'marker' | 'manual';
}

export interface MulticamGroupRequest {
  groupId: string;
  projectId: string;
  sequenceId: string;
  angles: MulticamAngleDescriptor[];
}

export interface MulticamCutEvent {
  frame: number;
  angleId: string;
}

export interface MulticamGroupResult {
  groupId: string;
  angleCount: number;
  synced: boolean;
}

export interface MulticamPort {
  createGroup(request: MulticamGroupRequest): Promise<MulticamGroupResult>;
  prepareMultiview(groupId: string, frameRange: FrameRange): Promise<NativeResourceHandle>;
  recordCuts(groupId: string, cuts: MulticamCutEvent[]): Promise<NativeResourceHandle>;
  commitProgramTrack(groupId: string, targetTrackId: string): Promise<NativeResourceHandle>;
}
