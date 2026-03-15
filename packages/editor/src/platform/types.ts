// ═══════════════════════════════════════════════════════════════════════════
//  Platform Abstraction Layer — Type Definitions
//
//  Defines the contract that each platform shell (web, desktop, mobile)
//  must implement. This allows the shared editor UI to call into
//  platform-specific capabilities without knowing which shell hosts it.
// ═══════════════════════════════════════════════════════════════════════════

import type { EditorialSurfaceId } from '@mcua/core';

// ─── File System ─────────────────────────────────────────────────────────

export interface PlatformFileSystem {
  /** Read a text file at the given absolute path. */
  readTextFile(filePath: string): Promise<string | null>;
  /** Write a text file at the given absolute path. */
  writeTextFile(filePath: string, content: string): Promise<void>;
  /** Show a native file-open dialog and return selected paths (empty = cancelled). */
  showOpenDialog(options?: OpenDialogOptions): Promise<string[]>;
  /** Show a native file-save dialog and return the chosen path (null = cancelled). */
  showSaveDialog(options?: SaveDialogOptions): Promise<string | null>;
}

export interface OpenDialogOptions {
  title?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  multiSelections?: boolean;
  directory?: boolean;
}

export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}

// ─── Media Pipeline ──────────────────────────────────────────────────────

export interface PlatformMedia {
  /** Start an ingest job for the given file paths. Returns a job ID. */
  ingestFiles(filePaths: string[]): Promise<string>;
  /** Query running/completed media jobs. */
  listJobs(): Promise<MediaJob[]>;
  /** Cancel a running media job. */
  cancelJob(jobId: string): Promise<void>;
  /** Subscribe to job-progress updates. Returns an unsubscribe function. */
  onJobUpdate(callback: (job: MediaJob) => void): () => void;
}

export interface MediaJob {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  label: string;
  error?: string;
}

// ─── App Lifecycle ───────────────────────────────────────────────────────

export interface PlatformApp {
  /** Check for application updates (desktop only — no-op on web). */
  checkForUpdates(): Promise<void>;
  /** Install a downloaded update and restart (desktop only). */
  installUpdate(): Promise<void>;
  /** Get the current application version string. */
  getVersion(): string;
}

// ─── Combined Platform Capabilities ──────────────────────────────────────

export interface PlatformCapabilities {
  /** Which surface we are running on. */
  surface: EditorialSurfaceId;

  /**
   * File-system access. Present on desktop; absent on web/mobile
   * where browser APIs or cloud storage are used instead.
   */
  fs?: PlatformFileSystem;

  /**
   * Native media pipeline. Present on desktop; absent on web/mobile
   * where server-side processing handles media jobs.
   */
  media?: PlatformMedia;

  /**
   * App lifecycle operations. Present on desktop; absent on web.
   */
  app?: PlatformApp;

  /**
   * Whether this platform can do hardware-accelerated video playback
   * through native decoders (vs. browser <video> only).
   */
  hasNativePlayback: boolean;

  /**
   * Whether this platform can access local hardware devices
   * (serial ports, Blackmagic decks, etc.).
   */
  hasHardwareAccess: boolean;
}
