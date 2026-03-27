import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';
import { Toaster } from 'react-hot-toast';
import { SupabaseProvider } from './contexts/SupabaseContext.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { ConnectivityProvider } from './contexts/ConnectivityContext.jsx';
import { ApiProvider } from './contexts/ApiContext.jsx';

const root = createRoot(document.getElementById('root'));

root.render(
  <StrictMode>
    <HashRouter>
      <SupabaseProvider>
        <AuthProvider>
          <ConnectivityProvider>
            <ApiProvider>
              <App />
            </ApiProvider>
            <Toaster
              position="top-right"
            toastOptions={{
              style: {
                borderRadius: '10px',
                background: '#1e293b', // slate-800
                color: '#e2e8f0', // slate-200
                border: '1px solid #334155', // slate-700
              },
            }}
          />
          </ConnectivityProvider>
        </AuthProvider>
      </SupabaseProvider>
    </HashRouter>
  </StrictMode>
);
