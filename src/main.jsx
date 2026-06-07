import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import './index.css';

// Global Chunk Error Handler
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.name === 'TypeError' && event.reason.message.includes('Failed to fetch dynamically imported module')) {
    console.error('Dynamically imported module failed to load. Reloading the page...', event.reason);
    window.location.reload();
  }
});

const queryClient = new QueryClient();

const root = createRoot(document.getElementById('root'));

root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
