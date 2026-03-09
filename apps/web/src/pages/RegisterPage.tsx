import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

export function RegisterPage() {
  const navigate = useNavigate();
  const { register, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!name.trim()) {
      setLocalError('Name is required');
      nameRef.current?.focus();
      return;
    }
    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    try {
      await register(email, name.trim(), password);
      navigate('/');
    } catch {
      // Error is already set in the store
    }
  };

  const displayError = localError || error;

  const emailInvalid = touched['email'] && email.length > 0 && !email.includes('@');
  const passwordTooShort = touched['password'] && password.length > 0 && password.length < 6;
  const passwordMismatch = touched['confirm'] && confirmPassword.length > 0 && password !== confirmPassword;

  // Password strength indicator
  const passwordStrength = (() => {
    if (password.length === 0) return null;
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    if (score <= 1) return { label: 'Weak', color: 'var(--error)', width: 20 };
    if (score <= 2) return { label: 'Fair', color: 'var(--warning)', width: 40 };
    if (score <= 3) return { label: 'Good', color: 'var(--info)', width: 70 };
    return { label: 'Strong', color: 'var(--success)', width: 100 };
  })();

  return (
    <div className="auth-card animate-fade-up">
      {/* Logo */}
      <div className="auth-logo-section">
        <div className="auth-logo-mark" aria-hidden="true">A</div>
        <h1 className="auth-logo-text">
          The <em>Avid</em>
        </h1>
        <p className="auth-tagline">Create your account</p>
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
          <label className="auth-label" htmlFor="reg-name">Full Name</label>
          <input
            ref={nameRef}
            id="reg-name"
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); if (localError) setLocalError(null); }}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))}
            placeholder="Your name"
            required
            className="auth-input"
            disabled={isLoading}
            autoComplete="name"
          />
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="reg-email">Email</label>
          <input
            id="reg-email"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (localError) setLocalError(null); }}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="auth-input"
            aria-invalid={emailInvalid || undefined}
            aria-describedby={emailInvalid ? 'reg-email-error' : undefined}
            disabled={isLoading}
          />
          {emailInvalid && (
            <div id="reg-email-error" style={{ fontSize: 10, color: 'var(--error)', marginTop: 4 }} role="alert">
              Please enter a valid email address
            </div>
          )}
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="reg-password">Password</label>
          <div style={{ position: 'relative' }}>
            <input
              id="reg-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (localError) setLocalError(null); }}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              placeholder="At least 6 characters"
              required
              autoComplete="new-password"
              className="auth-input"
              style={{ paddingRight: 36 }}
              aria-invalid={passwordTooShort || undefined}
              aria-describedby="password-strength"
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
          {/* Password strength bar */}
          {passwordStrength && (
            <div id="password-strength" style={{ marginTop: 6 }}>
              <div style={{ height: 3, background: 'var(--bg-overlay)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${passwordStrength.width}%`,
                  background: passwordStrength.color,
                  borderRadius: 2, transition: 'width 200ms, background 200ms',
                }} />
              </div>
              <div style={{ fontSize: 9, color: passwordStrength.color, marginTop: 3, textAlign: 'right' }}>
                {passwordStrength.label}
              </div>
            </div>
          )}
          {passwordTooShort && (
            <div style={{ fontSize: 10, color: 'var(--error)', marginTop: 4 }} role="alert">
              Password must be at least 6 characters
            </div>
          )}
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="reg-confirm">Confirm Password</label>
          <input
            id="reg-confirm"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); if (localError) setLocalError(null); }}
            onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
            placeholder="Re-enter your password"
            required
            autoComplete="new-password"
            className="auth-input"
            aria-invalid={passwordMismatch || undefined}
            aria-describedby={passwordMismatch ? 'confirm-error' : undefined}
            disabled={isLoading}
          />
          {passwordMismatch && (
            <div id="confirm-error" style={{ fontSize: 10, color: 'var(--error)', marginTop: 4 }} role="alert">
              Passwords do not match
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
              Creating account...
            </span>
          ) : (
            'Create Account'
          )}
        </button>
      </form>

      {/* Footer */}
      <div className="auth-footer">
        <span className="auth-footer-text">Already have an account?</span>
        <Link to="/login" className="auth-footer-link">Sign In</Link>
      </div>
    </div>
  );
}
