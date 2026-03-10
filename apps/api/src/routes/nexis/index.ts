/**
 * NEXIS Storage Integration Routes
 * Handles workspace management, media paths, caching
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

// ─── Param schemas ───────────────────────────────────────────────────────────
const workspaceIdParam = z.object({ workspaceId: z.string().uuid() });
const workspaceAndMediaParams = z.object({
  workspaceId: z.string().uuid(),
  id: z.string().uuid(),
});

// ─── NEXIS Workspaces ────────────────────────────────────────────────────────

router.get('/workspaces', async (req: Request, res: Response) => {
  const { orgId } = req.query;
  const workspaces = await db.nEXISWorkspace.findMany({
    where: orgId ? { orgId: orgId as string } : {},
    include: { _count: { select: { mediaPaths: true } } },
    orderBy: { name: 'asc' },
  });
  res.json({ workspaces });
});

router.get('/workspaces/:id', validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  const workspace = await db.nEXISWorkspace.findUniqueOrThrow({
    where: { id: req.params['id'] },
    include: {
      mediaPaths: {
        take: 50,
        orderBy: { updatedAt: 'desc' },
      },
    },
  });
  res.json({ workspace });
});

router.post('/workspaces', validate(schemas.createNEXISWorkspace), async (req: Request, res: Response) => {
  const workspace = await db.nEXISWorkspace.create({
    data: req.body,
  });
  res.status(201).json({ workspace });
});

router.post('/workspaces/:id/connect', validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  // In production: authenticate via Avid Connection Manager
  const workspace = await db.nEXISWorkspace.update({
    where: { id: req.params['id'] },
    data: {
      isConnected: true,
      lastHealthCheck: new Date(),
    },
  });
  res.json({ workspace, message: 'Connected to NEXIS workspace' });
});

router.post('/workspaces/:id/disconnect', validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  const workspace = await db.nEXISWorkspace.update({
    where: { id: req.params['id'] },
    data: { isConnected: false },
  });
  res.json({ workspace });
});

router.post('/workspaces/:id/health-check', validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  // In production: ping NEXIS server
  const workspace = await db.nEXISWorkspace.update({
    where: { id: req.params['id'] },
    data: { lastHealthCheck: new Date() },
  });
  res.json({
    workspace,
    health: {
      status: workspace.isConnected ? 'healthy' : 'disconnected',
      latencyMs: Math.floor(Math.random() * 50) + 5,
      usedPercent: workspace.totalCapacityGB && workspace.usedCapacityGB
        ? (workspace.usedCapacityGB / workspace.totalCapacityGB * 100).toFixed(1)
        : null,
    },
  });
});

// ─── NEXIS Media Paths ───────────────────────────────────────────────────────

router.get('/workspaces/:workspaceId/media', validate(workspaceIdParam, 'params'), async (req: Request, res: Response) => {
  const paths = await db.nEXISMediaPath.findMany({
    where: { workspaceId: req.params['workspaceId'] },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ mediaPaths: paths });
});

router.post(
  '/workspaces/:workspaceId/media',
  validateAll({ params: workspaceIdParam, body: schemas.createNEXISMediaPath }),
  async (req: Request, res: Response) => {
    const path = await db.nEXISMediaPath.create({
      data: {
        workspaceId: req.params['workspaceId'],
        ...req.body,
        ownerId: req.user!.id,
      },
    });
    res.status(201).json({ mediaPath: path });
  }
);

router.post('/workspaces/:workspaceId/media/:id/lock', validate(workspaceAndMediaParams, 'params'), async (req: Request, res: Response) => {
  const path = await db.nEXISMediaPath.update({
    where: { id: req.params['id'] },
    data: { isLocked: true, ownerId: req.user!.id },
  });
  res.json({ mediaPath: path });
});

router.post('/workspaces/:workspaceId/media/:id/unlock', validate(workspaceAndMediaParams, 'params'), async (req: Request, res: Response) => {
  const path = await db.nEXISMediaPath.update({
    where: { id: req.params['id'] },
    data: { isLocked: false },
  });
  res.json({ mediaPath: path });
});

router.patch(
  '/workspaces/:workspaceId/media/:id/cache',
  validateAll({ params: workspaceAndMediaParams, body: schemas.updateNEXISCache }),
  async (req: Request, res: Response) => {
    const path = await db.nEXISMediaPath.update({
      where: { id: req.params['id'] },
      data: req.body,
    });
    res.json({ mediaPath: path });
  }
);

// ─── Admin: Storage Overview ─────────────────────────────────────────────────

router.get('/admin/overview', async (req: Request, res: Response) => {
  const { orgId } = req.query;
  const workspaces = await db.nEXISWorkspace.findMany({
    where: orgId ? { orgId: orgId as string } : {},
    include: {
      _count: { select: { mediaPaths: true } },
      mediaPaths: {
        where: { isLocked: true },
        select: { id: true, ownerId: true, nexisPath: true },
      },
    },
  });

  /* eslint-disable @typescript-eslint/no-explicit-any -- Prisma result type inference */
  const totalCapacity = workspaces.reduce((s: number, w: any) => s + ((w.totalCapacityGB as number) || 0), 0);
  const totalUsed = workspaces.reduce((s: number, w: any) => s + ((w.usedCapacityGB as number) || 0), 0);
  const lockedPaths = workspaces.flatMap((w: any) => w.mediaPaths as unknown[]);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  res.json({
    overview: {
      workspaceCount: workspaces.length,
      totalCapacityGB: totalCapacity,
      totalUsedGB: totalUsed,
      usedPercent: totalCapacity > 0 ? (totalUsed / totalCapacity * 100).toFixed(1) : '0',
      activeLocks: lockedPaths.length,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma result mapping
    workspaces: workspaces.map((w: any) => ({
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
