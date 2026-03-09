import React from 'react';
import { useUserSettingsStore } from '../../../store/userSettings.store';
import { settingStyles as ss } from '../settingStyles';

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Mumbai', 'Australia/Sydney',
  'Pacific/Auckland', 'UTC',
];

const LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'es', label: 'Spanish' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese' },
];

const WORKSPACES = [
  { value: 'filmtv', label: 'Film / TV' },
  { value: 'news', label: 'Broadcast News' },
  { value: 'sports', label: 'Sports' },
  { value: 'creator', label: 'Creator' },
  { value: 'marketing', label: 'Brand & Marketing' },
];

export function GeneralSettings() {
  const { settings, updateSetting, resetSection } = useUserSettingsStore();

  return (
    <div>
      <div style={ss.sectionHeader}>
        <h3 style={ss.sectionTitle}>General</h3>
        <button style={ss.resetBtn} onClick={() => resetSection('general')}>Reset</button>
      </div>

      <div style={ss.field}>
        <label style={ss.label}>Display Name</label>
        <input
          type="text"
          value={settings.displayName}
          onChange={(e) => updateSetting('displayName', e.target.value)}
          placeholder="Your name"
          style={ss.input}
        />
      </div>

      <div style={ss.field}>
        <label style={ss.label}>Timezone</label>
        <select
          value={settings.timezone}
          onChange={(e) => updateSetting('timezone', e.target.value)}
          style={ss.select}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      <div style={ss.field}>
        <label style={ss.label}>Language</label>
        <select
          value={settings.locale}
          onChange={(e) => updateSetting('locale', e.target.value)}
          style={ss.select}
        >
          {LOCALES.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>

      <div style={ss.field}>
        <label style={ss.label}>Default Workspace</label>
        <div style={ss.radioGroup}>
          {WORKSPACES.map((w) => (
            <label key={w.value} style={ss.radioLabel}>
              <input
                type="radio"
                name="defaultWorkspace"
                value={w.value}
                checked={settings.defaultWorkspace === w.value}
                onChange={() => updateSetting('defaultWorkspace', w.value)}
                style={ss.radio}
              />
              {w.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
