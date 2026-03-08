import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { hydrateProject } from '@mcua/core';
import { DashboardPage } from '../../../web/src/pages/DashboardPage';
import { EditorPage } from '../../../web/src/pages/EditorPage';
import { saveProjectToRepository } from '../../../web/src/lib/projectRepository';

export default function App() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!window.electronAPI) {
      return;
    }

    const handleOpenProject = async (filePath: string) => {
      try {
        const serialized = await window.electronAPI?.readTextFile(filePath);
        if (!serialized) {
          return;
        }
        const project = await saveProjectToRepository(hydrateProject(JSON.parse(serialized)));
        navigate(`/editor/${project.id}`);
      } catch (error) {
        console.error('Failed to open project file', error);
      }
    };

    const disposeNewProject = window.electronAPI.onNewProject(() => navigate('/editor/new'));
    const disposeOpenProject = window.electronAPI.onOpenProject(handleOpenProject);

    return () => {
      disposeNewProject();
      disposeOpenProject();
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
