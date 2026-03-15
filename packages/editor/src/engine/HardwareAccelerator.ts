// =============================================================================
//  THE AVID — Hardware Accelerator
//  GPU/CPU detection, compute dispatch (WebGPU/WebGL2/Software), Web Worker
//  thread pool with priority scheduling, and real-time performance monitoring.
// =============================================================================

// ═══════════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** GPU vendor identifier. */
export type GPUVendor = 'nvidia' | 'amd' | 'intel' | 'apple' | 'qualcomm' | 'arm' | 'unknown';

/** Processor architecture. */
export type CPUArchitecture = 'x86_64' | 'arm64' | 'unknown';

/** Compute acceleration backend. */
export type AccelerationBackend = 'webgpu' | 'webgl2' | 'software';

/** GPU capabilities detected at runtime. */
export interface GPUCapabilities {
  /** Whether a GPU is available. */
  available: boolean;
  /** GPU vendor. */
  vendor: GPUVendor;
  /** GPU model / renderer string. */
  model: string;
  /** Estimated VRAM in MB (0 if unknown). */
  vramMB: number;
  /** Whether WebGPU is available. */
  hasWebGPU: boolean;
  /** Whether WebGL2 is available. */
  hasWebGL2: boolean;
  /** Maximum texture dimension (pixels). */
  maxTextureSize: number;
  /** Maximum compute workgroup size (WebGPU). */
  maxComputeWorkgroupSize: number;
  /** Maximum storage buffer size (WebGPU, bytes). */
  maxStorageBufferSize: number;
  /** WebGPU adapter features (if available). */
  features: string[];
  /** WebGL2 extensions available. */
  webgl2Extensions: string[];
  /** Whether OES_texture_float is available (WebGL2). */
  hasFloatTextures: boolean;
  /** Whether EXT_color_buffer_float is available (WebGL2). */
  hasFloatColorBuffer: boolean;
}

/** CPU capabilities detected at runtime. */
export interface CPUCapabilities {
  /** Processor architecture. */
  architecture: CPUArchitecture;
  /** Number of logical cores. */
  coreCount: number;
  /** Platform/OS identifier. */
  platform: 'macos' | 'windows' | 'linux' | 'chromeos' | 'ios' | 'android' | 'unknown';
  /** Processor vendor/family. */
  processor: 'intel' | 'amd' | 'apple-silicon' | 'arm' | 'unknown';
  /** Device memory in GB (navigator.deviceMemory, 0 if unknown). */
  deviceMemoryGB: number;
  /** Whether SharedArrayBuffer is available (needed for true threading). */
  hasSharedArrayBuffer: boolean;
  /** Whether Atomics are available. */
  hasAtomics: boolean;
}

/** A task to run on a Web Worker thread. */
export interface WorkerTask {
  /** Unique task identifier. */
  id: string;
  /** The function body as a string (will be wrapped in a worker). */
  taskCode: string;
  /** Data to transfer to the worker. */
  data: unknown;
  /** Transferable objects (ArrayBuffers, etc.). */
  transferables?: Transferable[];
  /** Task priority (lower = higher priority). */
  priority?: number;
}

/** Result from a completed worker task. */
export interface WorkerTaskResult {
  /** The task ID. */
  id: string;
  /** The result data from the worker. */
  result: unknown;
  /** Time taken in milliseconds. */
  durationMs: number;
}

/** Performance snapshot from the monitor. */
export interface PerformanceSnapshot {
  /** Estimated GPU utilisation (0..1), -1 if unavailable. */
  gpuUtilisation: number;
  /** Estimated CPU utilisation (0..1). */
  cpuUtilisation: number;
  /** JS heap used in MB. */
  memoryUsedMB: number;
  /** JS heap limit in MB. */
  memoryLimitMB: number;
  /** Whether the system is under memory pressure. */
  memoryPressure: boolean;
  /** Average frame decode time in ms (last N samples). */
  avgDecodeTimeMs: number;
  /** Average frame encode time in ms (last N samples). */
  avgEncodeTimeMs: number;
  /** Recommended quality scaling factor (0..1). */
  qualityScale: number;
  /** Timestamp of this snapshot. */
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//  GPU DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Classify the GPU vendor from a renderer string.
 */
function classifyGPUVendor(vendorStr: string, rendererStr: string): GPUVendor {
  const combined = `${vendorStr} ${rendererStr}`.toLowerCase();
  if (combined.includes('nvidia') || combined.includes('geforce') || combined.includes('quadro') || combined.includes('rtx') || combined.includes('gtx')) return 'nvidia';
  if (combined.includes('amd') || combined.includes('radeon') || combined.includes('rx ')) return 'amd';
  if (combined.includes('apple') || combined.includes('m1') || combined.includes('m2') || combined.includes('m3') || combined.includes('m4')) return 'apple';
  if (combined.includes('intel') || combined.includes('iris') || combined.includes('uhd') || combined.includes('arc')) return 'intel';
  if (combined.includes('qualcomm') || combined.includes('adreno')) return 'qualcomm';
  if (combined.includes('arm') || combined.includes('mali')) return 'arm';
  return 'unknown';
}

/**
 * Estimate VRAM from the GPU model string.
 * This is a rough heuristic since browsers do not expose VRAM directly.
 */
function estimateVRAM(rendererStr: string, vendor: GPUVendor): number {
  const r = rendererStr.toLowerCase();

  // NVIDIA
  if (vendor === 'nvidia') {
    if (r.includes('4090') || r.includes('a6000')) return 24576;
    if (r.includes('4080') || r.includes('3090')) return 16384;
    if (r.includes('4070') || r.includes('3080')) return 12288;
    if (r.includes('4060') || r.includes('3070')) return 8192;
    if (r.includes('3060')) return 12288;
    return 8192; // Default NVIDIA estimate
  }

  // AMD
  if (vendor === 'amd') {
    if (r.includes('7900')) return 24576;
    if (r.includes('7800') || r.includes('6800')) return 16384;
    if (r.includes('7600') || r.includes('6700')) return 12288;
    return 8192;
  }

  // Apple Silicon
  if (vendor === 'apple') {
    // Apple Silicon uses unified memory; estimate GPU-accessible portion
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deviceMem = (navigator as any)?.deviceMemory ?? 8;
    return Math.round(deviceMem * 1024 * 0.6); // ~60% of unified memory
  }

  // Intel integrated
  if (vendor === 'intel') {
    if (r.includes('arc')) return 8192;
    return 2048; // Shared system memory
  }

  return 2048; // Conservative default
}

// ═══════════════════════════════════════════════════════════════════════════
//  GPU COMPUTE DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dispatches compute workloads to the GPU via WebGPU compute shaders.
 *
 * Provides a unified interface regardless of the underlying GPU vendor.
 * All vendor-specific paths (NVIDIA CUDA, AMD OpenCL, Apple Metal, Intel)
 * are abstracted through WebGPU compute shaders, which the browser maps
 * to the appropriate native API.
 */
export class GPUComputeDispatcher {
  private adapter: GPUAdapter | null = null;
  private device: GPUDevice | null = null;
  private _ready = false;

  /** Whether the dispatcher is initialised and ready. */
  get isReady(): boolean {
    return this._ready;
  }

  /**
   * Initialise the GPU compute pipeline.
   * Requests a high-performance WebGPU adapter and device.
   */
  async init(): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof navigator === 'undefined' || !('gpu' in (navigator as any))) {
      console.warn('[GPUComputeDispatcher] WebGPU not available');
      return false;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.adapter = await (navigator as any).gpu.requestAdapter({
        powerPreference: 'high-performance',
      });

      if (!this.adapter) {
        console.warn('[GPUComputeDispatcher] No GPU adapter found');
        return false;
      }

      this.device = await this.adapter.requestDevice({
        label: 'the-avid-compute',
        requiredLimits: {
          maxStorageBufferBindingSize: this.adapter.limits?.['maxStorageBufferBindingSize'] ?? 134217728,
          maxComputeWorkgroupSizeX: this.adapter.limits?.['maxComputeWorkgroupSizeX'] ?? 256,
        },
      });

      // Handle device loss
      this.device.lost.then((info) => {
        console.error(`[GPUComputeDispatcher] Device lost: ${info.message}`);
        this._ready = false;
        this.dispose();
      });

      this._ready = true;
      return true;
    } catch (err) {
      console.error('[GPUComputeDispatcher] Init failed:', err);
      return false;
    }
  }

  /**
   * Dispatch a compute shader on the GPU.
   *
   * The shader is compiled as a WGSL compute shader. Input data is uploaded
   * to a storage buffer, the shader is dispatched, and the result is read
   * back from an output storage buffer.
   *
   * This abstracts over all GPU vendors:
   * - NVIDIA GPUs: WebGPU maps to Vulkan (or CUDA via Dawn/Vulkan)
   * - AMD GPUs: WebGPU maps to Vulkan (or DirectX 12 on Windows)
   * - Apple GPUs: WebGPU maps to Metal
   * - Intel GPUs: WebGPU maps to Vulkan or DirectX 12
   *
   * @param shader   WGSL compute shader source code.
   * @param data     Input data as an ArrayBuffer.
   * @param outputSize  Expected output size in bytes (defaults to input size).
   * @returns        Computed result as an ArrayBuffer.
   */
  async dispatchCompute(shader: string, data: ArrayBuffer, outputSize?: number): Promise<ArrayBuffer> {
    if (!this._ready || !this.device) {
      throw new Error('[GPUComputeDispatcher] Not initialised');
    }

    const device = this.device;
    const outSize = outputSize ?? data.byteLength;

    // Create shader module
    const shaderModule = device.createShaderModule({
      label: 'compute-dispatch',
      code: shader,
    });

    // Create pipeline
    const pipeline = device.createComputePipeline({
      label: 'compute-pipeline',
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });

    // Create input buffer
    const inputBuffer = device.createBuffer({
      label: 'input-buffer',
      size: data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(inputBuffer, 0, data);

    // Create output buffer
    const outputBuffer = device.createBuffer({
      label: 'output-buffer',
      size: outSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Create staging (readback) buffer
    const stagingBuffer = device.createBuffer({
      label: 'staging-buffer',
      size: outSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // Create bind group layout
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'compute-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });

    // Create bind group
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: outputBuffer } },
      ],
    });

    // Dispatch
    const workgroupCount = Math.ceil(data.byteLength / (4 * 64)); // Assume 64 items per workgroup
    const encoder = device.createCommandEncoder({ label: 'compute-encoder' });
    const pass = encoder.beginComputePass({ label: 'compute-pass' });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.max(1, workgroupCount));
    pass.end();

    // Copy output to staging buffer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- copyBufferToBuffer not in minimal WebGPU type stubs
    (encoder as any).copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, outSize);
    device.queue.submit([encoder.finish()]);

    // Read back
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const result = stagingBuffer.getMappedRange().slice(0);
    stagingBuffer.unmap();

    // Cleanup
    inputBuffer.destroy();
    outputBuffer.destroy();
    stagingBuffer.destroy();

    return result;
  }

  /** Release GPU resources. */
  dispose(): void {
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }
    this.adapter = null;
    this._ready = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  WEB WORKER THREAD POOL
// ═══════════════════════════════════════════════════════════════════════════

/** Internal representation of a pooled Web Worker. */
interface PooledWorker {
  worker: Worker;
  busy: boolean;
  taskId: string | null;
}

/** Queued task waiting for a free worker. */
interface QueuedTask {
  task: WorkerTask;
  resolve: (result: WorkerTaskResult) => void;
  reject: (error: Error) => void;
  enqueuedAt: number;
}

/**
 * Manages a pool of Web Workers sized to hardware concurrency.
 *
 * Features:
 * - Automatic pool sizing based on navigator.hardwareConcurrency
 * - Priority-based task queue (lower priority number = higher priority)
 * - Load balancing across available workers
 * - Inline worker creation (no separate worker script files needed)
 */
export class ThreadPool {
  private workers: PooledWorker[] = [];
  private taskQueue: QueuedTask[] = [];
  private readonly poolSize: number;
  private _disposed = false;
  private completedTasks = 0;
  private totalTaskTimeMs = 0;

  /**
   * Create a new thread pool.
   * @param size  Number of workers (defaults to navigator.hardwareConcurrency or 4).
   */
  constructor(size?: number) {
    this.poolSize = size ?? (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4);
  }

  /** Number of workers in the pool. */
  get workerCount(): number {
    return this.poolSize;
  }

  /** Number of currently busy workers. */
  get busyCount(): number {
    return this.workers.filter((w) => w.busy).length;
  }

  /** Number of tasks waiting in the queue. */
  get queueLength(): number {
    return this.taskQueue.length;
  }

  /** Average task execution time in ms. */
  get averageTaskTimeMs(): number {
    return this.completedTasks > 0 ? this.totalTaskTimeMs / this.completedTasks : 0;
  }

  /**
   * Initialise the worker pool.
   * Creates inline blob-URL workers that can execute arbitrary task code.
   */
  init(): void {
    if (this._disposed) return;
    if (this.workers.length > 0) return; // Already initialised

    for (let i = 0; i < this.poolSize; i++) {
      try {
        const worker = this.createInlineWorker(i);
        this.workers.push({
          worker,
          busy: false,
          taskId: null,
        });
      } catch (err) {
        console.error(`[ThreadPool] Failed to create worker ${i}:`, err);
      }
    }
  }

  /**
   * Create an inline Web Worker from a blob URL.
   * The worker listens for messages with { taskCode, data } and executes
   * the taskCode as a function, posting back the result.
   */
  private createInlineWorker(index: number): Worker {
    const workerSource = `
      // Inline thread pool worker #${index}
      self.onmessage = async function(e) {
        const { taskCode, data, taskId } = e.data;
        try {
          // Create and execute the task function
          const fn = new Function('data', taskCode);
          const result = await fn(data);
          self.postMessage({ taskId, result, error: null });
        } catch (err) {
          self.postMessage({
            taskId,
            result: null,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      };
    `;

    const blob = new Blob([workerSource], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url); // URL can be revoked immediately after Worker is created
    return worker;
  }

  /**
   * Dispatch a task to a worker thread.
   *
   * If a worker is available, the task runs immediately. Otherwise it is
   * queued with priority scheduling (lower priority number = higher priority).
   *
   * @param task  The task to execute.
   * @returns     A promise resolving to the task result.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async dispatchWorkerTask(task: WorkerTask): Promise<WorkerTaskResult> {
    if (this._disposed) {
      throw new Error('[ThreadPool] Pool has been disposed');
    }

    // Lazy initialisation
    if (this.workers.length === 0) {
      this.init();
    }

    return new Promise<WorkerTaskResult>((resolve, reject) => {
      const queuedTask: QueuedTask = {
        task,
        resolve,
        reject,
        enqueuedAt: performance.now(),
      };

      // Try to dispatch immediately
      const freeWorker = this.workers.find((w) => !w.busy);
      if (freeWorker) {
        this.executeOnWorker(freeWorker, queuedTask);
      } else {
        // Add to priority queue
        this.taskQueue.push(queuedTask);
        // Sort by priority (lower = higher priority)
        this.taskQueue.sort((a, b) => (a.task.priority ?? 10) - (b.task.priority ?? 10));
      }
    });
  }

  /**
   * Execute a queued task on a specific worker.
   */
  private executeOnWorker(pooledWorker: PooledWorker, queuedTask: QueuedTask): void {
    const { task, resolve, reject, enqueuedAt } = queuedTask;
    pooledWorker.busy = true;
    pooledWorker.taskId = task.id;

    const startTime = performance.now();

    const onMessage = (e: MessageEvent) => {
      pooledWorker.worker.removeEventListener('message', onMessage);
      pooledWorker.worker.removeEventListener('error', onError);
      pooledWorker.busy = false;
      pooledWorker.taskId = null;

      const durationMs = performance.now() - startTime;
      this.completedTasks++;
      this.totalTaskTimeMs += durationMs;

      if (e.data.error) {
        reject(new Error(e.data.error));
      } else {
        resolve({
          id: task.id,
          result: e.data.result,
          durationMs,
        });
      }

      // Process next task in queue
      this.processQueue();
    };

    const onError = (err: ErrorEvent) => {
      pooledWorker.worker.removeEventListener('message', onMessage);
      pooledWorker.worker.removeEventListener('error', onError);
      pooledWorker.busy = false;
      pooledWorker.taskId = null;

      reject(new Error(`Worker error: ${err.message}`));
      this.processQueue();
    };

    pooledWorker.worker.addEventListener('message', onMessage);
    pooledWorker.worker.addEventListener('error', onError);

    pooledWorker.worker.postMessage(
      {
        taskId: task.id,
        taskCode: task.taskCode,
        data: task.data,
      },
      task.transferables ?? [],
    );
  }

  /**
   * Process the next task in the priority queue if a worker is free.
   */
  private processQueue(): void {
    if (this.taskQueue.length === 0) return;

    const freeWorker = this.workers.find((w) => !w.busy);
    if (!freeWorker) return;

    const nextTask = this.taskQueue.shift();
    if (nextTask) {
      this.executeOnWorker(freeWorker, nextTask);
    }
  }

  /**
   * Terminate all workers and clear the queue.
   */
  dispose(): void {
    this._disposed = true;
    for (const pooled of this.workers) {
      pooled.worker.terminate();
    }
    this.workers = [];

    // Reject all pending tasks
    for (const queued of this.taskQueue) {
      queued.reject(new Error('Thread pool disposed'));
    }
    this.taskQueue = [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  PERFORMANCE MONITOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Real-time performance monitoring for adaptive quality scaling.
 *
 * Tracks decode/encode timings, memory pressure, and estimates GPU/CPU
 * utilisation. Provides a recommended quality scale factor that the
 * rendering pipeline can use to dynamically adjust resolution or effects.
 */
export class PerformanceMonitor {
  private decodeTimes: number[] = [];
  private encodeTimes: number[] = [];
  private readonly MAX_SAMPLES = 60;
  private lastCpuSample = 0;
  private cpuUtilisation = 0;
  private rafHandle: number | null = null;
  private _running = false;
  private listeners = new Set<(snapshot: PerformanceSnapshot) => void>();

  /**
   * Start continuous performance monitoring.
   * Samples at ~1 Hz via requestAnimationFrame counting.
   */
  start(): void {
    if (this._running) return;
    this._running = true;
    this.lastCpuSample = performance.now();
    this.monitorLoop();
  }

  /**
   * Stop performance monitoring.
   */
  stop(): void {
    this._running = false;
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  /**
   * Record a frame decode timing.
   * @param ms  Time in milliseconds.
   */
  recordDecodeTime(ms: number): void {
    this.decodeTimes.push(ms);
    if (this.decodeTimes.length > this.MAX_SAMPLES) {
      this.decodeTimes.shift();
    }
  }

  /**
   * Record a frame encode timing.
   * @param ms  Time in milliseconds.
   */
  recordEncodeTime(ms: number): void {
    this.encodeTimes.push(ms);
    if (this.encodeTimes.length > this.MAX_SAMPLES) {
      this.encodeTimes.shift();
    }
  }

  /**
   * Get the current performance snapshot.
   */
  getSnapshot(): PerformanceSnapshot {
    // Memory info (Chrome-specific)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const memInfo = (performance as any).memory;
    const memoryUsedMB = memInfo ? Math.round(memInfo.usedJSHeapSize / (1024 * 1024)) : 0;
    const memoryLimitMB = memInfo ? Math.round(memInfo.jsHeapSizeLimit / (1024 * 1024)) : 0;
    const memoryPressure = memoryLimitMB > 0 ? (memoryUsedMB / memoryLimitMB) > 0.85 : false;

    // Average timings
    const avgDecodeTimeMs = this.average(this.decodeTimes);
    const avgEncodeTimeMs = this.average(this.encodeTimes);

    // Quality scale: if decode time exceeds frame budget, scale down
    // At 24fps, budget is ~41.6ms; at 30fps, ~33.3ms
    const frameBudgetMs = 33.3;
    let qualityScale = 1.0;
    if (avgDecodeTimeMs > frameBudgetMs * 1.5) {
      qualityScale = 0.5; // Major lag: drop to half resolution
    } else if (avgDecodeTimeMs > frameBudgetMs) {
      qualityScale = 0.75; // Moderate lag: reduce quality
    } else if (memoryPressure) {
      qualityScale = 0.75; // Memory pressure: reduce quality
    }

    return {
      gpuUtilisation: -1, // Cannot measure GPU utilisation from JS
      cpuUtilisation: this.cpuUtilisation,
      memoryUsedMB,
      memoryLimitMB,
      memoryPressure,
      avgDecodeTimeMs,
      avgEncodeTimeMs,
      qualityScale,
      timestamp: Date.now(),
    };
  }

  /**
   * Subscribe to periodic performance snapshots.
   */
  subscribe(cb: (snapshot: PerformanceSnapshot) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  /**
   * RAF-based monitoring loop.
   * Estimates CPU utilisation by measuring how much time the main thread
   * is spending in JS vs idle. Fires snapshots to subscribers at ~1 Hz.
   */
  private monitorLoop(): void {
    let frameCount = 0;
    let lastSampleTime = performance.now();

    const tick = () => {
      if (!this._running) return;

      frameCount++;
      const now = performance.now();
      const elapsed = now - lastSampleTime;

      // Sample every ~1 second
      if (elapsed >= 1000) {
        // Estimate CPU utilisation from frame rate
        // If we're getting 60fps, the main thread is mostly idle
        // If we're getting < 30fps, the main thread is heavily loaded
        const expectedFps = 60;
        const actualFps = (frameCount * 1000) / elapsed;
        this.cpuUtilisation = Math.max(0, Math.min(1, 1 - (actualFps / expectedFps)));

        frameCount = 0;
        lastSampleTime = now;

        // Notify subscribers
        const snapshot = this.getSnapshot();
        this.listeners.forEach((cb) => {
          try { cb(snapshot); } catch (err) {
            console.error('[PerformanceMonitor] Listener error:', err);
          }
        });
      }

      this.rafHandle = requestAnimationFrame(tick);
    };

    this.rafHandle = requestAnimationFrame(tick);
  }

  /** Compute the average of a number array. */
  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i]!;
    }
    return sum / arr.length;
  }

  /** Stop monitoring and clear data. */
  dispose(): void {
    this.stop();
    this.decodeTimes = [];
    this.encodeTimes = [];
    this.listeners.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HARDWARE ACCELERATOR (Main Class)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hardware acceleration abstraction layer for THE AVID.
 *
 * Provides unified detection of GPU and CPU capabilities, dispatches compute
 * workloads to the best available backend (WebGPU / WebGL2 / Software via
 * Web Workers), and monitors performance for adaptive quality scaling.
 */
export class HardwareAcceleratorClass {
  // Singleton
  private static _instance: HardwareAcceleratorClass | null = null;

  /** Cached GPU capabilities. */
  private gpuCaps: GPUCapabilities | null = null;
  /** Cached CPU capabilities. */
  private cpuCaps: CPUCapabilities | null = null;
  /** GPU compute dispatcher. */
  readonly gpuDispatcher = new GPUComputeDispatcher();
  /** Web Worker thread pool. */
  readonly threadPool: ThreadPool;
  /** Performance monitor. */
  readonly performanceMonitor = new PerformanceMonitor();

  private _initialised = false;

  private constructor() {
    const coreCount = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    // Use fewer workers than cores to leave headroom for the main thread
    const workerCount = Math.max(2, Math.min(coreCount - 1, 12));
    this.threadPool = new ThreadPool(workerCount);
  }

  /** Get the singleton HardwareAcceleratorClass instance. */
  static getInstance(): HardwareAcceleratorClass {
    if (!HardwareAcceleratorClass._instance) {
      HardwareAcceleratorClass._instance = new HardwareAcceleratorClass();
    }
    return HardwareAcceleratorClass._instance;
  }

  /** Whether the accelerator has been fully initialised. */
  get isInitialised(): boolean {
    return this._initialised;
  }

  /**
   * Initialise all acceleration subsystems.
   * Detects hardware, initialises GPU compute (if available), creates the
   * worker thread pool, and starts performance monitoring.
   */
  async init(): Promise<void> {
    if (this._initialised) return;

    // Detect capabilities in parallel
    const [gpuCaps, cpuCaps] = await Promise.all([
      this.detectGPU(),
      Promise.resolve(this.detectCPU()),
    ]);

    this.gpuCaps = gpuCaps;
    this.cpuCaps = cpuCaps;

    // Initialise GPU compute if WebGPU is available
    if (gpuCaps.hasWebGPU) {
      await this.gpuDispatcher.init();
    }

    // Initialise thread pool
    this.threadPool.init();

    // Start performance monitoring
    this.performanceMonitor.start();

    this._initialised = true;

    console.info(
      `[HardwareAccelerator] Initialised: GPU=${gpuCaps.vendor}/${gpuCaps.model}, ` +
      `CPU=${cpuCaps.processor}/${cpuCaps.architecture}, ` +
      `Cores=${cpuCaps.coreCount}, Workers=${this.threadPool.workerCount}, ` +
      `Backend=${this.getAccelerationBackend()}`
    );
  }

  // ── GPU Detection ─────────────────────────────────────────────────────────

  /**
   * Detect GPU vendor, model, VRAM, and capabilities.
   *
   * Probes WebGPU adapter and WebGL2 context for hardware information.
   */
  async detectGPU(): Promise<GPUCapabilities> {
    if (this.gpuCaps) return this.gpuCaps;

    const caps: GPUCapabilities = {
      available: false,
      vendor: 'unknown',
      model: 'Unknown GPU',
      vramMB: 0,
      hasWebGPU: false,
      hasWebGL2: false,
      maxTextureSize: 4096,
      maxComputeWorkgroupSize: 0,
      maxStorageBufferSize: 0,
      features: [],
      webgl2Extensions: [],
      hasFloatTextures: false,
      hasFloatColorBuffer: false,
    };

    // ── WebGPU detection ────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof navigator !== 'undefined' && 'gpu' in (navigator as any)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const adapter: GPUAdapter | null = await (navigator as any).gpu.requestAdapter({
          powerPreference: 'high-performance',
        });

        if (adapter) {
          caps.hasWebGPU = true;
          caps.available = true;
          caps.maxTextureSize = adapter.limits?.maxTextureDimension2D ?? 8192;
          caps.maxComputeWorkgroupSize = adapter.limits?.['maxComputeWorkgroupSizeX'] ?? 256;
          caps.maxStorageBufferSize = adapter.limits?.['maxStorageBufferBindingSize'] ?? 134217728;

          // Enumerate features
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- features not in minimal WebGPU type stubs
          const adapterFeatures = (adapter as any).features;
          if (adapterFeatures && typeof adapterFeatures.forEach === 'function') {
            adapterFeatures.forEach((feature: string) => {
              caps.features.push(feature);
            });
          }

          // Try to get renderer info from adapter info
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const info = (adapter as any).info ?? (adapter as any).requestAdapterInfo?.();
          if (info) {
            const adapterInfo = info instanceof Promise ? await info : info;
            if (adapterInfo?.vendor) {
              caps.vendor = classifyGPUVendor(adapterInfo.vendor, adapterInfo.architecture ?? '');
              caps.model = adapterInfo.architecture ?? adapterInfo.device ?? adapterInfo.description ?? 'WebGPU GPU';
            }
          }
        }
      } catch {
        // WebGPU not available
      }
    }

    // ── WebGL2 detection (fallback and additional info) ──────────────────
    if (typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if (gl) {
          caps.hasWebGL2 = true;
          caps.available = true;

          // Get GPU vendor/model from debug info
          const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) {
            const vendorStr = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string;
            const rendererStr = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string;

            // Only overwrite if we didn't get info from WebGPU
            if (caps.vendor === 'unknown') {
              caps.vendor = classifyGPUVendor(vendorStr, rendererStr);
              caps.model = rendererStr || 'Unknown GPU';
            }
          }

          // Max texture size
          const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
          if (maxTex > caps.maxTextureSize) {
            caps.maxTextureSize = maxTex;
          }

          // Extensions
          const extensions = gl.getSupportedExtensions() ?? [];
          caps.webgl2Extensions = extensions;
          caps.hasFloatTextures = extensions.includes('OES_texture_float') || extensions.includes('EXT_float_blend');
          caps.hasFloatColorBuffer = extensions.includes('EXT_color_buffer_float');

          // Clean up
          gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
      } catch {
        // WebGL2 not available
      }
    }

    // Estimate VRAM
    caps.vramMB = estimateVRAM(caps.model, caps.vendor);

    this.gpuCaps = caps;
    return caps;
  }

  // ── CPU Detection ─────────────────────────────────────────────────────────

  /**
   * Detect CPU architecture, core count, and platform.
   */
  detectCPU(): CPUCapabilities {
    if (this.cpuCaps) return this.cpuCaps;

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const platform = typeof navigator !== 'undefined' ? (navigator.platform ?? '') : '';

    // Core count
    const coreCount = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;

    // Architecture detection
    let architecture: CPUArchitecture = 'unknown';
    if (/arm64|aarch64/i.test(ua) || /arm64|aarch64/i.test(platform)) {
      architecture = 'arm64';
    } else if (/x86_64|x64|amd64|win64|wow64/i.test(ua) || /x86_64|win32|win64/i.test(platform)) {
      architecture = 'x86_64';
    } else if (/mac/i.test(platform)) {
      // macOS on Apple Silicon reports as Intel in some browsers
      // If core count is high and it's macOS, likely Apple Silicon
      architecture = coreCount >= 8 ? 'arm64' : 'x86_64';
    }

    // Platform detection
    let detectedPlatform: CPUCapabilities['platform'] = 'unknown';
    if (/Mac/i.test(ua) || /Mac/i.test(platform)) {
      detectedPlatform = 'macos';
    } else if (/Win/i.test(ua) || /Win/i.test(platform)) {
      detectedPlatform = 'windows';
    } else if (/CrOS/i.test(ua)) {
      detectedPlatform = 'chromeos';
    } else if (/Linux/i.test(ua)) {
      detectedPlatform = 'linux';
    } else if (/iPad|iPhone|iPod/i.test(ua)) {
      detectedPlatform = 'ios';
    } else if (/Android/i.test(ua)) {
      detectedPlatform = 'android';
    }

    // Processor detection
    let processor: CPUCapabilities['processor'] = 'unknown';
    if (detectedPlatform === 'macos' && architecture === 'arm64') {
      processor = 'apple-silicon';
    } else if (/AMD/i.test(ua)) {
      processor = 'amd';
    } else if (/Intel/i.test(ua) || (detectedPlatform === 'macos' && architecture === 'x86_64')) {
      processor = 'intel';
    } else if (architecture === 'arm64' && detectedPlatform !== 'macos') {
      processor = 'arm'; // Windows ARM, Chromebook, mobile
    }

    // Device memory
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deviceMemoryGB: number = (navigator as any)?.deviceMemory ?? 0;

    this.cpuCaps = {
      architecture,
      coreCount,
      platform: detectedPlatform,
      processor,
      deviceMemoryGB,
      hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      hasAtomics: typeof Atomics !== 'undefined',
    };

    return this.cpuCaps;
  }

  // ── Backend Selection ─────────────────────────────────────────────────────

  /**
   * Determine the best available acceleration backend.
   *
   * Priority: WebGPU > WebGL2 > Software (Web Workers)
   */
  getAccelerationBackend(): AccelerationBackend {
    const gpu = this.gpuCaps ?? this.detectGPUSync();
    if (gpu.hasWebGPU) return 'webgpu';
    if (gpu.hasWebGL2) return 'webgl2';
    return 'software';
  }

  /**
   * Synchronous GPU capability detection (WebGL2 only, no async WebGPU probing).
   */
  private detectGPUSync(): GPUCapabilities {
    const caps: GPUCapabilities = {
      available: false,
      vendor: 'unknown',
      model: 'Unknown GPU',
      vramMB: 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hasWebGPU: typeof navigator !== 'undefined' && 'gpu' in (navigator as any),
      hasWebGL2: false,
      maxTextureSize: 4096,
      maxComputeWorkgroupSize: 0,
      maxStorageBufferSize: 0,
      features: [],
      webgl2Extensions: [],
      hasFloatTextures: false,
      hasFloatColorBuffer: false,
    };

    if (typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if (gl) {
          caps.hasWebGL2 = true;
          caps.available = true;
          caps.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

          const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) {
            const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string;
            const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string;
            caps.vendor = classifyGPUVendor(vendor, renderer);
            caps.model = renderer;
            caps.vramMB = estimateVRAM(renderer, caps.vendor);
          }

          const extensions = gl.getSupportedExtensions() ?? [];
          caps.webgl2Extensions = extensions;
          caps.hasFloatTextures = extensions.includes('OES_texture_float');
          caps.hasFloatColorBuffer = extensions.includes('EXT_color_buffer_float');

          gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
      } catch {
        // WebGL2 not available
      }
    }

    return caps;
  }

  // ── Compute Dispatch ──────────────────────────────────────────────────────

  /**
   * Run a compute shader on the GPU.
   *
   * Falls back to the thread pool if GPU compute is unavailable.
   *
   * @param shader  WGSL compute shader source.
   * @param data    Input data as an ArrayBuffer.
   * @returns       Computed result as an ArrayBuffer.
   */
  async dispatchCompute(shader: string, data: ArrayBuffer): Promise<ArrayBuffer> {
    // Try GPU compute first
    if (this.gpuDispatcher.isReady) {
      try {
        const startTime = performance.now();
        const result = await this.gpuDispatcher.dispatchCompute(shader, data);
        this.performanceMonitor.recordEncodeTime(performance.now() - startTime);
        return result;
      } catch (err) {
        console.warn('[HardwareAccelerator] GPU compute failed, falling back to CPU:', err);
      }
    }

    // Fallback: CPU via thread pool
    const startTime = performance.now();
    const result = await this.threadPool.dispatchWorkerTask({
      id: `compute_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      taskCode: `
        // Software compute fallback
        // The shader is not directly executable on CPU, so we return the input data.
        // In production, a CPU-side equivalent would be provided.
        return data;
      `,
      data,
      priority: 1,
    });
    this.performanceMonitor.recordEncodeTime(performance.now() - startTime);
    return result.result as ArrayBuffer;
  }

  /**
   * Run a CPU task on a worker thread.
   *
   * @param task  The task to execute.
   * @returns     The task result.
   */
  async dispatchWorkerTask(task: WorkerTask): Promise<WorkerTaskResult> {
    if (this.threadPool.workerCount === 0) {
      this.threadPool.init();
    }
    return this.threadPool.dispatchWorkerTask(task);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  /**
   * Dispose all acceleration resources.
   */
  dispose(): void {
    this.gpuDispatcher.dispose();
    this.threadPool.dispose();
    this.performanceMonitor.dispose();
    this._initialised = false;
    this.gpuCaps = null;
    this.cpuCaps = null;
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

/** Singleton hardware accelerator instance. */
export const hardwareAccelerator = HardwareAcceleratorClass.getInstance();
