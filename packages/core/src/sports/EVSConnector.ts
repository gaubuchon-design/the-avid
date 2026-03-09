// ─── EVS Connector ────────────────────────────────────────────────────────────
// SP-03: Native EVS MediaServer integration for browsing clip databases,
// importing operator-marked clips, LSM proxy workflow, and preserving
// EVS-specific metadata (operator marks, camera angles, timecodes).

import type {
  EVSClip,
  EVSServer,
  EVSChannel,
  EVSConnectionConfig,
  EVSConnectionStatus,
  SportsCameraAngle,
} from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createId(prefix: string): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Events ───────────────────────────────────────────────────────────────────

export type EVSEvent =
  | { type: 'CONNECTION_CHANGED'; status: EVSConnectionStatus; serverId: string }
  | { type: 'CLIP_ADDED'; clip: EVSClip }
  | { type: 'CLIP_UPDATED'; clip: EVSClip }
  | { type: 'CLIP_REMOVED'; clipId: string }
  | { type: 'CHANNEL_UPDATE'; channel: EVSChannel }
  | { type: 'SYNC_COMPLETE'; clipCount: number }
  | { type: 'ERROR'; serverId: string; error: string };

export type EVSListener = (event: EVSEvent) => void;

// ─── Clip Filter ──────────────────────────────────────────────────────────────

export interface EVSClipFilter {
  cameraAngle?: SportsCameraAngle;
  operatorLabel?: string;
  tags?: string[];
  minDuration?: number;
  maxDuration?: number;
  dateRange?: { start: string; end: string };
  searchText?: string;
}

// ─── EVS Connector ────────────────────────────────────────────────────────────

export class EVSConnector {
  private config: EVSConnectionConfig;
  private servers: Map<string, EVSServer> = new Map();
  private clips: Map<string, EVSClip> = new Map();
  private listeners: Set<EVSListener> = new Set();
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private connectionStatus: EVSConnectionStatus = 'DISCONNECTED';

  constructor(config: Partial<EVSConnectionConfig> = {}) {
    this.config = {
      serverAddress: config.serverAddress ?? '192.168.1.100',
      port: config.port ?? 9000,
      protocol: config.protocol ?? 'IP_DIRECTOR',
      username: config.username,
      password: config.password,
      proxyWorkflow: config.proxyWorkflow ?? true,
      autoSync: config.autoSync ?? true,
      syncIntervalMs: config.syncIntervalMs ?? 2000,
    };
  }

  // ─── Connection Lifecycle ───────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.connectionStatus === 'CONNECTED' || this.connectionStatus === 'CONNECTING') {
      return;
    }

    this.setConnectionStatus('CONNECTING', 'primary');

    try {
      // In production, this would establish a TCP/IP connection to EVS IP Director.
      // For the demo, we simulate the connection and seed demo data.
      await this.simulateHandshake();
      this.setConnectionStatus('CONNECTED', 'primary');

      if (this.config.autoSync) {
        this.startAutoSync();
      }

      // Seed demo server and clips
      this.seedDemoData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      this.setConnectionStatus('ERROR', 'primary');
      this.emit({ type: 'ERROR', serverId: 'primary', error: message });
    }
  }

  async disconnect(): Promise<void> {
    this.stopAutoSync();
    this.setConnectionStatus('DISCONNECTED', 'primary');
    this.servers.clear();
    this.clips.clear();
  }

  getConnectionStatus(): EVSConnectionStatus {
    return this.connectionStatus;
  }

  // ─── Server & Channel Queries ───────────────────────────────────────────────

  getServers(): EVSServer[] {
    return Array.from(this.servers.values());
  }

  getServer(serverId: string): EVSServer | null {
    return this.servers.get(serverId) ?? null;
  }

  getChannels(serverId: string): EVSChannel[] {
    return this.servers.get(serverId)?.channels ?? [];
  }

  // ─── Clip Management ───────────────────────────────────────────────────────

  getAllClips(): EVSClip[] {
    return Array.from(this.clips.values());
  }

  getClip(clipId: string): EVSClip | null {
    return this.clips.get(clipId) ?? null;
  }

  getClipsByServer(serverId: string): EVSClip[] {
    return Array.from(this.clips.values()).filter((c) => c.serverId === serverId);
  }

  getClipsByAngle(angle: SportsCameraAngle): EVSClip[] {
    return Array.from(this.clips.values()).filter((c) => c.cameraAngle === angle);
  }

  filterClips(filter: EVSClipFilter): EVSClip[] {
    let result = Array.from(this.clips.values());

    if (filter.cameraAngle) {
      result = result.filter((c) => c.cameraAngle === filter.cameraAngle);
    }
    if (filter.operatorLabel) {
      result = result.filter((c) =>
        c.operatorLabel.toLowerCase().includes(filter.operatorLabel!.toLowerCase()),
      );
    }
    if (filter.tags && filter.tags.length > 0) {
      result = result.filter((c) =>
        filter.tags!.some((tag) => c.tags.includes(tag)),
      );
    }
    if (filter.minDuration !== undefined) {
      result = result.filter((c) => c.duration >= filter.minDuration!);
    }
    if (filter.maxDuration !== undefined) {
      result = result.filter((c) => c.duration <= filter.maxDuration!);
    }
    if (filter.dateRange) {
      const start = new Date(filter.dateRange.start).getTime();
      const end = new Date(filter.dateRange.end).getTime();
      result = result.filter((c) => {
        const created = new Date(c.createdAt).getTime();
        return created >= start && created <= end;
      });
    }
    if (filter.searchText) {
      const q = filter.searchText.toLowerCase();
      result = result.filter(
        (c) =>
          c.operatorLabel.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q)) ||
          c.clipId.toLowerCase().includes(q),
      );
    }

    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Import a clip from EVS into the editing timeline. Returns the local asset path.
   * In proxy mode, imports the low-res version first with a background full-res transfer.
   */
  async importClip(clipId: string, options: { useProxy?: boolean } = {}): Promise<{ localPath: string; isProxy: boolean }> {
    const clip = this.clips.get(clipId);
    if (!clip) {
      throw new Error(`EVS clip not found: ${clipId}`);
    }

    const useProxy = options.useProxy ?? this.config.proxyWorkflow;

    // In production, this would initiate an XFile3 or IP Director transfer.
    // Proxy clips are transferred via the LSM proxy workflow at lower resolution.
    const suffix = useProxy ? '_proxy' : '_hires';
    const localPath = `/media/evs_import/${clip.clipId}${suffix}.mxf`;

    return {
      localPath,
      isProxy: useProxy,
    };
  }

  /**
   * Request full-resolution re-conform for a previously imported proxy clip.
   */
  async reconform(clipId: string): Promise<string> {
    const clip = this.clips.get(clipId);
    if (!clip) {
      throw new Error(`EVS clip not found: ${clipId}`);
    }

    // Would initiate a high-res transfer in production
    return `/media/evs_import/${clip.clipId}_hires.mxf`;
  }

  /**
   * Manually sync the clip database from all connected servers.
   */
  async syncClips(): Promise<number> {
    // In production, queries EVS clip database over IP Director protocol
    const count = this.clips.size;
    this.emit({ type: 'SYNC_COMPLETE', clipCount: count });
    return count;
  }

  // ─── Events ─────────────────────────────────────────────────────────────────

  on(listener: EVSListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  off(listener: EVSListener): void {
    this.listeners.delete(listener);
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private emit(event: EVSEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Swallow listener errors
      }
    }
  }

  private setConnectionStatus(status: EVSConnectionStatus, serverId: string): void {
    this.connectionStatus = status;
    this.emit({ type: 'CONNECTION_CHANGED', status, serverId });
  }

  private startAutoSync(): void {
    if (this.syncTimer) return;
    this.syncTimer = setInterval(() => {
      this.syncClips().catch(() => {
        // Sync errors are non-fatal
      });
    }, this.config.syncIntervalMs);
  }

  private stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  private async simulateHandshake(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 150));
  }

  private seedDemoData(): void {
    const now = new Date();
    const serverId = 'evs-01';

    const channels: EVSChannel[] = [
      { id: 'ch-1', label: 'CAM 1 - Main Wide', cameraAngle: 'MAIN_WIDE', isRecording: true, currentTimecode: '01:23:45:12' },
      { id: 'ch-2', label: 'CAM 2 - Tight', cameraAngle: 'TIGHT', isRecording: true, currentTimecode: '01:23:45:12' },
      { id: 'ch-3', label: 'CAM 3 - ISO Left', cameraAngle: 'ISO_1', isRecording: true, currentTimecode: '01:23:45:12' },
      { id: 'ch-4', label: 'CAM 4 - ISO Right', cameraAngle: 'ISO_2', isRecording: true, currentTimecode: '01:23:45:12' },
      { id: 'ch-5', label: 'CAM 5 - Reverse', cameraAngle: 'REVERSE', isRecording: true, currentTimecode: '01:23:45:12' },
      { id: 'ch-6', label: 'CAM 6 - Super Slo-Mo', cameraAngle: 'SUPER_SLO_MO', isRecording: true, currentTimecode: '01:23:45:12' },
      { id: 'ch-7', label: 'CAM 7 - SkyCam', cameraAngle: 'SKYCAM', isRecording: false, currentTimecode: '01:23:42:00' },
      { id: 'ch-8', label: 'CAM 8 - Beauty', cameraAngle: 'BEAUTY', isRecording: true, currentTimecode: '01:23:45:12' },
    ];

    const server: EVSServer = {
      id: serverId,
      name: 'EVS XT-VIA #1',
      ipAddress: this.config.serverAddress,
      port: this.config.port,
      status: 'CONNECTED',
      clipCount: 0,
      storageUsedPercent: 42,
      lastSyncAt: now.toISOString(),
      channels,
    };

    this.servers.set(serverId, server);

    // Seed demo clips that an operator would have marked
    const demoClips: Array<Omit<EVSClip, 'clipId' | 'createdAt'>> = [
      {
        cameraAngle: 'MAIN_WIDE',
        inPoint: 0,
        outPoint: 8.5,
        operatorLabel: 'GOAL - Home #10 Header',
        serverPath: '/evs/xt1/rec/clip_001.mxf',
        isProxy: false,
        timecodeIn: '01:15:22:00',
        timecodeOut: '01:15:30:12',
        duration: 8.5,
        operatorName: 'Op-1',
        tags: ['goal', 'highlight', 'header'],
        serverId,
        format: 'MXF_OP1A',
      },
      {
        cameraAngle: 'TIGHT',
        inPoint: 0,
        outPoint: 6.2,
        operatorLabel: 'GOAL Replay - Close angle',
        serverPath: '/evs/xt1/rec/clip_002.mxf',
        isProxy: false,
        timecodeIn: '01:15:22:05',
        timecodeOut: '01:15:28:17',
        duration: 6.2,
        operatorName: 'Op-1',
        tags: ['goal', 'replay', 'closeup'],
        serverId,
        format: 'MXF_OP1A',
      },
      {
        cameraAngle: 'SUPER_SLO_MO',
        inPoint: 0,
        outPoint: 12.0,
        operatorLabel: 'SSM Goal Celebration',
        serverPath: '/evs/xt1/rec/clip_003.mxf',
        isProxy: false,
        timecodeIn: '01:15:30:00',
        timecodeOut: '01:15:42:00',
        duration: 12.0,
        operatorName: 'Op-2',
        tags: ['celebration', 'slo-mo', 'highlight'],
        serverId,
        format: 'MXF_OP1A',
      },
      {
        cameraAngle: 'ISO_1',
        inPoint: 0,
        outPoint: 15.3,
        operatorLabel: 'Tackle in Box - Penalty shout',
        serverPath: '/evs/xt1/rec/clip_004.mxf',
        isProxy: false,
        timecodeIn: '01:22:10:00',
        timecodeOut: '01:22:25:07',
        duration: 15.3,
        operatorName: 'Op-1',
        tags: ['tackle', 'penalty', 'foul'],
        serverId,
        format: 'MXF_OP1A',
      },
      {
        cameraAngle: 'MAIN_WIDE',
        inPoint: 0,
        outPoint: 22.0,
        operatorLabel: 'Counter Attack - Fast Break',
        serverPath: '/evs/xt1/rec/clip_005.mxf',
        isProxy: false,
        timecodeIn: '01:31:05:00',
        timecodeOut: '01:31:27:00',
        duration: 22.0,
        operatorName: 'Op-1',
        tags: ['attack', 'fast-break'],
        serverId,
        format: 'MXF_OP1A',
      },
      {
        cameraAngle: 'REVERSE',
        inPoint: 0,
        outPoint: 5.0,
        operatorLabel: 'Crowd Reaction - North Stand',
        serverPath: '/evs/xt1/rec/clip_006.mxf',
        isProxy: false,
        timecodeIn: '01:15:31:00',
        timecodeOut: '01:15:36:00',
        duration: 5.0,
        operatorName: 'Op-2',
        tags: ['crowd', 'reaction'],
        serverId,
        format: 'MXF_OP1A',
      },
      {
        cameraAngle: 'SKYCAM',
        inPoint: 0,
        outPoint: 10.0,
        operatorLabel: 'Corner Kick Delivery',
        serverPath: '/evs/xt1/rec/clip_007.mxf',
        isProxy: false,
        timecodeIn: '01:38:12:00',
        timecodeOut: '01:38:22:00',
        duration: 10.0,
        operatorName: 'Op-1',
        tags: ['corner', 'set-piece'],
        serverId,
        format: 'MXF_OP1A',
      },
      {
        cameraAngle: 'BEAUTY',
        inPoint: 0,
        outPoint: 4.5,
        operatorLabel: 'Stadium Atmosphere Wide',
        serverPath: '/evs/xt1/rec/clip_008.mxf',
        isProxy: false,
        timecodeIn: '01:00:00:00',
        timecodeOut: '01:00:04:12',
        duration: 4.5,
        operatorName: 'Op-2',
        tags: ['beauty', 'atmosphere', 'pre-game'],
        serverId,
        format: 'MXF_OP1A',
      },
    ];

    for (const clipData of demoClips) {
      const clip: EVSClip = {
        ...clipData,
        clipId: createId('evs-clip'),
        createdAt: new Date(now.getTime() - Math.random() * 3600000).toISOString(),
      };
      this.clips.set(clip.clipId, clip);
      this.emit({ type: 'CLIP_ADDED', clip });
    }

    server.clipCount = this.clips.size;
    this.emit({ type: 'SYNC_COMPLETE', clipCount: this.clips.size });
  }
}

/**
 * Create a pre-configured EVS connector for sports production.
 */
export function createEVSConnector(
  serverAddress?: string,
  options: Partial<EVSConnectionConfig> = {},
): EVSConnector {
  return new EVSConnector({
    serverAddress: serverAddress ?? '192.168.1.100',
    ...options,
  });
}
