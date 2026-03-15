import { describe, it, expect, beforeEach } from 'vitest';
import { EditEngine } from '../../engine/EditEngine';
import type { Command } from '../../engine/types';

describe('EditEngine', () => {
  let engine: EditEngine;

  beforeEach(() => {
    engine = new EditEngine();
  });

  it('should start with empty stacks', () => {
    expect(engine.canUndo()).toBe(false);
    expect(engine.canRedo()).toBe(false);
  });

  it('should execute a command', () => {
    let value = 0;
    const cmd: Command = {
      description: 'increment',
      execute: () => { value = 1; },
      undo: () => { value = 0; },
    };
    engine.execute(cmd);
    expect(value).toBe(1);
    expect(engine.canUndo()).toBe(true);
    expect(engine.canRedo()).toBe(false);
  });

  it('should undo a command', () => {
    let value = 0;
    const cmd: Command = {
      description: 'increment',
      execute: () => { value = 1; },
      undo: () => { value = 0; },
    };
    engine.execute(cmd);
    expect(value).toBe(1);
    engine.undo();
    expect(value).toBe(0);
    expect(engine.canUndo()).toBe(false);
    expect(engine.canRedo()).toBe(true);
  });

  it('should redo a command', () => {
    let value = 0;
    const cmd: Command = {
      description: 'increment',
      execute: () => { value = 1; },
      undo: () => { value = 0; },
    };
    engine.execute(cmd);
    engine.undo();
    engine.redo();
    expect(value).toBe(1);
    expect(engine.canUndo()).toBe(true);
    expect(engine.canRedo()).toBe(false);
  });

  it('should clear redo stack on new command', () => {
    let value = 0;
    const cmd1: Command = { description: 'set 1', execute: () => { value = 1; }, undo: () => { value = 0; } };
    const cmd2: Command = { description: 'set 2', execute: () => { value = 2; }, undo: () => { value = 1; } };
    engine.execute(cmd1);
    engine.undo();
    expect(engine.canRedo()).toBe(true);
    engine.execute(cmd2);
    expect(engine.canRedo()).toBe(false);
  });

  it('should handle multiple undo/redo', () => {
    let value = 0;
    const cmds: Command[] = Array.from({ length: 5 }, (_, i) => ({
      description: `set ${i + 1}`,
      execute: () => { value = i + 1; },
      undo: () => { value = i; },
    }));
    cmds.forEach(cmd => engine.execute(cmd));
    expect(value).toBe(5);

    engine.undo();
    engine.undo();
    expect(value).toBe(3);

    engine.redo();
    expect(value).toBe(4);
  });

  it('should notify subscribers', () => {
    let notified = 0;
    engine.subscribe(() => { notified++; });
    const cmd: Command = { description: 'test', execute: () => {}, undo: () => {} };
    engine.execute(cmd);
    expect(notified).toBe(1);
    engine.undo();
    expect(notified).toBe(2);
  });

  it('should allow unsubscribing', () => {
    let notified = 0;
    const unsub = engine.subscribe(() => { notified++; });
    const cmd: Command = { description: 'test', execute: () => {}, undo: () => {} };
    engine.execute(cmd);
    expect(notified).toBe(1);
    unsub();
    engine.undo();
    expect(notified).toBe(1); // Should not increase
  });

  it('should expose undo/redo descriptions', () => {
    expect(engine.undoDescription).toBeNull();
    expect(engine.redoDescription).toBeNull();

    const cmd: Command = { description: 'my command', execute: () => {}, undo: () => {} };
    engine.execute(cmd);
    expect(engine.undoDescription).toBe('my command');
    expect(engine.redoDescription).toBeNull();

    engine.undo();
    expect(engine.undoDescription).toBeNull();
    expect(engine.redoDescription).toBe('my command');
  });

  it('should expose undo/redo counts', () => {
    expect(engine.undoCount).toBe(0);
    expect(engine.redoCount).toBe(0);

    const cmd1: Command = { description: 'a', execute: () => {}, undo: () => {} };
    const cmd2: Command = { description: 'b', execute: () => {}, undo: () => {} };
    engine.execute(cmd1);
    engine.execute(cmd2);
    expect(engine.undoCount).toBe(2);

    engine.undo();
    expect(engine.undoCount).toBe(1);
    expect(engine.redoCount).toBe(1);
  });

  it('should enforce maxHistory limit', () => {
    const smallEngine = new EditEngine(3);
    for (let i = 0; i < 5; i++) {
      smallEngine.execute({ description: `cmd ${i}`, execute: () => {}, undo: () => {} });
    }
    expect(smallEngine.undoCount).toBe(3);
  });

  it('should clear both stacks', () => {
    const cmd: Command = { description: 'test', execute: () => {}, undo: () => {} };
    engine.execute(cmd);
    engine.execute(cmd);
    engine.undo();
    expect(engine.undoCount).toBe(1);
    expect(engine.redoCount).toBe(1);

    engine.clear();
    expect(engine.canUndo()).toBe(false);
    expect(engine.canRedo()).toBe(false);
    expect(engine.undoCount).toBe(0);
    expect(engine.redoCount).toBe(0);
  });

  it('should return false when undo/redo on empty stacks', () => {
    expect(engine.undo()).toBe(false);
    expect(engine.redo()).toBe(false);
  });

  it('should not push command if execute throws', () => {
    const cmd: Command = {
      description: 'bad',
      execute: () => { throw new Error('fail'); },
      undo: () => {},
    };
    engine.execute(cmd);
    expect(engine.canUndo()).toBe(false);
  });
});
