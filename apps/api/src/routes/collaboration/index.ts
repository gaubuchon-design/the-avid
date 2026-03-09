import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { authenticate, requireProjectAccess } from '../../middleware/auth';
import {
  validate, validateAll, schemas,
  projectIdParam, projectIdAndCommentIdParams, projectIdAndJobIdParams, resourceLockParams,
  uuidParam,
} from '../../utils/validation';
import { NotFoundError, BadRequestError, ConflictError } from '../../utils/errors';
import { collaborationService } from '../../services/collaboration.service';
import { z } from 'zod';

// ─── COLLABORATION ROUTER ──────────────────────────────────────────────────────
const collabRouter = Router({ mergeParams: true });
collabRouter.use(authenticate);

// GET /projects/:projectId/comments
collabRouter.get('/comments', requireProjectAccess('VIEWER'), async (req: Request, res: Response) => {
  const comments = await collaborationService.listComments(req.params['projectId']!);
  res.json({ comments });
});

// POST /projects/:projectId/comments
collabRouter.post(
  '/comments',
  requireProjectAccess('REVIEWER'),
  validateAll({ params: projectIdParam, body: schemas.createComment }),
  async (req: Request, res: Response) => {
    const comment = await collaborationService.createComment(
      req.params['projectId']!,
      req.user!.id,
      req.body,
    );
    res.status(201).json({ comment });
  }
);

// PATCH /projects/:projectId/comments/:commentId
collabRouter.patch(
  '/comments/:commentId',
  requireProjectAccess('REVIEWER'),
  validateAll({ params: projectIdAndCommentIdParams, body: schemas.updateComment }),
  async (req: Request, res: Response) => {
    const updated = await collaborationService.updateComment(
      req.params['commentId']!,
      req.user!.id,
      req.body,
    );
    res.json({ comment: updated });
  }
);

// DELETE /projects/:projectId/comments/:commentId
collabRouter.delete(
  '/comments/:commentId',
  requireProjectAccess('REVIEWER'),
  validate(projectIdAndCommentIdParams, 'params'),
  async (req: Request, res: Response) => {
    await collaborationService.deleteComment(req.params['commentId']!, req.user!.id);
    res.status(204).send();
  }
);

// GET /projects/:projectId/approvals
collabRouter.get('/approvals', requireProjectAccess('REVIEWER'), async (req: Request, res: Response) => {
  const approvals = await collaborationService.listApprovals(req.params['projectId']!);
  res.json({ approvals });
});

// POST /projects/:projectId/approvals
collabRouter.post(
  '/approvals',
  requireProjectAccess('REVIEWER'),
  validateAll({ params: projectIdParam, body: schemas.createApproval }),
  async (req: Request, res: Response) => {
    const { status, version, notes } = req.body;
    const approval = await collaborationService.upsertApproval(
      req.params['projectId']!,
      req.user!.id,
      { status, version, notes },
    );
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
    const lock = await collaborationService.acquireLock({
      projectId: req.params['projectId']!,
      resourceType,
      resourceId,
      userId: req.user!.id,
      sessionId,
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
    await collaborationService.releaseLock(
      req.params['resourceType']!,
      req.params['resourceId']!,
      req.user!.id,
    );
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
    where: { projectId: req.params['projectId']! },
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
        projectId: req.params['projectId']!,
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
      where: { id: req.params['jobId']!, projectId: req.params['projectId']! },
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
      where: { id: req.params['jobId']! },
      data: { status: 'PENDING' },
    });

    publishService.enqueue(job);

    res.status(202).json({ job, message: 'Publish job queued' });
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
    where: { id: req.params['connectionId']!, userId: req.user!.id },
    data: { isActive: false },
  });
  res.status(204).send();
});

export { publishRouter, socialRouter };
