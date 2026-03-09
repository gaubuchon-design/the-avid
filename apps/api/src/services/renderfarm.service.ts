import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { BadRequestError, NotFoundError } from '../utils/errors';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface RenderWorkerNode {
  id: string;
  hostname: string;
  ip: string;
  port: number;
  workerTypes: string[];
  capabilities: Record<string, unknown>;
  status: 'idle' | 'busy' | 'offline';
  currentJobId: string | null;
  registeredAt: number;
  lastHeartbeat: number;
}

export interface RenderJob {
  id: string;
  name: string;
  presetId: string;
  sourceTimelineId: string;
  totalFrames: number;
  completedFrames: number;
  priority: number;
  status: 'queued' | 'rendering' | 'paused' | 'completed' | 'cancelled' | 'failed';
  assignedWorkerIds: string[];
  templateId?: string;
  exportSettings: Record<string, unknown>;
  segmentCount: number;
  progress: number;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  errorMessage: string | null;
}

export interface RenderHistoryEntry {
  id: string;
  name: string;
  presetId: string;
  totalFrames: number;
  status: 'completed' | 'cancelled' | 'failed';
  durationMs: number | null;
  completedAt: number;
  errorMessage: string | null;
}

export interface FarmStats {
  totalWorkers: number;
  idleWorkers: number;
  busyWorkers: number;
  offlineWorkers: number;
  queuedJobs: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalFramesRendered: number;
}

// ─── Service ────────────────────────────────────────────────────────────────────

class RenderFarmService {
  private workers = new Map<string, RenderWorkerNode>();
  private jobs = new Map<string, RenderJob>();
  private history: RenderHistoryEntry[] = [];
  private totalFramesRendered = 0;

  // ─── Workers ────────────────────────────────────────────────────────────────

  registerWorker(opts: {
    hostname: string;
    ip: string;
    port: number;
    workerTypes: string[];
    capabilities?: Record<string, unknown>;
  }): RenderWorkerNode {
    const id = uuidv4();
    const node: RenderWorkerNode = {
      id,
      hostname: opts.hostname,
      ip: opts.ip,
      port: opts.port,
      workerTypes: opts.workerTypes,
      capabilities: opts.capabilities ?? {},
      status: 'idle',
      currentJobId: null,
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    this.workers.set(id, node);
    logger.info('Render worker registered', { nodeId: id, hostname: opts.hostname, ip: opts.ip });
    return node;
  }

  getWorker(id: string): RenderWorkerNode | undefined {
    return this.workers.get(id);
  }

  removeWorker(id: string): void {
    const worker = this.workers.get(id);
    if (!worker) throw new NotFoundError('Worker node');

    // If worker had an active job, re-queue it
    if (worker.currentJobId) {
      const job = this.jobs.get(worker.currentJobId);
      if (job && job.status === 'rendering') {
        job.status = 'queued';
        job.assignedWorkerIds = job.assignedWorkerIds.filter((wId) => wId !== id);
        logger.info('Re-queued job from removed worker', { jobId: job.id, workerId: id });
      }
    }

    this.workers.delete(id);
    logger.info('Render worker removed', { nodeId: id, hostname: worker.hostname });
  }

  getWorkers(): RenderWorkerNode[] {
    return Array.from(this.workers.values());
  }

  // ─── Jobs ──────────────────────────────────────────────────────────────────

  submitJob(opts: {
    name: string;
    presetId: string;
    sourceTimelineId: string;
    totalFrames: number;
    priority?: number;
    templateId?: string;
    exportSettings?: Record<string, unknown>;
    segmentCount?: number;
  }): RenderJob {
    if (opts.totalFrames <= 0) {
      throw new BadRequestError('totalFrames must be a positive number');
    }

    const id = uuidv4();
    const job: RenderJob = {
      id,
      name: opts.name,
      presetId: opts.presetId,
      sourceTimelineId: opts.sourceTimelineId,
      totalFrames: opts.totalFrames,
      completedFrames: 0,
      priority: opts.priority ?? 5,
      status: 'queued',
      assignedWorkerIds: [],
      templateId: opts.templateId,
      exportSettings: opts.exportSettings ?? {},
      segmentCount: opts.segmentCount ?? 1,
      progress: 0,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      errorMessage: null,
    };

    this.jobs.set(id, job);
    logger.info('Render job submitted', { jobId: id, name: opts.name, frames: opts.totalFrames, priority: job.priority });

    // Attempt to assign to an idle worker
    this.tryAssignNextJob();
    return job;
  }

  getJob(id: string): RenderJob | undefined {
    return this.jobs.get(id);
  }

  getJobs(): RenderJob[] {
    return Array.from(this.jobs.values())
      .sort((a, b) => {
        // Sort by priority (higher first), then by creation time (earlier first)
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.createdAt - b.createdAt;
      });
  }

  cancelJob(id: string): void {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundError('Render job');

    if (job.status === 'completed' || job.status === 'cancelled') {
      throw new BadRequestError(`Job is already ${job.status}`);
    }

    // Release assigned workers
    for (const workerId of job.assignedWorkerIds) {
      const worker = this.workers.get(workerId);
      if (worker && worker.currentJobId === id) {
        worker.status = 'idle';
        worker.currentJobId = null;
      }
    }

    job.status = 'cancelled';
    job.completedAt = Date.now();

    this.moveToHistory(job);
    this.jobs.delete(id);
    logger.info('Render job cancelled', { jobId: id });

    // Try to assign idle workers to queued jobs
    this.tryAssignNextJob();
  }

  pauseJob(id: string): void {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundError('Render job');

    if (job.status !== 'rendering' && job.status !== 'queued') {
      throw new BadRequestError(`Cannot pause job in "${job.status}" state`);
    }

    // Release assigned workers
    for (const workerId of job.assignedWorkerIds) {
      const worker = this.workers.get(workerId);
      if (worker && worker.currentJobId === id) {
        worker.status = 'idle';
        worker.currentJobId = null;
      }
    }
    job.assignedWorkerIds = [];
    job.status = 'paused';

    logger.info('Render job paused', { jobId: id, progress: job.progress });
    this.tryAssignNextJob();
  }

  resumeJob(id: string): void {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundError('Render job');

    if (job.status !== 'paused') {
      throw new BadRequestError(`Cannot resume job in "${job.status}" state`);
    }

    job.status = 'queued';
    logger.info('Render job resumed', { jobId: id });
    this.tryAssignNextJob();
  }

  // ─── Queue management ──────────────────────────────────────────────────────

  private tryAssignNextJob(): void {
    const queuedJobs = this.getJobs().filter((j) => j.status === 'queued');
    const idleWorkers = Array.from(this.workers.values()).filter((w) => w.status === 'idle');

    for (const job of queuedJobs) {
      if (idleWorkers.length === 0) break;

      const worker = idleWorkers.shift()!;
      worker.status = 'busy';
      worker.currentJobId = job.id;
      job.status = 'rendering';
      job.startedAt = job.startedAt ?? Date.now();
      job.assignedWorkerIds.push(worker.id);

      logger.info('Job assigned to worker', { jobId: job.id, workerId: worker.id, workerHost: worker.hostname });
    }
  }

  // ─── History ───────────────────────────────────────────────────────────────

  private moveToHistory(job: RenderJob): void {
    if (job.status !== 'completed' && job.status !== 'cancelled' && job.status !== 'failed') return;

    const entry: RenderHistoryEntry = {
      id: job.id,
      name: job.name,
      presetId: job.presetId,
      totalFrames: job.totalFrames,
      status: job.status,
      durationMs: job.startedAt && job.completedAt ? job.completedAt - job.startedAt : null,
      completedAt: job.completedAt ?? Date.now(),
      errorMessage: job.errorMessage,
    };

    this.history.unshift(entry);
    // Keep last 500 entries
    if (this.history.length > 500) this.history.length = 500;
  }

  getHistory(): RenderHistoryEntry[] {
    return this.history;
  }

  // ─── Statistics ────────────────────────────────────────────────────────────

  getFarmStats(): FarmStats {
    const workers = Array.from(this.workers.values());
    const jobs = Array.from(this.jobs.values());

    return {
      totalWorkers: workers.length,
      idleWorkers: workers.filter((w) => w.status === 'idle').length,
      busyWorkers: workers.filter((w) => w.status === 'busy').length,
      offlineWorkers: workers.filter((w) => w.status === 'offline').length,
      queuedJobs: jobs.filter((j) => j.status === 'queued').length,
      activeJobs: jobs.filter((j) => j.status === 'rendering').length,
      completedJobs: this.history.filter((h) => h.status === 'completed').length,
      failedJobs: this.history.filter((h) => h.status === 'failed').length,
      totalFramesRendered: this.totalFramesRendered,
    };
  }

  // ─── Install script generation ─────────────────────────────────────────────

  generateInstallScript(host: string, workerTypes: string[]): string {
    const typesStr = workerTypes.join(',');
    return `#!/bin/bash
# ─── Avid Render Agent Installer ─────────────────────────────────────────────
# Auto-generated install script for The Avid render farm agent
# Target: ${host}
# Worker Types: ${typesStr}
set -euo pipefail

AVID_API_HOST="${host}"
WORKER_TYPES="${typesStr}"
AGENT_VERSION="0.1.0"
INSTALL_DIR="/opt/avid-render-agent"

echo "=== Avid Render Agent Installer v\${AGENT_VERSION} ==="
echo "API Host: \${AVID_API_HOST}"
echo "Worker Types: \${WORKER_TYPES}"
echo ""

# Check prerequisites
command -v ffmpeg >/dev/null 2>&1 || { echo "ERROR: ffmpeg is required but not installed."; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "ERROR: curl is required but not installed."; exit 1; }

# Create install directory
sudo mkdir -p "\${INSTALL_DIR}"

# Register with the farm controller
HOSTNAME=$(hostname -f 2>/dev/null || hostname)
IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "0.0.0.0")

echo "Registering worker \${HOSTNAME} (\${IP}) with farm controller..."
RESPONSE=$(curl -s -X POST "https://\${AVID_API_HOST}/api/v1/render/workers" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"hostname\\": \\"\${HOSTNAME}\\",
    \\"ip\\": \\"\${IP}\\",
    \\"workerTypes\\": [\\"$(echo \${WORKER_TYPES} | sed 's/,/\\",\\"/g')\\"]
  }")

NODE_ID=$(echo "\${RESPONSE}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "\${NODE_ID}" ]; then
  echo "ERROR: Failed to register worker. Response: \${RESPONSE}"
  exit 1
fi

echo "Registered successfully. Node ID: \${NODE_ID}"
echo "\${NODE_ID}" | sudo tee "\${INSTALL_DIR}/node-id" > /dev/null

echo ""
echo "=== Installation complete ==="
echo "Agent installed to: \${INSTALL_DIR}"
echo "Node ID: \${NODE_ID}"
`;
  }
}

export const renderFarmService = new RenderFarmService();
