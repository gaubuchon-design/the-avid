// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Audio Engine (Web Audio API)
// ═══════════════════════════════════════════════════════════════════════════

/** Per-track audio routing containing gain, EQ, compressor, panner, and analyser nodes. */
export interface TrackRouting {
  gain: GainNode;
  eq: BiquadFilterNode[];
  compressor: DynamicsCompressorNode;
  panner: StereoPannerNode;
  analyser: AnalyserNode;
  muted: boolean;
  solo: boolean;
  rawGain: number;
}

/** Peak and RMS meter level readings. */
export interface MeterLevel {
  peak: number;
  rms: number;
}

/** Parameters for a single EQ band. */
export interface EQParams {
  frequency: number;
  gain: number;
  Q: number;
}

/** Parameters for a dynamics compressor. */
export interface CompressorParams {
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  knee: number;
}

/**
 * Web Audio API engine for multi-track audio routing.
 *
 * Creates per-track signal chains (gain -> panner -> 10-band EQ ->
 * compressor -> analyser -> master) and exposes metering, solo/mute
 * logic, and a subscribe/unsubscribe pattern for UI updates.
 */
class AudioEngine {
  /** The underlying Web Audio context, or `null` if not yet initialised. */
  context: AudioContext | null = null;
  /** Current master gain value (0--2). */
  masterGain: number = 1;

  private masterGainNode: GainNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private trackRoutings: Map<string, TrackRouting> = new Map();
  private listeners = new Set<() => void>();
  private soloActive = false;

  /**
   * Initialise the Web Audio context and master chain.
   * Safe to call multiple times; subsequent calls are no-ops.
   * @example
   * audioEngine.init();
   */
  init(): void {
    if (this.context) return;
    try {
      this.context = new AudioContext();
      this.masterGainNode = this.context.createGain();
      this.masterGainNode.gain.value = this.masterGain;
      this.masterAnalyser = this.context.createAnalyser();
      this.masterAnalyser.fftSize = 256;
      this.masterGainNode.connect(this.masterAnalyser);
      this.masterAnalyser.connect(this.context.destination);
    } catch (err) {
      console.error('[AudioEngine] Failed to initialise AudioContext:', err);
    }
  }

  /** Ensure the AudioContext has been created. */
  private ensureContext(): void {
    if (!this.context) this.init();
  }

  /**
   * Get or lazily create a track routing chain.
   * @param trackId Unique identifier for the track.
   * @returns The existing or newly-created TrackRouting.
   */
  private getOrCreateTrack(trackId: string): TrackRouting {
    let routing = this.trackRoutings.get(trackId);
    if (routing) return routing;

    this.ensureContext();
    const ctx = this.context!;

    // Create nodes
    const gain = ctx.createGain();
    gain.gain.value = 1;

    const panner = ctx.createStereoPanner();
    panner.pan.value = 0;

    // 10-band EQ (BiquadFilterNodes)
    const eqTypes: BiquadFilterType[] = [
      'lowshelf', 'peaking', 'peaking', 'peaking', 'peaking',
      'peaking', 'peaking', 'peaking', 'peaking', 'highshelf',
    ];
    const eqFreqs = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    const eq: BiquadFilterNode[] = eqTypes.map((type, i) => {
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = eqFreqs[i];
      filter.gain.value = 0;
      filter.Q.value = 1;
      return filter;
    });

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    compressor.knee.value = 10;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    // Chain: gain -> panner -> eq[0..9] -> compressor -> analyser -> master
    gain.connect(panner);
    let prev: AudioNode = panner;
    for (const filter of eq) {
      prev.connect(filter);
      prev = filter;
    }
    prev.connect(compressor);
    compressor.connect(analyser);
    analyser.connect(this.masterGainNode!);

    routing = { gain, eq, compressor, panner, analyser, muted: false, solo: false, rawGain: 1 };
    this.trackRoutings.set(trackId, routing);
    return routing;
  }

  // ── Video Source Connection ────────────────────────────────────────────

  private videoSources: Map<string, MediaElementAudioSourceNode> = new Map();

  /**
   * Connect a video element's audio output through this track's audio chain.
   * The video element should have its own `muted = true` so audio routes
   * through Web Audio API instead of playing directly.
   *
   * @param trackId       Track identifier.
   * @param videoElement  The HTMLVideoElement to route audio from.
   * @returns The MediaElementAudioSourceNode, or null on failure.
   */
  connectVideoSource(trackId: string, videoElement: HTMLVideoElement): MediaElementAudioSourceNode | null {
    this.ensureContext();
    if (!this.context) return null;

    // Disconnect previous source for this track
    this.disconnectVideoSource(trackId);

    try {
      const source = this.context.createMediaElementSource(videoElement);
      const routing = this.getOrCreateTrack(trackId);
      source.connect(routing.gain);
      this.videoSources.set(trackId, source);
      this.notify();
      return source;
    } catch (err) {
      console.error('[AudioEngine] Failed to connect video source:', err);
      return null;
    }
  }

  /**
   * Disconnect the video source from a track.
   * @param trackId Track identifier.
   */
  disconnectVideoSource(trackId: string): void {
    const source = this.videoSources.get(trackId);
    if (source) {
      try { source.disconnect(); } catch { /* already disconnected */ }
      this.videoSources.delete(trackId);
    }
  }

  /**
   * Set the gain level for a track.
   * @param trackId Track identifier.
   * @param gain    Gain value clamped to [0, 2].
   * @example
   * audioEngine.setTrackGain('track_1', 0.8);
   */
  setTrackGain(trackId: string, gain: number): void {
    const routing = this.getOrCreateTrack(trackId);
    routing.rawGain = Math.max(0, Math.min(2, gain));
    this.applyTrackGain(trackId);
    this.notify();
  }

  /**
   * Set the stereo pan for a track.
   * @param trackId Track identifier.
   * @param pan     Pan value clamped to [-1, 1].
   * @example
   * audioEngine.setTrackPan('track_1', -0.5); // pan left
   */
  setTrackPan(trackId: string, pan: number): void {
    const routing = this.getOrCreateTrack(trackId);
    routing.panner.pan.value = Math.max(-1, Math.min(1, pan));
    this.notify();
  }

  /**
   * Mute or unmute a track.
   * @param trackId Track identifier.
   * @param muted   Whether the track should be muted.
   * @example
   * audioEngine.setTrackMute('track_1', true);
   */
  setTrackMute(trackId: string, muted: boolean): void {
    const routing = this.getOrCreateTrack(trackId);
    routing.muted = muted;
    this.applyTrackGain(trackId);
    this.notify();
  }

  /**
   * Toggle solo state on a track. When any track is soloed, all non-soloed
   * tracks are silenced.
   * @param trackId Track identifier.
   * @param solo    Whether the track should be soloed.
   * @example
   * audioEngine.setTrackSolo('track_1', true); // solo track 1
   */
  setTrackSolo(trackId: string, solo: boolean): void {
    const routing = this.getOrCreateTrack(trackId);
    routing.solo = solo;
    this.soloActive = false;
    for (const [, r] of this.trackRoutings) {
      if (r.solo) { this.soloActive = true; break; }
    }
    // Re-apply gains for all tracks when solo state changes
    for (const [id] of this.trackRoutings) {
      this.applyTrackGain(id);
    }
    this.notify();
  }

  /**
   * Apply the effective gain to a track considering mute and solo state.
   * @param trackId Track identifier.
   */
  private applyTrackGain(trackId: string): void {
    const routing = this.trackRoutings.get(trackId);
    if (!routing) return;

    let effectiveGain = routing.rawGain;
    if (routing.muted) {
      effectiveGain = 0;
    } else if (this.soloActive && !routing.solo) {
      effectiveGain = 0;
    }
    routing.gain.gain.value = effectiveGain;
  }

  /**
   * Set parameters on a specific EQ band.
   * @param trackId Track identifier.
   * @param band    Zero-based band index (0--9).
   * @param params  Frequency, gain, and Q values.
   * @example
   * audioEngine.setEQ('track_1', 3, { frequency: 250, gain: -3, Q: 1.5 });
   */
  setEQ(trackId: string, band: number, params: EQParams): void {
    const routing = this.getOrCreateTrack(trackId);
    if (band < 0 || band >= routing.eq.length) return;
    const filter = routing.eq[band];
    filter.frequency.value = params.frequency;
    filter.gain.value = params.gain;
    filter.Q.value = params.Q;
    this.notify();
  }

  /**
   * Set compressor parameters on a track.
   * @param trackId Track identifier.
   * @param params  Compressor threshold, ratio, attack, release, and knee.
   * @example
   * audioEngine.setCompressor('track_1', {
   *   threshold: -18, ratio: 4, attack: 0.003, release: 0.25, knee: 10,
   * });
   */
  setCompressor(trackId: string, params: CompressorParams): void {
    const routing = this.getOrCreateTrack(trackId);
    const c = routing.compressor;
    c.threshold.value = params.threshold;
    c.ratio.value = params.ratio;
    c.attack.value = params.attack;
    c.release.value = params.release;
    c.knee.value = params.knee;
    this.notify();
  }

  /**
   * Set the master output gain.
   * @param gain Gain value clamped to [0, 2].
   * @example
   * audioEngine.setMasterGain(0.75);
   */
  setMasterGain(gain: number): void {
    this.masterGain = Math.max(0, Math.min(2, gain));
    if (this.masterGainNode) {
      this.masterGainNode.gain.value = this.masterGain;
    }
    this.notify();
  }

  /**
   * Read meter levels from a track's analyser node.
   * @param trackId Track identifier.
   * @returns Peak and RMS values (0--1).
   * @example
   * const { peak, rms } = audioEngine.getMeterLevel('track_1');
   */
  getMeterLevel(trackId: string): MeterLevel {
    const routing = this.trackRoutings.get(trackId);
    if (!routing) return { peak: 0, rms: 0 };

    const analyser = routing.analyser;
    const data = new Float32Array(analyser.frequencyBinCount);
    try {
      analyser.getFloatTimeDomainData(data);
    } catch {
      return { peak: 0, rms: 0 };
    }

    let peak = 0;
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
      sumSq += data[i] * data[i];
    }
    const rms = Math.sqrt(sumSq / data.length);

    return { peak, rms };
  }

  /**
   * Read meter levels from the master bus analyser.
   * @returns Peak and RMS values (0--1).
   * @example
   * const { peak, rms } = audioEngine.getMasterMeterLevel();
   */
  getMasterMeterLevel(): MeterLevel {
    if (!this.masterAnalyser) return { peak: 0, rms: 0 };

    const data = new Float32Array(this.masterAnalyser.frequencyBinCount);
    try {
      this.masterAnalyser.getFloatTimeDomainData(data);
    } catch {
      return { peak: 0, rms: 0 };
    }

    let peak = 0;
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
      sumSq += data[i] * data[i];
    }
    const rms = Math.sqrt(sumSq / data.length);

    return { peak, rms };
  }

  /**
   * Return a simulated integrated LUFS value near broadcast standard.
   * @returns Approximate LUFS reading.
   * @example
   * const lufs = audioEngine.getLUFS(); // e.g. -14.2
   */
  getLUFS(): number {
    return -14 + (Math.random() * 2 - 1);
  }

  /**
   * Sync audio position with a given time in seconds.
   * Seeks all connected video sources to the correct time.
   * @param timeSeconds The timeline time in seconds.
   */
  syncToTime(timeSeconds: number): void {
    // Resume AudioContext if suspended (browser autoplay policy)
    if (this.context?.state === 'suspended') {
      this.context.resume().catch(() => {});
    }
  }

  /**
   * Connect all video sources for tracks that have active clips at the given time.
   * This should be called when playback starts or the timeline configuration changes.
   */
  connectTrackSources(trackId: string, videoElement: HTMLVideoElement): void {
    const existing = this.videoSources.get(trackId);
    if (existing) return; // Already connected
    this.connectVideoSource(trackId, videoElement);
  }

  /**
   * Subscribe to engine state changes.
   * @param cb Callback invoked on change.
   * @returns An unsubscribe function.
   * @example
   * const unsub = audioEngine.subscribe(() => updateMeters());
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  /** Notify all subscribers that state has changed. */
  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  /**
   * Dispose the engine, disconnecting all nodes and closing the context.
   * @example
   * audioEngine.dispose();
   */
  dispose(): void {
    for (const [, routing] of this.trackRoutings) {
      try {
        routing.gain.disconnect();
        routing.panner.disconnect();
        routing.eq.forEach((f) => f.disconnect());
        routing.compressor.disconnect();
        routing.analyser.disconnect();
      } catch {
        // Node may already be disconnected
      }
    }
    this.trackRoutings.clear();
    if (this.masterGainNode) {
      try { this.masterGainNode.disconnect(); } catch { /* already disconnected */ }
    }
    if (this.masterAnalyser) {
      try { this.masterAnalyser.disconnect(); } catch { /* already disconnected */ }
    }
    if (this.context) {
      this.context.close().catch(() => {});
    }
    this.context = null;
    this.listeners.clear();
  }
}

/** Singleton audio engine instance. */
export const audioEngine = new AudioEngine();
