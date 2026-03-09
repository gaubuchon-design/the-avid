import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { authenticate, optionalAuth } from '../../middleware/auth';
import { validate, schemas, paginationQuery, paginate } from '../../utils/validation';
import { NotFoundError, ConflictError, InsufficientTokensError, assertFound } from '../../utils/errors';
import { tokenService } from '../../services/token.service';

const router = Router();

// ─── GET /marketplace -- public listing ────────────────────────────────────────
router.get('/', validate(paginationQuery, 'query'), async (req: Request, res: Response) => {
  const { page, limit, sortBy, sortOrder } = req.query as any;
  const { type, featured, search } = req.query as Record<string, string>;
  const skip = (page - 1) * limit;

  const where: any = {
    isPublished: true,
    ...(type ? { type: type.toUpperCase() } : {}),
    ...(featured === 'true' ? { isFeatured: true } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { tags: { hasSome: [search] } },
          ],
        }
      : {}),
  };

  const allowedSortFields = ['downloadCount', 'createdAt', 'name', 'priceTokens', 'avgRating'];
  const orderField = allowedSortFields.includes(sortBy) ? sortBy : 'downloadCount';

  const [items, total] = await Promise.all([
    db.marketplaceItem.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [orderField]: sortOrder },
      include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
    }),
    db.marketplaceItem.count({ where }),
  ]);

  res.json({ items, pagination: paginate(total, page, limit) });
});

// ─── GET /marketplace/me/library -- user's purchased items ─────────────────────
// NOTE: This must be before /:slug to avoid matching 'me' as a slug
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

// ─── GET /marketplace/me/published -- user's published items ───────────────────
router.get('/me/published', authenticate, async (req: Request, res: Response) => {
  const items = await db.marketplaceItem.findMany({
    where: { authorId: req.user!.id },
    include: {
      _count: { select: { purchases: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items });
});

// ─── GET /marketplace/:slug ────────────────────────────────────────────────────
router.get('/:slug', optionalAuth, async (req: Request, res: Response) => {
  const item = await db.marketplaceItem.findUnique({
    where: { slug: req.params.slug, isPublished: true },
    include: {
      author: { select: { id: true, displayName: true, avatarUrl: true } },
      _count: { select: { purchases: true } },
    },
  });
  assertFound(item, 'Marketplace item');

  // Check if current user has purchased
  let purchased = false;
  if (req.user) {
    const purchase = await db.marketplacePurchase.findUnique({
      where: { userId_itemId: { userId: req.user.id, itemId: item.id } },
    });
    purchased = !!purchase;
  }

  res.json({ item, purchased });
});

// ─── POST /marketplace/:id/purchase ────────────────────────────────────────────
router.post('/:id/purchase', authenticate, async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const item = await db.marketplaceItem.findUnique({ where: { id: req.params.id } });
  if (!item || !item.isPublished) throw new NotFoundError('Marketplace item');

  // Cannot purchase own item
  if (item.authorId === userId) {
    return res.status(400).json({
      error: { message: 'Cannot purchase your own item', code: 'BAD_REQUEST' },
    });
  }

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
router.post(
  '/',
  authenticate,
  validate(schemas.createMarketplaceItem),
  async (req: Request, res: Response) => {
    const item = await db.marketplaceItem.create({
      data: { ...req.body, authorId: req.user!.id, isPublished: false },
    });
    res.status(201).json({ item });
  }
);

// ─── PATCH /marketplace/:id -- update item (author only) ───────────────────────
router.patch('/:id', authenticate, async (req: Request, res: Response) => {
  const item = await db.marketplaceItem.findUnique({ where: { id: req.params.id } });
  assertFound(item, 'Marketplace item');

  if (item.authorId !== req.user!.id) {
    return res.status(403).json({
      error: { message: 'Only the author can update this item', code: 'FORBIDDEN' },
    });
  }

  const allowed = ['name', 'description', 'tags', 'priceTokens', 'priceCents',
    'downloadUrl', 'previewUrl', 'isPublished', 'isFeatured'];
  const data: any = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) data[k] = req.body[k]; });

  const updated = await db.marketplaceItem.update({
    where: { id: req.params.id },
    data,
  });
  res.json({ item: updated });
});

export default router;
