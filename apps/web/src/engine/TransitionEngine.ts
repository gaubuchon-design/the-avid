// =============================================================================
//  THE AVID -- Transition Engine
// =============================================================================
//
// Complete implementation of Avid Media Composer's transition effects system
// including dissolves, dips, wipes, pushes, spins, and other effects applied
// at edit points between two clips on a track.
// =============================================================================

import { useEditorStore } from '../store/editor.store';

// ─── Types ───────────────────────────────────────────────────────────────────

/** How a transition is aligned relative to the edit point. */
export type TransitionAlignment = 'center' | 'start-at-cut' | 'end-at-cut' | 'custom';

/** Categories matching Avid Media Composer's transition palette. */
export type TransitionCategory =
  | 'dissolve' | 'dip' | 'wipe'
  | 'box-wipe' | 'edge-wipe' | 'matrix-wipe' | 'conceal'
  | 'peel' | 'push' | 'spin' | 'squeeze' | 'xpress-3d';

/** A single parameter for a transition definition. */
export interface TransitionParam {
  name: string;
  type: 'number' | 'color' | 'angle' | 'select';
  default: any;
  min?: number;
  max?: number;
  options?: string[];            // for select type
}

/** A registered transition definition (template). */
export interface TransitionDefinition {
  id: string;
  name: string;
  category: TransitionCategory;
  description: string;
  defaultDuration: number;       // frames
  hasDirection: boolean;         // can set wipe direction
  hasColor: boolean;             // has color parameter (dips)
  hasSoftness: boolean;          // edge softness
  parameters: TransitionParam[];
  previewThumbnail?: string;
}

/** A live instance of a transition applied at an edit point. */
export interface TransitionInstance {
  id: string;
  definitionId: string;
  trackId: string;
  editPointTime: number;         // time of the edit point
  duration: number;              // total duration in seconds
  alignment: TransitionAlignment;
  params: Record<string, any>;   // parameter values
  clipAId: string;               // outgoing clip
  clipBId: string;               // incoming clip
  rendered: boolean;
}

/** Options for the quick transition dialog. */
export interface QuickTransitionOptions {
  type: 'dissolve' | 'dip-to-black' | 'dip-to-white';
  duration?: number;             // frames, default 40 (20 per side)
  alignment?: TransitionAlignment;
  position?: 'at-playhead' | 'all-in-out' | 'selected-tracks';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createId(prefix: string): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Default frame rate used for frame-to-seconds conversions. */
const DEFAULT_FPS = 23.976;

/** Convert frames to seconds. */
function framesToSeconds(frames: number, fps = DEFAULT_FPS): number {
  return frames / fps;
}

// ─── Built-in Transition Definitions ─────────────────────────────────────────

const BUILT_IN_TRANSITIONS: TransitionDefinition[] = [
  // ── Dissolve Category ──────────────────────────────────────────────────────
  {
    id: 'film-dissolve',
    name: 'Film Dissolve',
    category: 'dissolve',
    description: 'Standard cross-dissolve between outgoing and incoming clips. The default transition in Avid.',
    defaultDuration: 30,
    hasDirection: false,
    hasColor: false,
    hasSoftness: false,
    parameters: [],
  },

  // ── Dip Category ───────────────────────────────────────────────────────────
  {
    id: 'dip-to-color',
    name: 'Dip to Color',
    category: 'dip',
    description: 'Fades out the outgoing clip to a solid color, then fades in the incoming clip from that color.',
    defaultDuration: 40,
    hasDirection: false,
    hasColor: true,
    hasSoftness: false,
    parameters: [
      { name: 'color', type: 'color', default: '#000000' },
      { name: 'midPoint', type: 'number', default: 50, min: 10, max: 90 },
    ],
  },

  // ── Wipe Category ──────────────────────────────────────────────────────────
  {
    id: 'horizontal-wipe',
    name: 'Horizontal Wipe',
    category: 'wipe',
    description: 'A straight-edge wipe that moves horizontally across the frame.',
    defaultDuration: 30,
    hasDirection: true,
    hasColor: false,
    hasSoftness: true,
    parameters: [
      { name: 'direction', type: 'select', default: 'left-to-right', options: ['left-to-right', 'right-to-left'] },
      { name: 'softness', type: 'number', default: 0, min: 0, max: 100 },
      { name: 'borderWidth', type: 'number', default: 0, min: 0, max: 50 },
      { name: 'borderColor', type: 'color', default: '#ffffff' },
    ],
  },
  {
    id: 'vertical-wipe',
    name: 'Vertical Wipe',
    category: 'wipe',
    description: 'A straight-edge wipe that moves vertically across the frame.',
    defaultDuration: 30,
    hasDirection: true,
    hasColor: false,
    hasSoftness: true,
    parameters: [
      { name: 'direction', type: 'select', default: 'top-down', options: ['top-down', 'bottom-up'] },
      { name: 'softness', type: 'number', default: 0, min: 0, max: 100 },
      { name: 'borderWidth', type: 'number', default: 0, min: 0, max: 50 },
      { name: 'borderColor', type: 'color', default: '#ffffff' },
    ],
  },
  {
    id: 'diagonal-wipe',
    name: 'Diagonal Wipe',
    category: 'wipe',
    description: 'A diagonal wipe from one corner to the opposite.',
    defaultDuration: 30,
    hasDirection: true,
    hasColor: false,
    hasSoftness: true,
    parameters: [
      { name: 'angle', type: 'angle', default: 45, min: 0, max: 360 },
      { name: 'softness', type: 'number', default: 0, min: 0, max: 100 },
      { name: 'borderWidth', type: 'number', default: 0, min: 0, max: 50 },
      { name: 'borderColor', type: 'color', default: '#ffffff' },
    ],
  },
  {
    id: 'clock-wipe',
    name: 'Clock Wipe',
    category: 'wipe',
    description: 'A radial wipe that sweeps around the frame like a clock hand.',
    defaultDuration: 30,
    hasDirection: true,
    hasColor: false,
    hasSoftness: true,
    parameters: [
      { name: 'startAngle', type: 'angle', default: 0, min: 0, max: 360 },
      { name: 'direction', type: 'select', default: 'clockwise', options: ['clockwise', 'counter-clockwise'] },
      { name: 'softness', type: 'number', default: 0, min: 0, max: 100 },
    ],
  },
  {
    id: 'barn-door',
    name: 'Barn Door',
    category: 'wipe',
    description: 'Two edges move apart (or together) from the center, like barn doors opening.',
    defaultDuration: 30,
    hasDirection: true,
    hasColor: false,
    hasSoftness: true,
    parameters: [
      { name: 'orientation', type: 'select', default: 'horizontal', options: ['horizontal', 'vertical'] },
      { name: 'softness', type: 'number', default: 0, min: 0, max: 100 },
      { name: 'borderWidth', type: 'number', default: 0, min: 0, max: 50 },
      { name: 'borderColor', type: 'color', default: '#ffffff' },
    ],
  },
  {
    id: 'cross-iris',
    name: 'Cross Iris',
    category: 'wipe',
    description: 'A cross-shaped iris wipe that expands or contracts from the center.',
    defaultDuration: 30,
    hasDirection: true,
    hasColor: false,
    hasSoftness: true,
    parameters: [
      { name: 'centerX', type: 'number', default: 50, min: 0, max: 100 },
      { name: 'centerY', type: 'number', default: 50, min: 0, max: 100 },
      { name: 'softness', type: 'number', default: 0, min: 0, max: 100 },
    ],
  },
  {
    id: 'diamond-iris',
    name: 'Diamond Iris',
    category: 'wipe',
    description: 'A diamond-shaped iris wipe that expands or contracts from the center.',
    defaultDuration: 30,
    hasDirection: true,
    hasColor: false,
    hasSoftness: true,
    parameters: [
      { name: 'centerX', type: 'number', default: 50, min: 0, max: 100 },
      { name: 'centerY', type: 'number', default: 50, min: 0, max: 100 },
      { name: 'softness', type: 'number', default: 0, min: 0, max: 100 },
    ],
  },
  {
    id: 'wedge-wipe',
    name: 'Wedge Wipe',
    category: 'wipe',
    description: 'A wedge-shaped wipe that fans open from a center point.',
    defaultDuration: 30,
    hasDirection: true,
    hasColor: false,
    hasSoftness: true,
    parameters: [
      { name: 'startAngle', type: 'angle', default: 90, min: 0, max: 360 },
      { name: 'softness', type: 'number', default: 0, min: 0, max: 100 },
    ],
  },

  // ── Box Wipe Category ──────────────────────────────────────────────────────
  {
    id: 'box-wipe-center',
    name: 'Box Wipe (Center)',
    category: 'box-wipe',
    description: 'A rectangular wipe that expands from the center of the frame.',
    defaultDuration: 30,
    hasDirection: false,
    hasColor: false,
    hasSoftness: true,
    parameters: [
      { name: 'softness', type: 'number', default: 0, min: 0, max: 100 },
      { name: 'borderWidth', type: 'number', default: 0, min: 0, max: 50 },
      { name: 'borderColor', type: 'color', default: '#ffffff' },
    ],
  },
  {
    id: 'box-wipe-corner',
    name: 'Box Wipe (Corner)',
    category: 'box-wipe',
    description: 'A rectangular wipe that expands from a chosen corner of the frame.',
    defaultDuration: 30,
    hasDirection: true,
    hasColor: false,
    hasSoftness: true,
    parameters: [
      { name: 'corner', type: 'select', default: 'top-left', options: ['top-left', 'top-right', 'bottom-left', 'bottom-right'] },
      { name: 'softness', type: 'number', default: 0, min: 0, max: 100 },
      { name: 'borderWidth', type: 'number', default: 0, min: 0, max: 50 },
      { name: 'borderColor', type: 'color', default: '#ffffff' },
    ],
  },

  // ── Push Category ──────────────────────────────────────────────────────────
  {
    id: 'push-left',
    name: 'Push Left',
    category: 'push',
    description: 'The incoming clip pushes the outgoing clip off-screen to the left.',
    defaultDuration: 30,
    hasDirection: true,
    hasColor: false,
    hasSoftness: false,
    parameters: [],
  },
  {
    id: 'push-right',
    name: 'Push Right',
    category: 'push',
    description: 'The incoming clip pushes the outgoing clip off-screen to the right.',
    defaultDuration: 30,
    hasDirection: true,
    hasColor: false,
    hasSoftness: false,
    parameters: [],
  },
  {
    id: 'push-up',
    name: 'Push Up',
    category: 'push',
    description: 'The incoming clip pushes the outgoing clip off-screen upward.',
    defaultDuration: 30,
    hasDirection: true,
    hasColor: false,
    hasSoftness: false,
    parameters: [],
  },
  {
    id: 'push-down',
    name: 'Push Down',
    category: 'push',
    description: 'The incoming clip pushes the outgoing clip off-screen downward.',
    defaultDuration: 30,
    hasDirection: true,
    hasColor: false,
    hasSoftness: false,
    parameters: [],
  },

  // ── Spin Category ──────────────────────────────────────────────────────────
  {
    id: 'spin-clockwise',
    name: 'Spin (Clockwise)',
    category: 'spin',
    description: 'The outgoing clip spins away clockwise, revealing the incoming clip.',
    defaultDuration: 30,
    hasDirection: true,
    hasColor: false,
    hasSoftness: false,
    parameters: [
      { name: 'revolutions', type: 'number', default: 1, min: 0.5, max: 5 },
      { name: 'zoom', type: 'number', default: 50, min: 0, max: 100 },
    ],
  },
  {
    id: 'spin-counter-clockwise',
    name: 'Spin (Counter-Clockwise)',
    category: 'spin',
    description: 'The outgoing clip spins away counter-clockwise, revealing the incoming clip.',
    defaultDuration: 30,
    hasDirection: true,
    hasColor: false,
    hasSoftness: false,
    parameters: [
      { name: 'revolutions', type: 'number', default: 1, min: 0.5, max: 5 },
      { name: 'zoom', type: 'number', default: 50, min: 0, max: 100 },
    ],
  },
];

// =============================================================================
//  TransitionEngine
// =============================================================================

/**
 * Avid-style transition engine.
 *
 * Manages transition definitions (dissolves, wipes, pushes, spins) and
 * instances applied at edit points on the timeline.  Provides CRUD operations,
 * quick-transition dialog support, audio cross-fade helpers, rendering state,
 * and default-transition management.
 *
 * This engine operates as a data-model layer; actual GPU/canvas rendering is
 * handled by the playback pipeline.  The engine provides parameter values and
 * timing that the renderer consumes.
 */
export class TransitionEngine {
  // ─── Internal state ─────────────────────────────────────────────────────

  /** Registered transition definitions keyed by ID. */
  private definitions = new Map<string, TransitionDefinition>();
  /** Live transition instances keyed by ID. */
  private instances = new Map<string, TransitionInstance>();
  /** The definition ID used as the default transition. */
  private defaultTransitionId = 'film-dissolve';
  /** Default transition duration in frames. */
  private defaultDurationFrames = 30;
  /** Default audio cross-fade duration in frames. */
  private audioCrossFadeDurationFrames = 30;
  /** General subscribers (called on any mutation). */
  private listeners = new Set<() => void>();

  constructor() {
    for (const def of BUILT_IN_TRANSITIONS) {
      this.definitions.set(def.id, def);
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  /** Notify all subscribers that state has changed. */
  private notify(): void {
    this.listeners.forEach((fn) => {
      try { fn(); } catch (err) { console.error('[TransitionEngine] Subscriber error:', err); }
    });
  }

  /** Read the current playhead position from the editor store. */
  private getPlayheadTime(): number {
    return useEditorStore.getState().playheadTime;
  }

  /** Get the selected track ID from the editor store. */
  private getSelectedTrackId(): string | null {
    return useEditorStore.getState().selectedTrackId;
  }

  /**
   * Find the two clips surrounding an edit point on a track.
   *
   * Returns [outgoingClip, incomingClip] or null if no valid edit point
   * exists at the given time on the track.
   */
  private findEditPointClips(
    trackId: string,
    editPointTime: number,
  ): { clipA: { id: string; startTime: number; endTime: number }; clipB: { id: string; startTime: number; endTime: number } } | null {
    const state = useEditorStore.getState();
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track) return null;

    // Sort clips by start time
    const sorted = [...track.clips].sort((a, b) => a.startTime - b.startTime);

    // Find adjacent clips where clipA.endTime ~= editPointTime ~= clipB.startTime
    const epsilon = 0.01; // 10ms tolerance
    for (let i = 0; i < sorted.length - 1; i++) {
      const clipA = sorted[i];
      const clipB = sorted[i + 1];

      if (
        Math.abs(clipA!.endTime! - editPointTime) < epsilon ||
        Math.abs(clipB!.startTime! - editPointTime) < epsilon
      ) {
        return {
          clipA: { id: clipA!.id!, startTime: clipA!.startTime!, endTime: clipA!.endTime! },
          clipB: { id: clipB!.id!, startTime: clipB!.startTime!, endTime: clipB!.endTime! },
        };
      }
    }

    return null;
  }

  /**
   * Find all edit points on a track (or all tracks) within the In/Out range
   * or at the playhead.
   */
  private findEditPoints(
    position: 'at-playhead' | 'all-in-out' | 'selected-tracks',
  ): Array<{ trackId: string; editPointTime: number }> {
    const state = useEditorStore.getState();
    const results: Array<{ trackId: string; editPointTime: number }> = [];

    const tracksToSearch: typeof state.tracks =
      position === 'selected-tracks'
        ? state.tracks.filter((t) => t.id === state.selectedTrackId)
        : state.tracks;

    const epsilon = 0.01;

    for (const track of tracksToSearch) {
      const sorted = [...track.clips].sort((a, b) => a.startTime - b.startTime);

      for (let i = 0; i < sorted.length - 1; i++) {
        const clipA = sorted[i];
        const clipB = sorted[i + 1];
        const editTime = clipA!.endTime!;

        // Check adjacency (gap less than epsilon means the clips abut)
        if (Math.abs(clipB!.startTime! - clipA!.endTime!) > epsilon) continue;

        if (position === 'at-playhead') {
          const playhead = this.getPlayheadTime();
          if (Math.abs(editTime - playhead) < epsilon) {
            results.push({ trackId: track.id, editPointTime: editTime });
          }
        } else {
          // all-in-out: all edit points within in/out range (or entire timeline)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inPoint/outPoint may not be on all state shapes
          const inPoint = (state as any).inPoint ?? 0;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const outPoint = (state as any).outPoint ?? state.duration;
          if (editTime >= inPoint - epsilon && editTime <= outPoint + epsilon) {
            results.push({ trackId: track.id, editPointTime: editTime });
          }
        }
      }
    }

    return results;
  }

  /**
   * Build default parameter values from a transition definition.
   */
  private buildDefaultParams(def: TransitionDefinition): Record<string, any> {
    const params: Record<string, any> = {};
    for (const p of def.parameters) {
      params[p.name] = p.default;
    }
    return params;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Definitions
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get all registered transition definitions. */
  getDefinitions(): TransitionDefinition[] {
    return Array.from(this.definitions.values());
  }

  /** Get a single transition definition by ID. */
  getDefinition(id: string): TransitionDefinition | null {
    return this.definitions.get(id) ?? null;
  }

  /** Get all definitions within a given category. */
  getDefinitionsByCategory(category: TransitionCategory): TransitionDefinition[] {
    return Array.from(this.definitions.values()).filter((d) => d.category === category);
  }

  /**
   * Register a custom transition definition (e.g. from a plugin).
   * @param def  The transition definition to register.
   */
  registerDefinition(def: TransitionDefinition): void {
    this.definitions.set(def.id, def);
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Apply Transitions
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Apply a transition at a specific edit point on a track.
   *
   * @param trackId        Track identifier.
   * @param editPointTime  Time of the edit point (where clipA ends and clipB begins).
   * @param definitionId   ID of the transition definition to apply.
   * @param options        Optional duration, alignment, and parameter overrides.
   * @returns The created TransitionInstance, or null if the edit point is invalid.
   */
  applyTransition(
    trackId: string,
    editPointTime: number,
    definitionId: string,
    options?: {
      duration?: number;
      alignment?: TransitionAlignment;
      params?: Record<string, any>;
    },
  ): TransitionInstance | null {
    const def = this.definitions.get(definitionId);
    if (!def) {
      console.warn(`[TransitionEngine] Definition "${definitionId}" not found`);
      return null;
    }

    const editPoint = this.findEditPointClips(trackId, editPointTime);
    if (!editPoint) {
      console.warn(`[TransitionEngine] No valid edit point at ${editPointTime}s on track "${trackId}"`);
      return null;
    }

    // Remove any existing transition at this edit point
    const existing = this.getTransitionAtEditPoint(trackId, editPointTime);
    if (existing) {
      this.instances.delete(existing.id);
    }

    const durationFrames = options?.duration ?? def.defaultDuration;
    const durationSeconds = framesToSeconds(durationFrames);
    const alignment = options?.alignment ?? 'center';

    // Merge default params with any user overrides
    const params = {
      ...this.buildDefaultParams(def),
      ...(options?.params ?? {}),
    };

    const instance: TransitionInstance = {
      id: createId('trn'),
      definitionId,
      trackId,
      editPointTime,
      duration: durationSeconds,
      alignment,
      params,
      clipAId: editPoint.clipA.id,
      clipBId: editPoint.clipB.id,
      rendered: false,
    };

    this.instances.set(instance.id, instance);
    this.notify();
    return instance;
  }

  /**
   * Quick transition: apply a dissolve, dip-to-black, or dip-to-white
   * at one or more edit points.
   *
   * This mirrors the Avid "Quick Transition" dialog (Ctrl+Shift+\).
   *
   * @param options  Quick transition configuration.
   * @returns Array of created transition instances.
   */
  quickTransition(options: QuickTransitionOptions): TransitionInstance[] {
    const position = options.position ?? 'at-playhead';
    const durationFrames = options.duration ?? 40;
    const alignment = options.alignment ?? 'center';

    // Map quick-transition type to a definition ID
    let definitionId: string;
    let paramOverrides: Record<string, any> = {};

    switch (options.type) {
      case 'dissolve':
        definitionId = 'film-dissolve';
        break;
      case 'dip-to-black':
        definitionId = 'dip-to-color';
        paramOverrides = { color: '#000000' };
        break;
      case 'dip-to-white':
        definitionId = 'dip-to-color';
        paramOverrides = { color: '#ffffff' };
        break;
      default:
        definitionId = 'film-dissolve';
    }

    const editPoints = this.findEditPoints(position);
    const results: TransitionInstance[] = [];

    for (const ep of editPoints) {
      const instance = this.applyTransition(ep.trackId, ep.editPointTime, definitionId, {
        duration: durationFrames,
        alignment,
        params: paramOverrides,
      });
      if (instance) {
        results.push(instance);
      }
    }

    return results;
  }

  /**
   * Apply the default transition (dissolve) at an edit point with default duration.
   *
   * This is the shortcut action (Ctrl+\ in Avid).
   *
   * @param trackId        Track identifier.
   * @param editPointTime  Time of the edit point.
   * @returns The created TransitionInstance, or null.
   */
  applyDefaultTransition(trackId: string, editPointTime: number): TransitionInstance | null {
    return this.applyTransition(trackId, editPointTime, this.defaultTransitionId, {
      duration: this.defaultDurationFrames,
      alignment: 'center',
    });
  }

  /**
   * Remove a transition by its instance ID.
   * @param transitionId  The transition instance to remove.
   */
  removeTransition(transitionId: string): void {
    if (this.instances.delete(transitionId)) {
      this.notify();
    }
  }

  /**
   * Remove all transitions, optionally filtered to a single track.
   * @param trackId  Optional track filter. If omitted, removes all transitions.
   */
  removeAllTransitions(trackId?: string): void {
    if (trackId) {
      for (const [id, inst] of this.instances) {
        if (inst.trackId === trackId) {
          this.instances.delete(id);
        }
      }
    } else {
      this.instances.clear();
    }
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Modify
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Update a single parameter value on a transition instance.
   *
   * @param transitionId  The transition instance to update.
   * @param paramName     The parameter name to change.
   * @param value         The new parameter value.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- transition params are heterogeneous
  updateTransitionParam(transitionId: string, paramName: string, value: any): void {
    const inst = this.instances.get(transitionId);
    if (!inst) {
      console.warn(`[TransitionEngine] Transition "${transitionId}" not found`);
      return;
    }
    inst.params[paramName] = value;
    inst.rendered = false;
    this.notify();
  }

  /**
   * Set the duration of a transition instance.
   *
   * @param transitionId  The transition instance.
   * @param duration      New duration in frames.
   */
  setTransitionDuration(transitionId: string, duration: number): void {
    const inst = this.instances.get(transitionId);
    if (!inst) {
      console.warn(`[TransitionEngine] Transition "${transitionId}" not found`);
      return;
    }
    inst.duration = framesToSeconds(Math.max(1, duration));
    inst.rendered = false;
    this.notify();
  }

  /**
   * Set the alignment of a transition instance relative to the edit point.
   *
   * @param transitionId  The transition instance.
   * @param alignment     New alignment mode.
   */
  setTransitionAlignment(transitionId: string, alignment: TransitionAlignment): void {
    const inst = this.instances.get(transitionId);
    if (!inst) {
      console.warn(`[TransitionEngine] Transition "${transitionId}" not found`);
      return;
    }
    inst.alignment = alignment;
    inst.rendered = false;
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Query
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get a transition instance by ID. */
  getTransition(transitionId: string): TransitionInstance | null {
    const inst = this.instances.get(transitionId);
    return inst ? { ...inst, params: { ...inst.params } } : null;
  }

  /** Get all transition instances on a specific track, sorted by edit point time. */
  getTransitionsForTrack(trackId: string): TransitionInstance[] {
    const results: TransitionInstance[] = [];
    for (const inst of this.instances.values()) {
      if (inst.trackId === trackId) {
        results.push({ ...inst, params: { ...inst.params } });
      }
    }
    return results.sort((a, b) => a.editPointTime - b.editPointTime);
  }

  /**
   * Get the transition at a specific edit point on a track.
   *
   * @param trackId        Track identifier.
   * @param editPointTime  Time of the edit point.
   * @returns The TransitionInstance, or null if none exists at that point.
   */
  getTransitionAtEditPoint(trackId: string, editPointTime: number): TransitionInstance | null {
    const epsilon = 0.01;
    for (const inst of this.instances.values()) {
      if (inst.trackId === trackId && Math.abs(inst.editPointTime - editPointTime) < epsilon) {
        return { ...inst, params: { ...inst.params } };
      }
    }
    return null;
  }

  /** Get all transition instances across all tracks. */
  getAllTransitions(): TransitionInstance[] {
    return Array.from(this.instances.values())
      .map((inst) => ({ ...inst, params: { ...inst.params } }))
      .sort((a, b) => a.editPointTime - b.editPointTime);
  }

  /**
   * Check whether a transition exists at a given edit point on a track.
   *
   * @param trackId        Track identifier.
   * @param editPointTime  Time of the edit point.
   * @returns true if a transition exists at this edit point.
   */
  hasTransition(trackId: string, editPointTime: number): boolean {
    return this.getTransitionAtEditPoint(trackId, editPointTime) !== null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Audio Cross Fades
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Apply an audio cross-fade at an edit point on an audio track.
   *
   * Audio cross-fades are modelled as dissolve transitions on audio tracks.
   *
   * @param trackId        Track identifier (should be an audio track).
   * @param editPointTime  Time of the edit point.
   * @param duration       Duration in frames (defaults to the audio cross-fade default).
   * @returns The created TransitionInstance, or null.
   */
  applyAudioCrossFade(
    trackId: string,
    editPointTime: number,
    duration?: number,
  ): TransitionInstance | null {
    const durationFrames = duration ?? this.audioCrossFadeDurationFrames;
    return this.applyTransition(trackId, editPointTime, 'film-dissolve', {
      duration: durationFrames,
      alignment: 'center',
    });
  }

  /** Get the default audio cross-fade duration in frames. */
  getDefaultAudioCrossFadeDuration(): number {
    return this.audioCrossFadeDurationFrames;
  }

  /**
   * Set the default audio cross-fade duration.
   * @param frames  Duration in frames.
   */
  setDefaultAudioCrossFadeDuration(frames: number): void {
    this.audioCrossFadeDurationFrames = Math.max(1, Math.round(frames));
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Rendering
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check whether a transition needs to be rendered.
   * @param transitionId  The transition instance to check.
   * @returns true if the transition has not been rendered or was invalidated.
   */
  needsRender(transitionId: string): boolean {
    const inst = this.instances.get(transitionId);
    return inst ? !inst.rendered : false;
  }

  /** Get all transition instances that have not yet been rendered. */
  getUnrenderedTransitions(): TransitionInstance[] {
    const results: TransitionInstance[] = [];
    for (const inst of this.instances.values()) {
      if (!inst.rendered) {
        results.push({ ...inst, params: { ...inst.params } });
      }
    }
    return results;
  }

  /**
   * Mark a transition as rendered.
   * @param transitionId  The transition instance to mark.
   */
  markRendered(transitionId: string): void {
    const inst = this.instances.get(transitionId);
    if (inst) {
      inst.rendered = true;
      this.notify();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Default Settings
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set the default transition definition (used by applyDefaultTransition).
   * @param definitionId  Definition ID to use as the default.
   */
  setDefaultTransition(definitionId: string): void {
    if (!this.definitions.has(definitionId)) {
      console.warn(`[TransitionEngine] Cannot set default: definition "${definitionId}" not found`);
      return;
    }
    this.defaultTransitionId = definitionId;
    this.notify();
  }

  /** Get the current default transition definition ID. */
  getDefaultTransition(): string {
    return this.defaultTransitionId;
  }

  /**
   * Set the default transition duration used by applyDefaultTransition.
   * @param frames  Duration in frames.
   */
  setDefaultDuration(frames: number): void {
    this.defaultDurationFrames = Math.max(1, Math.round(frames));
    this.notify();
  }

  /** Get the current default transition duration in frames. */
  getDefaultDuration(): number {
    return this.defaultDurationFrames;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Subscribe
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to transition engine state changes.
   *
   * @param cb  Callback invoked on any state change.
   * @returns An unsubscribe function.
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Cleanup
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Dispose the engine, clearing all internal state and subscriptions.
   * Primarily useful for tests and teardown.
   */
  dispose(): void {
    this.instances.clear();
    this.listeners.clear();
    this.defaultTransitionId = 'film-dissolve';
    this.defaultDurationFrames = 30;
    this.audioCrossFadeDurationFrames = 30;
  }
}

/** Singleton transition engine instance. */
export const transitionEngine = new TransitionEngine();
