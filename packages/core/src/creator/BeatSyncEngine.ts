// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Beat Sync Engine (CC-06)
//  Musical beat detection and sync for edit-to-music workflows
// ═══════════════════════════════════════════════════════════════════════════

import { generateId } from '../utils';
import {
  BeatSyncConfig,
  BeatSyncResult,
  BeatSyncMode,
  BeatMarker,
} from './types';

// ─── Audio Analysis ───────────────────────────────────────────────────────

interface SpectralBand {
  low: number;
  mid: number;
  high: number;
}

/**
 * Detect beats using onset detection / spectral flux
 * In production this would use Web Audio API AnalyserNode + FFT
 */
function detectBeatsFromAudio(
  audioData: Float32Array | number[],
  sampleRate: number,
  threshold: number,
): { bpm: number; beats: BeatMarker[] } {
  const data = Array.isArray(audioData) ? audioData : Array.from(audioData);
  const totalDuration = data.length / sampleRate;

  // Simulated onset detection with energy-based approach
  // In production: spectral flux + adaptive threshold + peak picking
  const windowSize = Math.floor(sampleRate * 0.02); // 20ms windows
  const hopSize = Math.floor(windowSize / 2);
  const energyProfile: number[] = [];

  for (let i = 0; i < data.length - windowSize; i += hopSize) {
    let energy = 0;
    for (let j = 0; j < windowSize; j++) {
      const sample = data[i + j] ?? 0;
      energy += sample * sample;
    }
    energyProfile.push(energy / windowSize);
  }

  // Estimate BPM from energy profile autocorrelation
  const estimatedBPM = estimateBPM(energyProfile, sampleRate, hopSize);
  const beatInterval = 60 / estimatedBPM;

  // Generate beat grid
  const beats: BeatMarker[] = [];
  let beatCount = 0;

  for (let time = 0; time < totalDuration; time += beatInterval) {
    const isDownbeat = beatCount % 4 === 0;

    // Calculate beat strength from energy at this position
    const sampleIndex = Math.floor(time * sampleRate);
    const energyIndex = Math.floor(sampleIndex / hopSize);
    const energy = energyProfile[energyIndex] ?? 0;
    const maxEnergy = Math.max(...energyProfile.slice(0, 100), 0.001);
    const normalizedEnergy = Math.min(1, energy / maxEnergy);

    const strength = isDownbeat
      ? Math.max(0.7, normalizedEnergy)
      : Math.max(0.3, normalizedEnergy * 0.8);

    if (strength >= threshold) {
      beats.push({
        time,
        strength,
        type: isDownbeat ? 'downbeat' : beatCount % 2 === 0 ? 'beat' : 'offbeat',
      });
    }

    beatCount++;
  }

  return { bpm: estimatedBPM, beats };
}

/**
 * Estimate BPM using autocorrelation of energy profile
 */
function estimateBPM(
  energyProfile: number[],
  sampleRate: number,
  hopSize: number,
): number {
  // Simplified BPM estimation
  // In production: autocorrelation + comb filter bank

  // Default to 120 BPM for simulation; real implementation would analyze the audio
  const minBPM = 60;
  const maxBPM = 200;
  const timePerHop = hopSize / sampleRate;

  // Find dominant periodicity via simplified autocorrelation
  const minLag = Math.floor(60 / (maxBPM * timePerHop));
  const maxLag = Math.floor(60 / (minBPM * timePerHop));

  let bestLag = Math.floor(60 / (120 * timePerHop)); // default 120 BPM
  let bestCorrelation = 0;

  for (let lag = minLag; lag <= Math.min(maxLag, energyProfile.length / 2); lag++) {
    let correlation = 0;
    const count = Math.min(energyProfile.length - lag, 1000);
    for (let i = 0; i < count; i++) {
      correlation += (energyProfile[i] ?? 0) * (energyProfile[i + lag] ?? 0);
    }
    correlation /= count;

    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  const bpm = 60 / (bestLag * timePerHop);
  return Math.round(Math.max(minBPM, Math.min(maxBPM, bpm)));
}

// ─── Sync Modes ───────────────────────────────────────────────────────────

interface CutPoint {
  time: number;
  clipId: string;
}

/**
 * Auto-cut mode: cut clips at every N beats
 */
function generateAutoCuts(
  beats: BeatMarker[],
  sourceClipIds: string[],
  everyNBeats: number,
  threshold: number,
): CutPoint[] {
  const cuts: CutPoint[] = [];
  if (sourceClipIds.length === 0) return cuts;

  const filteredBeats = beats.filter((b) => b.strength >= threshold);
  let clipIndex = 0;

  for (let i = 0; i < filteredBeats.length; i += everyNBeats) {
    const beat = filteredBeats[i]!;
    cuts.push({
      time: beat.time,
      clipId: sourceClipIds[clipIndex % sourceClipIds.length]!,
    });
    clipIndex++;
  }

  return cuts;
}

/**
 * Marker mode: add markers at beat positions
 */
function generateBeatMarkers(
  beats: BeatMarker[],
  threshold: number,
): Array<{ time: number; label: string }> {
  return beats
    .filter((b) => b.strength >= threshold)
    .map((beat, index) => ({
      time: beat.time,
      label: beat.type === 'downbeat'
        ? `Beat ${index + 1} (Downbeat)`
        : `Beat ${index + 1}`,
    }));
}

/**
 * Speed ramp mode: create speed keyframes aligned to beats
 */
function generateSpeedRamps(
  beats: BeatMarker[],
  threshold: number,
  intensity: number,
): Array<{ time: number; speed: number }> {
  const keyframes: Array<{ time: number; speed: number }> = [];
  const filteredBeats = beats.filter((b) => b.strength >= threshold);

  for (const beat of filteredBeats) {
    const isDownbeat = beat.type === 'downbeat';

    // On downbeats, ramp up speed; between beats, slow down
    if (isDownbeat) {
      // Impact moment: accelerate
      keyframes.push({
        time: beat.time,
        speed: 1 + intensity * 0.8,
      });
      // Return to normal shortly after
      keyframes.push({
        time: beat.time + 0.15,
        speed: 1.0,
      });
    } else if (beat.strength > 0.6) {
      // Strong off-beat: slight slow-down for dramatic effect
      keyframes.push({
        time: beat.time - 0.1,
        speed: 1 - intensity * 0.3,
      });
      keyframes.push({
        time: beat.time + 0.1,
        speed: 1.0,
      });
    }
  }

  return keyframes;
}

// ─── Main Engine Class ────────────────────────────────────────────────────

export class BeatSyncEngine {
  private config: BeatSyncConfig;
  private cachedBeats: BeatMarker[] | null = null;
  private cachedBPM: number | null = null;

  constructor(config?: Partial<BeatSyncConfig>) {
    this.config = {
      mode: 'auto_cut',
      beatThreshold: 0.5,
      sourceClipIds: [],
      everyNBeats: 4,
      speedRampIntensity: 0.5,
      quantize: true,
      transitionType: 'cut',
      transitionDuration: 0,
      ...config,
    };
  }

  /**
   * Analyze audio and detect beats
   */
  analyzeAudio(
    audioData: Float32Array | number[],
    sampleRate = 44100,
  ): { bpm: number; beats: BeatMarker[] } {
    const result = detectBeatsFromAudio(
      audioData,
      sampleRate,
      this.config.beatThreshold,
    );
    this.cachedBeats = result.beats;
    this.cachedBPM = result.bpm;
    return result;
  }

  /**
   * Set beats from BPM (manual BPM entry)
   */
  setBPM(bpm: number, duration: number): BeatMarker[] {
    const beatInterval = 60 / bpm;
    const beats: BeatMarker[] = [];
    let beatCount = 0;

    for (let time = 0; time < duration; time += beatInterval) {
      const isDownbeat = beatCount % 4 === 0;
      beats.push({
        time,
        strength: isDownbeat ? 0.95 : 0.65,
        type: isDownbeat ? 'downbeat' : beatCount % 2 === 0 ? 'beat' : 'offbeat',
      });
      beatCount++;
    }

    this.cachedBeats = beats;
    this.cachedBPM = bpm;
    return beats;
  }

  /**
   * Execute beat sync and generate result
   */
  sync(
    audioData?: Float32Array | number[],
    sampleRate = 44100,
  ): BeatSyncResult {
    const result: BeatSyncResult = {
      id: generateId(),
      config: { ...this.config },
      detectedBPM: 0,
      beats: [],
      cuts: [],
      markers: [],
      status: 'processing',
    };

    try {
      // Detect beats if needed
      let beats: BeatMarker[];
      let bpm: number;

      if (this.cachedBeats && this.cachedBPM) {
        beats = this.cachedBeats;
        bpm = this.cachedBPM;
      } else if (audioData) {
        const analysis = this.analyzeAudio(audioData, sampleRate);
        beats = analysis.beats;
        bpm = analysis.bpm;
      } else {
        // No audio data -- use default 120 BPM for 60 seconds
        beats = this.setBPM(120, 60);
        bpm = 120;
      }

      result.detectedBPM = bpm;
      result.beats = beats;

      // Generate sync data based on mode
      switch (this.config.mode) {
        case 'auto_cut':
          result.cuts = generateAutoCuts(
            beats,
            this.config.sourceClipIds,
            this.config.everyNBeats,
            this.config.beatThreshold,
          );
          break;

        case 'markers':
          result.markers = generateBeatMarkers(
            beats,
            this.config.beatThreshold,
          );
          break;

        case 'speed_ramp':
          result.speedKeyframes = generateSpeedRamps(
            beats,
            this.config.beatThreshold,
            this.config.speedRampIntensity ?? 0.5,
          );
          break;
      }

      result.status = 'completed';
    } catch (error) {
      result.status = 'failed';
      result.error = error instanceof Error ? error.message : 'Unknown error during beat sync';
    }

    return result;
  }

  /**
   * Get currently detected BPM
   */
  getBPM(): number | null {
    return this.cachedBPM;
  }

  /**
   * Get detected beats
   */
  getBeats(): BeatMarker[] {
    return this.cachedBeats ? [...this.cachedBeats] : [];
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<BeatSyncConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): BeatSyncConfig {
    return { ...this.config };
  }

  /**
   * Quantize a time value to the nearest beat
   */
  quantizeToNearestBeat(time: number): number {
    if (!this.cachedBeats || this.cachedBeats.length === 0) return time;

    let nearest = this.cachedBeats[0]!.time;
    let minDistance = Math.abs(time - nearest);

    for (const beat of this.cachedBeats) {
      const distance = Math.abs(time - beat.time);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = beat.time;
      }
    }

    return nearest;
  }

  /**
   * Get the beat grid interval for the current BPM
   */
  getBeatInterval(): number {
    return this.cachedBPM ? 60 / this.cachedBPM : 0.5;
  }

  /**
   * Clear cached analysis
   */
  clearCache(): void {
    this.cachedBeats = null;
    this.cachedBPM = null;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────

export function createBeatSyncEngine(config?: Partial<BeatSyncConfig>): BeatSyncEngine {
  return new BeatSyncEngine(config);
}
