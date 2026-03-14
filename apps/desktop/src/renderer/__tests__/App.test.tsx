import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../../../web/src/pages/DashboardPage', () => ({
  DashboardPage: () => React.createElement('div', null, 'Shared Dashboard Shell'),
}));

vi.mock('../../../../web/src/pages/EditorPage', () => ({
  EditorPage: () => React.createElement('div', null, 'Shared Editorial Shell'),
}));

vi.mock('../../../../web/src/lib/projectRepository', () => ({
  saveProjectToRepository: vi.fn(async (project: { id: string }) => project),
}));

import App from '../App';

describe('desktop renderer App', () => {
  it('renders the shared dashboard shell at the root route', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(markup).toContain('Shared Dashboard Shell');
  });

  it('renders the shared editorial shell at the editor route', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/editor/project-123']}>
        <App />
      </MemoryRouter>,
    );

    expect(markup).toContain('Shared Editorial Shell');
  });
});
