// ─── Command Pattern ──────────────────────────────────────────────────────────

/** A reversible command for undo/redo support. */
export interface Command {
  /** Human-readable description of the command (e.g. "Add clip 'Scene 1'"). */
  readonly description: string;
  /** Execute the command, applying its changes to the store. */
  execute(): void;
  /** Undo the command, reverting its changes to the store. */
  undo(): void;
}

// ─── Snap Types ───────────────────────────────────────────────────────────────

/** The result of a snap operation against timeline anchors. */
export interface SnapResult {
  /** The time to snap to. */
  time: number;
  /** The anchor time that caused the snap. */
  anchor: number;
  /** Absolute delta between original time and snapped time (seconds). */
  delta: number;
}

/** A single snap anchor point with metadata about its source. */
export interface SnapAnchor {
  /** The time position of this anchor in seconds. */
  time: number;
  /** The source type that produced this anchor. */
  source: 'playhead' | 'clip-start' | 'clip-end' | 'marker' | 'grid';
}
