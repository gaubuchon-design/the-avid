import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { db } from '../db/client';
import { config } from '../config';
import { logger } from '../utils/logger';
import { NotFoundError, MediaProcessingError } from '../utils/errors';
import { CircuitBreaker } from '../utils/circuitBreaker';

/** Circuit breaker for S3 operations */
const s3Breaker = new CircuitBreaker({
  name: 's3',
  failureThreshold: 5,
  resetTimeout: 30_000,
  callTimeout: 15_000,
});

interface MediaAssetRecord {
  id: string;
  s3Key: string | null;
  proxyS3Key: string | null;
  thumbnailS3Key: string | null;
  waveformS3Key: string | null;
  [key: string]: unknown;
}

// ─── Allowed MIME types ──────────────────────────────────────────────────────
const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
  'video/webm', 'video/mpeg', 'video/x-ms-wmv',
]);
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/ogg',
  'audio/flac', 'audio/x-aiff', 'audio/mp4',
]);
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/gif', 'image/svg+xml',
]);

// ─── S3 Client ─────────────────────────────────────────────────────────────────
const s3 = new AWS.S3({
  region: config.aws.region,
  accessKeyId: config.aws.accessKeyId,
  secretAccessKey: config.aws.secretAccessKey,
  signatureVersion: 'v4',
});

// ─── Helpers ───────────────────────────────────────────────────────────────────
function getMediaType(mimeType: string): 'VIDEO' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' | 'GRAPHIC' {
  if (ALLOWED_VIDEO_TYPES.has(mimeType) || mimeType.startsWith('video/')) return 'VIDEO';
  if (ALLOWED_AUDIO_TYPES.has(mimeType) || mimeType.startsWith('audio/')) return 'AUDIO';
  if (ALLOWED_IMAGE_TYPES.has(mimeType) || mimeType.startsWith('image/')) return 'IMAGE';
  return 'DOCUMENT';
}

function sanitizeFilename(fileName: string): string {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
  // Truncate overly long names
  return `${base.slice(0, 100)}${ext}`;
}

function generateS3Key(projectId: string, binId: string, fileName: string): string {
  const sanitized = sanitizeFilename(fileName);
  return `projects/${projectId}/bins/${binId}/media/${uuidv4()}_${sanitized}`;
}

function getSignedUrl(s3Key: string, bucket: string, expiresIn = 3600): string {
  if (!config.aws.accessKeyId) return `https://cdn.placeholder.dev/${s3Key}`;
  return s3.getSignedUrl('getObject', { Bucket: bucket, Key: s3Key, Expires: expiresIn });
}

// ─── Max upload size (5 GB) ─────────────────────────────────────────────────
const MAX_UPLOAD_SIZE = BigInt(5 * 1024 * 1024 * 1024);

// ─── Media Service ─────────────────────────────────────────────────────────────
class MediaService {
  /**
   * Generate a presigned upload URL and create the asset record.
   */
  async initiateUpload({
    projectId,
    binId,
    fileName,
    mimeType,
    fileSize,
  }: {
    projectId: string;
    binId: string;
    fileName: string;
    mimeType: string;
    fileSize?: bigint;
  }) {
    // Validate file size
    if (fileSize && fileSize > MAX_UPLOAD_SIZE) {
      throw new MediaProcessingError(`File size exceeds maximum allowed (5 GB)`);
    }

    const s3Key = generateS3Key(projectId, binId, fileName);
    const type = getMediaType(mimeType);

    const asset = await db.mediaAsset.create({
      data: {
        binId,
        name: path.basename(fileName, path.extname(fileName)),
        type,
        status: 'UPLOADING',
        s3Key,
        s3Bucket: config.aws.buckets.media,
        mimeType,
        fileSize,
      },
    });

    const uploadUrl = config.aws.accessKeyId
      ? s3.getSignedUrl('putObject', {
          Bucket: config.aws.buckets.media,
          Key: s3Key,
          ContentType: mimeType,
          Expires: 3600, // 1 hour to complete upload
        })
      : `https://upload.placeholder.dev/${s3Key}`;

    logger.info('Upload initiated', { assetId: asset.id, type, mimeType, s3Key });
    return { asset, uploadUrl };
  }

  /**
   * Direct upload from multipart form (for smaller files / mobile).
   */
  async directUpload({
    projectId,
    binId,
    file,
    metadata = {},
  }: {
    projectId: string;
    binId: string;
    file: Express.Multer.File;
    metadata?: Record<string, string>;
  }) {
    const s3Key = generateS3Key(projectId, binId, file.originalname);
    const type = getMediaType(file.mimetype);

    if (config.aws.accessKeyId) {
      try {
        await s3Breaker.execute(() =>
          s3.upload({
            Bucket: config.aws.buckets.media,
            Key: s3Key,
            Body: file.buffer,
            ContentType: file.mimetype,
          }).promise()
        );
      } catch (err: any) {
        logger.error('S3 upload failed', { s3Key, error: err.message });
        throw new MediaProcessingError('Failed to upload file to storage');
      }
    }

    const asset = await db.mediaAsset.create({
      data: {
        binId,
        name: metadata['name'] || path.basename(file.originalname, path.extname(file.originalname)),
        type,
        status: 'PROCESSING',
        s3Key,
        s3Bucket: config.aws.buckets.media,
        mimeType: file.mimetype,
        fileSize: BigInt(file.size),
        description: metadata['description'],
      },
    });

    // Queue background processing (proxy + metadata extraction)
    this.queueProcessing(asset.id).catch((err) =>
      logger.error('Failed to queue processing', { assetId: asset.id, error: err.message })
    );

    logger.info('Direct upload complete', { assetId: asset.id, type, size: file.size });
    return asset;
  }

  /**
   * Confirm S3 direct upload complete, trigger processing.
   */
  async confirmUpload(assetId: string) {
    const existing = await db.mediaAsset.findUnique({ where: { id: assetId } });
    if (!existing) throw new NotFoundError('Media asset');
    if (existing.status !== 'UPLOADING') {
      throw new MediaProcessingError(`Asset is in "${existing.status}" state, expected "UPLOADING"`);
    }

    const asset = await db.mediaAsset.update({
      where: { id: assetId },
      data: { status: 'PROCESSING' },
    });

    this.queueProcessing(assetId).catch((err) =>
      logger.error('Failed to queue processing', { assetId, error: err.message })
    );

    logger.info('Upload confirmed, processing queued', { assetId });
    return asset;
  }

  /**
   * Queue background job to extract metadata, generate proxy, waveform, thumbnail.
   */
  private async queueProcessing(assetId: string): Promise<void> {
    logger.info('Queuing media processing', { assetId });
    // In production this would dispatch to a Bull/BullMQ job queue:
    //   mediaQueue.add('process-asset', { assetId }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
    //
    // Processing pipeline:
    //   1. Extract technical metadata (ffprobe: codec, resolution, frame rate, duration)
    //   2. Generate proxy media (FFmpeg: lower-res version for editing)
    //   3. Generate thumbnail (FFmpeg: frame at 10% mark)
    //   4. Generate audio waveform data (audiowaveform or FFmpeg)
    //   5. Update asset record with all generated data

    // Simulate async processing for dev
    setTimeout(async () => {
      try {
        await db.mediaAsset.update({
          where: { id: assetId },
          data: { status: 'READY' },
        });
        logger.info('Asset processing complete', { assetId });
      } catch (e: any) {
        logger.error('Asset processing failed', { assetId, error: e.message });
        await db.mediaAsset.update({ where: { id: assetId }, data: { status: 'ERROR' } }).catch(() => {});
      }
    }, 2000);
  }

  /**
   * Enrich an asset with signed URLs for playback.
   */
  async enrichWithUrls(asset: MediaAssetRecord) {
    return {
      ...asset,
      playbackUrl: asset.s3Key
        ? getSignedUrl(asset.s3Key, config.aws.buckets.media)
        : null,
      proxyUrl: asset.proxyS3Key
        ? getSignedUrl(asset.proxyS3Key, config.aws.buckets.proxies)
        : null,
      thumbnailUrl: asset.thumbnailS3Key
        ? getSignedUrl(asset.thumbnailS3Key, config.aws.buckets.media, 86400)
        : null,
    };
  }

  /**
   * Get waveform data for audio visualization.
   */
  async getWaveform(assetId: string) {
    const asset = await db.mediaAsset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundError('Media asset');

    if (asset.waveformS3Key) {
      try {
        const obj = await s3Breaker.execute(() =>
          s3.getObject({
            Bucket: config.aws.buckets.media,
            Key: asset.waveformS3Key!,
          }).promise()
        );
        return JSON.parse(obj.Body?.toString() ?? '[]');
      } catch (e: any) {
        logger.warn('Waveform fetch failed, returning fallback data', { assetId, error: e.message });
      }
    }

    // Return placeholder waveform data for dev/fallback
    const samples = 200;
    return Array.from({ length: samples }, () => Math.random() * 0.8 + 0.1);
  }

  /**
   * Delete asset and clean up S3.
   */
  async deleteAsset(assetId: string): Promise<void> {
    const asset = await db.mediaAsset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundError('Media asset');

    // Delete S3 objects
    const keys = [asset.s3Key, asset.proxyS3Key, asset.thumbnailS3Key, asset.waveformS3Key]
      .filter(Boolean) as string[];

    if (config.aws.accessKeyId && keys.length) {
      try {
        await s3Breaker.execute(() =>
          s3.deleteObjects({
            Bucket: config.aws.buckets.media,
            Delete: { Objects: keys.map((k) => ({ Key: k })) },
          }).promise()
        );
        logger.info('S3 objects deleted', { assetId, keyCount: keys.length });
      } catch (err: any) {
        // Log but don't fail the DB delete -- S3 cleanup can be retried
        logger.error('Failed to delete S3 objects', { assetId, error: err.message });
      }
    }

    await db.mediaAsset.delete({ where: { id: assetId } });
    logger.info('Media asset deleted', { assetId });
  }

  /**
   * Generate presigned download URL.
   */
  async getDownloadUrl(assetId: string, useProxy = false): Promise<string> {
    const asset = await db.mediaAsset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundError('Media asset');

    const key = useProxy ? asset.proxyS3Key : asset.s3Key;
    const bucket = useProxy ? config.aws.buckets.proxies : config.aws.buckets.media;
    if (!key) throw new MediaProcessingError('Media file not yet available');

    return getSignedUrl(key, bucket, 3600);
  }

  /**
   * Move an asset to a different bin within the same project.
   */
  async moveAsset(assetId: string, targetBinId: string): Promise<void> {
    const asset = await db.mediaAsset.findUnique({
      where: { id: assetId },
      include: { bin: { select: { projectId: true } } },
    });
    if (!asset) throw new NotFoundError('Media asset');

    const targetBin = await db.bin.findUnique({ where: { id: targetBinId } });
    if (!targetBin) throw new NotFoundError('Target bin');

    // Verify same project
    if (asset.bin.projectId !== targetBin.projectId) {
      throw new MediaProcessingError('Cannot move asset to a bin in a different project');
    }

    await db.mediaAsset.update({
      where: { id: assetId },
      data: { binId: targetBinId },
    });

    logger.info('Asset moved', { assetId, fromBin: asset.binId, toBin: targetBinId });
  }
}

export const mediaService = new MediaService();
