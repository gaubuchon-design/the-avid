import React from 'react';
import {
  useUserSettingsStore,
  type ButtonAssignmentMode,
  type EditorialIconStyle,
  type TrimViewPreference,
} from '../../../store/userSettings.store';
import { settingStyles as ss } from '../settingStyles';
import { AvidEditorialGlyph } from '../../Icons/AvidEditorialIcons';

const TRIM_VIEW_OPTIONS: Array<{ value: TrimViewPreference; label: string; description: string }> = [
  { value: 'preserve-last', label: 'Preserve Last View', description: 'Reopen trim in the last view you used.' },
  { value: 'small', label: 'Small Trim', description: 'Always enter trim in the smaller dual-monitor layout.' },
  { value: 'big', label: 'Big Trim', description: 'Always enter trim in the expanded trim layout.' },
];

const ICON_STYLE_OPTIONS: Array<{ value: EditorialIconStyle; label: string }> = [
  { value: 'avid', label: 'Avid Editorial Glyphs' },
  { value: 'text', label: 'Text Labels' },
];

const BUTTON_ASSIGNMENT_OPTIONS: Array<{ value: ButtonAssignmentMode; label: string; description: string }> = [
  { value: 'button-to-button', label: 'Button-To-Button', description: 'Persist direct button reassignment slots for tool palettes and monitors.' },
  { value: 'menu-to-button', label: 'Menu-To-Button', description: 'Persist menu-driven command assignments for buttons and palette slots.' },
];

export function EditorialSettings() {
  const { settings, updateSetting, resetSection } = useUserSettingsStore();

  return (
    <div>
      <div style={ss['sectionHeader']}>
        <h3 style={ss['sectionTitle']}>Editorial</h3>
        <button style={ss['resetBtn']} onClick={() => resetSection('editorial')}>Reset</button>
      </div>

      <div style={ss['field']}>
        <label style={ss['label']}>Editorial Iconography</label>
        <div style={ss['radioGroup']}>
          {ICON_STYLE_OPTIONS.map((option) => (
            <label key={option.value} style={ss['radioLabel']}>
              <input
                type="radio"
                name="editorialIconStyle"
                value={option.value}
                checked={settings.editorialIconStyle === option.value}
                onChange={() => updateSetting('editorialIconStyle', option.value)}
                style={ss['radio']}
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>

      <div style={ss['field']}>
        <label style={ss['toggleLabel']}>
          <input
            type="checkbox"
            checked={settings.preferAvidEditorialIcons}
            onChange={(event) => updateSetting('preferAvidEditorialIcons', event.target.checked)}
            style={ss['checkbox']}
          />
          Prefer Avid editorial icons across trim, segment, and add-edit controls
        </label>
        <div style={previewCardStyle}>
          <span style={previewLabelStyle}>Preview</span>
          <div style={previewGlyphRowStyle}>
            <span style={previewGlyphStyle}><AvidEditorialGlyph name="add-edit" title="Add Edit" /> Add Edit</span>
            <span style={previewGlyphStyle}><AvidEditorialGlyph name="lift-overwrite" title="Lift/Overwrite Segment" /> Lift/Overwrite</span>
            <span style={previewGlyphStyle}><AvidEditorialGlyph name="extract-splice" title="Extract/Splice Segment" /> Extract/Splice</span>
            <span style={previewGlyphStyle}><AvidEditorialGlyph name="overwrite-trim" title="Overwrite Trim" /> Overwrite Trim</span>
            <span style={previewGlyphStyle}><AvidEditorialGlyph name="ripple-trim" title="Ripple Trim" /> Ripple Trim</span>
          </div>
        </div>
      </div>

      <div style={ss['field']}>
        <label style={ss['label']}>Trim Entry View</label>
        <div style={stackStyle}>
          {TRIM_VIEW_OPTIONS.map((option) => (
            <label key={option.value} style={cardOptionStyle}>
              <span style={cardOptionHeaderStyle}>
                <input
                  type="radio"
                  name="trimViewPreference"
                  value={option.value}
                  checked={settings.trimViewPreference === option.value}
                  onChange={() => updateSetting('trimViewPreference', option.value)}
                  style={ss['radio']}
                />
                <span>{option.label}</span>
              </span>
              <span style={cardOptionCopyStyle}>{option.description}</span>
            </label>
          ))}
        </div>
      </div>

      <div style={ss['field']}>
        <label style={ss['toggleLabel']}>
          <input
            type="checkbox"
            checked={settings.trimRulerExitsTrim}
            onChange={(event) => updateSetting('trimRulerExitsTrim', event.target.checked)}
            style={ss['checkbox']}
          />
          Scrubbing the timecode track exits trim mode
        </label>
      </div>

      <div style={ss['field']}>
        <label style={ss['toggleLabel']}>
          <input
            type="checkbox"
            checked={settings.showTrimCountersInMonitorHeaders}
            onChange={(event) => updateSetting('showTrimCountersInMonitorHeaders', event.target.checked)}
            style={ss['checkbox']}
          />
          Show A/B trim counters in source and record monitor headers
        </label>
      </div>

      <div style={ss['field']}>
        <label style={ss['label']}>Button Mapping Mode</label>
        <div style={stackStyle}>
          {BUTTON_ASSIGNMENT_OPTIONS.map((option) => (
            <label key={option.value} style={cardOptionStyle}>
              <span style={cardOptionHeaderStyle}>
                <input
                  type="radio"
                  name="buttonAssignmentMode"
                  value={option.value}
                  checked={settings.buttonAssignmentMode === option.value}
                  onChange={() => updateSetting('buttonAssignmentMode', option.value)}
                  style={ss['radio']}
                />
                <span>{option.label}</span>
              </span>
              <span style={cardOptionCopyStyle}>{option.description}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

const previewCardStyle: React.CSSProperties = {
  marginTop: 10,
  padding: 12,
  borderRadius: 'var(--radius-md, 6px)',
  border: '1px solid var(--border-default, #2a2a35)',
  background: 'rgba(255,255,255,0.02)',
};

const previewLabelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontSize: 11,
  color: 'var(--text-muted, #6a6a7a)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const previewGlyphRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};

const previewGlyphStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 8px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.03)',
  color: 'var(--text-primary, #e8e8ed)',
  fontSize: 12,
};

const stackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const cardOptionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: 10,
  borderRadius: 'var(--radius-md, 6px)',
  border: '1px solid var(--border-default, #2a2a35)',
  background: 'rgba(255,255,255,0.02)',
  color: 'var(--text-primary, #e8e8ed)',
  cursor: 'pointer',
};

const cardOptionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  fontWeight: 600,
};

const cardOptionCopyStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary, #a0a0b0)',
  lineHeight: 1.45,
};
