// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — MOS Protocol Adapter (N-03)
//  MOS 2.8.5 protocol implementation for newsroom automation.
//  Handles running order manipulation messages and readyToAir flow.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  MOSMessage,
  MOSMessageType,
  MOSRunningOrder,
  MOSStory,
  MOSItem,
  RundownEvent,
  RundownMediaItem,
  RundownState,
} from './types';

// ─── MOS XML Builder ───────────────────────────────────────────────────────

function buildMOSEnvelope(mosId: string, ncsId: string, body: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<mos>',
    `  <mosID>${escapeXml(mosId)}</mosID>`,
    `  <ncsID>${escapeXml(ncsId)}</ncsID>`,
    `  <messageID>${Date.now()}</messageID>`,
    body,
    '</mos>',
  ].join('\n');
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── MOS Message Handlers ──────────────────────────────────────────────────

export type MOSMessageHandler = (message: MOSMessage) => void;

interface MOSHandlerMap {
  roStoryInsert: (roId: string, story: MOSStory, afterStoryId?: string) => void;
  roStoryReplace: (roId: string, story: MOSStory) => void;
  roStoryDelete: (roId: string, storyIds: string[]) => void;
  roStoryMove: (roId: string, storyId: string, afterStoryId?: string) => void;
  roStorySwap: (roId: string, storyIdA: string, storyIdB: string) => void;
  roItemInsert: (roId: string, storyId: string, item: MOSItem, afterItemId?: string) => void;
  roItemReplace: (roId: string, storyId: string, item: MOSItem) => void;
  roItemDelete: (roId: string, storyId: string, itemIds: string[]) => void;
  roReadyToAir: (roId: string, storyId: string) => void;
  roCreate: (runningOrder: MOSRunningOrder) => void;
  roReplace: (runningOrder: MOSRunningOrder) => void;
  roDelete: (roId: string) => void;
  roMetadataReplace: (roId: string, metadata: Record<string, unknown>) => void;
  heartbeat: () => void;
  roAck: (roId: string, status: string) => void;
}

// ─── MOS Adapter ───────────────────────────────────────────────────────────

export class MOSAdapter {
  private ws: WebSocket | null = null;
  private mosId: string;
  private ncsId: string;
  private host: string;
  private port: number;
  private connected = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private handlers: Partial<MOSHandlerMap> = {};
  private rawHandlers = new Set<MOSMessageHandler>();
  private runningOrders = new Map<string, MOSRunningOrder>();

  constructor(config: { mosId: string; ncsId: string; host: string; port: number }) {
    this.mosId = config.mosId;
    this.ncsId = config.ncsId;
    this.host = config.host;
    this.port = config.port;
  }

  // ─── Connection ────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `wss://${this.host}:${this.port}/mos/2.8.5`;

      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        reject(new Error(`MOS WebSocket creation failed: ${(err as Error).message}`));
        return;
      }

      this.ws.onopen = () => {
        this.connected = true;
        this.sendHandshake();
        this.startHeartbeat();
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(String(event.data));
      };

      this.ws.onerror = () => {
        this.connected = false;
        reject(new Error('MOS WebSocket connection failed'));
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.stopHeartbeat();
      };
    });
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, 'MOS adapter shutdown');
      this.ws = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ─── Handler Registration ──────────────────────────────────────────────

  onMessage(handler: MOSMessageHandler): void {
    this.rawHandlers.add(handler);
  }

  offMessage(handler: MOSMessageHandler): void {
    this.rawHandlers.delete(handler);
  }

  on<K extends keyof MOSHandlerMap>(event: K, handler: MOSHandlerMap[K]): void {
    (this.handlers as Record<string, unknown>)[event] = handler;
  }

  off<K extends keyof MOSHandlerMap>(event: K): void {
    delete this.handlers[event];
  }

  // ─── Outbound MOS Messages ────────────────────────────────────────────

  sendReadyToAir(roId: string, storyId: string): void {
    const body = [
      '  <roReadyToAir>',
      `    <roID>${escapeXml(roId)}</roID>`,
      '    <roAir>READY</roAir>',
      `    <storyID>${escapeXml(storyId)}</storyID>`,
      '  </roReadyToAir>',
    ].join('\n');

    this.send(buildMOSEnvelope(this.mosId, this.ncsId, body));
  }

  sendAck(roId: string, status: 'ACK' | 'NACK' = 'ACK'): void {
    const body = [
      '  <roAck>',
      `    <roID>${escapeXml(roId)}</roID>`,
      `    <roStatus>${status}</roStatus>`,
      '  </roAck>',
    ].join('\n');

    this.send(buildMOSEnvelope(this.mosId, this.ncsId, body));
  }

  sendStoryStatus(roId: string, storyId: string, status: string): void {
    const body = [
      '  <roElementStat>',
      `    <roID>${escapeXml(roId)}</roID>`,
      `    <storyID>${escapeXml(storyId)}</storyID>`,
      `    <status>${escapeXml(status)}</status>`,
      '  </roElementStat>',
    ].join('\n');

    this.send(buildMOSEnvelope(this.mosId, this.ncsId, body));
  }

  requestRunningOrderList(): void {
    const body = '  <roReqAll/>';
    this.send(buildMOSEnvelope(this.mosId, this.ncsId, body));
  }

  // ─── Running Order Queries ────────────────────────────────────────────

  getRunningOrder(roId: string): MOSRunningOrder | undefined {
    return this.runningOrders.get(roId);
  }

  getAllRunningOrders(): MOSRunningOrder[] {
    return Array.from(this.runningOrders.values());
  }

  // ─── MOS -> RundownEvent Conversion ───────────────────────────────────

  static mosStoryToRundownEvent(mosStory: MOSStory, sortOrder: number): RundownEvent {
    const mediaItems: RundownMediaItem[] = mosStory.items.map((item) => ({
      id: item.itemId,
      slug: item.itemSlug,
      type: 'VIDEO',
      duration: item.objDur && item.objTB ? item.objDur / item.objTB : 0,
      status: 'AVAILABLE',
      mosObjId: item.objId,
    }));

    const totalDuration = mediaItems.reduce((sum, mi) => sum + mi.duration, 0);

    return {
      id: mosStory.storyId,
      storyId: mosStory.storyId,
      slugline: mosStory.storySlug,
      scriptText: '',
      targetDuration: totalDuration,
      mediaItems,
      status: 'UNASSIGNED',
      sortOrder,
      pageNumber: mosStory.storyNum,
      lastModifiedAt: new Date().toISOString(),
    };
  }

  static mosRunningOrderToRundownState(mosRo: MOSRunningOrder): RundownState {
    return {
      id: mosRo.roId,
      name: mosRo.roSlug,
      showDate: mosRo.roEdStart ?? new Date().toISOString().slice(0, 10),
      stories: mosRo.stories.map((story, index) =>
        MOSAdapter.mosStoryToRundownEvent(story, index),
      ),
      activeStoryId: null,
      lastSyncAt: new Date().toISOString(),
    };
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private handleMessage(raw: string): void {
    const message = this.parseMOSMessage(raw);
    if (!message) return;

    // Notify raw handlers
    for (const handler of this.rawHandlers) {
      try {
        handler(message);
      } catch (err) {
        console.error('[MOSAdapter] Raw handler error:', err);
      }
    }

    // Route to typed handlers
    this.routeMessage(message);
  }

  private routeMessage(message: MOSMessage): void {
    const { type, roId, payload } = message;

    switch (type) {
      case 'roCreate': {
        const ro = payload as unknown as MOSRunningOrder;
        this.runningOrders.set(roId, ro);
        this.handlers.roCreate?.(ro);
        break;
      }
      case 'roReplace': {
        const ro = payload as unknown as MOSRunningOrder;
        this.runningOrders.set(roId, ro);
        this.handlers.roReplace?.(ro);
        break;
      }
      case 'roDelete': {
        this.runningOrders.delete(roId);
        this.handlers.roDelete?.(roId);
        break;
      }
      case 'roMetadataReplace': {
        this.handlers.roMetadataReplace?.(roId, payload);
        break;
      }
      case 'roStoryInsert': {
        const story = payload['story'] as MOSStory;
        const afterStoryId = payload['afterStoryId'] as string | undefined;
        this.applyStoryInsert(roId, story, afterStoryId);
        this.handlers.roStoryInsert?.(roId, story, afterStoryId);
        break;
      }
      case 'roStoryReplace': {
        const story = payload['story'] as MOSStory;
        this.applyStoryReplace(roId, story);
        this.handlers.roStoryReplace?.(roId, story);
        break;
      }
      case 'roStoryDelete': {
        const storyIds = payload['storyIds'] as string[];
        this.applyStoryDelete(roId, storyIds);
        this.handlers.roStoryDelete?.(roId, storyIds);
        break;
      }
      case 'roStoryMove': {
        const storyId = payload['storyId'] as string;
        const afterStoryId = payload['afterStoryId'] as string | undefined;
        this.applyStoryMove(roId, storyId, afterStoryId);
        this.handlers.roStoryMove?.(roId, storyId, afterStoryId);
        break;
      }
      case 'roStorySwap': {
        const idA = payload['storyIdA'] as string;
        const idB = payload['storyIdB'] as string;
        this.applyStorySwap(roId, idA, idB);
        this.handlers.roStorySwap?.(roId, idA, idB);
        break;
      }
      case 'roItemInsert': {
        const storyId = payload['storyId'] as string;
        const item = payload['item'] as MOSItem;
        const afterItemId = payload['afterItemId'] as string | undefined;
        this.handlers.roItemInsert?.(roId, storyId, item, afterItemId);
        break;
      }
      case 'roItemReplace': {
        const storyId = payload['storyId'] as string;
        const item = payload['item'] as MOSItem;
        this.handlers.roItemReplace?.(roId, storyId, item);
        break;
      }
      case 'roItemDelete': {
        const storyId = payload['storyId'] as string;
        const itemIds = payload['itemIds'] as string[];
        this.handlers.roItemDelete?.(roId, storyId, itemIds);
        break;
      }
      case 'roReadyToAir': {
        const storyId = payload['storyId'] as string;
        this.handlers.roReadyToAir?.(roId, storyId);
        break;
      }
      case 'roAck': {
        const status = payload['status'] as string;
        this.handlers.roAck?.(roId, status);
        break;
      }
      case 'heartbeat': {
        this.handlers.heartbeat?.();
        break;
      }
    }
  }

  // ─── Running Order Mutations ──────────────────────────────────────────

  private applyStoryInsert(roId: string, story: MOSStory, afterStoryId?: string): void {
    const ro = this.runningOrders.get(roId);
    if (!ro) return;

    if (!afterStoryId) {
      ro.stories.unshift(story);
    } else {
      const idx = ro.stories.findIndex((s) => s.storyId === afterStoryId);
      if (idx >= 0) {
        ro.stories.splice(idx + 1, 0, story);
      } else {
        ro.stories.push(story);
      }
    }
  }

  private applyStoryReplace(roId: string, story: MOSStory): void {
    const ro = this.runningOrders.get(roId);
    if (!ro) return;

    const idx = ro.stories.findIndex((s) => s.storyId === story.storyId);
    if (idx >= 0) {
      ro.stories[idx] = story;
    }
  }

  private applyStoryDelete(roId: string, storyIds: string[]): void {
    const ro = this.runningOrders.get(roId);
    if (!ro) return;

    const deleteSet = new Set(storyIds);
    ro.stories = ro.stories.filter((s) => !deleteSet.has(s.storyId));
  }

  private applyStoryMove(roId: string, storyId: string, afterStoryId?: string): void {
    const ro = this.runningOrders.get(roId);
    if (!ro) return;

    const idx = ro.stories.findIndex((s) => s.storyId === storyId);
    if (idx < 0) return;

    const [story] = ro.stories.splice(idx, 1);
    if (!story) return;
    if (!afterStoryId) {
      ro.stories.unshift(story);
    } else {
      const targetIdx = ro.stories.findIndex((s) => s.storyId === afterStoryId);
      if (targetIdx >= 0) {
        ro.stories.splice(targetIdx + 1, 0, story);
      } else {
        ro.stories.push(story);
      }
    }
  }

  private applyStorySwap(roId: string, idA: string, idB: string): void {
    const ro = this.runningOrders.get(roId);
    if (!ro) return;

    const idxA = ro.stories.findIndex((s) => s.storyId === idA);
    const idxB = ro.stories.findIndex((s) => s.storyId === idB);
    if (idxA >= 0 && idxB >= 0) {
      [ro.stories[idxA]!, ro.stories[idxB]!] = [ro.stories[idxB]!, ro.stories[idxA]!];
    }
  }

  // ─── Internal Helpers ─────────────────────────────────────────────────

  private parseMOSMessage(raw: string): MOSMessage | null {
    try {
      // Try JSON-based MOS messages first (modern implementations)
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        messageId: String(parsed['messageId'] ?? Date.now()),
        type: parsed['type'] as MOSMessageType,
        roId: String(parsed['roId'] ?? ''),
        payload: (parsed['payload'] as Record<string, unknown>) ?? parsed,
        timestamp: String(parsed['timestamp'] ?? new Date().toISOString()),
        ncsId: String(parsed['ncsId'] ?? this.ncsId),
        mosId: String(parsed['mosId'] ?? this.mosId),
      };
    } catch {
      // Fallback: try to extract from XML
      return this.parseMOSXML(raw);
    }
  }

  private parseMOSXML(xml: string): MOSMessage | null {
    // Lightweight XML extraction for key MOS fields
    const typeMatch = xml.match(/<(ro\w+)[\s>]/);
    if (!typeMatch) return null;

    const type = typeMatch[1] as MOSMessageType;
    const roIdMatch = xml.match(/<roID>([^<]+)<\/roID>/);
    const roId = roIdMatch?.[1] ?? '';

    return {
      messageId: String(Date.now()),
      type,
      roId,
      payload: { rawXml: xml },
      timestamp: new Date().toISOString(),
      ncsId: this.ncsId,
      mosId: this.mosId,
    };
  }

  private sendHandshake(): void {
    const body = [
      '  <reqMachInfo/>',
    ].join('\n');

    this.send(buildMOSEnvelope(this.mosId, this.ncsId, body));
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const body = '  <heartbeat/>';
      this.send(buildMOSEnvelope(this.mosId, this.ncsId, body));
    }, 10_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private send(data: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }
}
