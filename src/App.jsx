import React, { useEffect, Suspense } from 'react';
import { HashRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import { ThirdwebProvider, embeddedWallet, metamaskWallet, safeWallet } from '@thirdweb-dev/react';
import { SupabaseProvider } from './contexts/SupabaseContext.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { ConnectivityProvider } from './contexts/ConnectivityContext.jsx';
import { ApiProvider } from './contexts/ApiContext.jsx';
import { RealtimeProvider } from './contexts/RealtimeContext.jsx';
import { DashboardProvider } from './contexts/DashboardContext.jsx';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
const CommandHub = React.lazy(() => import('./components/CommandHub'));
const AdminDashboard = React.lazy(() => import('./components/admin/AdminDashboard'));
const Ingest = React.lazy(() => import('./components/ingest/Ingest'));
const Settings = React.lazy(() => import('./components/settings/Settings'));
const UserProfile = React.lazy(() => import('./components/UserProfile'));
const Support = React.lazy(() => import('./pages/Support'));

import MainLayout from './components/MainLayout';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import { useSupabase } from './contexts/SupabaseContext';
import ErrorBoundary from './components/ErrorBoundary';
import config from './config';
import onyxAI from './services/onyxAI';
import api from './services/onyxAI/api'; // Import the real api service
import connectivityManager from './services/connectivityManager'; // Import the real connectivity manager
import offlineManager from './services/offline'; // Import the real offline manager
import DeviceManager from './services/deviceManager';
import './App.css';

function ConnectionErrorDisplay({ error }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-900 via-onyx-950 to-onyx-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-effect max-w-2xl w-full rounded-lg p-8 text-center"
      >
        <h1 className="text-3xl font-bold text-red-400 mb-4">Backend Connection Error</h1>
        <p className="text-slate-300 mb-6">
          Axim Core could not establish a connection with the Supabase backend.
          Please ensure your environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are correct and that the service is running.
        </p>
        <div className="bg-onyx-950/50 border border-onyx-accent/20 rounded-md p-4 text-left">
          <p className="text-sm text-slate-400 font-mono break-words">
            {error.message}
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition-colors"
        >
          Retry Connection
        </button>
      </motion.div>
    </div>
  );
}

function AppContent() {
  const { isAuthenticated: realIsAuthenticated, loading: authLoading, user } = useAuth();
  const { supabase, connectionError, isConnectionChecked } = useSupabase();
  const location = useLocation();

  const isAuthenticated = config.isMockLlmEnabled ? true : realIsAuthenticated;

  useEffect(() => {
    if (isAuthenticated && !onyxAI.isInitialized && supabase) {
      const userId = config.isMockLlmEnabled ? 'mock-user-id' : user?.id;
      if (userId) {
        onyxAI.initialize(supabase, userId, { api, connectivityManager, offlineManager });
        DeviceManager.initialize(userId);
      }
    }

    return () => {
      DeviceManager.stopHeartbeat();
    };
  }, [isAuthenticated, supabase, user]);


  const loading = authLoading || !isConnectionChecked;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-onyx-950 via-purple-900 to-onyx-950 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-white text-xl"
        >
          Loading Axim Core...
        </motion.div>
      </div>
    );
  }

  if (connectionError) {
    return <ConnectionErrorDisplay error={connectionError} />;
  }

  return (
    <ErrorBoundary>
      <AnimatePresence mode="wait">
        <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-onyx-950 via-purple-900 to-onyx-950 flex items-center justify-center"><div className="text-white text-xl flex items-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mr-4"></div>Loading View...</div></div>}>
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="command-hub" element={<CommandHub />} />
          <Route path="ingest" element={<Ingest />} />
          <Route path="settings" element={<Settings />} />
          <Route path="profile" element={<UserProfile />} />
          <Route
            path="admin/*"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="support/*"
            element={
              <ProtectedRoute allowedRoles={['admin', 'support']}>
                <Support />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={isAuthenticated ? <Navigate to="/dashboard" /> : <Navigate to="/login" />} />
        </Routes>
        </Suspense>
      </AnimatePresence>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <ThirdwebProvider
      activeChain="arbitrum"
      clientId={import.meta.env.VITE_THIRDWEB_CLIENT_ID}
      supportedWallets={[
        embeddedWallet({ auth: { options: ["google", "apple", "email"] } }),
        metamaskWallet(),
        safeWallet(),
      ]}
    >
      <HashRouter>
        <SupabaseProvider>
          <AuthProvider>
            <ConnectivityProvider>
              <ApiProvider>
                <DashboardProvider>
                <RealtimeProvider>
                  <AppContent />
                </RealtimeProvider>
              </DashboardProvider>
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
    </ThirdwebProvider>
  );
}

export default App;
