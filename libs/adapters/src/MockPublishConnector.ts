/**
 * @fileoverview In-memory mock of {@link IPublishConnector}.
 *
 * Simulates the full publish lifecycle with status transitions:
 *
 *   draft -> rendering -> ready -> publishing -> published
 *
 * Each transition is driven by an internal timer so that callers polling
 * `getPublishStatus()` observe realistic progression.
 */

import type {
  DeliverySpec,
  PublishPlatform,
  PublishStatus,
  PublishVariant,
} from './contracts-types';
import { ConflictError, NotFoundError } from './AdapterError';
import type {
  IPublishConnector,
  PlatformCapabilities,
  PublishResult,
  PublishStatusInfo,
  ValidationIssue,
  ValidationResult,
} from './IPublishConnector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _nextId = 8000;
function nextId(prefix: string): string {
  return `${prefix}_${++_nextId}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Internal job state
// ---------------------------------------------------------------------------

interface PublishJob {
  jobId: string;
  variant: PublishVariant;
  status: PublishStatus;
  progress: number;
  publicUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Platform definitions
// ---------------------------------------------------------------------------

const PLATFORM_CAPS: PlatformCapabilities[] = [
  {
    platform: 'youtube',
    displayName: 'YouTube',
    supportedFormats: ['mp4', 'mov', 'webm'],
    maxFileSizeBytes: 256 * 1024 * 1024 * 1024, // 256 GB
    maxDurationSeconds: 12 * 60 * 60,
    supportedResolutions: [
      { width: 3840, height: 2160 },
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
    ],
    supportsScheduling: true,
    supportsCaptions: true,
  },
  {
    platform: 'facebook',
    displayName: 'Facebook / Meta',
    supportedFormats: ['mp4', 'mov'],
    maxFileSizeBytes: 10 * 1024 * 1024 * 1024,
    maxDurationSeconds: 240 * 60,
    supportedResolutions: [
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
    ],
    supportsScheduling: true,
    supportsCaptions: true,
  },
  {
    platform: 'instagram',
    displayName: 'Instagram Reels',
    supportedFormats: ['mp4'],
    maxFileSizeBytes: 4 * 1024 * 1024 * 1024,
    maxDurationSeconds: 90 * 60,
    supportedResolutions: [
      { width: 1080, height: 1920 },
      { width: 1080, height: 1080 },
    ],
    supportsScheduling: true,
    supportsCaptions: false,
  },
  {
    platform: 'tiktok',
    displayName: 'TikTok',
    supportedFormats: ['mp4'],
    maxFileSizeBytes: 4 * 1024 * 1024 * 1024,
    maxDurationSeconds: 10 * 60,
    supportedResolutions: [
      { width: 1080, height: 1920 },
    ],
    supportsScheduling: false,
    supportsCaptions: false,
  },
  {
    platform: 'broadcast',
    displayName: 'Broadcast Playout',
    supportedFormats: ['mxf', 'mov'],
    maxFileSizeBytes: 500 * 1024 * 1024 * 1024,
    maxDurationSeconds: 24 * 60 * 60,
    supportedResolutions: [
      { width: 1920, height: 1080 },
      { width: 3840, height: 2160 },
    ],
    supportsScheduling: true,
    supportsCaptions: true,
  },
  {
    platform: 'ott',
    displayName: 'OTT / Streaming',
    supportedFormats: ['mp4', 'mov', 'mxf'],
    maxFileSizeBytes: 100 * 1024 * 1024 * 1024,
    maxDurationSeconds: 6 * 60 * 60,
    supportedResolutions: [
      { width: 3840, height: 2160 },
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
    ],
    supportsScheduling: true,
    supportsCaptions: true,
  },
];

const PLATFORM_MAP = new Map<string, PlatformCapabilities>(
  PLATFORM_CAPS.map((p) => [p.platform, p]),
);

// ---------------------------------------------------------------------------
// Public URL generators (fake)
// ---------------------------------------------------------------------------

function fakePublicUrl(platform: PublishPlatform, jobId: string): string {
  switch (platform) {
    case 'youtube':
      return `https://youtube.com/watch?v=mock_${jobId}`;
    case 'facebook':
      return `https://facebook.com/watch/?v=mock_${jobId}`;
    case 'instagram':
      return `https://instagram.com/reel/mock_${jobId}`;
    case 'tiktok':
      return `https://tiktok.com/@newsorg/video/mock_${jobId}`;
    case 'broadcast':
      return `playout://channel-a/schedule/${jobId}`;
    case 'ott':
      return `https://streaming.newsorg.com/v/mock_${jobId}`;
    default:
      return `https://example.com/published/mock_${jobId}`;
  }
}

// ---------------------------------------------------------------------------
// Mock connector
// ---------------------------------------------------------------------------

/**
 * In-memory mock of {@link IPublishConnector}.
 *
 * Publish jobs advance through lifecycle states on internal timers so that
 * polling `getPublishStatus` returns progressively updated data.
 */
export class MockPublishConnector implements IPublishConnector {
  private readonly jobs: Map<string, PublishJob> = new Map();

  // -----------------------------------------------------------------------
  // IPublishConnector
  // -----------------------------------------------------------------------

  async publish(variant: PublishVariant): Promise<PublishResult> {
    const jobId = nextId('pub');
    const now = isoNow();

    const job: PublishJob = {
      jobId,
      variant: { ...variant },
      status: 'draft',
      progress: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.set(jobId, job);

    // Kick off the simulated lifecycle
    this.advanceJob(job);

    return {
      jobId,
      platform: variant.platform,
      status: job.status,
      estimatedSeconds: 8,
      createdAt: now,
    };
  }

  async getPublishStatus(jobId: string): Promise<PublishStatusInfo> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new NotFoundError('publish', 'PublishJob', jobId);
    }

    return {
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      publicUrl: job.publicUrl,
      error: job.error,
      updatedAt: job.updatedAt,
    };
  }

  async revoke(publishId: string): Promise<void> {
    const job = this.jobs.get(publishId);
    if (!job) {
      throw new NotFoundError('publish', 'PublishJob', publishId);
    }

    if (job.status !== 'published') {
      throw new ConflictError(
        'publish',
        `Cannot revoke job ${publishId} -- current status is "${job.status}".`,
      );
    }

    job.status = 'revoked';
    job.publicUrl = undefined;
    job.updatedAt = isoNow();
  }

  async getSupportedPlatforms(): Promise<PlatformCapabilities[]> {
    return PLATFORM_CAPS.map((p) => ({ ...p }));
  }

  async validateSpec(
    platform: string,
    spec: DeliverySpec,
  ): Promise<ValidationResult> {
    const caps = PLATFORM_MAP.get(platform);
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    if (!caps) {
      errors.push({
        code: 'unknown_platform',
        message: `Platform "${platform}" is not supported.`,
        field: 'platform',
      });
      return { valid: false, errors, warnings };
    }

    // Format check
    if (!caps.supportedFormats.includes(spec.format.toLowerCase())) {
      errors.push({
        code: 'unsupported_format',
        message: `Format "${spec.format}" is not supported by ${caps.displayName}. ` +
          `Supported: ${caps.supportedFormats.join(', ')}.`,
        field: 'format',
      });
    }

    // Resolution check
    const resMatch = caps.supportedResolutions.some(
      (r) =>
        r.width === spec.resolution.width &&
        r.height === spec.resolution.height,
    );
    if (!resMatch) {
      warnings.push({
        code: 'non_standard_resolution',
        message:
          `Resolution ${spec.resolution.width}x${spec.resolution.height} ` +
          `is not a standard preset for ${caps.displayName}. The platform ` +
          `may re-encode.`,
        field: 'resolution',
      });
    }

    // Frame rate warnings
    if (spec.frameRate > 60) {
      warnings.push({
        code: 'high_frame_rate',
        message: `Frame rate ${spec.frameRate} fps exceeds typical platform limits.`,
        field: 'frameRate',
      });
    }

    // Captions check
    if (spec.captionsFormat && !caps.supportsCaptions) {
      warnings.push({
        code: 'captions_unsupported',
        message: `${caps.displayName} does not support caption uploads. ` +
          `Captions will be ignored.`,
        field: 'captionsFormat',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // -----------------------------------------------------------------------
  // Lifecycle simulation
  // -----------------------------------------------------------------------

  /**
   * Advances a job through the publish lifecycle using timers:
   *
   *   draft -(500ms)-> rendering -(progress ticks)-> ready -(400ms)->
   *   publishing -(300ms)-> published
   */
  private advanceJob(job: PublishJob): void {
    // Step 1: draft -> rendering
    setTimeout(() => {
      job.status = 'rendering';
      job.progress = 0;
      job.updatedAt = isoNow();

      // Step 2: rendering progress ticks
      const totalTicks = 5;
      let tick = 0;
      const interval = setInterval(() => {
        tick++;
        job.progress = Math.min(100, Math.round((tick / totalTicks) * 100));
        job.updatedAt = isoNow();

        if (tick >= totalTicks) {
          clearInterval(interval);

          // Step 3: rendering -> ready
          job.status = 'ready';
          job.progress = 100;
          job.updatedAt = isoNow();

          // Step 4: ready -> publishing
          setTimeout(() => {
            job.status = 'publishing';
            job.updatedAt = isoNow();

            // Step 5: publishing -> published
            setTimeout(() => {
              job.status = 'published';
              job.publicUrl = fakePublicUrl(job.variant.platform, job.jobId);
              job.updatedAt = isoNow();
            }, 300);
          }, 400);
        }
      }, 300);
    }, 500);
  }
}
