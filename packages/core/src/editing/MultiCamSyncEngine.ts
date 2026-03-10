// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Multi-Camera Sync Engine (MC-01)
//  Synchronizes multi-camera footage by timecode (LTC/VITC), audio
//  waveform cross-correlation, slate clap manual sync, and drag alignment.
//  Supports up to 16 angles with 1-minute handles.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Types ─────────────────────────────────────────────────────────────────

export type MultiCamSyncMethod = 'timecode-ltc' | 'timecode-vitc' | 'audio-waveform' | 'slate-clap' | 'manual-drag';
export type MultiCamSyncStatus = 'idle' | 'analyzing' | 'syncing' | 'synced' | 'error';

export interface CameraAngle {
  id: string;
  label: string; // "CAM A", "CAM B", etc.
  assetId: string;
  fileName: string;
  durationSeconds: number;
  frameRate: number;
  timecodeStart: string; // HH:MM:SS:FF
  timecodeStartSeconds: number;
  audioChannels: number;
  sampleRate: number;
  waveformPeaks?: number[];
  thumbnailUrl?: string;
}

export interface SyncPoint {
  angleId: string;
  timeSeconds: number;
  timecodeTC: string;
  confidence: number; // 0-1
  method: MultiCamSyncMethod;
}

export interface SyncResult {
  angleId: string;
  offsetSeconds: number; // Offset from reference angle
  confidence: number;
  method: MultiCamSyncMethod;
  aligned: boolean;
}

export interface MultiCamGroup {
  id: string;
  name: string;
  referenceAngleId: string;
  angles: CameraAngle[];
  syncResults: SyncResult[];
  syncStatus: MultiCamSyncStatus;
  handleDurationSeconds: number;
  totalDurationSeconds: number;
  frameRate: number;
  createdAt: string;
}

export interface MultiCamSwitchEvent {
  id: string;
  fromAngleId: string;
  toAngleId: string;
  switchTimeSeconds: number;
  switchType: 'cut' | 'dissolve' | 'ai-suggestion';
  duration?: number; // For dissolves
}

export interface MultiCamProgramTrack {
  groupId: string;
  switches: MultiCamSwitchEvent[];
  activeAngleId: string;
  totalDurationSeconds: number;
}

export interface AudioCrossCorrelationResult {
  offsetSamples: number;
  offsetSeconds: number;
  correlationPeak: number;
  confidence: number;
}

export interface MultiCamSyncEngineConfig {
  maxAngles: number;
  handleDurationSeconds: number;
  audioAnalysisWindowMs: number;
  timecodeToleranceFrames: number;
  sampleRate: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const MAX_ANGLES = 16;
const DEFAULT_HANDLE_DURATION = 60; // 1 minute
const DEFAULT_AUDIO_WINDOW_MS = 2000;
const DEFAULT_TC_TOLERANCE_FRAMES = 2;

// ─── Helpers ───────────────────────────────────────────────────────────────

function timecodeToSeconds(tc: string, frameRate: number): number {
  const parts = tc.split(/[:;]/).map(Number);
  if (parts.length !== 4) return 0;
  const [hours = 0, minutes = 0, seconds = 0, frames = 0] = parts;
  if (!Number.isFinite(frameRate) || frameRate <= 0) return 0;
  return hours * 3600 + minutes * 60 + seconds + frames / frameRate;
}

function secondsToTimecode(seconds: number, frameRate: number): string {
  const totalFrames = Math.floor(seconds * frameRate);
  const nominalRate = Math.round(frameRate);
  const frames = totalFrames % nominalRate;
  const totalSecs = Math.floor(totalFrames / nominalRate);
  const secs = totalSecs % 60;
  const mins = Math.floor(totalSecs / 60) % 60;
  const hours = Math.floor(totalSecs / 3600);
  return [
    hours.toString().padStart(2, '0'),
    mins.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0'),
    frames.toString().padStart(2, '0'),
  ].join(':');
}

function crossCorrelate(signalA: number[], signalB: number[]): { offset: number; peak: number } {
  const len = Math.min(signalA.length, signalB.length);
  if (len === 0) return { offset: 0, peak: 0 };

  // Compute auto-correlation energies for normalization
  let energyA = 0;
  let energyB = 0;
  for (let i = 0; i < len; i++) {
    energyA += (signalA[i] ?? 0) * (signalA[i] ?? 0);
    energyB += (signalB[i] ?? 0) * (signalB[i] ?? 0);
  }
  const normFactor = Math.sqrt(energyA * energyB);

  const maxLag = Math.min(len, 1000);
  let bestOffset = 0;
  let bestPeak = -Infinity;

  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < len; i++) {
      const j = i + lag;
      if (j >= 0 && j < len) {
        sum += (signalA[i] ?? 0) * (signalB[j] ?? 0);
      }
    }
    // Normalize cross-correlation to 0..1 range
    const normalized = normFactor > 0 ? sum / normFactor : 0;
    if (normalized > bestPeak) {
      bestPeak = normalized;
      bestOffset = lag;
    }
  }

  return { offset: bestOffset, peak: Math.max(0, Math.min(1, bestPeak)) };
}

// ─── Multi-Cam Sync Engine ─────────────────────────────────────────────────

export class MultiCamSyncEngine {
  private config: MultiCamSyncEngineConfig;
  private groups: Map<string, MultiCamGroup> = new Map();
  private programs: Map<string, MultiCamProgramTrack> = new Map();
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor(config?: Partial<MultiCamSyncEngineConfig>) {
    this.config = {
      maxAngles: config?.maxAngles ?? MAX_ANGLES,
      handleDurationSeconds: config?.handleDurationSeconds ?? DEFAULT_HANDLE_DURATION,
      audioAnalysisWindowMs: config?.audioAnalysisWindowMs ?? DEFAULT_AUDIO_WINDOW_MS,
      timecodeToleranceFrames: config?.timecodeToleranceFrames ?? DEFAULT_TC_TOLERANCE_FRAMES,
      sampleRate: config?.sampleRate ?? 48000,
    };
  }

  // ─── Group Management ──────────────────────────────────────────────

  createGroup(name: string, referenceAngle: CameraAngle, additionalAngles: CameraAngle[] = []): MultiCamGroup {
    const allAngles = [referenceAngle, ...additionalAngles];

    if (allAngles.length > this.config.maxAngles) {
      throw new Error(`Maximum ${this.config.maxAngles} angles allowed`);
    }

    const group: MultiCamGroup = {
      id: `mcg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      referenceAngleId: referenceAngle.id,
      angles: allAngles,
      syncResults: [],
      syncStatus: 'idle',
      handleDurationSeconds: this.config.handleDurationSeconds,
      totalDurationSeconds: Math.max(...allAngles.map((a) => a.durationSeconds)),
      frameRate: referenceAngle.frameRate,
      createdAt: new Date().toISOString(),
    };

    this.groups.set(group.id, group);
    this.emit('group:created', group);
    return group;
  }

  addAngle(groupId: string, angle: CameraAngle): void {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group not found: ${groupId}`);
    if (group.angles.length >= this.config.maxAngles) {
      throw new Error(`Maximum ${this.config.maxAngles} angles reached`);
    }

    group.angles.push(angle);
    group.totalDurationSeconds = Math.max(...group.angles.map((a) => a.durationSeconds));
    this.emit('group:angleAdded', { groupId, angleId: angle.id });
  }

  removeAngle(groupId: string, angleId: string): void {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group not found: ${groupId}`);
    if (angleId === group.referenceAngleId) {
      throw new Error('Cannot remove the reference angle');
    }

    group.angles = group.angles.filter((a) => a.id !== angleId);
    group.syncResults = group.syncResults.filter((r) => r.angleId !== angleId);
    this.emit('group:angleRemoved', { groupId, angleId });
  }

  getGroup(groupId: string): MultiCamGroup | null {
    return this.groups.get(groupId) ?? null;
  }

  getAllGroups(): MultiCamGroup[] {
    return Array.from(this.groups.values());
  }

  // ─── Sync by Timecode (LTC/VITC) ──────────────────────────────────

  syncByTimecode(groupId: string, method: 'timecode-ltc' | 'timecode-vitc' = 'timecode-ltc'): SyncResult[] {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group not found: ${groupId}`);

    group.syncStatus = 'syncing';
    this.emit('sync:start', { groupId, method });

    const referenceAngle = group.angles.find((a) => a.id === group.referenceAngleId);
    if (!referenceAngle) throw new Error(`Reference angle not found in group: ${groupId}`);
    const refStartSeconds = referenceAngle.timecodeStartSeconds;
    const toleranceSeconds = this.config.timecodeToleranceFrames / group.frameRate;

    const results: SyncResult[] = group.angles.map((angle) => {
      if (angle.id === group.referenceAngleId) {
        return {
          angleId: angle.id,
          offsetSeconds: 0,
          confidence: 1.0,
          method,
          aligned: true,
        };
      }

      const offset = angle.timecodeStartSeconds - refStartSeconds;
      const confidence = Math.abs(offset) < toleranceSeconds * 10 ? 0.95 : 0.75;

      return {
        angleId: angle.id,
        offsetSeconds: offset,
        confidence,
        method,
        aligned: true,
      };
    });

    group.syncResults = results;
    group.syncStatus = 'synced';
    this.emit('sync:complete', { groupId, results });
    return results;
  }

  // ─── Sync by Audio Waveform Cross-Correlation ──────────────────────

  syncByAudioWaveform(groupId: string): SyncResult[] {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group not found: ${groupId}`);

    group.syncStatus = 'analyzing';
    this.emit('sync:start', { groupId, method: 'audio-waveform' });

    const referenceAngle = group.angles.find((a) => a.id === group.referenceAngleId);
    if (!referenceAngle) throw new Error(`Reference angle not found in group: ${groupId}`);
    const refPeaks = referenceAngle.waveformPeaks ?? [];

    const results: SyncResult[] = group.angles.map((angle) => {
      if (angle.id === group.referenceAngleId) {
        return {
          angleId: angle.id,
          offsetSeconds: 0,
          confidence: 1.0,
          method: 'audio-waveform',
          aligned: true,
        };
      }

      const anglePeaks = angle.waveformPeaks ?? [];
      if (refPeaks.length === 0 || anglePeaks.length === 0) {
        return {
          angleId: angle.id,
          offsetSeconds: 0,
          confidence: 0,
          method: 'audio-waveform',
          aligned: false,
        };
      }

      const correlation = crossCorrelate(refPeaks, anglePeaks);
      // The offset is in peak-sample units. Convert to seconds using the
      // reference angle duration and the number of peaks.
      const secondsPerPeak = refPeaks.length > 0
        ? referenceAngle.durationSeconds / refPeaks.length
        : 1 / this.config.sampleRate;
      const offsetSeconds = correlation.offset * secondsPerPeak;

      return {
        angleId: angle.id,
        offsetSeconds,
        confidence: Math.min(1, Math.max(0, correlation.peak)),
        method: 'audio-waveform',
        aligned: correlation.peak > 0.3,
      };
    });

    group.syncResults = results;
    group.syncStatus = 'synced';
    this.emit('sync:complete', { groupId, results });
    return results;
  }

  // ─── Slate Clap Manual Sync ────────────────────────────────────────

  syncBySlateClap(groupId: string, slateTimes: Map<string, number>): SyncResult[] {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group not found: ${groupId}`);

    group.syncStatus = 'syncing';
    const refTime = slateTimes.get(group.referenceAngleId) ?? 0;

    const results: SyncResult[] = group.angles.map((angle) => {
      const slateTime = slateTimes.get(angle.id);

      if (slateTime === undefined) {
        return {
          angleId: angle.id,
          offsetSeconds: 0,
          confidence: 0,
          method: 'slate-clap',
          aligned: false,
        };
      }

      return {
        angleId: angle.id,
        offsetSeconds: slateTime - refTime,
        confidence: 0.98,
        method: 'slate-clap',
        aligned: true,
      };
    });

    group.syncResults = results;
    group.syncStatus = 'synced';
    this.emit('sync:complete', { groupId, results });
    return results;
  }

  // ─── Manual Drag Alignment ─────────────────────────────────────────

  setManualOffset(groupId: string, angleId: string, offsetSeconds: number): void {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group not found: ${groupId}`);

    const existing = group.syncResults.find((r) => r.angleId === angleId);
    if (existing) {
      existing.offsetSeconds = offsetSeconds;
      existing.method = 'manual-drag';
      existing.confidence = 1.0;
      existing.aligned = true;
    } else {
      group.syncResults.push({
        angleId,
        offsetSeconds,
        confidence: 1.0,
        method: 'manual-drag',
        aligned: true,
      });
    }

    this.emit('sync:manualOffset', { groupId, angleId, offsetSeconds });
  }

  // ─── Program Track (Switching) ─────────────────────────────────────

  createProgramTrack(groupId: string): MultiCamProgramTrack {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group not found: ${groupId}`);

    const program: MultiCamProgramTrack = {
      groupId,
      switches: [],
      activeAngleId: group.referenceAngleId,
      totalDurationSeconds: group.totalDurationSeconds,
    };

    this.programs.set(groupId, program);
    return program;
  }

  switchAngle(groupId: string, toAngleId: string, timeSeconds: number, type: 'cut' | 'dissolve' = 'cut'): void {
    let program = this.programs.get(groupId);
    if (!program) {
      program = this.createProgramTrack(groupId);
    }

    const switchEvent: MultiCamSwitchEvent = {
      id: `switch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fromAngleId: program.activeAngleId,
      toAngleId,
      switchTimeSeconds: timeSeconds,
      switchType: type,
      duration: type === 'dissolve' ? 0.5 : undefined,
    };

    program.switches.push(switchEvent);
    program.activeAngleId = toAngleId;
    this.emit('program:switch', switchEvent);
  }

  getProgramTrack(groupId: string): MultiCamProgramTrack | null {
    return this.programs.get(groupId) ?? null;
  }

  // ─── AI Smooth Cut Suggestion ──────────────────────────────────────

  suggestSmoothCuts(groupId: string): MultiCamSwitchEvent[] {
    const group = this.groups.get(groupId);
    if (!group || group.angles.length < 2) return [];

    // Simulate AI suggestions based on even distribution
    const suggestions: MultiCamSwitchEvent[] = [];
    const segmentDuration = group.totalDurationSeconds / (group.angles.length * 2);
    let currentAngleIndex = 0;

    for (let t = segmentDuration; t < group.totalDurationSeconds; t += segmentDuration) {
      const nextAngleIndex = (currentAngleIndex + 1) % group.angles.length;
      suggestions.push({
        id: `ai-switch-${suggestions.length}`,
        fromAngleId: group.angles[currentAngleIndex]!.id,
        toAngleId: group.angles[nextAngleIndex]!.id,
        switchTimeSeconds: t,
        switchType: 'ai-suggestion',
      });
      currentAngleIndex = nextAngleIndex;
    }

    this.emit('ai:suggestions', { groupId, suggestions });
    return suggestions;
  }

  // ─── Events ────────────────────────────────────────────────────────

  on(event: string, callback: (...args: unknown[]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: unknown): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try { handler(data); } catch { /* swallow */ }
      }
    }
  }

  dispose(): void {
    this.groups.clear();
    this.programs.clear();
    this.listeners.clear();
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────

export function createMultiCamSyncEngine(
  config?: Partial<MultiCamSyncEngineConfig>,
): MultiCamSyncEngine {
  return new MultiCamSyncEngine(config);
}
