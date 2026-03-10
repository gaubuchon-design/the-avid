import React, { useEffect } from 'react';
import { keyboardEngine, type KeyModifier } from '../engine/KeyboardEngine';
import { isKeyboardProviderDispatchSuspended } from '../lib/keyboardProviderGate';
import { useUserSettingsStore } from '../store/userSettings.store';

/**
 * Global keyboard event provider.
 * Mounts at the app root and delegates all keydown/keyup events
 * to the KeyboardEngine singleton.
 *
 * On mount, loads the user's keyboard layout preset and applies
 * any custom bindings from their settings.
 */
export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  const keyboardLayoutId = useUserSettingsStore((s) => s.settings.keyboardLayoutId);
  const customKeyBindings = useUserSettingsStore((s) => s.settings.customKeyBindings);

  // Load keyboard layout on mount and when layout changes
  useEffect(() => {
    const layouts = keyboardEngine.getAvailableLayouts();
    const layout = layouts.find((l) => l.id === keyboardLayoutId);
    if (layout) {
      keyboardEngine.loadLayout(layout);
    }

    // Apply custom bindings on top
    for (const binding of customKeyBindings) {
      keyboardEngine.setBinding(
        binding.key,
        binding.modifiers as KeyModifier[],
        binding.action,
      );
    }
  }, [keyboardLayoutId, customKeyBindings]);

  // Global keydown/keyup delegation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isKeyboardProviderDispatchSuspended()) {
        return;
      }
      if (keyboardEngine.handleKeyDown(e)) {
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (isKeyboardProviderDispatchSuspended()) {
        return;
      }
      keyboardEngine.handleKeyUp(e);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    keyboardEngine.enable();

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return <>{children}</>;
}
