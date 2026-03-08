import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom'; // MemoryRouter for Electron (no URL bar)
import App from './App';
import '../../../web/src/styles/globals.css';
import '../../../web/src/styles/design-system.css';
import '../../../web/src/styles/editor.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MemoryRouter>
      <App />
    </MemoryRouter>
  </React.StrictMode>
);
