// =============================================================================
//  THE AVID — Frame Scheduler
//  Presentation-clock-driven frame scheduler with A/V sync, frame dropping,
//  and vsync-aligned delivery. Replaces the simple RAF accumulator in
//  PlaybackEngine for professional frame-accurate playback.
// =============================================================================

// ─── Types ────────────────────────────────────────────────────────────────────

/** Frame delivery callback. */
export type FrameDeliveryCallback = (delivery: FrameDelivery) => void;

/** A frame scheduled for display. */
export interface FrameDelivery {
  /** Integer frame number on the timeline. */
  frameNumber: number;
  /** Timeline time in seconds for this frame. */
  timelineTime: number;
  /** Presentation timestamp (performance.now ms). */
  presentationTime: number;
  /** Whether this frame was dropped (decode too slow). */
  dropped: boolean;
  /** Whether this is a repeat of the previous frame (pause or cache miss). */
  repeated: boolean;
  /** Current playback speed. */
  speed: number;
  /** Frame rate. */
  fps: number;
}

/** Scheduler performance metrics. */
export interface SchedulerMetrics {
  /** Total frames delivered. */
  totalFrames: number;
  /** Total frames dropped. */
  droppedFrames: number;
  /** Total frames repeated. */
  repeatedFrames: number;
  /** Drop rate (0–1). */
  dropRate: number;
  /** Average jitter in ms (deviation from ideal frame timing). */
  avgJitterMs: number;
  /** Time since playback started (seconds). */
  elapsedSeconds: number;
  /** Current frame number. */
  currentFrame: number;
  /** Current timeline time. */
  currentTime: number;
}

/** State of the presentation clock. */
export interface ClockState {
  /** Whether the clock is running. */
  running: boolean;
  /** Current playback speed. */
  speed: number;
  /** Current frame rate. */
  fps: number;
  /** Current timeline time. */
  currentTime: number;
  /** Current frame number. */
  currentFrame: number;
  /** In-point (null if unset). */
  inPoint: number | null;
  /** Out-point (null if unset). */
  outPoint: number | null;
  /** Total duration. */
  duration: number;
}

// ─── Presentation Clock ──────────────────────────────────────────────────────

/**
 * Monotonic presentation clock that advances at `speed * realtime`.
 * Uses performance.now() for sub-millisecond precision.
 * Seek resets the clock origin.
 */
class PresentationClock {
  /** Timeline time at clock origin. */
  private originTime = 0;
  /** performance.now() at clock origin. */
  private originWallMs = 0;
  /** Playback speed multiplier (negative = reverse). */
  private speed = 1;
  /** Whether the clock is running. */
  private running = false;

  /** Start or resume the clock at the given timeline time. */
  start(timelineTime: number, speed: number): void {
    this.originTime = timelineTime;
    this.originWallMs = performance.now();
    this.speed = speed;
    this.running = true;
  }

  /** Stop the clock, freezing the current time. */
  stop(): void {
    if (this.running) {
      this.originTime = this.currentTime();
      this.running = false;
    }
  }

  /** Seek to a new timeline time without changing running state. */
  seek(timelineTime: number): void {
    this.originTime = timelineTime;
    this.originWallMs = performance.now();
  }

  /** Update the playback speed without seeking. */
  setSpeed(speed: number): void {
    if (this.running) {
      // Capture current time before changing speed
      this.originTime = this.currentTime();
      this.originWallMs = performance.now();
    }
    this.speed = speed;
  }

  /** Get the current timeline time based on wall clock elapsed. */
  currentTime(): number {
    if (!this.running) return this.originTime;
    const elapsedMs = performance.now() - this.originWallMs;
    return this.originTime + (elapsedMs / 1000) * this.speed;
  }

  /** Get the current speed. */
  getSpeed(): number {
    return this.speed;
  }

  /** Check if the clock is running. */
  isRunning(): boolean {
    return this.running;
  }
}

// ─── Frame Scheduler ──────────────────────────────────────────────────────────

/**
 * Frame-accurate playback scheduler.
 *
 * Uses a PresentationClock to determine the target frame at each vsync (RAF).
 * Compares with the last displayed frame to decide: display, drop, or repeat.
 *
 * The scheduler does NOT decode frames — it calls a FrameDeliveryCallback
 * with the frame number and timeline time. The TimelinePlaybackController
 * handles actual decode and compositing.
 *
 * A/V sync strategy:
 * - Audio (Web Audio API) is the sync master — its currentTime is authoritative.
 * - Video catches up or drops frames to match audio position.
 * - If video is ahead of audio, the frame is repeated (wait for audio to catch up).
 * - If video is behind audio, intermediate frames are dropped.
 */
export class FrameScheduler {
  private clock = new PresentationClock();
  private rafId: number | null = null;
  private lastDeliveredFrame = -1;
  private callback: FrameDeliveryCallback | null = null;
  private fps = 24;
  private duration = 0;
  private inPoint: number | null = null;
  private outPoint: number | null = null;

  // Metrics
  private totalFrames = 0;
  private droppedFrames = 0;
  private repeatedFrames = 0;
  private jitterSum = 0;
  private startWallMs = 0;

  // Audio sync
  private audioSyncCallback: (() => number) | null = null;

  // ── Configuration ─────────────────────────────────────────────────────

  /**
   * Set the frame delivery callback. Called on every RAF tick with the
   * target frame to display.
   */
  onFrame(callback: FrameDeliveryCallback): void {
    this.callback = callback;
  }

  /**
   * Set the audio sync callback. Should return the current audio playback
   * time in seconds (from Web Audio API AudioContext.currentTime adjusted
   * for the playback start offset).
   */
  setAudioSyncSource(callback: () => number): void {
    this.audioSyncCallback = callback;
  }

  /**
   * Configure the scheduler for a sequence.
   */
  configure(fps: number, duration: number): void {
    this.fps = fps;
    this.duration = duration;
  }

  /** Set in/out points for bounded playback. */
  setRange(inPoint: number | null, outPoint: number | null): void {
    this.inPoint = inPoint;
    this.outPoint = outPoint;
  }

  // ── Transport ─────────────────────────────────────────────────────────

  /**
   * Start playback from the given time at the given speed.
   */
  play(timelineTime: number, speed: number): void {
    this.clock.start(timelineTime, speed);
    this.lastDeliveredFrame = -1;
    this.startWallMs = performance.now();
    this.resetMetrics();
    this.startLoop();
  }

  /**
   * Pause playback, freezing the current frame.
   */
  pause(): void {
    this.clock.stop();
    this.stopLoop();
  }

  /**
   * Stop playback and reset to in-point or frame 0.
   */
  stop(): void {
    this.clock.stop();
    this.stopLoop();
    const resetTime = this.inPoint ?? 0;
    this.clock.seek(resetTime);
    this.lastDeliveredFrame = -1;

    // Deliver the stop frame
    this.deliverFrame(resetTime, false);
  }

  /**
   * Seek to a specific timeline time.
   */
  seek(timelineTime: number): void {
    this.clock.seek(timelineTime);
    this.lastDeliveredFrame = -1;

    // Deliver the seek frame immediately
    this.deliverFrame(timelineTime, false);
  }

  /**
   * Change playback speed without stopping.
   */
  setSpeed(speed: number): void {
    this.clock.setSpeed(speed);
  }

  /**
   * Step forward one frame.
   */
  stepForward(): void {
    const currentTime = this.clock.currentTime();
    const currentFrame = Math.floor(currentTime * this.fps);
    const nextTime = (currentFrame + 1) / this.fps;
    this.seek(nextTime);
  }

  /**
   * Step backward one frame.
   */
  stepBackward(): void {
    const currentTime = this.clock.currentTime();
    const currentFrame = Math.floor(currentTime * this.fps);
    const prevTime = Math.max(0, (currentFrame - 1) / this.fps);
    this.seek(prevTime);
  }

  // ── State ─────────────────────────────────────────────────────────────

  /** Get the current clock state. */
  getState(): ClockState {
    return {
      running: this.clock.isRunning(),
      speed: this.clock.getSpeed(),
      fps: this.fps,
      currentTime: this.clock.currentTime(),
      currentFrame: Math.floor(this.clock.currentTime() * this.fps),
      inPoint: this.inPoint,
      outPoint: this.outPoint,
      duration: this.duration,
    };
  }

  /** Get performance metrics. */
  getMetrics(): SchedulerMetrics {
    const currentTime = this.clock.currentTime();
    return {
      totalFrames: this.totalFrames,
      droppedFrames: this.droppedFrames,
      repeatedFrames: this.repeatedFrames,
      dropRate: this.totalFrames > 0 ? this.droppedFrames / this.totalFrames : 0,
      avgJitterMs: this.totalFrames > 0 ? this.jitterSum / this.totalFrames : 0,
      elapsedSeconds: (performance.now() - this.startWallMs) / 1000,
      currentFrame: Math.floor(currentTime * this.fps),
      currentTime,
    };
  }

  // ── RAF Loop ──────────────────────────────────────────────────────────

  private startLoop(): void {
    if (this.rafId !== null) return;

    const tick = () => {
      if (!this.clock.isRunning()) return;

      let timelineTime = this.clock.currentTime();

      // Apply audio sync correction if available
      if (this.audioSyncCallback) {
        const audioTime = this.audioSyncCallback();
        const drift = timelineTime - audioTime;

        // If video is more than 1 frame ahead or behind, correct
        const frameDuration = 1 / this.fps;
        if (Math.abs(drift) > frameDuration) {
          // Nudge the clock toward audio time
          this.clock.seek(audioTime);
          timelineTime = audioTime;
        }
      }

      // Clamp to 0
      if (timelineTime < 0) {
        timelineTime = 0;
        this.clock.stop();
        this.stopLoop();
        this.deliverFrame(0, false);
        return;
      }

      // Stop at out-point or duration
      const endTime = this.outPoint ?? this.duration;
      if (timelineTime >= endTime && this.clock.getSpeed() > 0) {
        timelineTime = endTime;
        this.clock.stop();
        this.stopLoop();
        this.deliverFrame(endTime, false);
        return;
      }

      this.deliverFrame(timelineTime, true);
      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Deliver a frame to the callback, handling drop/repeat logic.
   */
  private deliverFrame(timelineTime: number, isPlayback: boolean): void {
    if (!this.callback) return;

    const targetFrame = Math.floor(timelineTime * this.fps);
    const speed = this.clock.getSpeed();

    // Calculate jitter (deviation from ideal frame timing)
    if (isPlayback && this.lastDeliveredFrame >= 0) {
      const idealInterval = 1000 / this.fps;
      const actualInterval = performance.now() - (this.startWallMs + this.totalFrames * idealInterval);
      this.jitterSum += Math.abs(actualInterval);
    }

    if (targetFrame === this.lastDeliveredFrame && isPlayback) {
      // Same frame — repeat
      this.repeatedFrames++;
      this.totalFrames++;
      this.callback({
        frameNumber: targetFrame,
        timelineTime,
        presentationTime: performance.now(),
        dropped: false,
        repeated: true,
        speed,
        fps: this.fps,
      });
      return;
    }

    // Check for dropped frames (target jumped more than 1 frame)
    const frameDelta = Math.abs(targetFrame - this.lastDeliveredFrame);
    const dropped = isPlayback && this.lastDeliveredFrame >= 0 && frameDelta > 1;

    if (dropped) {
      this.droppedFrames += frameDelta - 1;
    }

    this.totalFrames++;
    this.lastDeliveredFrame = targetFrame;

    this.callback({
      frameNumber: targetFrame,
      timelineTime,
      presentationTime: performance.now(),
      dropped,
      repeated: false,
      speed,
      fps: this.fps,
    });
  }

  private resetMetrics(): void {
    this.totalFrames = 0;
    this.droppedFrames = 0;
    this.repeatedFrames = 0;
    this.jitterSum = 0;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  /** Dispose the scheduler. */
  dispose(): void {
    this.stopLoop();
    this.callback = null;
    this.audioSyncCallback = null;
  }
}

/** Singleton frame scheduler instance. */
export const frameScheduler = new FrameScheduler();
