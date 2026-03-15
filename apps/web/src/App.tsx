import React, { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import {
  ErrorBoundary,
  PageErrorBoundary,
  PanelErrorBoundary,
  OfflineBanner,
  KeyboardProvider,
  LoadingSpinner,
  useSettingsEffects,
  MainLayout,
  AuthLayout,
  PlatformProvider,
} from '@mcua/editor';
import type { PlatformCapabilities } from '@mcua/editor';

// ─── Browser Platform Capabilities ────────────────────────────────────────
const browserCapabilities: PlatformCapabilities = {
  surface: 'browser',
  hasNativePlayback: false,
  hasHardwareAccess: false,
};

// ─── Route-Level Code Splitting ──────────────────────────────────────────
const DashboardPage = lazy(() => import('@mcua/editor/pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const EditorPage = lazy(() => import('@mcua/editor/pages/EditorPage').then(m => ({ default: m.EditorPage })));
const LoginPage = lazy(() => import('@mcua/editor/pages/LoginPage').then(m => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('@mcua/editor/pages/RegisterPage').then(m => ({ default: m.RegisterPage })));
const SettingsPage = lazy(() => import('@mcua/editor/pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const NotFoundPage = lazy(() => import('@mcua/editor/pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));

// ─── Panel-Level Code Splitting ─────────────────────────────────────────
const TimelinePanel = lazy(() => import('@mcua/editor/components/TimelinePanel/TimelinePanel').then(m => ({ default: m.TimelinePanel })));
const SourceMonitor = lazy(() => import('@mcua/editor/components/SourceMonitor/SourceMonitor').then(m => ({ default: m.SourceMonitor })));
const RecordMonitor = lazy(() => import('@mcua/editor/components/RecordMonitor/RecordMonitor').then(m => ({ default: m.RecordMonitor })));
const ColorPanel = lazy(() => import('@mcua/editor/components/ColorPanel/ColorPanel').then(m => ({ default: m.ColorPanel })));
const AudioMixer = lazy(() => import('@mcua/editor/components/AudioMixer/AudioMixer').then(m => ({ default: m.AudioMixer })));
const EffectsPanel = lazy(() => import('@mcua/editor/components/EffectsPanel/EffectsPanel').then(m => ({ default: m.EffectsPanel })));
const ScriptPanel = lazy(() => import('@mcua/editor/components/ScriptPanel/ScriptPanel').then(m => ({ default: m.ScriptPanel })));
const ExportPanel = lazy(() => import('@mcua/editor/components/ExportPanel/ExportPanel').then(m => ({ default: m.ExportPanel })));
const MultiCamPanel = lazy(() => import('@mcua/editor/components/MultiCamPanel/MultiCamPanel').then(m => ({ default: m.MultiCamPanel })));
const AccessibilityPanel = lazy(() => import('@mcua/editor/components/AccessibilityPanel/AccessibilityPanel').then(m => ({ default: m.AccessibilityPanel })));

// Suspense + PanelErrorBoundary wrapper for lazy panels
function LazyPanel(LazyComponent: React.LazyExoticComponent<React.ComponentType>, displayName?: string): React.ComponentType {
  function WrappedPanel() {
    return (
      <PanelErrorBoundary panelName="LazyPanel">
        <Suspense fallback={<LoadingSpinner />}>
          <LazyComponent />
        </Suspense>
      </PanelErrorBoundary>
    );
  }
  WrappedPanel.displayName = displayName ?? 'LazyPanel';
  return WrappedPanel;
}

// ─── Panel Registry ──────────────────────────────────────────────────────
export const panelRegistry: Record<string, React.ComponentType> = {
  timeline: TimelinePanel,
  source: SourceMonitor,
  record: RecordMonitor,
  color: ColorPanel,
  audio: AudioMixer,
  effects: EffectsPanel,
  script: ScriptPanel,
  export: ExportPanel,
  multicam: LazyPanel(MultiCamPanel, 'MultiCamPanel'),
  accessibility: LazyPanel(AccessibilityPanel, 'AccessibilityPanel'),
};

// ─── Default Workspace ───────────────────────────────────────────────────
export type WorkspacePreset = 'default';

export const workspacePresets: Record<WorkspacePreset, { label: string; panels: string[] }> = {
  default: {
    label: 'Edit',
    panels: ['timeline', 'source', 'record', 'color', 'audio', 'effects'],
  },
};

export default function App() {
  useSettingsEffects();

  return (
    <PlatformProvider capabilities={browserCapabilities}>
      <KeyboardProvider>
        <OfflineBanner />

        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            {/* ── Auth Routes (no auth required) ────────────────────────── */}
            <Route element={<ErrorBoundary level="page"><AuthLayout /></ErrorBoundary>}>
              <Route path="/login" element={<PageErrorBoundary pageName="Login"><LoginPage /></PageErrorBoundary>} />
              <Route path="/register" element={<PageErrorBoundary pageName="Register"><RegisterPage /></PageErrorBoundary>} />
            </Route>

            {/* ── Authenticated Dashboard Routes ────────────────────────── */}
            <Route element={<ErrorBoundary level="page"><MainLayout /></ErrorBoundary>}>
              <Route path="/" element={<PageErrorBoundary pageName="Dashboard"><DashboardPage /></PageErrorBoundary>} />
              <Route path="/settings" element={<PageErrorBoundary pageName="Settings"><SettingsPage /></PageErrorBoundary>} />
            </Route>

            {/* ── Editor (full-bleed, own layout) ───────────────────────── */}
            <Route
              path="/editor/:projectId"
              element={
                <ErrorBoundary level="page">
                  <PageErrorBoundary pageName="Editor">
                    <EditorPage />
                  </PageErrorBoundary>
                </ErrorBoundary>
              }
            />
            <Route
              path="/project/:projectId"
              element={
                <ErrorBoundary level="page">
                  <PageErrorBoundary pageName="Editor">
                    <EditorPage />
                  </PageErrorBoundary>
                </ErrorBoundary>
              }
            />

            {/* ── 404 Catch-all ─────────────────────────────────────────── */}
            <Route path="*" element={<Suspense fallback={<LoadingSpinner />}><NotFoundPage /></Suspense>} />
          </Routes>
        </Suspense>
      </KeyboardProvider>
    </PlatformProvider>
  );
}
