import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const DEMO_PROJECTS = [
  { id: 'p1', name: 'Demo Feature Film', tags: ['film', 'narrative'], updated: '2h ago', duration: '1h 42m', members: 3, icon: '🎬', color: '#5b6af5' },
  { id: 'p2', name: 'Brand Campaign Q4', tags: ['commercial', 'social'], updated: '1d ago', duration: '2m 30s', members: 5, icon: '📺', color: '#2bb672' },
  { id: 'p3', name: 'Documentary: City Life', tags: ['doc', 'long-form'], updated: '3d ago', duration: '45m', members: 2, icon: '🎭', color: '#e8943a' },
  { id: 'p4', name: 'Sports Highlights Reel', tags: ['sports', 'social'], updated: '1w ago', duration: '3m 15s', members: 4, icon: '⚽', color: '#e05b8e' },
  { id: 'p5', name: 'Podcast Episode 24', tags: ['audio', 'podcast'], updated: '2w ago', duration: '58m', members: 1, icon: '🎙', color: '#7c5cfc' },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'recent' | 'shared'>('all');

  const filtered = DEMO_PROJECTS.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.tags.some(t => t.includes(search.toLowerCase()))
  );

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="dashboard-logo">The <em>Avid</em></div>
        <nav className="dashboard-nav" style={{ marginLeft: 16 }}>
          {['Projects', 'Templates', 'Marketplace', 'Team'].map(item => (
            <div key={item} className={`dashboard-nav-item${item === 'Projects' ? ' active' : ''}`}>{item}</div>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="text" placeholder="Search projects…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: 12, padding: '6px 12px', outline: 'none', width: 220 }}
          />
          <button className="btn btn-primary" onClick={() => navigate('/editor/new')}>+ New Project</button>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>A</div>
        </div>
      </div>

      <div className="dashboard-main">
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Continue editing:</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 10px', background: 'var(--bg-raised)', borderRadius: 5, border: '1px solid var(--border)' }} onClick={() => navigate('/editor/p1')}>
            <span>🎬</span><span style={{ fontSize: 12, color: 'var(--text-primary)' }}>Demo Feature Film</span><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>· 2h ago</span>
          </div>
          <div style={{ flex: 1 }} />
          {[['5', 'Projects', 'var(--accent)'], ['487', 'AI Tokens', 'var(--success)'], ['2', 'Pending', 'var(--warning)']].map(([n, l, c]) => (
            <React.Fragment key={l as string}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: c as string, fontFamily: 'var(--font-display)' }}>{n}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
              </div>
              {l !== 'Pending' && <div style={{ width: 1, background: 'var(--border)' }} />}
            </React.Fragment>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {(['all', 'recent', 'shared'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`} style={{ textTransform: 'capitalize', padding: '5px 14px' }}>{f}</button>
          ))}
        </div>

        <div className="section-header">
          <div className="section-title">{filter === 'all' ? 'All Projects' : filter === 'recent' ? 'Recent' : 'Shared with me'}</div>
        </div>

        <div className="projects-grid">
          <div className="project-card" style={{ border: '1px dashed var(--border-strong)', cursor: 'pointer', minHeight: 160 }} onClick={() => navigate('/editor/new')}>
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px dashed var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: 'var(--text-muted)' }}>+</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>New Project</div>
            </div>
          </div>

          {filtered.map(p => (
            <div key={p.id} className="project-card" onClick={() => navigate(`/editor/${p.id}`)}>
              <div className="project-card-thumb">
                <div className="project-card-thumb-bg" style={{ background: `linear-gradient(135deg, ${p.color}22, ${p.color}44)` }} />
                <div className="project-card-thumb-icon">{p.icon}</div>
                <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', borderRadius: 3, padding: '2px 6px', fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{p.duration}</div>
              </div>
              <div className="project-card-body">
                <div className="project-card-name">{p.name}</div>
                <div className="project-card-meta"><span>🕐 {p.updated}</span><span>👥 {p.members}</span></div>
                <div className="project-card-tags">{p.tags.map(tag => <span key={tag} className="project-tag">{tag}</span>)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
