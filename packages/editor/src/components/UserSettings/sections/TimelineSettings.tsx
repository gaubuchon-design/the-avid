import React from 'react';
import { useUserSettingsStore, type TimelineUnit, type ClipColorMode } from '../../../store/userSettings.store';
import { settingStyles as ss } from '../settingStyles';

const TIMELINE_UNITS: { value: TimelineUnit; label: string }[] = [
  { value: 'timecode', label: 'Timecode (HH:MM:SS:FF)' },
  { value: 'frames', label: 'Frames' },
  { value: 'seconds', label: 'Seconds' },
  { value: 'feet+frames', label: 'Feet + Frames' },
];

const CLIP_COLOR_MODES: { value: ClipColorMode; label: string }[] = [
  { value: 'track', label: 'By Track' },
  { value: 'label', label: 'By Label Color' },
  { value: 'codec', label: 'By Codec' },
];

export function TimelineSettings() {
  const { settings, updateSetting, resetSection } = useUserSettingsStore();

  return (
    <div>
      <div style={ss['sectionHeader']}>
        <h3 style={ss['sectionTitle']}>Timeline</h3>
        <button style={ss['resetBtn']} onClick={() => resetSection('timeline')}>Reset</button>
      </div>

      <div style={ss['field']}>
        <label style={ss['label']}>Timeline Units</label>
        <select
          value={settings.timelineUnit}
          onChange={(e) => updateSetting('timelineUnit', e.target.value as TimelineUnit)}
          style={ss['select']}
        >
          {TIMELINE_UNITS.map((u) => (
            <option key={u.value} value={u.value}>{u.label}</option>
          ))}
        </select>
      </div>

      <div style={ss['field']}>
        <label style={ss['label']}>Track Height ({settings.timelineTrackHeight}px)</label>
        <input
          type="range"
          min={24}
          max={80}
          step={2}
          value={settings.timelineTrackHeight}
          onChange={(e) => updateSetting('timelineTrackHeight', parseInt(e.target.value))}
          style={ss['range']}
        />
        <div style={ss['rangeLabels']}>
          <span>Compact</span>
          <span>Large</span>
        </div>
      </div>

      <div style={ss['field']}>
        <label style={ss['label']}>Scroll Behavior</label>
        <div style={ss['radioGroup']}>
          <label style={ss['radioLabel']}>
            <input type="radio" name="scrollBehavior" value="smooth" checked={settings.timelineScrollBehavior === 'smooth'} onChange={() => updateSetting('timelineScrollBehavior', 'smooth')} style={ss['radio']} />
            Smooth
          </label>
          <label style={ss['radioLabel']}>
            <input type="radio" name="scrollBehavior" value="snap" checked={settings.timelineScrollBehavior === 'snap'} onChange={() => updateSetting('timelineScrollBehavior', 'snap')} style={ss['radio']} />
            Snap to Edit
          </label>
        </div>
      </div>

      <div style={ss['field']}>
        <label style={ss['toggleLabel']}>
          <input
            type="checkbox"
            checked={settings.showThumbnailsOnTimeline}
            onChange={(e) => updateSetting('showThumbnailsOnTimeline', e.target.checked)}
            style={ss['checkbox']}
          />
          Show Thumbnails on Timeline
        </label>
      </div>

      <div style={ss['field']}>
        <label style={ss['label']}>Clip Color Mode</label>
        <select
          value={settings.clipColorMode}
          onChange={(e) => updateSetting('clipColorMode', e.target.value as ClipColorMode)}
          style={ss['select']}
        >
          {CLIP_COLOR_MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
