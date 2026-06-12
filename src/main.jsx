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

// Validate required production environment variables
const checkRequiredEnvVars = () => {
  const missing = [];
  if (!import.meta.env.VITE_SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
  if (!import.meta.env.VITE_SUPABASE_ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY');
  return missing;
};

const missingEnvVars = checkRequiredEnvVars();

const root = createRoot(document.getElementById('root'));

if (missingEnvVars.length > 0) {
  root.render(
    <StrictMode>
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 text-white">
        <div className="bg-slate-800 max-w-md w-full rounded-lg p-8 shadow-xl border border-red-700/50">
          <h2 className="text-2xl font-semibold text-red-400 mb-4 text-center">Missing Environment Configuration</h2>
          <p className="text-slate-300 mb-4">
            The application cannot start because the following required environment variables are missing:
          </p>
          <ul className="list-disc list-inside text-red-300 font-mono text-sm mb-6 bg-slate-900 p-4 rounded">
            {missingEnvVars.map(envVar => <li key={envVar}>{envVar}</li>)}
          </ul>
          <p className="text-slate-400 text-sm text-center">
            Please check your Cloudflare Pages dashboard or local .env file.
          </p>
        </div>
      </div>
    </StrictMode>
  );
} else {
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>
  );
}