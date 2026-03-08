import type { Command } from './types';

/**
 * Command-pattern undo/redo engine.
 *
 * Maintains two stacks (undo and redo) and exposes a subscribe/unsubscribe
 * pattern so that UI components can react to history changes.
 */
export class EditEngine {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxHistory: number;
  private listeners = new Set<() => void>();

  /**
   * Create a new EditEngine.
   * @param maxHistory Maximum number of commands to retain in the undo stack.
   * @example
   * const engine = new EditEngine(200);
   */
  constructor(maxHistory = 100) {
    this.maxHistory = maxHistory;
  }

  /**
   * Execute a command, pushing it onto the undo stack and clearing the redo
   * stack. If the undo stack exceeds `maxHistory`, the oldest entry is dropped.
   * @param command The command to execute.
   * @example
   * editEngine.execute(new AddClipCommand(clip));
   */
  execute(command: Command): void {
    try {
      command.execute();
    } catch (err) {
      console.error('[EditEngine] Command execution failed:', err);
      return;
    }
    this.undoStack.push(command);
    this.redoStack = [];
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.notify();
  }

  /**
   * Undo the most recent command.
   * @returns `true` if a command was undone, `false` if the stack was empty.
   * @example
   * if (editEngine.undo()) console.log('Undone');
   */
  undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) return false;
    try {
      command.undo();
    } catch (err) {
      console.error('[EditEngine] Undo failed:', err);
      this.undoStack.push(command);
      return false;
    }
    this.redoStack.push(command);
    this.notify();
    return true;
  }

  /**
   * Redo the most recently undone command.
   * @returns `true` if a command was redone, `false` if the redo stack was empty.
   * @example
   * if (editEngine.redo()) console.log('Redone');
   */
  redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) return false;
    try {
      command.execute();
    } catch (err) {
      console.error('[EditEngine] Redo failed:', err);
      this.redoStack.push(command);
      return false;
    }
    this.undoStack.push(command);
    this.notify();
    return true;
  }

  /** Whether there is at least one command available to undo. */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Whether there is at least one command available to redo. */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** The human-readable description of the next undo operation, or `null`. */
  get undoDescription(): string | null {
    const cmd = this.undoStack[this.undoStack.length - 1];
    return cmd ? cmd.description : null;
  }

  /** The human-readable description of the next redo operation, or `null`. */
  get redoDescription(): string | null {
    const cmd = this.redoStack[this.redoStack.length - 1];
    return cmd ? cmd.description : null;
  }

  /** The number of commands on the undo stack. */
  get undoCount(): number {
    return this.undoStack.length;
  }

  /** The number of commands on the redo stack. */
  get redoCount(): number {
    return this.redoStack.length;
  }

  /**
   * Subscribe to history changes. The callback fires after every
   * execute, undo, redo, or clear operation.
   * @param listener Callback invoked on state change.
   * @returns An unsubscribe function.
   * @example
   * const unsub = editEngine.subscribe(() => updateUI());
   * // later: unsub();
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Notify all subscribers that the history state has changed. */
  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  /**
   * Clear both undo and redo stacks.
   * @example
   * editEngine.clear();
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }
}

/** Singleton edit engine instance. */
export const editEngine = new EditEngine();
