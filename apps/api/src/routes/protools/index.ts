/**
 * Pro Tools Integration Routes
 * Handles PT sessions, marker sync, AAF export/import
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { db } from '../../db/client';
import { validate } from '../../utils/validation';
import { assertFound, BadRequestError } from '../../utils/errors';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ─── Schemas ────────────────────────────────────────────────────────────────

const createSessionSchema = z.object({
  projectId: z.string().uuid(),
  mediaCentralId: z.string().max(200).optional(),
  proToolsHost: z.string().max(255).optional(),
  syncMode: z.enum(['AAF', 'MXF', 'REWIRE']).default('AAF'),
});

const updateSessionSchema = z.object({
  status: z.enum(['IDLE', 'CONNECTING', 'CONNECTED', 'SYNCING', 'DISCONNECTED', 'ERROR']).optional(),
  lastSyncAt: z.string().datetime().optional(),
  syncMode: z.enum(['AAF', 'MXF', 'REWIRE']).optional(),
  proToolsHost: z.string().max(255).optional(),
}).strict();

const createMarkerSchema = z.object({
  avidMarkerId: z.string().max(200).optional(),
  proToolsLocId: z.string().max(200).optional(),
  timecode: z.string().min(1).max(30),
  label: z.string().max(200).optional(),
  color: z.string().max(20).optional(),
  syncDirection: z.enum(['AVID_TO_PT', 'PT_TO_AVID', 'BIDIRECTIONAL']).default('BIDIRECTIONAL'),
});

const batchSyncSchema = z.object({
  direction: z.enum(['AVID_TO_PT', 'PT_TO_AVID', 'BIDIRECTIONAL']),
  markers: z.array(z.object({
    avidMarkerId: z.string().max(200).optional(),
    proToolsLocId: z.string().max(200).optional(),
    timecode: z.string().min(1).max(30),
    label: z.string().max(200).optional(),
    color: z.string().max(20).optional(),
  })).min(1).max(500),
});

const exportAAFSchema = z.object({
  timelineId: z.string().uuid(),
  handleDuration: z.number().min(0).max(30).default(2),
  includeVideo: z.boolean().default(false),
});

const importAAFSchema = z.object({
  sourceUrl: z.string().url().optional(),
  mergeMode: z.enum(['REPLACE', 'MERGE', 'APPEND']).default('MERGE'),
});

// ─── Pro Tools Sessions ──────────────────────────────────────────────────────

router.get('/sessions/:projectId', async (req: Request, res: Response) => {
  const session = await db.proToolsSession.findFirst({
    where: { projectId: req.params['projectId'] },
    include: { markerSyncs: { take: 50, orderBy: { syncedAt: 'desc' } } },
  });
  // Session may not exist yet; return null rather than 404
  res.json({ session: session ?? null });
});

router.post('/sessions', validate(createSessionSchema), async (req: Request, res: Response) => {
  // Verify project exists
  const project = await db.project.findUnique({ where: { id: req.body.projectId } });
  assertFound(project, 'Project');

  // Check if session already exists for this project
  const existing = await db.proToolsSession.findFirst({
    where: { projectId: req.body.projectId },
  });
  if (existing) {
    return res.status(409).json({
      error: { message: 'Pro Tools session already exists for this project', code: 'CONFLICT' },
    });
  }

  const session = await db.proToolsSession.create({
    data: {
      ...req.body,
      connectedUserId: req.user!.id,
    },
  });
  res.status(201).json({ session });
});

router.patch('/sessions/:id', validate(updateSessionSchema), async (req: Request, res: Response) => {
  const existing = await db.proToolsSession.findUnique({ where: { id: req.params['id'] } });
  assertFound(existing, 'Pro Tools session');

  const data = req.body;
  const session = await db.proToolsSession.update({
    where: { id: req.params['id'] },
    data: {
      ...data,
      lastSyncAt: data.lastSyncAt ? new Date(data.lastSyncAt) : undefined,
    },
  });
  res.json({ session });
});

router.post('/sessions/:id/connect', async (req: Request, res: Response) => {
  const existing = await db.proToolsSession.findUnique({ where: { id: req.params['id'] } });
  assertFound(existing, 'Pro Tools session');

  if (existing.status === 'CONNECTED') {
    return res.status(400).json({
      error: { message: 'Session is already connected', code: 'BAD_REQUEST' },
    });
  }

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

router.post('/sessions/:id/disconnect', async (req: Request, res: Response) => {
  const existing = await db.proToolsSession.findUnique({ where: { id: req.params['id'] } });
  assertFound(existing, 'Pro Tools session');

  const session = await db.proToolsSession.update({
    where: { id: req.params['id'] },
    data: { status: 'DISCONNECTED' },
  });
  res.json({ session });
});

// ─── Marker Sync ─────────────────────────────────────────────────────────────

router.get('/sessions/:sessionId/markers', async (req: Request, res: Response) => {
  const session = await db.proToolsSession.findUnique({ where: { id: req.params['sessionId'] } });
  assertFound(session, 'Pro Tools session');

  const markers = await db.markerSync.findMany({
    where: { sessionId: req.params['sessionId'] },
    orderBy: { timecode: 'asc' },
  });
  res.json({ markers });
});

router.post('/sessions/:sessionId/markers', validate(createMarkerSchema), async (req: Request, res: Response) => {
  const session = await db.proToolsSession.findUnique({ where: { id: req.params['sessionId'] } });
  assertFound(session, 'Pro Tools session');

  const marker = await db.markerSync.create({
    data: {
      sessionId: req.params['sessionId'],
      ...req.body,
    },
  });
  res.status(201).json({ marker });
});

router.post('/sessions/:sessionId/markers/sync', validate(batchSyncSchema), async (req: Request, res: Response) => {
  const session = await db.proToolsSession.findUnique({ where: { id: req.params['sessionId'] } });
  assertFound(session, 'Pro Tools session');

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

  // Update session last sync timestamp
  await db.proToolsSession.update({
    where: { id: req.params['sessionId'] },
    data: { lastSyncAt: new Date() },
  });

  res.json({ synced: created.length, markers: created });
});

// ─── AAF Export/Import ───────────────────────────────────────────────────────

router.post('/sessions/:sessionId/export-aaf', validate(exportAAFSchema), async (req: Request, res: Response) => {
  const session = await db.proToolsSession.findUnique({ where: { id: req.params['sessionId'] } });
  assertFound(session, 'Pro Tools session');

  const { timelineId, handleDuration, includeVideo } = req.body;

  // Verify timeline exists
  const timeline = await db.timeline.findUnique({ where: { id: timelineId } });
  assertFound(timeline, 'Timeline');

  // In production: generate AAF file from timeline data
  // and either upload to MediaCentral or provide download URL
  res.json({
    status: 'QUEUED',
    message: `AAF export queued for timeline ${timelineId} with ${handleDuration}s handles`,
    details: { includeVideo, handleDuration },
    estimatedMs: 5000,
  });
});

router.post('/sessions/:sessionId/import-aaf', validate(importAAFSchema), async (req: Request, res: Response) => {
  const session = await db.proToolsSession.findUnique({ where: { id: req.params['sessionId'] } });
  assertFound(session, 'Pro Tools session');

  const { mergeMode } = req.body;

  // In production: parse incoming AAF from Pro Tools mix
  // re-link audio to timeline, show diff
  res.json({
    status: 'QUEUED',
    message: `AAF import queued for processing (merge mode: ${mergeMode})`,
    estimatedMs: 8000,
  });
});

export default router;
