// =============================================================================
//  Color Grading Pipeline — GPU-Accelerated Node Graph Processor
//  Orchestrates WGSL compute shaders for the color correction node graph.
//  Falls back to CPU processing when WebGPU is unavailable.
// =============================================================================

import type {
  ColorNode,
  ColorConnection,
  PrimaryParams,
  CurveParams,
  HueSatParams,
  SecondaryParams,
  MixerParams,
  LutParams,
  RGB,
} from '../ColorEngine';
import {
  bakeCurveToLUT,
  temperatureTintToRGB,
  liftGammaGain,
  rec709Luma,
  clamp01,
  contrastPivot,
  rgbToHsl,
  hslToRgb,
  srgbToLinear,
  linearToSrgb,
} from './ColorMath';
import { primaryCorrectionShader } from './shaders/primary-correction.wgsl';
import { curvesShader } from './shaders/curves.wgsl';
import { hueSatCurvesShader } from './shaders/huesat-curves.wgsl';
import { qualifierShader, matteApplyShader } from './shaders/qualifier.wgsl';
import { channelMixerShader } from './shaders/channel-mixer.wgsl';
import { lut3dShader } from './shaders/lut3d.wgsl';

// ── Types ────────────────────────────────────────────────────────────────────

interface GPUResources {
  device: GPUDevice;
  pipelines: Map<string, GPUComputePipeline>;
  bindGroupLayouts: Map<string, GPUBindGroupLayout>;
  inputTexture: GPUTexture | null;
  outputTexture: GPUTexture | null;
  uniformBuffer: GPUBuffer | null;
  readbackBuffer: GPUBuffer | null;
  curveLutTexture: GPUTexture | null;
  width: number;
  height: number;
}

type ProcessMode = 'gpu' | 'cpu';

// ── Pipeline Class ───────────────────────────────────────────────────────────

export class ColorGradingPipeline {
  private gpu: GPUResources | null = null;
  private mode: ProcessMode = 'cpu';
  private _isReady = false;
  private _initPromise: Promise<void> | null = null;

  get isReady(): boolean {
    return this._isReady;
  }

  get processingMode(): ProcessMode {
    return this.mode;
  }

  // ── Initialization ──────────────────────────────────────────────────────

  async init(): Promise<void> {
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._init();
    return this._initPromise;
  }

  private async _init(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      console.log('[ColorGradingPipeline] WebGPU not available, using CPU fallback');
      this.mode = 'cpu';
      this._isReady = true;
      return;
    }

    try {
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance',
      });
      if (!adapter) {
        throw new Error('No GPU adapter available');
      }

      const device = await adapter.requestDevice({
        label: 'ColorGradingPipeline',
      });

      device.lost.then((info) => {
        console.error('[ColorGradingPipeline] Device lost:', info.message);
        this.gpu = null;
        this.mode = 'cpu';
      });

      // Create compute pipelines for each shader
      const pipelines = new Map<string, GPUComputePipeline>();
      const bindGroupLayouts = new Map<string, GPUBindGroupLayout>();

      // Primary correction
      this.createPipeline(device, 'primary', primaryCorrectionShader, pipelines, bindGroupLayouts);

      // Channel mixer
      this.createPipeline(device, 'mixer', channelMixerShader, pipelines, bindGroupLayouts);

      this.gpu = {
        device,
        pipelines,
        bindGroupLayouts,
        inputTexture: null,
        outputTexture: null,
        uniformBuffer: null,
        readbackBuffer: null,
        curveLutTexture: null,
        width: 0,
        height: 0,
      };

      this.mode = 'gpu';
      this._isReady = true;
      console.log('[ColorGradingPipeline] GPU initialised');
    } catch (err) {
      console.warn('[ColorGradingPipeline] GPU init failed, using CPU fallback:', err);
      this.mode = 'cpu';
      this._isReady = true;
    }
  }

  private createPipeline(
    device: GPUDevice,
    id: string,
    shaderSource: string,
    pipelines: Map<string, GPUComputePipeline>,
    layouts: Map<string, GPUBindGroupLayout>,
  ): void {
    try {
      const module = device.createShaderModule({
        label: `color-${id}`,
        code: shaderSource,
      });

      // Explicitly create bind group layout (matches ShaderRegistry pattern)
      const bindGroupLayout = device.createBindGroupLayout({
        label: `bgl-color-${id}`,
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: { access: 'read-only' as const, format: 'rgba8unorm' as const },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: { access: 'write-only' as const, format: 'rgba8unorm' as const },
          },
          {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'uniform' as const },
          },
        ],
      });

      const pipelineLayout = device.createPipelineLayout({
        label: `layout-color-${id}`,
        bindGroupLayouts: [bindGroupLayout],
      });

      const pipeline = device.createComputePipeline({
        label: `pipeline-${id}`,
        layout: pipelineLayout,
        compute: {
          module,
          entryPoint: 'main',
        },
      });

      pipelines.set(id, pipeline);
      layouts.set(id, bindGroupLayout);
    } catch (err) {
      console.warn(`[ColorGradingPipeline] Failed to create pipeline "${id}":`, err);
    }
  }

  // ── Frame Buffer Management ─────────────────────────────────────────────

  private ensureFrameBuffers(width: number, height: number): void {
    if (!this.gpu) return;
    const { device } = this.gpu;

    if (this.gpu.width === width && this.gpu.height === height && this.gpu.inputTexture) {
      return;
    }

    // Destroy old textures
    this.gpu.inputTexture?.destroy();
    this.gpu.outputTexture?.destroy();
    this.gpu.readbackBuffer?.destroy();
    this.gpu.uniformBuffer?.destroy();

    const textureDesc: GPUTextureDescriptor = {
      label: 'color-frame',
      size: { width, height },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.STORAGE_BINDING |
             GPUTextureUsage.COPY_SRC |
             GPUTextureUsage.COPY_DST |
             GPUTextureUsage.TEXTURE_BINDING,
    };

    this.gpu.inputTexture = device.createTexture({ ...textureDesc, label: 'color-input' });
    this.gpu.outputTexture = device.createTexture({ ...textureDesc, label: 'color-output' });

    // Uniform buffer (512 bytes should cover any shader's params)
    this.gpu.uniformBuffer = device.createBuffer({
      label: 'color-uniforms',
      size: 512,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Readback buffer (aligned to 256 bytes per row)
    const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
    this.gpu.readbackBuffer = device.createBuffer({
      label: 'color-readback',
      size: bytesPerRow * height,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    this.gpu.width = width;
    this.gpu.height = height;
  }

  // ── Process Frame ───────────────────────────────────────────────────────

  async processFrame(
    imageData: ImageData,
    nodes: ColorNode[],
    connections: ColorConnection[],
  ): Promise<ImageData> {
    if (!this._isReady) {
      await this.init();
    }

    // Get ordered processing chain
    const chain = this.topologicalSort(nodes, connections)
      .filter((n) => n.enabled && n.type !== 'source' && n.type !== 'output');

    if (chain.length === 0) {
      return imageData;
    }

    if (this.mode === 'gpu' && this.gpu) {
      try {
        return await this.processFrameGPU(imageData, chain);
      } catch (err) {
        console.warn('[ColorGradingPipeline] GPU processing failed, falling back to CPU:', err);
      }
    }

    return this.processFrameCPU(imageData, chain);
  }

  // ── GPU Processing ──────────────────────────────────────────────────────

  private async processFrameGPU(
    imageData: ImageData,
    chain: ColorNode[],
  ): Promise<ImageData> {
    const { width, height } = imageData;
    this.ensureFrameBuffers(width, height);

    const gpu = this.gpu!;
    const { device } = gpu;

    // Upload source
    device.queue.writeTexture(
      { texture: gpu.inputTexture! },
      imageData.data.buffer,
      { bytesPerRow: width * 4, rowsPerImage: height },
      { width, height },
    );

    let currentInput = gpu.inputTexture!;
    let currentOutput = gpu.outputTexture!;

    for (const node of chain) {
      const pipelineId = this.getShaderIdForNode(node);
      const pipeline = gpu.pipelines.get(pipelineId);

      if (!pipeline) {
        // Fall through — CPU handles this node type
        continue;
      }

      const uniformData = this.packNodeUniforms(node);
      if (!uniformData) continue;

      device.queue.writeBuffer(gpu.uniformBuffer!, 0, uniformData);

      const layout = gpu.bindGroupLayouts.get(pipelineId);
      if (!layout) continue;

      const bindGroup = device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: currentInput.createView() },
          { binding: 1, resource: currentOutput.createView() },
          { binding: 2, resource: { buffer: gpu.uniformBuffer!, size: uniformData.byteLength } },
        ],
      });

      const encoder = device.createCommandEncoder({ label: `color-${node.type}` });
      const pass = encoder.beginComputePass({ label: `pass-${node.type}` });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(Math.ceil(width / 16), Math.ceil(height / 16));
      pass.end();
      device.queue.submit([encoder.finish()]);

      // Ping-pong
      [currentInput, currentOutput] = [currentOutput, currentInput];
    }

    // Readback
    return await this.readback(device, currentInput, gpu.readbackBuffer!, width, height);
  }

  private getShaderIdForNode(node: ColorNode): string {
    switch (node.type) {
      case 'primary': return 'primary';
      case 'curves': return 'curves';
      case 'huesat': return 'huesat';
      case 'secondary': return 'qualifier';
      case 'mixer': return 'mixer';
      case 'lut': return 'lut3d';
      default: return node.type;
    }
  }

  private packNodeUniforms(node: ColorNode): ArrayBuffer | null {
    switch (node.type) {
      case 'primary': return this.packPrimaryUniforms(node.params as PrimaryParams);
      case 'mixer': return this.packMixerUniforms(node.params as MixerParams);
      default: return null;
    }
  }

  private packPrimaryUniforms(p: PrimaryParams): ArrayBuffer {
    // Struct: 20 floats = 80 bytes
    const buf = new ArrayBuffer(80);
    const f = new Float32Array(buf);
    const temp = temperatureTintToRGB(p.temperature, p.tint);

    f[0] = p.lift.r;     f[1] = p.lift.g;     f[2] = p.lift.b;
    f[3] = 1 + p.gamma.r; f[4] = 1 + p.gamma.g; f[5] = 1 + p.gamma.b;
    f[6] = 1 + p.gain.r;  f[7] = 1 + p.gain.g;  f[8] = 1 + p.gain.b;
    f[9] = p.offset.r;   f[10] = p.offset.g;  f[11] = p.offset.b;
    f[12] = p.saturation;
    f[13] = p.contrast;
    f[14] = 0.435; // pivot (18% gray in linear)
    f[15] = temp.r;
    f[16] = temp.g;
    f[17] = temp.b;
    f[18] = 0; // pad
    f[19] = 0; // pad
    return buf;
  }

  private packMixerUniforms(p: MixerParams): ArrayBuffer {
    // Struct: 12 floats (3x4 with padding) = 48 bytes
    const buf = new ArrayBuffer(48);
    const f = new Float32Array(buf);
    f[0] = p.redOut.r;   f[1] = p.redOut.g;   f[2] = p.redOut.b;   f[3] = 0;
    f[4] = p.greenOut.r;  f[5] = p.greenOut.g;  f[6] = p.greenOut.b;  f[7] = 0;
    f[8] = p.blueOut.r;   f[9] = p.blueOut.g;   f[10] = p.blueOut.b;  f[11] = 0;
    return buf;
  }

  private async readback(
    device: GPUDevice,
    texture: GPUTexture,
    readbackBuffer: GPUBuffer,
    width: number,
    height: number,
  ): Promise<ImageData> {
    const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
    const bufferSize = bytesPerRow * height;

    let buffer = readbackBuffer;
    if (buffer.size < bufferSize) {
      buffer.destroy();
      buffer = device.createBuffer({
        label: 'color-readback',
        size: bufferSize,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      this.gpu!.readbackBuffer = buffer;
    }

    const encoder = device.createCommandEncoder({ label: 'color-readback' });
    encoder.copyTextureToBuffer(
      { texture },
      { buffer, bytesPerRow },
      { width, height },
    );
    device.queue.submit([encoder.finish()]);

    await buffer.mapAsync(GPUMapMode.READ);
    const mapped = new Uint8Array(buffer.getMappedRange());

    const result = new ImageData(width, height);
    const dst = result.data;

    // Copy row by row (bytesPerRow may include padding)
    const rowBytes = width * 4;
    for (let y = 0; y < height; y++) {
      const srcOffset = y * bytesPerRow;
      const dstOffset = y * rowBytes;
      dst.set(mapped.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
    }

    buffer.unmap();
    return result;
  }

  // ── CPU Processing (Fallback) ───────────────────────────────────────────

  private processFrameCPU(
    imageData: ImageData,
    chain: ColorNode[],
  ): ImageData {
    // Work on a copy
    const result = new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height,
    );
    const data = result.data;
    const len = data.length;

    for (const node of chain) {
      switch (node.type) {
        case 'primary':
          this.cpuPrimary(data, len, node.params as PrimaryParams);
          break;
        case 'curves':
          this.cpuCurves(data, len, node.params as CurveParams);
          break;
        case 'huesat':
          this.cpuHueSat(data, len, node.params as HueSatParams);
          break;
        case 'secondary':
          this.cpuSecondary(data, len, node.params as SecondaryParams);
          break;
        case 'mixer':
          this.cpuMixer(data, len, node.params as MixerParams);
          break;
      }
    }

    return result;
  }

  private cpuPrimary(data: Uint8ClampedArray, len: number, p: PrimaryParams): void {
    const temp = temperatureTintToRGB(p.temperature, p.tint);
    const pivot = 0.435;

    for (let i = 0; i < len; i += 4) {
      // Linearize
      let r = srgbToLinear(data[i]! / 255);
      let g = srgbToLinear(data[i + 1]! / 255);
      let b = srgbToLinear(data[i + 2]! / 255);

      // Lift/Gamma/Gain
      r = liftGammaGain(r, p.lift.r, 1 + p.gamma.r, 1 + p.gain.r, p.offset.r);
      g = liftGammaGain(g, p.lift.g, 1 + p.gamma.g, 1 + p.gain.g, p.offset.g);
      b = liftGammaGain(b, p.lift.b, 1 + p.gamma.b, 1 + p.gain.b, p.offset.b);

      // Contrast
      r = contrastPivot(r, p.contrast, pivot);
      g = contrastPivot(g, p.contrast, pivot);
      b = contrastPivot(b, p.contrast, pivot);

      // Temperature/Tint
      r *= temp.r;
      g *= temp.g;
      b *= temp.b;

      // Saturation
      const lum = rec709Luma(r, g, b);
      r = lum + (r - lum) * p.saturation;
      g = lum + (g - lum) * p.saturation;
      b = lum + (b - lum) * p.saturation;

      // Encode back to sRGB
      data[i]     = Math.round(clamp01(linearToSrgb(clamp01(r))) * 255);
      data[i + 1] = Math.round(clamp01(linearToSrgb(clamp01(g))) * 255);
      data[i + 2] = Math.round(clamp01(linearToSrgb(clamp01(b))) * 255);
    }
  }

  private cpuCurves(data: Uint8ClampedArray, len: number, p: CurveParams): void {
    const masterLut = bakeCurveToLUT(p.master);
    const redLut = bakeCurveToLUT(p.red);
    const greenLut = bakeCurveToLUT(p.green);
    const blueLut = bakeCurveToLUT(p.blue);

    for (let i = 0; i < len; i += 4) {
      const ri = data[i];
      const gi = data[i + 1];
      const bi = data[i + 2];

      // Per-channel curves, then master
      let r = redLut[ri!];
      let g = greenLut[gi!];
      let b = blueLut[bi!];

      const mr = Math.round(clamp01(r!) * 255);
      const mg = Math.round(clamp01(g!) * 255);
      const mb = Math.round(clamp01(b!) * 255);

      data[i]     = Math.round(clamp01(masterLut[mr]!) * 255);
      data[i + 1] = Math.round(clamp01(masterLut[mg]!) * 255);
      data[i + 2] = Math.round(clamp01(masterLut[mb]!) * 255);
    }
  }

  private cpuHueSat(data: Uint8ClampedArray, len: number, p: HueSatParams): void {
    // Bake curve LUTs (control points map 0..1 -> multiplier centered at 0.5)
    const hueVsSat = bakeCurveToLUT(p.hueVsSat);
    const hueVsLum = bakeCurveToLUT(p.hueVsLum);
    const satVsSat = bakeCurveToLUT(p.satVsSat);
    const lumVsSat = bakeCurveToLUT(p.lumVsSat);

    for (let i = 0; i < len; i += 4) {
      const r = data[i]! / 255;
      const g = data[i + 1]! / 255;
      const b = data[i + 2]! / 255;

      const hsl = rgbToHsl(r, g, b);
      const hIdx = Math.round(clamp01(hsl.h / 360) * 255);
      const sIdx = Math.round(clamp01(hsl.s) * 255);
      const lIdx = Math.round(clamp01(hsl.l) * 255);

      // Apply curves (0.5 = no change, 1.0 = 2x, 0.0 = 0x)
      hsl.s = clamp01(hsl.s * hueVsSat[hIdx]! * 2);
      hsl.l = clamp01(hsl.l * hueVsLum[hIdx]! * 2);
      hsl.s = clamp01(hsl.s * lumVsSat[lIdx]! * 2);
      hsl.s = clamp01(hsl.s * satVsSat[sIdx]! * 2);

      const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
      data[i]     = Math.round(clamp01(rgb.r) * 255);
      data[i + 1] = Math.round(clamp01(rgb.g) * 255);
      data[i + 2] = Math.round(clamp01(rgb.b) * 255);
    }
  }

  private cpuSecondary(data: Uint8ClampedArray, len: number, p: SecondaryParams): void {
    if (!p.enabled) return;

    // Secondary correction just limits the processing region — actual grade
    // is applied by the connected primary/curves node via matte.
    // For CPU mode, we don't apply the matte separately.
    // This is a placeholder for the matte generation.
  }

  private cpuMixer(data: Uint8ClampedArray, len: number, p: MixerParams): void {
    for (let i = 0; i < len; i += 4) {
      const r = data[i]! / 255;
      const g = data[i + 1]! / 255;
      const b = data[i + 2]! / 255;

      const nr = r * p.redOut.r + g * p.redOut.g + b * p.redOut.b;
      const ng = r * p.greenOut.r + g * p.greenOut.g + b * p.greenOut.b;
      const nb = r * p.blueOut.r + g * p.blueOut.g + b * p.blueOut.b;

      data[i]     = Math.round(clamp01(nr) * 255);
      data[i + 1] = Math.round(clamp01(ng) * 255);
      data[i + 2] = Math.round(clamp01(nb) * 255);
    }
  }

  // ── Topological Sort ────────────────────────────────────────────────────

  private topologicalSort(
    nodes: ColorNode[],
    connections: ColorConnection[],
  ): ColorNode[] {
    const nodeMap = new Map<string, ColorNode>();
    for (const n of nodes) nodeMap.set(n.id, n);

    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const n of nodes) {
      inDegree.set(n.id, 0);
      adj.set(n.id, []);
    }

    for (const c of connections) {
      adj.get(c.from)?.push(c.to);
      inDegree.set(c.to, (inDegree.get(c.to) || 0) + 1);
    }

    // BFS (Kahn's algorithm)
    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const sorted: ColorNode[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const node = nodeMap.get(id);
      if (node) sorted.push(node);

      for (const next of (adj.get(id) || [])) {
        const deg = (inDegree.get(next) || 1) - 1;
        inDegree.set(next, deg);
        if (deg === 0) queue.push(next);
      }
    }

    return sorted;
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  destroy(): void {
    if (this.gpu) {
      this.gpu.inputTexture?.destroy();
      this.gpu.outputTexture?.destroy();
      this.gpu.readbackBuffer?.destroy();
      this.gpu.uniformBuffer?.destroy();
      this.gpu.curveLutTexture?.destroy();
      this.gpu.device.destroy();
      this.gpu = null;
    }
    this._isReady = false;
    this.mode = 'cpu';
  }
}

/** Singleton color grading pipeline instance. */
export const colorGradingPipeline = new ColorGradingPipeline();
