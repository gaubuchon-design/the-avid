import React from 'react';
import { useUserSettingsStore } from '../../../store/userSettings.store';
import { settingStyles as ss } from '../settingStyles';

const AI_LEVELS = [
  { value: 1 as const, label: 'Minimal', desc: 'AI stays silent unless invoked' },
  { value: 2 as const, label: 'Subtle', desc: 'Occasional suggestions' },
  { value: 3 as const, label: 'Balanced', desc: 'Regular suggestions during editing' },
  { value: 4 as const, label: 'Active', desc: 'Proactive editing assistance' },
  { value: 5 as const, label: 'Aggressive', desc: 'Continuous AI-powered suggestions' },
];

export function AISettings() {
  const { settings, updateSetting, resetSection } = useUserSettingsStore();

  return (
    <div>
      <div style={ss.sectionHeader}>
        <h3 style={ss.sectionTitle}>AI</h3>
        <button style={ss.resetBtn} onClick={() => resetSection('ai')}>Reset</button>
      </div>

      <div style={ss.field}>
        <label style={ss.label}>AI Assistance Level</label>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={settings.aiAggressionLevel}
          onChange={(e) => updateSetting('aiAggressionLevel', parseInt(e.target.value) as 1 | 2 | 3 | 4 | 5)}
          style={ss.range}
        />
        <div style={{ marginTop: 6 }}>
          {AI_LEVELS.map((l) => (
            settings.aiAggressionLevel === l.value && (
              <div key={l.value} style={{ fontSize: 12, color: 'var(--text-secondary, #a0a0b0)' }}>
                <strong style={{ color: 'var(--text-primary, #e8e8ed)' }}>{l.label}</strong> — {l.desc}
              </div>
            )
          ))}
        </div>
      </div>

      <div style={ss.field}>
        <label style={ss.toggleLabel}>
          <input
            type="checkbox"
            checked={settings.aiAutoSuggest}
            onChange={(e) => updateSetting('aiAutoSuggest', e.target.checked)}
            style={ss.checkbox}
          />
          Auto-suggest edits while working
        </label>
      </div>

      <div style={ss.field}>
        <label style={ss.label}>AI Model</label>
        <select
          value={settings.aiModel}
          onChange={(e) => updateSetting('aiModel', e.target.value)}
          style={ss.select}
        >
          <option value="default">Default (Auto)</option>
          <option value="flash">Flash (Fast)</option>
          <option value="pro">Pro (Quality)</option>
        </select>
      </div>
    </div>
  );
}
