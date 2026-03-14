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

const PAGES: { id: EditorPage; label: string; shortcut: string }[] = [
  { id: 'media', label: 'Media', shortcut: 'Shift+1' },
  { id: 'cut', label: 'Cut', shortcut: 'Shift+2' },
  { id: 'edit', label: 'Edit', shortcut: 'Shift+3' },
  { id: 'vfx', label: 'VFX', shortcut: 'Shift+4' },
  { id: 'protools', label: 'ProTools', shortcut: 'Shift+5' },
  { id: 'color', label: 'Color', shortcut: 'Shift+6' },
];

export function PageNavigation({ activePage, onPageChange }: PageNavProps) {
  return (
    <nav className="page-nav" role="tablist" aria-label="Page navigation">
      {PAGES.map((page) => (
        <button
          key={page.id}
          role="tab"
          aria-selected={activePage === page.id}
          className={`page-nav-tab${activePage === page.id ? ' active' : ''}`}
          onClick={() => onPageChange(page.id)}
          title={`${page.label} (${page.shortcut})`}
        >
          {page.label}
        </button>
      ))}
    </nav>
  );
}
