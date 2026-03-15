import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from '@mcua/editor';
import '@mcua/editor/styles/globals.css';
import '@mcua/editor/styles/design-system.css';
import '@mcua/editor/styles/editor.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error(
    'Root element not found. Ensure your index.html contains <div id="root"></div>.'
  );
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {/* Global error boundary wraps the entire app, preventing total white-screen crashes */}
    <ErrorBoundary level="global">
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
