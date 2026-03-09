// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- WebGPU Effects Pipeline
//  GPU-accelerated compute shader pipeline for real-time video effects.
//  Falls back gracefully to Canvas 2D if WebGPU is unavailable.
// ═══════════════════════════════════════════════════════════════════════════

import type { EffectInstance } from '../EffectsEngine';
import { ShaderRegistry } from './ShaderRegistry';

// ─── Types ─────────────────────────────────────────────────────────────────

/** Pooled frame buffer entry for GPU read-back. */
interface FrameBuffer {
  width: number;
  height: number;
  inputTexture: GPUTexture;
  outputTexture: GPUTexture;
  readbackBuffer: GPUBuffer;
  uniformBuffer: GPUBuffer;
}

// ─── Uniform Packing Helpers ───────────────────────────────────────────────

/**
 * Parse a hex color string (#RRGGBB) to [r, g, b] floats in 0..1.
 */
function hexToRgbFloat(hex: string): [number, number, number] {
  const match = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return [0, 0, 0];
  return [
    parseInt(match[1]!, 16) / 255,
    parseInt(match[2]!, 16) / 255,
    parseInt(match[3]!, 16) / 255,
  ];
}

/**
 * Parse an aspect ratio string (e.g. "2.39:1") to a float.
 */
function parseAspectRatio(ratio: string): number {
  const parts = ratio.split(':');
  if (parts.length === 2) {
    return parseFloat(parts[0]!) / parseFloat(parts[1]!);
  }
  return parseFloat(ratio) || 1.78;
}

/**
 * Pack effect parameters into a Float32Array / Uint32Array for uniform upload.
 * Each effect has a specific layout matching its WGSL struct.
 * Returns null if the effect is not supported on GPU.
 */
function packUniforms(
  effect: EffectInstance,
  resolvedParams: Record<string, number | string | boolean>,
  _frame: number,
): ArrayBuffer | null {
  const getNum = (name: string): number => (resolvedParams[name] as number) ?? 0;
  const getStr = (name: string): string => (resolvedParams[name] as string) ?? '';
  const getBool = (name: string): boolean => (resolvedParams[name] as boolean) ?? false;

  switch (effect.definitionId) {
    case 'brightness-contrast': {
      // struct: f32 brightness, f32 contrast, u32 useLegacy, u32 _pad
      const buf = new ArrayBuffer(16);
      const f = new Float32Array(buf);
      const u = new Uint32Array(buf);
      f[0] = getNum('brightness');
      f[1] = getNum('contrast');
      u[2] = getBool('useLegacy') ? 1 : 0;
      u[3] = 0;
      return buf;
    }

    case 'hue-saturation': {
      // struct: f32 hue, f32 saturation, f32 lightness, u32 colorize
      const buf = new ArrayBuffer(16);
      const f = new Float32Array(buf);
      const u = new Uint32Array(buf);
      f[0] = getNum('hue');
      f[1] = getNum('saturation');
      f[2] = getNum('lightness');
      u[3] = getBool('colorize') ? 1 : 0;
      return buf;
    }

    case 'color-balance': {
      // struct: 9x f32 + u32 preserve + 2x u32 pad = 48 bytes (12 x 4)
      const buf = new ArrayBuffer(48);
      const f = new Float32Array(buf);
      const u = new Uint32Array(buf);
      f[0] = getNum('shadowsR');
      f[1] = getNum('shadowsG');
      f[2] = getNum('shadowsB');
      f[3] = getNum('midtonesR');
      f[4] = getNum('midtonesG');
      f[5] = getNum('midtonesB');
      f[6] = getNum('highlightsR');
      f[7] = getNum('highlightsG');
      f[8] = getNum('highlightsB');
      u[9] = getBool('preserveLuminosity') ? 1 : 0;
      u[10] = 0;
      u[11] = 0;
      return buf;
    }

    case 'blur-gaussian':
    case 'blur-gaussian-v': {
      // struct: i32 radius, 3x u32 pad = 16 bytes
      const buf = new ArrayBuffer(16);
      const i = new Int32Array(buf);
      i[0] = Math.round(getNum('radius'));
      i[1] = 0;
      i[2] = 0;
      i[3] = 0;
      return buf;
    }

    case 'sharpen': {
      // struct: f32 amount, i32 radius, f32 threshold, u32 pad
      const buf = new ArrayBuffer(16);
      const f = new Float32Array(buf);
      const i = new Int32Array(buf);
      f[0] = getNum('amount');
      i[1] = Math.max(1, Math.round(getNum('radius')));
      f[2] = getNum('threshold');
      new Uint32Array(buf)[3] = 0;
      return buf;
    }

    case 'chroma-key': {
      // struct: 3x f32 keyColor, f32 tolerance, f32 softness, f32 spillSuppression, 2x u32 pad
      const buf = new ArrayBuffer(32);
      const f = new Float32Array(buf);
      const u = new Uint32Array(buf);
      const [kr, kg, kb] = hexToRgbFloat(getStr('keyColor'));
      f[0] = kr;
      f[1] = kg;
      f[2] = kb;
      f[3] = getNum('tolerance');
      f[4] = getNum('softness');
      f[5] = getNum('spillSuppression');
      u[6] = 0;
      u[7] = 0;
      return buf;
    }

    case 'vignette': {
      // struct: f32 amount, f32 midpoint, f32 roundness, f32 feather
      const buf = new ArrayBuffer(16);
      const f = new Float32Array(buf);
      f[0] = getNum('amount');
      f[1] = getNum('midpoint');
      f[2] = getNum('roundness');
      f[3] = getNum('feather');
      return buf;
    }

    case 'film-grain': {
      // struct: f32 amount, f32 size, f32 softness, u32 seed
      const buf = new ArrayBuffer(16);
      const f = new Float32Array(buf);
      const u = new Uint32Array(buf);
      f[0] = getNum('amount');
      f[1] = getNum('size');
      f[2] = getNum('softness');
      u[3] = getBool('animated') ? _frame : 0;
      return buf;
    }

    case 'glow': {
      // struct: i32 radius, f32 intensity, f32 threshold, 3x f32 tint, 2x u32 pad = 32 bytes
      const buf = new ArrayBuffer(32);
      const f = new Float32Array(buf);
      const i = new Int32Array(buf);
      const u = new Uint32Array(buf);
      i[0] = Math.round(getNum('radius'));
      f[1] = getNum('intensity');
      f[2] = getNum('threshold');
      const [tr, tg, tb] = hexToRgbFloat(getStr('color'));
      f[3] = tr;
      f[4] = tg;
      f[5] = tb;
      u[6] = 0;
      u[7] = 0;
      return buf;
    }

    case 'drop-shadow': {
      // struct: 3x f32 color, f32 opacity, 2x i32 offset, i32 blurRadius, u32 pad = 32 bytes
      const buf = new ArrayBuffer(32);
      const f = new Float32Array(buf);
      const i = new Int32Array(buf);
      const u = new Uint32Array(buf);
      const [sr, sg, sb] = hexToRgbFloat(getStr('color'));
      f[0] = sr;
      f[1] = sg;
      f[2] = sb;
      f[3] = getNum('opacity');
      // Pre-compute offset from angle + distance
      const angle = getNum('angle');
      const distance = getNum('distance');
      const rad = (angle * Math.PI) / 180;
      i[4] = Math.round(Math.cos(rad) * distance);
      i[5] = Math.round(Math.sin(rad) * distance);
      i[6] = Math.round(getNum('blur'));
      u[7] = 0;
      return buf;
    }

    case 'letterbox': {
      // struct: f32 targetAR, 3x f32 barColor, f32 opacity, 3x u32 pad = 32 bytes
      const buf = new ArrayBuffer(32);
      const f = new Float32Array(buf);
      const u = new Uint32Array(buf);
      f[0] = parseAspectRatio(getStr('ratio'));
      const [br, bg, bb] = hexToRgbFloat(getStr('color'));
      f[1] = br;
      f[2] = bg;
      f[3] = bb;
      f[4] = getNum('opacity');
      u[5] = 0;
      u[6] = 0;
      u[7] = 0;
      return buf;
    }

    case 'luma-key': {
      // struct: f32 threshold, f32 softness, u32 invert, u32 _pad
      const buf = new ArrayBuffer(16);
      const f = new Float32Array(buf);
      const u = new Uint32Array(buf);
      f[0] = getNum('threshold');
      f[1] = getNum('softness');
      u[2] = getBool('invert') ? 1 : 0;
      u[3] = 0;
      return buf;
    }

    case 'curves': {
      // struct: u32 channel, f32 shadows, f32 midtones, f32 highlights
      const buf = new ArrayBuffer(16);
      const f = new Float32Array(buf);
      const u = new Uint32Array(buf);
      const channelMap: Record<string, number> = { rgb: 0, r: 1, g: 2, b: 3 };
      u[0] = channelMap[getStr('channel')] ?? 0;
      f[1] = getNum('shadows');
      f[2] = getNum('midtones');
      f[3] = getNum('highlights');
      return buf;
    }

    case 'color-lookup': {
      // struct: u32 lutIndex, f32 intensity, 2x u32 pad
      const buf = new ArrayBuffer(16);
      const f = new Float32Array(buf);
      const u = new Uint32Array(buf);
      u[0] = Math.round(getNum('lutIndex'));
      f[1] = getNum('intensity');
      u[2] = 0;
      u[3] = 0;
      return buf;
    }

    case 'directional-blur': {
      // struct: f32 angle, i32 length, 2x u32 pad
      const buf = new ArrayBuffer(16);
      const f = new Float32Array(buf);
      const i = new Int32Array(buf);
      const u = new Uint32Array(buf);
      f[0] = getNum('angle');
      i[1] = Math.round(getNum('length'));
      u[2] = 0;
      u[3] = 0;
      return buf;
    }

    case 'radial-blur': {
      // struct: f32 amount, u32 blurType, f32 centerX, f32 centerY
      const buf = new ArrayBuffer(16);
      const f = new Float32Array(buf);
      const u = new Uint32Array(buf);
      f[0] = getNum('amount');
      u[1] = getStr('blurType') === 'zoom' ? 1 : 0;
      f[2] = getNum('centerX');
      f[3] = getNum('centerY');
      return buf;
    }

    case 'lens-distortion': {
      // struct: f32 curvature, f32 vDecenter, f32 hDecenter, f32 fillR, f32 fillG, f32 fillB, 2x u32 pad = 32 bytes
      const buf = new ArrayBuffer(32);
      const f = new Float32Array(buf);
      const u = new Uint32Array(buf);
      f[0] = getNum('curvature');
      f[1] = getNum('vDecenter');
      f[2] = getNum('hDecenter');
      const [fr, fg, fb] = hexToRgbFloat(getStr('fillColor'));
      f[3] = fr;
      f[4] = fg;
      f[5] = fb;
      u[6] = 0;
      u[7] = 0;
      return buf;
    }

    case 'turbulent-displace': {
      // struct: f32 amount, f32 size, f32 complexity, f32 evolution, u32 displaceType, 3x u32 pad = 32 bytes
      const buf = new ArrayBuffer(32);
      const f = new Float32Array(buf);
      const u = new Uint32Array(buf);
      f[0] = getNum('amount');
      f[1] = getNum('size');
      f[2] = getNum('complexity');
      f[3] = getNum('evolution');
      const displaceMap: Record<string, number> = { turbulent: 0, bulge: 1, twist: 2 };
      u[4] = displaceMap[getStr('displaceType')] ?? 0;
      u[5] = 0;
      u[6] = 0;
      u[7] = 0;
      return buf;
    }

    case 'noise': {
      // struct: f32 amount, u32 noiseType, u32 colored, u32 seed
      const buf = new ArrayBuffer(16);
      const f = new Float32Array(buf);
      const u = new Uint32Array(buf);
      f[0] = getNum('amount');
      u[1] = getStr('noiseType') === 'uniform' ? 1 : 0;
      u[2] = getBool('colored') ? 1 : 0;
      u[3] = getBool('animated') ? _frame : Math.round(getNum('seed'));
      return buf;
    }

    case 'mirror': {
      // struct: u32 axis, f32 center, 2x u32 pad
      const buf = new ArrayBuffer(16);
      const f = new Float32Array(buf);
      const u = new Uint32Array(buf);
      const axisMap: Record<string, number> = { horizontal: 0, vertical: 1, both: 2 };
      u[0] = axisMap[getStr('axis')] ?? 0;
      f[1] = getNum('center');
      u[2] = 0;
      u[3] = 0;
      return buf;
    }

    case 'glitch': {
      // struct: f32 amount, f32 blockSize, f32 rgbSplit, u32 scanlines, u32 seed, 3x u32 pad = 32 bytes
      const buf = new ArrayBuffer(32);
      const f = new Float32Array(buf);
      const u = new Uint32Array(buf);
      f[0] = getNum('amount');
      f[1] = getNum('blockSize');
      f[2] = getNum('rgbSplit');
      u[3] = getBool('scanlines') ? 1 : 0;
      u[4] = getBool('animated') ? _frame : Math.round(getNum('seed'));
      u[5] = 0;
      u[6] = 0;
      u[7] = 0;
      return buf;
    }

    case 'halftone': {
      // struct: f32 dotSize, f32 angle, u32 shape, u32 pad
      const buf = new ArrayBuffer(16);
      const f = new Float32Array(buf);
      const u = new Uint32Array(buf);
      f[0] = getNum('dotSize');
      f[1] = getNum('angle');
      const shapeMap: Record<string, number> = { circle: 0, square: 1, diamond: 2 };
      u[2] = shapeMap[getStr('shape')] ?? 0;
      u[3] = 0;
      return buf;
    }

    default:
      return null;
  }
}

// ─── Pipeline Class ────────────────────────────────────────────────────────

/**
 * WebGPU compute shader pipeline for real-time video effect processing.
 *
 * Manages GPU device lifecycle, frame buffer pools, and per-effect
 * compute dispatches with automatic readback to ImageData.
 */
export class WebGPUPipeline {
  private adapter: GPUAdapter | null = null;
  private device: GPUDevice | null = null;
  private registry: ShaderRegistry | null = null;
  private frameBufferPool: Map<string, FrameBuffer> = new Map();
  private _isReady = false;

  /** Whether the GPU pipeline is initialised and ready to process frames. */
  get isReady(): boolean {
    return this._isReady;
  }

  /**
   * Initialise the WebGPU pipeline.
   * Requests adapter and device. Returns false on any failure.
   */
  async init(): Promise<boolean> {
    try {
      if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
        console.warn('[WebGPUPipeline] WebGPU is not available');
        return false;
      }

      this.adapter = await (navigator as any).gpu.requestAdapter({
        powerPreference: 'high-performance',
      });

      if (!this.adapter) {
        console.warn('[WebGPUPipeline] Could not get GPU adapter');
        return false;
      }

      this.device = await this.adapter.requestDevice({
        label: 'the-avid-effects',
      });

      // Listen for device loss and attempt recovery
      this.device.lost.then((info) => {
        console.error(`[WebGPUPipeline] Device lost: ${info.message}`);
        this._isReady = false;
        this.cleanup();
      });

      this.registry = new ShaderRegistry(this.device);
      this._isReady = true;

      console.info('[WebGPUPipeline] Initialised successfully');
      return true;
    } catch (err) {
      console.error('[WebGPUPipeline] Init failed:', err);
      this._isReady = false;
      return false;
    }
  }

  /**
   * Process a frame through a stack of GPU compute effects.
   *
   * Uploads the ImageData as a GPU texture, dispatches each effect's
   * compute shader in sequence, and reads the result back.
   *
   * @param imageData  Source image data.
   * @param effects    Ordered array of effect instances to apply.
   * @param frame      Current frame number (for animated effects / keyframes).
   * @param getResolvedParams  Function to resolve interpolated params for each effect.
   * @returns Processed ImageData.
   */
  async processFrame(
    imageData: ImageData,
    effects: EffectInstance[],
    frame: number,
    getResolvedParams: (effect: EffectInstance, frame: number) => Record<string, number | string | boolean>,
  ): Promise<ImageData> {
    if (!this._isReady || !this.device || !this.registry) {
      throw new Error('[WebGPUPipeline] Pipeline is not initialised');
    }

    const { width, height } = imageData;
    const device = this.device;

    // Filter to enabled effects that have GPU shaders
    const gpuEffects = effects.filter(
      (e) => e.enabled && this.registry!.hasShader(e.definitionId),
    );

    if (gpuEffects.length === 0) {
      return imageData;
    }

    // Get or create frame buffers for this resolution
    const fb = this.getOrCreateFrameBuffer(width, height);

    // Upload source ImageData to input texture
    device.queue.writeTexture(
      { texture: fb.inputTexture },
      imageData.data.buffer,
      {
        bytesPerRow: width * 4,
        rowsPerImage: height,
      },
      { width, height },
    );

    // Process each effect
    let currentInput = fb.inputTexture;
    let currentOutput = fb.outputTexture;

    for (const effect of gpuEffects) {
      const resolvedParams = getResolvedParams(effect, frame);

      if (effect.definitionId === 'blur-gaussian') {
        // Blur requires two passes (horizontal + vertical)
        const iterations = Math.max(1, Math.min(
          (resolvedParams['iterations'] as number) ?? 1,
          5,
        ));

        for (let pass = 0; pass < iterations; pass++) {
          // Horizontal pass
          this.dispatchEffect(
            device,
            'blur-gaussian',
            currentInput,
            currentOutput,
            fb.uniformBuffer,
            resolvedParams,
            effect,
            frame,
            width,
            height,
          );

          // Swap textures for vertical pass
          [currentInput, currentOutput] = [currentOutput, currentInput];

          // Vertical pass
          this.dispatchEffect(
            device,
            'blur-gaussian-v',
            currentInput,
            currentOutput,
            fb.uniformBuffer,
            resolvedParams,
            effect,
            frame,
            width,
            height,
          );

          // Swap for next iteration or next effect
          [currentInput, currentOutput] = [currentOutput, currentInput];
        }
      } else {
        this.dispatchEffect(
          device,
          effect.definitionId,
          currentInput,
          currentOutput,
          fb.uniformBuffer,
          resolvedParams,
          effect,
          frame,
          width,
          height,
        );

        // Swap for next effect in chain
        [currentInput, currentOutput] = [currentOutput, currentInput];
      }
    }

    // Read back the final result (currentInput holds the last output)
    return await this.readback(device, currentInput, fb.readbackBuffer, width, height);
  }

  /**
   * Dispatch a single effect's compute shader.
   */
  private dispatchEffect(
    device: GPUDevice,
    shaderId: string,
    inputTexture: GPUTexture,
    outputTexture: GPUTexture,
    uniformBuffer: GPUBuffer,
    resolvedParams: Record<string, number | string | boolean>,
    effect: EffectInstance,
    frame: number,
    width: number,
    height: number,
  ): void {
    const pipeline = this.registry!.getPipeline(shaderId);
    const bindGroupLayout = this.registry!.getBindGroupLayout(shaderId);

    if (!pipeline || !bindGroupLayout) {
      console.warn(`[WebGPUPipeline] No pipeline for "${shaderId}", skipping`);
      return;
    }

    // Pack and upload uniforms
    const uniformData = packUniforms(effect, resolvedParams, frame);
    if (!uniformData) return;

    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    // Create bind group
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: inputTexture.createView(),
        },
        {
          binding: 1,
          resource: outputTexture.createView(),
        },
        {
          binding: 2,
          resource: { buffer: uniformBuffer, size: uniformData.byteLength },
        },
      ],
    });

    // Dispatch compute
    const encoder = device.createCommandEncoder({
      label: `compute-${shaderId}`,
    });
    const pass = encoder.beginComputePass({ label: `pass-${shaderId}` });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(
      Math.ceil(width / 16),
      Math.ceil(height / 16),
    );
    pass.end();

    device.queue.submit([encoder.finish()]);
  }

  /**
   * Read back a GPU texture to CPU ImageData via staging buffer.
   */
  private async readback(
    device: GPUDevice,
    texture: GPUTexture,
    readbackBuffer: GPUBuffer,
    width: number,
    height: number,
  ): Promise<ImageData> {
    // Bytes per row must be aligned to 256 for buffer copy
    const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
    const bufferSize = bytesPerRow * height;

    // Ensure readback buffer is large enough
    let buffer = readbackBuffer;
    if (buffer.size < bufferSize) {
      buffer.destroy();
      buffer = device.createBuffer({
        label: 'readback',
        size: bufferSize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      // Update the pool entry
      const key = `${width}x${height}`;
      const fb = this.frameBufferPool.get(key);
      if (fb) fb.readbackBuffer = buffer;
    }

    const encoder = device.createCommandEncoder({ label: 'readback-copy' });
    encoder.copyTextureToBuffer(
      { texture },
      { buffer, bytesPerRow, rowsPerImage: height },
      { width, height },
    );
    device.queue.submit([encoder.finish()]);

    // Map and read
    await buffer.mapAsync(GPUMapMode.READ);
    const mapped = buffer.getMappedRange();

    // Copy data, handling row alignment
    const result = new ImageData(width, height);
    const src = new Uint8Array(mapped);
    const dst = result.data;

    if (bytesPerRow === width * 4) {
      dst.set(new Uint8Array(mapped, 0, width * height * 4));
    } else {
      for (let row = 0; row < height; row++) {
        const srcOffset = row * bytesPerRow;
        const dstOffset = row * width * 4;
        dst.set(
          src.subarray(srcOffset, srcOffset + width * 4),
          dstOffset,
        );
      }
    }

    buffer.unmap();
    return result;
  }

  /**
   * Get or create a frame buffer set for the given resolution.
   * Reuses existing buffers when dimensions match.
   */
  private getOrCreateFrameBuffer(width: number, height: number): FrameBuffer {
    const key = `${width}x${height}`;
    const existing = this.frameBufferPool.get(key);
    if (existing) return existing;

    const device = this.device!;

    const textureDesc: GPUTextureDescriptor = {
      size: { width, height },
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.TEXTURE_BINDING,
    };

    const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
    const readbackSize = bytesPerRow * height;

    // Max uniform size across all effects (48 bytes for color-balance)
    const uniformBufferSize = 256;

    const fb: FrameBuffer = {
      width,
      height,
      inputTexture: device.createTexture({
        ...textureDesc,
        label: `input-${key}`,
      }),
      outputTexture: device.createTexture({
        ...textureDesc,
        label: `output-${key}`,
      }),
      readbackBuffer: device.createBuffer({
        label: `readback-${key}`,
        size: readbackSize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      }),
      uniformBuffer: device.createBuffer({
        label: `uniforms-${key}`,
        size: uniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }),
    };

    this.frameBufferPool.set(key, fb);
    return fb;
  }

  /**
   * Release all GPU resources.
   */
  cleanup(): void {
    for (const [, fb] of this.frameBufferPool) {
      fb.inputTexture.destroy();
      fb.outputTexture.destroy();
      fb.readbackBuffer.destroy();
      fb.uniformBuffer.destroy();
    }
    this.frameBufferPool.clear();

    this.registry?.clear();
    this.registry = null;

    if (this.device) {
      this.device.destroy();
      this.device = null;
    }

    this.adapter = null;
    this._isReady = false;
  }
}
