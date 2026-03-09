/**
 * Creator Workflow Routes
 * Handles series/channel management, episodes, performance analytics
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { db } from '../../db/client';
import {
  validate, validateAll, schemas, uuidParam,
} from '../../utils/validation';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ─── Compound param schemas for nested routes ───────────────────────────────
const seriesIdParam = z.object({ id: z.string().uuid() });
const seriesAndEpisodeParams = z.object({ seriesId: z.string().uuid(), id: z.string().uuid() });
const seriesIdOnlyParam = z.object({ seriesId: z.string().uuid() });
const keyParam = z.object({ key: z.string().min(1).max(200) });

// ─── Series / Channels ───────────────────────────────────────────────────────

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

router.get('/series/:id', validate(seriesIdParam, 'params'), async (req: Request, res: Response) => {
  const series = await db.series.findUniqueOrThrow({
    where: { id: req.params['id'] },
    include: {
      episodes: { orderBy: { episodeNumber: 'asc' } },
    },
  });
  res.json({ series });
});

router.post('/series', validate(schemas.createSeries), async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const series = await db.series.create({
    data: {
      userId,
      ...req.body,
    },
  });
  res.status(201).json({ series });
});

router.patch('/series/:id', validateAll({ params: seriesIdParam, body: schemas.updateSeries }), async (req: Request, res: Response) => {
  const series = await db.series.update({
    where: { id: req.params['id'] },
    data: req.body,
  });
  res.json({ series });
});

router.delete('/series/:id', validate(seriesIdParam, 'params'), async (req: Request, res: Response) => {
  await db.series.delete({ where: { id: req.params['id'] } });
  res.json({ success: true });
});

// ─── Episodes ────────────────────────────────────────────────────────────────

router.post(
  '/series/:seriesId/episodes',
  validateAll({ params: seriesIdOnlyParam, body: schemas.createEpisode }),
  async (req: Request, res: Response) => {
    // Auto-calculate next episode number
    const lastEpisode = await db.episode.findFirst({
      where: { seriesId: req.params['seriesId'] },
      orderBy: { episodeNumber: 'desc' },
    });

    const episode = await db.episode.create({
      data: {
        seriesId: req.params['seriesId'],
        episodeNumber: (lastEpisode?.episodeNumber || 0) + 1,
        ...req.body,
      },
    });
    res.status(201).json({ episode });
  }
);

router.patch(
  '/series/:seriesId/episodes/:id',
  validateAll({ params: seriesAndEpisodeParams, body: schemas.updateEpisode }),
  async (req: Request, res: Response) => {
    const episode = await db.episode.update({
      where: { id: req.params['id'] },
      data: req.body,
    });
    res.json({ episode });
  }
);

router.post('/series/:seriesId/episodes/:id/publish', validate(seriesAndEpisodeParams, 'params'), async (req: Request, res: Response) => {
  const episode = await db.episode.update({
    where: { id: req.params['id'] },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });
  res.json({ episode });
});

// ─── Agent Memory ────────────────────────────────────────────────────────────

router.get('/agent-memory', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const memories = await db.agentMemory.findMany({
    where: { userId },
    orderBy: { lastUsedAt: 'desc' },
  });
  res.json({ memories });
});

router.put(
  '/agent-memory/:key',
  validateAll({ params: keyParam, body: schemas.upsertAgentMemory }),
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { value, source, confidence } = req.body;
    const memory = await db.agentMemory.upsert({
      where: { userId_key: { userId, key: req.params['key'] } },
      create: {
        userId,
        key: req.params['key'],
        value,
        source,
        confidence,
      },
      update: {
        value,
        confidence,
        lastUsedAt: new Date(),
      },
    });
    res.json({ memory });
  }
);

router.delete('/agent-memory/:key', validate(keyParam, 'params'), async (req: Request, res: Response) => {
  const userId = req.user!.id;
  await db.agentMemory.delete({
    where: { userId_key: { userId, key: req.params['key'] } },
  });
  res.json({ success: true });
});

// ─── Agent Playbooks ─────────────────────────────────────────────────────────

router.get('/playbooks', async (req: Request, res: Response) => {
  const { vertical } = req.query;
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
  const userId = req.user!.id;
  const playbooks = await db.agentPlaybook.findMany({
    where: { authorId: userId },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ playbooks });
});

router.post('/playbooks', validate(schemas.createPlaybook), async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const playbook = await db.agentPlaybook.create({
    data: {
      authorId: userId,
      ...req.body,
    },
  });
  res.status(201).json({ playbook });
});

router.patch('/playbooks/:id', validateAll({ params: uuidParam, body: schemas.updatePlaybook }), async (req: Request, res: Response) => {
  const playbook = await db.agentPlaybook.update({
    where: { id: req.params['id'] },
    data: req.body,
  });
  res.json({ playbook });
});

router.post('/playbooks/:id/use', validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  const playbook = await db.agentPlaybook.update({
    where: { id: req.params['id'] },
    data: { usageCount: { increment: 1 } },
  });
  res.json({ playbook });
});

export default router;
