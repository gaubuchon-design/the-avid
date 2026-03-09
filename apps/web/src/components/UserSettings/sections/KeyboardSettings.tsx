import React from 'react';
import { useUserSettingsStore } from '../../../store/userSettings.store';
import { settingStyles as ss } from '../settingStyles';
import { KeyboardSettingsPanel } from '../../KeyboardSettings/KeyboardSettingsPanel';

export function KeyboardSettings() {
  return (
    <div>
      <div style={ss.sectionHeader}>
        <h3 style={ss.sectionTitle}>Keyboard Shortcuts</h3>
      </div>
      <KeyboardSettingsPanel />
    </div>
  );
}
