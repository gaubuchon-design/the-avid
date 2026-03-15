// =============================================================================
//  THE AVID — Electron Preload Script (Codec IPC)
//  Exposes safe IPC bridge for codec operations from renderer to main process.
//  Include this in your Electron preload script.
//
//  Usage in electron preload.ts:
//    import '@avid/media/electron/preload';
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require('electron');

import { CODEC_IPC_NAMESPACE } from './ipc-channels';

/**
 * Expose a safe codec IPC bridge to the renderer process.
 * Only allows channels within the avid:codec namespace.
 */
contextBridge.exposeInMainWorld('electronCodec', {
  invoke: (channel: string, ...args: unknown[]) => {
    if (!channel.startsWith(CODEC_IPC_NAMESPACE)) {
      throw new Error(`Invalid codec IPC channel: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  on: (channel: string, listener: (...args: unknown[]) => void) => {
    if (!channel.startsWith(CODEC_IPC_NAMESPACE)) {
      throw new Error(`Invalid codec IPC channel: ${channel}`);
    }
    ipcRenderer.on(channel, listener);
  },

  off: (channel: string, listener: (...args: unknown[]) => void) => {
    if (!channel.startsWith(CODEC_IPC_NAMESPACE)) {
      throw new Error(`Invalid codec IPC channel: ${channel}`);
    }
    ipcRenderer.removeListener(channel, listener);
  },
});
