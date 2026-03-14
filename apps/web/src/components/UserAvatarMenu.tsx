import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

export function UserAvatarMenu() {
  const navigate = useNavigate();
  const { user, logout, isLocalSession } = useAuthStore();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  // Compute dropdown position from button rect
  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        btnRef.current && !btnRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, updatePos]);

  const initials = (user?.name || user?.email || 'U')
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  const handleLogout = () => {
    setOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <>
      <button
        ref={btnRef}
        className="toolbar-icon-btn"
        onClick={() => setOpen(!open)}
        title="Account"
        aria-label="Account menu"
        style={styles['avatar']}
      >
        {initials}
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          style={{
            ...styles['dropdown'],
            top: dropdownPos.top,
            right: dropdownPos.right,
          }}
        >
          <div style={styles['userInfo']}>
            <div style={styles['userName']}>{user?.name || 'User'}</div>
            <div style={styles['userEmail']}>{user?.email}</div>
            {isLocalSession && (
              <div style={styles['localBadge']}>Local session</div>
            )}
          </div>
          <div style={styles['divider']} />
          <button style={styles['menuItem']} onClick={handleLogout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log Out
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  avatar: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: 'var(--brand, #00c896)',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
  },
  dropdown: {
    position: 'fixed',
    width: 220,
    background: 'var(--bg-elevated, #1a1a2e)',
    border: '1px solid var(--border-default, #2a2a35)',
    borderRadius: 'var(--radius-lg, 8px)',
    padding: '6px 0',
    zIndex: 999,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  },
  userInfo: {
    padding: '10px 14px',
  },
  userName: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary, #e8e8ed)',
  },
  userEmail: {
    fontSize: 11,
    color: 'var(--text-muted, #6a6a7a)',
    marginTop: 2,
  },
  localBadge: {
    display: 'inline-block',
    marginTop: 6,
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm, 4px)',
    background: 'rgba(245, 158, 11, 0.15)',
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: 600,
  },
  divider: {
    height: 1,
    background: 'var(--border-subtle, #1e1e28)',
    margin: '4px 0',
  },
  menuItem: {
    width: '100%',
    padding: '8px 14px',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-secondary, #a0a0b0)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontFamily: 'inherit',
    textAlign: 'left' as const,
    transition: 'background 100ms',
  },
};
