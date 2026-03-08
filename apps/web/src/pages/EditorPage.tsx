import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Toolbar } from '../components/Toolbar/Toolbar';
import { BinPanel } from '../components/Bins/BinPanel';
import { MonitorArea } from '../components/Monitor/MonitorArea';
import { TimelinePanel } from '../components/TimelinePanel/TimelinePanel';
import { InspectorPanel } from '../components/Editor/InspectorPanel';
import { AIPanel } from '../components/AIPanel/AIPanel';
import { TranscriptPanel } from '../components/TranscriptPanel/TranscriptPanel';
import { CommandPalette } from '../components/AIPanel/CommandPalette';
import { ExportPanel } from '../components/ExportPanel/ExportPanel';
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
  const { showAIPanel, showExportPanel, showTranscriptPanel, toggleExportPanel, loadProject, showInspector } = useEditorStore();
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  usePlaybackEngine();

  useEffect(() => {
    if (projectId && projectId !== 'new') loadProject(projectId);
  }, [projectId]);

  // ⌘K / Ctrl+K to open command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="editor-shell" onContextMenu={e => e.preventDefault()}>
      <Toolbar />
      <div className={`workspace${showInspector ? '' : ' no-inspector'}`}>
        <div className="left-panels">
          <BinPanel />
          {showTranscriptPanel && <TranscriptPanel />}
        </div>
        <div className="canvas-area" style={{ position: 'relative' }}>
          <MonitorArea />
          {showAIPanel && <AIPanel />}
        </div>
        {showInspector && <InspectorPanel />}
      </div>
      <TimelinePanel />
      <StatusBar />

      {/* Command Palette (⌘K) */}
      {showCommandPalette && (
        <CommandPalette onClose={() => setShowCommandPalette(false)} />
      )}

      {showExportPanel && (
        <div
          className="export-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) toggleExportPanel(); }}
          onKeyDown={(e) => { if (e.key === 'Escape') toggleExportPanel(); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            width: '90%', maxWidth: 680, height: '85vh', maxHeight: 720,
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden', position: 'relative',
            boxShadow: 'var(--shadow-lg)',
          }}>
            <button
              onClick={toggleExportPanel}
              style={{
                position: 'absolute', top: 10, right: 12, zIndex: 10,
                background: 'transparent', border: 'none',
                color: 'var(--text-tertiary)', fontSize: 18,
                cursor: 'pointer', lineHeight: 1,
              }}
              title="Close (Esc)"
            >✕</button>
            <ExportPanel />
          </div>
        </div>
      )}
    </div>
  );
}
