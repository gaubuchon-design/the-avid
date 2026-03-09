import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { db } from '../db/client';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { JwtPayload } from '../middleware/auth';

// ─── Event types ───────────────────────────────────────────────────────────────
export interface ServerToClientEvents {
  'project:update': (payload: { projectId: string; data: unknown }) => void;
  'timeline:update': (payload: { timelineId: string; operation: TimelineOperation }) => void;
  'clip:move': (payload: { clipId: string; startTime: number; trackId: string }) => void;
  'clip:trim': (payload: { clipId: string; startTime: number; endTime: number }) => void;
  'clip:add': (payload: { clip: unknown }) => void;
  'clip:delete': (payload: { clipId: string }) => void;
  'playhead:move': (payload: { timelineId: string; position: number; userId: string }) => void;
  'comment:new': (payload: { comment: unknown }) => void;
  'approval:update': (payload: { approval: unknown }) => void;
  'ai:job:update': (payload: { jobId: string; status: string; result?: unknown }) => void;
  'publish:update': (payload: { jobId: string; status: string; progress?: number }) => void;
  'user:joined': (payload: { userId: string; displayName: string; projectId: string }) => void;
  'user:left': (payload: { userId: string; projectId: string }) => void;
  'lock:acquired': (payload: { resourceType: string; resourceId: string; userId: string }) => void;
  'lock:released': (payload: { resourceType: string; resourceId: string }) => void;
  'cursor:update': (payload: { userId: string; x: number; y: number }) => void;
  error: (payload: { message: string; code: string }) => void;
}

export interface ClientToServerEvents {
  'project:join': (projectId: string, callback: (ok: boolean) => void) => void;
  'project:leave': (projectId: string) => void;
  'timeline:operation': (payload: TimelineOperation) => void;
  'playhead:move': (payload: { timelineId: string; position: number }) => void;
  'cursor:move': (payload: { x: number; y: number }) => void;
}

export interface TimelineOperation {
  type: 'clip:add' | 'clip:move' | 'clip:trim' | 'clip:delete' | 'track:add' | 'track:delete';
  payload: unknown;
  timelineId: string;
  userId?: string;
  timestamp?: number;
}

interface SocketUser {
  userId: string;
  displayName: string;
}

// ─── Active sessions ───────────────────────────────────────────────────────────
const projectSessions = new Map<string, Set<string>>(); // projectId -> Set<userId>
const socketUsers = new Map<string, SocketUser>();       // socketId -> user info

// ─── Rate limiting for cursor movements ──────────────────────────────────────
const CURSOR_RATE_LIMIT_MS = 50; // Max one cursor update per 50ms per socket
const lastCursorUpdate = new Map<string, number>();

// ─── Init ──────────────────────────────────────────────────────────────────────
export function initWebSocket(httpServer: HttpServer) {
  const io = new SocketServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: config.cors.origins, credentials: true },
    maxHttpBufferSize: config.ws.maxPayload,
    pingInterval: config.ws.heartbeatInterval,
    pingTimeout: 10000,
    // Connection state recovery: allows clients to reconnect without losing events
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    },
  });

  // ─── Auth middleware ─────────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth['token'] ?? socket.handshake.headers.authorization?.slice(7);
      if (!token) {
        return next(new Error('Authentication required: no token provided'));
      }

      let payload: JwtPayload;
      try {
        payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
      } catch (jwtErr: any) {
        const message = jwtErr.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
        return next(new Error(message));
      }

      const user = await db.user.findUnique({
        where: { id: payload.sub, deletedAt: null },
        select: { id: true, displayName: true },
      });
      if (!user) return next(new Error('User not found'));

      (socket as any).user = user;
      socketUsers.set(socket.id, user);
      next();
    } catch (err: any) {
      logger.error('WebSocket auth failed', { error: err.message, socketId: socket.id });
      next(new Error('Authentication failed'));
    }
  });

  // ─── Connection ──────────────────────────────────────────────────────────────
  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    const user = (socket as any).user as SocketUser;
    logger.debug('WS connected', { userId: user.userId, displayName: user.displayName, socketId: socket.id });

    // Join project room
    socket.on('project:join', async (projectId, callback) => {
      try {
        if (!projectId || typeof projectId !== 'string') {
          return callback(false);
        }

        // Verify access
        const member = await db.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId: user.userId } },
        });
        if (!member) {
          logger.warn('WS project join denied', { userId: user.userId, projectId });
          return callback(false);
        }

        socket.join(`project:${projectId}`);

        if (!projectSessions.has(projectId)) projectSessions.set(projectId, new Set());
        projectSessions.get(projectId)!.add(user.userId);

        // Notify room of new user
        socket.to(`project:${projectId}`).emit('user:joined', {
          userId: user.userId,
          displayName: user.displayName,
          projectId,
        });

        // Record collaboration event (fire-and-forget)
        db.collaborationEvent.create({
          data: { projectId, userId: user.userId, sessionId: socket.id, eventType: 'JOIN', payload: {} },
        }).catch((err: Error) => logger.error('Failed to record join event', { error: err.message }));

        callback(true);
        logger.debug('User joined project', { userId: user.userId, projectId });
      } catch (err: any) {
        logger.error('Error handling project:join', { error: err.message, userId: user.userId, projectId });
        callback(false);
      }
    });

    // Leave project room
    socket.on('project:leave', (projectId) => {
      if (!projectId || typeof projectId !== 'string') return;
      handleLeave(socket, projectId);
    });

    // Timeline operations (OT-based -- broadcast to room, skip sender)
    socket.on('timeline:operation', (operation) => {
      if (!operation?.timelineId) {
        socket.emit('error', { message: 'timelineId is required', code: 'INVALID_PAYLOAD' });
        return;
      }

      const op: TimelineOperation = {
        ...operation,
        userId: user.userId,
        timestamp: Date.now(),
      };
      socket.to(`project:${operation.timelineId}`).emit('timeline:update', {
        timelineId: operation.timelineId,
        operation: op,
      });
    });

    // Playhead sync
    socket.on('playhead:move', ({ timelineId, position }) => {
      if (!timelineId || typeof position !== 'number') return;
      socket.to(`project:${timelineId}`).emit('playhead:move', {
        timelineId,
        position,
        userId: user.userId,
      });
    });

    // Cursor movement (rate-limited)
    socket.on('cursor:move', ({ x, y }) => {
      const now = Date.now();
      const last = lastCursorUpdate.get(socket.id) ?? 0;
      if (now - last < CURSOR_RATE_LIMIT_MS) return;
      lastCursorUpdate.set(socket.id, now);

      // Broadcast to all rooms this socket is in
      socket.rooms.forEach((room) => {
        if (room.startsWith('project:')) {
          socket.to(room).emit('cursor:update', { userId: user.userId, x, y });
        }
      });
    });

    // Disconnect
    socket.on('disconnect', (reason) => {
      socketUsers.delete(socket.id);
      lastCursorUpdate.delete(socket.id);

      // Leave all joined rooms
      socket.rooms.forEach((room) => {
        if (room.startsWith('project:')) {
          const projectId = room.slice('project:'.length);
          handleLeave(socket, projectId);
        }
      });
      logger.debug('WS disconnected', { userId: user.userId, reason });
    });
  });

  function handleLeave(socket: Socket, projectId: string): void {
    const user = socketUsers.get(socket.id);
    if (!user) return;

    socket.leave(`project:${projectId}`);
    projectSessions.get(projectId)?.delete(user.userId);

    // Clean up empty session sets
    if (projectSessions.get(projectId)?.size === 0) {
      projectSessions.delete(projectId);
    }

    socket.to(`project:${projectId}`).emit('user:left', { userId: user.userId, projectId });

    db.collaborationEvent.create({
      data: {
        projectId,
        userId: user.userId,
        sessionId: socket.id,
        eventType: 'LEAVE',
        payload: {},
      },
    }).catch((err: Error) => logger.error('Failed to record leave event', { error: err.message }));
  }

  // ─── Utility: broadcast to project ──────────────────────────────────────────
  return {
    io,

    /**
     * Broadcast an event to all connected clients in a project room.
     */
    broadcastToProject: (projectId: string, event: keyof ServerToClientEvents, payload: unknown) => {
      io.to(`project:${projectId}`).emit(event as any, payload);
    },

    /**
     * Get the set of user IDs currently connected to a project.
     */
    getProjectUsers: (projectId: string): Set<string> => {
      return projectSessions.get(projectId) ?? new Set<string>();
    },

    /**
     * Get the total number of active WebSocket connections.
     */
    getConnectionCount: (): number => {
      return socketUsers.size;
    },

    /**
     * Get connection stats for monitoring.
     */
    getStats: () => ({
      totalConnections: socketUsers.size,
      activeProjects: projectSessions.size,
      projectSessions: Object.fromEntries(
        Array.from(projectSessions.entries()).map(([k, v]) => [k, v.size])
      ),
    }),
  };
}
