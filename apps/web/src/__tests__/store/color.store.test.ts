import { describe, it, expect, beforeEach } from 'vitest';

import { useColorStore } from '../../store/color.store';

describe('useColorStore', () => {
  beforeEach(() => {
    useColorStore.setState({
      selectedNodeId: null,
      activeView: 'primary',
      abWipeEnabled: false,
      abWipePosition: 50,
    });
  });

  it('initial state has nodes and connections from engine', () => {
    const state = useColorStore.getState();
    expect(state.nodes.length).toBeGreaterThanOrEqual(3);
    expect(state.connections.length).toBeGreaterThanOrEqual(2);
  });

  it('selectNode() sets selectedNodeId', () => {
    const nodeId = useColorStore.getState().nodes[0]!.id;
    useColorStore.getState().selectNode(nodeId);
    expect(useColorStore.getState().selectedNodeId).toBe(nodeId);
  });

  it('selectNode(null) clears selection', () => {
    useColorStore.getState().selectNode(null);
    expect(useColorStore.getState().selectedNodeId).toBeNull();
  });

  it('setActiveView() changes the active view tab', () => {
    useColorStore.getState().setActiveView('curves');
    expect(useColorStore.getState().activeView).toBe('curves');
  });

  it('toggleABWipe() toggles A/B wipe', () => {
    useColorStore.getState().toggleABWipe();
    expect(useColorStore.getState().abWipeEnabled).toBe(true);
    useColorStore.getState().toggleABWipe();
    expect(useColorStore.getState().abWipeEnabled).toBe(false);
  });

  it('setABWipePosition() clamps to [0, 100]', () => {
    useColorStore.getState().setABWipePosition(75);
    expect(useColorStore.getState().abWipePosition).toBe(75);

    useColorStore.getState().setABWipePosition(-10);
    expect(useColorStore.getState().abWipePosition).toBe(0);

    useColorStore.getState().setABWipePosition(150);
    expect(useColorStore.getState().abWipePosition).toBe(100);
  });

  it('syncFromEngine() updates state from color engine', () => {
    useColorStore.getState().syncFromEngine();
    const state = useColorStore.getState();
    expect(state.nodes.length).toBeGreaterThanOrEqual(3);
  });

  it('addNode() adds a node via the engine', () => {
    const before = useColorStore.getState().nodes.length;
    useColorStore.getState().addNode('curves');
    // syncFromEngine is triggered by engine subscription
    useColorStore.getState().syncFromEngine();
    expect(useColorStore.getState().nodes.length).toBeGreaterThan(before);
  });

  it('saveLook() saves current look', () => {
    useColorStore.getState().saveLook('Test Look');
    useColorStore.getState().syncFromEngine();
    expect(useColorStore.getState().looks.length).toBeGreaterThan(0);
  });
});
