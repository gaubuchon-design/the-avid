// =============================================================================
//  THE AVID -- Audio Punch-In Recording Engine
// =============================================================================
//
// Real-time audio punch-in recording engine modelled after Avid Media
// Composer's audio punch-in feature.  Uses the Web Audio API (AudioContext,
// MediaStreamSource, AnalyserNode, AudioWorkletNode) and the MediaStream /
// getUserMedia APIs for microphone capture.
//
// Supports destructive and non-destructive punch modes, configurable pre-roll
// and post-roll durations, count-in beats, input monitoring, per-input gain
// control, and VU-style metering.
// =============================================================================

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Recording mode.
 * - **destructive**: overwrites the existing audio in the punch region.
 * - **non-destructive**: creates a new clip layered over the existing audio.
 */
export type PunchInMode = 'destructive' | 'non-destructive';

/**
 * State machine for the recording lifecycle.
 *
 * idle -> armed -> pre-roll -> recording -> post-roll -> idle
 */
export type RecordState = 'idle' | 'armed' | 'pre-roll' | 'recording' | 'post-roll';

/** Describes an available audio input device. */
export interface InputSource {
  deviceId: string;
  label: string;
  channels: number;
}

/** Configuration for a punch-in recording session. */
export interface PunchInConfig {
  /** Destructive overwrites existing audio; non-destructive layers a new clip. */
  mode: PunchInMode;
  /** Duration of pre-roll playback before punch-in (ms). */
  preRollMs: number;
  /** Duration of post-roll playback after punch-out (ms). */
  postRollMs: number;
  /** Number of metronome count-in beats before recording (0 = disabled). */
  countInBeats: number;
  /** Sample rate for the recording context (Hz). */
  sampleRate: number;
  /** Bit depth of the captured audio. */
  bitDepth: 16 | 24 | 32;
  /** Channel count: 1 = mono, 2 = stereo. */
  channels: 1 | 2;
  /** When true, the live input signal is routed to the output during recording. */
  monitorInput: boolean;
  /** Input gain multiplier (0.0 -- 2.0). */
  inputGain: number;
}

/** Defines the timeline region where audio will be punched in. */
export interface PunchInRegion {
  /** Track to record into. */
  trackId: string;
  /** In-point in seconds on the timeline. */
  inPoint: number;
  /** Out-point in seconds on the timeline. */
  outPoint: number;
  /** Existing clip ID to punch into (used in destructive mode). */
  clipId?: string;
}

/** Result returned when a recording completes successfully. */
export interface RecordingResult {
  /** Per-channel Float32Array buffers of recorded PCM samples. */
  audioBuffer: Float32Array[];
  /** Sample rate used during capture. */
  sampleRate: number;
  /** Number of channels captured. */
  channels: number;
  /** Total duration of the recording in milliseconds. */
  durationMs: number;
  /** Peak sample level observed during the recording (0.0 -- 1.0). */
  peakLevel: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Clamp a value between min and max. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Generate a unique ID with a prefix. */
function createId(prefix: string): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Default configuration ───────────────────────────────────────────────────

const DEFAULT_CONFIG: PunchInConfig = {
  mode: 'non-destructive',
  preRollMs: 3000,
  postRollMs: 2000,
  countInBeats: 0,
  sampleRate: 48000,
  bitDepth: 24,
  channels: 1,
  monitorInput: true,
  inputGain: 1.0,
};

// =============================================================================
//  AudioPunchInEngine
// =============================================================================

/**
 * Audio Punch-In Recording Engine.
 *
 * Manages the full lifecycle of an audio punch-in recording session:
 * microphone permission acquisition, input device enumeration and selection,
 * track arming, punch region configuration, pre-roll / count-in / recording /
 * post-roll state transitions, raw PCM capture via an AudioWorklet (with a
 * ScriptProcessorNode fallback), input level metering, and resource cleanup.
 *
 * The engine is exported as a singleton (`audioPunchInEngine`).
 */
export class AudioPunchInEngine {
  // ─── Internal state ──────────────────────────────────────────────────────

  /** Current recording state. */
  private state: RecordState = 'idle';
  /** Active configuration (mutable via setConfig). */
  private config: PunchInConfig = { ...DEFAULT_CONFIG };
  /** Set of track IDs currently armed for recording. */
  private armedTracks = new Set<string>();
  /** The active punch-in region, or null if none is set. */
  private punchRegion: PunchInRegion | null = null;
  /** Currently selected input device ID. */
  private selectedDeviceId: string | null = null;
  /** Cached list of available input devices. */
  private inputDevices: InputSource[] = [];

  // ─── Web Audio nodes ─────────────────────────────────────────────────────

  /** Audio context used for capture and metering. */
  private audioContext: AudioContext | null = null;
  /** Active media stream from getUserMedia. */
  private mediaStream: MediaStream | null = null;
  /** Source node wrapping the media stream. */
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  /** Gain node for input level adjustment. */
  private inputGainNode: GainNode | null = null;
  /** Analyser node for VU metering. */
  private analyserNode: AnalyserNode | null = null;
  /** Monitor gain node (routes input to speakers when monitoring is enabled). */
  private monitorNode: GainNode | null = null;
  /** ScriptProcessor used as a fallback when AudioWorklet is unavailable. */
  private scriptProcessorNode: ScriptProcessorNode | null = null;
  /** AudioWorklet node for low-latency PCM capture. */
  private workletNode: AudioWorkletNode | null = null;

  // ─── Recording buffers ───────────────────────────────────────────────────

  /** Per-channel arrays of Float32Array chunks accumulated during recording. */
  private recordBuffers: Float32Array[][] = [];
  /** Peak level observed during the current recording. */
  private peakLevel = 0;
  /** Timestamp (ms) when recording began. */
  private recordStartTime = 0;

  // ─── Timers ──────────────────────────────────────────────────────────────

  /** Timer ID for pre-roll countdown. */
  private preRollTimer: ReturnType<typeof setTimeout> | null = null;
  /** Timer ID for post-roll countdown. */
  private postRollTimer: ReturnType<typeof setTimeout> | null = null;
  /** Timer ID for count-in metronome beats. */
  private countInTimer: ReturnType<typeof setTimeout> | null = null;

  // ─── Subscribers ─────────────────────────────────────────────────────────

  /** General state-change listeners. */
  private listeners = new Set<() => void>();
  /** Dedicated state-transition listeners. */
  private stateListeners = new Set<(state: RecordState) => void>();

  // ═══════════════════════════════════════════════════════════════════════════
  //  Initialisation
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialise the engine: request microphone permissions and enumerate
   * available input devices.
   *
   * Must be called (and awaited) before any recording can begin.  Safe to
   * call multiple times; subsequent calls refresh the device list.
   *
   * @throws If the browser does not support getUserMedia.
   */
  async initialize(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('[AudioPunchInEngine] getUserMedia is not supported in this environment');
    }

    // Request microphone permission with a temporary stream.
    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop the temporary stream immediately -- we only needed permission.
    for (const track of tempStream.getTracks()) {
      track.stop();
    }

    await this.enumerateDevices();
  }

  /**
   * Enumerate available audio input devices and populate the internal cache.
   */
  private async enumerateDevices(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      this.inputDevices = [];
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    this.inputDevices = devices
      .filter((d) => d.kind === 'audioinput')
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone (${d.deviceId.slice(0, 8)})`,
        channels: 2, // Default; actual channel count is determined when stream is opened
      }));

    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Input Devices
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * List available audio input devices.
   *
   * @returns Array of InputSource descriptors.
   */
  getInputDevices(): InputSource[] {
    return this.inputDevices.map((d) => ({ ...d }));
  }

  /**
   * Select an input device by its device ID.
   *
   * If a stream is already open it will be re-acquired with the new device.
   *
   * @param deviceId  The device ID to select.
   * @throws If the device ID is not found in the cached device list.
   */
  async setInputDevice(deviceId: string): Promise<void> {
    const device = this.inputDevices.find((d) => d.deviceId === deviceId);
    if (!device) {
      throw new Error(`[AudioPunchInEngine] Unknown input device: ${deviceId}`);
    }

    this.selectedDeviceId = deviceId;

    // If we already have an active stream, reacquire with the new device.
    if (this.mediaStream) {
      await this.acquireStream();
    }

    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Track Arming
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Arm a track for recording.
   *
   * Armed tracks display a visual record-ready indicator in the UI.
   *
   * @param trackId  Track identifier to arm.
   */
  armTrack(trackId: string): void {
    this.armedTracks.add(trackId);
    this.notify();
  }

  /**
   * Disarm a track, removing it from the record-ready set.
   *
   * @param trackId  Track identifier to disarm.
   */
  disarmTrack(trackId: string): void {
    this.armedTracks.delete(trackId);
    this.notify();
  }

  /**
   * Get the list of currently armed track IDs.
   *
   * @returns Array of armed track identifiers.
   */
  getArmedTracks(): string[] {
    return Array.from(this.armedTracks);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Punch Region
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set the punch-in region (in/out points on a specific track).
   *
   * @param region  The punch region definition.
   */
  setPunchInRegion(region: PunchInRegion): void {
    if (region.outPoint <= region.inPoint) {
      console.warn('[AudioPunchInEngine] outPoint must be greater than inPoint');
      return;
    }
    this.punchRegion = { ...region };
    this.notify();
  }

  /**
   * Get the currently configured punch-in region, or null.
   */
  getPunchInRegion(): PunchInRegion | null {
    return this.punchRegion ? { ...this.punchRegion } : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Configuration
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Update one or more configuration fields.
   *
   * @param config  Partial configuration to merge.
   */
  setConfig(config: Partial<PunchInConfig>): void {
    if (config.inputGain !== undefined) {
      config.inputGain = clamp(config.inputGain, 0.0, 2.0);
    }
    if (config.channels !== undefined && config.channels !== 1 && config.channels !== 2) {
      console.warn('[AudioPunchInEngine] channels must be 1 or 2');
      delete config.channels;
    }
    if (config.bitDepth !== undefined && ![16, 24, 32].includes(config.bitDepth)) {
      console.warn('[AudioPunchInEngine] bitDepth must be 16, 24, or 32');
      delete config.bitDepth;
    }

    Object.assign(this.config, config);

    // Apply gain changes in real time if the gain node exists.
    if (config.inputGain !== undefined && this.inputGainNode) {
      this.inputGainNode.gain.value = this.config.inputGain;
    }

    // Apply monitor changes in real time.
    if (config.monitorInput !== undefined && this.monitorNode) {
      this.monitorNode.gain.value = this.config.monitorInput ? 1.0 : 0.0;
    }

    this.notify();
  }

  /**
   * Get the current configuration (defensive copy).
   */
  getConfig(): PunchInConfig {
    return { ...this.config };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  State
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the current recording state.
   */
  getState(): RecordState {
    return this.state;
  }

  /**
   * Transition to a new recording state, notifying listeners.
   */
  private setState(newState: RecordState): void {
    if (this.state === newState) return;
    this.state = newState;
    this.stateListeners.forEach((fn) => {
      try { fn(newState); } catch (err) {
        console.error('[AudioPunchInEngine] State listener error:', err);
      }
    });
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Recording Lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Begin a punch-in recording session.
   *
   * The engine transitions through the following states:
   * 1. **armed** -- validates prerequisites (armed tracks, punch region).
   * 2. **pre-roll** -- plays timeline audio for the configured pre-roll
   *    duration, giving the performer time to prepare.
   * 3. **recording** -- captures PCM audio from the selected input device.
   *
   * @throws If no tracks are armed, no punch region is set, or the engine
   *         is not in the `idle` state.
   */
  async startRecording(): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error(`[AudioPunchInEngine] Cannot start recording from state '${this.state}'`);
    }
    if (this.armedTracks.size === 0) {
      throw new Error('[AudioPunchInEngine] No tracks are armed for recording');
    }
    if (!this.punchRegion) {
      throw new Error('[AudioPunchInEngine] No punch-in region is set');
    }

    this.setState('armed');

    // Acquire the microphone stream.
    await this.acquireStream();

    // Build the Web Audio graph for capture and metering.
    this.buildAudioGraph();

    // Reset recording buffers.
    this.recordBuffers = [];
    for (let ch = 0; ch < this.config.channels; ch++) {
      this.recordBuffers.push([]);
    }
    this.peakLevel = 0;

    // Execute pre-roll phase.
    this.setState('pre-roll');

    const totalPreRollMs = this.config.preRollMs + this.getCountInDurationMs();

    if (totalPreRollMs > 0) {
      await new Promise<void>((resolve) => {
        // If count-in beats are configured, play them during pre-roll.
        if (this.config.countInBeats > 0) {
          this.playCountIn();
        }

        this.preRollTimer = setTimeout(() => {
          this.preRollTimer = null;
          resolve();
        }, totalPreRollMs);
      });
    }

    // Ensure we weren't cancelled during pre-roll (state may change asynchronously).
    if ((this.state as string) !== 'pre-roll') return;

    // Begin actual capture.
    this.setState('recording');
    this.recordStartTime = performance.now();
    this.startCapture();
  }

  /**
   * Stop recording and return the captured audio.
   *
   * Transitions through post-roll (if configured) before returning.
   *
   * @returns A RecordingResult containing the captured PCM data.
   * @throws If the engine is not currently recording.
   */
  async stopRecording(): Promise<RecordingResult> {
    if (this.state !== 'recording') {
      throw new Error(`[AudioPunchInEngine] Cannot stop recording from state '${this.state}'`);
    }

    // Stop capture.
    this.stopCapture();

    const durationMs = performance.now() - this.recordStartTime;

    // Post-roll phase.
    if (this.config.postRollMs > 0) {
      this.setState('post-roll');
      await new Promise<void>((resolve) => {
        this.postRollTimer = setTimeout(() => {
          this.postRollTimer = null;
          resolve();
        }, this.config.postRollMs);
      });
    }

    // Flatten per-channel chunk arrays into contiguous Float32Arrays.
    const audioBuffer = this.flattenBuffers();

    const result: RecordingResult = {
      audioBuffer,
      sampleRate: this.config.sampleRate,
      channels: this.config.channels,
      durationMs,
      peakLevel: this.peakLevel,
    };

    // Tear down the audio graph but keep the device selection.
    this.teardownAudioGraph();
    this.setState('idle');

    return result;
  }

  /**
   * Cancel the current recording session without producing a result.
   *
   * Safe to call from any non-idle state.  Clears all timers and buffers
   * and returns the engine to the `idle` state.
   */
  cancelRecording(): void {
    if (this.state === 'idle') return;

    // Clear any pending timers.
    if (this.preRollTimer) {
      clearTimeout(this.preRollTimer);
      this.preRollTimer = null;
    }
    if (this.postRollTimer) {
      clearTimeout(this.postRollTimer);
      this.postRollTimer = null;
    }
    if (this.countInTimer) {
      clearTimeout(this.countInTimer);
      this.countInTimer = null;
    }

    this.stopCapture();
    this.teardownAudioGraph();

    // Discard recorded data.
    this.recordBuffers = [];
    this.peakLevel = 0;

    this.setState('idle');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Input Metering
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the current input level for VU meter display.
   *
   * Returns a value between 0.0 (silence) and 1.0 (digital full scale).
   * When no analyser is available, returns 0.
   *
   * @returns The current peak input level (0.0 -- 1.0).
   */
  getInputLevel(): number {
    if (!this.analyserNode) return 0;

    const data = new Float32Array(this.analyserNode.frequencyBinCount);
    try {
      this.analyserNode.getFloatTimeDomainData(data);
    } catch {
      return 0;
    }

    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]!);
      if (abs > peak) peak = abs;
    }

    return clamp(peak, 0, 1);
  }

  /**
   * Get detailed input meter readings (peak and RMS).
   *
   * @returns Object with peak and rms values (0.0 -- 1.0).
   */
  getInputMeterLevel(): { peak: number; rms: number } {
    if (!this.analyserNode) return { peak: 0, rms: 0 };

    const data = new Float32Array(this.analyserNode.frequencyBinCount);
    try {
      this.analyserNode.getFloatTimeDomainData(data);
    } catch {
      return { peak: 0, rms: 0 };
    }

    let peak = 0;
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]!);
      if (abs > peak) peak = abs;
      sumSq += data[i]! * data[i]!;
    }
    const rms = Math.sqrt(sumSq / data.length);

    return {
      peak: clamp(peak, 0, 1),
      rms: clamp(rms, 0, 1),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Stream Acquisition
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Acquire a media stream from the selected (or default) input device.
   */
  private async acquireStream(): Promise<void> {
    // Release any existing stream.
    this.releaseStream();

    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: this.selectedDeviceId ? { exact: this.selectedDeviceId } : undefined,
        channelCount: this.config.channels,
        sampleRate: this.config.sampleRate,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    };

    this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

    // Update the actual channel count from the stream.
    const audioTrack = this.mediaStream.getAudioTracks()[0];
    if (audioTrack) {
      const settings = audioTrack.getSettings();
      if (settings.channelCount) {
        // Record the actual channel count the device provided.
        const deviceId = this.selectedDeviceId ?? audioTrack.getSettings().deviceId ?? '';
        const device = this.inputDevices.find((d) => d.deviceId === deviceId);
        if (device) {
          device.channels = settings.channelCount;
        }
      }
    }
  }

  /**
   * Release the current media stream, stopping all tracks.
   */
  private releaseStream(): void {
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Audio Graph
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Build the Web Audio processing graph for capture and metering.
   *
   * Graph topology:
   * ```
   * MediaStream -> SourceNode -> InputGainNode -> AnalyserNode
   *                                           \-> MonitorNode -> Destination
   * ```
   */
  private buildAudioGraph(): void {
    if (!this.mediaStream) return;

    this.audioContext = new AudioContext({ sampleRate: this.config.sampleRate });

    // Source from the live microphone stream.
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    // Input gain control.
    this.inputGainNode = this.audioContext.createGain();
    this.inputGainNode.gain.value = this.config.inputGain;

    // Analyser for metering.
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 2048;
    this.analyserNode.smoothingTimeConstant = 0.3;

    // Monitor output (direct to speakers when enabled).
    this.monitorNode = this.audioContext.createGain();
    this.monitorNode.gain.value = this.config.monitorInput ? 1.0 : 0.0;

    // Wire the graph.
    this.sourceNode.connect(this.inputGainNode);
    this.inputGainNode.connect(this.analyserNode);
    this.inputGainNode.connect(this.monitorNode);
    this.monitorNode.connect(this.audioContext.destination);
  }

  /**
   * Tear down the audio graph and close the context.
   */
  private teardownAudioGraph(): void {
    // Disconnect all nodes safely.
    const nodes: (AudioNode | null)[] = [
      this.sourceNode,
      this.inputGainNode,
      this.analyserNode,
      this.monitorNode,
      this.scriptProcessorNode,
      this.workletNode,
    ];
    for (const node of nodes) {
      if (node) {
        try { node.disconnect(); } catch { /* already disconnected */ }
      }
    }

    this.sourceNode = null;
    this.inputGainNode = null;
    this.analyserNode = null;
    this.monitorNode = null;
    this.scriptProcessorNode = null;
    this.workletNode = null;

    // Release the stream.
    this.releaseStream();

    // Close the audio context.
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PCM Capture
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start capturing PCM audio data from the input gain node.
   *
   * Attempts to use an AudioWorklet for low-latency capture.  Falls back to
   * a ScriptProcessorNode if AudioWorklet is unavailable.
   */
  private startCapture(): void {
    if (!this.audioContext || !this.inputGainNode) return;

    // Try AudioWorklet first, fall back to ScriptProcessorNode.
    if (typeof AudioWorkletNode !== 'undefined' && this.audioContext.audioWorklet) {
      this.startWorkletCapture();
    } else {
      this.startScriptProcessorCapture();
    }
  }

  /**
   * Set up capture via AudioWorklet.
   *
   * Registers an inline processor module that posts PCM data to the main
   * thread via the MessagePort.
   */
  private startWorkletCapture(): void {
    if (!this.audioContext || !this.inputGainNode) return;

    // Define the worklet processor inline as a Blob URL.
    const processorCode = `
      class PunchInProcessor extends AudioWorkletProcessor {
        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (input && input.length > 0) {
            const channelData = [];
            for (let ch = 0; ch < input.length; ch++) {
              channelData.push(new Float32Array(input[ch]));
            }
            this.port.postMessage({ channelData });
          }
          return true;
        }
      }
      registerProcessor('punch-in-processor', PunchInProcessor);
    `;

    const blob = new Blob([processorCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);

    this.audioContext.audioWorklet
      .addModule(url)
      .then(() => {
        URL.revokeObjectURL(url);

        if (!this.audioContext || !this.inputGainNode) return;

        this.workletNode = new AudioWorkletNode(
          this.audioContext,
          'punch-in-processor',
          { channelCount: this.config.channels, numberOfInputs: 1, numberOfOutputs: 0 },
        );

        this.workletNode.port.onmessage = (event: MessageEvent) => {
          this.handleCapturedData(event.data.channelData as Float32Array[]);
        };

        this.inputGainNode.connect(this.workletNode);
      })
      .catch((err) => {
        URL.revokeObjectURL(url);
        console.warn('[AudioPunchInEngine] AudioWorklet failed, falling back to ScriptProcessor:', err);
        this.startScriptProcessorCapture();
      });
  }

  /**
   * Set up capture via ScriptProcessorNode (legacy fallback).
   *
   * Uses a buffer size of 4096 samples which provides a reasonable
   * trade-off between latency and reliability.
   */
  private startScriptProcessorCapture(): void {
    if (!this.audioContext || !this.inputGainNode) return;

    const bufferSize = 4096;
    const channelCount = this.config.channels;

    // ScriptProcessorNode is deprecated but still widely supported.
    this.scriptProcessorNode = this.audioContext.createScriptProcessor(
      bufferSize,
      channelCount,
      channelCount,
    );

    this.scriptProcessorNode.onaudioprocess = (event: AudioProcessingEvent) => {
      if (this.state !== 'recording') return;

      const channelData: Float32Array[] = [];
      for (let ch = 0; ch < channelCount; ch++) {
        channelData.push(new Float32Array(event.inputBuffer.getChannelData(ch)));
      }
      this.handleCapturedData(channelData);
    };

    this.inputGainNode.connect(this.scriptProcessorNode);
    // ScriptProcessor requires a connection to destination to fire events.
    this.scriptProcessorNode.connect(this.audioContext.destination);
  }

  /**
   * Process a chunk of captured PCM data.
   *
   * Appends the data to the per-channel record buffers and updates the
   * peak level tracker.
   *
   * @param channelData  Array of Float32Array, one per channel.
   */
  private handleCapturedData(channelData: Float32Array[]): void {
    if (this.state !== 'recording') return;

    const channelCount = Math.min(channelData.length, this.config.channels);

    for (let ch = 0; ch < channelCount; ch++) {
      const chunk = channelData[ch];
      if (!chunk) continue;

      // Ensure the buffer array for this channel exists.
      if (!this.recordBuffers[ch]) {
        this.recordBuffers[ch] = [];
      }
      this.recordBuffers[ch]!.push(new Float32Array(chunk));

      // Update peak level.
      for (let i = 0; i < chunk.length; i++) {
        const abs = Math.abs(chunk[i]!);
        if (abs > this.peakLevel) {
          this.peakLevel = abs;
        }
      }
    }
  }

  /**
   * Stop capturing audio data.
   */
  private stopCapture(): void {
    if (this.scriptProcessorNode) {
      this.scriptProcessorNode.onaudioprocess = null;
      try { this.scriptProcessorNode.disconnect(); } catch { /* already disconnected */ }
      this.scriptProcessorNode = null;
    }
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      try { this.workletNode.disconnect(); } catch { /* already disconnected */ }
      this.workletNode = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Buffer Utilities
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Flatten the per-channel chunk arrays into contiguous Float32Array buffers.
   *
   * @returns Array of Float32Array, one per channel.
   */
  private flattenBuffers(): Float32Array[] {
    const result: Float32Array[] = [];

    for (let ch = 0; ch < this.recordBuffers.length; ch++) {
      const chunks = this.recordBuffers[ch] ?? [];

      // Calculate total length.
      let totalLength = 0;
      for (const chunk of chunks) {
        totalLength += chunk.length;
      }

      // Copy into a single contiguous buffer.
      const flat = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        flat.set(chunk, offset);
        offset += chunk.length;
      }

      result.push(flat);
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Count-In
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calculate the total duration of the count-in period in milliseconds.
   *
   * Uses a fixed tempo of 120 BPM (500 ms per beat).
   */
  private getCountInDurationMs(): number {
    if (this.config.countInBeats <= 0) return 0;
    const beatDurationMs = 500; // 120 BPM
    return this.config.countInBeats * beatDurationMs;
  }

  /**
   * Play audible count-in beats using oscillator tones.
   *
   * Each beat produces a short sine-wave click at 1000 Hz.
   */
  private playCountIn(): void {
    if (!this.audioContext || this.config.countInBeats <= 0) return;

    const beatDurationMs = 500;
    const clickDuration = 0.05; // 50 ms click

    for (let beat = 0; beat < this.config.countInBeats; beat++) {
      const startTime = this.audioContext.currentTime + (beat * beatDurationMs) / 1000;

      const oscillator = this.audioContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = beat === 0 ? 1200 : 1000; // Accent on beat 1

      const clickGain = this.audioContext.createGain();
      clickGain.gain.setValueAtTime(0.3, startTime);
      clickGain.gain.exponentialRampToValueAtTime(0.001, startTime + clickDuration);

      oscillator.connect(clickGain);
      clickGain.connect(this.audioContext.destination);

      oscillator.start(startTime);
      oscillator.stop(startTime + clickDuration);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Subscribe
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to engine state changes.
   *
   * @param cb  Callback invoked on any state change.
   * @returns An unsubscribe function.
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  /**
   * Subscribe specifically to recording state transitions.
   *
   * @param cb  Callback invoked with the new RecordState.
   * @returns An unsubscribe function.
   */
  onStateChange(cb: (state: RecordState) => void): () => void {
    this.stateListeners.add(cb);
    return () => { this.stateListeners.delete(cb); };
  }

  /** Notify all general subscribers that state has changed. */
  private notify(): void {
    this.listeners.forEach((fn) => {
      try { fn(); } catch (err) {
        console.error('[AudioPunchInEngine] Listener error:', err);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Cleanup
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Destroy the engine, releasing all resources.
   *
   * Cancels any in-progress recording, closes audio contexts, stops media
   * streams, and clears all subscriptions and internal state.
   */
  destroy(): void {
    // Cancel any active recording session.
    this.cancelRecording();

    // Clear subscriptions.
    this.listeners.clear();
    this.stateListeners.clear();

    // Clear track arming and region.
    this.armedTracks.clear();
    this.punchRegion = null;

    // Clear device cache.
    this.inputDevices = [];
    this.selectedDeviceId = null;

    // Reset config to defaults.
    this.config = { ...DEFAULT_CONFIG };
  }
}

/** Singleton audio punch-in engine instance. */
export const audioPunchInEngine = new AudioPunchInEngine();
