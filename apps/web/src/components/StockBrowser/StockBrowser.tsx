// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Stock Browser Panel
//  Search and preview stock music and video from multiple providers
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useCallback } from 'react';
import { useCreatorStore } from '../../store/creator.store';
import type {
  StockMusicResult,
  StockVideoResult,
  MusicMood,
  MusicGenre,
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
  searchBar: {
    display: 'flex',
    gap: '6px',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    padding: '5px 10px',
    fontSize: '11px',
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  searchBtn: {
    padding: '5px 12px',
    fontSize: '10px',
    fontWeight: 600,
    background: 'var(--brand)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'opacity 150ms',
  },
  filterRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
    padding: '6px 12px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  filterPill: (active: boolean) => ({
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
  body: {
    flex: 1,
    overflow: 'auto',
    minHeight: 0,
  },
  resultsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    padding: '4px',
  },
  musicItem: (isSelected: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    background: isSelected ? 'var(--bg-hover)' : 'transparent',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'background 100ms',
    borderLeft: isSelected ? '3px solid var(--brand)' : '3px solid transparent',
  }),
  musicInfo: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  musicTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  musicArtist: {
    fontSize: '9.5px',
    color: 'var(--text-tertiary)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  musicMeta: {
    fontFamily: 'var(--font-mono)',
    fontSize: '9px',
    color: 'var(--text-muted)',
    display: 'flex',
    gap: '6px',
    marginTop: 2,
  },
  playBtn: (isPlaying: boolean) => ({
    width: 28,
    height: 28,
    borderRadius: '50%',
    border: 'none',
    background: isPlaying ? 'var(--brand)' : 'var(--bg-elevated)',
    color: isPlaying ? '#fff' : 'var(--text-muted)',
    fontSize: '11px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'all 150ms',
  }),
  providerBadge: (provider: string) => ({
    fontFamily: 'var(--font-mono)',
    fontSize: '7.5px',
    fontWeight: 700,
    letterSpacing: '0.3px',
    textTransform: 'uppercase' as const,
    padding: '2px 5px',
    borderRadius: 3,
    background: provider === 'artlist' ? 'rgba(99,102,241,0.15)' :
                provider === 'epidemic_sound' ? 'rgba(14,165,233,0.15)' :
                provider === 'musicbed' ? 'rgba(244,63,94,0.15)' :
                'rgba(245,158,11,0.15)',
    color: provider === 'artlist' ? '#818cf8' :
           provider === 'epidemic_sound' ? '#38bdf8' :
           provider === 'musicbed' ? '#fb7185' :
           '#fbbf24',
    flexShrink: 0,
  }),
  videoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: '8px',
    padding: '8px',
  },
  videoCard: (isSelected: boolean) => ({
    borderRadius: 'var(--radius-sm)',
    overflow: 'hidden',
    border: `2px solid ${isSelected ? 'var(--brand)' : 'var(--border-subtle)'}`,
    cursor: 'pointer',
    transition: 'border-color 150ms',
    background: 'var(--bg-void)',
  }),
  videoThumb: {
    width: '100%',
    aspectRatio: '16/9',
    background: 'var(--bg-raised)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    color: 'var(--text-muted)',
  },
  videoInfo: {
    padding: '6px 8px',
  },
  videoTitle: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginBottom: 2,
  },
  videoMeta: {
    fontFamily: 'var(--font-mono)',
    fontSize: '8.5px',
    color: 'var(--text-muted)',
    display: 'flex',
    justifyContent: 'space-between',
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: 24,
    color: 'var(--text-muted)',
    fontSize: '11px',
    fontStyle: 'italic' as const,
    textAlign: 'center' as const,
  },
  detailPanel: {
    padding: '12px',
    borderTop: '1px solid var(--border-default)',
    background: 'var(--bg-raised)',
    flexShrink: 0,
  },
  detailTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 4,
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10px',
    color: 'var(--text-tertiary)',
    marginBottom: 2,
  },
  addBtn: {
    width: '100%',
    padding: '6px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    background: 'var(--brand)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    marginTop: 8,
    transition: 'opacity 150ms',
  },
};

// ─── Utility ──────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatResolution(w: number, h: number): string {
  if (w >= 3840) return '4K';
  if (w >= 1920) return 'HD';
  return `${w}x${h}`;
}

// ─── Mood / Genre Filters ─────────────────────────────────────────────────

const MOOD_OPTIONS: MusicMood[] = ['happy', 'energetic', 'calm', 'dramatic', 'cinematic', 'ambient', 'dark', 'uplifting'];
const GENRE_OPTIONS: MusicGenre[] = ['pop', 'rock', 'electronic', 'hip_hop', 'classical', 'jazz', 'ambient', 'cinematic', 'lofi'];

// ─── Music Results ────────────────────────────────────────────────────────

function MusicResults() {
  const {
    musicSearchResults,
    selectedMusicTrack,
    musicPreviewPlaying,
    selectMusicTrack,
    setMusicPreviewPlaying,
  } = useCreatorStore();

  if (musicSearchResults.length === 0) {
    return <div style={S.emptyState}>Search for stock music above</div>;
  }

  return (
    <div style={S.resultsList}>
      {musicSearchResults.map((track) => (
        <div
          key={track.id}
          style={S.musicItem(selectedMusicTrack?.id === track.id)}
          onClick={() => selectMusicTrack(track)}
        >
          <button
            style={S.playBtn(musicPreviewPlaying === track.id)}
            onClick={(e) => {
              e.stopPropagation();
              setMusicPreviewPlaying(musicPreviewPlaying === track.id ? null : track.id);
            }}
          >
            {musicPreviewPlaying === track.id ? '||' : '\u25B6'}
          </button>
          <div style={S.musicInfo}>
            <div style={S.musicTitle}>{track.title}</div>
            <div style={S.musicArtist}>{track.artist}</div>
            <div style={S.musicMeta}>
              <span>{track.tempo} BPM</span>
              <span>{formatDuration(track.duration)}</span>
              <span>{track.energy}</span>
            </div>
          </div>
          <span style={S.providerBadge(track.provider)}>{track.provider.replace('_', ' ')}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Video Results ────────────────────────────────────────────────────────

function VideoResults() {
  const {
    videoSearchResults,
    selectedVideoClip,
    selectVideoClip,
  } = useCreatorStore();

  if (videoSearchResults.length === 0) {
    return <div style={S.emptyState}>Search for stock video above</div>;
  }

  return (
    <div style={S.videoGrid}>
      {videoSearchResults.map((clip) => (
        <div
          key={clip.id}
          style={S.videoCard(selectedVideoClip?.id === clip.id)}
          onClick={() => selectVideoClip(clip)}
        >
          <div style={S.videoThumb}>
            {formatResolution(clip.resolution.width, clip.resolution.height)} | {clip.fps}fps
          </div>
          <div style={S.videoInfo}>
            <div style={S.videoTitle}>{clip.title}</div>
            <div style={S.videoMeta}>
              <span>{formatDuration(clip.duration)}</span>
              <span style={S.providerBadge(clip.provider)}>{clip.provider}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────

function MusicDetailPanel() {
  const { selectedMusicTrack } = useCreatorStore();
  if (!selectedMusicTrack) return null;

  const track = selectedMusicTrack;
  return (
    <div style={S.detailPanel}>
      <div style={S.detailTitle}>{track.title}</div>
      <div style={S.detailRow}><span>Artist</span><span>{track.artist}</span></div>
      <div style={S.detailRow}><span>BPM</span><span>{track.tempo}</span></div>
      <div style={S.detailRow}><span>Duration</span><span>{formatDuration(track.duration)}</span></div>
      <div style={S.detailRow}><span>Energy</span><span>{track.energy}</span></div>
      <div style={S.detailRow}><span>Key</span><span>{track.key ?? 'N/A'}</span></div>
      <div style={S.detailRow}>
        <span>Mood</span>
        <span>{track.mood.join(', ')}</span>
      </div>
      <div style={S.detailRow}>
        <span>Genre</span>
        <span>{track.genre.join(', ')}</span>
      </div>
      <button style={S.addBtn}>Add to Timeline</button>
    </div>
  );
}

function VideoDetailPanel() {
  const { selectedVideoClip } = useCreatorStore();
  if (!selectedVideoClip) return null;

  const clip = selectedVideoClip;
  return (
    <div style={S.detailPanel}>
      <div style={S.detailTitle}>{clip.title}</div>
      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: 6 }}>
        {clip.description}
      </div>
      <div style={S.detailRow}>
        <span>Resolution</span>
        <span>{clip.resolution.width}x{clip.resolution.height}</span>
      </div>
      <div style={S.detailRow}><span>Duration</span><span>{formatDuration(clip.duration)}</span></div>
      <div style={S.detailRow}><span>FPS</span><span>{clip.fps}</span></div>
      <div style={S.detailRow}><span>Provider</span><span>{clip.provider}</span></div>
      <button style={S.addBtn}>Add to Timeline</button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export function StockBrowser() {
  const {
    stockBrowserTab,
    setStockBrowserTab,
    musicSearchParams,
    setMusicSearchParams,
    setMusicSearchResults,
    setMusicSearchLoading,
    musicSearchLoading,
    videoSearchParams,
    setVideoSearchParams,
    setVideoSearchResults,
    setVideoSearchLoading,
    videoSearchLoading,
    selectedMusicTrack,
    selectedVideoClip,
  } = useCreatorStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeMoods, setActiveMoods] = useState<MusicMood[]>([]);

  const handleSearch = useCallback(() => {
    if (stockBrowserTab === 'music') {
      setMusicSearchLoading(true);
      // Simulate search -- in production this would call StockMusicConnector
      setTimeout(() => {
        const demoResults: StockMusicResult[] = [
          {
            id: 'sm-001', title: 'Rising Horizon', artist: 'Skyward Audio',
            mood: ['uplifting', 'cinematic'], genre: ['cinematic'], tempo: 120,
            energy: 'high', duration: 195, previewUrl: '', licenseUrl: '',
            provider: 'artlist', key: 'C major', tags: ['epic'],
          },
          {
            id: 'sm-002', title: 'Midnight Drive', artist: 'Neon Pulse',
            mood: ['mysterious', 'dark'], genre: ['electronic'], tempo: 95,
            energy: 'medium', duration: 240, previewUrl: '', licenseUrl: '',
            provider: 'epidemic_sound', key: 'A minor', tags: ['synth'],
          },
          {
            id: 'sm-003', title: 'Golden Morning', artist: 'Sunlit Keys',
            mood: ['happy', 'calm'], genre: ['folk'], tempo: 110,
            energy: 'low', duration: 180, previewUrl: '', licenseUrl: '',
            provider: 'musicbed', key: 'G major', tags: ['acoustic'],
          },
          {
            id: 'sm-004', title: 'Urban Pulse', artist: 'Beat Collective',
            mood: ['energetic'], genre: ['hip_hop'], tempo: 140,
            energy: 'high', duration: 165, previewUrl: '', licenseUrl: '',
            provider: 'soundstripe', key: 'D minor', tags: ['beats'],
          },
          {
            id: 'sm-005', title: 'Lo-Fi Study', artist: 'Chill Beats Co.',
            mood: ['calm'], genre: ['lofi'], tempo: 85,
            energy: 'low', duration: 420, previewUrl: '', licenseUrl: '',
            provider: 'soundstripe', key: 'Ab major', tags: ['lofi'],
          },
        ];

        // Filter by query
        const q = searchQuery.toLowerCase();
        const filtered = q
          ? demoResults.filter(
              (r) =>
                r.title.toLowerCase().includes(q) ||
                r.artist.toLowerCase().includes(q) ||
                r.tags.some((t) => t.includes(q)) ||
                r.mood.some((m) => m.includes(q)),
            )
          : demoResults;

        // Filter by mood
        const moodFiltered = activeMoods.length > 0
          ? filtered.filter((r) => r.mood.some((m) => activeMoods.includes(m)))
          : filtered;

        setMusicSearchResults(moodFiltered);
        setMusicSearchLoading(false);
      }, 400);
    } else {
      setVideoSearchLoading(true);
      setTimeout(() => {
        const demoVideos: StockVideoResult[] = [
          {
            id: 'sv-001', title: 'City Skyline Sunset', description: 'Aerial city at golden hour',
            keywords: ['city', 'skyline'], previewUrl: '', provider: 'artgrid',
            resolution: { width: 3840, height: 2160 }, duration: 15, fps: 24,
            thumbnailUrl: '', licenseUrl: '',
          },
          {
            id: 'sv-002', title: 'Ocean Waves', description: 'Slow motion waves on rocks',
            keywords: ['ocean', 'waves'], previewUrl: '', provider: 'shutterstock',
            resolution: { width: 1920, height: 1080 }, duration: 20, fps: 60,
            thumbnailUrl: '', licenseUrl: '',
          },
          {
            id: 'sv-003', title: 'Office Team Meeting', description: 'Team collaborating in modern office',
            keywords: ['office', 'business'], previewUrl: '', provider: 'getty',
            resolution: { width: 3840, height: 2160 }, duration: 12, fps: 30,
            thumbnailUrl: '', licenseUrl: '',
          },
          {
            id: 'sv-004', title: 'Forest Aerial', description: 'Drone over green canopy',
            keywords: ['forest', 'nature'], previewUrl: '', provider: 'artgrid',
            resolution: { width: 3840, height: 2160 }, duration: 18, fps: 24,
            thumbnailUrl: '', licenseUrl: '',
          },
        ];

        const q = searchQuery.toLowerCase();
        const filtered = q
          ? demoVideos.filter(
              (v) =>
                v.title.toLowerCase().includes(q) ||
                v.description.toLowerCase().includes(q) ||
                v.keywords.some((k) => k.includes(q)),
            )
          : demoVideos;

        setVideoSearchResults(filtered);
        setVideoSearchLoading(false);
      }, 400);
    }
  }, [stockBrowserTab, searchQuery, activeMoods, setMusicSearchResults, setMusicSearchLoading, setVideoSearchResults, setVideoSearchLoading]);

  const toggleMood = (mood: MusicMood) => {
    setActiveMoods((prev) =>
      prev.includes(mood) ? prev.filter((m) => m !== mood) : [...prev, mood],
    );
  };

  return (
    <div style={S.root}>
      {/* Tab Bar */}
      <div style={S.tabBar}>
        <button style={S.tab(stockBrowserTab === 'music')} onClick={() => setStockBrowserTab('music')}>
          Music
        </button>
        <button style={S.tab(stockBrowserTab === 'video')} onClick={() => setStockBrowserTab('video')}>
          Video
        </button>
      </div>

      {/* Search */}
      <div style={S.searchBar}>
        <input
          style={S.searchInput}
          placeholder={stockBrowserTab === 'music' ? 'Search music...' : 'Search video clips...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button style={S.searchBtn} onClick={handleSearch}>
          {musicSearchLoading || videoSearchLoading ? '...' : 'Search'}
        </button>
      </div>

      {/* Mood Filters (music only) */}
      {stockBrowserTab === 'music' && (
        <div style={S.filterRow}>
          {MOOD_OPTIONS.map((mood) => (
            <button
              key={mood}
              style={S.filterPill(activeMoods.includes(mood))}
              onClick={() => toggleMood(mood)}
            >
              {mood}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      <div style={S.body}>
        {stockBrowserTab === 'music' ? <MusicResults /> : <VideoResults />}
      </div>

      {/* Detail Panel */}
      {stockBrowserTab === 'music' && selectedMusicTrack && <MusicDetailPanel />}
      {stockBrowserTab === 'video' && selectedVideoClip && <VideoDetailPanel />}
    </div>
  );
}
