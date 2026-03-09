// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — NEXIS Client (NX-01)
//  P0 Strategic: Avid NEXIS shared storage integration.
//  Handles Connection Manager auth, workspace browsing, media ownership,
//  bin-level locking, write targets, co-presence, and MediaServices.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Types ─────────────────────────────────────────────────────────────────

export type NEXISConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'error';

export type NEXISBinLockStatus = 'unlocked' | 'locked-self' | 'locked-other' | 'read-only';
export type NEXISMediaOwnership = 'local' | 'shared' | 'foreign' | 'orphaned';
export type NEXISMediaServicesJobType = 'transcode' | 'proxy-generation' | 'consolidate' | 'ingest';
export type NEXISMediaServicesJobStatus = 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';

export interface NEXISCredentials {
  hostname: string;
  port: number;
  username: string;
  password: string;
  domain?: string;
}

export interface NEXISWorkspace {
  id: string;
  name: string;
  path: string;
  storageGroupId: string;
  storageGroupName: string;
  totalCapacityBytes: number;
  usedCapacityBytes: number;
  freeCapacityBytes: number;
  isProtected: boolean;
  mountStatus: 'mounted' | 'unmounted' | 'error';
}

export interface NEXISStorageGroup {
  id: string;
  name: string;
  type: 'production' | 'archive' | 'nearline';
  workspaces: NEXISWorkspace[];
  totalCapacityBytes: number;
  usedCapacityBytes: number;
  healthStatus: 'healthy' | 'degraded' | 'critical';
}

export interface NEXISMediaEntry {
  id: string;
  fileName: string;
  filePath: string;
  workspace: string;
  sizeBytes: number;
  ownership: NEXISMediaOwnership;
  ownerId: string;
  ownerDisplayName: string;
  createdAt: string;
  modifiedAt: string;
  mediaType: 'video' | 'audio' | 'image' | 'project' | 'other';
}

export interface NEXISBinLock {
  binId: string;
  binName: string;
  lockStatus: NEXISBinLockStatus;
  lockedBy: string | null;
  lockedByDisplayName: string | null;
  lockedAt: string | null;
  workspace: string;
}

export interface NEXISCoPresenceUser {
  userId: string;
  displayName: string;
  application: string;
  workspace: string;
  activeBinId: string | null;
  isOnline: boolean;
  connectionType: 'local' | 'remote' | 'cloud';
  lastActiveAt: string;
}

export interface NEXISMediaServicesJob {
  id: string;
  type: NEXISMediaServicesJobType;
  status: NEXISMediaServicesJobStatus;
  sourceFilePath: string;
  destinationWorkspace: string;
  progress: number; // 0-100
  priority: 'low' | 'normal' | 'high' | 'urgent';
  submittedBy: string;
  submittedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  estimatedRemainingSeconds: number | null;
}

export interface NEXISWriteTarget {
  workspaceId: string;
  workspaceName: string;
  path: string;
  purpose: 'consolidate' | 'transcode' | 'ingest' | 'export' | 'proxy';
  isDefault: boolean;
}

export interface NEXISClientConfig {
  credentials: NEXISCredentials;
  autoReconnect: boolean;
  reconnectIntervalMs: number;
  heartbeatIntervalMs: number;
  enableMediaServices: boolean;
  enableCoPresence: boolean;
}

// ─── Client ────────────────────────────────────────────────────────────────

export class NEXISClient {
  private config: NEXISClientConfig;
  private connectionStatus: NEXISConnectionStatus = 'disconnected';
  private workspaces: NEXISWorkspace[] = [];
  private storageGroups: NEXISStorageGroup[] = [];
  private binLocks: NEXISBinLock[] = [];
  private coPresenceUsers: NEXISCoPresenceUser[] = [];
  private mediaServicesJobs: NEXISMediaServicesJob[] = [];
  private writeTargets: NEXISWriteTarget[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor(config?: Partial<NEXISClientConfig>) {
    this.config = {
      credentials: config?.credentials ?? {
        hostname: 'localhost',
        port: 5000,
        username: '',
        password: '',
      },
      autoReconnect: config?.autoReconnect ?? true,
      reconnectIntervalMs: config?.reconnectIntervalMs ?? 5000,
      heartbeatIntervalMs: config?.heartbeatIntervalMs ?? 10000,
      enableMediaServices: config?.enableMediaServices ?? true,
      enableCoPresence: config?.enableCoPresence ?? true,
    };
  }

  // ─── Connection ────────────────────────────────────────────────────

  async connect(credentials?: NEXISCredentials): Promise<boolean> {
    if (credentials) {
      this.config.credentials = credentials;
    }

    this.setConnectionStatus('connecting');

    try {
      this.setConnectionStatus('authenticating');
      await this.simulateDelay(300);

      if (!this.config.credentials.hostname || !this.config.credentials.username) {
        throw new Error('Invalid credentials: hostname and username required');
      }

      // Initialize mock data on successful connection
      this.initializeMockData();
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
    this.setConnectionStatus('disconnected');
    this.emit('disconnected', {});
  }

  getConnectionStatus(): NEXISConnectionStatus {
    return this.connectionStatus;
  }

  isConnected(): boolean {
    return this.connectionStatus === 'connected';
  }

  // ─── Workspace Browsing ────────────────────────────────────────────

  getWorkspaces(): NEXISWorkspace[] {
    this.assertConnected();
    return [...this.workspaces];
  }

  getStorageGroups(): NEXISStorageGroup[] {
    this.assertConnected();
    return [...this.storageGroups];
  }

  async browseWorkspace(workspaceId: string): Promise<NEXISMediaEntry[]> {
    this.assertConnected();
    const ws = this.workspaces.find((w) => w.id === workspaceId);
    if (!ws) throw new Error(`Workspace not found: ${workspaceId}`);

    // Return mock media entries
    return [
      {
        id: `media-${workspaceId}-001`,
        fileName: 'Scene_01_Take_01.mxf',
        filePath: `${ws.path}/Scene_01_Take_01.mxf`,
        workspace: ws.name,
        sizeBytes: 2_147_483_648,
        ownership: 'shared',
        ownerId: 'user-editor',
        ownerDisplayName: 'Editor 1',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        modifiedAt: new Date().toISOString(),
        mediaType: 'video',
      },
      {
        id: `media-${workspaceId}-002`,
        fileName: 'Dialogue_Mix_v3.wav',
        filePath: `${ws.path}/Dialogue_Mix_v3.wav`,
        workspace: ws.name,
        sizeBytes: 524_288_000,
        ownership: 'local',
        ownerId: 'user-mixer',
        ownerDisplayName: 'Audio Mixer',
        createdAt: new Date(Date.now() - 43200000).toISOString(),
        modifiedAt: new Date().toISOString(),
        mediaType: 'audio',
      },
    ];
  }

  // ─── Media Ownership Registry ──────────────────────────────────────

  async getMediaOwnership(filePath: string): Promise<NEXISMediaEntry | null> {
    this.assertConnected();
    return null; // Would query the NEXIS ownership registry
  }

  async claimOwnership(filePath: string): Promise<boolean> {
    this.assertConnected();
    this.emit('ownership:claimed', { filePath, userId: this.config.credentials.username });
    return true;
  }

  async releaseOwnership(filePath: string): Promise<boolean> {
    this.assertConnected();
    this.emit('ownership:released', { filePath, userId: this.config.credentials.username });
    return true;
  }

  // ─── Bin-Level Locking ─────────────────────────────────────────────

  getBinLocks(): NEXISBinLock[] {
    this.assertConnected();
    return [...this.binLocks];
  }

  async lockBin(binId: string, binName: string): Promise<NEXISBinLock> {
    this.assertConnected();

    const existing = this.binLocks.find((l) => l.binId === binId);
    if (existing && existing.lockStatus === 'locked-other') {
      throw new Error(`Bin "${binName}" is locked by ${existing.lockedByDisplayName}`);
    }

    const lock: NEXISBinLock = {
      binId,
      binName,
      lockStatus: 'locked-self',
      lockedBy: this.config.credentials.username,
      lockedByDisplayName: this.config.credentials.username,
      lockedAt: new Date().toISOString(),
      workspace: this.workspaces[0]?.name ?? 'default',
    };

    const idx = this.binLocks.findIndex((l) => l.binId === binId);
    if (idx >= 0) {
      this.binLocks[idx] = lock;
    } else {
      this.binLocks.push(lock);
    }

    this.emit('bin:locked', lock);
    return lock;
  }

  async unlockBin(binId: string): Promise<void> {
    this.assertConnected();

    const idx = this.binLocks.findIndex((l) => l.binId === binId);
    if (idx >= 0) {
      this.binLocks[idx].lockStatus = 'unlocked';
      this.binLocks[idx].lockedBy = null;
      this.binLocks[idx].lockedByDisplayName = null;
      this.binLocks[idx].lockedAt = null;
      this.emit('bin:unlocked', { binId });
    }
  }

  // ─── Write Targets ────────────────────────────────────────────────

  getWriteTargets(): NEXISWriteTarget[] {
    this.assertConnected();
    return [...this.writeTargets];
  }

  setDefaultWriteTarget(workspaceId: string, purpose: NEXISWriteTarget['purpose']): void {
    this.assertConnected();
    for (const target of this.writeTargets) {
      if (target.purpose === purpose) {
        target.isDefault = target.workspaceId === workspaceId;
      }
    }
    this.emit('writeTarget:changed', { workspaceId, purpose });
  }

  // ─── Co-Presence ───────────────────────────────────────────────────

  getCoPresenceUsers(): NEXISCoPresenceUser[] {
    this.assertConnected();
    return [...this.coPresenceUsers];
  }

  getOnlineUsers(): NEXISCoPresenceUser[] {
    return this.coPresenceUsers.filter((u) => u.isOnline);
  }

  // ─── MediaServices Integration ─────────────────────────────────────

  getMediaServicesJobs(): NEXISMediaServicesJob[] {
    this.assertConnected();
    return [...this.mediaServicesJobs];
  }

  async submitMediaServicesJob(
    type: NEXISMediaServicesJobType,
    sourceFilePath: string,
    destinationWorkspace: string,
    priority: NEXISMediaServicesJob['priority'] = 'normal',
  ): Promise<NEXISMediaServicesJob> {
    this.assertConnected();

    const job: NEXISMediaServicesJob = {
      id: `ms-job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      status: 'queued',
      sourceFilePath,
      destinationWorkspace,
      progress: 0,
      priority,
      submittedBy: this.config.credentials.username,
      submittedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      errorMessage: null,
      estimatedRemainingSeconds: null,
    };

    this.mediaServicesJobs.push(job);
    this.emit('mediaServices:jobSubmitted', job);
    return job;
  }

  async cancelMediaServicesJob(jobId: string): Promise<boolean> {
    this.assertConnected();
    const job = this.mediaServicesJobs.find((j) => j.id === jobId);
    if (!job || job.status === 'complete' || job.status === 'failed') return false;

    job.status = 'cancelled';
    this.emit('mediaServices:jobCancelled', { jobId });
    return true;
  }

  // ─── Events ────────────────────────────────────────────────────────

  on(event: string, callback: (...args: unknown[]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private emit(event: string, data: unknown): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch { /* swallow */ }
      }
    }
  }

  private setConnectionStatus(status: NEXISConnectionStatus): void {
    this.connectionStatus = status;
    this.emit('status:change', status);
  }

  private assertConnected(): void {
    if (this.connectionStatus !== 'connected') {
      throw new Error('NEXIS client is not connected');
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

  private initializeMockData(): void {
    const ws1: NEXISWorkspace = {
      id: 'ws-production',
      name: 'Production',
      path: '/nexis/production',
      storageGroupId: 'sg-main',
      storageGroupName: 'Main Storage',
      totalCapacityBytes: 50 * 1024 ** 4, // 50 TB
      usedCapacityBytes: 32 * 1024 ** 4,
      freeCapacityBytes: 18 * 1024 ** 4,
      isProtected: false,
      mountStatus: 'mounted',
    };

    const ws2: NEXISWorkspace = {
      id: 'ws-archive',
      name: 'Archive',
      path: '/nexis/archive',
      storageGroupId: 'sg-archive',
      storageGroupName: 'Archive Storage',
      totalCapacityBytes: 100 * 1024 ** 4,
      usedCapacityBytes: 67 * 1024 ** 4,
      freeCapacityBytes: 33 * 1024 ** 4,
      isProtected: true,
      mountStatus: 'mounted',
    };

    const ws3: NEXISWorkspace = {
      id: 'ws-scratch',
      name: 'Scratch',
      path: '/nexis/scratch',
      storageGroupId: 'sg-main',
      storageGroupName: 'Main Storage',
      totalCapacityBytes: 10 * 1024 ** 4,
      usedCapacityBytes: 4 * 1024 ** 4,
      freeCapacityBytes: 6 * 1024 ** 4,
      isProtected: false,
      mountStatus: 'mounted',
    };

    this.workspaces = [ws1, ws2, ws3];

    this.storageGroups = [
      {
        id: 'sg-main',
        name: 'Main Storage',
        type: 'production',
        workspaces: [ws1, ws3],
        totalCapacityBytes: 60 * 1024 ** 4,
        usedCapacityBytes: 36 * 1024 ** 4,
        healthStatus: 'healthy',
      },
      {
        id: 'sg-archive',
        name: 'Archive Storage',
        type: 'archive',
        workspaces: [ws2],
        totalCapacityBytes: 100 * 1024 ** 4,
        usedCapacityBytes: 67 * 1024 ** 4,
        healthStatus: 'healthy',
      },
    ];

    this.writeTargets = [
      { workspaceId: 'ws-production', workspaceName: 'Production', path: '/nexis/production/media', purpose: 'consolidate', isDefault: true },
      { workspaceId: 'ws-production', workspaceName: 'Production', path: '/nexis/production/transcode', purpose: 'transcode', isDefault: true },
      { workspaceId: 'ws-production', workspaceName: 'Production', path: '/nexis/production/ingest', purpose: 'ingest', isDefault: true },
      { workspaceId: 'ws-scratch', workspaceName: 'Scratch', path: '/nexis/scratch/proxy', purpose: 'proxy', isDefault: true },
      { workspaceId: 'ws-scratch', workspaceName: 'Scratch', path: '/nexis/scratch/export', purpose: 'export', isDefault: true },
    ];

    this.coPresenceUsers = [
      {
        userId: 'user-editor-1',
        displayName: 'Sarah K.',
        application: 'Media Composer',
        workspace: 'Production',
        activeBinId: 'b1',
        isOnline: true,
        connectionType: 'local',
        lastActiveAt: new Date().toISOString(),
      },
      {
        userId: 'user-editor-2',
        displayName: 'Marcus T.',
        application: 'Media Composer',
        workspace: 'Production',
        activeBinId: null,
        isOnline: true,
        connectionType: 'remote',
        lastActiveAt: new Date(Date.now() - 300000).toISOString(),
      },
    ];

    this.binLocks = [
      {
        binId: 'b1',
        binName: 'Rushes',
        lockStatus: 'locked-other',
        lockedBy: 'user-editor-1',
        lockedByDisplayName: 'Sarah K.',
        lockedAt: new Date(Date.now() - 600000).toISOString(),
        workspace: 'Production',
      },
    ];
  }

  dispose(): void {
    this.stopHeartbeat();
    this.listeners.clear();
    this.connectionStatus = 'disconnected';
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────

export function createNEXISClient(
  config?: Partial<NEXISClientConfig>,
): NEXISClient {
  return new NEXISClient(config);
}
