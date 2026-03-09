/**
 * Distributed Render Agent
 *
 * Runs on render farm nodes to process video encoding/transcoding jobs.
 * Connects to the coordinator server via WebSocket with automatic reconnection.
 *
 * Usage: npx ts-node packages/render-agent/src/index.ts --coordinator ws://server:4000/render
 */

import { EventEmitter } from 'node:events';

export interface RenderJob {
  id: string;
  type: 'encode' | 'transcode' | 'effects';
  inputUrl: string;
  outputFormat: string;
  codec: string;
  startFrame: number;
  endFrame: number;
  priority: number;
  params: Record<string, unknown>;
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
}

interface CoordinatorMessage {
  type: string;
  job?: RenderJob;
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

export class RenderAgent extends EventEmitter {
  private ws: WebSocket | null = null;
  private nodeInfo: RenderNodeInfo;
  private currentJob: RenderJob | null = null;
  private jobAbortController: AbortController | null = null;
  private coordinatorUrl = '';
  private config: RenderAgentConfig;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    nodeInfo: Partial<RenderNodeInfo> = {},
    config: Partial<RenderAgentConfig> = {},
  ) {
    super();
    this.nodeInfo = {
      hostname: nodeInfo.hostname || 'render-node-1',
      gpuVendor: nodeInfo.gpuVendor || 'unknown',
      gpuName: nodeInfo.gpuName || 'Unknown GPU',
      vramMB: nodeInfo.vramMB || 0,
      cpuCores: nodeInfo.cpuCores || 4,
      memoryGB: nodeInfo.memoryGB || 8,
      status: 'offline',
      currentJobId: null,
      progress: 0,
    };
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Current agent status. */
  get status(): RenderNodeInfo['status'] {
    return this.nodeInfo.status;
  }

  /** Currently running job, if any. */
  get activeJob(): RenderJob | null {
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

  /**
   * Report current node info and status.
   */
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

  private async startJob(job: RenderJob): Promise<void> {
    if (this.currentJob) {
      this.send({
        type: 'job:reject',
        jobId: job.id,
        reason: 'Already processing another job',
      });
      return;
    }

    this.currentJob = job;
    this.jobAbortController = new AbortController();
    this.nodeInfo.status = 'busy';
    this.nodeInfo.currentJobId = job.id;
    this.nodeInfo.progress = 0;

    this.send({ type: 'job:started', jobId: job.id });
    this.emit('job:started', job);

    try {
      await this.executeJob(job, this.jobAbortController.signal);

      // Only mark complete if not aborted
      if (!this.jobAbortController.signal.aborted) {
        this.send({ type: 'job:complete', jobId: job.id });
        this.emit('job:complete', job);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown render error';

      if (this.jobAbortController?.signal.aborted) {
        // Job was cancelled, not a real error
        this.send({
          type: 'job:cancelled',
          jobId: job.id,
          reason: message,
        });
        this.emit('job:cancelled', job);
      } else {
        // Real render failure
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
      this.jobAbortController = null;
      this.nodeInfo.currentJobId = null;
      this.nodeInfo.progress = 0;
      // Recover to idle unless we hit a hard error that requires attention
      if (this.nodeInfo.status === 'busy') {
        this.nodeInfo.status = 'idle';
      } else if (this.nodeInfo.status === 'error') {
        // Auto-recover after error -- coordinator can reassign
        this.nodeInfo.status = 'idle';
      }
    }
  }

  /**
   * Execute the render job.
   * Override this method for real FFmpeg/GPU rendering logic.
   * The default implementation simulates rendering for testing.
   */
  protected async executeJob(job: RenderJob, signal: AbortSignal): Promise<void> {
    const totalFrames = Math.max(1, job.endFrame - job.startFrame);
    const reportInterval = this.config.progressReportIntervalMs;
    let lastReportTime = 0;

    for (let i = 0; i <= totalFrames; i++) {
      // Check for cancellation
      if (signal.aborted) {
        throw new Error('Job cancelled');
      }

      this.nodeInfo.progress = Math.round((i / totalFrames) * 100);

      // Throttle progress reports
      const now = Date.now();
      if (now - lastReportTime >= reportInterval || i === totalFrames) {
        this.send({
          type: 'job:progress',
          jobId: job.id,
          progress: this.nodeInfo.progress,
          frame: job.startFrame + i,
          totalFrames,
        });
        lastReportTime = now;
      }

      // Simulate frame render time
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
  }

  private cancelJob(reason = 'Cancelled'): void {
    if (!this.currentJob) return;

    const jobId = this.currentJob.id;
    console.log(`[RenderAgent] Cancelling job ${jobId}: ${reason}`);

    // Signal the abort to stop the render loop
    if (this.jobAbortController) {
      this.jobAbortController.abort(new Error(reason));
    }
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
