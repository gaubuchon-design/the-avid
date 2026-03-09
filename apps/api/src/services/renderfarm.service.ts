import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

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

export interface WorkerMetrics {
  jobsCompleted: number;
  averageJobDurationMs: number;
  failureRate: number;
  cpuUtilization: number;
  gpuUtilization: number;
  diskFreeGB: number;
  uptimeMs: number;
}

export interface WorkerNode {
  id: string;
  hostname: string;
  ip: string;
  port: number;
  workerTypes: string[];
  status: 'idle' | 'busy' | 'offline' | 'error' | 'draining';
  currentJobId: string | null;
  progress: number;
  capabilities: WorkerCapabilities;
  lastHeartbeat: number;
  connectedAt: number;
  metrics: WorkerMetrics;
}

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

export type JobPriority = 'critical' | 'high' | 'normal' | 'low' | 'background';

export interface RenderJobSegment {
  id: string;
  index: number;
  startFrame: number;
  endFrame: number;
  status: 'pending' | 'encoding' | 'completed' | 'failed';
  assignedNodeId?: string;
  progress: number;
  outputPath?: string;
}

export interface RenderJob {
  id: string;
  name: string;
  templateId: string | null;
  presetId: string;
  status: RenderJobStatus;
  priority: JobPriority;
  progress: number;
  assignedNodeIds: string[];
  segments: RenderJobSegment[];
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  estimatedTimeRemaining?: number;
  sourceTimelineId: string;
  totalFrames: number;
  outputPath?: string;
  outputSize?: number;
  error?: string;
  exportSettings: any;
}

export interface FarmStats {
  nodesOnline: number;
  nodesTotal: number;
  nodesBusy: number;
  queueDepth: number;
  activeJobs: number;
  completedToday: number;
  utilization: number;
  totalFramesRendered: number;
  averageFps: number;
}

// Priority weight for sorting — lower value = higher priority
const PRIORITY_WEIGHT: Record<JobPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
  background: 4,
};

const HEARTBEAT_TIMEOUT_MS = 30_000;
const STALE_CHECK_INTERVAL_MS = 10_000;

// ─── Service ──────────────────────────────────────────────────────────────────

class RenderFarmService {
  private workers = new Map<string, WorkerNode>();
  private jobs = new Map<string, RenderJob>();
  private completedJobs: RenderJob[] = [];
  private agentSockets = new Map<string, any>(); // nodeId -> socket

  /** Set by WebSocket layer to relay events to frontend clients */
  public onBroadcast: ((event: string, payload: any) => void) | null = null;

  private staleCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.staleCheckTimer = setInterval(() => this.checkStaleWorkers(), STALE_CHECK_INTERVAL_MS);
  }

  // ─── Worker Management ────────────────────────────────────────────────────

  registerWorker(
    nodeInfo: {
      hostname: string;
      ip: string;
      port: number;
      workerTypes?: string[];
      capabilities?: Partial<WorkerCapabilities>;
    },
    socket?: any,
  ): WorkerNode {
    const id = randomUUID();
    const now = Date.now();

    const node: WorkerNode = {
      id,
      hostname: nodeInfo.hostname,
      ip: nodeInfo.ip,
      port: nodeInfo.port,
      workerTypes: nodeInfo.workerTypes ?? ['render'],
      status: 'idle',
      currentJobId: null,
      progress: 0,
      capabilities: {
        gpuVendor: 'unknown',
        gpuName: 'unknown',
        vramMB: 0,
        cpuCores: 0,
        memoryGB: 0,
        availableCodecs: [],
        ffmpegVersion: 'unknown',
        maxConcurrentJobs: 1,
        hwAccel: [],
        ...nodeInfo.capabilities,
      },
      lastHeartbeat: now,
      connectedAt: now,
      metrics: {
        jobsCompleted: 0,
        averageJobDurationMs: 0,
        failureRate: 0,
        cpuUtilization: 0,
        gpuUtilization: 0,
        diskFreeGB: 0,
        uptimeMs: 0,
      },
    };

    this.workers.set(id, node);
    if (socket) this.agentSockets.set(id, socket);

    logger.info(`Render worker registered: ${node.hostname} (${id})`);
    this.broadcast('render:worker:registered', { node });
    this.broadcastStats();

    // Kick scheduler in case pending jobs are waiting
    this.scheduleNext();

    return node;
  }

  removeWorker(nodeId: string): void {
    const worker = this.workers.get(nodeId);
    if (!worker) return;

    // If the worker was busy, fail its job
    if (worker.currentJobId) {
      this.handleJobFailed(worker.currentJobId, `Worker ${worker.hostname} disconnected`);
    }

    this.workers.delete(nodeId);
    this.agentSockets.delete(nodeId);

    logger.info(`Render worker removed: ${worker.hostname} (${nodeId})`);
    this.broadcast('render:worker:disconnected', { nodeId });
    this.broadcastStats();
  }

  drainWorker(nodeId: string): void {
    const worker = this.workers.get(nodeId);
    if (!worker) return;

    worker.status = 'draining';
    logger.info(`Render worker draining: ${worker.hostname} (${nodeId})`);
    this.broadcast('render:worker:updated', { nodeId, patch: { status: 'draining' } });
  }

  getWorkers(): WorkerNode[] {
    return Array.from(this.workers.values());
  }

  getWorker(nodeId: string): WorkerNode | undefined {
    return this.workers.get(nodeId);
  }

  handleAgentHeartbeat(
    nodeId: string,
    status?: WorkerNode['status'],
    progress?: number,
    metrics?: Partial<WorkerMetrics>,
  ): void {
    const worker = this.workers.get(nodeId);
    if (!worker) return;

    worker.lastHeartbeat = Date.now();
    if (status && worker.status !== 'draining') worker.status = status;
    if (progress !== undefined) worker.progress = progress;
    if (metrics) Object.assign(worker.metrics, metrics);

    this.broadcast('render:worker:heartbeat', { nodeId, metrics: worker.metrics });
  }

  // ─── Job Management ───────────────────────────────────────────────────────

  submitJob(jobData: {
    name: string;
    presetId: string;
    priority?: JobPriority;
    sourceTimelineId: string;
    totalFrames: number;
    templateId?: string;
    exportSettings?: any;
    segmentCount?: number;
  }): RenderJob {
    const id = randomUUID();
    const segmentCount = jobData.segmentCount ?? Math.max(1, Math.ceil(jobData.totalFrames / 1000));
    const framesPerSegment = Math.ceil(jobData.totalFrames / segmentCount);

    const segments: RenderJobSegment[] = [];
    for (let i = 0; i < segmentCount; i++) {
      const startFrame = i * framesPerSegment;
      const endFrame = Math.min((i + 1) * framesPerSegment - 1, jobData.totalFrames - 1);
      segments.push({
        id: randomUUID(),
        index: i,
        startFrame,
        endFrame,
        status: 'pending',
        progress: 0,
      });
    }

    const job: RenderJob = {
      id,
      name: jobData.name,
      templateId: jobData.templateId ?? null,
      presetId: jobData.presetId,
      status: 'queued',
      priority: jobData.priority ?? 'normal',
      progress: 0,
      assignedNodeIds: [],
      segments,
      createdAt: Date.now(),
      sourceTimelineId: jobData.sourceTimelineId,
      totalFrames: jobData.totalFrames,
      exportSettings: jobData.exportSettings ?? {},
    };

    this.jobs.set(id, job);
    logger.info(`Render job submitted: ${job.name} (${id}) — ${segmentCount} segments, ${jobData.totalFrames} frames`);
    this.broadcast('render:job:queued', { job });
    this.broadcastStats();

    // Try to schedule immediately
    this.scheduleNext();

    return job;
  }

  cancelJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'cancelled';
    job.completedAt = Date.now();

    // Release assigned workers
    for (const nodeId of job.assignedNodeIds) {
      const worker = this.workers.get(nodeId);
      if (worker && worker.currentJobId === jobId) {
        worker.status = 'idle';
        worker.currentJobId = null;
        worker.progress = 0;
        this.broadcast('render:worker:updated', { nodeId, patch: { status: 'idle', currentJobId: null } });
      }
    }
    job.assignedNodeIds = [];

    // Move to history
    this.jobs.delete(jobId);
    this.completedJobs.unshift(job);

    logger.info(`Render job cancelled: ${jobId}`);
    this.broadcast('render:job:status', { jobId, status: 'cancelled' });
    this.broadcastStats();
  }

  pauseJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'completed' || job.status === 'failed') return;

    job.status = 'paused';
    logger.info(`Render job paused: ${jobId}`);
    this.broadcast('render:job:status', { jobId, status: 'paused' });
  }

  resumeJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'paused') return;

    job.status = 'queued';
    logger.info(`Render job resumed: ${jobId}`);
    this.broadcast('render:job:status', { jobId, status: 'queued' });
    this.scheduleNext();
  }

  getJobs(): RenderJob[] {
    return Array.from(this.jobs.values()).sort(
      (a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] || a.createdAt - b.createdAt,
    );
  }

  getJob(jobId: string): RenderJob | undefined {
    return this.jobs.get(jobId);
  }

  getHistory(): RenderJob[] {
    return this.completedJobs;
  }

  // ─── Scheduling ───────────────────────────────────────────────────────────

  scheduleNext(): void {
    const idleWorkers = Array.from(this.workers.values()).filter((w) => w.status === 'idle');
    if (idleWorkers.length === 0) return;

    const pendingJobs = this.getJobs().filter((j) => j.status === 'queued');
    if (pendingJobs.length === 0) return;

    for (const worker of idleWorkers) {
      const nextJob = pendingJobs.shift();
      if (!nextJob) break;

      this.assignJobToAgent(nextJob, worker.id);
    }
  }

  assignJobToAgent(job: RenderJob, workerId: string): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    job.status = 'encoding';
    job.startedAt = Date.now();
    job.assignedNodeIds.push(workerId);

    worker.status = 'busy';
    worker.currentJobId = job.id;
    worker.progress = 0;

    logger.info(`Assigned job ${job.id} to worker ${worker.hostname} (${workerId})`);

    this.broadcast('render:job:status', { jobId: job.id, status: 'encoding' });
    this.broadcast('render:worker:updated', {
      nodeId: workerId,
      patch: { status: 'busy', currentJobId: job.id },
    });

    // Send job to the agent via its socket if available
    const socket = this.agentSockets.get(workerId);
    if (socket) {
      socket.emit('render:agent:assign', { job });
    }
  }

  // ─── Progress Handling ────────────────────────────────────────────────────

  handleJobProgress(
    jobId: string,
    segmentId: string | undefined,
    progress: number,
    frame?: number,
    fps?: number,
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    if (segmentId) {
      const seg = job.segments.find((s) => s.id === segmentId);
      if (seg) {
        seg.progress = progress;
        seg.status = 'encoding';
      }
    }

    // Recalculate overall progress from segments
    if (job.segments.length > 0) {
      const totalSegProgress = job.segments.reduce((sum, s) => sum + s.progress, 0);
      job.progress = totalSegProgress / job.segments.length;
    } else {
      job.progress = progress;
    }

    // Estimate time remaining
    if (fps && fps > 0 && frame !== undefined) {
      const remainingFrames = job.totalFrames - frame;
      job.estimatedTimeRemaining = Math.round((remainingFrames / fps) * 1000);
    }

    this.broadcast('render:job:progress', { jobId, progress: job.progress, segmentId });
  }

  handleSegmentComplete(jobId: string, segmentId: string, outputPath: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const seg = job.segments.find((s) => s.id === segmentId);
    if (seg) {
      seg.status = 'completed';
      seg.progress = 100;
      seg.outputPath = outputPath;
    }

    // Check if all segments are done
    const allDone = job.segments.every((s) => s.status === 'completed');
    if (allDone) {
      job.status = 'concatenating';
      this.broadcast('render:job:status', { jobId, status: 'concatenating' });
    }

    // Update progress
    const totalSegProgress = job.segments.reduce((sum, s) => sum + s.progress, 0);
    job.progress = totalSegProgress / job.segments.length;
    this.broadcast('render:job:progress', { jobId, progress: job.progress, segmentId });
  }

  handleJobComplete(jobId: string, outputPath: string, outputSize?: number): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'completed';
    job.progress = 100;
    job.completedAt = Date.now();
    job.outputPath = outputPath;
    if (outputSize !== undefined) job.outputSize = outputSize;

    // Release workers
    for (const nodeId of job.assignedNodeIds) {
      const worker = this.workers.get(nodeId);
      if (worker && worker.currentJobId === jobId) {
        worker.status = worker.status === 'draining' ? 'draining' : 'idle';
        worker.currentJobId = null;
        worker.progress = 0;
        worker.metrics.jobsCompleted++;
        if (job.startedAt) {
          const dur = Date.now() - job.startedAt;
          const prev = worker.metrics.averageJobDurationMs;
          const count = worker.metrics.jobsCompleted;
          worker.metrics.averageJobDurationMs = Math.round((prev * (count - 1) + dur) / count);
        }
        this.broadcast('render:worker:updated', {
          nodeId,
          patch: { status: worker.status, currentJobId: null },
        });
      }
    }

    // Move to history
    this.jobs.delete(jobId);
    this.completedJobs.unshift(job);
    if (this.completedJobs.length > 500) this.completedJobs.pop();

    logger.info(`Render job complete: ${job.name} (${jobId})`);
    this.broadcast('render:job:complete', { jobId, outputPath, outputSize });
    this.broadcastStats();

    // Schedule next
    this.scheduleNext();
  }

  handleJobFailed(jobId: string, error: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'failed';
    job.error = error;
    job.completedAt = Date.now();

    // Release workers
    for (const nodeId of job.assignedNodeIds) {
      const worker = this.workers.get(nodeId);
      if (worker && worker.currentJobId === jobId) {
        worker.status = worker.status === 'draining' ? 'draining' : 'idle';
        worker.currentJobId = null;
        worker.progress = 0;
        const total = worker.metrics.jobsCompleted + 1;
        worker.metrics.failureRate = ((worker.metrics.failureRate * worker.metrics.jobsCompleted) + 1) / total;
        this.broadcast('render:worker:updated', {
          nodeId,
          patch: { status: worker.status, currentJobId: null },
        });
      }
    }

    // Move to history
    this.jobs.delete(jobId);
    this.completedJobs.unshift(job);
    if (this.completedJobs.length > 500) this.completedJobs.pop();

    logger.error(`Render job failed: ${job.name} (${jobId}) — ${error}`);
    this.broadcast('render:job:failed', { jobId, error });
    this.broadcastStats();

    // Schedule next
    this.scheduleNext();
  }

  // ─── Farm Stats ───────────────────────────────────────────────────────────

  getFarmStats(): FarmStats {
    const workers = Array.from(this.workers.values());
    const online = workers.filter((w) => w.status !== 'offline');
    const busy = workers.filter((w) => w.status === 'busy');
    const activeJobs = Array.from(this.jobs.values()).filter(
      (j) => j.status === 'encoding' || j.status === 'splitting' || j.status === 'concatenating' || j.status === 'uploading',
    );
    const queuedJobs = Array.from(this.jobs.values()).filter((j) => j.status === 'queued');

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const completedToday = this.completedJobs.filter(
      (j) => j.status === 'completed' && j.completedAt && j.completedAt >= todayStart.getTime(),
    );

    const totalFrames = this.completedJobs.reduce((sum, j) => sum + (j.status === 'completed' ? j.totalFrames : 0), 0);

    // Average FPS: total frames / total encoding time
    const totalDurationMs = this.completedJobs.reduce((sum, j) => {
      if (j.status === 'completed' && j.startedAt && j.completedAt) {
        return sum + (j.completedAt - j.startedAt);
      }
      return sum;
    }, 0);
    const avgFps = totalDurationMs > 0 ? Math.round((totalFrames / (totalDurationMs / 1000)) * 10) / 10 : 0;

    return {
      nodesOnline: online.length,
      nodesTotal: workers.length,
      nodesBusy: busy.length,
      queueDepth: queuedJobs.length,
      activeJobs: activeJobs.length,
      completedToday: completedToday.length,
      utilization: online.length > 0 ? Math.round((busy.length / online.length) * 100) : 0,
      totalFramesRendered: totalFrames,
      averageFps: avgFps,
    };
  }

  // ─── Install Script ───────────────────────────────────────────────────────

  generateInstallScript(host: string, workerTypes: string[]): string {
    const typesArg = workerTypes.join(',');
    return `#!/usr/bin/env bash
# ── The Avid Render Farm Agent Installer ──────────────────────────────────────
# Run on each render node: curl -sSL http://${host}/api/v1/render/install-script | bash
set -euo pipefail

FARM_HOST="${host}"
WORKER_TYPES="${typesArg}"
INSTALL_DIR="\$HOME/.avid-render-agent"

echo "╔═══════════════════════════════════════════════════╗"
echo "║      The Avid — Render Farm Agent Installer       ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""
echo "Farm host : \$FARM_HOST"
echo "Worker types: \$WORKER_TYPES"
echo "Install dir : \$INSTALL_DIR"
echo ""

# Check deps
command -v ffmpeg >/dev/null 2>&1 || { echo "Error: ffmpeg is required. Install it first."; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Error: Node.js >=18 is required. Install it first."; exit 1; }

FFMPEG_VERSION=\$(ffmpeg -version | head -1 | awk '{print \$3}')
echo "ffmpeg version: \$FFMPEG_VERSION"

# Detect GPU
GPU_VENDOR="none"
GPU_NAME="none"
if command -v nvidia-smi >/dev/null 2>&1; then
  GPU_VENDOR="nvidia"
  GPU_NAME=\$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)
elif system_profiler SPDisplaysDataType 2>/dev/null | grep -q "Apple"; then
  GPU_VENDOR="apple"
  GPU_NAME="Apple Silicon"
fi

echo "GPU: \$GPU_VENDOR — \$GPU_NAME"

# Create install directory
mkdir -p "\$INSTALL_DIR"
cat > "\$INSTALL_DIR/agent-config.json" <<AGENTEOF
{
  "farmHost": "\$FARM_HOST",
  "workerTypes": "\$WORKER_TYPES",
  "hostname": "\$(hostname)",
  "ip": "\$(hostname -I 2>/dev/null | awk '{print \$1}' || ipconfig getifaddr en0 2>/dev/null || echo '0.0.0.0')",
  "gpuVendor": "\$GPU_VENDOR",
  "gpuName": "\$GPU_NAME",
  "ffmpegVersion": "\$FFMPEG_VERSION",
  "cpuCores": \$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1),
  "memoryGB": \$(free -g 2>/dev/null | awk '/Mem:/{print \$2}' || echo \$(( \$(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1073741824 )))
}
AGENTEOF

echo ""
echo "Agent config written to \$INSTALL_DIR/agent-config.json"
echo "Agent ready. Connect to farm at ws://\$FARM_HOST with the render agent client."
echo "Done."
`;
  }

  // ─── Internal Helpers ─────────────────────────────────────────────────────

  private broadcast(event: string, payload: any): void {
    if (this.onBroadcast) {
      this.onBroadcast(event, payload);
    }
  }

  private broadcastStats(): void {
    this.broadcast('render:farm:stats', this.getFarmStats());
  }

  private checkStaleWorkers(): void {
    const now = Date.now();
    for (const [nodeId, worker] of this.workers) {
      if (worker.status !== 'offline' && now - worker.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        logger.warn(`Render worker stale (no heartbeat): ${worker.hostname} (${nodeId})`);
        worker.status = 'offline';
        this.broadcast('render:worker:updated', { nodeId, patch: { status: 'offline' } });

        // If the worker had a job, fail it
        if (worker.currentJobId) {
          this.handleJobFailed(worker.currentJobId, `Worker ${worker.hostname} timed out (no heartbeat)`);
          worker.currentJobId = null;
        }

        this.broadcastStats();
      }
    }
  }

  /** Cleanup — stop the stale-check timer */
  destroy(): void {
    if (this.staleCheckTimer) {
      clearInterval(this.staleCheckTimer);
      this.staleCheckTimer = null;
    }
  }
}

export const renderFarmService = new RenderFarmService();
