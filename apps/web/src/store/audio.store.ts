// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Audio Mixer Store
// ═══════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { audioEngine } from '../engine/AudioEngine';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AudioTrackState {
  id: string;
  name: string;
  gain: number;      // 0-2 (1 = unity)
  pan: number;       // -1 to 1
  muted: boolean;
  solo: boolean;
  peakL: number;     // 0-1
  peakR: number;     // 0-1
  eq: { frequency: number; gain: number; Q: number }[];
  compressor: {
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
    knee: number;
  };
}

export interface AudioState {
  tracks: AudioTrackState[];
  masterGain: number;
  masterMuted: boolean;
  soloedTrackIds: string[];
  activeTab: 'mixer' | 'eq' | 'dynamics';
  selectedTrackId: string | null;
  lufsTarget: number;
  currentLUFS: number;
}

interface AudioActions {
  setGain: (trackId: string, gain: number) => void;
  setPan: (trackId: string, pan: number) => void;
  toggleMute: (trackId: string) => void;
  toggleSolo: (trackId: string) => void;
  setMasterGain: (gain: number) => void;
  toggleMasterMute: () => void;
  setEQBand: (trackId: string, band: number, params: { frequency: number; gain: number; Q: number }) => void;
  setCompressorParam: (trackId: string, param: keyof AudioTrackState['compressor'], value: number) => void;
  updateMeter: (trackId: string, peakL: number, peakR: number) => void;
  setActiveTab: (tab: 'mixer' | 'eq' | 'dynamics') => void;
  selectTrack: (trackId: string | null) => void;
  setLufsTarget: (target: number) => void;
  updateLUFS: (lufs: number) => void;
}

// ─── Default EQ bands ──────────────────────────────────────────────────────

const DEFAULT_EQ_BANDS = [
  { frequency: 31,    gain: 0, Q: 0.7 },   // Low Shelf
  { frequency: 62,    gain: 0, Q: 1.0 },
  { frequency: 125,   gain: 0, Q: 1.0 },
  { frequency: 250,   gain: 0, Q: 1.0 },
  { frequency: 500,   gain: 0, Q: 1.0 },
  { frequency: 1000,  gain: 0, Q: 1.0 },
  { frequency: 2000,  gain: 0, Q: 1.0 },
  { frequency: 4000,  gain: 0, Q: 1.0 },
  { frequency: 8000,  gain: 0, Q: 1.0 },
  { frequency: 16000, gain: 0, Q: 0.7 },   // High Shelf
];

const DEFAULT_COMPRESSOR = {
  threshold: -24,
  ratio: 4,
  attack: 3,      // ms
  release: 250,   // ms
  knee: 10,
};

// ─── Demo tracks (matching editor.store tracks t3 A1, t4 A2) ──────────────

function makeTrack(id: string, name: string, gain: number): AudioTrackState {
  return {
    id,
    name,
    gain,
    pan: 0,
    muted: false,
    solo: false,
    peakL: 0,
    peakR: 0,
    eq: DEFAULT_EQ_BANDS.map((b) => ({ ...b })),
    compressor: { ...DEFAULT_COMPRESSOR },
  };
}

const DEMO_AUDIO_TRACKS: AudioTrackState[] = [
  makeTrack('t3', 'A1 - Dialogue', 0.85),
  makeTrack('t4', 'A2 - Ambient', 0.6),
];

// ─── Store ─────────────────────────────────────────────────────────────────

export const useAudioStore = create<AudioState & AudioActions>()(
  immer((set) => ({
    // State
    tracks: DEMO_AUDIO_TRACKS,
    masterGain: 1,
    masterMuted: false,
    soloedTrackIds: [],
    activeTab: 'mixer',
    selectedTrackId: null,
    lufsTarget: -14,
    currentLUFS: -14,

    // Actions
    setGain: (trackId, gain) => set((s) => {
      const t = s.tracks.find((t) => t.id === trackId);
      if (t) {
        t.gain = Math.max(0, Math.min(2, gain));
        audioEngine.setTrackGain(trackId, t.gain);
      }
    }),

    setPan: (trackId, pan) => set((s) => {
      const t = s.tracks.find((t) => t.id === trackId);
      if (t) {
        t.pan = Math.max(-1, Math.min(1, pan));
        audioEngine.setTrackPan(trackId, t.pan);
      }
    }),

    toggleMute: (trackId) => set((s) => {
      const t = s.tracks.find((t) => t.id === trackId);
      if (t) {
        t.muted = !t.muted;
        audioEngine.setTrackMute(trackId, t.muted);
      }
    }),

    toggleSolo: (trackId) => set((s) => {
      const t = s.tracks.find((t) => t.id === trackId);
      if (t) {
        t.solo = !t.solo;
        if (t.solo) {
          if (!s.soloedTrackIds.includes(trackId)) {
            s.soloedTrackIds.push(trackId);
          }
        } else {
          s.soloedTrackIds = s.soloedTrackIds.filter((id) => id !== trackId);
        }
        audioEngine.setTrackSolo(trackId, t.solo);
      }
    }),

    setMasterGain: (gain) => set((s) => {
      s.masterGain = Math.max(0, Math.min(2, gain));
      audioEngine.setMasterGain(s.masterGain);
    }),

    toggleMasterMute: () => set((s) => {
      s.masterMuted = !s.masterMuted;
      audioEngine.setMasterGain(s.masterMuted ? 0 : s.masterGain);
    }),

    setEQBand: (trackId, band, params) => set((s) => {
      const t = s.tracks.find((t) => t.id === trackId);
      if (t && band >= 0 && band < t.eq.length) {
        t.eq[band] = { ...params };
        audioEngine.setEQ(trackId, band, params);
      }
    }),

    setCompressorParam: (trackId, param, value) => set((s) => {
      const t = s.tracks.find((t) => t.id === trackId);
      if (t) {
        t.compressor[param] = value;
        audioEngine.setCompressor(trackId, {
          ...t.compressor,
          attack: t.compressor.attack / 1000,  // ms -> seconds for Web Audio
          release: t.compressor.release / 1000,
        });
      }
    }),

    updateMeter: (trackId, peakL, peakR) => set((s) => {
      const t = s.tracks.find((t) => t.id === trackId);
      if (t) {
        t.peakL = peakL;
        t.peakR = peakR;
      }
    }),

    setActiveTab: (tab) => set((s) => {
      s.activeTab = tab;
    }),

    selectTrack: (trackId) => set((s) => {
      s.selectedTrackId = trackId;
    }),

    setLufsTarget: (target) => set((s) => {
      s.lufsTarget = target;
    }),

    updateLUFS: (lufs) => set((s) => {
      s.currentLUFS = lufs;
    }),
  }))
);
