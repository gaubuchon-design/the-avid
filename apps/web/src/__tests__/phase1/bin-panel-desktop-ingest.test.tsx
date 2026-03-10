import React, { act } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { BinPanel } from '../../components/Bins/BinPanel';
import { useEditorStore } from '../../store/editor.store';

const initialEditorState = useEditorStore.getState();

describe('phase 1 bin panel desktop ingest parity', () => {
  beforeEach(() => {
    useEditorStore.setState(initialEditorState, true);
    window.electronAPI = undefined;
  });

  it('routes desktop file-picker imports through electron importMedia and reloads project', async () => {
    const importMediaFiles = vi.fn();
    const loadProject = vi.fn().mockResolvedValue(undefined);
    const openFile = vi.fn().mockResolvedValue({
      canceled: false,
      filePaths: ['/tmp/desktop-source.mov', '/tmp/desktop-audio.wav'],
    });
    const importMedia = vi.fn().mockResolvedValue([]);

    useEditorStore.setState({
      projectId: 'project-desktop-ingest',
      selectedBinId: 'b-master',
      toolbarTab: 'media',
      importMediaFiles,
      loadProject,
    });

    window.electronAPI = {
      openFile,
      importMedia,
    } as unknown as typeof window.electronAPI;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BinPanel />);
    });

    const importButton = container.querySelector('button[title="Import Media"]') as HTMLButtonElement | null;
    expect(importButton).toBeTruthy();

    await act(async () => {
      importButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(openFile).toHaveBeenCalledTimes(1);
    expect(importMedia).toHaveBeenCalledWith(
      'project-desktop-ingest',
      ['/tmp/desktop-source.mov', '/tmp/desktop-audio.wav'],
      'b-master',
    );
    expect(loadProject).toHaveBeenCalledWith('project-desktop-ingest');
    expect(importMediaFiles).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
