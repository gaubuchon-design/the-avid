import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLocalSession = useAuthStore((s) => s.isLocalSession);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      {isLocalSession && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.1)',
          borderBottom: '1px solid rgba(245, 158, 11, 0.25)',
          padding: '4px 16px',
          fontSize: 11,
          color: '#f59e0b',
          textAlign: 'center',
          fontWeight: 500,
          fontFamily: 'var(--font-ui, -apple-system, BlinkMacSystemFont, sans-serif)',
        }}>
          Testing session — settings stored locally
        </div>
      )}
      {children}
    </>
  );
}
