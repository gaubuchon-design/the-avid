// =============================================================================
//  THE AVID — Deliver System Types
//  Canonical type definitions for distributed rendering, publishing templates,
//  export settings, and render farm coordination.
// =============================================================================

import type { ExportFormat, ExportCategory, CaptionFormat } from '../engine/ExportEngine';

// ─── Worker Types ────────────────────────────────────────────────────────────

/** Specialised processing roles a render farm node can perform. */
export type WorkerType = 'ingest' | 'transcribe' | 'metadata' | 'render';

/** Lifecycle status of a worker node. */
export type WorkerStatus = 'idle' | 'busy' | 'offline' | 'error' | 'draining';

/** Hardware and software capabilities detected on a worker node. */
export interface WorkerCapabilities {
  gpuVendor: string;                  // 'nvidia' | 'amd' | 'apple' | 'intel' | 'unknown'
  gpuName: string;                    // e.g. 'NVIDIA RTX 4090'
  vramMB: number;
  cpuCores: number;
  memoryGB: number;
  availableCodecs: string[];          // ['h264', 'h265', 'prores', 'dnxhd', 'av1', ...]
  ffmpegVersion: string;
  maxConcurrentJobs: number;
  hwAccel: string[];                  // ['nvenc', 'videotoolbox', 'vaapi', ...]
}

/** Runtime health and performance metrics for a worker node. */
export interface WorkerMetrics {
  jobsCompleted: number;
  averageJobDurationMs: number;
  failureRate: number;                // 0-1
  cpuUtilization: number;             // 0-100
  gpuUtilization: number;             // 0-100
  diskFreeGB: number;
  uptimeMs: number;
}

/** A single render farm node (may support multiple worker types). */
export interface WorkerNode {
  id: string;
  hostname: string;
  ip: string;
  port: number;
  workerTypes: WorkerType[];
  status: WorkerStatus;
  currentJobId: string | null;
  progress: number;                   // 0-100 for current job
  capabilities: WorkerCapabilities;
  lastHeartbeat: number;              // timestamp
  connectedAt: number;               // timestamp
  metrics: WorkerMetrics;
}

// ─── Render Job Types ────────────────────────────────────────────────────────

/** Lifecycle status of a render job or segment. */
export type RenderJobStatus =
  | 'pending'
  | 'queued'
  | 'splitting'
  | 'encoding'
  | 'uploading'
  | 'concatenating'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

/** Job priority levels (highest first). */
export type JobPriority = 'critical' | 'high' | 'normal' | 'low' | 'background';

/** A segment of a split render job assigned to one worker. */
export interface RenderJobSegment {
  id: string;
  jobId: string;
  segmentIndex: number;
  startFrame: number;
  endFrame: number;
  assignedNodeId: string | null;
  status: RenderJobStatus;
  progress: number;                   // 0-100
  outputPath?: string;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

/** A complete render job in the queue. May be split across multiple workers. */
export interface RenderJob {
  id: string;
  name: string;                       // display name (e.g. "Project_v3_YouTube_4K")
  templateId: string | null;
  presetId: string;
  status: RenderJobStatus;
  priority: JobPriority;
  progress: number;                   // 0-100 (aggregated from segments)
  assignedNodeIds: string[];
  segments: RenderJobSegment[];

  // Timing
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  estimatedTimeRemaining?: number;    // seconds

  // Source
  sourceTimelineId: string;
  selectionMode: 'full' | 'inout' | 'selected';
  inFrame?: number;
  outFrame?: number;
  totalFrames: number;

  // Output
  outputPath?: string;
  outputSize?: number;                // bytes
  error?: string;

  // Settings snapshot
  exportSettings: ExportSettings;
}

// ─── Publishing Template Types ───────────────────────────────────────────────

/** Template categories (superset of ExportCategory). */
export type TemplateCategory =
  | 'social'
  | 'broadcast'
  | 'archive'
  | 'streaming'
  | 'interchange'
  | 'custom';

/** Step types within a publishing workflow. */
export type TemplateStepType =
  | 'encode'
  | 'transcode'
  | 'upload'
  | 'validate'
  | 'metadata'
  | 'reframe'
  | 'caption'
  | 'qc'
  | 'package'
  | 'watermark'
  | 'loudness'
  | 'checksum';

/** What to do when a pipeline step fails. */
export type StepFailureAction = 'skip' | 'retry' | 'abort';

/** A single step in a multi-step publishing workflow. */
export interface TemplateStep {
  id: string;
  order: number;
  type: TemplateStepType;
  label: string;
  workerType: WorkerType;
  config: Record<string, unknown>;
  failureAction: StepFailureAction;
  optional: boolean;
}

/** A publishing template = preset + workflow + destination. */
export interface PublishingTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  icon: string;                       // icon identifier for UI
  description: string;
  isBuiltIn: boolean;
  steps: TemplateStep[];
  presetOverrides: Partial<ExportSettings>;
  // Social-specific
  platform?: string;                  // 'youtube' | 'instagram' | 'tiktok' etc.
  aspectRatio?: string;               // '16:9' | '9:16' | '1:1' | '4:5'
}

// ─── Export Settings ─────────────────────────────────────────────────────────

/** Quality encoding mode. */
export type QualityMode = 'cbr' | 'vbr' | 'crf';

/** Loudness normalization standard. */
export type LoudnessStandard = 'none' | 'ebu-r128' | 'atsc-a85' | 'arib-tr-b32';

/** Caption burn-in style configuration. */
export interface CaptionStyle {
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  backgroundColor: string;
  position: 'bottom' | 'top' | 'center';
  outline: boolean;
}

/** Complete export settings — configured in the center panel of DeliverPage. */
export interface ExportSettings {
  // Video
  videoCodec: ExportFormat;
  resolution: { width: number; height: number };
  frameRate: number;
  qualityMode: QualityMode;
  bitrate: string;                    // e.g. '15 Mbps'
  maxBitrate?: string;
  profile: string;                    // 'baseline' | 'main' | 'high' etc.
  level?: string;
  keyframeInterval: number;           // frames
  encodingSpeed: string;              // 'ultrafast'..'veryslow' or 'auto'

  // Audio
  audioCodec: string;                 // 'aac' | 'pcm_s24le' | 'opus' | 'ac3'
  sampleRate: number;                 // 44100 | 48000 | 96000
  bitDepth: number;                   // 16 | 24 | 32
  channels: number;                   // 1 | 2 | 6 | 8
  audioBitrate: string;
  loudnessStandard: LoudnessStandard;
  targetLUFS?: number;                // e.g. -23 for EBU R128

  // Captions
  captionFormat: CaptionFormat | 'none';
  burnInCaptions: boolean;
  captionStyle?: CaptionStyle;

  // File
  filenameTemplate: string;           // tokens: {project}, {date}, {preset}, {resolution}, {sequence}
  outputDirectory: string;
  container: string;                  // 'mp4' | 'mov' | 'mxf' | 'webm' | 'mkv'

  // Processing
  lutPath?: string;
  colorSpaceConversion?: string;      // e.g. 'rec709-to-rec2020'
  smartReframe?: { enabled: boolean; targetAspectRatio: string };
  autoCrop?: boolean;
  deinterlace?: boolean;
}

// ─── Default Export Settings ─────────────────────────────────────────────────

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  videoCodec: 'h264',
  resolution: { width: 1920, height: 1080 },
  frameRate: 23.976,
  qualityMode: 'vbr',
  bitrate: '15 Mbps',
  maxBitrate: '20 Mbps',
  profile: 'high',
  level: '4.1',
  keyframeInterval: 48,
  encodingSpeed: 'medium',

  audioCodec: 'aac',
  sampleRate: 48000,
  bitDepth: 24,
  channels: 2,
  audioBitrate: '320 kbps',
  loudnessStandard: 'none',
  targetLUFS: -23,

  captionFormat: 'none',
  burnInCaptions: false,

  filenameTemplate: '{project}_{date}_{preset}',
  outputDirectory: '~/Desktop/exports',
  container: 'mp4',

  autoCrop: false,
  deinterlace: false,
};

// ─── WebSocket Protocol ──────────────────────────────────────────────────────

/** Messages sent from backend coordinator to the frontend. */
export type CoordinatorToClientMessage =
  | { type: 'worker:registered'; node: WorkerNode }
  | { type: 'worker:updated'; nodeId: string; patch: Partial<WorkerNode> }
  | { type: 'worker:disconnected'; nodeId: string }
  | { type: 'worker:heartbeat'; nodeId: string; metrics: WorkerMetrics }
  | { type: 'worker:capabilities'; nodeId: string; capabilities: WorkerCapabilities }
  | { type: 'job:queued'; job: RenderJob }
  | { type: 'job:progress'; jobId: string; segmentId?: string; progress: number; frame?: number; fps?: number }
  | { type: 'job:status'; jobId: string; status: RenderJobStatus; error?: string }
  | { type: 'job:segment:complete'; jobId: string; segmentId: string; outputPath: string }
  | { type: 'job:complete'; jobId: string; outputPath: string; outputSize?: number }
  | { type: 'job:failed'; jobId: string; error: string }
  | { type: 'farm:stats'; stats: FarmStats };

/** Messages sent from frontend to the backend coordinator. */
export type ClientToCoordinatorMessage =
  | { type: 'worker:add'; hostname: string; port: number }
  | { type: 'worker:remove'; nodeId: string }
  | { type: 'worker:drain'; nodeId: string }
  | { type: 'job:submit'; job: Omit<RenderJob, 'id' | 'createdAt' | 'status' | 'segments' | 'assignedNodeIds' | 'progress'> }
  | { type: 'job:cancel'; jobId: string }
  | { type: 'job:pause'; jobId: string }
  | { type: 'job:resume'; jobId: string }
  | { type: 'job:reorder'; jobId: string; newIndex: number }
  | { type: 'queue:start' }
  | { type: 'queue:pause-all' }
  | { type: 'queue:cancel-all' };

/** Messages between backend coordinator and render agents. */
export type CoordinatorToAgentMessage =
  | { type: 'job:assign'; job: RenderJob; segment: RenderJobSegment }
  | { type: 'job:cancel'; jobId: string }
  | { type: 'job:pause'; jobId: string }
  | { type: 'ping' };

export type AgentToCoordinatorMessage =
  | { type: 'register'; node: Partial<WorkerNode> }
  | { type: 'pong'; nodeId: string; status: WorkerStatus; progress: number; metrics?: Partial<WorkerMetrics> }
  | { type: 'job:progress'; jobId: string; segmentId: string; progress: number; frame: number; fps?: number; bitrate?: string }
  | { type: 'job:segment:complete'; jobId: string; segmentId: string; outputPath: string }
  | { type: 'job:failed'; jobId: string; segmentId: string; error: string }
  | { type: 'capabilities'; capabilities: WorkerCapabilities };

// ─── Farm Statistics ─────────────────────────────────────────────────────────

export interface FarmStats {
  nodesOnline: number;
  nodesTotal: number;
  nodesBusy: number;
  queueDepth: number;
  activeJobs: number;
  completedToday: number;
  utilization: number;                // 0-100 percentage
  totalFramesRendered: number;
  averageFps: number;
}

// ─── Deliver Store Types ─────────────────────────────────────────────────────

export type SettingsTab = 'video' | 'audio' | 'captions' | 'file' | 'processing';
export type RightPanelTab = 'queue' | 'workers' | 'history';
export type SelectionMode = 'full' | 'inout' | 'selected';
export type QueueSortBy = 'priority' | 'createdAt' | 'status';

/** Filename template tokens. */
export const FILENAME_TOKENS = [
  { token: '{project}', description: 'Project name' },
  { token: '{sequence}', description: 'Sequence name' },
  { token: '{date}', description: 'Date (YYYY-MM-DD)' },
  { token: '{time}', description: 'Time (HH-MM-SS)' },
  { token: '{preset}', description: 'Preset/template name' },
  { token: '{resolution}', description: 'Resolution (e.g. 1920x1080)' },
  { token: '{codec}', description: 'Video codec' },
  { token: '{fps}', description: 'Frame rate' },
  { token: '{version}', description: 'Auto-incrementing version number' },
] as const;
