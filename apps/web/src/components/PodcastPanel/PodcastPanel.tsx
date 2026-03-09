// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Podcast Panel
//  Audio-first editing: silence removal, filler words, chapters
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useCallback } from 'react';
import { useCreatorStore } from '../../store/creator.store';
import type {
  PodcastConfig,
  FillerWord,
  FillerWordType,
  SilenceRegion,
  ChapterMarker,
  PodcastExportFormat,
} from '@mcua/core';

// ─── Styles ───────────────────────────────────────────────────────────────

const S = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: 'var(--bg-surface)',
    overflow: 'hidden',
  },
  tabBar: {
    display: 'flex',
    flexShrink: 0,
    borderBottom: '1px solid var(--border-default)',
  },
  tab: (active: boolean) => ({
    flex: 1,
    padding: '7px 6px',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    color: active ? 'var(--brand-bright)' : 'var(--text-muted)',
    border: 'none',
    background: active ? 'var(--bg-hover)' : 'transparent',
    borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'all 150ms',
  }),
  body: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    minHeight: 0,
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  sectionLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    color: 'var(--text-tertiary)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  label: {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    color: 'var(--text-tertiary)',
    minWidth: 85,
  },
  slider: {
    flex: 1,
    height: 3,
    cursor: 'pointer',
  },
  value: {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    color: 'var(--text-secondary)',
    minWidth: 45,
    textAlign: 'right' as const,
  },
  toggle: (active: boolean) => ({
    width: 32,
    height: 16,
    borderRadius: 8,
    background: active ? 'var(--brand)' : 'var(--bg-void)',
    border: `1px solid ${active ? 'var(--brand)' : 'var(--border-default)'}`,
    padding: 0,
    position: 'relative' as const,
    cursor: 'pointer',
    transition: 'all 150ms',
    flexShrink: 0,
  }),
  toggleKnob: (active: boolean) => ({
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: '#fff',
    position: 'absolute' as const,
    top: 1,
    left: active ? 17 : 1,
    transition: 'left 150ms',
  }),
  statCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    background: 'var(--bg-raised)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)',
  },
  statLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    color: 'var(--text-tertiary)',
  },
  statValue: (highlight: boolean) => ({
    fontFamily: 'var(--font-mono)',
    fontSize: '14px',
    fontWeight: 700,
    color: highlight ? 'var(--brand-bright)' : 'var(--text-primary)',
  }),
  fillerItem: (removed: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 10px',
    background: removed ? 'rgba(239,68,68,0.08)' : 'transparent',
    borderRadius: 'var(--radius-sm)',
    opacity: removed ? 0.6 : 1,
  }),
  fillerType: {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--warning)',
    minWidth: 55,
  },
  fillerTime: {
    fontFamily: 'var(--font-mono)',
    fontSize: '9px',
    color: 'var(--text-muted)',
    flex: 1,
  },
  fillerConfidence: {
    fontFamily: 'var(--font-mono)',
    fontSize: '8.5px',
    color: 'var(--text-muted)',
  },
  removeBtn: (removed: boolean) => ({
    padding: '2px 6px',
    fontSize: '8px',
    fontWeight: 700,
    background: removed ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
    color: removed ? 'var(--success)' : 'var(--error)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all 100ms',
  }),
  silenceBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-raised)',
  },
  silenceTime: {
    fontFamily: 'var(--font-mono)',
    fontSize: '9px',
    color: 'var(--text-muted)',
    minWidth: 60,
  },
  silenceDuration: {
    fontFamily: 'var(--font-mono)',
    fontSize: '9px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  silenceVisual: (duration: number) => ({
    height: 4,
    flex: 1,
    background: 'var(--bg-void)',
    borderRadius: 2,
    position: 'relative' as const,
    overflow: 'hidden',
  }),
  silenceFill: (duration: number, maxDuration: number) => ({
    position: 'absolute' as const,
    top: 0,
    left: 0,
    bottom: 0,
    width: `${Math.min(100, (duration / maxDuration) * 100)}%`,
    background: 'var(--warning)',
    borderRadius: 2,
    opacity: 0.6,
  }),
  chapterItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 10px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-raised)',
  },
  chapterTime: {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--brand-bright)',
    minWidth: 40,
  },
  chapterTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    flex: 1,
  },
  chapterBadge: (auto: boolean) => ({
    fontFamily: 'var(--font-mono)',
    fontSize: '7.5px',
    fontWeight: 700,
    letterSpacing: '0.3px',
    textTransform: 'uppercase' as const,
    padding: '2px 5px',
    borderRadius: 3,
    background: auto ? 'rgba(99,102,241,0.15)' : 'rgba(34,197,94,0.15)',
    color: auto ? '#818cf8' : '#4ade80',
  }),
  actionBtn: {
    padding: '8px 12px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    background: 'var(--brand)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    width: '100%',
    transition: 'opacity 150ms',
  },
  secondaryBtn: {
    padding: '6px 12px',
    fontSize: '10px',
    fontWeight: 600,
    background: 'var(--bg-elevated)',
    color: 'var(--text-muted)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all 150ms',
  },
  exportSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    padding: '12px',
    background: 'var(--bg-raised)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)',
  },
  formatBtn: (active: boolean) => ({
    padding: '5px 10px',
    fontSize: '10px',
    fontWeight: 600,
    background: active ? 'var(--brand-dim)' : 'var(--bg-elevated)',
    color: active ? 'var(--brand-bright)' : 'var(--text-muted)',
    border: `1px solid ${active ? 'var(--brand)' : 'var(--border-subtle)'}`,
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all 150ms',
  }),
  footer: {
    padding: '8px 12px',
    borderTop: '1px solid var(--border-default)',
    display: 'flex',
    gap: '6px',
    flexShrink: 0,
  },
  pillRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
  },
  pill: (active: boolean) => ({
    padding: '3px 8px',
    fontSize: '9px',
    fontWeight: 600,
    background: active ? 'var(--brand-dim)' : 'var(--bg-elevated)',
    color: active ? 'var(--brand-bright)' : 'var(--text-muted)',
    border: `1px solid ${active ? 'var(--brand)' : 'var(--border-subtle)'}`,
    borderRadius: 12,
    cursor: 'pointer',
    transition: 'all 150ms',
  }),
};

// ─── Utility ──────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

const FILLER_LABELS: Record<FillerWordType, string> = {
  um: '"um"',
  uh: '"uh"',
  like: '"like"',
  you_know: '"you know"',
  so: '"so"',
  basically: '"basically"',
  actually: '"actually"',
  literally: '"literally"',
};

// ─── Tab: Cleanup ─────────────────────────────────────────────────────────

function CleanupTab() {
  const {
    podcastConfig,
    setPodcastConfig,
    silenceRegions,
    fillerWords,
    toggleFillerRemoval,
    podcastStats,
    podcastAnalyzing,
    setPodcastAnalyzing,
    setSilenceRegions,
    setFillerWords,
    setPodcastStats,
  } = useCreatorStore();

  const handleAnalyze = useCallback(() => {
    setPodcastAnalyzing(true);

    // Simulate analysis
    setTimeout(() => {
      const silences: SilenceRegion[] = Array.from({ length: 8 }, (_, i) => ({
        startTime: 15 + i * 45 + Math.random() * 10,
        endTime: 15 + i * 45 + Math.random() * 10 + 0.5 + Math.random() * 3,
        duration: 0.5 + Math.random() * 3,
      }));
      silences.forEach((s) => (s.duration = s.endTime - s.startTime));

      const fillers: FillerWord[] = Array.from({ length: 12 }, (_, i) => {
        const types: FillerWordType[] = ['um', 'uh', 'like', 'you_know', 'so'];
        const type = types[Math.floor(Math.random() * types.length)];
        const start = 5 + i * 30 + Math.random() * 20;
        return {
          id: `filler-${i}`,
          type,
          startTime: start,
          endTime: start + 0.3 + Math.random() * 0.4,
          confidence: 0.6 + Math.random() * 0.35,
          removed: false,
        };
      });

      const totalSilence = silences.reduce((sum, s) => sum + s.duration, 0);
      setSilenceRegions(silences);
      setFillerWords(fillers);
      setPodcastStats({
        totalSilenceDuration: totalSilence,
        fillerWordCount: fillers.length,
        estimatedTimeSaved: totalSilence * 0.7 + fillers.length * 0.35,
        chapterCount: 0,
      });
      setPodcastAnalyzing(false);
    }, 800);
  }, [setPodcastAnalyzing, setSilenceRegions, setFillerWords, setPodcastStats]);

  const maxSilenceDuration = Math.max(...silenceRegions.map((s) => s.duration), 1);

  return (
    <>
      {/* Stats */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ ...S.statCard, flex: 1 }}>
          <span style={S.statLabel}>Silence</span>
          <span style={S.statValue(true)}>{podcastStats.totalSilenceDuration.toFixed(1)}s</span>
        </div>
        <div style={{ ...S.statCard, flex: 1 }}>
          <span style={S.statLabel}>Fillers</span>
          <span style={S.statValue(true)}>{podcastStats.fillerWordCount}</span>
        </div>
        <div style={{ ...S.statCard, flex: 1 }}>
          <span style={S.statLabel}>Saved</span>
          <span style={S.statValue(true)}>{podcastStats.estimatedTimeSaved.toFixed(1)}s</span>
        </div>
      </div>

      {/* Config */}
      <div style={S.section}>
        <span style={S.sectionLabel}>Silence Gate</span>
        <div style={S.row}>
          <span style={S.label}>Min Duration</span>
          <input
            type="range"
            className="range-slider"
            min={100}
            max={3000}
            step={50}
            value={podcastConfig.silenceGateMs}
            onChange={(e) => setPodcastConfig({ silenceGateMs: +e.target.value })}
            style={S.slider}
          />
          <span style={S.value}>{formatMs(podcastConfig.silenceGateMs)}</span>
        </div>
        <div style={S.row}>
          <span style={S.label}>Threshold</span>
          <input
            type="range"
            className="range-slider"
            min={-80}
            max={-10}
            step={1}
            value={podcastConfig.silenceThresholdDb}
            onChange={(e) => setPodcastConfig({ silenceThresholdDb: +e.target.value })}
            style={S.slider}
          />
          <span style={S.value}>{podcastConfig.silenceThresholdDb} dB</span>
        </div>
      </div>

      {/* Filler Word Config */}
      <div style={S.section}>
        <div style={S.row}>
          <span style={S.sectionLabel}>Filler Words</span>
          <div style={{ marginLeft: 'auto' }}>
            <button
              style={S.toggle(podcastConfig.fillerWordRemoval)}
              onClick={() => setPodcastConfig({ fillerWordRemoval: !podcastConfig.fillerWordRemoval })}
              role="switch"
              aria-checked={podcastConfig.fillerWordRemoval}
              aria-label="Filler word removal"
            >
              <div style={S.toggleKnob(podcastConfig.fillerWordRemoval)} />
            </button>
          </div>
        </div>
        {podcastConfig.fillerWordRemoval && (
          <div style={S.pillRow}>
            {(['um', 'uh', 'like', 'you_know', 'so', 'basically', 'actually', 'literally'] as FillerWordType[]).map(
              (type) => (
                <button
                  key={type}
                  style={S.pill(podcastConfig.fillerWordTypes.includes(type))}
                  onClick={() => {
                    const types = podcastConfig.fillerWordTypes.includes(type)
                      ? podcastConfig.fillerWordTypes.filter((t) => t !== type)
                      : [...podcastConfig.fillerWordTypes, type];
                    setPodcastConfig({ fillerWordTypes: types });
                  }}
                >
                  {FILLER_LABELS[type]}
                </button>
              ),
            )}
          </div>
        )}
      </div>

      {/* Analyze Button */}
      <button
        style={S.actionBtn}
        onClick={handleAnalyze}
        disabled={podcastAnalyzing}
      >
        {podcastAnalyzing ? 'Analyzing...' : 'Analyze Audio'}
      </button>

      {/* Silence Regions */}
      {silenceRegions.length > 0 && (
        <div style={S.section}>
          <span style={S.sectionLabel}>Silence Regions ({silenceRegions.length})</span>
          {silenceRegions.slice(0, 10).map((silence, i) => (
            <div key={i} style={S.silenceBar}>
              <span style={S.silenceTime}>{formatTime(silence.startTime)}</span>
              <div style={S.silenceVisual(silence.duration)}>
                <div style={S.silenceFill(silence.duration, maxSilenceDuration)} />
              </div>
              <span style={S.silenceDuration}>{silence.duration.toFixed(1)}s</span>
            </div>
          ))}
          {silenceRegions.length > 10 && (
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', textAlign: 'center' }}>
              +{silenceRegions.length - 10} more
            </div>
          )}
        </div>
      )}

      {/* Filler Words */}
      {fillerWords.length > 0 && (
        <div style={S.section}>
          <span style={S.sectionLabel}>Detected Fillers ({fillerWords.length})</span>
          {fillerWords.slice(0, 15).map((filler) => (
            <div key={filler.id} style={S.fillerItem(filler.removed)}>
              <span style={S.fillerType}>{FILLER_LABELS[filler.type]}</span>
              <span style={S.fillerTime}>{formatTime(filler.startTime)}</span>
              <span style={S.fillerConfidence}>{Math.round(filler.confidence * 100)}%</span>
              <button
                style={S.removeBtn(filler.removed)}
                onClick={() => toggleFillerRemoval(filler.id)}
              >
                {filler.removed ? 'Undo' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Tab: Chapters ────────────────────────────────────────────────────────

function ChaptersTab() {
  const {
    podcastChapters,
    setPodcastChapters,
    podcastConfig,
    setPodcastConfig,
  } = useCreatorStore();

  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [newChapterTime, setNewChapterTime] = useState('');

  const handleAddChapter = () => {
    const timeParts = newChapterTime.split(':').map(Number);
    let timeSeconds = 0;
    if (timeParts.length === 2) {
      timeSeconds = (timeParts[0] ?? 0) * 60 + (timeParts[1] ?? 0);
    } else if (timeParts.length === 1) {
      timeSeconds = timeParts[0] ?? 0;
    }

    if (timeSeconds >= 0 && newChapterTitle.trim()) {
      const chapter: ChapterMarker = {
        time: timeSeconds,
        title: newChapterTitle.trim(),
        isAutoGenerated: false,
      };
      const updated = [...podcastChapters, chapter].sort((a, b) => a.time - b.time);
      setPodcastChapters(updated);
      setNewChapterTitle('');
      setNewChapterTime('');
    }
  };

  const handleAutoGenerate = () => {
    // Simulate auto-generation
    const auto: ChapterMarker[] = [
      { time: 0, title: 'Intro', isAutoGenerated: true, confidence: 0.9 },
      { time: 120, title: 'Main Topic', isAutoGenerated: true, confidence: 0.75 },
      { time: 480, title: 'Guest Discussion', isAutoGenerated: true, confidence: 0.7 },
      { time: 900, title: 'Q&A', isAutoGenerated: true, confidence: 0.65 },
      { time: 1200, title: 'Wrap Up', isAutoGenerated: true, confidence: 0.8 },
    ];

    const manual = podcastChapters.filter((c) => !c.isAutoGenerated);
    const merged = [...manual, ...auto].sort((a, b) => a.time - b.time);
    setPodcastChapters(merged);
  };

  const removeChapter = (time: number) => {
    setPodcastChapters(podcastChapters.filter((c) => c.time !== time));
  };

  return (
    <>
      {/* Auto-generate toggle */}
      <div style={S.row}>
        <span style={{ ...S.label, minWidth: 'auto', flex: 1 }}>Auto-generate chapters</span>
        <button
          style={S.toggle(podcastConfig.chapterAutoGenerate)}
          onClick={() => setPodcastConfig({ chapterAutoGenerate: !podcastConfig.chapterAutoGenerate })}
          role="switch"
          aria-checked={podcastConfig.chapterAutoGenerate}
          aria-label="Auto-generate chapters"
        >
          <div style={S.toggleKnob(podcastConfig.chapterAutoGenerate)} />
        </button>
      </div>

      <button style={S.secondaryBtn} onClick={handleAutoGenerate}>
        Generate from Transcript
      </button>

      {/* Chapter List */}
      <div style={S.section}>
        <span style={S.sectionLabel}>Chapters ({podcastChapters.length})</span>
        {podcastChapters.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontStyle: 'italic', padding: '8px 0', textAlign: 'center' }}>
            No chapters yet
          </div>
        ) : (
          podcastChapters.map((chapter, i) => (
            <div key={`${chapter.time}-${i}`} style={S.chapterItem}>
              <span style={S.chapterTime}>{formatTime(chapter.time)}</span>
              <span style={S.chapterTitle}>{chapter.title}</span>
              <span style={S.chapterBadge(chapter.isAutoGenerated)}>
                {chapter.isAutoGenerated ? 'AI' : 'Manual'}
              </span>
              <button
                style={{ ...S.secondaryBtn, padding: '2px 6px', fontSize: '8px', width: 'auto' }}
                onClick={() => removeChapter(chapter.time)}
              >
                x
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add Chapter */}
      <div style={S.section}>
        <span style={S.sectionLabel}>Add Chapter</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            style={{ ...S.slider, flex: 0, width: 55, padding: '4px 6px', fontSize: '10px', fontFamily: 'var(--font-mono)', background: 'var(--bg-void)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none', textAlign: 'center', height: 'auto' } as React.CSSProperties}
            placeholder="0:00"
            value={newChapterTime}
            onChange={(e) => setNewChapterTime(e.target.value)}
          />
          <input
            style={{ flex: 1, padding: '4px 8px', fontSize: '10px', background: 'var(--bg-void)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }}
            placeholder="Chapter title..."
            value={newChapterTitle}
            onChange={(e) => setNewChapterTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddChapter()}
          />
          <button style={S.secondaryBtn} onClick={handleAddChapter}>Add</button>
        </div>
      </div>
    </>
  );
}

// ─── Tab: Export ───────────────────────────────────────────────────────────

function ExportTab() {
  const [selectedFormat, setSelectedFormat] = useState<PodcastExportFormat>('mp3');
  const [bitrate, setBitrate] = useState(192);
  const { podcastStats } = useCreatorStore();

  const formats: PodcastExportFormat[] = ['mp3', 'aac', 'wav', 'flac', 'ogg'];

  return (
    <>
      <div style={S.section}>
        <span style={S.sectionLabel}>Format</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {formats.map((fmt) => (
            <button
              key={fmt}
              style={S.formatBtn(selectedFormat === fmt)}
              onClick={() => setSelectedFormat(fmt)}
            >
              {fmt.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {(selectedFormat === 'mp3' || selectedFormat === 'aac' || selectedFormat === 'ogg') && (
        <div style={S.section}>
          <span style={S.sectionLabel}>Bitrate</span>
          <div style={S.row}>
            <input
              type="range"
              className="range-slider"
              min={96}
              max={320}
              step={32}
              value={bitrate}
              onChange={(e) => setBitrate(+e.target.value)}
              style={S.slider}
            />
            <span style={S.value}>{bitrate} kbps</span>
          </div>
        </div>
      )}

      {/* Summary */}
      <div style={S.exportSection}>
        <span style={S.sectionLabel}>Export Summary</span>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
          <span style={{ color: 'var(--text-tertiary)' }}>Format</span>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{selectedFormat.toUpperCase()}</span>
        </div>
        {podcastStats.estimatedTimeSaved > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
            <span style={{ color: 'var(--text-tertiary)' }}>Time saved</span>
            <span style={{ color: 'var(--success)', fontWeight: 600 }}>
              -{podcastStats.estimatedTimeSaved.toFixed(1)}s
            </span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
          <span style={{ color: 'var(--text-tertiary)' }}>Chapters</span>
          <span style={{ color: 'var(--text-secondary)' }}>Included</span>
        </div>
      </div>

      <button style={S.actionBtn}>Export Audio</button>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export function PodcastPanel() {
  const [activeTab, setActiveTab] = useState<'cleanup' | 'chapters' | 'export'>('cleanup');

  const tabs: { key: typeof activeTab; label: string }[] = [
    { key: 'cleanup', label: 'Cleanup' },
    { key: 'chapters', label: 'Chapters' },
    { key: 'export', label: 'Export' },
  ];

  return (
    <div style={S.root}>
      <div style={S.tabBar}>
        {tabs.map((t) => (
          <button
            key={t.key}
            style={S.tab(activeTab === t.key)}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={S.body}>
        {activeTab === 'cleanup' && <CleanupTab />}
        {activeTab === 'chapters' && <ChaptersTab />}
        {activeTab === 'export' && <ExportTab />}
      </div>
    </div>
  );
}
