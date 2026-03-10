import { db } from '../db/client';
import { logger } from '../utils/logger';
import { NotFoundError, BadRequestError } from '../utils/errors';

// ─── Service ────────────────────────────────────────────────────────────────

class NewsService {
  // ─── NRCS Connections ───────────────────────────────────────────────────

  async listConnections() {
    return db.nRCSConnection.findMany({
      where: { isActive: true },
      include: { rundowns: { take: 5, orderBy: { airDate: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createConnection(data: Record<string, unknown>) {
    const connection = await db.nRCSConnection.create({ data: data as any });
    logger.info('NRCS connection created', { connectionId: connection.id });
    return connection;
  }

  async updateConnection(id: string, data: Record<string, unknown>) {
    const existing = await db.nRCSConnection.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('NRCS connection');

    return db.nRCSConnection.update({ where: { id }, data: data as any });
  }

  async deactivateConnection(id: string) {
    const existing = await db.nRCSConnection.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('NRCS connection');

    await db.nRCSConnection.update({ where: { id }, data: { isActive: false } });
    logger.info('NRCS connection deactivated', { connectionId: id });
  }

  // ─── Rundowns ───────────────────────────────────────────────────────────

  async listRundowns(params: {
    cursor?: string;
    limit: number;
    order: 'asc' | 'desc';
    connectionId?: string;
    date?: string;
  }) {
    const { cursor, limit, order, connectionId, date } = params;

    const where: Record<string, unknown> = {};
    if (connectionId) where['nrcsConnectionId'] = connectionId;
    if (date) {
      const d = new Date(date);
      if (!Number.isNaN(d.getTime())) {
        const dayStart = new Date(d);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(d);
        dayEnd.setHours(23, 59, 59, 999);
        where['airDate'] = { gte: dayStart, lt: dayEnd };
      }
    }

    const cursorClause = cursor ? { cursor: { id: cursor }, skip: 1 } : {};

    const [items, total] = await Promise.all([
      db.rundown.findMany({
        where,
        include: { stories: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { airDate: order },
        take: limit + 1,
        ...cursorClause,
      }),
      db.rundown.count({ where }),
    ]);

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;

    return { data, total, hasMore };
  }

  async getRundown(id: string) {
    const rundown = await db.rundown.findUnique({
      where: { id },
      include: { stories: { orderBy: { sortOrder: 'asc' } }, nrcsConnection: true },
    });
    if (!rundown) throw new NotFoundError('Rundown');
    return rundown;
  }

  // ─── Stories ────────────────────────────────────────────────────────────

  async getStory(id: string) {
    const story = await db.newsStory.findUnique({
      where: { id },
      include: { rundown: true },
    });
    if (!story) throw new NotFoundError('News story');
    return story;
  }

  async updateStory(id: string, data: Record<string, unknown>) {
    const existing = await db.newsStory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('News story');

    return db.newsStory.update({ where: { id }, data: data as any });
  }

  async assignStory(storyId: string, userId: string) {
    const existing = await db.newsStory.findUnique({ where: { id: storyId } });
    if (!existing) throw new NotFoundError('News story');

    return db.newsStory.update({
      where: { id: storyId },
      data: { assignedEditorId: userId, status: 'IN_EDIT' },
    });
  }

  async markReady(storyId: string) {
    const existing = await db.newsStory.findUnique({ where: { id: storyId } });
    if (!existing) throw new NotFoundError('News story');

    return db.newsStory.update({
      where: { id: storyId },
      data: { status: 'READY' },
    });
  }

  async sendToAir(storyId: string, destinationId: string) {
    const story = await db.newsStory.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundError('News story');

    const destination = await db.playoutDestination.findUnique({ where: { id: destinationId } });
    if (!destination) throw new NotFoundError('Playout destination');

    const updated = await db.newsStory.update({
      where: { id: storyId },
      data: { status: 'AIRED' },
    });

    logger.info('Story sent to air', { storyId, destinationId, destinationType: destination.type });

    return {
      story: updated,
      playout: {
        destination: destination.name,
        status: 'QUEUED' as const,
        message: `Exporting to ${destination.type} at ${destination.host}`,
      },
    };
  }

  // ─── Playout Destinations ───────────────────────────────────────────────

  async listDestinations() {
    return db.playoutDestination.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createDestination(data: Record<string, unknown>) {
    const destination = await db.playoutDestination.create({ data: data as any });
    logger.info('Playout destination created', { destinationId: destination.id });
    return destination;
  }

  async deactivateDestination(id: string) {
    const existing = await db.playoutDestination.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Playout destination');

    await db.playoutDestination.update({ where: { id }, data: { isActive: false } });
    logger.info('Playout destination deactivated', { destinationId: id });
  }
}

export const newsService = new NewsService();
