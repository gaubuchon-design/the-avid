// ─── Playback Engine ──────────────────────────────────────────────────────────
// RAF-driven playback loop with JKL shuttle, timecode, and subscribe pattern.

/** Callback signature for playback frame updates. */
export type PlaybackSubscriber = (frame: number) => void;

/**
 * RAF-driven playback engine with JKL shuttle control.
 *
 * Manages transport state (play, pause, stop), variable-speed shuttle,
 * in/out points, and a requestAnimationFrame render loop.  Subscribers are
 * notified on every frame advance so the UI can update synchronously.
 */
export class PlaybackEngine {
  /** Current fractional frame position. */
  currentFrame = 0;
  /** Timeline frame rate. */
  fps = 23.976;
  /** Whether playback is currently running. */
  isPlaying = false;
  /** Current playback speed multiplier (negative = reverse). */
  speed = 1;
  /** In-point frame, or `null` if unset. */
  inPoint: number | null = null;
  /** Out-point frame, or `null` if unset. */
  outPoint: number | null = null;

  private rafId: number | null = null;
  private lastTimestamp: number | null = null;
  private subscribers = new Set<PlaybackSubscriber>();
  private shuttleAccumJ = 0;
  private shuttleAccumL = 0;

  // ── Transport ──────────────────────────────────────────────────────────

  /**
   * Begin playback from the current frame position.
   * @example
   * playbackEngine.play();
   */
  play(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.lastTimestamp = null;
    this.startLoop();
    this.emit();
  }

  /**
   * Pause playback, keeping the current frame position.
   * @example
   * playbackEngine.pause();
   */
  pause(): void {
    this.isPlaying = false;
    this.cancelLoop();
    this.emit();
  }

  /**
   * Stop playback and reset to the in-point (or frame 0).
   * @example
   * playbackEngine.stop();
   */
  stop(): void {
    this.isPlaying = false;
    this.speed = 1;
    this.shuttleAccumJ = 0;
    this.shuttleAccumL = 0;
    this.cancelLoop();
    this.currentFrame = this.inPoint ?? 0;
    this.emit();
  }

  /**
   * Seek to a specific frame.
   * @param frame Target frame number (clamped to >= 0).
   * @example
   * playbackEngine.seekToFrame(120); // jump to frame 120
   */
  seekToFrame(frame: number): void {
    this.currentFrame = Math.max(0, frame);
    this.emit();
  }

  /**
   * Set the playback speed multiplier.
   * @param speed Speed value clamped to [-8, 8].
   */
  setSpeed(speed: number): void {
    this.speed = Math.max(-8, Math.min(8, speed));
  }

  /** Advance one frame forward. */
  nextFrame(): void {
    this.currentFrame += 1;
    this.emit();
  }

  /** Step one frame backward (clamped to 0). */
  prevFrame(): void {
    this.currentFrame = Math.max(0, this.currentFrame - 1);
    this.emit();
  }

  // ── In / Out ───────────────────────────────────────────────────────────

  /**
   * Set the in-point.
   * @param frame Frame number for the in-point.
   */
  setInPoint(frame: number): void {
    this.inPoint = frame;
  }

  /**
   * Set the out-point.
   * @param frame Frame number for the out-point.
   */
  setOutPoint(frame: number): void {
    this.outPoint = frame;
  }

  /** Clear both in-point and out-point. */
  clearInOut(): void {
    this.inPoint = null;
    this.outPoint = null;
  }

  /**
   * Return the current in/out range.
   * @returns Object with `inPoint` and `outPoint` values.
   */
  markClip(): { inPoint: number | null; outPoint: number | null } {
    return { inPoint: this.inPoint, outPoint: this.outPoint };
  }

  // ── JKL Shuttle ────────────────────────────────────────────────────────

  /**
   * Handle a JKL shuttle key press.
   *
   * - **J**: Reverse playback; successive presses increase reverse speed.
   * - **K**: Stop / pause and reset shuttle accumulators.
   * - **L**: Forward playback; successive presses increase forward speed.
   *
   * @param key The shuttle key pressed.
   * @example
   * playbackEngine.jklShuttle('l'); // start forward playback
   * playbackEngine.jklShuttle('l'); // increase to 2x speed
   * playbackEngine.jklShuttle('k'); // stop
   */
  jklShuttle(key: 'j' | 'k' | 'l'): void {
    if (key === 'k') {
      this.pause();
      this.speed = 1;
      this.shuttleAccumJ = 0;
      this.shuttleAccumL = 0;
      return;
    }

    if (key === 'j') {
      this.shuttleAccumL = 0;
      this.shuttleAccumJ += 1;
      this.speed = -Math.min(this.shuttleAccumJ, 8);
      if (!this.isPlaying) this.play();
      return;
    }

    if (key === 'l') {
      this.shuttleAccumJ = 0;
      this.shuttleAccumL += 1;
      this.speed = Math.min(this.shuttleAccumL, 8);
      if (!this.isPlaying) this.play();
      return;
    }
  }

  // ── Match frame ────────────────────────────────────────────────────────

  /**
   * Return the current frame for match-frame operations.
   * @returns The current frame number (integer).
   */
  matchFrame(): number {
    return this.currentFrame;
  }

  // ── Timecode ───────────────────────────────────────────────────────────

  /**
   * Convert a frame number to HH:MM:SS:FF timecode.
   * @param frame The frame number to convert.
   * @returns Formatted timecode string.
   * @example
   * playbackEngine.frameToTimecode(1440); // '00:01:00:00' at 24fps
   */
  frameToTimecode(frame: number): string {
    const totalSeconds = frame / this.fps;
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    const f = Math.floor(frame % Math.ceil(this.fps));
    return (
      String(h).padStart(2, '0') + ':' +
      String(m).padStart(2, '0') + ':' +
      String(s).padStart(2, '0') + ':' +
      String(f).padStart(2, '0')
    );
  }

  // ── Subscription ───────────────────────────────────────────────────────

  /**
   * Subscribe to frame updates.
   * @param cb Callback invoked with the current frame on every update.
   * @returns An unsubscribe function.
   * @example
   * const unsub = playbackEngine.subscribe((frame) => {
   *   console.log('Current frame:', frame);
   * });
   */
  subscribe(cb: PlaybackSubscriber): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  // ── Internal RAF loop ──────────────────────────────────────────────────

  /** Start the requestAnimationFrame render loop. */
  private startLoop(): void {
    const tick = (timestamp: number) => {
      if (!this.isPlaying) return;

      if (this.lastTimestamp !== null) {
        const dt = (timestamp - this.lastTimestamp) / 1000; // seconds
        const frameDelta = dt * this.fps * this.speed;
        this.currentFrame += frameDelta;

        // Clamp to 0
        if (this.currentFrame < 0) {
          this.currentFrame = 0;
          this.pause();
        }

        // Stop at out point
        if (this.outPoint !== null && this.currentFrame >= this.outPoint) {
          this.currentFrame = this.outPoint;
          this.pause();
        }

        this.emit();
      }

      this.lastTimestamp = timestamp;
      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  /** Cancel the running RAF loop. */
  private cancelLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.lastTimestamp = null;
  }

  /** Emit the current frame to all subscribers. */
  private emit(): void {
    const frame = this.currentFrame;
    this.subscribers.forEach((cb) => {
      try {
        cb(frame);
      } catch (err) {
        console.error('[PlaybackEngine] Subscriber error:', err);
      }
    });
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  /**
   * Dispose the engine, cancelling the loop and clearing subscribers.
   * @example
   * playbackEngine.dispose();
   */
  dispose(): void {
    this.cancelLoop();
    this.subscribers.clear();
  }
}

/** Singleton playback engine instance. */
export const playbackEngine = new PlaybackEngine();
