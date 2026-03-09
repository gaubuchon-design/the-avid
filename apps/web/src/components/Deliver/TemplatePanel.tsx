// =============================================================================
//  THE AVID — Template Browser Panel (Deliver Page Left Panel)
//  Category-filtered, searchable template list with selection and duplication.
// =============================================================================

import React, { useMemo } from 'react';
import { useDeliverStore } from '../../store/deliver.store';
import type { TemplateCategory, PublishingTemplate } from '../../types/deliver.types';

// ─── Category metadata ──────────────────────────────────────────────────────

const CATEGORIES: { key: TemplateCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'social', label: 'Social' },
  { key: 'broadcast', label: 'Broadcast' },
  { key: 'archive', label: 'Archive' },
  { key: 'streaming', label: 'Streaming' },
  { key: 'interchange', label: 'Interchange' },
  { key: 'custom', label: 'Custom' },
];

const PLATFORM_ICONS: Record<string, string> = {
  youtube: '▶',
  instagram: '◎',
  tiktok: '♪',
  twitter: '𝕏',
  vimeo: '▷',
  linkedin: '◼',
  facebook: 'f',
  broadcast: '📡',
  archive: '🗄',
  streaming: '📺',
  interchange: '⇄',
  social: '📱',
};

// ─── Component ──────────────────────────────────────────────────────────────

export function TemplatePanel() {
  const templates = useDeliverStore((s) => s.templates);
  const selectedId = useDeliverStore((s) => s.selectedTemplateId);
  const searchQuery = useDeliverStore((s) => s.templateSearchQuery);
  const categoryFilter = useDeliverStore((s) => s.templateCategoryFilter);

  const selectTemplate = useDeliverStore((s) => s.selectTemplate);
  const setCategoryFilter = useDeliverStore((s) => s.setTemplateCategoryFilter);
  const setSearchQuery = useDeliverStore((s) => s.setTemplateSearchQuery);
  const duplicateTemplate = useDeliverStore((s) => s.duplicateTemplate);
  const deleteCustomTemplate = useDeliverStore((s) => s.deleteCustomTemplate);
  const setShowTemplateEditor = useDeliverStore((s) => s.setShowTemplateEditor);

  // Filtered templates
  const filtered = useMemo(() => {
    let list = templates;
    if (categoryFilter !== 'all') {
      list = list.filter((t) => t.category === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.platform?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [templates, categoryFilter, searchQuery]);

  // Group by category for display
  const grouped = useMemo(() => {
    if (categoryFilter !== 'all') return { [categoryFilter]: filtered };
    const groups: Record<string, PublishingTemplate[]> = {};
    for (const tpl of filtered) {
      if (!groups[tpl.category]) groups[tpl.category] = [];
      groups[tpl.category].push(tpl);
    }
    return groups;
  }, [filtered, categoryFilter]);

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <span>Publishing Templates</span>
        <button
          onClick={() => setShowTemplateEditor(true)}
          style={newBtnStyle}
          title="Create custom template"
        >
          +
        </button>
      </div>

      {/* Search */}
      <div style={searchWrapStyle}>
        <input
          type="text"
          placeholder="Search templates…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={searchInputStyle}
        />
      </div>

      {/* Category tabs */}
      <div style={categoryBarStyle}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategoryFilter(cat.key)}
            style={{
              ...catBtnStyle,
              background: categoryFilter === cat.key ? 'var(--brand-dim)' : 'transparent',
              color: categoryFilter === cat.key ? 'var(--text-accent)' : 'var(--text-muted)',
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Template list */}
      <div style={listStyle}>
        {Object.entries(grouped).map(([category, tpls]) => (
          <div key={category}>
            {categoryFilter === 'all' && (
              <div style={groupHeaderStyle}>
                {PLATFORM_ICONS[category] ?? '●'} {category.charAt(0).toUpperCase() + category.slice(1)}
                <span style={countBadgeStyle}>{tpls.length}</span>
              </div>
            )}
            {tpls.map((tpl) => (
              <TemplateRow
                key={tpl.id}
                template={tpl}
                isSelected={selectedId === tpl.id}
                onSelect={() => selectTemplate(tpl.id)}
                onDuplicate={() => duplicateTemplate(tpl.id)}
                onDelete={tpl.isBuiltIn ? undefined : () => deleteCustomTemplate(tpl.id)}
              />
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={emptyStyle}>No templates match your search.</div>
        )}
      </div>
    </div>
  );
}

// ─── Template Row ───────────────────────────────────────────────────────────

function TemplateRow({
  template: tpl,
  isSelected,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  template: PublishingTemplate;
  isSelected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete?: () => void;
}) {
  const icon = PLATFORM_ICONS[tpl.platform ?? tpl.icon ?? tpl.category] ?? '●';

  return (
    <div
      onClick={onSelect}
      style={{
        ...rowStyle,
        background: isSelected ? 'var(--bg-active)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--brand)' : '2px solid transparent',
      }}
    >
      <div style={rowTopStyle}>
        <span style={iconStyle}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={nameStyle}>{tpl.name}</div>
          <div style={descStyle}>{tpl.description}</div>
        </div>
      </div>
      <div style={rowMetaStyle}>
        <span style={badgeStyle}>{tpl.steps.length} step{tpl.steps.length !== 1 ? 's' : ''}</span>
        {tpl.aspectRatio && <span style={badgeStyle}>{tpl.aspectRatio}</span>}
        {!tpl.isBuiltIn && <span style={{ ...badgeStyle, background: 'var(--warning-dim)' }}>Custom</span>}
        <div style={{ flex: 1 }} />
        <button onClick={(e) => { e.stopPropagation(); onDuplicate(); }} style={actionBtnStyle} title="Duplicate">⧉</button>
        {onDelete && (
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ ...actionBtnStyle, color: 'var(--error)' }} title="Delete">✕</button>
        )}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  width: 280,
  flexShrink: 0,
  borderRight: '1px solid var(--border-default)',
  background: 'var(--bg-surface)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
  borderBottom: '1px solid var(--border-default)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const newBtnStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-default)',
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: '18px',
  textAlign: 'center',
  padding: 0,
};

const searchWrapStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--border-default)',
};

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 8px',
  fontSize: 11,
  background: 'var(--bg-overlay)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  outline: 'none',
};

const categoryBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 2,
  padding: '4px 6px',
  borderBottom: '1px solid var(--border-default)',
  flexWrap: 'wrap',
};

const catBtnStyle: React.CSSProperties = {
  padding: '2px 6px',
  fontSize: 9,
  fontWeight: 600,
  textTransform: 'uppercase',
  borderRadius: 3,
  border: 'none',
  cursor: 'pointer',
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
};

const groupHeaderStyle: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 9,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-muted)',
  background: 'var(--bg-raised)',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const countBadgeStyle: React.CSSProperties = {
  fontSize: 8,
  padding: '1px 4px',
  borderRadius: 3,
  background: 'var(--bg-overlay)',
  color: 'var(--text-tertiary)',
};

const rowStyle: React.CSSProperties = {
  padding: '6px 10px',
  cursor: 'pointer',
  borderBottom: '1px solid var(--border-subtle)',
  transition: 'background 0.1s',
};

const rowTopStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'flex-start',
};

const iconStyle: React.CSSProperties = {
  fontSize: 14,
  lineHeight: '18px',
  flexShrink: 0,
  width: 18,
  textAlign: 'center',
};

const nameStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const descStyle: React.CSSProperties = {
  fontSize: 9,
  color: 'var(--text-tertiary)',
  marginTop: 1,
  lineHeight: '12px',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

const rowMetaStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  alignItems: 'center',
  marginTop: 4,
};

const badgeStyle: React.CSSProperties = {
  fontSize: 8,
  padding: '1px 5px',
  borderRadius: 3,
  background: 'var(--bg-overlay)',
  color: 'var(--text-tertiary)',
  fontWeight: 600,
};

const actionBtnStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  border: 'none',
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 10,
  padding: 0,
  lineHeight: '16px',
  textAlign: 'center',
  borderRadius: 2,
};

const emptyStyle: React.CSSProperties = {
  padding: 20,
  textAlign: 'center',
  color: 'var(--text-muted)',
  fontSize: 11,
};
