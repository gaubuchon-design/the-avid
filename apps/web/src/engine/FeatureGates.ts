// =============================================================================
//  THE AVID — Feature Gates
// =============================================================================

import { platformCapabilities } from './PlatformCapabilities';

/** Configuration for runtime feature gates. */
export interface FeatureGateConfig {
  useWebGPU: boolean;
  useWebCodecs: boolean;
  useSharedArrayBuffer: boolean;
  useOffscreenCanvas: boolean;
}

/**
 * Runtime feature gates backed by `PlatformCapabilities`.
 *
 * Each gate defaults to the detected capability but can be overridden
 * for debugging, A/B testing, or graceful degradation.
 */
class FeatureGates {
  private overrides: Partial<FeatureGateConfig> = {};
  private listeners = new Set<() => void>();

  // ---------------------------------------------------------------------------
  //  Gate accessors
  // ---------------------------------------------------------------------------

  get useWebGPU(): boolean {
    return this.overrides.useWebGPU ?? platformCapabilities.supportsFeature('webgpu');
  }

  get useWebCodecs(): boolean {
    return this.overrides.useWebCodecs ?? platformCapabilities.supportsFeature('webCodecs');
  }

  get useSharedArrayBuffer(): boolean {
    return (
      this.overrides.useSharedArrayBuffer ??
      platformCapabilities.supportsFeature('sharedArrayBuffer')
    );
  }

  get useOffscreenCanvas(): boolean {
    return (
      this.overrides.useOffscreenCanvas ??
      platformCapabilities.supportsFeature('offscreenCanvas')
    );
  }

  // ---------------------------------------------------------------------------
  //  Override management
  // ---------------------------------------------------------------------------

  /**
   * Override a specific gate for debugging / testing.
   */
  override(gate: keyof FeatureGateConfig, value: boolean): void {
    this.overrides[gate] = value;
    this.notify();
  }

  /**
   * Clear all overrides, reverting to detected capabilities.
   */
  clearOverrides(): void {
    this.overrides = {};
    this.notify();
  }

  /**
   * Get the current resolved config (detected + overrides).
   */
  getConfig(): FeatureGateConfig {
    return {
      useWebGPU: this.useWebGPU,
      useWebCodecs: this.useWebCodecs,
      useSharedArrayBuffer: this.useSharedArrayBuffer,
      useOffscreenCanvas: this.useOffscreenCanvas,
    };
  }

  // ---------------------------------------------------------------------------
  //  Subscription
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to gate changes (e.g. when an override is applied).
   * @returns An unsubscribe function.
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  // ---------------------------------------------------------------------------
  //  Internal
  // ---------------------------------------------------------------------------

  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        // Listener errors must not propagate
      }
    });
  }
}

/** Singleton feature gates instance. */
export const featureGates = new FeatureGates();
