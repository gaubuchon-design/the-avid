import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SettingsSidebar, type SettingsSection } from '../components/UserSettings/SettingsSidebar';
import { GeneralSettings } from '../components/UserSettings/sections/GeneralSettings';
import { AppearanceSettings } from '../components/UserSettings/sections/AppearanceSettings';
import { TimelineSettings } from '../components/UserSettings/sections/TimelineSettings';
import { AudioSettings } from '../components/UserSettings/sections/AudioSettings';
import { KeyboardSettings } from '../components/UserSettings/sections/KeyboardSettings';
import { AISettings } from '../components/UserSettings/sections/AISettings';
import { AccountSettings } from '../components/UserSettings/sections/AccountSettings';

const SECTIONS: Record<SettingsSection, React.ComponentType> = {
  general: GeneralSettings,
  appearance: AppearanceSettings,
  timeline: TimelineSettings,
  audio: AudioSettings,
  keyboard: KeyboardSettings,
  ai: AISettings,
  account: AccountSettings,
};

export function SettingsPage() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');

  const SectionComponent = SECTIONS[activeSection];

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <button
          className="settings-back-btn"
          onClick={() => navigate('/')}
          aria-label="Back to Dashboard"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          Dashboard
        </button>
        <h1 className="settings-page-title">Settings</h1>
      </div>
      <div className="settings-page-body">
        <SettingsSidebar active={activeSection} onChange={setActiveSection} />
        <div className="settings-page-content">
          <SectionComponent />
        </div>
      </div>
    </div>
  );
}
