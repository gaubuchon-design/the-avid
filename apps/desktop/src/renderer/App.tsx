import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { EditorPage } from './pages/EditorPage';

export default function App() {
  const navigate = useNavigate();

  // Hook into Electron menu events
  useEffect(() => {
    window.electronAPI?.onNewProject(() => navigate('/editor/new'));
    window.electronAPI?.onOpenProject((path) => navigate(`/editor/${encodeURIComponent(path)}`));
    return () => {
      window.electronAPI?.removeAllListeners('menu:new-project');
      window.electronAPI?.removeAllListeners('menu:open-project');
    };
  }, [navigate]);

  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/editor/:projectId" element={<EditorPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
