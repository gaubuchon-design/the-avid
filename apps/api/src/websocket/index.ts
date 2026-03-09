import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { db } from '../db/client';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { JwtPayload } from '../middleware/auth';
import { renderFarmService } from '../services/renderfarm.service';

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
  error: (payload: { message: string; code: string }) => void;

  // Render Farm events
  'render:worker:registered': (payload: { node: any }) => void;
  'render:worker:updated': (payload: { nodeId: string; patch: any }) => void;
  'render:worker:disconnected': (payload: { nodeId: string }) => void;
  'render:worker:heartbeat': (payload: { nodeId: string; metrics: any }) => void;
  'render:job:queued': (payload: { job: any }) => void;
  'render:job:progress': (payload: { jobId: string; progress: number; segmentId?: string }) => void;
  'render:job:status': (payload: { jobId: string; status: string; error?: string }) => void;
  'render:job:complete': (payload: { jobId: string; outputPath: string; outputSize?: number }) => void;
  'render:job:failed': (payload: { jobId: string; error: string }) => void;
  'render:farm:stats': (payload: any) => void;
}

export interface ClientToServerEvents {
  'project:join': (projectId: string, callback: (ok: boolean) => void) => void;
  'project:leave': (projectId: string) => void;
  'timeline:operation': (payload: TimelineOperation) => void;
  'playhead:move': (payload: { timelineId: string; position: number }) => void;
  'cursor:move': (payload: { x: number; y: number }) => void;

  // Render Farm client events
  'render:join': (callback: (ok: boolean) => void) => void;
  'render:worker:add': (payload: { hostname: string; port: number }) => void;
  'render:worker:remove': (payload: { nodeId: string }) => void;
  'render:job:submit': (payload: any) => void;
  'render:job:cancel': (payload: { jobId: string }) => void;
  'render:queue:start': () => void;
  'render:queue:pause': () => void;
}

export interface TimelineOperation {
  type: 'clip:add' | 'clip:move' | 'clip:trim' | 'clip:delete' | 'track:add' | 'track:delete';
  payload: unknown;
  timelineId: string;
  userId?: string;
  timestamp?: number;
}

// ─── Active sessions ───────────────────────────────────────────────────────────
const projectSessions = new Map<string, Set<string>>(); // projectId → Set<userId>
const socketUsers = new Map<string, { userId: string; displayName: string }>(); // socketId → user

// ─── Init ──────────────────────────────────────────────────────────────────────
export function initWebSocket(httpServer: HttpServer) {
  const io = new SocketServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: config.cors.origins, credentials: true },
    maxHttpBufferSize: config.ws.maxPayload,
    pingInterval: config.ws.heartbeatInterval,
    pingTimeout: 10000,
  });

  // ─── Auth middleware ─────────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token ?? socket.handshake.headers.authorization?.slice(7);
      if (!token) return next(new Error('No token'));

      const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
      const user = await db.user.findUnique({
        where: { id: payload.sub, deletedAt: null },
        select: { id: true, displayName: true },
      });
      if (!user) return next(new Error('User not found'));

      (socket as any).user = user;
      socketUsers.set(socket.id, user);
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  // ─── Connection ──────────────────────────────────────────────────────────────
  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    const user = (socket as any).user as { id: string; displayName: string };
    logger.debug(`WS connected: ${user.displayName} (${socket.id})`);

    // Join project room
    socket.on('project:join', async (projectId, callback) => {
      try {
        // Verify access
        const member = await db.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId: user.id } },
        });
        if (!member) return callback(false);

        socket.join(`project:${projectId}`);

        if (!projectSessions.has(projectId)) projectSessions.set(projectId, new Set());
        projectSessions.get(projectId)!.add(user.id);

        // Notify room of new user
        socket.to(`project:${projectId}`).emit('user:joined', {
          userId: user.id,
          displayName: user.displayName,
          projectId,
        });

        // Record collaboration event
        db.collaborationEvent.create({
          data: { projectId, userId: user.id, sessionId: socket.id, eventType: 'JOIN', payload: {} },
        }).catch(logger.error);

        callback(true);
        logger.debug(`${user.displayName} joined project:${projectId}`);
      } catch (err) {
        callback(false);
      }
    });

    // Leave project room
    socket.on('project:leave', (projectId) => {
      handleLeave(socket, projectId);
    });

    // Timeline operations (OT-based — broadcast to room, skip sender)
    socket.on('timeline:operation', (operation) => {
      const op = { ...operation, userId: user.id, timestamp: Date.now() };
      socket.to(`project:${operation.timelineId}`).emit('timeline:update', {
        timelineId: operation.timelineId,
        operation: op,
      });
    });

    // Playhead sync
    socket.on('playhead:move', ({ timelineId, position }) => {
      socket.to(`project:${timelineId}`).emit('playhead:move', {
        timelineId,
        position,
        userId: user.id,
      });
    });

    // ── Render Farm Events ─────────────────────────────────────────────────
    socket.on('render:join', (callback) => {
      socket.join('render');
      logger.debug(`${user.displayName} joined render farm room`);
      callback(true);
    });

    socket.on('render:worker:add', (payload) => {
      const node = renderFarmService.registerWorker({
        hostname: payload.hostname,
        ip: '0.0.0.0',
        port: payload.port,
        workerTypes: ['render'],
      });
      socket.emit('render:worker:registered', { node });
    });

    socket.on('render:worker:remove', (payload) => {
      renderFarmService.removeWorker(payload.nodeId);
    });

    socket.on('render:job:submit', (payload) => {
      const job = renderFarmService.submitJob(payload);
      socket.emit('render:job:queued', { job });
    });

    socket.on('render:job:cancel', (payload) => {
      renderFarmService.cancelJob(payload.jobId);
    });

    socket.on('render:queue:start', () => {
      renderFarmService.scheduleNext();
    });

    socket.on('render:queue:pause', () => {
      // Pause all queued jobs
      const jobs = renderFarmService.getJobs();
      for (const job of jobs) {
        if (job.status === 'queued') {
          renderFarmService.pauseJob(job.id);
        }
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      socketUsers.delete(socket.id);
      // Leave all joined rooms
      socket.rooms.forEach((room) => {
        if (room.startsWith('project:')) {
          const projectId = room.slice('project:'.length);
          handleLeave(socket, projectId);
        }
      });
      logger.debug(`WS disconnected: ${user.displayName}`);
    });
  });

  function handleLeave(socket: Socket, projectId: string) {
    const user = socketUsers.get(socket.id);
    if (!user) return;

    socket.leave(`project:${projectId}`);
    projectSessions.get(projectId)?.delete(user.userId);

    socket.to(`project:${projectId}`).emit('user:left', { userId: user.userId, projectId });

    db.collaborationEvent.create({
      data: {
        projectId,
        userId: user.userId,
        sessionId: socket.id,
        eventType: 'LEAVE',
        payload: {},
      },
    }).catch(logger.error);
  }

  // ─── Render Farm broadcast wiring ──────────────────────────────────────────
  renderFarmService.onBroadcast = (event: string, payload: any) => {
    io.to('render').emit(event as any, payload);
  };

  // ─── Utility: broadcast to project ──────────────────────────────────────────
  return {
    io,
    broadcastToProject: (projectId: string, event: keyof ServerToClientEvents, payload: unknown) => {
      io.to(`project:${projectId}`).emit(event as any, payload);
    },
    getProjectUsers: (projectId: string) => projectSessions.get(projectId) ?? new Set<string>(),
    broadcastToRender: (event: keyof ServerToClientEvents, payload: unknown) => {
      io.to('render').emit(event as any, payload);
    },
  };
}
