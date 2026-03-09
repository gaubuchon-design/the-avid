/**
 * Brand & Marketing Routes
 * Handles brand kits, campaigns, variants, compliance, DAM connections
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { db } from '../../db/client';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ─── Brand Kits ──────────────────────────────────────────────────────────────

const createBrandKitSchema = z.object({
  orgId: z.string().uuid(),
  brandName: z.string().min(1),
  primaryColors: z.array(z.string()).optional(),
  secondaryColors: z.array(z.string()).optional(),
  fonts: z.record(z.string()).optional(),
  typography: z.record(z.any()).optional(),
  voiceTone: z.string().optional(),
  approvedMusicIds: z.array(z.string()).optional(),
  prohibitedElements: z.array(z.string()).optional(),
});

router.get('/brand-kits', async (req: Request, res: Response) => {
  const { orgId } = req.query;
  const kits = await db.brandKit.findMany({
    where: orgId ? { orgId: orgId as string } : {},
    include: { templates: { take: 5 }, campaigns: { take: 5 } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ brandKits: kits });
});

router.get('/brand-kits/:id', async (req: Request, res: Response) => {
  const kit = await db.brandKit.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { templates: true, campaigns: true },
  });
  res.json({ brandKit: kit });
});

router.post('/brand-kits', async (req: Request, res: Response) => {
  const data = createBrandKitSchema.parse(req.body);
  const kit = await db.brandKit.create({ data });
  res.status(201).json({ brandKit: kit });
});

router.patch('/brand-kits/:id', async (req: Request, res: Response) => {
  const allowed = ['brandName', 'primaryColors', 'secondaryColors', 'fonts', 'typography', 'voiceTone', 'approvedMusicIds', 'prohibitedElements', 'logoUrl', 'watermarkUrl'];
  const data: any = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) data[k] = req.body[k]; });

  const kit = await db.brandKit.update({
    where: { id: req.params.id },
    data,
  });
  res.json({ brandKit: kit });
});

router.delete('/brand-kits/:id', async (req: Request, res: Response) => {
  await db.brandKit.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// ─── Brand Templates ─────────────────────────────────────────────────────────

router.get('/brand-kits/:kitId/templates', async (req: Request, res: Response) => {
  const templates = await db.brandTemplate.findMany({
    where: { brandKitId: req.params.kitId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ templates });
});

router.post('/brand-kits/:kitId/templates', async (req: Request, res: Response) => {
  const template = await db.brandTemplate.create({
    data: {
      brandKitId: req.params.kitId,
      name: req.body.name,
      description: req.body.description,
      elements: req.body.elements || [],
      lockedElementIds: req.body.lockedElementIds || [],
      category: req.body.category,
    },
  });
  res.status(201).json({ template });
});

router.patch('/brand-kits/:kitId/templates/:id', async (req: Request, res: Response) => {
  const allowed = ['name', 'description', 'elements', 'lockedElementIds', 'category', 'thumbnailUrl'];
  const data: any = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) data[k] = req.body[k]; });

  const template = await db.brandTemplate.update({
    where: { id: req.params.id },
    data,
  });
  res.json({ template });
});

// ─── Campaigns ───────────────────────────────────────────────────────────────

const createCampaignSchema = z.object({
  orgId: z.string().uuid(),
  brandKitId: z.string().uuid().optional(),
  name: z.string().min(1),
  brief: z.string().optional(),
  objective: z.string().optional(),
  targetAudience: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  tokenBudget: z.number().int().optional(),
});

router.get('/campaigns', async (req: Request, res: Response) => {
  const { orgId, status } = req.query;
  const where: any = {};
  if (orgId) where.orgId = orgId;
  if (status) where.status = status;

  const campaigns = await db.campaign.findMany({
    where,
    include: {
      brandKit: { select: { id: true, brandName: true } },
      deliverables: true,
      markets: true,
      _count: { select: { variants: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ campaigns });
});

router.get('/campaigns/:id', async (req: Request, res: Response) => {
  const campaign = await db.campaign.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      brandKit: true,
      deliverables: { orderBy: { createdAt: 'asc' } },
      markets: true,
      variants: { orderBy: { createdAt: 'desc' } },
    },
  });
  res.json({ campaign });
});

router.post('/campaigns', async (req: Request, res: Response) => {
  const data = createCampaignSchema.parse(req.body);
  const campaign = await db.campaign.create({
    data: {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
    },
  });
  res.status(201).json({ campaign });
});

router.patch('/campaigns/:id', async (req: Request, res: Response) => {
  const allowed = ['name', 'brief', 'objective', 'targetAudience', 'status', 'tokenBudget', 'brandKitId'];
  const data: any = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
  if (req.body.startDate) data.startDate = new Date(req.body.startDate);
  if (req.body.endDate) data.endDate = new Date(req.body.endDate);

  const campaign = await db.campaign.update({
    where: { id: req.params.id },
    data,
  });
  res.json({ campaign });
});

// ─── Campaign Deliverables ───────────────────────────────────────────────────

router.post('/campaigns/:campaignId/deliverables', async (req: Request, res: Response) => {
  const deliverable = await db.campaignDeliverable.create({
    data: {
      campaignId: req.params.campaignId,
      name: req.body.name,
      type: req.body.type,
      targetDuration: req.body.targetDuration,
      aspectRatio: req.body.aspectRatio,
      assignedEditorId: req.body.assignedEditorId,
    },
  });
  res.status(201).json({ deliverable });
});

router.patch('/campaigns/:campaignId/deliverables/:id', async (req: Request, res: Response) => {
  const allowed = ['name', 'type', 'status', 'targetDuration', 'aspectRatio', 'assignedEditorId', 'projectId'];
  const data: any = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) data[k] = req.body[k]; });

  const deliverable = await db.campaignDeliverable.update({
    where: { id: req.params.id },
    data,
  });
  res.json({ deliverable });
});

// ─── Content Variants ────────────────────────────────────────────────────────

router.get('/campaigns/:campaignId/variants', async (req: Request, res: Response) => {
  const variants = await db.contentVariant.findMany({
    where: { campaignId: req.params.campaignId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ variants });
});

router.post('/campaigns/:campaignId/variants', async (req: Request, res: Response) => {
  const variant = await db.contentVariant.create({
    data: {
      campaignId: req.params.campaignId,
      masterProjectId: req.body.masterProjectId,
      variantName: req.body.variantName,
      languageCode: req.body.languageCode,
      changes: req.body.changes || [],
    },
  });
  res.status(201).json({ variant });
});

router.post('/campaigns/:campaignId/variants/generate-all', async (req: Request, res: Response) => {
  // Generate all pending variants for a campaign
  const variants = await db.contentVariant.findMany({
    where: { campaignId: req.params.campaignId, status: 'PENDING' },
  });

  // In production: queue variant generation jobs
  const updated = await Promise.all(
    variants.map(v =>
      db.contentVariant.update({
        where: { id: v.id },
        data: { status: 'GENERATING' },
      })
    )
  );

  res.json({ variants: updated, message: `${updated.length} variants queued for generation` });
});

// ─── Compliance Reports ──────────────────────────────────────────────────────

router.get('/compliance/:projectId', async (req: Request, res: Response) => {
  const reports = await db.complianceReport.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { checkedAt: 'desc' },
    take: 10,
  });
  res.json({ reports });
});

router.post('/compliance/:projectId/check', async (req: Request, res: Response) => {
  const { brandKitId } = req.body;
  const userId = req.user!.id;

  // In production: run AI compliance check
  // For now, create a placeholder report
  const report = await db.complianceReport.create({
    data: {
      projectId: req.params.projectId,
      brandKitId,
      overallStatus: 'PASS',
      findings: [],
      checkedById: userId,
    },
  });
  res.status(201).json({ report });
});

// ─── DAM Connections ─────────────────────────────────────────────────────────

router.get('/dam-connections', async (req: Request, res: Response) => {
  const { orgId } = req.query;
  const connections = await db.dAMConnection.findMany({
    where: { orgId: orgId as string, isActive: true },
  });
  res.json({ connections });
});

router.post('/dam-connections', async (req: Request, res: Response) => {
  const connection = await db.dAMConnection.create({
    data: {
      orgId: req.body.orgId,
      provider: req.body.provider,
      name: req.body.name,
      apiEndpoint: req.body.apiEndpoint,
      apiKey: req.body.apiKey,
      accessToken: req.body.accessToken,
    },
  });
  res.status(201).json({ connection });
});

router.delete('/dam-connections/:id', async (req: Request, res: Response) => {
  await db.dAMConnection.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });
  res.json({ success: true });
});

// ─── Performance Analytics ───────────────────────────────────────────────────

router.get('/analytics/:projectId', async (req: Request, res: Response) => {
  const analytics = await db.videoPerformance.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { measuredAt: 'desc' },
  });
  res.json({ analytics });
});

router.post('/analytics', async (req: Request, res: Response) => {
  const data = await db.videoPerformance.create({
    data: {
      projectId: req.body.projectId,
      publishJobId: req.body.publishJobId,
      platform: req.body.platform,
      externalVideoId: req.body.externalVideoId,
      views: req.body.views || 0,
      completionRate: req.body.completionRate,
      clickThroughRate: req.body.clickThroughRate,
      engagementRate: req.body.engagementRate,
      avgWatchSeconds: req.body.avgWatchSeconds,
      likes: req.body.likes || 0,
      comments: req.body.comments || 0,
      shares: req.body.shares || 0,
      impressions: req.body.impressions || 0,
      periodDays: req.body.periodDays || 7,
    },
  });
  res.status(201).json({ analytics: data });
});

export default router;
