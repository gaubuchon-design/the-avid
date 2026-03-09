import React from 'react';

const KEY_LABELS: Record<string, string> = {
  ' ': 'Space',
  'ArrowUp': '\u2191',
  'ArrowDown': '\u2193',
  'ArrowLeft': '\u2190',
  'ArrowRight': '\u2192',
  'Backspace': '\u232b',
  'Delete': 'Del',
  'Escape': 'Esc',
  'Enter': '\u23ce',
  'Tab': '\u21e5',
  'meta': '\u2318',
  'ctrl': 'Ctrl',
  'shift': '\u21e7',
  'alt': 'Alt',
};

function formatKey(key: string): string {
  return KEY_LABELS[key] || (key.length === 1 ? key.toUpperCase() : key);
}

interface KeyCaptureBadgeProps {
  keyName: string;
  modifiers: string[];
}

export function KeyCaptureBadge({ keyName, modifiers }: KeyCaptureBadgeProps) {
  const parts = [...modifiers.map(formatKey), formatKey(keyName)];

  return (
    <span style={styles.wrapper}>
      {parts.map((p, i) => (
        <span key={i} style={styles.badge}>{p}</span>
      ))}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'inline-flex',
    gap: 3,
    alignItems: 'center',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 22,
    height: 22,
    padding: '0 6px',
    borderRadius: 'var(--radius-sm, 4px)',
    background: 'var(--bg-raised, #141420)',
    border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
    color: 'var(--text-primary, #e0e6ef)',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: 'var(--font-mono, monospace)',
    lineHeight: 1,
  },
};
