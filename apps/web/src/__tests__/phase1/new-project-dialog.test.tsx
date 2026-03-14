import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NewProjectDialog } from '../../components/NewProjectDialog/NewProjectDialog';
import { useEditorStore } from '../../store/editor.store';

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const repositoryMocks = vi.hoisted(() => ({
  createProjectInRepository: vi.fn(),
  listProjectSummariesFromRepository: vi.fn(),
}));

vi.mock('../../lib/projectRepository', () => ({
  createProjectInRepository: repositoryMocks.createProjectInRepository,
  listProjectSummariesFromRepository: repositoryMocks.listProjectSummariesFromRepository,
}));

const initialState = useEditorStore.getState();

describe('phase 1 new project dialog', () => {
  beforeEach(() => {
    cleanup();
    useEditorStore.setState(initialState, true);
    repositoryMocks.createProjectInRepository.mockReset();
    repositoryMocks.listProjectSummariesFromRepository.mockReset();
    repositoryMocks.listProjectSummariesFromRepository.mockResolvedValue([]);
    useEditorStore.setState({
      showNewProjectDialog: true,
      newProjectDialogTemplate: 'documentary',
    });
  });

  afterEach(() => {
    cleanup();
    useEditorStore.setState(initialState, true);
  });

  it('keeps advanced sequence controls hidden until requested', async () => {
    render(
      <MemoryRouter future={routerFuture}>
        <NewProjectDialog />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Documentary Edit')).toBeInTheDocument();
    });

    expect(screen.getByText('Create an editorial project')).toBeInTheDocument();
    expect(screen.queryByLabelText('Frame rate')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Resolution')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Notes')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit sequence settings' }));

    expect(screen.getByLabelText('Frame rate')).toBeInTheDocument();
    expect(screen.getByLabelText('Resolution')).toBeInTheDocument();
    expect(screen.getByLabelText('Notes')).toBeInTheDocument();
  });
});
