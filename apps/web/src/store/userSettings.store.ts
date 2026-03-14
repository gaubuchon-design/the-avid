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
export type TrimViewPreference = 'preserve-last' | 'small' | 'big';
export type KeyboardConflictPolicy = 'warn' | 'replace';
export type ButtonAssignmentMode = 'button-to-button' | 'menu-to-button';
export type EditorialIconStyle = 'avid' | 'text';
export type TranscriptionProvider = 'local-faster-whisper' | 'cloud-openai-compatible';
export type TranslationProvider = 'local-runtime' | 'cloud-openai-compatible';

export interface SerializedKeyBinding {
  key: string;
  modifiers: string[];
  action: string;
}

export interface SerializedButtonAssignment {
  palette: 'source-monitor' | 'record-monitor' | 'tool-palette' | 'keyboard';
  slotId: string;
  commandId: string;
  label?: string;
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
  keyboardConflictPolicy: KeyboardConflictPolicy;

  // ── Editorial ──
  preferAvidEditorialIcons: boolean;
  editorialIconStyle: EditorialIconStyle;
  trimViewPreference: TrimViewPreference;
  trimRulerExitsTrim: boolean;
  showTrimCountersInMonitorHeaders: boolean;
  buttonAssignmentMode: ButtonAssignmentMode;
  buttonAssignments: SerializedButtonAssignment[];

  // ── AI ──
  aiAggressionLevel: 1 | 2 | 3 | 4 | 5;
  aiAutoSuggest: boolean;
  aiModel: string;
  transcriptionProvider: TranscriptionProvider;
  translationProvider: TranslationProvider;
  transcriptionLanguageMode: 'auto' | 'manual';
  transcriptionLanguage: string;
  transcriptionTargetLanguage: string;
  enableTranscriptionDiarization: boolean;
  enableSpeakerIdentification: boolean;

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
  defaultWorkspace: 'filmtv',

  // Appearance
  theme: 'dark',
  accentColor: '#81818d',
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
  keyboardLayoutId: 'avid-media-composer',
  customKeyBindings: [],
  keyboardConflictPolicy: 'warn',

  // Editorial
  preferAvidEditorialIcons: true,
  editorialIconStyle: 'avid',
  trimViewPreference: 'preserve-last',
  trimRulerExitsTrim: true,
  showTrimCountersInMonitorHeaders: true,
  buttonAssignmentMode: 'button-to-button',
  buttonAssignments: [],

  // AI
  aiAggressionLevel: 2,
  aiAutoSuggest: true,
  aiModel: 'default',
  transcriptionProvider: 'local-faster-whisper',
  translationProvider: 'local-runtime',
  transcriptionLanguageMode: 'auto',
  transcriptionLanguage: 'en',
  transcriptionTargetLanguage: 'en',
  enableTranscriptionDiarization: true,
  enableSpeakerIdentification: false,

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
  resetSection: (section: 'general' | 'appearance' | 'timeline' | 'audio' | 'keyboard' | 'editorial' | 'ai' | 'media') => void;
}

const SECTION_KEYS: Record<string, (keyof UserSettings)[]> = {
  general: ['displayName', 'timezone', 'locale', 'defaultWorkspace'],
  appearance: ['theme', 'accentColor', 'uiScale'],
  timeline: ['timelineUnit', 'timelineTrackHeight', 'timelineScrollBehavior', 'showThumbnailsOnTimeline', 'clipColorMode'],
  audio: ['waveformStyle', 'audioPeakMeterPosition', 'showAudioDB', 'defaultAudioFade'],
  keyboard: ['keyboardLayoutId', 'customKeyBindings', 'keyboardConflictPolicy'],
  editorial: [
    'preferAvidEditorialIcons',
    'editorialIconStyle',
    'trimViewPreference',
    'trimRulerExitsTrim',
    'showTrimCountersInMonitorHeaders',
    'buttonAssignmentMode',
    'buttonAssignments',
  ],
  ai: [
    'aiAggressionLevel',
    'aiAutoSuggest',
    'aiModel',
    'transcriptionProvider',
    'translationProvider',
    'transcriptionLanguageMode',
    'transcriptionLanguage',
    'transcriptionTargetLanguage',
    'enableTranscriptionDiarization',
    'enableSpeakerIdentification',
  ],
  media: ['proxyQuality', 'autoSaveInterval'],
};

export const USER_SETTINGS_STORAGE_VERSION = 2;

interface PersistedUserSettingsState {
  settings?: Partial<UserSettings>;
  lastSyncedAt?: number | null;
  _userId?: string | null;
}

export function migrateUserSettingsSnapshot(
  persistedState: PersistedUserSettingsState | undefined,
): PersistedUserSettingsState {
  const mergedSettings: UserSettings = {
    ...DEFAULT_USER_SETTINGS,
    ...(persistedState?.settings ?? {}),
  };

  if (mergedSettings.keyboardLayoutId === 'media-composer') {
    mergedSettings.keyboardLayoutId = 'avid-media-composer';
  }

  return {
    settings: mergedSettings,
    lastSyncedAt: persistedState?.lastSyncedAt ?? null,
    _userId: persistedState?._userId ?? null,
  };
}

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
      version: USER_SETTINGS_STORAGE_VERSION,
      migrate: (persistedState) => migrateUserSettingsSnapshot(
        persistedState as PersistedUserSettingsState | undefined,
      ),
      partialize: (state) => ({
        settings: state.settings,
        lastSyncedAt: state.lastSyncedAt,
        _userId: state._userId,
      }),
    }
  )
);
