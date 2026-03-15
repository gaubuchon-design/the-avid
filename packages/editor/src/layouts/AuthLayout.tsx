import React from 'react';
import { Outlet } from 'react-router-dom';

/**
 * AuthLayout wraps the login / register pages with a centered card layout.
 * It provides a consistent branded background, logo, and footer.
 */
export function AuthLayout() {
  return (
    <div className="auth-layout">
      <div className="auth-layout-bg" aria-hidden="true">
        <div className="auth-layout-gradient" />
        <div className="auth-layout-grid" />
      </div>
      <main className="auth-layout-content">
        <Outlet />
      </main>
      <footer className="auth-layout-footer">
        <span className="auth-layout-footer-text">
          The Avid &middot; Professional Video Editing
        </span>
      </footer>
    </div>
  );
}
