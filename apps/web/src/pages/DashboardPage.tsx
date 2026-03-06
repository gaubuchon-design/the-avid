import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const PROJECTS = [
  { id: 'p1', name: 'Demo Feature Film', tags: ['film', 'narrative'], updated: '2h ago', duration: '1:42:15', members: 3, icon: '🎬', color: '#4f63f5', progress: 68 },
  { id: 'p2', name: 'Brand Campaign Q4', tags: ['commercial', 'social'], updated: '1d ago', duration: '2:30', members: 5, icon: '📺', color: '#25a865', progress: 91 },
  { id: 'p3', name: 'Documentary: City Life', tags: ['doc', 'long-form'], updated: '3d ago', duration: '44:50', members: 2, icon: '🎭', color: '#d4873a', progress: 35 },
  { id: 'p4', name: 'Sports Highlights Reel', tags: ['sports', 'short'], updated: '1w ago', duration: '3:15', members: 4, icon: '⚡', color: '#c94f84', progress: 100 },
  { id: 'p5', name: 'Podcast Episode 24', tags: ['audio', 'podcast'], updated: '2w ago', duration: '58:04', members: 1, icon: '🎙', color: '#7c5cfc', progress: 52 },
];

const RECENT_ACTIVITY = [
  { user: 'Sarah K.', color: '#7c5cfc', action: 'approved Scene 4 cut', project: 'Demo Feature Film', time: '12m ago' },
  { user: 'Marcus T.', color: '#25a865', action: 'added comment at 01:14:22', project: 'Documentary: City Life', time: '1h ago' },
  { user: 'You', color: '#4f63f5', action: 'exported v3 for review', project: 'Brand Campaign Q4', time: '3h ago' },
  { user: 'Sarah K.', color: '#7c5cfc', action: 'ran AI assembly', project: 'Sports Highlights Reel', time: '1d ago' },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'recent' | 'shared'>('all');
  const [navItem, setNavItem] = useState('Projects');

  const filtered = PROJECTS.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.tags.some(t => t.includes(search.toLowerCase()))
  );

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="dashboard-logo">The <em>Avid</em></div>
        <nav className="dashboard-nav" style={{ marginLeft: 16 }}>
          {['Projects', 'Templates', 'Marketplace', 'Team'].map(item => (
            <div key={item}
              className={`dashboard-nav-item${navItem === item ? ' active' : ''}`}
              onClick={() => setNavItem(item)}
            >{item}</div>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text" placeholder="Search projects…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                fontSize: 12, padding: '6px 12px 6px 32px', outline: 'none', width: 210,
                transition: 'border-color 150ms',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--brand)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
            />
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-muted)' }}>🔍</span>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/editor/new')}>
            + New Project
          </button>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'var(--brand)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            color: '#fff',
          }}>A</div>
        </div>
      </div>

      <div className="dashboard-main">
        {/* Stats bar */}
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)', padding: '14px 20px',
          display: 'flex', alignItems: 'center', gap: 0,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Continue editing</div>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', width: 'fit-content' }}
              onClick={() => navigate('/editor/p1')}
            >
              <span style={{ fontSize: 18 }}>🎬</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Demo Feature Film</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>· 2h ago</span>
              <span style={{ fontSize: 11, color: 'var(--brand-bright)' }}>→</span>
            </div>
          </div>
          <div style={{ width: 1, background: 'var(--border)', height: 36, margin: '0 24px' }} />
          {[
            ['5', 'Projects', 'var(--brand-bright)'],
            ['487', 'AI Tokens', 'var(--success)'],
            ['2', 'Pending Reviews', 'var(--warning)'],
            ['14.2h', 'This Week', 'var(--info)'],
          ].map(([n, l, c], i, arr) => (
            <React.Fragment key={l as string}>
              <div style={{ textAlign: 'center', padding: '0 20px' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: c as string, fontFamily: 'var(--font-display)', letterSpacing: '-0.5px' }}>{n}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>{l}</div>
              </div>
              {i < arr.length - 1 && <div style={{ width: 1, background: 'var(--border)', height: 36 }} />}
            </React.Fragment>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 20, alignItems: 'start' }}>
          {/* Projects */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div className="section-header" style={{ marginBottom: 0 }}>
                <span className="section-title">Projects</span>
                <span className="section-count">{filtered.length}</span>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                {(['all', 'recent', 'shared'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`btn btn-sm${filter === f ? ' btn-secondary' : ' btn-ghost'}`}
                    style={{ textTransform: 'capitalize' }}>{f}</button>
                ))}
              </div>
            </div>

            <div className="projects-grid">
              {/* New project card */}
              <div className="project-card" style={{ border: '1px dashed var(--border-strong)', background: 'transparent' }}
                onClick={() => navigate('/editor/new')}>
                <div style={{ height: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', border: '2px dashed var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'var(--text-muted)' }}>+</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>New Project</div>
                </div>
              </div>

              {filtered.map(p => (
                <div key={p.id} className="project-card" onClick={() => navigate(`/editor/${p.id}`)}>
                  <div className="project-card-thumb" style={{ overflow: 'hidden' }}>
                    <div className="project-card-thumb-bg"
                      style={{ background: `linear-gradient(135deg, ${p.color}28, ${p.color}55)` }} />
                    {/* Fake film-strip texture */}
                    <div style={{ position: 'absolute', inset: 0, opacity: 0.06,
                      backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 20px, rgba(255,255,255,0.5) 20px, rgba(255,255,255,0.5) 21px)' }} />
                    <div className="project-card-thumb-icon">{p.icon}</div>
                    <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.65)', borderRadius: 3, padding: '2px 6px', fontSize: 9.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {p.duration}
                    </div>
                    {/* Progress bar */}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'rgba(0,0,0,0.4)' }}>
                      <div style={{ height: '100%', width: `${p.progress}%`, background: p.color, opacity: 0.8 }} />
                    </div>
                  </div>
                  <div className="project-card-body">
                    <div className="project-card-name">{p.name}</div>
                    <div className="project-card-meta">
                      <span>🕐 {p.updated}</span>
                      <span>👥 {p.members}</span>
                      <span style={{ marginLeft: 'auto', color: p.progress === 100 ? 'var(--success)' : 'var(--text-muted)' }}>
                        {p.progress}%
                      </span>
                    </div>
                    <div className="project-card-tags">
                      {p.tags.map(tag => <span key={tag} className="project-tag">{tag}</span>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity sidebar */}
          <div>
            <div className="section-header">
              <span className="section-title">Activity</span>
            </div>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              {RECENT_ACTIVITY.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 14px', borderBottom: i < RECENT_ACTIVITY.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flex: 'none' }}>
                    {a.user[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                      <span style={{ fontWeight: 600 }}>{a.user}</span>{' '}
                      <span style={{ color: 'var(--text-secondary)' }}>{a.action}</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 6 }}>
                      <span className="truncate">{a.project}</span>
                      <span style={{ flexShrink: 0 }}>· {a.time}</span>
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ padding: '8px 14px' }}>
                <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }}>View all activity</button>
              </div>
            </div>

            {/* Quick actions */}
            <div style={{ marginTop: 16 }}>
              <div className="section-header"><span className="section-title">Quick Start</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { icon: '🎬', label: 'Blank Timeline', desc: '1920×1080 · 24fps' },
                  { icon: '📱', label: 'Social Vertical', desc: '1080×1920 · 30fps' },
                  { icon: '🎙', label: 'Podcast Edit', desc: 'Audio-first layout' },
                  { icon: '⚡', label: 'Sports Reel', desc: 'Action-optimized' },
                ].map(t => (
                  <div key={t.label}
                    onClick={() => navigate('/editor/new')}
                    style={{ display: 'flex', gap: 10, padding: '8px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all 150ms' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-default)')}
                  >
                    <span style={{ fontSize: 16 }}>{t.icon}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{t.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{t.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
