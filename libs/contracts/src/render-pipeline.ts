/**
 * @module render-pipeline
 *
 * Types for the distributed render pipeline. Render jobs are created by
 * the agent orchestrator or publish connectors, queued in a priority queue,
 * assigned to render farm nodes, and tracked through completion.
 *
 * The render agent reports progress via events and the coordinator manages
 * job distribution, retry logic, and result collection.
 */

import type { DeliverySpec } from './publish-variants';

// -- Job types ---------------------------------------------------------------

/**
 * The type of render work to perform.
 * - `encode`     -- encode raw media to a delivery format
 * - `transcode`  -- convert between codecs/containers
 * - `effects`    -- render effects/composites on timeline segments
 * - `composite`  -- final composite assembly
 */
export type RenderJobType = 'encode' | 'transcode' | 'effects' | 'composite';

/**
 * Lifecycle status of a render job.
 * - `queued`     -- waiting in the priority queue
 * - `assigned`   -- claimed by a render node but not yet started
 * - `rendering`  -- actively processing frames
 * - `completed`  -- all frames rendered successfully
 * - `failed`     -- rendering failed (may be retried)
 * - `cancelled`  -- cancelled by user or system
 */
export type RenderJobStatus =
  | 'queued'
  | 'assigned'
  | 'rendering'
  | 'completed'
  | 'failed'
  | 'cancelled';

// -- Render Job ---------------------------------------------------------------

/**
 * A single render job in the distributed pipeline.
 *
 * Jobs are the atomic unit of work distributed to render nodes.
 * Large sequences are typically split into frame-range chunks that
 * can be processed in parallel across multiple nodes.
 */
export interface RenderJob {
  /** Unique job identifier. */
  readonly id: string;
  /** Source sequence this job renders from. */
  readonly sequenceId: string;
  /** Type of render work. */
  readonly type: RenderJobType;
  /** Priority level (0 = lowest, 100 = highest). */
  readonly priority: number;
  /** Current lifecycle status. */
  readonly status: RenderJobStatus;
  /** Output delivery specification, if applicable. */
  readonly deliverySpec: DeliverySpec | null;
  /** First frame to render (inclusive). */
  readonly startFrame: number;
  /** Last frame to render (inclusive). */
  readonly endFrame: number;
  /** Render node ID this job is assigned to, or `null` if queued. */
  readonly assignedNodeId: string | null;
  /** Render progress from 0 to 100. */
  readonly progress: number;
  /** ISO 8601 timestamp when the job was created. */
  readonly createdAt: string;
  /** ISO 8601 timestamp when rendering started, or `null`. */
  readonly startedAt: string | null;
  /** ISO 8601 timestamp when rendering completed, or `null`. */
  readonly completedAt: string | null;
  /** Output file URI once completed, or `null`. */
  readonly outputUri: string | null;
  /** Error message if failed, or `null`. */
  readonly error: string | null;
  /** Number of times this job has been retried. */
  readonly retryCount: number;
  /** Maximum number of retries allowed. */
  readonly maxRetries: number;
  /** Source color space of the input media for this job. */
  readonly sourceColorSpace?: string;
  /** Target/output color space for this render. */
  readonly outputColorSpace?: string;
  /** Whether HDR-to-SDR tone mapping is required. */
  readonly toneMapRequired?: boolean;
  /** Preferred hardware acceleration API (auto-detected or user-specified). */
  readonly hwAccel?: 'nvenc' | 'videotoolbox' | 'amf' | 'qsv' | 'vaapi' | 'mediacodec' | 'auto' | null;
}

// -- Render Node Info --------------------------------------------------------

/**
 * Hardware and status information for a render farm node.
 */
export interface RenderNodeInfo {
  /** Unique node identifier. */
  readonly nodeId: string;
  /** Hostname or IP address. */
  readonly hostname: string;
  /** GPU vendor (e.g. "NVIDIA", "AMD", "Apple"). */
  readonly gpuVendor: string;
  /** GPU model name. */
  readonly gpuName: string;
  /** GPU VRAM in megabytes. */
  readonly vramMB: number;
  /** Number of CPU cores. */
  readonly cpuCores: number;
  /** System memory in gigabytes. */
  readonly memoryGB: number;
  /** Current node status. */
  readonly status: 'idle' | 'busy' | 'offline' | 'error';
  /** ID of the currently assigned job, or `null`. */
  readonly currentJobId: string | null;
  /** Current job progress (0-100). */
  readonly progress: number;
  /** ISO 8601 timestamp of last heartbeat. */
  readonly lastHeartbeat: string;
  /** Supported render job types. */
  readonly capabilities: readonly RenderJobType[];
  /** Hardware acceleration API available on this node. */
  readonly hwAccelAPI?: 'nvenc' | 'videotoolbox' | 'amf' | 'qsv' | 'vaapi' | 'mediacodec' | 'none';
  /** CPU architecture of the render node. */
  readonly cpuArch?: 'x64' | 'arm64' | 'ia32';
  /** Supported hardware-accelerated encoders. */
  readonly hwEncoders?: readonly string[];
  /** Supported hardware-accelerated decoders. */
  readonly hwDecoders?: readonly string[];
}

// -- Progress report ---------------------------------------------------------

/**
 * A progress update sent from a render node to the coordinator.
 */
export interface RenderProgress {
  /** Job this progress report belongs to. */
  readonly jobId: string;
  /** Node processing the job. */
  readonly nodeId: string;
  /** Overall progress from 0 to 100. */
  readonly progress: number;
  /** Current frame being rendered. */
  readonly currentFrame: number;
  /** Total frames in the job. */
  readonly totalFrames: number;
  /** Frames per second rendering rate. */
  readonly fps: number;
  /** Estimated time to completion in ISO 8601 duration, or `null`. */
  readonly eta: string | null;
  /** ISO 8601 timestamp of this report. */
  readonly timestamp: string;
}

// -- Queue statistics --------------------------------------------------------

/**
 * Aggregate statistics for the render job queue.
 */
export interface RenderQueueStats {
  /** Number of jobs currently queued. */
  readonly queued: number;
  /** Number of jobs currently rendering. */
  readonly rendering: number;
  /** Number of jobs completed in the current session. */
  readonly completed: number;
  /** Number of jobs that failed in the current session. */
  readonly failed: number;
  /** Number of online render nodes. */
  readonly nodesOnline: number;
  /** Number of busy render nodes. */
  readonly nodesBusy: number;
  /** Average render speed in fps across all active jobs. */
  readonly avgFps: number;
  /** Estimated total time to drain the queue in seconds, or `null`. */
  readonly estimatedDrainTimeSec: number | null;
}
