// =============================================================================
//  THE AVID — Render Farm Engine (Frontend Coordinator)
//  Manages WebSocket connection to backend, job scheduling, worker monitoring,
//  segment splitting for parallel encoding, and progress aggregation.
// =============================================================================

import type {
  WorkerNode,
  WorkerStatus,
  WorkerMetrics,
  WorkerCapabilities,
  RenderJob,
  RenderJobSegment,
  RenderJobStatus,
  JobPriority,
  FarmStats,
  CoordinatorToClientMessage,
  ClientToCoordinatorMessage,
  ExportSettings,
} from '../types/deliver.types';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default WebSocket URL for the render coordinator */
const DEFAULT_COORDINATOR_URL = 'ws://localhost:4000/render';

/** Heartbeat interval in milliseconds (10s) */
const HEARTBEAT_INTERVAL_MS = 10_000;

/** Number of missed heartbeats before marking a worker offline */
const MAX_MISSED_HEARTBEATS = 3;

/** Minimum frames before a job is eligible for splitting across workers */
const MIN_FRAMES_FOR_SPLIT = 1800; // ~1 minute at 30fps

/** Reconnection delay in milliseconds */
const RECONNECT_DELAY_MS = 3000;

/** Maximum reconnection attempts */
const MAX_RECONNECT_ATTEMPTS = 10;

// ─── Priority weight map ────────────────────────────────────────────────────

const PRIORITY_WEIGHT: Record<JobPriority, number> = {
  critical: 5,
  high: 4,
  normal: 3,
  low: 2,
  background: 1,
};

// ─── Types ──────────────────────────────────────────────────────────────────

export type FarmEventCallback = () => void;

export interface RenderFarmEngineOptions {
  coordinatorUrl?: string;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
}

// ─── Engine ─────────────────────────────────────────────────────────────────

/**
 * Frontend coordinator engine for the distributed render farm.
 *
 * Manages WebSocket connection to the backend coordinator, tracks worker nodes,
 * schedules jobs with priority-based ordering, splits long encodes into parallel
 * segments, and aggregates progress for the UI.
 *
 * @example
 * import { renderFarmEngine } from '../engine/RenderFarmEngine';
 * renderFarmEngine.connect('ws://localhost:4000/render');
 * renderFarmEngine.subscribe(() => console.log('Farm state changed'));
 */
class RenderFarmEngine {
  // ── Internal state ──────────────────────────────────────────────────────

  private ws: WebSocket | null = null;
  private workers = new Map<string, WorkerNode>();
  private jobs = new Map<string, RenderJob>();
  private completedJobs: RenderJob[] = [];
  private listeners = new Set<FarmEventCallback>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private _isConnected = false;
  private _isQueueRunning = false;
  private coordinatorUrl = DEFAULT_COORDINATOR_URL;
  private options: Required<RenderFarmEngineOptions>;

  constructor(opts: RenderFarmEngineOptions = {}) {
    this.options = {
      coordinatorUrl: opts.coordinatorUrl ?? DEFAULT_COORDINATOR_URL,
      autoReconnect: opts.autoReconnect ?? true,
      maxReconnectAttempts: opts.maxReconnectAttempts ?? MAX_RECONNECT_ATTEMPTS,
    };
    this.coordinatorUrl = this.options.coordinatorUrl;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CONNECTION
  // ═══════════════════════════════════════════════════════════════════════════

  /** Connect to the backend render coordinator via WebSocket. */
  connect(url?: string): void {
    if (url) this.coordinatorUrl = url;

    try {
      this.ws = new WebSocket(this.coordinatorUrl);

      this.ws.onopen = () => {
        this._isConnected = true;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.notify();
        console.log('[RenderFarm] Connected to coordinator');
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: CoordinatorToClientMessage = JSON.parse(String(event.data));
          this.handleMessage(msg);
        } catch (err) {
          console.error('[RenderFarm] Failed to parse message:', err);
        }
      };

      this.ws.onerror = (event) => {
        console.error('[RenderFarm] WebSocket error:', event);
      };

      this.ws.onclose = () => {
        this._isConnected = false;
        this.stopHeartbeat();
        this.notify();
        console.log('[RenderFarm] Disconnected from coordinator');

        if (this.options.autoReconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.error('[RenderFarm] Failed to connect:', err);
      if (this.options.autoReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  /** Disconnect from the coordinator. */
  disconnect(): void {
    this.options.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
    this._isConnected = false;
    this.notify();
  }

  /** Whether the engine is currently connected to the coordinator. */
  get isConnected(): boolean {
    return this._isConnected;
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = RECONNECT_DELAY_MS * Math.min(this.reconnectAttempts, 5);
    console.log(`[RenderFarm] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  MESSAGE HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  private handleMessage(msg: CoordinatorToClientMessage): void {
    switch (msg.type) {
      // ── Worker events ──────────────────────────────────────────────────
      case 'worker:registered':
        this.workers.set(msg.node.id, msg.node);
        this.notify();
        break;

      case 'worker:updated': {
        const worker = this.workers.get(msg.nodeId);
        if (worker) {
          Object.assign(worker, msg.patch);
          this.workers.set(msg.nodeId, worker);
          this.notify();
        }
        break;
      }

      case 'worker:disconnected':
        this.handleWorkerDisconnect(msg.nodeId);
        break;

      case 'worker:heartbeat': {
        const w = this.workers.get(msg.nodeId);
        if (w) {
          w.lastHeartbeat = Date.now();
          w.metrics = { ...w.metrics, ...msg.metrics };
          this.notify();
        }
        break;
      }

      case 'worker:capabilities': {
        const wc = this.workers.get(msg.nodeId);
        if (wc) {
          wc.capabilities = msg.capabilities;
          this.notify();
        }
        break;
      }

      // ── Job events ─────────────────────────────────────────────────────
      case 'job:queued':
        this.jobs.set(msg.job.id, msg.job);
        this.notify();
        break;

      case 'job:progress': {
        const job = this.jobs.get(msg.jobId);
        if (!job) break;
        if (msg.segmentId) {
          const seg = job.segments.find((s) => s.id === msg.segmentId);
          if (seg) seg.progress = msg.progress;
          // Aggregate segment progress
          job.progress = this.aggregateSegmentProgress(job);
        } else {
          job.progress = msg.progress;
        }
        this.notify();
        break;
      }

      case 'job:status': {
        const js = this.jobs.get(msg.jobId);
        if (js) {
          js.status = msg.status;
          if (msg.error) js.error = msg.error;
          if (msg.status === 'encoding' && !js.startedAt) js.startedAt = Date.now();
          this.notify();
        }
        break;
      }

      case 'job:segment:complete': {
        const jsc = this.jobs.get(msg.jobId);
        if (jsc) {
          const seg = jsc.segments.find((s) => s.id === msg.segmentId);
          if (seg) {
            seg.status = 'completed';
            seg.progress = 100;
            seg.outputPath = msg.outputPath;
            seg.completedAt = Date.now();
          }
          // Check if all segments are complete
          const allDone = jsc.segments.length > 0 && jsc.segments.every((s) => s.status === 'completed');
          if (allDone && jsc.status !== 'concatenating') {
            jsc.status = 'concatenating';
          }
          jsc.progress = this.aggregateSegmentProgress(jsc);
          this.notify();
        }
        break;
      }

      case 'job:complete': {
        const jc = this.jobs.get(msg.jobId);
        if (jc) {
          jc.status = 'completed';
          jc.progress = 100;
          jc.completedAt = Date.now();
          jc.outputPath = msg.outputPath;
          if (msg.outputSize) jc.outputSize = msg.outputSize;
          jc.estimatedTimeRemaining = 0;
          // Move to completed
          this.completedJobs.unshift({ ...jc });
          this.jobs.delete(msg.jobId);
          // Try to schedule next jobs
          this.scheduleNext();
          this.notify();
        }
        break;
      }

      case 'job:failed': {
        const jf = this.jobs.get(msg.jobId);
        if (jf) {
          jf.status = 'failed';
          jf.error = msg.error;
          this.completedJobs.unshift({ ...jf });
          this.jobs.delete(msg.jobId);
          this.scheduleNext();
          this.notify();
        }
        break;
      }

      case 'farm:stats':
        // Stats are computed locally, but accept server-side overrides
        this.notify();
        break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  WORKER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /** Request the coordinator to register a new worker node. */
  registerWorker(hostname: string, port: number): void {
    this.send({ type: 'worker:add', hostname, port });
  }

  /** Request the coordinator to remove a worker node. */
  removeWorker(nodeId: string): void {
    this.send({ type: 'worker:remove', nodeId });
    this.workers.delete(nodeId);
    this.notify();
  }

  /** Request the coordinator to drain a worker (finish current job, accept no new work). */
  drainWorker(nodeId: string): void {
    this.send({ type: 'worker:drain', nodeId });
    const worker = this.workers.get(nodeId);
    if (worker) {
      worker.status = 'draining';
      this.notify();
    }
  }

  /** Get all known worker nodes. */
  getWorkers(): WorkerNode[] {
    return Array.from(this.workers.values());
  }

  /** Get a specific worker by ID. */
  getWorker(nodeId: string): WorkerNode | undefined {
    return this.workers.get(nodeId);
  }

  /** Handle worker disconnect — reassign any in-progress segments. */
  private handleWorkerDisconnect(nodeId: string): void {
    const worker = this.workers.get(nodeId);
    if (worker) {
      worker.status = 'offline';
    }

    // Find any segments assigned to this worker and mark for reassignment
    for (const [, job] of this.jobs) {
      for (const seg of job.segments) {
        if (seg.assignedNodeId === nodeId && seg.status === 'encoding') {
          seg.status = 'queued';
          seg.assignedNodeId = null;
          seg.progress = 0;
        }
      }
      // Remove from assigned list
      job.assignedNodeIds = job.assignedNodeIds.filter((id) => id !== nodeId);
    }

    this.scheduleNext();
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  JOB MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /** Submit a new render job to the queue. */
  submitJob(jobData: Omit<RenderJob, 'id' | 'createdAt' | 'status' | 'segments' | 'assignedNodeIds' | 'progress'>): string {
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job: RenderJob = {
      ...jobData,
      id,
      createdAt: Date.now(),
      status: 'pending',
      segments: [],
      assignedNodeIds: [],
      progress: 0,
    };

    this.jobs.set(id, job);
    this.send({
      type: 'job:submit',
      job: jobData,
    });

    if (this._isQueueRunning) {
      job.status = 'queued';
      this.scheduleNext();
    }

    this.notify();
    return id;
  }

  /** Cancel a running or queued job. */
  cancelJob(jobId: string): void {
    this.send({ type: 'job:cancel', jobId });
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'cancelled';
      job.segments.forEach((s) => {
        if (s.status !== 'completed') s.status = 'cancelled';
      });
      this.notify();
    }
  }

  /** Pause a running or queued job. */
  pauseJob(jobId: string): void {
    this.send({ type: 'job:pause', jobId });
    const job = this.jobs.get(jobId);
    if (job && (job.status === 'encoding' || job.status === 'queued')) {
      job.status = 'paused';
      this.notify();
    }
  }

  /** Resume a paused job. */
  resumeJob(jobId: string): void {
    this.send({ type: 'job:resume', jobId });
    const job = this.jobs.get(jobId);
    if (job && job.status === 'paused') {
      job.status = 'queued';
      this.scheduleNext();
      this.notify();
    }
  }

  /** Reorder a job in the queue. */
  reorderJob(jobId: string, newIndex: number): void {
    this.send({ type: 'job:reorder', jobId, newIndex });
  }

  /** Get all jobs in the queue. */
  getJobs(): RenderJob[] {
    return Array.from(this.jobs.values());
  }

  /** Get a specific job. */
  getJob(jobId: string): RenderJob | undefined {
    return this.jobs.get(jobId);
  }

  /** Get completed/failed job history. */
  getCompletedJobs(): RenderJob[] {
    return [...this.completedJobs];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  QUEUE CONTROL
  // ═══════════════════════════════════════════════════════════════════════════

  /** Start processing the render queue. */
  startQueue(): void {
    this._isQueueRunning = true;
    this.send({ type: 'queue:start' });
    // Mark pending jobs as queued
    for (const [, job] of this.jobs) {
      if (job.status === 'pending') job.status = 'queued';
    }
    this.scheduleNext();
    this.notify();
  }

  /** Pause all queued/pending jobs (active encodes continue). */
  pauseQueue(): void {
    this._isQueueRunning = false;
    this.send({ type: 'queue:pause-all' });
    for (const [, job] of this.jobs) {
      if (job.status === 'queued' || job.status === 'pending') {
        job.status = 'paused';
      }
    }
    this.notify();
  }

  /** Cancel all jobs in the queue. */
  cancelAll(): void {
    this._isQueueRunning = false;
    this.send({ type: 'queue:cancel-all' });
    for (const [, job] of this.jobs) {
      if (job.status !== 'completed') {
        job.status = 'cancelled';
      }
    }
    this.notify();
  }

  get isQueueRunning(): boolean {
    return this._isQueueRunning;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SCHEDULING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Scheduling algorithm:
   * 1. Sort queued jobs by priority (critical > high > normal > low > background), then FIFO
   * 2. For each idle worker, find the highest-priority job whose codec is supported
   * 3. For jobs with > MIN_FRAMES_FOR_SPLIT frames, split into segments
   * 4. Assign segments round-robin to matching idle workers
   */
  private scheduleNext(): void {
    if (!this._isQueueRunning) return;

    const idleWorkers = this.getIdleWorkers();
    if (idleWorkers.length === 0) return;

    const queuedJobs = this.getSortedQueuedJobs();
    if (queuedJobs.length === 0) return;

    for (const job of queuedJobs) {
      if (idleWorkers.length === 0) break;

      // Find workers that can handle this job's codec
      const matchingWorkers = idleWorkers.filter((w) =>
        this.workerCanHandle(w, job.exportSettings),
      );

      if (matchingWorkers.length === 0) continue;

      // Split job if it's large enough and we have multiple workers
      if (job.totalFrames > MIN_FRAMES_FOR_SPLIT && matchingWorkers.length > 1) {
        this.splitAndAssign(job, matchingWorkers);
      } else {
        // Single-worker assignment
        this.assignJobToWorker(job, matchingWorkers[0]);
      }

      // Remove assigned workers from idle pool
      for (const assignedId of job.assignedNodeIds) {
        const idx = idleWorkers.findIndex((w) => w.id === assignedId);
        if (idx >= 0) idleWorkers.splice(idx, 1);
      }
    }
  }

  /** Get idle workers sorted by capability (most capable first). */
  private getIdleWorkers(): WorkerNode[] {
    return Array.from(this.workers.values())
      .filter((w) => w.status === 'idle' && w.workerTypes.includes('render'))
      .sort((a, b) => {
        // Prefer GPU-capable workers, then more VRAM, then more CPU cores
        if (a.capabilities.vramMB !== b.capabilities.vramMB)
          return b.capabilities.vramMB - a.capabilities.vramMB;
        return b.capabilities.cpuCores - a.capabilities.cpuCores;
      });
  }

  /** Get queued jobs sorted by priority then creation time. */
  private getSortedQueuedJobs(): RenderJob[] {
    return Array.from(this.jobs.values())
      .filter((j) => j.status === 'queued')
      .sort((a, b) => {
        const pa = PRIORITY_WEIGHT[a.priority] ?? 3;
        const pb = PRIORITY_WEIGHT[b.priority] ?? 3;
        if (pa !== pb) return pb - pa; // Higher priority first
        return a.createdAt - b.createdAt; // FIFO for same priority
      });
  }

  /** Check if a worker can handle a job's codec requirements. */
  private workerCanHandle(worker: WorkerNode, settings: ExportSettings): boolean {
    const codecMap: Record<string, string> = {
      h264: 'h264',
      h265: 'h265',
      prores: 'prores',
      dnxhd: 'dnxhd',
      av1: 'av1',
      webm: 'vp9',
    };
    const requiredCodec = codecMap[settings.videoCodec] ?? settings.videoCodec;
    return worker.capabilities.availableCodecs.includes(requiredCodec);
  }

  /**
   * Split a job into segments across multiple workers.
   * Splits at GOP boundaries (keyframe interval) for clean concatenation.
   */
  private splitAndAssign(job: RenderJob, workers: WorkerNode[]): void {
    const numSegments = Math.min(workers.length, Math.ceil(job.totalFrames / MIN_FRAMES_FOR_SPLIT));
    const framesPerSegment = Math.ceil(job.totalFrames / numSegments);
    const gopSize = job.exportSettings.keyframeInterval || 48;

    job.status = 'splitting';
    job.segments = [];

    let startFrame = job.inFrame ?? 0;
    for (let i = 0; i < numSegments; i++) {
      let endFrame = startFrame + framesPerSegment - 1;
      // Align to GOP boundary (except for last segment)
      if (i < numSegments - 1) {
        endFrame = Math.floor(endFrame / gopSize) * gopSize + gopSize - 1;
      } else {
        endFrame = (job.outFrame ?? job.totalFrames - 1);
      }
      // Clamp to total frames
      endFrame = Math.min(endFrame, (job.outFrame ?? job.totalFrames - 1));

      const worker = workers[i % workers.length];
      const segment: RenderJobSegment = {
        id: `${job.id}_seg_${i}`,
        jobId: job.id,
        segmentIndex: i,
        startFrame,
        endFrame,
        assignedNodeId: worker.id,
        status: 'encoding',
        progress: 0,
        startedAt: Date.now(),
      };

      job.segments.push(segment);
      job.assignedNodeIds.push(worker.id);

      // Mark worker as busy
      worker.status = 'busy';
      worker.currentJobId = job.id;
      worker.progress = 0;

      startFrame = endFrame + 1;
    }

    job.status = 'encoding';
    job.startedAt = Date.now();
    this.notify();
  }

  /** Assign an entire job to a single worker. */
  private assignJobToWorker(job: RenderJob, worker: WorkerNode): void {
    const segment: RenderJobSegment = {
      id: `${job.id}_seg_0`,
      jobId: job.id,
      segmentIndex: 0,
      startFrame: job.inFrame ?? 0,
      endFrame: job.outFrame ?? job.totalFrames - 1,
      assignedNodeId: worker.id,
      status: 'encoding',
      progress: 0,
      startedAt: Date.now(),
    };

    job.segments = [segment];
    job.assignedNodeIds = [worker.id];
    job.status = 'encoding';
    job.startedAt = Date.now();

    worker.status = 'busy';
    worker.currentJobId = job.id;
    worker.progress = 0;

    this.notify();
  }

  /** Aggregate progress from all segments of a job. */
  private aggregateSegmentProgress(job: RenderJob): number {
    if (job.segments.length === 0) return job.progress;
    const totalWeight = job.segments.reduce((sum, s) => sum + (s.endFrame - s.startFrame + 1), 0);
    const completed = job.segments.reduce((sum, s) => {
      const segFrames = s.endFrame - s.startFrame + 1;
      return sum + (segFrames * s.progress / 100);
    }, 0);
    return Math.min(100, Math.round((completed / totalWeight) * 100));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  HEARTBEAT & MONITORING
  // ═══════════════════════════════════════════════════════════════════════════

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.checkWorkerHealth();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Check worker heartbeats and mark stale workers as offline. */
  private checkWorkerHealth(): void {
    const now = Date.now();
    const threshold = HEARTBEAT_INTERVAL_MS * MAX_MISSED_HEARTBEATS;
    let changed = false;

    for (const [id, worker] of this.workers) {
      if (worker.status === 'offline') continue;
      if (now - worker.lastHeartbeat > threshold) {
        console.warn(`[RenderFarm] Worker ${worker.hostname} (${id}) missed ${MAX_MISSED_HEARTBEATS} heartbeats — marking offline`);
        this.handleWorkerDisconnect(id);
        changed = true;
      }
    }

    if (changed) this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  FARM STATISTICS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Compute current farm statistics. */
  getFarmStats(): FarmStats {
    const workers = Array.from(this.workers.values());
    const nodesOnline = workers.filter((w) => w.status !== 'offline').length;
    const nodesBusy = workers.filter((w) => w.status === 'busy').length;
    const jobs = Array.from(this.jobs.values());

    return {
      nodesOnline,
      nodesTotal: workers.length,
      nodesBusy,
      queueDepth: jobs.filter((j) => j.status === 'queued' || j.status === 'pending').length,
      activeJobs: jobs.filter((j) => j.status === 'encoding' || j.status === 'splitting' || j.status === 'uploading' || j.status === 'concatenating').length,
      completedToday: this.completedJobs.filter((j) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return (j.completedAt ?? 0) >= today.getTime();
      }).length,
      utilization: nodesOnline > 0 ? Math.round((nodesBusy / nodesOnline) * 100) : 0,
      totalFramesRendered: this.completedJobs.reduce((sum, j) => sum + j.totalFrames, 0),
      averageFps: this.computeAverageFps(),
    };
  }

  private computeAverageFps(): number {
    const recentJobs = this.completedJobs.filter((j) => j.startedAt && j.completedAt).slice(0, 10);
    if (recentJobs.length === 0) return 0;
    const totalFps = recentJobs.reduce((sum, j) => {
      const durationSec = ((j.completedAt ?? 0) - (j.startedAt ?? 0)) / 1000;
      return sum + (durationSec > 0 ? j.totalFrames / durationSec : 0);
    }, 0);
    return Math.round(totalFps / recentJobs.length);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  INSTALL SCRIPT GENERATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate a one-liner install script for setting up a render agent on a
   * remote machine. The script installs Node.js + the render agent package
   * and connects to this coordinator.
   */
  generateInstallScript(workerTypes: string[] = ['render']): string {
    const wsUrl = this.coordinatorUrl.replace('ws://', '').replace('wss://', '');
    const protocol = this.coordinatorUrl.startsWith('wss') ? 'wss' : 'ws';
    return [
      `# The Avid — Render Agent Install`,
      `# Run this on the target machine to join the render farm`,
      ``,
      `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs`,
      `npm install -g @mcua/render-agent`,
      `avid-render-agent --coordinator ${protocol}://${wsUrl} --worker-types ${workerTypes.join(',')} --name $(hostname)`,
    ].join('\n');
  }

  /**
   * Generate a Docker-based install command for the render agent.
   */
  generateDockerCommand(workerTypes: string[] = ['render']): string {
    return `docker run -d --name avid-render-agent --gpus all -e COORDINATOR_URL=${this.coordinatorUrl} -e WORKER_TYPES=${workerTypes.join(',')} mcua/render-agent:latest`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  OBSERVER PATTERN
  // ═══════════════════════════════════════════════════════════════════════════

  /** Subscribe to engine state changes. Returns an unsubscribe function. */
  subscribe(cb: FarmEventCallback): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try { fn(); } catch (err) { console.error('[RenderFarm] Listener error:', err); }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  WEBSOCKET SEND
  // ═══════════════════════════════════════════════════════════════════════════

  private send(msg: ClientToCoordinatorMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════

  /** Clean up all resources. */
  destroy(): void {
    this.disconnect();
    this.listeners.clear();
    this.workers.clear();
    this.jobs.clear();
    this.completedJobs = [];
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

/** Singleton render farm engine instance. */
export const renderFarmEngine = new RenderFarmEngine();
