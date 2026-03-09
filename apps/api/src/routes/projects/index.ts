import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { authenticate, requireProjectAccess } from '../../middleware/auth';
import { validate, schemas, paginationQuery, paginate } from '../../utils/validation';
import { NotFoundError, ForbiddenError, BadRequestError, assertFound } from '../../utils/errors';

const router = Router();
router.use(authenticate);

// ─── GET /projects ─────────────────────────────────────────────────────────────
router.get('/', validate(paginationQuery, 'query'), async (req: Request, res: Response) => {
  const { page, limit, sortBy, sortOrder } = req.query as any;
  const { search, status } = req.query as Record<string, string>;
  const userId = req.user!.id;
  const skip = (page - 1) * limit;

  const where: any = {
    members: { some: { userId } },
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(search ? {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { tags: { hasSome: [search] } },
      ],
    } : {}),
  };

  const allowedSortFields = ['updatedAt', 'createdAt', 'name', 'lastEditedAt'];
  const orderField = allowedSortFields.includes(sortBy) ? sortBy : 'updatedAt';

  const [projects, total] = await Promise.all([
    db.project.findMany({
      where,
      include: {
        members: {
          select: { userId: true, role: true },
          take: 10,
        },
        _count: { select: { bins: true, timelines: true, comments: true } },
      },
      skip,
      take: limit,
      orderBy: { [orderField]: sortOrder },
    }),
    db.project.count({ where }),
  ]);

  res.json({ projects, pagination: paginate(total, page, limit) });
});

// ─── POST /projects ────────────────────────────────────────────────────────────
router.post('/', validate(schemas.createProject), async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { tags, ...projectData } = req.body;

  const project = await db.project.create({
    data: {
      ...projectData,
      tags: tags ?? [],
      members: { create: { userId, role: 'OWNER' } },
      // Create default primary timeline
      timelines: {
        create: {
          name: 'Timeline 1',
          isPrimary: true,
          frameRate: projectData.frameRate ?? 23.976,
          width: projectData.width ?? 1920,
          height: projectData.height ?? 1080,
          tracks: {
            create: [
              { name: 'V1', type: 'VIDEO', sortOrder: 0, color: '#6366f1' },
              { name: 'V2', type: 'VIDEO', sortOrder: 1, color: '#818cf8' },
              { name: 'A1', type: 'AUDIO', sortOrder: 2, color: '#22c55e' },
              { name: 'A2', type: 'AUDIO', sortOrder: 3, color: '#4ade80' },
              { name: 'FX', type: 'EFFECT', sortOrder: 4, color: '#f59e0b' },
              { name: 'SUB', type: 'SUBTITLE', sortOrder: 5, color: '#f1f5f9' },
            ],
          },
        },
      },
      // Default root bins
      bins: {
        create: [
          { name: 'Rushes', color: '#6366f1', sortOrder: 0 },
          { name: 'Music', color: '#22c55e', sortOrder: 1 },
          { name: 'Graphics', color: '#f59e0b', sortOrder: 2 },
          { name: 'Selects', color: '#ec4899', sortOrder: 3 },
        ],
      },
    },
    include: {
      timelines: { include: { tracks: true } },
      bins: true,
      members: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } },
    },
  });

  res.status(201).json({ project });
});

// ─── GET /projects/:id ─────────────────────────────────────────────────────────
router.get('/:id', requireProjectAccess('VIEWER'), async (req: Request, res: Response) => {
  const project = await db.project.findUnique({
    where: { id: req.params['id'], deletedAt: null },
    include: {
      bins: {
        where: { parentId: null },
        include: { children: true, _count: { select: { mediaAssets: true } } },
        orderBy: { sortOrder: 'asc' },
      },
      timelines: {
        include: {
          tracks: { include: { clips: true }, orderBy: { sortOrder: 'asc' } },
          markers: { orderBy: { time: 'asc' } },
        },
        orderBy: { createdAt: 'asc' },
      },
      members: {
        include: { user: { select: { id: true, displayName: true, avatarUrl: true, email: true } } },
      },
      _count: { select: { aiJobs: true, publishJobs: true, comments: true } },
    },
  });
  assertFound(project, 'Project');
  res.json({ project });
});

// ─── PATCH /projects/:id ───────────────────────────────────────────────────────
router.patch(
  '/:id',
  requireProjectAccess('EDITOR'),
  validate(schemas.updateProject),
  async (req: Request, res: Response) => {
    const project = await db.project.update({
      where: { id: req.params['id'] },
      data: { ...req.body, lastEditedAt: new Date() },
    });
    res.json({ project });
  }
);

// ─── DELETE /projects/:id ──────────────────────────────────────────────────────
router.delete('/:id', requireProjectAccess('OWNER'), async (req: Request, res: Response) => {
  // Soft delete
  await db.project.update({
    where: { id: req.params['id'] },
    data: { deletedAt: new Date(), status: 'DELETED' },
  });
  res.status(204).send();
});

// ─── POST /projects/:id/duplicate ──────────────────────────────────────────────
router.post('/:id/duplicate', requireProjectAccess('EDITOR'), async (req: Request, res: Response) => {
  const source = await db.project.findUnique({
    where: { id: req.params['id'] },
    include: { bins: true, timelines: { include: { tracks: true } } },
  });
  assertFound(source, 'Project');

  const newName = req.body.name || `${source.name} (Copy)`;

  const project = await db.project.create({
    data: {
      name: newName,
      description: source.description,
      orgId: source.orgId,
      frameRate: source.frameRate,
      width: source.width,
      height: source.height,
      sampleRate: source.sampleRate,
      colorSpace: source.colorSpace,
      tags: source.tags,
      members: { create: { userId: req.user!.id, role: 'OWNER' } },
    },
  });

  res.status(201).json({ project });
});

// ─── GET /projects/:projectId/members ──────────────────────────────────────────
router.get('/:projectId/members', requireProjectAccess('VIEWER'), async (req: Request, res: Response) => {
  const members = await db.projectMember.findMany({
    where: { projectId: req.params['projectId'] },
    include: {
      user: {
        select: { id: true, displayName: true, email: true, avatarUrl: true, lastActiveAt: true },
      },
    },
    orderBy: { joinedAt: 'asc' },
  });
  res.json({ members });
});

// ─── POST /projects/:projectId/members ─────────────────────────────────────────
router.post(
  '/:projectId/members',
  requireProjectAccess('ADMIN'),
  validate(schemas.addProjectMember),
  async (req: Request, res: Response) => {
    const { email, role } = req.body;
    const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user) throw new NotFoundError('User with that email');

    const member = await db.projectMember.upsert({
      where: { projectId_userId: { projectId: req.params['projectId'], userId: user.id } },
      update: { role },
      create: { projectId: req.params['projectId'], userId: user.id, role },
      include: { user: { select: { id: true, displayName: true, email: true, avatarUrl: true } } },
    });
    res.status(201).json({ member });
  }
);

// ─── DELETE /projects/:projectId/members/:userId ────────────────────────────────
router.delete('/:projectId/members/:userId', requireProjectAccess('ADMIN'), async (req: Request, res: Response) => {
  // Cannot remove yourself
  if (req.params['userId'] === req.user!.id) {
    throw new ForbiddenError('Cannot remove yourself from the project');
  }

  // Cannot remove the owner
  const targetMember = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId: req.params['projectId'], userId: req.params['userId'] } },
  });
  if (targetMember?.role === 'OWNER') {
    throw new ForbiddenError('Cannot remove the project owner');
  }

  await db.projectMember.delete({
    where: { projectId_userId: { projectId: req.params['projectId'], userId: req.params['userId'] } },
  });
  res.status(204).send();
});

// ─── GET /projects/:projectId/versions ─────────────────────────────────────────
router.get('/:projectId/versions', requireProjectAccess('VIEWER'), async (req: Request, res: Response) => {
  const versions = await db.projectVersion.findMany({
    where: { projectId: req.params['projectId'] },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ versions });
});

// ─── POST /projects/:projectId/versions -- snapshot ─────────────────────────────
router.post(
  '/:projectId/versions',
  requireProjectAccess('EDITOR'),
  validate(schemas.createVersion),
  async (req: Request, res: Response) => {
    const { version, notes } = req.body;
    const snap = await db.projectVersion.create({
      data: {
        projectId: req.params['projectId'],
        version: version ?? `v${Date.now()}`,
        snapshotUrl: `snapshots/${req.params['projectId']}/${version ?? Date.now()}.json`,
        notes,
        createdById: req.user!.id,
      },
    });
    res.status(201).json({ version: snap });
  }
);

export default router;
