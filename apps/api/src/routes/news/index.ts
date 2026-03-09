/**
 * News Workflow Routes
 * Handles NRCS connections, rundowns, stories, playout destinations
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import {
  validate, validateAll, schemas, uuidParam, cursorPaginationQuery,
} from '../../utils/validation';
import { z } from 'zod';
import { newsService } from '../../services/news.service';

const router = Router();
router.use(authenticate);

// ─── Param schemas ───────────────────────────────────────────────────────────
const storyIdParam = z.object({ id: z.string().uuid() });

const rundownQuery = cursorPaginationQuery.extend({
  connectionId: z.string().uuid().optional(),
  date: z.string().optional(),
});

// ─── NRCS Connections ─────────────────────────────────────────────────────────

router.get('/nrcs-connections', async (_req: Request, res: Response) => {
  const connections = await newsService.listConnections();
  res.json({ connections });
});

router.post('/nrcs-connections', validate(schemas.createNRCSConnection), async (req: Request, res: Response) => {
  const connection = await newsService.createConnection(req.body);
  res.status(201).json({ connection });
});

router.patch('/nrcs-connections/:id', validateAll({ params: uuidParam, body: schemas.updateNRCSConnection }), async (req: Request, res: Response) => {
  const connection = await newsService.updateConnection(req.params['id']!, req.body);
  res.json({ connection });
});

router.delete('/nrcs-connections/:id', validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  await newsService.deactivateConnection(req.params['id']!);
  res.status(204).send();
});

// ─── Rundowns ─────────────────────────────────────────────────────────────────

router.get('/', validate(rundownQuery, 'query'), async (req: Request, res: Response) => {
  const { cursor, limit, order } = req.query as any;
  const connectionId = req.query['connectionId'] as string | undefined;
  const date = req.query['date'] as string | undefined;

  const result = await newsService.listRundowns({ cursor, limit, order, connectionId, date });

  const lastItem = result.data[result.data.length - 1];
  const firstItem = result.data[0];

  res.json({
    rundowns: result.data,
    pagination: {
      nextCursor: result.hasMore && lastItem ? lastItem.id : null,
      prevCursor: firstItem ? firstItem.id : null,
      limit,
      total: result.total,
      hasMore: result.hasMore,
    },
  });
});

router.get('/rundowns/:id', validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  const rundown = await newsService.getRundown(req.params['id']!);
  res.json({ rundown });
});

// ─── Stories ──────────────────────────────────────────────────────────────────

router.get('/stories/:id', validate(storyIdParam, 'params'), async (req: Request, res: Response) => {
  const story = await newsService.getStory(req.params['id']!);
  res.json({ story });
});

router.patch('/stories/:id', validateAll({ params: storyIdParam, body: schemas.updateStory }), async (req: Request, res: Response) => {
  const story = await newsService.updateStory(req.params['id']!, req.body);
  res.json({ story });
});

router.post('/stories/:id/assign', validate(storyIdParam, 'params'), async (req: Request, res: Response) => {
  const story = await newsService.assignStory(req.params['id']!, req.user!.id);
  res.json({ story });
});

router.post('/stories/:id/mark-ready', validate(storyIdParam, 'params'), async (req: Request, res: Response) => {
  const story = await newsService.markReady(req.params['id']!);
  res.json({ story });
});

router.post(
  '/stories/:id/send-to-air',
  validateAll({ params: storyIdParam, body: schemas.sendToAir }),
  async (req: Request, res: Response) => {
    const { destinationId } = req.body;
    const result = await newsService.sendToAir(req.params['id']!, destinationId);
    res.json(result);
  }
);

// ─── Playout Destinations ─────────────────────────────────────────────────────

router.get('/playout-destinations', async (_req: Request, res: Response) => {
  const destinations = await newsService.listDestinations();
  res.json({ destinations });
});

router.post('/playout-destinations', validate(schemas.createPlayoutDestination), async (req: Request, res: Response) => {
  const destination = await newsService.createDestination(req.body);
  res.status(201).json({ destination });
});

router.delete('/playout-destinations/:id', validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  await newsService.deactivateDestination(req.params['id']!);
  res.status(204).send();
});

export default router;
