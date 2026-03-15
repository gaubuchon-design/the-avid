import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom'; // MemoryRouter for Electron (no URL bar)
import App from './App';
import '@mcua/editor/styles/globals.css';
import '@mcua/editor/styles/design-system.css';
import '@mcua/editor/styles/editor.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MemoryRouter>
      <App />
    </MemoryRouter>
  </React.StrictMode>
);
