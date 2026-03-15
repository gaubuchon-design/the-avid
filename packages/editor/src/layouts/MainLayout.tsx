import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

/**
 * MainLayout wraps authenticated pages (Dashboard, Settings, etc.)
 * with a consistent header, sidebar slot, and workspace area.
 * The Editor page uses its own full-bleed layout and does NOT use this wrapper.
 */
export function MainLayout() {
  const location = useLocation();
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    setIsTransitioning(true);
    const timer = setTimeout(() => setIsTransitioning(false), 200);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  return (
    <div className="main-layout" role="main" id="main-content">
      <div
        className="main-layout-content"
        key={location.pathname}
        style={{
          opacity: isTransitioning ? 0.85 : 1,
          transition: 'opacity 200ms ease-out',
        }}
      >
        <Outlet />
      </div>
    </div>
  );
}
