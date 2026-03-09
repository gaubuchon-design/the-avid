import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function NotFoundPage() {
  const navigate = useNavigate();

  // Set document title for screen readers
  useEffect(() => {
    const prevTitle = document.title;
    document.title = '404 - Page Not Found | The Avid';
    return () => {
      document.title = prevTitle;
    };
  }, []);

  return (
    <div className="not-found-page" role="main" aria-label="Page not found">
      <div className="not-found-content">
        <div className="not-found-code" aria-hidden="true">404</div>
        <h1 className="not-found-title">Page Not Found</h1>
        <p className="not-found-desc">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="not-found-actions">
          <button
            className="btn btn-primary btn-lg"
            onClick={() => navigate('/')}
            aria-label="Navigate to dashboard"
          >
            Go to Dashboard
          </button>
          <button
            className="btn btn-ghost btn-lg"
            onClick={() => navigate(-1)}
            aria-label="Go back to previous page"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
