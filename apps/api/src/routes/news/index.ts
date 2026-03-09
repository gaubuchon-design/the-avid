/**
 * News Workflow Routes
 * Handles NRCS connections, rundowns, stories, playout destinations
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { db } from '../../db/client';
import { validate } from '../../utils/validation';
import { assertFound, ForbiddenError } from '../../utils/errors';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ─── NRCS Connections ─────────────────────────────────────────────────────────

const createNRCSSchema = z.object({
  type: z.enum(['INEWS', 'ENPS', 'OCTOPUS', 'OPENMEDIA']),
  host: z.string().min(1).max(255),
  port: z.number().int().positive().max(65535),
  username: z.string().max(100).optional(),
  password: z.string().max(200).optional(),
  orgId: z.string().uuid(),
});

const updateNRCSSchema = z.object({
  type: z.enum(['INEWS', 'ENPS', 'OCTOPUS', 'OPENMEDIA']).optional(),
  host: z.string().min(1).max(255).optional(),
  port: z.number().int().positive().max(65535).optional(),
  username: z.string().max(100).optional(),
  password: z.string().max(200).optional(),
}).strict();

router.get('/nrcs-connections', async (req: Request, res: Response) => {
  const { orgId } = req.query as Record<string, string>;
  const connections = await db.nRCSConnection.findMany({
    where: {
      isActive: true,
      ...(orgId ? { orgId } : {}),
    },
    include: { rundowns: { take: 5, orderBy: { airDate: 'desc' } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ connections });
});

router.get('/nrcs-connections/:id', async (req: Request, res: Response) => {
  const connection = await db.nRCSConnection.findUnique({
    where: { id: req.params['id'] },
    include: { rundowns: { take: 10, orderBy: { airDate: 'desc' } } },
  });
  assertFound(connection, 'NRCS connection');
  res.json({ connection });
});

router.post('/nrcs-connections', validate(createNRCSSchema), async (req: Request, res: Response) => {
  const connection = await db.nRCSConnection.create({ data: req.body });
  res.status(201).json({ connection });
});

router.patch('/nrcs-connections/:id', validate(updateNRCSSchema), async (req: Request, res: Response) => {
  const existing = await db.nRCSConnection.findUnique({ where: { id: req.params['id'] } });
  assertFound(existing, 'NRCS connection');

  const connection = await db.nRCSConnection.update({
    where: { id: req.params['id'] },
    data: req.body,
  });
  res.json({ connection });
});

router.delete('/nrcs-connections/:id', async (req: Request, res: Response) => {
  const existing = await db.nRCSConnection.findUnique({ where: { id: req.params['id'] } });
  assertFound(existing, 'NRCS connection');

  await db.nRCSConnection.update({
    where: { id: req.params['id'] },
    data: { isActive: false },
  });
  res.status(204).send();
});

// ─── Rundowns ─────────────────────────────────────────────────────────────────

router.get('/rundowns', async (req: Request, res: Response) => {
  const { connectionId, date } = req.query as Record<string, string>;
  const where: any = {};
  if (connectionId) where.nrcsConnectionId = connectionId;
  if (date) {
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      return res.status(400).json({
        error: { message: 'Invalid date format', code: 'VALIDATION_ERROR' },
      });
    }
    where.airDate = {
      gte: new Date(d.setHours(0, 0, 0, 0)),
      lt: new Date(d.setHours(23, 59, 59, 999)),
    };
  }
  const rundowns = await db.rundown.findMany({
    where,
    include: { stories: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { airDate: 'desc' },
    take: 20,
  });
  res.json({ rundowns });
});

router.get('/rundowns/:id', async (req: Request, res: Response) => {
  const rundown = await db.rundown.findUnique({
    where: { id: req.params['id'] },
    include: {
      stories: { orderBy: { sortOrder: 'asc' } },
      nrcsConnection: true,
    },
  });
  assertFound(rundown, 'Rundown');
  res.json({ rundown });
});

// ─── Stories ──────────────────────────────────────────────────────────────────

const updateStorySchema = z.object({
  status: z.enum(['UNASSIGNED', 'IN_EDIT', 'READY', 'AIRED', 'KILLED']).optional(),
  assignedEditorId: z.string().uuid().optional().nullable(),
  actualDuration: z.number().positive().optional(),
  priority: z.number().int().min(0).max(2).optional(),
}).strict();

const sendToAirSchema = z.object({
  destinationId: z.string().uuid(),
});

router.get('/stories/:id', async (req: Request, res: Response) => {
  const story = await db.newsStory.findUnique({
    where: { id: req.params['id'] },
    include: { rundown: true },
  });
  assertFound(story, 'News story');
  res.json({ story });
});

router.patch('/stories/:id', validate(updateStorySchema), async (req: Request, res: Response) => {
  const existing = await db.newsStory.findUnique({ where: { id: req.params['id'] } });
  assertFound(existing, 'News story');

  const story = await db.newsStory.update({
    where: { id: req.params['id'] },
    data: req.body,
  });
  res.json({ story });
});

router.post('/stories/:id/assign', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const existing = await db.newsStory.findUnique({ where: { id: req.params['id'] } });
  assertFound(existing, 'News story');

  const story = await db.newsStory.update({
    where: { id: req.params['id'] },
    data: { assignedEditorId: userId, status: 'IN_EDIT' },
  });
  res.json({ story });
});

router.post('/stories/:id/mark-ready', async (req: Request, res: Response) => {
  const existing = await db.newsStory.findUnique({ where: { id: req.params['id'] } });
  assertFound(existing, 'News story');

  // Only the assigned editor or an unassigned story can be marked ready
  if (existing.assignedEditorId && existing.assignedEditorId !== req.user!.id) {
    throw new ForbiddenError('Only the assigned editor can mark a story as ready');
  }

  const story = await db.newsStory.update({
    where: { id: req.params['id'] },
    data: { status: 'READY' },
  });
  res.json({ story });
});

router.post('/stories/:id/send-to-air', validate(sendToAirSchema), async (req: Request, res: Response) => {
  const { destinationId } = req.body;

  const story = await db.newsStory.findUnique({ where: { id: req.params['id'] } });
  assertFound(story, 'News story');

  if (story.status !== 'READY') {
    return res.status(400).json({
      error: { message: 'Story must be in READY status to send to air', code: 'BAD_REQUEST' },
    });
  }

  const destination = await db.playoutDestination.findUnique({ where: { id: destinationId } });
  assertFound(destination, 'Playout destination');

  if (!destination.isActive) {
    return res.status(400).json({
      error: { message: 'Playout destination is inactive', code: 'BAD_REQUEST' },
    });
  }

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
});

// ─── Playout Destinations ─────────────────────────────────────────────────────

const createPlayoutSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(1).max(200),
  type: z.enum(['AIRSPEED', 'VIZ_ARK', 'ROSS_STRATUS', 'GRASS_VALLEY_K2', 'GENERIC_MXF_FTP']),
  host: z.string().min(1).max(255),
  port: z.number().int().positive().max(65535).optional(),
  basePath: z.string().max(500).optional(),
  filenamePattern: z.string().max(200).optional(),
  outputFormat: z.string().max(50).optional(),
});

const updatePlayoutSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.enum(['AIRSPEED', 'VIZ_ARK', 'ROSS_STRATUS', 'GRASS_VALLEY_K2', 'GENERIC_MXF_FTP']).optional(),
  host: z.string().min(1).max(255).optional(),
  port: z.number().int().positive().max(65535).optional(),
  basePath: z.string().max(500).optional(),
  filenamePattern: z.string().max(200).optional(),
  outputFormat: z.string().max(50).optional(),
}).strict();

router.get('/playout-destinations', async (req: Request, res: Response) => {
  const { orgId } = req.query as Record<string, string>;
  const destinations = await db.playoutDestination.findMany({
    where: {
      isActive: true,
      ...(orgId ? { orgId } : {}),
    },
    orderBy: { name: 'asc' },
  });
  res.json({ destinations });
});

router.get('/playout-destinations/:id', async (req: Request, res: Response) => {
  const destination = await db.playoutDestination.findUnique({
    where: { id: req.params['id'] },
  });
  assertFound(destination, 'Playout destination');
  res.json({ destination });
});

router.post('/playout-destinations', validate(createPlayoutSchema), async (req: Request, res: Response) => {
  const destination = await db.playoutDestination.create({ data: req.body });
  res.status(201).json({ destination });
});

router.patch('/playout-destinations/:id', validate(updatePlayoutSchema), async (req: Request, res: Response) => {
  const existing = await db.playoutDestination.findUnique({ where: { id: req.params['id'] } });
  assertFound(existing, 'Playout destination');

  const destination = await db.playoutDestination.update({
    where: { id: req.params['id'] },
    data: req.body,
  });
  res.json({ destination });
});

router.delete('/playout-destinations/:id', async (req: Request, res: Response) => {
  const existing = await db.playoutDestination.findUnique({ where: { id: req.params['id'] } });
  assertFound(existing, 'Playout destination');

  await db.playoutDestination.update({
    where: { id: req.params['id'] },
    data: { isActive: false },
  });
  res.status(204).send();
});

export default router;
