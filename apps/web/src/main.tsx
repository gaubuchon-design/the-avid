import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/globals.css';
import './styles/design-system.css';
import './styles/editor.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
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
