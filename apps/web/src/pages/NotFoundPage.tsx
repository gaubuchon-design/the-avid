import React from 'react';
import { useNavigate } from 'react-router-dom';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="not-found-page">
      <div className="not-found-content">
        <div className="not-found-code">404</div>
        <h1 className="not-found-title">Page Not Found</h1>
        <p className="not-found-desc">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="not-found-actions">
          <button
            className="btn btn-primary btn-lg"
            onClick={() => navigate('/')}
          >
            Go to Dashboard
          </button>
          <button
            className="btn btn-ghost btn-lg"
            onClick={() => navigate(-1)}
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
