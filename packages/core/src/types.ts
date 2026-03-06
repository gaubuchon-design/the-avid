// ─── Media Types ──────────────────────────────────────────────────────────────

export type MediaType = 'audio' | 'video' | 'image' | 'document';

export interface MediaAsset {
  id: string;
  name: string;
  type: MediaType;
  url: string;
  duration?: number; // seconds, for audio/video
  size: number;      // bytes
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

// ─── Project Types ─────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description?: string;
  assets: MediaAsset[];
  timeline: Timeline;
  settings: ProjectSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectSettings {
  frameRate: number;
  resolution: { width: number; height: number };
  sampleRate: number;
  exportFormat: ExportFormat;
}

export type ExportFormat = 'mp4' | 'mov' | 'webm' | 'mp3' | 'wav' | 'aiff';

// ─── Timeline Types ────────────────────────────────────────────────────────────

export interface Timeline {
  id: string;
  duration: number; // seconds
  tracks: Track[];
  playhead: number;  // current position in seconds
}

export interface Track {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'effect';
  clips: Clip[];
  muted: boolean;
  locked: boolean;
  volume: number; // 0–1
}

export interface Clip {
  id: string;
  assetId: string;
  trackId: string;
  startTime: number;  // on timeline (seconds)
  endTime: number;
  trimStart: number;  // within asset (seconds)
  trimEnd: number;
  effects: Effect[];
}

export interface Effect {
  id: string;
  type: string;
  params: Record<string, unknown>;
  enabled: boolean;
}

// ─── Platform ──────────────────────────────────────────────────────────────────

export type Platform = 'web' | 'desktop-mac' | 'desktop-windows' | 'mobile-ios' | 'mobile-android';

// ─── User & Auth ──────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatar?: string;
  plan: 'free' | 'pro' | 'enterprise';
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

// ─── App State ────────────────────────────────────────────────────────────────

export interface AppState {
  auth: AuthState;
  currentProject: Project | null;
  projects: Project[];
  platform: Platform;
  isOnline: boolean;
}
