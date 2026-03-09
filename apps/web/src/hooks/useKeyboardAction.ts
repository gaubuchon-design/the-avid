import { useEffect } from 'react';
import { keyboardEngine } from '../engine/KeyboardEngine';

/**
 * Register an action handler with the global KeyboardEngine.
 * Automatically cleans up on component unmount.
 *
 * @param actionId - Action identifier matching a KeyBinding action (e.g. 'transport.playForward')
 * @param handler - Function to call when the key binding is triggered
 * @param deps - React dependency array for the handler
 */
export function useKeyboardAction(
  actionId: string,
  handler: () => void,
  deps: React.DependencyList = [],
) {
  useEffect(() => {
    keyboardEngine.registerAction(actionId, handler);
    return () => {
      keyboardEngine.unregisterAction(actionId);
    };
  }, deps);
}
