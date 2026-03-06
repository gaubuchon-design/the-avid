import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { authenticate, requireProjectAccess } from '../../middleware/auth';
import { validate, schemas } from '../../utils/validation';
import { NotFoundError } from '../../utils/errors';

// ─── COLLABORATION ROUTER ──────────────────────────────────────────────────────
const collabRouter = Router({ mergeParams: true });
collabRouter.use(authenticate);

// GET /projects/:projectId/comments
collabRouter.get('/comments', requireProjectAccess('VIEWER'), async (req: Request, res: Response) => {
  const comments = await db.comment.findMany({
    where: { projectId: req.params.projectId, deletedAt: null, parentId: null },
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
collabRouter.post('/comments', requireProjectAccess('REVIEWER'), validate(schemas.createComment), async (req: Request, res: Response) => {
  const comment = await db.comment.create({
    data: { ...req.body, projectId: req.params.projectId, userId: req.user!.id },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
  res.status(201).json({ comment });
});

// PATCH /projects/:projectId/comments/:commentId
collabRouter.patch('/comments/:commentId', requireProjectAccess('REVIEWER'), async (req: Request, res: Response) => {
  const comment = await db.comment.findUnique({ where: { id: req.params.commentId } });
  if (!comment || comment.userId !== req.user!.id) throw new NotFoundError('Comment');
  const updated = await db.comment.update({
    where: { id: req.params.commentId },
    data: { text: req.body.text, isResolved: req.body.isResolved },
  });
  res.json({ comment: updated });
});

// DELETE /projects/:projectId/comments/:commentId
collabRouter.delete('/comments/:commentId', requireProjectAccess('REVIEWER'), async (req: Request, res: Response) => {
  const comment = await db.comment.findUnique({ where: { id: req.params.commentId } });
  if (!comment || comment.userId !== req.user!.id) throw new NotFoundError('Comment');
  await db.comment.update({ where: { id: req.params.commentId }, data: { deletedAt: new Date() } });
  res.status(204).send();
});

// GET /projects/:projectId/approvals
collabRouter.get('/approvals', requireProjectAccess('REVIEWER'), async (req: Request, res: Response) => {
  const approvals = await db.approval.findMany({
    where: { projectId: req.params.projectId },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ approvals });
});

// POST /projects/:projectId/approvals
collabRouter.post('/approvals', requireProjectAccess('REVIEWER'), async (req: Request, res: Response) => {
  const { status, version, notes } = req.body;
  const approval = await db.approval.upsert({
    where: {
      id: (
        await db.approval.findFirst({
          where: { projectId: req.params.projectId, userId: req.user!.id, version },
          select: { id: true },
        })
      )?.id ?? 'new',
    },
    create: { projectId: req.params.projectId, userId: req.user!.id, status, version, notes },
    update: { status, notes },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
  res.status(201).json({ approval });
});

// POST /projects/:projectId/locks — acquire resource lock (collaborative editing)
collabRouter.post('/locks', requireProjectAccess('EDITOR'), async (req: Request, res: Response) => {
  const { resourceType, resourceId, sessionId } = req.body;
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

  const lock = await db.resourceLock.upsert({
    where: { resourceType_resourceId: { resourceType, resourceId } },
    update: { lockedById: req.user!.id, sessionId, expiresAt },
    create: {
      projectId: req.params.projectId,
      resourceType,
      resourceId,
      lockedById: req.user!.id,
      sessionId,
      expiresAt,
    },
  });
  res.status(201).json({ lock });
});

// DELETE /projects/:projectId/locks/:resourceType/:resourceId
collabRouter.delete('/locks/:resourceType/:resourceId', requireProjectAccess('EDITOR'), async (req: Request, res: Response) => {
  await db.resourceLock.deleteMany({
    where: {
      resourceType: req.params.resourceType,
      resourceId: req.params.resourceId,
      lockedById: req.user!.id,
    },
  });
  res.status(204).send();
});

export { collabRouter };

// ─── PUBLISH ROUTER ────────────────────────────────────────────────────────────
const publishRouter = Router({ mergeParams: true });
publishRouter.use(authenticate);

// GET /projects/:projectId/publish
publishRouter.get('/', requireProjectAccess('VIEWER'), async (req: Request, res: Response) => {
  const jobs = await db.publishJob.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ jobs });
});

// POST /projects/:projectId/publish
publishRouter.post('/', requireProjectAccess('EDITOR'), validate(schemas.createPublishJob), async (req: Request, res: Response) => {
  const job = await db.publishJob.create({
    data: {
      ...req.body,
      projectId: req.params.projectId,
      userId: req.user!.id,
      status: 'DRAFT',
    },
  });
  res.status(201).json({ job });
});

// PATCH /projects/:projectId/publish/:jobId
publishRouter.patch('/:jobId', requireProjectAccess('EDITOR'), async (req: Request, res: Response) => {
  const job = await db.publishJob.update({
    where: { id: req.params.jobId, projectId: req.params.projectId },
    data: req.body,
  });
  res.json({ job });
});

// POST /projects/:projectId/publish/:jobId/submit — kick off export + publish
publishRouter.post('/:jobId/submit', requireProjectAccess('EDITOR'), async (req: Request, res: Response) => {
  const { publishService } = await import('../../services/publish.service');

  const job = await db.publishJob.update({
    where: { id: req.params.jobId },
    data: { status: 'PENDING' },
  });

  publishService.enqueue(job);

  res.json({ job, message: 'Publish job queued' });
});

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

socialRouter.delete('/:connectionId', async (req: Request, res: Response) => {
  await db.socialConnection.updateMany({
    where: { id: req.params.connectionId, userId: req.user!.id },
    data: { isActive: false },
  });
  res.status(204).send();
});

export { publishRouter, socialRouter };
