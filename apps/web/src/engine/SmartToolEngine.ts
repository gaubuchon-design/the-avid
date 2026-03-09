// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Smart Tool Engine
// ═══════════════════════════════════════════════════════════════════════════
//
// Implements Avid Media Composer's Smart Tool system: four toggleable tools
// whose activation depends on cursor position relative to clips and edit
// points in the timeline.
//
//  1. Lift/Overwrite Segment  (red arrow)   - Shift+A
//  2. Extract/Splice-In Segment (yellow arrow) - Shift+S
//  3. Overwrite Trim  (red roller)  - Shift+D
//  4. Ripple Trim  (yellow roller)  - Shift+F
//
// With all four enabled, the cursor position within a clip determines which
// operation is active: upper/lower half selects segment vs. trim style, and
// proximity to an edit point selects trim vs. segment mode.
//

// ─── Types ──────────────────────────────────────────────────────────────────

/** Active smart tool mode determined by cursor position and toggle state. */
export type SmartToolMode =
  | 'lift-overwrite-segment'    // Red arrow  -- middle of clip, upper half
  | 'extract-splice-segment'    // Yellow arrow -- middle of clip, lower half
  | 'overwrite-trim'            // Red roller -- near edit point, upper half
  | 'ripple-trim'               // Yellow roller -- near edit point, lower half
  | 'roll-trim'                 // Directly on edit point center
  | 'a-side-trim'               // Near edit point, left (outgoing) side
  | 'b-side-trim'               // Near edit point, right (incoming) side
  | 'none';                     // No smart tool active

/** Toggle state for each of the four smart tool buttons. */
export interface SmartToolState {
  /** Lift/Overwrite Segment (red arrow, Shift+A). */
  liftOverwriteSegment: boolean;
  /** Extract/Splice-In Segment (yellow arrow, Shift+S). */
  extractSpliceSegment: boolean;
  /** Overwrite Trim (red roller, Shift+D). */
  overwriteTrim: boolean;
  /** Ripple Trim (yellow roller, Shift+F). */
  rippleTrim: boolean;
}

/** Result of a hit-test: the resolved mode, related IDs, and cursor type. */
export interface CursorZone {
  /** The smart tool mode that should be active. */
  mode: SmartToolMode;
  /** The clip under the cursor, or null. */
  clipId: string | null;
  /** The track under the cursor, or null. */
  trackId: string | null;
  /** The time of the nearest edit point, or null. */
  editPointTime: number | null;
  /** CSS cursor identifier for the current mode. */
  cursorType:
    | 'default'
    | 'segment-red'
    | 'segment-yellow'
    | 'trim-red'
    | 'trim-yellow'
    | 'trim-roll'
    | 'trim-a'
    | 'trim-b';
}

/** Parameters fed into `hitTest()` from the timeline mouse handler. */
export interface HitTestParams {
  /** Mouse X position in timeline viewport pixels. */
  x: number;
  /** Mouse Y position in timeline viewport pixels. */
  y: number;
  /** The time (seconds) corresponding to the mouse X position. */
  timeAtX: number;
  /** The track ID at the mouse Y position, or null if over empty space. */
  trackAtY: string | null;
  /** The clip ID under the cursor, or null. */
  clipAtPos: string | null;
  /** Time (seconds) of the nearest edit boundary, or null. */
  nearestEditPoint: number | null;
  /** Distance in pixels from the cursor to the nearest edit point. */
  distanceToEdit: number;
  /** Relative Y position within the clip/track row (0 = top, 1 = bottom). */
  relativeY: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default pixel distance from an edit point within which trim tools activate. */
const DEFAULT_EDIT_ZONE_PIXELS = 12;

/** Pixel distance from an edit point within which a roll trim activates. */
const ROLL_ZONE_PIXELS = 4;

// ─── Cursor / Icon maps ────────────────────────────────────────────────────

const CURSOR_MAP: Record<SmartToolMode, CursorZone['cursorType']> = {
  'lift-overwrite-segment': 'segment-red',
  'extract-splice-segment': 'segment-yellow',
  'overwrite-trim': 'trim-red',
  'ripple-trim': 'trim-yellow',
  'roll-trim': 'trim-roll',
  'a-side-trim': 'trim-a',
  'b-side-trim': 'trim-b',
  'none': 'default',
};

const ICON_MAP: Record<SmartToolMode, string> = {
  'lift-overwrite-segment': 'icon-segment-lift-overwrite',
  'extract-splice-segment': 'icon-segment-extract-splice',
  'overwrite-trim': 'icon-trim-overwrite',
  'ripple-trim': 'icon-trim-ripple',
  'roll-trim': 'icon-trim-roll',
  'a-side-trim': 'icon-trim-a-side',
  'b-side-trim': 'icon-trim-b-side',
  'none': 'icon-cursor-default',
};

const CSS_CURSOR_MAP: Record<SmartToolMode, string> = {
  'lift-overwrite-segment': 'grab',
  'extract-splice-segment': 'grab',
  'overwrite-trim': 'col-resize',
  'ripple-trim': 'col-resize',
  'roll-trim': 'col-resize',
  'a-side-trim': 'w-resize',
  'b-side-trim': 'e-resize',
  'none': 'default',
};

// ─── Engine ─────────────────────────────────────────────────────────────────

/**
 * Smart Tool engine for the timeline.
 *
 * Four toggle buttons control cursor behaviour. When all are enabled, the
 * cursor position within a clip determines which editing operation is active.
 * The engine performs hit-testing against edit points and clip bodies to
 * resolve the current tool mode, and provides CSS cursor and icon strings
 * for the UI layer.
 */
export class SmartToolEngine {
  // ── Private state ───────────────────────────────────────────────────────

  private state: SmartToolState = {
    liftOverwriteSegment: true,
    extractSpliceSegment: true,
    overwriteTrim: true,
    rippleTrim: true,
  };

  /** Pixel proximity threshold for edit-point trim zone. */
  private editZonePixels: number = DEFAULT_EDIT_ZONE_PIXELS;

  /**
   * Legacy mode: when enabled, toggling one segment tool off deactivates
   * the other (only one segment tool at a time).
   */
  private onlyOneSegmentTool = false;

  /** When true, Cmd+Shift constrains segment drags to vertical only. */
  private verticalDragOnly = false;

  /** Registered change listeners. */
  private listeners = new Set<() => void>();

  // ═══════════════════════════════════════════════════════════════════════
  //  Toggle Controls
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Toggle the Lift/Overwrite Segment tool (Shift+A).
   * @example
   * smartToolEngine.toggleLiftOverwriteSegment();
   */
  toggleLiftOverwriteSegment(): void {
    this.state.liftOverwriteSegment = !this.state.liftOverwriteSegment;
    if (this.onlyOneSegmentTool && this.state.liftOverwriteSegment) {
      this.state.extractSpliceSegment = false;
    }
    this.notify();
  }

  /**
   * Toggle the Extract/Splice-In Segment tool (Shift+S).
   * @example
   * smartToolEngine.toggleExtractSpliceSegment();
   */
  toggleExtractSpliceSegment(): void {
    this.state.extractSpliceSegment = !this.state.extractSpliceSegment;
    if (this.onlyOneSegmentTool && this.state.extractSpliceSegment) {
      this.state.liftOverwriteSegment = false;
    }
    this.notify();
  }

  /**
   * Toggle the Overwrite Trim tool (Shift+D).
   * @example
   * smartToolEngine.toggleOverwriteTrim();
   */
  toggleOverwriteTrim(): void {
    this.state.overwriteTrim = !this.state.overwriteTrim;
    this.notify();
  }

  /**
   * Toggle the Ripple Trim tool (Shift+F).
   * @example
   * smartToolEngine.toggleRippleTrim();
   */
  toggleRippleTrim(): void {
    this.state.rippleTrim = !this.state.rippleTrim;
    this.notify();
  }

  /**
   * Set one or more smart tool toggle states at once.
   *
   * @param partial Partial state to merge into the current state.
   * @example
   * smartToolEngine.setSmartToolState({
   *   liftOverwriteSegment: true,
   *   rippleTrim: false,
   * });
   */
  setSmartToolState(partial: Partial<SmartToolState>): void {
    Object.assign(this.state, partial);
    this.notify();
  }

  /**
   * Return a copy of the current smart tool toggle state.
   * @returns SmartToolState snapshot.
   */
  getSmartToolState(): SmartToolState {
    return { ...this.state };
  }

  /**
   * Enable all four smart tools.
   * @example
   * smartToolEngine.enableAll();
   */
  enableAll(): void {
    this.state.liftOverwriteSegment = true;
    this.state.extractSpliceSegment = true;
    this.state.overwriteTrim = true;
    this.state.rippleTrim = true;
    this.notify();
  }

  /**
   * Disable all four smart tools.
   * @example
   * smartToolEngine.disableAll();
   */
  disableAll(): void {
    this.state.liftOverwriteSegment = false;
    this.state.extractSpliceSegment = false;
    this.state.overwriteTrim = false;
    this.state.rippleTrim = false;
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Hit Testing
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Given the cursor position and surrounding context, determine which
   * smart tool mode should be active.
   *
   * **Decision tree:**
   *
   * 1. If the cursor is within `editZonePixels` of an edit point:
   *    - If within `ROLL_ZONE_PIXELS` (very close): `roll-trim`.
   *    - Upper half and `overwriteTrim` enabled: `overwrite-trim`.
   *    - Lower half and `rippleTrim` enabled: `ripple-trim`.
   *    - Left of edit point: `a-side-trim`.
   *    - Right of edit point: `b-side-trim`.
   *
   * 2. Else if there is a clip under the cursor:
   *    - Upper half and `liftOverwriteSegment` enabled: `lift-overwrite-segment`.
   *    - Lower half and `extractSpliceSegment` enabled: `extract-splice-segment`.
   *
   * 3. Otherwise: `none`.
   *
   * @param params Hit-test input parameters from the timeline mouse handler.
   * @returns A CursorZone describing the resolved mode, cursor, and context.
   * @example
   * const zone = smartToolEngine.hitTest({
   *   x: 320, y: 55,
   *   timeAtX: 5.25, trackAtY: 'v1',
   *   clipAtPos: 'clip_12', nearestEditPoint: 5.0,
   *   distanceToEdit: 6, relativeY: 0.3,
   * });
   */
  hitTest(params: HitTestParams): CursorZone {
    const {
      trackAtY,
      clipAtPos,
      nearestEditPoint,
      distanceToEdit,
      relativeY,
      timeAtX,
    } = params;

    const noToolsEnabled =
      !this.state.liftOverwriteSegment &&
      !this.state.extractSpliceSegment &&
      !this.state.overwriteTrim &&
      !this.state.rippleTrim;

    if (noToolsEnabled) {
      return this.buildZone('none', clipAtPos, trackAtY, nearestEditPoint);
    }

    // ── Near an edit point? ───────────────────────────────────────────
    const anyTrimEnabled = this.state.overwriteTrim || this.state.rippleTrim;

    if (
      anyTrimEnabled &&
      nearestEditPoint !== null &&
      distanceToEdit <= this.editZonePixels
    ) {
      return this.resolveTrimMode(
        params,
        clipAtPos,
        trackAtY,
        nearestEditPoint,
        timeAtX,
        distanceToEdit,
        relativeY,
      );
    }

    // ── Over a clip body? ─────────────────────────────────────────────
    if (clipAtPos !== null) {
      return this.resolveSegmentMode(
        relativeY,
        clipAtPos,
        trackAtY,
        nearestEditPoint,
      );
    }

    // ── Empty space ───────────────────────────────────────────────────
    return this.buildZone('none', null, trackAtY, nearestEditPoint);
  }

  // ── Hit-test helpers ────────────────────────────────────────────────────

  /** Resolve the trim mode when cursor is near an edit point. */
  private resolveTrimMode(
    params: HitTestParams,
    clipAtPos: string | null,
    trackAtY: string | null,
    nearestEditPoint: number | null,
    timeAtX: number,
    distanceToEdit: number,
    relativeY: number,
  ): CursorZone {
    // Very close to the cut line: roll trim.
    if (distanceToEdit <= ROLL_ZONE_PIXELS) {
      return this.buildZone('roll-trim', clipAtPos, trackAtY, nearestEditPoint);
    }

    // Upper half: overwrite trim.
    if (this.state.overwriteTrim && relativeY < 0.5) {
      return this.buildZone('overwrite-trim', clipAtPos, trackAtY, nearestEditPoint);
    }

    // Lower half: ripple trim.
    if (this.state.rippleTrim && relativeY >= 0.5) {
      return this.buildZone('ripple-trim', clipAtPos, trackAtY, nearestEditPoint);
    }

    // Only one trim tool enabled: use whichever is on.
    if (this.state.overwriteTrim) {
      return this.buildZone('overwrite-trim', clipAtPos, trackAtY, nearestEditPoint);
    }
    if (this.state.rippleTrim) {
      return this.buildZone('ripple-trim', clipAtPos, trackAtY, nearestEditPoint);
    }

    // A-side / B-side based on cursor position relative to edit point.
    if (nearestEditPoint !== null && timeAtX < nearestEditPoint) {
      return this.buildZone('a-side-trim', clipAtPos, trackAtY, nearestEditPoint);
    }
    if (nearestEditPoint !== null && timeAtX >= nearestEditPoint) {
      return this.buildZone('b-side-trim', clipAtPos, trackAtY, nearestEditPoint);
    }

    return this.buildZone('none', clipAtPos, trackAtY, nearestEditPoint);
  }

  /** Resolve the segment mode when cursor is over a clip body. */
  private resolveSegmentMode(
    relativeY: number,
    clipAtPos: string | null,
    trackAtY: string | null,
    nearestEditPoint: number | null,
  ): CursorZone {
    // Upper half: lift/overwrite segment.
    if (this.state.liftOverwriteSegment && relativeY < 0.5) {
      return this.buildZone(
        'lift-overwrite-segment',
        clipAtPos,
        trackAtY,
        nearestEditPoint,
      );
    }

    // Lower half: extract/splice segment.
    if (this.state.extractSpliceSegment && relativeY >= 0.5) {
      return this.buildZone(
        'extract-splice-segment',
        clipAtPos,
        trackAtY,
        nearestEditPoint,
      );
    }

    // Only one segment tool enabled: use whichever is on.
    if (this.state.liftOverwriteSegment) {
      return this.buildZone(
        'lift-overwrite-segment',
        clipAtPos,
        trackAtY,
        nearestEditPoint,
      );
    }
    if (this.state.extractSpliceSegment) {
      return this.buildZone(
        'extract-splice-segment',
        clipAtPos,
        trackAtY,
        nearestEditPoint,
      );
    }

    return this.buildZone('none', clipAtPos, trackAtY, nearestEditPoint);
  }

  /** Construct a CursorZone from the resolved mode and context. */
  private buildZone(
    mode: SmartToolMode,
    clipId: string | null,
    trackId: string | null,
    editPointTime: number | null,
  ): CursorZone {
    return {
      mode,
      clipId,
      trackId,
      editPointTime,
      cursorType: CURSOR_MAP[mode],
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Cursor & Icon Management
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Return the CSS cursor string for a given smart tool mode.
   *
   * @param mode Smart tool mode.
   * @returns CSS cursor value (e.g. 'grab', 'col-resize', 'default').
   * @example
   * element.style.cursor = smartToolEngine.getCursorForMode('ripple-trim');
   */
  getCursorForMode(mode: SmartToolMode): string {
    return CSS_CURSOR_MAP[mode] ?? 'default';
  }

  /**
   * Return the icon identifier string for a given smart tool mode.
   *
   * @param mode Smart tool mode.
   * @returns Icon identifier for use in the UI layer.
   * @example
   * const icon = smartToolEngine.getIconForMode('overwrite-trim');
   */
  getIconForMode(mode: SmartToolMode): string {
    return ICON_MAP[mode] ?? 'icon-cursor-default';
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Settings
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Set the pixel distance from an edit point within which trim tools
   * activate.
   *
   * @param px Distance in pixels (clamped to [2, 50]).
   * @example
   * smartToolEngine.setEditZonePixels(16);
   */
  setEditZonePixels(px: number): void {
    this.editZonePixels = Math.max(2, Math.min(50, px));
  }

  /** Get the current edit zone pixel distance. */
  getEditZonePixels(): number {
    return this.editZonePixels;
  }

  /**
   * Enable or disable legacy mode where only one segment tool can be
   * active at a time.
   *
   * @param enabled Whether to enforce mutual exclusion.
   * @example
   * smartToolEngine.setOnlyOneSegmentTool(true);
   */
  setOnlyOneSegmentTool(enabled: boolean): void {
    this.onlyOneSegmentTool = enabled;
    // Enforce: if both are on and we just enabled the constraint, keep
    // only liftOverwriteSegment.
    if (
      enabled &&
      this.state.liftOverwriteSegment &&
      this.state.extractSpliceSegment
    ) {
      this.state.extractSpliceSegment = false;
      this.notify();
    }
  }

  /** Whether legacy single-segment-tool mode is enabled. */
  isOnlyOneSegmentTool(): boolean {
    return this.onlyOneSegmentTool;
  }

  /**
   * Enable or disable vertical-only drag constraint (Cmd+Shift behaviour).
   *
   * @param enabled Whether vertical-only drag is active.
   * @example
   * smartToolEngine.setVerticalDragOnly(true); // Cmd+Shift held
   */
  setVerticalDragOnly(enabled: boolean): void {
    this.verticalDragOnly = enabled;
  }

  /** Whether vertical-only drag constraint is active. */
  isVerticalDragOnly(): boolean {
    return this.verticalDragOnly;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Convenience Queries
  // ═══════════════════════════════════════════════════════════════════════

  /** Whether any smart tool is currently enabled. */
  isAnyToolEnabled(): boolean {
    return (
      this.state.liftOverwriteSegment ||
      this.state.extractSpliceSegment ||
      this.state.overwriteTrim ||
      this.state.rippleTrim
    );
  }

  /** Whether all four smart tools are enabled. */
  areAllToolsEnabled(): boolean {
    return (
      this.state.liftOverwriteSegment &&
      this.state.extractSpliceSegment &&
      this.state.overwriteTrim &&
      this.state.rippleTrim
    );
  }

  /** Whether any segment tool is enabled. */
  isAnySegmentToolEnabled(): boolean {
    return this.state.liftOverwriteSegment || this.state.extractSpliceSegment;
  }

  /** Whether any trim tool is enabled. */
  isAnyTrimToolEnabled(): boolean {
    return this.state.overwriteTrim || this.state.rippleTrim;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Subscribe / State
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to smart tool state changes.
   *
   * @param cb Callback invoked whenever a toggle or setting changes.
   * @returns An unsubscribe function.
   * @example
   * const unsub = smartToolEngine.subscribe(() => refreshToolbar());
   * // later: unsub();
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /**
   * Return a copy of the current smart tool state.
   * @returns SmartToolState snapshot.
   */
  getState(): SmartToolState {
    return { ...this.state };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Reset / Dispose
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Reset to default state (all tools enabled, default settings).
   * @example
   * smartToolEngine.reset();
   */
  reset(): void {
    this.state = {
      liftOverwriteSegment: true,
      extractSpliceSegment: true,
      overwriteTrim: true,
      rippleTrim: true,
    };
    this.editZonePixels = DEFAULT_EDIT_ZONE_PIXELS;
    this.onlyOneSegmentTool = false;
    this.verticalDragOnly = false;
    this.notify();
  }

  /**
   * Dispose the engine, clearing all state and listeners.
   * @example
   * smartToolEngine.dispose();
   */
  dispose(): void {
    this.reset();
    this.listeners.clear();
  }

  // ── Internal ────────────────────────────────────────────────────────────

  /** Notify all subscribers that state has changed. */
  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('[SmartToolEngine] Subscriber error:', err);
      }
    });
  }
}

/** Singleton smart tool engine instance. */
export const smartToolEngine = new SmartToolEngine();
