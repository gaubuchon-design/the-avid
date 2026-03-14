import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { detectDeviceType, getDeviceId, type DeviceType } from '../lib/deviceInfo';

// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- User Settings Store
// ═══════════════════════════════════════════════════════════════════════════
//
// Comprehensive per-user settings with localStorage persistence.
// Settings are keyed by userId so multiple local users get isolated prefs.

// ─── Types ──────────────────────────────────────────────────────────────────

export type ThemeMode = 'dark' | 'light' | 'system';
export type TimelineUnit = 'timecode' | 'frames' | 'seconds' | 'feet+frames';
export type WaveformStyle = 'filled' | 'outline' | 'bars' | 'gradient';
export type ClipColorMode = 'track' | 'label' | 'codec';
export type ProxyQuality = '360p' | '480p' | '720p' | '1080p';

export interface SerializedKeyBinding {
  key: string;
  modifiers: string[];
  action: string;
}

export interface UserSettings {
  // ── General ──
  displayName: string;
  timezone: string;
  locale: string;
  defaultWorkspace: string;

  // ── Appearance ──
  theme: ThemeMode;
  accentColor: string;
  uiScale: number;

  // ── Timeline ──
  timelineUnit: TimelineUnit;
  timelineTrackHeight: number;
  timelineScrollBehavior: 'smooth' | 'snap';
  showThumbnailsOnTimeline: boolean;
  clipColorMode: ClipColorMode;

  // ── Audio ──
  waveformStyle: WaveformStyle;
  audioPeakMeterPosition: 'left' | 'right' | 'bottom';
  showAudioDB: boolean;
  defaultAudioFade: number;

  // ── Keyboard ──
  keyboardLayoutId: string;
  customKeyBindings: SerializedKeyBinding[];

  // ── AI ──
  aiAggressionLevel: 1 | 2 | 3 | 4 | 5;
  aiAutoSuggest: boolean;
  aiModel: string;

  // ── Media / Proxy ──
  proxyQuality: ProxyQuality;
  autoSaveInterval: number;

  // ── Device ──
  deviceType: DeviceType;
  deviceId: string;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  // General
  displayName: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  locale: navigator.language || 'en',
  defaultWorkspace: 'default',

  // Appearance
  theme: 'dark',
  accentColor: '#6d4cfa',
  uiScale: 1.0,

  // Timeline
  timelineUnit: 'timecode',
  timelineTrackHeight: 38,
  timelineScrollBehavior: 'smooth',
  showThumbnailsOnTimeline: true,
  clipColorMode: 'track',

  // Audio
  waveformStyle: 'filled',
  audioPeakMeterPosition: 'right',
  showAudioDB: true,
  defaultAudioFade: 0,

  // Keyboard
  keyboardLayoutId: 'media-composer',
  customKeyBindings: [],

  // AI
  aiAggressionLevel: 2,
  aiAutoSuggest: true,
  aiModel: 'default',

  // Media / Proxy
  proxyQuality: '720p',
  autoSaveInterval: 60,

  // Device
  deviceType: detectDeviceType(),
  deviceId: typeof window !== 'undefined' ? getDeviceId() : '',
};

// ─── Store ──────────────────────────────────────────────────────────────────

interface UserSettingsState {
  settings: UserSettings;
  lastSyncedAt: number | null;
  _userId: string | null;
}

interface UserSettingsActions {
  /** Initialize settings for a user (call on login). */
  initForUser: (userId: string, displayName?: string) => void;

  /** Update a single setting. */
  updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;

  /** Batch-update multiple settings. */
  updateSettings: (partial: Partial<UserSettings>) => void;

  /** Reset all settings to defaults. */
  resetToDefaults: () => void;

  /** Reset a specific section to its defaults. */
  resetSection: (section: 'general' | 'appearance' | 'timeline' | 'audio' | 'keyboard' | 'ai' | 'media') => void;
}

const SECTION_KEYS: Record<string, (keyof UserSettings)[]> = {
  general: ['displayName', 'timezone', 'locale', 'defaultWorkspace'],
  appearance: ['theme', 'accentColor', 'uiScale'],
  timeline: ['timelineUnit', 'timelineTrackHeight', 'timelineScrollBehavior', 'showThumbnailsOnTimeline', 'clipColorMode'],
  audio: ['waveformStyle', 'audioPeakMeterPosition', 'showAudioDB', 'defaultAudioFade'],
  keyboard: ['keyboardLayoutId', 'customKeyBindings'],
  ai: ['aiAggressionLevel', 'aiAutoSuggest', 'aiModel'],
  media: ['proxyQuality', 'autoSaveInterval'],
};

export const useUserSettingsStore = create<UserSettingsState & UserSettingsActions>()(
  persist(
    immer((set) => ({
      settings: { ...DEFAULT_USER_SETTINGS },
      lastSyncedAt: null,
      _userId: null,

      initForUser: (userId: string, displayName?: string) => {
        set((s) => {
          s._userId = userId;
          // Merge device info on every init
          s.settings.deviceType = detectDeviceType();
          s.settings.deviceId = typeof window !== 'undefined' ? getDeviceId() : '';
          if (displayName && !s.settings.displayName) {
            s.settings.displayName = displayName;
          }
        });
      },

      updateSetting: (key, value) => {
        set((s) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic key-value assignment
          (s.settings as any)[key] = value;
        });
      },

      updateSettings: (partial) => {
        set((s) => {
          Object.assign(s.settings, partial);
        });
      },

      resetToDefaults: () => {
        set((s) => {
          const userId = s._userId;
          s.settings = { ...DEFAULT_USER_SETTINGS };
          s._userId = userId;
        });
      },

      resetSection: (section) => {
        const keys = SECTION_KEYS[section];
        if (!keys) return;
        set((s) => {
          for (const key of keys) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic key reset from defaults
            (s.settings as any)[key] = (DEFAULT_USER_SETTINGS as any)[key];
          }
        });
      },
    })),
    {
      name: 'avid-user-settings',
      partialize: (state) => ({
        settings: state.settings,
        lastSyncedAt: state.lastSyncedAt,
        _userId: state._userId,
      }),
    }
  )
);
