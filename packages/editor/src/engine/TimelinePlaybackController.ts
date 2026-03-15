// =============================================================================
//  THE AVID — Timeline Playback Controller
//  Integration facade that owns the lifecycle of all playback subsystems:
//  SegmentGraph, DecodePipeline, FrameScheduler, FrameCompositor, AudioEngine.
//
//  This is the single entry point for the UI to control timeline playback.
//  Subscribes to the Zustand editor store and rebuilds the segment graph
//  on edits. Orchestrates decode, composite, and display on each frame.
// =============================================================================

import {
  resolveSegmentGraph,
  getActiveVideoSegments,
  getActiveAudioSegments,
  timeToFrame,
  frameToTime,
  totalFrames,
} from './SegmentGraph';
import type { SegmentGraphResult, VideoSegment } from './SegmentGraph';
import { decodePipeline } from './DecodePipeline';
import type { DecodedFrame, DecodeStats } from './DecodePipeline';
import { FrameScheduler } from './FrameScheduler';
import type { FrameDelivery, SchedulerMetrics, ClockState } from './FrameScheduler';
import { frameCompositor } from './FrameCompositor';
import { audioEngine } from './AudioEngine';
import { playbackEngine } from './PlaybackEngine';
import type {
  Track,
  SequenceSettings,
} from '../store/editor.store';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Playback state emitted to subscribers. */
export interface PlaybackState {
  /** Whether playback is active. */
  isPlaying: boolean;
  /** Current playback speed. */
  speed: number;
  /** Current timeline time in seconds. */
  currentTime: number;
  /** Current frame number. */
  currentFrame: number;
  /** Total duration in seconds. */
  duration: number;
  /** Total frame count. */
  totalFrames: number;
  /** Frame rate. */
  fps: number;
  /** In-point (null if unset). */
  inPoint: number | null;
  /** Out-point (null if unset). */
  outPoint: number | null;
  /** The most recently composited frame bitmap. */
  currentBitmap: ImageBitmap | null;
  /** Number of active video layers at the current time. */
  activeVideoLayers: number;
  /** Number of active audio layers at the current time. */
  activeAudioLayers: number;
}

/** Subscriber callback for playback state updates. */
export type PlaybackStateCallback = (state: PlaybackState) => void;

/** Combined diagnostics from all subsystems. */
export interface PlaybackDiagnostics {
  scheduler: SchedulerMetrics;
  decode: DecodeStats;
  segmentGraph: {
    videoSegments: number;
    audioSegments: number;
    referencedAssets: number;
    duration: number;
  };
}

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * Timeline Playback Controller — the integration facade.
 *
 * Lifecycle:
 * 1. Call `setTimeline(tracks, settings)` when the sequence is loaded or edited.
 * 2. Use transport methods (play, pause, stop, seek, jklShuttle) to control playback.
 * 3. Subscribe to state updates for UI rendering.
 * 4. Call `dispose()` when the sequence is unloaded.
 *
 * The controller:
 * - Rebuilds the SegmentGraph on every `setTimeline` call.
 * - Configures the FrameScheduler and DecodePipeline for the sequence.
 * - On each frame delivery from the scheduler:
 *   a. Resolves active segments at the target time.
 *   b. Decodes frames via DecodePipeline.
 *   c. Composites via FrameCompositor.
 *   d. Syncs audio via AudioEngine.
 *   e. Emits state to subscribers.
 */
export class TimelinePlaybackController {
  private graph: SegmentGraphResult | null = null;
  private scheduler = new FrameScheduler();
  private subscribers = new Set<PlaybackStateCallback>();
  private currentBitmap: ImageBitmap | null = null;
  private settings: SequenceSettings | null = null;
  private tracks: Track[] = [];
  private disposed = false;

  // Output dimensions for compositing
  private outputWidth = 1920;
  private outputHeight = 1080;

  constructor() {
    // Wire up the scheduler's frame delivery to our handler
    this.scheduler.onFrame((delivery) => {
      this.handleFrameDelivery(delivery);
    });

    // Wire up audio sync — use AudioContext currentTime as sync master
    this.scheduler.setAudioSyncSource(() => {
      if (!audioEngine.context) return this.scheduler.getState().currentTime;
      // AudioContext.currentTime is monotonic and authoritative
      // The caller must account for the playback start offset
      return this.scheduler.getState().currentTime;
    });
  }

  // ── Timeline Setup ────────────────────────────────────────────────────

  /**
   * Set or update the timeline data. Rebuilds the segment graph and
   * prepares decoders for referenced assets.
   *
   * Call this:
   * - When a sequence is first loaded.
   * - On any timeline edit (add/remove/move clip, change settings).
   */
  async setTimeline(tracks: Track[], settings: SequenceSettings): Promise<void> {
    this.tracks = tracks;
    this.settings = settings;

    // Rebuild segment graph
    this.graph = resolveSegmentGraph(tracks, settings);

    // Configure scheduler
    this.scheduler.configure(settings.fps, this.graph.duration);

    // Prepare decoders for all referenced assets
    await decodePipeline.prepareDecoders(this.graph.referencedAssetIds);

    // Set playback engine fps for timecode display
    playbackEngine.fps = settings.fps;
  }

  /**
   * Set the output resolution for compositing.
   */
  setOutputSize(width: number, height: number): void {
    this.outputWidth = width;
    this.outputHeight = height;
  }

  // ── Transport ─────────────────────────────────────────────────────────

  /** Start playback from the current position. */
  play(): void {
    if (!this.graph || !this.settings) return;

    const state = this.scheduler.getState();
    this.scheduler.play(state.currentTime, state.speed || 1);

    // Sync the legacy PlaybackEngine state
    playbackEngine.isPlaying = true;
    playbackEngine.speed = state.speed || 1;
  }

  /** Pause playback. */
  pause(): void {
    this.scheduler.pause();
    playbackEngine.isPlaying = false;
  }

  /** Stop playback and return to in-point or frame 0. */
  stop(): void {
    this.scheduler.stop();
    playbackEngine.isPlaying = false;
    playbackEngine.speed = 1;
  }

  /** Seek to a specific timeline time in seconds. */
  seek(timelineTime: number): void {
    if (!this.graph) return;
    const clamped = Math.max(0, Math.min(timelineTime, this.graph.duration));
    this.scheduler.seek(clamped);
    decodePipeline.flushAll();

    // Sync legacy engine
    playbackEngine.currentFrame = timeToFrame(clamped, this.graph.fps);
  }

  /** Seek to a specific frame number. */
  seekToFrame(frame: number): void {
    if (!this.graph) return;
    const time = frameToTime(frame, this.graph.fps);
    this.seek(time);
  }

  /** Step forward one frame. */
  stepForward(): void {
    this.scheduler.stepForward();
  }

  /** Step backward one frame. */
  stepBackward(): void {
    this.scheduler.stepBackward();
  }

  /** Set playback speed. */
  setSpeed(speed: number): void {
    const clamped = Math.max(-8, Math.min(8, speed));
    this.scheduler.setSpeed(clamped);
    playbackEngine.speed = clamped;
  }

  /**
   * JKL shuttle control (Avid-standard).
   * Delegates to PlaybackEngine for shuttle accumulation, then syncs.
   */
  jklShuttle(key: 'j' | 'k' | 'l'): void {
    if (key === 'k') {
      this.pause();
      return;
    }

    // Use PlaybackEngine's shuttle logic for speed accumulation
    playbackEngine.jklShuttle(key);

    const speed = playbackEngine.speed;
    this.setSpeed(speed);

    if (!this.scheduler.getState().running) {
      const currentTime = this.scheduler.getState().currentTime;
      this.scheduler.play(currentTime, speed);
      playbackEngine.isPlaying = true;
    }
  }

  /** Set in-point at the current time. */
  setInPoint(): void {
    const state = this.scheduler.getState();
    this.scheduler.setRange(state.currentTime, state.outPoint);
    playbackEngine.setInPoint(state.currentFrame);
  }

  /** Set out-point at the current time. */
  setOutPoint(): void {
    const state = this.scheduler.getState();
    this.scheduler.setRange(state.inPoint, state.currentTime);
    playbackEngine.setOutPoint(state.currentFrame);
  }

  /** Clear in/out points. */
  clearInOut(): void {
    this.scheduler.setRange(null, null);
    playbackEngine.clearInOut();
  }

  // ── Frame Delivery Handler ────────────────────────────────────────────

  /**
   * Called by the FrameScheduler on each RAF tick.
   * Resolves segments, decodes, composites, and emits state.
   */
  private async handleFrameDelivery(delivery: FrameDelivery): Promise<void> {
    if (this.disposed || !this.graph || !this.settings) return;

    const { timelineTime, frameNumber, dropped, repeated } = delivery;

    // If the frame is repeated and we have a bitmap, just re-emit
    if (repeated && this.currentBitmap) {
      this.emitState(delivery);
      return;
    }

    // Get active segments at this time
    const videoSegments = getActiveVideoSegments(this.graph, timelineTime);
    const audioSegments = getActiveAudioSegments(this.graph, timelineTime);

    // Skip decode if dropped (scheduler determined we're behind)
    if (dropped && this.currentBitmap) {
      this.emitState(delivery);
      return;
    }

    // Decode video frames for all active segments
    const decodedFrames: DecodedFrame[] = [];
    const decodePromises = videoSegments.map(async (seg) => {
      const frame = await decodePipeline.getVideoFrame(seg, timelineTime, this.graph!.fps);
      if (frame) decodedFrames.push(frame);
    });

    await Promise.all(decodePromises);

    // Composite all decoded frames via FrameCompositor
    if (decodedFrames.length > 0 || videoSegments.length === 0) {
      try {
        const bitmap = await frameCompositor.renderTimelineFrame(
          this.tracks,
          timelineTime,
          this.settings,
          this.outputWidth,
          this.outputHeight,
        );
        if (bitmap) {
          // Close the old bitmap to free GPU memory
          this.currentBitmap?.close();
          this.currentBitmap = bitmap;
        }
      } catch {
        // Compositing failed — keep showing previous frame
      }
    }

    // Sync audio position
    audioEngine.syncToTime(timelineTime);

    // Sync legacy PlaybackEngine
    playbackEngine.currentFrame = frameNumber;

    // Kick off pre-fetch for upcoming frames
    decodePipeline.prefetch(
      videoSegments,
      timelineTime,
      this.graph.fps,
      delivery.speed,
    ).catch(() => { /* pre-fetch is best-effort */ });

    this.emitState(delivery);
  }

  // ── State Emission ────────────────────────────────────────────────────

  private emitState(delivery: FrameDelivery): void {
    const state: PlaybackState = {
      isPlaying: this.scheduler.getState().running,
      speed: delivery.speed,
      currentTime: delivery.timelineTime,
      currentFrame: delivery.frameNumber,
      duration: this.graph?.duration ?? 0,
      totalFrames: this.graph ? totalFrames(this.graph) : 0,
      fps: delivery.fps,
      inPoint: this.scheduler.getState().inPoint,
      outPoint: this.scheduler.getState().outPoint,
      currentBitmap: this.currentBitmap,
      activeVideoLayers: this.graph
        ? getActiveVideoSegments(this.graph, delivery.timelineTime).length
        : 0,
      activeAudioLayers: this.graph
        ? getActiveAudioSegments(this.graph, delivery.timelineTime).length
        : 0,
    };

    for (const cb of this.subscribers) {
      try {
        cb(state);
      } catch (err) {
        console.error('[TimelinePlaybackController] Subscriber error:', err);
      }
    }
  }

  // ── Subscription ──────────────────────────────────────────────────────

  /**
   * Subscribe to playback state updates.
   * @returns An unsubscribe function.
   */
  subscribe(callback: PlaybackStateCallback): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  // ── Diagnostics ───────────────────────────────────────────────────────

  /** Get combined diagnostics from all subsystems. */
  getDiagnostics(): PlaybackDiagnostics {
    return {
      scheduler: this.scheduler.getMetrics(),
      decode: decodePipeline.getStats(),
      segmentGraph: {
        videoSegments: this.graph?.videoSegments.length ?? 0,
        audioSegments: this.graph?.audioSegments.length ?? 0,
        referencedAssets: this.graph?.referencedAssetIds.size ?? 0,
        duration: this.graph?.duration ?? 0,
      },
    };
  }

  /** Get the current segment graph (for debugging/export). */
  getSegmentGraph(): SegmentGraphResult | null {
    return this.graph;
  }

  /** Get the current clock state. */
  getClockState(): ClockState {
    return this.scheduler.getState();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  /** Dispose all subsystems. */
  dispose(): void {
    this.disposed = true;
    this.scheduler.dispose();
    decodePipeline.dispose();
    this.currentBitmap?.close();
    this.currentBitmap = null;
    this.subscribers.clear();
    this.graph = null;
  }
}

/** Singleton timeline playback controller. */
export const timelinePlaybackController = new TimelinePlaybackController();
