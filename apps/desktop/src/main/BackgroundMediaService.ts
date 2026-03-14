export type BackgroundMediaJobKind =
  | 'INGEST'
  | 'INDEX'
  | 'EXPORT'
  | 'TRANSCODE'
  | 'TRANSCRIPTION'
  | 'RENDER'
  | 'EFFECTS';

export type BackgroundMediaJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type BackgroundMediaDispatchMode = 'LOCAL' | 'DISTRIBUTED' | 'HYBRID';

export interface BackgroundMediaJob {
  id: string;
  kind: BackgroundMediaJobKind;
  projectId: string;
  label: string;
  status: BackgroundMediaJobStatus;
  progress: number;
  startedAt: string;
  updatedAt: string;
  outputPath?: string;
  error?: string;
  detail?: string;
  dispatchMode?: BackgroundMediaDispatchMode;
}

export interface BackgroundMediaResourceSnapshot {
  cpuCount: number;
  totalMemoryMB: number;
  freeMemoryMB: number;
  loadAverage: number;
}

export interface BackgroundMediaJobResult {
  outputPath?: string;
  detail?: string;
}

export interface BackgroundMediaJobContext {
  resources: BackgroundMediaResourceSnapshot;
  dispatchMode: BackgroundMediaDispatchMode;
  reportProgress: (progress: number, detail?: string) => void;
  reportDetail: (detail: string) => void;
}

export interface BackgroundMediaJobDefinition<Result extends BackgroundMediaJobResult = BackgroundMediaJobResult> {
  id: string;
  kind: BackgroundMediaJobKind;
  projectId: string;
  label: string;
  detail?: string;
  minimumFreeMemoryMB?: number;
  preferredDispatchMode?: BackgroundMediaDispatchMode;
  runLocal: (context: BackgroundMediaJobContext) => Promise<Result>;
  runDistributed?: (context: BackgroundMediaJobContext) => Promise<Result>;
}

interface BackgroundMediaQueueItem {
  id: string;
  definition: BackgroundMediaJobDefinition;
  execute: (resources: BackgroundMediaResourceSnapshot) => Promise<void>;
}

interface BackgroundMediaExecutionItem<Result extends BackgroundMediaJobResult = BackgroundMediaJobResult> {
  definition: BackgroundMediaJobDefinition<Result>;
  resolve: (result: Result) => void;
  reject: (error: unknown) => void;
  promise: Promise<Result>;
}

export interface BackgroundMediaEnqueueResult<Result extends BackgroundMediaJobResult = BackgroundMediaJobResult> {
  job: BackgroundMediaJob;
  completion: Promise<Result>;
}

export interface BackgroundMediaServiceOptions {
  collectResources: () => BackgroundMediaResourceSnapshot;
  upsertJob: (job: BackgroundMediaJob) => BackgroundMediaJob;
  maxConcurrentJobs?: number;
  schedulerDelayMs?: number;
}

const DISTRIBUTION_CANDIDATE_KINDS = new Set<BackgroundMediaJobKind>([
  'EXPORT',
  'TRANSCODE',
  'TRANSCRIPTION',
  'RENDER',
  'EFFECTS',
]);

export class BackgroundMediaService {
  private queue: BackgroundMediaQueueItem[] = [];
  private running = new Map<string, BackgroundMediaQueueItem>();
  private pumping = false;
  private scheduledPump: ReturnType<typeof setTimeout> | null = null;
  private readonly maxConcurrentJobs: number;
  private readonly schedulerDelayMs: number;

  constructor(private readonly options: BackgroundMediaServiceOptions) {
    this.maxConcurrentJobs = Math.max(1, options.maxConcurrentJobs ?? 3);
    this.schedulerDelayMs = Math.max(50, options.schedulerDelayMs ?? 350);
  }

  enqueue<Result extends BackgroundMediaJobResult = BackgroundMediaJobResult>(
    definition: BackgroundMediaJobDefinition<Result>,
  ): BackgroundMediaEnqueueResult<Result> {
    const startedAt = new Date().toISOString();
    const job = this.options.upsertJob({
      id: definition.id,
      kind: definition.kind,
      projectId: definition.projectId,
      label: definition.label,
      status: 'QUEUED',
      progress: 0,
      startedAt,
      updatedAt: startedAt,
      detail: definition.detail,
      dispatchMode: definition.preferredDispatchMode ?? 'LOCAL',
    });

    let resolvePromise!: (result: Result) => void;
    let rejectPromise!: (error: unknown) => void;
    const promise = new Promise<Result>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    this.queue.push({
      id: definition.id,
      definition,
      execute: (resources) => this.executeQueueItem({
        definition,
        resolve: resolvePromise,
        reject: rejectPromise,
        promise,
      }, resources),
    });

    this.schedulePump();
    return {
      job,
      completion: promise,
    };
  }

  shutdown(): void {
    if (this.scheduledPump) {
      clearTimeout(this.scheduledPump);
      this.scheduledPump = null;
    }
    this.queue = [];
  }

  private schedulePump(): void {
    if (this.scheduledPump) {
      return;
    }

    this.scheduledPump = setTimeout(() => {
      this.scheduledPump = null;
      void this.pumpQueue();
    }, this.schedulerDelayMs);
  }

  private calculateConcurrency(resources: BackgroundMediaResourceSnapshot): number {
    const memoryPressure = resources.totalMemoryMB > 0
      ? 1 - (resources.freeMemoryMB / resources.totalMemoryMB)
      : 0;

    if (resources.freeMemoryMB < 2_048 || resources.loadAverage > resources.cpuCount * 1.2) {
      return 1;
    }
    if (memoryPressure > 0.8 || resources.loadAverage > resources.cpuCount * 0.9) {
      return Math.min(1, this.maxConcurrentJobs);
    }
    if (memoryPressure > 0.65 || resources.freeMemoryMB < 6_144) {
      return Math.min(2, this.maxConcurrentJobs);
    }
    return this.maxConcurrentJobs;
  }

  private shouldPreferDistributed(
    definition: BackgroundMediaJobDefinition,
    resources: BackgroundMediaResourceSnapshot,
  ): boolean {
    if (!definition.runDistributed) {
      return false;
    }

    if (definition.preferredDispatchMode === 'DISTRIBUTED') {
      return true;
    }

    if (!DISTRIBUTION_CANDIDATE_KINDS.has(definition.kind)) {
      return false;
    }

    const freeMemoryRatio = resources.totalMemoryMB > 0
      ? resources.freeMemoryMB / resources.totalMemoryMB
      : 1;

    return resources.loadAverage > resources.cpuCount * 0.8 || freeMemoryRatio < 0.24;
  }

  private canRunLocally(
    definition: BackgroundMediaJobDefinition,
    resources: BackgroundMediaResourceSnapshot,
  ): boolean {
    return resources.freeMemoryMB >= (definition.minimumFreeMemoryMB ?? 512);
  }

  private async pumpQueue(): Promise<void> {
    if (this.pumping) {
      return;
    }

    this.pumping = true;
    try {
      while (this.queue.length > 0) {
        const resources = this.options.collectResources();
        const concurrency = this.calculateConcurrency(resources);
        if (this.running.size >= concurrency) {
          this.schedulePump();
          break;
        }

        const nextIndex = this.queue.findIndex((item) => this.canRunLocally(item.definition, resources));
        if (nextIndex < 0) {
          this.schedulePump();
          break;
        }

        const [nextItem] = this.queue.splice(nextIndex, 1);
        if (!nextItem) {
          break;
        }

        this.running.set(nextItem.id, nextItem);
        void nextItem.execute(resources);
      }
    } finally {
      this.pumping = false;
    }
  }

  private async executeQueueItem<Result extends BackgroundMediaJobResult>(
    item: BackgroundMediaExecutionItem<Result>,
    initialResources: BackgroundMediaResourceSnapshot,
  ): Promise<void> {
    const definition = item.definition;
    const startedAt = new Date().toISOString();
    const preferredDistributed = this.shouldPreferDistributed(definition, initialResources);
    let dispatchMode: BackgroundMediaDispatchMode = preferredDistributed ? 'DISTRIBUTED' : 'LOCAL';

    const upsert = (patch: Partial<BackgroundMediaJob>) => {
      this.options.upsertJob({
        id: definition.id,
        kind: definition.kind,
        projectId: definition.projectId,
        label: definition.label,
        status: patch.status ?? 'RUNNING',
        progress: patch.progress ?? 0,
        startedAt,
        updatedAt: new Date().toISOString(),
        outputPath: patch.outputPath,
        error: patch.error,
        detail: patch.detail ?? definition.detail,
        dispatchMode: patch.dispatchMode ?? dispatchMode,
      });
    };

    const context: BackgroundMediaJobContext = {
      resources: initialResources,
      dispatchMode,
      reportProgress: (progress, detail) => {
        upsert({
          status: 'RUNNING',
          progress: Math.max(0, Math.min(100, Math.round(progress))),
          detail,
          dispatchMode,
        });
      },
      reportDetail: (detail) => {
        upsert({
          status: 'RUNNING',
          progress: 0,
          detail,
          dispatchMode,
        });
      },
    };

    upsert({
      status: 'RUNNING',
      progress: 0,
      detail: definition.detail,
      dispatchMode,
    });

    try {
      let result: Result;
      if (preferredDistributed && definition.runDistributed) {
        try {
          result = await definition.runDistributed(context);
        } catch (error) {
          dispatchMode = 'HYBRID';
          context.dispatchMode = dispatchMode;
          result = await definition.runLocal(context);
          if (error instanceof Error) {
            context.reportDetail(`Remote dispatch unavailable, completed locally: ${error.message}`);
          }
        }
      } else {
        result = await definition.runLocal(context);
      }

      const completionPatch = this.extractCompletionPatch(result);
      upsert({
        status: 'COMPLETED',
        progress: 100,
        outputPath: completionPatch.outputPath,
        detail: completionPatch.detail ?? definition.detail,
        dispatchMode,
      });
      item.resolve(result);
    } catch (error) {
      upsert({
        status: 'FAILED',
        progress: 0,
        error: error instanceof Error ? error.message : String(error),
        detail: definition.detail,
        dispatchMode,
      });
      item.reject(error);
    } finally {
      this.running.delete(definition.id);
      this.schedulePump();
    }
  }

  private extractCompletionPatch(result: unknown): BackgroundMediaJobResult {
    if (!result || typeof result !== 'object') {
      return {};
    }

    const patch = result as Record<string, unknown>;
    return {
      outputPath: typeof patch['outputPath'] === 'string' ? patch['outputPath'] : undefined,
      detail: typeof patch['detail'] === 'string' ? patch['detail'] : undefined,
    };
  }
}
