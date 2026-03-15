// ─── Media Types ──────────────────────────────────────────────────────────────

/** Supported media asset types in the editor. */
export type MediaType = 'audio' | 'video' | 'image' | 'document';

/**
 * A media asset imported into the project (bin item).
 * Represents a single file on disk or in shared storage.
 */
export interface MediaAsset {
  /** Unique identifier for this asset. */
  id: string;
  /** Human-readable display name (typically the file name). */
  name: string;
  /** Media type classification. */
  type: MediaType;
  /** URL or file path to the underlying media file. */
  url: string;
  /** Duration in seconds. Only set for audio/video assets. */
  duration?: number;
  /** File size in bytes. */
  size: number;
  /** Timestamp when the asset was first imported. */
  createdAt: Date;
  /** Timestamp when the asset was last modified. */
  updatedAt: Date;
  /** Arbitrary metadata key/value pairs (codec, resolution, etc.). */
  metadata: Record<string, unknown>;
}

// ─── Project Types ─────────────────────────────────────────────────────────────

/**
 * A top-level project container holding assets, a timeline, and settings.
 * Projects are the primary unit of work in the editor.
 */
export interface Project {
  /** Unique project identifier. */
  id: string;
  /** User-assigned project name. */
  name: string;
  /** Optional description or notes for the project. */
  description?: string;
  /** All media assets imported into this project's bins. */
  assets: MediaAsset[];
  /** The primary edit timeline. */
  timeline: Timeline;
  /** Project-level technical settings. */
  settings: ProjectSettings;
  /** Timestamp when the project was created. */
  createdAt: Date;
  /** Timestamp when the project was last saved. */
  updatedAt: Date;
}

/**
 * Technical settings that apply to the entire project,
 * including frame rate, resolution, and export format.
 */
/** Supported working color space identifiers for project/sequence color management. */
export type WorkingColorSpace = 'rec709' | 'rec2020' | 'dci-p3' | 'aces-cct';

/** HDR operating mode for the project/sequence. */
export type ProjectHDRMode = 'sdr' | 'hlg' | 'pq';

export interface ProjectSettings {
  /** Timeline frame rate in frames per second (e.g., 23.976, 29.97, 30, 60). */
  frameRate: number;
  /** Output resolution in pixels. */
  resolution: { width: number; height: number };
  /** Audio sample rate in Hz (e.g., 44100, 48000, 96000). */
  sampleRate: number;
  /** Default export container format. */
  exportFormat: ExportFormat;
  /** Working color space for the project timeline. Defaults to 'rec709'. */
  workingColorSpace: WorkingColorSpace;
  /** HDR mode for the project. Defaults to 'sdr'. */
  hdrMode: ProjectHDRMode;
}

/** Supported media container formats for export. */
export type ExportFormat = 'mp4' | 'mov' | 'webm' | 'mp3' | 'wav' | 'aiff';

// ─── Timeline Types ────────────────────────────────────────────────────────────

/**
 * The main edit timeline containing tracks and a playhead position.
 * Duration is derived from the longest clip across all tracks.
 */
export interface Timeline {
  /** Unique timeline identifier. */
  id: string;
  /** Total duration of the timeline in seconds. */
  duration: number;
  /** Ordered list of tracks (video, audio, effects). */
  tracks: Track[];
  /** Current playhead position in seconds. */
  playhead: number;
}

/**
 * A single track in the timeline (video, audio, or effects).
 * Tracks contain an ordered list of non-overlapping clips.
 */
export interface Track {
  /** Unique track identifier. */
  id: string;
  /** User-assigned track name (e.g., "V1", "A1", "Music"). */
  name: string;
  /** Track media type. */
  type: 'video' | 'audio' | 'effect';
  /** Clips placed on this track, ordered by startTime. */
  clips: Clip[];
  /** Whether this track's output is muted. */
  muted: boolean;
  /** Whether this track is locked from editing. */
  locked: boolean;
  /** Audio volume level (0 = silent, 1 = unity gain). */
  volume: number;
}

/**
 * A clip placed on a track, referencing a source media asset.
 * Clips have both a timeline position (startTime/endTime) and a source
 * trim range (trimStart/trimEnd) within the asset.
 */
export interface Clip {
  /** Unique clip identifier. */
  id: string;
  /** Reference to the source media asset in the project bin. */
  assetId: string;
  /** Reference to the parent track. */
  trackId: string;
  /** Start position on the timeline in seconds. */
  startTime: number;
  /** End position on the timeline in seconds. */
  endTime: number;
  /** Trim-in point within the source asset in seconds. */
  trimStart: number;
  /** Trim-out point within the source asset in seconds. */
  trimEnd: number;
  /** Effects applied to this clip. */
  effects: Effect[];
}

/**
 * An effect applied to a clip (color correction, transition, filter, etc.).
 */
export interface Effect {
  /** Unique effect instance identifier. */
  id: string;
  /** Effect type identifier (e.g., "color-correction", "cross-dissolve"). */
  type: string;
  /** Effect parameter key/value pairs. */
  params: Record<string, unknown>;
  /** Whether this effect is currently enabled. */
  enabled: boolean;
}

// ─── Platform ──────────────────────────────────────────────────────────────────

/** Supported deployment platforms for the editor application. */
export type Platform = 'web' | 'desktop-mac' | 'desktop-windows' | 'mobile-ios' | 'mobile-android';

// ─── User & Auth ──────────────────────────────────────────────────────────────

/**
 * Represents an authenticated user account.
 */
export interface User {
  /** Unique user identifier. */
  id: string;
  /** User's email address. */
  email: string;
  /** User's display name. */
  displayName: string;
  /** Optional avatar image URL. */
  avatar?: string;
  /** Subscription tier. */
  plan: 'free' | 'pro' | 'enterprise';
}

/**
 * Authentication state tracked by the application store.
 */
export interface AuthState {
  /** Currently authenticated user, or null if logged out. */
  user: User | null;
  /** Whether the user has an active authenticated session. */
  isAuthenticated: boolean;
  /** Whether an authentication request is in flight. */
  isLoading: boolean;
  /** Most recent authentication error message, or null. */
  error: string | null;
}

// ─── App State ────────────────────────────────────────────────────────────────

/**
 * Top-level application state combining auth, project, and platform data.
 */
export interface AppState {
  /** Authentication state. */
  auth: AuthState;
  /** Currently open project, or null. */
  currentProject: Project | null;
  /** All projects accessible to the user. */
  projects: Project[];
  /** Current deployment platform. */
  platform: Platform;
  /** Whether the application has network connectivity. */
  isOnline: boolean;
}
