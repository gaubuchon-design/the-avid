import React, { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Toolbar } from '../components/Toolbar/Toolbar';
import { BinPanel } from '../components/Bins/BinPanel';
import { MonitorArea } from '../components/Monitor/MonitorArea';
import { Timeline } from '../components/Timeline/Timeline';
import { InspectorPanel } from '../components/Editor/InspectorPanel';
import { IngestPanel } from '../components/Editor/IngestPanel';
import { PublishPanel } from '../components/Editor/PublishPanel';
import { ReviewPanel } from '../components/Editor/ReviewPanel';
import { ScriptPanel } from '../components/Editor/ScriptPanel';
import { AIPanel } from '../components/AIPanel/AIPanel';
import { CommandPalette } from '../components/Editor/CommandPalette';
import { StatusBar } from '../components/Editor/StatusBar';
import { useEditorStore } from '../store/editor.store';

function usePlaybackEngine() {
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const rafRef = useRef<number>();
  const lastTimeRef = useRef<number>();

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = undefined;
      return;
    }
    const tick = (ts: number) => {
      if (lastTimeRef.current === undefined) lastTimeRef.current = ts;
      const dt = (ts - lastTimeRef.current) / 1000;
      lastTimeRef.current = ts;
      const { playheadTime, duration, setPlayhead, togglePlay } = useEditorStore.getState();
      const next = playheadTime + dt;
      if (next >= duration) {
        setPlayhead(duration);
        togglePlay();
        return;
      }
      setPlayhead(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying]);
}

export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const activeProjectId = useEditorStore((state) => state.projectId);
  const activePanel = useEditorStore((state) => state.activePanel);
  const { showAIPanel, loadProject } = useEditorStore();
  usePlaybackEngine();

  useEffect(() => {
    if (!projectId) {
      return;
    }

    let cancelled = false;

    void loadProject(projectId).then((resolvedId) => {
      if (!cancelled && projectId === 'new' && resolvedId) {
        navigate(`/editor/${resolvedId}`, { replace: true });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadProject, navigate, projectId]);

  useEffect(() => {
    let saveTimer: number | undefined;

    const unsubscribe = useEditorStore.subscribe((state) => {
      if (!state.projectId || !state.isDirty) {
        return;
      }

      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        const currentState = useEditorStore.getState();
        if (currentState.isDirty) {
          void currentState.saveProject();
        }
      }, 650);
    });

    return () => {
      unsubscribe();
      window.clearTimeout(saveTimer);
    };
  }, []);

  useEffect(() => {
    if (!window.electronAPI) {
      return;
    }

    const handleSave = async () => {
      await useEditorStore.getState().saveProject();
    };

    const handleExport = async () => {
      const project = await useEditorStore.getState().saveProject();
      if (!project) {
        return;
      }

      await window.electronAPI.startExportJob(project);
    };

    const handleImportMedia = async () => {
      const currentProjectId = useEditorStore.getState().projectId;
      if (!currentProjectId) {
        return;
      }

      const result = await window.electronAPI.openFile({
        title: 'Import Media',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Media', extensions: ['mov', 'mp4', 'mxf', 'webm', 'avi', 'm4v', 'mkv', 'mpg', 'mpeg', 'mts', 'm2ts', 'r3d', 'braw', 'ari', 'wav', 'mp3', 'aif', 'aiff', 'aac', 'm4a', 'flac', 'ogg', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'tif', 'tiff', 'dng', 'bmp', 'pdf'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return;
      }

      const importedAssets = await window.electronAPI.importMedia(currentProjectId, result.filePaths);
      const { importAssets, saveProject, selectedBinId } = useEditorStore.getState();
      importAssets(importedAssets, selectedBinId);
      await saveProject();
    };

    const disposeSave = window.electronAPI.onSave(() => {
      void handleSave();
    });
    const disposeExport = window.electronAPI.onExport(() => {
      void handleExport();
    });
    const disposeImportMedia = window.electronAPI.onImportMedia(() => {
      void handleImportMedia();
    });
    const disposeDesktopJobUpdate = window.electronAPI.onDesktopJobUpdate((job) => {
      useEditorStore.getState().upsertDesktopJob(job);
    });

    return () => {
      disposeSave();
      disposeExport();
      disposeImportMedia();
      disposeDesktopJobUpdate();
    };
  }, []);

  useEffect(() => {
    if (!window.electronAPI || !activeProjectId) {
      return;
    }

    let cancelled = false;

    void Promise.all([
      window.electronAPI.listDesktopJobs(),
      window.electronAPI.scanProjectMedia(activeProjectId),
    ]).then(([jobs]) => {
      if (!cancelled) {
        useEditorStore.getState().setDesktopJobs(jobs);
        void useEditorStore.getState().loadProject(activeProjectId);
      }
    }).catch((error) => {
      console.error('Failed to load desktop jobs or scan project media', error);
    });

    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  const leftPanel = activePanel === 'script' ? <ScriptPanel /> : <BinPanel />;
  const rightPanel = activePanel === 'review'
    ? <ReviewPanel />
    : activePanel === 'publish'
    ? <PublishPanel />
    : activePanel === 'ingest'
    ? <IngestPanel />
    : <InspectorPanel />;

  return (
    <div className="editor-shell" onContextMenu={e => e.preventDefault()}>
      <Toolbar />
      <div className="workspace">
        {leftPanel}
        <div className="canvas-area" style={{ position: 'relative' }}>
          <MonitorArea />
          {showAIPanel && <AIPanel />}
          <CommandPalette />
        </div>
        {rightPanel}
      </div>
      <Timeline />
      <StatusBar />
    </div>
  );
}
