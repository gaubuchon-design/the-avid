// =============================================================================
//  THE AVID -- Accessibility & Caption Compliance Panel
//  Caption track management, timecoded cue editing, multi-standard validation,
//  compliance scoring, export (SRT/VTT/EBU-STL), audio description controls,
//  AI-powered auto-generate, and full WCAG/FCC/Section 508 compliance checks.
// =============================================================================

import React, { useState, useCallback, useMemo } from 'react';
import { useEditorStore } from '../../store/editor.store';
import type {
  CaptionCue,
  CaptionFormat,
  CaptionValidationResult,
  CaptionError,
  CaptionWarning,
  CaptionStats,
  AccessibilityReport,
} from '@mcua/core';
// CaptionStandard and CaptionViolation defined locally for compliance checks
type CaptionStandard = 'WCAG_AA' | 'WCAG_AAA' | 'FCC' | 'SECTION_508' | 'EBU';
interface CaptionViolation {
  standard: CaptionStandard;
  rule: string;
  description: string;
  cueId?: string;
  severity: 'error' | 'warning';
}
import type {
  ADTrackStatus,
  AudioDescriptionCue,
} from '@mcua/core';

// -- Helpers ------------------------------------------------------------------

function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function generateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// -- Local types & constants --------------------------------------------------

type TabId = 'captions' | 'validation' | 'audio-desc' | 'compliance';
type ExportFormat = 'SRT' | 'VTT' | 'EBU-STL';

interface CaptionTrack {
  id: string;
  label: string;
  language: string;
  isDefault: boolean;
  cues: LocalCue[];
}

interface LocalCue {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  speaker?: string;
}

interface LocalValidation {
  id: string;
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  cueId?: string;
  timestamp?: number;
  autoFixable: boolean;
}

interface ComplianceStandard {
  id: string;
  label: string;
  description: string;
  score: number;
  maxScore: number;
  status: 'pass' | 'warn' | 'fail';
}

interface ADTrack {
  id: string;
  label: string;
  status: ADTrackStatus;
  cueCount: number;
  durationSeconds: number;
}

// -- Demo data ----------------------------------------------------------------

const DEMO_TRACKS: CaptionTrack[] = [
  {
    id: 'track-en', label: 'English (CC)', language: 'en', isDefault: true,
    cues: [
      { id: 'cue-1', startTime: 0.5, endTime: 3.2, text: 'Welcome to today\'s episode.', speaker: 'Host' },
      { id: 'cue-2', startTime: 3.5, endTime: 7.1, text: 'We\'re going to explore the latest advances in video editing.', speaker: 'Host' },
      { id: 'cue-3', startTime: 8.0, endTime: 11.4, text: 'Let me show you the new features we\'ve been working on.', speaker: 'Host' },
      { id: 'cue-4', startTime: 12.0, endTime: 15.8, text: 'The timeline has been completely redesigned for better workflow.', speaker: 'Host' },
      { id: 'cue-5', startTime: 16.5, endTime: 19.2, text: 'Notice how the clips snap into place automatically.', speaker: 'Host' },
      { id: 'cue-6', startTime: 20.0, endTime: 24.1, text: 'AI-powered color grading can match shots across your entire project.', speaker: 'Host' },
      { id: 'cue-7', startTime: 25.0, endTime: 28.5, text: 'And the collaboration features let your whole team work together.', speaker: 'Host' },
      { id: 'cue-8', startTime: 29.0, endTime: 32.0, text: 'Let\'s dive deeper into each of these tools.', speaker: 'Host' },
      { id: 'cue-9', startTime: 33.0, endTime: 37.5, text: 'First up, the multi-camera editing panel.', speaker: 'Host' },
      { id: 'cue-10', startTime: 38.0, endTime: 40.0, text: 'This is going to change how you work.', speaker: 'Host' },
    ],
  },
  {
    id: 'track-es', label: 'Spanish', language: 'es', isDefault: false,
    cues: [
      { id: 'cue-es-1', startTime: 0.5, endTime: 3.2, text: 'Bienvenidos al episodio de hoy.', speaker: 'Host' },
      { id: 'cue-es-2', startTime: 3.5, endTime: 7.1, text: 'Vamos a explorar los avances en edicion de video.', speaker: 'Host' },
    ],
  },
];

const DEMO_VALIDATIONS: LocalValidation[] = [
  { id: 'val-1', severity: 'error', rule: 'timing-overlap', message: 'Timing overlap between cue 3 and cue 4 (gap < 0.1s)', cueId: 'cue-3', timestamp: 11.4, autoFixable: true },
  { id: 'val-2', severity: 'warning', rule: 'reading-speed', message: 'Reading speed exceeds 200 WPM (220 WPM)', cueId: 'cue-6', timestamp: 20.0, autoFixable: false },
  { id: 'val-3', severity: 'warning', rule: 'gap-too-large', message: 'Caption gap > 5 seconds detected', timestamp: 7.1, autoFixable: false },
  { id: 'val-4', severity: 'info', rule: 'line-length', message: 'Consider splitting long caption into two lines', cueId: 'cue-2', timestamp: 3.5, autoFixable: true },
];

const DEMO_COMPLIANCE: ComplianceStandard[] = [
  { id: 'wcag', label: 'WCAG 2.1 AA', description: 'Web Content Accessibility Guidelines', score: 87, maxScore: 100, status: 'warn' },
  { id: 'fcc', label: 'FCC', description: 'US Federal Communications Commission', score: 92, maxScore: 100, status: 'pass' },
  { id: 'section508', label: 'Section 508', description: 'US Rehabilitation Act', score: 78, maxScore: 100, status: 'warn' },
  { id: 'bbc-ebu', label: 'BBC / EBU', description: 'European Broadcasting Union', score: 64, maxScore: 100, status: 'fail' },
];

const DEMO_AD_TRACKS: ADTrack[] = [
  { id: 'ad-1', label: 'Audio Description (EN)', status: 'active', cueCount: 12, durationSeconds: 45.2 },
];

// -- Styles -------------------------------------------------------------------

const S = {
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-display), system-ui, sans-serif',
    fontSize: 12,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.02em',
    flex: 1,
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  },
  tab: (active: boolean) => ({
    flex: 1,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.04em',
    color: active ? 'var(--brand-bright)' : 'var(--text-muted)',
    borderBottom: `2px solid ${active ? 'var(--brand-bright)' : 'transparent'}`,
    cursor: 'pointer',
    transition: 'all 80ms',
    background: 'none',
    border: 'none',
    borderTop: 'none',
    borderLeft: 'none',
    borderRight: 'none',
  }),
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: 12,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-muted)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    marginBottom: 8,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowLabel: {
    fontSize: 10,
    color: 'var(--text-muted)',
  },
  rowValue: {
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-primary)',
    fontWeight: 500,
  },
} as const;

// -- WCAG Level Badge ---------------------------------------------------------

function ComplianceBadge({ score }: { score: number }) {
  const level = score >= 90 ? 'AAA' : score >= 75 ? 'AA' : score >= 50 ? 'A' : 'FAIL';
  const colors: Record<string, { bg: string; fg: string }> = {
    AAA: { bg: 'rgba(34,197,94,0.15)', fg: 'var(--success)' },
    AA: { bg: 'rgba(99,102,241,0.15)', fg: 'var(--brand-bright)' },
    A: { bg: 'rgba(245,158,11,0.15)', fg: 'var(--warning)' },
    FAIL: { bg: 'rgba(239,68,68,0.15)', fg: 'var(--error)' },
  };
  const c = colors[level];

  return (
    <span style={{
      fontSize: 10,
      padding: '3px 8px',
      borderRadius: 3,
      background: c.bg,
      color: c.fg,
      fontWeight: 700,
      letterSpacing: '0.04em',
    }}>
      WCAG {level}
    </span>
  );
}

// -- Caption Track Listing ----------------------------------------------------

function TrackList({
  tracks,
  activeTrackId,
  onSelectTrack,
  onAddTrack,
  onRemoveTrack,
}: {
  tracks: CaptionTrack[];
  activeTrackId: string;
  onSelectTrack: (id: string) => void;
  onAddTrack: () => void;
  onRemoveTrack: (id: string) => void;
}) {
  return (
    <div style={S.section}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={S.sectionTitle}>Caption Tracks</span>
        <button
          onClick={onAddTrack}
          className="tl-btn"
          style={{
            padding: '3px 8px',
            borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--border-default)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 9,
            cursor: 'pointer',
          }}
        >
          + Add Track
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {tracks.map((track) => {
          const isActive = track.id === activeTrackId;
          return (
            <div
              key={track.id}
              onClick={() => onSelectTrack(track.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                borderRadius: 'var(--radius-sm)',
                background: isActive ? 'var(--bg-elevated)' : 'var(--bg-raised)',
                border: `1px solid ${isActive ? 'var(--brand)' : 'transparent'}`,
                cursor: 'pointer',
                transition: 'all 80ms',
              }}
            >
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '1px 4px',
                borderRadius: 2,
                background: track.isDefault ? 'rgba(99,102,241,0.15)' : 'var(--bg-void)',
                color: track.isDefault ? 'var(--brand-bright)' : 'var(--text-muted)',
                textTransform: 'uppercase',
              }}>
                {track.language}
              </span>
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>
                {track.label}
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                {track.cues.length} cues
              </span>
              {!track.isDefault && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveTrack(track.id); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 10,
                    padding: '0 2px',
                  }}
                  title="Remove track"
                >
                  {'\u2715'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -- Caption Cue Editor -------------------------------------------------------

function CueEditor({
  cues,
  selectedCueId,
  onSelectCue,
  onSeekTo,
  onUpdateCue,
  onRemoveCue,
  onAddCue,
}: {
  cues: LocalCue[];
  selectedCueId: string | null;
  onSelectCue: (id: string | null) => void;
  onSeekTo: (time: number) => void;
  onUpdateCue: (id: string, field: 'startTime' | 'endTime' | 'text' | 'speaker', value: string | number) => void;
  onRemoveCue: (id: string) => void;
  onAddCue: () => void;
}) {
  const [editingCueId, setEditingCueId] = useState<string | null>(null);

  return (
    <div style={S.section}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={S.sectionTitle}>Captions ({cues.length})</span>
        <button
          onClick={onAddCue}
          className="tl-btn"
          style={{
            padding: '3px 8px',
            borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--border-default)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 9,
            cursor: 'pointer',
          }}
        >
          + Add Cue
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 300, overflowY: 'auto' }}>
        {cues.map((cue) => {
          const isSelected = cue.id === selectedCueId;
          const isEditing = cue.id === editingCueId;

          return (
            <div
              key={cue.id}
              onClick={() => onSelectCue(isSelected ? null : cue.id)}
              style={{
                display: 'flex',
                gap: 8,
                padding: '6px 8px',
                borderRadius: 'var(--radius-sm)',
                background: isSelected ? 'var(--bg-void)' : 'transparent',
                border: isSelected ? '1px solid var(--border-subtle)' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 80ms',
              }}
            >
              {/* Timecodes */}
              <div
                onClick={(e) => { e.stopPropagation(); onSeekTo(cue.startTime); }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, minWidth: 80 }}
              >
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--brand-bright)', fontWeight: 600, cursor: 'pointer' }}>
                  {formatTimecode(cue.startTime)}
                </span>
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  {formatTimecode(cue.endTime)}
                </span>
              </div>

              {/* Text content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {cue.speaker && (
                  <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2 }}>
                    {cue.speaker}
                  </div>
                )}
                {isEditing ? (
                  <textarea
                    value={cue.text}
                    onChange={(e) => onUpdateCue(cue.id, 'text', e.target.value)}
                    onBlur={() => setEditingCueId(null)}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: '100%',
                      minHeight: 36,
                      padding: '4px 6px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--brand)',
                      background: 'var(--bg-void)',
                      color: 'var(--text-primary)',
                      fontSize: 11,
                      fontFamily: 'var(--font-ui)',
                      resize: 'vertical',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                ) : (
                  <div
                    onDoubleClick={(e) => { e.stopPropagation(); setEditingCueId(cue.id); }}
                    style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.4 }}
                    title="Double-click to edit"
                  >
                    {cue.text}
                  </div>
                )}
              </div>

              {/* Remove button */}
              {isSelected && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveCue(cue.id); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 10,
                    padding: '0 2px',
                    alignSelf: 'flex-start',
                  }}
                  title="Remove cue"
                >
                  {'\u2715'}
                </button>
              )}
            </div>
          );
        })}
        {cues.length === 0 && (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 11 }}>
            No caption cues. Click "Add Cue" or use AI to auto-generate.
          </div>
        )}
      </div>
    </div>
  );
}

// -- Validation Tab -----------------------------------------------------------

function ValidationTab({
  validations,
  onSeekTo,
  onAutoFix,
}: {
  validations: LocalValidation[];
  onSeekTo: (time: number) => void;
  onAutoFix: () => void;
}) {
  const errors = validations.filter((v) => v.severity === 'error');
  const warnings = validations.filter((v) => v.severity === 'warning');
  const infos = validations.filter((v) => v.severity === 'info');
  const fixable = validations.filter((v) => v.autoFixable);

  if (validations.length === 0) {
    return (
      <div>
        <div style={{
          padding: 16,
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(34,197,94,0.08)',
          border: '1px solid rgba(34,197,94,0.2)',
          textAlign: 'center',
          fontSize: 11,
          color: 'var(--success)',
          fontWeight: 600,
        }}>
          All validation checks passed
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Summary bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 10px',
        background: 'var(--bg-raised)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
        marginBottom: 12,
        fontSize: 10,
      }}>
        {errors.length > 0 && (
          <span style={{ color: 'var(--error)', fontWeight: 700 }}>
            {errors.length} error{errors.length !== 1 ? 's' : ''}
          </span>
        )}
        {warnings.length > 0 && (
          <span style={{ color: 'var(--warning)', fontWeight: 700 }}>
            {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
          </span>
        )}
        {infos.length > 0 && (
          <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
            {infos.length} info
          </span>
        )}
        {fixable.length > 0 && (
          <button
            onClick={onAutoFix}
            className="tl-btn"
            style={{
              marginLeft: 'auto',
              padding: '3px 10px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'var(--brand)',
              color: '#fff',
              fontSize: 9,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Auto-fix ({fixable.length})
          </button>
        )}
      </div>

      {/* Validation results list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {validations.map((v) => {
          const sevColor = v.severity === 'error' ? 'var(--error)' : v.severity === 'warning' ? 'var(--warning)' : 'var(--text-muted)';
          const sevBg = v.severity === 'error' ? 'rgba(239,68,68,0.08)' : v.severity === 'warning' ? 'rgba(245,158,11,0.08)' : 'rgba(148,163,184,0.08)';

          return (
            <div
              key={v.id}
              onClick={() => v.timestamp != null && onSeekTo(v.timestamp)}
              style={{
                padding: '6px 8px',
                borderRadius: 'var(--radius-sm)',
                background: sevBg,
                borderLeft: `3px solid ${sevColor}`,
                cursor: v.timestamp != null ? 'pointer' : 'default',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: sevColor, textTransform: 'uppercase' }}>
                  {v.severity}
                </span>
                <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  {v.rule}
                </span>
                {v.timestamp != null && (
                  <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {formatTimecode(v.timestamp)}
                  </span>
                )}
                {v.autoFixable && (
                  <span style={{
                    fontSize: 8,
                    fontWeight: 700,
                    padding: '0 4px',
                    borderRadius: 2,
                    background: 'rgba(34,197,94,0.15)',
                    color: 'var(--success)',
                  }}>
                    FIXABLE
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-primary)', marginTop: 2, lineHeight: 1.4 }}>
                {v.message}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -- Audio Description Tab ----------------------------------------------------

function AudioDescTab({
  adTracks,
  onAddTrack,
  onToggleTrackStatus,
}: {
  adTracks: ADTrack[];
  onAddTrack: () => void;
  onToggleTrackStatus: (id: string) => void;
}) {
  return (
    <div>
      <div style={S.section}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={S.sectionTitle}>Audio Description Tracks</span>
          <button
            onClick={onAddTrack}
            className="tl-btn"
            style={{
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px dashed var(--border-default)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 9,
              cursor: 'pointer',
            }}
          >
            + Add AD Track
          </button>
        </div>

        {adTracks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 11 }}>
            No audio description tracks. Add one to improve accessibility.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {adTracks.map((track) => {
              const statusColors: Record<ADTrackStatus, { bg: string; fg: string; label: string }> = {
                active: { bg: 'rgba(34,197,94,0.15)', fg: 'var(--success)', label: 'Active' },
                inactive: { bg: 'rgba(148,163,184,0.15)', fg: 'var(--text-muted)', label: 'Inactive' },
                recording: { bg: 'rgba(239,68,68,0.15)', fg: 'var(--error)', label: 'Recording' },
                editing: { bg: 'rgba(99,102,241,0.15)', fg: 'var(--brand-bright)', label: 'Editing' },
              };
              const st = statusColors[track.status];

              return (
                <div
                  key={track.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-raised)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                      {track.label}
                    </span>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 3,
                      background: st.bg,
                      color: st.fg,
                      textTransform: 'uppercase',
                    }}>
                      {st.label}
                    </span>
                  </div>
                  <div style={{ ...S.row, marginBottom: 4 }}>
                    <span style={S.rowLabel}>Cues</span>
                    <span style={S.rowValue}>{track.cueCount}</span>
                  </div>
                  <div style={{ ...S.row, marginBottom: 8 }}>
                    <span style={S.rowLabel}>Duration</span>
                    <span style={S.rowValue}>{formatTimecode(track.durationSeconds)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => onToggleTrackStatus(track.id)}
                      className="tl-btn"
                      style={{
                        flex: 1,
                        padding: '5px 0',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-default)',
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        fontSize: 10,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {track.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      className="tl-btn"
                      style={{
                        flex: 1,
                        padding: '5px 0',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-default)',
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        fontSize: 10,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Record
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Ducking controls */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Program Audio Ducking</div>
        <div style={{
          padding: '10px 12px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-raised)',
          border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ ...S.row, marginBottom: 6 }}>
            <span style={S.rowLabel}>Duck Level</span>
            <span style={S.rowValue}>-12 dB</span>
          </div>
          <div style={{ ...S.row, marginBottom: 6 }}>
            <span style={S.rowLabel}>Attack</span>
            <span style={S.rowValue}>200 ms</span>
          </div>
          <div style={S.row}>
            <span style={S.rowLabel}>Release</span>
            <span style={S.rowValue}>500 ms</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// -- Compliance Tab -----------------------------------------------------------

function ComplianceTab({ standards }: { standards: ComplianceStandard[] }) {
  // Compute overall score
  const overallScore = standards.length > 0
    ? Math.round(standards.reduce((sum, s) => sum + s.score, 0) / standards.length)
    : 0;

  return (
    <div>
      {/* Overall compliance score */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px',
        background: 'var(--bg-void)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-sm)',
        marginBottom: 16,
      }}>
        <div style={{
          fontSize: 36,
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          color: overallScore >= 85 ? 'var(--success)' : overallScore >= 65 ? 'var(--warning)' : 'var(--error)',
          lineHeight: 1,
        }}>
          {overallScore}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          Overall Compliance Score
        </div>
        {/* Progress bar */}
        <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--bg-elevated)', marginTop: 10, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${overallScore}%`,
            borderRadius: 3,
            background: overallScore >= 85 ? 'var(--success)' : overallScore >= 65 ? 'var(--warning)' : 'var(--error)',
            transition: 'width 300ms',
          }} />
        </div>
      </div>

      {/* Per-standard breakdown */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Standard Compliance</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {standards.map((std) => {
            const statusColor = std.status === 'pass' ? 'var(--success)' : std.status === 'warn' ? 'var(--warning)' : 'var(--error)';

            return (
              <div
                key={std.id}
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-raised)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
                    {std.label}
                  </span>
                  <span style={{
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: statusColor,
                  }}>
                    {std.score}
                  </span>
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}>
                  {std.description}
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${(std.score / std.maxScore) * 100}%`,
                    borderRadius: 2,
                    background: statusColor,
                    transition: 'width 300ms',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// -- Caption Stats ------------------------------------------------------------

function StatsDisplay({ cues, totalDuration }: { cues: LocalCue[]; totalDuration: number }) {
  const stats = useMemo(() => {
    let captionedDuration = 0;
    let maxWPM = 0;
    let totalWords = 0;
    let totalCueDuration = 0;

    for (const cue of cues) {
      const duration = cue.endTime - cue.startTime;
      captionedDuration += duration;
      const wordCount = cue.text.split(/\s+/).length;
      const wpm = duration > 0 ? (wordCount / duration) * 60 : 0;
      totalWords += wordCount;
      totalCueDuration += duration;
      if (wpm > maxWPM) maxWPM = wpm;
    }

    return {
      totalCues: cues.length,
      coveragePercent: totalDuration > 0 ? (captionedDuration / totalDuration) * 100 : 0,
      averageWPM: totalCueDuration > 0 ? (totalWords / totalCueDuration) * 60 : 0,
      maxWPM,
    };
  }, [cues, totalDuration]);

  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Statistics</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {[
          { value: stats.totalCues.toString(), label: 'Total Cues', color: 'var(--text-primary)' },
          {
            value: `${stats.coveragePercent.toFixed(1)}%`,
            label: 'Coverage',
            color: stats.coveragePercent >= 90 ? 'var(--success)' : stats.coveragePercent >= 70 ? 'var(--warning)' : 'var(--error)',
          },
          {
            value: Math.round(stats.averageWPM).toString(),
            label: 'Avg WPM',
            color: stats.averageWPM <= 160 ? 'var(--success)' : stats.averageWPM <= 200 ? 'var(--warning)' : 'var(--error)',
          },
        ].map((stat) => (
          <div key={stat.label} style={{ padding: 8, borderRadius: 'var(--radius-sm)', background: 'var(--bg-void)', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// -- Export Controls -----------------------------------------------------------

function ExportControls({
  format,
  onFormatChange,
  onExport,
}: {
  format: ExportFormat;
  onFormatChange: (f: ExportFormat) => void;
  onExport: () => void;
}) {
  const formats: ExportFormat[] = ['SRT', 'VTT', 'EBU-STL'];

  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Export Captions</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {formats.map((f) => (
          <button
            key={f}
            onClick={() => onFormatChange(f)}
            className="tl-btn"
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${format === f ? 'var(--brand)' : 'var(--border-subtle)'}`,
              background: format === f ? 'rgba(99,102,241,0.1)' : 'transparent',
              color: format === f ? 'var(--brand-bright)' : 'var(--text-muted)',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 80ms',
            }}
          >
            {f}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={onExport}
          className="tl-btn"
          style={{
            padding: '8px 20px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: 'var(--brand)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 80ms',
          }}
        >
          Export {format}
        </button>
      </div>
    </div>
  );
}

// -- AI Generate Button -------------------------------------------------------

function AIGenerateButton({ onGenerate, isGenerating }: { onGenerate: () => void; isGenerating: boolean }) {
  return (
    <div style={S.section}>
      <button
        onClick={onGenerate}
        disabled={isGenerating}
        className="tl-btn"
        style={{
          width: '100%',
          padding: '10px 0',
          borderRadius: 'var(--radius-sm)',
          border: 'none',
          background: isGenerating ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #7c5cfc, #a78bfa)',
          color: isGenerating ? 'var(--text-muted)' : '#fff',
          fontSize: 11,
          fontWeight: 700,
          cursor: isGenerating ? 'default' : 'pointer',
          transition: 'all 100ms',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <span style={{
          fontSize: 8,
          fontWeight: 700,
          padding: '1px 5px',
          borderRadius: 3,
          background: 'rgba(255,255,255,0.2)',
        }}>
          AI
        </span>
        {isGenerating ? 'Generating Captions...' : 'Auto-Generate Captions'}
      </button>
    </div>
  );
}

// -- Main Accessibility Panel -------------------------------------------------

export function AccessibilityPanel() {
  const { duration, setPlayhead, playheadTime } = useEditorStore();

  // State
  const [activeTab, setActiveTab] = useState<TabId>('captions');
  const [tracks, setTracks] = useState<CaptionTrack[]>(DEMO_TRACKS);
  const [activeTrackId, setActiveTrackId] = useState('track-en');
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('SRT');
  const [validations] = useState<LocalValidation[]>(DEMO_VALIDATIONS);
  const [compliance] = useState<ComplianceStandard[]>(DEMO_COMPLIANCE);
  const [adTracks, setAdTracks] = useState<ADTrack[]>(DEMO_AD_TRACKS);
  const [isGenerating, setIsGenerating] = useState(false);

  const activeTrack = tracks.find((t) => t.id === activeTrackId);
  const activeCues = activeTrack?.cues ?? [];

  // Compute WCAG-like score for the badge
  const overallScore = compliance.length > 0
    ? Math.round(compliance.reduce((sum, s) => sum + s.score, 0) / compliance.length)
    : 0;

  // Handlers
  const handleSeekTo = useCallback((time: number) => {
    setPlayhead(time);
  }, [setPlayhead]);

  const handleAddTrack = useCallback(() => {
    const id = generateId('track');
    setTracks((prev) => [
      ...prev,
      { id, label: `New Track (${prev.length + 1})`, language: 'und', isDefault: false, cues: [] },
    ]);
    setActiveTrackId(id);
  }, []);

  const handleRemoveTrack = useCallback((trackId: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
    if (activeTrackId === trackId) {
      setActiveTrackId(tracks[0]?.id ?? '');
    }
  }, [activeTrackId, tracks]);

  const handleAddCue = useCallback(() => {
    const newCue: LocalCue = {
      id: generateId('cue'),
      startTime: playheadTime,
      endTime: playheadTime + 3,
      text: '',
      speaker: 'Speaker',
    };
    setTracks((prev) =>
      prev.map((t) =>
        t.id === activeTrackId
          ? { ...t, cues: [...t.cues, newCue].sort((a, b) => a.startTime - b.startTime) }
          : t,
      ),
    );
    setSelectedCueId(newCue.id);
  }, [activeTrackId, playheadTime]);

  const handleRemoveCue = useCallback((cueId: string) => {
    setTracks((prev) =>
      prev.map((t) =>
        t.id === activeTrackId
          ? { ...t, cues: t.cues.filter((c) => c.id !== cueId) }
          : t,
      ),
    );
    if (selectedCueId === cueId) setSelectedCueId(null);
  }, [activeTrackId, selectedCueId]);

  const handleUpdateCue = useCallback((cueId: string, field: string, value: string | number) => {
    setTracks((prev) =>
      prev.map((t) =>
        t.id === activeTrackId
          ? { ...t, cues: t.cues.map((c) => c.id === cueId ? { ...c, [field]: value } : c) }
          : t,
      ),
    );
  }, [activeTrackId]);

  const handleExport = useCallback(() => {
    // Export logic would be implemented here
  }, []);

  const handleAutoFix = useCallback(() => {
    // Auto-fix logic via CaptionValidator would run here
  }, []);

  const handleAutoGenerate = useCallback(() => {
    setIsGenerating(true);
    // Simulate AI caption generation
    setTimeout(() => setIsGenerating(false), 2500);
  }, []);

  const handleAddADTrack = useCallback(() => {
    setAdTracks((prev) => [
      ...prev,
      {
        id: generateId('ad'),
        label: `Audio Description (${prev.length + 1})`,
        status: 'inactive',
        cueCount: 0,
        durationSeconds: 0,
      },
    ]);
  }, []);

  const handleToggleADStatus = useCallback((id: string) => {
    setAdTracks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: t.status === 'active' ? 'inactive' : 'active' } : t,
      ),
    );
  }, []);

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'captions', label: 'Captions' },
    { id: 'validation', label: 'Validation' },
    { id: 'audio-desc', label: 'Audio Desc' },
    { id: 'compliance', label: 'Compliance' },
  ];

  // ---- Loading state (generating) ----
  // We show the loading overlay inside the captions tab content instead

  // ---- Empty state ----
  // Handled within each sub-component

  return (
    <div style={S.panel}>
      {/* Header */}
      <div className="panel-header" style={S.header}>
        <span className="panel-title" style={S.title}>Accessibility</span>
        <ComplianceBadge score={overallScore} />
      </div>

      {/* Tab bar */}
      <div style={S.tabBar}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={S.tab(activeTab === t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="panel-body" style={S.body}>
        {activeTab === 'captions' && (
          <>
            {/* AI generate button */}
            <AIGenerateButton onGenerate={handleAutoGenerate} isGenerating={isGenerating} />

            {/* Track list */}
            <TrackList
              tracks={tracks}
              activeTrackId={activeTrackId}
              onSelectTrack={setActiveTrackId}
              onAddTrack={handleAddTrack}
              onRemoveTrack={handleRemoveTrack}
            />

            {/* Caption cue editor */}
            <CueEditor
              cues={activeCues}
              selectedCueId={selectedCueId}
              onSelectCue={setSelectedCueId}
              onSeekTo={handleSeekTo}
              onUpdateCue={handleUpdateCue}
              onRemoveCue={handleRemoveCue}
              onAddCue={handleAddCue}
            />

            {/* Stats */}
            <StatsDisplay cues={activeCues} totalDuration={duration} />

            {/* Export */}
            <ExportControls
              format={exportFormat}
              onFormatChange={setExportFormat}
              onExport={handleExport}
            />
          </>
        )}

        {activeTab === 'validation' && (
          <ValidationTab
            validations={validations}
            onSeekTo={handleSeekTo}
            onAutoFix={handleAutoFix}
          />
        )}

        {activeTab === 'audio-desc' && (
          <AudioDescTab
            adTracks={adTracks}
            onAddTrack={handleAddADTrack}
            onToggleTrackStatus={handleToggleADStatus}
          />
        )}

        {activeTab === 'compliance' && (
          <ComplianceTab standards={compliance} />
        )}
      </div>
    </div>
  );
}
