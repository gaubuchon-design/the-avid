/**
 * @module server
 * @description Express + WebSocket server for the Agent Orchestrator.
 *
 * Provides REST endpoints for plan lifecycle management and a WebSocket
 * connection that emits real-time plan status updates to connected clients.
 *
 * ## REST API
 *
 * | Method | Path                               | Description                    |
 * |--------|------------------------------------|--------------------------------|
 * | GET    | /health                            | Service health check           |
 * | POST   | /intent                            | Process a user intent          |
 * | GET    | /plans                             | List all active plans          |
 * | GET    | /plans/:id                         | Get a specific plan            |
 * | POST   | /plans/:id/approve                 | Approve a plan                 |
 * | POST   | /plans/:id/reject                  | Reject a plan                  |
 * | POST   | /plans/:id/cancel                  | Cancel a plan                  |
 * | POST   | /plans/:id/compensate              | Compensate (undo) a plan       |
 * | POST   | /plans/:id/steps/:stepId/approve   | Approve a single step          |
 * | GET    | /analytics                         | Get analytics entries          |
 * | GET    | /tools                             | List registered tools          |
 *
 * ## WebSocket
 *
 * Emits `plan-update` messages whenever a plan's status changes:
 * ```json
 * { "type": "plan-update", "plan": { ... } }
 * ```
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { SERVICE_NAME, SERVICE_VERSION } from './index';
import { OrchestratorService } from './OrchestratorService';
import type { AgentContext } from './types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = Number(process.env['PORT']) || 4100;

// ---------------------------------------------------------------------------
// Service instance
// ---------------------------------------------------------------------------

const orchestrator = new OrchestratorService({
  geminiApiKey: process.env['GEMINI_API_KEY'],
  geminiModel: process.env['GEMINI_MODEL'],
});

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json({ limit: '1mb' }));

// CORS middleware for development
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    uptime: process.uptime(),
    activePlans: orchestrator.getActivePlans().length,
    registeredTools: orchestrator.getTools().length,
  });
});

// ---------------------------------------------------------------------------
// POST /intent — Process user intent
// ---------------------------------------------------------------------------

app.post('/intent', async (req: Request, res: Response) => {
  try {
    const { intent, context, sessionId } = req.body as {
      intent?: string;
      context?: AgentContext;
      sessionId?: string;
    };

    if (!intent || typeof intent !== 'string') {
      res.status(400).json({ error: 'Missing or invalid "intent" field.' });
      return;
    }

    if (intent.length > 10_000) {
      res.status(400).json({ error: 'Intent exceeds maximum length of 10,000 characters.' });
      return;
    }

    if (sessionId !== undefined && typeof sessionId !== 'string') {
      res.status(400).json({ error: 'Invalid "sessionId" field: must be a string.' });
      return;
    }

    const resolvedContext: AgentContext = context ?? { projectId: 'default' };
    const resolvedSessionId = sessionId ?? uuidv4();

    const plan = await orchestrator.processIntent(intent, resolvedContext, resolvedSessionId);
    res.status(201).json({ plan });
  } catch (error) {
    console.error('[server] POST /intent error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /plans — List all active plans
// ---------------------------------------------------------------------------

app.get('/plans', (_req: Request, res: Response) => {
  const active = orchestrator.getActivePlans();
  const history = orchestrator.getHistory();
  res.json({ active, history });
});

// ---------------------------------------------------------------------------
// GET /plans/:id — Get specific plan
// ---------------------------------------------------------------------------

app.get('/plans/:id', (req: Request, res: Response) => {
  const planId = req.params['id'] as string;
  const plan = orchestrator.getPlan(planId);
  if (!plan) {
    res.status(404).json({ error: `Plan "${planId}" not found.` });
    return;
  }
  res.json({ plan });
});

// ---------------------------------------------------------------------------
// POST /plans/:id/approve — Approve a plan
// ---------------------------------------------------------------------------

app.post('/plans/:id/approve', async (req: Request, res: Response) => {
  try {
    const planId = req.params['id'] as string;
    const plan = await orchestrator.approvePlan(planId);
    res.json({ plan });
  } catch (error) {
    const status = (error instanceof Error && error.message.includes('not found')) ? 404 : 400;
    res.status(status).json({
      error: error instanceof Error ? error.message : 'Failed to approve plan.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /plans/:id/reject — Reject a plan
// ---------------------------------------------------------------------------

app.post('/plans/:id/reject', async (req: Request, res: Response) => {
  try {
    const planId = req.params['id'] as string;
    const { reason } = req.body as { reason?: string };
    await orchestrator.rejectPlan(planId, reason);
    res.json({ status: 'rejected', planId });
  } catch (error) {
    const status = (error instanceof Error && error.message.includes('not found')) ? 404 : 400;
    res.status(status).json({
      error: error instanceof Error ? error.message : 'Failed to reject plan.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /plans/:id/cancel — Cancel a plan
// ---------------------------------------------------------------------------

app.post('/plans/:id/cancel', async (req: Request, res: Response) => {
  try {
    const planId = req.params['id'] as string;
    await orchestrator.cancelPlan(planId);
    res.json({ status: 'cancelled', planId });
  } catch (error) {
    const status = (error instanceof Error && error.message.includes('not found')) ? 404 : 400;
    res.status(status).json({
      error: error instanceof Error ? error.message : 'Failed to cancel plan.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /plans/:id/compensate — Compensate (undo) a plan
// ---------------------------------------------------------------------------

app.post('/plans/:id/compensate', async (req: Request, res: Response) => {
  try {
    const planId = req.params['id'] as string;
    const result = await orchestrator.compensatePlan(planId);
    res.json({ planId, ...result });
  } catch (error) {
    const status = (error instanceof Error && error.message.includes('not found')) ? 404 : 400;
    res.status(status).json({
      error: error instanceof Error ? error.message : 'Failed to compensate plan.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /plans/:id/steps/:stepId/approve — Approve a single step
// ---------------------------------------------------------------------------

app.post('/plans/:id/steps/:stepId/approve', async (req: Request, res: Response) => {
  try {
    const planId = req.params['id'] as string;
    const stepId = req.params['stepId'] as string;
    const step = await orchestrator.approveStep(planId, stepId);
    res.json({ step });
  } catch (error) {
    const status = (error instanceof Error && error.message.includes('not found')) ? 404 : 400;
    res.status(status).json({
      error: error instanceof Error ? error.message : 'Failed to approve step.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /analytics — Get analytics entries
// ---------------------------------------------------------------------------

app.get('/analytics', (req: Request, res: Response) => {
  const sessionId = req.query['sessionId'] as string | undefined;
  const planId = req.query['planId'] as string | undefined;
  const type = req.query['type'] as string | undefined;

  const filter: Record<string, string> = {};
  if (sessionId) filter['sessionId'] = sessionId;
  if (planId) filter['planId'] = planId;
  if (type) filter['type'] = type;

  const entries = orchestrator.getAnalytics().getEntries(
    Object.keys(filter).length > 0 ? (filter as any) : undefined,
  );

  res.json({ entries, count: entries.length });
});

// ---------------------------------------------------------------------------
// GET /tools — List registered tools
// ---------------------------------------------------------------------------

app.get('/tools', (_req: Request, res: Response) => {
  const tools = orchestrator.getTools();
  res.json({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      adapter: t.adapter,
      requiresConfirmation: t.requiresConfirmation,
      tokenCost: t.tokenCost,
    })),
    count: tools.length,
  });
});

// ---------------------------------------------------------------------------
// WebSocket handling
// ---------------------------------------------------------------------------

/** Track connected WebSocket clients. */
const wsClients: Set<WebSocket> = new Set();

wss.on('connection', (ws: WebSocket) => {
  console.log(`[${SERVICE_NAME}] WebSocket client connected`);
  wsClients.add(ws);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`[${SERVICE_NAME}] Received message:`, message.type ?? 'unknown');

      // Handle ping/pong
      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        return;
      }

      // Acknowledge
      ws.send(JSON.stringify({ type: 'ack', id: message.id }));
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    }
  });

  ws.on('close', () => {
    console.log(`[${SERVICE_NAME}] WebSocket client disconnected`);
    wsClients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error(`[${SERVICE_NAME}] WebSocket error:`, error.message);
    wsClients.delete(ws);
  });
});

/**
 * Broadcast a plan update to all connected WebSocket clients.
 */
function broadcastPlanUpdate(plan: unknown): void {
  const message = JSON.stringify({ type: 'plan-update', plan });

  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message);
      } catch (error) {
        console.error(`[${SERVICE_NAME}] Failed to send WebSocket message:`, error);
      }
    }
  }
}

// Subscribe the orchestrator to broadcast plan updates
orchestrator.subscribe((plan) => {
  broadcastPlanUpdate(plan);
});

// ---------------------------------------------------------------------------
// WebSocket heartbeat — detect dead connections
// ---------------------------------------------------------------------------

const WS_PING_INTERVAL_MS = 30_000;
const wsAlive = new WeakMap<WebSocket, boolean>();

const heartbeatInterval = setInterval(() => {
  for (const ws of wsClients) {
    if (wsAlive.get(ws) === false) {
      console.log(`[${SERVICE_NAME}] Terminating unresponsive WebSocket client`);
      wsClients.delete(ws);
      ws.terminate();
      continue;
    }
    wsAlive.set(ws, false);
    ws.ping();
  }
}, WS_PING_INTERVAL_MS);

// Listen for pong responses to mark connections as alive
wss.on('connection', (ws: WebSocket) => {
  wsAlive.set(ws, true);
  ws.on('pong', () => {
    wsAlive.set(ws, true);
  });
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[${SERVICE_NAME}] Received ${signal}, shutting down gracefully...`);

  clearInterval(heartbeatInterval);

  // Close all WebSocket connections
  for (const ws of wsClients) {
    try {
      ws.close(1001, 'Server shutting down');
    } catch {
      // Ignore errors during shutdown
    }
  }
  wsClients.clear();

  // Close WebSocket server
  wss.close(() => {
    console.log(`[${SERVICE_NAME}] WebSocket server closed`);
  });

  // Close HTTP server (stop accepting new connections)
  server.close(() => {
    console.log(`[${SERVICE_NAME}] HTTP server closed`);
    process.exit(0);
  });

  // Force exit after 10 seconds if graceful shutdown stalls
  setTimeout(() => {
    console.error(`[${SERVICE_NAME}] Forced exit after shutdown timeout`);
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] v${SERVICE_VERSION} listening on http://localhost:${PORT}`);
  console.log(`[${SERVICE_NAME}] WebSocket available on ws://localhost:${PORT}`);
  console.log(`[${SERVICE_NAME}] Gemini API key: ${process.env['GEMINI_API_KEY'] ? 'configured' : 'not set (using template fallback)'}`);
  console.log(`[${SERVICE_NAME}] Registered tools: ${orchestrator.getTools().length}`);
});

export { app, server, wss, orchestrator };
