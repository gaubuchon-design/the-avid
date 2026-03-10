// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Device Info Utilities
// ═══════════════════════════════════════════════════════════════════════════

export type DeviceType = 'desktop' | 'tablet' | 'mobile' | 'browser';

/** Detect the current device type based on available APIs and viewport. */
export function detectDeviceType(): DeviceType {
  if (typeof window === 'undefined') return 'browser';

  // Electron or Tauri desktop app
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Electron/Tauri globals not in standard lib
  if ((window as any).electronAPI || (window as any).__TAURI__) return 'desktop';

  const width = window.innerWidth;
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  if (isTouchDevice && width < 768) return 'mobile';
  if (isTouchDevice && width < 1200) return 'tablet';

  return 'browser';
}

/** Get or create a persistent unique device identifier. */
export function getDeviceId(): string {
  const key = 'avid_device_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}
