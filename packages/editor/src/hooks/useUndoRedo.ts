import { useState, useCallback, useRef } from 'react';

/**
 * Configuration for the useUndoRedo hook.
 */
export interface UndoRedoOptions {
  /** Maximum number of history entries to keep (default: 100) */
  maxHistory?: number;
}

/**
 * Return type of the useUndoRedo hook.
 */
export interface UndoRedoState<T> {
  /** The current state value */
  state: T;
  /** Replace the current state and push the previous to history */
  set: (value: T | ((prev: T) => T)) => void;
  /** Undo: revert to the previous state */
  undo: () => void;
  /** Redo: advance to the next state */
  redo: () => void;
  /** Whether there is a state to undo to */
  canUndo: boolean;
  /** Whether there is a state to redo to */
  canRedo: boolean;
  /** Reset history, keeping the current state as the new base */
  reset: (value?: T) => void;
  /** Number of items in the undo stack */
  undoCount: number;
  /** Number of items in the redo stack */
  redoCount: number;
}

/**
 * Generic undo/redo hook for managing state with full command history.
 * Maintains an undo stack and a redo stack with configurable maximum depth.
 *
 * @param initialState - Initial state value
 * @param options - Configuration options
 * @returns UndoRedoState object with state, set, undo, redo, and metadata
 *
 * @example
 * ```tsx
 * const {
 *   state: text,
 *   set: setText,
 *   undo,
 *   redo,
 *   canUndo,
 *   canRedo,
 * } = useUndoRedo('');
 *
 * // Update state (pushes to undo stack)
 * setText('Hello World');
 *
 * // Functional updates
 * setText(prev => prev + '!');
 *
 * // Undo/Redo
 * undo(); // reverts to previous state
 * redo(); // re-applies the undone change
 * ```
 */
export function useUndoRedo<T>(
  initialState: T,
  options: UndoRedoOptions = {},
): UndoRedoState<T> {
  const { maxHistory = 100 } = options;

  const [current, setCurrent] = useState<T>(initialState);
  const undoStackRef = useRef<T[]>([]);
  const redoStackRef = useRef<T[]>([]);

  // Force re-render when stacks change (since refs don't trigger renders)
  const [, forceRender] = useState(0);
  const triggerRender = useCallback(() => forceRender((n) => n + 1), []);

  const set = useCallback(
    (value: T | ((prev: T) => T)) => {
      setCurrent((prev) => {
        const next = typeof value === 'function'
          ? (value as (prev: T) => T)(prev)
          : value;

        // Push current to undo stack
        undoStackRef.current = [...undoStackRef.current, prev];
        if (undoStackRef.current.length > maxHistory) {
          undoStackRef.current = undoStackRef.current.slice(
            undoStackRef.current.length - maxHistory,
          );
        }

        // Clear redo stack on new action
        redoStackRef.current = [];

        triggerRender();
        return next;
      });
    },
    [maxHistory, triggerRender],
  );

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;

    setCurrent((prev) => {
      const prevState = undoStackRef.current[undoStackRef.current.length - 1];
      if (prevState === undefined) return prev;

      undoStackRef.current = undoStackRef.current.slice(0, -1);
      redoStackRef.current = [...redoStackRef.current, prev];

      triggerRender();
      return prevState;
    });
  }, [triggerRender]);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;

    setCurrent((prev) => {
      const nextState = redoStackRef.current[redoStackRef.current.length - 1];
      if (nextState === undefined) return prev;

      redoStackRef.current = redoStackRef.current.slice(0, -1);
      undoStackRef.current = [...undoStackRef.current, prev];

      triggerRender();
      return nextState;
    });
  }, [triggerRender]);

  const reset = useCallback(
    (value?: T) => {
      if (value !== undefined) {
        setCurrent(value);
      }
      undoStackRef.current = [];
      redoStackRef.current = [];
      triggerRender();
    },
    [triggerRender],
  );

  return {
    state: current,
    set,
    undo,
    redo,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
    reset,
    undoCount: undoStackRef.current.length,
    redoCount: redoStackRef.current.length,
  };
}
