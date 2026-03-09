import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';

/**
 * MainLayout wraps authenticated pages (Dashboard, Settings, etc.)
 * with a consistent header, sidebar slot, and workspace area.
 * The Editor page uses its own full-bleed layout and does NOT use this wrapper.
 */
export function MainLayout() {
  const location = useLocation();

  return (
    <div className="main-layout">
      <div className="main-layout-content" key={location.pathname}>
        <Outlet />
      </div>
    </div>
  );
}
