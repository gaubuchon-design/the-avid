/**
 * NEXIS Storage Integration Routes
 * Handles workspace management, media paths, caching
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { db } from '../../db/client';
import { validate } from '../../utils/validation';
import { assertFound, ForbiddenError } from '../../utils/errors';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ─── Schemas ────────────────────────────────────────────────────────────────

const createWorkspaceSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(1).max(200),
  host: z.string().min(1).max(255),
  port: z.number().int().positive().max(65535).default(443),
  workspaceId: z.string().max(200).optional(),
  storageGroupId: z.string().max(200).optional(),
  totalCapacityGB: z.number().positive().optional(),
});

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  host: z.string().min(1).max(255).optional(),
  port: z.number().int().positive().max(65535).optional(),
  workspaceId: z.string().max(200).optional(),
  storageGroupId: z.string().max(200).optional(),
  totalCapacityGB: z.number().positive().optional(),
  usedCapacityGB: z.number().min(0).optional(),
}).strict();

const createMediaPathSchema = z.object({
  mediaAssetId: z.string().uuid(),
  nexisPath: z.string().min(1).max(1000),
});

const updateCacheSchema = z.object({
  cacheStatus: z.enum(['NONE', 'PARTIAL', 'FULL', 'STALE']),
  cacheSizeMB: z.number().min(0).optional(),
}).strict();

// ─── NEXIS Workspaces ────────────────────────────────────────────────────────

router.get('/workspaces', async (req: Request, res: Response) => {
  const { orgId } = req.query as Record<string, string>;
  const workspaces = await db.nEXISWorkspace.findMany({
    where: orgId ? { orgId } : {},
    include: { _count: { select: { mediaPaths: true } } },
    orderBy: { name: 'asc' },
  });
  res.json({ workspaces });
});

router.get('/workspaces/:id', async (req: Request, res: Response) => {
  const workspace = await db.nEXISWorkspace.findUnique({
    where: { id: req.params.id },
    include: {
      mediaPaths: {
        take: 50,
        orderBy: { updatedAt: 'desc' },
      },
    },
  });
  assertFound(workspace, 'NEXIS workspace');
  res.json({ workspace });
});

router.post('/workspaces', validate(createWorkspaceSchema), async (req: Request, res: Response) => {
  const workspace = await db.nEXISWorkspace.create({ data: req.body });
  res.status(201).json({ workspace });
});

router.patch('/workspaces/:id', validate(updateWorkspaceSchema), async (req: Request, res: Response) => {
  const existing = await db.nEXISWorkspace.findUnique({ where: { id: req.params.id } });
  assertFound(existing, 'NEXIS workspace');

  const workspace = await db.nEXISWorkspace.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json({ workspace });
});

router.post('/workspaces/:id/connect', async (req: Request, res: Response) => {
  const existing = await db.nEXISWorkspace.findUnique({ where: { id: req.params.id } });
  assertFound(existing, 'NEXIS workspace');

  // In production: authenticate via Avid Connection Manager
  const workspace = await db.nEXISWorkspace.update({
    where: { id: req.params.id },
    data: {
      isConnected: true,
      lastHealthCheck: new Date(),
    },
  });
  res.json({ workspace, message: 'Connected to NEXIS workspace' });
});

router.post('/workspaces/:id/disconnect', async (req: Request, res: Response) => {
  const existing = await db.nEXISWorkspace.findUnique({ where: { id: req.params.id } });
  assertFound(existing, 'NEXIS workspace');

  const workspace = await db.nEXISWorkspace.update({
    where: { id: req.params.id },
    data: { isConnected: false },
  });
  res.json({ workspace });
});

router.post('/workspaces/:id/health-check', async (req: Request, res: Response) => {
  const existing = await db.nEXISWorkspace.findUnique({ where: { id: req.params.id } });
  assertFound(existing, 'NEXIS workspace');

  // In production: ping NEXIS server, check connection status
  const workspace = await db.nEXISWorkspace.update({
    where: { id: req.params.id },
    data: { lastHealthCheck: new Date() },
  });

  const usedPercent = workspace.totalCapacityGB && workspace.usedCapacityGB
    ? ((workspace.usedCapacityGB / workspace.totalCapacityGB) * 100).toFixed(1)
    : null;

  res.json({
    workspace,
    health: {
      status: workspace.isConnected ? 'healthy' : 'disconnected',
      checkedAt: new Date().toISOString(),
      usedPercent,
      warning: usedPercent && parseFloat(usedPercent) > 90 ? 'Storage usage above 90%' : undefined,
    },
  });
});

// ─── NEXIS Media Paths ───────────────────────────────────────────────────────

router.get('/workspaces/:workspaceId/media', async (req: Request, res: Response) => {
  const workspace = await db.nEXISWorkspace.findUnique({ where: { id: req.params.workspaceId } });
  assertFound(workspace, 'NEXIS workspace');

  const { locked } = req.query as Record<string, string>;
  const where: any = { workspaceId: req.params.workspaceId };
  if (locked === 'true') where.isLocked = true;
  if (locked === 'false') where.isLocked = false;

  const paths = await db.nEXISMediaPath.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ mediaPaths: paths });
});

router.post('/workspaces/:workspaceId/media', validate(createMediaPathSchema), async (req: Request, res: Response) => {
  const workspace = await db.nEXISWorkspace.findUnique({ where: { id: req.params.workspaceId } });
  assertFound(workspace, 'NEXIS workspace');

  const path = await db.nEXISMediaPath.create({
    data: {
      workspaceId: req.params.workspaceId,
      ...req.body,
      ownerId: req.user!.id,
    },
  });
  res.status(201).json({ mediaPath: path });
});

router.post('/workspaces/:workspaceId/media/:id/lock', async (req: Request, res: Response) => {
  const mediaPath = await db.nEXISMediaPath.findFirst({
    where: { id: req.params.id, workspaceId: req.params.workspaceId },
  });
  assertFound(mediaPath, 'NEXIS media path');

  // Check if already locked by another user
  if (mediaPath.isLocked && mediaPath.ownerId !== req.user!.id) {
    return res.status(409).json({
      error: {
        message: 'Media path is locked by another user',
        code: 'RESOURCE_LOCKED',
        details: { lockedBy: mediaPath.ownerId },
      },
    });
  }

  const path = await db.nEXISMediaPath.update({
    where: { id: req.params.id },
    data: { isLocked: true, ownerId: req.user!.id },
  });
  res.json({ mediaPath: path });
});

router.post('/workspaces/:workspaceId/media/:id/unlock', async (req: Request, res: Response) => {
  const mediaPath = await db.nEXISMediaPath.findFirst({
    where: { id: req.params.id, workspaceId: req.params.workspaceId },
  });
  assertFound(mediaPath, 'NEXIS media path');

  // Only the lock owner can unlock (unless admin override is added later)
  if (mediaPath.isLocked && mediaPath.ownerId !== req.user!.id) {
    throw new ForbiddenError('Only the lock owner can unlock this media path');
  }

  const path = await db.nEXISMediaPath.update({
    where: { id: req.params.id },
    data: { isLocked: false },
  });
  res.json({ mediaPath: path });
});

router.patch('/workspaces/:workspaceId/media/:id/cache', validate(updateCacheSchema), async (req: Request, res: Response) => {
  const mediaPath = await db.nEXISMediaPath.findFirst({
    where: { id: req.params.id, workspaceId: req.params.workspaceId },
  });
  assertFound(mediaPath, 'NEXIS media path');

  const path = await db.nEXISMediaPath.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json({ mediaPath: path });
});

// ─── Admin: Storage Overview ─────────────────────────────────────────────────

router.get('/admin/overview', async (req: Request, res: Response) => {
  const { orgId } = req.query as Record<string, string>;
  const workspaces = await db.nEXISWorkspace.findMany({
    where: orgId ? { orgId } : {},
    include: {
      _count: { select: { mediaPaths: true } },
      mediaPaths: {
        where: { isLocked: true },
        select: { id: true, ownerId: true, nexisPath: true },
      },
    },
  });

  const totalCapacity = workspaces.reduce((s, w) => s + (w.totalCapacityGB || 0), 0);
  const totalUsed = workspaces.reduce((s, w) => s + (w.usedCapacityGB || 0), 0);
  const lockedPaths = workspaces.flatMap(w => w.mediaPaths);
  const connectedCount = workspaces.filter(w => w.isConnected).length;

  res.json({
    overview: {
      workspaceCount: workspaces.length,
      connectedCount,
      totalCapacityGB: totalCapacity,
      totalUsedGB: totalUsed,
      usedPercent: totalCapacity > 0 ? parseFloat(((totalUsed / totalCapacity) * 100).toFixed(1)) : 0,
      activeLocks: lockedPaths.length,
    },
    workspaces: workspaces.map(w => ({
      id: w.id,
      name: w.name,
      host: w.host,
      isConnected: w.isConnected,
      totalCapacityGB: w.totalCapacityGB,
      usedCapacityGB: w.usedCapacityGB,
      mediaCount: w._count.mediaPaths,
      activeLocks: w.mediaPaths.length,
    })),
  });
});

export default router;
