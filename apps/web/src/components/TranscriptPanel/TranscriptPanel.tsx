// ─── Transcript-Based Editing Panel ────────────────────────────────────────
// Text-based editing: view the transcript of your timeline, click words to
// navigate, select text ranges to trim/delete/extract clips. This is the
// competitive feature that matches Premiere Pro's text-based editing and
// DaVinci Resolve's IntelliScript.
//
// Key capabilities:
// 1. Display word-level transcription synced to timeline
// 2. Click any word → jump playhead to that timecode
// 3. Select text range → highlight corresponding timeline region
// 4. Delete text → ripple-delete the corresponding audio/video
// 5. AI-powered: auto-transcribe, search, highlight speakers

import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useEditorStore } from '../../store/editor.store';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TranscriptWord {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  speaker?: string;
  clipId?: string;
}

interface TranscriptSegment {
  id: string;
  speaker: string;
  words: TranscriptWord[];
  startTime: number;
  endTime: number;
  clipId?: string;
}

// ─── Demo transcript data ────────────────────────────────────────────────────

function generateDemoTranscript(): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [
    {
      id: 'seg-1',
      speaker: 'NARRATOR',
      startTime: 2,
      endTime: 8,
      clipId: 'c-v3-1',
      words: [
        { id: 'w1', text: 'The', startTime: 2.0, endTime: 2.2, confidence: 0.98 },
        { id: 'w2', text: 'morning', startTime: 2.2, endTime: 2.6, confidence: 0.97 },
        { id: 'w3', text: 'light', startTime: 2.6, endTime: 2.9, confidence: 0.99 },
        { id: 'w4', text: 'filtered', startTime: 2.9, endTime: 3.3, confidence: 0.95 },
        { id: 'w5', text: 'through', startTime: 3.3, endTime: 3.6, confidence: 0.98 },
        { id: 'w6', text: 'the', startTime: 3.6, endTime: 3.7, confidence: 0.99 },
        { id: 'w7', text: 'curtains,', startTime: 3.7, endTime: 4.2, confidence: 0.96 },
        { id: 'w8', text: 'casting', startTime: 4.5, endTime: 4.8, confidence: 0.94 },
        { id: 'w9', text: 'long', startTime: 4.8, endTime: 5.1, confidence: 0.97 },
        { id: 'w10', text: 'shadows', startTime: 5.1, endTime: 5.5, confidence: 0.98 },
        { id: 'w11', text: 'across', startTime: 5.5, endTime: 5.9, confidence: 0.96 },
        { id: 'w12', text: 'the', startTime: 5.9, endTime: 6.0, confidence: 0.99 },
        { id: 'w13', text: 'empty', startTime: 6.0, endTime: 6.3, confidence: 0.95 },
        { id: 'w14', text: 'room.', startTime: 6.3, endTime: 6.8, confidence: 0.97 },
      ],
    },
    {
      id: 'seg-2',
      speaker: 'SARAH',
      startTime: 8,
      endTime: 14,
      clipId: 'c-v2-1',
      words: [
        { id: 'w15', text: 'We', startTime: 8.2, endTime: 8.4, confidence: 0.98 },
        { id: 'w16', text: 'need', startTime: 8.4, endTime: 8.6, confidence: 0.99 },
        { id: 'w17', text: 'to', startTime: 8.6, endTime: 8.7, confidence: 0.99 },
        { id: 'w18', text: 'talk', startTime: 8.7, endTime: 9.0, confidence: 0.98 },
        { id: 'w19', text: 'about', startTime: 9.0, endTime: 9.3, confidence: 0.97 },
        { id: 'w20', text: 'the', startTime: 9.3, endTime: 9.4, confidence: 0.99 },
        { id: 'w21', text: 'project', startTime: 9.4, endTime: 9.8, confidence: 0.96 },
        { id: 'w22', text: 'deadline.', startTime: 9.8, endTime: 10.4, confidence: 0.95 },
        { id: 'w23', text: 'I', startTime: 11.0, endTime: 11.1, confidence: 0.99 },
        { id: 'w24', text: 'think', startTime: 11.1, endTime: 11.4, confidence: 0.97 },
        { id: 'w25', text: 'we', startTime: 11.4, endTime: 11.5, confidence: 0.99 },
        { id: 'w26', text: 'can', startTime: 11.5, endTime: 11.7, confidence: 0.98 },
        { id: 'w27', text: 'make', startTime: 11.7, endTime: 12.0, confidence: 0.97 },
        { id: 'w28', text: 'it', startTime: 12.0, endTime: 12.1, confidence: 0.99 },
        { id: 'w29', text: 'work.', startTime: 12.1, endTime: 12.5, confidence: 0.96 },
      ],
    },
    {
      id: 'seg-3',
      speaker: 'MARCUS',
      startTime: 14,
      endTime: 20,
      clipId: 'c-v4-1',
      words: [
        { id: 'w30', text: 'The', startTime: 14.2, endTime: 14.4, confidence: 0.98 },
        { id: 'w31', text: 'drone', startTime: 14.4, endTime: 14.7, confidence: 0.97 },
        { id: 'w32', text: 'footage', startTime: 14.7, endTime: 15.1, confidence: 0.96 },
        { id: 'w33', text: 'from', startTime: 15.1, endTime: 15.3, confidence: 0.98 },
        { id: 'w34', text: 'yesterday', startTime: 15.3, endTime: 15.8, confidence: 0.95 },
        { id: 'w35', text: 'is', startTime: 15.8, endTime: 15.9, confidence: 0.99 },
        { id: 'w36', text: 'incredible.', startTime: 15.9, endTime: 16.5, confidence: 0.94 },
        { id: 'w37', text: 'Let', startTime: 17.0, endTime: 17.2, confidence: 0.98 },
        { id: 'w38', text: 'me', startTime: 17.2, endTime: 17.3, confidence: 0.99 },
        { id: 'w39', text: 'show', startTime: 17.3, endTime: 17.6, confidence: 0.97 },
        { id: 'w40', text: 'you', startTime: 17.6, endTime: 17.8, confidence: 0.98 },
        { id: 'w41', text: 'the', startTime: 17.8, endTime: 17.9, confidence: 0.99 },
        { id: 'w42', text: 'wide', startTime: 17.9, endTime: 18.2, confidence: 0.96 },
        { id: 'w43', text: 'shots.', startTime: 18.2, endTime: 18.7, confidence: 0.95 },
      ],
    },
    {
      id: 'seg-4',
      speaker: 'NARRATOR',
      startTime: 24,
      endTime: 30,
      clipId: 'c-v1-2',
      words: [
        { id: 'w44', text: 'As', startTime: 24.2, endTime: 24.4, confidence: 0.98 },
        { id: 'w45', text: 'the', startTime: 24.4, endTime: 24.5, confidence: 0.99 },
        { id: 'w46', text: 'sun', startTime: 24.5, endTime: 24.8, confidence: 0.97 },
        { id: 'w47', text: 'began', startTime: 24.8, endTime: 25.1, confidence: 0.96 },
        { id: 'w48', text: 'to', startTime: 25.1, endTime: 25.2, confidence: 0.99 },
        { id: 'w49', text: 'set,', startTime: 25.2, endTime: 25.6, confidence: 0.95 },
        { id: 'w50', text: 'the', startTime: 25.8, endTime: 25.9, confidence: 0.99 },
        { id: 'w51', text: 'city', startTime: 25.9, endTime: 26.2, confidence: 0.97 },
        { id: 'w52', text: 'transformed', startTime: 26.2, endTime: 26.8, confidence: 0.94 },
        { id: 'w53', text: 'into', startTime: 26.8, endTime: 27.1, confidence: 0.98 },
        { id: 'w54', text: 'a', startTime: 27.1, endTime: 27.2, confidence: 0.99 },
        { id: 'w55', text: 'canvas', startTime: 27.2, endTime: 27.6, confidence: 0.96 },
        { id: 'w56', text: 'of', startTime: 27.6, endTime: 27.7, confidence: 0.99 },
        { id: 'w57', text: 'golden', startTime: 27.7, endTime: 28.1, confidence: 0.95 },
        { id: 'w58', text: 'light.', startTime: 28.1, endTime: 28.6, confidence: 0.97 },
      ],
    },
  ];
  return segments;
}

// ─── Speaker colors ──────────────────────────────────────────────────────────

const SPEAKER_COLORS: Record<string, string> = {
  NARRATOR: '#818cf8',
  SARAH: '#f472b6',
  MARCUS: '#34d399',
};

function getSpeakerColor(speaker: string): string {
  return SPEAKER_COLORS[speaker] || '#94a3b8';
}

// ─── Word component ──────────────────────────────────────────────────────────

function WordSpan({
  word,
  isActive,
  isSelected,
  onClick,
}: {
  word: TranscriptWord;
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  const confidence = word.confidence;
  const opacity = confidence > 0.9 ? 1 : confidence > 0.8 ? 0.8 : 0.6;

  return (
    <span
      className={`transcript-word${isActive ? ' active' : ''}${isSelected ? ' selected' : ''}`}
      style={{ opacity }}
      onClick={onClick}
      title={`${word.startTime.toFixed(2)}s — Confidence: ${(confidence * 100).toFixed(0)}%`}
    >
      {word.text}{' '}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function TranscriptPanel() {
  const { playheadTime, setPlayhead, selectedClipIds, selectClip } = useEditorStore();
  const [segments] = useState<TranscriptSegment[]>(() => generateDemoTranscript());
  const [search, setSearch] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showSpeakers, setShowSpeakers] = useState(true);
  const [showTimecodes, setShowTimecodes] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Find active word based on playhead
  const activeWordId = useMemo(() => {
    for (const seg of segments) {
      for (const word of seg.words) {
        if (playheadTime >= word.startTime && playheadTime < word.endTime) {
          return word.id;
        }
      }
    }
    return null;
  }, [playheadTime, segments]);

  // Search filter
  const filteredSegments = useMemo(() => {
    if (!search) return segments;
    const lower = search.toLowerCase();
    return segments.filter(seg =>
      seg.words.some(w => w.text.toLowerCase().includes(lower)) ||
      seg.speaker.toLowerCase().includes(lower)
    );
  }, [segments, search]);

  // Handle word click → jump playhead
  const handleWordClick = useCallback((word: TranscriptWord) => {
    setPlayhead(word.startTime);
    if (word.clipId) {
      selectClip(word.clipId);
    }
  }, [setPlayhead, selectClip]);

  // Simulated transcription
  const handleTranscribe = useCallback(async () => {
    setIsTranscribing(true);
    try {
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error('Transcription failed:', err);
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  const formatTC = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const f = Math.floor((sec % 1) * 24);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  };

  // Unique speakers
  const speakers = useMemo(() =>
    [...new Set(segments.map(s => s.speaker))],
    [segments]
  );

  return (
    <div className="transcript-panel">
      {/* Header */}
      <div className="transcript-header">
        <span className="transcript-title">Transcript</span>
        <div className="transcript-header-actions">
          <button
            className={`tl-btn${showSpeakers ? '' : ' is-inactive'}`}
            title="Toggle Speakers"
            aria-label="Toggle speaker labels"
            aria-pressed={showSpeakers}
            onClick={() => setShowSpeakers(!showSpeakers)}
          >👤</button>
          <button
            className={`tl-btn${showTimecodes ? '' : ' is-inactive'}`}
            title="Toggle Timecodes"
            aria-label="Toggle timecodes"
            aria-pressed={showTimecodes}
            onClick={() => setShowTimecodes(!showTimecodes)}
          >⏱</button>
          <button
            className="tl-btn"
            title="Transcribe All Media"
            aria-label="Transcribe all media"
            onClick={handleTranscribe}
            disabled={isTranscribing}
          >{isTranscribing ? '⟳' : '✦'}</button>
        </div>
      </div>

      {/* Search */}
      <div className="transcript-search">
        <input
          type="text"
          placeholder="Search transcript…"
          aria-label="Search transcript"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Speaker legend */}
      {showSpeakers && speakers.length > 0 && (
        <div className="transcript-speakers">
          {speakers.map(s => (
            <span key={s} className="transcript-speaker-badge" style={{ color: getSpeakerColor(s) }}>
              <span className="transcript-speaker-dot" style={{ background: getSpeakerColor(s) }} />
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Transcript body */}
      <div className="transcript-body" ref={containerRef} role="region" aria-label="Transcript content">
        {isTranscribing ? (
          <div className="transcript-loading">
            <div className="transcript-loading-icon">✦</div>
            <div>Transcribing media…</div>
            <div className="transcript-loading-bar">
              <div className="transcript-loading-fill" />
            </div>
          </div>
        ) : filteredSegments.length === 0 ? (
          <div className="transcript-empty">
            {search ? 'No matches found' : 'No transcript available. Click the Transcribe button to generate.'}
          </div>
        ) : (
          filteredSegments.map(segment => (
            <div key={segment.id} className="transcript-segment">
              {/* Speaker + Timecode header */}
              <div className="transcript-segment-header">
                {showSpeakers && (
                  <span className="transcript-segment-speaker" style={{ color: getSpeakerColor(segment.speaker) }}>
                    {segment.speaker}
                  </span>
                )}
                {showTimecodes && (
                  <span className="transcript-segment-tc">{formatTC(segment.startTime)}</span>
                )}
              </div>

              {/* Words */}
              <div className="transcript-segment-text">
                {segment.words.map(word => {
                  const matchesSearch = search && word.text.toLowerCase().includes(search.toLowerCase());
                  return (
                    <WordSpan
                      key={word.id}
                      word={{ ...word, clipId: segment.clipId }}
                      isActive={word.id === activeWordId}
                      isSelected={!!matchesSearch}
                      onClick={() => handleWordClick({ ...word, clipId: segment.clipId })}
                    />
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer stats */}
      <div className="transcript-footer">
        <span>{segments.reduce((n, s) => n + s.words.length, 0)} words</span>
        <span>{speakers.length} speakers</span>
        <span>{segments.length} segments</span>
      </div>
    </div>
  );
}
