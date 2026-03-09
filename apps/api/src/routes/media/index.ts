import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { authenticate, requireProjectAccess } from '../../middleware/auth';
import {
  validate, validateAll, schemas, paginationQuery, paginate,
  projectIdParam, projectIdAndBinIdParams, projectIdAndAssetIdParams,
} from '../../utils/validation';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { mediaService } from '../../services/media.service';
import multer from 'multer';

const router = Router();
router.use(authenticate);

const ALLOWED_MIMETYPES = /^(video|audio|image)\//;
const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10GB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestError(`Unsupported file type: ${file.mimetype}`) as any);
    }
  },
});

// ─── BINS ──────────────────────────────────────────────────────────────────────

// GET /projects/:projectId/bins
router.get(
  '/projects/:projectId/bins',
  requireProjectAccess('VIEWER'),
  validate(projectIdParam, 'params'),
  async (req: Request, res: Response) => {
    const bins = await db.bin.findMany({
      where: { projectId: req.params['projectId']!, parentId: null },
      include: {
        children: {
          include: { _count: { select: { mediaAssets: true } } },
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { mediaAssets: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ bins });
  }
);

// POST /projects/:projectId/bins
router.post(
  '/projects/:projectId/bins',
  requireProjectAccess('EDITOR'),
  validateAll({ params: projectIdParam, body: schemas.createBin }),
  async (req: Request, res: Response) => {
    // If parentId is provided, verify it belongs to this project
    if (req.body['parentId']) {
      const parent = await db.bin.findFirst({
        where: { id: req.body['parentId'], projectId: req.params['projectId']! },
      });
      if (!parent) throw new NotFoundError('Parent bin');
    }

    const bin = await db.bin.create({
      data: { ...req.body, projectId: req.params['projectId']! },
    });
    res.status(201).json({ bin });
  }
);

// PATCH /projects/:projectId/bins/:binId
router.patch(
  '/projects/:projectId/bins/:binId',
  requireProjectAccess('EDITOR'),
  validateAll({ params: projectIdAndBinIdParams, body: schemas.updateBin }),
  async (req: Request, res: Response) => {
    const bin = await db.bin.update({
      where: { id: req.params['binId']!, projectId: req.params['projectId']! },
      data: req.body,
    });
    res.json({ bin });
  }
);

// DELETE /projects/:projectId/bins/:binId
router.delete(
  '/projects/:projectId/bins/:binId',
  requireProjectAccess('EDITOR'),
  validate(projectIdAndBinIdParams, 'params'),
  async (req: Request, res: Response) => {
    // Check for child bins
    const childCount = await db.bin.count({ where: { parentId: req.params['binId']! } });
    if (childCount > 0) {
      throw new BadRequestError('Cannot delete bin with child bins. Move or delete children first.');
    }

    // Check for media assets
    const assetCount = await db.mediaAsset.count({ where: { binId: req.params['binId']! } });
    if (assetCount > 0) {
      throw new BadRequestError(`Cannot delete bin with ${assetCount} media assets. Move or delete assets first.`);
    }

    await db.bin.delete({ where: { id: req.params['binId']! } });
    res.status(204).send();
  }
);

// ─── MEDIA ASSETS ─────────────────────────────────────────────────────────────

// GET /projects/:projectId/media
router.get(
  '/projects/:projectId/media',
  requireProjectAccess('VIEWER'),
  validate(schemas.mediaQuery, 'query'),
  validate(projectIdParam, 'params'),
  async (req: Request, res: Response) => {
    const { page, limit, sortBy, sortOrder } = req.query as any;
    const { binId, type, search, isFavorite, status } = req.query as Record<string, string>;
    const skip = (page - 1) * limit;

    const where: any = {
      bin: { projectId: req.params['projectId']! },
      ...(binId ? { binId } : {}),
      ...(type ? { type: type.toUpperCase() } : {}),
      ...(status ? { status: status.toUpperCase() } : {}),
      ...(isFavorite === 'true' ? { isFavorite: true } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { tags: { hasSome: [search] } },
              { transcript: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const allowedSortFields = ['createdAt', 'name', 'type', 'fileSize', 'duration'];
    const orderField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';

    const [assets, total] = await Promise.all([
      db.mediaAsset.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [orderField]: sortOrder },
      }),
      db.mediaAsset.count({ where }),
    ]);

    // Enrich with signed URLs
    const enriched = await Promise.all(assets.map(mediaService.enrichWithUrls));

    res.json({ assets: enriched, pagination: paginate(total, page, limit) });
  }
);

// POST /projects/:projectId/bins/:binId/media/upload-url -- initiate presigned upload
router.post(
  '/projects/:projectId/bins/:binId/media/upload-url',
  requireProjectAccess('EDITOR'),
  validateAll({ params: projectIdAndBinIdParams, body: schemas.initiateUpload }),
  async (req: Request, res: Response) => {
    const { fileName, mimeType, fileSize } = req.body;

    // Verify bin belongs to project
    const bin = await db.bin.findFirst({
      where: { id: req.params['binId']!, projectId: req.params['projectId']! },
    });
    if (!bin) throw new NotFoundError('Bin');

    const { asset, uploadUrl } = await mediaService.initiateUpload({
      projectId: req.params['projectId']!,
      binId: req.params['binId']!,
      fileName,
      mimeType,
      fileSize: fileSize ? BigInt(fileSize) : undefined,
    });

    res.status(201).json({ asset, uploadUrl });
  }
);

// POST /projects/:projectId/bins/:binId/media -- direct upload
router.post(
  '/projects/:projectId/bins/:binId/media',
  requireProjectAccess('EDITOR'),
  validate(projectIdAndBinIdParams, 'params'),
  upload.single('file'),
  async (req: Request, res: Response) => {
    if (!req.file) throw new BadRequestError('No file uploaded');

    // Verify bin belongs to project
    const bin = await db.bin.findFirst({
      where: { id: req.params['binId']!, projectId: req.params['projectId']! },
    });
    if (!bin) throw new NotFoundError('Bin');

    const asset = await mediaService.directUpload({
      projectId: req.params['projectId']!,
      binId: req.params['binId']!,
      file: req.file,
      metadata: req.body,
    });

    res.status(201).json({ asset });
  }
);

// POST /projects/:projectId/media/:assetId/confirm -- confirm S3 upload complete
router.post(
  '/projects/:projectId/media/:assetId/confirm',
  requireProjectAccess('EDITOR'),
  validate(projectIdAndAssetIdParams, 'params'),
  async (req: Request, res: Response) => {
    // Verify asset belongs to this project
    const existing = await db.mediaAsset.findFirst({
      where: { id: req.params['assetId']!, bin: { projectId: req.params['projectId']! } },
    });
    if (!existing) throw new NotFoundError('Media asset');
    if (existing.status !== 'UPLOADING') {
      throw new BadRequestError(`Asset is in "${existing.status}" state, cannot confirm upload`);
    }

    const asset = await mediaService.confirmUpload(req.params['assetId']!);
    res.json({ asset });
  }
);

// GET /projects/:projectId/media/:assetId
router.get(
  '/projects/:projectId/media/:assetId',
  requireProjectAccess('VIEWER'),
  validate(projectIdAndAssetIdParams, 'params'),
  async (req: Request, res: Response) => {
    const asset = await db.mediaAsset.findFirst({
      where: { id: req.params['assetId']!, bin: { projectId: req.params['projectId']! } },
    });
    if (!asset) throw new NotFoundError('Media asset');
    const enriched = await mediaService.enrichWithUrls(asset);
    res.json({ asset: enriched });
  }
);

// PATCH /projects/:projectId/media/:assetId
router.patch(
  '/projects/:projectId/media/:assetId',
  requireProjectAccess('EDITOR'),
  validateAll({ params: projectIdAndAssetIdParams, body: schemas.updateMediaAsset }),
  async (req: Request, res: Response) => {
    // Verify asset belongs to this project
    const existing = await db.mediaAsset.findFirst({
      where: { id: req.params['assetId']!, bin: { projectId: req.params['projectId']! } },
    });
    if (!existing) throw new NotFoundError('Media asset');

    const asset = await db.mediaAsset.update({
      where: { id: req.params['assetId']! },
      data: req.body,
    });
    res.json({ asset });
  }
);

// POST /projects/:projectId/media/:assetId/move -- move asset to another bin
router.post(
  '/projects/:projectId/media/:assetId/move',
  requireProjectAccess('EDITOR'),
  validateAll({ params: projectIdAndAssetIdParams, body: schemas.moveAsset }),
  async (req: Request, res: Response) => {
    const { binId } = req.body;

    // Verify target bin belongs to this project
    const bin = await db.bin.findFirst({
      where: { id: binId, projectId: req.params['projectId']! },
    });
    if (!bin) throw new NotFoundError('Target bin');

    const asset = await db.mediaAsset.update({
      where: { id: req.params['assetId']! },
      data: { binId },
    });
    res.json({ asset });
  }
);

// DELETE /projects/:projectId/media/:assetId
router.delete(
  '/projects/:projectId/media/:assetId',
  requireProjectAccess('EDITOR'),
  validate(projectIdAndAssetIdParams, 'params'),
  async (req: Request, res: Response) => {
    // Verify asset belongs to this project
    const existing = await db.mediaAsset.findFirst({
      where: { id: req.params['assetId']!, bin: { projectId: req.params['projectId']! } },
    });
    if (!existing) throw new NotFoundError('Media asset');

    // Check if asset is used in any clips
    const clipCount = await db.clip.count({ where: { mediaAssetId: req.params['assetId']! } });
    if (clipCount > 0 && req.query['force'] !== 'true') {
      throw new BadRequestError(
        `Asset is used in ${clipCount} clip(s). Use ?force=true to delete anyway.`
      );
    }

    await mediaService.deleteAsset(req.params['assetId']!);
    res.status(204).send();
  }
);

// GET /projects/:projectId/media/:assetId/waveform
router.get(
  '/projects/:projectId/media/:assetId/waveform',
  requireProjectAccess('VIEWER'),
  validate(projectIdAndAssetIdParams, 'params'),
  async (req: Request, res: Response) => {
    const waveform = await mediaService.getWaveform(req.params['assetId']!);
    res.json({ waveform });
  }
);

// GET /projects/:projectId/media/:assetId/download
router.get(
  '/projects/:projectId/media/:assetId/download',
  requireProjectAccess('VIEWER'),
  validate(projectIdAndAssetIdParams, 'params'),
  async (req: Request, res: Response) => {
    const useProxy = req.query['proxy'] === 'true';
    const downloadUrl = await mediaService.getDownloadUrl(req.params['assetId']!, useProxy);
    res.json({ downloadUrl });
  }
);

export default router;
