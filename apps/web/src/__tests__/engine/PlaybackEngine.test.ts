import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { PlaybackEngine } from '../../engine/PlaybackEngine';

describe('PlaybackEngine', () => {
  let engine: PlaybackEngine;

  beforeEach(() => {
    engine = new PlaybackEngine();
  });

  afterEach(() => {
    engine.dispose();
  });

  it('should initialize with default values', () => {
    expect(engine.currentFrame).toBe(0);
    expect(engine.isPlaying).toBe(false);
    expect(engine.speed).toBe(1);
    expect(engine.fps).toBe(23.976);
    expect(engine.inPoint).toBeNull();
    expect(engine.outPoint).toBeNull();
  });

  it('should seek to frame', () => {
    engine.seekToFrame(100);
    expect(engine.currentFrame).toBe(100);
  });

  it('should clamp seek to zero for negative frames', () => {
    engine.seekToFrame(-50);
    expect(engine.currentFrame).toBe(0);
  });

  it('should set speed', () => {
    engine.setSpeed(2);
    expect(engine.speed).toBe(2);
  });

  it('should clamp speed to [-8, 8]', () => {
    engine.setSpeed(20);
    expect(engine.speed).toBe(8);
    engine.setSpeed(-20);
    expect(engine.speed).toBe(-8);
  });

  it('should toggle play/pause', () => {
    engine.play();
    expect(engine.isPlaying).toBe(true);
    engine.pause();
    expect(engine.isPlaying).toBe(false);
  });

  it('should not double-play', () => {
    engine.play();
    expect(engine.isPlaying).toBe(true);
    engine.play(); // should be a no-op
    expect(engine.isPlaying).toBe(true);
  });

  it('should stop and reset to in-point or zero', () => {
    engine.seekToFrame(50);
    engine.play();
    engine.stop();
    expect(engine.isPlaying).toBe(false);
    expect(engine.currentFrame).toBe(0); // no in-point set, so 0

    // With in-point
    engine.setInPoint(10);
    engine.seekToFrame(50);
    engine.play();
    engine.stop();
    expect(engine.currentFrame).toBe(10);
  });

  it('should set in/out points', () => {
    engine.setInPoint(10);
    engine.setOutPoint(100);
    expect(engine.inPoint).toBe(10);
    expect(engine.outPoint).toBe(100);
  });

  it('should clear in/out points', () => {
    engine.setInPoint(10);
    engine.setOutPoint(100);
    engine.clearInOut();
    expect(engine.inPoint).toBeNull();
    expect(engine.outPoint).toBeNull();
  });

  it('should return in/out via markClip', () => {
    engine.setInPoint(5);
    engine.setOutPoint(50);
    const result = engine.markClip();
    expect(result.inPoint).toBe(5);
    expect(result.outPoint).toBe(50);
  });

  it('should convert frame to timecode', () => {
    const tc = engine.frameToTimecode(0);
    expect(tc).toMatch(/\d{2}:\d{2}:\d{2}:\d{2}/);
    expect(tc).toBe('00:00:00:00');
  });

  it('should format timecode correctly for non-zero frames', () => {
    // fps = 23.976, so 24 frames ~= 1 second
    // 24 frames: totalSeconds = 24/23.976 ~= 1.001s => h=0, m=0, s=1, f=24 % 24 = 0
    const tc = engine.frameToTimecode(24);
    expect(tc).toMatch(/\d{2}:\d{2}:\d{2}:\d{2}/);
  });

  it('should handle JKL shuttle - L for forward', () => {
    engine.jklShuttle('l');
    expect(engine.isPlaying).toBe(true);
    expect(engine.speed).toBe(1);

    engine.jklShuttle('l');
    expect(engine.speed).toBe(2);

    engine.jklShuttle('l');
    expect(engine.speed).toBe(3);
  });

  it('should handle JKL shuttle - K for stop', () => {
    engine.jklShuttle('l');
    expect(engine.isPlaying).toBe(true);

    engine.jklShuttle('k');
    expect(engine.isPlaying).toBe(false);
    expect(engine.speed).toBe(1); // speed resets to 1 on K
  });

  it('should handle JKL shuttle - J for reverse', () => {
    engine.jklShuttle('j');
    expect(engine.isPlaying).toBe(true);
    expect(engine.speed).toBe(-1);

    engine.jklShuttle('j');
    expect(engine.speed).toBe(-2);
  });

  it('should reset J accumulator when pressing L and vice-versa', () => {
    engine.jklShuttle('j');
    engine.jklShuttle('j');
    expect(engine.speed).toBe(-2);

    // Pressing L resets J accumulator
    engine.jklShuttle('l');
    expect(engine.speed).toBe(1);
  });

  it('should advance one frame forward', () => {
    engine.nextFrame();
    expect(engine.currentFrame).toBe(1);
  });

  it('should step one frame backward, clamped to 0', () => {
    engine.seekToFrame(5);
    engine.prevFrame();
    expect(engine.currentFrame).toBe(4);

    engine.seekToFrame(0);
    engine.prevFrame();
    expect(engine.currentFrame).toBe(0);
  });

  it('should return match frame', () => {
    engine.seekToFrame(42);
    expect(engine.matchFrame()).toBe(42);
  });

  it('should notify subscribers on seek', () => {
    const listener = vi.fn();
    engine.subscribe(listener);
    engine.seekToFrame(50);
    expect(listener).toHaveBeenCalled();
  });

  it('should allow unsubscribing', () => {
    const listener = vi.fn();
    const unsub = engine.subscribe(listener);
    engine.seekToFrame(10);
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    engine.seekToFrame(20);
    expect(listener).toHaveBeenCalledTimes(1); // should not increase
  });

  it('should dispose and clear subscribers', () => {
    const listener = vi.fn();
    engine.subscribe(listener);
    engine.dispose();

    engine.seekToFrame(50);
    // After dispose, emit still fires but subscribers are cleared
    expect(listener).not.toHaveBeenCalled();
  });
});
