// =============================================================================
//  THE AVID -- Attribute Clipboard Engine
// =============================================================================
//
// Implements Resolve/Premiere-style copy/paste of clip attributes:
//  - Copy specific attributes (intrinsic video, audio, time remap, effects)
//    from a source clip
//  - Paste copied attributes onto one or more target clips
//  - Remove (reset to defaults) specific attributes from clips
//
// This is distinct from the system clipboard; it is an internal clipboard
// for transferring clip properties between clips on the timeline.
//
// =============================================================================

import {
  type Clip,
  type IntrinsicVideoProps,
  type IntrinsicAudioProps,
  type TimeRemapState,
  DEFAULT_INTRINSIC_VIDEO,
  DEFAULT_INTRINSIC_AUDIO,
  DEFAULT_TIME_REMAP,
} from '../store/editor.store';

// ─── Types ──────────────────────────────────────────────────────────────────

/** The set of attributes that can be copied between clips. */
export interface ClipAttributes {
  intrinsicVideo?: IntrinsicVideoProps;
  intrinsicAudio?: IntrinsicAudioProps;
  timeRemap?: TimeRemapState;
  effectIds?: string[];
}

// =============================================================================
//  AttributeClipboard
// =============================================================================

/**
 * Engine for copying, pasting, and removing clip attributes.
 *
 * Works like Premiere's "Paste Attributes" or Resolve's "Paste Attributes"
 * workflow: select a source clip, copy its attributes (or a subset), then
 * paste them onto one or more target clips.
 *
 * All paste/remove operations return new Clip arrays (immutable pattern).
 */
export class AttributeClipboard {
  /** The currently stored clipboard data. */
  private clipboard: ClipAttributes | null = null;

  /** Subscriber callbacks. */
  private listeners = new Set<() => void>();

  /** Notify all subscribers that state has changed. */
  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('[AttributeClipboard] Subscriber error:', err);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Copy
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Copy specified attributes from a source clip to the internal clipboard.
   *
   * Only the attributes listed in `which` are copied; others are left out
   * of the clipboard. Deep copies are made so that later mutations of the
   * source clip do not affect the clipboard contents.
   *
   * @param clip  The source clip to copy from.
   * @param which Array of attribute keys to copy.
   *
   * @example
   * attributeClipboard.copyAttributes(myClip, ['intrinsicVideo', 'timeRemap']);
   */
  copyAttributes(clip: Clip, which: (keyof ClipAttributes)[]): void {
    const attrs: ClipAttributes = {};

    for (const key of which) {
      switch (key) {
        case 'intrinsicVideo':
          attrs.intrinsicVideo = { ...clip.intrinsicVideo };
          break;
        case 'intrinsicAudio':
          attrs.intrinsicAudio = { ...clip.intrinsicAudio };
          break;
        case 'timeRemap':
          attrs.timeRemap = {
            ...clip.timeRemap,
            keyframes: clip.timeRemap.keyframes.map((kf) => ({ ...kf })),
          };
          break;
        case 'effectIds':
          // Effect IDs are stored externally (effects store); we copy the
          // reference list so that pasteAttributes can re-apply them.
          // The caller is responsible for providing the IDs if needed.
          // For now, store an empty array as a placeholder that signals
          // "effects should be copied" — the actual duplication is handled
          // at the integration layer with the effects store.
          attrs.effectIds = [];
          break;
      }
    }

    this.clipboard = attrs;
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Paste
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Paste the clipboard's attributes onto one or more target clips.
   *
   * Only the attributes that were copied (present in the clipboard) are
   * applied. Attributes not in the clipboard are left unchanged on the
   * target clips.
   *
   * @param clips The target clips to paste onto.
   * @returns New Clip array with the pasted attributes applied.
   */
  pasteAttributes(clips: Clip[]): Clip[] {
    if (!this.clipboard) {
      console.warn('[AttributeClipboard] Nothing on clipboard to paste');
      return clips;
    }

    const attrs = this.clipboard;

    return clips.map((clip) => {
      const updated: Clip = { ...clip };

      if (attrs.intrinsicVideo) {
        updated.intrinsicVideo = { ...attrs.intrinsicVideo };
      }
      if (attrs.intrinsicAudio) {
        updated.intrinsicAudio = { ...attrs.intrinsicAudio };
      }
      if (attrs.timeRemap) {
        updated.timeRemap = {
          ...attrs.timeRemap,
          keyframes: attrs.timeRemap.keyframes.map((kf) => ({ ...kf })),
        };
      }
      // effectIds pasting is intentionally left to the integration layer
      // (effects store) because effect instances need to be duplicated, not
      // just referenced.

      return updated;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Remove (Reset)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Remove (reset to defaults) specified attributes on one or more clips.
   *
   * This is the "Remove Attributes" workflow: select clips and choose
   * which properties to strip back to their factory defaults.
   *
   * @param clips The clips to modify.
   * @param which Array of attribute keys to reset.
   * @returns New Clip array with the specified attributes reset to defaults.
   */
  removeAttributes(clips: Clip[], which: (keyof ClipAttributes)[]): Clip[] {
    return clips.map((clip) => {
      const updated: Clip = { ...clip };

      for (const key of which) {
        switch (key) {
          case 'intrinsicVideo':
            updated.intrinsicVideo = { ...DEFAULT_INTRINSIC_VIDEO };
            break;
          case 'intrinsicAudio':
            updated.intrinsicAudio = { ...DEFAULT_INTRINSIC_AUDIO };
            break;
          case 'timeRemap':
            updated.timeRemap = {
              ...DEFAULT_TIME_REMAP,
              keyframes: [],
            };
            break;
          case 'effectIds':
            // Clearing effect IDs signals the integration layer to remove
            // all applied effects from the effects store for these clips.
            break;
        }
      }

      return updated;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Query
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Check whether the clipboard currently holds any attributes.
   *
   * @returns `true` if there are copied attributes available for pasting.
   */
  hasAttributes(): boolean {
    return this.clipboard !== null;
  }

  /**
   * Get the current clipboard contents.
   *
   * @returns The ClipAttributes on the clipboard, or null if empty.
   */
  getClipboard(): ClipAttributes | null {
    if (!this.clipboard) return null;

    // Return a defensive copy
    const copy: ClipAttributes = {};
    if (this.clipboard.intrinsicVideo) {
      copy.intrinsicVideo = { ...this.clipboard.intrinsicVideo };
    }
    if (this.clipboard.intrinsicAudio) {
      copy.intrinsicAudio = { ...this.clipboard.intrinsicAudio };
    }
    if (this.clipboard.timeRemap) {
      copy.timeRemap = {
        ...this.clipboard.timeRemap,
        keyframes: this.clipboard.timeRemap.keyframes.map((kf) => ({ ...kf })),
      };
    }
    if (this.clipboard.effectIds) {
      copy.effectIds = [...this.clipboard.effectIds];
    }
    return copy;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Subscribe
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to attribute clipboard state changes.
   *
   * @param cb Callback invoked on any mutation (copy, clear, etc.).
   * @returns An unsubscribe function.
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Cleanup
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Clear the clipboard and remove all listeners.
   * Primarily useful for tests and teardown.
   */
  dispose(): void {
    this.clipboard = null;
    this.listeners.clear();
  }
}

/** Singleton attribute clipboard instance. */
export const attributeClipboard = new AttributeClipboard();
