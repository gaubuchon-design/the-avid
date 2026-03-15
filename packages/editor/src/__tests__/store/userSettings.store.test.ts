import { describe, expect, it } from 'vitest';
import {
  DEFAULT_USER_SETTINGS,
  migrateUserSettingsSnapshot,
} from '../../store/userSettings.store';

describe('userSettings.store', () => {
  it('defaults to the real Avid Media Composer keyboard preset id', () => {
    expect(DEFAULT_USER_SETTINGS.keyboardLayoutId).toBe('avid-media-composer');
    expect(DEFAULT_USER_SETTINGS.transcriptionProvider).toBe('local-faster-whisper');
    expect(DEFAULT_USER_SETTINGS.enableTranscriptionDiarization).toBe(true);
  });

  it('migrates legacy media-composer keyboard ids and backfills editorial defaults', () => {
    const migrated = migrateUserSettingsSnapshot({
      settings: {
        keyboardLayoutId: 'media-composer',
        displayName: 'Editor',
      },
      _userId: 'user-1',
      lastSyncedAt: 123,
    });

    expect(migrated.settings?.keyboardLayoutId).toBe('avid-media-composer');
    expect(migrated.settings?.preferAvidEditorialIcons).toBe(true);
    expect(migrated.settings?.trimViewPreference).toBe('preserve-last');
    expect(migrated.settings?.trimRulerExitsTrim).toBe(true);
    expect(migrated.settings?.buttonAssignmentMode).toBe('button-to-button');
    expect(migrated.settings?.transcriptionProvider).toBe('local-faster-whisper');
    expect(migrated.settings?.translationProvider).toBe('local-runtime');
    expect(migrated._userId).toBe('user-1');
    expect(migrated.lastSyncedAt).toBe(123);
  });
});
