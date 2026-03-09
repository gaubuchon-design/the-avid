/**
 * @module server
 *
 * Express + WebSocket server for the knowledge-node service. Exposes
 * REST endpoints for health checks and mesh operations, and handles
 * inbound WebSocket connections for mesh peer communication.
 *
 * The server can run in two modes:
 * 1. **Standalone** — default, provides health/status endpoints only.
 * 2. **Mesh** — when a {@link MeshService} is attached, enables
 *    mesh-related endpoints and peer WebSocket handling.
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { SERVICE_NAME, SERVICE_VERSION } from './index.js';
import type { MeshService } from './mesh/MeshService.js';
import type { SearchQuery } from './mesh/ScatterGatherSearch.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// ---------------------------------------------------------------------------
// Mesh service reference — set via `attachMeshService()`.
// ---------------------------------------------------------------------------
let meshService: MeshService | null = null;

/**
 * Attach a running MeshService to the HTTP/WS server.
 *
 * This enables mesh-related API endpoints and routes incoming WebSocket
 * connections through the mesh peer discovery layer.
 *
 * @param mesh - The MeshService instance to attach.
 */
export function attachMeshService(mesh: MeshService): void {
  meshService = mesh;
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    uptime: process.uptime(),
    mesh: meshService ? 'attached' : 'detached',
  });
});

// ---------------------------------------------------------------------------
// Mesh status — node info + peer list
// ---------------------------------------------------------------------------
app.get('/mesh/status', (_req, res) => {
  if (!meshService) {
    res.status(503).json({ error: 'Mesh service not attached' });
    return;
  }

  const nodeInfo = meshService.getNodeInfo();
  const peers = meshService.getPeers();

  res.json({
    node: nodeInfo,
    peers,
    conflicts: meshService.conflictHandler.getUnresolved(),
  });
});

// ---------------------------------------------------------------------------
// Mesh peers — list connected peers
// ---------------------------------------------------------------------------
app.get('/mesh/peers', (_req, res) => {
  if (!meshService) {
    res.status(503).json({ error: 'Mesh service not attached' });
    return;
  }

  res.json({
    peers: meshService.getPeers(),
  });
});

// ---------------------------------------------------------------------------
// Mesh shards — list local shards with lease info
// ---------------------------------------------------------------------------
app.get('/mesh/shards', (_req, res) => {
  if (!meshService) {
    res.status(503).json({ error: 'Mesh service not attached' });
    return;
  }

  const nodeInfo = meshService.getNodeInfo();
  const shards = nodeInfo.shardIds.map((shardId) => {
    const lease = meshService!.leaseManager.getLease(shardId);
    return {
      shardId,
      lease: lease ?? null,
      isLeaseHolder: lease
        ? meshService!.leaseManager.isLeaseHolder(shardId, nodeInfo.nodeId)
        : false,
    };
  });

  res.json({ shards });
});

// ---------------------------------------------------------------------------
// Mesh search — scatter/gather search across the mesh
// ---------------------------------------------------------------------------
app.post('/mesh/search', async (req, res) => {
  if (!meshService) {
    res.status(503).json({ error: 'Mesh service not attached' });
    return;
  }

  const query: SearchQuery = {
    text: req.body.text ?? '',
    topK: req.body.topK ?? 10,
    modalities: req.body.modalities,
    threshold: req.body.threshold,
    includeProvenance: req.body.includeProvenance,
  };

  if (!query.text) {
    res.status(400).json({ error: 'Missing required field: text' });
    return;
  }

  try {
    const results = await meshService.search(query);
    res.json(results);
  } catch (err) {
    res.status(500).json({
      error: 'Search failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// ---------------------------------------------------------------------------
// WebSocket handling — mesh protocol peers connect here
// ---------------------------------------------------------------------------
wss.on('connection', (ws) => {
  if (meshService) {
    // Route through the mesh peer discovery layer.
    meshService.peerDiscovery.acceptConnection(ws);
  } else {
    // Fallback: basic echo for non-mesh mode.
    console.log(`[${SERVICE_NAME}] Peer connected (no mesh service)`);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`[${SERVICE_NAME}] Received:`, message.type ?? 'unknown');
        ws.send(JSON.stringify({ type: 'ack', id: message.id }));
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
    });

    ws.on('close', () => {
      console.log(`[${SERVICE_NAME}] Peer disconnected`);
    });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = Number(process.env.PORT) || 4200;

server.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] v${SERVICE_VERSION} listening on http://localhost:${PORT}`);
  console.log(`[${SERVICE_NAME}] WebSocket (mesh) available on ws://localhost:${PORT}`);
});

export { app, server, wss };
