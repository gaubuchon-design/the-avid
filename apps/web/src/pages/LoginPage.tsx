import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, quickLogin, isLoading, error, clearError } = useAuthStore();
  const [quickEmail, setQuickEmail] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<{ email: boolean; password: boolean }>({ email: false, password: false });

  const emailRef = useRef<HTMLInputElement>(null);

  // Auto-focus email on mount
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent duplicate submissions
    if (isLoading) return;

    setLocalError(null);
    clearError();

    // Client-side validation
    if (!email.trim()) {
      setLocalError('Email is required');
      emailRef.current?.focus();
      return;
    }

    if (email.trim() && !email.includes('@')) {
      setLocalError('Please enter a valid email address');
      emailRef.current?.focus();
      return;
    }

    if (!password) {
      setLocalError('Password is required');
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters');
      return;
    }

    try {
      await login(email.trim(), password);
      navigate('/');
    } catch {
      // Error is already set in the store
    }
  };

  const displayError = localError || error;

  const emailInvalid = touched.email && email.length > 0 && !email.includes('@');
  const passwordTooShort = touched.password && password.length > 0 && password.length < 6;

  return (
    <div className="auth-card animate-fade-up">
      {/* Logo */}
      <div className="auth-logo-section">
        <div className="auth-logo-mark" aria-hidden="true">A</div>
        <h1 className="auth-logo-text">
          The <em>Avid</em>
        </h1>
        <p className="auth-tagline">Professional Video Editing</p>
      </div>

      {/* Error */}
      {displayError && (
        <div className="auth-error-banner" role="alert" aria-live="assertive">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginRight: 6 }}>
            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          {displayError}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <div className="auth-field">
          <label className="auth-label" htmlFor="login-email">Email</label>
          <input
            ref={emailRef}
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (localError) setLocalError(null); }}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="auth-input"
            aria-invalid={emailInvalid || undefined}
            aria-describedby={emailInvalid ? 'email-error' : undefined}
            disabled={isLoading}
          />
          {emailInvalid && (
            <div id="email-error" style={{ fontSize: 10, color: 'var(--error)', marginTop: 4 }} role="alert">
              Please enter a valid email address
            </div>
          )}
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="login-password">Password</label>
          <div style={{ position: 'relative' }}>
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (localError) setLocalError(null); }}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              className="auth-input"
              style={{ paddingRight: 36 }}
              aria-invalid={passwordTooShort || undefined}
              aria-describedby={passwordTooShort ? 'password-hint' : undefined}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                padding: 2, fontSize: 11,
              }}
              tabIndex={-1}
            >
              {showPassword ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              )}
            </button>
          </div>
          {passwordTooShort && (
            <div id="password-hint" style={{ fontSize: 10, color: 'var(--warning)', marginTop: 4 }}>
              Password should be at least 6 characters
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="auth-submit-btn"
          aria-busy={isLoading}
        >
          {isLoading ? (
            <span className="auth-spinner-wrap">
              <span className="auth-spinner" aria-hidden="true" />
              Signing in...
            </span>
          ) : (
            'Sign In'
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="auth-divider" role="separator">
        <span className="auth-divider-line" />
        <span className="auth-divider-text">or quick login</span>
        <span className="auth-divider-line" />
      </div>

      {/* Quick Login -- email only */}
      <div className="auth-form">
        <div className="auth-field">
          <label className="auth-label" htmlFor="quick-email">Email</label>
          <input
            id="quick-email"
            type="email"
            value={quickEmail}
            onChange={(e) => setQuickEmail(e.target.value)}
            placeholder="you@example.com"
            className="auth-input"
            aria-describedby="quick-login-hint"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && quickEmail.includes('@')) {
                quickLogin(quickEmail);
                navigate('/');
              }
            }}
          />
        </div>
        <button
          type="button"
          disabled={!quickEmail.includes('@')}
          onClick={() => { quickLogin(quickEmail); navigate('/'); }}
          className="auth-demo-btn"
        >
          <span className="auth-demo-btn-icon" aria-hidden="true">&#9654;</span>
          Quick Login
        </button>
      </div>
      <p className="auth-demo-hint" id="quick-login-hint">Enter any email to start -- no account required</p>

      {/* Footer */}
      <div className="auth-footer">
        <span className="auth-footer-text">Don't have an account?</span>
        <Link to="/register" className="auth-footer-link">Register</Link>
      </div>
    </div>
  );
}
