import React, { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { EditorPage } from './pages/EditorPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AuthGuard } from './components/AuthGuard';
import { ErrorBoundary, PageErrorBoundary, PanelErrorBoundary } from './components/ErrorBoundary';
import { OfflineBanner } from './components/OfflineBanner';
import { useSettingsEffects } from './hooks/useSettingsEffects';
import { KeyboardProvider } from './components/KeyboardProvider';
import { LoadingSpinner } from './components/LoadingSpinner';
import { MainLayout } from './layouts/MainLayout';
import { AuthLayout } from './layouts/AuthLayout';
import { TimelinePanel } from './components/TimelinePanel/TimelinePanel';
import { SourceMonitor } from './components/SourceMonitor/SourceMonitor';
import { RecordMonitor } from './components/RecordMonitor/RecordMonitor';
import { ColorPanel } from './components/ColorPanel/ColorPanel';
import { AudioMixer } from './components/AudioMixer/AudioMixer';
import { EffectsPanel } from './components/EffectsPanel/EffectsPanel';
import { AIAssistantPanel } from './components/AIAssistant/AIAssistantPanel';
import { ScriptPanel } from './components/ScriptPanel/ScriptPanel';
import { CollabPanel } from './components/CollabPanel/CollabPanel';
import { ExportPanel } from './components/ExportPanel/ExportPanel';
import { MarketplacePanel } from './components/MarketplacePanel/MarketplacePanel';
import { AdminDashboard } from './components/AdminDashboard/AdminDashboard';

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
function LazyPanel(Component: React.LazyExoticComponent<React.ComponentType>) {
  return function WrappedPanel() {
    return (
      <PanelErrorBoundary panelName="LazyPanel">
        <Suspense fallback={<LoadingSpinner />}>
          <Component />
        </Suspense>
      </PanelErrorBoundary>
    );
  };
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
  rundown: LazyPanel(RundownPanel),
  storyScript: LazyPanel(StoryScriptPanel),
  sports: LazyPanel(SportsPanel),
  creator: LazyPanel(CreatorPanel),
  brand: LazyPanel(BrandPanel),
  multicam: LazyPanel(MultiCamPanel),
  accessibility: LazyPanel(AccessibilityPanel),

  // Sports production sub-panels (SP-11)
  evsBrowser: LazyPanel(EVSBrowserPanel),
  sportsHighlights: LazyPanel(SportsHighlightsPanel),
  sportsCamViewer: LazyPanel(SportsCamViewerPanel),
  packageBuilder: LazyPanel(PackageBuilderPanel),
  statsOverlay: LazyPanel(StatsOverlayPanel),
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
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </KeyboardProvider>
  );
}
