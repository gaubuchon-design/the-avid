import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { EditorPage } from './pages/EditorPage';
import { LoginPage } from './pages/LoginPage';
import { AuthGuard } from './components/AuthGuard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingSpinner } from './components/LoadingSpinner';
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

// Suspense + ErrorBoundary wrapper for lazy panels
function LazyPanel(Component: React.LazyExoticComponent<React.ComponentType>) {
  return function WrappedPanel() {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner />}>
          <Component />
        </Suspense>
      </ErrorBoundary>
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
  return (
    <Routes>
      <Route path="/login" element={<ErrorBoundary><LoginPage /></ErrorBoundary>} />
      <Route
        path="/"
        element={
          <ErrorBoundary>
            <AuthGuard>
              <DashboardPage />
            </AuthGuard>
          </ErrorBoundary>
        }
      />
      <Route
        path="/editor/:projectId"
        element={
          <ErrorBoundary>
            <AuthGuard>
              <EditorPage />
            </AuthGuard>
          </ErrorBoundary>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
