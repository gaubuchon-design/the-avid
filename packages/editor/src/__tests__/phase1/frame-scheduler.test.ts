import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { FrameScheduler } from '../../engine/FrameScheduler';
import type { FrameDelivery } from '../../engine/FrameScheduler';

describe('FrameScheduler', () => {
  let scheduler: FrameScheduler;

  beforeEach(() => {
    scheduler = new FrameScheduler();
    scheduler.configure(24, 100); // 24fps, 100s duration
  });

  afterEach(() => {
    scheduler.dispose();
  });

  it('initialises with correct default state', () => {
    const state = scheduler.getState();
    expect(state.running).toBe(false);
    expect(state.fps).toBe(24);
    expect(state.duration).toBe(100);
    expect(state.currentFrame).toBe(0);
    expect(state.inPoint).toBeNull();
    expect(state.outPoint).toBeNull();
  });

  it('delivers a frame on seek', () => {
    const deliveries: FrameDelivery[] = [];
    scheduler.onFrame((d) => deliveries.push(d));

    scheduler.seek(2.5);

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.frameNumber).toBe(Math.floor(2.5 * 24)); // 60
    expect(deliveries[0]!.timelineTime).toBe(2.5);
    expect(deliveries[0]!.dropped).toBe(false);
    expect(deliveries[0]!.repeated).toBe(false);
  });

  it('delivers a reset frame on stop', () => {
    const deliveries: FrameDelivery[] = [];
    scheduler.onFrame((d) => deliveries.push(d));

    scheduler.seek(5); // move to frame 120
    scheduler.stop();  // should reset to 0

    expect(deliveries).toHaveLength(2);
    expect(deliveries[1]!.frameNumber).toBe(0);
    expect(deliveries[1]!.timelineTime).toBe(0);
  });

  it('stop resets to in-point when set', () => {
    const deliveries: FrameDelivery[] = [];
    scheduler.onFrame((d) => deliveries.push(d));

    scheduler.setRange(2.0, 8.0); // in-point at 2s
    scheduler.seek(5);
    scheduler.stop();

    expect(deliveries[deliveries.length - 1]!.timelineTime).toBe(2.0);
  });

  it('stepForward advances by exactly one frame', () => {
    const deliveries: FrameDelivery[] = [];
    scheduler.onFrame((d) => deliveries.push(d));

    scheduler.seek(0);
    scheduler.stepForward();

    expect(deliveries).toHaveLength(2);
    const lastFrame = deliveries[deliveries.length - 1]!;
    expect(lastFrame.frameNumber).toBe(1);
    expect(lastFrame.timelineTime).toBeCloseTo(1 / 24, 6);
  });

  it('stepBackward goes back by exactly one frame (clamped to 0)', () => {
    const deliveries: FrameDelivery[] = [];
    scheduler.onFrame((d) => deliveries.push(d));

    scheduler.seek(0);
    scheduler.stepBackward(); // should clamp to 0

    expect(deliveries).toHaveLength(2);
    expect(deliveries[1]!.frameNumber).toBe(0);
  });

  it('metrics start at zero', () => {
    const metrics = scheduler.getMetrics();
    expect(metrics.totalFrames).toBe(0);
    expect(metrics.droppedFrames).toBe(0);
    expect(metrics.repeatedFrames).toBe(0);
    expect(metrics.dropRate).toBe(0);
  });

  it('configure updates fps and duration', () => {
    scheduler.configure(30, 200);
    const state = scheduler.getState();
    expect(state.fps).toBe(30);
    expect(state.duration).toBe(200);
  });

  it('setRange sets in/out points', () => {
    scheduler.setRange(5, 15);
    const state = scheduler.getState();
    expect(state.inPoint).toBe(5);
    expect(state.outPoint).toBe(15);
  });

  it('seek clamps frame number to integer', () => {
    const deliveries: FrameDelivery[] = [];
    scheduler.onFrame((d) => deliveries.push(d));

    // At 24fps, time 1.0208333... = frame 24.5 → floor = 24
    scheduler.seek(1.0208333333);
    expect(deliveries[0]!.frameNumber).toBe(24);
  });

  it('dispose stops the loop and clears callbacks', () => {
    const deliveries: FrameDelivery[] = [];
    scheduler.onFrame((d) => deliveries.push(d));

    scheduler.dispose();
    scheduler.seek(5); // should not deliver anything

    expect(deliveries).toHaveLength(0);
  });
});
