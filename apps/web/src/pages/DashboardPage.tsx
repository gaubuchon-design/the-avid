import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectSummary, ProjectTemplate } from '@mcua/core';
import { useNavigate } from 'react-router-dom';
import {
  listProjectSummariesFromRepository,
  purgeDisposableProjectsFromRepository,
} from '../lib/projectRepository';
import {
  EDITORIAL_TEMPLATE_OPTIONS,
  getProjectCreationTemplateVisual,
} from '../lib/projectCreation';
import { NewProjectDialog } from '../components/NewProjectDialog/NewProjectDialog';
import { ProjectGlyph } from '../components/Projects/ProjectGlyph';
import { useEditorStore } from '../store/editor.store';

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatRelativeDate(isoDate: string): string {
  if (!isoDate) {
    return 'Unknown';
  }

  const parsedTime = new Date(isoDate).getTime();
  if (!Number.isFinite(parsedTime)) {
    return 'Unknown';
  }

  const diffMs = Date.now() - parsedTime;
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

function ProjectCardSkeleton() {
  return (
    <div className="project-card" aria-hidden="true" style={{ pointerEvents: 'none' }}>
      <div className="project-card-thumb" style={{ overflow: 'hidden' }}>
        <div style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(90deg, var(--bg-raised) 25%, var(--bg-elevated) 50%, var(--bg-raised) 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s ease-in-out infinite',
        }}
        />
      </div>
      <div className="project-card-body">
        <div style={{ width: '70%', height: 14, borderRadius: 4, background: 'var(--bg-elevated)', marginBottom: 8 }} />
        <div style={{ width: '50%', height: 10, borderRadius: 3, background: 'var(--bg-elevated)' }} />
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function TemplateQuickButton({
  template,
  onClick,
}: {
  template: ProjectTemplate;
  onClick: () => void;
}) {
  const visual = getProjectCreationTemplateVisual(template);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '36px minmax(0, 1fr)',
        gap: 10,
        alignItems: 'center',
        width: '100%',
        padding: '12px 14px',
        borderRadius: 16,
        border: `1px solid ${visual.accent}26`,
        background: `linear-gradient(180deg, ${visual.accent}10, rgba(255, 255, 255, 0.02))`,
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <span style={{
        width: 36,
        height: 36,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `1px solid ${visual.accent}30`,
        color: visual.accent,
        background: 'rgba(255, 255, 255, 0.04)',
      }}
      >
        <ProjectGlyph template={template} size={16} stroke={visual.accent} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          {visual.quickStartTitle}
        </span>
        <span style={{ display: 'block', marginTop: 3, fontSize: 11, color: 'var(--text-secondary)' }}>
          {visual.quickStartDescription}
        </span>
      </span>
    </button>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { showNewProjectDialog, openNewProjectDialog } = useEditorStore();
  const hasPurgedDisposableProjects = useRef(false);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'recent'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cleanupCount, setCleanupCount] = useState(0);

  const refreshProjects = useCallback(async (options?: { purgeDisposable?: boolean }) => {
    setIsLoading(true);
    setLoadError(null);

    try {
      if (options?.purgeDisposable) {
        const removedCount = await purgeDisposableProjectsFromRepository();
        setCleanupCount(removedCount);
        hasPurgedDisposableProjects.current = true;
      }

      setProjects(await listProjectSummariesFromRepository());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProjects({ purgeDisposable: !hasPurgedDisposableProjects.current });
  }, [refreshProjects]);

  const filteredProjects = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return projects.filter((project) => {
      const projectTags = project.tags ?? [];
      const matchesSearch = !normalizedSearch
        || project.name.toLowerCase().includes(normalizedSearch)
        || project.description.toLowerCase().includes(normalizedSearch)
        || project.resolutionLabel.toLowerCase().includes(normalizedSearch)
        || projectTags.some((tag) => tag.toLowerCase().includes(normalizedSearch));

      if (!matchesSearch) {
        return false;
      }

      if (filter === 'recent') {
        return Date.now() - new Date(project.updatedAt).getTime() < 1000 * 60 * 60 * 24 * 7;
      }

      return true;
    });
  }, [filter, projects, search]);

  const continueProject = projects[0] ?? null;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="dashboard-logo">The <em>Avid</em></div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <input
              type="search"
              placeholder="Search projects"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search projects"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: '999px',
                color: 'var(--text-primary)',
                fontSize: 12,
                padding: '8px 14px 8px 34px',
                outline: 'none',
                width: 220,
                transition: 'border-color 150ms ease',
              }}
              onFocus={(event) => {
                event.target.style.borderColor = 'var(--brand)';
              }}
              onBlur={(event) => {
                event.target.style.borderColor = 'var(--border-default)';
              }}
            />
            <span style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
            }}
            >
              <SearchIcon />
            </span>
          </div>

          <button className="btn btn-primary" onClick={() => openNewProjectDialog('film')}>
            New Project
          </button>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/settings')}
            title="Settings"
            aria-label="Open settings"
            style={{ padding: '0 6px' }}
          >
            <SettingsIcon />
          </button>
        </div>
      </div>

      <div className="dashboard-main">
        {cleanupCount > 0 && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '14px',
            background: 'rgba(79, 99, 245, 0.12)',
            border: '1px solid rgba(79, 99, 245, 0.22)',
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}
          >
            Removed {cleanupCount} disposable test {cleanupCount === 1 ? 'project' : 'projects'} from the library.
          </div>
        )}

        <section style={{
          display: 'grid',
          gap: 16,
          padding: '22px 24px',
          borderRadius: '24px',
          background: 'linear-gradient(180deg, rgba(15, 21, 31, 0.98), rgba(11, 15, 22, 0.96))',
          border: '1px solid rgba(138, 156, 181, 0.14)',
        }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ maxWidth: 520 }}>
              <div style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
              >
                Start editing
              </div>
              <h1 style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: 30,
                lineHeight: 1.05,
                color: 'var(--text-primary)',
                letterSpacing: '-0.03em',
              }}
              >
                Keep project setup simple: choose a template, name it, and cut.
              </h1>
              <p style={{
                margin: '12px 0 0',
                fontSize: 13,
                lineHeight: 1.7,
                color: 'var(--text-secondary)',
              }}
              >
                Every shortcut opens the same compact project dialog. Advanced sequence controls stay tucked away unless you need to change them.
              </p>
            </div>

            {continueProject && (
              <button
                className="btn btn-secondary"
                onClick={() => navigate(`/editor/${continueProject.id}`)}
              >
                Continue {continueProject.name}
              </button>
            )}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10,
          }}
          >
            {EDITORIAL_TEMPLATE_OPTIONS.map((template) => (
              <TemplateQuickButton
                key={template}
                template={template}
                onClick={() => openNewProjectDialog(template)}
              />
            ))}
          </div>
        </section>

        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div className="section-header" style={{ marginBottom: 0 }}>
              <span className="section-title">Projects</span>
              <span className="section-count">{filteredProjects.length}</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {(['all', 'recent'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setFilter(option)}
                  className={`btn btn-sm${filter === option ? ' btn-secondary' : ' btn-ghost'}`}
                  style={{ textTransform: 'capitalize' }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {loadError && !isLoading && (
            <div role="alert" style={{
              padding: 32,
              textAlign: 'center',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 'var(--radius-lg)',
              marginBottom: 16,
            }}
            >
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

          {!loadError && !isLoading && filteredProjects.length === 0 && projects.length === 0 && (
            <div style={{
              padding: 36,
              textAlign: 'center',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
            }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                No projects yet.
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)', marginBottom: 14 }}>
                Start with a template and jump straight into the editorial workspace.
              </div>
              <button className="btn btn-primary" onClick={() => openNewProjectDialog('film')}>
                Create First Project
              </button>
            </div>
          )}

          {!loadError && !isLoading && filteredProjects.length === 0 && projects.length > 0 && (
            <div style={{
              padding: 32,
              textAlign: 'center',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
            }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                No matching projects
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Try a broader search or switch back to all projects.
              </div>
            </div>
          )}

          <div className="projects-grid" role="list" aria-label="Projects">
            {isLoading && (
              <>
                <ProjectCardSkeleton />
                <ProjectCardSkeleton />
                <ProjectCardSkeleton />
              </>
            )}

            {!isLoading && filteredProjects.map((project) => (
              <div
                key={project.id}
                className="project-card"
                role="listitem"
                tabIndex={0}
                aria-label={`${project.name}, ${formatRelativeDate(project.updatedAt)}`}
                onClick={() => navigate(`/editor/${project.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/editor/${project.id}`);
                  }
                }}
              >
                <div className="project-card-thumb" style={{ overflow: 'hidden' }}>
                  <div
                    className="project-card-thumb-bg"
                    style={{ background: `linear-gradient(135deg, ${project.color}16, ${project.color}4c)` }}
                  />
                  <div
                    className="project-card-thumb-icon"
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: project.color,
                      background: 'rgba(8, 12, 19, 0.58)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      backdropFilter: 'blur(10px)',
                    }}
                  >
                    <ProjectGlyph template={project.template} size={22} stroke={project.color} />
                  </div>
                </div>

                <div className="project-card-body">
                  <div className="project-card-name">{project.name}</div>
                  <div className="project-card-meta" style={{ marginBottom: 10 }}>
                    <span>{formatRelativeDate(project.updatedAt)}</span>
                    <span>{project.resolutionLabel}</span>
                    <span>{formatDuration(project.durationSeconds)}</span>
                  </div>
                  {project.description && (
                    <div style={{
                      fontSize: 12,
                      lineHeight: 1.55,
                      color: 'var(--text-secondary)',
                      marginBottom: 10,
                    }}
                    >
                      {project.description}
                    </div>
                  )}
                  <div className="project-card-tags">
                    {(project.tags ?? []).slice(0, 3).map((tag) => (
                      <span key={tag} className="project-tag">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {showNewProjectDialog && <NewProjectDialog />}
    </div>
  );
}
