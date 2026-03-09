/**
 * Pro Tools Integration Routes
 * Handles PT sessions, marker sync, AAF export/import
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { db } from '../../db/client';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ─── Pro Tools Sessions ──────────────────────────────────────────────────────

router.get('/sessions/:projectId', async (req: Request, res: Response) => {
  const session = await db.proToolsSession.findFirst({
    where: { projectId: req.params.projectId },
    include: { markerSyncs: { take: 50, orderBy: { syncedAt: 'desc' } } },
  });
  res.json({ session });
});

router.post('/sessions', async (req: Request, res: Response) => {
  const session = await db.proToolsSession.create({
    data: {
      projectId: req.body.projectId,
      mediaCentralId: req.body.mediaCentralId,
      proToolsHost: req.body.proToolsHost,
      syncMode: req.body.syncMode || 'AAF',
      connectedUserId: (req as any).user.id,
    },
  });
  res.status(201).json({ session });
});

router.patch('/sessions/:id', async (req: Request, res: Response) => {
  const session = await db.proToolsSession.update({
    where: { id: req.params.id },
    data: {
      status: req.body.status,
      lastSyncAt: req.body.lastSyncAt ? new Date(req.body.lastSyncAt) : undefined,
      syncMode: req.body.syncMode,
    },
  });
  res.json({ session });
});

router.post('/sessions/:id/connect', async (req: Request, res: Response) => {
  const session = await db.proToolsSession.update({
    where: { id: req.params.id },
    data: {
      status: 'CONNECTING',
      connectedUserId: (req as any).user.id,
    },
  });
  // In production: initiate WebSocket connection to Pro Tools session bridge
  res.json({ session, message: 'Connection initiated' });
});

router.post('/sessions/:id/disconnect', async (req: Request, res: Response) => {
  const session = await db.proToolsSession.update({
    where: { id: req.params.id },
    data: { status: 'DISCONNECTED' },
  });
  res.json({ session });
});

// ─── Marker Sync ─────────────────────────────────────────────────────────────

router.get('/sessions/:sessionId/markers', async (req: Request, res: Response) => {
  const markers = await db.markerSync.findMany({
    where: { sessionId: req.params.sessionId },
    orderBy: { timecode: 'asc' },
  });
  res.json({ markers });
});

router.post('/sessions/:sessionId/markers', async (req: Request, res: Response) => {
  const marker = await db.markerSync.create({
    data: {
      sessionId: req.params.sessionId,
      avidMarkerId: req.body.avidMarkerId,
      proToolsLocId: req.body.proToolsLocId,
      timecode: req.body.timecode,
      label: req.body.label,
      color: req.body.color,
      syncDirection: req.body.syncDirection || 'BIDIRECTIONAL',
    },
  });
  res.status(201).json({ marker });
});

router.post('/sessions/:sessionId/markers/sync', async (req: Request, res: Response) => {
  // Batch sync markers from Avid to Pro Tools or vice versa
  const { direction, markers } = req.body;
  const created = await Promise.all(
    markers.map((m: any) =>
      db.markerSync.create({
        data: {
          sessionId: req.params.sessionId,
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
});

// ─── AAF Export/Import ───────────────────────────────────────────────────────

router.post('/sessions/:sessionId/export-aaf', async (req: Request, res: Response) => {
  const session = await db.proToolsSession.findUniqueOrThrow({
    where: { id: req.params.sessionId },
  });

  // In production: generate AAF file from timeline data
  // and either upload to MediaCentral or provide download URL
  const { timelineId, handleDuration = 2 } = req.body;

  res.json({
    status: 'QUEUED',
    message: `AAF export queued for timeline ${timelineId} with ${handleDuration}s handles`,
    estimatedMs: 5000,
  });
});

router.post('/sessions/:sessionId/import-aaf', async (req: Request, res: Response) => {
  const session = await db.proToolsSession.findUniqueOrThrow({
    where: { id: req.params.sessionId },
  });

  // In production: parse incoming AAF from Pro Tools mix
  // re-link audio to timeline, show diff
  res.json({
    status: 'QUEUED',
    message: 'AAF import queued for processing',
    estimatedMs: 8000,
  });
});

export default router;
