/**
 * News Workflow Routes
 * Handles NRCS connections, rundowns, stories, playout destinations
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { db } from '../../db/client';
import {
  validate, validateAll, schemas, uuidParam, paginationQuery, paginate,
} from '../../utils/validation';
import { NotFoundError } from '../../utils/errors';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ─── Param schemas ───────────────────────────────────────────────────────────
const storyIdParam = z.object({ id: z.string().uuid() });

const rundownQuery = paginationQuery.extend({
  connectionId: z.string().uuid().optional(),
  date: z.string().optional(),
});

// ─── NRCS Connections ─────────────────────────────────────────────────────────

router.get('/nrcs-connections', async (req: Request, res: Response) => {
  const connections = await db.nRCSConnection.findMany({
    where: { isActive: true },
    include: { rundowns: { take: 5, orderBy: { airDate: 'desc' } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ connections });
});

router.post('/nrcs-connections', validate(schemas.createNRCSConnection), async (req: Request, res: Response) => {
  const connection = await db.nRCSConnection.create({ data: req.body });
  res.status(201).json({ connection });
});

router.patch('/nrcs-connections/:id', validateAll({ params: uuidParam, body: schemas.updateNRCSConnection }), async (req: Request, res: Response) => {
  const existing = await db.nRCSConnection.findUnique({ where: { id: req.params['id'] } });
  if (!existing) throw new NotFoundError('NRCS connection');

  const connection = await db.nRCSConnection.update({
    where: { id: req.params['id'] },
    data: req.body,
  });
  res.json({ connection });
});

router.delete('/nrcs-connections/:id', validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  const existing = await db.nRCSConnection.findUnique({ where: { id: req.params['id'] } });
  if (!existing) throw new NotFoundError('NRCS connection');

  await db.nRCSConnection.update({
    where: { id: req.params['id'] },
    data: { isActive: false },
  });
  res.status(204).send();
});

// ─── Rundowns ─────────────────────────────────────────────────────────────────

router.get('/', validate(rundownQuery, 'query'), async (req: Request, res: Response) => {
  const { page, limit, sortOrder } = req.query as any;
  const { connectionId, date } = req.query as Record<string, string | undefined>;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (connectionId) where['nrcsConnectionId'] = connectionId;
  if (date) {
    const d = new Date(date);
    if (!Number.isNaN(d.getTime())) {
      const dayStart = new Date(d);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(d);
      dayEnd.setHours(23, 59, 59, 999);
      where['airDate'] = { gte: dayStart, lt: dayEnd };
    }
  }

  const [rundowns, total] = await Promise.all([
    db.rundown.findMany({
      where,
      include: { stories: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { airDate: sortOrder },
      skip,
      take: limit,
    }),
    db.rundown.count({ where }),
  ]);
  res.json({ rundowns, pagination: paginate(total, page, limit) });
});

router.get('/rundowns/:id', validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  const rundown = await db.rundown.findUnique({
    where: { id: req.params['id'] },
    include: {
      stories: { orderBy: { sortOrder: 'asc' } },
      nrcsConnection: true,
    },
  });
  if (!rundown) throw new NotFoundError('Rundown');
  res.json({ rundown });
});

// ─── Stories ──────────────────────────────────────────────────────────────────

router.get('/stories/:id', validate(storyIdParam, 'params'), async (req: Request, res: Response) => {
  const story = await db.newsStory.findUnique({
    where: { id: req.params['id'] },
    include: { rundown: true },
  });
  if (!story) throw new NotFoundError('News story');
  res.json({ story });
});

router.patch('/stories/:id', validateAll({ params: storyIdParam, body: schemas.updateStory }), async (req: Request, res: Response) => {
  const existing = await db.newsStory.findUnique({ where: { id: req.params['id'] } });
  if (!existing) throw new NotFoundError('News story');

  const story = await db.newsStory.update({
    where: { id: req.params['id'] },
    data: req.body,
  });
  res.json({ story });
});

router.post('/stories/:id/assign', validate(storyIdParam, 'params'), async (req: Request, res: Response) => {
  const existing = await db.newsStory.findUnique({ where: { id: req.params['id'] } });
  if (!existing) throw new NotFoundError('News story');

  const userId = req.user!.id;
  const story = await db.newsStory.update({
    where: { id: req.params['id'] },
    data: { assignedEditorId: userId, status: 'IN_EDIT' },
  });
  res.json({ story });
});

router.post('/stories/:id/mark-ready', validate(storyIdParam, 'params'), async (req: Request, res: Response) => {
  const existing = await db.newsStory.findUnique({ where: { id: req.params['id'] } });
  if (!existing) throw new NotFoundError('News story');

  const story = await db.newsStory.update({
    where: { id: req.params['id'] },
    data: { status: 'READY' },
  });
  res.json({ story });
});

router.post(
  '/stories/:id/send-to-air',
  validateAll({ params: storyIdParam, body: schemas.sendToAir }),
  async (req: Request, res: Response) => {
    const { destinationId } = req.body;
    const story = await db.newsStory.findUnique({ where: { id: req.params['id'] } });
    if (!story) throw new NotFoundError('News story');

    const destination = await db.playoutDestination.findUnique({ where: { id: destinationId } });
    if (!destination) throw new NotFoundError('Playout destination');

    // In production: export MXF and FTP to playout server
    const updated = await db.newsStory.update({
      where: { id: req.params['id'] },
      data: { status: 'AIRED' },
    });

    res.json({
      story: updated,
      playout: {
        destination: destination.name,
        status: 'QUEUED',
        message: `Exporting to ${destination.type} at ${destination.host}`,
      },
    });
  }
);

// ─── Playout Destinations ─────────────────────────────────────────────────────

router.get('/playout-destinations', async (_req: Request, res: Response) => {
  const destinations = await db.playoutDestination.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
  res.json({ destinations });
});

router.post('/playout-destinations', validate(schemas.createPlayoutDestination), async (req: Request, res: Response) => {
  const destination = await db.playoutDestination.create({ data: req.body });
  res.status(201).json({ destination });
});

router.delete('/playout-destinations/:id', validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  const existing = await db.playoutDestination.findUnique({ where: { id: req.params['id'] } });
  if (!existing) throw new NotFoundError('Playout destination');

  await db.playoutDestination.update({
    where: { id: req.params['id'] },
    data: { isActive: false },
  });
  res.status(204).send();
});

export default router;
