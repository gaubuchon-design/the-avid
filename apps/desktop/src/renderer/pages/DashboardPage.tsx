import { useNavigate } from 'react-router-dom';

export function DashboardPage() {
  const navigate = useNavigate();

  const handleOpenProject = async () => {
    const result = await window.electronAPI?.openFile({
      title: 'Open Project',
      filters: [{ name: 'MCUA Projects', extensions: ['mcua'] }],
      properties: ['openFile'],
    });
    if (result && !result.canceled && result.filePaths[0]) {
      navigate(`/editor/${encodeURIComponent(result.filePaths[0])}`);
    }
  };

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <h1>Media Composer Unified</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => navigate('/editor/new')}>+ New Project</button>
          <button onClick={handleOpenProject} style={{ background: '#334155' }}>
            Open…
          </button>
        </div>
      </header>
      <main className="dashboard__main">
        <section>
          <h2>Recent Projects</h2>
          <p className="empty-state">No projects yet. Create your first project to get started.</p>
        </section>
      </main>
    </div>
  );
}
