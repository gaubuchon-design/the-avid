import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { authenticate, requireProjectAccess } from '../../middleware/auth';
import { validate, schemas, paginationQuery, paginate } from '../../utils/validation';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ─── GET /projects ─────────────────────────────────────────────────────────────
router.get('/', validate(paginationQuery, 'query'), async (req: Request, res: Response) => {
  const { page, limit, sortBy, sortOrder } = req.query as any;
  const userId = req.user!.id;
  const skip = (page - 1) * limit;

  // Allowlist sortable fields to prevent invalid field injection
  const allowedSortFields = ['updatedAt', 'createdAt', 'name', 'lastEditedAt'];
  const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'updatedAt';

  const [projects, total] = await Promise.all([
    db.project.findMany({
      where: { members: { some: { userId } }, deletedAt: null },
      include: {
        members: { select: { userId: true, role: true } },
        _count: { select: { bins: true, timelines: true } },
      },
      skip,
      take: limit,
      orderBy: { [safeSortBy]: sortOrder },
    }),
    db.project.count({ where: { members: { some: { userId } }, deletedAt: null } }),
  ]);

  res.json({ projects, pagination: paginate(total, page, limit) });
});

// ─── POST /projects ────────────────────────────────────────────────────────────
router.post('/', validate(schemas.createProject), async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const project = await db.project.create({
    data: {
      ...req.body,
      members: { create: { userId, role: 'OWNER' } },
      // Create default primary timeline
      timelines: {
        create: {
          name: 'Timeline 1',
          isPrimary: true,
          frameRate: req.body.frameRate ?? 23.976,
          width: req.body.width ?? 1920,
          height: req.body.height ?? 1080,
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
    where: { id: req.params.id, deletedAt: null },
    include: {
      bins: { include: { children: true, _count: { select: { mediaAssets: true } } } },
      timelines: { include: { tracks: { include: { clips: true } }, markers: true } },
      members: {
        include: { user: { select: { id: true, displayName: true, avatarUrl: true, email: true } } },
      },
      _count: { select: { aiJobs: true, publishJobs: true, comments: true } },
    },
  });
  if (!project) throw new NotFoundError('Project');
  res.json({ project });
});

// ─── PATCH /projects/:id ───────────────────────────────────────────────────────
router.patch('/:id', requireProjectAccess('EDITOR'), validate(schemas.updateProject), async (req: Request, res: Response) => {
  const project = await db.project.update({
    where: { id: req.params.id },
    data: { ...req.body, lastEditedAt: new Date() },
  });
  res.json({ project });
});

// ─── DELETE /projects/:id ──────────────────────────────────────────────────────
router.delete('/:id', requireProjectAccess('OWNER'), async (req: Request, res: Response) => {
  await db.project.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date(), status: 'DELETED' },
  });
  res.status(204).send();
});

// ─── GET /projects/:projectId/members ──────────────────────────────────────────
router.get('/:projectId/members', requireProjectAccess('VIEWER'), async (req: Request, res: Response) => {
  const members = await db.projectMember.findMany({
    where: { projectId: req.params.projectId },
    include: { user: { select: { id: true, displayName: true, email: true, avatarUrl: true, lastActiveAt: true } } },
  });
  res.json({ members });
});

// ─── POST /projects/:projectId/members ─────────────────────────────────────────
const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['VIEWER', 'REVIEWER', 'EDITOR', 'ASSISTANT', 'ADMIN']).default('EDITOR'),
});

router.post('/:projectId/members', requireProjectAccess('ADMIN'), validate(addMemberSchema), async (req: Request, res: Response) => {
  const { email, role } = req.body;
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new NotFoundError('User');

  const member = await db.projectMember.upsert({
    where: { projectId_userId: { projectId: req.params.projectId, userId: user.id } },
    update: { role },
    create: { projectId: req.params.projectId, userId: user.id, role: role ?? 'EDITOR' },
    include: { user: { select: { id: true, displayName: true, email: true, avatarUrl: true } } },
  });
  res.status(201).json({ member });
});

// ─── DELETE /projects/:projectId/members/:userId ────────────────────────────────
router.delete('/:projectId/members/:userId', requireProjectAccess('ADMIN'), async (req: Request, res: Response) => {
  // Can't remove yourself if owner
  if (req.params.userId === req.user!.id) {
    throw new ForbiddenError('Cannot remove yourself from the project');
  }
  await db.projectMember.delete({
    where: { projectId_userId: { projectId: req.params.projectId, userId: req.params.userId } },
  });
  res.status(204).send();
});

// ─── GET /projects/:projectId/versions ─────────────────────────────────────────
router.get('/:projectId/versions', requireProjectAccess('VIEWER'), async (req: Request, res: Response) => {
  const versions = await db.projectVersion.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ versions });
});

// ─── POST /projects/:projectId/versions — snapshot ─────────────────────────────
router.post('/:projectId/versions', requireProjectAccess('EDITOR'), async (req: Request, res: Response) => {
  const { version, notes } = req.body;
  const snap = await db.projectVersion.create({
    data: {
      projectId: req.params.projectId,
      version: version ?? `v${Date.now()}`,
      snapshotUrl: `snapshots/${req.params.projectId}/${version}.json`, // S3 key — populated by job
      notes,
      createdById: req.user!.id,
    },
  });
  res.status(201).json({ version: snap });
});

export default router;
