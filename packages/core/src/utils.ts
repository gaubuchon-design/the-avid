// ─── Time Utilities ────────────────────────────────────────────────────────────

/**
 * Format seconds into HH:MM:SS:FF (timecode with frames)
 */
export function formatTimecode(seconds: number, frameRate = 30): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00:00:00';
  if (!Number.isFinite(frameRate) || frameRate <= 0) return '00:00:00:00';
  const nominalRate = Math.round(frameRate);
  const totalFrames = Math.floor(seconds * frameRate);
  const frames = totalFrames % nominalRate;
  const totalSeconds = Math.floor(totalFrames / nominalRate);
  const secs = totalSeconds % 60;
  const mins = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  return [
    hours.toString().padStart(2, '0'),
    mins.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0'),
    frames.toString().padStart(2, '0'),
  ].join(':');
}

/**
 * Format bytes into a human-readable string
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0.0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Generate a prefixed UUID v4.
 * When called without arguments, returns a plain UUID.
 * When called with a prefix string, returns `prefix-uuid`.
 */
export function generateId(prefix?: string): string {
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
  return prefix ? `${prefix}-${uuid}` : uuid;
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Deep clone an object.
 * Uses structuredClone when available (handles Date, RegExp, etc.),
 * falls back to JSON round-trip for simple objects.
 */
export function deepClone<T>(obj: T): T {
  if (typeof globalThis !== 'undefined' && typeof (globalThis as any).structuredClone === 'function') {
    return (globalThis as any).structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
