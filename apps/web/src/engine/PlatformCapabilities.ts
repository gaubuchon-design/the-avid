// =============================================================================
//  THE AVID -- Platform Capabilities Detection & OPFS Cache
// =============================================================================

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
  /** Features that are not available on this platform. */
  degradedFeatures: string[];
  /** Overall performance classification based on hardware. */
  performanceTier: 'high' | 'medium' | 'low';
}

/**
 * Platform capabilities detector and OPFS cache manager.
 *
 * Probes the runtime environment for GPU support, codec availability,
 * device form factor, and storage quota.  Provides OPFS-backed file caching
 * for offline media preview and a subscribe/unsubscribe pattern for
 * capability changes (e.g. viewport resize).
 */
class PlatformCapabilities {
  private caps: Capabilities | null = null;
  private opfsRoot: FileSystemDirectoryHandle | null = null;
  private listeners = new Set<() => void>();

  // -- Detection --------------------------------------------------------------

  /**
   * Run full asynchronous capability detection.
   * @returns A snapshot of all detected capabilities.
   */
  async detect(): Promise<Capabilities> {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isMobile = /Android|iPhone|iPod/i.test(ua) && !/iPad/i.test(ua);
    const isTablet = /iPad/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
    const isElectron = /Electron/i.test(ua);
    const isTouchDevice =
      typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

    // WebGPU
    let hasWebGPU = false;
    let maxTextureSize = 4096;
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebGPU types not in all TS lib targets
        const adapter = await (navigator as any).gpu.requestAdapter();
        if (adapter) {
          hasWebGPU = true;
          maxTextureSize = adapter.limits?.maxTextureDimension2D ?? 8192;
        }
      } catch {
        // WebGPU not available
      }
    }

    // OffscreenCanvas
    const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';

    // WebCodecs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebCodecs API not in all TS lib targets
    const hasWebCodecs = typeof (globalThis as any).VideoDecoder !== 'undefined';

    // PWA
    const hasPWA =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(display-mode: standalone)').matches ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Safari-specific PWA detection
        (window.navigator as any).standalone === true);

    // Hardware
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Navigator.deviceMemory not in all TS lib targets
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
      } catch {
        // Estimation not available
      }
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
    if (viewportWidth < 640) {
      breakpoint = 'mobile';
    } else if (viewportWidth < 1024) {
      breakpoint = 'tablet';
    } else if (viewportWidth < 1440) {
      breakpoint = 'desktop-compact';
    } else {
      breakpoint = 'desktop-full';
    }

    // Degraded features — list features that are NOT available
    const degradedFeatures: string[] = [];
    if (!hasWebGPU) degradedFeatures.push('webgpu');
    if (!hasOffscreenCanvas) degradedFeatures.push('offscreenCanvas');
    if (!hasWebCodecs) degradedFeatures.push('webCodecs');
    if (typeof SharedArrayBuffer === 'undefined') degradedFeatures.push('sharedArrayBuffer');

    // Performance tier
    const performanceTier = this.computePerformanceTier(
      hasWebGPU,
      deviceMemoryGB,
      hardwareConcurrency,
    );

    this.caps = {
      hasWebGPU,
      hasOffscreenCanvas,
      hasWebCodecs,
      isElectron,
      isMobile,
      isTablet,
      isTouchDevice,
      hasPWA,
      maxTextureSize,
      deviceMemoryGB,
      hardwareConcurrency,
      screenWidth,
      screenHeight,
      pixelRatio,
      storageQuotaMB,
      renderMode,
      breakpoint,
      degradedFeatures,
      performanceTier,
    };

    this.notify();
    return { ...this.caps };
  }

  /**
   * Get current capabilities synchronously.
   * If `detect()` has not been called yet, returns sensible defaults and
   * triggers an async detection in the background.
   * @returns A snapshot of capabilities.
   */
  get(): Capabilities {
    if (!this.caps) {
      const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebCodecs/deviceMemory not in all TS lib targets
      const hasWebCodecs = typeof (globalThis as any).VideoDecoder !== 'undefined';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deviceMemoryGB = (navigator as any)?.deviceMemory ?? 4;
      const hardwareConcurrency = navigator?.hardwareConcurrency ?? 4;

      // Compute degraded features for the synchronous default
      const degradedFeatures: string[] = [];
      // WebGPU defaults to false until async detect runs
      degradedFeatures.push('webgpu');
      if (!hasOffscreenCanvas) degradedFeatures.push('offscreenCanvas');
      if (!hasWebCodecs) degradedFeatures.push('webCodecs');
      if (typeof SharedArrayBuffer === 'undefined') degradedFeatures.push('sharedArrayBuffer');

      this.caps = {
        hasWebGPU: false,
        hasOffscreenCanvas,
        hasWebCodecs,
        isElectron: /Electron/i.test(navigator?.userAgent ?? ''),
        isMobile: /Android|iPhone|iPod/i.test(navigator?.userAgent ?? ''),
        isTablet: /iPad/i.test(navigator?.userAgent ?? ''),
        isTouchDevice:
          typeof window !== 'undefined' &&
          ('ontouchstart' in window || navigator.maxTouchPoints > 0),
        hasPWA: false,
        maxTextureSize: 4096,
        deviceMemoryGB,
        hardwareConcurrency,
        screenWidth: typeof screen !== 'undefined' ? screen.width : 1920,
        screenHeight: typeof screen !== 'undefined' ? screen.height : 1080,
        pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio ?? 1 : 1,
        storageQuotaMB: 0,
        renderMode: 'canvas2d',
        breakpoint: this.computeBreakpoint(),
        degradedFeatures,
        performanceTier: this.computePerformanceTier(false, deviceMemoryGB, hardwareConcurrency),
      };
      // Fire-and-forget async detect
      this.detect().catch(() => {});
    }
    return { ...this.caps };
  }

  // -- Responsive helpers -----------------------------------------------------

  /**
   * Get the current responsive breakpoint.
   * @returns The breakpoint string.
   */
  getBreakpoint(): Capabilities['breakpoint'] {
    return this.get().breakpoint;
  }

  /**
   * Whether the UI should degrade to a simplified layout.
   * @returns `true` on mobile or low-memory devices.
   */
  shouldUseSimplifiedUI(): boolean {
    const caps = this.get();
    return caps.isMobile || caps.breakpoint === 'mobile' || caps.deviceMemoryGB < 2;
  }

  /**
   * Check whether a specific platform feature is available.
   * @param feature The feature to probe.
   * @returns `true` if the feature is supported.
   */
  supportsFeature(
    feature: 'webgpu' | 'offscreenCanvas' | 'webCodecs' | 'sharedArrayBuffer',
  ): boolean {
    switch (feature) {
      case 'webgpu':
        return this.get().hasWebGPU;
      case 'offscreenCanvas':
        return this.get().hasOffscreenCanvas;
      case 'webCodecs':
        return this.get().hasWebCodecs;
      case 'sharedArrayBuffer':
        return typeof SharedArrayBuffer !== 'undefined';
      default:
        return false;
    }
  }

  /**
   * Get the overall performance tier based on detected hardware.
   * @returns `'high'`, `'medium'`, or `'low'`.
   */
  getPerformanceTier(): 'high' | 'medium' | 'low' {
    const caps = this.get();
    return this.computePerformanceTier(
      caps.hasWebGPU,
      caps.deviceMemoryGB,
      caps.hardwareConcurrency,
    );
  }

  // -- Storage ----------------------------------------------------------------

  /**
   * Get the current storage usage and quota.
   * @returns Object with `usage` and `quota` in bytes.
   */
  async getStorageEstimate(): Promise<{ usage: number; quota: number }> {
    if (navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
      } catch {
        // fall through
      }
    }
    return { usage: 0, quota: 0 };
  }

  // -- OPFS helpers -----------------------------------------------------------

  /**
   * Initialise the Origin Private File System root handle.
   * @returns The OPFS root directory handle, or `null` if unavailable.
   */
  async initOPFS(): Promise<FileSystemDirectoryHandle | null> {
    if (this.opfsRoot) return this.opfsRoot;
    try {
      if (navigator.storage?.getDirectory) {
        this.opfsRoot = await navigator.storage.getDirectory();
        return this.opfsRoot;
      }
    } catch {
      // OPFS not available
    }
    return null;
  }

  /**
   * Cache a file to OPFS.
   * @param name File name.
   * @param data File contents as an ArrayBuffer.
   */
  async cacheFile(name: string, data: ArrayBuffer): Promise<void> {
    const root = await this.initOPFS();
    if (!root) return;
    try {
      const fileHandle = await root.getFileHandle(name, { create: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- FileSystemWritable API not in all TS lib targets
      const writable = await (fileHandle as any).createWritable();
      await writable.write(data);
      await writable.close();
    } catch (err) {
      console.error('[PlatformCapabilities] cacheFile failed:', err);
    }
  }

  /**
   * Retrieve a cached file from OPFS.
   * @param name File name.
   * @returns The file contents, or `null` if not found.
   */
  async getCachedFile(name: string): Promise<ArrayBuffer | null> {
    const root = await this.initOPFS();
    if (!root) return null;
    try {
      const fileHandle = await root.getFileHandle(name);
      const file = await fileHandle.getFile();
      return await file.arrayBuffer();
    } catch {
      return null;
    }
  }

  /**
   * Clear all files from the OPFS cache.
   */
  async clearCache(): Promise<void> {
    const root = await this.initOPFS();
    if (!root) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OPFS entries() not in all TS lib targets
      for await (const [name] of (root as any).entries()) {
        await root.removeEntry(name);
      }
    } catch (err) {
      console.error('[PlatformCapabilities] clearCache failed:', err);
    }
  }

  // -- Subscribe --------------------------------------------------------------

  /**
   * Subscribe to capability changes.
   * @param cb Callback invoked on change.
   * @returns An unsubscribe function.
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Notify all subscribers that capabilities have changed. */
  private notify(): void {
    this.listeners.forEach((fn) => {
      try { fn(); } catch (err) {
        console.error('[PlatformCapabilities] Listener error:', err);
      }
    });
  }

  // -- Internal ---------------------------------------------------------------

  /**
   * Compute the responsive breakpoint from the current viewport width.
   * @returns The breakpoint string.
   */
  private computeBreakpoint(): Capabilities['breakpoint'] {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1920;
    if (w < 640) return 'mobile';
    if (w < 1024) return 'tablet';
    if (w < 1440) return 'desktop-compact';
    return 'desktop-full';
  }

  /**
   * Classify the device into a performance tier.
   */
  private computePerformanceTier(
    hasWebGPU: boolean,
    deviceMemoryGB: number,
    hardwareConcurrency: number,
  ): 'high' | 'medium' | 'low' {
    if (hasWebGPU && deviceMemoryGB >= 8 && hardwareConcurrency >= 8) return 'high';
    if (deviceMemoryGB >= 4 && hardwareConcurrency >= 4) return 'medium';
    return 'low';
  }
}

/** Singleton platform capabilities instance. */
export const platformCapabilities = new PlatformCapabilities();
