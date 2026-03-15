import React, { useState } from 'react';
import { SettingsSidebar, type SettingsSection } from './SettingsSidebar';
import { GeneralSettings } from './sections/GeneralSettings';
import { AppearanceSettings } from './sections/AppearanceSettings';
import { TimelineSettings } from './sections/TimelineSettings';
import { AudioSettings } from './sections/AudioSettings';
import { KeyboardSettings } from './sections/KeyboardSettings';
import { EditorialSettings } from './sections/EditorialSettings';
import { AISettings } from './sections/AISettings';
import { AccountSettings } from './sections/AccountSettings';

interface UserSettingsPanelProps {
  onClose: () => void;
}

const SECTIONS: Record<SettingsSection, React.ComponentType> = {
  general: GeneralSettings,
  appearance: AppearanceSettings,
  timeline: TimelineSettings,
  audio: AudioSettings,
  keyboard: KeyboardSettings,
  editorial: EditorialSettings,
  ai: AISettings,
  account: AccountSettings,
};

export function UserSettingsPanel({ onClose }: UserSettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');

  const SectionComponent = SECTIONS[activeSection];

  return (
    <div style={styles['overlay']} onClick={onClose}>
      <div style={styles['modal']} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles['header']}>
          <h2 style={styles['title']}>Settings</h2>
          <button style={styles['closeBtn']} onClick={onClose} aria-label="Close settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={styles['body']}>
          <SettingsSidebar active={activeSection} onChange={setActiveSection} />
          <div style={styles['content']}>
            <SectionComponent />
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    fontFamily: 'var(--font-ui, -apple-system, BlinkMacSystemFont, sans-serif)',
  },
  modal: {
    width: '90vw',
    maxWidth: 820,
    height: '80vh',
    maxHeight: 600,
    background: 'var(--bg-surface, #141419)',
    border: '1px solid var(--border-default, #2a2a35)',
    borderRadius: 'var(--radius-xl, 12px)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid var(--border-subtle, #1e1e28)',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text-primary, #e8e8ed)',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 'var(--radius-sm, 4px)',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted, #6a6a7a)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 100ms',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    padding: '20px 24px',
    overflowY: 'auto',
  },
};
