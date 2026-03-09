/**
 * Distributed Render Agent
 *
 * Runs on render farm nodes to process video encoding, transcoding,
 * transcription, and metadata extraction jobs. Connects to the
 * coordinator server via WebSocket with automatic reconnection.
 *
 * Uses a WorkerRouter to dispatch incoming jobs to specialized workers
 * based on the job type.
 */

import { EventEmitter } from 'node:events';
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
  params: Record<string, unknown>;
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

interface CoordinatorMessage {
  type: string;
  job?: WorkerJob;
  [key: string]: unknown;
}

/** Configuration for the render agent */
export interface RenderAgentConfig {
  /** Maximum reconnection attempts before giving up (0 = infinite). Default: 0 */
  maxReconnectAttempts: number;
  /** Initial delay between reconnection attempts in ms. Default: 1000 */
  reconnectBaseDelayMs: number;
  /** Maximum delay between reconnection attempts in ms. Default: 30000 */
  reconnectMaxDelayMs: number;
  /** Progress report interval in ms. Default: 500 */
  progressReportIntervalMs: number;
}

const DEFAULT_CONFIG: RenderAgentConfig = {
  maxReconnectAttempts: 0,
  reconnectBaseDelayMs: 1000,
  reconnectMaxDelayMs: 30000,
  progressReportIntervalMs: 500,
};

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
   */
  async dispatch(
    job: WorkerJob,
    onProgress?: (percent: number, detail?: unknown) => void,
  ): Promise<unknown> {
    if (!this.canHandle(job.type)) {
      throw new Error(`Worker type "${job.type}" is not enabled on this node`);
    }

    switch (job.type) {
      case 'ingest':
        return this.ingestWorker.process(job, (p) => onProgress?.(p.percent, p));

      case 'transcode':
        return this.renderWorker.process(job, (p) => onProgress?.(p.percent, p));

      case 'transcribe':
        return this.transcribeWorker.process(job, (p) => onProgress?.(p.percent, p));

      case 'metadata':
        return this.metadataWorker.process(job, (p) => onProgress?.(p.percent, p));

      case 'render':
      case 'encode':
        return this.renderWorker.process(job, (p) => onProgress?.(p.percent, p));

      case 'effects':
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

export class RenderAgent extends EventEmitter {
  private ws: WebSocket | null = null;
  private nodeInfo: RenderNodeInfo;
  private currentJob: WorkerJob | null = null;
  private router: WorkerRouter;
  private coordinatorUrl = '';
  private config: RenderAgentConfig;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    nodeInfo: Partial<RenderNodeInfo> = {},
    enabledWorkerTypes?: WorkerJobType[],
    config: Partial<RenderAgentConfig> = {},
  ) {
    super();
    const allTypes: WorkerJobType[] = ['ingest', 'transcode', 'transcribe', 'metadata', 'render', 'encode', 'effects'];
    const workerTypes = enabledWorkerTypes ?? allTypes;

    this.nodeInfo = {
      hostname: nodeInfo.hostname ?? `render-node-${Math.random().toString(36).slice(2, 6)}`,
      gpuVendor: nodeInfo.gpuVendor ?? 'unknown',
      gpuName: nodeInfo.gpuName ?? 'Unknown GPU',
      vramMB: nodeInfo.vramMB ?? 0,
      cpuCores: nodeInfo.cpuCores ?? 4,
      memoryGB: nodeInfo.memoryGB ?? 8,
      status: 'offline',
      currentJobId: null,
      progress: 0,
      enabledWorkerTypes: workerTypes,
    };
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.router = new WorkerRouter(workerTypes);
  }

  /** Current agent status. */
  get status(): RenderNodeInfo['status'] {
    return this.nodeInfo.status;
  }

  /** Currently running job, if any. */
  get activeJob(): WorkerJob | null {
    return this.currentJob;
  }

  /**
   * Connect to the coordinator WebSocket server.
   * Automatically reconnects on disconnection.
   */
  async connect(coordinatorUrl: string): Promise<void> {
    this.coordinatorUrl = coordinatorUrl;
    this.disposed = false;
    this.reconnectAttempts = 0;

    return this.establishConnection();
  }

  /**
   * Gracefully disconnect from the coordinator.
   * Cancels any running job first.
   */
  async disconnect(): Promise<void> {
    this.disposed = true;
    this.clearReconnectTimer();

    if (this.currentJob) {
      this.cancelJob('Agent shutting down');
    }

    if (this.ws) {
      try {
        this.send({ type: 'unregister', hostname: this.nodeInfo.hostname });
        this.ws.close(1000, 'Agent shutdown');
      } catch {
        // Ignore close errors during shutdown
      }
      this.ws = null;
    }

    this.nodeInfo.status = 'offline';
    this.emit('disconnected');
  }

  /** Get current node status info. */
  getNodeInfo(): Readonly<RenderNodeInfo> {
    return { ...this.nodeInfo };
  }

  // ── Connection Management ──────────────────────────────────────────────

  private establishConnection(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.disposed) {
        reject(new Error('Agent has been disposed'));
        return;
      }

      try {
        this.ws = new WebSocket(this.coordinatorUrl);
      } catch (err) {
        reject(new Error(`Failed to create WebSocket: ${(err as Error).message}`));
        return;
      }

      const onOpen = () => {
        this.reconnectAttempts = 0;
        this.nodeInfo.status = 'idle';
        this.register();
        this.emit('connected');
        resolve();
      };

      const onMessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(String(event.data)) as CoordinatorMessage;
          this.handleMessage(msg);
        } catch (err) {
          console.error('[RenderAgent] Failed to parse message:', err);
        }
      };

      const onError = (event: Event) => {
        const errorMsg = `WebSocket error: ${(event as ErrorEvent).message ?? 'connection failed'}`;
        console.error(`[RenderAgent] ${errorMsg}`);

        // Only reject the initial connection promise, not reconnects
        if (this.reconnectAttempts === 0 && this.nodeInfo.status === 'offline') {
          reject(new Error(errorMsg));
        }
      };

      const onClose = () => {
        this.ws = null;

        if (!this.disposed) {
          this.nodeInfo.status = 'offline';
          this.emit('disconnected');
          this.scheduleReconnect();
        }
      };

      this.ws.addEventListener('open', onOpen);
      this.ws.addEventListener('message', onMessage);
      this.ws.addEventListener('error', onError);
      this.ws.addEventListener('close', onClose);
    });
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;

    const maxAttempts = this.config.maxReconnectAttempts;
    if (maxAttempts > 0 && this.reconnectAttempts >= maxAttempts) {
      console.error(`[RenderAgent] Max reconnection attempts (${maxAttempts}) reached. Giving up.`);
      this.nodeInfo.status = 'error';
      this.emit('reconnect-failed');
      return;
    }

    // Exponential backoff with jitter
    const baseDelay = this.config.reconnectBaseDelayMs;
    const maxDelay = this.config.reconnectMaxDelayMs;
    const delay = Math.min(
      baseDelay * Math.pow(2, this.reconnectAttempts),
      maxDelay,
    );
    const jitter = delay * 0.2 * Math.random();
    const actualDelay = Math.round(delay + jitter);

    this.reconnectAttempts++;
    console.log(`[RenderAgent] Reconnecting in ${actualDelay}ms (attempt ${this.reconnectAttempts})...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.establishConnection().catch((err) => {
        console.error('[RenderAgent] Reconnection failed:', (err as Error).message);
        // onClose handler will schedule next reconnect
      });
    }, actualDelay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ── Protocol ───────────────────────────────────────────────────────────

  private register(): void {
    this.send({ type: 'register', node: this.nodeInfo });
  }

  private handleMessage(msg: CoordinatorMessage): void {
    switch (msg.type) {
      case 'job:assign':
        if (msg.job) {
          void this.startJob(msg.job);
        }
        break;

      case 'job:cancel':
        this.cancelJob('Cancelled by coordinator');
        break;

      case 'ping':
        this.send({
          type: 'pong',
          status: this.nodeInfo.status,
          progress: this.nodeInfo.progress,
          currentJobId: this.nodeInfo.currentJobId,
          hostname: this.nodeInfo.hostname,
        });
        break;

      default:
        this.emit('message', msg);
        break;
    }
  }

  private async startJob(job: WorkerJob): Promise<void> {
    if (this.currentJob) {
      this.send({
        type: 'job:reject',
        jobId: job.id,
        reason: 'Already processing another job',
      });
      return;
    }

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

    this.send({ type: 'job:started', jobId: job.id });
    this.emit('job:started', job);

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
      this.emit('job:complete', job);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown render error';

      if (message.includes('cancelled')) {
        this.send({
          type: 'job:cancelled',
          jobId: job.id,
          reason: message,
        });
        this.emit('job:cancelled', job);
      } else {
        console.error(`[RenderAgent] Job ${job.id} failed:`, message);
        this.nodeInfo.status = 'error';
        this.send({
          type: 'job:failed',
          jobId: job.id,
          error: message,
        });
        this.emit('job:failed', job, message);
      }
    } finally {
      this.currentJob = null;
      this.nodeInfo.currentJobId = null;
      this.nodeInfo.progress = 0;
      // Recover to idle unless disposed
      if (this.nodeInfo.status === 'busy' || this.nodeInfo.status === 'error') {
        this.nodeInfo.status = 'idle';
      }
    }
  }

  private cancelJob(reason = 'Cancelled'): void {
    if (!this.currentJob) return;

    const jobId = this.currentJob.id;
    console.log(`[RenderAgent] Cancelling job ${jobId}: ${reason}`);

    // Cancel all active workers
    this.router.cancelAll();
  }

  private send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(data));
      } catch (err) {
        console.error('[RenderAgent] Failed to send message:', (err as Error).message);
      }
    }
  }
}
