// ─── Subtitle Editor Panel ────────────────────────────────────────────────────
// Panel for generating, editing, and exporting subtitle / caption tracks.
//
// Features:
// - Scrollable cue list with timecode in/out and inline text editing
// - Click a cue to navigate the playhead
// - "Generate" triggers Web Speech API STT via SubtitleEngine
// - "Add to Timeline" places cues on a SUBTITLE track
// - Style controls: font size, position, background opacity
// - Export as SRT / VTT
// - Progress indicator during generation
// - Speaker tags per cue

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useEditorStore, type SubtitleCue, type SubtitleTrack } from '../../store/editor.store';
import { subtitleEngine, type SubtitleSegment } from '../../engine/SubtitleEngine';
import { Timecode } from '../../lib/timecode';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createId(prefix: string): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Styles (inline, referencing design-system CSS vars) ────────────────────

const S = {
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-ui)',
    fontSize: 12,
    overflow: 'hidden',
    minWidth: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 12px',
    height: 32,
    background: 'var(--bg-raised)',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  },
  headerTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: '1.2px',
    textTransform: 'uppercase' as const,
    color: 'var(--text-tertiary)',
  },
  headerRight: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
    padding: '2px 4px',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
    flexWrap: 'wrap' as const,
  },
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 12px',
    borderRadius: 'var(--radius-md)',
    fontSize: 11,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    background: 'var(--brand)',
    color: '#fff',
    transition: 'all 150ms',
    lineHeight: 1,
    whiteSpace: 'nowrap' as const,
  },
  btnSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 10px',
    borderRadius: 'var(--radius-md)',
    fontSize: 11,
    fontWeight: 500,
    border: '1px solid var(--border-default)',
    cursor: 'pointer',
    background: 'var(--bg-elevated)',
    color: 'var(--text-secondary)',
    transition: 'all 150ms',
    lineHeight: 1,
    whiteSpace: 'nowrap' as const,
  },
  btnGhost: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    borderRadius: 'var(--radius-md)',
    fontSize: 11,
    fontWeight: 500,
    border: '1px solid var(--border-subtle)',
    cursor: 'pointer',
    background: 'transparent',
    color: 'var(--text-secondary)',
    transition: 'all 150ms',
    lineHeight: 1,
    whiteSpace: 'nowrap' as const,
  },
  btnDisabled: {
    opacity: 0.45,
    pointerEvents: 'none' as const,
  },
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
    padding: 0,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
    color: 'var(--text-muted)',
    textAlign: 'center' as const,
    fontSize: 12,
  },
  emptyIcon: {
    fontSize: 28,
    opacity: 0.4,
  },
  progressBar: {
    height: 3,
    background: 'var(--bg-elevated)',
    flexShrink: 0,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'var(--brand-bright)',
    transition: 'width 200ms ease-out',
  },
  progressLabel: {
    padding: '4px 12px',
    fontSize: 10,
    color: 'var(--text-secondary)',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  cueRow: {
    display: 'flex',
    alignItems: 'stretch',
    borderBottom: '1px solid var(--border-subtle)',
    cursor: 'pointer',
    transition: 'background 100ms',
    minHeight: 36,
  },
  cueRowHover: {
    background: 'var(--bg-hover)',
  },
  cueRowActive: {
    background: 'var(--accent-muted)',
    borderLeft: '2px solid var(--brand-bright)',
  },
  cueIndex: {
    width: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--text-muted)',
    flexShrink: 0,
  },
  cueTimecodes: {
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    gap: 1,
    padding: '4px 8px',
    width: 100,
    flexShrink: 0,
    borderRight: '1px solid var(--border-subtle)',
  },
  cueTC: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--text-secondary)',
    letterSpacing: '0.02em',
  },
  cueSpeaker: {
    padding: '4px 6px',
    width: 72,
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    borderRight: '1px solid var(--border-subtle)',
  },
  cueSpeakerBadge: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    color: 'var(--track-sub)',
    background: 'rgba(90,184,217,0.12)',
    padding: '2px 5px',
    borderRadius: 3,
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  cueText: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    padding: '4px 8px',
    minWidth: 0,
  },
  cueTextInput: {
    width: '100%',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-primary)',
    fontSize: 12,
    fontFamily: 'inherit',
    outline: 'none',
    padding: '2px 0',
  },
  cueActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '0 8px',
    flexShrink: 0,
  },
  cueDeleteBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 12,
    padding: '2px 4px',
    borderRadius: 'var(--radius-sm)',
    transition: 'all 100ms',
    lineHeight: 1,
  },
  styleSection: {
    padding: '8px 12px',
    borderTop: '1px solid var(--border-default)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    flexShrink: 0,
    background: 'var(--bg-raised)',
  },
  styleSectionTitle: {
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
  },
  styleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  styleLabel: {
    fontSize: 11,
    color: 'var(--text-secondary)',
    width: 72,
    flexShrink: 0,
  },
  styleInput: {
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontSize: 11,
    padding: '3px 7px',
    outline: 'none',
    width: 56,
    fontFamily: 'var(--font-mono)',
  },
  select: {
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontSize: 11,
    padding: '3px 7px',
    outline: 'none',
    cursor: 'pointer',
  },
  slider: {
    WebkitAppearance: 'none' as const,
    height: 3,
    background: 'var(--bg-overlay)',
    borderRadius: 2,
    outline: 'none',
    cursor: 'pointer',
    flex: 1,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    borderTop: '1px solid var(--border-default)',
    background: 'var(--bg-raised)',
    flexShrink: 0,
  },
  footerText: {
    fontSize: 10,
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
  },
} as const;

// ─── Component ──────────────────────────────────────────────────────────────

export const SubtitleEditor: React.FC = () => {
  // -- Store bindings -------------------------------------------------------

  const subtitleTracks = useEditorStore((s) => s.subtitleTracks);
  const addSubtitleTrack = useEditorStore((s) => s.addSubtitleTrack);
  const addSubtitleCue = useEditorStore((s) => s.addSubtitleCue);
  const removeSubtitleCue = useEditorStore((s) => s.removeSubtitleCue);
  const toggleSubtitleEditor = useEditorStore((s) => s.toggleSubtitleEditor);
  const showSubtitleEditor = useEditorStore((s) => s.showSubtitleEditor);
  const playheadTime = useEditorStore((s) => s.playheadTime);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const sequenceSettings = useEditorStore((s) => s.sequenceSettings);
  const addTrack = useEditorStore((s) => s.addTrack);

  // -- Local state ----------------------------------------------------------

  const [segments, setSegments] = useState<SubtitleSegment[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  const [hoveredCueIdx, setHoveredCueIdx] = useState<number | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [language, setLanguage] = useState('en-US');

  // Style controls
  const [fontSize, setFontSize] = useState(24);
  const [position, setPosition] = useState<'top' | 'center' | 'bottom'>('bottom');
  const [bgOpacity, setBgOpacity] = useState(0.6);
  const [maxCharsPerLine, setMaxCharsPerLine] = useState(42);

  // Map UI position to SubtitleCue style position
  const cuePosition = position === 'center' ? 'custom' as const : position;
  const cueY = position === 'center' ? 0.45 : undefined;

  const listRef = useRef<HTMLDivElement>(null);

  // -- Timecode helper ------------------------------------------------------

  const tc = useMemo(
    () =>
      new Timecode({
        fps: sequenceSettings.fps,
        dropFrame: sequenceSettings.dropFrame,
        startOffset: sequenceSettings.startTC,
      }),
    [sequenceSettings.fps, sequenceSettings.dropFrame, sequenceSettings.startTC],
  );

  // -- Determine the active cue at current playhead -------------------------

  const activeCueIdx = useMemo(() => {
    for (let i = 0; i < segments.length; i++) {
      if (playheadTime >= segments[i]!.start && playheadTime <= segments[i]!.end) {
        return i;
      }
    }
    return -1;
  }, [segments, playheadTime]);

  // -- Subscribe to engine progress -----------------------------------------

  useEffect(() => {
    const unsub = subtitleEngine.subscribe((p, status) => {
      setProgress(p);
      setProgressStatus(status);
    });
    return unsub;
  }, []);

  // -- Auto-scroll to active cue -------------------------------------------

  useEffect(() => {
    if (activeCueIdx >= 0 && listRef.current) {
      const row = listRef.current.children[activeCueIdx] as HTMLElement | undefined;
      if (row) {
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [activeCueIdx]);

  // -- Handlers -------------------------------------------------------------

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setProgress(0);
    setProgressStatus('Starting...');

    try {
      // Attempt to find a video/audio element on the page to use as source
      const mediaEl =
        document.querySelector<HTMLVideoElement>('video') ??
        document.querySelector<HTMLAudioElement>('audio');

      let result: SubtitleSegment[];
      if (mediaEl) {
        result = await subtitleEngine.generateFromMediaElement(mediaEl, { language });
      } else {
        // Fallback: generate demo data without a media element
        result = await subtitleEngine.generateFromBlob(new Blob(), { language });
      }

      setSegments(result);
    } catch (err) {
      console.error('[SubtitleEditor] Generation failed:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [language]);

  const handleCueClick = useCallback(
    (seg: SubtitleSegment) => {
      setPlayhead(seg.start);
    },
    [setPlayhead],
  );

  const handleCueTextChange = useCallback(
    (idx: number, newText: string) => {
      setSegments((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx]!, text: newText };
        return next;
      });
    },
    [],
  );

  const handleDeleteCue = useCallback((idx: number) => {
    setSegments((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleAddToTimeline = useCallback(() => {
    if (segments.length === 0) return;

    // Create or find a subtitle track
    let trackId: string;
    const existingTrack = subtitleTracks[0];

    if (existingTrack) {
      trackId = existingTrack.id;
    } else {
      trackId = createId('sub-track');
      const newTrack: SubtitleTrack = {
        id: trackId,
        name: 'Subtitles',
        language,
        cues: [],
      };
      addSubtitleTrack(newTrack);
    }

    // Add cues to the subtitle track
    for (const seg of segments) {
      const cue: SubtitleCue = {
        id: createId('sub-cue'),
        start: seg.start,
        end: seg.end,
        text: seg.text,
        speaker: seg.speaker,
        style: {
          fontSize,
          position: cuePosition,
          y: cueY,
          bgOpacity,
        },
      };
      addSubtitleCue(trackId, cue);
    }

    // Also add a SUBTITLE track in the timeline if not present
    const timelineTracks = useEditorStore.getState().tracks;
    const hasSubTrack = timelineTracks.some((t) => t.type === 'SUBTITLE');
    if (!hasSubTrack) {
      addTrack({
        id: createId('t-sub'),
        name: 'SUB',
        type: 'SUBTITLE',
        sortOrder: timelineTracks.length,
        muted: false,
        locked: false,
        solo: false,
        volume: 1,
        clips: [],
        color: '#5ab8d9',
      });
    }
  }, [
    segments,
    subtitleTracks,
    language,
    fontSize,
    cuePosition,
    cueY,
    bgOpacity,
    addSubtitleTrack,
    addSubtitleCue,
    addTrack,
  ]);

  const handleExportSRT = useCallback(() => {
    if (segments.length === 0) return;
    const srt = subtitleEngine.formatAsSRT(segments);
    downloadFile(srt, 'subtitles.srt', 'text/plain');
  }, [segments]);

  const handleExportVTT = useCallback(() => {
    if (segments.length === 0) return;
    const vtt = subtitleEngine.formatAsVTT(segments);
    downloadFile(vtt, 'subtitles.vtt', 'text/vtt');
  }, [segments]);

  // -- Early return if panel hidden -----------------------------------------

  if (!showSubtitleEditor) return null;

  // -- Render ---------------------------------------------------------------

  const hasCues = segments.length > 0;

  return (
    <div style={S.panel}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.headerTitle}>Subtitle Editor</span>
        <div style={S.headerRight}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {hasCues ? `${segments.length} cues` : 'No cues'}
          </span>
          <button style={S.closeBtn} onClick={toggleSubtitleEditor} title="Close">
            &#x2715;
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div style={S.toolbar}>
        <button
          style={{
            ...S.btnPrimary,
            ...(isGenerating ? S.btnDisabled : {}),
          }}
          onClick={handleGenerate}
          disabled={isGenerating}
          title="Generate subtitles using AI speech recognition"
        >
          {isGenerating ? 'Generating...' : 'Generate'}
        </button>
        <span style={{
          fontSize: 9,
          color: 'var(--ai-accent)',
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase' as const,
        }}>
          AI
        </span>

        <select
          style={S.select}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          title="Language"
        >
          <option value="en-US">English (US)</option>
          <option value="en-GB">English (UK)</option>
          <option value="es-ES">Spanish</option>
          <option value="fr-FR">French</option>
          <option value="de-DE">German</option>
          <option value="ja-JP">Japanese</option>
          <option value="zh-CN">Chinese (Simplified)</option>
          <option value="pt-BR">Portuguese (BR)</option>
          <option value="ko-KR">Korean</option>
          <option value="it-IT">Italian</option>
        </select>

        <div style={{ flex: 1 }} />

        <button
          style={{
            ...S.btnSecondary,
            ...(hasCues ? {} : S.btnDisabled),
          }}
          onClick={handleAddToTimeline}
          disabled={!hasCues}
          title="Place subtitle cues on a SUBTITLE track"
        >
          Add to Timeline
        </button>

        <button
          style={{
            ...S.btnGhost,
            ...(hasCues ? {} : S.btnDisabled),
          }}
          onClick={handleExportSRT}
          disabled={!hasCues}
          title="Export as SRT file"
        >
          SRT
        </button>

        <button
          style={{
            ...S.btnGhost,
            ...(hasCues ? {} : S.btnDisabled),
          }}
          onClick={handleExportVTT}
          disabled={!hasCues}
          title="Export as WebVTT file"
        >
          VTT
        </button>
      </div>

      {/* Progress bar */}
      {isGenerating && (
        <>
          <div style={S.progressBar}>
            <div style={{ ...S.progressFill, width: `${progress}%` }} />
          </div>
          <div style={S.progressLabel}>{progressStatus}</div>
        </>
      )}

      {/* Cue list */}
      <div style={S.body} ref={listRef}>
        {!hasCues && !isGenerating && (
          <div style={S.emptyState}>
            <div style={S.emptyIcon}>CC</div>
            <div>No subtitle cues yet.</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              Click <strong>Generate</strong> to create subtitles from
              <br />
              the timeline audio using AI speech recognition.
            </div>
          </div>
        )}

        {segments.map((seg, idx) => {
          const isActive = idx === activeCueIdx;
          const isHovered = idx === hoveredCueIdx;
          const isEditing = idx === editingIdx;

          return (
            <div
              key={`${seg.start}-${idx}`}
              style={{
                ...S.cueRow,
                ...(isActive ? S.cueRowActive : isHovered ? S.cueRowHover : {}),
              }}
              onMouseEnter={() => setHoveredCueIdx(idx)}
              onMouseLeave={() => setHoveredCueIdx(null)}
              onClick={() => handleCueClick(seg)}
            >
              {/* Index */}
              <div style={S.cueIndex}>{idx + 1}</div>

              {/* Timecodes */}
              <div style={S.cueTimecodes}>
                <span style={S.cueTC}>{tc.secondsToTC(seg.start)}</span>
                <span style={{ ...S.cueTC, color: 'var(--text-muted)' }}>
                  {tc.secondsToTC(seg.end)}
                </span>
              </div>

              {/* Speaker */}
              <div style={S.cueSpeaker}>
                {seg.speaker && (
                  <span style={S.cueSpeakerBadge}>{seg.speaker}</span>
                )}
              </div>

              {/* Text */}
              <div style={S.cueText}>
                {isEditing ? (
                  <input
                    style={S.cueTextInput}
                    value={seg.text}
                    onChange={(e) => handleCueTextChange(idx, e.target.value)}
                    onBlur={() => setEditingIdx(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') {
                        setEditingIdx(null);
                      }
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      cursor: 'text',
                      flex: 1,
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingIdx(idx);
                    }}
                    title="Double-click to edit"
                  >
                    {seg.text}
                  </span>
                )}
              </div>

              {/* Confidence + delete */}
              <div style={S.cueActions}>
                {seg.confidence != null && (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      color:
                        seg.confidence > 0.9
                          ? 'var(--success)'
                          : seg.confidence > 0.7
                            ? 'var(--warning)'
                            : 'var(--error)',
                      marginRight: 2,
                    }}
                  >
                    {Math.round(seg.confidence * 100)}%
                  </span>
                )}
                {isHovered && (
                  <button
                    style={S.cueDeleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCue(idx);
                    }}
                    title="Remove cue"
                  >
                    &#x2715;
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Style controls */}
      {hasCues && (
        <div style={S.styleSection}>
          <div style={S.styleSectionTitle}>Style</div>

          {/* Font size */}
          <div style={S.styleRow}>
            <span style={S.styleLabel}>Font size</span>
            <input
              type="number"
              style={S.styleInput}
              value={fontSize}
              min={12}
              max={72}
              onChange={(e) => setFontSize(Number(e.target.value))}
            />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>px</span>
          </div>

          {/* Position */}
          <div style={S.styleRow}>
            <span style={S.styleLabel}>Position</span>
            <select
              style={S.select}
              value={position}
              onChange={(e) => setPosition(e.target.value as 'top' | 'center' | 'bottom')}
            >
              <option value="bottom">Bottom</option>
              <option value="center">Center</option>
              <option value="top">Top</option>
            </select>
          </div>

          {/* Max chars per line */}
          <div style={S.styleRow}>
            <span style={S.styleLabel}>Max chars</span>
            <input
              type="number"
              style={S.styleInput}
              value={maxCharsPerLine}
              min={20}
              max={80}
              onChange={(e) => setMaxCharsPerLine(Number(e.target.value))}
            />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>/line</span>
          </div>

          {/* Background opacity */}
          <div style={S.styleRow}>
            <span style={S.styleLabel}>BG opacity</span>
            <input
              type="range"
              style={S.slider}
              min={0}
              max={1}
              step={0.05}
              value={bgOpacity}
              onChange={(e) => setBgOpacity(Number(e.target.value))}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-secondary)',
                width: 32,
                textAlign: 'right' as const,
              }}
            >
              {Math.round(bgOpacity * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={S.footer}>
        <span style={S.footerText}>
          {tc.secondsToTC(playheadTime)}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {sequenceSettings.fps}fps
          {sequenceSettings.dropFrame ? ' DF' : ' NDF'}
        </span>
      </div>
    </div>
  );
};

export default SubtitleEditor;
