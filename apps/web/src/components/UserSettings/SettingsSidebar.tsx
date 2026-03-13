import React from 'react';

export type SettingsSection = 'general' | 'appearance' | 'timeline' | 'audio' | 'keyboard' | 'editorial' | 'ai' | 'account';

const SECTIONS: { id: SettingsSection; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6z' },
  { id: 'appearance', label: 'Appearance', icon: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z' },
  { id: 'timeline', label: 'Timeline', icon: 'M4 6h16M4 12h16M4 18h16' },
  { id: 'audio', label: 'Audio', icon: 'M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M11 5L6 9H2v6h4l5 4V5z' },
  { id: 'keyboard', label: 'Keyboard', icon: 'M3 5h18a2 2 0 012 2v10a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2zm3 4h2m2 0h2m2 0h2m-12 4h2m2 0h6m-12 4h14' },
  { id: 'editorial', label: 'Editorial', icon: 'M4 7h6M14 7h6M12 4v16M4 17h6M14 17h6' },
  { id: 'ai', label: 'AI', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
  { id: 'account', label: 'Account', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
];

interface SettingsSidebarProps {
  active: SettingsSection;
  onChange: (section: SettingsSection) => void;
}

export function SettingsSidebar({ active, onChange }: SettingsSidebarProps) {
  return (
    <nav style={styles['sidebar']}>
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          style={{
            ...styles['item'],
            ...(active === s.id ? styles['itemActive'] : {}),
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={s.icon} />
          </svg>
          {s.label}
        </button>
      ))}
    </nav>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 180,
    flexShrink: 0,
    borderRight: '1px solid var(--border-subtle, #1e1e28)',
    padding: '12px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    border: 'none',
    borderRadius: 'var(--radius-md, 6px)',
    background: 'transparent',
    color: 'var(--text-secondary, #a0a0b0)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left' as const,
    transition: 'all 100ms',
  },
  itemActive: {
    background: 'rgba(109, 76, 250, 0.12)',
    color: 'var(--brand-bright, #9b7dff)',
  },
};
