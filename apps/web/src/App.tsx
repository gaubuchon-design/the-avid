import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { EditorPage } from './pages/EditorPage';
import { LoginPage } from './pages/LoginPage';
import { AuthGuard } from './components/AuthGuard';
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

// ─── Panel Registry ──────────────────────────────────────────────────────────
// Maps panel identifiers to their component implementations.

export const panelRegistry: Record<string, React.ComponentType> = {
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
};

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <AuthGuard>
            <DashboardPage />
          </AuthGuard>
        }
      />
      <Route
        path="/editor/:projectId"
        element={
          <AuthGuard>
            <EditorPage />
          </AuthGuard>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
