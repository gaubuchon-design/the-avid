import { useEffect, useRef, useCallback } from 'react';

/**
 * Modifier keys that can be combined with a key for a shortcut.
 */
export interface ShortcutModifiers {
  /** Ctrl key (Windows/Linux) or Cmd key (macOS) */
  meta?: boolean;
  /** Shift key */
  shift?: boolean;
  /** Alt/Option key */
  alt?: boolean;
  /** Ctrl key specifically (not Cmd on macOS) */
  ctrl?: boolean;
}

/**
 * Shortcut definition combining a key with optional modifiers.
 */
export interface ShortcutDef {
  /** The key value (e.g. 'k', 'Enter', 'ArrowLeft', ' ') */
  key: string;
  /** Modifier keys */
  modifiers?: ShortcutModifiers;
  /** If true, the shortcut fires even when focus is in an input/textarea */
  global?: boolean;
}

/**
 * Register a keyboard shortcut handler. Automatically cleans up on unmount.
 *
 * Ignores events originating from INPUT, TEXTAREA, and SELECT elements
 * unless `global` is set to true in the shortcut definition.
 *
 * @param shortcut - Shortcut definition or string (e.g. 'Space', 'meta+k')
 * @param handler - Function to call when the shortcut is triggered
 * @param options - Additional options
 *
 * @example
 * ```tsx
 * // Simple key
 * useKeyboardShortcut({ key: ' ' }, () => togglePlay());
 *
 * // With modifiers
 * useKeyboardShortcut({ key: 'k', modifiers: { meta: true } }, () => openPalette());
 *
 * // String shorthand
 * useKeyboardShortcut('meta+k', () => openPalette());
 *
 * // Disabled conditionally
 * useKeyboardShortcut({ key: 'Delete' }, deleteSelected, { enabled: hasSelection });
 * ```
 */
export function useKeyboardShortcut(
  shortcut: ShortcutDef | string,
  handler: (event: KeyboardEvent) => void,
  options: { enabled?: boolean } = {},
): void {
  const { enabled = true } = options;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const parsed = useRef<ShortcutDef>(
    typeof shortcut === 'string' ? parseShortcutString(shortcut) : shortcut,
  );
  // Update parsed ref if shortcut changes
  if (typeof shortcut === 'string') {
    parsed.current = parseShortcutString(shortcut);
  } else {
    parsed.current = shortcut;
  }

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const def = parsed.current;

      // Skip inputs unless global
      if (!def.global) {
        const tagName = (e.target as Element)?.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
          return;
        }
        // Also skip contenteditable
        if ((e.target as HTMLElement)?.isContentEditable) {
          return;
        }
      }

      // Check modifiers
      const mods = def.modifiers ?? {};
      const wantMeta = mods.meta ?? false;
      const wantShift = mods.shift ?? false;
      const wantAlt = mods.alt ?? false;
      const wantCtrl = mods.ctrl ?? false;

      // meta maps to Cmd on macOS, Ctrl on Windows/Linux
      const hasMeta = e.metaKey || e.ctrlKey;

      if (wantMeta && !hasMeta) return;
      if (!wantMeta && hasMeta && !wantCtrl) return;
      if (wantShift && !e.shiftKey) return;
      if (!wantShift && e.shiftKey) return;
      if (wantAlt && !e.altKey) return;
      if (!wantAlt && e.altKey) return;
      if (wantCtrl && !e.ctrlKey) return;

      // Check key match (case-insensitive for letters)
      if (e.key.toLowerCase() !== def.key.toLowerCase()) return;

      e.preventDefault();
      handlerRef.current(e);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}

/**
 * Register multiple keyboard shortcuts at once.
 *
 * @param shortcuts - Array of [shortcut, handler] tuples
 * @param options - Additional options
 *
 * @example
 * ```tsx
 * useKeyboardShortcuts([
 *   [{ key: ' ' }, () => togglePlay()],
 *   [{ key: 'ArrowLeft' }, () => stepBack()],
 *   [{ key: 'ArrowRight' }, () => stepForward()],
 *   ['meta+z', () => undo()],
 * ]);
 * ```
 */
export function useKeyboardShortcuts(
  shortcuts: Array<[ShortcutDef | string, (event: KeyboardEvent) => void]>,
  options: { enabled?: boolean } = {},
): void {
  const { enabled = true } = options;
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      for (const [shortcutDef, handler] of shortcutsRef.current) {
        const def = typeof shortcutDef === 'string'
          ? parseShortcutString(shortcutDef)
          : shortcutDef;

        // Skip inputs unless global
        if (!def.global) {
          const tagName = (e.target as Element)?.tagName;
          if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
            return;
          }
          if ((e.target as HTMLElement)?.isContentEditable) {
            return;
          }
        }

        const mods = def.modifiers ?? {};
        const wantMeta = mods.meta ?? false;
        const wantShift = mods.shift ?? false;
        const wantAlt = mods.alt ?? false;
        const wantCtrl = mods.ctrl ?? false;

        const hasMeta = e.metaKey || e.ctrlKey;

        if (wantMeta && !hasMeta) continue;
        if (!wantMeta && hasMeta && !wantCtrl) continue;
        if (wantShift && !e.shiftKey) continue;
        if (!wantShift && e.shiftKey) continue;
        if (wantAlt && !e.altKey) continue;
        if (!wantAlt && e.altKey) continue;
        if (wantCtrl && !e.ctrlKey) continue;

        if (e.key.toLowerCase() !== def.key.toLowerCase()) continue;

        e.preventDefault();
        handler(e);
        return; // Only fire first match
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse a shortcut string like "meta+k", "shift+Delete", "alt+ArrowUp"
 * into a ShortcutDef.
 */
function parseShortcutString(shortcut: string): ShortcutDef {
  const parts = shortcut.split('+');
  const key = parts[parts.length - 1] ?? shortcut;
  const modifiers: ShortcutModifiers = {};

  for (let i = 0; i < parts.length - 1; i++) {
    const mod = parts[i]!.toLowerCase();
    switch (mod) {
      case 'meta':
      case 'cmd':
      case 'command':
        modifiers.meta = true;
        break;
      case 'shift':
        modifiers.shift = true;
        break;
      case 'alt':
      case 'option':
        modifiers.alt = true;
        break;
      case 'ctrl':
      case 'control':
        modifiers.ctrl = true;
        break;
    }
  }

  return { key, modifiers };
}
