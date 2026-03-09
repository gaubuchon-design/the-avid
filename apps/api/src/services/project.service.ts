import { db } from '../db/client';
import { logger } from '../utils/logger';
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ListProjectsParams {
  userId: string;
  cursor?: string;
  limit: number;
  sort: string;
  order: 'asc' | 'desc';
  search?: string;
  status?: string;
}

export interface CreateProjectParams {
  name: string;
  description?: string;
  orgId?: string;
  frameRate: number;
  width: number;
  height: number;
  sampleRate: number;
  colorSpace: string;
  tags: string[];
  userId: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

class ProjectService {
  private static readonly ALLOWED_SORT_FIELDS = ['updatedAt', 'createdAt', 'name', 'lastEditedAt'];

  async list(params: ListProjectsParams) {
    const { userId, cursor, limit, sort, order, search, status } = params;

    const safeSortBy = ProjectService.ALLOWED_SORT_FIELDS.includes(sort) ? sort : 'updatedAt';

    const where: Record<string, unknown> = {
      members: { some: { userId } },
      deletedAt: null,
      ...(status ? { status } : {}),
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

    const cursorClause = cursor ? { cursor: { id: cursor }, skip: 1 } : {};

    const [items, total] = await Promise.all([
      db.project.findMany({
        where,
        include: {
          members: { select: { userId: true, role: true } },
          _count: { select: { bins: true, timelines: true } },
        },
        take: limit + 1,
        orderBy: { [safeSortBy]: order },
        ...cursorClause,
      }),
      db.project.count({ where }),
    ]);

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;

    return { data, total, hasMore };
  }

  async getById(projectId: string) {
    const project = await db.project.findUnique({
      where: { id: projectId, deletedAt: null },
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
    return project;
  }

  async create(params: CreateProjectParams) {
    const { userId, ...data } = params;

    const project = await db.project.create({
      data: {
        ...data,
        members: { create: { userId, role: 'OWNER' } },
        timelines: {
          create: {
            name: 'Timeline 1',
            isPrimary: true,
            frameRate: data.frameRate,
            width: data.width,
            height: data.height,
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

    logger.info('Project created', { projectId: project.id, userId });
    return project;
  }

  async update(projectId: string, data: Record<string, unknown>) {
    const project = await db.project.update({
      where: { id: projectId },
      data: { ...data, lastEditedAt: new Date() },
    });
    return project;
  }

  async softDelete(projectId: string) {
    await db.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date(), status: 'DELETED' },
    });
    logger.info('Project soft-deleted', { projectId });
  }

  async duplicate(projectId: string, userId: string, newName?: string) {
    const source = await db.project.findUnique({
      where: { id: projectId },
      include: { bins: true, timelines: { include: { tracks: true } } },
    });
    if (!source) throw new NotFoundError('Project');

    const project = await db.project.create({
      data: {
        name: newName ?? `${source.name} (Copy)`,
        description: source.description,
        orgId: source.orgId,
        frameRate: source.frameRate,
        width: source.width,
        height: source.height,
        sampleRate: source.sampleRate,
        colorSpace: source.colorSpace,
        tags: source.tags,
        members: { create: { userId, role: 'OWNER' } },
      },
    });

    logger.info('Project duplicated', { sourceId: projectId, newId: project.id, userId });
    return project;
  }

  async addMember(projectId: string, email: string, role: string) {
    const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user) throw new NotFoundError('User with that email');

    const member = await db.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: user.id } },
      update: { role },
      create: { projectId, userId: user.id, role },
      include: { user: { select: { id: true, displayName: true, email: true, avatarUrl: true } } },
    });

    logger.info('Project member added', { projectId, userId: user.id, role });
    return member;
  }

  async removeMember(projectId: string, targetUserId: string, requesterId: string) {
    if (targetUserId === requesterId) {
      throw new ForbiddenError('Cannot remove yourself from the project');
    }

    const targetMember = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });
    if (targetMember?.role === 'OWNER') {
      throw new ForbiddenError('Cannot remove the project owner');
    }

    await db.projectMember.delete({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });

    logger.info('Project member removed', { projectId, userId: targetUserId });
  }

  async createVersion(projectId: string, userId: string, version?: string, notes?: string) {
    const versionStr = version ?? `v${Date.now()}`;
    const snap = await db.projectVersion.create({
      data: {
        projectId,
        version: versionStr,
        snapshotUrl: `snapshots/${projectId}/${versionStr}.json`,
        notes,
        createdById: userId,
      },
    });

    logger.info('Project version created', { projectId, version: versionStr });
    return snap;
  }
}

export const projectService = new ProjectService();
