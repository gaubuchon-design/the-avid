import React, { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthGuard } from './components/AuthGuard';
import { ErrorBoundary, PageErrorBoundary, PanelErrorBoundary } from './components/ErrorBoundary';
import { OfflineBanner } from './components/OfflineBanner';
import { useSettingsEffects } from './hooks/useSettingsEffects';
import { KeyboardProvider } from './components/KeyboardProvider';
import { LoadingSpinner } from './components/LoadingSpinner';
import { MainLayout } from './layouts/MainLayout';
import { AuthLayout } from './layouts/AuthLayout';

// ─── Route-Level Code Splitting ──────────────────────────────────────────────
// All page components are lazy-loaded to reduce initial bundle size.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const EditorPage = lazy(() => import('./pages/EditorPage').then(m => ({ default: m.EditorPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage').then(m => ({ default: m.RegisterPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));

// ─── Panel-Level Code Splitting ─────────────────────────────────────────────
// Core editing panels used in the panel registry are lazy-loaded individually.
const TimelinePanel = lazy(() => import('./components/TimelinePanel/TimelinePanel').then(m => ({ default: m.TimelinePanel })));
const SourceMonitor = lazy(() => import('./components/SourceMonitor/SourceMonitor').then(m => ({ default: m.SourceMonitor })));
const RecordMonitor = lazy(() => import('./components/RecordMonitor/RecordMonitor').then(m => ({ default: m.RecordMonitor })));
const ColorPanel = lazy(() => import('./components/ColorPanel/ColorPanel').then(m => ({ default: m.ColorPanel })));
const AudioMixer = lazy(() => import('./components/AudioMixer/AudioMixer').then(m => ({ default: m.AudioMixer })));
const EffectsPanel = lazy(() => import('./components/EffectsPanel/EffectsPanel').then(m => ({ default: m.EffectsPanel })));
const ScriptPanel = lazy(() => import('./components/ScriptPanel/ScriptPanel').then(m => ({ default: m.ScriptPanel })));
const ExportPanel = lazy(() => import('./components/ExportPanel/ExportPanel').then(m => ({ default: m.ExportPanel })));

// ─── Lazy-loaded Panels ─────────────────────────────────────────────────────
const MultiCamPanel = lazy(() => import('./components/MultiCamPanel/MultiCamPanel').then(m => ({ default: m.MultiCamPanel })));
const AccessibilityPanel = lazy(() => import('./components/AccessibilityPanel/AccessibilityPanel').then(m => ({ default: m.AccessibilityPanel })));

// Suspense + PanelErrorBoundary wrapper for lazy panels
// Each panel is isolated -- one failure does not cascade to the rest of the app.
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

// ─── Panel Registry ──────────────────────────────────────────────────────────
// Maps panel identifiers to their component implementations.

export const panelRegistry: Record<string, React.ComponentType> = {
  // Core editing panels
  timeline: TimelinePanel,
  source: SourceMonitor,
  record: RecordMonitor,
  color: ColorPanel,
  audio: AudioMixer,
  effects: EffectsPanel,
  script: ScriptPanel,
  export: ExportPanel,

  // Utility panels
  multicam: LazyPanel(MultiCamPanel, 'MultiCamPanel'),
  accessibility: LazyPanel(AccessibilityPanel, 'AccessibilityPanel'),
};

// ─── Default Workspace ───────────────────────────────────────────────────────
// A single default workspace that includes all core editing panels.

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
    <KeyboardProvider>
      {/* Global offline banner -- renders at top when user goes offline */}
      <OfflineBanner />

      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          {/* ── Auth Routes (no auth required) ────────────────────────── */}
          <Route element={<ErrorBoundary level="page"><AuthLayout /></ErrorBoundary>}>
            <Route path="/login" element={<PageErrorBoundary pageName="Login"><LoginPage /></PageErrorBoundary>} />
            <Route path="/register" element={<PageErrorBoundary pageName="Register"><RegisterPage /></PageErrorBoundary>} />
          </Route>

          {/* ── Authenticated Dashboard Routes ────────────────────────── */}
          <Route element={<ErrorBoundary level="page"><AuthGuard><MainLayout /></AuthGuard></ErrorBoundary>}>
            <Route path="/" element={<PageErrorBoundary pageName="Dashboard"><DashboardPage /></PageErrorBoundary>} />
            <Route path="/settings" element={<PageErrorBoundary pageName="Settings"><SettingsPage /></PageErrorBoundary>} />
          </Route>

          {/* ── Editor (full-bleed, own layout) ───────────────────────── */}
          <Route
            path="/editor/:projectId"
            element={
              <ErrorBoundary level="page">
                <AuthGuard>
                  <PageErrorBoundary pageName="Editor">
                    <EditorPage />
                  </PageErrorBoundary>
                </AuthGuard>
              </ErrorBoundary>
            }
          />
          {/* Alias: /project/:id redirects to editor */}
          <Route
            path="/project/:projectId"
            element={
              <ErrorBoundary level="page">
                <AuthGuard>
                  <PageErrorBoundary pageName="Editor">
                    <EditorPage />
                  </PageErrorBoundary>
                </AuthGuard>
              </ErrorBoundary>
            }
          />

          {/* ── 404 Catch-all ─────────────────────────────────────────── */}
          <Route path="*" element={<Suspense fallback={<LoadingSpinner />}><NotFoundPage /></Suspense>} />
        </Routes>
      </Suspense>
    </KeyboardProvider>
  );
}
