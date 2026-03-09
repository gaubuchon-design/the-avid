/**
 * News Workflow Routes
 * Handles NRCS connections, rundowns, stories, playout destinations
 */
import { Router, Request, Response } from 'express';
import { authenticate, requireProjectAccess } from '../../middleware/auth';
import { db } from '../../db/client';
import {
  validate, validateAll, schemas, uuidParam,
} from '../../utils/validation';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ─── Param schemas ───────────────────────────────────────────────────────────
const storyIdParam = z.object({ id: z.string().uuid() });

// ─── NRCS Connections ─────────────────────────────────────────────────────────

router.get('/nrcs-connections', async (req: Request, res: Response) => {
  const connections = await db.nRCSConnection.findMany({
    where: { isActive: true },
    include: { rundowns: { take: 5, orderBy: { airDate: 'desc' } } },
  });
  res.json({ connections });
});

router.post('/nrcs-connections', validate(schemas.createNRCSConnection), async (req: Request, res: Response) => {
  const connection = await db.nRCSConnection.create({ data: req.body });
  res.status(201).json({ connection });
});

router.patch('/nrcs-connections/:id', validateAll({ params: uuidParam, body: schemas.updateNRCSConnection }), async (req: Request, res: Response) => {
  const connection = await db.nRCSConnection.update({
    where: { id: req.params['id'] },
    data: req.body,
  });
  res.json({ connection });
});

router.delete('/nrcs-connections/:id', validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  await db.nRCSConnection.update({
    where: { id: req.params['id'] },
    data: { isActive: false },
  });
  res.json({ success: true });
});

// ─── Rundowns ─────────────────────────────────────────────────────────────────

router.get('/rundowns', async (req: Request, res: Response) => {
  const { connectionId, date } = req.query;
  const where: any = {};
  if (connectionId) where.nrcsConnectionId = connectionId;
  if (date) {
    const d = new Date(date as string);
    if (!Number.isNaN(d.getTime())) {
      const dayStart = new Date(d);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(d);
      dayEnd.setHours(23, 59, 59, 999);
      where.airDate = { gte: dayStart, lt: dayEnd };
    }
  }
  const rundowns = await db.rundown.findMany({
    where,
    include: { stories: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { airDate: 'desc' },
    take: 20,
  });
  res.json({ rundowns });
});

router.get('/rundowns/:id', validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  const rundown = await db.rundown.findUniqueOrThrow({
    where: { id: req.params['id'] },
    include: {
      stories: { orderBy: { sortOrder: 'asc' } },
      nrcsConnection: true,
    },
  });
  res.json({ rundown });
});

// ─── Stories ──────────────────────────────────────────────────────────────────

router.get('/stories/:id', validate(storyIdParam, 'params'), async (req: Request, res: Response) => {
  const story = await db.newsStory.findUniqueOrThrow({
    where: { id: req.params['id'] },
    include: { rundown: true },
  });
  res.json({ story });
});

router.patch('/stories/:id', validateAll({ params: storyIdParam, body: schemas.updateStory }), async (req: Request, res: Response) => {
  const story = await db.newsStory.update({
    where: { id: req.params['id'] },
    data: req.body,
  });
  res.json({ story });
});

router.post('/stories/:id/assign', validate(storyIdParam, 'params'), async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const story = await db.newsStory.update({
    where: { id: req.params['id'] },
    data: { assignedEditorId: userId, status: 'IN_EDIT' },
  });
  res.json({ story });
});

router.post('/stories/:id/mark-ready', validate(storyIdParam, 'params'), async (req: Request, res: Response) => {
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
    const story = await db.newsStory.findUniqueOrThrow({
      where: { id: req.params['id'] },
    });

    // Get playout destination
    const destination = await db.playoutDestination.findUniqueOrThrow({
      where: { id: destinationId },
    });

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

router.get('/playout-destinations', async (req: Request, res: Response) => {
  const destinations = await db.playoutDestination.findMany({
    where: { isActive: true },
  });
  res.json({ destinations });
});

router.post('/playout-destinations', validate(schemas.createPlayoutDestination), async (req: Request, res: Response) => {
  const destination = await db.playoutDestination.create({ data: req.body });
  res.status(201).json({ destination });
});

router.delete('/playout-destinations/:id', validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  await db.playoutDestination.update({
    where: { id: req.params['id'] },
    data: { isActive: false },
  });
  res.json({ success: true });
});

export default router;
