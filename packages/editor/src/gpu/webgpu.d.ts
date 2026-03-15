/**
 * WebGPU type declarations.
 * These extend the Navigator and HTMLCanvasElement interfaces to include WebGPU support.
 * A full @webgpu/types package can be used instead once added as a dependency.
 */

interface GPU {
  requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
  getPreferredCanvasFormat(): GPUTextureFormat;
}

interface GPURequestAdapterOptions {
  powerPreference?: 'low-power' | 'high-performance';
}

interface GPUAdapter {
  requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
  readonly name: string;
}

interface GPUDeviceDescriptor {
  requiredLimits?: Record<string, number>;
  requiredFeatures?: string[];
}

interface GPUDevice extends EventTarget {
  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
  createComputePipeline(descriptor: any): any;
  createBindGroup(descriptor: any): any;
  createBuffer(descriptor: any): any;
  createTexture(descriptor: any): any;
  createCommandEncoder(): any;
  queue: GPUQueue;
  destroy(): void;
}

interface GPUShaderModuleDescriptor {
  code: string;
  label?: string;
}

interface GPUShaderModule {}

interface GPUQueue {
  submit(commandBuffers: any[]): void;
  writeBuffer(buffer: any, offset: number, data: BufferSource): void;
}

type GPUTextureFormat =
  | 'bgra8unorm'
  | 'rgba8unorm'
  | 'rgba16float'
  | 'rgba32float'
  | string;

interface GPUCanvasContext {
  configure(configuration: GPUCanvasConfiguration): void;
  getCurrentTexture(): any;
}

interface GPUCanvasConfiguration {
  device: GPUDevice;
  format: GPUTextureFormat;
  alphaMode?: 'opaque' | 'premultiplied';
  usage?: number;
}

interface Navigator {
  gpu?: GPU;
}

interface HTMLCanvasElement {
  getContext(contextId: 'webgpu'): GPUCanvasContext | null;
}
