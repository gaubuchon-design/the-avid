import { contextBridge, ipcRenderer } from 'electron';

// ─── Secure API exposed to renderer ───────────────────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion:  () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),

  // Dialogs
  openFile: (opts?: Electron.OpenDialogOptions) =>
    ipcRenderer.invoke('dialog:open-file', opts),
  saveFile: (opts?: Electron.SaveDialogOptions) =>
    ipcRenderer.invoke('dialog:save-file', opts),

  // Menu event listeners
  onNewProject:  (cb: () => void)          => ipcRenderer.on('menu:new-project', cb),
  onOpenProject: (cb: (path: string) => void) => ipcRenderer.on('menu:open-project', (_e, p) => cb(p)),
  onSave:        (cb: () => void)          => ipcRenderer.on('menu:save', cb),
  onExport:      (cb: () => void)          => ipcRenderer.on('menu:export', cb),

  // Cleanup
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
});

// ─── TypeScript type declaration (for renderer) ────────────────────────────────
export type ElectronAPI = typeof window.electronAPI;
