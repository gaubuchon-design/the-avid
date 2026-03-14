// =============================================================================
//  THE AVID -- Transitions Panel
//  Browsable transition effects library with categories, search, favorites,
//  default duration control, and drag-to-apply support for timeline clips.
// =============================================================================

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useEditorStore } from '../../store/editor.store';

// ── Types ────────────────────────────────────────────────────────────────────

type TransitionCategory = 'dissolve' | 'wipe' | 'slide' | 'push' | 'iris' | 'zoom';

interface TransitionDef {
  id: string;
  name: string;
  category: TransitionCategory;
  /** Unicode/text icon as thumbnail placeholder */
  icon: string;
  description: string;
}

// ── Transition Library ───────────────────────────────────────────────────────

const TRANSITIONS: TransitionDef[] = [
  // Dissolve
  { id: 'cross-dissolve', name: 'Cross Dissolve', category: 'dissolve', icon: '\u25D0', description: 'Standard cross-fade between two clips' },
  { id: 'dip-to-black', name: 'Dip to Black', category: 'dissolve', icon: '\u25CF', description: 'Fade through black between clips' },
  { id: 'dip-to-white', name: 'Dip to White', category: 'dissolve', icon: '\u25CB', description: 'Fade through white between clips' },
  { id: 'additive-dissolve', name: 'Additive Dissolve', category: 'dissolve', icon: '\u25D1', description: 'Bright additive cross-fade' },
  { id: 'film-dissolve', name: 'Film Dissolve', category: 'dissolve', icon: '\u25D3', description: 'Perceptually linear film-style dissolve' },

  // Wipe
  { id: 'wipe-left', name: 'Wipe Left', category: 'wipe', icon: '\u25E7', description: 'Hard-edge wipe from right to left' },
  { id: 'wipe-right', name: 'Wipe Right', category: 'wipe', icon: '\u25E8', description: 'Hard-edge wipe from left to right' },
  { id: 'wipe-up', name: 'Wipe Up', category: 'wipe', icon: '\u25E9', description: 'Hard-edge wipe from bottom to top' },
  { id: 'wipe-down', name: 'Wipe Down', category: 'wipe', icon: '\u25EA', description: 'Hard-edge wipe from top to bottom' },
  { id: 'clock-wipe', name: 'Clock Wipe', category: 'wipe', icon: '\u25D4', description: 'Clockwise rotational wipe' },
  { id: 'barn-door', name: 'Barn Door', category: 'wipe', icon: '\u2016', description: 'Split wipe opening from center' },

  // Slide
  { id: 'slide-left', name: 'Slide Left', category: 'slide', icon: '\u25C0', description: 'Incoming clip slides in from right' },
  { id: 'slide-right', name: 'Slide Right', category: 'slide', icon: '\u25B6', description: 'Incoming clip slides in from left' },
  { id: 'slide-up', name: 'Slide Up', category: 'slide', icon: '\u25B2', description: 'Incoming clip slides in from bottom' },
  { id: 'slide-down', name: 'Slide Down', category: 'slide', icon: '\u25BC', description: 'Incoming clip slides in from top' },
  { id: 'split-slide', name: 'Split Slide', category: 'slide', icon: '\u2194', description: 'Outgoing clip splits and slides away' },

  // Push
  { id: 'push-left', name: 'Push Left', category: 'push', icon: '\u21E6', description: 'Incoming clip pushes outgoing left' },
  { id: 'push-right', name: 'Push Right', category: 'push', icon: '\u21E8', description: 'Incoming clip pushes outgoing right' },
  { id: 'push-up', name: 'Push Up', category: 'push', icon: '\u21E7', description: 'Incoming clip pushes outgoing up' },
  { id: 'push-down', name: 'Push Down', category: 'push', icon: '\u21E9', description: 'Incoming clip pushes outgoing down' },

  // Iris
  { id: 'iris-circle', name: 'Iris Circle', category: 'iris', icon: '\u25CE', description: 'Circular iris opening from center' },
  { id: 'iris-diamond', name: 'Iris Diamond', category: 'iris', icon: '\u25C7', description: 'Diamond-shaped iris opening' },
  { id: 'iris-square', name: 'Iris Square', category: 'iris', icon: '\u25A1', description: 'Square iris opening from center' },
  { id: 'iris-star', name: 'Iris Star', category: 'iris', icon: '\u2606', description: 'Star-shaped iris opening' },
  { id: 'iris-cross', name: 'Iris Cross', category: 'iris', icon: '\u271A', description: 'Cross-shaped iris opening' },

  // Zoom
  { id: 'zoom-in', name: 'Zoom In', category: 'zoom', icon: '\u2295', description: 'Zoom into incoming clip from center' },
  { id: 'zoom-out', name: 'Zoom Out', category: 'zoom', icon: '\u2296', description: 'Zoom out revealing incoming clip' },
  { id: 'zoom-rotate', name: 'Zoom Rotate', category: 'zoom', icon: '\u21BB', description: 'Zoom with rotation transition' },
  { id: 'zoom-blur', name: 'Zoom Blur', category: 'zoom', icon: '\u2299', description: 'Zoom with motion blur effect' },
];

const CATEGORY_LABELS: Record<TransitionCategory, string> = {
  dissolve: 'Dissolve',
  wipe: 'Wipe',
  slide: 'Slide',
  push: 'Push',
  iris: 'Iris',
  zoom: 'Zoom',
};

const ALL_CATEGORIES: TransitionCategory[] = ['dissolve', 'wipe', 'slide', 'push', 'iris', 'zoom'];

// ── Styles ───────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  backgroundColor: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 13,
  overflow: 'hidden',
  borderLeft: '1px solid var(--border-default)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 12px',
  borderBottom: '1px solid var(--border-default)',
  backgroundColor: 'var(--bg-raised)',
  flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: '0.01em',
};

const searchBarStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--border-default)',
  backgroundColor: 'var(--bg-raised)',
  flexShrink: 0,
};

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '5px 8px',
  borderRadius: 4,
  border: '1px solid var(--border-default)',
  backgroundColor: 'var(--bg-void)',
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
};

const categoryBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 2,
  padding: '6px 12px',
  borderBottom: '1px solid var(--border-default)',
  backgroundColor: 'var(--bg-void)',
  overflowX: 'auto',
  flexShrink: 0,
};

const categoryBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '4px 8px',
  borderRadius: 4,
  border: 'none',
  backgroundColor: active ? 'var(--brand)' : 'transparent',
  color: active ? '#fff' : 'var(--text-secondary)',
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'all 0.12s ease',
});

const durationBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 12px',
  borderBottom: '1px solid var(--border-default)',
  backgroundColor: 'var(--bg-raised)',
  fontSize: 11,
  color: 'var(--text-secondary)',
  flexShrink: 0,
};

const durationInputStyle: React.CSSProperties = {
  width: 50,
  padding: '3px 6px',
  borderRadius: 4,
  border: '1px solid var(--border-default)',
  backgroundColor: 'var(--bg-void)',
  color: 'var(--text-primary)',
  fontSize: 12,
  fontFamily: 'monospace',
  textAlign: 'center',
  outline: 'none',
};

const gridContainerStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: 12,
};

const transitionGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
  gap: 8,
};

const transitionCardStyle = (isDragging: boolean): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  padding: '10px 6px',
  borderRadius: 6,
  border: '1px solid var(--border-default)',
  backgroundColor: isDragging ? 'var(--brand)' : 'var(--bg-raised)',
  color: isDragging ? '#fff' : 'var(--text-primary)',
  cursor: 'grab',
  transition: 'all 0.12s ease',
  userSelect: 'none',
  position: 'relative',
});

const transitionIconStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 22,
  borderRadius: 6,
  backgroundColor: 'var(--bg-void)',
  color: 'var(--text-secondary)',
};

const transitionNameStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  textAlign: 'center',
  lineHeight: 1.2,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  width: '100%',
};

const favBtnStyle = (isFav: boolean): React.CSSProperties => ({
  position: 'absolute',
  top: 3,
  right: 3,
  background: 'transparent',
  border: 'none',
  color: isFav ? 'var(--warning-text)' : 'var(--text-muted)',
  fontSize: 12,
  cursor: 'pointer',
  lineHeight: 1,
  padding: 0,
  opacity: isFav ? 1 : 0.4,
  transition: 'opacity 0.15s ease',
});

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  padding: '8px 0 4px',
};

const emptyStateStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: 32,
  color: 'var(--text-muted)',
  fontSize: 13,
  textAlign: 'center',
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  borderTop: '1px solid var(--border-default)',
  backgroundColor: 'var(--bg-raised)',
  fontSize: 11,
  color: 'var(--text-muted)',
  flexShrink: 0,
};

// ── Transition Card ──────────────────────────────────────────────────────────

function TransitionCard({
  def,
  isFavorite,
  defaultDuration,
  onToggleFav,
}: {
  def: TransitionDef;
  isFavorite: boolean;
  defaultDuration: number;
  onToggleFav: (id: string) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      setIsDragging(true);
      e.dataTransfer.setData(
        'application/x-avid-transition',
        JSON.stringify({ transitionId: def.id, duration: defaultDuration }),
      );
      e.dataTransfer.effectAllowed = 'copy';
    },
    [def.id, defaultDuration],
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      style={transitionCardStyle(isDragging)}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      title={`${def.name}\n${def.description}\nDrag to apply between clips`}
    >
      <button
        style={favBtnStyle(isFavorite)}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFav(def.id);
        }}
        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        {isFavorite ? '\u2605' : '\u2606'}
      </button>
      <div style={transitionIconStyle}>{def.icon}</div>
      <span style={transitionNameStyle}>{def.name}</span>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function TransitionsPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<TransitionCategory | 'all' | 'favorites'>('all');
  const [defaultDuration, setDefaultDuration] = useState(24); // frames
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(['cross-dissolve', 'dip-to-black']));

  const sequenceSettings = useEditorStore((s) => s.sequenceSettings);

  const handleToggleFav = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDurationChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val > 0 && val <= 999) {
      setDefaultDuration(val);
    }
  }, []);

  // Filter and search
  const visibleTransitions = useMemo(() => {
    let list = TRANSITIONS;

    // Category filter
    if (activeCategory === 'favorites') {
      list = list.filter((t) => favorites.has(t.id));
    } else if (activeCategory !== 'all') {
      list = list.filter((t) => t.category === activeCategory);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.category.includes(q),
      );
    }

    return list;
  }, [searchQuery, activeCategory, favorites]);

  // Group by category for "all" view
  const grouped = useMemo(() => {
    if (activeCategory !== 'all' && activeCategory !== 'favorites') return null;
    const groups: Record<string, TransitionDef[]> = {};
    visibleTransitions.forEach((t) => {
      if (!groups[t.category]) groups[t.category] = [];
      groups[t.category]!.push(t);
    });
    return groups;
  }, [visibleTransitions, activeCategory]);

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={titleStyle}>Transitions</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {visibleTransitions.length} effect{visibleTransitions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Search */}
      <div style={searchBarStyle}>
        <input
          type="text"
          placeholder="Search transitions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={searchInputStyle}
        />
      </div>

      {/* Category tabs */}
      <div style={categoryBarStyle}>
        <button
          style={categoryBtnStyle(activeCategory === 'all')}
          onClick={() => setActiveCategory('all')}
        >
          All
        </button>
        <button
          style={categoryBtnStyle(activeCategory === 'favorites')}
          onClick={() => setActiveCategory('favorites')}
        >
          Favorites ({favorites.size})
        </button>
        {ALL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            style={categoryBtnStyle(activeCategory === cat)}
            onClick={() => setActiveCategory(cat)}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Default duration */}
      <div style={durationBarStyle}>
        <span>Default duration:</span>
        <input
          type="number"
          min={1}
          max={999}
          value={defaultDuration}
          onChange={handleDurationChange}
          style={durationInputStyle}
          aria-label="Default transition duration in frames"
        />
        <span>frames ({(defaultDuration / sequenceSettings.fps).toFixed(2)}s)</span>
      </div>

      {/* Transition grid */}
      <div style={gridContainerStyle}>
        {visibleTransitions.length === 0 ? (
          <div style={emptyStateStyle}>
            <span style={{ fontSize: 20 }}>T</span>
            <span>No transitions found</span>
            <span style={{ fontSize: 11 }}>
              {activeCategory === 'favorites'
                ? 'Star transitions to add them to favorites'
                : 'Try a different search or category'}
            </span>
          </div>
        ) : grouped ? (
          // Grouped view (all / favorites)
          Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <div style={sectionLabelStyle}>
                {CATEGORY_LABELS[category as TransitionCategory] ?? category}
              </div>
              <div style={transitionGridStyle}>
                {items.map((def) => (
                  <TransitionCard
                    key={def.id}
                    def={def}
                    isFavorite={favorites.has(def.id)}
                    defaultDuration={defaultDuration}
                    onToggleFav={handleToggleFav}
                  />
                ))}
              </div>
            </div>
          ))
        ) : (
          // Flat view (single category)
          <div style={transitionGridStyle}>
            {visibleTransitions.map((def) => (
              <TransitionCard
                key={def.id}
                def={def}
                isFavorite={favorites.has(def.id)}
                defaultDuration={defaultDuration}
                onToggleFav={handleToggleFav}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={footerStyle}>
        <span>Drag a transition onto a clip boundary to apply</span>
      </div>
    </div>
  );
}
