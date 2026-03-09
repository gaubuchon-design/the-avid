/**
 * Sports Production Routes
 * Handles sports productions, highlights, growing files, stats, packages
 */
import { Router, Request, Response } from 'express';
import { authenticate, requireProjectAccess } from '../../middleware/auth';
import { db } from '../../db/client';
import {
  validate, validateAll, schemas, projectIdParam, uuidParam,
} from '../../utils/validation';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ─── Param schemas ───────────────────────────────────────────────────────────
const projectIdAndHighlightIdParams = z.object({
  projectId: z.string().uuid(),
  id: z.string().uuid(),
});
const projectIdAndFileIdParams = z.object({
  projectId: z.string().uuid(),
  id: z.string().uuid(),
});
const projectIdAndPackageIdParams = z.object({
  projectId: z.string().uuid(),
  id: z.string().uuid(),
});

// ─── Sports Productions ──────────────────────────────────────────────────────

router.post('/productions', validate(schemas.createSportsProduction), async (req: Request, res: Response) => {
  const data = req.body;
  const production = await db.sportsProduction.create({
    data: {
      ...data,
      gameDate: data.gameDate ? new Date(data.gameDate) : undefined,
    },
  });
  res.status(201).json({ production });
});

router.get('/productions/:projectId', validate(projectIdParam, 'params'), async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUnique({
    where: { projectId: req.params['projectId'] },
    include: {
      highlights: { orderBy: { timestamp: 'asc' }, take: 50 },
      growingFiles: { where: { isGrowing: true } },
      packages: { orderBy: { createdAt: 'desc' } },
    },
  });
  res.json({ production });
});

router.patch(
  '/productions/:projectId',
  validateAll({ params: projectIdParam, body: schemas.updateSportsProduction }),
  async (req: Request, res: Response) => {
    const data: any = { ...req.body };
    if (data.gameDate) data.gameDate = new Date(data.gameDate);

    const production = await db.sportsProduction.update({
      where: { projectId: req.params['projectId'] },
      data,
    });
    res.json({ production });
  }
);

// ─── Highlights ──────────────────────────────────────────────────────────────

router.get('/productions/:projectId/highlights', validate(projectIdParam, 'params'), async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUniqueOrThrow({
    where: { projectId: req.params['projectId'] },
  });
  const { eventType, minConfidence } = req.query;
  const where: any = { productionId: production.id };
  if (eventType) where.eventType = eventType;
  if (minConfidence) {
    const parsed = parseFloat(minConfidence as string);
    if (!Number.isNaN(parsed)) where.confidence = { gte: parsed };
  }

  const highlights = await db.sportsHighlight.findMany({
    where,
    orderBy: { timestamp: 'asc' },
  });
  res.json({ highlights });
});

router.post(
  '/productions/:projectId/highlights',
  validateAll({ params: projectIdParam, body: schemas.createSportsHighlight }),
  async (req: Request, res: Response) => {
    const production = await db.sportsProduction.findUniqueOrThrow({
      where: { projectId: req.params['projectId'] },
    });
    const highlight = await db.sportsHighlight.create({
      data: { ...req.body, productionId: production.id },
    });
    res.status(201).json({ highlight });
  }
);

router.patch(
  '/productions/:projectId/highlights/:id',
  validateAll({ params: projectIdAndHighlightIdParams, body: schemas.updateSportsHighlight }),
  async (req: Request, res: Response) => {
    const highlight = await db.sportsHighlight.update({
      where: { id: req.params['id'] },
      data: req.body,
    });
    res.json({ highlight });
  }
);

// ─── Growing Files ───────────────────────────────────────────────────────────

router.get('/productions/:projectId/growing-files', validate(projectIdParam, 'params'), async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUniqueOrThrow({
    where: { projectId: req.params['projectId'] },
  });
  const files = await db.growingFile.findMany({
    where: { productionId: production.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ growingFiles: files });
});

router.post(
  '/productions/:projectId/growing-files',
  validateAll({ params: projectIdParam, body: schemas.createGrowingFile }),
  async (req: Request, res: Response) => {
    const production = await db.sportsProduction.findUniqueOrThrow({
      where: { projectId: req.params['projectId'] },
    });
    const file = await db.growingFile.create({
      data: {
        productionId: production.id,
        ...req.body,
      },
    });
    res.status(201).json({ growingFile: file });
  }
);

router.patch(
  '/productions/:projectId/growing-files/:id',
  validateAll({ params: projectIdAndFileIdParams, body: schemas.updateGrowingFile }),
  async (req: Request, res: Response) => {
    const data: any = { ...req.body };
    if (data.lastFrameAt) data.lastFrameAt = new Date(data.lastFrameAt);

    const file = await db.growingFile.update({
      where: { id: req.params['id'] },
      data,
    });
    res.json({ growingFile: file });
  }
);

// ─── Stats Snapshots ─────────────────────────────────────────────────────────

router.get('/productions/:projectId/stats', validate(projectIdParam, 'params'), async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUniqueOrThrow({
    where: { projectId: req.params['projectId'] },
  });
  const stats = await db.statsSnapshot.findMany({
    where: { productionId: production.id },
    orderBy: { capturedAt: 'desc' },
    take: 100,
  });
  res.json({ stats });
});

router.get('/productions/:projectId/stats/latest', validate(projectIdParam, 'params'), async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUniqueOrThrow({
    where: { projectId: req.params['projectId'] },
  });
  const latest = await db.statsSnapshot.findFirst({
    where: { productionId: production.id },
    orderBy: { capturedAt: 'desc' },
  });
  res.json({ stats: latest });
});

// ─── Sports Packages ─────────────────────────────────────────────────────────

router.get('/productions/:projectId/packages', validate(projectIdParam, 'params'), async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUniqueOrThrow({
    where: { projectId: req.params['projectId'] },
  });
  const packages = await db.sportsPackage.findMany({
    where: { productionId: production.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ packages });
});

router.post(
  '/productions/:projectId/packages',
  validateAll({ params: projectIdParam, body: schemas.createSportsPackage }),
  async (req: Request, res: Response) => {
    const production = await db.sportsProduction.findUniqueOrThrow({
      where: { projectId: req.params['projectId'] },
    });
    const pkg = await db.sportsPackage.create({
      data: { ...req.body, productionId: production.id },
    });
    res.status(201).json({ package: pkg });
  }
);

router.patch(
  '/productions/:projectId/packages/:id',
  validateAll({ params: projectIdAndPackageIdParams, body: schemas.updateSportsPackage }),
  async (req: Request, res: Response) => {
    const pkg = await db.sportsPackage.update({
      where: { id: req.params['id'] },
      data: req.body,
    });
    res.json({ package: pkg });
  }
);

export default router;
