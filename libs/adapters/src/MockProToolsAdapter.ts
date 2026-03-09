/**
 * @fileoverview In-memory mock of {@link IProToolsAdapter}.
 *
 * Simulates async audio processing with realistic delays via `setTimeout`
 * and returns plausible {@link AudioProcessResult} with fake but
 * broadcast-realistic metrics.
 */

import type {
  AudioMetrics,
  AudioProcessResult,
  DialogueCleanupParams,
  ExportResult,
  HandoffResult,
  IProToolsAdapter,
  SessionInfo,
  TempMusicOptions,
} from './IProToolsAdapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _nextId = 5000;
function nextId(prefix: string): string {
  return `${prefix}_${++_nextId}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

/** Simulate an async delay (default 300-800 ms). */
function simulateDelay(minMs = 300, maxMs = 800): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Generate plausible post-processing audio metrics. */
function generateMetrics(targetLUFS?: number): AudioMetrics {
  const lufs = targetLUFS ?? -24 + Math.random() * 2 - 1; // +-1 LU jitter
  return {
    peakLevel: -1.5 - Math.random() * 2,
    rmsLevel: -18 - Math.random() * 4,
    integratedLUFS: Math.round(lufs * 10) / 10,
    loudnessRange: 6 + Math.round(Math.random() * 8),
    truePeak: -0.5 - Math.random(),
  };
}

// ---------------------------------------------------------------------------
// Mock adapter
// ---------------------------------------------------------------------------

/**
 * In-memory mock of {@link IProToolsAdapter}.
 *
 * Each processing method introduces a small artificial delay to mimic the
 * latency of real Pro Tools operations.  Metrics are randomised within
 * broadcast-realistic ranges.
 */
export class MockProToolsAdapter implements IProToolsAdapter {
  private currentSession: SessionInfo | null = null;
  private handoffHistory: HandoffResult[] = [];

  // -----------------------------------------------------------------------
  // Session management
  // -----------------------------------------------------------------------

  async openSession(sessionPath: string): Promise<SessionInfo> {
    await simulateDelay(200, 500);

    const name = sessionPath.split('/').pop()?.replace(/\.ptx?$/, '') ?? 'Untitled';

    this.currentSession = {
      sessionId: nextId('ptsession'),
      name,
      sessionPath,
      sampleRate: 48000,
      bitDepth: 24,
      trackCount: 24,
      duration: 600,
      lastSavedAt: isoNow(),
    };

    return { ...this.currentSession };
  }

  async getSessionInfo(): Promise<SessionInfo> {
    if (!this.currentSession) {
      throw new Error('No Pro Tools session is currently open.');
    }
    return { ...this.currentSession };
  }

  // -----------------------------------------------------------------------
  // Audio processing
  // -----------------------------------------------------------------------

  async runDialogueCleanup(
    trackIds: string[],
    params: DialogueCleanupParams,
  ): Promise<AudioProcessResult> {
    this.ensureSession();

    // Simulate processing time proportional to track count
    const delayMs = 400 + trackIds.length * 150;
    await simulateDelay(delayMs, delayMs + 300);

    const warnings: string[] = [];
    if (params.aggressiveness > 0.8) {
      warnings.push(
        'High aggressiveness may introduce artefacts on sibilant-heavy dialogue.',
      );
    }

    return {
      success: true,
      processedTrackIds: [...trackIds],
      processingTimeMs: delayMs + Math.round(Math.random() * 200),
      metrics: {
        ...generateMetrics(-24),
        // Override noise floor to reflect cleanup
        rmsLevel: params.noiseFloor + 5 + Math.random() * 3,
      },
      warnings,
    };
  }

  async runLoudnessPrep(
    trackIds: string[],
    targetLUFS: number,
  ): Promise<AudioProcessResult> {
    this.ensureSession();

    const delayMs = 300 + trackIds.length * 120;
    await simulateDelay(delayMs, delayMs + 200);

    const warnings: string[] = [];
    if (targetLUFS > -16) {
      warnings.push(
        `Target ${targetLUFS} LUFS is above typical broadcast specs (-24 LUFS).`,
      );
    }

    return {
      success: true,
      processedTrackIds: [...trackIds],
      processingTimeMs: delayMs + Math.round(Math.random() * 150),
      metrics: generateMetrics(targetLUFS),
      warnings,
    };
  }

  async placeTempMusic(
    options: TempMusicOptions,
  ): Promise<AudioProcessResult> {
    this.ensureSession();

    // Simulate library search + placement
    await simulateDelay(500, 1200);

    const warnings: string[] = [];
    if (options.duration > 300) {
      warnings.push('Long music beds may loop. Review transition points.');
    }

    return {
      success: true,
      processedTrackIds: options.targetTrackId
        ? [options.targetTrackId]
        : ['track_a3_music'],
      processingTimeMs: 800 + Math.round(Math.random() * 400),
      metrics: generateMetrics(options.targetLUFS),
      warnings,
    };
  }

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------

  async exportMix(
    format: string,
    _params: Record<string, unknown>,
  ): Promise<ExportResult> {
    this.ensureSession();

    await simulateDelay(600, 1500);

    const session = this.currentSession!;
    const ext = format.toLowerCase() === 'aiff' ? 'aif' : format.toLowerCase();

    return {
      success: true,
      outputUri: `/exports/${session.name}_mix.${ext}`,
      format,
      fileSizeBytes:
        session.duration * session.sampleRate * (session.bitDepth / 8) * 2, // stereo
      duration: session.duration,
    };
  }

  // -----------------------------------------------------------------------
  // Handoff
  // -----------------------------------------------------------------------

  async handoffToProTools(
    sequenceId: string,
    tracks: string[],
  ): Promise<HandoffResult> {
    await simulateDelay(800, 2000);

    // Simulate opening a fresh session if none is open
    if (!this.currentSession) {
      await this.openSession(`/sessions/${sequenceId}_audio.ptx`);
    }

    const result: HandoffResult = {
      success: true,
      resultId: this.currentSession!.sessionId,
      trackCount: tracks.length,
      clipCount: tracks.length * 3 + Math.floor(Math.random() * 5),
      warnings: [],
      completedAt: isoNow(),
    };

    this.handoffHistory.push(result);
    return { ...result };
  }

  async receiveFromProTools(sessionId: string): Promise<HandoffResult> {
    this.ensureSession();

    if (this.currentSession!.sessionId !== sessionId) {
      throw new Error(
        `Session ${sessionId} is not currently open. ` +
          `Open session is ${this.currentSession!.sessionId}.`,
      );
    }

    await simulateDelay(800, 2000);

    const result: HandoffResult = {
      success: true,
      resultId: nextId('seq_from_pt'),
      trackCount: this.currentSession!.trackCount,
      clipCount: 12 + Math.floor(Math.random() * 10),
      warnings: [],
      completedAt: isoNow(),
    };

    this.handoffHistory.push(result);
    return { ...result };
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private ensureSession(): void {
    if (!this.currentSession) {
      throw new Error('No Pro Tools session is currently open.');
    }
  }
}
