import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../store/auth.store';
import { useUserSettingsStore } from '../../../store/userSettings.store';
import { settingStyles as ss } from '../settingStyles';

export function AccountSettings() {
  const navigate = useNavigate();
  const { user, logout, isLocalSession } = useAuthStore();
  const { settings } = useUserSettingsStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div>
      <div style={ss.sectionHeader}>
        <h3 style={ss.sectionTitle}>Account</h3>
      </div>

      <div style={ss.field}>
        <label style={ss.label}>Email</label>
        <div style={{ ...ss.input, background: 'transparent', border: '1px solid var(--border-subtle, #1e1e28)', opacity: 0.7 }}>
          {user?.email || '—'}
        </div>
      </div>

      <div style={ss.field}>
        <label style={ss.label}>Role</label>
        <div style={{ fontSize: 13, color: 'var(--text-primary, #e8e8ed)', textTransform: 'capitalize' }}>
          {user?.role || 'editor'}
        </div>
      </div>

      <div style={ss.field}>
        <label style={ss.label}>Device</label>
        <div style={{ fontSize: 13, color: 'var(--text-secondary, #a0a0b0)', textTransform: 'capitalize' }}>
          {settings.deviceType} — {settings.deviceId.slice(0, 8)}
        </div>
      </div>

      {isLocalSession && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 'var(--radius-md, 6px)',
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          fontSize: 12,
          color: '#f59e0b',
          marginTop: 16,
        }}>
          This is a local testing session. Settings are stored in your browser only.
        </div>
      )}

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-subtle, #1e1e28)' }}>
        <button
          onClick={handleLogout}
          style={{
            padding: '10px 20px',
            borderRadius: 'var(--radius-md, 6px)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Log Out
        </button>
      </div>
    </div>
  );
}
