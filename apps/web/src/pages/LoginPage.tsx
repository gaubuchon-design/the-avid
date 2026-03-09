import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

type AuthMode = 'login' | 'register';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, register, quickLogin, loginAsDemo, isLoading, error, clearError } = useAuthStore();
  const [quickEmail, setQuickEmail] = useState('');

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setLocalError(null);
    clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match');
        return;
      }
      if (password.length < 6) {
        setLocalError('Password must be at least 6 characters');
        return;
      }
      if (!name.trim()) {
        setLocalError('Name is required');
        return;
      }
    }

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, name.trim(), password);
      }
      navigate('/');
    } catch {
      // Error is already set in the store
    }
  };

  const displayError = localError || error;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logoSection}>
          <div style={styles.logoMark}>A</div>
          <h1 style={styles.logoText}>
            The <em style={styles.logoEm}>Avid</em>
          </h1>
          <p style={styles.tagline}>Professional Video Editing</p>
        </div>

        {/* Mode toggle */}
        <div style={styles.modeToggle}>
          <button
            type="button"
            aria-label="Sign In"
            onClick={() => { if (mode !== 'login') toggleMode(); }}
            style={{
              ...styles.modeBtn,
              ...(mode === 'login' ? styles.modeBtnActive : {}),
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            aria-label="Register"
            onClick={() => { if (mode !== 'register') toggleMode(); }}
            style={{
              ...styles.modeBtn,
              ...(mode === 'register' ? styles.modeBtnActive : {}),
            }}
          >
            Register
          </button>
        </div>

        {/* Error */}
        {displayError && (
          <div style={styles.errorBanner}>
            {displayError}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          {mode === 'register' && (
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
                style={styles.input}
              />
            </div>
          )}

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              style={styles.input}
            />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'At least 6 characters' : 'Enter your password'}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              style={styles.input}
            />
          </div>

          {mode === 'register' && (
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                required
                autoComplete="new-password"
                style={styles.input}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            style={{
              ...styles.submitBtn,
              opacity: isLoading ? 0.7 : 1,
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoading ? (
              <span style={styles.spinnerWrap}>
                <span style={styles.spinner} />
                {mode === 'login' ? 'Signing in...' : 'Creating account...'}
              </span>
            ) : (
              mode === 'login' ? 'Sign In' : 'Create Account'
            )}
          </button>
        </form>

        {/* Divider */}
        <div style={styles.divider}>
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>or quick login</span>
          <span style={styles.dividerLine} />
        </div>

        {/* Quick Login — email only */}
        <div style={styles.form}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={quickEmail}
              onChange={(e) => setQuickEmail(e.target.value)}
              placeholder="you@example.com"
              style={styles.input}
            />
          </div>
          <button
            type="button"
            disabled={!quickEmail.includes('@')}
            onClick={() => { quickLogin(quickEmail); navigate('/'); }}
            style={{
              ...styles.demoBtn,
              opacity: quickEmail.includes('@') ? 1 : 0.5,
              cursor: quickEmail.includes('@') ? 'pointer' : 'not-allowed',
            }}
          >
            <span style={styles.demoBtnIcon}>▶</span>
            Quick Login
          </button>
        </div>
        <p style={styles.demoHint}>Enter any email to start — no account required</p>

        {/* Footer */}
        <div style={styles.footer}>
          <span style={styles.footerText}>
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          </span>
          <button type="button" onClick={toggleMode} style={styles.footerLink}>
            {mode === 'login' ? 'Register' : 'Sign In'}
          </button>
        </div>
      </div>

    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-void, #0a0a0f)',
    fontFamily: 'var(--font-ui, -apple-system, BlinkMacSystemFont, sans-serif)',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    background: 'var(--bg-surface, #141419)',
    border: '1px solid var(--border-default, #2a2a35)',
    borderRadius: 'var(--radius-xl, 12px)',
    padding: '36px 32px 28px',
  },
  logoSection: {
    textAlign: 'center' as const,
    marginBottom: 28,
  },
  logoMark: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: 'var(--brand, #6d4cfa)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 22,
    fontWeight: 800,
    color: '#fff',
    marginBottom: 12,
  },
  logoText: {
    fontSize: 22,
    fontWeight: 300,
    color: 'var(--text-primary, #e8e8ed)',
    letterSpacing: '-0.5px',
    margin: 0,
  },
  logoEm: {
    fontStyle: 'italic',
    fontWeight: 700,
  },
  tagline: {
    fontSize: 12,
    color: 'var(--text-muted, #6a6a7a)',
    marginTop: 4,
    margin: '4px 0 0',
  },
  modeToggle: {
    display: 'flex',
    background: 'var(--bg-void, #0a0a0f)',
    borderRadius: 'var(--radius-md, 6px)',
    padding: 3,
    marginBottom: 20,
  },
  modeBtn: {
    flex: 1,
    padding: '8px 0',
    border: 'none',
    borderRadius: 'var(--radius-sm, 4px)',
    background: 'transparent',
    color: 'var(--text-muted, #6a6a7a)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 150ms',
    fontFamily: 'inherit',
  },
  modeBtnActive: {
    background: 'var(--brand, #6d4cfa)',
    color: '#fff',
  },
  errorBanner: {
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 'var(--radius-md, 6px)',
    padding: '10px 14px',
    fontSize: 12,
    color: '#ef4444',
    marginBottom: 16,
    lineHeight: 1.4,
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 16,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary, #a0a0b0)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  input: {
    padding: '10px 14px',
    borderRadius: 'var(--radius-md, 6px)',
    border: '1px solid var(--border-default, #2a2a35)',
    background: 'var(--bg-void, #0a0a0f)',
    color: 'var(--text-primary, #e8e8ed)',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 150ms',
  },
  submitBtn: {
    padding: '12px 0',
    borderRadius: 'var(--radius-md, 6px)',
    border: 'none',
    background: 'var(--brand, #6d4cfa)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'inherit',
    marginTop: 4,
    transition: 'opacity 150ms',
  },
  spinnerWrap: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  },
  spinner: {
    display: 'inline-block',
    width: 14,
    height: 14,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  footer: {
    textAlign: 'center' as const,
    marginTop: 20,
    paddingTop: 16,
    borderTop: '1px solid var(--border-subtle, #1e1e28)',
  },
  footerText: {
    fontSize: 12,
    color: 'var(--text-muted, #6a6a7a)',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    margin: '20px 0 16px',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: 'var(--border-subtle, #1e1e28)',
  },
  dividerText: {
    fontSize: 11,
    color: 'var(--text-muted, #6a6a7a)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    fontWeight: 500,
  },
  demoBtn: {
    width: '100%',
    padding: '12px 0',
    borderRadius: 'var(--radius-md, 6px)',
    border: '1px solid var(--border-default, #2a2a35)',
    background: 'var(--bg-raised, #1a1a22)',
    color: 'var(--text-primary, #e8e8ed)',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'all 150ms',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  demoBtnIcon: {
    color: 'var(--brand-bright, #9b7dff)',
    fontSize: 11,
  },
  demoHint: {
    textAlign: 'center' as const,
    fontSize: 11,
    color: 'var(--text-muted, #6a6a7a)',
    margin: '8px 0 0',
  },
  footerLink: {
    background: 'none',
    border: 'none',
    color: 'var(--brand-bright, #9b7dff)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    marginLeft: 6,
    padding: 0,
    fontFamily: 'inherit',
  },
};
