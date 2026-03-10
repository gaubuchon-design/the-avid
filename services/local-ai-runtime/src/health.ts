/**
 * @module health
 *
 * Health-check and lightweight benchmarking utilities for the local AI
 * runtime service.
 */

import type { IModelBackend, ModelCapability } from './ModelRunner';
import type { ModelRegistry } from './ModelRegistry';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Backend availability snapshot. */
export interface BackendStatus {
  readonly name: string;
  readonly available: boolean;
  readonly supportedCapabilities: readonly ModelCapability[];
  readonly loadedModels: string[];
}

/** Overall health information returned by the `/health` endpoint. */
export interface HealthInfo {
  /** Service status — "ok" when at least one backend is available. */
  readonly status: 'ok' | 'degraded' | 'unavailable';
  /** Service name. */
  readonly service: string;
  /** Service version. */
  readonly version: string;
  /** Server uptime in seconds. */
  readonly uptime: number;
  /** Per-backend availability. */
  readonly backends: readonly BackendStatus[];
  /** Total number of models in the registry. */
  readonly registeredModels: number;
  /** Process memory usage snapshot. */
  readonly memory: MemorySnapshot;
  /** Node.js runtime version. */
  readonly nodeVersion: string;
  /** Host platform. */
  readonly platform: string;
  /** Host architecture. */
  readonly arch: string;
}

/** Process memory usage in bytes. */
export interface MemorySnapshot {
  readonly heapUsed: number;
  readonly heapTotal: number;
  readonly rss: number;
  readonly external: number;
}

/** Result of a quick capability benchmark. */
export interface BenchmarkResult {
  /** Capability that was benchmarked. */
  readonly capability: ModelCapability;
  /** Model used. */
  readonly modelId: string;
  /** Backend used. */
  readonly backend: string;
  /** Number of iterations run. */
  readonly iterations: number;
  /** Average latency in milliseconds. */
  readonly avgLatencyMs: number;
  /** Minimum latency in milliseconds. */
  readonly minLatencyMs: number;
  /** Maximum latency in milliseconds. */
  readonly maxLatencyMs: number;
  /** 95th percentile latency in milliseconds. */
  readonly p95LatencyMs: number;
}

// ---------------------------------------------------------------------------
// getHealthInfo
// ---------------------------------------------------------------------------

/**
 * Collect health information from all registered backends and the model
 * registry.
 *
 * @param serviceName - The service display name.
 * @param version     - The service version string.
 * @param backends    - All registered backend instances.
 * @param registry    - The model registry.
 */
export async function getHealthInfo(
  serviceName: string,
  version: string,
  backends: readonly IModelBackend[],
  registry: ModelRegistry,
): Promise<HealthInfo> {
  const backendStatuses: BackendStatus[] = await Promise.all(
    backends.map(async (b) => ({
      name: b.name,
      available: await b.isAvailable(),
      supportedCapabilities: b.supportedCapabilities,
      loadedModels: b.getLoadedModels(),
    })),
  );

  const availableCount = backendStatuses.filter((b) => b.available).length;
  const totalCount = backendStatuses.length;

  // Determine status: ok if all available, degraded if some, unavailable if none
  let status: 'ok' | 'degraded' | 'unavailable';
  if (availableCount === 0) {
    status = 'unavailable';
  } else if (availableCount < totalCount) {
    status = 'degraded';
  } else {
    status = 'ok';
  }

  const mem = process.memoryUsage();

  return {
    status,
    service: serviceName,
    version,
    uptime: process.uptime(),
    backends: backendStatuses,
    registeredModels: registry.listAll().length,
    memory: {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
      external: mem.external,
    },
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  };
}

// ---------------------------------------------------------------------------
// runBenchmark
// ---------------------------------------------------------------------------

/** Number of warm-up and measured iterations. */
const WARMUP_ITERATIONS = 2;
const MEASURED_ITERATIONS = 10;

/**
 * Run a quick latency benchmark for a given capability.
 *
 * The function resolves the best model for the capability, runs several
 * warm-up iterations (discarded), then collects latency samples and
 * returns aggregate statistics.
 *
 * @param capability - The capability to benchmark.
 * @param registry   - Model registry for model selection.
 * @param backend    - Backend to benchmark against.
 */
export async function runBenchmark(
  capability: ModelCapability,
  registry: ModelRegistry,
  backend: IModelBackend,
): Promise<BenchmarkResult> {
  const model = registry.findBest(capability);
  if (!model) {
    throw new Error(`No model registered for capability "${capability}".`);
  }

  const request = buildBenchmarkRequest(capability, model.id);

  // Warm-up
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    await backend.execute(request);
  }

  // Measure
  const latencies: number[] = [];
  for (let i = 0; i < MEASURED_ITERATIONS; i++) {
    const t0 = performance.now();
    await backend.execute(request);
    latencies.push(performance.now() - t0);
  }

  latencies.sort((a, b) => a - b);

  const sum = latencies.reduce((s, v) => s + v, 0);
  const p95Index = Math.min(
    Math.ceil(latencies.length * 0.95) - 1,
    latencies.length - 1,
  );

  return {
    capability,
    modelId: model.id,
    backend: backend.name,
    iterations: MEASURED_ITERATIONS,
    avgLatencyMs: round(sum / latencies.length),
    minLatencyMs: round(latencies[0] ?? 0),
    maxLatencyMs: round(latencies[latencies.length - 1] ?? 0),
    p95LatencyMs: round(latencies[p95Index] ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Build a minimal request payload suitable for benchmarking. */
function buildBenchmarkRequest(capability: ModelCapability, modelId: string) {
  const base = { modelId, capability } as const;

  switch (capability) {
    case 'embedding':
      return { ...base, input: { embeddingTexts: ['benchmark test string'] } };
    case 'stt':
      return { ...base, input: { audioPath: '/dev/null' } };
    case 'translation':
      return {
        ...base,
        input: { text: 'Benchmark test string.', sourceLanguage: 'en', targetLanguage: 'fr' },
      };
    case 'text-generation':
      return { ...base, input: { text: 'Hello, this is a benchmark prompt.' } };
    case 'vision':
      return { ...base, input: { imagePath: '/dev/null' } };
    case 'semantic-analysis':
      return { ...base, input: { text: 'Benchmark content for semantic analysis.' } };
    case 'query-rewrite':
      return { ...base, input: { text: 'find recent clips about sports' } };
  }
}
