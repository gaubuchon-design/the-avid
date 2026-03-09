import React, { useState } from 'react';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!name.trim()) {
      setLocalError('Name is required');
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

  return (
    <div className="auth-card animate-fade-up">
      {/* Logo */}
      <div className="auth-logo-section">
        <div className="auth-logo-mark">A</div>
        <h1 className="auth-logo-text">
          The <em>Avid</em>
        </h1>
        <p className="auth-tagline">Create your account</p>
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
          <label className="auth-label" htmlFor="reg-name">Full Name</label>
          <input
            id="reg-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            required
            className="auth-input"
          />
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="reg-email">Email</label>
          <input
            id="reg-email"
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
          <label className="auth-label" htmlFor="reg-password">Password</label>
          <input
            id="reg-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            required
            autoComplete="new-password"
            className="auth-input"
          />
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="reg-confirm">Confirm Password</label>
          <input
            id="reg-confirm"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
            required
            autoComplete="new-password"
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
