// =============================================================================
//  THE AVID — VFX Job Manager
//  Job queue for AI VFX operations. Manages submission, execution,
//  progress tracking, cancellation, and result delivery.
//  Dispatches work to Web Workers for background processing.
// =============================================================================

// ─── Types ──────────────────────────────────────────────────────────────────

export type VFXJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type VFXJobType = 'object-removal' | 'rotoscope' | 'sky-replacement' | 'face-beauty' | 'color-match' | 'content-stabilize';

export interface VFXJob {
  id: string;
  type: VFXJobType;
  clipId: string;
  frameRange: { start: number; end: number };
  params: Record<string, unknown>;
  status: VFXJobStatus;
  progress: number;       // 0-1
  results: Map<number, ImageData> | null;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface VFXJobSubmission {
  type: VFXJobType;
  clipId: string;
  frameRange: { start: number; end: number };
  params: Record<string, unknown>;
  execute: (job: VFXJob) => Promise<void>;
}

type JobSubscriber = (job: VFXJob) => void;

// ─── Job Manager ────────────────────────────────────────────────────────────

class VFXJobManagerClass {
  private jobs: Map<string, VFXJob> = new Map();
  private queue: { id: string; execute: (job: VFXJob) => Promise<void> }[] = [];
  private running = false;
  private maxConcurrent = 1; // Process one job at a time
  private activeJobs = 0;
  private subscribers: Map<string, Set<JobSubscriber>> = new Map();
  private globalSubscribers: Set<(jobs: VFXJob[]) => void> = new Set();
  private jobCounter = 0;
  private abortControllers: Map<string, AbortController> = new Map();

  /**
   * Submit a new VFX job. Returns immediately with the job handle.
   */
  submitJob(submission: VFXJobSubmission): VFXJob {
    const id = `vfx-job-${++this.jobCounter}-${Date.now()}`;

    const job: VFXJob = {
      id,
      type: submission.type,
      clipId: submission.clipId,
      frameRange: { ...submission.frameRange },
      params: { ...submission.params },
      status: 'queued',
      progress: 0,
      results: null,
      createdAt: Date.now(),
    };

    this.jobs.set(id, job);
    this.queue.push({ id, execute: submission.execute });
    this.abortControllers.set(id, new AbortController());

    this.notifySubscribers(job);
    this.processQueue();

    return job;
  }

  /**
   * Cancel a running or queued job.
   */
  cancelJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    if (job.status === 'queued') {
      job.status = 'cancelled';
      this.queue = this.queue.filter(q => q.id !== jobId);
    } else if (job.status === 'running') {
      job.status = 'cancelled';
      this.abortControllers.get(jobId)?.abort();
    }

    this.notifySubscribers(job);
  }

  /**
   * Get a job by ID.
   */
  getJob(jobId: string): VFXJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs (optionally filtered by status).
   */
  getAllJobs(status?: VFXJobStatus): VFXJob[] {
    const jobs = Array.from(this.jobs.values());
    return status ? jobs.filter(j => j.status === status) : jobs;
  }

  /**
   * Get jobs for a specific clip.
   */
  getJobsForClip(clipId: string): VFXJob[] {
    return Array.from(this.jobs.values()).filter(j => j.clipId === clipId);
  }

  /**
   * Subscribe to updates for a specific job.
   */
  subscribeJob(jobId: string, callback: JobSubscriber): () => void {
    if (!this.subscribers.has(jobId)) {
      this.subscribers.set(jobId, new Set());
    }
    this.subscribers.get(jobId)!.add(callback);

    return () => {
      this.subscribers.get(jobId)?.delete(callback);
    };
  }

  /**
   * Subscribe to all job list changes.
   */
  subscribeAll(callback: (jobs: VFXJob[]) => void): () => void {
    this.globalSubscribers.add(callback);
    return () => { this.globalSubscribers.delete(callback); };
  }

  /**
   * Remove completed/failed/cancelled jobs older than maxAge (ms).
   */
  cleanup(maxAge: number = 300000): void {
    const now = Date.now();
    const toRemove: string[] = [];
    for (const [id, job] of this.jobs) {
      if (
        (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') &&
        job.completedAt &&
        now - job.completedAt > maxAge
      ) {
        toRemove.push(id);
      }
    }
    for (const id of toRemove) {
      this.jobs.delete(id);
      this.subscribers.delete(id);
      this.abortControllers.delete(id);
    }
    this.notifyGlobalSubscribers();
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private async processQueue(): Promise<void> {
    if (this.running || this.activeJobs >= this.maxConcurrent) return;
    this.running = true;

    while (this.queue.length > 0 && this.activeJobs < this.maxConcurrent) {
      const entry = this.queue.shift();
      if (!entry) break;

      const job = this.jobs.get(entry.id);
      if (!job || job.status === 'cancelled') continue;

      this.activeJobs++;
      job.status = 'running';
      this.notifySubscribers(job);

      try {
        // Set up progress monitoring
        const progressInterval = setInterval(() => {
          this.notifySubscribers(job);
        }, 250);

        await entry.execute(job);

        clearInterval(progressInterval);

        if ((job.status as string) !== 'cancelled') {
          job.status = 'completed';
          job.progress = 1;
          job.completedAt = Date.now();
        }
      } catch (err) {
        if ((job.status as string) !== 'cancelled') {
          job.status = 'failed';
          job.error = err instanceof Error ? err.message : 'Unknown VFX job error';
          job.completedAt = Date.now();
        }
      }

      this.activeJobs--;
      this.notifySubscribers(job);
    }

    this.running = false;
  }

  private notifySubscribers(job: VFXJob): void {
    const subs = this.subscribers.get(job.id);
    if (subs) {
      for (const cb of subs) cb(job);
    }
    this.notifyGlobalSubscribers();
  }

  private notifyGlobalSubscribers(): void {
    const allJobs = this.getAllJobs();
    for (const cb of this.globalSubscribers) cb(allJobs);
  }
}

export const vfxJobManager = new VFXJobManagerClass();
