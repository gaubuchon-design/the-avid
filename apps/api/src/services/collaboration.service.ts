import { db } from '../db/client';
import { logger } from '../utils/logger';
import { NotFoundError, ConflictError, ForbiddenError } from '../utils/errors';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AcquireLockParams {
  projectId: string;
  resourceType: string;
  resourceId: string;
  userId: string;
  sessionId?: string;
  ttlMs?: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

class CollaborationService {
  private static readonly DEFAULT_LOCK_TTL_MS = 5 * 60 * 1000; // 5 min

  // ─── Comments ───────────────────────────────────────────────────────────

  async listComments(projectId: string) {
    return db.comment.findMany({
      where: { projectId, deletedAt: null, parentId: null },
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
  }

  async createComment(
    projectId: string,
    userId: string,
    data: { text: string; timelineId?: string; timecode?: number; parentId?: string },
  ) {
    const comment = await db.comment.create({
      data: { ...data, projectId, userId },
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
    });

    logger.info('Comment created', { projectId, commentId: comment.id, userId });
    return comment;
  }

  async updateComment(commentId: string, userId: string, data: { text?: string; isResolved?: boolean }) {
    const comment = await db.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.userId !== userId) throw new NotFoundError('Comment');

    return db.comment.update({
      where: { id: commentId },
      data,
    });
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await db.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.userId !== userId) throw new NotFoundError('Comment');

    await db.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
    logger.info('Comment soft-deleted', { commentId, userId });
  }

  // ─── Approvals ──────────────────────────────────────────────────────────

  async listApprovals(projectId: string) {
    return db.approval.findMany({
      where: { projectId },
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upsertApproval(
    projectId: string,
    userId: string,
    data: { status: string; version: string; notes?: string },
  ) {
    const existing = await db.approval.findFirst({
      where: { projectId, userId, version: data.version },
      select: { id: true },
    });

    if (existing) {
      return db.approval.update({
        where: { id: existing.id },
        data: { status: data.status, notes: data.notes },
        include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
      });
    }

    return db.approval.create({
      data: { projectId, userId, ...data },
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
  }

  // ─── Resource Locks ─────────────────────────────────────────────────────

  async acquireLock(params: AcquireLockParams) {
    const { projectId, resourceType, resourceId, userId, sessionId } = params;
    const ttlMs = params.ttlMs ?? CollaborationService.DEFAULT_LOCK_TTL_MS;
    const expiresAt = new Date(Date.now() + ttlMs);

    const existingLock = await db.resourceLock.findUnique({
      where: { resourceType_resourceId: { resourceType, resourceId } },
    });

    if (existingLock && existingLock.lockedById !== userId && existingLock.expiresAt > new Date()) {
      throw new ConflictError(
        `Resource is locked by another user until ${existingLock.expiresAt.toISOString()}`,
      );
    }

    const lock = await db.resourceLock.upsert({
      where: { resourceType_resourceId: { resourceType, resourceId } },
      update: { lockedById: userId, sessionId, expiresAt },
      create: { projectId, resourceType, resourceId, lockedById: userId, sessionId, expiresAt },
    });

    logger.info('Resource lock acquired', { projectId, resourceType, resourceId, userId });
    return lock;
  }

  async releaseLock(resourceType: string, resourceId: string, userId: string) {
    await db.resourceLock.deleteMany({
      where: { resourceType, resourceId, lockedById: userId },
    });
    logger.info('Resource lock released', { resourceType, resourceId, userId });
  }
}

export const collaborationService = new CollaborationService();
