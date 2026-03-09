// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — NRCS Client (N-02)
//  Newsroom Computer System integration framework with adapters for
//  iNEWS, ENPS, Octopus, and OpenMedia.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  NRCSConnection,
  NRCSConnectionStatus,
  NRCSSystemType,
  NRCSCredentials,
  NRCSEventMap,
  NRCSEventHandler,
  RundownState,
  RundownEvent,
  StoryStatus,
} from './types';

// ─── Event Emitter ─────────────────────────────────────────────────────────

type ListenerMap = {
  [K in keyof NRCSEventMap]?: Set<NRCSEventHandler<K>>;
};

class NRCSEventEmitter {
  private listeners: ListenerMap = {};

  on<K extends keyof NRCSEventMap>(event: K, handler: NRCSEventHandler<K>): void {
    if (!this.listeners[event]) {
      (this.listeners as Record<string, Set<unknown>>)[event] = new Set();
    }
    (this.listeners[event] as Set<NRCSEventHandler<K>>).add(handler);
  }

  off<K extends keyof NRCSEventMap>(event: K, handler: NRCSEventHandler<K>): void {
    const set = this.listeners[event] as Set<NRCSEventHandler<K>> | undefined;
    if (set) {
      set.delete(handler);
    }
  }

  protected emit<K extends keyof NRCSEventMap>(event: K, data: NRCSEventMap[K]): void {
    const set = this.listeners[event] as Set<NRCSEventHandler<K>> | undefined;
    if (set) {
      for (const handler of set) {
        try {
          handler(data);
        } catch (err) {
          console.error(`[NRCSClient] Error in handler for ${String(event)}:`, err);
        }
      }
    }
  }

  removeAllListeners(): void {
    for (const key of Object.keys(this.listeners)) {
      delete this.listeners[key as keyof NRCSEventMap];
    }
  }
}

// ─── Abstract Adapter ──────────────────────────────────────────────────────

export interface NRCSAdapterConfig {
  host: string;
  port: number;
  credentials: NRCSCredentials;
  mosId?: string;
  ncsId?: string;
}

export abstract class NRCSAdapter {
  abstract readonly systemType: NRCSSystemType;

  protected config: NRCSAdapterConfig;
  protected connected = false;

  constructor(config: NRCSAdapterConfig) {
    this.config = config;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract fetchRundowns(): Promise<RundownState[]>;
  abstract fetchStory(storyId: string): Promise<RundownEvent | null>;
  abstract updateStoryStatus(storyId: string, status: StoryStatus): Promise<void>;
  abstract sendReadyToAir(storyId: string): Promise<void>;

  isConnected(): boolean {
    return this.connected;
  }

  getConfig(): NRCSAdapterConfig {
    return { ...this.config };
  }
}

// ─── iNEWS Adapter (REST/SOAP protocol) ───────────────────────────────────

export class INEWSAdapter extends NRCSAdapter {
  readonly systemType: NRCSSystemType = 'INEWS';

  private sessionToken: string | null = null;
  private baseUrl: string;

  constructor(config: NRCSAdapterConfig) {
    super(config);
    this.baseUrl = `https://${config.host}:${config.port}`;
  }

  async connect(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.config.credentials.username,
          password: this.config.credentials.password,
        }),
      });

      if (!response.ok) {
        throw new Error(`iNEWS auth failed: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as { token: string };
      this.sessionToken = data.token;
      this.connected = true;
    } catch (err) {
      this.connected = false;
      throw new Error(`iNEWS connection failed: ${(err as Error).message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.sessionToken) {
      try {
        await fetch(`${this.baseUrl}/api/v1/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.sessionToken}` },
        });
      } catch {
        // Swallow logout errors
      }
    }
    this.sessionToken = null;
    this.connected = false;
  }

  async fetchRundowns(): Promise<RundownState[]> {
    this.assertConnected();
    const response = await fetch(`${this.baseUrl}/api/v1/rundowns`, {
      headers: { Authorization: `Bearer ${this.sessionToken}` },
    });

    if (!response.ok) {
      throw new Error(`iNEWS fetchRundowns failed: ${response.status}`);
    }

    const data = (await response.json()) as { rundowns: RundownState[] };
    return data.rundowns;
  }

  async fetchStory(storyId: string): Promise<RundownEvent | null> {
    this.assertConnected();
    const response = await fetch(`${this.baseUrl}/api/v1/stories/${storyId}`, {
      headers: { Authorization: `Bearer ${this.sessionToken}` },
    });

    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`iNEWS fetchStory failed: ${response.status}`);
    }

    return (await response.json()) as RundownEvent;
  }

  async updateStoryStatus(storyId: string, status: StoryStatus): Promise<void> {
    this.assertConnected();
    const response = await fetch(`${this.baseUrl}/api/v1/stories/${storyId}/status`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      throw new Error(`iNEWS updateStoryStatus failed: ${response.status}`);
    }
  }

  async sendReadyToAir(storyId: string): Promise<void> {
    this.assertConnected();
    const response = await fetch(`${this.baseUrl}/api/v1/stories/${storyId}/ready-to-air`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.sessionToken}` },
    });

    if (!response.ok) {
      throw new Error(`iNEWS readyToAir failed: ${response.status}`);
    }
  }

  private assertConnected(): void {
    if (!this.connected || !this.sessionToken) {
      throw new Error('iNEWS adapter not connected');
    }
  }
}

// ─── ENPS Adapter (MOS 2.8.5 protocol) ────────────────────────────────────

export class ENPSAdapter extends NRCSAdapter {
  readonly systemType: NRCSSystemType = 'ENPS';

  private ws: WebSocket | null = null;
  private mosId: string;
  private ncsId: string;

  constructor(config: NRCSAdapterConfig) {
    super(config);
    this.mosId = config.mosId ?? 'THEAVID.MOS';
    this.ncsId = config.ncsId ?? 'ENPS.NCS';
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `wss://${this.config.host}:${this.config.port}/mos`;

      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        reject(new Error(`ENPS WebSocket creation failed: ${(err as Error).message}`));
        return;
      }

      this.ws.onopen = () => {
        this.sendMOSHandshake();
        this.connected = true;
        resolve();
      };

      this.ws.onerror = (event) => {
        this.connected = false;
        reject(new Error(`ENPS WebSocket error: ${String(event)}`));
      };

      this.ws.onclose = () => {
        this.connected = false;
      };
    });
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.connected = false;
  }

  async fetchRundowns(): Promise<RundownState[]> {
    this.assertConnected();
    this.sendMessage({
      type: 'roReqAll',
      mosId: this.mosId,
      ncsId: this.ncsId,
    });

    // In production, await response via the MOS message handler.
    // For framework purposes, return empty and populate via events.
    return [];
  }

  async fetchStory(storyId: string): Promise<RundownEvent | null> {
    this.assertConnected();
    this.sendMessage({
      type: 'roStoryReq',
      mosId: this.mosId,
      ncsId: this.ncsId,
      storyId,
    });
    return null;
  }

  async updateStoryStatus(storyId: string, status: StoryStatus): Promise<void> {
    this.assertConnected();
    this.sendMessage({
      type: 'roStoryStatus',
      mosId: this.mosId,
      ncsId: this.ncsId,
      storyId,
      status,
    });
  }

  async sendReadyToAir(storyId: string): Promise<void> {
    this.assertConnected();
    this.sendMessage({
      type: 'roReadyToAir',
      mosId: this.mosId,
      ncsId: this.ncsId,
      storyId,
    });
  }

  private sendMOSHandshake(): void {
    this.sendMessage({
      type: 'mosReqAll',
      mosId: this.mosId,
      ncsId: this.ncsId,
      version: '2.8.5',
    });
  }

  private sendMessage(msg: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private assertConnected(): void {
    if (!this.connected || !this.ws) {
      throw new Error('ENPS adapter not connected');
    }
  }
}

// ─── Octopus REST Adapter ──────────────────────────────────────────────────

export class OctopusAdapter extends NRCSAdapter {
  readonly systemType: NRCSSystemType = 'OCTOPUS';

  private apiKey: string | null = null;
  private baseUrl: string;

  constructor(config: NRCSAdapterConfig) {
    super(config);
    this.baseUrl = `https://${config.host}:${config.port}/octopus/api`;
  }

  async connect(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: this.config.credentials.username,
          pass: this.config.credentials.password,
        }),
      });

      if (!response.ok) {
        throw new Error(`Octopus auth failed: ${response.status}`);
      }

      const data = (await response.json()) as { apiKey: string };
      this.apiKey = data.apiKey;
      this.connected = true;
    } catch (err) {
      this.connected = false;
      throw new Error(`Octopus connection failed: ${(err as Error).message}`);
    }
  }

  async disconnect(): Promise<void> {
    this.apiKey = null;
    this.connected = false;
  }

  async fetchRundowns(): Promise<RundownState[]> {
    this.assertConnected();
    const response = await fetch(`${this.baseUrl}/rundowns`, {
      headers: { 'X-API-Key': this.apiKey! },
    });

    if (!response.ok) {
      throw new Error(`Octopus fetchRundowns failed: ${response.status}`);
    }

    return (await response.json()) as RundownState[];
  }

  async fetchStory(storyId: string): Promise<RundownEvent | null> {
    this.assertConnected();
    const response = await fetch(`${this.baseUrl}/stories/${storyId}`, {
      headers: { 'X-API-Key': this.apiKey! },
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Octopus fetchStory failed: ${response.status}`);
    }

    return (await response.json()) as RundownEvent;
  }

  async updateStoryStatus(storyId: string, status: StoryStatus): Promise<void> {
    this.assertConnected();
    await fetch(`${this.baseUrl}/stories/${storyId}`, {
      method: 'PATCH',
      headers: {
        'X-API-Key': this.apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });
  }

  async sendReadyToAir(storyId: string): Promise<void> {
    await this.updateStoryStatus(storyId, 'READY');
  }

  private assertConnected(): void {
    if (!this.connected || !this.apiKey) {
      throw new Error('Octopus adapter not connected');
    }
  }
}

// ─── OpenMedia REST Adapter ────────────────────────────────────────────────

export class OpenMediaAdapter extends NRCSAdapter {
  readonly systemType: NRCSSystemType = 'OPENMEDIA';

  private bearerToken: string | null = null;
  private baseUrl: string;

  constructor(config: NRCSAdapterConfig) {
    super(config);
    this.baseUrl = `https://${config.host}:${config.port}/openmedia/rest/v2`;
  }

  async connect(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.config.credentials.username,
          password: this.config.credentials.password,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenMedia auth failed: ${response.status}`);
      }

      const data = (await response.json()) as { bearer: string };
      this.bearerToken = data.bearer;
      this.connected = true;
    } catch (err) {
      this.connected = false;
      throw new Error(`OpenMedia connection failed: ${(err as Error).message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.bearerToken) {
      try {
        await fetch(`${this.baseUrl}/session`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${this.bearerToken}` },
        });
      } catch {
        // Swallow
      }
    }
    this.bearerToken = null;
    this.connected = false;
  }

  async fetchRundowns(): Promise<RundownState[]> {
    this.assertConnected();
    const response = await fetch(`${this.baseUrl}/rundowns`, {
      headers: { Authorization: `Bearer ${this.bearerToken}` },
    });

    if (!response.ok) {
      throw new Error(`OpenMedia fetchRundowns failed: ${response.status}`);
    }

    return (await response.json()) as RundownState[];
  }

  async fetchStory(storyId: string): Promise<RundownEvent | null> {
    this.assertConnected();
    const response = await fetch(`${this.baseUrl}/stories/${storyId}`, {
      headers: { Authorization: `Bearer ${this.bearerToken}` },
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`OpenMedia fetchStory failed: ${response.status}`);
    }

    return (await response.json()) as RundownEvent;
  }

  async updateStoryStatus(storyId: string, status: StoryStatus): Promise<void> {
    this.assertConnected();
    await fetch(`${this.baseUrl}/stories/${storyId}/status`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });
  }

  async sendReadyToAir(storyId: string): Promise<void> {
    this.assertConnected();
    await fetch(`${this.baseUrl}/stories/${storyId}/air`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.bearerToken}` },
    });
  }

  private assertConnected(): void {
    if (!this.connected || !this.bearerToken) {
      throw new Error('OpenMedia adapter not connected');
    }
  }
}

// ─── NRCSClient (facade) ───────────────────────────────────────────────────

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;
const DEFAULT_POLL_INTERVAL_MS = 10_000;

export class NRCSClient extends NRCSEventEmitter {
  private adapter: NRCSAdapter | null = null;
  private connection: NRCSConnection | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;

  getConnection(): NRCSConnection | null {
    return this.connection ? { ...this.connection } : null;
  }

  getAdapter(): NRCSAdapter | null {
    return this.adapter;
  }

  async connect(connection: Omit<NRCSConnection, 'status' | 'id'>): Promise<void> {
    this.connection = {
      ...connection,
      id: connection.mosId ?? `nrcs-${Date.now()}`,
      status: 'CONNECTING',
    };
    this.emit('connection:status', 'CONNECTING');

    this.adapter = this.createAdapter(connection.type, {
      host: connection.host,
      port: connection.port,
      credentials: connection.credentials,
      mosId: connection.mosId,
      ncsId: connection.ncsId,
    });

    try {
      await this.adapter.connect();
      this.connection.status = 'CONNECTED';
      this.connection.lastConnectedAt = new Date().toISOString();
      this.reconnectAttempts = 0;
      this.emit('connection:status', 'CONNECTED');
      this.startPolling();
    } catch (err) {
      this.connection.status = 'ERROR';
      this.connection.lastError = (err as Error).message;
      this.emit('connection:status', 'ERROR');
      this.scheduleReconnect();
    }
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    this.clearReconnect();

    if (this.adapter) {
      try {
        await this.adapter.disconnect();
      } catch {
        // Swallow disconnect errors
      }
      this.adapter = null;
    }

    if (this.connection) {
      this.connection.status = 'DISCONNECTED';
    }
    this.emit('connection:status', 'DISCONNECTED');
  }

  async fetchRundowns(): Promise<RundownState[]> {
    if (!this.adapter) {
      throw new Error('NRCS client not connected');
    }
    return this.adapter.fetchRundowns();
  }

  async fetchStory(storyId: string): Promise<RundownEvent | null> {
    if (!this.adapter) {
      throw new Error('NRCS client not connected');
    }
    return this.adapter.fetchStory(storyId);
  }

  async updateStoryStatus(storyId: string, status: StoryStatus): Promise<void> {
    if (!this.adapter) {
      throw new Error('NRCS client not connected');
    }
    return this.adapter.updateStoryStatus(storyId, status);
  }

  async sendReadyToAir(storyId: string): Promise<void> {
    if (!this.adapter) {
      throw new Error('NRCS client not connected');
    }
    return this.adapter.sendReadyToAir(storyId);
  }

  setPollInterval(ms: number): void {
    this.pollIntervalMs = Math.max(1000, ms);
    if (this.pollTimer) {
      this.stopPolling();
      this.startPolling();
    }
  }

  destroy(): void {
    this.stopPolling();
    this.clearReconnect();
    this.removeAllListeners();
    this.adapter = null;
    this.connection = null;
  }

  private createAdapter(type: NRCSSystemType, config: NRCSAdapterConfig): NRCSAdapter {
    switch (type) {
      case 'INEWS':
        return new INEWSAdapter(config);
      case 'ENPS':
        return new ENPSAdapter(config);
      case 'OCTOPUS':
        return new OctopusAdapter(config);
      case 'OPENMEDIA':
        return new OpenMediaAdapter(config);
      default:
        throw new Error(`Unsupported NRCS type: ${String(type)}`);
    }
  }

  private startPolling(): void {
    if (this.pollTimer) return;

    this.pollTimer = setInterval(async () => {
      try {
        const rundowns = await this.fetchRundowns();
        for (const rundown of rundowns) {
          this.emit('rundown:updated', rundown);
        }
      } catch (err) {
        console.warn('[NRCSClient] Poll error:', (err as Error).message);
        if (this.connection) {
          this.connection.status = 'RECONNECTING';
          this.emit('connection:status', 'RECONNECTING');
          this.scheduleReconnect();
        }
      }
    }, this.pollIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      if (this.connection) {
        this.connection.status = 'ERROR';
        this.connection.lastError = 'Max reconnection attempts exceeded';
        this.emit('connection:status', 'ERROR');
      }
      return;
    }

    this.reconnectAttempts += 1;
    const delay = RECONNECT_DELAY_MS * Math.min(this.reconnectAttempts, 5);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.adapter || !this.connection) return;

      try {
        await this.adapter.connect();
        this.connection.status = 'CONNECTED';
        this.connection.lastConnectedAt = new Date().toISOString();
        this.reconnectAttempts = 0;
        this.emit('connection:status', 'CONNECTED');
        this.startPolling();
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }
}

// ─── Singleton export ──────────────────────────────────────────────────────

export const nrcsClient = new NRCSClient();
