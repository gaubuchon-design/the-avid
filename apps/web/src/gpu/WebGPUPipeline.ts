/**
 * WebGPU-based rendering pipeline for GPU-accelerated effects.
 * Falls back to Canvas 2D when WebGPU is unavailable.
 */

export interface GPUPipelineConfig {
  device: GPUDevice;
  format: GPUTextureFormat;
  width: number;
  height: number;
}

export class WebGPUPipeline {
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat = 'bgra8unorm';
  private initialized = false;
  private deviceLost = false;
  private listeners = new Set<(event: string) => void>();

  async initialize(canvas: HTMLCanvasElement): Promise<boolean> {
    if (!navigator.gpu) {
      console.warn('[WebGPU] Not available, falling back to Canvas 2D');
      return false;
    }

    try {
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance',
      });
      if (!adapter) {
        console.warn('[WebGPU] No adapter found');
        return false;
      }

      this.device = await adapter.requestDevice({
        requiredLimits: {
          maxTextureDimension2D: 4096,
          maxBufferSize: 256 * 1024 * 1024, // 256MB
          maxStorageBufferBindingSize: 128 * 1024 * 1024,
        },
      });

      // Handle GPU device loss (e.g., driver crash, GPU hang)
      this.deviceLost = false;
      this.device.lost.then((info) => {
        console.error(`[WebGPU] Device lost: ${info.message} (reason: ${info.reason})`);
        this.deviceLost = true;
        this.initialized = false;
        this.notify('device-lost');

        // If the loss was not intentional, attempt recovery
        if (info.reason !== 'destroyed') {
          console.log('[WebGPU] Attempting device recovery...');
          this.device = null;
          this.initialize(canvas).then((ok) => {
            if (ok) {
              console.log('[WebGPU] Device recovered successfully');
              this.notify('device-recovered');
            } else {
              console.error('[WebGPU] Device recovery failed');
            }
          }).catch(() => {
            console.error('[WebGPU] Device recovery failed');
          });
        }
      });

      this.context = canvas.getContext('webgpu') as GPUCanvasContext;
      this.format = navigator.gpu.getPreferredCanvasFormat();

      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: 'premultiplied',
      });

      this.initialized = true;
      console.debug('[WebGPU] Pipeline initialized');
      return true;
    } catch (err) {
      console.warn('[WebGPU] Initialization failed:', err);
      return false;
    }
  }

  isAvailable(): boolean {
    return this.initialized && this.device !== null;
  }

  getDevice(): GPUDevice | null {
    return this.device;
  }

  /** Create a compute shader for color grading */
  createColorGradeShader(params: {
    exposure: number;
    contrast: number;
    saturation: number;
    temperature: number;
  }): GPUShaderModule | null {
    if (!this.device) return null;

    // Params are embedded as defaults but the shader uses a uniform buffer at runtime
    void params;

    const wgsl = `
      struct Params {
        exposure: f32,
        contrast: f32,
        saturation: f32,
        temperature: f32,
      }

      @group(0) @binding(0) var inputTex: texture_2d<f32>;
      @group(0) @binding(1) var outputTex: texture_storage_2d<rgba8unorm, write>;
      @group(0) @binding(2) var<uniform> params: Params;

      @compute @workgroup_size(8, 8)
      fn main(@builtin(global_invocation_id) id: vec3<u32>) {
        let dims = textureDimensions(inputTex);
        if (id.x >= dims.x || id.y >= dims.y) { return; }

        var color = textureLoad(inputTex, vec2<i32>(id.xy), 0);

        // Exposure
        let ev = pow(2.0, params.exposure);
        color = vec4<f32>(color.rgb * ev, color.a);

        // Contrast (pivot at 0.18 / middle gray)
        let pivot = vec3<f32>(0.18);
        color = vec4<f32>(pivot + (color.rgb - pivot) * (1.0 + params.contrast / 100.0), color.a);

        // Saturation
        let luma = dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
        let gray = vec3<f32>(luma);
        color = vec4<f32>(mix(gray, color.rgb, params.saturation / 100.0 + 1.0), color.a);

        // Temperature (simplified white balance shift)
        let temp = params.temperature / 100.0;
        color = vec4<f32>(
          color.r + temp * 0.1,
          color.g,
          color.b - temp * 0.1,
          color.a
        );

        // Clamp
        color = clamp(color, vec4<f32>(0.0), vec4<f32>(1.0));

        textureStore(outputTex, vec2<i32>(id.xy), color);
      }
    `;

    return this.device.createShaderModule({ code: wgsl });
  }

  isDeviceLost(): boolean {
    return this.deviceLost;
  }

  /**
   * Subscribe to pipeline events (e.g., 'device-lost', 'device-recovered').
   */
  subscribe(cb: (event: string) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify(event: string): void {
    this.listeners.forEach((fn) => {
      try { fn(event); } catch { /* listener errors must not propagate */ }
    });
  }

  destroy(): void {
    // Unconfigure the canvas context before destroying the device
    if (this.context) {
      try {
        (this.context as GPUCanvasContext & { unconfigure?: () => void }).unconfigure?.();
      } catch {
        // Context may already be invalid
      }
    }

    this.device?.destroy();
    this.device = null;
    this.context = null;
    this.initialized = false;
    this.listeners.clear();
  }
}

export const webGPUPipeline = new WebGPUPipeline();
