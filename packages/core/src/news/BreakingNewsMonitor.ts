// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Breaking News Monitor (N-04)
//  WebSocket listener for NRCS story priority changes, BREAKING/URGENT
//  detection, new story assignment notifications, and story cancellation.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  BreakingNewsAlert,
  BreakingNewsPriority,
  NRCSConnection,
  RundownEvent,
  RundownState,
} from './types';

// ─── Alert Detection ───────────────────────────────────────────────────────

const BREAKING_KEYWORDS = [
  'BREAKING',
  'BREAKING NEWS',
  'FLASH',
  'BULLETIN',
  'URGENT',
  'SPECIAL REPORT',
  'DEVELOPING',
];

const PRIORITY_KEYWORDS: Record<BreakingNewsPriority, string[]> = {
  BREAKING: ['BREAKING', 'BREAKING NEWS', 'FLASH', 'SPECIAL REPORT'],
  URGENT: ['URGENT', 'DEVELOPING'],
  BULLETIN: ['BULLETIN', 'UPDATE'],
  NORMAL: [],
};

export function detectPriority(slugline: string): BreakingNewsPriority {
  const upper = slugline.toUpperCase().trim();

  for (const [priority, keywords] of Object.entries(PRIORITY_KEYWORDS) as Array<
    [BreakingNewsPriority, string[]]
  >) {
    if (priority === 'NORMAL') continue;
    for (const keyword of keywords) {
      if (upper.startsWith(keyword) || upper.includes(`[${keyword}]`) || upper.includes(`(${keyword})`)) {
        return priority;
      }
    }
  }

  return 'NORMAL';
}

export function isBreakingStory(story: RundownEvent): boolean {
  return detectPriority(story.slugline) !== 'NORMAL';
}

export function isStoryKilled(story: RundownEvent): boolean {
  return story.status === 'KILLED';
}

// ─── Alert Factory ─────────────────────────────────────────────────────────

function generateAlertId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `alert-${globalThis.crypto.randomUUID()}`;
  }
  return `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createBreakingAlert(
  story: RundownEvent,
  priority?: BreakingNewsPriority,
): BreakingNewsAlert {
  return {
    id: generateAlertId(),
    storyId: story.storyId,
    priority: priority ?? detectPriority(story.slugline),
    alertTime: new Date().toISOString(),
    message: story.slugline,
    acknowledged: false,
    assignedEditorId: story.assignedEditorId,
  };
}

// ─── Monitor Event Types ───────────────────────────────────────────────────

export interface BreakingNewsMonitorEvents {
  'alert:breaking': BreakingNewsAlert;
  'alert:urgent': BreakingNewsAlert;
  'alert:bulletin': BreakingNewsAlert;
  'story:assigned': RundownEvent;
  'story:killed': RundownEvent;
  'story:pulled': RundownEvent;
  'connection:lost': void;
  'connection:restored': void;
}

export type BreakingNewsEventHandler<K extends keyof BreakingNewsMonitorEvents> = (
  data: BreakingNewsMonitorEvents[K],
) => void;

// ─── Breaking News Monitor ─────────────────────────────────────────────────

export class BreakingNewsMonitor {
  private ws: WebSocket | null = null;
  private connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 15;
  private reconnectDelayMs = 2000;
  private currentEditorId: string | null = null;

  private knownStoryIds = new Set<string>();
  private knownStatuses = new Map<string, string>();
  private knownSlugs = new Map<string, string>();
  private alerts: BreakingNewsAlert[] = [];

  private listeners: Partial<{
    [K in keyof BreakingNewsMonitorEvents]: Set<BreakingNewsEventHandler<K>>;
  }> = {};

  constructor(private connection?: NRCSConnection) {}

  // ─── Event System ────────────────────────────────────────────────────

  on<K extends keyof BreakingNewsMonitorEvents>(
    event: K,
    handler: BreakingNewsEventHandler<K>,
  ): void {
    if (!this.listeners[event]) {
      (this.listeners as Record<string, Set<unknown>>)[event] = new Set();
    }
    (this.listeners[event] as Set<BreakingNewsEventHandler<K>>).add(handler);
  }

  off<K extends keyof BreakingNewsMonitorEvents>(
    event: K,
    handler: BreakingNewsEventHandler<K>,
  ): void {
    const set = this.listeners[event] as Set<BreakingNewsEventHandler<K>> | undefined;
    set?.delete(handler);
  }

  private emit<K extends keyof BreakingNewsMonitorEvents>(
    event: K,
    data: BreakingNewsMonitorEvents[K],
  ): void {
    const set = this.listeners[event] as Set<BreakingNewsEventHandler<K>> | undefined;
    if (set) {
      for (const handler of set) {
        try {
          handler(data);
        } catch (err) {
          console.error(`[BreakingNewsMonitor] Handler error for ${String(event)}:`, err);
        }
      }
    }
  }

  // ─── Connection ──────────────────────────────────────────────────────

  start(connection?: NRCSConnection, editorId?: string): void {
    if (connection) {
      this.connection = connection;
    }
    if (editorId) {
      this.currentEditorId = editorId;
    }
    if (!this.connection) {
      throw new Error('BreakingNewsMonitor: No NRCS connection configured');
    }

    this.connectWebSocket();
  }

  stop(): void {
    this.clearReconnect();
    if (this.ws) {
      this.ws.close(1000, 'Monitor stopped');
      this.ws = null;
    }
    this.connected = false;
  }

  isActive(): boolean {
    return this.connected;
  }

  getAlerts(): BreakingNewsAlert[] {
    return [...this.alerts];
  }

  getUnacknowledgedAlerts(): BreakingNewsAlert[] {
    return this.alerts.filter((a) => !a.acknowledged);
  }

  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  acknowledgeAll(): void {
    for (const alert of this.alerts) {
      alert.acknowledged = true;
    }
  }

  clearAlerts(): void {
    this.alerts = [];
  }

  // ─── Rundown Diff Processing ─────────────────────────────────────────

  processRundownUpdate(rundown: RundownState): void {
    for (const story of rundown.stories) {
      this.processStory(story);
    }

    // Detect pulled/removed stories
    const currentIds = new Set(rundown.stories.map((s) => s.storyId));
    for (const knownId of this.knownStoryIds) {
      if (!currentIds.has(knownId)) {
        // Story was removed from rundown
        const slug = this.knownSlugs.get(knownId) ?? 'Unknown';
        this.emit('story:pulled', {
          id: knownId,
          storyId: knownId,
          slugline: slug,
          scriptText: '',
          targetDuration: 0,
          mediaItems: [],
          status: 'KILLED',
          sortOrder: -1,
          lastModifiedAt: new Date().toISOString(),
        });
        this.knownStoryIds.delete(knownId);
        this.knownStatuses.delete(knownId);
        this.knownSlugs.delete(knownId);
      }
    }
  }

  processStory(story: RundownEvent): void {
    const isNew = !this.knownStoryIds.has(story.storyId);
    const previousStatus = this.knownStatuses.get(story.storyId);
    const previousSlug = this.knownSlugs.get(story.storyId);

    // Track state
    this.knownStoryIds.add(story.storyId);
    this.knownStatuses.set(story.storyId, story.status);
    this.knownSlugs.set(story.storyId, story.slugline);

    // Check for breaking/urgent priority
    const priority = detectPriority(story.slugline);
    const wasBreaking = previousSlug ? detectPriority(previousSlug) !== 'NORMAL' : false;

    if (priority !== 'NORMAL' && (isNew || !wasBreaking || previousSlug !== story.slugline)) {
      const alert = createBreakingAlert(story, priority);
      this.alerts.unshift(alert);

      switch (priority) {
        case 'BREAKING':
          this.emit('alert:breaking', alert);
          break;
        case 'URGENT':
          this.emit('alert:urgent', alert);
          break;
        case 'BULLETIN':
          this.emit('alert:bulletin', alert);
          break;
      }
    }

    // Check for story killed
    if (story.status === 'KILLED' && previousStatus !== 'KILLED') {
      this.emit('story:killed', story);
    }

    // Check for new assignment to current editor
    if (
      this.currentEditorId &&
      story.assignedEditorId === this.currentEditorId &&
      isNew
    ) {
      this.emit('story:assigned', story);
    }
  }

  // ─── Internal ────────────────────────────────────────────────────────

  private connectWebSocket(): void {
    if (!this.connection) return;

    const protocol = this.connection.type === 'ENPS' ? 'mos' : 'nrcs';
    const url = `wss://${this.connection.host}:${this.connection.port}/${protocol}/alerts`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.emit('connection:restored', undefined as unknown as void);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data)) as Record<string, unknown>;
        if (data['type'] === 'rundown_update' && data['rundown']) {
          this.processRundownUpdate(data['rundown'] as RundownState);
        } else if (data['type'] === 'story_update' && data['story']) {
          this.processStory(data['story'] as RundownEvent);
        }
      } catch {
        // Ignore parse errors on the alert channel
      }
    };

    this.ws.onerror = () => {
      // Will be followed by onclose
    };

    this.ws.onclose = () => {
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) {
        this.emit('connection:lost', undefined as unknown as void);
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

    this.reconnectAttempts += 1;
    const delay = this.reconnectDelayMs * Math.min(this.reconnectAttempts, 5);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  destroy(): void {
    this.stop();
    this.alerts = [];
    this.knownStoryIds.clear();
    this.knownStatuses.clear();
    this.knownSlugs.clear();
    this.listeners = {};
  }
}
