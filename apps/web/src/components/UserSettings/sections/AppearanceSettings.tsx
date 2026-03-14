import React from 'react';
import { useUserSettingsStore, type ThemeMode } from '../../../store/userSettings.store';
import { settingStyles as ss } from '../settingStyles';

const THEMES: { value: ThemeMode; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

const ACCENT_COLORS = [
  '#d7d7de', '#b9b9c2', '#9d9da7', '#81818d', '#676772', '#50505a',
];

export function AppearanceSettings() {
  const { settings, updateSetting, resetSection } = useUserSettingsStore();

  return (
    <div>
      <div style={ss['sectionHeader']}>
        <h3 style={ss['sectionTitle']}>Appearance</h3>
        <button style={ss['resetBtn']} onClick={() => resetSection('appearance')}>Reset</button>
      </div>

      <div style={ss['field']}>
        <label style={ss['label']}>Theme</label>
        <div style={ss['radioGroup']}>
          {THEMES.map((t) => (
            <label key={t.value} style={ss['radioLabel']}>
              <input
                type="radio"
                name="theme"
                value={t.value}
                checked={settings.theme === t.value}
                onChange={() => updateSetting('theme', t.value)}
                style={ss['radio']}
              />
              {t.label}
            </label>
          ))}
        </div>
      </div>

      <div style={ss['field']}>
        <label style={ss['label']}>Neutral Accent</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ACCENT_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => updateSetting('accentColor', c)}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: settings.accentColor === c ? '2px solid #fff' : '2px solid transparent',
                background: c,
                cursor: 'pointer',
                outline: settings.accentColor === c ? `2px solid ${c}` : 'none',
                outlineOffset: 2,
              }}
              title={c}
              aria-label={`Accent color ${c}`}
            />
          ))}
        </div>
      </div>

      <div style={ss['field']}>
        <label style={ss['label']}>UI Scale ({Math.round(settings.uiScale * 100)}%)</label>
        <input
          type="range"
          min={0.8}
          max={1.5}
          step={0.05}
          value={settings.uiScale}
          onChange={(e) => updateSetting('uiScale', parseFloat(e.target.value))}
          style={ss['range']}
        />
        <div style={ss['rangeLabels']}>
          <span>80%</span>
          <span>150%</span>
        </div>
      </div>
    </div>
  );
}
