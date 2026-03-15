// =============================================================================
//  THE AVID -- Platform Capabilities Detection & OPFS Cache
//  Detects GPU (NVIDIA CUDA, AMD OpenCL, Apple Metal, Intel),
//  CPU (x86_64, ARM64, Apple Silicon), and browser API support.
// =============================================================================

/** GPU vendor/architecture info. */
export interface GPUInfo {
  vendor: 'nvidia' | 'amd' | 'intel' | 'apple' | 'qualcomm' | 'arm' | 'unknown';
  renderer: string;
  computeBackend: 'webgpu' | 'webgl2' | 'none';
  vramMB: number;
  supportsCompute: boolean;
  accelerationPaths: {
    /** NVIDIA CUDA-equivalent via WebGPU compute shaders. */
    nvidiaCuda: boolean;
    /** AMD OpenCL-equivalent via WebGPU compute shaders. */
    amdOpenCL: boolean;
    /** Apple Metal via WebGPU (Safari/Chrome on macOS/iOS). */
    appleMetal: boolean;
    /** Intel integrated GPU via WebGPU. */
    intelGPU: boolean;
    /** Generic WebGPU compute (any vendor). */
    webgpuCompute: boolean;
    /** WebGL2 fallback (framebuffer ops, no compute). */
    webgl2Fallback: boolean;
  };
}

/** CPU architecture info. */
export interface CPUInfo {
  architecture: 'x86_64' | 'arm64' | 'x86' | 'arm' | 'unknown';
  vendor: 'intel' | 'amd' | 'apple' | 'qualcomm' | 'unknown';
  cores: number;
  hasSIMD: boolean;
  hasSharedMemory: boolean;
  optimalWorkerCount: number;
  platform: 'macos' | 'windows' | 'linux' | 'ios' | 'android' | 'chromeos' | 'unknown';
}

/** Detected platform capabilities. */
export interface Capabilities {
  hasWebGPU: boolean;
  hasOffscreenCanvas: boolean;
  hasWebCodecs: boolean;
  isElectron: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isTouchDevice: boolean;
  hasPWA: boolean;
  maxTextureSize: number;
  deviceMemoryGB: number;
  hardwareConcurrency: number;
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
  storageQuotaMB: number;
  renderMode: 'webgpu' | 'canvas2d' | 'software';
  breakpoint: 'mobile' | 'tablet' | 'desktop-compact' | 'desktop-full';
  degradedFeatures: string[];
  performanceTier: 'high' | 'medium' | 'low';
  gpu: GPUInfo;
  cpu: CPUInfo;
}

// -- GPU Vendor Detection Helpers -------------------------------------------

function detectGPUVendorFromRenderer(renderer: string): GPUInfo['vendor'] {
  const r = renderer.toLowerCase();
  if (r.includes('nvidia') || r.includes('geforce') || r.includes('quadro') || r.includes('rtx') || r.includes('gtx')) return 'nvidia';
  if (r.includes('amd') || r.includes('radeon') || r.includes('rx ')) return 'amd';
  if (r.includes('apple') || r.includes('m1') || r.includes('m2') || r.includes('m3') || r.includes('m4')) return 'apple';
  if (r.includes('intel') || r.includes('iris') || r.includes('uhd') || r.includes('hd graphics')) return 'intel';
  if (r.includes('qualcomm') || r.includes('adreno')) return 'qualcomm';
  if (r.includes('mali') || r.includes('arm')) return 'arm';
  return 'unknown';
}

function detectGPUFromWebGL(): { vendor: GPUInfo['vendor']; renderer: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null
      ?? canvas.getContext('webgl') as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
        return { vendor: detectGPUVendorFromRenderer(renderer), renderer };
      }
      const fallbackRenderer = gl.getParameter(gl.RENDERER) as string;
      return { vendor: detectGPUVendorFromRenderer(fallbackRenderer), renderer: fallbackRenderer };
    }
  } catch { /* ignore */ }
  return { vendor: 'unknown', renderer: 'unknown' };
}

// -- CPU Detection Helpers --------------------------------------------------

function detectCPUArchitecture(): CPUInfo['architecture'] {
  const ua = navigator?.userAgent ?? '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uaData = (navigator as any).userAgentData;

  // NavigatorUAData (Chrome 90+) has architecture info
  if (uaData?.platform) {
    const arch = uaData.architecture?.toLowerCase?.() ?? '';
    if (arch === 'arm' || arch === 'arm64') return 'arm64';
    if (arch === 'x86' && uaData.bitness === '64') return 'x86_64';
    if (arch === 'x86') return 'x86';
  }

  // Fallback: parse User-Agent
  if (/aarch64|arm64/i.test(ua)) return 'arm64';
  if (/x86_64|x64|amd64|win64/i.test(ua)) return 'x86_64';
  if (/armv|arm/i.test(ua)) return 'arm';
  if (/i[3-6]86|x86/i.test(ua)) return 'x86';

  // macOS with Apple Silicon detection
  if (/Macintosh/i.test(ua)) {
    // If WebGPU adapter reports Apple GPU, it's Apple Silicon
    return 'arm64'; // Modern Macs are predominantly Apple Silicon
  }

  return 'unknown';
}

function detectCPUVendor(arch: CPUInfo['architecture'], gpuVendor: GPUInfo['vendor']): CPUInfo['vendor'] {
  const ua = navigator?.userAgent ?? '';

  // Apple Silicon: ARM64 on macOS with Apple GPU
  if (arch === 'arm64' && /Macintosh|iPhone|iPad/i.test(ua)) return 'apple';

  // Qualcomm: ARM on Windows (Windows on ARM) or Android with Adreno
  if ((arch === 'arm64' || arch === 'arm') && /Windows/i.test(ua)) return 'qualcomm';
  if ((arch === 'arm64' || arch === 'arm') && /Android/i.test(ua) && gpuVendor === 'qualcomm') return 'qualcomm';

  // x86_64 with AMD GPU likely AMD CPU (heuristic)
  if ((arch === 'x86_64' || arch === 'x86') && gpuVendor === 'amd') return 'amd';

  // Default x86 to Intel (most common)
  if (arch === 'x86_64' || arch === 'x86') return 'intel';

  return 'unknown';
}

function detectPlatform(): CPUInfo['platform'] {
  const ua = navigator?.userAgent ?? '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const platform = (navigator as any).userAgentData?.platform?.toLowerCase?.() ?? navigator?.platform?.toLowerCase?.() ?? '';

  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  if (/CrOS/i.test(ua)) return 'chromeos';
  if (platform.includes('mac') || /Macintosh/i.test(ua)) return 'macos';
  if (platform.includes('win') || /Windows/i.test(ua)) return 'windows';
  if (platform.includes('linux') || /Linux/i.test(ua)) return 'linux';
  return 'unknown';
}

function detectSIMDSupport(): boolean {
  try {
    // Check WebAssembly SIMD support
    // This is a minimal SIMD module that validates if the engine supports v128
    const simdBytes = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,
      10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
    ]);
    return WebAssembly.validate(simdBytes);
  } catch {
    return false;
  }
}

// ─── PlatformCapabilities Class ───────────────────────────────────────────

class PlatformCapabilities {
  private caps: Capabilities | null = null;
  private opfsRoot: FileSystemDirectoryHandle | null = null;
  private listeners = new Set<() => void>();

  // -- Detection --------------------------------------------------------------

  async detect(): Promise<Capabilities> {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isMobile = /Android|iPhone|iPod/i.test(ua) && !/iPad/i.test(ua);
    const isTablet = /iPad/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
    const isElectron = /Electron/i.test(ua);
    const isTouchDevice =
      typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

    // WebGPU detection with adapter info
    let hasWebGPU = false;
    let maxTextureSize = 4096;
    let webgpuAdapterInfo: { vendor: string; architecture: string; description: string } | null = null;
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const adapter = await (navigator as any).gpu.requestAdapter();
        if (adapter) {
          hasWebGPU = true;
          maxTextureSize = adapter.limits?.maxTextureDimension2D ?? 8192;
          // Extract adapter info (Chrome 113+)
          try {
            const info = adapter.info ?? (await adapter.requestAdapterInfo?.());
            if (info) {
              webgpuAdapterInfo = {
                vendor: info.vendor ?? '',
                architecture: info.architecture ?? '',
                description: info.description ?? '',
              };
            }
          } catch { /* adapter info not available */ }
        }
      } catch {
        // WebGPU not available
      }
    }

    // GPU info from WebGL (always available as fallback)
    const webglInfo = detectGPUFromWebGL();
    const gpuRenderer = webgpuAdapterInfo?.description || webglInfo.renderer;
    const gpuVendor = webgpuAdapterInfo
      ? detectGPUVendorFromRenderer(webgpuAdapterInfo.vendor + ' ' + webgpuAdapterInfo.description)
      : webglInfo.vendor;

    // WebGL2 check
    let hasWebGL2 = false;
    try {
      const c = document.createElement('canvas');
      hasWebGL2 = !!c.getContext('webgl2');
    } catch { /* no WebGL2 */ }

    const gpuInfo: GPUInfo = {
      vendor: gpuVendor,
      renderer: gpuRenderer,
      computeBackend: hasWebGPU ? 'webgpu' : hasWebGL2 ? 'webgl2' : 'none',
      vramMB: 0, // Cannot be reliably detected in browsers
      supportsCompute: hasWebGPU,
      accelerationPaths: {
        nvidiaCuda: hasWebGPU && gpuVendor === 'nvidia',
        amdOpenCL: hasWebGPU && gpuVendor === 'amd',
        appleMetal: hasWebGPU && gpuVendor === 'apple',
        intelGPU: hasWebGPU && gpuVendor === 'intel',
        webgpuCompute: hasWebGPU,
        webgl2Fallback: hasWebGL2 && !hasWebGPU,
      },
    };

    // CPU info
    const cpuArch = detectCPUArchitecture();
    const cpuVendor = detectCPUVendor(cpuArch, gpuVendor);
    const cores = navigator.hardwareConcurrency ?? 4;
    const hasSharedMemory = typeof SharedArrayBuffer !== 'undefined';

    const cpuInfo: CPUInfo = {
      architecture: cpuArch,
      vendor: cpuVendor,
      cores,
      hasSIMD: detectSIMDSupport(),
      hasSharedMemory,
      // Leave 2 cores for main thread + GC, minimum 1 worker
      optimalWorkerCount: Math.max(1, Math.min(cores - 2, 16)),
      platform: detectPlatform(),
    };

    // OffscreenCanvas
    const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';

    // WebCodecs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasWebCodecs = typeof (globalThis as any).VideoDecoder !== 'undefined';

    // PWA
    const hasPWA =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(display-mode: standalone)').matches ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window.navigator as any).standalone === true);

    // Hardware
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deviceMemoryGB = (navigator as any).deviceMemory ?? 4;
    const hardwareConcurrency = navigator.hardwareConcurrency ?? 4;

    // Screen
    const screenWidth = typeof screen !== 'undefined' ? screen.width : 1920;
    const screenHeight = typeof screen !== 'undefined' ? screen.height : 1080;
    const pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio ?? 1 : 1;

    // Storage quota
    let storageQuotaMB = 0;
    if (navigator.storage?.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        storageQuotaMB = Math.round((estimate.quota ?? 0) / (1024 * 1024));
      } catch { /* not available */ }
    }

    // Render mode selection
    let renderMode: Capabilities['renderMode'] = 'canvas2d';
    if (hasWebGPU) {
      renderMode = 'webgpu';
    } else if (!hasOffscreenCanvas && deviceMemoryGB < 2) {
      renderMode = 'software';
    }

    // Breakpoint
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : screenWidth;
    let breakpoint: Capabilities['breakpoint'];
    if (viewportWidth < 640) breakpoint = 'mobile';
    else if (viewportWidth < 1024) breakpoint = 'tablet';
    else if (viewportWidth < 1440) breakpoint = 'desktop-compact';
    else breakpoint = 'desktop-full';

    // Degraded features
    const degradedFeatures: string[] = [];
    if (!hasWebGPU) degradedFeatures.push('webgpu');
    if (!hasOffscreenCanvas) degradedFeatures.push('offscreenCanvas');
    if (!hasWebCodecs) degradedFeatures.push('webCodecs');
    if (!hasSharedMemory) degradedFeatures.push('sharedArrayBuffer');
    if (!cpuInfo.hasSIMD) degradedFeatures.push('wasmSimd');

    const performanceTier = this.computePerformanceTier(hasWebGPU, deviceMemoryGB, hardwareConcurrency);

    this.caps = {
      hasWebGPU, hasOffscreenCanvas, hasWebCodecs, isElectron, isMobile, isTablet,
      isTouchDevice, hasPWA, maxTextureSize, deviceMemoryGB, hardwareConcurrency,
      screenWidth, screenHeight, pixelRatio, storageQuotaMB, renderMode, breakpoint,
      degradedFeatures, performanceTier, gpu: gpuInfo, cpu: cpuInfo,
    };

    this.notify();
    return { ...this.caps };
  }

  get(): Capabilities {
    if (!this.caps) {
      const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasWebCodecs = typeof (globalThis as any).VideoDecoder !== 'undefined';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deviceMemoryGB = (navigator as any)?.deviceMemory ?? 4;
      const hardwareConcurrency = navigator?.hardwareConcurrency ?? 4;

      const degradedFeatures: string[] = ['webgpu'];
      if (!hasOffscreenCanvas) degradedFeatures.push('offscreenCanvas');
      if (!hasWebCodecs) degradedFeatures.push('webCodecs');
      if (typeof SharedArrayBuffer === 'undefined') degradedFeatures.push('sharedArrayBuffer');

      const webglInfo = detectGPUFromWebGL();
      const cpuArch = detectCPUArchitecture();

      const defaultGpu: GPUInfo = {
        vendor: webglInfo.vendor, renderer: webglInfo.renderer,
        computeBackend: 'none', vramMB: 0, supportsCompute: false,
        accelerationPaths: { nvidiaCuda: false, amdOpenCL: false, appleMetal: false, intelGPU: false, webgpuCompute: false, webgl2Fallback: false },
      };
      const defaultCpu: CPUInfo = {
        architecture: cpuArch, vendor: detectCPUVendor(cpuArch, webglInfo.vendor),
        cores: hardwareConcurrency, hasSIMD: false, hasSharedMemory: typeof SharedArrayBuffer !== 'undefined',
        optimalWorkerCount: Math.max(1, hardwareConcurrency - 2), platform: detectPlatform(),
      };

      this.caps = {
        hasWebGPU: false, hasOffscreenCanvas, hasWebCodecs,
        isElectron: /Electron/i.test(navigator?.userAgent ?? ''),
        isMobile: /Android|iPhone|iPod/i.test(navigator?.userAgent ?? ''),
        isTablet: /iPad/i.test(navigator?.userAgent ?? ''),
        isTouchDevice: typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0),
        hasPWA: false, maxTextureSize: 4096, deviceMemoryGB, hardwareConcurrency,
        screenWidth: typeof screen !== 'undefined' ? screen.width : 1920,
        screenHeight: typeof screen !== 'undefined' ? screen.height : 1080,
        pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio ?? 1 : 1,
        storageQuotaMB: 0, renderMode: 'canvas2d', breakpoint: this.computeBreakpoint(),
        degradedFeatures, performanceTier: this.computePerformanceTier(false, deviceMemoryGB, hardwareConcurrency),
        gpu: defaultGpu, cpu: defaultCpu,
      };
      this.detect().catch(() => {});
    }
    return { ...this.caps };
  }

  // -- GPU acceleration helpers -----------------------------------------------

  /** Get the best available acceleration strategy for compute workloads. */
  getAccelerationStrategy(): string {
    const caps = this.get();
    const g = caps.gpu;
    if (g.accelerationPaths.nvidiaCuda) return 'NVIDIA CUDA via WebGPU';
    if (g.accelerationPaths.appleMetal) return 'Apple Metal via WebGPU';
    if (g.accelerationPaths.amdOpenCL) return 'AMD OpenCL via WebGPU';
    if (g.accelerationPaths.intelGPU) return 'Intel GPU via WebGPU';
    if (g.accelerationPaths.webgpuCompute) return 'Generic WebGPU Compute';
    if (g.accelerationPaths.webgl2Fallback) return 'WebGL2 Framebuffer Fallback';
    return `Software (${caps.cpu.cores} threads)`;
  }

  /** Get a human-readable hardware summary string. */
  getHardwareSummary(): string {
    const caps = this.get();
    const gpu = caps.gpu;
    const cpu = caps.cpu;
    const parts: string[] = [];
    parts.push(`GPU: ${gpu.renderer} (${gpu.vendor})`);
    parts.push(`CPU: ${cpu.vendor} ${cpu.architecture} (${cpu.cores} cores)`);
    parts.push(`Platform: ${cpu.platform}`);
    parts.push(`Acceleration: ${this.getAccelerationStrategy()}`);
    parts.push(`Memory: ${caps.deviceMemoryGB}GB`);
    parts.push(`Tier: ${caps.performanceTier}`);
    if (cpu.hasSIMD) parts.push('WASM SIMD: Yes');
    if (cpu.hasSharedMemory) parts.push(`Workers: ${cpu.optimalWorkerCount}`);
    return parts.join(' | ');
  }

  // -- Responsive helpers -----------------------------------------------------

  getBreakpoint(): Capabilities['breakpoint'] {
    return this.get().breakpoint;
  }

  shouldUseSimplifiedUI(): boolean {
    const caps = this.get();
    return caps.isMobile || caps.breakpoint === 'mobile' || caps.deviceMemoryGB < 2;
  }

  supportsFeature(feature: 'webgpu' | 'offscreenCanvas' | 'webCodecs' | 'sharedArrayBuffer'): boolean {
    switch (feature) {
      case 'webgpu': return this.get().hasWebGPU;
      case 'offscreenCanvas': return this.get().hasOffscreenCanvas;
      case 'webCodecs': return this.get().hasWebCodecs;
      case 'sharedArrayBuffer': return typeof SharedArrayBuffer !== 'undefined';
      default: return false;
    }
  }

  getPerformanceTier(): 'high' | 'medium' | 'low' {
    const caps = this.get();
    return this.computePerformanceTier(caps.hasWebGPU, caps.deviceMemoryGB, caps.hardwareConcurrency);
  }

  // -- Storage ----------------------------------------------------------------

  async getStorageEstimate(): Promise<{ usage: number; quota: number }> {
    if (navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
      } catch { /* fall through */ }
    }
    return { usage: 0, quota: 0 };
  }

  // -- OPFS helpers -----------------------------------------------------------

  async initOPFS(): Promise<FileSystemDirectoryHandle | null> {
    if (this.opfsRoot) return this.opfsRoot;
    try {
      if (navigator.storage?.getDirectory) {
        this.opfsRoot = await navigator.storage.getDirectory();
        return this.opfsRoot;
      }
    } catch { /* OPFS not available */ }
    return null;
  }

  async cacheFile(name: string, data: ArrayBuffer): Promise<void> {
    const root = await this.initOPFS();
    if (!root) return;
    try {
      const fileHandle = await root.getFileHandle(name, { create: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const writable = await (fileHandle as any).createWritable();
      await writable.write(data);
      await writable.close();
    } catch (err) {
      console.error('[PlatformCapabilities] cacheFile failed:', err);
    }
  }

  async getCachedFile(name: string): Promise<ArrayBuffer | null> {
    const root = await this.initOPFS();
    if (!root) return null;
    try {
      const fileHandle = await root.getFileHandle(name);
      const file = await fileHandle.getFile();
      return await file.arrayBuffer();
    } catch { return null; }
  }

  async clearCache(): Promise<void> {
    const root = await this.initOPFS();
    if (!root) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const [name] of (root as any).entries()) {
        await root.removeEntry(name);
      }
    } catch (err) {
      console.error('[PlatformCapabilities] clearCache failed:', err);
    }
  }

  // -- Subscribe --------------------------------------------------------------

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try { fn(); } catch (err) {
        console.error('[PlatformCapabilities] Listener error:', err);
      }
    });
  }

  // -- Internal ---------------------------------------------------------------

  private computeBreakpoint(): Capabilities['breakpoint'] {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1920;
    if (w < 640) return 'mobile';
    if (w < 1024) return 'tablet';
    if (w < 1440) return 'desktop-compact';
    return 'desktop-full';
  }

  private computePerformanceTier(hasWebGPU: boolean, deviceMemoryGB: number, hardwareConcurrency: number): 'high' | 'medium' | 'low' {
    if (hasWebGPU && deviceMemoryGB >= 8 && hardwareConcurrency >= 8) return 'high';
    if (deviceMemoryGB >= 4 && hardwareConcurrency >= 4) return 'medium';
    return 'low';
  }
}

/** Singleton platform capabilities instance. */
export const platformCapabilities = new PlatformCapabilities();
