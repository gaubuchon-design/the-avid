// =============================================================================
//  THE AVID -- Fairlight Page (DaVinci Resolve-Style Audio Post-Production)
//  Audio Track Index, Record Monitor, Sound Library, Mixer, Timeline.
// =============================================================================

import React, { useEffect, useState, useCallback, memo, useMemo } from 'react';
import { RecordMonitor } from '../components/RecordMonitor/RecordMonitor';
import { AudioMixer } from '../components/AudioMixer/AudioMixer';
import { TimelinePanel } from '../components/TimelinePanel/TimelinePanel';
import { useAudioStore, type AudioTrackState } from '../store/audio.store';

// =============================================================================
//  Types
// =============================================================================

type ChannelFormat = 'Mono' | 'Stereo' | '5.1' | '7.1';
type AutomationMode = 'Off' | 'Read' | 'Touch' | 'Latch' | 'Write';
type BrowserTab = 'library' | 'effects';
type LibraryCategory = 'All' | 'Ambience' | 'Foley' | 'SFX' | 'Music' | 'Dialog';
type PluginCategory = 'All' | 'EQ' | 'Dynamics' | 'Reverb' | 'Delay' | 'Modulation' | 'Utility';

interface FairlightTrackMeta {
  trackId: string;
  channelFormat: ChannelFormat;
  inputRouting: string;
  outputRouting: string;
  automationMode: AutomationMode;
  recordArmed: boolean;
  isADR: boolean;
}

interface SoundLibraryItem {
  id: string;
  name: string;
  category: LibraryCategory;
  duration: number;
  sampleRate: number;
  channels: number;
  filePath: string;
}

interface AudioPlugin {
  id: string;
  name: string;
  category: PluginCategory;
  manufacturer: string;
  type: 'VST3' | 'AU' | 'AAX';
}

// =============================================================================
//  Demo Data
// =============================================================================

const DEMO_FAIRLIGHT_META: FairlightTrackMeta[] = [
  { trackId: 't3', channelFormat: 'Mono', inputRouting: 'Input 1', outputRouting: 'Bus 1-2', automationMode: 'Read', recordArmed: false, isADR: false },
  { trackId: 't4', channelFormat: 'Stereo', inputRouting: 'Input 3-4', outputRouting: 'Bus 1-2', automationMode: 'Off', recordArmed: false, isADR: false },
];

const DEMO_EXTRA_TRACKS: { id: string; name: string; gain: number; meta: Omit<FairlightTrackMeta, 'trackId'> }[] = [
  { id: 'fl_sfx', name: 'SFX', gain: 0.75, meta: { channelFormat: 'Stereo', inputRouting: 'Input 5-6', outputRouting: 'Bus 3-4', automationMode: 'Touch', recordArmed: false, isADR: false } },
  { id: 'fl_music', name: 'Music', gain: 0.65, meta: { channelFormat: 'Stereo', inputRouting: 'Input 7-8', outputRouting: 'Bus 1-2', automationMode: 'Read', recordArmed: false, isADR: false } },
  { id: 'fl_foley', name: 'Foley', gain: 0.7, meta: { channelFormat: 'Mono', inputRouting: 'Input 2', outputRouting: 'Bus 1-2', automationMode: 'Off', recordArmed: false, isADR: false } },
  { id: 'fl_adr', name: 'ADR', gain: 0.8, meta: { channelFormat: 'Mono', inputRouting: 'Input 1', outputRouting: 'Bus 1-2', automationMode: 'Off', recordArmed: true, isADR: true } },
];

const SOUND_LIBRARY: SoundLibraryItem[] = [
  { id: 'sl_1', name: 'Rain Heavy Roof', category: 'Ambience', duration: 62.4, sampleRate: 48000, channels: 2, filePath: '/sfx/amb/rain_heavy.wav' },
  { id: 'sl_2', name: 'City Traffic Distant', category: 'Ambience', duration: 180.0, sampleRate: 48000, channels: 2, filePath: '/sfx/amb/city_traffic.wav' },
  { id: 'sl_3', name: 'Forest Birds Morning', category: 'Ambience', duration: 120.5, sampleRate: 96000, channels: 2, filePath: '/sfx/amb/forest_birds.wav' },
  { id: 'sl_4', name: 'Footsteps Concrete Walk', category: 'Foley', duration: 4.2, sampleRate: 48000, channels: 1, filePath: '/sfx/foley/footsteps_concrete.wav' },
  { id: 'sl_5', name: 'Footsteps Gravel Run', category: 'Foley', duration: 3.8, sampleRate: 48000, channels: 1, filePath: '/sfx/foley/footsteps_gravel.wav' },
  { id: 'sl_6', name: 'Door Close Wood', category: 'Foley', duration: 1.1, sampleRate: 48000, channels: 1, filePath: '/sfx/foley/door_close_wood.wav' },
  { id: 'sl_7', name: 'Glass Shatter Large', category: 'Foley', duration: 2.3, sampleRate: 96000, channels: 2, filePath: '/sfx/foley/glass_shatter.wav' },
  { id: 'sl_8', name: 'Explosion Medium', category: 'SFX', duration: 5.6, sampleRate: 48000, channels: 2, filePath: '/sfx/sfx/explosion_med.wav' },
  { id: 'sl_9', name: 'Gunshot Pistol Single', category: 'SFX', duration: 1.5, sampleRate: 96000, channels: 2, filePath: '/sfx/sfx/gunshot_pistol.wav' },
  { id: 'sl_10', name: 'Whoosh Fast', category: 'SFX', duration: 0.8, sampleRate: 48000, channels: 1, filePath: '/sfx/sfx/whoosh_fast.wav' },
  { id: 'sl_11', name: 'Impact Metal Heavy', category: 'SFX', duration: 2.1, sampleRate: 48000, channels: 2, filePath: '/sfx/sfx/impact_metal.wav' },
  { id: 'sl_12', name: 'Cinematic Tension Bed', category: 'Music', duration: 45.0, sampleRate: 48000, channels: 2, filePath: '/sfx/music/tension_bed.wav' },
  { id: 'sl_13', name: 'Orchestral Hit Stinger', category: 'Music', duration: 3.2, sampleRate: 48000, channels: 2, filePath: '/sfx/music/orch_stinger.wav' },
  { id: 'sl_14', name: 'Piano Melancholy Loop', category: 'Music', duration: 16.0, sampleRate: 48000, channels: 2, filePath: '/sfx/music/piano_loop.wav' },
  { id: 'sl_15', name: 'Walla Crowd Medium', category: 'Dialog', duration: 30.0, sampleRate: 48000, channels: 2, filePath: '/sfx/dialog/walla_crowd.wav' },
  { id: 'sl_16', name: 'Radio Chatter Military', category: 'Dialog', duration: 8.5, sampleRate: 48000, channels: 1, filePath: '/sfx/dialog/radio_chatter.wav' },
];

const AUDIO_PLUGINS: AudioPlugin[] = [
  { id: 'p_1', name: 'Fairlight EQ', category: 'EQ', manufacturer: 'Blackmagic', type: 'AU' },
  { id: 'p_2', name: 'Pro-Q 4', category: 'EQ', manufacturer: 'FabFilter', type: 'VST3' },
  { id: 'p_3', name: 'SSL E-Channel', category: 'EQ', manufacturer: 'Waves', type: 'AAX' },
  { id: 'p_4', name: 'Fairlight Compressor', category: 'Dynamics', manufacturer: 'Blackmagic', type: 'AU' },
  { id: 'p_5', name: 'Pro-C 2', category: 'Dynamics', manufacturer: 'FabFilter', type: 'VST3' },
  { id: 'p_6', name: 'RCompressor', category: 'Dynamics', manufacturer: 'Waves', type: 'VST3' },
  { id: 'p_7', name: 'De-Esser', category: 'Dynamics', manufacturer: 'FabFilter', type: 'VST3' },
  { id: 'p_8', name: 'Gate/Expander', category: 'Dynamics', manufacturer: 'Blackmagic', type: 'AU' },
  { id: 'p_9', name: 'Valhalla Room', category: 'Reverb', manufacturer: 'Valhalla DSP', type: 'VST3' },
  { id: 'p_10', name: 'Fairlight Reverb', category: 'Reverb', manufacturer: 'Blackmagic', type: 'AU' },
  { id: 'p_11', name: 'Altiverb 8', category: 'Reverb', manufacturer: 'Audio Ease', type: 'AAX' },
  { id: 'p_12', name: 'Echoboy', category: 'Delay', manufacturer: 'Soundtoys', type: 'VST3' },
  { id: 'p_13', name: 'H-Delay', category: 'Delay', manufacturer: 'Waves', type: 'VST3' },
  { id: 'p_14', name: 'Fairlight Delay', category: 'Delay', manufacturer: 'Blackmagic', type: 'AU' },
  { id: 'p_15', name: 'MicroShift', category: 'Modulation', manufacturer: 'Soundtoys', type: 'VST3' },
  { id: 'p_16', name: 'Chorus', category: 'Modulation', manufacturer: 'Blackmagic', type: 'AU' },
  { id: 'p_17', name: 'Flanger', category: 'Modulation', manufacturer: 'Blackmagic', type: 'AU' },
  { id: 'p_18', name: 'Loudness Meter', category: 'Utility', manufacturer: 'Blackmagic', type: 'AU' },
  { id: 'p_19', name: 'Spectrum Analyzer', category: 'Utility', manufacturer: 'Blackmagic', type: 'AU' },
  { id: 'p_20', name: 'Test Tone Generator', category: 'Utility', manufacturer: 'Blackmagic', type: 'AU' },
];

const INPUT_OPTIONS = ['None', 'Input 1', 'Input 2', 'Input 3-4', 'Input 5-6', 'Input 7-8', 'Input 9-10'];
const OUTPUT_OPTIONS = ['None', 'Bus 1-2', 'Bus 3-4', 'Bus 5-6', 'Bus 7-8', 'Main Out'];
const AUTOMATION_MODES: AutomationMode[] = ['Off', 'Read', 'Touch', 'Latch', 'Write'];
const CHANNEL_FORMATS: ChannelFormat[] = ['Mono', 'Stereo', '5.1', '7.1'];
const LIBRARY_CATEGORIES: LibraryCategory[] = ['All', 'Ambience', 'Foley', 'SFX', 'Music', 'Dialog'];
const PLUGIN_CATEGORIES: PluginCategory[] = ['All', 'EQ', 'Dynamics', 'Reverb', 'Delay', 'Modulation', 'Utility'];

// =============================================================================
//  Styles
// =============================================================================

const S = {
  // --- Page layout ---
  root: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    background: 'var(--bg-void)',
  },
  topSection: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    minHeight: 0,
  },
  mixerSection: {
    height: 280,
    flexShrink: 0,
    borderTop: '1px solid var(--border-default)',
    overflow: 'hidden',
  },
  timelineSection: {
    height: 200,
    flexShrink: 0,
    borderTop: '1px solid var(--border-default)',
    overflow: 'hidden',
  },

  // --- Audio Track Index (left panel) ---
  trackIndex: {
    width: 200,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    borderRight: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
    overflow: 'hidden',
  },
  panelHeader: {
    padding: '4px 8px',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: 'var(--text-tertiary)',
    borderBottom: '1px solid var(--border-default)',
    background: 'var(--bg-raised)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
  },
  trackList: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: 0,
  },
  trackItem: (isSelected: boolean) => ({
    padding: '4px 6px',
    borderBottom: '1px solid var(--border-subtle)',
    background: isSelected ? 'var(--bg-hover)' : 'transparent',
    cursor: 'pointer',
    transition: 'background 100ms',
  }),
  trackItemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  trackColorDot: (color: string) => ({
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  }),
  trackName: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-primary)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  formatBadge: {
    fontSize: 7,
    fontWeight: 600,
    letterSpacing: 0.5,
    padding: '1px 3px',
    borderRadius: 2,
    background: 'var(--bg-elevated)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    flexShrink: 0,
  },
  trackControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    marginBottom: 3,
  },
  msrBtn: (active: boolean, variant: 'mute' | 'solo' | 'record') => {
    const colors = {
      mute: { bg: 'rgba(239,68,68,0.25)', fg: 'var(--error)' },
      solo: { bg: 'rgba(34,197,94,0.25)', fg: 'var(--success)' },
      record: { bg: 'rgba(239,68,68,0.35)', fg: '#ff4444' },
    };
    const c = colors[variant];
    return {
      width: 18,
      height: 14,
      border: 'none',
      borderRadius: 2,
      fontSize: 7,
      fontWeight: 700,
      cursor: 'pointer',
      background: active ? c.bg : 'var(--bg-elevated)',
      color: active ? c.fg : 'var(--text-muted)',
      transition: 'all 100ms',
      padding: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    };
  },
  miniFader: {
    flex: 1,
    height: 3,
    cursor: 'pointer',
    minWidth: 0,
  },
  miniDb: {
    fontFamily: 'var(--font-mono)',
    fontSize: 7,
    color: 'var(--text-muted)',
    minWidth: 28,
    textAlign: 'right' as const,
  },
  panIndicator: {
    width: 20,
    height: 14,
    background: 'var(--bg-void)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 7,
    position: 'relative' as const,
    flexShrink: 0,
    overflow: 'hidden',
  },
  panDot: (pan: number) => ({
    position: 'absolute' as const,
    top: 2,
    left: `${50 + pan * 40}%`,
    width: 4,
    height: 8,
    borderRadius: 2,
    background: 'var(--brand)',
    transform: 'translateX(-50%)',
    transition: 'left 60ms',
  }),
  trackRouting: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  miniSelect: {
    fontSize: 7,
    fontFamily: 'var(--font-mono)',
    padding: '1px 2px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 2,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    flex: 1,
    minWidth: 0,
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
  },
  automationBadge: (mode: AutomationMode) => {
    const colorMap: Record<AutomationMode, string> = {
      Off: 'var(--text-muted)',
      Read: '#4ade80',
      Touch: '#facc15',
      Latch: '#f97316',
      Write: '#ef4444',
    };
    return {
      fontSize: 7,
      fontWeight: 700,
      letterSpacing: 0.3,
      padding: '1px 3px',
      borderRadius: 2,
      background: 'var(--bg-elevated)',
      color: colorMap[mode],
      cursor: 'pointer',
      border: 'none',
      textTransform: 'uppercase' as const,
    };
  },
  adrBadge: {
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: 0.5,
    padding: '1px 4px',
    borderRadius: 2,
    background: 'rgba(239,68,68,0.15)',
    color: '#ff4444',
    border: '1px solid rgba(239,68,68,0.3)',
  },

  // --- Sound Library / Plugin Browser (right panel) ---
  browser: {
    width: 280,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    borderLeft: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
    overflow: 'hidden',
  },
  browserTabs: {
    display: 'flex',
    flexShrink: 0,
    borderBottom: '1px solid var(--border-default)',
  },
  browserTab: (active: boolean) => ({
    flex: 1,
    padding: '6px 4px',
    fontSize: 9,
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
    padding: '4px 6px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 3,
    padding: '4px 8px',
    fontSize: 10,
    color: 'var(--text-primary)',
    outline: 'none',
    fontFamily: 'var(--font-mono)',
  },
  categoryBar: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 2,
    padding: '4px 6px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  categoryBtn: (active: boolean) => ({
    padding: '2px 6px',
    fontSize: 8,
    fontWeight: 600,
    border: 'none',
    borderRadius: 3,
    cursor: 'pointer',
    background: active ? 'var(--brand)' : 'var(--bg-elevated)',
    color: active ? '#fff' : 'var(--text-muted)',
    transition: 'all 100ms',
    letterSpacing: 0.3,
  }),
  fileList: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: 0,
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 6px',
    borderBottom: '1px solid var(--border-subtle)',
    cursor: 'grab',
    transition: 'background 80ms',
  },
  fileItemHover: {
    background: 'var(--bg-hover)',
  },
  dragHandle: {
    width: 10,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 1,
    color: 'var(--text-muted)',
    fontSize: 6,
    cursor: 'grab',
  },
  previewBtn: {
    width: 18,
    height: 18,
    border: 'none',
    borderRadius: '50%',
    background: 'var(--bg-elevated)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: 8,
    padding: 0,
    transition: 'all 100ms',
  },
  fileName: {
    flex: 1,
    fontSize: 9,
    fontWeight: 500,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  fileMeta: {
    fontFamily: 'var(--font-mono)',
    fontSize: 7,
    color: 'var(--text-muted)',
    flexShrink: 0,
  },
  pluginItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 8px',
    borderBottom: '1px solid var(--border-subtle)',
    cursor: 'grab',
    transition: 'background 80ms',
  },
  pluginName: {
    flex: 1,
    fontSize: 9.5,
    fontWeight: 500,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  pluginManufacturer: {
    fontSize: 8,
    color: 'var(--text-muted)',
    flexShrink: 0,
  },
  pluginType: {
    fontSize: 7,
    fontWeight: 600,
    padding: '1px 4px',
    borderRadius: 2,
    background: 'var(--bg-elevated)',
    color: 'var(--text-tertiary)',
    flexShrink: 0,
    letterSpacing: 0.3,
  },

  // --- Center monitor wrapper ---
  monitorCenter: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    minWidth: 0,
    overflow: 'hidden',
  },

  // --- Empty state ---
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
    color: 'var(--text-muted)',
    fontSize: 10,
    fontStyle: 'italic' as const,
    textAlign: 'center' as const,
    padding: '0 12px',
  },
} as const;

// =============================================================================
//  Utility functions
// =============================================================================

function gainToDb(gain: number): string {
  if (gain <= 0) return '-inf';
  const db = 20 * Math.log10(gain);
  return db.toFixed(1);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${ms}`;
}

function formatSampleRate(rate: number): string {
  return `${(rate / 1000).toFixed(rate % 1000 === 0 ? 0 : 1)}k`;
}

// =============================================================================
//  Debounced Search Hook
// =============================================================================

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

// =============================================================================
//  Audio Track Index (Left Panel)
// =============================================================================

interface TrackIndexItemProps {
  track: AudioTrackState;
  meta: FairlightTrackMeta;
  isSelected: boolean;
  onSelect: () => void;
  onToggleRecordArm: () => void;
  onChangeInput: (value: string) => void;
  onChangeOutput: (value: string) => void;
  onChangeAutomation: (value: AutomationMode) => void;
  onChangeFormat: (value: ChannelFormat) => void;
}

const TrackIndexItem = memo(function TrackIndexItem({
  track,
  meta,
  isSelected,
  onSelect,
  onToggleRecordArm,
  onChangeInput,
  onChangeOutput,
  onChangeAutomation,
  onChangeFormat,
}: TrackIndexItemProps) {
  const { setGain, setPan, toggleMute, toggleSolo } = useAudioStore();
  const trackColors: Record<string, string> = {
    't3': '#4ade80',
    't4': '#60a5fa',
    'fl_sfx': '#f59e0b',
    'fl_music': '#a78bfa',
    'fl_foley': '#fb923c',
    'fl_adr': '#ef4444',
  };
  const color = trackColors[track.id] || '#888';

  return (
    <div
      style={S.trackItem(isSelected)}
      onClick={onSelect}
      role="option"
      aria-selected={isSelected}
      aria-label={`Audio track: ${track.name}`}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
    >
      {/* Track header: color dot, name, format badge */}
      <div style={S.trackItemHeader}>
        <div style={S.trackColorDot(color)} aria-hidden="true" />
        <span style={S.trackName}>{track.name}</span>
        {meta.isADR && <span style={S.adrBadge} aria-label="ADR recording mode">ADR</span>}
        <select
          style={{ ...S.formatBadge, border: 'none', cursor: 'pointer', appearance: 'none' as const, WebkitAppearance: 'none' as const, background: 'var(--bg-elevated)' }}
          value={meta.channelFormat}
          onChange={(e) => onChangeFormat(e.target.value as ChannelFormat)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Channel format for ${track.name}`}
          title="Channel format"
        >
          {CHANNEL_FORMATS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      {/* MSR buttons + mini fader + pan */}
      <div style={S.trackControls}>
        <button
          style={S.msrBtn(track.muted, 'mute')}
          onClick={(e) => { e.stopPropagation(); toggleMute(track.id); }}
          aria-label={`Mute ${track.name}`}
          aria-pressed={track.muted}
          title="Mute"
        >M</button>
        <button
          style={S.msrBtn(track.solo, 'solo')}
          onClick={(e) => { e.stopPropagation(); toggleSolo(track.id); }}
          aria-label={`Solo ${track.name}`}
          aria-pressed={track.solo}
          title="Solo"
        >S</button>
        <button
          style={S.msrBtn(meta.recordArmed, 'record')}
          onClick={(e) => { e.stopPropagation(); onToggleRecordArm(); }}
          aria-label={`Record arm ${track.name}`}
          aria-pressed={meta.recordArmed}
          title="Record Arm"
        >R</button>

        <input
          type="range"
          min={0}
          max={200}
          value={Math.round(track.gain * 100)}
          onChange={(e) => { e.stopPropagation(); setGain(track.id, +e.target.value / 100); }}
          onClick={(e) => e.stopPropagation()}
          style={S.miniFader}
          aria-label={`Volume for ${track.name}`}
          aria-valuetext={`${gainToDb(track.gain)} dB`}
          title={`${gainToDb(track.gain)} dB`}
        />
        <span style={S.miniDb} aria-hidden="true">{gainToDb(track.gain)}</span>

        <div style={S.panIndicator} title={`Pan: ${track.pan > 0 ? 'R' : track.pan < 0 ? 'L' : 'C'}${Math.abs(Math.round(track.pan * 100))}`} aria-hidden="true">
          <div style={S.panDot(track.pan)} />
        </div>
      </div>

      {/* Routing + automation row */}
      <div style={S.trackRouting}>
        <select
          style={S.miniSelect}
          value={meta.inputRouting}
          onChange={(e) => { e.stopPropagation(); onChangeInput(e.target.value); }}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Input routing for ${track.name}`}
          title="Input routing"
        >
          {INPUT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <span style={{ color: 'var(--text-muted)', fontSize: 7 }} aria-hidden="true">&rarr;</span>
        <select
          style={S.miniSelect}
          value={meta.outputRouting}
          onChange={(e) => { e.stopPropagation(); onChangeOutput(e.target.value); }}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Output routing for ${track.name}`}
          title="Output routing"
        >
          {OUTPUT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <button
          style={S.automationBadge(meta.automationMode)}
          onClick={(e) => {
            e.stopPropagation();
            const currentIdx = AUTOMATION_MODES.indexOf(meta.automationMode);
            const nextIdx = (currentIdx + 1) % AUTOMATION_MODES.length;
            onChangeAutomation(AUTOMATION_MODES[nextIdx]!);
          }}
          aria-label={`Automation mode for ${track.name}: ${meta.automationMode}. Click to cycle.`}
          title={`Automation: ${meta.automationMode}`}
        >
          {meta.automationMode}
        </button>
      </div>
    </div>
  );
});

interface AudioTrackIndexProps {
  trackMetas: FairlightTrackMeta[];
  setTrackMetas: React.Dispatch<React.SetStateAction<FairlightTrackMeta[]>>;
}

const AudioTrackIndex = memo(function AudioTrackIndex({ trackMetas, setTrackMetas }: AudioTrackIndexProps) {
  const tracks = useAudioStore((s) => s.tracks);
  const selectedTrackId = useAudioStore((s) => s.selectedTrackId);
  const selectTrack = useAudioStore((s) => s.selectTrack);

  const getMeta = useCallback((trackId: string): FairlightTrackMeta => {
    return trackMetas.find((m) => m.trackId === trackId) || {
      trackId,
      channelFormat: 'Mono',
      inputRouting: 'None',
      outputRouting: 'Bus 1-2',
      automationMode: 'Off',
      recordArmed: false,
      isADR: false,
    };
  }, [trackMetas]);

  const updateMeta = useCallback((trackId: string, updates: Partial<FairlightTrackMeta>) => {
    setTrackMetas((prev) => {
      const idx = prev.findIndex((m) => m.trackId === trackId);
      if (idx >= 0) {
        const newMetas = [...prev];
        newMetas[idx] = { ...newMetas[idx]!, ...updates };
        return newMetas;
      }
      return [...prev, { trackId, channelFormat: 'Mono', inputRouting: 'None', outputRouting: 'Bus 1-2', automationMode: 'Off' as AutomationMode, recordArmed: false, isADR: false, ...updates }];
    });
  }, [setTrackMetas]);

  return (
    <div style={S.trackIndex} role="region" aria-label="Audio Track Index">
      <div style={S.panelHeader}>
        <span>Audio Tracks</span>
        <span style={{ fontSize: 8, fontWeight: 400, color: 'var(--text-muted)' }}>
          {tracks.length} tracks
        </span>
      </div>
      <div style={S.trackList} role="listbox" aria-label="Audio track list">
        {tracks.map((track) => {
          const meta = getMeta(track.id);
          return (
            <TrackIndexItem
              key={track.id}
              track={track}
              meta={meta}
              isSelected={selectedTrackId === track.id}
              onSelect={() => selectTrack(track.id)}
              onToggleRecordArm={() => updateMeta(track.id, { recordArmed: !meta.recordArmed })}
              onChangeInput={(value) => updateMeta(track.id, { inputRouting: value })}
              onChangeOutput={(value) => updateMeta(track.id, { outputRouting: value })}
              onChangeAutomation={(value) => updateMeta(track.id, { automationMode: value })}
              onChangeFormat={(value) => updateMeta(track.id, { channelFormat: value })}
            />
          );
        })}
      </div>
    </div>
  );
});

// =============================================================================
//  Sound Library Browser
// =============================================================================

const SoundLibraryPanel = memo(function SoundLibraryPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<LibraryCategory>('All');
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(searchQuery, 250);

  const filteredItems = useMemo(() => {
    return SOUND_LIBRARY.filter((item) => {
      const matchesCategory = category === 'All' || item.category === category;
      const matchesSearch = debouncedSearch === '' ||
        item.name.toLowerCase().includes(debouncedSearch.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [category, debouncedSearch]);

  const handlePreview = useCallback((id: string) => {
    setPreviewingId((prev) => prev === id ? null : id);
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, item: SoundLibraryItem) => {
    e.dataTransfer.setData('application/x-fairlight-sound', JSON.stringify(item));
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  return (
    <>
      <div style={S.searchBar}>
        <input
          type="search"
          style={S.searchInput}
          placeholder="Search sounds..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search sound library"
        />
      </div>
      <div style={S.categoryBar} role="toolbar" aria-label="Sound categories">
        {LIBRARY_CATEGORIES.map((cat) => (
          <button
            key={cat}
            style={S.categoryBtn(category === cat)}
            onClick={() => setCategory(cat)}
            aria-pressed={category === cat}
            aria-label={`Filter by ${cat}`}
          >
            {cat}
          </button>
        ))}
      </div>
      <div style={S.fileList} role="list" aria-label="Sound effects list">
        {filteredItems.length === 0 ? (
          <div style={S.emptyState} role="status">No sounds match your search</div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              style={{
                ...S.fileItem,
                ...(hoveredId === item.id ? S.fileItemHover : {}),
              }}
              role="listitem"
              aria-label={`${item.name}, ${formatDuration(item.duration)}, ${formatSampleRate(item.sampleRate)}`}
              draggable
              onDragStart={(e) => handleDragStart(e, item)}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Drag handle */}
              <div style={S.dragHandle} aria-hidden="true" title="Drag to timeline">
                <span style={{ lineHeight: 1 }}>::</span>
              </div>

              {/* Preview button */}
              <button
                style={{
                  ...S.previewBtn,
                  ...(previewingId === item.id ? { background: 'var(--brand)', color: '#fff' } : {}),
                }}
                onClick={(e) => { e.stopPropagation(); handlePreview(item.id); }}
                aria-label={`Preview ${item.name}`}
                aria-pressed={previewingId === item.id}
                title={previewingId === item.id ? 'Stop preview' : 'Preview'}
              >
                {previewingId === item.id ? (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <polygon points="6 3 20 12 6 21" />
                  </svg>
                )}
              </button>

              {/* File info */}
              <span style={S.fileName}>{item.name}</span>
              <span style={S.fileMeta}>{formatDuration(item.duration)}</span>
              <span style={S.fileMeta}>{formatSampleRate(item.sampleRate)}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
});

// =============================================================================
//  Audio Plugin Browser
// =============================================================================

const PluginBrowserPanel = memo(function PluginBrowserPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<PluginCategory>('All');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(searchQuery, 250);

  const filteredPlugins = useMemo(() => {
    return AUDIO_PLUGINS.filter((plugin) => {
      const matchesCategory = category === 'All' || plugin.category === category;
      const matchesSearch = debouncedSearch === '' ||
        plugin.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        plugin.manufacturer.toLowerCase().includes(debouncedSearch.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [category, debouncedSearch]);

  const handleDragStart = useCallback((e: React.DragEvent, plugin: AudioPlugin) => {
    e.dataTransfer.setData('application/x-fairlight-plugin', JSON.stringify(plugin));
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  return (
    <>
      <div style={S.searchBar}>
        <input
          type="search"
          style={S.searchInput}
          placeholder="Search plugins..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search audio plugins"
        />
      </div>
      <div style={S.categoryBar} role="toolbar" aria-label="Plugin categories">
        {PLUGIN_CATEGORIES.map((cat) => (
          <button
            key={cat}
            style={S.categoryBtn(category === cat)}
            onClick={() => setCategory(cat)}
            aria-pressed={category === cat}
            aria-label={`Filter by ${cat}`}
          >
            {cat}
          </button>
        ))}
      </div>
      <div style={S.fileList} role="list" aria-label="Audio plugins list">
        {filteredPlugins.length === 0 ? (
          <div style={S.emptyState} role="status">No plugins match your search</div>
        ) : (
          filteredPlugins.map((plugin) => (
            <div
              key={plugin.id}
              style={{
                ...S.pluginItem,
                ...(hoveredId === plugin.id ? S.fileItemHover : {}),
              }}
              role="listitem"
              aria-label={`${plugin.name} by ${plugin.manufacturer}, ${plugin.type}`}
              draggable
              onDragStart={(e) => handleDragStart(e, plugin)}
              onMouseEnter={() => setHoveredId(plugin.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Drag handle */}
              <div style={S.dragHandle} aria-hidden="true" title="Drag to insert on track">
                <span style={{ lineHeight: 1 }}>::</span>
              </div>

              <span style={S.pluginName}>{plugin.name}</span>
              <span style={S.pluginManufacturer}>{plugin.manufacturer}</span>
              <span style={S.pluginType}>{plugin.type}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
});

// =============================================================================
//  Sound Library + Plugin Browser Container (Right Panel)
// =============================================================================

const BrowserPanel = memo(function BrowserPanel() {
  const [activeTab, setActiveTab] = useState<BrowserTab>('library');

  return (
    <div style={S.browser} role="region" aria-label="Sound Library and Plugin Browser">
      <div style={S.browserTabs} role="tablist" aria-label="Browser tabs">
        <button
          style={S.browserTab(activeTab === 'library')}
          onClick={() => setActiveTab('library')}
          role="tab"
          aria-selected={activeTab === 'library'}
          aria-controls="browser-panel-library"
          id="browser-tab-library"
        >
          Sound Library
        </button>
        <button
          style={S.browserTab(activeTab === 'effects')}
          onClick={() => setActiveTab('effects')}
          role="tab"
          aria-selected={activeTab === 'effects'}
          aria-controls="browser-panel-effects"
          id="browser-tab-effects"
        >
          Effects
        </button>
      </div>
      <div
        id={`browser-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`browser-tab-${activeTab}`}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
      >
        {activeTab === 'library' ? <SoundLibraryPanel /> : <PluginBrowserPanel />}
      </div>
    </div>
  );
});

// =============================================================================
//  Skeleton (loading state)
// =============================================================================

function FairlightPageSkeleton() {
  return (
    <div style={S.root} aria-hidden="true" role="status" aria-label="Loading Fairlight page">
      <div style={S.topSection}>
        <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--border-default)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid var(--border-subtle)', borderTopColor: 'var(--brand)', animation: 'spin 0.8s linear infinite' }} />
        </div>
        <div style={{ flex: 1, background: 'var(--bg-void)' }} />
        <div style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--border-default)', background: 'var(--bg-surface)' }} />
      </div>
      <div style={{ ...S.mixerSection, background: 'var(--bg-surface)' }} />
      <div style={{ ...S.timelineSection, background: 'var(--bg-surface)' }} />
    </div>
  );
}

// =============================================================================
//  Main Fairlight Page Component
// =============================================================================

export function FairlightPage() {
  const [isReady, setIsReady] = useState(false);
  const addTrack = useAudioStore((s) => s.addTrack);
  const tracks = useAudioStore((s) => s.tracks);

  // Fairlight-specific per-track metadata (not in global store, local to this page)
  const [trackMetas, setTrackMetas] = useState<FairlightTrackMeta[]>(DEMO_FAIRLIGHT_META);

  // Seed additional Fairlight demo tracks on mount
  useEffect(() => {
    // Read current store state directly to avoid stale closure with React Strict Mode
    const currentTracks = useAudioStore.getState().tracks;
    const existingIds = new Set(currentTracks.map((t) => t.id));
    const newMetas: FairlightTrackMeta[] = [...DEMO_FAIRLIGHT_META];

    for (const extra of DEMO_EXTRA_TRACKS) {
      if (!existingIds.has(extra.id)) {
        addTrack({
          id: extra.id,
          name: extra.name,
          gain: extra.gain,
          pan: 0,
          muted: false,
          solo: false,
          peakL: 0,
          peakR: 0,
          eq: [
            { frequency: 31, gain: 0, Q: 0.7 },
            { frequency: 62, gain: 0, Q: 1.0 },
            { frequency: 125, gain: 0, Q: 1.0 },
            { frequency: 250, gain: 0, Q: 1.0 },
            { frequency: 500, gain: 0, Q: 1.0 },
            { frequency: 1000, gain: 0, Q: 1.0 },
            { frequency: 2000, gain: 0, Q: 1.0 },
            { frequency: 4000, gain: 0, Q: 1.0 },
            { frequency: 8000, gain: 0, Q: 1.0 },
            { frequency: 16000, gain: 0, Q: 0.7 },
          ],
          compressor: { threshold: -24, ratio: 4, attack: 3, release: 250, knee: 10 },
        });
        existingIds.add(extra.id);
      }
      newMetas.push({ trackId: extra.id, ...extra.meta });
    }

    setTrackMetas(newMetas);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Brief delay to show loading skeleton (consistent with ColorPage pattern)
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 150);
    return () => clearTimeout(timer);
  }, []);

  if (!isReady) {
    return <FairlightPageSkeleton />;
  }

  return (
    <div
      style={S.root}
      role="region"
      aria-label="Fairlight Audio Post-Production Page"
    >
      {/* Top Section: Track Index | Record Monitor | Sound Library */}
      <div style={S.topSection}>
        {/* Left: Audio Track Index */}
        <AudioTrackIndex trackMetas={trackMetas} setTrackMetas={setTrackMetas} />

        {/* Center: Record Monitor */}
        <div
          style={S.monitorCenter}
          role="region"
          aria-label="Audio monitoring video reference"
        >
          <RecordMonitor />
        </div>

        {/* Right: Sound Library / Plugin Browser */}
        <BrowserPanel />
      </div>

      {/* Middle Section: Audio Mixer */}
      <div
        style={S.mixerSection}
        role="region"
        aria-label="Audio mixer strip"
      >
        <AudioMixer />
      </div>

      {/* Bottom Section: Timeline */}
      <div
        style={S.timelineSection}
        role="region"
        aria-label="Fairlight audio timeline"
      >
        <TimelinePanel />
      </div>
    </div>
  );
}
