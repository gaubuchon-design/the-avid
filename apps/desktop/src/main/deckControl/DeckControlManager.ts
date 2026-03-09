// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Deck Control Manager
// ═══════════════════════════════════════════════════════════════════════════
//
// Manages connections to professional VTRs via Sony 9-pin protocol.
// Supports multi-deck connections and capture-from-deck workflows
// that coordinate VTR transport with DeckLink/AJA video capture.
//
// ═══════════════════════════════════════════════════════════════════════════

import { ipcMain, type BrowserWindow } from 'electron';
import { Sony9Pin } from './Sony9Pin';
import type {
  DeckCaptureConfig,
  DeckCaptureStatus,
  DeckPort,
  DeckStatus,
  DeckTimecode,
} from './types';

interface ConnectedDeck {
  id: string;
  portPath: string;
  protocol: Sony9Pin;
  unsubscribeTC: (() => void) | null;
  unsubscribeStatus: (() => void) | null;
}

export class DeckControlManager {
  private decks = new Map<string, ConnectedDeck>();
  private mainWindow: BrowserWindow | null = null;
  private moduleAvailable = false;
  private captureStatus: DeckCaptureStatus = {
    state: 'idle',
    currentTimecode: { hours: 0, minutes: 0, seconds: 0, frames: 0, dropFrame: false },
    framesRecorded: 0,
  };

  /**
   * Initialize deck control subsystem.
   */
  async init(mainWindow: BrowserWindow): Promise<boolean> {
    this.mainWindow = mainWindow;

    // Test if serialport module is available
    const testProto = new Sony9Pin();
    this.moduleAvailable = await testProto.loadModule();

    console.log(
      `[DeckControl] Initialized — Serial port: ${this.moduleAvailable ? 'available' : 'not available'}`,
    );

    return this.moduleAvailable;
  }

  get isAvailable(): boolean {
    return this.moduleAvailable;
  }

  /**
   * List available serial ports.
   */
  async listPorts(): Promise<DeckPort[]> {
    if (!this.moduleAvailable) return [];

    const proto = new Sony9Pin();
    await proto.loadModule();
    return proto.listPorts();
  }

  /**
   * Connect to a VTR on the specified serial port.
   */
  async connect(portPath: string): Promise<{ ok: boolean; deckId?: string; error?: string }> {
    // Check if already connected to this port
    for (const deck of this.decks.values()) {
      if (deck.portPath === portPath) {
        return { ok: true, deckId: deck.id };
      }
    }

    try {
      const protocol = new Sony9Pin();
      await protocol.loadModule();
      await protocol.connect(portPath);

      const deckId = `deck-${portPath.replace(/[^a-zA-Z0-9]/g, '-')}`;
      const deck: ConnectedDeck = {
        id: deckId,
        portPath,
        protocol,
        unsubscribeTC: null,
        unsubscribeStatus: null,
      };

      // Wire up event forwarding to renderer
      deck.unsubscribeTC = protocol.onTimecodeUpdate((tc) => {
        this.mainWindow?.webContents.send('deck:timecode-update', { deckId, timecode: tc });
      });

      deck.unsubscribeStatus = protocol.onStatusChange((status) => {
        this.mainWindow?.webContents.send('deck:status-update', { deckId, status });
      });

      this.decks.set(deckId, deck);

      // Start timecode polling
      protocol.startPolling(33); // ~30fps

      return { ok: true, deckId };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Disconnect a VTR.
   */
  async disconnect(deckId: string): Promise<{ ok: boolean; error?: string }> {
    const deck = this.decks.get(deckId);
    if (!deck) return { ok: false, error: `Unknown deck: ${deckId}` };

    try {
      deck.unsubscribeTC?.();
      deck.unsubscribeStatus?.();
      await deck.protocol.disconnect();
      this.decks.delete(deckId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Send a transport command to a deck.
   */
  async sendCommand(
    deckId: string,
    command: 'play' | 'stop' | 'record' | 'ff' | 'rew' | 'pause' | 'eject',
  ): Promise<{ ok: boolean; error?: string }> {
    const deck = this.getDeck(deckId);
    if (!deck) return { ok: false, error: `Unknown deck: ${deckId}` };

    try {
      switch (command) {
        case 'play':   await deck.protocol.play(); break;
        case 'stop':   await deck.protocol.stop(); break;
        case 'record': await deck.protocol.record(); break;
        case 'ff':     await deck.protocol.fastForward(); break;
        case 'rew':    await deck.protocol.rewind(); break;
        case 'pause':  await deck.protocol.pause(); break;
        case 'eject':  await deck.protocol.eject(); break;
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Jog the deck at a given speed.
   */
  async jog(deckId: string, speed: number): Promise<{ ok: boolean; error?: string }> {
    const deck = this.getDeck(deckId);
    if (!deck) return { ok: false, error: `Unknown deck: ${deckId}` };

    try {
      await deck.protocol.jog(speed);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Shuttle the deck at a given speed.
   */
  async shuttle(deckId: string, speed: number): Promise<{ ok: boolean; error?: string }> {
    const deck = this.getDeck(deckId);
    if (!deck) return { ok: false, error: `Unknown deck: ${deckId}` };

    try {
      await deck.protocol.shuttle(speed);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Request current timecode from a deck.
   */
  async getTimecode(deckId: string): Promise<{ ok: boolean; data?: DeckTimecode; error?: string }> {
    const deck = this.getDeck(deckId);
    if (!deck) return { ok: false, error: `Unknown deck: ${deckId}` };

    try {
      const tc = await deck.protocol.requestTimecode();
      return { ok: true, data: tc };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Cue deck to a specific timecode.
   */
  async goToTimecode(deckId: string, tc: DeckTimecode): Promise<{ ok: boolean; error?: string }> {
    const deck = this.getDeck(deckId);
    if (!deck) return { ok: false, error: `Unknown deck: ${deckId}` };

    try {
      await deck.protocol.goToTimecode(tc);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Get status of all connected decks.
   */
  getConnectedDecks(): Array<{ id: string; portPath: string; connected: boolean }> {
    return [...this.decks.values()].map((d) => ({
      id: d.id,
      portPath: d.portPath,
      connected: d.protocol.isConnected,
    }));
  }

  /**
   * Register all IPC handlers for deck control.
   */
  registerIPCHandlers(): void {
    ipcMain.handle('deck:available', () => ({
      ok: true,
      data: this.moduleAvailable,
    }));

    ipcMain.handle('deck:list-ports', async () => {
      try {
        const ports = await this.listPorts();
        return { ok: true, data: ports };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    });

    ipcMain.handle('deck:connect', async (_e, portPath: string) => {
      return this.connect(portPath);
    });

    ipcMain.handle('deck:disconnect', async (_e, deckId: string) => {
      return this.disconnect(deckId);
    });

    ipcMain.handle('deck:command', async (
      _e,
      deckId: string,
      command: 'play' | 'stop' | 'record' | 'ff' | 'rew' | 'pause' | 'eject',
    ) => {
      return this.sendCommand(deckId, command);
    });

    ipcMain.handle('deck:jog', async (_e, deckId: string, speed: number) => {
      return this.jog(deckId, speed);
    });

    ipcMain.handle('deck:shuttle', async (_e, deckId: string, speed: number) => {
      return this.shuttle(deckId, speed);
    });

    ipcMain.handle('deck:timecode', async (_e, deckId: string) => {
      return this.getTimecode(deckId);
    });

    ipcMain.handle('deck:go-to-tc', async (_e, deckId: string, tc: DeckTimecode) => {
      return this.goToTimecode(deckId, tc);
    });

    ipcMain.handle('deck:connected-decks', () => ({
      ok: true,
      data: this.getConnectedDecks(),
    }));
  }

  /**
   * Clean up all connections.
   */
  async dispose(): Promise<void> {
    const ids = [...this.decks.keys()];
    await Promise.allSettled(ids.map((id) => this.disconnect(id)));
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private getDeck(deckId: string): ConnectedDeck | undefined {
    return this.decks.get(deckId);
  }
}
