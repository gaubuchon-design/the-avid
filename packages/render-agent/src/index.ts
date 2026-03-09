/**
 * Distributed Render Agent
 *
 * Runs on render farm nodes to process video encoding, transcoding,
 * transcription, and metadata extraction jobs. Connects to the
 * coordinator server via WebSocket with automatic reconnection.
 *
 * Uses a WorkerRouter to dispatch incoming jobs to specialized workers
 * based on the job type, and a priority JobQueue to buffer incoming
 * work when the node is busy.
 *
 * Features:
 * - Worker lifecycle management with graceful shutdown
 * - Health checking for worker processes (CPU, memory, disk)
 * - Back-pressure when queue is full
 * - Resource usage monitoring
 * - Concurrent job execution with configurable limits
 */

import { EventEmitter } from 'node:events';
import os from 'node:os';
import { IngestWorker } from './workers/IngestWorker.js';
import { TranscribeWorker } from './workers/TranscribeWorker.js';
import { MetadataWorker } from './workers/MetadataWorker.js';
import { RenderWorker } from './workers/RenderWorker.js';
import { JobQueue, type QueuedJob, type QueueStats, type JobQueueConfig } from './JobQueue.js';
import { getAvailableDiskSpace } from './capabilities.js';

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
  /** Number of jobs queued and waiting on this node. */
  queueDepth: number;
}

/** Legacy alias kept for backward compatibility. */
export type RenderJob = WorkerJob;

interface CoordinatorMessage {
  type: string;
  job?: WorkerJob;
  [key: string]: unknown;
}

/** Typed progress event emitted during job execution. */
export interface JobProgressEvent {
  /** Job ID this progress belongs to. */
  readonly jobId: string;
  /** Job type. */
  readonly jobType: WorkerJobType;
  /** Completion percentage (0-100). */
  readonly percent: number;
  /** ISO-8601 timestamp of this progress tick. */
  readonly timestamp: string;
  /** Worker-specific detail payload. */
  readonly detail?: unknown;
}

/** Resource usage snapshot for health reporting. */
export interface ResourceUsage {
  /** CPU usage percentage (0-100). */
  readonly cpuPercent: number;
  /** Memory usage percentage (0-100). */
  readonly memoryPercent: number;
  /** Available memory in MB. */
  readonly freeMemoryMB: number;
  /** Available disk space in bytes on the work directory. */
  readonly freeDiskBytes: number;
  /** System load average (1 min). */
  readonly loadAverage: number;
  /** ISO-8601 timestamp. */
  readonly timestamp: string;
}

/** Health check result. */
export interface HealthCheckResult {
  /** Whether the node is healthy enough to accept work. */
  readonly healthy: boolean;
  /** Resource usage at the time of check. */
  readonly resources: ResourceUsage;
  /** Reasons for unhealthy status, if any. */
  readonly warnings: string[];
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
  /** Maximum number of jobs that can be queued. Default: 50 */
  maxQueueSize: number;
  /** Maximum concurrent jobs running on this node. Default: 1 */
  maxConcurrentJobs: number;
  /** Health check interval in ms. Default: 30000 */
  healthCheckIntervalMs: number;
  /** Minimum free memory in MB before rejecting new jobs. Default: 512 */
  minFreeMemoryMB: number;
  /** Minimum free disk space in bytes before rejecting new jobs. Default: 1GB */
  minFreeDiskBytes: number;
  /** Working directory for disk space checks. Default: os.tmpdir() */
  workDir: string;
  /** Default max duration for jobs in ms. 0 = no limit. Default: 0 */
  defaultJobTimeoutMs: number;
  /** Default max retries for jobs. Default: 3 */
  defaultMaxRetries: number;
  /** Graceful shutdown timeout in ms. Default: 60000 */
  shutdownTimeoutMs: number;
  /** Job queue configuration overrides. */
  queueConfig: Partial<JobQueueConfig>;
}

const DEFAULT_CONFIG: RenderAgentConfig = {
  maxReconnectAttempts: 0,
  reconnectBaseDelayMs: 1000,
  reconnectMaxDelayMs: 30000,
  progressReportIntervalMs: 500,
  maxQueueSize: 50,
  maxConcurrentJobs: 1,
  healthCheckIntervalMs: 30_000,
  minFreeMemoryMB: 512,
  minFreeDiskBytes: 1024 * 1024 * 1024, // 1 GB
  workDir: os.tmpdir(),
  defaultJobTimeoutMs: 0,
  defaultMaxRetries: 3,
  shutdownTimeoutMs: 60_000,
  queueConfig: {},
};

// ── Re-exports ──────────────────────────────────────────────────────

export { IngestWorker } from './workers/IngestWorker.js';
export { TranscribeWorker } from './workers/TranscribeWorker.js';
export { MetadataWorker } from './workers/MetadataWorker.js';
export { RenderWorker } from './workers/RenderWorker.js';
export { detectCapabilities, getAvailableDiskSpace } from './capabilities.js';
export { JobQueue } from './JobQueue.js';
export type { QueuedJob, QueuedJobStatus, QueueStats, JobQueueConfig } from './JobQueue.js';
export type { IngestProgress } from './workers/IngestWorker.js';
export type { TranscribeProgress } from './workers/TranscribeWorker.js';
export type {
  MetadataProgress,
  MetadataResult,
  SceneChange,
  TechnicalQC,
  FFprobeResult,
  FFprobeStream,
  FFprobeFormat,
} from './workers/MetadataWorker.js';
export type { RenderProgress } from './workers/RenderWorker.js';

// ── Worker Router ───────────────────────────────────────────────────

/**
 * Routes incoming jobs to the appropriate specialized worker
 * based on the job type field.
 *
 * Each worker instance is reusable and supports cancellation
 * via AbortController.
 */
class WorkerRouter {
  private ingestWorker = new IngestWorker();
  private transcribeWorker = new TranscribeWorker();
  private metadataWorker = new MetadataWorker();
  private renderWorker = new RenderWorker();

  private enabledTypes: Set<WorkerJobType>;

  /** Track active AbortControllers per job ID for targeted cancellation. */
  private activeAbortControllers = new Map<string, AbortController>();

  constructor(enabledTypes: WorkerJobType[]) {
    this.enabledTypes = new Set(enabledTypes);
  }

  /** Check whether this router can handle the given job type. */
  canHandle(type: WorkerJobType): boolean {
    return this.enabledTypes.has(type);
  }

  /**
   * Dispatch a job to the appropriate worker.
   * Creates an AbortController for the job to support targeted cancellation.
   */
  async dispatch(
    job: WorkerJob,
    onProgress?: (percent: number, detail?: unknown) => void,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (!this.canHandle(job.type)) {
      throw new Error(`Worker type "${job.type}" is not enabled on this node`);
    }

    // Create an AbortController for this specific job
    const controller = new AbortController();
    this.activeAbortControllers.set(job.id, controller);

    // Link to external signal if provided
    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener('abort', () => {
          controller.abort();
        }, { once: true });
      }
    }

    try {
      // Pass the job-scoped signal to workers that support cancellation
      const jobSignal = controller.signal;

      switch (job.type) {
        case 'ingest':
          return await this.ingestWorker.process(job, (p) => onProgress?.(p.percent, p));

        case 'transcode':
          return await this.renderWorker.process(job, (p) => onProgress?.(p.percent, p), jobSignal);

        case 'transcribe':
          return await this.transcribeWorker.process(job, (p) => onProgress?.(p.percent, p));

        case 'metadata':
          return await this.metadataWorker.process(job, (p) => onProgress?.(p.percent, p));

        case 'render':
        case 'encode':
          return await this.renderWorker.process(job, (p) => onProgress?.(p.percent, p), jobSignal);

        case 'effects':
          return await this.renderWorker.process(job, (p) => onProgress?.(p.percent, p), jobSignal);

        default:
          throw new Error(`Unknown job type: ${(job as WorkerJob).type}`);
      }
    } finally {
      this.activeAbortControllers.delete(job.id);
    }
  }

  /** Cancel a specific job by ID. */
  cancelJob(jobId: string): void {
    const controller = this.activeAbortControllers.get(jobId);
    if (controller) {
      controller.abort();
    }
  }

  /** Cancel all active workers. */
  cancelAll(): void {
    for (const [, controller] of this.activeAbortControllers) {
      controller.abort();
    }
    // Also cancel via legacy cancel() for any in-flight work
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
  private readonly activeJobs = new Map<string, WorkerJob>();
  private router: WorkerRouter;
  private jobQueue: JobQueue;
  private coordinatorUrl = '';
  private config: RenderAgentConfig;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private lastResourceUsage: ResourceUsage | null = null;

  /** Signal handler references for cleanup. */
  private signalHandlers: Map<string, () => void> = new Map();

  constructor(
    nodeInfo: Partial<RenderNodeInfo> = {},
    enabledWorkerTypes?: WorkerJobType[],
    config: Partial<RenderAgentConfig> = {},
  ) {
    super();
    const allTypes: WorkerJobType[] = ['ingest', 'transcode', 'transcribe', 'metadata', 'render', 'encode', 'effects'];
    const workerTypes = enabledWorkerTypes ?? allTypes;

    this.config = { ...DEFAULT_CONFIG, ...config };

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
      queueDepth: 0,
    };
    this.router = new WorkerRouter(workerTypes);
    this.jobQueue = new JobQueue({
      maxSize: this.config.maxQueueSize,
      defaultMaxRetries: this.config.defaultMaxRetries,
      defaultMaxDurationMs: this.config.defaultJobTimeoutMs,
      ...this.config.queueConfig,
    });

    // Wire up job timeout handling from queue to router
    this.jobQueue.setTimeoutHandler((jobId) => {
      this.router.cancelJob(jobId);
    });

    // Register process signal handlers for graceful shutdown
    this.registerSignalHandlers();
  }

  // ── Signal Handling ──────────────────────────────────────────────

  /**
   * Register process signal handlers (SIGTERM, SIGINT) for graceful shutdown.
   * When a signal is received, the agent will drain its queue and disconnect.
   */
  private registerSignalHandlers(): void {
    const handleShutdown = (signal: string) => {
      console.log(`[RenderAgent] Received ${signal}, initiating graceful shutdown...`);
      this.emit('shutdown', signal);

      void this.disconnect().then(() => {
        console.log('[RenderAgent] Graceful shutdown complete.');
        this.removeSignalHandlers();
      }).catch((err) => {
        console.error('[RenderAgent] Error during shutdown:', (err as Error).message);
        this.removeSignalHandlers();
      });
    };

    const sigterm = () => handleShutdown('SIGTERM');
    const sigint = () => handleShutdown('SIGINT');

    this.signalHandlers.set('SIGTERM', sigterm);
    this.signalHandlers.set('SIGINT', sigint);

    process.on('SIGTERM', sigterm);
    process.on('SIGINT', sigint);
  }

  /** Remove signal handlers to prevent leaks. */
  private removeSignalHandlers(): void {
    for (const [signal, handler] of this.signalHandlers) {
      process.removeListener(signal, handler);
    }
    this.signalHandlers.clear();
  }

  // ── Public properties ─────────────────────────────────────────────

  /** Current agent status. */
  get status(): RenderNodeInfo['status'] {
    return this.nodeInfo.status;
  }

  /** Currently running job (primary/first), if any. */
  get activeJob(): WorkerJob | null {
    const first = this.activeJobs.values().next();
    return first.done ? null : first.value;
  }

  /** All currently running jobs. */
  get activeJobCount(): number {
    return this.activeJobs.size;
  }

  /** Whether the agent can accept more concurrent work. */
  get canAcceptWork(): boolean {
    return (
      !this.disposed &&
      !this.jobQueue.isDraining &&
      this.activeJobs.size < this.config.maxConcurrentJobs &&
      this.nodeInfo.status !== 'error' &&
      this.nodeInfo.status !== 'offline'
    );
  }

  /** Get queue statistics. */
  getQueueStats(): QueueStats {
    return this.jobQueue.getStats();
  }

  /** Get all currently queued (pending + running) jobs. */
  getQueuedJobs(): readonly QueuedJob[] {
    return this.jobQueue.getActiveJobs();
  }

  /** Get the latest resource usage snapshot. */
  getResourceUsage(): ResourceUsage | null {
    return this.lastResourceUsage;
  }

  /**
   * Perform a health check: probe CPU, memory, and disk.
   *
   * @returns Health check result with resource usage and warnings.
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const resources = await this.collectResourceUsage();
    this.lastResourceUsage = resources;

    const warnings: string[] = [];
    let healthy = true;

    if (resources.freeMemoryMB < this.config.minFreeMemoryMB) {
      warnings.push(
        `Low memory: ${resources.freeMemoryMB}MB free (minimum ${this.config.minFreeMemoryMB}MB)`,
      );
      healthy = false;
    }

    if (resources.freeDiskBytes < this.config.minFreeDiskBytes) {
      const freeDiskMB = Math.round(resources.freeDiskBytes / (1024 * 1024));
      const minDiskMB = Math.round(this.config.minFreeDiskBytes / (1024 * 1024));
      warnings.push(
        `Low disk space: ${freeDiskMB}MB free (minimum ${minDiskMB}MB)`,
      );
      healthy = false;
    }

    if (resources.loadAverage > os.cpus().length * 2) {
      warnings.push(
        `High system load: ${resources.loadAverage.toFixed(1)} (${os.cpus().length} cores)`,
      );
    }

    if (resources.cpuPercent > 95) {
      warnings.push(`CPU nearly saturated: ${resources.cpuPercent.toFixed(0)}%`);
    }

    return { healthy, resources, warnings };
  }

  /**
   * Connect to the coordinator WebSocket server.
   * Automatically reconnects on disconnection.
   * Starts the health check timer.
   */
  async connect(coordinatorUrl: string): Promise<void> {
    this.coordinatorUrl = coordinatorUrl;
    this.disposed = false;
    this.reconnectAttempts = 0;

    this.startHealthChecker();
    return this.establishConnection();
  }

  /**
   * Gracefully disconnect from the coordinator.
   * Drains the job queue and waits for in-flight jobs to finish.
   */
  /**
   * Gracefully disconnect from the coordinator.
   * Drains the job queue, cancels in-flight work, and cleans up resources.
   * Also removes process signal handlers to prevent leaks.
   */
  async disconnect(): Promise<void> {
    this.disposed = true;
    this.clearReconnectTimer();
    this.stopHealthChecker();
    this.removeSignalHandlers();

    // Drain the queue (cancels pending, waits for running)
    try {
      await this.jobQueue.drain(this.config.shutdownTimeoutMs);
    } catch (err) {
      console.error('[RenderAgent] Error draining job queue:', (err as Error).message);
    }
    this.jobQueue.dispose();

    // Cancel any stragglers
    if (this.activeJobs.size > 0) {
      console.log(`[RenderAgent] Force-cancelling ${this.activeJobs.size} active job(s)`);
      this.router.cancelAll();
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
        this.nodeInfo.status = this.activeJobs.size > 0 ? 'busy' : 'idle';
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
        const errorMsg = `WebSocket error: ${'message' in event ? (event as { message: string }).message : 'connection failed'}`;
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

      /* eslint-disable @typescript-eslint/no-explicit-any */
      this.ws.addEventListener('open', onOpen as any);
      this.ws.addEventListener('message', onMessage as any);
      this.ws.addEventListener('error', onError as any);
      this.ws.addEventListener('close', onClose as any);
      /* eslint-enable @typescript-eslint/no-explicit-any */
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

  // ── Health Checking ───────────────────────────────────────────────────

  private startHealthChecker(): void {
    if (this.config.healthCheckIntervalMs <= 0) return;

    this.healthCheckTimer = setInterval(() => {
      void this.runHealthCheck();
    }, this.config.healthCheckIntervalMs);

    // Don't keep the process alive for health checks
    if (typeof this.healthCheckTimer === 'object' && 'unref' in this.healthCheckTimer) {
      this.healthCheckTimer.unref();
    }
  }

  private stopHealthChecker(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private async runHealthCheck(): Promise<void> {
    try {
      const result = await this.healthCheck();
      this.emit('health-check', result);

      // Report health to coordinator
      this.send({
        type: 'health',
        hostname: this.nodeInfo.hostname,
        healthy: result.healthy,
        resources: result.resources,
        warnings: result.warnings,
        queueStats: this.jobQueue.getStats(),
      });

      // If unhealthy, update status
      if (!result.healthy && this.nodeInfo.status === 'idle') {
        this.nodeInfo.status = 'error';
        this.emit('unhealthy', result);
      } else if (result.healthy && this.nodeInfo.status === 'error' && this.activeJobs.size === 0) {
        this.nodeInfo.status = 'idle';
        this.emit('recovered', result);
        // Try to process next queued job after recovery
        this.processNextQueued();
      }
    } catch (err) {
      console.error('[RenderAgent] Health check failed:', (err as Error).message);
    }
  }

  private async collectResourceUsage(): Promise<ResourceUsage> {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const freeMemoryMB = Math.round(freeMem / (1024 * 1024));
    const memoryPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

    // CPU usage estimation from load average
    const loadAverages = os.loadavg();
    const loadAverage = loadAverages[0] ?? 0;
    const cpuCount = os.cpus().length || 1;
    const cpuPercent = Math.min(100, Math.round((loadAverage / cpuCount) * 100));

    // Disk space
    let freeDiskBytes = 0;
    try {
      freeDiskBytes = await getAvailableDiskSpace(this.config.workDir);
    } catch {
      // Ignore disk check failures
    }

    return {
      cpuPercent,
      memoryPercent,
      freeMemoryMB,
      freeDiskBytes,
      loadAverage,
      timestamp: new Date().toISOString(),
    };
  }

  // ── Protocol ───────────────────────────────────────────────────────────

  private register(): void {
    this.send({
      type: 'register',
      node: this.nodeInfo,
      queueStats: this.jobQueue.getStats(),
    });
  }

  private handleMessage(msg: CoordinatorMessage): void {
    switch (msg.type) {
      case 'job:assign':
        if (msg.job) {
          void this.enqueueOrStart(msg.job);
        }
        break;

      case 'job:cancel': {
        const cancelId = (msg as Record<string, unknown>)['jobId'] as string | undefined;
        if (cancelId) {
          if (this.activeJobs.has(cancelId)) {
            this.cancelJob(cancelId, 'Cancelled by coordinator');
          } else {
            this.jobQueue.cancel(cancelId);
            this.syncQueueDepth();
          }
        } else {
          // Cancel all
          for (const [jobId] of this.activeJobs) {
            this.cancelJob(jobId, 'Cancelled by coordinator');
          }
        }
        break;
      }

      case 'ping':
        this.send({
          type: 'pong',
          status: this.nodeInfo.status,
          progress: this.nodeInfo.progress,
          currentJobId: this.nodeInfo.currentJobId,
          hostname: this.nodeInfo.hostname,
          queueDepth: this.nodeInfo.queueDepth,
          activeJobCount: this.activeJobs.size,
          resources: this.lastResourceUsage,
        });
        break;

      default:
        this.emit('message', msg);
        break;
    }
  }

  /**
   * Accept an incoming job: start it immediately if capacity allows, or queue it.
   * Applies back-pressure when queue is full by rejecting the job.
   */
  private async enqueueOrStart(job: WorkerJob): Promise<void> {
    if (!this.router.canHandle(job.type)) {
      this.send({
        type: 'job:reject',
        jobId: job.id,
        reason: `Worker type "${job.type}" not enabled`,
      });
      return;
    }

    // Back-pressure: check if we can accept more work
    if (this.jobQueue.isDraining) {
      this.send({
        type: 'job:reject',
        jobId: job.id,
        reason: 'Node is shutting down',
      });
      return;
    }

    // If we have capacity, start immediately
    if (this.activeJobs.size < this.config.maxConcurrentJobs) {
      // Enqueue first to track it, then immediately dequeue and run
      try {
        this.jobQueue.enqueue(job, {
          maxRetries: this.config.defaultMaxRetries,
          maxDurationMs: this.config.defaultJobTimeoutMs,
        });
      } catch {
        this.send({
          type: 'job:reject',
          jobId: job.id,
          reason: 'Job queue is full',
        });
        return;
      }
      const entry = this.jobQueue.dequeue();
      if (entry) {
        await this.startJob(entry.job);
      }
      return;
    }

    // Busy and at capacity -- enqueue for later
    try {
      this.jobQueue.enqueue(job, {
        maxRetries: this.config.defaultMaxRetries,
        maxDurationMs: this.config.defaultJobTimeoutMs,
      });
      this.syncQueueDepth();
      this.send({
        type: 'job:queued',
        jobId: job.id,
        queuePosition: this.jobQueue.pendingCount,
      });
      this.emit('job:queued', job);
    } catch {
      // Queue is full -- apply back-pressure
      this.send({
        type: 'job:reject',
        jobId: job.id,
        reason: `Job queue is full (${this.jobQueue.maxSize} max). Back-pressure applied.`,
      });
      this.emit('back-pressure', {
        jobId: job.id,
        queueStats: this.jobQueue.getStats(),
      });
    }
  }

  private async startJob(job: WorkerJob): Promise<void> {
    // Pre-flight health check: ensure we have enough resources to run this job
    try {
      const health = await this.healthCheck();
      if (!health.healthy) {
        const reasons = health.warnings.join('; ');
        console.warn(`[RenderAgent] Pre-flight health check failed for job ${job.id}: ${reasons}`);

        // Re-queue the job for later instead of failing it
        this.jobQueue.markFailed(job.id, `Pre-flight health check failed: ${reasons}`);
        this.send({
          type: 'job:retrying',
          jobId: job.id,
          error: `Pre-flight health check failed: ${reasons}`,
        });
        this.emit('job:retrying', job, `Health check failed: ${reasons}`);
        return;
      }
    } catch (err) {
      // If the health check itself throws, log and proceed cautiously
      console.warn(`[RenderAgent] Pre-flight health check error: ${(err as Error).message}`);
    }

    this.activeJobs.set(job.id, job);
    this.nodeInfo.status = 'busy';
    this.nodeInfo.currentJobId = job.id;
    this.nodeInfo.progress = 0;

    this.send({ type: 'job:started', jobId: job.id });
    this.emit('job:started', job);

    try {
      const result = await this.router.dispatch(job, (percent, detail) => {
        this.nodeInfo.progress = percent;

        const progressEvent: JobProgressEvent = {
          jobId: job.id,
          jobType: job.type,
          percent,
          timestamp: new Date().toISOString(),
          detail,
        };

        this.send({
          type: 'job:progress',
          jobId: job.id,
          progress: percent,
          detail,
        });
        this.emit('job:progress', progressEvent);
      });

      this.jobQueue.markCompleted(job.id);

      this.send({
        type: 'job:complete',
        jobId: job.id,
        result,
      });
      this.emit('job:complete', job);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown render error';

      if (message.includes('cancelled') || message.includes('aborted')) {
        this.jobQueue.cancelRunning(job.id, message);
        this.send({
          type: 'job:cancelled',
          jobId: job.id,
          reason: message,
        });
        this.emit('job:cancelled', job);
      } else {
        // Categorize the error for better reporting
        const isOOM = message.includes('OOM') || message.includes('code 137') || message.includes('SIGKILL');
        const isDiskFull = message.includes('No space left') || message.includes('ENOSPC') || message.includes('Disk full');

        if (isOOM) {
          console.error(`[RenderAgent] Job ${job.id} OOM-killed:`, message);
        } else if (isDiskFull) {
          console.error(`[RenderAgent] Job ${job.id} failed - disk full:`, message);
        } else {
          console.error(`[RenderAgent] Job ${job.id} failed:`, message);
        }

        // markFailed handles retry logic internally (OOM and disk full are non-retryable)
        const retried = this.jobQueue.markFailed(job.id, message);

        if (retried) {
          this.send({
            type: 'job:retrying',
            jobId: job.id,
            error: message,
          });
          this.emit('job:retrying', job, message);
        } else {
          this.nodeInfo.status = 'error';
          this.send({
            type: 'job:failed',
            jobId: job.id,
            error: message,
            errorCategory: isOOM ? 'oom' : isDiskFull ? 'disk_full' : 'unknown',
          });
          this.emit('job:failed', job, message);
        }
      }
    } finally {
      this.activeJobs.delete(job.id);
      this.nodeInfo.currentJobId = this.activeJobs.size > 0
        ? this.activeJobs.keys().next().value ?? null
        : null;
      this.nodeInfo.progress = 0;

      // Recover to idle unless disposed or in error state with no jobs
      if (this.activeJobs.size === 0) {
        if (this.nodeInfo.status === 'busy') {
          this.nodeInfo.status = 'idle';
        } else if (this.nodeInfo.status === 'error') {
          // Stay in error but try to recover on next health check
          this.nodeInfo.status = 'idle';
        }
      }

      this.syncQueueDepth();

      // Process next queued job(s) if capacity available
      if (!this.disposed) {
        this.processNextQueued();
      }
    }
  }

  /**
   * Dequeue and start the next pending job(s), filling up to concurrent limit.
   */
  private processNextQueued(): void {
    while (
      this.activeJobs.size < this.config.maxConcurrentJobs &&
      this.nodeInfo.status !== 'error' &&
      !this.disposed
    ) {
      const next = this.jobQueue.dequeue();
      if (!next) break;
      void this.startJob(next.job);
    }
  }

  private cancelJob(jobId: string, reason = 'Cancelled'): void {
    if (!this.activeJobs.has(jobId)) return;

    console.log(`[RenderAgent] Cancelling job ${jobId}: ${reason}`);
    this.router.cancelJob(jobId);
  }

  private syncQueueDepth(): void {
    this.nodeInfo.queueDepth = this.jobQueue.pendingCount;
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
