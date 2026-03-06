import React, { useEffect } from 'react';
import { useEditorStore } from '../../store/editor.store';
import { Toolbar } from '../Toolbar/Toolbar';
import { BinPanel } from '../Bins/BinPanel';
import { MonitorArea } from '../Monitor/MonitorArea';
import { Timeline } from '../Timeline/Timeline';
import { InspectorPanel } from './InspectorPanel';
import { StatusBar } from './StatusBar';
import { AIFloatingPanel } from './AIFloatingPanel';

export function EditorPage() {
  const { isPlaying, togglePlay, setPlayhead, playheadTime, duration, showAIPanel } = useEditorStore();

  // Playback simulation
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      setPlayhead(playheadTime + 0.1);
    }, 100);
    return () => clearInterval(id);
  }, [isPlaying, playheadTime, setPlayhead]);

  // Auto-stop at end
  useEffect(() => {
    if (isPlaying && playheadTime >= duration) togglePlay();
  }, [playheadTime, duration, isPlaying, togglePlay]);

  return (
    <div className="editor-shell">
      <Toolbar />
      <BinPanel />
      <div className="canvas-area">
        <MonitorArea />
      </div>
      <InspectorPanel />
      <Timeline />
      <StatusBar />
      {showAIPanel && <AIFloatingPanel />}
    </div>
  );
}
