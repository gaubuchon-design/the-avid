/**
 * Pro Tools Integration Routes
 * Handles PT sessions, marker sync, AAF export/import
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { db } from '../../db/client';
import {
  validate, validateAll, schemas, uuidParam, projectIdParam,
} from '../../utils/validation';
import { z } from 'zod';
import { BadRequestError } from '../../utils/errors';

const router = Router();
router.use(authenticate);

// ─── Param schemas ───────────────────────────────────────────────────────────
const sessionIdParam = z.object({ id: z.string().uuid() });
const sessionIdOnlyParam = z.object({ sessionId: z.string().uuid() });

// ─── Pro Tools Sessions ──────────────────────────────────────────────────────

router.get('/sessions/:projectId', validate(projectIdParam, 'params'), async (req: Request, res: Response) => {
  const session = await db.proToolsSession.findFirst({
    where: { projectId: req.params['projectId'] },
    include: { markerSyncs: { take: 50, orderBy: { syncedAt: 'desc' } } },
  });
  res.json({ session });
});

router.post('/sessions', validate(schemas.createProToolsSession), async (req: Request, res: Response) => {
  const session = await db.proToolsSession.create({
    data: {
      ...req.body,
      connectedUserId: req.user!.id,
    },
  });
  res.status(201).json({ session });
});

router.patch('/sessions/:id', validateAll({ params: sessionIdParam, body: schemas.updateProToolsSession }), async (req: Request, res: Response) => {
  const data: any = { ...req.body };
  if (data.lastSyncAt) data.lastSyncAt = new Date(data.lastSyncAt);

  const session = await db.proToolsSession.update({
    where: { id: req.params['id'] },
    data,
  });
  res.json({ session });
});

router.post('/sessions/:id/connect', validate(sessionIdParam, 'params'), async (req: Request, res: Response) => {
  const session = await db.proToolsSession.update({
    where: { id: req.params['id'] },
    data: {
      status: 'CONNECTING',
      connectedUserId: req.user!.id,
    },
  });
  // In production: initiate WebSocket connection to Pro Tools session bridge
  res.json({ session, message: 'Connection initiated' });
});

router.post('/sessions/:id/disconnect', validate(sessionIdParam, 'params'), async (req: Request, res: Response) => {
  const session = await db.proToolsSession.update({
    where: { id: req.params['id'] },
    data: { status: 'DISCONNECTED' },
  });
  res.json({ session });
});

// ─── Marker Sync ─────────────────────────────────────────────────────────────

router.get('/sessions/:sessionId/markers', validate(sessionIdOnlyParam, 'params'), async (req: Request, res: Response) => {
  const markers = await db.markerSync.findMany({
    where: { sessionId: req.params['sessionId'] },
    orderBy: { timecode: 'asc' },
  });
  res.json({ markers });
});

router.post(
  '/sessions/:sessionId/markers',
  validateAll({ params: sessionIdOnlyParam, body: schemas.createMarkerSync }),
  async (req: Request, res: Response) => {
    const marker = await db.markerSync.create({
      data: {
        sessionId: req.params['sessionId'],
        ...req.body,
      },
    });
    res.status(201).json({ marker });
  }
);

router.post(
  '/sessions/:sessionId/markers/sync',
  validateAll({ params: sessionIdOnlyParam, body: schemas.batchMarkerSync }),
  async (req: Request, res: Response) => {
    const { direction, markers } = req.body;
    const created = await Promise.all(
      markers.map((m: any) =>
        db.markerSync.create({
          data: {
            sessionId: req.params['sessionId'],
            avidMarkerId: m.avidMarkerId,
            proToolsLocId: m.proToolsLocId,
            timecode: m.timecode,
            label: m.label,
            color: m.color,
            syncDirection: direction,
          },
        })
      )
    );
    res.json({ synced: created.length, markers: created });
  }
);

// ─── AAF Export/Import ───────────────────────────────────────────────────────

router.post(
  '/sessions/:sessionId/export-aaf',
  validateAll({ params: sessionIdOnlyParam, body: schemas.proToolsExportAAF }),
  async (req: Request, res: Response) => {
    const session = await db.proToolsSession.findUniqueOrThrow({
      where: { id: req.params['sessionId'] },
    });

    const { timelineId, handleDuration } = req.body;

    res.json({
      status: 'QUEUED',
      message: `AAF export queued for timeline ${timelineId} with ${handleDuration}s handles`,
      estimatedMs: 5000,
    });
  }
);

router.post('/sessions/:sessionId/import-aaf', validate(sessionIdOnlyParam, 'params'), async (req: Request, res: Response) => {
  const session = await db.proToolsSession.findUniqueOrThrow({
    where: { id: req.params['sessionId'] },
  });

  // In production: parse incoming AAF from Pro Tools mix
  res.json({
    status: 'QUEUED',
    message: 'AAF import queued for processing',
    estimatedMs: 8000,
  });
});

export default router;
