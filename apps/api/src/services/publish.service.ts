import { db } from '../db/client';
import { logger } from '../utils/logger';

interface QueuedPublishJob {
  id: string;
  timelineId: string;
  platform: 'YOUTUBE' | 'INSTAGRAM' | 'TIKTOK' | 'VIMEO' | 'CUSTOM';
  smartReframe: boolean;
  aspectRatio: string | null;
  autoCaption: boolean;
}

// Platform-specific aspect ratio defaults
const PLATFORM_DEFAULTS: Record<string, { aspectRatio: string; maxDuration?: number }> = {
  YOUTUBE: { aspectRatio: '16:9' },
  INSTAGRAM: { aspectRatio: '1:1', maxDuration: 60 },
  TIKTOK: { aspectRatio: '9:16', maxDuration: 180 },
  VIMEO: { aspectRatio: '16:9' },
  CUSTOM: { aspectRatio: '16:9' },
};

class PublishService {
  private queue: QueuedPublishJob[] = [];
  private processing = false;

  /**
   * Add a publish job to the processing queue.
   */
  async enqueue(job: QueuedPublishJob): Promise<void> {
    this.queue.push(job);
    logger.info('Publish job enqueued', {
      jobId: job.id,
      platform: job.platform,
      queueLength: this.queue.length,
    });
    if (!this.processing) this.processNext();
  }

  /**
   * Get current queue depth (useful for health checks).
   */
  getQueueDepth(): number {
    return this.queue.length;
  }

  private async processNext(): Promise<void> {
    const job = this.queue.shift();
    if (!job) {
      this.processing = false;
      return;
    }
    this.processing = true;

    const startTime = Date.now();

    try {
      await db.publishJob.update({
        where: { id: job.id },
        data: { status: 'PROCESSING' },
      });

      // Step 1: Export from timeline
      logger.info('Exporting timeline', {
        jobId: job.id,
        timelineId: job.timelineId,
        platform: job.platform,
      });
      await this.simulateExport(job);

      // Step 2: AI enhancements (smart reframe, auto-caption)
      if (job.smartReframe) {
        const targetAspect = job.aspectRatio ?? PLATFORM_DEFAULTS[job.platform]?.aspectRatio ?? '16:9';
        logger.info('Applying smart reframe', { jobId: job.id, aspectRatio: targetAspect });
        await new Promise((r) => setTimeout(r, 500));
      }

      if (job.autoCaption) {
        logger.info('Generating auto-captions', { jobId: job.id });
        await new Promise((r) => setTimeout(r, 500));
      }

      // Step 3: Platform delivery
      logger.info('Delivering to platform', { jobId: job.id, platform: job.platform });
      const externalUrl = await this.deliverToPlatform(job);

      await db.publishJob.update({
        where: { id: job.id },
        data: {
          status: 'PUBLISHED',
          externalUrl,
          publishedAt: new Date(),
          externalId: `ext_${Date.now()}`,
        },
      });

      const durationMs = Date.now() - startTime;
      logger.info('Publish job complete', {
        jobId: job.id,
        platform: job.platform,
        externalUrl,
        durationMs,
      });
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errMsg = (err as Error).message ?? String(err);
      logger.error('Publish job failed', {
        jobId: job.id,
        platform: job.platform,
        error: errMsg,
        durationMs,
      });

      await db.publishJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: errMsg.slice(0, 2000),
        },
      }).catch((dbErr: Error) =>
        logger.error('Failed to update publish job status', { jobId: job.id, error: dbErr.message })
      );
    }

    // Process next in queue
    setImmediate(() => this.processNext());
  }

  private async simulateExport(job: QueuedPublishJob): Promise<void> {
    // In production: kick off FFmpeg export via job queue
    // const platform = PLATFORM_DEFAULTS[job.platform];
    // ffmpeg -i [input] -vf scale={resolution} -b:v {bitrate}k -preset fast [output]
    //
    // Export pipeline:
    //   1. Resolve timeline to flat edit list (in/out points, tracks, effects)
    //   2. Render with FFmpeg using hardware acceleration if available
    //   3. Apply platform-specific encoding constraints (codec, bitrate, max file size)
    //   4. Upload rendered file to staging S3 bucket
    await new Promise((r) => setTimeout(r, 1000));
  }

  private async deliverToPlatform(job: QueuedPublishJob): Promise<string> {
    switch (job.platform) {
      case 'YOUTUBE':
        // YouTube Data API v3: videos.insert with resumable upload
        // Requires OAuth2 token from SocialConnection
        return `https://youtube.com/watch?v=placeholder_${job.id}`;
      case 'INSTAGRAM':
        // Instagram Graph API: create media container -> publish
        return `https://instagram.com/p/placeholder_${job.id}`;
      case 'TIKTOK':
        // TikTok Content Posting API: init upload -> upload video -> publish
        return `https://tiktok.com/@user/video/placeholder_${job.id}`;
      case 'VIMEO':
        // Vimeo API: tus-based resumable upload
        return `https://vimeo.com/placeholder_${job.id}`;
      default:
        // Generic CDN export
        return `https://cdn.avid.app/exports/${job.id}.mp4`;
    }
  }
}

export const publishService = new PublishService();
