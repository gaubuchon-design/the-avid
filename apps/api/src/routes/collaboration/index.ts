import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { authenticate, requireProjectAccess } from '../../middleware/auth';
import { validate, schemas, paginationQuery, paginate } from '../../utils/validation';
import { NotFoundError, ForbiddenError, assertFound } from '../../utils/errors';

// ─── COLLABORATION ROUTER ──────────────────────────────────────────────────────
const collabRouter = Router({ mergeParams: true });
collabRouter.use(authenticate);

// GET /projects/:projectId/comments
collabRouter.get('/comments', requireProjectAccess('VIEWER'), async (req: Request, res: Response) => {
  const { timelineId, resolved } = req.query as Record<string, string>;

  const where: any = {
    projectId: req.params['projectId'],
    deletedAt: null,
    parentId: null,
    ...(timelineId ? { timelineId } : {}),
    ...(resolved === 'true' ? { isResolved: true } : {}),
    ...(resolved === 'false' ? { isResolved: false } : {}),
  };

  const comments = await db.comment.findMany({
    where,
    include: {
      user: { select: { id: true, displayName: true, avatarUrl: true } },
      replies: {
        where: { deletedAt: null },
        include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ comments });
});

// POST /projects/:projectId/comments
collabRouter.post(
  '/comments',
  requireProjectAccess('REVIEWER'),
  validate(schemas.createComment),
  async (req: Request, res: Response) => {
    // If parentId is provided, verify it belongs to the same project
    if (req.body.parentId) {
      const parent = await db.comment.findFirst({
        where: { id: req.body.parentId, projectId: req.params['projectId'], deletedAt: null },
      });
      if (!parent) throw new NotFoundError('Parent comment');
    }

    const comment = await db.comment.create({
      data: { ...req.body, projectId: req.params['projectId'], userId: req.user!.id },
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
    res.status(201).json({ comment });
  }
);

// PATCH /projects/:projectId/comments/:commentId
collabRouter.patch(
  '/comments/:commentId',
  requireProjectAccess('REVIEWER'),
  validate(schemas.updateComment),
  async (req: Request, res: Response) => {
    const comment = await db.comment.findFirst({
      where: { id: req.params['commentId'], projectId: req.params['projectId'], deletedAt: null },
    });
    assertFound(comment, 'Comment');

    // Only the author can edit text; anyone with reviewer+ can resolve
    if (req.body.text !== undefined && comment.userId !== req.user!.id) {
      throw new ForbiddenError('Only the comment author can edit the text');
    }

    const updated = await db.comment.update({
      where: { id: req.params['commentId'] },
      data: {
        ...(req.body.text !== undefined ? { text: req.body.text } : {}),
        ...(req.body.isResolved !== undefined ? { isResolved: req.body.isResolved } : {}),
      },
    });
    res.json({ comment: updated });
  }
);

// DELETE /projects/:projectId/comments/:commentId
collabRouter.delete(
  '/comments/:commentId',
  requireProjectAccess('REVIEWER'),
  async (req: Request, res: Response) => {
    const comment = await db.comment.findFirst({
      where: { id: req.params['commentId'], projectId: req.params['projectId'], deletedAt: null },
    });
    assertFound(comment, 'Comment');

    // Only the author or admin can delete
    if (comment.userId !== req.user!.id) {
      // Check if user is admin
      const member = await db.projectMember.findUnique({
        where: { projectId_userId: { projectId: req.params['projectId'], userId: req.user!.id } },
      });
      if (!member || !['ADMIN', 'OWNER'].includes(member.role)) {
        throw new ForbiddenError('Only the comment author or project admin can delete comments');
      }
    }

    // Soft delete the comment and its replies
    await db.comment.updateMany({
      where: {
        OR: [
          { id: req.params['commentId'] },
          { parentId: req.params['commentId'] },
        ],
      },
      data: { deletedAt: new Date() },
    });
    res.status(204).send();
  }
);

// GET /projects/:projectId/approvals
collabRouter.get('/approvals', requireProjectAccess('REVIEWER'), async (req: Request, res: Response) => {
  const approvals = await db.approval.findMany({
    where: { projectId: req.params['projectId'] },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ approvals });
});

// POST /projects/:projectId/approvals
collabRouter.post(
  '/approvals',
  requireProjectAccess('REVIEWER'),
  validate(schemas.createApproval),
  async (req: Request, res: Response) => {
    const { status, version, notes } = req.body;

    // Find existing approval for this user+version combination
    const existing = await db.approval.findFirst({
      where: { projectId: req.params['projectId'], userId: req.user!.id, version },
      select: { id: true },
    });

    const approval = await db.approval.upsert({
      where: { id: existing?.id ?? 'nonexistent' },
      create: { projectId: req.params['projectId'], userId: req.user!.id, status, version, notes },
      update: { status, notes },
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
    res.status(201).json({ approval });
  }
);

// POST /projects/:projectId/locks -- acquire resource lock (collaborative editing)
collabRouter.post(
  '/locks',
  requireProjectAccess('EDITOR'),
  validate(schemas.createLock),
  async (req: Request, res: Response) => {
    const { resourceType, resourceId, sessionId } = req.body;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

    // Check if already locked by another user
    const existingLock = await db.resourceLock.findUnique({
      where: { resourceType_resourceId: { resourceType, resourceId } },
    });

    if (existingLock && existingLock.lockedById !== req.user!.id && existingLock.expiresAt > new Date()) {
      return res.status(409).json({
        error: {
          message: 'Resource is locked by another user',
          code: 'RESOURCE_LOCKED',
          details: {
            lockedBy: existingLock.lockedById,
            expiresAt: existingLock.expiresAt,
          },
        },
      });
    }

    const lock = await db.resourceLock.upsert({
      where: { resourceType_resourceId: { resourceType, resourceId } },
      update: { lockedById: req.user!.id, sessionId, expiresAt },
      create: {
        projectId: req.params['projectId'],
        resourceType,
        resourceId,
        lockedById: req.user!.id,
        sessionId,
        expiresAt,
      },
    });
    res.status(201).json({ lock });
  }
);

// GET /projects/:projectId/locks
collabRouter.get('/locks', requireProjectAccess('VIEWER'), async (req: Request, res: Response) => {
  const locks = await db.resourceLock.findMany({
    where: {
      projectId: req.params['projectId'],
      expiresAt: { gt: new Date() },
    },
    include: {
      lockedBy: { select: { id: true, displayName: true, avatarUrl: true } },
    },
  });
  res.json({ locks });
});

// DELETE /projects/:projectId/locks/:resourceType/:resourceId
collabRouter.delete(
  '/locks/:resourceType/:resourceId',
  requireProjectAccess('EDITOR'),
  async (req: Request, res: Response) => {
    await db.resourceLock.deleteMany({
      where: {
        resourceType: req.params['resourceType'],
        resourceId: req.params['resourceId'],
        lockedById: req.user!.id,
      },
    });
    res.status(204).send();
  }
);

export { collabRouter };

// ─── PUBLISH ROUTER ────────────────────────────────────────────────────────────
const publishRouter = Router({ mergeParams: true });
publishRouter.use(authenticate);

// GET /projects/:projectId/publish
publishRouter.get('/', requireProjectAccess('VIEWER'), async (req: Request, res: Response) => {
  const jobs = await db.publishJob.findMany({
    where: { projectId: req.params['projectId'] },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ jobs });
});

// POST /projects/:projectId/publish
publishRouter.post(
  '/',
  requireProjectAccess('EDITOR'),
  validate(schemas.createPublishJob),
  async (req: Request, res: Response) => {
    const job = await db.publishJob.create({
      data: {
        ...req.body,
        projectId: req.params['projectId'],
        userId: req.user!.id,
        status: 'DRAFT',
      },
    });
    res.status(201).json({ job });
  }
);

// GET /projects/:projectId/publish/:jobId
publishRouter.get('/:jobId', requireProjectAccess('VIEWER'), async (req: Request, res: Response) => {
  const job = await db.publishJob.findFirst({
    where: { id: req.params['jobId'], projectId: req.params['projectId'] },
  });
  assertFound(job, 'Publish job');
  res.json({ job });
});

// PATCH /projects/:projectId/publish/:jobId
publishRouter.patch('/:jobId', requireProjectAccess('EDITOR'), async (req: Request, res: Response) => {
  const job = await db.publishJob.findFirst({
    where: { id: req.params['jobId'], projectId: req.params['projectId'] },
  });
  assertFound(job, 'Publish job');

  if (!['DRAFT', 'FAILED'].includes(job.status)) {
    return res.status(400).json({
      error: { message: `Cannot edit a publish job in "${job.status}" state`, code: 'BAD_REQUEST' },
    });
  }

  const updated = await db.publishJob.update({
    where: { id: req.params['jobId'] },
    data: req.body,
  });
  res.json({ job: updated });
});

// POST /projects/:projectId/publish/:jobId/submit -- kick off export + publish
publishRouter.post('/:jobId/submit', requireProjectAccess('EDITOR'), async (req: Request, res: Response) => {
  const { publishService } = await import('../../services/publish.service');

  const job = await db.publishJob.findFirst({
    where: { id: req.params['jobId'], projectId: req.params['projectId'] },
  });
  assertFound(job, 'Publish job');

  if (!['DRAFT', 'FAILED'].includes(job.status)) {
    return res.status(400).json({
      error: { message: `Cannot submit a publish job in "${job.status}" state`, code: 'BAD_REQUEST' },
    });
  }

  const updated = await db.publishJob.update({
    where: { id: req.params['jobId'] },
    data: { status: 'PENDING' },
  });

  publishService.enqueue(updated);

  res.json({ job: updated, message: 'Publish job queued' });
});

// DELETE /projects/:projectId/publish/:jobId -- cancel job
publishRouter.delete('/:jobId', requireProjectAccess('EDITOR'), async (req: Request, res: Response) => {
  const job = await db.publishJob.findFirst({
    where: { id: req.params['jobId'], projectId: req.params['projectId'] },
  });
  assertFound(job, 'Publish job');

  if (!['DRAFT', 'PENDING', 'FAILED'].includes(job.status)) {
    return res.status(400).json({
      error: { message: `Cannot cancel a publish job in "${job.status}" state`, code: 'BAD_REQUEST' },
    });
  }

  await db.publishJob.delete({ where: { id: req.params['jobId'] } });
  res.status(204).send();
});

export { publishRouter };

// ─── SOCIAL CONNECTIONS ROUTER ────────────────────────────────────────────────
const socialRouter = Router();
socialRouter.use(authenticate);

// GET /social-connections
socialRouter.get('/', async (req: Request, res: Response) => {
  const connections = await db.socialConnection.findMany({
    where: { userId: req.user!.id, isActive: true },
    select: { id: true, platform: true, accountName: true, isActive: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ connections });
});

// DELETE /social-connections/:connectionId
socialRouter.delete('/:connectionId', async (req: Request, res: Response) => {
  const result = await db.socialConnection.updateMany({
    where: { id: req.params['connectionId'], userId: req.user!.id },
    data: { isActive: false },
  });
  if (result.count === 0) throw new NotFoundError('Social connection');
  res.status(204).send();
});

export { socialRouter };
