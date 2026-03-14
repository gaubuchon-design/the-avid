// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Audio Mixer Store
// ═══════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { audioEngine } from '../engine/AudioEngine';
import { isDevelopmentEnvironment } from '../lib/runtimeEnvironment';

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
  addTrack: (track: AudioTrackState) => void;
  removeTrack: (trackId: string) => void;
  resetTrackEQ: (trackId: string) => void;
  resetTrackCompressor: (trackId: string) => void;
  resetStore: () => void;
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

const INITIAL_STATE: AudioState = {
  tracks: DEMO_AUDIO_TRACKS,
  masterGain: 1,
  masterMuted: false,
  soloedTrackIds: [],
  activeTab: 'mixer',
  selectedTrackId: null,
  lufsTarget: -14,
  currentLUFS: -14,
};

// ─── Store ─────────────────────────────────────────────────────────────────

export const useAudioStore = create<AudioState & AudioActions>()(
  devtools(
    immer((set) => ({
      // State
      ...INITIAL_STATE,

      // Actions
      setGain: (trackId, gain) => set((s) => {
        const t = s.tracks.find((tr) => tr.id === trackId);
        if (t) {
          t.gain = Math.max(0, Math.min(2, gain));
          audioEngine.setTrackGain(trackId, t.gain);
        }
      }, false, 'audio/setGain'),

      setPan: (trackId, pan) => set((s) => {
        const t = s.tracks.find((tr) => tr.id === trackId);
        if (t) {
          t.pan = Math.max(-1, Math.min(1, pan));
          audioEngine.setTrackPan(trackId, t.pan);
        }
      }, false, 'audio/setPan'),

      toggleMute: (trackId) => set((s) => {
        const t = s.tracks.find((tr) => tr.id === trackId);
        if (t) {
          t.muted = !t.muted;
          audioEngine.setTrackMute(trackId, t.muted);
        }
      }, false, 'audio/toggleMute'),

      toggleSolo: (trackId) => set((s) => {
        const t = s.tracks.find((tr) => tr.id === trackId);
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
      }, false, 'audio/toggleSolo'),

      setMasterGain: (gain) => set((s) => {
        s.masterGain = Math.max(0, Math.min(2, gain));
        audioEngine.setMasterGain(s.masterGain);
      }, false, 'audio/setMasterGain'),

      toggleMasterMute: () => set((s) => {
        s.masterMuted = !s.masterMuted;
        audioEngine.setMasterGain(s.masterMuted ? 0 : s.masterGain);
      }, false, 'audio/toggleMasterMute'),

      setEQBand: (trackId, band, params) => set((s) => {
        const t = s.tracks.find((tr) => tr.id === trackId);
        if (t && band >= 0 && band < t.eq.length) {
          t.eq[band]!.frequency = params.frequency;
          t.eq[band]!.gain = params.gain;
          t.eq[band]!.Q = params.Q;
          audioEngine.setEQ(trackId, band, params);
        }
      }, false, 'audio/setEQBand'),

      setCompressorParam: (trackId, param, value) => set((s) => {
        const t = s.tracks.find((tr) => tr.id === trackId);
        if (t) {
          t.compressor[param] = value;
          audioEngine.setCompressor(trackId, {
            ...t.compressor,
            attack: t.compressor.attack / 1000,  // ms -> seconds for Web Audio
            release: t.compressor.release / 1000,
          });
        }
      }, false, 'audio/setCompressorParam'),

      updateMeter: (trackId, peakL, peakR) => set((s) => {
        const t = s.tracks.find((tr) => tr.id === trackId);
        if (t) {
          t.peakL = peakL;
          t.peakR = peakR;
        }
      }, false, 'audio/updateMeter'),

      setActiveTab: (tab) => set((s) => {
        s.activeTab = tab;
      }, false, 'audio/setActiveTab'),

      selectTrack: (trackId) => set((s) => {
        s.selectedTrackId = trackId;
      }, false, 'audio/selectTrack'),

      setLufsTarget: (target) => set((s) => {
        s.lufsTarget = target;
      }, false, 'audio/setLufsTarget'),

      updateLUFS: (lufs) => set((s) => {
        s.currentLUFS = lufs;
      }, false, 'audio/updateLUFS'),

      addTrack: (track) => set((s) => {
        s.tracks.push(track);
      }, false, 'audio/addTrack'),

      removeTrack: (trackId) => set((s) => {
        s.tracks = s.tracks.filter((t) => t.id !== trackId);
        if (s.selectedTrackId === trackId) {
          s.selectedTrackId = null;
        }
        s.soloedTrackIds = s.soloedTrackIds.filter((id) => id !== trackId);
      }, false, 'audio/removeTrack'),

      resetTrackEQ: (trackId) => set((s) => {
        const t = s.tracks.find((tr) => tr.id === trackId);
        if (t) {
          t.eq = DEFAULT_EQ_BANDS.map((b) => ({ ...b }));
        }
      }, false, 'audio/resetTrackEQ'),

      resetTrackCompressor: (trackId) => set((s) => {
        const t = s.tracks.find((tr) => tr.id === trackId);
        if (t) {
          t.compressor = { ...DEFAULT_COMPRESSOR };
        }
      }, false, 'audio/resetTrackCompressor'),

      resetStore: () => set(() => ({
        ...INITIAL_STATE,
        tracks: DEMO_AUDIO_TRACKS.map((t) => ({
          ...t,
          eq: DEFAULT_EQ_BANDS.map((b) => ({ ...b })),
          compressor: { ...DEFAULT_COMPRESSOR },
        })),
      }), true, 'audio/resetStore'),
    })),
    { name: 'AudioStore', enabled: isDevelopmentEnvironment() },
  )
);

// ─── Named Selectors ────────────────────────────────────────────────────────

type AudioStoreState = AudioState & AudioActions;

export const selectAudioTracks = (state: AudioStoreState) => state.tracks;
export const selectMasterGain = (state: AudioStoreState) => state.masterGain;
export const selectMasterMuted = (state: AudioStoreState) => state.masterMuted;
export const selectSoloedTrackIds = (state: AudioStoreState) => state.soloedTrackIds;
export const selectAudioActiveTab = (state: AudioStoreState) => state.activeTab;
export const selectSelectedAudioTrackId = (state: AudioStoreState) => state.selectedTrackId;
export const selectLufsTarget = (state: AudioStoreState) => state.lufsTarget;
export const selectCurrentLUFS = (state: AudioStoreState) => state.currentLUFS;
export const selectHasSoloedTracks = (state: AudioStoreState) => state.soloedTrackIds.length > 0;
export const selectSelectedAudioTrack = (state: AudioStoreState) =>
  state.tracks.find((t) => t.id === state.selectedTrackId) ?? null;
export const selectLufsDelta = (state: AudioStoreState) =>
  state.currentLUFS - state.lufsTarget;
