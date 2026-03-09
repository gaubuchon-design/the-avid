// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Thumbnail Designer Panel
//  Frame selection, text overlays, color boost, export
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useCallback } from 'react';
import { useCreatorStore } from '../../store/creator.store';
import type {
  ThumbnailDesign,
  ThumbnailCandidate,
  ColorBoostPreset,
  ThumbnailExportSize,
  TextOverlay,
  ThumbnailBackground,
} from '@mcua/core';
import { COLOR_BOOST_PRESETS, THUMBNAIL_EXPORT_SIZES } from '@mcua/core';

// ─── Styles ───────────────────────────────────────────────────────────────

const S = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: 'var(--bg-surface)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    color: 'var(--text-secondary)',
  },
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
  preview: {
    width: '100%',
    aspectRatio: '16/9',
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  previewPlaceholder: {
    color: 'var(--text-muted)',
    fontSize: '11px',
    fontStyle: 'italic' as const,
  },
  candidateGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
    gap: '6px',
  },
  candidateThumb: (isSelected: boolean) => ({
    aspectRatio: '16/9',
    background: 'var(--bg-void)',
    border: `2px solid ${isSelected ? 'var(--brand)' : 'var(--border-subtle)'}`,
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    transition: 'border-color 150ms',
    position: 'relative' as const,
  }),
  candidateScore: {
    fontFamily: 'var(--font-mono)',
    fontSize: '8px',
    color: 'var(--brand-bright)',
    position: 'absolute' as const,
    top: 2,
    right: 4,
  },
  candidateTime: {
    fontFamily: 'var(--font-mono)',
    fontSize: '8.5px',
    color: 'var(--text-muted)',
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
    minWidth: 60,
  },
  input: {
    flex: 1,
    padding: '4px 8px',
    fontSize: '11px',
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  slider: {
    flex: 1,
    height: 3,
    cursor: 'pointer',
  },
  presetBtn: (isActive: boolean) => ({
    padding: '4px 8px',
    fontSize: '10px',
    fontWeight: 600,
    background: isActive ? 'var(--brand-dim)' : 'var(--bg-elevated)',
    color: isActive ? 'var(--brand-bright)' : 'var(--text-muted)',
    border: `1px solid ${isActive ? 'var(--brand)' : 'var(--border-subtle)'}`,
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all 150ms',
    whiteSpace: 'nowrap' as const,
  }),
  presetRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
  },
  overlayItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 8px',
    background: 'var(--bg-raised)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)',
  },
  overlayText: {
    flex: 1,
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  smallBtn: {
    padding: '3px 8px',
    fontSize: '9px',
    fontWeight: 600,
    background: 'var(--bg-elevated)',
    color: 'var(--text-muted)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all 150ms',
  },
  actionBtn: {
    padding: '6px 12px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    background: 'var(--brand)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'opacity 150ms',
    width: '100%',
  },
  footer: {
    padding: '8px 12px',
    borderTop: '1px solid var(--border-default)',
    display: 'flex',
    gap: '8px',
    flexShrink: 0,
  },
  colorSwatch: (color: string, isActive: boolean) => ({
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: color,
    border: `2px solid ${isActive ? 'var(--brand)' : 'var(--border-subtle)'}`,
    cursor: 'pointer',
    transition: 'border-color 150ms',
  }),
};

// ─── Utility ──────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Sub-Components ───────────────────────────────────────────────────────

function CandidateGrid({ onSelect }: { onSelect: (time: number) => void }) {
  const candidates = useCreatorStore((s) => s.thumbnailCandidates);
  const activeThumbnailId = useCreatorStore((s) => s.activeThumbnailId);
  const designs = useCreatorStore((s) => s.thumbnailDesigns);
  const activeDesign = designs.find((d) => d.id === activeThumbnailId);

  if (candidates.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontStyle: 'italic', textAlign: 'center', padding: '12px' }}>
        Click "Suggest Frames" to find the best thumbnail candidates
      </div>
    );
  }

  return (
    <div style={S.candidateGrid}>
      {candidates.slice(0, 8).map((candidate) => (
        <div
          key={candidate.frameTime}
          style={S.candidateThumb(activeDesign?.frameTime === candidate.frameTime)}
          onClick={() => onSelect(candidate.frameTime)}
          title={candidate.reason}
        >
          <span style={S.candidateScore}>{Math.round(candidate.score * 100)}%</span>
          <span style={S.candidateTime}>{formatTime(candidate.frameTime)}</span>
          <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
            {candidate.dominantColors.map((c, i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TextOverlayList() {
  const { activeThumbnailId, thumbnailDesigns, updateThumbnailDesign } = useCreatorStore();
  const design = thumbnailDesigns.find((d) => d.id === activeThumbnailId);

  if (!design || design.textOverlays.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontStyle: 'italic', padding: '4px 0' }}>
        No text overlays yet
      </div>
    );
  }

  const removeOverlay = (overlayId: string) => {
    const updated = design.textOverlays.filter((o) => o.id !== overlayId);
    updateThumbnailDesign(design.id, { textOverlays: updated });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {design.textOverlays.map((overlay) => (
        <div key={overlay.id} style={S.overlayItem}>
          <div style={{ width: 12, height: 12, borderRadius: 2, background: overlay.color, flexShrink: 0 }} />
          <span style={S.overlayText}>{overlay.text}</span>
          <button style={S.smallBtn} onClick={() => removeOverlay(overlay.id)}>x</button>
        </div>
      ))}
    </div>
  );
}

function ColorBoostSection() {
  const { activeThumbnailId, thumbnailDesigns, updateThumbnailDesign } = useCreatorStore();
  const design = thumbnailDesigns.find((d) => d.id === activeThumbnailId);

  return (
    <div style={S.presetRow}>
      <button
        style={S.presetBtn(!design?.colorBoost)}
        onClick={() => design && updateThumbnailDesign(design.id, { colorBoost: null })}
      >
        None
      </button>
      {COLOR_BOOST_PRESETS.map((preset) => (
        <button
          key={preset.id}
          style={S.presetBtn(design?.colorBoost?.id === preset.id)}
          onClick={() => design && updateThumbnailDesign(design.id, { colorBoost: preset })}
        >
          {preset.name}
        </button>
      ))}
    </div>
  );
}

function ExportSizeSelector() {
  const { activeThumbnailId, thumbnailDesigns, updateThumbnailDesign } = useCreatorStore();
  const design = thumbnailDesigns.find((d) => d.id === activeThumbnailId);

  return (
    <div style={S.presetRow}>
      {THUMBNAIL_EXPORT_SIZES.map((size) => (
        <button
          key={size.label}
          style={S.presetBtn(
            design?.exportSize.width === size.width && design?.exportSize.height === size.height,
          )}
          onClick={() => design && updateThumbnailDesign(design.id, { exportSize: size })}
        >
          {size.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export function ThumbnailDesigner() {
  const {
    thumbnailDesigns,
    activeThumbnailId,
    thumbnailCandidates,
    addThumbnailDesign,
    updateThumbnailDesign,
    setActiveThumbnailId,
    setThumbnailCandidates,
  } = useCreatorStore();

  const [newTextInput, setNewTextInput] = useState('');
  const activeDesign = thumbnailDesigns.find((d) => d.id === activeThumbnailId);

  const handleSuggestFrames = useCallback(() => {
    // Generate AI-suggested candidates (simulated)
    const candidates: ThumbnailCandidate[] = Array.from({ length: 8 }, (_, i) => {
      const time = (i + 1) * 4.5;
      const hasFaces = Math.random() > 0.3;
      return {
        frameTime: time,
        score: 0.5 + Math.random() * 0.45,
        reason: hasFaces ? 'Strong composition with faces' : 'Vivid colors, good contrast',
        hasFaces,
        dominantColors: [
          `hsl(${Math.random() * 360}, 70%, 50%)`,
          `hsl(${Math.random() * 360}, 60%, 40%)`,
          `hsl(${Math.random() * 360}, 50%, 30%)`,
        ],
      };
    });
    candidates.sort((a, b) => b.score - a.score);
    setThumbnailCandidates(candidates);
  }, [setThumbnailCandidates]);

  const handleSelectFrame = useCallback((frameTime: number) => {
    if (!activeDesign) {
      // Create a new design
      const now = new Date().toISOString();
      const design: ThumbnailDesign = {
        id: `thumb-${Date.now()}`,
        frameTime,
        textOverlays: [],
        background: { type: 'frame', frameTime },
        colorBoost: null,
        exportSize: THUMBNAIL_EXPORT_SIZES[0],
        createdAt: now,
        updatedAt: now,
      };
      addThumbnailDesign(design);
      setActiveThumbnailId(design.id);
    } else {
      updateThumbnailDesign(activeDesign.id, {
        frameTime,
        background: { type: 'frame', frameTime },
      });
    }
  }, [activeDesign, addThumbnailDesign, setActiveThumbnailId, updateThumbnailDesign]);

  const handleAddText = useCallback(() => {
    if (!activeDesign || !newTextInput.trim()) return;

    const overlay: TextOverlay = {
      id: `text-${Date.now()}`,
      text: newTextInput.trim(),
      position: { x: 0.5, y: 0.5 },
      fontSize: 48,
      fontFamily: 'Inter',
      fontWeight: 700,
      color: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 2,
      rotation: 0,
      opacity: 1,
    };

    updateThumbnailDesign(activeDesign.id, {
      textOverlays: [...activeDesign.textOverlays, overlay],
    });
    setNewTextInput('');
  }, [activeDesign, newTextInput, updateThumbnailDesign]);

  const handleNewDesign = useCallback(() => {
    const now = new Date().toISOString();
    const design: ThumbnailDesign = {
      id: `thumb-${Date.now()}`,
      frameTime: 0,
      textOverlays: [],
      background: { type: 'frame', frameTime: 0 },
      colorBoost: null,
      exportSize: THUMBNAIL_EXPORT_SIZES[0],
      createdAt: now,
      updatedAt: now,
    };
    addThumbnailDesign(design);
    setActiveThumbnailId(design.id);
  }, [addThumbnailDesign, setActiveThumbnailId]);

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.title}>Thumbnail Designer</span>
        <button style={S.smallBtn} onClick={handleNewDesign}>+ New</button>
      </div>

      {/* Body */}
      <div style={S.body}>
        {/* Preview */}
        <div style={S.preview}>
          {activeDesign ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: 4 }}>
                Frame at {formatTime(activeDesign.frameTime)}
              </div>
              {activeDesign.textOverlays.map((overlay) => (
                <div
                  key={overlay.id}
                  style={{
                    fontSize: Math.min(overlay.fontSize * 0.4, 24),
                    fontWeight: overlay.fontWeight,
                    color: overlay.color,
                    textShadow: overlay.strokeColor ? `0 0 4px ${overlay.strokeColor}` : undefined,
                  }}
                >
                  {overlay.text}
                </div>
              ))}
              {activeDesign.colorBoost && (
                <div style={{
                  position: 'absolute',
                  bottom: 4,
                  left: 8,
                  fontSize: '8px',
                  color: 'var(--brand-bright)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {activeDesign.colorBoost.name}
                </div>
              )}
            </div>
          ) : (
            <span style={S.previewPlaceholder}>Select a frame to begin</span>
          )}
        </div>

        {/* Frame Suggestions */}
        <div style={S.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={S.sectionLabel}>AI Frame Selection</span>
            <button style={S.smallBtn} onClick={handleSuggestFrames}>Suggest Frames</button>
          </div>
          <CandidateGrid onSelect={handleSelectFrame} />
        </div>

        {/* Text Overlays */}
        {activeDesign && (
          <div style={S.section}>
            <span style={S.sectionLabel}>Text Overlays</span>
            <TextOverlayList />
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                style={S.input}
                placeholder="Add text overlay..."
                value={newTextInput}
                onChange={(e) => setNewTextInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddText()}
              />
              <button style={S.smallBtn} onClick={handleAddText}>Add</button>
            </div>
          </div>
        )}

        {/* Color Boost */}
        {activeDesign && (
          <div style={S.section}>
            <span style={S.sectionLabel}>Color Boost</span>
            <ColorBoostSection />
          </div>
        )}

        {/* Export Size */}
        {activeDesign && (
          <div style={S.section}>
            <span style={S.sectionLabel}>Export Size</span>
            <ExportSizeSelector />
          </div>
        )}

        {/* Design Variants */}
        {thumbnailDesigns.length > 1 && (
          <div style={S.section}>
            <span style={S.sectionLabel}>Designs ({thumbnailDesigns.length})</span>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {thumbnailDesigns.map((design) => (
                <button
                  key={design.id}
                  style={S.presetBtn(design.id === activeThumbnailId)}
                  onClick={() => setActiveThumbnailId(design.id)}
                >
                  {formatTime(design.frameTime)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {activeDesign && (
        <div style={S.footer}>
          <button style={S.actionBtn}>
            Export {activeDesign.exportSize.width}x{activeDesign.exportSize.height}
          </button>
        </div>
      )}
    </div>
  );
}
