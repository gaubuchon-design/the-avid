import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NewProjectDialog } from '../../components/NewProjectDialog/NewProjectDialog';
import { useEditorStore } from '../../store/editor.store';

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
    });
  });

  afterEach(() => {
    cleanup();
    useEditorStore.setState(initialState, true);
  });

  it('renders the dialog with all settings fields visible', async () => {
    render(
      <MemoryRouter>
        <NewProjectDialog />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Dialog header
    expect(screen.getByText('New Project')).toBeInTheDocument();

    // Project name input with placeholder
    expect(screen.getByLabelText('Project Name')).toBeInTheDocument();

    // Video settings are visible immediately (no toggle needed)
    expect(screen.getByLabelText('Frame Rate')).toBeInTheDocument();
    expect(screen.getByLabelText('Resolution')).toBeInTheDocument();

    // Color management section
    expect(screen.getByLabelText('Working Color Space')).toBeInTheDocument();
    expect(screen.getByLabelText('HDR Mode')).toBeInTheDocument();

    // Create button exists but disabled until project name is entered
    const createBtn = screen.getByRole('button', { name: /Create Project/i });
    expect(createBtn).toBeInTheDocument();
  });

  it('enables the create button only when project name is provided', async () => {
    render(
      <MemoryRouter>
        <NewProjectDialog />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const nameInput = screen.getByLabelText('Project Name');
    const createBtn = screen.getByRole('button', { name: /Create Project/i });

    // Initially disabled (empty name)
    expect(createBtn).toBeDisabled();

    // Type a name
    fireEvent.change(nameInput, { target: { value: 'My Documentary' } });

    // Now enabled
    expect(createBtn).not.toBeDisabled();
  });

  it('allows selecting color management options', async () => {
    render(
      <MemoryRouter>
        <NewProjectDialog />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Default: Rec.709 / SDR
    const csSelect = screen.getByLabelText('Working Color Space') as HTMLSelectElement;
    const hdrSelect = screen.getByLabelText('HDR Mode') as HTMLSelectElement;
    expect(csSelect.value).toBe('rec709');
    expect(hdrSelect.value).toBe('sdr');

    // Change to Rec.2020 / PQ
    fireEvent.change(csSelect, { target: { value: 'rec2020' } });
    fireEvent.change(hdrSelect, { target: { value: 'pq' } });
    expect(csSelect.value).toBe('rec2020');
    expect(hdrSelect.value).toBe('pq');
  });
});
