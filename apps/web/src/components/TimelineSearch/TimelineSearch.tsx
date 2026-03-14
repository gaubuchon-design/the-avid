import React, { memo, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useEditorStore } from '../../store/editor.store';
import type { Clip, Track } from '../../store/editor.store';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SearchResult {
  clip: Clip;
  track: Track;
  matchField: 'name' | 'assetId' | 'type';
}

type SearchScope = 'all' | 'selected-tracks' | 'in-out';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 24);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const TimelineSearch = memo(function TimelineSearch() {
  const tracks = useEditorStore((s) => s.tracks);
  const selectedTrackId = useEditorStore((s) => s.selectedTrackId);
  const setCurrentTime = useEditorStore((s) => s.setPlayhead);
  const selectTrack = useEditorStore((s) => s.selectTrack);
  const inPoint = useEditorStore((s) => s.inPoint);
  const outPoint = useEditorStore((s) => s.outPoint);

  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('all');
  const [matchCase, setMatchCase] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [selectedResultIdx, setSelectedResultIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Filter tracks by scope
  const scopedTracks = useMemo(() => {
    if (scope === 'selected-tracks' && selectedTrackId) {
      return tracks.filter((t) => t.id === selectedTrackId);
    }
    return tracks;
  }, [tracks, scope, selectedTrackId]);

  // Search results
  const results = useMemo<SearchResult[]>(() => {
    if (!searchQuery.trim()) return [];
    const q = matchCase ? searchQuery : searchQuery.toLowerCase();

    const matches: SearchResult[] = [];
    for (const track of scopedTracks) {
      for (const clip of track.clips) {
        // Scope: in-out range
        if (scope === 'in-out' && inPoint !== null && outPoint !== null) {
          if (clip.endTime < inPoint || clip.startTime > outPoint) continue;
        }

        const clipName = matchCase ? clip.name : clip.name.toLowerCase();
        const clipType = matchCase ? clip.type : clip.type.toLowerCase();
        const clipAssetId = clip.assetId ? (matchCase ? clip.assetId : clip.assetId.toLowerCase()) : '';

        if (clipName.includes(q)) {
          matches.push({ clip, track, matchField: 'name' });
        } else if (clipType.includes(q)) {
          matches.push({ clip, track, matchField: 'type' });
        } else if (clipAssetId.includes(q)) {
          matches.push({ clip, track, matchField: 'assetId' });
        }
      }
    }

    // Sort by timeline position
    matches.sort((a, b) => a.clip.startTime - b.clip.startTime);
    return matches;
  }, [searchQuery, scopedTracks, matchCase, scope, inPoint, outPoint]);

  // Navigate to result
  const goToResult = useCallback((idx: number) => {
    if (idx < 0 || idx >= results.length) return;
    setSelectedResultIdx(idx);
    const r = results[idx]!;
    setCurrentTime(r.clip.startTime);
    selectTrack(r.track.id);
  }, [results, setCurrentTime, selectTrack]);

  const goNext = useCallback(() => {
    const next = selectedResultIdx < results.length - 1 ? selectedResultIdx + 1 : 0;
    goToResult(next);
  }, [selectedResultIdx, results.length, goToResult]);

  const goPrev = useCallback(() => {
    const prev = selectedResultIdx > 0 ? selectedResultIdx - 1 : results.length - 1;
    goToResult(prev);
  }, [selectedResultIdx, results.length, goToResult]);

  // Replace clip name
  const replaceCurrent = useCallback(() => {
    if (selectedResultIdx < 0 || selectedResultIdx >= results.length) return;
    const r = results[selectedResultIdx]!;
    if (r.matchField !== 'name') return;

    const store = useEditorStore.getState();
    const newName = matchCase
      ? r.clip.name.replace(searchQuery, replaceQuery)
      : r.clip.name.replace(new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), replaceQuery);

    // Update clip name via store
    const trackIdx = store.tracks.findIndex((t) => t.id === r.track.id);
    const clipIdx = trackIdx >= 0 ? store.tracks[trackIdx]!.clips.findIndex((c) => c.id === r.clip.id) : -1;
    if (trackIdx >= 0 && clipIdx >= 0) {
      useEditorStore.setState((state) => {
        const t = state.tracks[trackIdx];
        if (t) {
          const c = t.clips[clipIdx];
          if (c) c.name = newName;
        }
        return state;
      });
    }
    goNext();
  }, [selectedResultIdx, results, searchQuery, replaceQuery, matchCase, goNext]);

  const replaceAll = useCallback(() => {
    const nameMatches = results.filter((r) => r.matchField === 'name');
    if (nameMatches.length === 0) return;

    useEditorStore.setState((state) => {
      for (const r of nameMatches) {
        const track = state.tracks.find((t) => t.id === r.track.id);
        if (!track) continue;
        const clip = track.clips.find((c) => c.id === r.clip.id);
        if (!clip) continue;
        clip.name = matchCase
          ? clip.name.replace(searchQuery, replaceQuery)
          : clip.name.replace(new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), replaceQuery);
      }
      return state;
    });
  }, [results, searchQuery, replaceQuery, matchCase]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) goPrev();
      else goNext();
    } else if (e.key === 'Escape') {
      setSearchQuery('');
    }
  }, [goNext, goPrev]);

  return (
    <div style={S['container']}>
      {/* Header */}
      <div style={S['header']}>
        <span style={S['title']}>Find in Timeline</span>
        <button
          style={S['toggleBtn']}
          onClick={() => setShowReplace(!showReplace)}
          title={showReplace ? 'Hide Replace' : 'Show Replace'}
        >
          {showReplace ? 'Find' : 'Find & Replace'}
        </button>
      </div>

      {/* Search input */}
      <div style={S['inputRow']}>
        <input
          ref={inputRef}
          style={S['input']}
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setSelectedResultIdx(-1); }}
          onKeyDown={handleKeyDown}
          placeholder="Search clips..."
          aria-label="Search clips in timeline"
        />
        <span style={S['resultCount']}>
          {searchQuery ? `${results.length} found` : ''}
        </span>
      </div>

      {/* Replace input */}
      {showReplace && (
        <div style={S['inputRow']}>
          <input
            style={S['input']}
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            placeholder="Replace with..."
            aria-label="Replace text"
          />
          <button style={S['smallBtn']} onClick={replaceCurrent} title="Replace current" disabled={selectedResultIdx < 0}>
            Replace
          </button>
          <button style={S['smallBtn']} onClick={replaceAll} title="Replace all matches" disabled={results.length === 0}>
            All
          </button>
        </div>
      )}

      {/* Options row */}
      <div style={S['optionsRow']}>
        <label style={S['checkLabel']}>
          <input
            type="checkbox"
            checked={matchCase}
            onChange={(e) => setMatchCase(e.target.checked)}
            style={S['checkbox']}
          />
          Match case
        </label>
        <select
          style={S['scopeSelect']}
          value={scope}
          onChange={(e) => setScope(e.target.value as SearchScope)}
          aria-label="Search scope"
        >
          <option value="all">All Tracks</option>
          <option value="selected-tracks">Selected Track</option>
          <option value="in-out">In/Out Range</option>
        </select>
        <div style={S['navBtns']}>
          <button style={S['navBtn']} onClick={goPrev} disabled={results.length === 0} title="Previous (Shift+Enter)">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6" /></svg>
          </button>
          <button style={S['navBtn']} onClick={goNext} disabled={results.length === 0} title="Next (Enter)">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        </div>
      </div>

      {/* Results list */}
      <div style={S['resultsList']} role="listbox" aria-label="Search results">
        {results.length === 0 && searchQuery && (
          <div style={S['emptyMsg']}>No clips match "{searchQuery}"</div>
        )}
        {results.map((r, i) => (
          <div
            key={`${r.track.id}-${r.clip.id}`}
            style={{
              ...S['resultItem'],
              ...(i === selectedResultIdx ? S['resultItemActive'] : {}),
            }}
            onClick={() => goToResult(i)}
            role="option"
            aria-selected={i === selectedResultIdx}
          >
            <div style={S['resultClipName']}>
              <span style={{ color: r.track.color || 'var(--text-muted)', marginRight: 4, fontSize: 8 }}>
                {r.track.name}
              </span>
              {r.clip.name}
            </div>
            <div style={S['resultTimecode']}>
              {formatTimecode(r.clip.startTime)} - {formatTimecode(r.clip.endTime)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

// ─── Styles ─────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--bg-surface, #1a1a24)',
    borderLeft: '1px solid var(--border-default, #2a2a3a)',
    fontSize: 11,
    color: 'var(--text-primary, #e0e0e8)',
    minWidth: 220,
    maxWidth: 300,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    borderBottom: '1px solid var(--border-subtle, #1e1e28)',
  },
  title: {
    fontWeight: 600,
    fontSize: 11,
  },
  toggleBtn: {
    background: 'none',
    border: '1px solid var(--border-default, #2a2a3a)',
    borderRadius: 4,
    color: 'var(--text-secondary, #a0a0b0)',
    fontSize: 9,
    padding: '2px 6px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
  },
  input: {
    flex: 1,
    background: 'var(--bg-void, #0e0e14)',
    border: '1px solid var(--border-default, #2a2a3a)',
    borderRadius: 4,
    color: 'var(--text-primary, #e0e0e8)',
    fontSize: 11,
    padding: '4px 8px',
    outline: 'none',
    fontFamily: 'inherit',
  },
  resultCount: {
    fontSize: 9,
    color: 'var(--text-muted, #6b6b80)',
    whiteSpace: 'nowrap' as const,
    minWidth: 50,
    textAlign: 'right' as const,
  },
  smallBtn: {
    background: 'var(--bg-raised, #22222e)',
    border: '1px solid var(--border-default, #2a2a3a)',
    borderRadius: 3,
    color: 'var(--text-secondary, #a0a0b0)',
    fontSize: 9,
    padding: '2px 6px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap' as const,
  },
  optionsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px 6px',
    borderBottom: '1px solid var(--border-subtle, #1e1e28)',
  },
  checkLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    fontSize: 9,
    color: 'var(--text-secondary, #a0a0b0)',
    cursor: 'pointer',
  },
  checkbox: {
    width: 12,
    height: 12,
    accentColor: 'var(--brand, #00c896)',
  },
  scopeSelect: {
    flex: 1,
    background: 'var(--bg-void, #0e0e14)',
    border: '1px solid var(--border-default, #2a2a3a)',
    borderRadius: 3,
    color: 'var(--text-secondary, #a0a0b0)',
    fontSize: 9,
    padding: '2px 4px',
    fontFamily: 'inherit',
  },
  navBtns: {
    display: 'flex',
    gap: 2,
  },
  navBtn: {
    background: 'var(--bg-raised, #22222e)',
    border: '1px solid var(--border-default, #2a2a3a)',
    borderRadius: 3,
    color: 'var(--text-secondary, #a0a0b0)',
    cursor: 'pointer',
    padding: '2px 4px',
    display: 'flex',
    alignItems: 'center',
  },
  resultsList: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '4px 0',
  },
  emptyMsg: {
    padding: '16px 10px',
    textAlign: 'center' as const,
    color: 'var(--text-muted, #6b6b80)',
    fontSize: 10,
  },
  resultItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '4px 10px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border-subtle, #1e1e28)',
    transition: 'background 80ms',
  },
  resultItemActive: {
    background: 'rgba(0, 200, 150, 0.12)',
    borderLeft: '2px solid var(--brand, #00c896)',
  },
  resultClipName: {
    fontSize: 10,
    fontWeight: 500,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  resultTimecode: {
    fontSize: 8,
    color: 'var(--text-muted, #6b6b80)',
    fontFamily: 'var(--font-mono, "SF Mono", monospace)',
    marginTop: 1,
  },
};
