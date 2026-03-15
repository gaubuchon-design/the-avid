import React from 'react';
import { useUserSettingsStore, type WaveformStyle } from '../../../store/userSettings.store';
import { settingStyles as ss } from '../settingStyles';

const WAVEFORM_STYLES: { value: WaveformStyle; label: string }[] = [
  { value: 'filled', label: 'Filled' },
  { value: 'outline', label: 'Outline' },
  { value: 'bars', label: 'Bars' },
  { value: 'gradient', label: 'Gradient' },
];

const PEAK_POSITIONS: { value: 'left' | 'right' | 'bottom'; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'bottom', label: 'Bottom' },
];

export function AudioSettings() {
  const { settings, updateSetting, resetSection } = useUserSettingsStore();

  return (
    <div>
      <div style={ss['sectionHeader']}>
        <h3 style={ss['sectionTitle']}>Audio</h3>
        <button style={ss['resetBtn']} onClick={() => resetSection('audio')}>Reset</button>
      </div>

      <div style={ss['field']}>
        <label style={ss['label']}>Waveform Style</label>
        <select
          value={settings.waveformStyle}
          onChange={(e) => updateSetting('waveformStyle', e.target.value as WaveformStyle)}
          style={ss['select']}
        >
          {WAVEFORM_STYLES.map((w) => (
            <option key={w.value} value={w.value}>{w.label}</option>
          ))}
        </select>
      </div>

      <div style={ss['field']}>
        <label style={ss['label']}>Peak Meter Position</label>
        <div style={ss['radioGroup']}>
          {PEAK_POSITIONS.map((p) => (
            <label key={p.value} style={ss['radioLabel']}>
              <input
                type="radio"
                name="peakPos"
                value={p.value}
                checked={settings.audioPeakMeterPosition === p.value}
                onChange={() => updateSetting('audioPeakMeterPosition', p.value)}
                style={ss['radio']}
              />
              {p.label}
            </label>
          ))}
        </div>
      </div>

      <div style={ss['field']}>
        <label style={ss['toggleLabel']}>
          <input
            type="checkbox"
            checked={settings.showAudioDB}
            onChange={(e) => updateSetting('showAudioDB', e.target.checked)}
            style={ss['checkbox']}
          />
          Show dB Values
        </label>
      </div>

      <div style={ss['field']}>
        <label style={ss['label']}>Default Audio Fade ({settings.defaultAudioFade}ms)</label>
        <input
          type="range"
          min={0}
          max={500}
          step={10}
          value={settings.defaultAudioFade}
          onChange={(e) => updateSetting('defaultAudioFade', parseInt(e.target.value))}
          style={ss['range']}
        />
        <div style={ss['rangeLabels']}>
          <span>None</span>
          <span>500ms</span>
        </div>
      </div>
    </div>
  );
}
