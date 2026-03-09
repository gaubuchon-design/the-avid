// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Broadcast Audio Track Presets (N-11)
//  Default audio track assignments for broadcast news editing:
//  A1=Dialogue, A2=NatSound, A3=Music with calibrated levels.
//  LUFS target -23 EBU R128 for broadcast compliance.
// ═══════════════════════════════════════════════════════════════════════════

import type { BroadcastAudioPreset, BroadcastAudioRole, BroadcastLoudnessTarget } from '../news/types';

// ─── Loudness Standards ────────────────────────────────────────────────────

export const EBU_R128: BroadcastLoudnessTarget = {
  standard: 'EBU_R128',
  integratedLUFS: -23,
  truePeakDBTP: -1,
  loudnessRange: 20,
  shortTermMax: -18,
};

export const ATSC_A85: BroadcastLoudnessTarget = {
  standard: 'ATSC_A85',
  integratedLUFS: -24,
  truePeakDBTP: -2,
  loudnessRange: undefined,
  shortTermMax: undefined,
};

export const ARIB_TR_B32: BroadcastLoudnessTarget = {
  standard: 'ARIB_TR_B32',
  integratedLUFS: -24,
  truePeakDBTP: -1,
  loudnessRange: undefined,
  shortTermMax: undefined,
};

export const LOUDNESS_TARGETS: Record<string, BroadcastLoudnessTarget> = {
  EBU_R128,
  ATSC_A85,
  ARIB_TR_B32,
};

// ─── Broadcast Track Presets ───────────────────────────────────────────────

export const BROADCAST_DIALOGUE_PRESET: BroadcastAudioPreset = {
  id: 'broadcast-a1-dialogue',
  trackName: 'A1',
  defaultLevel: -12,
  role: 'DIALOGUE',
  panPosition: 0,
  soloIsolate: false,
};

export const BROADCAST_NAT_SOUND_PRESET: BroadcastAudioPreset = {
  id: 'broadcast-a2-natsound',
  trackName: 'A2',
  defaultLevel: -18,
  role: 'NAT_SOUND',
  panPosition: 0,
  soloIsolate: false,
};

export const BROADCAST_MUSIC_PRESET: BroadcastAudioPreset = {
  id: 'broadcast-a3-music',
  trackName: 'A3',
  defaultLevel: -20,
  role: 'MUSIC',
  panPosition: 0,
  soloIsolate: false,
};

export const BROADCAST_EFFECTS_PRESET: BroadcastAudioPreset = {
  id: 'broadcast-a4-effects',
  trackName: 'A4',
  defaultLevel: -18,
  role: 'EFFECTS',
  panPosition: 0,
  soloIsolate: false,
};

export const BROADCAST_MIX_PRESET: BroadcastAudioPreset = {
  id: 'broadcast-mix',
  trackName: 'MIX',
  defaultLevel: -14,
  role: 'MIX',
  panPosition: 0,
  soloIsolate: true,
};

// ─── Preset Collections ────────────────────────────────────────────────────

export const STANDARD_NEWS_PRESETS: BroadcastAudioPreset[] = [
  BROADCAST_DIALOGUE_PRESET,
  BROADCAST_NAT_SOUND_PRESET,
  BROADCAST_MUSIC_PRESET,
];

export const EXTENDED_NEWS_PRESETS: BroadcastAudioPreset[] = [
  BROADCAST_DIALOGUE_PRESET,
  BROADCAST_NAT_SOUND_PRESET,
  BROADCAST_MUSIC_PRESET,
  BROADCAST_EFFECTS_PRESET,
  BROADCAST_MIX_PRESET,
];

// ─── Utility Functions ─────────────────────────────────────────────────────

/**
 * Convert a dB level to a linear gain value (0-1 range, unity = 1).
 */
export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Convert a linear gain value (0-1) to dB.
 */
export function linearToDb(linear: number): number {
  if (linear <= 0) return -Infinity;
  return 20 * Math.log10(linear);
}

/**
 * Get the broadcast preset for a given audio role.
 */
export function getPresetForRole(role: BroadcastAudioRole): BroadcastAudioPreset | undefined {
  return EXTENDED_NEWS_PRESETS.find((p) => p.role === role);
}

/**
 * Get the recommended default level (in dB) for a given track role.
 */
export function getDefaultLevelForRole(role: BroadcastAudioRole): number {
  const preset = getPresetForRole(role);
  return preset?.defaultLevel ?? -14;
}

/**
 * Check if a measured LUFS value complies with a given loudness target.
 */
export function isLoudnessCompliant(
  measuredLUFS: number,
  target: BroadcastLoudnessTarget,
  toleranceLU: number = 1.0,
): boolean {
  return Math.abs(measuredLUFS - target.integratedLUFS) <= toleranceLU;
}

/**
 * Calculate the gain adjustment needed to reach the target LUFS.
 */
export function calculateLoudnessAdjustment(
  currentLUFS: number,
  target: BroadcastLoudnessTarget,
): number {
  return target.integratedLUFS - currentLUFS;
}

/**
 * Map track names to broadcast audio presets for a standard news project.
 */
export function mapTracksToPresets(
  trackNames: string[],
): Map<string, BroadcastAudioPreset> {
  const result = new Map<string, BroadcastAudioPreset>();
  const roleOrder: BroadcastAudioRole[] = ['DIALOGUE', 'NAT_SOUND', 'MUSIC', 'EFFECTS', 'MIX'];
  let roleIndex = 0;

  for (const name of trackNames) {
    if (roleIndex < roleOrder.length) {
      const role = roleOrder[roleIndex];
      if (!role) continue;
      const preset = getPresetForRole(role);
      if (preset) {
        result.set(name, { ...preset, trackName: name });
      }
      roleIndex += 1;
    }
  }

  return result;
}
