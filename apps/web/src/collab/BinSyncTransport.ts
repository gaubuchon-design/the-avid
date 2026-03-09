// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Bin Sync Transport
// ═══════════════════════════════════════════════════════════════════════════
//
// WebSocket-based bin synchronization transport for real-time multi-user
// collaboration on shared bins. Handles:
//  - Connection lifecycle with auto-reconnect and heartbeat
//  - Bin locking (pessimistic concurrency control)
//  - Presence broadcasting (cursors, playheads, active bin)
//  - Bin delta propagation to all connected clients
//
// Since no real server exists, this ships with a mock in-memory transport
// that simulates the full protocol for local development and testing.
//

// ─── Types ──────────────────────────────────────────────────────────────────

export type BinLockState = 'unlocked' | 'locked-by-me' | 'locked-by-other';

export interface BinLockInfo {
  binId: string;
  state: BinLockState;
  lockedBy?: string;
  lockedByName?: string;
  lockedAt?: number;
}

export interface PresenceUpdate {
  userId: string;
  displayName: string;
  color: string;
  activeBinId?: string;
  playheadTime?: number;
  lastSeen: number;
}

export interface BinDelta {
  type:
    | 'add-asset'
    | 'remove-asset'
    | 'move-asset'
    | 'rename-asset'
    | 'update-metadata';
  assetId: string;
  data?: any;
  timestamp: number;
  userId: string;
}

// ─── Internal message protocol ──────────────────────────────────────────────

interface TransportMessage {
  kind:
    | 'heartbeat'
    | 'lock-request'
    | 'lock-ack'
    | 'lock-release'
    | 'lock-release-ack'
    | 'lock-denied'
    | 'presence'
    | 'bin-delta';
  payload: any;
}

type EventHandler = (data: any) => void;

// ─── Mock WebSocket (in-memory loopback) ────────────────────────────────────

/**
 * Simulates a WebSocket that echoes protocol messages locally.
 * Maintains server-side lock state so requestLock / releaseLock
 * round-trips behave realistically.
 */
class MockWebSocket {
  readonly OPEN = 1;
  readonly CLOSED = 3;

  readyState: number = this.CLOSED;

  private serverLocks = new Map<string, { userId: string; userName: string; lockedAt: number }>();
  private onmessageHandler: ((ev: { data: string }) => void) | null = null;
  private onopenHandler: (() => void) | null = null;
  private oncloseHandler: (() => void) | null = null;
  private currentUserId = '';

  set onmessage(handler: ((ev: { data: string }) => void) | null) {
    this.onmessageHandler = handler;
  }
  get onmessage() {
    return this.onmessageHandler;
  }

  set onopen(handler: (() => void) | null) {
    this.onopenHandler = handler;
  }
  get onopen() {
    return this.onopenHandler;
  }

  set onclose(handler: (() => void) | null) {
    this.oncloseHandler = handler;
  }
  get onclose() {
    return this.oncloseHandler;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_url: string) {
    // Simulate async open
    setTimeout(() => {
      this.readyState = this.OPEN;
      this.onopenHandler?.();
    }, 0);
  }

  setUserId(userId: string): void {
    this.currentUserId = userId;
  }

  send(raw: string): void {
    if (this.readyState !== this.OPEN) return;

    const msg: TransportMessage = JSON.parse(raw);

    switch (msg.kind) {
      case 'heartbeat':
        // Echo heartbeat acknowledgement
        this.respond({ kind: 'heartbeat', payload: { ts: Date.now() } });
        break;

      case 'lock-request': {
        const { binId, userId, userName } = msg.payload;
        const existing = this.serverLocks.get(binId);
        if (existing && existing.userId !== userId) {
          this.respond({
            kind: 'lock-denied',
            payload: {
              binId,
              lockedBy: existing.userId,
              lockedByName: existing.userName,
              lockedAt: existing.lockedAt,
            },
          });
        } else {
          const lockedAt = Date.now();
          this.serverLocks.set(binId, { userId, userName, lockedAt });
          this.respond({
            kind: 'lock-ack',
            payload: { binId, userId, userName, lockedAt },
          });
        }
        break;
      }

      case 'lock-release': {
        const { binId, userId } = msg.payload;
        const lock = this.serverLocks.get(binId);
        if (lock && lock.userId === userId) {
          this.serverLocks.delete(binId);
        }
        this.respond({ kind: 'lock-release-ack', payload: { binId } });
        break;
      }

      case 'presence':
        // In a real server this would fan-out to other clients.
        // Echo back so the sender sees it acknowledged.
        this.respond({ kind: 'presence', payload: msg.payload });
        break;

      case 'bin-delta':
        // Echo delta so listeners fire locally (simulates broadcast).
        this.respond({ kind: 'bin-delta', payload: msg.payload });
        break;

      default:
        break;
    }
  }

  close(): void {
    // Release all locks held by the current user on disconnect
    for (const [binId, lock] of this.serverLocks) {
      if (lock.userId === this.currentUserId) {
        this.serverLocks.delete(binId);
      }
    }
    this.readyState = this.CLOSED;
    this.oncloseHandler?.();
  }

  // ── helpers ──

  private respond(msg: TransportMessage): void {
    // Simulate network latency (microtask delay)
    Promise.resolve().then(() => {
      this.onmessageHandler?.({ data: JSON.stringify(msg) });
    });
  }
}

// ─── BinSyncTransport ───────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 10_000;
const RECONNECT_DELAY_MS = 3_000;
const LOCK_REQUEST_TIMEOUT_MS = 5_000;

export class BinSyncTransport {
  private ws: MockWebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private locks = new Map<string, BinLockInfo>();
  private presence = new Map<string, PresenceUpdate>();
  private listeners = new Set<(event: string, data: any) => void>();

  private connectionUrl = '';
  private projectId = '';
  private userId = '';
  private connected = false;

  // ── Connection lifecycle ──────────────────────────────────────────────

  connect(url: string, projectId: string, userId: string): Promise<void> {
    this.connectionUrl = url;
    this.projectId = projectId;
    this.userId = userId;

    return new Promise<void>((resolve, reject) => {
      try {
        this.ws = new MockWebSocket(url);
        this.ws.setUserId(userId);

        this.ws.onopen = () => {
          this.connected = true;
          this.startHeartbeat();
          this.emit('connected', { projectId, userId });
          resolve();
        };

        this.ws.onclose = () => {
          this.connected = false;
          this.stopHeartbeat();
          this.emit('disconnected', {});
          this.scheduleReconnect();
        };

        this.ws.onmessage = (ev: { data: string }) => {
          this.handleMessage(ev.data);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  disconnect(): void {
    this.clearReconnect();
    this.stopHeartbeat();

    if (this.ws) {
      // Prevent auto-reconnect on intentional close
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
    this.locks.clear();
    this.presence.clear();
    this.emit('disconnected', {});
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ── Locking ───────────────────────────────────────────────────────────

  requestLock(binId: string): Promise<BinLockInfo> {
    return new Promise<BinLockInfo>((resolve, reject) => {
      if (!this.ws || !this.connected) {
        reject(new Error('Not connected'));
        return;
      }

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Lock request timed out'));
      }, LOCK_REQUEST_TIMEOUT_MS);

      const handler = (event: string, data: any) => {
        if (event === 'lock-ack' && data.binId === binId) {
          cleanup();
          const info: BinLockInfo = {
            binId,
            state: 'locked-by-me',
            lockedBy: data.userId,
            lockedByName: data.userName,
            lockedAt: data.lockedAt,
          };
          this.locks.set(binId, info);
          resolve(info);
        } else if (event === 'lock-denied' && data.binId === binId) {
          cleanup();
          const info: BinLockInfo = {
            binId,
            state: 'locked-by-other',
            lockedBy: data.lockedBy,
            lockedByName: data.lockedByName,
            lockedAt: data.lockedAt,
          };
          this.locks.set(binId, info);
          resolve(info);
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.listeners.delete(handler);
      };

      this.listeners.add(handler);

      this.send({
        kind: 'lock-request',
        payload: {
          binId,
          userId: this.userId,
          userName: this.userId, // display name would come from user profile
        },
      });
    });
  }

  releaseLock(binId: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.ws || !this.connected) {
        reject(new Error('Not connected'));
        return;
      }

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Lock release timed out'));
      }, LOCK_REQUEST_TIMEOUT_MS);

      const handler = (event: string, data: any) => {
        if (event === 'lock-release-ack' && data.binId === binId) {
          cleanup();
          this.locks.set(binId, { binId, state: 'unlocked' });
          resolve();
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.listeners.delete(handler);
      };

      this.listeners.add(handler);

      this.send({
        kind: 'lock-release',
        payload: { binId, userId: this.userId },
      });
    });
  }

  getLockState(binId: string): BinLockInfo {
    return this.locks.get(binId) ?? { binId, state: 'unlocked' };
  }

  // ── Deltas ────────────────────────────────────────────────────────────

  broadcastBinDelta(binId: string, delta: BinDelta): void {
    this.send({
      kind: 'bin-delta',
      payload: { binId, delta },
    });
  }

  // ── Presence ──────────────────────────────────────────────────────────

  broadcastPresence(update: PresenceUpdate): void {
    this.presence.set(update.userId, update);
    this.send({
      kind: 'presence',
      payload: update,
    });
  }

  getOnlineUsers(): PresenceUpdate[] {
    const now = Date.now();
    const staleThreshold = 30_000; // 30 seconds
    const online: PresenceUpdate[] = [];

    for (const [uid, p] of this.presence) {
      if (now - p.lastSeen < staleThreshold) {
        online.push(p);
      } else {
        this.presence.delete(uid);
      }
    }

    return online;
  }

  // ── Event system ──────────────────────────────────────────────────────

  on(event: string, handler: (data: any) => void): () => void {
    const wrapper = (evt: string, data: any) => {
      if (evt === event) handler(data);
    };
    this.listeners.add(wrapper);
    return () => {
      this.listeners.delete(wrapper);
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────

  private emit(event: string, data: any): void {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch {
        // Listener errors must not break the transport
      }
    }
  }

  private send(msg: TransportMessage): void {
    if (this.ws && this.connected) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private handleMessage(raw: string): void {
    let msg: TransportMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.kind) {
      case 'heartbeat':
        this.emit('heartbeat', msg.payload);
        break;

      case 'lock-ack':
        this.emit('lock-ack', msg.payload);
        this.emit('lock-changed', {
          binId: msg.payload.binId,
          state: msg.payload.userId === this.userId ? 'locked-by-me' : 'locked-by-other',
          ...msg.payload,
        });
        break;

      case 'lock-denied':
        this.emit('lock-denied', msg.payload);
        this.emit('lock-changed', {
          binId: msg.payload.binId,
          state: 'locked-by-other',
          ...msg.payload,
        });
        break;

      case 'lock-release-ack':
        this.emit('lock-release-ack', msg.payload);
        this.emit('lock-changed', {
          binId: msg.payload.binId,
          state: 'unlocked',
        });
        break;

      case 'presence': {
        const update = msg.payload as PresenceUpdate;
        this.presence.set(update.userId, update);
        this.emit('presence', update);
        break;
      }

      case 'bin-delta':
        this.emit('bin-delta', msg.payload);
        break;

      default:
        break;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ kind: 'heartbeat', payload: { ts: Date.now() } });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnect();
    this.reconnectTimer = setTimeout(() => {
      this.connect(this.connectionUrl, this.projectId, this.userId).catch(() => {
        // Retry will happen on next close event
      });
    }, RECONNECT_DELAY_MS);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const binSyncTransport = new BinSyncTransport();
