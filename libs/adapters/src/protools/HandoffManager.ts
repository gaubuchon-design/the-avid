/**
 * @fileoverview Manages the bi-directional AAF/OMF round-trip handoff
 * between Media Composer and Pro Tools.
 *
 * {@link HandoffManager} tracks every handoff in both directions, records
 * history, and exposes helpers for querying pending transfers.  In
 * production the actual file transfer would happen via a bridge daemon;
 * here we simulate it with small delays and realistic metadata.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Direction of a handoff. */
export type HandoffDirection = 'mc-to-pt' | 'pt-to-mc';

/** Status of an individual handoff operation. */
export type HandoffStatus = 'pending' | 'in-progress' | 'completed' | 'failed';

/** A record of a single handoff event. */
export interface HandoffHistoryEntry {
  /** Unique handoff identifier. */
  readonly id: string;
  /** Direction of transfer. */
  readonly direction: HandoffDirection;
  /** Current status. */
  readonly status: HandoffStatus;
  /** Sequence or session ID that was sent. */
  readonly sourceId: string;
  /** Resulting session or sequence ID on the receiving side. */
  readonly resultId?: string;
  /** Number of tracks transferred. */
  readonly trackCount: number;
  /** Number of clips / regions transferred. */
  readonly clipCount: number;
  /** Non-fatal warnings generated during the transfer. */
  readonly warnings: readonly string[];
  /** ISO-8601 timestamp of when the handoff was initiated. */
  readonly initiatedAt: string;
  /** ISO-8601 timestamp of when the handoff completed (if it has). */
  readonly completedAt?: string;
}

/** Result object returned from handoff operations. */
export interface HandoffResult {
  /** Whether the handoff completed without errors. */
  readonly success: boolean;
  /** The full history entry for the completed handoff. */
  readonly entry: HandoffHistoryEntry;
}

import { InvalidArgumentError } from '../AdapterError';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _handoffSeq = 0;

function nextHandoffId(): string {
  return `handoff_${Date.now()}_${++_handoffSeq}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// HandoffManager
// ---------------------------------------------------------------------------

/**
 * Manages the Media Composer <-> Pro Tools round-trip workflow.
 *
 * @example
 * ```ts
 * const mgr = new HandoffManager();
 * const { entry } = await mgr.handoffToProTools('seq_001', ['A1', 'A2']);
 * // ... Pro Tools work happens ...
 * const { entry: back } = await mgr.receiveFromProTools(entry.resultId!);
 * ```
 */
export class HandoffManager {
  private readonly history: HandoffHistoryEntry[] = [];

  /**
   * Push a Media Composer sequence into Pro Tools via AAF/OMF.
   *
   * @param sequenceId - The MC sequence identifier.
   * @param tracks     - Track IDs to include in the handoff.
   * @returns A {@link HandoffResult} describing the completed transfer.
   */
  async handoffToProTools(
    sequenceId: string,
    tracks: string[],
  ): Promise<HandoffResult> {
    if (tracks.length === 0) {
      throw new InvalidArgumentError('pro-tools', 'tracks', 'At least one track is required for handoff.');
    }

    const id = nextHandoffId();
    const initiatedAt = isoNow();

    // Record a pending entry.
    const pending: HandoffHistoryEntry = {
      id,
      direction: 'mc-to-pt',
      status: 'in-progress',
      sourceId: sequenceId,
      trackCount: tracks.length,
      clipCount: 0,
      warnings: [],
      initiatedAt,
    };
    this.history.push(pending);

    // Simulate transfer delay.
    await new Promise<void>((resolve) =>
      setTimeout(resolve, 300 + tracks.length * 50),
    );

    const clipCount = tracks.length * 3 + Math.floor(Math.random() * 5);
    const resultId = `ptsession_${Date.now()}`;

    const completed: HandoffHistoryEntry = {
      ...pending,
      status: 'completed',
      resultId,
      clipCount,
      completedAt: isoNow(),
    };

    // Replace the pending entry.
    const idx = this.history.findIndex((e) => e.id === id);
    if (idx >= 0) this.history[idx] = completed;

    return { success: true, entry: completed };
  }

  /**
   * Pull completed audio work from a Pro Tools session back into
   * Media Composer.
   *
   * @param sessionId - The Pro Tools session to receive from.
   * @returns A {@link HandoffResult} describing the completed transfer.
   */
  async receiveFromProTools(sessionId: string): Promise<HandoffResult> {
    const id = nextHandoffId();
    const initiatedAt = isoNow();

    const pending: HandoffHistoryEntry = {
      id,
      direction: 'pt-to-mc',
      status: 'in-progress',
      sourceId: sessionId,
      trackCount: 0,
      clipCount: 0,
      warnings: [],
      initiatedAt,
    };
    this.history.push(pending);

    // Simulate transfer delay.
    await new Promise<void>((resolve) =>
      setTimeout(resolve, 400 + Math.random() * 300),
    );

    const trackCount = 4 + Math.floor(Math.random() * 8);
    const clipCount = 8 + Math.floor(Math.random() * 12);
    const resultId = `seq_from_pt_${Date.now()}`;

    const completed: HandoffHistoryEntry = {
      ...pending,
      status: 'completed',
      resultId,
      trackCount,
      clipCount,
      completedAt: isoNow(),
    };

    const idx = this.history.findIndex((e) => e.id === id);
    if (idx >= 0) this.history[idx] = completed;

    return { success: true, entry: completed };
  }

  /**
   * Return the full handoff history, newest first.
   */
  getHandoffHistory(): HandoffHistoryEntry[] {
    return [...this.history].reverse();
  }

  /**
   * Return only handoffs that are still pending or in-progress.
   */
  getPendingHandoffs(): HandoffHistoryEntry[] {
    return this.history.filter(
      (e) => e.status === 'pending' || e.status === 'in-progress',
    );
  }
}
