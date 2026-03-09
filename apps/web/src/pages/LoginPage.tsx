import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, quickLogin, isLoading, error, clearError } = useAuthStore();
  const [quickEmail, setQuickEmail] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    try {
      await login(email, password);
      navigate('/');
    } catch {
      // Error is already set in the store
    }
  };

  const displayError = localError || error;

  return (
    <div className="auth-card animate-fade-up">
      {/* Logo */}
      <div className="auth-logo-section">
        <div className="auth-logo-mark">A</div>
        <h1 className="auth-logo-text">
          The <em>Avid</em>
        </h1>
        <p className="auth-tagline">Professional Video Editing</p>
      </div>

      {/* Error */}
      {displayError && (
        <div className="auth-error-banner" role="alert">
          {displayError}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="auth-field">
          <label className="auth-label" htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="auth-input"
          />
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            autoComplete="current-password"
            className="auth-input"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="auth-submit-btn"
        >
          {isLoading ? (
            <span className="auth-spinner-wrap">
              <span className="auth-spinner" />
              Signing in...
            </span>
          ) : (
            'Sign In'
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="auth-divider">
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
          />
        </div>
        <button
          type="button"
          disabled={!quickEmail.includes('@')}
          onClick={() => { quickLogin(quickEmail); navigate('/'); }}
          className="auth-demo-btn"
        >
          <span className="auth-demo-btn-icon">&#9654;</span>
          Quick Login
        </button>
      </div>
      <p className="auth-demo-hint">Enter any email to start -- no account required</p>

      {/* Footer */}
      <div className="auth-footer">
        <span className="auth-footer-text">Don't have an account?</span>
        <Link to="/register" className="auth-footer-link">Register</Link>
      </div>
    </div>
  );
}
