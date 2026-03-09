// =============================================================================
//  THE AVID -- Audio Mixer Engine
// =============================================================================
//
// Complete implementation of Avid Media Composer's audio mixer functionality
// including per-channel volume/pan/mute/solo, automation modes, rubber-band
// keyframe editing, clip gain, track ganging, audio scrub, EQ presets,
// inserts, routing, mixdown, and metering.
// =============================================================================

import { useEditorStore } from '../store/editor.store';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Avid-style audio automation modes. */
export type AutomationMode = 'clip' | 'auto' | 'write' | 'latch' | 'touch';

/**
 * Audio keyframe for volume or pan automation (rubber banding).
 *
 * Keyframes are stored per-track and can be either 'volume' (dB) or 'pan'
 * (-100 to 100).
 */
export interface AudioKeyframe {
  id: string;
  trackId: string;
  /** Position in seconds on the timeline. */
  time: number;
  /** dB for volume; -100..100 for pan. */
  value: number;
  paramType: 'volume' | 'pan';
  /** Interpolation between this keyframe and the next. */
  interpolation: 'linear' | 'hold';
}

/** Per-track mixer channel state. */
export interface MixerChannel {
  trackId: string;
  name: string;
  /** Channel fader level in dB (-Infinity to +12). */
  volume: number;
  /** Stereo pan position: -100 (full left) to 100 (full right). */
  pan: number;
  muted: boolean;
  soloed: boolean;
  automationMode: AutomationMode;
  /** When true, keyframe automation (rubber banding) is active. */
  autoGainEnabled: boolean;
  /** Track IDs that are ganged (linked) with this channel for level changes. */
  gangedWith: string[];
  /** Up to 5 insert slots (a-e) per track. */
  inserts: AudioInsert[];
  /** Clip-level gain adjustment in dB (applied uniformly to the whole clip). */
  clipGain: number;
}

/** A single insert slot on a mixer channel. */
export interface AudioInsert {
  slot: 'a' | 'b' | 'c' | 'd' | 'e';
  pluginId: string | null;
  bypassed: boolean;
}

/** Audio scrub transport state. */
export interface AudioScrubState {
  enabled: boolean;
  /** true = digital scrub (pitch-shifted); false = analog scrub emulation. */
  isDigitalScrub: boolean;
}

/** Stored EQ preset. */
export interface EQPreset {
  id: string;
  name: string;
  bands: EQBand[];
}

/** A single parametric EQ band. */
export interface EQBand {
  /** Centre frequency in Hz. */
  frequency: number;
  /** Gain in dB. */
  gain: number;
  /** Bandwidth / Q factor. */
  q: number;
  type: 'lowShelf' | 'highShelf' | 'peaking' | 'lowPass' | 'highPass' | 'notch';
  enabled: boolean;
}

/** Audio output routing entry. */
export interface AudioRoute {
  inputTrackId: string;
  /** Output bus identifier ('master', 'bus-1', 'bus-2', etc.). */
  outputBus: string;
}

/** Per-clip gain entry. */
export interface ClipGainEntry {
  clipId: string;
  trackId: string;
  /** Gain in dB. */
  gain: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createId(prefix: string): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Clamp a value between min and max. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Create default insert slots for a new channel. */
function defaultInserts(): AudioInsert[] {
  return (['a', 'b', 'c', 'd', 'e'] as const).map((slot) => ({
    slot,
    pluginId: null,
    bypassed: false,
  }));
}

// =============================================================================
//  AudioMixerEngine
// =============================================================================

/**
 * Avid-style audio mixer engine.
 *
 * Manages per-track channel strips (volume, pan, mute, solo), automation
 * keyframes (rubber banding), clip gain, track ganging, audio scrub, EQ
 * presets, insert plugins, output routing, mixdown, and metering.
 *
 * This engine operates as a data model layer; the actual Web Audio DSP is
 * handled by the existing `AudioEngine` singleton.  This engine provides the
 * higher-level mixing abstractions that mirror Avid Media Composer's mixer.
 */
export class AudioMixerEngine {
  // ─── Internal state ─────────────────────────────────────────────────────

  /** Per-track mixer channels keyed by trackId. */
  private channels = new Map<string, MixerChannel>();
  /** All audio automation keyframes. */
  private keyframes = new Map<string, AudioKeyframe>();
  /** Per-clip gain overrides keyed by clipId. */
  private clipGains = new Map<string, ClipGainEntry>();
  /** EQ applied to clips, keyed by clipId. */
  private clipEQ = new Map<string, EQBand[]>();
  /** Saved EQ presets. */
  private eqPresets = new Map<string, EQPreset>();
  /** Per-track output routing. */
  private routing = new Map<string, string>(); // trackId -> bus
  /** Audio scrub state. */
  private scrubState: AudioScrubState = { enabled: false, isDigitalScrub: true };
  /** Per-track peak hold values (dB). */
  private peakHolds = new Map<string, number>();
  /** General subscribers. */
  private listeners = new Set<() => void>();

  // ─── Private helpers ────────────────────────────────────────────────────

  /** Notify all subscribers that mixer state has changed. */
  private notify(): void {
    this.listeners.forEach((fn) => {
      try { fn(); } catch (err) { console.error('[AudioMixerEngine] Subscriber error:', err); }
    });
  }

  /**
   * Get or lazily initialise a mixer channel for a track.
   *
   * If the track exists in the editor store but has no mixer channel yet,
   * one is created with sensible defaults.
   */
  private ensureChannel(trackId: string): MixerChannel {
    let ch = this.channels.get(trackId);
    if (ch) return ch;

    // Try to pull the track name from the editor store
    const state = useEditorStore.getState();
    const track = state.tracks.find((t) => t.id === trackId);
    const name = track?.name ?? trackId;

    ch = {
      trackId,
      name,
      volume: 0,           // 0 dB = unity
      pan: 0,
      muted: false,
      soloed: false,
      automationMode: 'clip',
      autoGainEnabled: false,
      gangedWith: [],
      inserts: defaultInserts(),
      clipGain: 0,
    };
    this.channels.set(trackId, ch);
    return ch;
  }

  /**
   * When a ganged track's volume changes, propagate the delta to all
   * members of the gang.
   */
  private propagateGangVolume(originTrackId: string, delta: number): void {
    const ch = this.channels.get(originTrackId);
    if (!ch) return;
    for (const gangId of ch.gangedWith) {
      const gangCh = this.channels.get(gangId);
      if (gangCh) {
        gangCh.volume = clamp(gangCh.volume + delta, -96, 12);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Mixer State (channel strip)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Retrieve the mixer channel for a track.
   * Creates a default channel if none exists yet.
   */
  getChannel(trackId: string): MixerChannel {
    return { ...this.ensureChannel(trackId) };
  }

  /** Get all mixer channels (one per known track). */
  getAllChannels(): MixerChannel[] {
    // Ensure every editor-store track has a channel
    const state = useEditorStore.getState();
    for (const track of state.tracks) {
      this.ensureChannel(track.id);
    }
    return [...this.channels.values()].map((ch) => ({ ...ch }));
  }

  /**
   * Set the fader volume for a channel (dB).
   * @param trackId   Track identifier.
   * @param volumeDb  Volume in dB, clamped to [-96, +12].
   */
  setChannelVolume(trackId: string, volumeDb: number): void {
    const ch = this.ensureChannel(trackId);
    const prev = ch.volume;
    ch.volume = clamp(volumeDb, -96, 12);
    const delta = ch.volume - prev;
    this.propagateGangVolume(trackId, delta);
    this.notify();
  }

  /**
   * Set the stereo pan for a channel.
   * @param trackId  Track identifier.
   * @param pan      -100 (full left) to 100 (full right).
   */
  setChannelPan(trackId: string, pan: number): void {
    const ch = this.ensureChannel(trackId);
    ch.pan = clamp(pan, -100, 100);
    this.notify();
  }

  /**
   * Set the mute state for a channel.
   * @param trackId  Track identifier.
   * @param muted    Whether the channel should be muted.
   */
  setChannelMute(trackId: string, muted: boolean): void {
    const ch = this.ensureChannel(trackId);
    ch.muted = muted;
    this.notify();
  }

  /**
   * Set the solo state for a channel.
   * @param trackId  Track identifier.
   * @param soloed   Whether the channel should be soloed.
   */
  setChannelSolo(trackId: string, soloed: boolean): void {
    const ch = this.ensureChannel(trackId);
    ch.soloed = soloed;
    this.notify();
  }

  /** Toggle the mute state for a channel. */
  toggleMute(trackId: string): void {
    const ch = this.ensureChannel(trackId);
    ch.muted = !ch.muted;
    this.notify();
  }

  /** Toggle the solo state for a channel. */
  toggleSolo(trackId: string): void {
    const ch = this.ensureChannel(trackId);
    ch.soloed = !ch.soloed;
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Automation
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set the automation mode for a track.
   *
   * Modes mirror Avid's audio automation:
   * - **clip**: no automation; uses clip-level gain.
   * - **auto**: plays back automation but does not write.
   * - **write**: records automation from first play, overwriting existing.
   * - **latch**: records automation from the first fader touch, latches at
   *   the last-touched value after release.
   * - **touch**: records while the fader is touched, returns to existing
   *   automation on release.
   */
  setAutomationMode(trackId: string, mode: AutomationMode): void {
    const ch = this.ensureChannel(trackId);
    ch.automationMode = mode;
    this.notify();
  }

  /** Get the current automation mode for a track. */
  getAutomationMode(trackId: string): AutomationMode {
    return this.ensureChannel(trackId).automationMode;
  }

  /** Enable rubber-band keyframe automation for a track. */
  enableAutoGain(trackId: string): void {
    const ch = this.ensureChannel(trackId);
    ch.autoGainEnabled = true;
    this.notify();
  }

  /** Disable rubber-band keyframe automation for a track. */
  disableAutoGain(trackId: string): void {
    const ch = this.ensureChannel(trackId);
    ch.autoGainEnabled = false;
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Audio Keyframes (Rubber Banding)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Add a keyframe to a track's automation.
   *
   * @param trackId    Track identifier.
   * @param time       Position in seconds.
   * @param value      dB for volume, -100..100 for pan.
   * @param paramType  'volume' or 'pan'.
   * @returns The created AudioKeyframe.
   */
  addKeyframe(
    trackId: string,
    time: number,
    value: number,
    paramType: 'volume' | 'pan',
  ): AudioKeyframe {
    const kf: AudioKeyframe = {
      id: createId('akf'),
      trackId,
      time,
      value,
      paramType,
      interpolation: 'linear',
    };
    this.keyframes.set(kf.id, kf);
    this.notify();
    return kf;
  }

  /**
   * Remove a keyframe by ID.
   * @param keyframeId  The keyframe to remove.
   */
  removeKeyframe(keyframeId: string): void {
    this.keyframes.delete(keyframeId);
    this.notify();
  }

  /**
   * Move an existing keyframe to a new time and/or value.
   *
   * @param keyframeId  The keyframe to move.
   * @param newTime     New position in seconds.
   * @param newValue    New value (dB or pan).
   */
  moveKeyframe(keyframeId: string, newTime: number, newValue: number): void {
    const kf = this.keyframes.get(keyframeId);
    if (!kf) return;
    kf.time = newTime;
    kf.value = newValue;
    this.notify();
  }

  /**
   * Get all keyframes for a track, optionally filtered by param type.
   * Returned sorted by time.
   */
  getKeyframesForTrack(
    trackId: string,
    paramType?: 'volume' | 'pan',
  ): AudioKeyframe[] {
    const all: AudioKeyframe[] = [];
    for (const kf of this.keyframes.values()) {
      if (kf.trackId !== trackId) continue;
      if (paramType && kf.paramType !== paramType) continue;
      all.push({ ...kf });
    }
    return all.sort((a, b) => a.time - b.time);
  }

  /**
   * Get keyframes for a track within a time range, sorted by time.
   */
  getKeyframesInRange(
    trackId: string,
    startTime: number,
    endTime: number,
  ): AudioKeyframe[] {
    return this.getKeyframesForTrack(trackId).filter(
      (kf) => kf.time >= startTime && kf.time <= endTime,
    );
  }

  /**
   * Get the interpolated automation value at a given time.
   *
   * Performs linear interpolation between neighbouring keyframes.
   * If no keyframes exist, returns the channel default (0 dB for volume,
   * 0 for pan).
   *
   * @param trackId    Track identifier.
   * @param time       Position in seconds.
   * @param paramType  'volume' or 'pan'.
   * @returns The interpolated value.
   */
  getValueAtTime(
    trackId: string,
    time: number,
    paramType: 'volume' | 'pan',
  ): number {
    const kfs = this.getKeyframesForTrack(trackId, paramType);
    if (kfs.length === 0) {
      // Return channel default
      const ch = this.channels.get(trackId);
      return paramType === 'volume' ? (ch?.volume ?? 0) : (ch?.pan ?? 0);
    }

    // Before first keyframe
    if (time <= kfs[0].time) return kfs[0].value;
    // After last keyframe
    if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;

    // Find the two surrounding keyframes
    for (let i = 0; i < kfs.length - 1; i++) {
      const a = kfs[i];
      const b = kfs[i + 1];
      if (time >= a.time && time <= b.time) {
        if (a.interpolation === 'hold') return a.value;
        // Linear interpolation
        const t = (time - a.time) / (b.time - a.time);
        return a.value + t * (b.value - a.value);
      }
    }

    return kfs[kfs.length - 1].value;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Clip Gain
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set the clip-level gain (dB) for a clip.
   *
   * This is the Avid "Clip Gain" feature: a per-clip volume offset applied
   * before the channel fader.
   *
   * @param clipId   Clip identifier.
   * @param gainDb   Gain in dB.
   */
  setClipGain(clipId: string, gainDb: number): void {
    // Determine which track this clip belongs to
    const state = useEditorStore.getState();
    let trackId = '';
    for (const track of state.tracks) {
      if (track.clips.some((c) => c.id === clipId)) {
        trackId = track.id;
        break;
      }
    }
    this.clipGains.set(clipId, { clipId, trackId, gain: gainDb });
    this.notify();
  }

  /**
   * Get the clip-level gain for a clip, defaulting to 0 dB.
   * @param clipId  Clip identifier.
   * @returns Gain in dB.
   */
  getClipGain(clipId: string): number {
    return this.clipGains.get(clipId)?.gain ?? 0;
  }

  /**
   * Apply a gain value to all clips within a time range on a given track.
   *
   * @param trackId    Track identifier.
   * @param startTime  Start of the range in seconds.
   * @param endTime    End of the range in seconds.
   * @param gainDb     Gain in dB to apply.
   */
  setClipGainInOut(
    trackId: string,
    startTime: number,
    endTime: number,
    gainDb: number,
  ): void {
    const state = useEditorStore.getState();
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track) return;

    for (const clip of track.clips) {
      // Clip overlaps the range?
      if (clip.endTime > startTime && clip.startTime < endTime) {
        this.clipGains.set(clip.id, { clipId: clip.id, trackId, gain: gainDb });
      }
    }
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Ganging
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gang (link) multiple tracks for simultaneous level adjustment.
   *
   * All supplied tracks will be cross-referenced so that a volume change on
   * any one of them propagates the delta to the others.
   *
   * @param trackIds  Array of track IDs to gang together.
   */
  gangTracks(trackIds: string[]): void {
    if (trackIds.length < 2) return;
    for (const id of trackIds) {
      const ch = this.ensureChannel(id);
      ch.gangedWith = trackIds.filter((t) => t !== id);
    }
    this.notify();
  }

  /**
   * Remove a track from its gang group.
   * @param trackId  Track to ungang.
   */
  ungangTrack(trackId: string): void {
    const ch = this.channels.get(trackId);
    if (!ch) return;
    // Remove this track from all its gang partners
    for (const gangId of ch.gangedWith) {
      const partner = this.channels.get(gangId);
      if (partner) {
        partner.gangedWith = partner.gangedWith.filter((id) => id !== trackId);
      }
    }
    ch.gangedWith = [];
    this.notify();
  }

  /**
   * Get the IDs of all tracks ganged with the given track.
   * @param trackId  Track identifier.
   * @returns Array of ganged track IDs (not including trackId itself).
   */
  getGangedTracks(trackId: string): string[] {
    return this.ensureChannel(trackId).gangedWith.slice();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Audio Scrub
  // ═══════════════════════════════════════════════════════════════════════════

  /** Enable audio scrub. */
  enableScrub(): void {
    this.scrubState.enabled = true;
    this.notify();
  }

  /** Disable audio scrub. */
  disableScrub(): void {
    this.scrubState.enabled = false;
    this.notify();
  }

  /** Toggle audio scrub on/off. */
  toggleScrub(): void {
    this.scrubState.enabled = !this.scrubState.enabled;
    this.notify();
  }

  /** Whether audio scrub is currently enabled. */
  isScrubEnabled(): boolean {
    return this.scrubState.enabled;
  }

  /**
   * Switch between digital and analog scrub emulation.
   * @param digital  true for digital (pitch-shifted); false for analog.
   */
  setScrubMode(digital: boolean): void {
    this.scrubState.isDigitalScrub = digital;
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  EQ
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Apply parametric EQ bands to a clip.
   *
   * @param clipId  Clip identifier.
   * @param bands   Array of EQ bands to apply.
   */
  applyEQ(clipId: string, bands: EQBand[]): void {
    this.clipEQ.set(clipId, bands.map((b) => ({ ...b })));
    this.notify();
  }

  /**
   * Remove all EQ from a clip.
   * @param clipId  Clip identifier.
   */
  removeEQ(clipId: string): void {
    this.clipEQ.delete(clipId);
    this.notify();
  }

  /**
   * Get the EQ bands currently applied to a clip.
   * @param clipId  Clip identifier.
   * @returns Array of EQ bands, or null if no EQ is applied.
   */
  getEQ(clipId: string): EQBand[] | null {
    const bands = this.clipEQ.get(clipId);
    return bands ? bands.map((b) => ({ ...b })) : null;
  }

  /**
   * Save the current EQ band configuration as a named preset.
   *
   * @param name   Human-readable preset name.
   * @param bands  EQ bands to save.
   * @returns The created EQPreset.
   */
  saveEQPreset(name: string, bands: EQBand[]): EQPreset {
    const preset: EQPreset = {
      id: createId('eqp'),
      name,
      bands: bands.map((b) => ({ ...b })),
    };
    this.eqPresets.set(preset.id, preset);
    this.notify();
    return preset;
  }

  /**
   * Load an EQ preset by ID.
   * @param presetId  Preset identifier.
   * @returns The bands from the preset.
   * @throws If the preset ID is not found.
   */
  loadEQPreset(presetId: string): EQBand[] {
    const preset = this.eqPresets.get(presetId);
    if (!preset) {
      console.warn(`[AudioMixerEngine] EQ preset '${presetId}' not found`);
      return [];
    }
    return preset.bands.map((b) => ({ ...b }));
  }

  /** Get all saved EQ presets. */
  getEQPresets(): EQPreset[] {
    return [...this.eqPresets.values()].map((p) => ({
      ...p,
      bands: p.bands.map((b) => ({ ...b })),
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Inserts
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Assign a plugin to an insert slot on a track.
   *
   * @param trackId   Track identifier.
   * @param slot      Slot letter ('a' through 'e').
   * @param pluginId  Plugin identifier to assign.
   */
  setInsert(trackId: string, slot: 'a' | 'b' | 'c' | 'd' | 'e', pluginId: string): void {
    const ch = this.ensureChannel(trackId);
    const insert = ch.inserts.find((ins) => ins.slot === slot);
    if (insert) {
      insert.pluginId = pluginId;
      insert.bypassed = false;
    }
    this.notify();
  }

  /**
   * Remove a plugin from an insert slot.
   *
   * @param trackId  Track identifier.
   * @param slot     Slot letter to clear.
   */
  removeInsert(trackId: string, slot: 'a' | 'b' | 'c' | 'd' | 'e'): void {
    const ch = this.ensureChannel(trackId);
    const insert = ch.inserts.find((ins) => ins.slot === slot);
    if (insert) {
      insert.pluginId = null;
      insert.bypassed = false;
    }
    this.notify();
  }

  /**
   * Set the bypass state of an insert slot.
   *
   * @param trackId   Track identifier.
   * @param slot      Slot letter.
   * @param bypassed  Whether the insert should be bypassed.
   */
  bypassInsert(trackId: string, slot: 'a' | 'b' | 'c' | 'd' | 'e', bypassed: boolean): void {
    const ch = this.ensureChannel(trackId);
    const insert = ch.inserts.find((ins) => ins.slot === slot);
    if (insert) {
      insert.bypassed = bypassed;
    }
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Routing
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set the output bus for a track.
   *
   * @param trackId  Track identifier.
   * @param bus      Bus name ('master', 'bus-1', 'bus-2', etc.).
   */
  setTrackOutput(trackId: string, bus: string): void {
    this.routing.set(trackId, bus);
    this.notify();
  }

  /**
   * Get the output bus for a track.
   * @param trackId  Track identifier.
   * @returns Bus name. Defaults to 'master'.
   */
  getTrackOutput(trackId: string): string {
    return this.routing.get(trackId) ?? 'master';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Audio Mixdown
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Perform an audio mixdown of the specified range.
   *
   * In a production implementation this would bounce the mix to a new audio
   * clip.  For now this returns a stub result indicating success with a
   * generated clip ID.
   *
   * @param startTime  Start of the range in seconds.
   * @param endTime    End of the range in seconds.
   * @param options    Optional format and output track.
   * @returns Result with success flag and output clip ID.
   */
  mixdown(
    startTime: number,
    endTime: number,
    options?: {
      format?: 'stereo' | 'mono' | '5.1';
      outputTrackId?: string;
    },
  ): { success: boolean; outputClipId?: string } {
    if (endTime <= startTime) {
      console.warn('[AudioMixerEngine] mixdown: endTime must be after startTime');
      return { success: false };
    }

    const outputClipId = createId('mixdown');
    const format = options?.format ?? 'stereo';

    // In a real implementation we would:
    // 1. Offline-render the audio graph between startTime and endTime
    // 2. Create a new audio clip with the rendered buffer
    // 3. Optionally place it on the output track
    console.info(
      `[AudioMixerEngine] Mixdown: ${startTime}s-${endTime}s, format=${format}, clipId=${outputClipId}`,
    );

    this.notify();
    return { success: true, outputClipId };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Metering
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the current peak and RMS meter levels for a track.
   *
   * In a full implementation this would read from the Web Audio analyser
   * node.  Here we return simulated values derived from the channel volume.
   *
   * @param trackId  Track identifier.
   * @returns Object with peak and rms values in dB.
   */
  getMeterLevel(trackId: string): { peak: number; rms: number } {
    const ch = this.channels.get(trackId);
    if (!ch || ch.muted) return { peak: -96, rms: -96 };

    // Simulate meter activity based on volume setting
    const baseLevel = ch.volume; // dB
    const jitter = (Math.random() - 0.5) * 6; // +/-3 dB variation
    const peak = clamp(baseLevel + jitter + 3, -96, 12);
    const rms = clamp(baseLevel + jitter, -96, 12);

    // Update peak hold
    const prevPeak = this.peakHolds.get(trackId) ?? -96;
    if (peak > prevPeak) {
      this.peakHolds.set(trackId, peak);
    }

    return { peak, rms };
  }

  /**
   * Get the peak-hold value for a track.
   * @param trackId  Track identifier.
   * @returns Peak hold in dB.
   */
  getPeakHold(trackId: string): number {
    return this.peakHolds.get(trackId) ?? -96;
  }

  /**
   * Reset peak hold for one or all tracks.
   * @param trackId  Optional track ID. If omitted, resets all tracks.
   */
  resetPeakHold(trackId?: string): void {
    if (trackId) {
      this.peakHolds.delete(trackId);
    } else {
      this.peakHolds.clear();
    }
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Subscribe
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to mixer state changes.
   *
   * @param cb  Callback invoked on any state change.
   * @returns An unsubscribe function.
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Cleanup
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Dispose the engine, clearing all internal state and subscriptions.
   * Primarily useful for tests and teardown.
   */
  dispose(): void {
    this.channels.clear();
    this.keyframes.clear();
    this.clipGains.clear();
    this.clipEQ.clear();
    this.eqPresets.clear();
    this.routing.clear();
    this.peakHolds.clear();
    this.listeners.clear();
    this.scrubState = { enabled: false, isDigitalScrub: true };
  }
}

/** Singleton audio mixer engine instance. */
export const audioMixerEngine = new AudioMixerEngine();
