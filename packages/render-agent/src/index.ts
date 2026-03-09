/**
 * Distributed Render Agent
 *
 * Runs on render farm nodes to process video encoding, transcoding,
 * transcription, and metadata extraction jobs. Connects to the
 * coordinator server via WebSocket.
 *
 * Uses a WorkerRouter to dispatch incoming jobs to specialized workers
 * based on the job type.
 */

import { IngestWorker } from './workers/IngestWorker.js';
import { TranscribeWorker } from './workers/TranscribeWorker.js';
import { MetadataWorker } from './workers/MetadataWorker.js';
import { RenderWorker } from './workers/RenderWorker.js';

// ── Types ───────────────────────────────────────────────────────────

export type WorkerJobType =
  | 'ingest'
  | 'transcode'
  | 'transcribe'
  | 'metadata'
  | 'render'
  | 'encode'
  | 'effects';

export interface WorkerJob {
  id: string;
  type: WorkerJobType;
  inputUrl: string;
  outputPath?: string;
  outputFormat?: string;
  codec?: string;
  startFrame?: number;
  endFrame?: number;
  priority?: number;
  params: Record<string, any>;
}

export interface WorkerCapabilities {
  gpuVendor: string;
  gpuName: string;
  vramMB: number;
  cpuCores: number;
  memoryGB: number;
  availableCodecs: string[];
  ffmpegVersion: string;
  maxConcurrentJobs: number;
  hwAccel: string[];
}

export interface RenderNodeInfo {
  hostname: string;
  gpuVendor: string;
  gpuName: string;
  vramMB: number;
  cpuCores: number;
  memoryGB: number;
  status: 'idle' | 'busy' | 'offline' | 'error';
  currentJobId: string | null;
  progress: number;
  enabledWorkerTypes: WorkerJobType[];
}

/** Legacy alias kept for backward compatibility. */
export type RenderJob = WorkerJob;

// ── Re-exports ──────────────────────────────────────────────────────

export { IngestWorker } from './workers/IngestWorker.js';
export { TranscribeWorker } from './workers/TranscribeWorker.js';
export { MetadataWorker } from './workers/MetadataWorker.js';
export { RenderWorker } from './workers/RenderWorker.js';
export { detectCapabilities, getAvailableDiskSpace } from './capabilities.js';
export type { IngestProgress } from './workers/IngestWorker.js';
export type { TranscribeProgress } from './workers/TranscribeWorker.js';
export type { MetadataProgress, MetadataResult, SceneChange, TechnicalQC } from './workers/MetadataWorker.js';
export type { RenderProgress } from './workers/RenderWorker.js';

// ── Worker Router ───────────────────────────────────────────────────

/**
 * Routes incoming jobs to the appropriate specialized worker
 * based on the job type field.
 */
class WorkerRouter {
  private ingestWorker = new IngestWorker();
  private transcribeWorker = new TranscribeWorker();
  private metadataWorker = new MetadataWorker();
  private renderWorker = new RenderWorker();

  private enabledTypes: Set<WorkerJobType>;

  constructor(enabledTypes: WorkerJobType[]) {
    this.enabledTypes = new Set(enabledTypes);
  }

  /** Check whether this router can handle the given job type. */
  canHandle(type: WorkerJobType): boolean {
    return this.enabledTypes.has(type);
  }

  /**
   * Dispatch a job to the appropriate worker.
   *
   * @param job - The worker job to process.
   * @param onProgress - Progress callback forwarded to the worker.
   * @returns The result from the worker (typically an output path or metadata object).
   */
  async dispatch(
    job: WorkerJob,
    onProgress?: (percent: number, detail?: any) => void,
  ): Promise<any> {
    if (!this.canHandle(job.type)) {
      throw new Error(`Worker type "${job.type}" is not enabled on this node`);
    }

    switch (job.type) {
      case 'ingest':
        return this.ingestWorker.process(job, (p) => onProgress?.(p.percent, p));

      case 'transcode':
        // Transcode reuses the render worker with transcode semantics
        return this.renderWorker.process(job, (p) => onProgress?.(p.percent, p));

      case 'transcribe':
        return this.transcribeWorker.process(job, (p) => onProgress?.(p.percent, p));

      case 'metadata':
        return this.metadataWorker.process(job, (p) => onProgress?.(p.percent, p));

      case 'render':
      case 'encode':
        return this.renderWorker.process(job, (p) => onProgress?.(p.percent, p));

      case 'effects':
        // Effects jobs use the render worker with effect-specific params
        return this.renderWorker.process(job, (p) => onProgress?.(p.percent, p));

      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  }

  /** Cancel the active worker for a given job type. */
  cancelAll(): void {
    this.ingestWorker.cancel();
    this.transcribeWorker.cancel();
    this.metadataWorker.cancel();
    this.renderWorker.cancel();
  }
}

// ── Render Agent ────────────────────────────────────────────────────

export class RenderAgent {
  private ws: WebSocket | null = null;
  private nodeInfo: RenderNodeInfo;
  private currentJob: WorkerJob | null = null;
  private router: WorkerRouter;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private coordinatorUrl: string | null = null;

  constructor(
    nodeInfo: Partial<RenderNodeInfo> = {},
    enabledWorkerTypes?: WorkerJobType[],
  ) {
    const allTypes: WorkerJobType[] = ['ingest', 'transcode', 'transcribe', 'metadata', 'render', 'encode', 'effects'];
    const workerTypes = enabledWorkerTypes ?? allTypes;

    this.nodeInfo = {
      hostname: nodeInfo.hostname ?? `render-node-${Math.random().toString(36).slice(2, 6)}`,
      gpuVendor: nodeInfo.gpuVendor ?? 'unknown',
      gpuName: nodeInfo.gpuName ?? 'Unknown GPU',
      vramMB: nodeInfo.vramMB ?? 0,
      cpuCores: nodeInfo.cpuCores ?? 4,
      memoryGB: nodeInfo.memoryGB ?? 8,
      status: 'idle',
      currentJobId: null,
      progress: 0,
      enabledWorkerTypes: workerTypes,
    };

    this.router = new WorkerRouter(workerTypes);
  }

  /** Connect to the coordinator WebSocket server. */
  async connect(coordinatorUrl: string): Promise<void> {
    this.coordinatorUrl = coordinatorUrl;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(coordinatorUrl);

      this.ws.onopen = () => {
        this.register();
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          this.handleMessage(JSON.parse(String(event.data)));
        } catch (err) {
          console.error(`[render-agent] Failed to parse message: ${(err as Error).message}`);
        }
      };

      this.ws.onerror = () => reject(new Error('WebSocket connection failed'));

      this.ws.onclose = () => {
        this.nodeInfo.status = 'offline';
        this.scheduleReconnect();
      };
    });
  }

  /** Disconnect from the coordinator. */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.coordinatorUrl = null;
    this.ws?.close();
    this.ws = null;
  }

  /** Get current node status info. */
  getNodeInfo(): Readonly<RenderNodeInfo> {
    return { ...this.nodeInfo };
  }

  // ── Private methods ─────────────────────────────────────────────

  private register(): void {
    this.send({ type: 'register', node: this.nodeInfo });
  }

  private handleMessage(msg: any): void {
    switch (msg.type) {
      case 'job:assign':
        this.startJob(msg.job as WorkerJob);
        break;
      case 'job:cancel':
        this.cancelJob();
        break;
      case 'ping':
        this.send({
          type: 'pong',
          status: this.nodeInfo.status,
          progress: this.nodeInfo.progress,
          currentJobId: this.nodeInfo.currentJobId,
        });
        break;
    }
  }

  private async startJob(job: WorkerJob): Promise<void> {
    if (!this.router.canHandle(job.type)) {
      this.send({
        type: 'job:reject',
        jobId: job.id,
        reason: `Worker type "${job.type}" not enabled`,
      });
      return;
    }

    this.currentJob = job;
    this.nodeInfo.status = 'busy';
    this.nodeInfo.currentJobId = job.id;
    this.nodeInfo.progress = 0;

    try {
      const result = await this.router.dispatch(job, (percent, detail) => {
        this.nodeInfo.progress = percent;
        this.send({
          type: 'job:progress',
          jobId: job.id,
          progress: percent,
          detail,
        });
      });

      this.send({
        type: 'job:complete',
        jobId: job.id,
        result,
      });
    } catch (err) {
      const message = (err as Error).message;
      if (!message.includes('cancelled')) {
        this.send({
          type: 'job:error',
          jobId: job.id,
          error: message,
        });
        this.nodeInfo.status = 'error';
      }
    } finally {
      this.nodeInfo.status = this.nodeInfo.status === 'error' ? 'error' : 'idle';
      this.nodeInfo.currentJobId = null;
      this.nodeInfo.progress = 0;
      this.currentJob = null;
    }
  }

  private cancelJob(): void {
    this.router.cancelAll();
    this.currentJob = null;
    this.nodeInfo.status = 'idle';
    this.nodeInfo.currentJobId = null;
    this.nodeInfo.progress = 0;
  }

  private send(data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  /** Schedule a reconnection attempt after the connection is lost. */
  private scheduleReconnect(): void {
    if (!this.coordinatorUrl) return;
    const url = this.coordinatorUrl;

    this.reconnectTimer = setTimeout(async () => {
      console.log('[render-agent] Attempting to reconnect...');
      try {
        await this.connect(url);
        console.log('[render-agent] Reconnected successfully');
      } catch {
        console.error('[render-agent] Reconnect failed, will retry...');
        this.scheduleReconnect();
      }
    }, 5000);
  }
}
