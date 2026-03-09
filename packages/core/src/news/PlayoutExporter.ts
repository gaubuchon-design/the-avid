// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Playout Exporter (N-06)
//  Export to playout servers (AirSpeed, Viz Ark, Ross STRATUS, K2) via
//  FTP/HTTP in MXF DNxHD. Auto-update NRCS story status after export.
//  "Send Story to Air" one-click workflow.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  PlayoutDestination,
  PlayoutJob,
  PlayoutJobStatus,
  PlayoutExportFormat,
  PlayoutServerType,
  PlayoutTransferProtocol,
  RundownEvent,
  StoryStatus,
} from './types';

// ─── Filename Pattern Resolver ─────────────────────────────────────────────

export function resolveFilename(
  pattern: string,
  story: RundownEvent,
  format: PlayoutExportFormat,
): string {
  const ext = getFormatExtension(format);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');

  return pattern
    .replace('{storyId}', story.storyId)
    .replace('{slug}', sanitizeFilename(story.slugline))
    .replace('{date}', dateStr)
    .replace('{time}', timeStr)
    .replace('{page}', story.pageNumber ?? '0')
    .replace('{ext}', ext);
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 64);
}

function getFormatExtension(format: PlayoutExportFormat): string {
  switch (format) {
    case 'MXF_DNXHD':
    case 'MXF_XDCAM':
    case 'MXF_AVC_INTRA':
      return 'mxf';
    case 'MOV_PRORES':
      return 'mov';
    default:
      return 'mxf';
  }
}

// ─── Format Metadata ───────────────────────────────────────────────────────

export interface FormatSpec {
  format: PlayoutExportFormat;
  codec: string;
  container: string;
  videoBitrateMbps: number;
  audioBitKbps: number;
  audioChannels: number;
  sampleRate: number;
}

export const FORMAT_SPECS: Record<PlayoutExportFormat, FormatSpec> = {
  MXF_DNXHD: {
    format: 'MXF_DNXHD',
    codec: 'DNxHD 145',
    container: 'MXF OP1a',
    videoBitrateMbps: 145,
    audioBitKbps: 1536,
    audioChannels: 8,
    sampleRate: 48000,
  },
  MXF_XDCAM: {
    format: 'MXF_XDCAM',
    codec: 'MPEG-2 50Mbps',
    container: 'MXF OP1a',
    videoBitrateMbps: 50,
    audioBitKbps: 1536,
    audioChannels: 8,
    sampleRate: 48000,
  },
  MXF_AVC_INTRA: {
    format: 'MXF_AVC_INTRA',
    codec: 'AVC-Intra 100',
    container: 'MXF OP1a',
    videoBitrateMbps: 100,
    audioBitKbps: 1536,
    audioChannels: 8,
    sampleRate: 48000,
  },
  MOV_PRORES: {
    format: 'MOV_PRORES',
    codec: 'ProRes 422 HQ',
    container: 'QuickTime MOV',
    videoBitrateMbps: 220,
    audioBitKbps: 2304,
    audioChannels: 8,
    sampleRate: 48000,
  },
};

// ─── Server-Specific Capabilities ──────────────────────────────────────────

export interface ServerCapabilities {
  type: PlayoutServerType;
  supportedFormats: PlayoutExportFormat[];
  supportedProtocols: PlayoutTransferProtocol[];
  supportsVerification: boolean;
  supportsStatusCallback: boolean;
}

export const SERVER_CAPABILITIES: Record<PlayoutServerType, ServerCapabilities> = {
  AIRSPEED: {
    type: 'AIRSPEED',
    supportedFormats: ['MXF_DNXHD', 'MXF_AVC_INTRA'],
    supportedProtocols: ['FTP', 'HTTP'],
    supportsVerification: true,
    supportsStatusCallback: true,
  },
  VIZ_ARK: {
    type: 'VIZ_ARK',
    supportedFormats: ['MXF_DNXHD', 'MXF_XDCAM', 'MOV_PRORES'],
    supportedProtocols: ['FTP', 'HTTP'],
    supportsVerification: true,
    supportsStatusCallback: false,
  },
  ROSS_STRATUS: {
    type: 'ROSS_STRATUS',
    supportedFormats: ['MXF_DNXHD', 'MXF_XDCAM'],
    supportedProtocols: ['FTP', 'CIFS'],
    supportsVerification: true,
    supportsStatusCallback: true,
  },
  K2: {
    type: 'K2',
    supportedFormats: ['MXF_DNXHD', 'MXF_XDCAM', 'MXF_AVC_INTRA'],
    supportedProtocols: ['FTP', 'CIFS'],
    supportsVerification: true,
    supportsStatusCallback: false,
  },
  GENERIC_FTP: {
    type: 'GENERIC_FTP',
    supportedFormats: ['MXF_DNXHD', 'MXF_XDCAM', 'MXF_AVC_INTRA', 'MOV_PRORES'],
    supportedProtocols: ['FTP', 'SCP'],
    supportsVerification: false,
    supportsStatusCallback: false,
  },
};

// ─── Playout Job Factory ───────────────────────────────────────────────────

function generateJobId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `playout-${globalThis.crypto.randomUUID()}`;
  }
  return `playout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createPlayoutJob(
  story: RundownEvent,
  destination: PlayoutDestination,
): PlayoutJob {
  return {
    id: generateJobId(),
    storyId: story.storyId,
    destinationId: destination.id,
    status: 'PENDING',
    progress: 0,
    format: destination.format,
    outputFilename: resolveFilename(destination.filenamePattern, story, destination.format),
  };
}

// ─── Export Events ─────────────────────────────────────────────────────────

export interface PlayoutExporterEvents {
  'job:started': PlayoutJob;
  'job:progress': PlayoutJob;
  'job:encoding': PlayoutJob;
  'job:transferring': PlayoutJob;
  'job:verifying': PlayoutJob;
  'job:completed': PlayoutJob;
  'job:failed': PlayoutJob & { error: string };
  'nrcs:status-updated': { storyId: string; status: StoryStatus };
}

export type PlayoutExporterEventHandler<K extends keyof PlayoutExporterEvents> = (
  data: PlayoutExporterEvents[K],
) => void;

// ─── Playout Exporter ──────────────────────────────────────────────────────

export class PlayoutExporter {
  private jobs = new Map<string, PlayoutJob>();
  private destinations = new Map<string, PlayoutDestination>();
  private listeners: Partial<{
    [K in keyof PlayoutExporterEvents]: Set<PlayoutExporterEventHandler<K>>;
  }> = {};

  private nrcsStatusCallback?: (storyId: string, status: StoryStatus) => Promise<void>;

  constructor(config?: {
    destinations?: PlayoutDestination[];
    onNRCSStatusUpdate?: (storyId: string, status: StoryStatus) => Promise<void>;
  }) {
    if (config?.destinations) {
      for (const dest of config.destinations) {
        this.destinations.set(dest.id, dest);
      }
    }
    if (config?.onNRCSStatusUpdate) {
      this.nrcsStatusCallback = config.onNRCSStatusUpdate;
    }
  }

  // ─── Event System ────────────────────────────────────────────────

  on<K extends keyof PlayoutExporterEvents>(
    event: K,
    handler: PlayoutExporterEventHandler<K>,
  ): void {
    if (!this.listeners[event]) {
      (this.listeners as Record<string, Set<unknown>>)[event] = new Set();
    }
    (this.listeners[event] as Set<PlayoutExporterEventHandler<K>>).add(handler);
  }

  off<K extends keyof PlayoutExporterEvents>(
    event: K,
    handler: PlayoutExporterEventHandler<K>,
  ): void {
    const set = this.listeners[event] as Set<PlayoutExporterEventHandler<K>> | undefined;
    set?.delete(handler);
  }

  private emit<K extends keyof PlayoutExporterEvents>(
    event: K,
    data: PlayoutExporterEvents[K],
  ): void {
    const set = this.listeners[event] as Set<PlayoutExporterEventHandler<K>> | undefined;
    if (set) {
      for (const handler of set) {
        try {
          handler(data);
        } catch (err) {
          console.error(`[PlayoutExporter] Handler error for ${String(event)}:`, err);
        }
      }
    }
  }

  // ─── Destination Management ──────────────────────────────────────

  addDestination(destination: PlayoutDestination): void {
    this.destinations.set(destination.id, destination);
  }

  removeDestination(destinationId: string): void {
    this.destinations.delete(destinationId);
  }

  getDestination(destinationId: string): PlayoutDestination | undefined {
    return this.destinations.get(destinationId);
  }

  getDestinations(): PlayoutDestination[] {
    return Array.from(this.destinations.values());
  }

  getDefaultDestination(): PlayoutDestination | undefined {
    return Array.from(this.destinations.values()).find((d) => d.isDefault);
  }

  // ─── Job Management ──────────────────────────────────────────────

  getJob(jobId: string): PlayoutJob | undefined {
    return this.jobs.get(jobId);
  }

  getJobs(): PlayoutJob[] {
    return Array.from(this.jobs.values());
  }

  getJobsForStory(storyId: string): PlayoutJob[] {
    return Array.from(this.jobs.values()).filter((j) => j.storyId === storyId);
  }

  getActiveJobs(): PlayoutJob[] {
    return Array.from(this.jobs.values()).filter(
      (j) => j.status !== 'COMPLETED' && j.status !== 'FAILED',
    );
  }

  // ─── Export Workflow ─────────────────────────────────────────────

  async sendToAir(
    story: RundownEvent,
    destinationId?: string,
  ): Promise<PlayoutJob> {
    const destination = destinationId
      ? this.destinations.get(destinationId)
      : this.getDefaultDestination();

    if (!destination) {
      throw new Error('No playout destination configured');
    }

    // Validate format compatibility
    const capabilities = SERVER_CAPABILITIES[destination.type];
    if (!capabilities.supportedFormats.includes(destination.format)) {
      throw new Error(
        `Format ${destination.format} not supported by ${destination.type}`,
      );
    }

    const job = createPlayoutJob(story, destination);
    this.jobs.set(job.id, job);
    this.emit('job:started', job);

    // Start async export pipeline
    this.executePipeline(job, story, destination).catch((err) => {
      job.status = 'FAILED';
      job.error = (err as Error).message;
      this.emit('job:failed', { ...job, error: job.error! });
    });

    return job;
  }

  async cancelJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (job.status === 'COMPLETED' || job.status === 'FAILED') return;

    job.status = 'FAILED';
    job.error = 'Cancelled by user';
    this.emit('job:failed', { ...job, error: job.error });
  }

  // ─── Export Pipeline ─────────────────────────────────────────────

  private async executePipeline(
    job: PlayoutJob,
    story: RundownEvent,
    destination: PlayoutDestination,
  ): Promise<void> {
    // Phase 1: Encode
    await this.phaseEncode(job, destination.format);

    // Phase 2: Transfer
    await this.phaseTransfer(job, destination);

    // Phase 3: Verify (if supported)
    const capabilities = SERVER_CAPABILITIES[destination.type];
    if (capabilities.supportsVerification) {
      await this.phaseVerify(job, destination);
    }

    // Phase 4: Complete and update NRCS
    job.status = 'COMPLETED';
    job.progress = 100;
    job.completedAt = new Date().toISOString();
    this.emit('job:completed', job);

    // Update NRCS story status
    await this.updateNRCSStatus(story.storyId, 'READY');
  }

  private async phaseEncode(
    job: PlayoutJob,
    format: PlayoutExportFormat,
  ): Promise<void> {
    job.status = 'ENCODING';
    job.startedAt = new Date().toISOString();
    this.emit('job:encoding', job);

    const spec = FORMAT_SPECS[format];

    // Simulate encoding progress (in production, this wraps FFmpeg/media encoder)
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await delay(100);
      job.progress = Math.round((i / steps) * 40); // 0-40% is encoding
      this.emit('job:progress', job);
    }
  }

  private async phaseTransfer(
    job: PlayoutJob,
    destination: PlayoutDestination,
  ): Promise<void> {
    job.status = 'TRANSFERRING';
    this.emit('job:transferring', job);

    // In production this performs actual FTP/HTTP/CIFS/SCP transfer
    // For framework purposes, simulate transfer with progress
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await delay(80);
      job.progress = 40 + Math.round((i / steps) * 40); // 40-80% is transfer
      this.emit('job:progress', job);
    }
  }

  private async phaseVerify(
    job: PlayoutJob,
    destination: PlayoutDestination,
  ): Promise<void> {
    job.status = 'VERIFYING';
    this.emit('job:verifying', job);

    // In production, verify file exists on destination and checksum matches
    await delay(200);
    job.progress = 95;
    this.emit('job:progress', job);
  }

  private async updateNRCSStatus(storyId: string, status: StoryStatus): Promise<void> {
    if (this.nrcsStatusCallback) {
      try {
        await this.nrcsStatusCallback(storyId, status);
        this.emit('nrcs:status-updated', { storyId, status });
      } catch (err) {
        console.error('[PlayoutExporter] Failed to update NRCS status:', err);
      }
    }
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Default Destinations ──────────────────────────────────────────────────

export const DEFAULT_PLAYOUT_DESTINATIONS: PlayoutDestination[] = [
  {
    id: 'dest-airspeed',
    name: 'AirSpeed Primary',
    type: 'AIRSPEED',
    host: 'airspeed-01.newsroom.local',
    port: 21,
    path: '/media/incoming',
    filenamePattern: '{slug}_{date}_{time}.{ext}',
    format: 'MXF_DNXHD',
    protocol: 'FTP',
    isDefault: true,
  },
  {
    id: 'dest-vizark',
    name: 'Viz Ark Archive',
    type: 'VIZ_ARK',
    host: 'vizark.newsroom.local',
    port: 21,
    path: '/archive/stories',
    filenamePattern: '{storyId}_{slug}.{ext}',
    format: 'MXF_DNXHD',
    protocol: 'FTP',
    isDefault: false,
  },
  {
    id: 'dest-k2',
    name: 'K2 Summit',
    type: 'K2',
    host: 'k2-summit.newsroom.local',
    port: 21,
    path: '/default/clips',
    filenamePattern: '{slug}.{ext}',
    format: 'MXF_XDCAM',
    protocol: 'FTP',
    isDefault: false,
  },
];
