import React, { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Toolbar } from '../components/Toolbar/Toolbar';
import { BinPanel } from '../components/Bins/BinPanel';
import { MonitorArea } from '../components/Monitor/MonitorArea';
import { Timeline } from '../components/Timeline/Timeline';
import { InspectorPanel } from '../components/Editor/InspectorPanel';
import { AIPanel } from '../components/AIPanel/AIPanel';
import { StatusBar } from '../components/Editor/StatusBar';
import { useEditorStore } from '../store/editor.store';

function usePlaybackEngine() {
  const { isPlaying, playheadTime, setPlayhead, duration, togglePlay } = useEditorStore();
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
      const next = playheadTime + dt;
      if (next >= duration) { setPlayhead(duration); togglePlay(); return; }
      setPlayhead(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying]);
}

export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { showAIPanel, showCollabPanel, loadProject } = useEditorStore();
  usePlaybackEngine();

  useEffect(() => {
    if (projectId && projectId !== 'new') loadProject(projectId);
  }, [projectId]);

  return (
    <div className="editor-shell" onContextMenu={e => e.preventDefault()}>
      <Toolbar />
      <div className="workspace">
        <BinPanel />
        <div className="canvas-area" style={{ position: 'relative' }}>
          <MonitorArea />
          {showAIPanel && <AIPanel />}
        </div>
        <InspectorPanel />
      </div>
      <Timeline />
      <StatusBar />
    </div>
  );
}
