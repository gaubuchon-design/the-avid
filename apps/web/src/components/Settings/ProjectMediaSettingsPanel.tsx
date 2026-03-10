import React, { useEffect, useState } from 'react';
import { mediaDatabaseEngine, DEFAULT_MEDIA_SETTINGS } from '../../engine/MediaDatabaseEngine';
import type { ProjectMediaSettings, MediaOrgMode } from '../../engine/MediaDatabaseEngine';

const ORG_OPTIONS: { value: MediaOrgMode; label: string; desc: string }[] = [
  {
    value: 'keep-in-place',
    label: 'Keep Media in Place',
    desc: 'Media files stay where they are. Only references are stored.',
  },
  {
    value: 'organize-index',
    label: 'Organize & Index',
    desc: 'Copy media into the project folder and create an indexed database.',
  },
  {
    value: 'custom-location',
    label: 'Custom Location',
    desc: 'Copy media to a specified folder and maintain an index.',
  },
];

const PROXY_OPTIONS: { value: string; label: string }[] = [
  { value: '1/4', label: '1/4 Resolution' },
  { value: '1/2', label: '1/2 Resolution' },
  { value: 'full', label: 'Full Resolution' },
];

export function ProjectMediaSettingsPanel() {
  const [settings, setSettings] = useState<ProjectMediaSettings>(DEFAULT_MEDIA_SETTINGS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    mediaDatabaseEngine.loadSettings().then(setSettings);
  }, []);

  const save = async (updated: ProjectMediaSettings) => {
    setSettings(updated);
    setSaving(true);
    await mediaDatabaseEngine.saveSettings(updated);
    setSaving(false);
  };

  return (
    <div className="media-settings-panel" role="form" aria-label="Media Management Settings" style={{
      padding: 16, background: 'var(--bg-surface)', borderRadius: 6,
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <h3 style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
        Media Management
      </h3>

      {/* Organization Mode */}
      <fieldset style={{ display: 'flex', flexDirection: 'column', gap: 8, border: 'none', margin: 0, padding: 0 }}>
        <legend style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>
          On Import
        </legend>
        {ORG_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
              padding: '8px 10px', borderRadius: 4,
              background: settings.organizationMode === opt.value ? 'var(--bg-active)' : 'transparent',
              border: settings.organizationMode === opt.value ? '1px solid var(--border-accent)' : '1px solid transparent',
            }}
            onClick={() => save({ ...settings, organizationMode: opt.value })}
          >
            <input
              type="radio"
              name="orgMode"
              checked={settings.organizationMode === opt.value}
              onChange={() => save({ ...settings, organizationMode: opt.value })}
              style={{ marginTop: 2 }}
            />
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{opt.desc}</div>
            </div>
          </label>
        ))}
      </fieldset>

      {/* Custom Path (only for custom-location mode) */}
      {settings.organizationMode === 'custom-location' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Media Location
          </label>
          <input
            type="text"
            value={settings.customMediaPath ?? ''}
            onChange={(e) => save({ ...settings, customMediaPath: e.target.value })}
            placeholder="/path/to/media"
            aria-label="Custom media location path"
            style={{
              padding: '6px 10px', borderRadius: 4, fontSize: 12,
              background: 'var(--bg-base)', border: '1px solid var(--border-default)',
              color: 'var(--text-primary)', outline: 'none',
            }}
          />
        </div>
      )}

      {/* Proxy Settings */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={settings.generateProxies}
            onChange={(e) => save({ ...settings, generateProxies: e.target.checked })}
          />
          <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>Generate Proxies on Import</span>
        </label>

        {settings.generateProxies && (
          <select
            value={settings.proxyResolution}
            onChange={(e) => save({ ...settings, proxyResolution: e.target.value as '1/4' | '1/2' | 'full' })}
            aria-label="Proxy resolution"
            style={{
              padding: '6px 10px', borderRadius: 4, fontSize: 12,
              background: 'var(--bg-base)', border: '1px solid var(--border-default)',
              color: 'var(--text-primary)', outline: 'none', marginLeft: 24,
            }}
          >
            {PROXY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* Status */}
      {saving && (
        <div role="status" aria-live="polite" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Saving...</div>
      )}
    </div>
  );
}
