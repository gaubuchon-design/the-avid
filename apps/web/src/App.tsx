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
const AIAssistantPanel = lazy(() => import('./components/AIAssistant/AIAssistantPanel').then(m => ({ default: m.AIAssistantPanel })));
const ScriptPanel = lazy(() => import('./components/ScriptPanel/ScriptPanel').then(m => ({ default: m.ScriptPanel })));
const CollabPanel = lazy(() => import('./components/CollabPanel/CollabPanel').then(m => ({ default: m.CollabPanel })));
const ExportPanel = lazy(() => import('./components/ExportPanel/ExportPanel').then(m => ({ default: m.ExportPanel })));
const MarketplacePanel = lazy(() => import('./components/MarketplacePanel/MarketplacePanel').then(m => ({ default: m.MarketplacePanel })));
const AdminDashboard = lazy(() => import('./components/AdminDashboard/AdminDashboard').then(m => ({ default: m.AdminDashboard })));

// ─── Lazy-loaded Vertical Panels ─────────────────────────────────────────────
const RundownPanel = lazy(() => import('./components/RundownPanel/RundownPanel').then(m => ({ default: m.RundownPanel })));
const StoryScriptPanel = lazy(() => import('./components/StoryScriptPanel/StoryScriptPanel').then(m => ({ default: m.StoryScriptPanel })));
const SportsPanel = lazy(() => import('./components/SportsPanel/SportsPanel').then(m => ({ default: m.SportsPanel })));
const EVSBrowserPanel = lazy(() => import('./components/EVSBrowser/EVSBrowser').then(m => ({ default: m.EVSBrowser })));
const SportsHighlightsPanel = lazy(() => import('./components/SportsHighlights/SportsHighlights').then(m => ({ default: m.SportsHighlights })));
const SportsCamViewerPanel = lazy(() => import('./components/SportsCamViewer/SportsCamViewer').then(m => ({ default: m.SportsCamViewer })));
const PackageBuilderPanel = lazy(() => import('./components/PackageBuilder/PackageBuilderPanel').then(m => ({ default: m.PackageBuilderPanel })));
const StatsOverlayPanel = lazy(() => import('./components/StatsOverlay/StatsOverlay').then(m => ({ default: m.StatsOverlay })));
const CreatorPanel = lazy(() => import('./components/CreatorPanel/CreatorPanel').then(m => ({ default: m.CreatorPanel })));
const BrandPanel = lazy(() => import('./components/BrandPanel/BrandPanel').then(m => ({ default: m.BrandPanel })));
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
  ai: AIAssistantPanel,
  script: ScriptPanel,
  collab: CollabPanel,
  export: ExportPanel,
  marketplace: MarketplacePanel,
  admin: AdminDashboard,

  // Vertical workflow panels
  rundown: LazyPanel(RundownPanel, 'RundownPanel'),
  storyScript: LazyPanel(StoryScriptPanel, 'StoryScriptPanel'),
  sports: LazyPanel(SportsPanel, 'SportsPanel'),
  creator: LazyPanel(CreatorPanel, 'CreatorPanel'),
  brand: LazyPanel(BrandPanel, 'BrandPanel'),
  multicam: LazyPanel(MultiCamPanel, 'MultiCamPanel'),
  accessibility: LazyPanel(AccessibilityPanel, 'AccessibilityPanel'),

  // Sports production sub-panels (SP-11)
  evsBrowser: LazyPanel(EVSBrowserPanel, 'EVSBrowserPanel'),
  sportsHighlights: LazyPanel(SportsHighlightsPanel, 'SportsHighlightsPanel'),
  sportsCamViewer: LazyPanel(SportsCamViewerPanel, 'SportsCamViewerPanel'),
  packageBuilder: LazyPanel(PackageBuilderPanel, 'PackageBuilderPanel'),
  statsOverlay: LazyPanel(StatsOverlayPanel, 'StatsOverlayPanel'),
};

// ─── Workspace Presets ───────────────────────────────────────────────────────
// Defines which panels are active for each vertical workflow.

export type WorkspacePreset = 'filmtv' | 'news' | 'sports' | 'creator' | 'marketing';

export const workspacePresets: Record<WorkspacePreset, { label: string; panels: string[] }> = {
  filmtv: {
    label: 'Film / TV',
    panels: ['timeline', 'source', 'record', 'color', 'audio', 'effects', 'script', 'collab', 'multicam'],
  },
  news: {
    label: 'Broadcast News',
    panels: ['timeline', 'rundown', 'storyScript', 'source', 'record', 'audio', 'collab'],
  },
  sports: {
    label: 'Sports',
    panels: ['timeline', 'sports', 'evsBrowser', 'sportsHighlights', 'sportsCamViewer', 'packageBuilder', 'statsOverlay', 'source', 'record', 'multicam', 'audio', 'collab'],
  },
  creator: {
    label: 'Creator',
    panels: ['timeline', 'creator', 'source', 'record', 'audio', 'effects', 'accessibility'],
  },
  marketing: {
    label: 'Brand & Marketing',
    panels: ['timeline', 'brand', 'source', 'record', 'color', 'effects', 'collab'],
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
