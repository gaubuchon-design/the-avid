import { describe, it, expect, beforeEach } from 'vitest';

import { useAudioStore } from '../../store/audio.store';

describe('useAudioStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAudioStore.setState({
      tracks: [
        {
          id: 't3', name: 'A1 - Dialogue', gain: 0.85, pan: 0,
          muted: false, solo: false, peakL: 0, peakR: 0,
          eq: Array(10).fill(null).map(() => ({ frequency: 1000, gain: 0, Q: 1 })),
          compressor: { threshold: -24, ratio: 4, attack: 3, release: 250, knee: 10 },
        },
        {
          id: 't4', name: 'A2 - Ambient', gain: 0.6, pan: 0,
          muted: false, solo: false, peakL: 0, peakR: 0,
          eq: Array(10).fill(null).map(() => ({ frequency: 1000, gain: 0, Q: 1 })),
          compressor: { threshold: -24, ratio: 4, attack: 3, release: 250, knee: 10 },
        },
      ],
      masterGain: 1,
      masterMuted: false,
      soloedTrackIds: [],
      activeTab: 'mixer',
      selectedTrackId: null,
      lufsTarget: -14,
      currentLUFS: -14,
    });
  });

  it('initial state has two demo tracks', () => {
    const state = useAudioStore.getState();
    expect(state.tracks.length).toBe(2);
    expect(state.tracks[0]!.id).toBe('t3');
    expect(state.tracks[1]!.id).toBe('t4');
  });

  it('setGain() updates track gain and clamps to [0, 2]', () => {
    useAudioStore.getState().setGain('t3', 1.5);
    expect(useAudioStore.getState().tracks[0]!.gain).toBe(1.5);

    useAudioStore.getState().setGain('t3', 5);
    expect(useAudioStore.getState().tracks[0]!.gain).toBe(2);

    useAudioStore.getState().setGain('t3', -1);
    expect(useAudioStore.getState().tracks[0]!.gain).toBe(0);
  });

  it('setPan() updates track pan and clamps to [-1, 1]', () => {
    useAudioStore.getState().setPan('t3', -0.5);
    expect(useAudioStore.getState().tracks[0]!.pan).toBe(-0.5);

    useAudioStore.getState().setPan('t3', 5);
    expect(useAudioStore.getState().tracks[0]!.pan).toBe(1);
  });

  it('toggleMute() toggles muted state', () => {
    useAudioStore.getState().toggleMute('t3');
    expect(useAudioStore.getState().tracks[0]!.muted).toBe(true);
    useAudioStore.getState().toggleMute('t3');
    expect(useAudioStore.getState().tracks[0]!.muted).toBe(false);
  });

  it('toggleSolo() toggles solo state and updates soloedTrackIds', () => {
    useAudioStore.getState().toggleSolo('t3');
    expect(useAudioStore.getState().tracks[0]!.solo).toBe(true);
    expect(useAudioStore.getState().soloedTrackIds).toContain('t3');

    useAudioStore.getState().toggleSolo('t3');
    expect(useAudioStore.getState().tracks[0]!.solo).toBe(false);
    expect(useAudioStore.getState().soloedTrackIds).not.toContain('t3');
  });

  it('setMasterGain() updates master gain and clamps', () => {
    useAudioStore.getState().setMasterGain(0.5);
    expect(useAudioStore.getState().masterGain).toBe(0.5);

    useAudioStore.getState().setMasterGain(3);
    expect(useAudioStore.getState().masterGain).toBe(2);
  });

  it('toggleMasterMute() toggles master mute', () => {
    useAudioStore.getState().toggleMasterMute();
    expect(useAudioStore.getState().masterMuted).toBe(true);
    useAudioStore.getState().toggleMasterMute();
    expect(useAudioStore.getState().masterMuted).toBe(false);
  });

  it('setActiveTab() changes active tab', () => {
    useAudioStore.getState().setActiveTab('eq');
    expect(useAudioStore.getState().activeTab).toBe('eq');
  });

  it('selectTrack() sets selected track', () => {
    useAudioStore.getState().selectTrack('t4');
    expect(useAudioStore.getState().selectedTrackId).toBe('t4');
  });

  it('setLufsTarget() sets LUFS target', () => {
    useAudioStore.getState().setLufsTarget(-23);
    expect(useAudioStore.getState().lufsTarget).toBe(-23);
  });

  it('updateLUFS() updates current LUFS reading', () => {
    useAudioStore.getState().updateLUFS(-12.5);
    expect(useAudioStore.getState().currentLUFS).toBe(-12.5);
  });

  it('updateMeter() sets peak values for a track', () => {
    useAudioStore.getState().updateMeter('t3', 0.8, 0.6);
    const track = useAudioStore.getState().tracks[0];
    expect(track!.peakL!).toBe(0.8);
    expect(track!.peakR!).toBe(0.6);
  });
});
