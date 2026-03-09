/**
 * @fileoverview Adapter interface for the Pro Tools audio bridge.
 *
 * `IProToolsAdapter` abstracts the bi-directional handoff between
 * Media Composer and Pro Tools.  It covers session management, automated
 * audio processing (dialogue cleanup, loudness prep, temp music), mix
 * export, and the AAF/OMF round-trip workflow.
 */

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

/** Metadata about an open Pro Tools session. */
export interface SessionInfo {
  /** Pro Tools session identifier. */
  sessionId: string;
  /** Display name of the session. */
  name: string;
  /** File-system path to the .ptx / .ptf file. */
  sessionPath: string;
  /** Sample rate in Hz (e.g. 48000, 96000). */
  sampleRate: number;
  /** Bit depth (e.g. 16, 24, 32). */
  bitDepth: number;
  /** Number of audio tracks in the session. */
  trackCount: number;
  /** Session duration in seconds. */
  duration: number;
  /** ISO-8601 timestamp of when the session was last saved. */
  lastSavedAt: string;
}

/** Parameters for the AI-powered dialogue cleanup processor. */
export interface DialogueCleanupParams {
  /** Target noise floor in dBFS (e.g. -60). */
  noiseFloor: number;
  /** Enable de-reverb processing. */
  deReverb: boolean;
  /** Enable de-esser. */
  deEss: boolean;
  /** Aggressiveness from 0 (gentle) to 1 (maximum). */
  aggressiveness: number;
  /** Protect frequencies below this value (Hz). */
  lowCutFrequency?: number;
}

/** Options for automatic temp-music placement. */
export interface TempMusicOptions {
  /** Mood / genre tags to search the music library. */
  moodTags: string[];
  /** Target duration in seconds. */
  duration: number;
  /** Target loudness in LUFS for the music bed. */
  targetLUFS: number;
  /** Automatically duck under dialogue. */
  autoDuck: boolean;
  /** Track ID where the music should be placed. */
  targetTrackId?: string;
  /** Timeline position in seconds where music starts. */
  startTime?: number;
}

/** Result of an audio processing operation. */
export interface AudioProcessResult {
  /** Whether the operation completed successfully. */
  success: boolean;
  /** IDs of the tracks that were processed. */
  processedTrackIds: string[];
  /** Wall-clock duration of the processing in milliseconds. */
  processingTimeMs: number;
  /** Audio metrics measured after processing. */
  metrics: AudioMetrics;
  /** Human-readable warnings (e.g. clipping detected). */
  warnings: string[];
}

/** Post-processing audio metrics. */
export interface AudioMetrics {
  /** Peak level in dBFS. */
  peakLevel: number;
  /** RMS level in dBFS. */
  rmsLevel: number;
  /** Integrated loudness in LUFS. */
  integratedLUFS: number;
  /** Loudness range in LU. */
  loudnessRange: number;
  /** True-peak level in dBTP. */
  truePeak: number;
}

/** Result of an export / bounce operation. */
export interface ExportResult {
  /** Whether the export completed successfully. */
  success: boolean;
  /** Output file URI. */
  outputUri: string;
  /** Format of the exported file (e.g. "WAV", "AIFF", "MP3"). */
  format: string;
  /** File size in bytes. */
  fileSizeBytes: number;
  /** Duration of the exported audio in seconds. */
  duration: number;
}

/** Result of an AAF/OMF handoff between MC and PT. */
export interface HandoffResult {
  /** Whether the handoff completed without errors. */
  success: boolean;
  /** Identifier of the resulting session or sequence. */
  resultId: string;
  /** Number of tracks transferred. */
  trackCount: number;
  /** Number of clips / regions transferred. */
  clipCount: number;
  /** Items that could not be transferred. */
  warnings: string[];
  /** ISO-8601 timestamp. */
  completedAt: string;
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/**
 * Adapter for Pro Tools session management and audio processing.
 *
 * The real implementation communicates with Pro Tools via EUCON, the
 * Pro Tools scripting API, or a custom bridge daemon.  The mock
 * simulates processing delays and returns realistic metrics.
 */
export interface IProToolsAdapter {
  /**
   * Open (or connect to) a Pro Tools session.
   *
   * @param sessionPath - File-system path to the `.ptx` session file.
   * @returns Metadata about the opened session.
   */
  openSession(sessionPath: string): Promise<SessionInfo>;

  /**
   * Retrieve metadata for the currently open session.
   *
   * @returns {@link SessionInfo} for the active session.
   * @throws If no session is currently open.
   */
  getSessionInfo(): Promise<SessionInfo>;

  /**
   * Run AI-powered dialogue cleanup on one or more tracks.
   *
   * Applies noise reduction, de-reverb, and de-essing according to the
   * supplied parameters.
   *
   * @param trackIds - Tracks to process.
   * @param params   - Processing parameters.
   * @returns An {@link AudioProcessResult} with metrics and warnings.
   */
  runDialogueCleanup(
    trackIds: string[],
    params: DialogueCleanupParams,
  ): Promise<AudioProcessResult>;

  /**
   * Prepare tracks for broadcast loudness compliance.
   *
   * Applies limiting, compression, and gain staging to meet the target
   * integrated loudness.
   *
   * @param trackIds   - Tracks to process.
   * @param targetLUFS - Target integrated loudness (e.g. -24 for broadcast).
   * @returns An {@link AudioProcessResult} with measured loudness.
   */
  runLoudnessPrep(
    trackIds: string[],
    targetLUFS: number,
  ): Promise<AudioProcessResult>;

  /**
   * Search the music library and automatically place a temp music bed
   * on the timeline.
   *
   * @param options - Mood, duration, loudness, and placement preferences.
   * @returns An {@link AudioProcessResult} describing what was placed.
   */
  placeTempMusic(options: TempMusicOptions): Promise<AudioProcessResult>;

  /**
   * Export / bounce the current mix to a file.
   *
   * @param format - Output format (e.g. `"WAV"`, `"AIFF"`, `"MP3"`).
   * @param params - Format-specific options (bit depth, sample rate, etc.).
   * @returns An {@link ExportResult} with the output URI and metadata.
   */
  exportMix(
    format: string,
    params: Record<string, unknown>,
  ): Promise<ExportResult>;

  /**
   * Push a sequence from Media Composer into Pro Tools via AAF/OMF.
   *
   * @param sequenceId - The MC sequence to hand off.
   * @param tracks     - Which track IDs to include.
   * @returns A {@link HandoffResult} summarising the transfer.
   */
  handoffToProTools(
    sequenceId: string,
    tracks: string[],
  ): Promise<HandoffResult>;

  /**
   * Pull completed audio work from a Pro Tools session back into
   * Media Composer.
   *
   * @param sessionId - The Pro Tools session to receive from.
   * @returns A {@link HandoffResult} summarising the transfer.
   */
  receiveFromProTools(sessionId: string): Promise<HandoffResult>;
}
