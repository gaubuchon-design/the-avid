import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DesktopAudioPreviewDiagnostics } from '../../components/Diagnostics/DesktopAudioPreviewDiagnostics';
import { useEditorStore } from '../../store/editor.store';

describe('DesktopAudioPreviewDiagnostics', () => {
  const initialState = useEditorStore.getState();

  afterEach(() => {
    cleanup();
    useEditorStore.setState(initialState);
  });

  it('renders nothing when buffered desktop audio preview is inactive', () => {
    useEditorStore.setState((state) => ({
      ...state,
      desktopMonitorAudioPreview: {
        ...state.desktopMonitorAudioPreview,
        'record-monitor': {
          mixId: 'mix-1',
          handle: 'preview-1',
          previewPath: '/tmp/audio-monitor.preview.json',
          executionPlanPath: '/tmp/audio-monitor.execution-plan.json',
          previewRenderArtifacts: [],
          bufferedPreviewActive: false,
          offlinePrintRenderRequired: false,
          timeRange: {
            startSeconds: 0,
            endSeconds: 1,
          },
        },
      },
    }));

    render(<DesktopAudioPreviewDiagnostics consumer="record-monitor" />);

    expect(screen.queryByText('Buffered audio preview')).not.toBeInTheDocument();
  });

  it('renders a buffered preview badge when the desktop transport is using cached audio preview', () => {
    useEditorStore.setState((state) => ({
      ...state,
      desktopMonitorAudioPreview: {
        ...state.desktopMonitorAudioPreview,
        'record-monitor': {
          mixId: 'mix-1',
          handle: 'preview-1',
          previewPath: '/tmp/audio-monitor.preview.json',
          executionPlanPath: '/tmp/audio-monitor.execution-plan.json',
          previewRenderArtifacts: ['/tmp/cache/bus-1.preview-render.json'],
          bufferedPreviewActive: true,
          offlinePrintRenderRequired: true,
          timeRange: {
            startSeconds: 0,
            endSeconds: 1,
          },
        },
      },
    }));

    render(<DesktopAudioPreviewDiagnostics consumer="record-monitor" />);

    expect(screen.getByText('Buffered audio preview')).toBeInTheDocument();
  });
});
