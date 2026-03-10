import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { authenticate } from '../../middleware/auth';
import {
  validate, validateAll, schemas, cursorPaginationQuery,
  uuidParam, slugParam,
} from '../../utils/validation';
import { NotFoundError, ConflictError, InsufficientTokensError } from '../../utils/errors';
import { tokenService } from '../../services/token.service';
import { z } from 'zod';
import crypto from 'crypto';

const router = Router();

// ─── Query schemas ────────────────────────────────────────────────────────────

const marketplaceListQuery = cursorPaginationQuery.extend({
  type: z.string().max(50).optional(),
  featured: z.string().optional(),
  search: z.string().max(200).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateETag(data: unknown): string {
  const hash = crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
  return `"${hash}"`;
}

// ─── GET /marketplace -- public listing ────────────────────────────────────────
router.get('/', validate(marketplaceListQuery, 'query'), async (req: Request, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validated by middleware
  const { cursor, limit, sort, order } = req.query as any;
  const type = req.query['type'] as string | undefined;
  const featured = req.query['featured'] as string | undefined;
  const search = req.query['search'] as string | undefined;

  const allowedSortFields = ['downloadCount', 'createdAt', 'name', 'priceTokens'];
  const safeSortBy = allowedSortFields.includes(sort) ? sort : 'downloadCount';

  const where: Record<string, unknown> = {
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

  const cursorClause = cursor ? { cursor: { id: cursor }, skip: 1 } : {};

  const [items, total] = await Promise.all([
    db.marketplaceItem.findMany({
      where,
      take: limit + 1,
      orderBy: { [safeSortBy]: order },
      include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
      ...cursorClause,
    }),
    db.marketplaceItem.count({ where }),
  ]);

  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const lastItem = data[data.length - 1];
  const firstItem = data[0];

  res.json({
    items: data,
    pagination: {
      nextCursor: hasMore && lastItem ? lastItem.id : null,
      prevCursor: firstItem ? firstItem.id : null,
      limit,
      total,
      hasMore,
    },
  });
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
  const item = await db.marketplaceItem.findFirst({
    where: { slug: req.params['slug']!, isPublished: true },
    include: {
      author: { select: { id: true, displayName: true, avatarUrl: true } },
      _count: { select: { purchases: true } },
    },
  });
  if (!item) throw new NotFoundError('Marketplace item');

  const etag = generateETag(item);
  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', item.updatedAt.toUTCString());

  if (req.headers['if-none-match'] === etag) {
    res.status(304).send();
    return;
  }

  res.json({ item });
});

// ─── POST /marketplace/:id/purchase ────────────────────────────────────────────
router.post('/:id/purchase', authenticate, validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const item = await db.marketplaceItem.findUnique({ where: { id: req.params['id']! } });
  if (!item || !item.isPublished) throw new NotFoundError('Marketplace item');

  // Check already purchased
  const existing = await db.marketplacePurchase.findUnique({
    where: { userId_itemId: { userId, itemId: item.id } },
  });
  if (existing) throw new ConflictError('Already purchased');

  // Free items
  if (item.priceTokens === 0 && item.priceCents === 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma transaction client
    const purchase = await db.$transaction(async (tx: any) => {
      const p = await tx.marketplacePurchase.create({
        data: { userId, itemId: item.id, paidTokens: 0, paidCents: 0 },
      });
      await tx.marketplaceItem.update({ where: { id: item.id }, data: { downloadCount: { increment: 1 } } });
      return p;
    });
    res.status(201).json({ purchase, downloadUrl: item.downloadUrl });
    return;
  }

  // Token payment
  if (item.priceTokens > 0) {
    const balance = await tokenService.getBalance(userId);
    if (balance < item.priceTokens) throw new InsufficientTokensError(item.priceTokens, balance);
    await tokenService.debit(userId, item.priceTokens, 'marketplace_purchase', item.id);
  }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma transaction client
  const purchase = await db.$transaction(async (tx: any) => {
    const p = await tx.marketplacePurchase.create({
      data: { userId, itemId: item.id, paidTokens: item.priceTokens, paidCents: item.priceCents },
    });
    await tx.marketplaceItem.update({ where: { id: item.id }, data: { downloadCount: { increment: 1 } } });
    return p;
  });

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
  const existing = await db.marketplaceItem.findUnique({ where: { id: req.params['id']! } });
  if (!existing || existing.authorId !== req.user!.id) throw new NotFoundError('Marketplace item');

  const item = await db.marketplaceItem.update({
    where: { id: req.params['id']! },
    data: req.body,
  });
  res.json({ item });
});

export default router;
