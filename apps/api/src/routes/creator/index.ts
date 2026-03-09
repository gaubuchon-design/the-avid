/**
 * Creator Workflow Routes
 * Handles series/channel management, episodes, performance analytics
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { db } from '../../db/client';
import { validate, paginationQuery } from '../../utils/validation';
import { assertFound, NotFoundError, ForbiddenError } from '../../utils/errors';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ─── Series / Channels ───────────────────────────────────────────────────────

const createSeriesSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  brandColors: z.array(z.string()).default([]),
  brandFonts: z.record(z.string()).default({}),
});

const updateSeriesSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  brandColors: z.array(z.string()).optional(),
  brandFonts: z.record(z.string()).optional(),
}).strict();

router.get('/series', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const series = await db.series.findMany({
    where: { userId },
    include: {
      episodes: { orderBy: { episodeNumber: 'desc' }, take: 10 },
      _count: { select: { episodes: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ series });
});

router.get('/series/:id', async (req: Request, res: Response) => {
  const series = await db.series.findUnique({
    where: { id: req.params.id },
    include: {
      episodes: { orderBy: { episodeNumber: 'asc' } },
    },
  });
  assertFound(series, 'Series');

  // Verify ownership
  if (series.userId !== req.user!.id) {
    throw new ForbiddenError('Not the series owner');
  }
  res.json({ series });
});

router.post('/series', validate(createSeriesSchema), async (req: Request, res: Response) => {
  const series = await db.series.create({
    data: { userId: req.user!.id, ...req.body },
  });
  res.status(201).json({ series });
});

router.patch('/series/:id', validate(updateSeriesSchema), async (req: Request, res: Response) => {
  // Verify ownership
  const existing = await db.series.findUnique({ where: { id: req.params.id } });
  assertFound(existing, 'Series');
  if (existing.userId !== req.user!.id) throw new ForbiddenError('Not the series owner');

  const series = await db.series.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json({ series });
});

router.delete('/series/:id', async (req: Request, res: Response) => {
  const existing = await db.series.findUnique({ where: { id: req.params.id } });
  assertFound(existing, 'Series');
  if (existing.userId !== req.user!.id) throw new ForbiddenError('Not the series owner');

  await db.series.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ─── Episodes ────────────────────────────────────────────────────────────────

const createEpisodeSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  projectId: z.string().uuid().optional(),
});

router.post('/series/:seriesId/episodes', validate(createEpisodeSchema), async (req: Request, res: Response) => {
  // Verify series ownership
  const series = await db.series.findUnique({ where: { id: req.params.seriesId } });
  assertFound(series, 'Series');
  if (series.userId !== req.user!.id) throw new ForbiddenError('Not the series owner');

  // Auto-calculate next episode number
  const lastEpisode = await db.episode.findFirst({
    where: { seriesId: req.params.seriesId },
    orderBy: { episodeNumber: 'desc' },
  });

  const episode = await db.episode.create({
    data: {
      seriesId: req.params.seriesId,
      episodeNumber: (lastEpisode?.episodeNumber || 0) + 1,
      ...req.body,
    },
  });
  res.status(201).json({ episode });
});

router.patch('/series/:seriesId/episodes/:id', async (req: Request, res: Response) => {
  const episode = await db.episode.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json({ episode });
});

router.post('/series/:seriesId/episodes/:id/publish', async (req: Request, res: Response) => {
  const episode = await db.episode.update({
    where: { id: req.params.id },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });
  res.json({ episode });
});

// ─── Agent Memory ────────────────────────────────────────────────────────────

router.get('/agent-memory', async (req: Request, res: Response) => {
  const memories = await db.agentMemory.findMany({
    where: { userId: req.user!.id },
    orderBy: { lastUsedAt: 'desc' },
  });
  res.json({ memories });
});

const upsertMemorySchema = z.object({
  value: z.unknown(),
  source: z.enum(['AUTO', 'MANUAL', 'FEEDBACK']).default('AUTO'),
  confidence: z.number().min(0).max(1).default(0.8),
});

router.put('/agent-memory/:key', validate(upsertMemorySchema), async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const memory = await db.agentMemory.upsert({
    where: { userId_key: { userId, key: req.params.key } },
    create: {
      userId,
      key: req.params.key,
      ...req.body,
    },
    update: {
      value: req.body.value,
      confidence: req.body.confidence,
      lastUsedAt: new Date(),
    },
  });
  res.json({ memory });
});

router.delete('/agent-memory/:key', async (req: Request, res: Response) => {
  await db.agentMemory.delete({
    where: { userId_key: { userId: req.user!.id, key: req.params.key } },
  });
  res.status(204).send();
});

// ─── Agent Playbooks ─────────────────────────────────────────────────────────

const createPlaybookSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  vertical: z.string().max(50).default('GENERAL'),
  steps: z.array(z.record(z.unknown())).default([]),
  variables: z.array(z.record(z.unknown())).default([]),
  priceTokens: z.number().int().min(0).default(0),
});

router.get('/playbooks', async (req: Request, res: Response) => {
  const { vertical } = req.query as Record<string, string>;
  const where: any = { isPublished: true };
  if (vertical) where.vertical = vertical;

  const playbooks = await db.agentPlaybook.findMany({
    where,
    orderBy: { usageCount: 'desc' },
    take: 50,
  });
  res.json({ playbooks });
});

router.get('/playbooks/mine', async (req: Request, res: Response) => {
  const playbooks = await db.agentPlaybook.findMany({
    where: { authorId: req.user!.id },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ playbooks });
});

router.post('/playbooks', validate(createPlaybookSchema), async (req: Request, res: Response) => {
  const playbook = await db.agentPlaybook.create({
    data: { authorId: req.user!.id, ...req.body },
  });
  res.status(201).json({ playbook });
});

router.patch('/playbooks/:id', async (req: Request, res: Response) => {
  // Verify ownership
  const existing = await db.agentPlaybook.findUnique({ where: { id: req.params.id } });
  assertFound(existing, 'Playbook');
  if (existing.authorId !== req.user!.id) throw new ForbiddenError('Not the playbook author');

  const playbook = await db.agentPlaybook.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json({ playbook });
});

router.post('/playbooks/:id/use', async (req: Request, res: Response) => {
  const playbook = await db.agentPlaybook.update({
    where: { id: req.params.id },
    data: { usageCount: { increment: 1 } },
  });
  res.json({ playbook });
});

export default router;
