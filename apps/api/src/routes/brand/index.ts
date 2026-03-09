/**
 * Brand & Marketing Routes
 * Handles brand kits, campaigns, variants, compliance, DAM connections
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { db } from '../../db/client';
import { validate, paginationQuery, paginate } from '../../utils/validation';
import { assertFound, NotFoundError, ForbiddenError } from '../../utils/errors';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ─── Brand Kits ──────────────────────────────────────────────────────────────

const createBrandKitSchema = z.object({
  orgId: z.string().uuid(),
  brandName: z.string().min(1).max(200),
  primaryColors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).optional(),
  secondaryColors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).optional(),
  fonts: z.record(z.string()).optional(),
  typography: z.record(z.any()).optional(),
  voiceTone: z.string().max(1000).optional(),
  approvedMusicIds: z.array(z.string().uuid()).optional(),
  prohibitedElements: z.array(z.string().max(200)).optional(),
});

const updateBrandKitSchema = z.object({
  brandName: z.string().min(1).max(200).optional(),
  primaryColors: z.array(z.string()).optional(),
  secondaryColors: z.array(z.string()).optional(),
  fonts: z.record(z.string()).optional(),
  typography: z.record(z.any()).optional(),
  voiceTone: z.string().max(1000).optional(),
  approvedMusicIds: z.array(z.string().uuid()).optional(),
  prohibitedElements: z.array(z.string()).optional(),
}).strict();

router.get('/brand-kits', async (req: Request, res: Response) => {
  const { orgId } = req.query as Record<string, string>;
  const kits = await db.brandKit.findMany({
    where: orgId ? { orgId } : {},
    include: { templates: { take: 5 }, campaigns: { take: 5 } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ brandKits: kits });
});

router.get('/brand-kits/:id', async (req: Request, res: Response) => {
  const kit = await db.brandKit.findUnique({
    where: { id: req.params.id },
    include: { templates: true, campaigns: true },
  });
  assertFound(kit, 'Brand kit');
  res.json({ brandKit: kit });
});

router.post('/brand-kits', validate(createBrandKitSchema), async (req: Request, res: Response) => {
  const kit = await db.brandKit.create({ data: req.body });
  res.status(201).json({ brandKit: kit });
});

router.patch('/brand-kits/:id', validate(updateBrandKitSchema), async (req: Request, res: Response) => {
  const kit = await db.brandKit.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json({ brandKit: kit });
});

router.delete('/brand-kits/:id', async (req: Request, res: Response) => {
  await db.brandKit.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ─── Brand Templates ─────────────────────────────────────────────────────────

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  elements: z.array(z.record(z.unknown())).default([]),
  lockedElementIds: z.array(z.string()).default([]),
  category: z.string().max(100).optional(),
});

router.get('/brand-kits/:kitId/templates', async (req: Request, res: Response) => {
  const templates = await db.brandTemplate.findMany({
    where: { brandKitId: req.params.kitId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ templates });
});

router.post('/brand-kits/:kitId/templates', validate(createTemplateSchema), async (req: Request, res: Response) => {
  // Verify brand kit exists
  const kit = await db.brandKit.findUnique({ where: { id: req.params.kitId } });
  assertFound(kit, 'Brand kit');

  const template = await db.brandTemplate.create({
    data: { brandKitId: req.params.kitId, ...req.body },
  });
  res.status(201).json({ template });
});

router.patch('/brand-kits/:kitId/templates/:id', async (req: Request, res: Response) => {
  const template = await db.brandTemplate.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json({ template });
});

// ─── Campaigns ───────────────────────────────────────────────────────────────

const createCampaignSchema = z.object({
  orgId: z.string().uuid(),
  brandKitId: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  brief: z.string().max(5000).optional(),
  objective: z.string().max(500).optional(),
  targetAudience: z.string().max(500).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  tokenBudget: z.number().int().min(0).optional(),
});

router.get('/campaigns', validate(paginationQuery, 'query'), async (req: Request, res: Response) => {
  const { orgId, status } = req.query as Record<string, string>;
  const { page, limit } = req.query as any;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (orgId) where.orgId = orgId;
  if (status) where.status = status;

  const [campaigns, total] = await Promise.all([
    db.campaign.findMany({
      where,
      include: {
        brandKit: { select: { id: true, brandName: true } },
        deliverables: true,
        markets: true,
        _count: { select: { variants: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.campaign.count({ where }),
  ]);
  res.json({ campaigns, pagination: paginate(total, page, limit) });
});

router.get('/campaigns/:id', async (req: Request, res: Response) => {
  const campaign = await db.campaign.findUnique({
    where: { id: req.params.id },
    include: {
      brandKit: true,
      deliverables: { orderBy: { createdAt: 'asc' } },
      markets: true,
      variants: { orderBy: { createdAt: 'desc' } },
    },
  });
  assertFound(campaign, 'Campaign');
  res.json({ campaign });
});

router.post('/campaigns', validate(createCampaignSchema), async (req: Request, res: Response) => {
  const data = req.body;
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
  const campaign = await db.campaign.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json({ campaign });
});

// ─── Campaign Deliverables ───────────────────────────────────────────────────

const createDeliverableSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.string().max(100),
  targetDuration: z.number().positive().optional(),
  aspectRatio: z.string().max(20).optional(),
  assignedEditorId: z.string().uuid().optional(),
});

router.post(
  '/campaigns/:campaignId/deliverables',
  validate(createDeliverableSchema),
  async (req: Request, res: Response) => {
    const deliverable = await db.campaignDeliverable.create({
      data: { campaignId: req.params.campaignId, ...req.body },
    });
    res.status(201).json({ deliverable });
  }
);

router.patch('/campaigns/:campaignId/deliverables/:id', async (req: Request, res: Response) => {
  const deliverable = await db.campaignDeliverable.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json({ deliverable });
});

// ─── Content Variants ────────────────────────────────────────────────────────

const createVariantSchema = z.object({
  masterProjectId: z.string().uuid().optional(),
  variantName: z.string().min(1).max(200),
  languageCode: z.string().max(10).optional(),
  changes: z.array(z.record(z.unknown())).default([]),
});

router.get('/campaigns/:campaignId/variants', async (req: Request, res: Response) => {
  const variants = await db.contentVariant.findMany({
    where: { campaignId: req.params.campaignId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ variants });
});

router.post(
  '/campaigns/:campaignId/variants',
  validate(createVariantSchema),
  async (req: Request, res: Response) => {
    const variant = await db.contentVariant.create({
      data: { campaignId: req.params.campaignId, ...req.body },
    });
    res.status(201).json({ variant });
  }
);

router.post('/campaigns/:campaignId/variants/generate-all', async (req: Request, res: Response) => {
  const variants = await db.contentVariant.findMany({
    where: { campaignId: req.params.campaignId, status: 'PENDING' },
  });

  if (variants.length === 0) {
    return res.json({ variants: [], message: 'No pending variants to generate' });
  }

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

const createDAMSchema = z.object({
  orgId: z.string().uuid(),
  provider: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  apiEndpoint: z.string().url(),
  apiKey: z.string().optional(),
  accessToken: z.string().optional(),
});

router.get('/dam-connections', async (req: Request, res: Response) => {
  const { orgId } = req.query as Record<string, string>;
  const connections = await db.dAMConnection.findMany({
    where: {
      ...(orgId ? { orgId } : {}),
      isActive: true,
    },
  });
  res.json({ connections });
});

router.post('/dam-connections', validate(createDAMSchema), async (req: Request, res: Response) => {
  const connection = await db.dAMConnection.create({ data: req.body });
  res.status(201).json({ connection });
});

router.delete('/dam-connections/:id', async (req: Request, res: Response) => {
  await db.dAMConnection.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });
  res.status(204).send();
});

// ─── Performance Analytics ───────────────────────────────────────────────────

router.get('/analytics/:projectId', async (req: Request, res: Response) => {
  const { period } = req.query as Record<string, string>;
  const analytics = await db.videoPerformance.findMany({
    where: {
      projectId: req.params.projectId,
      ...(period ? { periodDays: parseInt(period, 10) } : {}),
    },
    orderBy: { measuredAt: 'desc' },
    take: 50,
  });
  res.json({ analytics });
});

const createAnalyticsSchema = z.object({
  projectId: z.string().uuid(),
  publishJobId: z.string().uuid().optional(),
  platform: z.string().max(50),
  externalVideoId: z.string().max(200).optional(),
  views: z.number().int().min(0).default(0),
  completionRate: z.number().min(0).max(1).optional(),
  clickThroughRate: z.number().min(0).max(1).optional(),
  engagementRate: z.number().min(0).max(1).optional(),
  avgWatchSeconds: z.number().min(0).optional(),
  likes: z.number().int().min(0).default(0),
  comments: z.number().int().min(0).default(0),
  shares: z.number().int().min(0).default(0),
  impressions: z.number().int().min(0).default(0),
  periodDays: z.number().int().min(1).default(7),
});

router.post('/analytics', validate(createAnalyticsSchema), async (req: Request, res: Response) => {
  const data = await db.videoPerformance.create({ data: req.body });
  res.status(201).json({ analytics: data });
});

export default router;
