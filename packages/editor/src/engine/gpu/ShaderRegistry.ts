// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Shader Registry
//  Maps effect definition IDs to compiled GPUComputePipeline objects.
//  Caches compiled pipelines for reuse across frames.
// ═══════════════════════════════════════════════════════════════════════════

import { SHADER_SOURCES } from './shaders/index';

/**
 * Registry that lazily compiles WGSL compute shaders into GPUComputePipelines
 * and caches them for efficient reuse.
 */
export class ShaderRegistry {
  private device: GPUDevice;
  private pipelineCache: Map<string, GPUComputePipeline> = new Map();
  private bindGroupLayoutCache: Map<string, GPUBindGroupLayout> = new Map();

  constructor(device: GPUDevice) {
    this.device = device;
  }

  /**
   * Get (or create) a compiled compute pipeline for the given effect ID.
   *
   * @param effectId  Effect definition ID (e.g. 'brightness-contrast').
   * @returns The compiled pipeline, or null if no shader is registered.
   */
  getPipeline(effectId: string): GPUComputePipeline | null {
    // Return cached pipeline if available
    const cached = this.pipelineCache.get(effectId);
    if (cached) return cached;

    // Look up shader source
    const source = SHADER_SOURCES[effectId];
    if (!source) {
      console.warn(`[ShaderRegistry] No shader registered for effect "${effectId}"`);
      return null;
    }

    return this.compilePipeline(effectId, source);
  }

  /**
   * Get the bind group layout for an effect's pipeline.
   *
   * @param effectId  Effect definition ID.
   * @returns The bind group layout, or null if not compiled yet.
   */
  getBindGroupLayout(effectId: string): GPUBindGroupLayout | null {
    // Ensure pipeline is compiled first
    this.getPipeline(effectId);
    return this.bindGroupLayoutCache.get(effectId) ?? null;
  }

  /**
   * Check whether a shader exists for the given effect ID.
   */
  hasShader(effectId: string): boolean {
    return effectId in SHADER_SOURCES;
  }

  /**
   * Get all registered effect IDs that have GPU shaders.
   */
  getRegisteredEffects(): string[] {
    return Object.keys(SHADER_SOURCES);
  }

  /**
   * Compile a WGSL source into a GPUComputePipeline and cache it.
   */
  private compilePipeline(effectId: string, source: string): GPUComputePipeline | null {
    try {
      const shaderModule = this.device.createShaderModule({
        label: `shader-${effectId}`,
        code: source,
      });

      const bindGroupLayout = this.device.createBindGroupLayout({
        label: `bgl-${effectId}`,
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: {
              access: 'read-only',
              format: 'rgba8unorm',
            },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: {
              access: 'write-only',
              format: 'rgba8unorm',
            },
          },
          {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'uniform' },
          },
        ],
      });

      const pipelineLayout = this.device.createPipelineLayout({
        label: `layout-${effectId}`,
        bindGroupLayouts: [bindGroupLayout],
      });

      const pipeline = this.device.createComputePipeline({
        label: `pipeline-${effectId}`,
        layout: pipelineLayout,
        compute: {
          module: shaderModule,
          entryPoint: 'main',
        },
      });

      this.pipelineCache.set(effectId, pipeline);
      this.bindGroupLayoutCache.set(effectId, bindGroupLayout);

      return pipeline;
    } catch (err) {
      console.error(`[ShaderRegistry] Failed to compile shader for "${effectId}":`, err);
      return null;
    }
  }

  /**
   * Clear all cached pipelines (e.g. when device is lost).
   */
  clear(): void {
    this.pipelineCache.clear();
    this.bindGroupLayoutCache.clear();
  }
}
