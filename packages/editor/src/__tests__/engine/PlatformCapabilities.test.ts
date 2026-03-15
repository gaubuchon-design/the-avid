import { describe, it, expect, vi } from 'vitest';
import { platformCapabilities } from '../../engine/PlatformCapabilities';

describe('PlatformCapabilities', () => {
  it('get() returns an object with all capability fields', () => {
    const caps = platformCapabilities.get();
    expect(caps).toHaveProperty('hasWebGPU');
    expect(caps).toHaveProperty('hasOffscreenCanvas');
    expect(caps).toHaveProperty('hasWebCodecs');
    expect(caps).toHaveProperty('isElectron');
    expect(caps).toHaveProperty('isMobile');
    expect(caps).toHaveProperty('isTablet');
    expect(caps).toHaveProperty('isTouchDevice');
    expect(caps).toHaveProperty('hasPWA');
    expect(caps).toHaveProperty('maxTextureSize');
    expect(caps).toHaveProperty('deviceMemoryGB');
    expect(caps).toHaveProperty('hardwareConcurrency');
    expect(caps).toHaveProperty('screenWidth');
    expect(caps).toHaveProperty('screenHeight');
    expect(caps).toHaveProperty('pixelRatio');
    expect(caps).toHaveProperty('storageQuotaMB');
    expect(caps).toHaveProperty('renderMode');
    expect(caps).toHaveProperty('breakpoint');
  });

  it('get() returns sensible defaults', () => {
    const caps = platformCapabilities.get();
    expect(typeof caps.hasWebGPU).toBe('boolean');
    expect(typeof caps.maxTextureSize).toBe('number');
    expect(caps.maxTextureSize).toBeGreaterThanOrEqual(4096);
    expect(typeof caps.hardwareConcurrency).toBe('number');
    expect(caps.hardwareConcurrency).toBeGreaterThanOrEqual(1);
  });

  it('supportsFeature("webgpu") returns false by default', () => {
    // navigator.gpu is set to undefined in setup.ts
    expect(platformCapabilities.supportsFeature('webgpu')).toBe(false);
  });

  it('supportsFeature("offscreenCanvas") checks for OffscreenCanvas', () => {
    // OffscreenCanvas is set to undefined in setup.ts
    const result = platformCapabilities.supportsFeature('offscreenCanvas');
    expect(typeof result).toBe('boolean');
  });

  it('supportsFeature("webCodecs") returns a boolean', () => {
    const result = platformCapabilities.supportsFeature('webCodecs');
    expect(typeof result).toBe('boolean');
  });

  it('supportsFeature("sharedArrayBuffer") returns a boolean', () => {
    const result = platformCapabilities.supportsFeature('sharedArrayBuffer');
    expect(typeof result).toBe('boolean');
  });

  it('shouldUseSimplifiedUI() returns a boolean', () => {
    const result = platformCapabilities.shouldUseSimplifiedUI();
    expect(typeof result).toBe('boolean');
  });

  it('getBreakpoint() returns a valid breakpoint string', () => {
    const bp = platformCapabilities.getBreakpoint();
    expect(['mobile', 'tablet', 'desktop-compact', 'desktop-full']).toContain(bp);
  });

  it('subscribe/unsubscribe pattern works', () => {
    const listener = vi.fn();
    const unsub = platformCapabilities.subscribe(listener);
    expect(typeof unsub).toBe('function');
    unsub();
    // After unsubscribe, no further calls
  });

  it('detect() returns capabilities asynchronously', async () => {
    const caps = await platformCapabilities.detect();
    expect(caps).toHaveProperty('hasWebGPU');
    expect(caps).toHaveProperty('renderMode');
    expect(caps).toHaveProperty('breakpoint');
  });

  it('get() returns a copy (not a reference)', () => {
    const a = platformCapabilities.get();
    const b = platformCapabilities.get();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});
