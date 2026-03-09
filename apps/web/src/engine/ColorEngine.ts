// ─── Color Grading Engine ─────────────────────────────────────────────────────
// Node-graph based color pipeline with primary corrections, curves, and stills.

import { colorGradingPipeline } from './color/ColorGradingPipeline';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Supported color node types in the processing graph. */
export type ColorNodeType =
  | 'source'
  | 'primary'
  | 'secondary'
  | 'curves'
  | 'huesat'
  | 'lut'
  | 'mixer'
  | 'output';

/** A 2D point used for curve control points. */
export interface Point {
  x: number;
  y: number;
}

/** An RGB triplet. */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Parameters for primary colour correction (lift/gamma/gain wheels). */
export interface PrimaryParams {
  lift: RGB;
  gamma: RGB;
  gain: RGB;
  offset: RGB;
  saturation: number;
  contrast: number;
  temperature: number;
  tint: number;
}

/** Parameters for curve-based colour adjustments. */
export interface CurveParams {
  master: Point[];
  red: Point[];
  green: Point[];
  blue: Point[];
}

/** Parameters for hue-vs-sat and related qualification curves. */
export interface HueSatParams {
  hueVsSat: Point[];
  hueVsLum: Point[];
  satVsSat: Point[];
  lumVsSat: Point[];
}

/** Parameters for secondary colour correction (qualifier). */
export interface SecondaryParams {
  hueRange: [number, number];
  satRange: [number, number];
  lumRange: [number, number];
  softness: number;
  enabled: boolean;
}

/** Parameters for a Look-Up Table node. */
export interface LutParams {
  name: string;
  data: null; // Stub -- would hold actual LUT data
}

/** Parameters for the channel mixer node. */
export interface MixerParams {
  redOut: RGB;
  greenOut: RGB;
  blueOut: RGB;
}

/** Union of all possible node parameter types. */
export type NodeParams =
  | PrimaryParams
  | CurveParams
  | HueSatParams
  | SecondaryParams
  | LutParams
  | MixerParams
  | Record<string, never>; // source / output have no params

/** A single node in the colour processing graph. */
export interface ColorNode {
  id: string;
  type: ColorNodeType;
  params: NodeParams;
  enabled: boolean;
  /** IDs of nodes feeding into this node. */
  inputs: string[];
  /** IDs of nodes this node feeds into. */
  outputs: string[];
}

/** A directed connection between two colour nodes. */
export interface ColorConnection {
  from: string;
  to: string;
}

/** A saved colour grade look (preset). */
export interface SavedLook {
  id: string;
  name: string;
  nodes: ColorNode[];
  connections: ColorConnection[];
  thumbnail?: string;
}

/** A captured still frame for reference grading. */
export interface Still {
  id: string;
  name: string;
  imageData: string; // base64 placeholder
  frame: number;
}

/** Callback type for colour engine state changes. */
export type ColorSubscriber = () => void;

// ─── Default Params ──────────────────────────────────────────────────────────

/** Create a zeroed RGB triplet. */
function defaultRGB(): RGB {
  return { r: 0, g: 0, b: 0 };
}

/** Create default primary correction parameters. */
function defaultPrimary(): PrimaryParams {
  return {
    lift: defaultRGB(),
    gamma: defaultRGB(),
    gain: defaultRGB(),
    offset: defaultRGB(),
    saturation: 1.0,
    contrast: 1.0,
    temperature: 0,
    tint: 0,
  };
}

/** Create default curve parameters with identity curves. */
function defaultCurves(): CurveParams {
  return {
    master: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    red: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    green: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    blue: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  };
}

/** Create default hue/sat qualification parameters. */
function defaultHueSat(): HueSatParams {
  return {
    hueVsSat: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }],
    hueVsLum: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }],
    satVsSat: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }],
    lumVsSat: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }],
  };
}

/** Create default secondary correction (qualifier) parameters. */
function defaultSecondary(): SecondaryParams {
  return {
    hueRange: [0, 360],
    satRange: [0, 1],
    lumRange: [0, 1],
    softness: 0.1,
    enabled: true,
  };
}

/** Create default channel mixer parameters (identity mapping). */
function defaultMixer(): MixerParams {
  return {
    redOut: { r: 1, g: 0, b: 0 },
    greenOut: { r: 0, g: 1, b: 0 },
    blueOut: { r: 0, g: 0, b: 1 },
  };
}

/**
 * Return the default parameter object for a given node type.
 * @param type The colour node type.
 * @returns Default parameters matching the node type.
 */
function defaultParamsForType(type: ColorNodeType): NodeParams {
  switch (type) {
    case 'primary': return defaultPrimary();
    case 'curves': return defaultCurves();
    case 'huesat': return defaultHueSat();
    case 'secondary': return defaultSecondary();
    case 'lut': return { name: '', data: null } as LutParams;
    case 'mixer': return defaultMixer();
    case 'source':
    case 'output':
    default:
      return {};
  }
}

let nodeIdCounter = 0;
function genNodeId(): string {
  return `cn_${++nodeIdCounter}_${Date.now().toString(36)}`;
}

let lookIdCounter = 0;
function genLookId(): string {
  return `look_${++lookIdCounter}_${Date.now().toString(36)}`;
}

let stillIdCounter = 0;
function genStillId(): string {
  return `still_${++stillIdCounter}_${Date.now().toString(36)}`;
}

// ─── Engine Class ────────────────────────────────────────────────────────────

/**
 * Node-graph colour grading engine.
 *
 * Maintains a directed graph of colour processing nodes, saved looks/presets,
 * and reference stills.  Provides a subscribe/unsubscribe pattern so UI
 * components can react to pipeline changes.
 */
export class ColorEngine {
  private nodes: Map<string, ColorNode> = new Map();
  private connections: ColorConnection[] = [];
  private looks: SavedLook[] = [];
  private stills: Still[] = [];
  private subscribers = new Set<ColorSubscriber>();

  /** Create the engine with a default source -> primary -> output chain. */
  constructor() {
    const source = this.addNode('source');
    const primary = this.addNode('primary');
    const output = this.addNode('output');
    this.connectNodes(source.id, primary.id);
    this.connectNodes(primary.id, output.id);
  }

  // ── Node Management ────────────────────────────────────────────────────

  /**
   * Add a new colour node to the graph.
   * @param type The type of node to create.
   * @returns The newly created ColorNode.
   * @example
   * const curves = colorEngine.addNode('curves');
   */
  addNode(type: ColorNodeType): ColorNode {
    const node: ColorNode = {
      id: genNodeId(),
      type,
      params: defaultParamsForType(type),
      enabled: true,
      inputs: [],
      outputs: [],
    };
    this.nodes.set(node.id, node);
    this.notify();
    return node;
  }

  /**
   * Remove a node and all of its connections from the graph.
   * @param id The node ID to remove.
   * @example
   * colorEngine.removeNode('cn_3_abc123');
   */
  removeNode(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    this.connections = this.connections.filter(
      (c) => c.from !== id && c.to !== id
    );
    for (const [, n] of this.nodes) {
      n.inputs = n.inputs.filter((i) => i !== id);
      n.outputs = n.outputs.filter((o) => o !== id);
    }
    this.nodes.delete(id);
    this.notify();
  }

  /**
   * Create a directed connection between two nodes.
   * @param fromId Source node ID.
   * @param toId   Destination node ID.
   * @example
   * colorEngine.connectNodes(primary.id, curves.id);
   */
  connectNodes(fromId: string, toId: string): void {
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);
    if (!fromNode || !toNode) return;

    const exists = this.connections.some(
      (c) => c.from === fromId && c.to === toId
    );
    if (exists) return;

    this.connections.push({ from: fromId, to: toId });
    fromNode.outputs.push(toId);
    toNode.inputs.push(fromId);
    this.notify();
  }

  /**
   * Update parameters on a node, merging with existing params.
   * @param id     Node ID.
   * @param params Partial parameter object to merge.
   * @example
   * colorEngine.updateNodeParams(nodeId, { saturation: 1.2, contrast: 1.1 });
   */
  updateNodeParams(id: string, params: Partial<NodeParams>): void {
    const node = this.nodes.get(id);
    if (!node) return;
    node.params = { ...node.params, ...params } as NodeParams;
    this.notify();
  }

  /**
   * Retrieve a colour node by ID.
   * @param id Node ID.
   * @returns The node, or `undefined` if not found.
   */
  getNode(id: string): ColorNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get all nodes currently in the graph.
   * @returns Array of all ColorNode instances.
   */
  getAllNodes(): ColorNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get all connections in the graph.
   * @returns Array of ColorConnection objects.
   */
  getConnections(): ColorConnection[] {
    return [...this.connections];
  }

  /**
   * Walk the node graph from source to output via a simple topological
   * traversal following first outputs.
   * @returns Ordered array of nodes from source to output.
   */
  getNodeChain(): ColorNode[] {
    const chain: ColorNode[] = [];
    const visited = new Set<string>();

    let current: ColorNode | undefined;
    for (const [, node] of this.nodes) {
      if (node.type === 'source') {
        current = node;
        break;
      }
    }

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      chain.push(current);
      const nextId = current.outputs[0];
      current = nextId ? this.nodes.get(nextId) : undefined;
    }

    return chain;
  }

  // ── Processing ─────────────────────────────────────────────────────────

  /**
   * Process a frame through the node chain using the GPU pipeline (async).
   * Falls back to CPU if WebGPU is unavailable.
   */
  async processFrameAsync(imageData: ImageData): Promise<ImageData> {
    try {
      const nodes = this.getAllNodes().filter((n) => n.enabled);
      const connections = this.getConnections();
      return await colorGradingPipeline.processFrame(imageData, nodes, connections);
    } catch (err) {
      console.error('[ColorEngine] processFrameAsync error:', err);
      return imageData;
    }
  }

  /**
   * Synchronous CPU-only processing for immediate results.
   * Uses the GPU pipeline's CPU fallback path.
   */
  processFrame(imageData: ImageData): ImageData {
    try {
      const nodes = this.getAllNodes().filter((n) => n.enabled);
      const connections = this.getConnections();
      // CPU path is synchronous within the pipeline
      return (colorGradingPipeline as any).processFrameCPU(
        imageData,
        (colorGradingPipeline as any).topologicalSort(nodes, connections)
          .filter((n: ColorNode) => n.enabled && n.type !== 'source' && n.type !== 'output'),
      );
    } catch (err) {
      console.error('[ColorEngine] processFrame error:', err);
      return imageData;
    }
  }

  /** Initialize the GPU pipeline (call once at startup). */
  async initGPU(): Promise<void> {
    await colorGradingPipeline.init();
  }

  // ── Looks ──────────────────────────────────────────────────────────────

  /**
   * Save the current node graph as a named look.
   * @param name Display name for the look.
   * @returns The saved look object.
   * @example
   * const look = colorEngine.saveLook('Warm Sunset');
   */
  saveLook(name: string): SavedLook {
    const look: SavedLook = {
      id: genLookId(),
      name,
      nodes: Array.from(this.nodes.values()).map((n) => ({ ...n })),
      connections: [...this.connections],
    };
    this.looks.push(look);
    this.notify();
    return look;
  }

  /**
   * Load a previously saved look, replacing the current graph.
   * @param id Look ID.
   * @returns `true` if the look was found and loaded.
   * @example
   * colorEngine.loadLook(look.id);
   */
  loadLook(id: string): boolean {
    const look = this.looks.find((l) => l.id === id);
    if (!look) return false;

    this.nodes.clear();
    this.connections = [];

    for (const node of look.nodes) {
      this.nodes.set(node.id, { ...node });
    }
    this.connections = look.connections.map((c) => ({ ...c }));
    this.notify();
    return true;
  }

  /**
   * Get all saved looks.
   * @returns Array of SavedLook objects.
   */
  getLooks(): SavedLook[] {
    return [...this.looks];
  }

  // ── AI Match Grade (Stub) ──────────────────────────────────────────────

  /**
   * AI-powered grade matching.
   * Stub -- returns a mock primary correction after a simulated delay.
   * @param _referenceFrame Reference frame to match.
   * @param _targetFrame    Target frame to adjust.
   * @returns A PrimaryParams result approximating the reference grade.
   */
  async matchGrade(
    _referenceFrame: ImageData,
    _targetFrame: ImageData
  ): Promise<PrimaryParams> {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return {
      ...defaultPrimary(),
      temperature: 0.15,
      saturation: 1.05,
      contrast: 1.02,
    };
  }

  // ── Gallery / Stills ───────────────────────────────────────────────────

  /**
   * Save a reference still for comparison grading.
   * @param name      Display name for the still.
   * @param imageData Base64-encoded image data.
   * @returns The saved still object.
   */
  saveStill(name: string, imageData: string): Still {
    const still: Still = {
      id: genStillId(),
      name,
      imageData,
      frame: 0,
    };
    this.stills.push(still);
    this.notify();
    return still;
  }

  /**
   * Get all saved reference stills.
   * @returns Array of Still objects.
   */
  getStills(): Still[] {
    return [...this.stills];
  }

  // ── Subscription ───────────────────────────────────────────────────────

  /**
   * Subscribe to colour engine state changes.
   * @param cb Callback invoked on change.
   * @returns An unsubscribe function.
   * @example
   * const unsub = colorEngine.subscribe(() => refreshUI());
   */
  subscribe(cb: ColorSubscriber): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  /** Notify all subscribers that state has changed. */
  private notify(): void {
    this.subscribers.forEach((cb) => cb());
  }
}

/** Singleton color engine instance. */
export const colorEngine = new ColorEngine();
