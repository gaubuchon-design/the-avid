// =============================================================================
//  THE AVID -- Page Navigation (DaVinci Resolve-Style)
//  Bottom navigation bar with 7 page tabs matching Resolve's full page set:
//  Media | Cut | Edit | Fusion | Color | Fairlight | Deliver
// =============================================================================

import React from 'react';

export type EditorPage = 'media' | 'cut' | 'edit' | 'fusion' | 'color' | 'fairlight' | 'deliver';

interface PageNavProps {
  activePage: EditorPage;
  onPageChange: (page: EditorPage) => void;
}

const PAGES: { id: EditorPage; label: string; shortcut: string }[] = [
  { id: 'media', label: 'Media', shortcut: 'Shift+1' },
  { id: 'cut', label: 'Cut', shortcut: 'Shift+2' },
  { id: 'edit', label: 'Edit', shortcut: 'Shift+3' },
  { id: 'fusion', label: 'Fusion', shortcut: 'Shift+4' },
  { id: 'color', label: 'Color', shortcut: 'Shift+5' },
  { id: 'fairlight', label: 'Fairlight', shortcut: 'Shift+6' },
  { id: 'deliver', label: 'Deliver', shortcut: 'Shift+7' },
];

export function PageNavigation({ activePage, onPageChange }: PageNavProps) {
  return (
    <nav className="page-nav" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 0,
      height: 28,
      background: 'var(--bg-void)',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      flexShrink: 0,
      zIndex: 100,
    }}>
      {PAGES.map((page) => (
        <button
          key={page.id}
          className={`page-nav-tab${activePage === page.id ? ' active' : ''}`}
          onClick={() => onPageChange(page.id)}
          title={`${page.label} (${page.shortcut})`}
          style={{
            padding: '4px 18px',
            fontSize: 11,
            fontWeight: activePage === page.id ? 600 : 400,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: activePage === page.id ? 'var(--text-primary)' : 'var(--text-muted)',
            background: activePage === page.id ? 'rgba(255,255,255,0.06)' : 'transparent',
            border: 'none',
            borderBottom: activePage === page.id ? '2px solid var(--brand)' : '2px solid transparent',
            cursor: 'pointer',
            transition: 'all 150ms ease',
            fontFamily: 'var(--font-ui)',
          }}
        >
          {page.label}
        </button>
      ))}
    </nav>
  );
}
