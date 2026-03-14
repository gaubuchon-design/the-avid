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

/**
 * Active smart tool mode determined by cursor position and toggle state.
 *
 * Avid Media Composer's Smart Tool has four quadrants:
 *
 *   1. **Lift/Overwrite Segment** (top half of clip body) - Shift+A
 *   2. **Extract/Splice Segment** (bottom half of clip body) - Shift+S
 *   3. **Overwrite Trim / Roll** (top half near edit point) - Shift+D
 *   4. **Ripple Trim** (bottom half near edit point) - Shift+F
 *
 * Additional modes for fine-grained trim side selection:
 */
export type SmartToolMode =
  | 'lift-overwrite-segment'    // Red arrow  -- middle of clip, upper half
  | 'extract-splice-segment'    // Yellow arrow -- middle of clip, lower half
  | 'overwrite-trim'            // Red roller -- near edit point, upper half (Roll)
  | 'ripple-trim'               // Yellow roller -- near edit point, lower half
  | 'roll-trim'                 // Directly on edit point center (within ROLL_ZONE_PIXELS)
  | 'a-side-trim'               // Near edit point, left of cut (outgoing clip)
  | 'b-side-trim'               // Near edit point, right of cut (incoming clip)
  | 'slip'                      // Top portion of clip body (above 0.25 relativeY)
  | 'none';                     // No smart tool active

/**
 * Identifies which of the four Avid Smart Tool quadrants is active.
 * This is a higher-level abstraction used by the editor store.
 */
export type SmartToolQuadrant =
  | 'lift-overwrite'            // Quadrant 1: Shift+A
  | 'extract-splice'            // Quadrant 2: Shift+S
  | 'overwrite-trim'            // Quadrant 3: Shift+D (Roll/Overwrite)
  | 'ripple-trim'               // Quadrant 4: Shift+F
  | 'none';

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
  'slip': 'segment-red',
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
  'slip': 'icon-trim-slip',
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
  'slip': 'ew-resize',
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

  /** The currently active Smart Tool quadrant (updated on each hit test). */
  private activeQuadrant: SmartToolQuadrant = 'none';

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
      this.activeQuadrant = 'none';
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
    this.activeQuadrant = 'none';
    return this.buildZone('none', null, trackAtY, nearestEditPoint);
  }

  // ── Hit-test helpers ────────────────────────────────────────────────────

  /**
   * Resolve the trim mode when cursor is near an edit point.
   *
   * Avid Smart Tool quadrant logic near edit points:
   *
   *   - Very close to cut line (within ROLL_ZONE_PIXELS): Roll trim
   *   - Upper half + overwriteTrim enabled: Overwrite trim (Roll)
   *     - Left of edit: A-side overwrite
   *     - Right of edit: B-side overwrite
   *   - Lower half + rippleTrim enabled: Ripple trim
   *     - Left of edit: A-side ripple
   *     - Right of edit: B-side ripple
   *
   * The A-side/B-side distinction is critical for Avid's trim behavior:
   * - A-side (outgoing) = cursor is to the LEFT of the edit point
   * - B-side (incoming) = cursor is to the RIGHT of the edit point
   */
  private resolveTrimMode(
    params: HitTestParams,
    clipAtPos: string | null,
    trackAtY: string | null,
    nearestEditPoint: number | null,
    timeAtX: number,
    distanceToEdit: number,
    relativeY: number,
  ): CursorZone {
    // Very close to the cut line: roll trim (both sides engaged).
    if (distanceToEdit <= ROLL_ZONE_PIXELS) {
      this.activeQuadrant = 'overwrite-trim';
      return this.buildZone('roll-trim', clipAtPos, trackAtY, nearestEditPoint);
    }

    // Determine which side of the edit point the cursor is on.
    const isASide = nearestEditPoint !== null && timeAtX < nearestEditPoint;

    // Both trim tools enabled: use vertical position to choose.
    if (this.state.overwriteTrim && this.state.rippleTrim) {
      if (relativeY < 0.5) {
        // Upper half: Overwrite trim (Roll behavior).
        // Show A-side or B-side indicator based on horizontal position.
        this.activeQuadrant = 'overwrite-trim';
        if (isASide) {
          return this.buildZone('a-side-trim', clipAtPos, trackAtY, nearestEditPoint);
        }
        return this.buildZone('b-side-trim', clipAtPos, trackAtY, nearestEditPoint);
      } else {
        // Lower half: Ripple trim.
        this.activeQuadrant = 'ripple-trim';
        if (isASide) {
          return this.buildZone('a-side-trim', clipAtPos, trackAtY, nearestEditPoint);
        }
        return this.buildZone('b-side-trim', clipAtPos, trackAtY, nearestEditPoint);
      }
    }

    // Only overwrite trim enabled.
    if (this.state.overwriteTrim) {
      this.activeQuadrant = 'overwrite-trim';
      if (isASide) {
        return this.buildZone('a-side-trim', clipAtPos, trackAtY, nearestEditPoint);
      }
      return this.buildZone('b-side-trim', clipAtPos, trackAtY, nearestEditPoint);
    }

    // Only ripple trim enabled.
    if (this.state.rippleTrim) {
      this.activeQuadrant = 'ripple-trim';
      if (isASide) {
        return this.buildZone('a-side-trim', clipAtPos, trackAtY, nearestEditPoint);
      }
      return this.buildZone('b-side-trim', clipAtPos, trackAtY, nearestEditPoint);
    }

    this.activeQuadrant = 'none';
    return this.buildZone('none', clipAtPos, trackAtY, nearestEditPoint);
  }

  /**
   * Resolve the segment mode when cursor is over a clip body.
   *
   * Avid Smart Tool clip body quadrants:
   *
   *   - Top portion (relativeY < 0.25): Slip (changes source IN/OUT without
   *     moving clip in timeline)
   *   - Upper half (0.25 <= relativeY < 0.5): Lift/Overwrite Segment
   *   - Lower half (relativeY >= 0.5): Extract/Splice-In Segment
   *
   * When only one segment tool is enabled, the entire clip body uses that tool.
   */
  private resolveSegmentMode(
    relativeY: number,
    clipAtPos: string | null,
    trackAtY: string | null,
    nearestEditPoint: number | null,
  ): CursorZone {
    // Top portion of clip: Slip mode (when overwrite trim is enabled).
    // This matches Avid's behavior where the very top of a clip activates slip.
    if (this.state.overwriteTrim && relativeY < 0.15) {
      this.activeQuadrant = 'overwrite-trim';
      return this.buildZone('slip', clipAtPos, trackAtY, nearestEditPoint);
    }

    // Upper half: lift/overwrite segment.
    if (this.state.liftOverwriteSegment && relativeY < 0.5) {
      this.activeQuadrant = 'lift-overwrite';
      return this.buildZone(
        'lift-overwrite-segment',
        clipAtPos,
        trackAtY,
        nearestEditPoint,
      );
    }

    // Lower half: extract/splice segment.
    if (this.state.extractSpliceSegment && relativeY >= 0.5) {
      this.activeQuadrant = 'extract-splice';
      return this.buildZone(
        'extract-splice-segment',
        clipAtPos,
        trackAtY,
        nearestEditPoint,
      );
    }

    // Only one segment tool enabled: use whichever is on.
    if (this.state.liftOverwriteSegment) {
      this.activeQuadrant = 'lift-overwrite';
      return this.buildZone(
        'lift-overwrite-segment',
        clipAtPos,
        trackAtY,
        nearestEditPoint,
      );
    }
    if (this.state.extractSpliceSegment) {
      this.activeQuadrant = 'extract-splice';
      return this.buildZone(
        'extract-splice-segment',
        clipAtPos,
        trackAtY,
        nearestEditPoint,
      );
    }

    this.activeQuadrant = 'none';
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
  //  Quadrant Queries
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Return the currently active Smart Tool quadrant.
   *
   * This is updated on every `hitTest()` call and represents which of
   * the four Avid Smart Tool sections is engaged.
   *
   * @returns The active quadrant.
   */
  getActiveQuadrant(): SmartToolQuadrant {
    return this.activeQuadrant;
  }

  /**
   * Map a SmartToolMode to its corresponding SmartToolQuadrant.
   *
   * This is useful when converting fine-grained mode info (like a-side-trim
   * or b-side-trim) into the broader quadrant category.
   *
   * @param mode The resolved smart tool mode.
   * @returns The quadrant this mode belongs to.
   */
  getQuadrantForMode(mode: SmartToolMode): SmartToolQuadrant {
    switch (mode) {
      case 'lift-overwrite-segment':
        return 'lift-overwrite';
      case 'extract-splice-segment':
        return 'extract-splice';
      case 'overwrite-trim':
      case 'roll-trim':
      case 'slip':
        return 'overwrite-trim';
      case 'ripple-trim':
      case 'a-side-trim':
      case 'b-side-trim':
        return 'ripple-trim';
      default:
        return 'none';
    }
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
    this.activeQuadrant = 'none';
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
