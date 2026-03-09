/**
 * Sports Production Routes
 * Handles sports productions, highlights, growing files, stats, packages
 */
import { Router, Request, Response } from 'express';
import { authenticate, requireProjectAccess } from '../../middleware/auth';
import { db } from '../../db/client';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ─── Sports Productions ──────────────────────────────────────────────────────

const createProductionSchema = z.object({
  projectId: z.string().uuid(),
  sport: z.enum(['SOCCER', 'BASKETBALL', 'FOOTBALL', 'BASEBALL', 'HOCKEY', 'TENNIS', 'CRICKET', 'RUGBY', 'OTHER']),
  competitionName: z.string().optional(),
  venue: z.string().optional(),
  homeTeam: z.string().optional(),
  awayTeam: z.string().optional(),
  gameDate: z.string().datetime().optional(),
  broadcastNetwork: z.string().optional(),
  evsServerHost: z.string().optional(),
  statsProvider: z.string().optional(),
});

router.post('/productions', async (req: Request, res: Response) => {
  const data = createProductionSchema.parse(req.body);
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
  res.json({ production });
});

router.patch('/productions/:projectId', async (req: Request, res: Response) => {
  const allowed = ['sport', 'competitionName', 'venue', 'homeTeam', 'awayTeam', 'broadcastNetwork', 'evsServerHost', 'statsProvider', 'status'];
  const data: any = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
  if (req.body.gameDate) data.gameDate = new Date(req.body.gameDate);

  const production = await db.sportsProduction.update({
    where: { projectId: req.params.projectId },
    data,
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
  gameClock: z.string().optional(),
  period: z.string().optional(),
  description: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  timestamp: z.number(),
  mediaAssetId: z.string().uuid().optional(),
  players: z.array(z.string()).optional(),
  homeScore: z.number().int().optional(),
  awayScore: z.number().int().optional(),
});

router.get('/productions/:projectId/highlights', async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUniqueOrThrow({
    where: { projectId: req.params.projectId },
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

router.post('/productions/:projectId/highlights', async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUniqueOrThrow({
    where: { projectId: req.params.projectId },
  });
  const data = createHighlightSchema.parse(req.body);
  const highlight = await db.sportsHighlight.create({
    data: { ...data, productionId: production.id },
  });
  res.status(201).json({ highlight });
});

router.patch('/productions/:projectId/highlights/:id', async (req: Request, res: Response) => {
  const allowed = ['eventType', 'gameClock', 'period', 'description', 'confidence', 'timestamp', 'players', 'homeScore', 'awayScore', 'isConfirmed'];
  const data: any = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) data[k] = req.body[k]; });

  const highlight = await db.sportsHighlight.update({
    where: { id: req.params.id },
    data,
  });
  res.json({ highlight });
});

// ─── Growing Files ───────────────────────────────────────────────────────────

router.get('/productions/:projectId/growing-files', async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUniqueOrThrow({
    where: { projectId: req.params.projectId },
  });
  const files = await db.growingFile.findMany({
    where: { productionId: production.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ growingFiles: files });
});

router.post('/productions/:projectId/growing-files', async (req: Request, res: Response) => {
  const { filePath } = req.body;
  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).json({ error: { message: 'filePath is required', code: 'BAD_REQUEST' } });
  }
  const production = await db.sportsProduction.findUniqueOrThrow({
    where: { projectId: req.params.projectId },
  });
  const file = await db.growingFile.create({
    data: {
      productionId: production.id,
      filePath,
      format: req.body.format || 'MXF',
      cameraAngle: req.body.cameraAngle,
    },
  });
  res.status(201).json({ growingFile: file });
});

router.patch('/productions/:projectId/growing-files/:id', async (req: Request, res: Response) => {
  const file = await db.growingFile.update({
    where: { id: req.params.id },
    data: {
      currentDuration: req.body.currentDuration,
      isGrowing: req.body.isGrowing,
      lastFrameAt: req.body.lastFrameAt ? new Date(req.body.lastFrameAt) : undefined,
    },
  });
  res.json({ growingFile: file });
});

// ─── Stats Snapshots ─────────────────────────────────────────────────────────

router.get('/productions/:projectId/stats', async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUniqueOrThrow({
    where: { projectId: req.params.projectId },
  });
  const stats = await db.statsSnapshot.findMany({
    where: { productionId: production.id },
    orderBy: { capturedAt: 'desc' },
    take: 100,
  });
  res.json({ stats });
});

router.get('/productions/:projectId/stats/latest', async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUniqueOrThrow({
    where: { projectId: req.params.projectId },
  });
  const latest = await db.statsSnapshot.findFirst({
    where: { productionId: production.id },
    orderBy: { capturedAt: 'desc' },
  });
  res.json({ stats: latest });
});

// ─── Sports Packages ─────────────────────────────────────────────────────────

const createPackageSchema = z.object({
  type: z.enum(['PRE_GAME', 'HALFTIME', 'POST_GAME', 'SOCIAL_CLIP', 'HIGHLIGHTS_REEL', 'PLAYER_FEATURE']),
  name: z.string().min(1),
  targetDuration: z.number().optional(),
  highlightIds: z.array(z.string()).optional(),
});

router.get('/productions/:projectId/packages', async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUniqueOrThrow({
    where: { projectId: req.params.projectId },
  });
  const packages = await db.sportsPackage.findMany({
    where: { productionId: production.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ packages });
});

router.post('/productions/:projectId/packages', async (req: Request, res: Response) => {
  const production = await db.sportsProduction.findUniqueOrThrow({
    where: { projectId: req.params.projectId },
  });
  const data = createPackageSchema.parse(req.body);
  const pkg = await db.sportsPackage.create({
    data: { ...data, productionId: production.id },
  });
  res.status(201).json({ package: pkg });
});

router.patch('/productions/:projectId/packages/:id', async (req: Request, res: Response) => {
  const allowed = ['type', 'name', 'status', 'targetDuration', 'highlightIds', 'timelineId'];
  const data: any = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) data[k] = req.body[k]; });

  const pkg = await db.sportsPackage.update({
    where: { id: req.params.id },
    data,
  });
  res.json({ package: pkg });
});

export default router;
