import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { authenticate } from '../../middleware/auth';
import {
  validate, validateAll, schemas, paginationQuery, paginate,
  uuidParam, slugParam,
} from '../../utils/validation';
import { NotFoundError, ConflictError, InsufficientTokensError } from '../../utils/errors';
import { tokenService } from '../../services/token.service';

const router = Router();

// ─── GET /marketplace -- public listing ────────────────────────────────────────
router.get('/', validate(paginationQuery, 'query'), async (req: Request, res: Response) => {
  const { page, limit, sortBy, sortOrder } = req.query as any;
  const { type, featured, search } = req.query as any;
  const skip = (page - 1) * limit;

  // Allowlist sortable fields to prevent invalid field injection
  const allowedSortFields = ['downloadCount', 'createdAt', 'name', 'priceTokens'];
  const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'downloadCount';

  const where: any = {
    isPublished: true,
    ...(type ? { type } : {}),
    ...(featured === 'true' ? { isFeatured: true } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { tags: { has: search } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    db.marketplaceItem.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [safeSortBy]: sortOrder },
      include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
    }),
    db.marketplaceItem.count({ where }),
  ]);

  res.json({ items, pagination: paginate(total, page, limit) });
});

// ─── GET /marketplace/me/library -- user's purchased items ─────────────────────
// IMPORTANT: This route MUST be before /:slug to avoid being matched as a slug
router.get('/me/library', authenticate, async (req: Request, res: Response) => {
  const purchases = await db.marketplacePurchase.findMany({
    where: { userId: req.user!.id },
    include: {
      item: {
        include: { author: { select: { id: true, displayName: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ purchases });
});

// ─── GET /marketplace/:slug ────────────────────────────────────────────────────
router.get('/:slug', validate(slugParam, 'params'), async (req: Request, res: Response) => {
  const item = await db.marketplaceItem.findUnique({
    where: { slug: req.params['slug'], isPublished: true },
    include: {
      author: { select: { id: true, displayName: true, avatarUrl: true } },
      _count: { select: { purchases: true } },
    },
  });
  if (!item) throw new NotFoundError('Marketplace item');
  res.json({ item });
});

// ─── POST /marketplace/:id/purchase ────────────────────────────────────────────
router.post('/:id/purchase', authenticate, validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const item = await db.marketplaceItem.findUnique({ where: { id: req.params['id'] } });
  if (!item || !item.isPublished) throw new NotFoundError('Marketplace item');

  // Check already purchased
  const existing = await db.marketplacePurchase.findUnique({
    where: { userId_itemId: { userId, itemId: item.id } },
  });
  if (existing) throw new ConflictError('Already purchased');

  // Free items
  if (item.priceTokens === 0 && item.priceCents === 0) {
    const purchase = await db.marketplacePurchase.create({
      data: { userId, itemId: item.id, paidTokens: 0, paidCents: 0 },
    });
    await db.marketplaceItem.update({ where: { id: item.id }, data: { downloadCount: { increment: 1 } } });
    return res.status(201).json({ purchase, downloadUrl: item.downloadUrl });
  }

  // Token payment
  if (item.priceTokens > 0) {
    const balance = await tokenService.getBalance(userId);
    if (balance < item.priceTokens) throw new InsufficientTokensError(item.priceTokens, balance);
    await tokenService.debit(userId, item.priceTokens, 'marketplace_purchase', item.id);
  }

  const purchase = await db.marketplacePurchase.create({
    data: { userId, itemId: item.id, paidTokens: item.priceTokens, paidCents: item.priceCents },
  });

  await db.marketplaceItem.update({ where: { id: item.id }, data: { downloadCount: { increment: 1 } } });

  // 70/30 split -- credit author 70% of tokens
  if (item.priceTokens > 0) {
    const authorCut = Math.floor(item.priceTokens * 0.7);
    await tokenService.credit(item.authorId, authorCut, 'marketplace_sale', item.id);
  }

  res.status(201).json({ purchase, downloadUrl: item.downloadUrl });
});

// ─── POST /marketplace -- publish item (authenticated authors) ──────────────────
router.post('/', authenticate, validate(schemas.createMarketplaceItem), async (req: Request, res: Response) => {
  const item = await db.marketplaceItem.create({
    data: { ...req.body, authorId: req.user!.id, isPublished: false },
  });
  res.status(201).json({ item });
});

// ─── PATCH /marketplace/:id -- update item ──────────────────────────────────────
router.patch('/:id', authenticate, validateAll({ params: uuidParam, body: schemas.updateMarketplaceItem }), async (req: Request, res: Response) => {
  // Verify ownership
  const existing = await db.marketplaceItem.findUnique({ where: { id: req.params['id'] } });
  if (!existing || existing.authorId !== req.user!.id) throw new NotFoundError('Marketplace item');

  const item = await db.marketplaceItem.update({
    where: { id: req.params['id'] },
    data: req.body,
  });
  res.json({ item });
});

export default router;
