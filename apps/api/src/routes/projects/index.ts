import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { authenticate, requireProjectAccess } from '../../middleware/auth';
import {
  validate, validateAll, schemas, cursorPaginationQuery,
  uuidParam, projectIdParam, projectAndUserParams,
} from '../../utils/validation';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';
import { projectService } from '../../services/project.service';
import { z } from 'zod';
import crypto from 'crypto';

const router = Router();
router.use(authenticate);

// ─── Query schemas ────────────────────────────────────────────────────────────

const projectListQuery = cursorPaginationQuery.extend({
  search: z.string().max(200).optional(),
  status: z.string().max(50).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateETag(data: unknown): string {
  const hash = crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
  return `"${hash}"`;
}

// ─── GET /projects ─────────────────────────────────────────────────────────────
router.get('/', validate(projectListQuery, 'query'), async (req: Request, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validated by middleware
  const { cursor, limit, sort, order } = req.query as any;
  const search = req.query['search'] as string | undefined;
  const status = req.query['status'] as string | undefined;
  const userId = req.user!.id;

  const result = await projectService.list({
    userId,
    cursor,
    limit,
    sort: sort ?? 'updatedAt',
    order,
    search,
    status,
  });

  const lastItem = result.data[result.data.length - 1];
  const firstItem = result.data[0];

  // Cache project list for 10 seconds (private since it's user-specific)
  res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');

  res.json({
    projects: result.data,
    pagination: {
      nextCursor: result.hasMore && lastItem ? lastItem.id : null,
      prevCursor: firstItem ? firstItem.id : null,
      limit,
      total: result.total,
      hasMore: result.hasMore,
    },
  });
});

// ─── POST /projects ────────────────────────────────────────────────────────────
router.post('/', validate(schemas.createProject), async (req: Request, res: Response) => {
  const project = await projectService.create({
    ...req.body,
    userId: req.user!.id,
  });

  res.status(201).json({ project });
});

// ─── GET /projects/:id ─────────────────────────────────────────────────────────
router.get('/:id', requireProjectAccess('VIEWER'), validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  const project = await projectService.getById(req.params['id']!);

  const etag = generateETag(project);
  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', project.updatedAt.toUTCString());

  if (req.headers['if-none-match'] === etag) {
    res.status(304).send();
    return;
  }

  res.json({ project });
});

// ─── PATCH /projects/:id ───────────────────────────────────────────────────────
router.patch(
  '/:id',
  requireProjectAccess('EDITOR'),
  validateAll({ params: uuidParam, body: schemas.updateProject }),
  async (req: Request, res: Response) => {
    const project = await projectService.update(req.params['id']!, req.body);
    res.json({ project });
  }
);

// ─── DELETE /projects/:id ──────────────────────────────────────────────────────
router.delete('/:id', requireProjectAccess('OWNER'), validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  await projectService.softDelete(req.params['id']!);
  res.status(204).send();
});

// ─── POST /projects/:id/duplicate ──────────────────────────────────────────────
router.post(
  '/:id/duplicate',
  requireProjectAccess('EDITOR'),
  validateAll({ params: uuidParam, body: schemas.duplicateProject }),
  async (req: Request, res: Response) => {
    const project = await projectService.duplicate(
      req.params['id']!,
      req.user!.id,
      req.body['name'],
    );

    res.status(201).json({ project });
  }
);

// ─── GET /projects/:projectId/members ──────────────────────────────────────────
router.get('/:projectId/members', requireProjectAccess('VIEWER'), validate(projectIdParam, 'params'), async (req: Request, res: Response) => {
  const members = await db.projectMember.findMany({
    where: { projectId: req.params['projectId']! },
    include: { user: { select: { id: true, displayName: true, email: true, avatarUrl: true, lastActiveAt: true } } },
  });
  res.json({ members });
});

// ─── POST /projects/:projectId/members ─────────────────────────────────────────
router.post(
  '/:projectId/members',
  requireProjectAccess('ADMIN'),
  validateAll({ params: projectIdParam, body: schemas.addProjectMember }),
  async (req: Request, res: Response) => {
    const { email, role } = req.body;
    const member = await projectService.addMember(req.params['projectId']!, email, role);
    res.status(201).json({ member });
  }
);

// ─── DELETE /projects/:projectId/members/:userId ────────────────────────────────
router.delete(
  '/:projectId/members/:userId',
  requireProjectAccess('ADMIN'),
  validate(projectAndUserParams, 'params'),
  async (req: Request, res: Response) => {
    await projectService.removeMember(
      req.params['projectId']!,
      req.params['userId']!,
      req.user!.id,
    );
    res.status(204).send();
  }
);

// ─── GET /projects/:projectId/versions ─────────────────────────────────────────
router.get('/:projectId/versions', requireProjectAccess('VIEWER'), validate(projectIdParam, 'params'), async (req: Request, res: Response) => {
  const versions = await db.projectVersion.findMany({
    where: { projectId: req.params['projectId']! },
    select: {
      id: true,
      version: true,
      notes: true,
      snapshotUrl: true,
      createdAt: true,
      createdById: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Versions rarely change -- cache for 30 seconds
  res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
  res.json({ versions });
});

// ─── POST /projects/:projectId/versions -- snapshot ─────────────────────────────
router.post(
  '/:projectId/versions',
  requireProjectAccess('EDITOR'),
  validateAll({ params: projectIdParam, body: schemas.createVersion }),
  async (req: Request, res: Response) => {
    const { version, notes } = req.body;
    const snap = await projectService.createVersion(
      req.params['projectId']!,
      req.user!.id,
      version,
      notes,
    );
    res.status(201).json({ version: snap });
  }
);

export default router;
