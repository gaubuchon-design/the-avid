// =============================================================================
//  THE AVID -- Page Navigation
//  Work page tabs used by the editor workbench
// =============================================================================

import React from 'react';

export type EditorPage = 'media' | 'cut' | 'edit' | 'color' | 'deliver';

interface PageNavProps {
  activePage: EditorPage;
  onPageChange: (page: EditorPage) => void;
}

const PAGES: { id: EditorPage; label: string; shortcut: string }[] = [
  { id: 'media', label: 'Media', shortcut: 'Shift+1' },
  { id: 'cut', label: 'Cut', shortcut: 'Shift+2' },
  { id: 'edit', label: 'Edit', shortcut: 'Shift+3' },
  { id: 'color', label: 'Color', shortcut: 'Shift+4' },
  { id: 'deliver', label: 'Deliver', shortcut: 'Shift+5' },
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
