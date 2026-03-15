// ═══════════════════════════════════════════════════════════════════════════
//  WebGPU Type Declarations
//  Minimal type stubs for the WebGPU API types used by the effects pipeline.
//  These supplement the DOM types when @webgpu/types is not installed.
// ═══════════════════════════════════════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-explicit-any */

// Only declare if not already provided by @webgpu/types
declare global {
  // -- Adapter & Device -------------------------------------------------------

  interface GPU {
    requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
  }

  interface GPURequestAdapterOptions {
    powerPreference?: 'low-power' | 'high-performance';
  }

  interface GPUAdapter {
    readonly limits: GPUSupportedLimits;
    requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
  }

  interface GPUSupportedLimits {
    readonly maxTextureDimension2D: number;
    [key: string]: number;
  }

  interface GPUDeviceDescriptor {
    label?: string;
    requiredFeatures?: Iterable<string>;
    requiredLimits?: Record<string, number>;
  }

  interface GPUDevice {
    readonly queue: GPUQueue;
    readonly lost: Promise<GPUDeviceLostInfo>;
    createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
    createComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline;
    createPipelineLayout(descriptor: GPUPipelineLayoutDescriptor): GPUPipelineLayout;
    createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout;
    createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
    createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
    createTexture(descriptor: GPUTextureDescriptor): GPUTexture;
    createCommandEncoder(descriptor?: GPUCommandEncoderDescriptor): GPUCommandEncoder;
    destroy(): void;
  }

  interface GPUDeviceLostInfo {
    readonly message: string;
    readonly reason: string;
  }

  // -- Queue ------------------------------------------------------------------

  interface GPUQueue {
    submit(commandBuffers: GPUCommandBuffer[]): void;
    writeBuffer(buffer: GPUBuffer, offset: number, data: ArrayBuffer | ArrayBufferView): void;
    writeTexture(
      destination: GPUImageCopyTexture,
      data: ArrayBuffer | ArrayBufferView,
      dataLayout: GPUImageDataLayout,
      size: GPUExtent3DDict,
    ): void;
  }

  // -- Shader Module ----------------------------------------------------------

  interface GPUShaderModuleDescriptor {
    label?: string;
    code: string;
  }

  interface GPUShaderModule {}

  // -- Pipeline ---------------------------------------------------------------

  interface GPUComputePipelineDescriptor {
    label?: string;
    layout: GPUPipelineLayout | 'auto';
    compute: GPUProgrammableStage;
  }

  interface GPUProgrammableStage {
    module: GPUShaderModule;
    entryPoint: string;
  }

  interface GPUComputePipeline {}

  interface GPUPipelineLayoutDescriptor {
    label?: string;
    bindGroupLayouts: GPUBindGroupLayout[];
  }

  interface GPUPipelineLayout {}

  // -- Bind Group Layout ------------------------------------------------------

  interface GPUBindGroupLayoutDescriptor {
    label?: string;
    entries: GPUBindGroupLayoutEntry[];
  }

  interface GPUBindGroupLayoutEntry {
    binding: number;
    visibility: number;
    buffer?: GPUBufferBindingLayout;
    storageTexture?: GPUStorageTextureBindingLayout;
    texture?: GPUTextureBindingLayout;
    sampler?: GPUSamplerBindingLayout;
  }

  interface GPUBufferBindingLayout {
    type?: 'uniform' | 'storage' | 'read-only-storage';
  }

  interface GPUStorageTextureBindingLayout {
    access?: 'write-only' | 'read-only' | 'read-write';
    format: GPUTextureFormat;
    viewDimension?: string;
  }

  interface GPUTextureBindingLayout {
    sampleType?: string;
    viewDimension?: string;
    multisampled?: boolean;
  }

  interface GPUSamplerBindingLayout {
    type?: string;
  }

  // -- Bind Group -------------------------------------------------------------

  interface GPUBindGroupDescriptor {
    label?: string;
    layout: GPUBindGroupLayout;
    entries: GPUBindGroupEntry[];
  }

  interface GPUBindGroupEntry {
    binding: number;
    resource: GPUTextureView | GPUBufferBinding | GPUSampler;
  }

  interface GPUBufferBinding {
    buffer: GPUBuffer;
    offset?: number;
    size?: number;
  }

  interface GPUBindGroupLayout {}
  interface GPUBindGroup {}
  interface GPUSampler {}

  // -- Texture ----------------------------------------------------------------

  interface GPUTextureDescriptor {
    label?: string;
    size: GPUExtent3DDict;
    format: GPUTextureFormat;
    usage: number;
    mipLevelCount?: number;
    sampleCount?: number;
    dimension?: '1d' | '2d' | '3d';
  }

  interface GPUTexture {
    createView(descriptor?: GPUTextureViewDescriptor): GPUTextureView;
    destroy(): void;
    readonly width: number;
    readonly height: number;
  }

  interface GPUTextureViewDescriptor {
    format?: GPUTextureFormat;
    dimension?: string;
    baseMipLevel?: number;
    mipLevelCount?: number;
    baseArrayLayer?: number;
    arrayLayerCount?: number;
  }

  interface GPUTextureView {}

  type GPUTextureFormat = 'rgba8unorm' | 'bgra8unorm' | 'rgba16float' | 'rgba32float' | string;

  // -- Buffer -----------------------------------------------------------------

  interface GPUBufferDescriptor {
    label?: string;
    size: number;
    usage: number;
    mappedAtCreation?: boolean;
  }

  interface GPUBuffer {
    readonly size: number;
    mapAsync(mode: number, offset?: number, size?: number): Promise<void>;
    getMappedRange(offset?: number, size?: number): ArrayBuffer;
    unmap(): void;
    destroy(): void;
  }

  // -- Command Encoder --------------------------------------------------------

  interface GPUCommandEncoderDescriptor {
    label?: string;
  }

  interface GPUCommandEncoder {
    beginComputePass(descriptor?: GPUComputePassDescriptor): GPUComputePassEncoder;
    copyTextureToBuffer(
      source: GPUImageCopyTexture,
      destination: GPUImageCopyBuffer,
      copySize: GPUExtent3DDict,
    ): void;
    finish(): GPUCommandBuffer;
  }

  interface GPUComputePassDescriptor {
    label?: string;
  }

  interface GPUComputePassEncoder {
    setPipeline(pipeline: GPUComputePipeline): void;
    setBindGroup(index: number, bindGroup: GPUBindGroup): void;
    dispatchWorkgroups(x: number, y?: number, z?: number): void;
    end(): void;
  }

  interface GPUCommandBuffer {}

  // -- Image Copy Types -------------------------------------------------------

  interface GPUImageCopyTexture {
    texture: GPUTexture;
    mipLevel?: number;
    origin?: GPUOrigin3DDict;
    aspect?: string;
  }

  interface GPUImageCopyBuffer {
    buffer: GPUBuffer;
    offset?: number;
    bytesPerRow: number;
    rowsPerImage?: number;
  }

  interface GPUImageDataLayout {
    offset?: number;
    bytesPerRow: number;
    rowsPerImage?: number;
  }

  interface GPUExtent3DDict {
    width: number;
    height?: number;
    depthOrArrayLayers?: number;
  }

  interface GPUOrigin3DDict {
    x?: number;
    y?: number;
    z?: number;
  }

  // -- Constants --------------------------------------------------------------

  // eslint-disable-next-line no-var
  var GPUBufferUsage: {
    readonly MAP_READ: number;
    readonly MAP_WRITE: number;
    readonly COPY_SRC: number;
    readonly COPY_DST: number;
    readonly INDEX: number;
    readonly VERTEX: number;
    readonly UNIFORM: number;
    readonly STORAGE: number;
    readonly INDIRECT: number;
    readonly QUERY_RESOLVE: number;
  };

  // eslint-disable-next-line no-var
  var GPUTextureUsage: {
    readonly COPY_SRC: number;
    readonly COPY_DST: number;
    readonly TEXTURE_BINDING: number;
    readonly STORAGE_BINDING: number;
    readonly RENDER_ATTACHMENT: number;
  };

  // eslint-disable-next-line no-var
  var GPUShaderStage: {
    readonly VERTEX: number;
    readonly FRAGMENT: number;
    readonly COMPUTE: number;
  };

  // eslint-disable-next-line no-var
  var GPUMapMode: {
    readonly READ: number;
    readonly WRITE: number;
  };

  // -- Navigator extension ----------------------------------------------------

  interface Navigator {
    gpu?: GPU;
  }
}

export {};
