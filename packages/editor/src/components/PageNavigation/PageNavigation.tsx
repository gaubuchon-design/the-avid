// =============================================================================
//  THE AVID -- Page Navigation (Resolve-Style)
//  Bottom navigation bar with 6 page tabs: Media | Cut | Edit | VFX | ProTools | Color
// =============================================================================

import React from 'react';

export type EditorPage = 'media' | 'cut' | 'edit' | 'vfx' | 'protools' | 'color';

interface PageNavProps {
  activePage: EditorPage;
  onPageChange: (page: EditorPage) => void;
}

// Each page gets an icon for visual scanning + label + keyboard shortcut
const PAGES: { id: EditorPage; label: string; shortcut: string; icon: React.ReactNode }[] = [
  {
    id: 'media', label: 'Media', shortcut: 'Shift+1',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2" /><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="7" /></svg>,
  },
  {
    id: 'cut', label: 'Cut', shortcut: 'Shift+2',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" /><line x1="8.12" y1="8.12" x2="12" y2="12" /></svg>,
  },
  {
    id: 'edit', label: 'Edit', shortcut: 'Shift+3',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /></svg>,
  },
  {
    id: 'vfx', label: 'VFX', shortcut: 'Shift+4',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
  },
  {
    id: 'protools', label: 'Audio', shortcut: 'Shift+5',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>,
  },
  {
    id: 'color', label: 'Color', shortcut: 'Shift+6',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 2a10 10 0 0 1 0 20" fill="currentColor" opacity="0.15" /><circle cx="12" cy="12" r="3" /></svg>,
  },
];

export function PageNavigation({ activePage, onPageChange }: PageNavProps) {
  return (
    <nav className="page-nav" role="tablist" aria-label="Page navigation" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      height: 32,
      background: 'var(--bg-void)',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      flexShrink: 0,
      zIndex: 100,
    }}>
      {PAGES.map((page) => {
        const isActive = activePage === page.id;
        return (
          <button
            key={page.id}
            role="tab"
            aria-selected={isActive}
            className={`page-nav-tab${isActive ? ' active' : ''}`}
            onClick={() => onPageChange(page.id)}
            title={`${page.label} (${page.shortcut})`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 18px',
              fontSize: 10.5,
              fontWeight: isActive ? 600 : 400,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
              border: 'none',
              borderTop: isActive ? '2px solid var(--brand)' : '2px solid transparent',
              borderBottom: 'none',
              cursor: 'pointer',
              transition: 'all 150ms ease',
              fontFamily: 'var(--font-ui)',
              borderRadius: 0,
            }}
          >
            <span style={{ opacity: isActive ? 1 : 0.5, display: 'flex' }}>{page.icon}</span>
            {page.label}
          </button>
        );
      })}
    </nav>
  );
}
