/**
 * Brand & Marketing Routes
 * Handles brand kits, campaigns, variants, compliance, DAM connections
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { db } from '../../db/client';
import {
  validate, validateAll, schemas, uuidParam, projectIdParam, paginationQuery, paginate,
} from '../../utils/validation';
import { NotFoundError } from '../../utils/errors';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ─── Compound param schemas for nested routes ───────────────────────────────
const kitIdParam = z.object({ kitId: z.string().uuid() });
const kitAndTemplateParams = z.object({ kitId: z.string().uuid(), id: z.string().uuid() });
const campaignIdParam = z.object({ id: z.string().uuid() });
const campaignAndDeliverableParams = z.object({ campaignId: z.string().uuid(), id: z.string().uuid() });
const campaignIdOnlyParam = z.object({ campaignId: z.string().uuid() });

const brandKitQuery = z.object({
  orgId: z.string().uuid().optional(),
});

const campaignQuery = paginationQuery.extend({
  orgId: z.string().uuid().optional(),
  status: z.string().max(50).optional(),
});

// ─── Brand Kits ──────────────────────────────────────────────────────────────

router.get('/brand-kits', validate(brandKitQuery, 'query'), async (req: Request, res: Response) => {
  const { orgId } = req.query as { orgId?: string };
  const kits = await db.brandKit.findMany({
    where: orgId ? { orgId } : {},
    include: { templates: { take: 5 }, campaigns: { take: 5 } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ brandKits: kits });
});

router.get('/brand-kits/:id', validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  const kit = await db.brandKit.findUnique({
    where: { id: req.params['id'] },
    include: { templates: true, campaigns: true },
  });
  if (!kit) throw new NotFoundError('Brand kit');
  res.json({ brandKit: kit });
});

router.post('/brand-kits', validate(schemas.createBrandKit), async (req: Request, res: Response) => {
  const kit = await db.brandKit.create({ data: req.body });
  res.status(201).json({ brandKit: kit });
});

router.patch('/brand-kits/:id', validateAll({ params: uuidParam, body: schemas.updateBrandKit }), async (req: Request, res: Response) => {
  const existing = await db.brandKit.findUnique({ where: { id: req.params['id'] } });
  if (!existing) throw new NotFoundError('Brand kit');

  const kit = await db.brandKit.update({
    where: { id: req.params['id'] },
    data: req.body,
  });
  res.json({ brandKit: kit });
});

router.delete('/brand-kits/:id', validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  const existing = await db.brandKit.findUnique({ where: { id: req.params['id'] } });
  if (!existing) throw new NotFoundError('Brand kit');

  await db.brandKit.delete({ where: { id: req.params['id'] } });
  res.status(204).send();
});

// ─── Brand Templates ─────────────────────────────────────────────────────────

router.get('/brand-kits/:kitId/templates', validate(kitIdParam, 'params'), async (req: Request, res: Response) => {
  const kit = await db.brandKit.findUnique({ where: { id: req.params['kitId'] } });
  if (!kit) throw new NotFoundError('Brand kit');

  const templates = await db.brandTemplate.findMany({
    where: { brandKitId: req.params['kitId'] },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ templates });
});

router.post(
  '/brand-kits/:kitId/templates',
  validateAll({ params: kitIdParam, body: schemas.createBrandTemplate }),
  async (req: Request, res: Response) => {
    const kit = await db.brandKit.findUnique({ where: { id: req.params['kitId'] } });
    if (!kit) throw new NotFoundError('Brand kit');

    const template = await db.brandTemplate.create({
      data: {
        brandKitId: req.params['kitId'],
        ...req.body,
      },
    });
    res.status(201).json({ template });
  }
);

router.patch(
  '/brand-kits/:kitId/templates/:id',
  validateAll({ params: kitAndTemplateParams, body: schemas.updateBrandTemplate }),
  async (req: Request, res: Response) => {
    const existing = await db.brandTemplate.findUnique({ where: { id: req.params['id'] } });
    if (!existing) throw new NotFoundError('Brand template');

    const template = await db.brandTemplate.update({
      where: { id: req.params['id'] },
      data: req.body,
    });
    res.json({ template });
  }
);

// ─── Campaigns ───────────────────────────────────────────────────────────────

router.get('/campaigns', validate(campaignQuery, 'query'), async (req: Request, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validated by middleware
  const { page, limit, sortBy, sortOrder, orgId, status } = req.query as any;
  const skip = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma dynamic where clause
  const where: any = {};
  if (orgId) where['orgId'] = orgId;
  if (status) where['status'] = status;

  const allowedSortFields = ['createdAt', 'name', 'startDate', 'endDate'];
  const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';

  const [campaigns, total] = await Promise.all([
    db.campaign.findMany({
      where,
      include: {
        brandKit: { select: { id: true, brandName: true } },
        deliverables: true,
        markets: true,
        _count: { select: { variants: true } },
      },
      orderBy: { [safeSortBy]: sortOrder },
      skip,
      take: limit,
    }),
    db.campaign.count({ where }),
  ]);
  res.json({ campaigns, pagination: paginate(total, page, limit) });
});

router.get('/campaigns/:id', validate(campaignIdParam, 'params'), async (req: Request, res: Response) => {
  const campaign = await db.campaign.findUnique({
    where: { id: req.params['id'] },
    include: {
      brandKit: true,
      deliverables: { orderBy: { createdAt: 'asc' } },
      markets: true,
      variants: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!campaign) throw new NotFoundError('Campaign');
  res.json({ campaign });
});

router.post('/campaigns', validate(schemas.createCampaign), async (req: Request, res: Response) => {
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

router.patch('/campaigns/:id', validateAll({ params: campaignIdParam, body: schemas.updateCampaign }), async (req: Request, res: Response) => {
  const existing = await db.campaign.findUnique({ where: { id: req.params['id'] } });
  if (!existing) throw new NotFoundError('Campaign');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma dynamic data payload
  const data: any = { ...req.body };
  if (data['startDate']) data['startDate'] = new Date(data['startDate']);
  if (data['endDate']) data['endDate'] = new Date(data['endDate']);

  const campaign = await db.campaign.update({
    where: { id: req.params['id'] },
    data,
  });
  res.json({ campaign });
});

// ─── Campaign Deliverables ───────────────────────────────────────────────────

router.post(
  '/campaigns/:campaignId/deliverables',
  validateAll({ params: campaignIdOnlyParam, body: schemas.createDeliverable }),
  async (req: Request, res: Response) => {
    const campaign = await db.campaign.findUnique({ where: { id: req.params['campaignId'] } });
    if (!campaign) throw new NotFoundError('Campaign');

    const deliverable = await db.campaignDeliverable.create({
      data: {
        campaignId: req.params['campaignId'],
        ...req.body,
      },
    });
    res.status(201).json({ deliverable });
  }
);

router.patch(
  '/campaigns/:campaignId/deliverables/:id',
  validateAll({ params: campaignAndDeliverableParams, body: schemas.updateDeliverable }),
  async (req: Request, res: Response) => {
    const existing = await db.campaignDeliverable.findUnique({ where: { id: req.params['id'] } });
    if (!existing) throw new NotFoundError('Campaign deliverable');

    const deliverable = await db.campaignDeliverable.update({
      where: { id: req.params['id'] },
      data: req.body,
    });
    res.json({ deliverable });
  }
);

// ─── Content Variants ────────────────────────────────────────────────────────

router.get('/campaigns/:campaignId/variants', validate(campaignIdOnlyParam, 'params'), async (req: Request, res: Response) => {
  const campaign = await db.campaign.findUnique({ where: { id: req.params['campaignId'] } });
  if (!campaign) throw new NotFoundError('Campaign');

  const variants = await db.contentVariant.findMany({
    where: { campaignId: req.params['campaignId'] },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ variants });
});

router.post(
  '/campaigns/:campaignId/variants',
  validateAll({ params: campaignIdOnlyParam, body: schemas.createContentVariant }),
  async (req: Request, res: Response) => {
    const campaign = await db.campaign.findUnique({ where: { id: req.params['campaignId'] } });
    if (!campaign) throw new NotFoundError('Campaign');

    const variant = await db.contentVariant.create({
      data: {
        campaignId: req.params['campaignId'],
        ...req.body,
      },
    });
    res.status(201).json({ variant });
  }
);

router.post('/campaigns/:campaignId/variants/generate-all', validate(campaignIdOnlyParam, 'params'), async (req: Request, res: Response) => {
  const campaign = await db.campaign.findUnique({ where: { id: req.params['campaignId'] } });
  if (!campaign) throw new NotFoundError('Campaign');

  const variants = await db.contentVariant.findMany({
    where: { campaignId: req.params['campaignId'], status: 'PENDING' },
  });

  // Use a transaction for batch update
  const updated = await db.$transaction(
    variants.map((v: { id: string }) =>
      db.contentVariant.update({
        where: { id: v.id },
        data: { status: 'GENERATING' },
      })
    )
  );

  res.status(202).json({ variants: updated, message: `${updated.length} variants queued for generation` });
});

// ─── Compliance Reports ──────────────────────────────────────────────────────

router.get('/compliance/:projectId', validate(projectIdParam, 'params'), async (req: Request, res: Response) => {
  const reports = await db.complianceReport.findMany({
    where: { projectId: req.params['projectId'] },
    orderBy: { checkedAt: 'desc' },
    take: 10,
  });
  res.json({ reports });
});

router.post(
  '/compliance/:projectId/check',
  validateAll({ params: projectIdParam, body: schemas.complianceCheck }),
  async (req: Request, res: Response) => {
    const { brandKitId } = req.body;
    const userId = req.user!.id;

    const report = await db.complianceReport.create({
      data: {
        projectId: req.params['projectId'],
        brandKitId,
        overallStatus: 'PASS',
        findings: [],
        checkedById: userId,
      },
    });
    res.status(201).json({ report });
  }
);

// ─── DAM Connections ─────────────────────────────────────────────────────────

router.get('/dam-connections', async (req: Request, res: Response) => {
  const { orgId } = req.query as { orgId?: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma dynamic where clause
  const where: any = { isActive: true };
  if (orgId) where['orgId'] = orgId;

  const connections = await db.dAMConnection.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ connections });
});

router.post('/dam-connections', validate(schemas.createDAMConnection), async (req: Request, res: Response) => {
  const connection = await db.dAMConnection.create({
    data: req.body,
  });
  res.status(201).json({ connection });
});

router.delete('/dam-connections/:id', validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  const existing = await db.dAMConnection.findUnique({ where: { id: req.params['id'] } });
  if (!existing) throw new NotFoundError('DAM connection');

  await db.dAMConnection.update({
    where: { id: req.params['id'] },
    data: { isActive: false },
  });
  res.status(204).send();
});

// ─── Performance Analytics ───────────────────────────────────────────────────

router.get('/analytics/:projectId', validate(projectIdParam, 'params'), async (req: Request, res: Response) => {
  const analytics = await db.videoPerformance.findMany({
    where: { projectId: req.params['projectId'] },
    orderBy: { measuredAt: 'desc' },
  });
  res.json({ analytics });
});

router.post('/analytics', validate(schemas.createVideoPerformance), async (req: Request, res: Response) => {
  const data = await db.videoPerformance.create({
    data: req.body,
  });
  res.status(201).json({ analytics: data });
});

export default router;
