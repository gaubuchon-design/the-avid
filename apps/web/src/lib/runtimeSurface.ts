import type { EditorialSurfaceId } from '@mcua/core';

export function resolveRuntimeSurface(): EditorialSurfaceId {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return 'desktop';
  }
  return 'browser';
}
