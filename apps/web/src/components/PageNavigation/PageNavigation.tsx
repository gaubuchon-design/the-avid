// =============================================================================
//  THE AVID -- Page Navigation
//  Bottom navigation bar with 7 page tabs:
//  Media | Cut | Edit | VFX | Color | ProTools | Deliver
// =============================================================================

import React from 'react';

export type EditorPage = 'media' | 'cut' | 'edit' | 'vfx' | 'color' | 'protools' | 'deliver';

interface PageNavProps {
  activePage: EditorPage;
  onPageChange: (page: EditorPage) => void;
}

const PAGES: { id: EditorPage; label: string; shortcut: string }[] = [
  { id: 'media', label: 'Media', shortcut: 'Shift+1' },
  { id: 'cut', label: 'Cut', shortcut: 'Shift+2' },
  { id: 'edit', label: 'Edit', shortcut: 'Shift+3' },
  { id: 'vfx', label: 'VFX', shortcut: 'Shift+4' },
  { id: 'color', label: 'Color', shortcut: 'Shift+5' },
  { id: 'protools', label: 'ProTools', shortcut: 'Shift+6' },
  { id: 'deliver', label: 'Deliver', shortcut: 'Shift+7' },
];

export function PageNavigation({ activePage, onPageChange }: PageNavProps) {
  return (
    <nav className="page-nav" aria-label="Work pages">
      {PAGES.map((page) => (
        <button
          key={page.id}
          className={`page-nav-tab${activePage === page.id ? ' active' : ''}`}
          onClick={() => onPageChange(page.id)}
          title={`${page.label} (${page.shortcut})`}
          aria-current={activePage === page.id ? 'page' : undefined}
        >
          {page.label}
        </button>
      ))}
    </nav>
  );
}
