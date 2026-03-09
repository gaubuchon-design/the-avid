import React, { useEffect, useState, useCallback } from 'react';
import type { ProjectSummary, ProjectTemplate } from '@mcua/core';
import { useNavigate } from 'react-router-dom';
import {
  createProjectInRepository,
  listProjectSummariesFromRepository,
} from '../lib/projectRepository';
import { NewProjectDialog } from '../components/NewProjectDialog/NewProjectDialog';
import { useEditorStore } from '../store/editor.store';

const TEMPLATE_OPTIONS: Array<{ template: ProjectTemplate; label: string; desc: string; icon: string; workspace?: string }> = [
  { template: 'film', label: 'Blank Timeline', desc: '1920x1080 · 24fps', icon: '🎬', workspace: 'filmtv' },
  { template: 'social', label: 'Social Vertical', desc: '1080x1920 · 30fps', icon: '📱', workspace: 'creator' },
  { template: 'podcast', label: 'Podcast Edit', desc: 'Audio-first layout', icon: '🎙', workspace: 'creator' },
  { template: 'sports', label: 'Sports Reel', desc: 'Action-optimized', icon: '⚡', workspace: 'sports' },
  { template: 'film', label: 'News Package', desc: 'Rundown-ready', icon: '📡', workspace: 'news' },
  { template: 'social', label: 'Brand Campaign', desc: 'Multi-variant', icon: '🏷', workspace: 'marketing' },
];

function iconForProject(icon: string): string {
  switch (icon) {
    case 'clapperboard': return '🎬';
    case 'tv': return '📺';
    case 'theater': return '🎭';
    case 'bolt': return '⚡';
    case 'mic': return '🎙';
    case 'smartphone': return '📱';
    default: return '🎞';
  }
}

function formatDuration(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatRelativeDate(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) {
    return `${Math.max(diffMinutes, 1)}m ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return `${Math.floor(diffDays / 7)}w ago`;
}

// Skeleton UI for loading state
function ProjectCardSkeleton() {
  return (
    <div className="project-card" aria-hidden="true" style={{ pointerEvents: 'none' }}>
      <div className="project-card-thumb" style={{ overflow: 'hidden' }}>
        <div style={{
          width: '100%', height: '100%',
          background: 'linear-gradient(90deg, var(--bg-raised) 25%, var(--bg-elevated) 50%, var(--bg-raised) 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s ease-in-out infinite',
        }} />
      </div>
      <div className="project-card-body">
        <div style={{ width: '70%', height: 14, borderRadius: 4, background: 'var(--bg-elevated)', marginBottom: 8 }} />
        <div style={{ width: '50%', height: 10, borderRadius: 3, background: 'var(--bg-elevated)' }} />
      </div>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div style={{ textAlign: 'center', padding: '0 20px' }}>
      <div style={{ width: 40, height: 22, borderRadius: 4, background: 'var(--bg-elevated)', margin: '0 auto 4px' }} />
      <div style={{ width: 50, height: 8, borderRadius: 3, background: 'var(--bg-elevated)', margin: '0 auto' }} />
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { showNewProjectDialog, toggleNewProjectDialog } = useEditorStore();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'recent' | 'shared'>('all');
  const [navItem, setNavItem] = useState('Projects');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setProjects(await listProjectSummariesFromRepository());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const filteredProjects = projects.filter((project) => {
    const matchesSearch = !search
      || project.name.toLowerCase().includes(search.toLowerCase())
      || project.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) {
      return false;
    }

    if (filter === 'recent') {
      return Date.now() - new Date(project.updatedAt).getTime() < 1000 * 60 * 60 * 24 * 3;
    }

    if (filter === 'shared') {
      return project.members > 1;
    }

    return true;
  });

  const continueProject = filteredProjects[0] ?? projects[0] ?? null;
  const totalTokens = projects.reduce((sum, project) => sum + project.tokenBalance, 0);
  const totalExportsPending = projects.filter((project) => project.progress < 100).length;
  const totalDuration = projects.reduce((sum, project) => sum + project.durationSeconds, 0);
  const recentActivity = projects.slice(0, 4).map((project, index) => ({
    user: index % 2 === 0 ? 'Sarah K.' : index % 3 === 0 ? 'You' : 'Marcus T.',
    color: index % 2 === 0 ? '#7c5cfc' : index % 3 === 0 ? '#4f63f5' : '#25a865',
    action: index === 0 ? 'autosaved a timeline revision' : index === 1 ? 'queued an AI pass' : index === 2 ? 'updated a review note' : 'shared the latest cut',
    project: project.name,
    time: formatRelativeDate(project.updatedAt),
  }));

  const createAndOpenProject = async (template: ProjectTemplate, workspace?: string) => {
    const project = await createProjectInRepository({ template });
    await refreshProjects();
    const ws = workspace ? `?workspace=${workspace}` : '';
    navigate(`/editor/${project.id}${ws}`);
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="dashboard-logo">The <em>Avid</em></div>
        <nav className="dashboard-nav" style={{ marginLeft: 16 }} role="tablist" aria-label="Dashboard sections">
          {['Projects', 'Templates', 'Marketplace', 'Team'].map((item) => (
            <button key={item}
              className={`dashboard-nav-item${navItem === item ? ' active' : ''}`}
              onClick={() => setNavItem(item)}
              role="tab"
              aria-selected={navItem === item}
              tabIndex={navItem === item ? 0 : -1}
              onKeyDown={(e) => {
                const items = ['Projects', 'Templates', 'Marketplace', 'Team'];
                const idx = items.indexOf(item);
                if (e.key === 'ArrowRight' && idx < items.length - 1) {
                  e.preventDefault();
                  setNavItem(items[idx + 1]!);
                  (e.currentTarget.nextElementSibling as HTMLElement | null)?.focus();
                } else if (e.key === 'ArrowLeft' && idx > 0) {
                  e.preventDefault();
                  setNavItem(items[idx - 1]!);
                  (e.currentTarget.previousElementSibling as HTMLElement | null)?.focus();
                }
              }}
              style={{
                border: 'none', background: 'transparent', cursor: 'pointer',
                font: 'inherit', color: 'inherit', padding: 'inherit',
              }}
            >{item}</button>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <input
              type="search"
              placeholder="Search projects... (Ctrl+/)"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search projects"
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                fontSize: 12, padding: '6px 12px 6px 32px', outline: 'none', width: 210,
                transition: 'border-color 150ms',
              }}
              onFocus={(event) => (event.target.style.borderColor = 'var(--brand)')}
              onBlur={(event) => (event.target.style.borderColor = 'var(--border-default)')}
            />
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-muted)' }}>🔍</span>
          </div>
          <button className="btn btn-primary" onClick={() => toggleNewProjectDialog()}>
            + New Project
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/settings')}
            title="Settings"
            aria-label="Open settings"
            style={{ padding: '0 6px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <div
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--brand)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              color: '#fff',
            }}
            onClick={() => navigate('/settings')}
            role="button"
            tabIndex={0}
            aria-label="User profile"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/settings'); }}
          >A</div>
        </div>
      </div>

      <div className="dashboard-main">
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)', padding: '14px 20px',
          display: 'flex', alignItems: 'center', gap: 0,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Continue editing</div>
            {continueProject ? (
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', width: 'fit-content' }}
                onClick={() => navigate(`/editor/${continueProject.id}`)}
              >
                <span style={{ fontSize: 18 }}>{iconForProject(continueProject.icon)}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{continueProject.name}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>· {formatRelativeDate(continueProject.updatedAt)}</span>
                <span style={{ fontSize: 11, color: 'var(--brand-bright)' }}>→</span>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Create a project to start editing.</div>
            )}
          </div>
          <div style={{ width: 1, background: 'var(--border)', height: 36, margin: '0 24px' }} />
          {isLoading ? (
            <>
              <StatsSkeleton /><div style={{ width: 1, background: 'var(--border)', height: 36 }} />
              <StatsSkeleton /><div style={{ width: 1, background: 'var(--border)', height: 36 }} />
              <StatsSkeleton /><div style={{ width: 1, background: 'var(--border)', height: 36 }} />
              <StatsSkeleton />
            </>
          ) : (
            [
              [`${projects.length}`, 'Projects', 'var(--brand-bright)'],
              [`${totalTokens}`, 'AI Tokens', 'var(--success)'],
              [`${totalExportsPending}`, 'Pending Cuts', 'var(--warning)'],
              [formatDuration(totalDuration), 'Timeline Time', 'var(--info)'],
            ].map(([value, label, color], index, entries) => (
              <React.Fragment key={label as string}>
                <div style={{ textAlign: 'center', padding: '0 20px' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: color as string, fontFamily: 'var(--font-display)', letterSpacing: '-0.5px' }}>{value}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>{label}</div>
                </div>
                {index < entries.length - 1 && <div style={{ width: 1, background: 'var(--border)', height: 36 }} />}
              </React.Fragment>
            ))
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 20, alignItems: 'start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div className="section-header" style={{ marginBottom: 0 }}>
                <span className="section-title">Projects</span>
                <span className="section-count">{filteredProjects.length}</span>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                {(['all', 'recent', 'shared'] as const).map((option) => (
                  <button key={option} onClick={() => setFilter(option)}
                    className={`btn btn-sm${filter === option ? ' btn-secondary' : ' btn-ghost'}`}
                    style={{ textTransform: 'capitalize' }}>{option}</button>
                ))}
              </div>
            </div>

            <div className="projects-grid" role="list" aria-label="Projects">
              <div className="project-card" style={{ border: '1px dashed var(--border-strong)', background: 'transparent' }}
                role="listitem"
                tabIndex={0}
                onClick={() => toggleNewProjectDialog()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleNewProjectDialog(); } }}>
                <div style={{ height: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', border: '2px dashed var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'var(--text-muted)' }} aria-hidden="true">+</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>New Project</div>
                </div>
              </div>

              {/* Loading skeleton */}
              {isLoading && filteredProjects.length === 0 && (
                <>
                  <ProjectCardSkeleton />
                  <ProjectCardSkeleton />
                  <ProjectCardSkeleton />
                </>
              )}

              {/* Error state */}
              {loadError && !isLoading && (
                <div role="alert" style={{
                  gridColumn: '1 / -1', padding: 32, textAlign: 'center',
                  background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: 'var(--radius-lg)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--error)', marginBottom: 8 }}>
                    Failed to load projects
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>
                    {loadError}
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => void refreshProjects()}>
                    Try Again
                  </button>
                </div>
              )}

              {/* Empty state */}
              {!isLoading && !loadError && filteredProjects.length === 0 && projects.length > 0 && (
                <div style={{
                  gridColumn: '1 / -1', padding: 32, textAlign: 'center',
                }}>
                  <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: 'inline' }}>
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    No matching projects
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Try adjusting your search or filter criteria
                  </div>
                </div>
              )}

              {filteredProjects.map((project) => (
                <div key={project.id} className="project-card"
                  role="listitem"
                  tabIndex={0}
                  aria-label={`${project.name}, ${formatRelativeDate(project.updatedAt)}, ${project.progress}% complete`}
                  onClick={() => navigate(`/editor/${project.id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/editor/${project.id}`); } }}>
                  <div className="project-card-thumb" style={{ overflow: 'hidden' }}>
                    <div className="project-card-thumb-bg"
                      style={{ background: `linear-gradient(135deg, ${project.color}28, ${project.color}55)` }} />
                    <div style={{ position: 'absolute', inset: 0, opacity: 0.06,
                      backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 20px, rgba(255,255,255,0.5) 20px, rgba(255,255,255,0.5) 21px)' }} />
                    <div className="project-card-thumb-icon">{iconForProject(project.icon)}</div>
                    <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.65)', borderRadius: 3, padding: '2px 6px', fontSize: 9.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {formatDuration(project.durationSeconds)}
                    </div>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'rgba(0,0,0,0.4)' }}>
                      <div style={{ height: '100%', width: `${project.progress}%`, background: project.color, opacity: 0.8 }} />
                    </div>
                  </div>
                  <div className="project-card-body">
                    <div className="project-card-name">{project.name}</div>
                    <div className="project-card-meta">
                      <span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: '-1px', marginRight: 3 }}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                        {formatRelativeDate(project.updatedAt)}
                      </span>
                      <span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: '-1px', marginRight: 3 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                        {project.members}
                      </span>
                      <span style={{ marginLeft: 'auto', color: project.progress === 100 ? 'var(--success)' : 'var(--text-muted)' }}>
                        {project.progress}%
                      </span>
                    </div>
                    <div className="project-card-tags">
                      {project.tags.map((tag) => <span key={tag} className="project-tag">{tag}</span>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="section-header">
              <span className="section-title">Activity</span>
            </div>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              {recentActivity.map((activity, index) => (
                <div key={`${activity.project}-${index}`} style={{ display: 'flex', gap: 10, padding: '10px 14px', borderBottom: index < recentActivity.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: activity.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flex: 'none' }}>
                    {activity.user[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                      <span style={{ fontWeight: 600 }}>{activity.user}</span>{' '}
                      <span style={{ color: 'var(--text-secondary)' }}>{activity.action}</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 6 }}>
                      <span className="truncate">{activity.project}</span>
                      <span style={{ flexShrink: 0 }}>· {activity.time}</span>
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ padding: '8px 14px' }}>
                <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }}>View all activity</button>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="section-header"><span className="section-title">Quick Start</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {TEMPLATE_OPTIONS.map((option) => (
                  <div key={option.label}
                    onClick={() => { void createAndOpenProject(option.template, option.workspace); }}
                    style={{ display: 'flex', gap: 10, padding: '8px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all 150ms' }}
                    onMouseEnter={(event) => (event.currentTarget.style.borderColor = 'var(--border-strong)')}
                    onMouseLeave={(event) => (event.currentTarget.style.borderColor = 'var(--border-default)')}
                  >
                    <span style={{ fontSize: 16 }}>{option.icon}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{option.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{option.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      {showNewProjectDialog && <NewProjectDialog />}
    </div>
  );
}
