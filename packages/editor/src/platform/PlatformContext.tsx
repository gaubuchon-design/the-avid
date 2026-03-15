// ═══════════════════════════════════════════════════════════════════════════
//  Platform Context — React context + hook for platform capabilities
//
//  Each app shell wraps its component tree in <PlatformProvider> with
//  the capabilities it supports. Shared editor components access
//  platform features through the usePlatform() hook.
// ═══════════════════════════════════════════════════════════════════════════

import React, { createContext, useContext, type ReactNode } from 'react';
import type { PlatformCapabilities } from './types';

// ─── Default (browser) capabilities ──────────────────────────────────────

const browserDefaults: PlatformCapabilities = {
  surface: 'browser',
  hasNativePlayback: false,
  hasHardwareAccess: false,
};

// ─── Context ─────────────────────────────────────────────────────────────

const PlatformContext = createContext<PlatformCapabilities>(browserDefaults);

// ─── Provider ────────────────────────────────────────────────────────────

export interface PlatformProviderProps {
  capabilities: PlatformCapabilities;
  children: ReactNode;
}

export function PlatformProvider({ capabilities, children }: PlatformProviderProps) {
  return (
    <PlatformContext.Provider value={capabilities}>
      {children}
    </PlatformContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────

/** Access the current platform's capabilities from any shared editor component. */
export function usePlatform(): PlatformCapabilities {
  return useContext(PlatformContext);
}

/** Returns true when running inside the desktop (Electron) shell. */
export function useIsDesktop(): boolean {
  return useContext(PlatformContext).surface === 'desktop';
}

/** Returns true when running inside the web (browser) shell. */
export function useIsWeb(): boolean {
  return useContext(PlatformContext).surface === 'browser';
}
