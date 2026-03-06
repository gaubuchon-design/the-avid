import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom'; // MemoryRouter for Electron (no URL bar)
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import '../../web/src/styles/globals.css';  // shared styles

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
