/**
 * News Workflow Routes
 * Handles NRCS connections, rundowns, stories, playout destinations
 */
import { Router, Request, Response } from 'express';
import { authenticate, requireProjectAccess } from '../../middleware/auth';
import { db } from '../../db/client';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ─── NRCS Connections ─────────────────────────────────────────────────────────

const createNRCSSchema = z.object({
  type: z.enum(['INEWS', 'ENPS', 'OCTOPUS', 'OPENMEDIA']),
  host: z.string().min(1),
  port: z.number().int().positive(),
  username: z.string().optional(),
  password: z.string().optional(),
  orgId: z.string().uuid(),
});

router.get('/nrcs-connections', async (req: Request, res: Response) => {
  const connections = await db.nRCSConnection.findMany({
    where: { isActive: true },
    include: { rundowns: { take: 5, orderBy: { airDate: 'desc' } } },
  });
  res.json({ connections });
});

router.post('/nrcs-connections', async (req: Request, res: Response) => {
  const data = createNRCSSchema.parse(req.body);
  const connection = await db.nRCSConnection.create({ data });
  res.status(201).json({ connection });
});

router.patch('/nrcs-connections/:id', async (req: Request, res: Response) => {
  const connection = await db.nRCSConnection.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json({ connection });
});

router.delete('/nrcs-connections/:id', async (req: Request, res: Response) => {
  await db.nRCSConnection.update({
    where: { id: req.params.id },
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
  const rundown = await db.rundown.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      stories: { orderBy: { sortOrder: 'asc' } },
      nrcsConnection: true,
    },
  });
  res.json({ rundown });
});

// ─── Stories ──────────────────────────────────────────────────────────────────

const updateStorySchema = z.object({
  status: z.enum(['UNASSIGNED', 'IN_EDIT', 'READY', 'AIRED', 'KILLED']).optional(),
  assignedEditorId: z.string().uuid().optional().nullable(),
  actualDuration: z.number().optional(),
  priority: z.number().int().min(0).max(2).optional(),
});

router.get('/stories/:id', async (req: Request, res: Response) => {
  const story = await db.newsStory.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { rundown: true },
  });
  res.json({ story });
});

router.patch('/stories/:id', async (req: Request, res: Response) => {
  const data = updateStorySchema.parse(req.body);
  const story = await db.newsStory.update({
    where: { id: req.params.id },
    data,
  });
  res.json({ story });
});

router.post('/stories/:id/assign', async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const story = await db.newsStory.update({
    where: { id: req.params.id },
    data: { assignedEditorId: userId, status: 'IN_EDIT' },
  });
  res.json({ story });
});

router.post('/stories/:id/mark-ready', async (req: Request, res: Response) => {
  const story = await db.newsStory.update({
    where: { id: req.params.id },
    data: { status: 'READY' },
  });
  res.json({ story });
});

router.post('/stories/:id/send-to-air', async (req: Request, res: Response) => {
  const { destinationId } = req.body;
  const story = await db.newsStory.findUniqueOrThrow({
    where: { id: req.params.id },
  });

  // Get playout destination
  const destination = await db.playoutDestination.findUniqueOrThrow({
    where: { id: destinationId },
  });

  // In production: export MXF and FTP to playout server
  // For now, mark story as aired
  const updated = await db.newsStory.update({
    where: { id: req.params.id },
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
  name: z.string().min(1),
  type: z.enum(['AIRSPEED', 'VIZ_ARK', 'ROSS_STRATUS', 'GRASS_VALLEY_K2', 'GENERIC_MXF_FTP']),
  host: z.string().min(1),
  port: z.number().int().optional(),
  basePath: z.string().optional(),
  filenamePattern: z.string().optional(),
  outputFormat: z.string().optional(),
});

router.get('/playout-destinations', async (req: Request, res: Response) => {
  const destinations = await db.playoutDestination.findMany({
    where: { isActive: true },
  });
  res.json({ destinations });
});

router.post('/playout-destinations', async (req: Request, res: Response) => {
  const data = createPlayoutSchema.parse(req.body);
  const destination = await db.playoutDestination.create({ data });
  res.status(201).json({ destination });
});

router.delete('/playout-destinations/:id', async (req: Request, res: Response) => {
  await db.playoutDestination.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });
  res.json({ success: true });
});

export default router;
