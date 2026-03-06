import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { db } from '../db/client';
import { config } from '../config';
import { logger } from '../utils/logger';
import { NotFoundError, MediaProcessingError } from '../utils/errors';
import type { MediaAsset } from '@prisma/client';

// ─── S3 Client ─────────────────────────────────────────────────────────────────
const s3 = new AWS.S3({
  region: config.aws.region,
  accessKeyId: config.aws.accessKeyId,
  secretAccessKey: config.aws.secretAccessKey,
  signatureVersion: 'v4',
});

// ─── Helpers ───────────────────────────────────────────────────────────────────
function getMediaType(mimeType: string): 'VIDEO' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' | 'GRAPHIC' {
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (mimeType.startsWith('audio/')) return 'AUDIO';
  if (mimeType.startsWith('image/')) return 'IMAGE';
  return 'DOCUMENT';
}

function generateS3Key(projectId: string, binId: string, fileName: string): string {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
  return `projects/${projectId}/bins/${binId}/media/${uuidv4()}_${base}${ext}`;
}

function getSignedUrl(s3Key: string, bucket: string, expiresIn = 3600): string {
  if (!config.aws.accessKeyId) return `https://cdn.placeholder.dev/${s3Key}`;
  return s3.getSignedUrl('getObject', { Bucket: bucket, Key: s3Key, Expires: expiresIn });
}

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

    let uploadResult: AWS.S3.ManagedUpload.SendData | null = null;

    if (config.aws.accessKeyId) {
      uploadResult = await s3
        .upload({
          Bucket: config.aws.buckets.media,
          Key: s3Key,
          Body: file.buffer,
          ContentType: file.mimetype,
        })
        .promise();
    }

    const asset = await db.mediaAsset.create({
      data: {
        binId,
        name: metadata.name || path.basename(file.originalname, path.extname(file.originalname)),
        type,
        status: 'PROCESSING',
        s3Key,
        s3Bucket: config.aws.buckets.media,
        mimeType: file.mimetype,
        fileSize: BigInt(file.size),
        description: metadata.description,
      },
    });

    // Queue background processing (proxy + metadata extraction)
    this.queueProcessing(asset.id).catch(logger.error);

    return asset;
  }

  /**
   * Confirm S3 direct upload complete, trigger processing.
   */
  async confirmUpload(assetId: string) {
    const asset = await db.mediaAsset.update({
      where: { id: assetId },
      data: { status: 'PROCESSING' },
    });

    this.queueProcessing(assetId).catch(logger.error);
    return asset;
  }

  /**
   * Queue background job to extract metadata, generate proxy, waveform, thumbnail.
   */
  private async queueProcessing(assetId: string) {
    logger.info(`Queuing media processing for asset ${assetId}`);
    // In production this would dispatch to a Bull/BullMQ job queue
    // For now we simulate async processing:
    setTimeout(async () => {
      try {
        await db.mediaAsset.update({
          where: { id: assetId },
          data: { status: 'READY' },
        });
        logger.info(`Asset ${assetId} processing complete`);
      } catch (e) {
        await db.mediaAsset.update({ where: { id: assetId }, data: { status: 'ERROR' } });
      }
    }, 2000);
  }

  /**
   * Enrich an asset with signed URLs for playback.
   */
  async enrichWithUrls(asset: MediaAsset) {
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
      // Return pre-generated waveform from S3
      try {
        const obj = await s3.getObject({
          Bucket: config.aws.buckets.media,
          Key: asset.waveformS3Key,
        }).promise();
        return JSON.parse(obj.Body?.toString() ?? '[]');
      } catch (e) {
        logger.warn(`Waveform fetch failed for ${assetId}`, e);
      }
    }

    // Return placeholder waveform data
    const samples = 200;
    return Array.from({ length: samples }, () => Math.random() * 0.8 + 0.1);
  }

  /**
   * Delete asset and clean up S3.
   */
  async deleteAsset(assetId: string) {
    const asset = await db.mediaAsset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundError('Media asset');

    // Delete S3 objects
    const keys = [asset.s3Key, asset.proxyS3Key, asset.thumbnailS3Key, asset.waveformS3Key]
      .filter(Boolean) as string[];

    if (config.aws.accessKeyId && keys.length) {
      await s3.deleteObjects({
        Bucket: config.aws.buckets.media,
        Delete: { Objects: keys.map((k) => ({ Key: k })) },
      }).promise();
    }

    await db.mediaAsset.delete({ where: { id: assetId } });
  }

  /**
   * Generate presigned download URL.
   */
  async getDownloadUrl(assetId: string, useProxy = false) {
    const asset = await db.mediaAsset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundError('Media asset');

    const key = useProxy ? asset.proxyS3Key : asset.s3Key;
    const bucket = useProxy ? config.aws.buckets.proxies : config.aws.buckets.media;
    if (!key) throw new MediaProcessingError('Media file not yet available');

    return getSignedUrl(key, bucket, 3600);
  }
}

export const mediaService = new MediaService();
