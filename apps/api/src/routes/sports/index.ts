/**
 * Sports Production Routes
 * Handles sports productions, highlights, growing files, stats, packages
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { db } from '../../db/client';
import { validate } from '../../utils/validation';
import { assertFound, BadRequestError } from '../../utils/errors';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ─── Sports Productions ──────────────────────────────────────────────────────

const createProductionSchema = z.object({
  projectId: z.string().uuid(),
  sport: z.enum(['SOCCER', 'BASKETBALL', 'FOOTBALL', 'BASEBALL', 'HOCKEY', 'TENNIS', 'CRICKET', 'RUGBY', 'OTHER']),
  competitionName: z.string().max(200).optional(),
  venue: z.string().max(200).optional(),
  homeTeam: z.string().max(100).optional(),
  awayTeam: z.string().max(100).optional(),
  gameDate: z.string().datetime().optional(),
  broadcastNetwork: z.string().max(100).optional(),
  evsServerHost: z.string().max(255).optional(),
  statsProvider: z.string().max(100).optional(),
});

const updateProductionSchema = z.object({
  sport: z.enum(['SOCCER', 'BASKETBALL', 'FOOTBALL', 'BASEBALL', 'HOCKEY', 'TENNIS', 'CRICKET', 'RUGBY', 'OTHER']).optional(),
  competitionName: z.string().max(200).optional(),
  venue: z.string().max(200).optional(),
  homeTeam: z.string().max(100).optional(),
  awayTeam: z.string().max(100).optional(),
  gameDate: z.string().datetime().optional(),
  broadcastNetwork: z.string().max(100).optional(),
  evsServerHost: z.string().max(255).optional(),
  statsProvider: z.string().max(100).optional(),
  status: z.enum(['PRE_GAME', 'LIVE', 'HALFTIME', 'POST_GAME', 'COMPLETED']).optional(),
}).strict();

router.post('/productions', validate(createProductionSchema), async (req: Request, res: Response) => {
  const data = req.body;

  // Verify project exists
  const project = await db.project.findUnique({ where: { id: data.projectId } });
  assertFound(project, 'Project');

  const production = await db.sportsProduction.create({
    data: {
      ...data,
      gameDate: data.gameDate ? new Date(data.gameDate) : undefined,
    },
  });
  res.status(201).json({ production });
});

router.get('/productions/:projectId', async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUnique({
    where: { projectId: req.params.projectId },
    include: {
      highlights: { orderBy: { timestamp: 'asc' }, take: 50 },
      growingFiles: { where: { isGrowing: true } },
      packages: { orderBy: { createdAt: 'desc' } },
    },
  });
  assertFound(production, 'Sports production');
  res.json({ production });
});

router.patch('/productions/:projectId', validate(updateProductionSchema), async (req: Request, res: Response) => {
  const existing = await db.sportsProduction.findUnique({ where: { projectId: req.params.projectId } });
  assertFound(existing, 'Sports production');

  const data = req.body;
  const production = await db.sportsProduction.update({
    where: { projectId: req.params.projectId },
    data: {
      ...data,
      gameDate: data.gameDate ? new Date(data.gameDate) : undefined,
    },
  });
  res.json({ production });
});

// ─── Highlights ──────────────────────────────────────────────────────────────

const createHighlightSchema = z.object({
  eventType: z.enum([
    'GOAL', 'TACKLE', 'DUNK', 'ASSIST', 'PENALTY', 'FOUL',
    'HOME_RUN', 'TOUCHDOWN', 'REPLAY', 'TIMEOUT', 'SUBSTITUTION',
    'YELLOW_CARD', 'RED_CARD', 'OTHER',
  ]),
  gameClock: z.string().max(20).optional(),
  period: z.string().max(20).optional(),
  description: z.string().max(500).optional(),
  confidence: z.number().min(0).max(1).optional(),
  timestamp: z.number().min(0),
  mediaAssetId: z.string().uuid().optional(),
  players: z.array(z.string().max(100)).optional(),
  homeScore: z.number().int().min(0).optional(),
  awayScore: z.number().int().min(0).optional(),
});

const updateHighlightSchema = z.object({
  eventType: z.enum([
    'GOAL', 'TACKLE', 'DUNK', 'ASSIST', 'PENALTY', 'FOUL',
    'HOME_RUN', 'TOUCHDOWN', 'REPLAY', 'TIMEOUT', 'SUBSTITUTION',
    'YELLOW_CARD', 'RED_CARD', 'OTHER',
  ]).optional(),
  gameClock: z.string().max(20).optional(),
  period: z.string().max(20).optional(),
  description: z.string().max(500).optional(),
  confidence: z.number().min(0).max(1).optional(),
  timestamp: z.number().min(0).optional(),
  players: z.array(z.string().max(100)).optional(),
  homeScore: z.number().int().min(0).optional(),
  awayScore: z.number().int().min(0).optional(),
  isUsed: z.boolean().optional(),
}).strict();

router.get('/productions/:projectId/highlights', async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUnique({
    where: { projectId: req.params.projectId },
  });
  assertFound(production, 'Sports production');

  const { eventType, minConfidence } = req.query as Record<string, string>;
  const where: any = { productionId: production.id };
  if (eventType) where.eventType = eventType;
  if (minConfidence) {
    const conf = parseFloat(minConfidence);
    if (isNaN(conf) || conf < 0 || conf > 1) {
      throw new BadRequestError('minConfidence must be a number between 0 and 1');
    }
    where.confidence = { gte: conf };
  }

  const highlights = await db.sportsHighlight.findMany({
    where,
    orderBy: { timestamp: 'asc' },
  });
  res.json({ highlights });
});

router.post('/productions/:projectId/highlights', validate(createHighlightSchema), async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUnique({
    where: { projectId: req.params.projectId },
  });
  assertFound(production, 'Sports production');

  const highlight = await db.sportsHighlight.create({
    data: { ...req.body, productionId: production.id },
  });
  res.status(201).json({ highlight });
});

router.patch('/productions/:projectId/highlights/:id', validate(updateHighlightSchema), async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUnique({
    where: { projectId: req.params.projectId },
  });
  assertFound(production, 'Sports production');

  // Verify highlight belongs to this production
  const existing = await db.sportsHighlight.findFirst({
    where: { id: req.params.id, productionId: production.id },
  });
  assertFound(existing, 'Highlight');

  const highlight = await db.sportsHighlight.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json({ highlight });
});

router.delete('/productions/:projectId/highlights/:id', async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUnique({
    where: { projectId: req.params.projectId },
  });
  assertFound(production, 'Sports production');

  const existing = await db.sportsHighlight.findFirst({
    where: { id: req.params.id, productionId: production.id },
  });
  assertFound(existing, 'Highlight');

  await db.sportsHighlight.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ─── Growing Files ───────────────────────────────────────────────────────────

const createGrowingFileSchema = z.object({
  filePath: z.string().min(1).max(1000),
  format: z.string().max(20).default('MXF'),
  cameraAngle: z.string().max(50).optional(),
});

const updateGrowingFileSchema = z.object({
  currentDuration: z.number().min(0).optional(),
  isGrowing: z.boolean().optional(),
  lastFrameAt: z.string().datetime().optional(),
}).strict();

router.get('/productions/:projectId/growing-files', async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUnique({
    where: { projectId: req.params.projectId },
  });
  assertFound(production, 'Sports production');

  const files = await db.growingFile.findMany({
    where: { productionId: production.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ growingFiles: files });
});

router.post('/productions/:projectId/growing-files', validate(createGrowingFileSchema), async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUnique({
    where: { projectId: req.params.projectId },
  });
  assertFound(production, 'Sports production');

  const file = await db.growingFile.create({
    data: {
      productionId: production.id,
      ...req.body,
    },
  });
  res.status(201).json({ growingFile: file });
});

router.patch('/productions/:projectId/growing-files/:id', validate(updateGrowingFileSchema), async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUnique({
    where: { projectId: req.params.projectId },
  });
  assertFound(production, 'Sports production');

  // Verify file belongs to this production
  const existing = await db.growingFile.findFirst({
    where: { id: req.params.id, productionId: production.id },
  });
  assertFound(existing, 'Growing file');

  const file = await db.growingFile.update({
    where: { id: req.params.id },
    data: {
      ...req.body,
      lastFrameAt: req.body.lastFrameAt ? new Date(req.body.lastFrameAt) : undefined,
    },
  });
  res.json({ growingFile: file });
});

// ─── Stats Snapshots ─────────────────────────────────────────────────────────

router.get('/productions/:projectId/stats', async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUnique({
    where: { projectId: req.params.projectId },
  });
  assertFound(production, 'Sports production');

  const { limit: limitParam } = req.query as Record<string, string>;
  const take = Math.min(parseInt(limitParam, 10) || 100, 500);

  const stats = await db.statsSnapshot.findMany({
    where: { productionId: production.id },
    orderBy: { capturedAt: 'desc' },
    take,
  });
  res.json({ stats });
});

router.get('/productions/:projectId/stats/latest', async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUnique({
    where: { projectId: req.params.projectId },
  });
  assertFound(production, 'Sports production');

  const latest = await db.statsSnapshot.findFirst({
    where: { productionId: production.id },
    orderBy: { capturedAt: 'desc' },
  });
  if (!latest) {
    return res.json({ stats: null, message: 'No stats snapshots available' });
  }
  res.json({ stats: latest });
});

// ─── Sports Packages ─────────────────────────────────────────────────────────

const createPackageSchema = z.object({
  type: z.enum(['PRE_GAME', 'HALFTIME', 'POST_GAME', 'SOCIAL_CLIP', 'HIGHLIGHTS_REEL', 'PLAYER_FEATURE']),
  name: z.string().min(1).max(200),
  targetDuration: z.number().positive().optional(),
  highlightIds: z.array(z.string().uuid()).optional(),
});

const updatePackageSchema = z.object({
  type: z.enum(['PRE_GAME', 'HALFTIME', 'POST_GAME', 'SOCIAL_CLIP', 'HIGHLIGHTS_REEL', 'PLAYER_FEATURE']).optional(),
  name: z.string().min(1).max(200).optional(),
  targetDuration: z.number().positive().optional(),
  highlightIds: z.array(z.string().uuid()).optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETE', 'APPROVED']).optional(),
}).strict();

router.get('/productions/:projectId/packages', async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUnique({
    where: { projectId: req.params.projectId },
  });
  assertFound(production, 'Sports production');

  const packages = await db.sportsPackage.findMany({
    where: { productionId: production.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ packages });
});

router.post('/productions/:projectId/packages', validate(createPackageSchema), async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUnique({
    where: { projectId: req.params.projectId },
  });
  assertFound(production, 'Sports production');

  const pkg = await db.sportsPackage.create({
    data: { ...req.body, productionId: production.id },
  });
  res.status(201).json({ package: pkg });
});

router.patch('/productions/:projectId/packages/:id', validate(updatePackageSchema), async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUnique({
    where: { projectId: req.params.projectId },
  });
  assertFound(production, 'Sports production');

  // Verify package belongs to this production
  const existing = await db.sportsPackage.findFirst({
    where: { id: req.params.id, productionId: production.id },
  });
  assertFound(existing, 'Sports package');

  const pkg = await db.sportsPackage.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json({ package: pkg });
});

router.delete('/productions/:projectId/packages/:id', async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUnique({
    where: { projectId: req.params.projectId },
  });
  assertFound(production, 'Sports production');

  const existing = await db.sportsPackage.findFirst({
    where: { id: req.params.id, productionId: production.id },
  });
  assertFound(existing, 'Sports package');

  await db.sportsPackage.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
