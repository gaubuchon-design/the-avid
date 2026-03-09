/**
 * NEXIS Storage Integration Routes
 * Handles workspace management, media paths, caching
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { db } from '../../db/client';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

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

router.get('/workspaces/:id', async (req: Request, res: Response) => {
  const workspace = await db.nEXISWorkspace.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      mediaPaths: {
        take: 50,
        orderBy: { updatedAt: 'desc' },
      },
    },
  });
  res.json({ workspace });
});

router.post('/workspaces', async (req: Request, res: Response) => {
  const workspace = await db.nEXISWorkspace.create({
    data: {
      orgId: req.body.orgId,
      name: req.body.name,
      host: req.body.host,
      port: req.body.port || 443,
      workspaceId: req.body.workspaceId,
      storageGroupId: req.body.storageGroupId,
      totalCapacityGB: req.body.totalCapacityGB,
    },
  });
  res.status(201).json({ workspace });
});

router.post('/workspaces/:id/connect', async (req: Request, res: Response) => {
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
  const workspace = await db.nEXISWorkspace.update({
    where: { id: req.params.id },
    data: { isConnected: false },
  });
  res.json({ workspace });
});

router.post('/workspaces/:id/health-check', async (req: Request, res: Response) => {
  // In production: ping NEXIS server
  const workspace = await db.nEXISWorkspace.update({
    where: { id: req.params.id },
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

router.get('/workspaces/:workspaceId/media', async (req: Request, res: Response) => {
  const paths = await db.nEXISMediaPath.findMany({
    where: { workspaceId: req.params.workspaceId },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ mediaPaths: paths });
});

router.post('/workspaces/:workspaceId/media', async (req: Request, res: Response) => {
  const path = await db.nEXISMediaPath.create({
    data: {
      workspaceId: req.params.workspaceId,
      mediaAssetId: req.body.mediaAssetId,
      nexisPath: req.body.nexisPath,
      ownerId: req.user!.id,
    },
  });
  res.status(201).json({ mediaPath: path });
});

router.post('/workspaces/:workspaceId/media/:id/lock', async (req: Request, res: Response) => {
  const path = await db.nEXISMediaPath.update({
    where: { id: req.params.id },
    data: { isLocked: true, ownerId: req.user!.id },
  });
  res.json({ mediaPath: path });
});

router.post('/workspaces/:workspaceId/media/:id/unlock', async (req: Request, res: Response) => {
  const path = await db.nEXISMediaPath.update({
    where: { id: req.params.id },
    data: { isLocked: false },
  });
  res.json({ mediaPath: path });
});

router.patch('/workspaces/:workspaceId/media/:id/cache', async (req: Request, res: Response) => {
  const path = await db.nEXISMediaPath.update({
    where: { id: req.params.id },
    data: {
      cacheStatus: req.body.cacheStatus,
      cacheSizeMB: req.body.cacheSizeMB,
    },
  });
  res.json({ mediaPath: path });
});

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

  const totalCapacity = workspaces.reduce((s, w) => s + (w.totalCapacityGB || 0), 0);
  const totalUsed = workspaces.reduce((s, w) => s + (w.usedCapacityGB || 0), 0);
  const lockedPaths = workspaces.flatMap(w => w.mediaPaths);

  res.json({
    overview: {
      workspaceCount: workspaces.length,
      totalCapacityGB: totalCapacity,
      totalUsedGB: totalUsed,
      usedPercent: totalCapacity > 0 ? (totalUsed / totalCapacity * 100).toFixed(1) : '0',
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
