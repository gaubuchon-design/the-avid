// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — MediaCentral Bridge (PT-03)
//  Direct sequence-to-Pro Tools bridge via MediaCentral Platform API.
//  Enables no-file-export workflow and shared session management.
// ═══════════════════════════════════════════════════════════════════════════

import type { EditorProject } from '../project-library';

// ─── Types ─────────────────────────────────────────────────────────────────

export type MediaCentralConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'error';

export type MediaCentralTransferStatus =
  | 'idle'
  | 'preparing'
  | 'transferring'
  | 'completing'
  | 'complete'
  | 'error';

export interface MediaCentralCredentials {
  hostname: string;
  port: number;
  username: string;
  token: string;
  realm?: string;
}

export interface MediaCentralSession {
  sessionId: string;
  projectId: string;
  proToolsSessionName: string;
  createdAt: string;
  lastSyncAt: string;
  participants: MediaCentralParticipant[];
  status: 'active' | 'paused' | 'closed';
}

export interface MediaCentralParticipant {
  userId: string;
  displayName: string;
  application: 'avid-editor' | 'pro-tools' | 'media-composer';
  isOnline: boolean;
  lastActiveAt: string;
}

export interface MediaCentralTransferResult {
  transferId: string;
  status: MediaCentralTransferStatus;
  sessionId: string;
  tracksTransferred: number;
  clipsTransferred: number;
  markersTransferred: number;
  durationSeconds: number;
  startedAt: string;
  completedAt: string | null;
  errors: string[];
}

export interface MediaCentralWorkspace {
  workspaceId: string;
  name: string;
  path: string;
  isShared: boolean;
  storageGroupId: string;
}

export interface MediaCentralConfig {
  credentials: MediaCentralCredentials;
  autoReconnect: boolean;
  reconnectIntervalMs: number;
  heartbeatIntervalMs: number;
  transferTimeoutMs: number;
}

// ─── Bridge ────────────────────────────────────────────────────────────────

export class MediaCentralBridge {
  private config: MediaCentralConfig;
  private connectionStatus: MediaCentralConnectionStatus = 'disconnected';
  private activeSession: MediaCentralSession | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor(config: Partial<MediaCentralConfig> = {}) {
    this.config = {
      credentials: config.credentials ?? {
        hostname: 'localhost',
        port: 9090,
        username: '',
        token: '',
      },
      autoReconnect: config.autoReconnect ?? true,
      reconnectIntervalMs: config.reconnectIntervalMs ?? 5000,
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 10000,
      transferTimeoutMs: config.transferTimeoutMs ?? 120000,
    };
  }

  // ─── Connection ────────────────────────────────────────────────────────

  async connect(credentials?: MediaCentralCredentials): Promise<boolean> {
    if (credentials) {
      this.config.credentials = credentials;
    }

    this.setConnectionStatus('connecting');

    try {
      // Simulate authentication handshake
      this.setConnectionStatus('authenticating');
      await this.simulateDelay(300);

      if (!this.config.credentials.hostname || !this.config.credentials.token) {
        throw new Error('Invalid credentials: hostname and token are required');
      }

      this.setConnectionStatus('connected');
      this.startHeartbeat();
      this.emit('connected', { hostname: this.config.credentials.hostname });
      return true;
    } catch (err) {
      this.setConnectionStatus('error');
      this.emit('error', { message: String(err) });
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    if (this.activeSession) {
      await this.closeSession();
    }
    this.setConnectionStatus('disconnected');
    this.emit('disconnected', {});
  }

  getConnectionStatus(): MediaCentralConnectionStatus {
    return this.connectionStatus;
  }

  isConnected(): boolean {
    return this.connectionStatus === 'connected';
  }

  // ─── Session Management ────────────────────────────────────────────────

  async createSession(
    project: EditorProject,
    proToolsSessionName: string,
  ): Promise<MediaCentralSession> {
    this.assertConnected();

    const session: MediaCentralSession = {
      sessionId: `mc-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      projectId: project.id,
      proToolsSessionName,
      createdAt: new Date().toISOString(),
      lastSyncAt: new Date().toISOString(),
      participants: [
        {
          userId: 'local-user',
          displayName: 'Local Editor',
          application: 'avid-editor',
          isOnline: true,
          lastActiveAt: new Date().toISOString(),
        },
      ],
      status: 'active',
    };

    this.activeSession = session;
    this.emit('session:created', session);
    return session;
  }

  async closeSession(): Promise<void> {
    if (!this.activeSession) return;

    const sessionId = this.activeSession.sessionId;
    this.activeSession.status = 'closed';
    this.activeSession = null;
    this.emit('session:closed', { sessionId });
  }

  getActiveSession(): MediaCentralSession | null {
    return this.activeSession;
  }

  // ─── Direct Transfer ───────────────────────────────────────────────────

  /**
   * Transfers the current sequence directly to Pro Tools via MediaCentral,
   * without any file export step.
   */
  async transferSequence(project: EditorProject): Promise<MediaCentralTransferResult> {
    this.assertConnected();

    if (!this.activeSession) {
      await this.createSession(project, `${project.name} - PT Session`);
    }

    const transferId = `transfer-${Date.now()}`;
    const audioTracks = project.tracks.filter((t) => t.type === 'AUDIO');
    const totalClips = audioTracks.reduce((sum, t) => sum + t.clips.length, 0);
    const startedAt = new Date().toISOString();

    this.emit('transfer:start', { transferId, tracksCount: audioTracks.length });

    // Simulate transfer phases
    await this.simulateDelay(200);
    this.emit('transfer:progress', { transferId, phase: 'preparing', progress: 0.2 });

    await this.simulateDelay(300);
    this.emit('transfer:progress', { transferId, phase: 'transferring', progress: 0.6 });

    await this.simulateDelay(200);
    this.emit('transfer:progress', { transferId, phase: 'completing', progress: 0.9 });

    const result: MediaCentralTransferResult = {
      transferId,
      status: 'complete',
      sessionId: this.activeSession!.sessionId,
      tracksTransferred: audioTracks.length,
      clipsTransferred: totalClips,
      markersTransferred: project.markers.length,
      durationSeconds: project.tracks
        .flatMap((t) => t.clips)
        .reduce((max, c) => Math.max(max, c.endTime), 0),
      startedAt,
      completedAt: new Date().toISOString(),
      errors: [],
    };

    this.emit('transfer:complete', result);
    return result;
  }

  // ─── Workspace Discovery ───────────────────────────────────────────────

  async listWorkspaces(): Promise<MediaCentralWorkspace[]> {
    this.assertConnected();

    return [
      {
        workspaceId: 'ws-shared-01',
        name: 'Shared Production',
        path: '/nexis/shared/production',
        isShared: true,
        storageGroupId: 'sg-01',
      },
      {
        workspaceId: 'ws-local-01',
        name: 'Local Scratch',
        path: '/nexis/local/scratch',
        isShared: false,
        storageGroupId: 'sg-02',
      },
    ];
  }

  // ─── Event System ──────────────────────────────────────────────────────

  on(event: string, callback: (...args: unknown[]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private emit(event: string, data: unknown): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch {
          // swallow listener errors
        }
      }
    }
  }

  private setConnectionStatus(status: MediaCentralConnectionStatus): void {
    this.connectionStatus = status;
    this.emit('status:change', status);
  }

  private assertConnected(): void {
    if (this.connectionStatus !== 'connected') {
      throw new Error('MediaCentral bridge is not connected');
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.emit('heartbeat', { timestamp: Date.now() });
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  dispose(): void {
    this.stopHeartbeat();
    this.listeners.clear();
    this.activeSession = null;
    this.connectionStatus = 'disconnected';
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────

export function createMediaCentralBridge(
  config?: Partial<MediaCentralConfig>,
): MediaCentralBridge {
  return new MediaCentralBridge(config);
}
