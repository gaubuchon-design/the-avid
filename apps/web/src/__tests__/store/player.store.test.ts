import { describe, it, expect, beforeEach } from 'vitest';

import { usePlayerStore } from '../../store/player.store';

describe('usePlayerStore', () => {
  beforeEach(() => {
    usePlayerStore.setState({
      isPlaying: false,
      speed: 1,
      currentFrame: 0,
      inPoint: null,
      outPoint: null,
      loopPlayback: false,
      sourceClipId: null,
      activeMonitor: 'source',
      showSafeZones: false,
      activeScope: null,
    });
  });

  it('initial state is correct', () => {
    const state = usePlayerStore.getState();
    expect(state.isPlaying).toBe(false);
    expect(state.speed).toBe(1);
    expect(state.currentFrame).toBe(0);
    expect(state.inPoint).toBeNull();
    expect(state.outPoint).toBeNull();
    expect(state.loopPlayback).toBe(false);
    expect(state.activeMonitor).toBe('source');
  });

  it('play() sets isPlaying to true', () => {
    usePlayerStore.getState().play();
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  it('pause() sets isPlaying to false', () => {
    usePlayerStore.getState().play();
    usePlayerStore.getState().pause();
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('stop() resets playing and speed', () => {
    usePlayerStore.getState().play();
    usePlayerStore.getState().setSpeed(2);
    usePlayerStore.getState().stop();
    const state = usePlayerStore.getState();
    expect(state.isPlaying).toBe(false);
    expect(state.speed).toBe(1);
  });

  it('seekFrame() updates currentFrame', () => {
    usePlayerStore.getState().seekFrame(100);
    expect(usePlayerStore.getState().currentFrame).toBe(100);
  });

  it('setSpeed() updates speed', () => {
    usePlayerStore.getState().setSpeed(4);
    expect(usePlayerStore.getState().speed).toBe(4);
  });

  it('setInPoint() and setOutPoint() update mark points', () => {
    usePlayerStore.getState().setInPoint(10);
    usePlayerStore.getState().setOutPoint(200);
    expect(usePlayerStore.getState().inPoint).toBe(10);
    expect(usePlayerStore.getState().outPoint).toBe(200);
  });

  it('clearInOut() resets in/out points', () => {
    usePlayerStore.getState().setInPoint(10);
    usePlayerStore.getState().setOutPoint(200);
    usePlayerStore.getState().clearInOut();
    expect(usePlayerStore.getState().inPoint).toBeNull();
    expect(usePlayerStore.getState().outPoint).toBeNull();
  });

  it('toggleLoop() toggles loop playback', () => {
    usePlayerStore.getState().toggleLoop();
    expect(usePlayerStore.getState().loopPlayback).toBe(true);
    usePlayerStore.getState().toggleLoop();
    expect(usePlayerStore.getState().loopPlayback).toBe(false);
  });

  it('setSourceClip() sets source clip ID', () => {
    usePlayerStore.getState().setSourceClip('clip_42');
    expect(usePlayerStore.getState().sourceClipId).toBe('clip_42');
  });

  it('setActiveMonitor() switches monitor', () => {
    usePlayerStore.getState().setActiveMonitor('record');
    expect(usePlayerStore.getState().activeMonitor).toBe('record');
  });

  it('toggleSafeZones() toggles safe zones display', () => {
    usePlayerStore.getState().toggleSafeZones();
    expect(usePlayerStore.getState().showSafeZones).toBe(true);
    usePlayerStore.getState().toggleSafeZones();
    expect(usePlayerStore.getState().showSafeZones).toBe(false);
  });

  it('setActiveScope() sets the active scope type', () => {
    usePlayerStore.getState().setActiveScope('waveform');
    expect(usePlayerStore.getState().activeScope).toBe('waveform');
    usePlayerStore.getState().setActiveScope(null);
    expect(usePlayerStore.getState().activeScope).toBeNull();
  });

  it('syncFromEngine() updates frame and playing state', () => {
    usePlayerStore.getState().syncFromEngine(150);
    expect(usePlayerStore.getState().currentFrame).toBe(150);
  });
});
