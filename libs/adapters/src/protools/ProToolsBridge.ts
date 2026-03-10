/**
 * @fileoverview Full-featured {@link IProToolsAdapter} implementation that
 * wraps a mock adapter with session-state tracking, job history, and
 * workflow coordination.
 *
 * {@link ProToolsBridge} is the primary entry point for the agent
 * orchestrator when it needs to interact with Pro Tools.  It delegates
 * actual processing to an inner adapter (typically
 * {@link MockProToolsAdapter}) and adds:
 *
 * - Session lifecycle tracking (open / closed).
 * - Per-job history recording via {@link SharedJobHistory}.
 * - Workflow coordination via the individual workflow modules.
 * - Handoff management via {@link HandoffManager}.
 */

import type {
  AudioProcessResult,
  DialogueCleanupParams,
  ExportResult,
  HandoffResult as PTHandoffResult,
  IProToolsAdapter,
  SessionInfo,
  TempMusicOptions,
} from '../IProToolsAdapter';
import { AdapterError } from '../AdapterError';
import {
  SharedJobHistory,
  type JobHistoryEntry,
  type JobType,
} from './SharedJobHistory';
import { HandoffManager } from './HandoffManager';
import { runDialogueCleanup } from './DialogueCleanupWorkflow';
import { runLoudnessPrep } from './LoudnessPrepWorkflow';
import { placeTempMusic } from './TempMusicWorkflow';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _jobSeq = 0;

function nextJobId(type: JobType): string {
  return `job_${type}_${Date.now()}_${++_jobSeq}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// ProToolsBridge
// ---------------------------------------------------------------------------

/**
 * Coordinating adapter that implements {@link IProToolsAdapter}, adds job
 * tracking, and delegates actual work to an inner mock (or future real)
 * adapter and to the workflow modules.
 *
 * @example
 * ```ts
 * import { MockProToolsAdapter } from '../MockProToolsAdapter';
 *
 * const bridge = new ProToolsBridge(new MockProToolsAdapter());
 * await bridge.openSession('/sessions/my_show.ptx');
 * await bridge.runDialogueCleanup(['A1'], { noiseFloor: -60, deReverb: true, deEss: false, aggressiveness: 0.6 });
 * console.log(bridge.getJobHistory());
 * ```
 */
export class ProToolsBridge implements IProToolsAdapter {
  private readonly inner: IProToolsAdapter;
  private readonly jobHistory: SharedJobHistory;
  private readonly handoffManager: HandoffManager;
  private currentSession: SessionInfo | null = null;

  /**
   * @param inner          - The underlying adapter for actual processing.
   * @param jobHistory     - Optional shared job history.  If omitted a
   *                         private instance is created.
   * @param handoffManager - Optional handoff manager.  If omitted a
   *                         private instance is created.
   */
  constructor(
    inner: IProToolsAdapter,
    jobHistory?: SharedJobHistory,
    handoffManager?: HandoffManager,
  ) {
    this.inner = inner;
    this.jobHistory = jobHistory ?? new SharedJobHistory();
    this.handoffManager = handoffManager ?? new HandoffManager();
  }

  // -----------------------------------------------------------------------
  // Session management
  // -----------------------------------------------------------------------

  /**
   * Open (or connect to) a Pro Tools session.
   *
   * Delegates to the inner adapter and caches the resulting
   * {@link SessionInfo} so that it can be inspected without a round-trip.
   */
  async openSession(sessionPath: string): Promise<SessionInfo> {
    const info = await this.inner.openSession(sessionPath);
    this.currentSession = info;
    return { ...info };
  }

  /** Retrieve metadata for the currently open session. */
  async getSessionInfo(): Promise<SessionInfo> {
    if (!this.currentSession) {
      throw new AdapterError({
        adapterName: 'pro-tools',
        code: 'CONFLICT',
        message: 'No Pro Tools session is currently open.',
        recoverable: false,
      });
    }
    return { ...this.currentSession };
  }

  // -----------------------------------------------------------------------
  // Audio processing -- with job tracking
  // -----------------------------------------------------------------------

  /**
   * Run AI-powered dialogue cleanup and record the job.
   *
   * Delegates to both the inner adapter (for mock metrics) and the
   * {@link runDialogueCleanup} workflow (for before/after snapshots).
   */
  async runDialogueCleanup(
    trackIds: string[],
    params: DialogueCleanupParams,
  ): Promise<AudioProcessResult> {
    this.ensureSession();

    const jobId = nextJobId('dialogue-cleanup');
    const startedAt = isoNow();
    this.recordJobStart(jobId, 'dialogue-cleanup', startedAt);

    const start = Date.now();
    try {
      // Run the inner adapter for the IProToolsAdapter-compatible result.
      const result = await this.inner.runDialogueCleanup(trackIds, params);

      // Also run the workflow to collect extended metrics.
      const workflow = await runDialogueCleanup(trackIds, {
        aggressiveness: params.aggressiveness,
      });

      this.recordJobComplete(jobId, 'dialogue-cleanup', startedAt, start, {
        beforeLufs: workflow.beforeMetrics.lufs,
        afterLufs: workflow.afterMetrics.lufs,
        noiseFloorBefore: workflow.beforeMetrics.noiseFloorDb,
        noiseFloorAfter: workflow.afterMetrics.noiseFloorDb,
      });

      return result;
    } catch (err) {
      this.recordJobFailed(jobId, 'dialogue-cleanup', startedAt, start);
      throw err;
    }
  }

  /**
   * Prepare tracks for broadcast loudness compliance and record the job.
   */
  async runLoudnessPrep(
    trackIds: string[],
    targetLUFS: number,
  ): Promise<AudioProcessResult> {
    this.ensureSession();

    const jobId = nextJobId('loudness-prep');
    const startedAt = isoNow();
    this.recordJobStart(jobId, 'loudness-prep', startedAt);

    const start = Date.now();
    try {
      const result = await this.inner.runLoudnessPrep(trackIds, targetLUFS);

      const workflow = await runLoudnessPrep(trackIds, targetLUFS);

      this.recordJobComplete(jobId, 'loudness-prep', startedAt, start, {
        targetLufs: targetLUFS,
        beforeLufs: workflow.before.integratedLufs,
        afterLufs: workflow.after.integratedLufs,
        gainAppliedDb: workflow.gainAppliedDb,
      });

      return result;
    } catch (err) {
      this.recordJobFailed(jobId, 'loudness-prep', startedAt, start);
      throw err;
    }
  }

  /**
   * Search the music library, place a temp music bed, and record the job.
   */
  async placeTempMusic(options: TempMusicOptions): Promise<AudioProcessResult> {
    this.ensureSession();

    const jobId = nextJobId('temp-music');
    const startedAt = isoNow();
    this.recordJobStart(jobId, 'temp-music', startedAt);

    const start = Date.now();
    try {
      const result = await this.inner.placeTempMusic(options);

      const workflow = await placeTempMusic({
        mood: options.moodTags[0],
        genre: options.moodTags[1],
        duration: options.duration,
        startTime: options.startTime,
      });

      this.recordJobComplete(jobId, 'temp-music', startedAt, start, {
        trackName: workflow.trackName,
        startTimeSec: workflow.startTimeSec,
        endTimeSec: workflow.endTimeSec,
      });

      return result;
    } catch (err) {
      this.recordJobFailed(jobId, 'temp-music', startedAt, start);
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------

  /** Export / bounce the current mix and record the job. */
  async exportMix(
    format: string,
    params: Record<string, unknown>,
  ): Promise<ExportResult> {
    this.ensureSession();

    const jobId = nextJobId('export');
    const startedAt = isoNow();
    this.recordJobStart(jobId, 'export', startedAt);

    const start = Date.now();
    try {
      const result = await this.inner.exportMix(format, params);
      this.recordJobComplete(jobId, 'export', startedAt, start, {
        format,
        outputUri: result.outputUri,
        fileSizeBytes: result.fileSizeBytes,
      });
      return result;
    } catch (err) {
      this.recordJobFailed(jobId, 'export', startedAt, start);
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // Handoff
  // -----------------------------------------------------------------------

  /**
   * Push a Media Composer sequence into Pro Tools.
   *
   * Delegates to the {@link HandoffManager} for state tracking and to the
   * inner adapter for the actual transfer simulation.
   */
  async handoffToProTools(
    sequenceId: string,
    tracks: string[],
  ): Promise<PTHandoffResult> {
    const jobId = nextJobId('handoff');
    const startedAt = isoNow();
    this.recordJobStart(jobId, 'handoff', startedAt);

    const start = Date.now();
    try {
      // Use the inner adapter for the IProToolsAdapter-compatible result.
      const result = await this.inner.handoffToProTools(sequenceId, tracks);

      // Also record in the handoff manager.
      await this.handoffManager.handoffToProTools(sequenceId, tracks);

      // Update session state if the inner adapter opened one.
      if (result.success) {
        try {
          this.currentSession = await this.inner.getSessionInfo();
        } catch {
          // Inner may not have a session; that is fine.
        }
      }

      this.recordJobComplete(jobId, 'handoff', startedAt, start, {
        direction: 'mc-to-pt',
        trackCount: result.trackCount,
        clipCount: result.clipCount,
      });

      return result;
    } catch (err) {
      this.recordJobFailed(jobId, 'handoff', startedAt, start);
      throw err;
    }
  }

  /**
   * Pull completed audio work from Pro Tools back into Media Composer.
   */
  async receiveFromProTools(sessionId: string): Promise<PTHandoffResult> {
    const jobId = nextJobId('handoff');
    const startedAt = isoNow();
    this.recordJobStart(jobId, 'handoff', startedAt);

    const start = Date.now();
    try {
      const result = await this.inner.receiveFromProTools(sessionId);

      await this.handoffManager.receiveFromProTools(sessionId);

      this.recordJobComplete(jobId, 'handoff', startedAt, start, {
        direction: 'pt-to-mc',
        trackCount: result.trackCount,
        clipCount: result.clipCount,
      });

      return result;
    } catch (err) {
      this.recordJobFailed(jobId, 'handoff', startedAt, start);
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // Job history accessors (non-interface)
  // -----------------------------------------------------------------------

  /** Return the full shared job history. */
  getJobHistory(): JobHistoryEntry[] {
    return this.jobHistory.getHistory();
  }

  /** Return only jobs that are currently pending or running. */
  getActiveJobs(): JobHistoryEntry[] {
    return this.jobHistory
      .getHistory()
      .filter((j) => j.status === 'pending' || j.status === 'running');
  }

  /** Return the underlying {@link SharedJobHistory} instance. */
  getSharedJobHistory(): SharedJobHistory {
    return this.jobHistory;
  }

  /** Return the underlying {@link HandoffManager} instance. */
  getHandoffManager(): HandoffManager {
    return this.handoffManager;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private ensureSession(): void {
    if (!this.currentSession) {
      throw new AdapterError({
        adapterName: 'pro-tools',
        code: 'CONFLICT',
        message: 'No Pro Tools session is currently open.',
        recoverable: false,
      });
    }
  }

  private recordJobStart(
    id: string,
    type: JobType,
    startedAt: string,
  ): void {
    this.jobHistory.recordJob({ id, type, status: 'running', startedAt });
  }

  private recordJobComplete(
    id: string,
    type: JobType,
    startedAt: string,
    wallStart: number,
    metrics?: Record<string, unknown>,
  ): void {
    this.jobHistory.recordJob({
      id,
      type,
      status: 'completed',
      startedAt,
      completedAt: isoNow(),
      durationMs: Date.now() - wallStart,
      metrics,
    });
  }

  private recordJobFailed(
    id: string,
    type: JobType,
    startedAt: string,
    wallStart: number,
  ): void {
    this.jobHistory.recordJob({
      id,
      type,
      status: 'failed',
      startedAt,
      completedAt: isoNow(),
      durationMs: Date.now() - wallStart,
    });
  }
}
