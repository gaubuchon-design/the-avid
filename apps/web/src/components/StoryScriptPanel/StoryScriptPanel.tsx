// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Story Script Panel (N-09)
//  Story script / teleprompter panel with scrollable script content,
//  story metadata, teleprompter mode (larger font, dark bg, auto-scroll),
//  CG/Super cue marks inline, word count, and estimated read time.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNewsStore } from '../../store/news.store';
import type { RundownEvent, StoryStatus, RundownMediaItem } from '@mcua/core';

// ─── Constants ─────────────────────────────────────────────────────────────

const WORDS_PER_MINUTE = 150; // broadcast read speed

const STATUS_COLORS: Record<StoryStatus, string> = {
  UNASSIGNED: '#9ca3af',
  IN_EDIT:    '#3b82f6',
  READY:      '#22c55e',
  AIRED:      '#a855f7',
  KILLED:     '#ef4444',
};

const STATUS_LABELS: Record<StoryStatus, string> = {
  UNASSIGNED: 'Unassigned',
  IN_EDIT:    'In Edit',
  READY:      'Ready',
  AIRED:      'Aired',
  KILLED:     'Killed',
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDurationShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function stripCueMarks(text: string): string {
  return text.replace(/\{\{[^}]+\}\}/g, '').trim();
}

function countWords(text: string): number {
  const plain = stripCueMarks(text);
  return plain.split(/\s+/).filter((w) => w.length > 0).length;
}

function estimateReadTime(wordCount: number): string {
  const seconds = Math.round((wordCount / WORDS_PER_MINUTE) * 60);
  return formatDurationShort(seconds);
}

// ─── Script Text Renderer ──────────────────────────────────────────────────

function ScriptTextRenderer({ text, teleprompterMode }: { text: string; teleprompterMode: boolean }) {
  const parts = useMemo(() => {
    const segments: Array<{ text: string; type: 'text' | 'super' | 'location' }> = [];
    const pattern = /\{\{(SUPER|LOCATION):\s*([^}]+)\}\}/gi;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ text: text.slice(lastIndex, match.index), type: 'text' });
      }
      segments.push({
        text: match[2]!.trim(),
        type: match[1]!.toUpperCase() === 'SUPER' ? 'super' : 'location',
      });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      segments.push({ text: text.slice(lastIndex), type: 'text' });
    }

    return segments;
  }, [text]);

  const baseFontSize = teleprompterMode ? 22 : 12;
  const lineHeight = teleprompterMode ? 2.0 : 1.8;

  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: baseFontSize,
        lineHeight,
        color: teleprompterMode ? '#fff' : 'var(--text-primary)',
        whiteSpace: 'pre-wrap',
      }}
    >
      {parts.map((part, i) => {
        if (part.type === 'super') {
          return (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                padding: teleprompterMode ? '2px 10px' : '1px 6px',
                borderRadius: 'var(--radius-xs, 3px)',
                background: teleprompterMode ? 'rgba(124,92,252,0.3)' : 'rgba(124,92,252,0.15)',
                color: teleprompterMode ? '#c4b5fd' : 'var(--text-accent, #7c5cfc)',
                fontSize: teleprompterMode ? 14 : 10,
                fontWeight: 600,
                verticalAlign: 'baseline',
              }}
            >
              <span style={{ fontSize: teleprompterMode ? 10 : 8, fontWeight: 700 }}>CG</span>
              {part.text}
            </span>
          );
        }
        if (part.type === 'location') {
          return (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                padding: teleprompterMode ? '2px 10px' : '1px 6px',
                borderRadius: 'var(--radius-xs, 3px)',
                background: teleprompterMode ? 'rgba(0,212,170,0.2)' : 'rgba(0,212,170,0.12)',
                color: teleprompterMode ? '#6ee7b7' : 'var(--ai-accent, #00d4aa)',
                fontSize: teleprompterMode ? 14 : 10,
                fontWeight: 600,
                verticalAlign: 'baseline',
              }}
            >
              <span style={{ fontSize: teleprompterMode ? 10 : 8, fontWeight: 700 }}>LOC</span>
              {part.text}
            </span>
          );
        }
        return <span key={i}>{part.text}</span>;
      })}
    </div>
  );
}

// ─── Story Metadata Bar ────────────────────────────────────────────────────

function StoryMetadataBar({ story }: { story: RundownEvent }) {
  const statusColor = STATUS_COLORS[story.status];
  const statusLabel = STATUS_LABELS[story.status];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 12px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-void)',
        flexShrink: 0,
        flexWrap: 'wrap',
        fontSize: 10,
      }}
    >
      {/* Slug */}
      <span
        style={{
          fontWeight: 700,
          fontSize: 11,
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 200,
        }}
      >
        {story.slugline}
      </span>

      {/* Status */}
      <span
        style={{
          padding: '2px 8px',
          borderRadius: 'var(--radius-sm, 4px)',
          background: `${statusColor}20`,
          color: statusColor,
          fontWeight: 600,
          fontSize: 10,
        }}
      >
        {statusLabel}
      </span>

      {/* Duration */}
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
        {formatDurationShort(story.targetDuration)}
      </span>

      {/* Assigned Editor */}
      {story.assignedEditorName && (
        <span style={{ color: 'var(--text-muted)' }}>
          Editor: <span style={{ color: 'var(--text-secondary)' }}>{story.assignedEditorName}</span>
        </span>
      )}
    </div>
  );
}

// ─── StoryScriptPanel Component ────────────────────────────────────────────

export function StoryScriptPanel() {
  const {
    activeStoryId,
    rundowns,
    activeRundownId,
    storyTimers,
    setStoryStatus,
  } = useNewsStore();

  const [teleprompterMode, setTeleprompterMode] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);

  const activeRundown = useMemo(
    () => rundowns.find((r) => r.id === activeRundownId) ?? null,
    [rundowns, activeRundownId],
  );

  const activeStory: RundownEvent | null = useMemo(() => {
    if (!activeRundown || !activeStoryId) return null;
    return activeRundown.stories.find((s) => s.storyId === activeStoryId) ?? null;
  }, [activeRundown, activeStoryId]);

  // Word count and estimated read time
  const wordCount = useMemo(() => {
    if (!activeStory?.scriptText) return 0;
    return countWords(activeStory.scriptText);
  }, [activeStory?.scriptText]);

  const readTime = useMemo(() => estimateReadTime(wordCount), [wordCount]);

  // Auto-scroll logic for teleprompter mode
  useEffect(() => {
    if (!autoScroll || !teleprompterMode || !scrollRef.current) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const scrollSpeed = 0.8; // pixels per frame
    const el = scrollRef.current;

    const tick = () => {
      if (el.scrollTop < el.scrollHeight - el.clientHeight) {
        el.scrollTop += scrollSpeed;
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        setAutoScroll(false);
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [autoScroll, teleprompterMode]);

  // Reset auto-scroll when exiting teleprompter mode
  useEffect(() => {
    if (!teleprompterMode) {
      setAutoScroll(false);
    }
  }, [teleprompterMode]);

  const handleMarkReady = useCallback(() => {
    if (activeStoryId) {
      setStoryStatus(activeStoryId, 'READY');
    }
  }, [activeStoryId, setStoryStatus]);

  const handleToggleTeleprompter = useCallback(() => {
    setTeleprompterMode((prev) => !prev);
  }, []);

  const handleToggleAutoScroll = useCallback(() => {
    if (scrollRef.current && !autoScroll) {
      scrollRef.current.scrollTop = 0;
    }
    setAutoScroll((prev) => !prev);
  }, [autoScroll]);

  // Empty state
  if (!activeStory) {
    return (
      <div className="bin-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="panel-header">
          <span className="panel-title">Script</span>
        </div>
        <div className="panel-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: 24 }}>
            <div style={{ fontSize: 20, opacity: 0.3, marginBottom: 8 }}>&#128220;</div>
            Select a story from the rundown to view its script.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bin-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: teleprompterMode ? '#000' : undefined,
      }}
    >
      {/* Header */}
      <div className="panel-header" style={teleprompterMode ? { background: '#111', borderColor: '#333' } : {}}>
        <span className="panel-title" style={teleprompterMode ? { color: '#fff' } : {}}>Script</span>
        {activeStory.pageNumber && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: teleprompterMode ? '#888' : 'var(--text-muted)',
              background: teleprompterMode ? '#222' : 'var(--bg-elevated)',
              padding: '1px 6px',
              borderRadius: 'var(--radius-xs, 3px)',
            }}
          >
            {activeStory.pageNumber}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {/* Teleprompter Toggle */}
          <button
            className="tl-btn"
            onClick={handleToggleTeleprompter}
            title={teleprompterMode ? 'Exit teleprompter mode' : 'Enter teleprompter mode'}
            style={{
              padding: '2px 8px',
              fontSize: 10,
              fontWeight: 600,
              color: teleprompterMode ? '#22c55e' : 'var(--text-muted)',
              background: teleprompterMode ? 'rgba(34,197,94,0.15)' : 'transparent',
              border: `1px solid ${teleprompterMode ? 'rgba(34,197,94,0.3)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--radius-sm, 4px)',
            }}
          >
            PROMPTER
          </button>

          {/* Auto-Scroll (only in teleprompter mode) */}
          {teleprompterMode && (
            <button
              className="tl-btn"
              onClick={handleToggleAutoScroll}
              title={autoScroll ? 'Stop auto-scroll' : 'Start auto-scroll'}
              style={{
                padding: '2px 8px',
                fontSize: 10,
                fontWeight: 600,
                color: autoScroll ? '#f59e0b' : '#888',
                background: autoScroll ? 'rgba(245,158,11,0.15)' : '#222',
                border: `1px solid ${autoScroll ? 'rgba(245,158,11,0.3)' : '#444'}`,
                borderRadius: 'var(--radius-sm, 4px)',
              }}
            >
              {autoScroll ? 'SCROLLING' : 'SCROLL'}
            </button>
          )}

          {/* Mark Ready */}
          {activeStory.status === 'IN_EDIT' && (
            <button
              className="tl-btn"
              onClick={handleMarkReady}
              style={{
                padding: '3px 10px',
                fontSize: 10,
                fontWeight: 700,
                color: '#000',
                background: '#22c55e',
                border: 'none',
                borderRadius: 'var(--radius-sm, 4px)',
              }}
            >
              Mark Ready
            </button>
          )}
        </div>
      </div>

      {/* Story Metadata */}
      {!teleprompterMode && <StoryMetadataBar story={activeStory} />}

      {/* Script Body */}
      <div
        ref={scrollRef}
        className="panel-body"
        style={{
          flex: 1,
          overflow: 'auto',
          padding: teleprompterMode ? '24px 32px' : '12px 16px',
          minHeight: 0,
          background: teleprompterMode ? '#000' : undefined,
        }}
      >
        {activeStory.scriptText ? (
          <ScriptTextRenderer text={activeStory.scriptText} teleprompterMode={teleprompterMode} />
        ) : (
          <div style={{ color: teleprompterMode ? '#555' : 'var(--text-muted)', fontStyle: 'italic', fontSize: 11 }}>
            No script text available for this story.
          </div>
        )}
      </div>

      {/* Footer: Word Count + Read Time */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '4px 10px',
          background: teleprompterMode ? '#111' : 'var(--bg-void)',
          borderTop: `1px solid ${teleprompterMode ? '#333' : 'var(--border-subtle)'}`,
          fontSize: 10,
          color: teleprompterMode ? '#666' : 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span>{wordCount} words</span>
        <span>Est. read {readTime}</span>
        {activeStory.presenter && (
          <span style={{ marginLeft: 'auto' }}>
            Presenter: {activeStory.presenter}
          </span>
        )}
        {activeStory.backTime && (
          <span>
            Back: {activeStory.backTime}
          </span>
        )}
      </div>
    </div>
  );
}
