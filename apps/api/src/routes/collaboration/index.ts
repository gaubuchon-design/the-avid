import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { authenticate, requireProjectAccess } from '../../middleware/auth';
import {
  validate, validateAll, schemas,
  projectIdParam, projectIdAndCommentIdParams, projectIdAndJobIdParams, resourceLockParams,
  uuidParam,
} from '../../utils/validation';
import { NotFoundError, BadRequestError, ConflictError } from '../../utils/errors';
import { z } from 'zod';

// ─── COLLABORATION ROUTER ──────────────────────────────────────────────────────
const collabRouter = Router({ mergeParams: true });
collabRouter.use(authenticate);

// GET /projects/:projectId/comments
collabRouter.get('/comments', requireProjectAccess('VIEWER'), async (req: Request, res: Response) => {
  const comments = await db.comment.findMany({
    where: { projectId: req.params['projectId'], deletedAt: null, parentId: null },
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
  validateAll({ params: projectIdParam, body: schemas.createComment }),
  async (req: Request, res: Response) => {
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
  validateAll({ params: projectIdAndCommentIdParams, body: schemas.updateComment }),
  async (req: Request, res: Response) => {
    const comment = await db.comment.findUnique({ where: { id: req.params['commentId'] } });
    if (!comment || comment.userId !== req.user!.id) throw new NotFoundError('Comment');
    const updated = await db.comment.update({
      where: { id: req.params['commentId'] },
      data: req.body,
    });
    res.json({ comment: updated });
  }
);

// DELETE /projects/:projectId/comments/:commentId
collabRouter.delete(
  '/comments/:commentId',
  requireProjectAccess('REVIEWER'),
  validate(projectIdAndCommentIdParams, 'params'),
  async (req: Request, res: Response) => {
    const comment = await db.comment.findUnique({ where: { id: req.params['commentId'] } });
    if (!comment || comment.userId !== req.user!.id) throw new NotFoundError('Comment');
    await db.comment.update({ where: { id: req.params['commentId'] }, data: { deletedAt: new Date() } });
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
  validateAll({ params: projectIdParam, body: schemas.createApproval }),
  async (req: Request, res: Response) => {
    const { status, version, notes } = req.body;

    // Check for existing approval by this user for this version
    const existing = await db.approval.findFirst({
      where: { projectId: req.params['projectId'], userId: req.user!.id, version },
      select: { id: true },
    });

    let approval;
    if (existing) {
      approval = await db.approval.update({
        where: { id: existing.id },
        data: { status, notes },
        include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
      });
    } else {
      approval = await db.approval.create({
        data: { projectId: req.params['projectId'], userId: req.user!.id, status, version, notes },
        include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
      });
    }
    res.status(201).json({ approval });
  }
);

// POST /projects/:projectId/locks -- acquire resource lock (collaborative editing)
collabRouter.post(
  '/locks',
  requireProjectAccess('EDITOR'),
  validateAll({ params: projectIdParam, body: schemas.createLock }),
  async (req: Request, res: Response) => {
    const { resourceType, resourceId, sessionId } = req.body;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

    // Check for existing unexpired lock held by another user
    const existingLock = await db.resourceLock.findUnique({
      where: { resourceType_resourceId: { resourceType, resourceId } },
    });

    if (existingLock && existingLock.lockedById !== req.user!.id && existingLock.expiresAt > new Date()) {
      throw new ConflictError(`Resource is locked by another user until ${existingLock.expiresAt.toISOString()}`);
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

// DELETE /projects/:projectId/locks/:resourceType/:resourceId
collabRouter.delete(
  '/locks/:resourceType/:resourceId',
  requireProjectAccess('EDITOR'),
  validate(resourceLockParams, 'params'),
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
  });
  res.json({ jobs });
});

// POST /projects/:projectId/publish
publishRouter.post(
  '/',
  requireProjectAccess('EDITOR'),
  validateAll({ params: projectIdParam, body: schemas.createPublishJob }),
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

// PATCH /projects/:projectId/publish/:jobId
publishRouter.patch(
  '/:jobId',
  requireProjectAccess('EDITOR'),
  validateAll({ params: projectIdAndJobIdParams, body: schemas.updatePublishJob }),
  async (req: Request, res: Response) => {
    const job = await db.publishJob.update({
      where: { id: req.params['jobId'], projectId: req.params['projectId'] },
      data: req.body,
    });
    res.json({ job });
  }
);

// POST /projects/:projectId/publish/:jobId/submit -- kick off export + publish
publishRouter.post(
  '/:jobId/submit',
  requireProjectAccess('EDITOR'),
  validate(projectIdAndJobIdParams, 'params'),
  async (req: Request, res: Response) => {
    const { publishService } = await import('../../services/publish.service');

    const job = await db.publishJob.update({
      where: { id: req.params['jobId'] },
      data: { status: 'PENDING' },
    });

    publishService.enqueue(job);

    res.json({ job, message: 'Publish job queued' });
  }
);

// GET /users/me/social-connections
const socialRouter = Router();
socialRouter.use(authenticate);

socialRouter.get('/', async (req: Request, res: Response) => {
  const connections = await db.socialConnection.findMany({
    where: { userId: req.user!.id, isActive: true },
    select: { id: true, platform: true, accountName: true, isActive: true, createdAt: true },
  });
  res.json({ connections });
});

const connectionIdParam = z.object({ connectionId: z.string().uuid() });
socialRouter.delete('/:connectionId', validate(connectionIdParam, 'params'), async (req: Request, res: Response) => {
  await db.socialConnection.updateMany({
    where: { id: req.params['connectionId'], userId: req.user!.id },
    data: { isActive: false },
  });
  res.status(204).send();
});

export { publishRouter, socialRouter };
