import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { authenticate, requireProjectAccess } from '../../middleware/auth';
import { validate, schemas, paginationQuery, paginate } from '../../utils/validation';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { mediaService } from '../../services/media.service';
import multer from 'multer';

const router = Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10GB
  fileFilter: (_req, file, cb) => {
    const allowed = /video|audio|image/;
    cb(null, allowed.test(file.mimetype));
  },
});

// ─── BINS ──────────────────────────────────────────────────────────────────────

// GET /projects/:projectId/bins
router.get('/projects/:projectId/bins', requireProjectAccess('VIEWER'), async (req: Request, res: Response) => {
  const bins = await db.bin.findMany({
    where: { projectId: req.params.projectId },
    include: {
      children: { include: { _count: { select: { mediaAssets: true } } } },
      _count: { select: { mediaAssets: true } },
    },
    orderBy: { sortOrder: 'asc' },
  });
  res.json({ bins });
});

// POST /projects/:projectId/bins
router.post('/projects/:projectId/bins', requireProjectAccess('EDITOR'), validate(schemas.createBin), async (req: Request, res: Response) => {
  const bin = await db.bin.create({
    data: { ...req.body, projectId: req.params.projectId },
  });
  res.status(201).json({ bin });
});

// PATCH /projects/:projectId/bins/:binId
router.patch('/projects/:projectId/bins/:binId', requireProjectAccess('EDITOR'), async (req: Request, res: Response) => {
  const bin = await db.bin.update({
    where: { id: req.params.binId, projectId: req.params.projectId },
    data: req.body,
  });
  res.json({ bin });
});

// DELETE /projects/:projectId/bins/:binId
router.delete('/projects/:projectId/bins/:binId', requireProjectAccess('EDITOR'), async (req: Request, res: Response) => {
  await db.bin.delete({ where: { id: req.params.binId } });
  res.status(204).send();
});

// ─── MEDIA ASSETS ─────────────────────────────────────────────────────────────

// GET /projects/:projectId/media
router.get('/projects/:projectId/media', requireProjectAccess('VIEWER'), validate(paginationQuery, 'query'), async (req: Request, res: Response) => {
  const { page, limit, sortBy, sortOrder } = req.query as any;
  const { binId, type, search, isFavorite } = req.query as any;
  const skip = (page - 1) * limit;

  const where: any = {
    bin: { projectId: req.params.projectId },
    ...(binId ? { binId } : {}),
    ...(type ? { type: type.toUpperCase() } : {}),
    ...(isFavorite === 'true' ? { isFavorite: true } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { tags: { has: search } },
            { transcript: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [assets, total] = await Promise.all([
    db.mediaAsset.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy ?? 'createdAt']: sortOrder },
    }),
    db.mediaAsset.count({ where }),
  ]);

  // Enrich with signed URLs
  const enriched = await Promise.all(assets.map(mediaService.enrichWithUrls));

  res.json({ assets: enriched, pagination: paginate(total, page, limit) });
});

// POST /projects/:projectId/bins/:binId/media — initiate upload
router.post('/projects/:projectId/bins/:binId/media/upload-url', requireProjectAccess('EDITOR'), async (req: Request, res: Response) => {
  const { fileName, mimeType, fileSize } = req.body;
  if (!fileName || !mimeType) throw new BadRequestError('fileName and mimeType required');

  const { asset, uploadUrl } = await mediaService.initiateUpload({
    projectId: req.params.projectId,
    binId: req.params.binId,
    fileName,
    mimeType,
    fileSize: fileSize ? BigInt(fileSize) : undefined,
  });

  res.status(201).json({ asset, uploadUrl });
});

// POST /projects/:projectId/bins/:binId/media/upload — direct upload
router.post(
  '/projects/:projectId/bins/:binId/media',
  requireProjectAccess('EDITOR'),
  upload.single('file'),
  async (req: Request, res: Response) => {
    if (!req.file) throw new BadRequestError('No file uploaded');

    const asset = await mediaService.directUpload({
      projectId: req.params.projectId,
      binId: req.params.binId,
      file: req.file,
      metadata: req.body,
    });

    res.status(201).json({ asset });
  }
);

// POST /projects/:projectId/media/:assetId/confirm — confirm S3 upload complete
router.post('/projects/:projectId/media/:assetId/confirm', requireProjectAccess('EDITOR'), async (req: Request, res: Response) => {
  const asset = await mediaService.confirmUpload(req.params.assetId);
  res.json({ asset });
});

// GET /projects/:projectId/media/:assetId
router.get('/projects/:projectId/media/:assetId', requireProjectAccess('VIEWER'), async (req: Request, res: Response) => {
  const asset = await db.mediaAsset.findUnique({ where: { id: req.params.assetId } });
  if (!asset) throw new NotFoundError('Media asset');
  const enriched = await mediaService.enrichWithUrls(asset);
  res.json({ asset: enriched });
});

// PATCH /projects/:projectId/media/:assetId
router.patch('/projects/:projectId/media/:assetId', requireProjectAccess('EDITOR'), async (req: Request, res: Response) => {
  const allowed = ['name', 'description', 'tags', 'rating', 'isFavorite', 'tapeName', 'reel', 'scene', 'take'];
  const data: any = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) data[k] = req.body[k]; });

  const asset = await db.mediaAsset.update({ where: { id: req.params.assetId }, data });
  res.json({ asset });
});

// DELETE /projects/:projectId/media/:assetId
router.delete('/projects/:projectId/media/:assetId', requireProjectAccess('EDITOR'), async (req: Request, res: Response) => {
  await mediaService.deleteAsset(req.params.assetId);
  res.status(204).send();
});

// GET /projects/:projectId/media/:assetId/waveform
router.get('/projects/:projectId/media/:assetId/waveform', requireProjectAccess('VIEWER'), async (req: Request, res: Response) => {
  const waveform = await mediaService.getWaveform(req.params.assetId);
  res.json({ waveform });
});

export default router;
