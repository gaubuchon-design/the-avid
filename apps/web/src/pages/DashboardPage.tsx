import { useNavigate } from 'react-router-dom';

export function DashboardPage() {
  const navigate = useNavigate();

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <h1>Media Composer Unified</h1>
        <button onClick={() => navigate('/editor/new')}>+ New Project</button>
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
