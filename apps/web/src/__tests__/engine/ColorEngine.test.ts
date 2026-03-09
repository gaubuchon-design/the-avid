import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ColorEngine } from '../../engine/ColorEngine';

describe('ColorEngine', () => {
  let engine: ColorEngine;

  beforeEach(() => {
    engine = new ColorEngine();
  });

  // ── Constructor ────────────────────────────────────────────────────────

  it('initializes with default source -> primary -> output chain', () => {
    const nodes = engine.getAllNodes();
    expect(nodes.length).toBe(3);
    const types = nodes.map((n) => n.type);
    expect(types).toContain('source');
    expect(types).toContain('primary');
    expect(types).toContain('output');
  });

  it('default chain has connections', () => {
    const connections = engine.getConnections();
    expect(connections.length).toBe(2);
  });

  // ── Node Management ───────────────────────────────────────────────────

  it('addNode() creates a node with correct type and defaults', () => {
    const curves = engine.addNode('curves');
    expect(curves.type).toBe('curves');
    expect(curves.enabled).toBe(true);
    expect(curves.params).toHaveProperty('master');
    expect(curves.params).toHaveProperty('red');
    expect(curves.params).toHaveProperty('green');
    expect(curves.params).toHaveProperty('blue');
  });

  it('addNode() assigns unique IDs', () => {
    const a = engine.addNode('curves');
    const b = engine.addNode('huesat');
    expect(a.id).not.toBe(b.id);
  });

  it('getNode() retrieves existing node', () => {
    const node = engine.addNode('secondary');
    expect(engine.getNode(node.id)).toBe(node);
  });

  it('getNode() returns undefined for unknown ID', () => {
    expect(engine.getNode('nonexistent')).toBeUndefined();
  });

  it('removeNode() deletes node and cleans up connections', () => {
    const curves = engine.addNode('curves');
    const sourceNode = engine.getAllNodes().find((n) => n.type === 'source')!;
    const primaryNode = engine.getAllNodes().find((n) => n.type === 'primary')!;

    engine.connectNodes(primaryNode.id, curves.id);
    expect(engine.getConnections().length).toBe(3);

    engine.removeNode(curves.id);
    expect(engine.getNode(curves.id)).toBeUndefined();
    // Connections involving curves should be removed
    const remaining = engine.getConnections();
    remaining.forEach((c) => {
      expect(c.from).not.toBe(curves.id);
      expect(c.to).not.toBe(curves.id);
    });
  });

  // ── Connections ────────────────────────────────────────────────────────

  it('connectNodes() adds a connection', () => {
    const mixer = engine.addNode('mixer');
    const output = engine.getAllNodes().find((n) => n.type === 'output')!;
    const before = engine.getConnections().length;
    engine.connectNodes(mixer.id, output.id);
    expect(engine.getConnections().length).toBe(before + 1);
  });

  it('connectNodes() does not duplicate existing connection', () => {
    const nodes = engine.getAllNodes();
    const source = nodes.find((n) => n.type === 'source')!;
    const primary = nodes.find((n) => n.type === 'primary')!;
    const before = engine.getConnections().length;
    engine.connectNodes(source.id, primary.id); // already exists
    expect(engine.getConnections().length).toBe(before);
  });

  it('connectNodes() is a no-op for nonexistent nodes', () => {
    const before = engine.getConnections().length;
    engine.connectNodes('nonexistent1', 'nonexistent2');
    expect(engine.getConnections().length).toBe(before);
  });

  // ── Node Params ────────────────────────────────────────────────────────

  it('updateNodeParams() merges partial params', () => {
    const primary = engine.getAllNodes().find((n) => n.type === 'primary')!;
    engine.updateNodeParams(primary.id, { saturation: 1.5 } as any);
    const updated = engine.getNode(primary.id)!;
    expect((updated.params as any).saturation).toBe(1.5);
    // Other params should be preserved
    expect((updated.params as any).contrast).toBe(1.0);
  });

  it('updateNodeParams() is a no-op for unknown node', () => {
    engine.updateNodeParams('nonexistent', { saturation: 2 } as any);
    // Should not throw
  });

  // ── Node Chain ─────────────────────────────────────────────────────────

  it('getNodeChain() walks from source to output', () => {
    const chain = engine.getNodeChain();
    expect(chain.length).toBe(3);
    expect(chain[0].type).toBe('source');
    expect(chain[chain.length - 1].type).toBe('output');
  });

  // ── processFrame ──────────────────────────────────────────────────────

  it('processFrame() returns input unchanged (stub)', () => {
    const img = {
      data: new Uint8ClampedArray([100, 100, 100, 255]),
      width: 1,
      height: 1,
      colorSpace: 'srgb',
    } as ImageData;
    const result = engine.processFrame(img);
    expect(result).toBe(img);
  });

  // ── Looks ──────────────────────────────────────────────────────────────

  it('saveLook() creates a named look', () => {
    const look = engine.saveLook('Warm Sunset');
    expect(look.id).toBeTruthy();
    expect(look.name).toBe('Warm Sunset');
    expect(look.nodes.length).toBe(3);
    expect(look.connections.length).toBe(2);
  });

  it('getLooks() returns all saved looks', () => {
    engine.saveLook('Look A');
    engine.saveLook('Look B');
    expect(engine.getLooks().length).toBe(2);
  });

  it('loadLook() replaces current graph', () => {
    const look = engine.saveLook('Test Look');
    // Add a new node to change state
    engine.addNode('curves');
    expect(engine.getAllNodes().length).toBe(4);

    engine.loadLook(look.id);
    expect(engine.getAllNodes().length).toBe(3);
  });

  it('loadLook() returns false for unknown ID', () => {
    expect(engine.loadLook('nonexistent')).toBe(false);
  });

  it('loadLook() returns true on success', () => {
    const look = engine.saveLook('Test');
    expect(engine.loadLook(look.id)).toBe(true);
  });

  // ── matchGrade ─────────────────────────────────────────────────────────

  it('matchGrade() returns PrimaryParams with adjusted values', async () => {
    const refImg = { data: new Uint8ClampedArray(4), width: 1, height: 1, colorSpace: 'srgb' } as ImageData;
    const targetImg = { data: new Uint8ClampedArray(4), width: 1, height: 1, colorSpace: 'srgb' } as ImageData;
    const result = await engine.matchGrade(refImg, targetImg);
    expect(result).toHaveProperty('temperature', 0.15);
    expect(result).toHaveProperty('saturation', 1.05);
    expect(result).toHaveProperty('contrast', 1.02);
  });

  // ── Stills ─────────────────────────────────────────────────────────────

  it('saveStill() creates a still', () => {
    const still = engine.saveStill('Frame Grab', 'base64data');
    expect(still.id).toBeTruthy();
    expect(still.name).toBe('Frame Grab');
    expect(still.imageData).toBe('base64data');
  });

  it('getStills() returns all saved stills', () => {
    engine.saveStill('Still A', '');
    engine.saveStill('Still B', '');
    expect(engine.getStills().length).toBe(2);
  });

  // ── Subscribe ──────────────────────────────────────────────────────────

  it('subscribe/unsubscribe pattern works', () => {
    const listener = vi.fn();
    const unsub = engine.subscribe(listener);

    engine.addNode('curves');
    expect(listener).toHaveBeenCalled();

    const callCount = listener.mock.calls.length;
    unsub();
    engine.addNode('huesat');
    expect(listener).toHaveBeenCalledTimes(callCount);
  });
});
