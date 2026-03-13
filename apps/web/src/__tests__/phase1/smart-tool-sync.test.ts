import { beforeEach, describe, expect, it } from 'vitest';
import { smartToolEngine } from '../../engine/SmartToolEngine';
import { subscribeSmartToolStateToStore, syncSmartToolStateToStore } from '../../lib/smartToolStateBridge';
import { useEditorStore } from '../../store/editor.store';

const initialState = useEditorStore.getState();

describe('phase 1 smart tool synchronization', () => {
  beforeEach(() => {
    useEditorStore.setState(initialState, true);
    smartToolEngine.reset();
  });

  it('syncs smart tool engine state into the editor store', () => {
    smartToolEngine.toggleLiftOverwriteSegment();
    smartToolEngine.toggleRippleTrim();

    syncSmartToolStateToStore();

    const state = useEditorStore.getState();
    expect(state.smartToolLiftOverwrite).toBe(false);
    expect(state.smartToolExtractSplice).toBe(true);
    expect(state.smartToolOverwriteTrim).toBe(true);
    expect(state.smartToolRippleTrim).toBe(false);
  });

  it('updates the engine when store smart tool actions are used', () => {
    const state = useEditorStore.getState();

    state.toggleSmartToolExtractSplice();
    state.toggleSmartToolOverwriteTrim();

    const engineState = smartToolEngine.getState();
    expect(engineState.extractSpliceSegment).toBe(false);
    expect(engineState.overwriteTrim).toBe(false);
  });

  it('keeps the store current while subscribed to engine changes', () => {
    const unsubscribe = subscribeSmartToolStateToStore();

    smartToolEngine.toggleLiftOverwriteSegment();
    smartToolEngine.toggleExtractSpliceSegment();

    const state = useEditorStore.getState();
    expect(state.smartToolLiftOverwrite).toBe(false);
    expect(state.smartToolExtractSplice).toBe(false);

    unsubscribe();
  });
});
