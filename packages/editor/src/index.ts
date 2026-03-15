// ═══════════════════════════════════════════════════════════════════════════
//  @mcua/editor — Shared Editor Package
//
//  This is the common editorial UI shared across all platform shells
//  (web, desktop, mobile). Each shell wraps this editor in its own
//  <PlatformProvider> to inject platform-specific capabilities.
//
//  Import convention:
//    import { EditorPage, useEditorStore } from '@mcua/editor';
//    import { usePlatform } from '@mcua/editor/platform';
//    import { AudioMixer } from '@mcua/editor/components/AudioMixer/AudioMixer';
// ═══════════════════════════════════════════════════════════════════════════

// ─── Platform Abstraction ────────────────────────────────────────────────
export {
  PlatformProvider,
  usePlatform,
  useIsDesktop,
  useIsWeb,
} from './platform';
export type {
  PlatformCapabilities,
  PlatformFileSystem,
  PlatformMedia,
  PlatformApp,
  MediaJob,
  PlatformProviderProps,
} from './platform';

// ─── Pages ───────────────────────────────────────────────────────────────
export { DashboardPage } from './pages/DashboardPage';
export { EditorPage } from './pages/EditorPage';
export { LoginPage } from './pages/LoginPage';
export { RegisterPage } from './pages/RegisterPage';
export { SettingsPage } from './pages/SettingsPage';
export { NotFoundPage } from './pages/NotFoundPage';

// ─── Layouts ─────────────────────────────────────────────────────────────
export { MainLayout } from './layouts/MainLayout';
export { AuthLayout } from './layouts/AuthLayout';

// ─── Stores ──────────────────────────────────────────────────────────────
export { useEditorStore } from './store/editor.store';
export { usePlayerStore } from './store/player.store';
export { useAudioStore } from './store/audio.store';
export { useColorStore } from './store/color.store';
export { useEffectsStore } from './store/effects.store';
export { useDeliverStore } from './store/deliver.store';
export { useMediaStore } from './store/media.store';
export { useAuthStore } from './store/auth.store';
export { useCollabStore } from './store/collab.store';
export { useUserSettingsStore } from './store/userSettings.store';
export { useTrackingStore } from './store/tracking.store';
export { useTitleStore } from './store/title.store';
export { useAIStore } from './store/ai.store';
export { useProToolsStore } from './store/protools.store';
export { useNexisStore } from './store/nexis.store';

// ─── Shared Components ───────────────────────────────────────────────────
export { ErrorBoundary, PageErrorBoundary, PanelErrorBoundary } from './components/ErrorBoundary';
export { LoadingSpinner } from './components/LoadingSpinner';
export { OfflineBanner } from './components/OfflineBanner';
export { KeyboardProvider } from './components/KeyboardProvider';

// ─── Hooks ───────────────────────────────────────────────────────────────
export { useSettingsEffects } from './hooks/useSettingsEffects';
export { useGlobalKeyboard } from './hooks/useGlobalKeyboard';
export { useKeyboardShortcut } from './hooks/useKeyboardShortcut';
export { useKeyboardAction } from './hooks/useKeyboardAction';
export { useDebounce } from './hooks/useDebounce';
export { useThrottle } from './hooks/useThrottle';
export { useOnlineStatus } from './hooks/useOnlineStatus';
export { useMediaQuery } from './hooks/useMediaQuery';
export { useUndoRedo } from './hooks/useUndoRedo';

// ─── Lib / Utilities ────────────────────────────────────────────────────
export { resolveRuntimeSurface } from './lib/runtimeSurface';
export { resolveApiBaseUrl, resolveApiUrl, isDevelopmentEnvironment } from './lib/runtimeEnvironment';
export { saveProjectToRepository } from './lib/projectRepository';
// Timecode utilities are available via deep import: @mcua/editor/lib/timecode
